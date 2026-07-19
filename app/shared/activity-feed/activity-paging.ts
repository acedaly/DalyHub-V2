/**
 * DS-05 — deterministic page merging and deduplication (React-free).
 *
 * Cursor pagination can return an event more than once (e.g. a new event arriving
 * between page loads shifts the keyset window). Pages are therefore merged by
 * stable activity `id`: the first occurrence of an id wins and later duplicates are
 * dropped, so an event is never rendered twice and a stable React key is never
 * reused. Merging preserves encounter order; the renderer re-sorts to the canonical
 * newest-first order when grouping, so merge order need only be stable, not sorted.
 */

import type { ActivityItem } from "./types";

/** Drop duplicate ids, keeping the first occurrence. Returns a new array. */
export function dedupeActivityItems(
  items: readonly ActivityItem[],
): ActivityItem[] {
  const seen = new Set<string>();
  const out: ActivityItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

/** The result of merging a newly-loaded page into the accumulated stream. */
export interface MergeResult {
  readonly items: ActivityItem[];
  /** How many genuinely-new items the incoming page contributed. */
  readonly addedCount: number;
}

/**
 * Merge an incoming page into the existing accumulated items, deduplicating by id.
 * Existing items keep their position; only ids not already present are appended.
 */
export function mergeActivityPage(
  existing: readonly ActivityItem[],
  incoming: readonly ActivityItem[],
): MergeResult {
  const seen = new Set(existing.map((item) => item.id));
  const out = [...existing];
  let addedCount = 0;
  for (const item of incoming) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    out.push(item);
    addedCount += 1;
  }
  return { items: out, addedCount };
}
