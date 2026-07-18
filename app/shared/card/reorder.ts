/**
 * DS-04 — pure reorder order-math (framework-free, unit-testable).
 *
 * Reordering emits INTENT (a new id order) to the consumer; it never mutates
 * business data. These helpers compute the next order as a strict PERMUTATION of
 * the input — a card can never disappear or duplicate — and they keep pinned
 * (non-reorderable) cards fixed at their absolute index, so a disabled card cannot
 * move even as reorderable cards shuffle around it.
 */

/** Move `id` one step (`-1` up / `+1` down) among the reorderable positions. */
export function moveByStep(
  order: readonly string[],
  pinned: ReadonlySet<string>,
  id: string,
  direction: -1 | 1,
): string[] {
  return moveToReorderablePosition(
    order,
    pinned,
    id,
    reorderablePositionOf(order, pinned, id) + direction,
  );
}

/** The 0-based position of `id` among the reorderable ids only. */
export function reorderablePositionOf(
  order: readonly string[],
  pinned: ReadonlySet<string>,
  id: string,
): number {
  return order.filter((item) => !pinned.has(item)).indexOf(id);
}

/**
 * Place `id` at `targetReorderablePos` within the sequence of reorderable ids,
 * weaving pinned ids back at their original absolute indices. Out-of-range targets
 * clamp. Returns a new array (input untouched).
 */
export function moveToReorderablePosition(
  order: readonly string[],
  pinned: ReadonlySet<string>,
  id: string,
  targetReorderablePos: number,
): string[] {
  if (pinned.has(id)) {
    return [...order];
  }
  const reorderable = order.filter((item) => !pinned.has(item));
  const from = reorderable.indexOf(id);
  if (from === -1) {
    return [...order];
  }
  const to = Math.min(
    Math.max(targetReorderablePos, 0),
    reorderable.length - 1,
  );
  if (to === from) {
    return [...order];
  }
  reorderable.splice(from, 1);
  reorderable.splice(to, 0, id);

  // Weave: pinned ids keep their absolute index; the rest fill in sequence.
  let cursor = 0;
  return order.map((item) => (pinned.has(item) ? item : reorderable[cursor++]));
}

/**
 * Given the DOM order and each item's vertical (or, for grids, linear) midpoint,
 * compute the reorderable target position for a pointer at `pointerCoord`. Only
 * reorderable slots are candidates.
 */
export function reorderablePositionForPointer(
  order: readonly string[],
  pinned: ReadonlySet<string>,
  midpoints: ReadonlyMap<string, number>,
  pointerCoord: number,
): number {
  const reorderable = order.filter((item) => !pinned.has(item));
  let position = 0;
  for (const item of reorderable) {
    const midpoint = midpoints.get(item);
    if (midpoint === undefined) {
      position += 1;
      continue;
    }
    if (pointerCoord > midpoint) {
      position += 1;
    } else {
      break;
    }
  }
  return Math.min(position, Math.max(reorderable.length - 1, 0));
}

/** True when two id orders differ (a real reorder happened). */
export function ordersDiffer(
  a: readonly string[],
  b: readonly string[],
): boolean {
  if (a.length !== b.length) {
    return true;
  }
  return a.some((id, index) => id !== b[index]);
}
