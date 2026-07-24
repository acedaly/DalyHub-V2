/**
 * FND-02/FND-03 Data kernel — D1 storage adapter public surface.
 *
 * Construct persistence-backed repositories from here. Returned values are typed
 * as the kernel's contracts (`EntityRepository`, `WorkspaceRepository`), so
 * callers depend on the contract, not on D1.
 *
 * The entity repository is WORKSPACE-BOUND: its factory requires a
 * `WorkspaceContext`, so this barrel exposes no unscoped, convenient
 * entity-store construction path (FND-03 / ADR-010). The `WorkspaceRepository`
 * is a low-level platform/bootstrap store (creating and verifying workspace
 * records), deliberately named as such and not a module-facing contract.
 */

import type { ActivityRepository } from "~/kernel/activity";
import type { AreaRepository } from "~/kernel/areas";
import type { EntityRepository } from "~/kernel/entities";
import type { EntityLinkRepository } from "~/kernel/entity-links";
import type { GoalDetailsRepository, GoalRepository } from "~/kernel/goals";
import type { ProjectHealthRepository } from "~/kernel/project-health";
import type { ProjectRepository } from "~/kernel/projects";
import type { ProjectSettingsRepository } from "~/kernel/project-settings";
import type { SpineRepository } from "~/kernel/spine";
import type { TaskRepository } from "~/kernel/tasks";
import type {
  WorkspaceContext,
  WorkspaceRepository,
} from "~/kernel/workspaces";

import { D1ActivityRepository } from "./d1-activity-repository";
import { D1AreaRepository } from "./d1-area-repository";
import {
  D1EntityRepository,
  type D1EntityRepositoryOptions,
} from "./d1-entity-repository";
import {
  D1EntityLinkRepository,
  type D1EntityLinkRepositoryOptions,
} from "./d1-entity-link-repository";
import {
  D1GoalDetailsRepository,
  type D1GoalDetailsRepositoryOptions,
} from "./d1-goal-details-repository";
import { D1GoalRepository } from "./d1-goal-repository";
import { D1ProjectHealthRepository } from "./d1-project-health-repository";
import { D1ProjectRepository } from "./d1-project-repository";
import {
  D1ProjectSettingsRepository,
  type D1ProjectSettingsRepositoryOptions,
} from "./d1-project-settings-repository";
import {
  D1SpineRepository,
  type D1SpineRepositoryOptions,
} from "./d1-spine-repository";
import {
  D1TaskRepository,
  type CompleteTaskFault,
  type D1TaskRepositoryOptions,
} from "./d1-task-repository";
import {
  D1WorkspaceRepository,
  type D1WorkspaceRepositoryOptions,
} from "./d1-workspace-repository";

export { D1EntityRepository, type D1EntityRepositoryOptions };
export { D1EntityLinkRepository, type D1EntityLinkRepositoryOptions };
export {
  D1SpineRepository,
  type D1SpineRepositoryOptions,
  type SpineCreateFault,
} from "./d1-spine-repository";
export {
  D1TaskRepository,
  type D1TaskRepositoryOptions,
  type CompleteTaskFault,
};
export { D1ActivityRepository };
export { D1AreaRepository };
export { D1GoalRepository };
export {
  D1GoalDetailsRepository,
  type D1GoalDetailsRepositoryOptions,
} from "./d1-goal-details-repository";
export { D1ProjectRepository };
export { D1ProjectHealthRepository };
export { D1WorkspaceRepository, type D1WorkspaceRepositoryOptions };
export { D1ActivityRecorder } from "./d1-activity-recorder";
export {
  recordAtomicMutation,
  type AtomicMutationFault,
  type AtomicMutationResult,
} from "./d1-atomic-mutation";
export type { EntityRow } from "./database";
export type { EntityLinkRow } from "./entity-link-database";
export type { SpineStateRow, SpineJoinedRow } from "./spine-database";
export type { ActivityRow, ActivitySubjectRow } from "./activity-database";
export type { WorkspaceRow } from "./workspace-database";

/**
 * Factory for a workspace-scoped D1-backed entity repository. The returned
 * repository operates only within `context`'s workspace; there is no way to
 * construct one without a context. Prefer this over `new` at call sites so the
 * concrete adapter type stays an implementation detail.
 */
export function createEntityRepository(
  db: D1Database,
  context: WorkspaceContext,
  options?: D1EntityRepositoryOptions,
): EntityRepository {
  return new D1EntityRepository(db, context, options);
}

/**
 * Factory for a workspace-scoped D1-backed EntityLink repository. Like the entity
 * repository, the returned link repository operates only within `context`'s
 * workspace; there is no way to construct one without a context (FND-04 /
 * ADR-011). Both endpoints of every link are constrained to the bound workspace.
 */
export function createEntityLinkRepository(
  db: D1Database,
  context: WorkspaceContext,
  options?: D1EntityLinkRepositoryOptions,
): EntityLinkRepository {
  return new D1EntityLinkRepository(db, context, options);
}

