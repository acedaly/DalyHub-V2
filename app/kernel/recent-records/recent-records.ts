/**
 * FIND-01 — the recency RULE, pure and storage-independent.
 *
 * DalyHub had no recency source at all before this item: opening Search with no
 * query showed one sentence restating the placeholder above it
 * ([DEBT-195]). This module owns the one rule that answers *"what was I just
 * working on?"*, and it owns it in exactly one place so no surface can invent a
 * second.
 *
 * ── The rule, stated once ───────────────────────────────────────────────────
 *
 *   A record's recency is the timestamp of the MOST RECENT Activity event the
 *   record is a subject of. Newest first. Ties break by entity id, descending.
 *
 * That is a DATE, not a prediction ([ADR-112] decision 5). Three properties
 * follow, and each is asserted by a test rather than left to good intentions:
 *
 *   - it is a MAXIMUM, never a COUNT — a record touched fifty times last month
 *     ranks below one touched once this morning, so frequency cannot leak in as
 *     ranking;
 *   - it is derived, never stored — no table, no column, no migration and no
 *     write path, which is [ADR-110]'s standing posture applied to a new
 *     question;
 *   - it reads MUTATIONS, never views. Activity records what the owner CHANGED.
 *     DalyHub has never stored what the owner LOOKED AT, and this item does not
 *     start: adding a view event to the one append-only audit stream is refused
 *     outright by ADR-112 decision 5, and a separate "recently opened" ledger is
 *     the more expensive answer that decision asks to be disproven first.
 *
 * ── Why Activity and not `entities.updated_at` ──────────────────────────────
 * `entities.updated_at` looks like the obvious authority and is not one: it is
 * maintained INCONSISTENTLY across the detail tables. Some repositories bump it
 * when a detail row changes and some do not, which is why
 * `d1-area-repository.ts` already carries an `EFFECTIVE_PROJECT_UPDATED_AT_EXPR`
 * — a `CASE` folding `project_details.updated_at` over `entities.updated_at` —
 * to compensate. A recency source built on it would silently under-report every
 * edit that only touched a detail table, and would need one such `CASE` per
 * entity type to be honest. The Activity stream has no such gap: ADR-005 and
 * ADR-012 make every meaningful change to any entity append exactly one event,
 * atomically with the mutation, uniformly for every module. It is the only
 * source in the product that already answers this question for all ten record
 * types the same way.
 */

import type { EntityType } from "~/kernel/entities";

/**
 * How many recent records the empty query lists.
 *
 * EIGHT, matching what the surface's own retired client-side list showed, and
 * chosen to fit one phone viewport without scrolling. It is a product bound, not
 * a performance one — the scan below is what keeps the read cheap.
 */
export const RECENT_RECORD_LIMIT = 8;

/**
 * How many Activity events one recency read will look back over.
 *
 * This is what makes the query FLAT IN WORKSPACE SIZE rather than merely flat in
 * statement count. Without it, grouping by entity to find each one's newest
 * event scans every `activity_subjects` row the workspace has ever accumulated,
 * so the empty query would get slower every week the owner used the product —
 * which is the opposite of what opening Search is for.
 *
 * With it, the read walks at most this many rows of
 * `activities_workspace_occurred_idx` (already ordered `(workspace_id,
 * occurred_at, id)`, and SQLite walks an index backwards) and stops.
 *
 * SIX HUNDRED, deliberately the same figure as `MAX_WINDOW_EVENTS` — FOLLOW-01
 * sized that bound against one owner's real activity for the same reason, and a
 * second number would be a second answer to one question. The consequence is a
 * stated HORIZON rather than a silent approximation: a record whose newest event
 * is older than the workspace's newest 600 events is not "recent", which is what
 * the word means. It cannot mis-ORDER anything — everything inside the horizon
 * is exact — it can only decline to fill the list, and
 * `recent-records.test.ts` pins that boundary explicitly.
 */
export const RECENT_ACTIVITY_SCAN_LIMIT = 600;

