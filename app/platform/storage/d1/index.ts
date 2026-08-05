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
import type { AlignmentRepository } from "~/kernel/alignment";
import type { AppPreferencesRepository } from "~/kernel/preferences";
import type { TaskViewRepository } from "~/kernel/task-views";
import type { AssetHistoryRepository, AssetRepository } from "~/kernel/assets";
import type { AreaRepository } from "~/kernel/areas";
import type { AreaSettingsRepository } from "~/kernel/area-settings";
import type { DiaryRepository } from "~/kernel/diary";
import type { EntityRepository } from "~/kernel/entities";
import type { EntityLinkRepository } from "~/kernel/entity-links";
import type {
  ActorDirectory,
  WorkspaceMemberRepository,
} from "~/kernel/identity";
import type { GoalDetailsRepository, GoalRepository } from "~/kernel/goals";
import type {
  NoteDetailsRepository,
  NoteQueryRepository,
} from "~/kernel/notes";
import type { PersonRepository } from "~/kernel/people";
import type { MeetingRepository } from "~/kernel/meetings";
import type { ProjectHealthRepository } from "~/kernel/project-health";
import type { ProjectRepository } from "~/kernel/projects";
import type { ProjectSettingsRepository } from "~/kernel/project-settings";
import type { RelationshipRepository } from "~/kernel/relationships";
import type { ReviewRepository } from "~/kernel/reviews";
import type { SpineRepository } from "~/kernel/spine";
import type { TaskRepository } from "~/kernel/tasks";
import type {
  WorkspaceContext,
  WorkspaceRepository,
} from "~/kernel/workspaces";

import { D1ActivityRepository } from "./d1-activity-repository";
import { D1AlignmentRepository } from "./d1-alignment-repository";
import {
  D1AppPreferencesRepository,
  type D1AppPreferencesRepositoryOptions,
} from "./d1-app-preferences-repository";
import { D1AreaRepository } from "./d1-area-repository";
import {
  D1TaskViewRepository,
  type D1TaskViewRepositoryOptions,
} from "./d1-task-view-repository";
import {
  D1AssetHistoryRepository,
  type D1AssetHistoryRepositoryOptions,
} from "./d1-asset-history-repository";
import {
  D1AssetRepository,
  type D1AssetRepositoryOptions,
} from "./d1-asset-repository";
import {
  D1DiaryRepository,
  type D1DiaryRepositoryOptions,
} from "./d1-diary-repository";
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
import {
  D1NoteDetailsRepository,
  type D1NoteDetailsRepositoryOptions,
} from "./d1-note-details-repository";
import { D1NoteRepository } from "./d1-note-repository";
import {
  D1PersonRepository,
  type D1PersonRepositoryOptions,
} from "./d1-person-repository";
import { D1MeetingRepository } from "./d1-meeting-repository";
import { D1ProjectHealthRepository } from "./d1-project-health-repository";
import { D1ProjectRepository } from "./d1-project-repository";
import {
  D1ProjectSettingsRepository,
  type D1ProjectSettingsRepositoryOptions,
} from "./d1-project-settings-repository";
import { D1RelationshipRepository } from "./d1-relationship-repository";
import {
  D1ReviewRepository,
  type D1ReviewRepositoryOptions,
} from "./d1-review-repository";
import {
  D1AreaSettingsRepository,
  type D1AreaSettingsRepositoryOptions,
} from "./d1-area-settings-repository";
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
  D1WorkspaceMemberRepository,
  type D1WorkspaceMemberRepositoryOptions,
} from "./d1-workspace-member-repository";
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
export { D1AlignmentRepository };
export { D1AppPreferencesRepository, type D1AppPreferencesRepositoryOptions };
export { D1AreaRepository };
export {
  D1AssetRepository,
  type D1AssetRepositoryOptions,
  type D1AssetCreateFault,
  type D1AssetDeleteFault,
} from "./d1-asset-repository";
export {
  D1AssetHistoryRepository,
  type D1AssetHistoryRepositoryOptions,
} from "./d1-asset-history-repository";
export { D1GoalRepository };
export {
  D1GoalDetailsRepository,
  type D1GoalDetailsRepositoryOptions,
} from "./d1-goal-details-repository";
export {
  D1NoteDetailsRepository,
  type D1NoteDetailsRepositoryOptions,
} from "./d1-note-details-repository";
export { D1NoteRepository };
export {
  D1DiaryRepository,
  type D1DiaryRepositoryOptions,
  type D1DiaryCreateFault,
} from "./d1-diary-repository";
export {
  D1PersonRepository,
  type D1PersonRepositoryOptions,
  type D1PersonCreateFault,
} from "./d1-person-repository";
export { D1MeetingRepository } from "./d1-meeting-repository";
export { D1ProjectRepository };
export { D1ProjectHealthRepository };
export { D1RelationshipRepository };
export { D1ReviewRepository, type D1ReviewRepositoryOptions };
export {
  type D1ReviewCreateFault,
  type D1ReviewDeleteFault,
} from "./d1-review-repository";
export { D1WorkspaceRepository, type D1WorkspaceRepositoryOptions };
export {
  D1WorkspaceMemberRepository,
  type D1WorkspaceMemberRepositoryOptions,
  DIRECTORY_LOOKUP_CHUNK,
} from "./d1-workspace-member-repository";
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
 * Factory for the workspace-scoped D1-backed NoteDetailsRepository — the
 * NOTES-01A Note-owned Markdown content slice. Like the other mutation
 * repositories it is bound to a `WorkspaceContext` and a trusted Activity
 * actor; there is no way to construct one without a context.
 */
