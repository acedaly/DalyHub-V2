/**
 * FND-02 Data kernel — the entity repository contract.
 *
 * This is the storage-independent interface that modules depend on. It speaks
 * only in domain terms (camelCase records, domain errors) and never exposes D1,
 * SQL, or Cloudflare types. Adapters — currently only the D1 adapter — implement
 * it. Depending on this interface rather than the adapter keeps the kernel
 * portable (see ADR-009).
 *
 * Every operation requires a `workspaceId`: there is no unscoped access path.
 * FND-02 only carries and requires workspace scope; FND-03 formalises the
 * Workspace entity, request context and cross-workspace isolation guarantees.
 */

import type {
  CreateEntityInput,
  EntityPage,
  EntityRecord,
  EntityType,
  GetEntityOptions,
  LifecycleResult,
  ListEntitiesInput,
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
   * Create an entity. Generates `id` and the lifecycle timestamps internally;
   * callers supply only `workspaceId`, `type` and `title`. Returns the stored
   * record.
   */
  create<TType extends EntityType>(
    input: CreateEntityInput<TType>,
  ): Promise<EntityRecord<TType>>;

  /**
   * Read one entity by id within a workspace. Returns null when there is no
   * matching entity. Soft-deleted entities are excluded unless
   * `options.includeDeleted` is true.
   */
  getById(
    workspaceId: string,
    id: string,
    options?: GetEntityOptions,
  ): Promise<EntityRecord | null>;

  /**
   * Update the shared, mutable fields of a live entity (for FND-02: `title`).
   * Advances `updatedAt`. Identity and creation fields are never changed.
   * Throws `EntityNotFoundError` if no live entity with that id exists in the
   * workspace (a soft-deleted entity is not updatable).
   */
  update(
    workspaceId: string,
    id: string,
    input: UpdateEntityInput,
  ): Promise<EntityRecord>;

  /**
   * List entities in a workspace using bounded cursor pagination. Excludes
   * soft-deleted records by default, optionally filters by `type`, orders
   * deterministically by `(createdAt, id)`, and returns at most a safe maximum
   * page size along with a `nextCursor` for the following page.
   */
  list<TType extends EntityType = EntityType>(
    input: ListEntitiesInput<TType>,
  ): Promise<EntityPage<TType>>;

  /**
   * Soft-delete an entity: set `deletedAt` and advance `updatedAt`. Idempotent
   * — deleting an already-deleted entity is a no-op reported via the result's
   * `outcome` (`already_deleted`, `changed: false`). Throws
   * `EntityNotFoundError` if the id is unknown in the workspace.
   */
  softDelete(workspaceId: string, id: string): Promise<LifecycleResult>;

  /**
   * Restore a soft-deleted entity: clear `deletedAt` and advance `updatedAt`.
   * Idempotent — restoring a live entity is a no-op reported via the result's
   * `outcome` (`already_active`, `changed: false`). Throws
   * `EntityNotFoundError` if the id is unknown in the workspace.
   */
  restore(workspaceId: string, id: string): Promise<LifecycleResult>;
}
