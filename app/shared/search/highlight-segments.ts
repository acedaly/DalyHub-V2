/**
 * DS-08 Shared Search — safe highlight segmentation (pure, React-free).
 *
 * Turns a plain string plus matched code-point ranges into an ordered list of
 * matched/unmatched text segments. The UI renders matched segments as `<mark>` —
 * never an HTML-injection sink, and no provider HTML anywhere. Ranges are
 * treated as untrusted: out-of-bounds, inverted, non-integer, overlapping or
 * duplicate ranges are clamped, merged or dropped, so malformed match ranges
 * degrade to plain text rather than corrupt the render.
 */

import type { MatchRange } from "./types";

export type HighlightSegment = {
  readonly text: string;
  readonly match: boolean;
};

/** Split `text` into matched/unmatched segments over sanitised `ranges`. */
export function toHighlightSegments(
  text: string,
  ranges: readonly MatchRange[],
): HighlightSegment[] {
  const points = Array.from(text);
  if (points.length === 0) {
    return [];
  }
  if (ranges.length === 0) {
    return [{ text, match: false }];
  }

  const sanitised = ranges
    .filter(
      (r) =>
        Number.isInteger(r.start) && Number.isInteger(r.end) && r.start < r.end,
    )
    .map((r) => ({
      start: Math.max(0, Math.min(r.start, points.length)),
      end: Math.max(0, Math.min(r.end, points.length)),
    }))
    .filter((r) => r.start < r.end)
    .sort((a, b) => a.start - b.start);

  if (sanitised.length === 0) {
    return [{ text, match: false }];
  }

  const merged: { start: number; end: number }[] = [];
  for (const range of sanitised) {
    const last = merged[merged.length - 1];
    if (last !== undefined && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }

  const segments: HighlightSegment[] = [];
  let cursor = 0;
  for (const range of merged) {
    if (range.start > cursor) {
      segments.push({
        text: points.slice(cursor, range.start).join(""),
        match: false,
      });
    }
    segments.push({
      text: points.slice(range.start, range.end).join(""),
      match: true,
    });
    cursor = range.end;
  }
  if (cursor < points.length) {
    segments.push({ text: points.slice(cursor).join(""), match: false });
  }
  return segments;
}
