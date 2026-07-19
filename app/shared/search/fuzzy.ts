/**
 * DS-08 Shared Search — fuzzy matching primitives (pure, React-free).
 *
 * Open-source assessment (see docs/reference/REFERENCE_PRODUCTS.md, DS-08 entry):
 * Fuse.js (MIT), fzf/fzy scoring, fuzzysort (MIT), match-sorter (MIT) and cmdk's
 * `command-score` (MIT) were reviewed. For a single-user app searching short
 * titles across a handful of providers, a small in-house subsequence matcher is
 * smaller, dependency-free and Workers-safe — consistent with the project's
 * zero-runtime-dependency posture (ADR-018/019/020/022). We therefore BUILD, and
 * take only the well-known *idea* (subsequence match with consecutive-run and
 * word-boundary bonuses); no third-party code is copied.
 *
 * All indices are Unicode CODE-POINT indices into the original string (never
 * UTF-16 units), so ranges line up with a code-point-aware highlighter and never
 * split a surrogate pair. Matching is case-folded; ranges reference the original
 * casing so highlighting preserves it.
 */

import type { MatchRange } from "./types";

/** A string decomposed into original + case-folded code points for matching. */
export type FoldedText = {
  readonly original: readonly string[];
  readonly folded: readonly string[];
};

/** Decompose a string into aligned original/folded code-point arrays. */
export function foldText(value: string): FoldedText {
  const original = Array.from(value);
  const folded = original.map((cp) => cp.toLowerCase());
  return { original, folded };
}

/** Characters that begin a new word/token (a boundary earns a match bonus). */
const SEPARATOR = /[\s\-_/.:,;()[\]{}"'|]/u;

/** True when position `i` in `folded` starts a word (index 0 or after a separator). */
function isWordStart(folded: readonly string[], i: number): boolean {
  if (i === 0) {
    return true;
  }
  return SEPARATOR.test(folded[i - 1] ?? "");
}

/** Merge sorted, possibly-adjacent single-char hits into half-open ranges. */
export function mergeRanges(indices: readonly number[]): MatchRange[] {
  if (indices.length === 0) {
    return [];
  }
  const sorted = [...indices].sort((a, b) => a - b);
  const ranges: MatchRange[] = [];
  let start = sorted[0];
  let end = sorted[0] + 1;
  for (let k = 1; k < sorted.length; k += 1) {
    const index = sorted[k];
    if (index === end) {
      end = index + 1;
    } else if (index > end) {
      ranges.push({ start, end });
      start = index;
      end = index + 1;
    }
  }
  ranges.push({ start, end });
  return ranges;
}

/** The result of a fuzzy subsequence match. */
export type FuzzyMatch = {
  /** Raw score (higher is better); comparable only within this matcher. */
  readonly score: number;
  /** Matched code-point ranges over the original text. */
  readonly ranges: readonly MatchRange[];
};

/**
 * Greedy left-to-right subsequence match of `query` within `text`. Returns null
 * when `query` is not a subsequence of `text`. The score rewards consecutive runs
 * and word-boundary starts and penalises gaps, so tighter, boundary-aligned
 * matches rank above scattered ones. Deterministic (greedy leftmost).
 */
export function fuzzyMatch(
  query: FoldedText,
  text: FoldedText,
): FuzzyMatch | null {
  const q = query.folded;
  const t = text.folded;
  if (q.length === 0) {
    return { score: 0, ranges: [] };
  }
  if (q.length > t.length) {
    return null;
  }

  const hits: number[] = [];
  let ti = 0;
  let score = 0;
  let previousIndex = -2;
  for (let qi = 0; qi < q.length; qi += 1) {
    const target = q[qi];
    let found = -1;
    for (; ti < t.length; ti += 1) {
      if (t[ti] === target) {
        found = ti;
        break;
      }
    }
    if (found === -1) {
      return null;
    }
    hits.push(found);
    // Consecutive-match bonus.
    if (found === previousIndex + 1) {
      score += 3;
    }
    // Word-boundary bonus.
    if (isWordStart(t, found)) {
      score += 2;
    }
    // Gap penalty (distance skipped since the previous match).
    if (previousIndex >= 0) {
      score -= Math.min(found - previousIndex - 1, 3);
    }
    score += 1; // base per-character reward
    previousIndex = found;
    ti = found + 1;
  }

  // Reward covering a larger fraction of the text (prefers shorter targets).
  score += Math.round((q.length / t.length) * 4);
  return { score, ranges: mergeRanges(hits) };
}
