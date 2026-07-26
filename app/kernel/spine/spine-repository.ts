/**
 * FND-07 Spine kernel — the authoritative domain repository contract.
 *
 * This is the storage-independent interface that owns the Area → Goal → Project →
 * Task spine's load-bearing invariants (ADR-014 §4.7). It speaks only domain terms
 * (camelCase `SpineRecord`s, closed `SpineKind`s, typed errors) and never exposes
 * D1, SQL or Cloudflare types. The D1 adapter (`app/platform/storage/d1`)
 * implements it; the generic Entity and EntityLink repositories deliberately do
 * NOT — they refuse to mutate reserved spine types, so this repository is the only
 * way to create, restructure or complete a spine record.
 *
 * The repository is WORKSPACE-BOUND (ADR-010): it is constructed with a single
 * `WorkspaceContext` and every method operates only within that workspace. No
 * method accepts a `workspaceId`, and the trusted Activity actor is bound at
 * construction — module code cannot pass, select or spoof scope or actor.
 */

import type {
  CompletionResult,
  CompletionRollup,
  CreateAreaInput,
  CreateGoalInput,
  CreateProjectInput,
  CreateTaskInput,
  GetSpineOptions,
  ListSpineChildrenInput,
  MoveParentInput,
  MoveResult,
  AreaDeletionResult,
  SpineChildPage,
  SpineLifecycleResult,
  SpineRecord,
  SpineRollup,
} from "./spine";

/** Injectable clock, so tests control time instead of sleeping. */
export type Clock = () => Date;

/** Injectable id generator, so tests get deterministic ids. */
export type IdGenerator = () => string;

/** The default clock: the current wall-clock time. */
export const systemClock: Clock = () => new Date();

/**
 * The default id generator: a Workers-native secure UUID. `crypto.randomUUID()`
 * is globally unique and unguessable; ids are never reused.
 */
export const secureIdGenerator: IdGenerator = () => crypto.randomUUID();

/**
 * The kernel's authoritative spine storage contract.
 *
 * Every creation and structural mutation is ATOMIC: the `entities` row, the
 * `spine_records` row, the structural EntityLink and their Activity events are
 * one D1 transaction that rolls back entirely on any failure (ADR-014 §8, §21).
 * Idempotent no-ops (already-completed, already-there, already-deleted) change
 * nothing and append no Activity.
 *
 * Error semantics (thrown as the typed errors in `spine-errors.ts`):
 *   - invalid input          → `SpineValidationError` (no data written)
 *   - unknown / cross-workspace id → `SpineNotFoundError`
 *   - wrong record kind      → `SpineWrongKindError`
 *   - missing/deleted parent → `SpineParentUnavailableError`
 *   - illegal parent kind    → `SpineInvalidParentKindError`
 *   - deleting a non-empty container → `SpineHasActiveChildrenError`
 *   - completing an Area     → `SpineAreaCompletionError`
 *   - bad cursor             → `InvalidSpineCursorError`
 *   - storage failure        → `SpineStorageError`
 */
export interface SpineRepository {
  /** Create an Area (no parent). Atomically writes the entity, its spine row and
   * `entity.created`. */
  createArea(input: CreateAreaInput): Promise<SpineRecord>;

  /** Create a Goal under an active Area. Atomic across entity, spine row, the
   * `goal.belongs_to_area` link and both `entity.created` + `entity_link.created`. */
  createGoal(input: CreateGoalInput): Promise<SpineRecord>;

  /** Create a Project under an active Area or Goal. */
  createProject(input: CreateProjectInput): Promise<SpineRecord>;

  /** Create a Task under an active Area or Project. */
  createTask(input: CreateTaskInput): Promise<SpineRecord>;

  /**
   * Read one spine record by id within the bound workspace, with its resolved
   * parent. Returns null when there is no matching record in this workspace —
   * including when it exists in another workspace, which is indistinguishable
   * from "does not exist". Soft-deleted records are excluded unless
   * `options.includeDeleted` is true.
   */
  getById(id: string, options?: GetSpineOptions): Promise<SpineRecord | null>;

  /**
   * Resolve the active structural parent of a record. Returns null for an Area
   * (no parent) and null when the record does not exist in this workspace.
   */
  getParent(id: string): Promise<SpineRecord | null>;