export function createNoteDetailsRepository(
  db: D1Database,
  context: WorkspaceContext,
  options?: D1NoteDetailsRepositoryOptions,
): NoteDetailsRepository {
  return new D1NoteDetailsRepository(db, context, options);
}

/**
 * Factory for the workspace-scoped D1-backed NoteQueryRepository — the NOTES-03
 * READ-ONLY Notes projection (collection filtering/ordering, full-content
 * search, tag facets). It never mutates and never records Activity, so it takes
 * no actor, mirroring `createProjectRepository`.
 */
export function createNoteRepository(
  db: D1Database,
  context: WorkspaceContext,
): NoteQueryRepository {
  return new D1NoteRepository(db, context);
}

/**
 * Factory for the workspace-scoped D1-backed DiaryRepository — the DIARY-01A
 * authoritative Diary Entry repository (ADR-041). It CREATES `diary` entities
 * with their chronological detail slice atomically (the generic EntityRepository
 * refuses to create one), owns entry-detail edits and the Timeline read model,
 * and shares the trusted Activity actor. Entry identity/title/lifecycle stay the
 * generic EntityRepository's; relationships stay FND-04 EntityLinks. Bound to a
 * `WorkspaceContext`; there is no unscoped construction path.
 */
export function createDiaryRepository(
  db: D1Database,
  context: WorkspaceContext,
  options?: D1DiaryRepositoryOptions,
): DiaryRepository {
  return new D1DiaryRepository(db, context, options);
}

/**
 * Factory for the workspace-scoped D1-backed PersonRepository — the PEOPLE-01
 * authoritative Person repository. It CREATES `person` entities with their
 * structured relationship detail slice atomically (the generic EntityRepository
 * refuses to create one), owns detail edits and the archive lifecycle, and shares
 * the trusted Activity actor. A Person's identity/title/soft-delete/restore stay
 * the generic EntityRepository's; relationships stay FND-04 EntityLinks. Bound to
 * a `WorkspaceContext`; there is no unscoped construction path.
 */
export function createPersonRepository(
  db: D1Database,
  context: WorkspaceContext,
  options?: D1PersonRepositoryOptions,
): PersonRepository {
  return new D1PersonRepository(db, context, options);
}

export function createMeetingRepository(
  db: D1Database,
  context: WorkspaceContext,
  options?: ConstructorParameters<typeof D1MeetingRepository>[2],
): MeetingRepository {
  return new D1MeetingRepository(db, context, options);
}

/**
 * Factory for the workspace-scoped D1-backed AssetRepository — the ASSET-01
 * authoritative Asset repository. It CREATES `asset` entities with their
 * structured detail slice atomically (the generic EntityRepository refuses to
 * create one), owns detail edits, the real-world status and the archive lifecycle,
 * guards permanent deletion behind active relationships, and shares the trusted
 * Activity actor. An Asset's identity/title/soft-delete/restore stay the generic
 * EntityRepository's; relationships stay FND-04 EntityLinks. Bound to a
 * `WorkspaceContext`; there is no unscoped construction path.
 */
export function createAssetRepository(
  db: D1Database,
  context: WorkspaceContext,
  options?: D1AssetRepositoryOptions,
): AssetRepository {
  return new D1AssetRepository(db, context, options);
}

/**
 * Factory for the workspace-scoped D1-backed AssetHistoryRepository — the ASSET-02
 * authoritative owner of an Asset's history (`asset_events`) and its future
 * obligations (`asset_obligations`). It records events, advances the Asset's
 * canonical facts forward-only, creates AT MOST ONE recurrence successor per
 * completion, aggregates recorded costs in SQL, and serves the bounded Today
 * attention read. Task WRITES go through the injected `ObligationTaskGateway` so
 * Task completion authority stays with the TaskRepository. Bound to a
 * `WorkspaceContext`; there is no unscoped construction path.
 */
