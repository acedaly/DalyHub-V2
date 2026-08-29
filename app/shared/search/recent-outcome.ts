/**
 * FIND-01 — turning recent records into the SAME thing Search already renders
 * (pure, React-free).
 *
 * This is the whole of the empty query's presentation layer, and it is
 * deliberately small: it maps each {@link RecentRecord} onto the existing
 * `RankedSearchResult`, puts them in ONE group, and returns the existing
 * `SearchOutcome`. Nothing downstream learns that this outcome came from
 * anywhere unusual — the browser decodes it with the same decoder, the surface
 * renders it with the same row component, and the keyboard model that already
 * moves through results moves through these.
 *
 * ── Why it reuses the outcome rather than inventing a payload ───────────────
 * A second shape would need a second decoder, a second validator, a second set
 * of bounds and a second row component, and `recent.ts` — the client-side list
 * this item retires — is the evidence: 250 lines, most of it a bespoke decoder
 * for a bespoke shape. `AGENTS.md` §9.8 calls that a bespoke duplicate. Reusing
 * `SearchOutcome` is also what makes acceptance criterion 2 provable by IMPORT
 * PATH rather than by two screenshots resembling each other.
 *
 * ── What it deliberately does NOT do ────────────────────────────────────────
 * It does not rank. `rankResults` scores results against a query, and there is
 * no query here — running it would replace a date order with a SCORE, which is
 * exactly what [ADR-112] decision 5 forbids. The order arrives from
 * `orderRecentRecords` and is preserved verbatim; this file contains no
 * comparison, no arithmetic and no sort at all.
 *
 * It also does not group by entity type. Search groups results by type because a
 * query's matches have no inherent order across types; a recency list has
 * exactly one meaningful order, and splitting it into per-type groups would
 * scramble the one fact it exists to show. One group, one order.
 */

import { entityDestination } from "~/shared/entity/destination";

import { MAX_TITLE_LENGTH } from "./limits";
import { orderRecentRecords, type RecentRecord } from "~/kernel/recent-records";
import type {
  RankedSearchResult,
  SearchOutcome,
  SearchResultGroup,
} from "./types";

/** The provider-shaped identity recent rows carry. Not a registered provider. */
export const RECENT_PROVIDER_ID = "search.recent";
export const RECENT_MODULE_ID = "search";
/** The single group's stable id, matched by the surface and by tests. */
export const RECENT_GROUP_ID = "recent";

/** The heading the group renders. Names the RULE, not a vague "Recent". */
export const RECENT_GROUP_LABEL = "Recently worked on";

function clampTitle(value: string): string {
  const points = Array.from(value.trim());
  return points.length <= MAX_TITLE_LENGTH
    ? value.trim()
    : points.slice(0, MAX_TITLE_LENGTH).join("");
}

/**
 * One recent record as a search result, or `null` when it has no genuine
 * destination.
 *
 * The destination comes from `~/shared/entity/destination` — the product's ONE
 * authority for "where does this record open" — so a recent row and a searched
 * row of the same type open the same place by construction, and this file owns
 * no route table. A type with no implemented record page yields `null` and is
 * dropped: a row that cannot be opened has no business in a list whose entire
 * purpose is opening things.
 *
 * Tasks are the reason `canonicalPath` is set. A Task opens in the shared Drawer
 * rather than on a page of its own, and the Drawer needs a route whose
 * `DrawerProvider` can render the key — the same `/tasks` the Tasks provider
 * already names. This does not introduce a fourth Task anatomy: the row is the
 * existing `SearchOption`, and the destination is the existing Task Drawer.
 */
export function recentRecordToResult(
  record: RecentRecord,
  index: number,
): RankedSearchResult | null {
  const destination = entityDestination(record.type, record.id);
  if (destination === null) return null;

  const target =
    destination.kind === "drawer"
      ? {
          kind: "drawer" as const,
          drawerKey: destination.drawerKey,
          canonicalPath: "/tasks",
        }
      : { kind: "route" as const, to: destination.to };

  return {
    // Stable, collision-free and in the shape every other result uses.
    id: `${RECENT_MODULE_ID}::${RECENT_PROVIDER_ID}::${index}:${record.id}`,
    providerId: RECENT_PROVIDER_ID,
    moduleId: RECENT_MODULE_ID,
    title: clampTitle(record.title),
    entityType: record.type,
    target,
    // No subtitle and no signals, by design — see `RecentRecord`. Not an
    // omission to be filled in later: filling it in is the N+1 the bound forbids.
    score: 0,
    titleMatches: [],
    subtitleMatches: [],
  };
}

/**
 * The complete outcome for an empty query.
 *
 * `query` is `""`, which is what the browser's own `resultsAreCurrent` check
 * compares against for an empty input — so the recent list is "current" by the
 * same rule every other result set is, with no special case in the controller.
 *
 * An empty workspace yields an outcome with no groups and `status: "ok"`. That
 * is an HONEST empty state and not an error: a workspace with no history has
 * nothing recent, and saying so calmly is criterion 3.
 */
export function recentRecordsOutcome(
  records: readonly RecentRecord[],
): SearchOutcome {
  const results: RankedSearchResult[] = [];
  orderRecentRecords(records).forEach((record, index) => {
    const result = recentRecordToResult(record, index);
    if (result !== null) results.push(result);
  });

  if (results.length === 0) {
    return {
      query: "",
      status: "ok",
      groups: [],
      totalCount: 0,
      truncated: false,
      providers: [],
    };
  }

  const group: SearchResultGroup = {
    id: RECENT_GROUP_ID,
    kind: "recent",
    label: RECENT_GROUP_LABEL,
    results,
  };

  return {
    query: "",
    status: "ok",
    groups: [group],
    totalCount: results.length,
    truncated: false,
    providers: [],
  };
}
