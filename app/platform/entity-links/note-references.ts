/**
 * NOTES-02 — Note references: turning `[[Wiki Links]]` into REAL relationships,
 * and reading a Note's references in both directions.
 *
 * Before this, a `[[Wiki Link]]` was resolved at NAVIGATION time and wrote
 * nothing ([DEBT-39]): the referenced record never learned it had been
 * referenced, so it could not show a backlink and the reference appeared in no
 * Activity stream. The fix is deliberately conservative — it introduces no
 * second relationship store:
 *
 *   **A `[[Wiki Link]]` in a saved Note is a persisted, typed FND-04 EntityLink**
 *   (`note.references`, source = the Note, target = the referenced record),
 *   reconciled to match the note's body every time the body is saved.
 *
 * Consequences that make this the right shape:
 *
 *   - Titles are matched ONCE, at save time; the persisted relationship is by
 *     STABLE ID. Renaming the target keeps the relationship (§14) — only the
 *     prose in the note still reads the old title, which is the user's text and
 *     is never rewritten behind their back.
 *   - Writing `[[X]]` five times yields ONE link row — the kernel's
 *     `(workspace, source, target, type)` identity guarantees it (§14).
 *   - Removing the last `[[X]]` unlinks the relationship; re-adding it RESTORES
 *     the same link id in place rather than minting a duplicate.
 *   - A reference inside a code block is never a relationship — the shared
 *     analyser excludes it (§13).
 *   - Everything stays workspace-scoped and Activity-recorded by the kernel.
 *
 * `link.related` links (created from the shared Linked Items picker) and
 * module-owned types (`task.relates_to`, `meeting.attendee`, …) are read here
 * too, so a record's backlinks are the WHOLE relationship graph, not just the
 * ones Notes happens to own.
 */

import { isReservedSpineLinkType } from "~/kernel/spine";
import type { NoteQueryRepository, ReferenceTarget } from "~/kernel/notes";
import {
  distinctReferenceTitles,
  excerptAroundMatch,
  extractReferences,
  transformReferencesForExport,
} from "~/platform/markdown/note-document";
import type {
  RecordReference,
  ReferencePage,
} from "~/shared/references/references-model";
import { relationshipLabel } from "~/shared/references/references-model";

import type { EntityLinkPickerDeps } from "./entity-link-picker-service";

/**
 * The typed relationship a `[[Wiki Link]]` creates. A validated FND-04 dotted
 * slug, not a reserved structural spine type, so the generic repository
 * persists it. It is deliberately NOT `link.related`: a body reference is
 * derived from the note's text and is reconciled automatically, whereas a
 * `link.related` link is a deliberate user act the user also removes by hand.
 * Keeping them distinct is what lets a save remove a stale body reference
 * WITHOUT ever silently deleting a relationship the user created themselves.
 */
export const NOTE_REFERENCES_LINK = "note.references";

/** How many references one page of a record's backlinks/outgoing links holds. */
export const DEFAULT_REFERENCE_PAGE = 25;
/** Underlying EntityLink page size scanned per fetch (the kernel's maximum). */
const LINK_SCAN_PAGE_SIZE = 100;
/** Bound on underlying pages scanned per call (never a correctness cutoff). */
const MAX_SCAN_PAGES_PER_CALL = 10;

/** What a reconciliation actually did — reported so callers can be honest. */
export interface ReferenceReconciliation {
  readonly created: number;
  readonly removed: number;
  /** Titles in the body that resolved to no active record in this workspace. */
  readonly unresolved: readonly string[];
}

export interface NoteReferenceDeps extends EntityLinkPickerDeps {
  readonly notes: Pick<
    NoteQueryRepository,
    "resolveReferenceTargets" | "loadContextWindows"
  >;
}

/**
 * Reconcile a Note's `note.references` links so they exactly match the
 * `[[…]]` references in its saved body.
 *
 * Idempotent: running it twice on unchanged content writes nothing (the kernel's
 * `create` returns `already_exists` and no unlink is needed). It only ever
 * touches links of type {@link NOTE_REFERENCES_LINK} whose SOURCE is this Note,
 * so a user-created `link.related`, a Meeting's `meeting.attendee`, or an
 * incoming reference from another note is never disturbed.
 *
 * A reference the workspace cannot resolve (a title nothing matches, or a
 * deleted target) creates no link and is reported as `unresolved` rather than
 * failing the save — the note's prose is the user's, and a dangling reference is
 * a normal state in a knowledge base, not an error.
 */
