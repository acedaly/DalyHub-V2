/**
 * FND-07 Spine kernel — the storage-independent domain contract.
 *
 * This module defines the application-facing shape of the Area → Goal → Project →
 * Task spine: the four spine records, their single structural parent, the typed
 * creation inputs, and the derived completion rollups. It speaks only domain
 * terms — camelCase, `Date`s, closed `SpineKind` unions — and imports no D1,
 * Cloudflare, SQL or storage-row types (ADR-014 §5). The D1 adapter
 * (`app/platform/storage/d1`) is the only place snake_case rows and SQLite
 * specifics exist.
 *
 * A spine record is NOT a replacement identity table: every Area, Goal, Project
 * and Task remains an ordinary row in `entities` and keeps the shared header
 * (id, workspaceId, type/kind, title, timestamps, deletedAt). The only additive
 * domain state is `completedAt`, held in the `spine_records` table (ADR-014 §4.2).
 * Structural parentage is an EntityLink, never a foreign-key column and never JSON
 * (ADR-014 §4.3).
 */

import type { WorkspaceId } from "~/kernel/workspaces";

import type { SpineKind, SpineParentKind } from "./spine-identifiers";

/**
 * A spine record's single active structural parent. `kind` is the parent's spine
 * kind and `id` is the parent entity id. An Area has no parent (`null`); every
 * active non-Area record has exactly one (ADR-014 §4.4).
 */
export type SpineParent = {
  readonly kind: SpineParentKind;
  readonly id: string;
};

/**
 * A spine record: the shared entity header plus the spine's additive domain
 * state and its resolved structural parent.
 *
 * Invariants (enforced by validation, the D1 adapter and the schema together):
 *   - `kind` agrees with the underlying `entities.type`.
 *   - an Area always has `completedAt: null` and `parent: null`.
 *   - an ACTIVE non-Area record has exactly one valid `parent`.
 *   - `completedAt` is completion, entirely independent of `deletedAt`
 *     (soft-deletion is not completion; completion is not deletion).
 *   - a soft-deleted record MAY retain its `parent` so restoration is faithful.
 *
 * Every field is `readonly`: a stored record is an immutable snapshot. Mutations
 * go through the `SpineRepository` and return a fresh record.
 */
export type SpineRecord = {
  readonly id: string;
  readonly workspaceId: WorkspaceId;
  readonly kind: SpineKind;
  readonly title: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
  readonly completedAt: Date | null;
  readonly parent: SpineParent | null;
};

/** Options for reading a single spine record. */
export type GetSpineOptions = {
  /**
   * When true, a soft-deleted record is returned too. Defaults to false: normal
   * reads exclude deleted records, and never disclose cross-workspace existence.
   */
  readonly includeDeleted?: boolean;
};

/* -------------------------------------------------------------------------- */
/* Creation inputs (invalid parent combinations are unrepresentable)          */
/* -------------------------------------------------------------------------- */

/** Input to create an Area. Areas have no parent and never complete. */
export type CreateAreaInput = {
  readonly title: string;
};

/** Input to create a Goal. A Goal always belongs to exactly one Area. */
export type CreateGoalInput = {
  readonly title: string;
  readonly areaId: string;
};

/**
 * The permitted parent of a Project, as a discriminated union so an illegal
 * parent kind is a type error, not just a runtime rejection.
 */
export type ProjectParentInput =
  | { readonly kind: "area"; readonly id: string }
  | { readonly kind: "goal"; readonly id: string };

/** Input to create a Project under an Area or a Goal. */
export type CreateProjectInput = {
  readonly title: string;
  readonly parent: ProjectParentInput;
};

/** The permitted parent of a Task: an Area (one-off) or a Project. */
export type TaskParentInput =
  | { readonly kind: "area"; readonly id: string }
  | { readonly kind: "project"; readonly id: string };

/** Input to create a Task under an Area or a Project. */
export type CreateTaskInput = {
  readonly title: string;
  readonly parent: TaskParentInput;
};

/** The permitted destination parent when moving a record (see `move`). */
export type MoveParentInput =
  | { readonly kind: "area"; readonly id: string }
  | { readonly kind: "goal"; readonly id: string }
  | { readonly kind: "project"; readonly id: string };

/* -------------------------------------------------------------------------- */
/* Completion, lifecycle and move outcomes                                    */
/* -------------------------------------------------------------------------- */

/** What a `complete` call actually did. */
export type CompletionOutcome = "completed" | "already_completed";

/** What a `reopen` call actually did. */
export type ReopenOutcome = "reopened" | "already_open";

/** Result of `complete`/`reopen`: the fresh record, the outcome, and whether a
 * real state change occurred (false for the idempotent no-op cases). */
