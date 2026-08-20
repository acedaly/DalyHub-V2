/**
 * X-02 — the cross-module query contract (storage-independent).
 *
 * A workspace-BOUND read projection. Like `ProjectHealthRepository` and
 * `AlignmentRepository`, no method takes a `workspaceId`: scope is fixed at
 * construction (ADR-010), so a saved-view id or a stored filter value can never be
 * used to read another workspace's records. It performs NO mutations and caches
 * nothing — a saved view describes a query, and re-opening it re-runs that query.
 *
 * Execution is deliberately several small BOUNDED queries (one per included scope)
 * rather than one enormous UNION: each scope's predicate set is different, each
 * already has its own indexes, and merging a handful of capped, deterministically
 * ordered lists in memory is both cheaper to reason about and cheaper to test than
 * a query whose plan depends on which filters happened to be applied.
 */

import type { CrossViewConfig } from "./view-config";
import type { CrossViewPage } from "./view-result";
import type { ViewScope } from "./view-scopes";

/**
 * How many candidate rows ONE scope contributes before the merge. The page the
 * owner sees is `CROSS_VIEW_PAGE_LIMIT`; this larger cap exists so that a scope
 * whose derived dimensions (Project health, Goal alignment) can only be evaluated
 * after the rows are read still has enough candidates to answer honestly. Reaching
 * it sets `bounded` on the page.
 */
export const CROSS_VIEW_SCOPE_CANDIDATE_LIMIT = 120;

/** How many merged results one page holds. */
export const CROSS_VIEW_PAGE_LIMIT = 60;

/**
 * Everything the query needs that is NOT part of the stored configuration: the
 * owner's calendar day and week, and which scopes they are allowed to see.
 *
 * `todayIso` and `weekStartIso`/`weekEndIso` are computed by the CALLER from the
 * owner's stored timezone and first-day-of-week preference (`~/shared/datetime`,
 * `~/kernel/preferences`). X-02 therefore introduces no second definition of
 * "today" and no timezone logic inside SQL (ROADMAP X-02 §22).
 */
export interface CrossViewQueryContext {
  /** The request instant. */
  readonly now: Date;
  /** The owner's calendar date, `YYYY-MM-DD`. */
  readonly todayIso: string;
  /** The owner's current wall-calendar week, inclusive, `YYYY-MM-DD`. */
  readonly weekStartIso: string;
  readonly weekEndIso: string;
  /**
   * The owner-calendar date of an instant. Supplied by the caller from the SAME
   * `~/shared/datetime` helpers PROJ-02 and AREA-03 already use, so the derived
   * dimensions this query post-filters on are evaluated exactly as those features
   * evaluate them — never by a second implementation.
   */
  readonly calendarIsoOf: (instant: Date) => string;
  /**
   * HARDEN-06C (F-05) — the inverse of {@link calendarIsoOf}: the UTC instant at
   * which an owner-calendar day BEGINS, supplied by the caller from the same
   * `~/shared/datetime` helpers (`ownerDayStartInstant`).
   *
   * The `Created within` / `Updated within` windows used to bind
   * `${windowStartDay}T00:00:00.000Z` — an owner-calendar day compared against a
   * UTC instant. For the default Sydney owner that silently dropped the first
   * ten or eleven hours of the window's first day; west of Greenwich it
   * silently included several hours of the day before. This is the conversion
   * that was missing, and it is supplied here rather than computed in the
   * adapter so X-02's rule holds unchanged: no second definition of "today",
   * and no timezone logic inside SQL.
   */
  readonly dayStartInstantOf: (dayIso: string) => Date;
  /** AREA-03's supporting recent-count lower bound (`createOwnerAlignmentContext`). */
  readonly alignmentRecentWindowStartIso: string;
  /** The scopes this owner may see, after module visibility is applied. */
  readonly availableScopes: readonly ViewScope[];
}

export interface CrossViewQueryRepository {
  /**
   * Run a validated cross-module configuration and return one bounded, merged,
   * deterministically ordered page. Never throws for an empty or fully-excluded
   * configuration: an empty page with its `unavailable` scopes stated is the
   * correct answer, not an error.
   */
  runCrossView(
    config: CrossViewConfig,
    context: CrossViewQueryContext,
  ): Promise<CrossViewPage>;
}