export async function reconcileNoteReferences(
  deps: NoteReferenceDeps,
  noteId: string,
  source: string,
): Promise<ReferenceReconciliation> {
  const titles = distinctReferenceTitles(source);
  const resolved =
    titles.length > 0
      ? await deps.notes.resolveReferenceTargets(titles)
      : new Map<string, ReferenceTarget>();

  const wanted = new Map<string, ReferenceTarget>();
  const unresolved: string[] = [];
  for (const title of titles) {
    const target = resolved.get(title.toLocaleLowerCase());
    // A note referencing ITSELF is not a relationship; the kernel refuses a
    // self-link anyway, so filter it out rather than provoke a failed write.
    if (!target || target.id === noteId) {
      if (!target) unresolved.push(title);
      continue;
    }
    wanted.set(target.id, target);
  }

  const existing = await listOutgoingReferenceTargets(deps, noteId);

  let created = 0;
  for (const [targetId] of wanted) {
    if (existing.has(targetId)) continue;
    const result = await deps.entityLinks.create({
      sourceEntityId: noteId,
      targetEntityId: targetId,
      type: NOTE_REFERENCES_LINK,
    });
    if (result.outcome !== "already_exists") created += 1;
  }

  let removed = 0;
  for (const [targetId, linkId] of existing) {
    if (wanted.has(targetId)) continue;
    const result = await deps.entityLinks.unlink(linkId);
    if (result.changed) removed += 1;
  }

  return { created, removed, unresolved };
}

/** The Note's current `note.references` links, as `targetId → linkId`. */
async function listOutgoingReferenceTargets(
  deps: NoteReferenceDeps,
  noteId: string,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  let cursor: string | undefined;
  let scanned = 0;
  do {
    const page = await deps.entityLinks.listForEntity(noteId, {
      direction: "outgoing",
      type: NOTE_REFERENCES_LINK,
      limit: LINK_SCAN_PAGE_SIZE,
      ...(cursor ? { cursor } : {}),
    });
    scanned += 1;
    for (const view of page.items) {
      out.set(view.counterpart.id, view.link.id);
    }
    cursor = page.nextCursor ?? undefined;
  } while (cursor && scanned < MAX_SCAN_PAGES_PER_CALL);
  return out;
}

/* -------------------------------------------------------------------------- */
/* Reading references                                                         */
/* -------------------------------------------------------------------------- */

export interface LoadReferencesOptions {
  readonly limit?: number;
  readonly cursor?: string;
  /**
   * The anchor record's title. Used to locate the reference inside a source
   * Note so the backlink can show the sentence that mentions it.
   */
  readonly anchorTitle?: string;
  /** The anchor Note's own Markdown source, for outgoing-link context. */
  readonly anchorSource?: string;
}

/**
 * One bounded page of the records that point AT this record (backlinks), or that
 * this record points at (outgoing links).
 *
 * Structural spine links are excluded — the hierarchy renders those itself,
 * exactly as `loadLinkedItems` does, so the two surfaces can never disagree
 * about what counts as a relationship. Soft-deleted counterparts are excluded by
 * the kernel's own `listForEntity` contract: a reference to a deleted record
 * simply stops being shown, and comes back untouched if the record is restored
 * (§14 — links are never rewritten by a lifecycle change).
 *
 * Context is added where it is genuinely available and bounded:
 *   - **incoming from a Note** — the block of the source note containing
 *     `[[anchor title]]`, fetched for the WHOLE page in one batched query;
 *   - **outgoing from this Note** — the block of THIS note containing the
 *     reference, computed from the source the caller already holds (no query);
 *   - every other source type — `null`, and the UI shows the relationship name.
 */