/**
 * Record types the empty query never lists, whatever their recency.
 *
 * **Diary, and only Diary.** The reasoning is about WHEN this list renders, not
 * about who may read it: every other Search surface appears because the owner
 * typed something, and this one appears because they opened Search. A query for
 * "therapy" is a deliberate act; `⌘K` on a shared screen is not, and a Diary
 * title is the most intimate string this product stores. A Diary entry stays
 * fully findable the moment the owner types — nothing is hidden, one unbidden
 * surface just declines to volunteer it.
 *
 * People are deliberately NOT excluded. A name is not a confession, People are
 * among the most valuable records to re-find, and the stronger protection is
 * structural: a recent row carries a title and nothing else (see
 * `RecentRecord`), so no record's body, note or detail can reach this list
 * regardless of type.
 */
export const RECENCY_EXCLUDED_TYPES: ReadonlySet<string> = new Set(["diary"]);

/**
 * One recently-worked-on record.
 *
 * Deliberately NARROW: an identity, a type, a title and the date the rule
 * selected it by. There is no subtitle, no preview, no body excerpt and no
 * per-type signal, and that is two decisions in one field list. It keeps the
 * read to a SINGLE statement — a subtitle would mean joining ten detail tables
 * or issuing one read per type, which is the N+1 criterion 5 forbids — and it
 * makes the privacy property structural rather than conditional: this list
 * cannot leak a record's contents because it never carries any.
 */
export type RecentRecord = {
  readonly id: string;
  readonly type: EntityType;
  readonly title: string;
  /** The record's newest Activity event, ISO-8601 UTC. The recency itself. */
  readonly lastWorkedAt: string;
  /**
   * When the record was created, ISO-8601 UTC. NOT a second recency signal —
   * it is only ever consulted to break an exact tie in `lastWorkedAt`. See
   * {@link orderRecentRecords}.
   */
  readonly createdAt: string;
};

/**
 * Order recent records by the rule, deterministically.
 *
 * Three keys, all descending: `lastWorkedAt`, then `createdAt`, then `id`.
 *
 * ── Why a tie-break is needed at all ────────────────────────────────────────
 * Ties are not a corner case here, they are the COMMON case. DalyHub writes
 * Activity atomically with the mutation (ADR-012), and most owner actions touch
 * more than one record: creating a Task inside a Project makes both the Task and
 * its Project subjects of one event, at one instant. Without a second key those
 * rows order by whatever the database happens to return, so the same workspace
 * could render a different list on two consecutive opens.
 *
 * ── Why `createdAt` before `id` ─────────────────────────────────────────────
 * This was found by testing rather than by reasoning, and it is worth recording
 * because the first version was WRONG in a way that looked fine. With `id`
 * alone the tie-break is stable but arbitrary to a human: create a Task in a
 * Project and the list leads with whichever of the two happens to have the
 * larger random id — so half the time the owner's brand-new Task sits BELOW the
 * Project they made it in. `createdAt` answers that tie the way a person would:
 * of two records touched at the same instant, the one that came into existence
 * more recently is the one the owner is looking at.
 *
 * It is still a DATE. `createdAt` is not a second recency signal and never
 * competes with `lastWorkedAt` — it is consulted ONLY when `lastWorkedAt` is
 * exactly equal, so an older record touched a millisecond later always wins.
 * `id` remains the final key so the order is total even for two records created
 * in the same transaction at the same instant.
 *
 * Pure and total: it neither reads nor writes anything, and it never consults a
 * count, a frequency, an owner identity or a previous ordering. Given the same
 * rows it returns the same list, on any machine, forever.
 */
export function orderRecentRecords(
  records: readonly RecentRecord[],
): RecentRecord[] {
  return [...records].sort((a, b) => {
    if (a.lastWorkedAt !== b.lastWorkedAt) {
      return a.lastWorkedAt < b.lastWorkedAt ? 1 : -1;
    }
    if (a.createdAt !== b.createdAt) {
      return a.createdAt < b.createdAt ? 1 : -1;
    }
    if (a.id === b.id) return 0;
    return a.id < b.id ? 1 : -1;
  });
}

/** True when this record type may appear in the unbidden recent list. */
export function isRecencyListableType(type: string): boolean {
  return !RECENCY_EXCLUDED_TYPES.has(type);
}
