/**
 * DS-08 Shared Search — keyboard selection maths (pure, React-free).
 *
 * The combobox tracks an active option by index into the flat, display-ordered
 * result list. These pure helpers compute the next index for each key so the
 * controller and its tests share exactly one definition of the movement. An empty
 * list has no active option (index -1). Arrow movement wraps; Home/End clamp.
 */

/** Clamp an index into `[0, count)`, or -1 when the list is empty. */
export function clampIndex(index: number, count: number): number {
  if (count <= 0) {
    return -1;
  }
  if (index < 0) {
    return -1;
  }
  return Math.min(index, count - 1);
}

/** Next index for ArrowDown — wraps from the last option back to the first. */
export function nextIndex(current: number, count: number): number {
  if (count <= 0) {
    return -1;
  }
  if (current < 0) {
    return 0;
  }
  return (current + 1) % count;
}

/** Previous index for ArrowUp — wraps from the first option to the last. */
export function previousIndex(current: number, count: number): number {
  if (count <= 0) {
    return -1;
  }
  if (current < 0) {
    return count - 1;
  }
  return (current - 1 + count) % count;
}

/** First index (Home), or -1 when empty. */
export function firstIndex(count: number): number {
  return count > 0 ? 0 : -1;
}

/** Last index (End), or -1 when empty. */
export function lastIndex(count: number): number {
  return count > 0 ? count - 1 : -1;
}
