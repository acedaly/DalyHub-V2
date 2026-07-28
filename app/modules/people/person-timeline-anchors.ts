/**
 * PEOPLE-02 — resolving WHICH records a Person's relationship history is read
 * across, and the opaque cursor that keeps that set stable while paginating.
 *
 * The unified Person Timeline is a projection over two things DalyHub already
 * owns, and nothing else:
 *
 *   - the FND-05 Activity stream (`scope.activity`), the single event source; and
 *   - the FND-04 EntityLinks a Person holds (`scope.entityLinks`) — the Universal
 *     Relationship System's canonical relationships (`link.related`,
 *     `meeting.attendee`, `task.relates_to`, …).
 *
 * The Person's ANCHOR SET is the Person plus the active, in-workspace records they
 * are linked to. Reading the Activity stream at that set is what turns a
 * record-event log into a relationship history — with **no copied content, no
 * People-specific history table and no denormalised interaction rows**. Because
 * the set is DERIVED on every read, the history follows the links: unlink a record
 * and its events leave the timeline; soft-delete it and the kernel's own link
 * listing drops it; nothing has to be cleaned up.
 *
 * This module is storage-independent — it depends on the kernel repository
 * CONTRACTS only (no D1, no SQL, no Cloudflare types), so it is exercised directly
 * by both the Workers/D1 integration tests and pure unit tests.
 */

import {
  EntityLinkEndpointNotFoundError,
  type EntityLinkRepository,
} from "~/kernel/entity-links";
import { isReservedSpineLinkType } from "~/kernel/spine";

/**
 * How many LINKED records contribute to one Person's timeline.
 *
 * Bounded deliberately: the kernel's multi-anchor read is bounded too
 * (`MAX_ACTIVITY_ANCHORS`), an unbounded anchor set is a query hazard, and the set
 * travels inside the opaque page cursor. When the bound is reached the page says
 * so (`relatedRecordsTruncated`) and the tab tells the reader — a cap is never
 * applied silently.
 */
export const MAX_PERSON_TIMELINE_RELATED_RECORDS = 40;

/** Underlying EntityLink page size scanned per fetch (the kernel's maximum). */
const LINK_SCAN_PAGE_SIZE = 100;

/**
 * The most underlying link pages one anchor resolution will scan. It bounds
 * per-request work for a Person with an exceptional number of relationships; when
 * it stops early the result is reported as truncated, never as complete.
 */
const MAX_LINK_SCAN_PAGES = 3;

/** The resolved anchor set of one Person's relationship timeline. */
export interface PersonTimelineAnchors {
  /** The Person themself — always the first anchor, always present. */
  readonly personId: string;
  /** The linked records whose events join the Person's history. */
  readonly relatedIds: readonly string[];
  /** The full anchor set handed to the Activity kernel (Person first). */
  readonly anchorIds: readonly string[];
  /** True when relationships were left out by a bound (disclosed to the reader). */
  readonly truncated: boolean;
}

/**
 * Resolve the anchor set for a Person's relationship timeline.
 *
 * Only ACTIVE links to ACTIVE, in-workspace counterparts contribute — that is the
 * kernel's own `listForEntity` contract, not a rule re-implemented here. Reserved
 * structural spine link types are skipped defensively (a Person is outside the
 * Area → Goal → Project → Task spine, so they should never appear on one), matching
 * the Universal Relationship System's own filtering.
 *
 * A Person whose entity row is soft-deleted has no queryable links (the link kernel
 * fails endpoints closed), but their OWN history stays readable — so that case
 * degrades to the Person-only anchor set rather than failing the timeline.
 *
 * When a Person holds more relationships than one timeline reads, the MOST RECENTLY
 * LINKED ones are kept — the kernel orders links by `(createdAt, id)` ascending, so
 * the scan collects in link order and keeps the tail. `truncated` is then true, and
 * the tab says so; a bound is never applied silently.
 */
