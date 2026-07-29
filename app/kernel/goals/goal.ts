/**
 * AREA-02 Goals kernel — storage-independent read-projection types.
 *
 * Goals remain ordinary spine records (identity, title, completion and Area
 * parentage stay `SpineRepository` authority — FND-07 / ADR-014). This contract
 * adds no identity table; it reads live Goal-record facts — the resolved Area,
 * and the EXACT contribution of every active Project structurally advancing the
 * Goal (`project.advances_goal`) — in bounded, workspace-scoped queries. It never
 * copies Area/Project titles, hierarchy or roll-up state into another table.
 */

import type { ProjectWorkflowStatus } from "~/kernel/project-settings";
import type { WorkspaceId } from "~/kernel/workspaces";

/** The Goal's resolved parent Area (current title, never copied). */
export type GoalAreaContext = {
  readonly id: string;
  readonly title: string;
};

/** The canonical Goal record header, resolved from the spine + its Area link. */
export type GoalOverview = {
  readonly id: string;
  readonly workspaceId: WorkspaceId;
  readonly title: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly completedAt: Date | null;
  readonly area: GoalAreaContext;
};

/**
 * One Project structurally advancing a Goal (`project.advances_goal`), as read
 * for the EXACT contribution boundary. Deliberately lighter than the display
 * item below — only what the pure evaluator needs to classify it.
 */
export type GoalProjectFact = {
  readonly id: string;
  readonly status: ProjectWorkflowStatus;
  readonly completedAt: Date | null;
  readonly archivedAt: Date | null;
};

/**
 * The EXACT, complete contribution boundary for a Goal: every non-deleted
 * Project with an active `project.advances_goal` link to it, independent of any
 * displayed card page. `total`/`completed` mirror the spine's own
 * `GoalRollup.projects` definition exactly (a Project counts as completed
 * regardless of its archived state); the workflow buckets follow the SAME
 * Archived-over-Completed precedence AREA-01's momentum evaluator uses, so an
 * archived-and-completed Project is counted once, under `archived`.
 */
export type GoalProjectContribution = {
  readonly total: number;
  readonly completed: number;
  readonly incomplete: number;
  readonly active: number;
  readonly planned: number;
  readonly onHold: number;
  readonly archived: number;
};

/** One Project advancing a Goal, for the bounded DISPLAYED card page. */
export type GoalProjectItem = {
  readonly id: string;
  readonly title: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly completedAt: Date | null;
  readonly status: ProjectWorkflowStatus;
  readonly archivedAt: Date | null;
  readonly taskTotal: number;
  readonly taskCompleted: number;
};

export type GoalChildrenInput = {
  readonly goalId: string;
  readonly limit?: number;
  readonly cursor?: string;
};

export type GoalProjectPage = {
  readonly items: readonly GoalProjectItem[];
  readonly nextCursor: string | null;
};

/**
 * One Goal on the workspace-wide list (AREA-03, ADR-040 §40.7) — the
 * identity/completion/Area-context fields the Alignment collection needs to
 * render a card. Deliberately lighter than `GoalOverview`; alignment itself
 * (state/reasons) is a SEPARATE evaluation composed by the route, never
 * stored on this shape.
 */
export type GoalListItem = {
  readonly id: string;
  readonly title: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly completedAt: Date | null;
  readonly area: GoalAreaContext;
};

export type GoalListInput = {
  readonly limit?: number;
  readonly cursor?: string;
};

export type GoalSearchInput = {
  readonly text: string;
  readonly limit?: number;
};

export type GoalListPage = {
  readonly items: readonly GoalListItem[];
  readonly nextCursor: string | null;
};

export type GoalSearchHit = {
  readonly id: string;
  readonly title: string;
  readonly completedAt: Date | null;
  readonly area: GoalAreaContext;
  readonly targetDate: string | null;
  readonly contribution: GoalProjectContribution;
};

/**
 * Input for the WORKSPACE-WIDE, Alignment-ordered Goal list (DEBT-23). Unlike
 * {@link GoalListInput}, it carries the owner-calendar-derived recent-window lower
 * bound so the repository's SQL ranking splits `active`/`neglected` using the SAME
 * window constant/fact the pure evaluator's alignment-facts read uses.
 */
export type GoalAlignmentListInput = {
  readonly limit?: number;
  readonly cursor?: string;
  /**
   * The EXACT owner-calendar active/neglected boundary instant (from
   * `createOwnerAlignmentContext().recentBoundaryStartIso`). A qualifying
   * contribution at/after this instant ranks the Goal `active`, else `neglected` —
   * the SAME owner-calendar boundary `evaluateGoalAlignment` uses, so the SQL rank
   * agrees with the evaluator for every instant (not just clearly-separated ones).
   * The cursor is bound to this value, so a page reusing a cursor from a different
   * window is rejected.
   */
  readonly activeBoundaryIso: string;
};

/**
 * One page of Goals ordered by the deterministic workspace-wide Alignment
 * precedence (`GOAL_ALIGNMENT_DISPLAY_RANK`), established BEFORE pagination
 * (DEBT-23). Items carry the same display fields as {@link GoalListItem}; the
 * cursor is the dedicated alignment-ordered cursor (rank + `(createdAt, id)`).
 */
export type GoalAlignmentListPage = {
  readonly items: readonly GoalListItem[];
  readonly nextCursor: string | null;
};