  /**
   * List the children of one parent, restricted to a single child kind, using
   * bounded cursor pagination ordered deterministically by `(createdAt, id)`.
   * There is no "load the whole hierarchy" method. Throws `SpineNotFoundError`
   * for an unknown/cross-workspace parent and `SpineInvalidParentKindError` when
   * the (parent kind, child kind) pairing is not a permitted hierarchy edge.
   */
  listChildren(input: ListSpineChildrenInput): Promise<SpineChildPage>;

  /**
   * Compute the derived completion rollup for a container (Area, Goal or
   * Project). Rollups exclude soft-deleted descendants and are never cached.
   * Throws `SpineWrongKindError` for a Task (a Task has no descendants).
   */
  getRollup(id: string): Promise<SpineRollup>;

  /**
   * Rename a record through the shared entity title rules. A same-title update
   * after normalisation is a no-op (no `updatedAt` churn, no Activity). A real
   * change atomically updates the entity and appends `entity.updated`.
   */
  rename(id: string, title: string): Promise<SpineRecord>;

  /**
   * Move a Goal/Project/Task to a new active parent of a permitted kind, in the
   * same workspace, without ever committing two active parents. Moving to the
   * existing parent is an idempotent no-op. The record keeps its id and its
   * descendants. Records the actual link mutations (`entity_link.unlinked` then
   * `entity_link.created` or `entity_link.restored`).
   */
  move(id: string, parent: MoveParentInput): Promise<MoveResult>;

  /**
   * Complete a Goal, Project or Task: set `completedAt`, advance `updatedAt` and
   * append the kind's `*.completed` event, all atomically on the same clock.
   * Completing an already-completed record is a no-op. Completing an Area throws
   * `SpineAreaCompletionError`; a soft-deleted record cannot be completed.
   */
  complete(id: string): Promise<CompletionResult>;

  /**
   * Reopen a completed Goal, Project or Task: clear `completedAt`, advance
   * `updatedAt` and append the kind's `*.reopened` event. Reopening an already
   * open record is a no-op.
   */
  reopen(id: string): Promise<CompletionResult>;

  /**
   * Soft-delete a record. A container cannot be soft-deleted while it has any
   * active direct child (`SpineHasActiveChildrenError`). Deletion never cascades
   * and never moves descendants. Idempotent; appends `entity.deleted` on a real
   * transition. The retained structural parent link is left intact for a faithful
   * restore.
   */
  softDelete(id: string): Promise<SpineLifecycleResult>;

  /**
   * Restore a soft-deleted record. A non-Area record can only be restored when
   * its retained parent still exists and is active
   * (`SpineParentUnavailableError` otherwise). Idempotent; appends
   * `entity.restored` on a real transition.
   */
  restore(id: string): Promise<SpineLifecycleResult>;

  /**
   * Permanently (HARD) delete an EMPTY Area — the only irreversible spine
   * mutation (AREA-05). Unlike `softDelete`, it removes the Area's rows entirely,
   * so it is guarded far more strictly:
   *
   *   - Refused with `SpineHasDependentsError` (carrying the blocking
   *     {@link AreaDependencyCounts}) when ANY active link still references the
   *     Area — child Goals/Projects/Tasks, or a linked Note/Diary/other entity
   *     whose link would become invalid. The dependency re-check is folded into
   *     the mutating SQL and evaluated AT COMMIT, so a child linked between page
   *     load and submission still blocks the delete; the whole batch is
   *     all-or-nothing (nothing is purged unless the Area is genuinely empty).
   *   - When empty, the Area's full technical footprint is purged in ONE atomic,
   *     FK-safe batch — its historical `entity_links`, its `activity_subjects`
   *     associations, its `area_details` row, its `spine_records` row and the
   *     `entities` row — and a single subject-less `area.deleted` audit event is
   *     appended to the workspace Activity stream (its subject would be the row
   *     being deleted). No projection/cache rows exist to orphan. Prior lifecycle
   *     Activity rows are retained (append-only, ADR-012); only their subject
   *     associations to the now-deleted entity are removed.
   *   - Workspace-scoped: a cross-workspace or wrong-kind id is a calm
   *     `SpineNotFoundError`, disclosing nothing. Idempotent: deleting an
   *     already-gone Area reports `already_gone` rather than throwing.
   *
   * Only Areas are permanently deletable in AREA-05 (they are the top of the
   * spine and own no additive detail beyond `area_details`); a non-Area id is a
   * `SpineWrongKindError`.
   */
  permanentlyDeleteArea(id: string): Promise<AreaDeletionResult>;
}

/** Re-exported for convenience: the completion rollup value object. */
export type { CompletionRollup };