export type CompletionResult = {
  readonly record: SpineRecord;
  readonly outcome: CompletionOutcome | ReopenOutcome;
  readonly changed: boolean;
};

/** What a lifecycle (soft-delete / restore) call actually did. */
export type SpineLifecycleOutcome =
  "deleted" | "already_deleted" | "restored" | "already_active";

/** Result of a soft-delete or restore. */
export type SpineLifecycleResult = {
  readonly record: SpineRecord;
  readonly outcome: SpineLifecycleOutcome;
  readonly changed: boolean;
};

/**
 * Grouped counts of the records blocking a permanent Area deletion — the active
 * links referencing the Area, classified by the counterpart entity's kind. A
 * genuinely empty Area has every count at zero. Structural children
 * (Goals/Projects/Tasks directly under the Area) and any other linked entity
 * (Notes, Diary, People, …) that would be orphaned are counted separately so the
 * UI can explain exactly what remains and where to find it.
 */
export type AreaDependencyCounts = {
  readonly goals: number;
  readonly projects: number;
  readonly tasks: number;
  readonly notes: number;
  readonly diary: number;
  /** Any other active link endpoint (non-structural link to any other entity). */
  readonly other: number;
  /** The sum — zero iff the Area is permanently deletable. */
  readonly total: number;
};

/** What a `permanentlyDeleteArea` call actually did. */
export type AreaDeletionOutcome = "deleted" | "already_gone";

/**
 * Result of a successful permanent Area deletion: the id and title of the removed
 * Area (its rows no longer exist, so no `SpineRecord` can be returned) and whether
 * this call performed the deletion (`false` if a concurrent racer already did).
 */
export type AreaDeletionResult = {
  readonly areaId: string;
  readonly title: string;
  readonly outcome: AreaDeletionOutcome;
  readonly changed: boolean;
};

/** What a `move` call actually did. */
export type MoveOutcome = "moved" | "already_there";

/** Result of a `move`. */
export type MoveResult = {
  readonly record: SpineRecord;
  readonly outcome: MoveOutcome;
  readonly changed: boolean;
};

/* -------------------------------------------------------------------------- */
/* Child listing                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Input to list the children of one parent, restricted to a single child kind so
 * the query is bounded and deterministic. There is deliberately NO "load the
 * whole hierarchy" method (ADR-014 §11). Scope comes from the bound
 * `WorkspaceContext`, never a `workspaceId` parameter.
 */
export type ListSpineChildrenInput = {
  /** The parent entity whose children to list. */
  readonly parentId: string;
  /** The single child kind to return (e.g. `task` under a `project`). */
  readonly childKind: SpineKind;
  /**
   * Maximum number of records to return. Clamped to `[1, MAX_SPINE_PAGE_SIZE]`;
   * defaults to `DEFAULT_SPINE_PAGE_SIZE` when omitted. Never unbounded.
   */
  readonly limit?: number;
  /**
   * Opaque cursor from a previous page's `nextCursor`. Must be a cursor issued
   * for the SAME workspace, parent and child kind; anything else is rejected.
   */
  readonly cursor?: string;
  /** When true, soft-deleted children are included. Defaults to false. */
  readonly includeDeleted?: boolean;
};

/** A bounded page of child spine records plus the next-page cursor. */
export type SpineChildPage = {
  readonly items: readonly SpineRecord[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
};

/* -------------------------------------------------------------------------- */
/* Derived completion rollups                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A derived completion count over a set of ACTIVE descendants. `ratio` is
 * `completed / total`, or `null` when `total` is 0 — never `NaN`, and an empty
 * container is never treated as 100% complete (ADR-014 §15). Rollups are computed
 * from current state; nothing is cached or stored.
 */
export type CompletionRollup = {
  readonly total: number;
  readonly completed: number;
  readonly ratio: number | null;
};

/**
 * The rollup for a Project: completion of its active direct Tasks.
 */
export type ProjectRollup = {
  readonly kind: "project";
  readonly tasks: CompletionRollup;
};

/**
 * The rollup for a Goal: its active direct Projects, and all active Tasks under
 * those Projects. (A Goal never directly contains Tasks.)
 */
export type GoalRollup = {
  readonly kind: "goal";
  readonly projects: CompletionRollup;
  readonly tasks: CompletionRollup;
};

/**
 * The rollup for an Area: its active direct Goals; all active Projects directly
 * under the Area or under its Goals; and all active Tasks directly under the Area
 * or under those Projects.
 */
export type AreaRollup = {
  readonly kind: "area";
  readonly goals: CompletionRollup;
  readonly projects: CompletionRollup;
  readonly tasks: CompletionRollup;
};

/** The rollup for a container record. Tasks have no descendants and no rollup. */
export type SpineRollup = ProjectRollup | GoalRollup | AreaRollup;
