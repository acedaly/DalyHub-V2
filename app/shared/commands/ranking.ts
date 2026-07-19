/**
 * DS-09 Command Palette — deterministic command ranking (pure, React-free).
 *
 * Ranks palette commands (registered + contextual) against a query. It REUSES
 * DS-08's query normalisation and fuzzy-matching primitives (`foldText`,
 * `fuzzyMatch`) rather than shipping a second matcher (ADR-024 §24.10) — but the
 * TIER STRUCTURE is command-specific and does not copy DS-08's result ranker.
 *
 * Priority (strongest first): exact title, title prefix, word-boundary token
 * prefix, keyword match, fuzzy title, subtitle match. Within a tier, the context
 * boost (a current-surface command ranks a little higher) breaks ties, then the
 * folded title, then the stable id — so ranking is fully deterministic and no
 * arbitrary module score can dominate.
 */

import {
  foldCase,
  foldText,
  fuzzyMatch,
  normaliseQuery,
} from "~/shared/search/model";
import type { MatchRange } from "~/shared/search/model";

import { contextBoost, type PaletteContext } from "./context";
import { EMPTY_PALETTE_CONTEXT } from "./context";
import type { PaletteCommand, RankedCommand } from "./types";

/** Match tiers, strongest first. 0 means "no local match". */
export const TIER_EXACT_TITLE = 6;
export const TIER_TITLE_PREFIX = 5;
export const TIER_TOKEN_PREFIX = 4;
export const TIER_KEYWORD = 3;
export const TIER_FUZZY_TITLE = 2;
export const TIER_SUBTITLE = 1;
export const TIER_NONE = 0;

/** Word-boundary separators — the token starts a new word after any of these. */
const TOKEN_SEPARATOR = /[\s\-_/.:,;()[\]{}"'|]/u;

/** True when any word-boundary token of `text` starts with `query` (folded). */
function hasTokenPrefix(foldedText: string, foldedQuery: string): boolean {
  if (foldedText.startsWith(foldedQuery)) {
    return true;
  }
  for (let i = 1; i < foldedText.length; i += 1) {
    if (
      TOKEN_SEPARATOR.test(foldedText[i - 1]) &&
      !TOKEN_SEPARATOR.test(foldedText[i]) &&
      foldedText.startsWith(foldedQuery, i)
    ) {
      return true;
    }
  }
  return false;
}

/** True when any keyword exactly equals or is prefixed by the folded query. */
function matchesKeyword(
  keywords: readonly string[],
  foldedQuery: string,
): boolean {
  return keywords.some((keyword) => {
    const folded = foldCase(keyword);
    return folded === foldedQuery || folded.startsWith(foldedQuery);
  });
}

/**
 * Score one command against a normalised query. Returns the tier and the title
 * highlight ranges (empty when the title itself did not match, e.g. a keyword- or
 * subtitle-only match). A non-matching command scores {@link TIER_NONE}.
 */
export function scoreCommand(
  command: PaletteCommand,
  normalisedQuery: string,
): { readonly tier: number; readonly titleMatches: readonly MatchRange[] } {
  const foldedQuery = foldCase(normalisedQuery);
  if (foldedQuery.length === 0) {
    return { tier: TIER_NONE, titleMatches: [] };
  }
  const foldedTitle = foldCase(command.title);

  // Title highlight ranges (used for every title-based tier). A prefix/exact
  // match is a subsequence, so `fuzzyMatch` yields a contiguous leading range.
  const fuzzy = fuzzyMatch(foldText(normalisedQuery), foldText(command.title));
  const titleMatches = fuzzy?.ranges ?? [];

  if (foldedTitle === foldedQuery) {
    return { tier: TIER_EXACT_TITLE, titleMatches };
  }
  if (foldedTitle.startsWith(foldedQuery)) {
    return { tier: TIER_TITLE_PREFIX, titleMatches };
  }
  if (hasTokenPrefix(foldedTitle, foldedQuery)) {
    return { tier: TIER_TOKEN_PREFIX, titleMatches };
  }
  if (matchesKeyword(command.keywords, foldedQuery)) {
    return { tier: TIER_KEYWORD, titleMatches };
  }
  if (fuzzy !== null) {
    return { tier: TIER_FUZZY_TITLE, titleMatches };
  }
  if (
    command.subtitle !== undefined &&
    foldCase(command.subtitle).includes(foldedQuery)
  ) {
    return { tier: TIER_SUBTITLE, titleMatches: [] };
  }
  return { tier: TIER_NONE, titleMatches: [] };
}

/**
 * Rank commands against a query. With a non-empty query, only matching commands
 * (tier > 0) are returned, ordered by tier, then context relevance, then folded
 * title, then id. With an EMPTY query, every command is returned (tier 0) ordered
 * by context relevance then title — the caller decides which to surface as
 * suggestions. Deterministic and stable for identical inputs.
 */
export function rankCommands(
  query: string,
  commands: readonly PaletteCommand[],
  context: PaletteContext = EMPTY_PALETTE_CONTEXT,
): RankedCommand[] {
  const normalised = normaliseQuery(query);
  const hasQuery = normalised.length > 0;

  const ranked: RankedCommand[] = [];
  for (const command of commands) {
    const { tier, titleMatches } = scoreCommand(command, normalised);
    if (hasQuery && tier === TIER_NONE) {
      continue;
    }
    ranked.push({ command, tier, titleMatches });
  }

  ranked.sort((a, b) => {
    if (a.tier !== b.tier) {
      return b.tier - a.tier;
    }
    const boostA = contextBoost(a.command, context);
    const boostB = contextBoost(b.command, context);
    if (boostA !== boostB) {
      return boostB - boostA;
    }
    const titleA = foldCase(a.command.title);
    const titleB = foldCase(b.command.title);
    if (titleA !== titleB) {
      return titleA < titleB ? -1 : 1;
    }
    return a.command.id < b.command.id
      ? -1
      : a.command.id > b.command.id
        ? 1
        : 0;
  });

  return ranked;
}
