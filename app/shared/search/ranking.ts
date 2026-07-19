/**
 * DS-08 Shared Search — deterministic ranking (pure, React-free).
 *
 * Ranking is tiered so a provider's own score range can never dominate global
 * ordering (ADR-023). Highest first:
 *
 *   5. exact title match
 *   4. title prefix
 *   3. title token (word-boundary) prefix
 *   2. fuzzy title (subsequence)
 *   1. subtitle / preview match
 *   0. no local match (kept, ordered by provider relevance only)
 *
 * Within a tier we order by a tier-appropriate strength, then the (bounded,
 * normalised) provider relevance as a tie-breaker, then title then id — so the
 * order is total and deterministic for any input.
 */

import { foldCase } from "./query";
import { fuzzyMatch, foldText, mergeRanges, type FoldedText } from "./fuzzy";
import type { MatchRange, RankedSearchResult, TaggedResult } from "./types";
import { resultIdentity } from "./result";

const SEPARATOR = /[\s\-_/.:,;()[\]{}"'|]/u;

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

/** True when `text` (folded) contains `query` (folded) starting at `at`. */
function matchesAt(
  text: readonly string[],
  query: readonly string[],
  at: number,
): boolean {
  if (at + query.length > text.length) {
    return false;
  }
  for (let i = 0; i < query.length; i += 1) {
    if (text[at + i] !== query[i]) {
      return false;
    }
  }
  return true;
}

/** First code-point index at which `query` occurs in `text`, or -1. */
function indexOfFolded(
  text: readonly string[],
  query: readonly string[],
): number {
  if (query.length === 0) {
    return -1;
  }
  for (let at = 0; at + query.length <= text.length; at += 1) {
    if (matchesAt(text, query, at)) {
      return at;
    }
  }
  return -1;
}

/** First word-start index at which `query` prefixes a token in `text`, or -1. */
function tokenPrefixIndex(
  text: readonly string[],
  query: readonly string[],
): number {
  for (let at = 0; at + query.length <= text.length; at += 1) {
    const isWordStart = at === 0 || SEPARATOR.test(text[at - 1] ?? "");
    if (isWordStart && matchesAt(text, query, at)) {
      return at;
    }
  }
  return -1;
}

type Signal = {
  readonly tier: number;
  readonly strength: number;
  readonly titleMatches: readonly MatchRange[];
};

/** Compute the best title-based match signal for a candidate. */
function titleSignal(query: FoldedText, title: FoldedText): Signal {
  const q = query.folded;
  const t = title.folded;

  if (arraysEqual(q, t)) {
    return {
      tier: 5,
      strength: 0,
      titleMatches: [{ start: 0, end: t.length }],
    };
  }
  if (matchesAt(t, q, 0)) {
    return {
      tier: 4,
      strength: 1000 - t.length,
      titleMatches: [{ start: 0, end: q.length }],
    };
  }
  const tokenAt = tokenPrefixIndex(t, q);
  if (tokenAt !== -1) {
    return {
      tier: 3,
      strength: 1000 - tokenAt,
      titleMatches: [{ start: tokenAt, end: tokenAt + q.length }],
    };
  }
  const fuzzy = fuzzyMatch(query, title);
  if (fuzzy !== null) {
    return { tier: 2, strength: fuzzy.score, titleMatches: fuzzy.ranges };
  }
  return { tier: 0, strength: 0, titleMatches: [] };
}

/** Compute subtitle highlight ranges (first substring occurrence), if any. */
function subtitleMatchRanges(
  query: FoldedText,
  subtitle: FoldedText,
): readonly MatchRange[] {
  const at = indexOfFolded(subtitle.folded, query.folded);
  if (at === -1) {
    return [];
  }
  return mergeRanges(
    Array.from({ length: query.folded.length }, (_, i) => at + i),
  );
}

type Scored = {
  readonly result: TaggedResult;
  readonly tier: number;
  readonly strength: number;
  readonly titleMatches: readonly MatchRange[];
  readonly subtitleMatches: readonly MatchRange[];
  readonly foldedTitle: string;
};

/** Rank validated results against the query. Deterministic, stable ordering. */
export function rankResults(
  query: string,
  results: readonly TaggedResult[],
): RankedSearchResult[] {
  const foldedQuery = foldText(query);

  const scored: Scored[] = results.map((result) => {
    const foldedTitle = foldText(result.title);
    const signal = titleSignal(foldedQuery, foldedTitle);
    const subtitleMatches =
      result.subtitle === undefined
        ? []
        : subtitleMatchRanges(foldedQuery, foldText(result.subtitle));

    // A subtitle-only match lifts a tier-0 result to tier 1.
    const tier =
      signal.tier === 0 && subtitleMatches.length > 0 ? 1 : signal.tier;

    return {
      result,
      tier,
      strength: signal.strength,
      titleMatches: signal.titleMatches,
      subtitleMatches,
      foldedTitle: foldCase(result.title),
    };
  });

  scored.sort((a, b) => {
    if (a.tier !== b.tier) {
      return b.tier - a.tier;
    }
    if (a.strength !== b.strength) {
      return b.strength - a.strength;
    }
    const aScore = a.result.providerScore ?? 0;
    const bScore = b.result.providerScore ?? 0;
    if (aScore !== bScore) {
      return bScore - aScore;
    }
    if (a.foldedTitle !== b.foldedTitle) {
      return a.foldedTitle < b.foldedTitle ? -1 : 1;
    }
    const aId = resultIdentity(a.result);
    const bId = resultIdentity(b.result);
    return aId < bId ? -1 : aId > bId ? 1 : 0;
  });

  return scored.map((entry) => ({
    id: resultIdentity(entry.result),
    providerId: entry.result.providerId,
    moduleId: entry.result.moduleId,
    title: entry.result.title,
    ...(entry.result.subtitle === undefined
      ? {}
      : { subtitle: entry.result.subtitle }),
    ...(entry.result.entityType === undefined
      ? {}
      : { entityType: entry.result.entityType }),
    target: entry.result.target,
    score: entry.tier / 5,
    titleMatches: entry.titleMatches,
    subtitleMatches: entry.subtitleMatches,
  }));
}
