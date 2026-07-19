/**
 * DS-05 — the pure windowing math for virtualised rendering (React-free).
 *
 * The Timeline / Activity Feed can hold thousands of variable-height rows. Rather
 * than reach for a large general-purpose data-grid dependency, DS-05 renders only
 * the rows near the viewport, positioned by measured offsets inside a container of
 * the full scroll height. This module is the small, deterministic, unit-tested core
 * of that scheme: given per-row heights and the current scroll position it returns
 * the slice to render plus the top/bottom spacer sizes.
 *
 * Splitting the math out keeps it pure and testable independent of the DOM. The
 * React hook (`useActivityWindow`) supplies measured heights and a scroll position.
 */

/** Cumulative row offsets plus the total scroll height. */
export interface RowOffsets {
  /** `offsets[i]` is the top of row `i`; length is `count + 1` (last = total). */
  readonly offsets: readonly number[];
  readonly totalHeight: number;
}

/** Build cumulative offsets from row heights. Non-finite/negative heights clamp to 0. */
export function buildRowOffsets(heights: readonly number[]): RowOffsets {
  const offsets: number[] = new Array(heights.length + 1);
  offsets[0] = 0;
  for (let i = 0; i < heights.length; i += 1) {
    const h = heights[i];
    const safe = Number.isFinite(h) && h > 0 ? h : 0;
    offsets[i + 1] = offsets[i] + safe;
  }
  return { offsets, totalHeight: offsets[heights.length] ?? 0 };
}

/** Inputs to `computeWindow`. */
export interface ComputeWindowInput {
  readonly offsets: readonly number[];
  readonly totalHeight: number;
  readonly count: number;
  readonly scrollTop: number;
  readonly viewportHeight: number;
  /** Extra rows rendered above and below the viewport for smooth scrolling. */
  readonly overscan: number;
}

/** The slice to render and the spacer sizes that preserve total scroll height. */
export interface WindowResult {
  readonly startIndex: number;
  /** Exclusive end index (render `[startIndex, endIndex)`). */
  readonly endIndex: number;
  readonly paddingTop: number;
  readonly paddingBottom: number;
  readonly totalHeight: number;
}

/** Largest index `i` with `offsets[i] <= target` (binary search). */
function findIndexAtOrBefore(
  offsets: readonly number[],
  count: number,
  target: number,
): number {
  let lo = 0;
  let hi = count - 1;
  let result = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid] <= target) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

/**
 * Compute the render window for the current scroll position. Deterministic and
 * total: empty input yields an empty window; a scroll position past the end clamps
 * to the last rows; overscan is applied symmetrically and clamped to bounds. The
 * returned spacers always sum with the rendered rows to exactly `totalHeight`, so
 * the scrollbar is stable and rows never overlap or jump.
 */
export function computeWindow(input: ComputeWindowInput): WindowResult {
  const { offsets, totalHeight, count, viewportHeight } = input;
  if (count <= 0) {
    return {
      startIndex: 0,
      endIndex: 0,
      paddingTop: 0,
      paddingBottom: 0,
      totalHeight,
    };
  }

  const scrollTop = Math.max(0, input.scrollTop);
  const overscan = Math.max(0, Math.floor(input.overscan));

  const firstVisible = findIndexAtOrBefore(offsets, count, scrollTop);
  const lastVisible = findIndexAtOrBefore(
    offsets,
    count,
    scrollTop + Math.max(0, viewportHeight),
  );

  const startIndex = Math.max(0, firstVisible - overscan);
  const endIndex = Math.min(count, lastVisible + overscan + 1);

  return {
    startIndex,
    endIndex,
    paddingTop: offsets[startIndex] ?? 0,
    paddingBottom: totalHeight - (offsets[endIndex] ?? totalHeight),
    totalHeight,
  };
}