export async function resolvePersonTimelineAnchors(
  entityLinks: EntityLinkRepository,
  personId: string,
): Promise<PersonTimelineAnchors> {
  /** Distinct linked records in link-creation order (oldest first). */
  const scannedIds: string[] = [];
  const seen = new Set<string>([personId]);
  let truncated = false;

  try {
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await entityLinks.listForEntity(personId, {
        direction: "both",
        limit: LINK_SCAN_PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
      });
      pages += 1;
      for (const view of page.items) {
        if (isReservedSpineLinkType(view.link.type)) {
          continue;
        }
        const counterpartId = view.counterpart.id;
        if (seen.has(counterpartId)) {
          continue;
        }
        seen.add(counterpartId);
        scannedIds.push(counterpartId);
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor && pages < MAX_LINK_SCAN_PAGES);

    // Links remain beyond the per-request scan bound: the history is partial.
    if (cursor) {
      truncated = true;
    }
  } catch (error) {
    if (!(error instanceof EntityLinkEndpointNotFoundError)) {
      throw error;
    }
    // A soft-deleted Person: no relationships are readable, but their own record
    // history still is. Fail soft to the Person-only anchor set.
  }

  let related: readonly string[] = scannedIds;
  if (related.length > MAX_PERSON_TIMELINE_RELATED_RECORDS) {
    related = related.slice(-MAX_PERSON_TIMELINE_RELATED_RECORDS);
    truncated = true;
  }

  return {
    personId,
    relatedIds: related,
    anchorIds: [personId, ...related],
    truncated,
  };
}

/* -------------------------------------------------------------------------- */
/* The page cursor                                                             */
/* -------------------------------------------------------------------------- */

/** The current Person-Timeline cursor format version. Bump when the shape changes. */
export const PERSON_TIMELINE_CURSOR_VERSION = 1;

/** A decoded Person-Timeline cursor. */
export interface PersonTimelineCursor {
  /** The anchor set the first page was read at — replayed verbatim. */
  readonly anchorIds: readonly string[];
  /** The kernel's opaque Activity cursor for the next page of that set. */
  readonly activityCursor: string;
  /** Whether the first page's anchor resolution hit a bound (carried forward so
   * every page of a partial history keeps disclosing that it is partial). */
  readonly truncated: boolean;
}

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  const normalised = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalised.padEnd(
    normalised.length + ((4 - (normalised.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

/**
 * Encode the next page's cursor.
 *
 * It carries the ANCHOR SET as well as the kernel cursor, on purpose: paging must
 * continue over the SAME set of records the first page was read at. Re-deriving
 * the links on every page would silently skip or repeat events whenever a link was
 * added or removed mid-read, and the kernel (rightly) rejects a cursor replayed
 * against a different anchor set. A page therefore reads a stable snapshot; the
 * next FIRST-page read picks up the changed relationships.
 *
 * The cursor is opaque, versioned and bound to the Person it was issued for. It
 * carries no title, no snippet and no private field — only ids the caller already
 * named or already holds.
 */
export function encodePersonTimelineCursor(
  personId: string,
  anchorIds: readonly string[],
  activityCursor: string,
  truncated: boolean,
): string {
  return toBase64Url(
    JSON.stringify([
      PERSON_TIMELINE_CURSOR_VERSION,
      personId,
      [...anchorIds],
      activityCursor,
      truncated,
    ]),
  );
}

/**
 * Decode a Person-Timeline cursor, asserting it was issued for THIS Person.
 * Returns `null` for anything else — a tampered, truncated, wrong-version or
 * wrong-Person cursor — so the route can answer with a calm `400` instead of
 * silently reinterpreting it under another scope.
 */
export function decodePersonTimelineCursor(
  cursor: string,
  personId: string,
): PersonTimelineCursor | null {
  if (typeof cursor !== "string" || cursor.length === 0) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fromBase64Url(cursor));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== 5) {
    return null;
  }
  const [version, cursorPersonId, anchorIds, activityCursor, truncated] =
    parsed;
  if (
    version !== PERSON_TIMELINE_CURSOR_VERSION ||
    cursorPersonId !== personId ||
    !Array.isArray(anchorIds) ||
    anchorIds.length === 0 ||
    !anchorIds.every(
      (id: unknown) => typeof id === "string" && id.length > 0,
    ) ||
    !anchorIds.includes(personId) ||
    typeof activityCursor !== "string" ||
    activityCursor.length === 0 ||
    typeof truncated !== "boolean"
  ) {
    return null;
  }
  return { anchorIds: anchorIds as string[], activityCursor, truncated };
}
