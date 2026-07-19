import { describe, expect, it } from "vitest";

import { toHighlightSegments } from "~/shared/search/highlight";

describe("toHighlightSegments", () => {
  it("splits text into matched and unmatched segments", () => {
    const segments = toHighlightSegments("Finish PX-02", [
      { start: 0, end: 6 },
    ]);
    expect(segments).toEqual([
      { text: "Finish", match: true },
      { text: " PX-02", match: false },
    ]);
  });

  it("returns a single plain segment when there are no ranges", () => {
    expect(toHighlightSegments("Plain", [])).toEqual([
      { text: "Plain", match: false },
    ]);
  });

  it("merges overlapping and adjacent ranges", () => {
    const segments = toHighlightSegments("abcdef", [
      { start: 0, end: 2 },
      { start: 1, end: 4 },
    ]);
    expect(segments).toEqual([
      { text: "abcd", match: true },
      { text: "ef", match: false },
    ]);
  });

  it("degrades malformed ranges to plain text rather than corrupting output", () => {
    const segments = toHighlightSegments("abc", [
      { start: 5, end: 9 }, // out of bounds
      { start: 2, end: 1 }, // inverted
      { start: 1.5, end: 2 }, // non-integer
    ]);
    expect(segments).toEqual([{ text: "abc", match: false }]);
  });

  it("clamps an over-long range to the text length", () => {
    const segments = toHighlightSegments("abc", [{ start: 1, end: 99 }]);
    expect(segments).toEqual([
      { text: "a", match: false },
      { text: "bc", match: true },
    ]);
  });

  it("handles multi-code-point characters by code point", () => {
    // "😀ab": ranges are code-point indices, so [1,2) is "a".
    const segments = toHighlightSegments("😀ab", [{ start: 1, end: 2 }]);
    expect(segments).toEqual([
      { text: "😀", match: false },
      { text: "a", match: true },
      { text: "b", match: false },
    ]);
  });
});
