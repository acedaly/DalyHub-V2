/**
 * FND-02 Data kernel — the entity contract.
 *
 * This module defines the application-facing shape of a DalyHub entity: the
 * uniform identity and lifecycle that every record (Task, Project, Note, …)
 * shares. It is deliberately independent of any storage technology — nothing
 * here imports D1 or Cloudflare types. The D1 adapter
 * (`app/platform/storage/d1`) implements the repository contract and is the
 * only place snake_case rows and SQLite specifics are allowed to exist.
 *
 * See ADR-009 (Data Kernel Storage) and ADR-001 (Area Hierarchy).
 */

/**
 * An entity type identifier (e.g. `"task"`, `"project"`, `"note"`).
 *
 * Types are a REUSABLE, open contract — a validated string, not a database
 * enum — so future modules can register their own entity types without a schema
 * migration (see the module registry, FND-06). Validation rules and limits live
 * in `entity-validation.ts` and are documented there.
 */
export type EntityType = string;

/**
 * A stored entity: the shared record header every DalyHub entity carries.
 *
 * Field notes:
 *   - `id` is application-generated, globally unique, stable and never reused.
 *   - `workspaceId` is required on every entity. FND-02 only carries and
 *     requires it; the Workspace entity and cross-workspace isolation
 *     guarantees are FND-03's job.
 *   - `type` is immutable after creation.
 *   - `title` is the human-readable Record Header title — required, trimmed.
 *   - Timestamps are UTC. `createdAt` is immutable; `updatedAt` advances on
 *     every successful update, soft-delete and restore. `deletedAt` is null for
 *     live records and set to the deletion time for soft-deleted ones.
 *
 * Identity/lifecycle fields are `readonly`: a stored record is an immutable
 * snapshot. Mutations go through the repository and return a fresh record.
 */
export type EntityRecord<TType extends EntityType = EntityType> = {
  readonly id: string;
  readonly workspaceId: string;
  readonly type: TType;
  readonly title: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
};

/**
 * Input to create an entity through a workspace-scoped repository.
 *
 * There is deliberately NO `workspaceId` field (FND-03 / ADR-010): the workspace
 * is supplied internally by the repository's bound `WorkspaceContext`, so module
 * code cannot select or override the scope, and a stray `workspaceId` property is
 * a type error rather than a silently-honoured override. Lifecycle fields (`id`,
 * timestamps, `deletedAt`) are generated inside the repository.
 */
export type CreateEntityInput<TType extends EntityType = EntityType> = {
  readonly type: TType;
  readonly title: string;
};

/**
 * Input to update an entity. For FND-02 only fields genuinely shared by all
 * entities are updatable — that is `title`. Identity and creation fields
 * (`id`, `workspaceId`, `type`, `createdAt`) can never be changed here.
 */
export type UpdateEntityInput = {
  readonly title: string;
};

/** Options for reading a single entity. */
export type GetEntityOptions = {
  /**
   * When true, a soft-deleted entity is returned too. Defaults to false: normal
   * reads exclude deleted records. Deleted records are only retrievable when
   * this is explicitly set.
   */
  readonly includeDeleted?: boolean;
};

/**
 * Input to list entities within the repository's bound workspace, using bounded
 * cursor pagination. There is NO `workspaceId` field — scope comes from the
 * repository's `WorkspaceContext` (FND-03 / ADR-010).
 */
export type ScopedListEntitiesInput<TType extends EntityType = EntityType> = {
  /** Optional filter to a single entity type. */
  readonly type?: TType;
  /**
   * Maximum number of records to return. Clamped to `[1, MAX_PAGE_SIZE]`;
   * defaults to `DEFAULT_PAGE_SIZE` when omitted. The result is never an
   * unbounded array.
   */
  readonly limit?: number;
  /**
   * Opaque cursor from a previous page's `nextCursor`. Must be a cursor this
   * kernel issued; anything else is rejected as an invalid cursor.
   */
  readonly cursor?: string;
  /**
   * When true, soft-deleted records are included. Defaults to false: ordinary
   * lists exclude deleted records.
   */
  readonly includeDeleted?: boolean;
};

/**
 * A bounded page of entities plus the information needed to request the next
 * page. `nextCursor` is null when there are no further records.
 */
export type EntityPage<TType extends EntityType = EntityType> = {
  readonly items: ReadonlyArray<EntityRecord<TType>>;
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
};

/** The lifecycle transition a soft-delete / restore call actually performed. */
export type LifecycleOutcome =
  "deleted" | "already_deleted" | "restored" | "already_active";

/**
 * Result of a soft-delete or restore. `changed` distinguishes a real
 * transition from an idempotent no-op, and `outcome` names exactly which case
 * occurred — so callers can tell "already deleted" apart from "just deleted"
 * (and both apart from "not found", which is signalled as an error).
 */
export type LifecycleResult<TType extends EntityType = EntityType> = {
  readonly entity: EntityRecord<TType>;
  readonly outcome: LifecycleOutcome;
  readonly changed: boolean;
};
