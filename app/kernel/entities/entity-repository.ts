/**
 * FND-02/FND-03 Data kernel — the entity repository contract.
 *
 * This is the storage-independent interface that modules depend on. It speaks
 * only in domain terms (camelCase records, domain errors) and never exposes D1,
 * SQL, or Cloudflare types. Adapters — currently only the D1 adapter — implement
 * it. Depending on this interface rather than the adapter keeps the kernel
 * portable (see ADR-009).
 *
 * The repository is WORKSPACE-BOUND (FND-03 / ADR-010): it is constructed with a
 * single `WorkspaceContext` and every method operates only within that
 * workspace. No module-facing method accepts a `workspaceId` — module code
 * therefore cannot pass, select or override the scope per operation. The bound
 * context supplies the workspace id internally, and every SQL statement still
 * constrains `workspace_id = ?` with the value bound, never interpolated. The
 * low-level, cross-workspace store (creating workspace records, resolving
 * context) is a separate platform/bootstrap concern (`WorkspaceRepository`),
 * never this module-facing contract.
 */

import type {
  CreateEntityInput,
  EntityPage,
  EntityRecord,
  EntityType,
  GetEntityOptions,
  LifecycleResult,
  ScopedListEntitiesInput,
  UpdateEntityInput,
} from "./entity";

/** Injectable clock, so tests control time instead of sleeping. */
export type Clock = () => Date;

/** Injectable id generator, so tests get deterministic ids. */
export type IdGenerator = () => string;

/** The default clock: the current wall-clock time. */
export const systemClock: Clock = () => new Date();

/**
 * The default id generator: a Workers-native secure UUID. `crypto.randomUUID()`
 * is globally unique and unguessable; ids are never reused after deletion.
 */
export const secureIdGenerator: IdGenerator = () => crypto.randomUUID();

/**
 * The kernel's entity storage contract.
 *
 * Error semantics (thrown as the typed errors in `entity-errors.ts`):
 *   - invalid input  → `EntityValidationError` (no data is written)
 *   - unknown id     → `EntityNotFoundError`
 *   - bad cursor     → `InvalidCursorError`
 *   - storage failure→ `EntityStorageError`
 */
export interface EntityRepository {
  /**
   * Create an entity in the bound workspace. Generates `id` and the lifecycle
   * timestamps internally, and assigns the repository's workspace; callers
   * supply only `type` and `title` and cannot specify another workspace.
   */
  create<TType extends EntityType>(
    input: CreateEntityInput<TType>,
  ): Promise<EntityRecord<TType>>;

  /**
   * Read one entity by id within the bound workspace. Returns null when there is
   * no matching entity in this workspace — including when it exists in another
   * workspace, which is indistinguishable from "does not exist" and never
   * discloses cross-workspace existence. Soft-deleted entities are excluded
   * unless `options.includeDeleted` is true.
   */
  getById(id: string, options?: GetEntityOptions): Promise<EntityRecord | null>;

  /**
   * Update the shared, mutable fields of a live entity in the bound workspace
   * (for now: `title`). Advances `updatedAt` when a field actually changes.
   * Submitting the entity's already-stored title is an idempotent no-op: the
   * record is returned unchanged, `updatedAt` is not advanced, and no Activity
   * event is appended (a mutation that changes nothing is not meaningful history).
   * Identity and creation fields are never changed. Throws `EntityNotFoundError`
   * if no live entity with that id exists in this workspace (including an entity
   * that lives in another workspace, or a soft-deleted one).
   */
  update(id: string, input: UpdateEntityInput): Promise<EntityRecord>;

  /**
   * List entities in the bound workspace using bounded cursor pagination.
   * Excludes soft-deleted records by default, optionally filters by `type`,
   * orders deterministically by `(createdAt, id)`, and returns at most a safe
   * maximum page size along with a `nextCursor` for the following page. A cursor
   * is bound to the workspace and query shape that produced it and is rejected
   * (`InvalidCursorError`) if replayed under a different scope.
   */
  list<TType extends EntityType = EntityType>(
    input?: ScopedListEntitiesInput<TType>,
  ): Promise<EntityPage<TType>>;

  /**
   * Soft-delete an entity in the bound workspace: set `deletedAt` and advance
   * `updatedAt`. Idempotent — deleting an already-deleted entity is a no-op
   * reported via the result's `outcome` (`already_deleted`, `changed: false`).
   * Throws `EntityNotFoundError` if the id is unknown in this workspace.
   */
  softDelete(id: string): Promise<LifecycleResult>;

  /**
   * Restore a soft-deleted entity in the bound workspace: clear `deletedAt` and
   * advance `updatedAt`. Idempotent — restoring a live entity is a no-op
   * reported via the result's `outcome` (`already_active`, `changed: false`).
   * Throws `EntityNotFoundError` if the id is unknown in this workspace.
   */
  restore(id: string): Promise<LifecycleResult>;
}