/**
 * Factory for the workspace-scoped D1-backed SpineRepository — the authoritative
 * Area → Goal → Project → Task domain repository (FND-07 / ADR-014). Like the
 * other mutation repositories it is bound to a `WorkspaceContext` and a trusted
 * Activity actor; there is no way to construct one without a context.
 */
export function createSpineRepository(
  db: D1Database,
  context: WorkspaceContext,
  options?: D1SpineRepositoryOptions,
): SpineRepository {
  return new D1SpineRepository(db, context, options);
}

/**
 * Factory for the workspace-scoped D1-backed TaskRepository — the TODAY-02
 * task-detail repository (ADR-028). It COMPOSES the spine (title, completion and
 * parentage stay the SpineRepository's authority) and owns the additive
 * `task_details` fields. Like the other mutation repositories it is bound to a
 * `WorkspaceContext` and a trusted Activity actor; there is no way to construct one
 * without a context.
 */
export function createTaskRepository(
  db: D1Database,
  context: WorkspaceContext,
  options?: D1TaskRepositoryOptions,
): TaskRepository {
  return new D1TaskRepository(db, context, options);
}

/**
 * Factory for the workspace-scoped, READ-ONLY D1-backed ProjectRepository — the
 * PROJ-01 project read projection (ADR-034). It performs no mutations (project
 * create/rename/complete/reopen stay the SpineRepository's) and resolves each
 * project's Area/Goal context and active direct-task counts in bounded, N+1-free
 * queries. Bound to a `WorkspaceContext`; there is no unscoped construction path.
 */
export function createProjectRepository(
  db: D1Database,
  context: WorkspaceContext,
): ProjectRepository {
  return new D1ProjectRepository(db, context);
}

/**
 * Factory for the workspace-scoped, READ-ONLY D1-backed AreaRepository — the
 * AREA-01 read projection. It performs no mutations and resolves live hierarchy
 * counts in bounded, parameterised queries. Bound to a `WorkspaceContext`; there
 * is no unscoped construction path.
 */
export function createAreaRepository(
  db: D1Database,
  context: WorkspaceContext,
): AreaRepository {
  return new D1AreaRepository(db, context);
}

/**
 * Factory for the workspace-scoped, READ-ONLY D1-backed GoalRepository — the
 * AREA-02 Goal read projection. It performs no mutations and resolves live
 * Goal-record facts (the resolved Area, exact Project contribution) in bounded,
 * parameterised queries. Bound to a `WorkspaceContext`; there is no unscoped
 * construction path.
 */
export function createGoalRepository(
  db: D1Database,
  context: WorkspaceContext,
): GoalRepository {
  return new D1GoalRepository(db, context);
}

/**
 * Factory for the workspace-scoped D1-backed GoalDetailsRepository — the
 * AREA-02 Goal-owned detail slice (target date, definition of done). Like the
 * other mutation repositories it is bound to a `WorkspaceContext` and a trusted
 * Activity actor; there is no way to construct one without a context.
 */
export function createGoalDetailsRepository(
  db: D1Database,
  context: WorkspaceContext,
  options?: D1GoalDetailsRepositoryOptions,
): GoalDetailsRepository {
  return new D1GoalDetailsRepository(db, context, options);
}

/**
 * Factory for the workspace-scoped, READ-ONLY D1-backed ProjectHealthRepository —
 * the PROJ-02 derived project-health facts projection (ADR-035). It performs no
 * mutations and caches nothing: health is recomputed from live spine, task-detail
 * and Activity data, gathered for a whole bounded page in a fixed number of grouped
 * queries (no N+1). Bound to a `WorkspaceContext`; there is no unscoped construction
 * path.
 */
export function createProjectHealthRepository(
  db: D1Database,
  context: WorkspaceContext,
): ProjectHealthRepository {
  return new D1ProjectHealthRepository(db, context);
}

/**
 * Factory for a workspace-scoped, READ-ONLY D1-backed Activity repository. The
 * returned repository operates only within `context`'s workspace; there is no way
 * to construct one without a context (FND-05 / ADR-012). It exposes reads only —
 * Activity is appended solely as the atomic side effect of a domain mutation, by
 * the entity and EntityLink repositories.
 */
export function createActivityRepository(
  db: D1Database,
  context: WorkspaceContext,
): ActivityRepository {
  return new D1ActivityRepository(db, context);
}

/**
 * Factory for the low-level D1-backed workspace repository. This is a
 * platform/bootstrap concern used by the composition boundary to establish a
 * `WorkspaceContext`; it is not handed to modules.
 */
export function createWorkspaceRepository(
  db: D1Database,
  options?: D1WorkspaceRepositoryOptions,
): WorkspaceRepository {
  return new D1WorkspaceRepository(db, options);
}

export {
  D1ProjectSettingsRepository,
  type D1ProjectSettingsRepositoryOptions,
} from "./d1-project-settings-repository";

export function createProjectSettingsRepository(
  db: D1Database,
  context: WorkspaceContext,
  options?: D1ProjectSettingsRepositoryOptions,
): ProjectSettingsRepository {
  return new D1ProjectSettingsRepository(db, context, options);
}
