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
