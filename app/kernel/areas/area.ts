/**
 * AREA-01 Areas kernel — storage-independent read-projection types.
 *
 * Areas remain ordinary spine records. This contract adds no identity table and
 * owns no mutations; it reads live hierarchy facts needed by the Areas collection
 * and Area record in bounded, workspace-scoped queries. Creation, rename,
 * completion rules and structural parentage stay with `SpineRepository`.
 */

import type { ProjectWorkflowStatus } from "~/kernel/project-settings";
import type { AreaRollup } from "~/kernel/spine";
import type { WorkspaceId } from "~/kernel/workspaces";

export type AreaListInput = {
  readonly limit?: number;
  readonly cursor?: string;
};

export type AreaChildrenInput = {
  readonly areaId: string;
  readonly limit?: number;
  readonly cursor?: string;
};

export type AreaListItem = {
  readonly id: string;
  readonly workspaceId: WorkspaceId;
  readonly title: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly rollup: AreaRollup;
  readonly activeProjectCount: number;
  readonly completedProjectCount: number;
};

export type AreaOverview = {
  readonly id: string;
  readonly workspaceId: WorkspaceId;
  readonly title: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type AreaGoalItem = {
  readonly id: string;
  readonly title: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly completedAt: Date | null;
  readonly projectTotal: number;
  readonly projectCompleted: number;
  readonly taskTotal: number;
  readonly taskCompleted: number;
  /**
   * AREA-02: the Goal-owned target date (`YYYY-MM-DD`), read through a batched
   * `LEFT JOIN` against `goal_details` in the SAME query as every other Goal
   * card fact — never a per-Goal follow-up read. `null` when unset. Momentum
   * (AREA-01) never depends on this field.
   */
  readonly targetDate: string | null;
};

export type AreaProjectParentContext =
  | { readonly kind: "area" }
  | {
      readonly kind: "goal";
      readonly goal: {
        readonly id: string;
        readonly title: string;
      };
    };

export type AreaProjectItem = {
  readonly id: string;
  readonly title: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly completedAt: Date | null;
  readonly status: ProjectWorkflowStatus;
  readonly archivedAt: Date | null;
  readonly parent: AreaProjectParentContext;
  readonly taskTotal: number;
  readonly taskCompleted: number;
};

/**
 * One Project aligned to an Area (direct or Goal-backed) for the COMPLETE momentum
 * boundary — deliberately lighter than `AreaProjectItem` (no title, no task counts):
 * it exists only to classify every aligned Project by workflow bucket and to seed
 * the bounded batch Project-health read. `createdAt`/`updatedAt` mirror the same
 * "effective" definition `listAreaProjects` uses, so a defensive facts fallback can
 * be built consistently if a Project health read ever comes back short.
 */
export type AreaAlignedProjectFact = {
  readonly id: string;
  readonly status: ProjectWorkflowStatus;
  readonly completedAt: Date | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

/** Authoritative counts for Tasks parented DIRECTLY to the Area — never inferred
 * from the combined Area task roll-up, which also includes Project Tasks. */
export type AreaDirectTaskFacts = {
  readonly unfinishedTotal: number;
  readonly completedTotal: number;
};

/**
 * The COMPLETE Area momentum-facts boundary: every Project aligned to the Area
 * (direct or Goal-backed) regardless of the bounded card page, plus authoritative
 * direct Area Task counts. Read in a fixed, small number of workspace-scoped
 * aggregate queries — never one query per Project.
 */
export type AreaMomentumSourceFacts = {
  readonly directTasks: AreaDirectTaskFacts;
  readonly projects: readonly AreaAlignedProjectFact[];
};

export type AreaListPage = {
  readonly items: readonly AreaListItem[];
  readonly nextCursor: string | null;
};

export type AreaGoalPage = {
  readonly items: readonly AreaGoalItem[];
  readonly nextCursor: string | null;
};

export type AreaProjectPage = {
  readonly items: readonly AreaProjectItem[];
  readonly nextCursor: string | null;
};
