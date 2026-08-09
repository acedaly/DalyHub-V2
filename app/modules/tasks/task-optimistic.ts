/**
 * TASKS-09 — the optimistic PRESENTATION layer of the `/tasks` list (pure, React-free).
 *
 * The rule ADR-086 records is a split, not a reversal: **presentation may lead the
 * server; announcements, Activity and any claim of success may not.** This module is
 * the whole of the first half. It holds a map of in-flight patches keyed by task id,
 * and applies them to the loader's own records so the row re-renders immediately.
 *
 * Two properties make that safe:
 *
 *   1. **It patches the SOURCE record, not the rendered card.** A completed row is
 *      `{ completedAt }` applied to the serialised item, after which `toTaskCardData`
 *      re-derives the display state, the tone and the urgency exactly as it does for
 *      the server's answer. There is no second derivation to keep in step, and no
 *      display value that only an optimistic row can have.
 *   2. **It is the client's guess and knows it.** A patch survives only until the
 *      loader answers (the workspace drops every patch when fresh data arrives) or
 *      until the write is refused (the caller drops that one patch). Nothing here
 *      writes, fetches, or reports an outcome.
 *
 * Grouped presentations are patched through the SAME function, because a Time Sectors
 * column and a flat list render the same records and must not disagree about them.
 */

import type {
  SerializedTaskListItem,
  TaskListItemPatch,
} from "~/shared/task-record/task-view";

import type { TasksGrouping } from "./tasks-contract";

/** In-flight patches, keyed by task id. Empty is the steady state. */
export type TaskPatches = ReadonlyMap<string, TaskListItemPatch>;

export const NO_TASK_PATCHES: TaskPatches = new Map();

/**
 * Add (or extend) one task's patch. Two edits to the same row before either answers
 * MERGE rather than replace — changing a priority and then a due date must not make
 * the first one appear to have been undone.
 */
export function withTaskPatch(
  patches: TaskPatches,
  taskId: string,
  patch: TaskListItemPatch,
): TaskPatches {
  const next = new Map(patches);
  next.set(taskId, { ...next.get(taskId), ...patch });
  return next;
}

/**
 * Roll back exactly the keys ONE refused write applied, leaving any other in-flight
 * change to the same row alone.
 *
 * Dropping the whole entry would be simpler and would sometimes be wrong: a refused
 * due date must not also un-paint a priority that was accepted a moment earlier and
 * whose acceptance the current configuration did not need re-reading to prove.
 */
export function withoutTaskPatch(
  patches: TaskPatches,
  taskId: string,
  keys?: readonly (keyof TaskListItemPatch)[],
): TaskPatches {
  const current = patches.get(taskId);
  if (current === undefined) return patches;
  const next = new Map(patches);
  if (keys === undefined || keys.length === 0) {
    next.delete(taskId);
    return next;
  }
  const remaining: Record<string, unknown> = { ...current };
  for (const key of keys) delete remaining[key];
  if (Object.keys(remaining).length === 0) next.delete(taskId);
  else next.set(taskId, remaining as TaskListItemPatch);
  return next;
}

/** Apply a patch to one record, returning the record itself when nothing changed. */
export function applyTaskPatch(
  item: SerializedTaskListItem,
  patch: TaskListItemPatch | undefined,
): SerializedTaskListItem {
  if (patch === undefined) return item;
  let changed = false;
  for (const key of Object.keys(patch) as (keyof TaskListItemPatch)[]) {
    const value = patch[key];
    if (value === undefined) continue;
    // A parent is compared by identity of its id, not by object identity: the patch
    // constructs a fresh relation object every time.
    if (key === "parent") {
      const current = item.parent?.id ?? null;
      const next = (value as SerializedTaskListItem["parent"])?.id ?? null;
      if (current !== next) changed = true;
      continue;
    }
    if (item[key] !== value) changed = true;
  }
  return changed ? { ...item, ...patch } : item;
}

/** Apply the patch map across a page of records. */
export function applyTaskPatches(
  items: readonly SerializedTaskListItem[],
  patches: TaskPatches,
): readonly SerializedTaskListItem[] {
  if (patches.size === 0) return items;
  let changed = false;
  const out = items.map((item) => {
    const patched = applyTaskPatch(item, patches.get(item.id));
    if (patched !== item) changed = true;
    return patched;
  });
  return changed ? out : items;
}

/**
 * Apply the patch map across a SERVER grouping.
 *
 * The bucket COUNTS are left exactly as the server reported them. An optimistic
 * presentation may re-render a row; it may not restate an authoritative figure, and a
 * count that moved because the client guessed is precisely the kind of claim ADR-086
 * keeps on the server's side of the line. The bucket a patched row sits in is
 * corrected by the revalidation the predicate asks for whenever the grouping
 * dimension is one the change touches.
 */
export function applyTaskPatchesToGrouping(
  grouping: TasksGrouping | null,
  patches: TaskPatches,
): TasksGrouping | null {
  if (grouping === null || patches.size === 0) return grouping;
  let changed = false;
  const groups = grouping.groups.map((group) => {
    const items = applyTaskPatches(group.items, patches);
    if (items === group.items) return group;
    changed = true;
    return { ...group, items };
  });
  return changed ? { ...grouping, groups } : grouping;
}
