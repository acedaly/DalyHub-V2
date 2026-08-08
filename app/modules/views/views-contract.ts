/**
 * X-02 — the serialisable contract between the `/views` loader and its surface.
 *
 * Dates cross as ISO strings and every derived label is resolved server-side, so
 * the client renders what the server decided rather than re-deriving anything.
 */

import type {
  CrossViewResultDetail,
  UnavailableViewScope,
  ViewScope,
} from "~/kernel/views";

/** One rendered result row. */
export interface ViewResultItem {
  readonly scope: ViewScope;
  readonly entityType: ViewScope;
  readonly id: string;
  readonly title: string;
  readonly updatedAtIso: string;
  readonly areaTitle: string | null;
  readonly projectTitle: string | null;
  readonly goalTitle: string | null;
  readonly archived: boolean;
  /** The module's own supporting words for this record — never a score. */
  readonly statusLabel: string | null;
  /** A dated fact, already phrased ("Due 12 Aug", "Week to 10 Aug"). */
  readonly dateLabel: string | null;
  readonly detail: CrossViewResultDetail;
}

/** One banded group of results (`groupBy: "entity"`), or the single flat band. */
export interface ViewResultGroup {
  readonly id: string;
  readonly label: string;
  readonly entityType: ViewScope | null;
  readonly items: readonly ViewResultItem[];
}

/** One selectable view in the switcher. */
export interface ViewsViewOption {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly kind: "system" | "user";
  readonly query: string;
}

/** One scope toggle in the "Show" selector. */
export interface ViewScopeOption {
  readonly scope: ViewScope;
  readonly label: string;
  readonly selected: boolean;
  /** The query string that toggles this scope. */
  readonly query: string;
  /** True when the owner has hidden this scope's module. */
  readonly hidden: boolean;
}

export interface ViewsPageData {
  readonly title: string;
  readonly groups: readonly ViewResultGroup[];
  readonly total: number;
  readonly bounded: boolean;
  readonly unavailable: readonly UnavailableViewScope[];
  readonly scopeOptions: readonly ViewScopeOption[];
  readonly views: readonly ViewsViewOption[];
  readonly activeViewId: string | null;
  readonly modified: boolean;
  readonly filterCount: number;
  /** The canonical query string of what is applied (what a save would store). */
  readonly currentQuery: string;
  readonly shareUrl: string;
  /** REVIEW-03: the boundary a "changed since last Review" filter resolved to. */
  readonly changeBoundary: {
    readonly periodEnd: string;
    readonly reviewId: string;
  } | null;
  /**
   * True when the view asked for "changed since my last Review" and no completed
   * Review has an insight snapshot yet. The surface says so rather than widening.
   */
  readonly awaitingFirstReview: boolean;
}

/** What the `/views/saved` resource route replies with. */
export interface ViewsSavedResult {
  readonly kind: "view";
  readonly ok: boolean;
  readonly viewId?: string | null;
  readonly message?: string;
  readonly formError?: string;
}
