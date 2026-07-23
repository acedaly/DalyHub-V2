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
