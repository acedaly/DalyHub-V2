/**
 * DHDS-11 — the pure order-and-announcement math behind every drag in DalyHub.
 *
 * React-free and DOM-free on purpose: everything here is a function of numbers
 * and strings, so the rules a drag obeys can be tested without a browser and
 * cannot quietly differ between the pointer path, the keyboard path and the
 * per-surface commands that do the same thing without a drag at all.
 *
 * Two families live here and nothing else:
 *
 *   - ORDER math — where a pointer means an item should land, and what the
 *     resulting order is. Every result is a strict PERMUTATION of the input, so
 *     a reorder can never drop, duplicate or invent an item;
 *   - ANNOUNCEMENTS — the exact sentences the live region speaks. They are in
 *     one place because a screen-reader user's whole picture of a spatial
 *     operation is these strings, and three surfaces wording them separately is
 *     how one of them ends up saying "item moved".
 *
 * `app/shared/card/reorder.ts` (DS-04) is this module's ancestor. Its pinned-item
 * weave belonged to a collection that could refuse to move one of its own cards;
 * no DHDS-11 surface has that concept, and carrying it would have meant a second
 * order model with a parameter nobody sets.
 */

/** What is being dragged. `kind` is what a drop target matches against. */
export interface DragPayload {
  /** The object family — `"task"`, `"checklist-item"`, `"milestone"`. */
  readonly kind: string;
  /** The object's canonical id. Never an array index. */
  readonly id: string;
  /** The object's own name, used verbatim in every announcement. */
  readonly label: string;
  /**
   * Whatever a target needs in order to decide whether it would CHANGE
   * anything — a Task's current parent id, say, so the Project it already
   * belongs to does not offer itself as a destination.
   */
  readonly data?: Readonly<Record<string, string | null>>;
}

/* -------------------------------------------------------------------------- */
/* Order math                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The index a pointer at `pointer` is asking for, given the block-axis CENTRES
 * of the slots currently on screen, in render order.
 *
 * Centres rather than edges: an item is "past" a neighbour once the pointer has
 * crossed the middle of it, which is the rule that makes a live reorder settle
 * instead of oscillating around a boundary. A slot whose centre is unknown
 * (never measured, or detached) counts as passed, so a partially-measured list
 * degrades to "append" rather than to index 0.
 */
export function insertionIndexForPointer(
  centres: readonly number[],
  pointer: number,
): number {
  if (centres.length === 0) return 0;
  let index = 0;
  for (const centre of centres) {
    if (!Number.isFinite(centre) || pointer > centre) {
      index += 1;
    } else {
      break;
    }
  }
  return Math.min(index, centres.length - 1);
}

/**
 * Move `id` to `to` within `order`, clamping out-of-range targets.
 *
 * Returns a NEW array that is a permutation of the input, or a copy of the input
 * when the move is a no-op or the id is absent.
 */
export function moveWithin(
  order: readonly string[],
  id: string,
  to: number,
): string[] {
  const from = order.indexOf(id);
  if (from === -1) return [...order];
  const target = Math.min(Math.max(to, 0), order.length - 1);
  if (target === from) return [...order];
  const next = [...order];
  next.splice(from, 1);
  next.splice(target, 0, id);
  return next;
}

/** Move `id` by `delta` places, clamped at both ends. The keyboard's whole grammar. */
export function moveByStep(
  order: readonly string[],
  id: string,
  delta: number,
): string[] {
  const from = order.indexOf(id);
  if (from === -1 || delta === 0) return [...order];
  return moveWithin(order, id, from + delta);
}

/** True when two id orders differ — i.e. a real reorder happened. */
export function ordersDiffer(
  a: readonly string[],
  b: readonly string[],
): boolean {
  if (a.length !== b.length) return true;
  return a.some((id, index) => id !== b[index]);
}

/**
 * True when `next` is a permutation of `base`: same length, same members, each
 * exactly once.
 *
 * The precondition every reorder commit is checked against. A surface whose
 * collection changed under an in-flight drag must NOT post the order it was
 * holding — the server would be told an order over a list that no longer
 * exists. Callers refuse instead, and the canonical repositories refuse again.
 */
export function isPermutationOf(
  base: readonly string[],
  next: readonly string[],
): boolean {
  if (base.length !== next.length) return false;
  const remaining = new Set(base);
  if (remaining.size !== base.length) return false;
  for (const id of next) {
    if (!remaining.delete(id)) return false;
  }
  return true;
}

/* -------------------------------------------------------------------------- */
/* Announcements                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The keyboard pick-up sentence: what was taken, where it is, and what the keys
 * now do.
 *
 * The instructions are spoken ONCE, on pick-up, and never repeated on the moves
 * that follow — a live region that restates them on every arrow press is the
 * "excessive chatter" the brief rules out.
 */
export function dragPickUpMessage(
  label: string,
  index: number,
  size: number,
): string {
  return `Picked up ${label}. ${positionPhrase(index, size)}. Use the arrow keys to move, Enter to drop, Escape to cancel.`;
}

/** "Prepare training brief moved to position 3 of 8." */
export function dragPositionMessage(
  label: string,
  index: number,
  size: number,
): string {
  return `${label} moved to ${positionPhrase(index, size)}.`;
}

/** The settled reorder: the same sentence, in the past tense the owner can trust. */
export function dragDroppedMessage(
  label: string,
  index: number,
  size: number,
): string {
  return `${label} dropped at ${positionPhrase(index, size)}.`;
}

/** "Prepare training brief moved to Personal." — a destination, not a position. */
export function dragMovedToMessage(label: string, destination: string): string {
  return `${label} moved to ${destination}.`;
}

/** What the pointer is currently over, spoken while the drag is still live. */
export function dragOverMessage(label: string, destination: string): string {
  return `${label} over ${destination}. Release to move.`;
}

/** Cancelled by Escape, by a lost pointer, or by the collection changing. */
export function dragCancelledMessage(label: string, reason?: string): string {
  return reason === undefined
    ? `Move cancelled. ${label} stayed where it was.`
    : `Move cancelled: ${reason} ${label} stayed where it was.`;
}

/** 1-based, because "position 0 of 8" is not a sentence anybody says. */
function positionPhrase(index: number, size: number): string {
  return `position ${index + 1} of ${size}`;
}