export async function loadNoteReferences(
  deps: NoteReferenceDeps,
  anchorId: string,
  direction: "incoming" | "outgoing",
  options: LoadReferencesOptions = {},
): Promise<ReferencePage> {
  const limit = Math.max(1, options.limit ?? DEFAULT_REFERENCE_PAGE);
  const collected: {
    linkId: string;
    linkType: string;
    linkedAt: string;
    record: { id: string; type: string; title: string };
  }[] = [];

  let cursor: string | undefined = options.cursor;
  let scanned = 0;
  do {
    const page = await deps.entityLinks.listForEntity(anchorId, {
      direction,
      limit: LINK_SCAN_PAGE_SIZE,
      ...(cursor ? { cursor } : {}),
    });
    scanned += 1;
    for (const view of page.items) {
      if (isReservedSpineLinkType(view.link.type)) continue;
      collected.push({
        linkId: view.link.id,
        linkType: view.link.type,
        linkedAt: view.link.updatedAt.toISOString(),
        record: {
          id: view.counterpart.id,
          type: view.counterpart.type,
          title: view.counterpart.title,
        },
      });
    }
    cursor = page.nextCursor ?? undefined;
  } while (
    cursor &&
    collected.length < limit &&
    scanned < MAX_SCAN_PAGES_PER_CALL
  );

  const items = collected.slice(0, limit);

  // Batched context for note counterparts — one query for the whole page.
  const noteIds = items
    .filter((item) => item.record.type === "note")
    .map((item) => item.record.id);
  // One batched query serves BOTH the incoming context windows and the archive
  // state of every note counterpart on the page — never one query per row.
  const windows =
    noteIds.length > 0
      ? await deps.notes.loadContextWindows(
          noteIds,
          direction === "incoming" && options.anchorTitle
            ? `[[${options.anchorTitle}`
            : "",
        )
      : new Map<string, { window: string; archivedAt: Date | null }>();

  const outgoingOffsets =
    direction === "outgoing" && options.anchorSource
      ? referenceOffsets(options.anchorSource)
      : new Map<string, number>();

  const references = items.map<RecordReference>((item) => {
    let context: string | null = null;
    if (direction === "incoming") {
      const found = windows.get(item.record.id);
      if (found && options.anchorTitle) {
        context = contextFromWindow(found.window, options.anchorTitle);
      }
    } else if (options.anchorSource) {
      const offset = outgoingOffsets.get(item.record.title.toLocaleLowerCase());
      if (offset !== undefined) {
        context = contextFromWindow(
          excerptSourceAt(options.anchorSource, offset),
          item.record.title,
        );
      }
    }
    return {
      linkId: item.linkId,
      direction,
      record: {
        ...item.record,
        archived: windows.get(item.record.id)?.archivedAt != null,
      },
      linkType: item.linkType,
      relationshipLabel: relationshipLabel(item.linkType),
      context,
      linkedAt: item.linkedAt,
    };
  });

  return { items: references, nextCursor: cursor ?? null };
}

/** First `[[…]]` occurrence offset for each referenced title (lower-cased key). */
function referenceOffsets(source: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const reference of extractReferences(source)) {
    const key = reference.title.toLocaleLowerCase();
    if (!out.has(key)) out.set(key, reference.start);
  }
  return out;
}

/** A bounded raw window of a source around an offset, for context cleaning. */
function excerptSourceAt(source: string, offset: number): string {
  const start = Math.max(0, offset - 200);
  return source.slice(start, start + 400);
}

/**
 * Turn a raw Markdown window into a bounded, syntax-free line of context.
 *
 * Wiki-link syntax collapses to its LABEL first — so a backlink never shows the
 * user `[[…]]`, and (because `[[Title]]` becomes `Title`) the needle still finds
 * the mention. The shared analyser then removes the remaining Markdown
 * punctuation, keeps the excerpt inside the containing block so unrelated
 * content is never exposed, and truncates deterministically.
 */
function contextFromWindow(window: string, needle: string): string | null {
  if (window.trim() === "") return null;
  const plain = transformReferencesForExport(window, "text", () => null);
  const excerpt = excerptAroundMatch(plain, needle);
  return excerpt === "" ? null : excerpt;
}