export function createAssetHistoryRepository(
  db: D1Database,
  context: WorkspaceContext,
  options?: D1AssetHistoryRepositoryOptions,
): AssetHistoryRepository {
  return new D1AssetHistoryRepository(db, context, options);
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
 * Factory for the workspace-scoped, READ-ONLY D1-backed AlignmentRepository —
 * the AREA-03 derived Goal-alignment activity-facts projection (ADR-040). It
 * performs no mutations and caches nothing: the Task-activity contribution to
 * each Goal is recomputed from live `entity_links` and Activity data, gathered
 * for a whole bounded page of Goals in a fixed number of grouped queries (no
 * N+1). Bound to a `WorkspaceContext`; there is no unscoped construction path.
 */
export function createAlignmentRepository(
  db: D1Database,
  context: WorkspaceContext,
): AlignmentRepository {
  return new D1AlignmentRepository(db, context);
}

/**
 * Factory for the TASKS-03 saved-view repository, bound to a `WorkspaceContext`.
 * There is no unscoped construction path: workspace AND owner scoping are enforced
 * inside every statement.
 */
export function createTaskViewRepository(
  db: D1Database,
  context: WorkspaceContext,
  options?: D1TaskViewRepositoryOptions,
): TaskViewRepository {
  return new D1TaskViewRepository(db, context, options);
}

export { D1TaskViewRepository, type D1TaskViewRepositoryOptions };

export function createAppPreferencesRepository(
  db: D1Database,
  context: WorkspaceContext,
  options?: D1AppPreferencesRepositoryOptions,
): AppPreferencesRepository {
  return new D1AppPreferencesRepository(db, context, options);
}

/**
 * AI-01 — the AI preferences and usage-ledger adapters. Neither stores a secret
 * and neither records Activity; the usage ledger is operational metadata, not
 * history of the owner's records (ADR-012).
 */
export {
  D1AiPreferencesRepository,
  D1AiUsageRepository,
  createAiPreferencesRepository,
  createAiUsageRepository,
  fromMicroUsd,
  toMicroUsd,
} from "./d1-ai-repository";

/**
 * Factory for the workspace-scoped D1-backed workspace-membership repository —
 * the IDENT-01 identity link between an authenticated subject and this workspace
 * (and, optionally, a Person record). The SAME instance also implements the
 * read-only `ActorDirectory`, because both read one joined table; construct it
 * once per scope with {@link createActorDirectory} when only reads are needed.
 * It never records Activity.
 */
export function createWorkspaceMemberRepository(
  db: D1Database,
  context: WorkspaceContext,
  options?: D1WorkspaceMemberRepositoryOptions,
): WorkspaceMemberRepository & ActorDirectory {
  return new D1WorkspaceMemberRepository(db, context, options);
}

/**
 * Factory for the READ-ONLY actor directory: resolves a batch of Activity actor
 * references to display identities in one bounded, workspace-scoped query.
 */
export function createActorDirectory(
  db: D1Database,
  context: WorkspaceContext,
  options?: D1WorkspaceMemberRepositoryOptions,
): ActorDirectory {
  return new D1WorkspaceMemberRepository(db, context, options);
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

/**
 * Factory for the workspace-scoped, read-only D1-backed RelationshipRepository —
 * the PEOPLE-03 relationship-facts projection. It performs no mutations and caches
 * nothing: a Person's shared-record inventory and interaction history are
 * recomputed from live `entity_links`, `entities`, `spine_records` and Activity
 * data, gathered for a whole bounded page of People in a fixed number of grouped
 * queries (no N+1). Bound to a `WorkspaceContext`; there is no unscoped
 * construction path.
 */
export function createRelationshipRepository(
  db: D1Database,
  context: WorkspaceContext,
): RelationshipRepository {
  return new D1RelationshipRepository(db, context);
}

export function createReviewRepository(
  db: D1Database,
  context: WorkspaceContext,
  options?: D1ReviewRepositoryOptions,
): ReviewRepository {
  return new D1ReviewRepository(db, context, options);
}

export {
  D1AreaSettingsRepository,
  type D1AreaSettingsRepositoryOptions,
} from "./d1-area-settings-repository";

/**
 * Factory for the workspace-scoped D1-backed AreaSettingsRepository — the AREA-05
 * Areas-owned archival slice. Like the other mutation repositories it is bound to
 * a `WorkspaceContext` and a trusted Activity actor; there is no unscoped
 * construction path. Permanent (hard) Area deletion is NOT here — it stays the
 * SpineRepository's authority (`permanentlyDeleteArea`).
 */
export function createAreaSettingsRepository(
  db: D1Database,
  context: WorkspaceContext,
  options?: D1AreaSettingsRepositoryOptions,
): AreaSettingsRepository {
  return new D1AreaSettingsRepository(db, context, options);
}

/**
 * X-04 — the read-only workspace-snapshot source the full export is built from.
 * Re-exported here so the composition boundary constructs it the same way every
 * other repository is constructed: bound to a `WorkspaceContext`, with no
 * unscoped path and no mutating method.
 */
export {
  D1WorkspaceSnapshotRepository,
  createWorkspaceSnapshotRepository,
} from "./d1-workspace-snapshot-repository";
