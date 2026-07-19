/**
 * DS-08 Shared Search — the pure model types.
 *
 * These describe the *display-ready* shape the browser renders: results after
 * validation, ranking, deduplication and grouping. They are distinct from the
 * FND-06 provider contract (`SearchResultItem`, `SearchResultTarget`) a module
 * authors against — the model consumes the provider contract and produces these.
 *
 * React-free: this file imports only type-level kernel contracts (erased at build
 * time), so it is safe in the model, the Worker and the browser.
 */

import type { EntityType } from "~/kernel/entities";
import type { SearchResultTarget } from "~/kernel/modules";

export type { EntityType } from "~/kernel/entities";
export type { SearchResultItem, SearchResultTarget } from "~/kernel/modules";

/**
 * A half-open range of matched characters `[start, end)` over a title or subtitle,
 * used to render `<mark>` highlighting from plain text segments (never raw HTML).
 */
export type MatchRange = {
  readonly start: number;
  readonly end: number;
};

/** A validated provider result, tagged with its owning provider/module. */
export type TaggedResult = {
  /** Provider-local result id (already validated + bounded). */
  readonly itemId: string;
  /** The registered provider's namespaced id (e.g. `today.search`). */
  readonly providerId: string;
  /** The owning module's id (e.g. `today`). */
  readonly moduleId: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly entityType?: EntityType;
  readonly target: SearchResultTarget;
  /** Optional provider relevance already clamped to `[0, 1]`, or undefined. */
  readonly providerScore?: number;
};

/** A result after ranking — carries a normalised score and match ranges. */
export type RankedSearchResult = {
  /**
   * Stable global identity: `${moduleId}::${providerId}::${itemId}`. The
   * provider-local `itemId` is unique only within its provider, so the provider is
   * part of the identity (two providers in one module may share an `itemId`).
   */
  readonly id: string;
  readonly providerId: string;
  readonly moduleId: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly entityType?: EntityType;
  readonly target: SearchResultTarget;
  /** Normalised relevance in `[0, 1]` — informational; ordering is deterministic. */
  readonly score: number;
  /** Matched ranges within the title (may be empty). */
  readonly titleMatches: readonly MatchRange[];
  /** Matched ranges within the subtitle (may be empty). */
  readonly subtitleMatches: readonly MatchRange[];
};

export type SearchGroupKind = "entity" | "module";

/**
 * A group of results. Results with an entity type group by entity type (`kind:
 * "entity"`); results without one fall back to grouping by their owning module
 * (`kind: "module"`). Groups appear in first-seen order over the ranked list, so
 * ordering is deterministic and relevance-led without a hard-coded entity switch.
 */
export type SearchResultGroup = {
  /** `entity:<type>` or `module:<id>`. */
  readonly id: string;
  readonly kind: SearchGroupKind;
  /**
   * A safe default label: the entity-type slug for entity groups, the module
   * label for module groups. The UI upgrades entity labels via the entity
   * identity system; the model stays React-free.
   */
  readonly label: string;
  readonly entityType?: EntityType;
  readonly moduleId?: string;
  readonly results: readonly RankedSearchResult[];
};

/** The health of a single provider in one search run — no error detail leaks. */
export type SearchProviderStatus = {
  readonly providerId: string;
  readonly moduleId: string;
  readonly ok: boolean;
};

/**
 * `ok` — every executed provider succeeded.
 * `partial` — at least one provider failed but at least one succeeded.
 * `error` — every executed provider failed (a safe, retryable failure state).
 */
export type SearchOutcomeStatus = "ok" | "partial" | "error";

/** The complete, bounded, display-ready result of one search run. */
export type SearchOutcome = {
  /** The normalised query the results correspond to. */
  readonly query: string;
  readonly status: SearchOutcomeStatus;
  readonly groups: readonly SearchResultGroup[];
  /** Total results across all groups (after limits). */
  readonly totalCount: number;
  /** True when the total-results limit dropped some ranked results. */
  readonly truncated: boolean;
  readonly providers: readonly SearchProviderStatus[];
};
