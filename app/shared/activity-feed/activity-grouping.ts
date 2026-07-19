/**
 * DS-05 — deterministic ordering, day grouping and row flattening (React-free).
 *
 * The kernel already returns events newest-first by `(occurredAt, id)`. When pages
 * are merged (or fixtures assembled) the shared UI re-applies the SAME total order
 * so ordering is deterministic even when two events share a timestamp: newest
 * `occurredAt` first, ties broken by descending `id` (matching the kernel's
 * `ORDER BY occurred_at DESC, id DESC`). Grouping is by UTC calendar day, so an
 * event lands in one stable bucket regardless of the viewer's timezone.
 *
 * Groups are flattened to a single row list (heading rows + item rows) so one
 * windowed list can virtualise the whole stream while day headings stay correctly
 * associated with their events.
 */

import type {
  ActivityDateFormatter,
  ActivityDayGroup,
  ActivityItem,
  ActivityRow,
} from "./types";

/**
 * Total order for the stream: newest `occurredAt` first; ties broken by descending
 * `id`. Deterministic and stable for equal timestamps.
 */
export function compareActivityItemsNewestFirst(
  a: ActivityItem,
  b: ActivityItem,
): number {
  const at = a.occurredAt.getTime();
  const bt = b.occurredAt.getTime();
  if (at !== bt) {
    return bt - at;
  }
  if (a.id === b.id) {
    return 0;
  }
  return a.id < b.id ? 1 : -1;
}

/** Return a new array in the deterministic newest-first order. */
export function sortActivityItemsNewestFirst(
  items: readonly ActivityItem[],
): ActivityItem[] {
  return [...items].sort(compareActivityItemsNewestFirst);
}

/**
 * Group items into day buckets (newest day first, newest item first within a day).
 * The input is re-sorted, so callers may pass merged pages in any order and still
 * get a deterministic result. Empty input yields an empty array.
 */
export function groupActivityItemsByDay(
  items: readonly ActivityItem[],
  formatter: ActivityDateFormatter,
): ActivityDayGroup[] {
  const sorted = sortActivityItemsNewestFirst(items);
  const groups: ActivityDayGroup[] = [];
  let current: { key: string; date: Date; items: ActivityItem[] } | null = null;

  for (const item of sorted) {
    const key = formatter.dayKey(item.occurredAt);
    if (current === null || current.key !== key) {
      current = {
        key,
        date: formatter.dayStart(item.occurredAt),
        items: [],
      };
      groups.push(current);
    }
    current.items.push(item);
  }

  return groups;
}

/**
 * Flatten day groups into a single ordered row list: one heading row per day
 * followed by its item rows. `posInSet`/`setSize` are computed across ALL items in
 * the stream (not per day) so the accessible feed reports a coherent position.
 */
export function flattenGroupsToRows(
  groups: readonly ActivityDayGroup[],
  formatter: ActivityDateFormatter,
): ActivityRow[] {
  const setSize = groups.reduce(
    (total, group) => total + group.items.length,
    0,
  );
  const rows: ActivityRow[] = [];
  let pos = 0;
  for (const group of groups) {
    rows.push({
      kind: "heading",
      key: `heading:${group.key}`,
      group,
      dayLabel: formatter.formatDayHeading(group.date),
    });
    for (const item of group.items) {
      pos += 1;
      rows.push({
        kind: "item",
        key: `item:${item.id}`,
        item,
        groupKey: group.key,
        posInSet: pos,
        setSize,
      });
    }
  }
  return rows;
}

/**
 * Convenience: group and flatten in one call. Used by the shared renderer.
 */
export function buildActivityRows(
  items: readonly ActivityItem[],
  formatter: ActivityDateFormatter,
): ActivityRow[] {
  return flattenGroupsToRows(
    groupActivityItemsByDay(items, formatter),
    formatter,
  );
}
