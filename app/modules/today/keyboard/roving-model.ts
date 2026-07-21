/**
 * TODAY-05 — the pure roving-navigation model (React-free, testable).
 *
 * Today's open tasks are laid out across several ordered sections (Overdue, Today,
 * Upcoming, Anytime). Keyboard navigation moves a single "focused" position across
 * that collection — Arrow Up/Down cross section boundaries, Home/End move within the
 * current section — using a roving-focus pattern (one tab stop for the whole
 * collection; arrows move within it). This module owns ONLY the position arithmetic
 * so it can be unit-tested directly and behaves identically on the server and the
 * client. It knows nothing about the DOM, React, tasks, planning or the palette.
 *
 * Navigation CLAMPS at the ends (no wrap) — a calm, predictable model consistent
 * with Things/Todoist: Arrow Down on the last task stays on the last task. A section
 * is a contiguous run of task ids; the same task id never appears twice.
 */

/** One navigable section: a stable id and its task ids in visual order. */
export interface RovingSection {
  readonly id: string;
  readonly taskIds: readonly string[];
}

/** The ordered sections that make up the navigable task collection. */
export type RovingOrder = readonly RovingSection[];

/** Every task id across all sections, in visual order. */
export function flattenOrder(order: RovingOrder): readonly string[] {
  const ids: string[] = [];
  for (const section of order) {
    for (const id of section.taskIds) {
      ids.push(id);
    }
  }
  return ids;
}

/** The first task id in the whole collection, or null when it is empty. */
export function firstId(order: RovingOrder): string | null {
  const flat = flattenOrder(order);
  return flat.length > 0 ? flat[0] : null;
}

/** The last task id in the whole collection, or null when it is empty. */
export function lastId(order: RovingOrder): string | null {
  const flat = flattenOrder(order);
  return flat.length > 0 ? flat[flat.length - 1] : null;
}

/**
 * The next task id after `current` (Arrow Down), crossing section boundaries and
 * clamping at the end. When `current` is null/unknown the first id is returned, so a
 * first Arrow Down lands on the first task.
 */
export function nextId(
  order: RovingOrder,
  current: string | null,
): string | null {
  const flat = flattenOrder(order);
  if (flat.length === 0) {
    return null;
  }
  if (current === null) {
    return flat[0];
  }
  const index = flat.indexOf(current);
  if (index === -1) {
    return flat[0];
  }
  return index + 1 < flat.length ? flat[index + 1] : flat[index];
}

/**
 * The previous task id before `current` (Arrow Up), crossing section boundaries and
 * clamping at the start. When `current` is null/unknown the last id is returned.
 */
export function prevId(
  order: RovingOrder,
  current: string | null,
): string | null {
  const flat = flattenOrder(order);
  if (flat.length === 0) {
    return null;
  }
  if (current === null) {
    return flat[flat.length - 1];
  }
  const index = flat.indexOf(current);
  if (index === -1) {
    return flat[flat.length - 1];
  }
  return index - 1 >= 0 ? flat[index - 1] : flat[index];
}

/** The section that contains `id`, or null when no section does. */
function sectionOf(order: RovingOrder, id: string): RovingSection | null {
  for (const section of order) {
    if (section.taskIds.includes(id)) {
      return section;
    }
  }
  return null;
}

/**
 * Home: the first task in the section containing `current`. When `current` is
 * null/unknown, the first task in the whole collection.
 */
export function sectionFirstId(
  order: RovingOrder,
  current: string | null,
): string | null {
  if (current === null) {
    return firstId(order);
  }
  const section = sectionOf(order, current);
  if (section === null || section.taskIds.length === 0) {
    return firstId(order);
  }
  return section.taskIds[0];
}

/**
 * End: the last task in the section containing `current`. When `current` is
 * null/unknown, the last task in the whole collection.
 */
export function sectionLastId(
  order: RovingOrder,
  current: string | null,
): string | null {
  if (current === null) {
    return lastId(order);
  }
  const section = sectionOf(order, current);
  if (section === null || section.taskIds.length === 0) {
    return lastId(order);
  }
  return section.taskIds[section.taskIds.length - 1];
}

/**
 * Reconcile a focused id against a (possibly changed) order: keep it if it still
 * exists, otherwise fall back to null so the collection's single tab stop returns to
 * the first task. Used when the loader re-buckets tasks after a mutation.
 */
export function reconcileFocus(
  order: RovingOrder,
  focusedId: string | null,
): string | null {
  if (focusedId === null) {
    return null;
  }
  return flattenOrder(order).includes(focusedId) ? focusedId : null;
}

/**
 * The id that owns the collection's single tab stop (roving tabindex): the focused
 * task, or — when nothing is focused yet — the first task, so Tab always enters the
 * collection at a predictable place and only ONE task is in the tab order.
 */
export function tabStopId(
  order: RovingOrder,
  focusedId: string | null,
): string | null {
  return reconcileFocus(order, focusedId) ?? firstId(order);
}
