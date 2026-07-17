/**
 * FND-02/FND-03 Data kernel — D1 implementation of the entity repository.
 *
 * Implements the storage-independent, WORKSPACE-BOUND `EntityRepository`
 * contract over Cloudflare D1 (SQLite) using prepared, parameterised statements
 * only. The repository is constructed with a single `WorkspaceContext`; every
 * statement constrains `workspace_id = ?` with that context's id, and no
 * module-facing method accepts a `workspaceId` (FND-03 / ADR-010). No
 * caller-supplied value is ever interpolated into SQL — every value is bound
 * (see AGENTS.md §17). D1 specifics (rows, SQL, timestamp strings) stay inside
 * this file and `database.ts`; nothing D1-shaped escapes the public interface.
 */

import {
  EntityNotFoundError,
  EntityStorageError,
  type CreateEntityInput,
  type EntityPage,
  type EntityRecord,
  type EntityType,
  type GetEntityOptions,
  type LifecycleResult,
  type ScopedListEntitiesInput,
  type UpdateEntityInput,
  type Clock,
  type EntityRepository,
  type IdGenerator,
  systemClock,
  secureIdGenerator,
} from "~/kernel/entities";
import {
  decodeCursorForScope,
  encodeCursor,
  type CursorScope,
} from "~/kernel/entities/entity-cursor";
import {
  validateCreateInput,
  validateEntityId,
  validateLimit,
  validateOptionalType,
  validateUpdateInput,
} from "~/kernel/entities/entity-validation";
import type { WorkspaceContext } from "~/kernel/workspaces";

import { rowToEntity, toStorageTimestamp, type EntityRow } from "./database";

/** Optional dependencies for the repository, injectable for deterministic tests. */
export interface D1EntityRepositoryOptions {
  /** Clock used for lifecycle timestamps. Defaults to the system clock. */
  readonly clock?: Clock;
  /** Id generator for new entities. Defaults to a secure UUID generator. */
  readonly idGenerator?: IdGenerator;
}

/** The columns selected for every read, matching {@link EntityRow}. */
const SELECT_COLUMNS =
  "id, workspace_id, type, title, created_at, updated_at, deleted_at";

export class D1EntityRepository implements EntityRepository {
  readonly #db: D1Database;
  readonly #workspaceId: string;
  readonly #clock: Clock;
  readonly #newId: IdGenerator;

  constructor(
    db: D1Database,
    context: WorkspaceContext,
    options: D1EntityRepositoryOptions = {},
  ) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
    this.#clock = options.clock ?? systemClock;
    this.#newId = options.idGenerator ?? secureIdGenerator;
  }

  async create<TType extends EntityType>(
    input: CreateEntityInput<TType>,
  ): Promise<EntityRecord<TType>> {
    const { type, title } = validateCreateInput(input);
    const now = toStorageTimestamp(this.#clock());
    const id = this.#newId();

    const row = await this.#firstOrThrow(
      this.#db
        .prepare(
          `INSERT INTO entities
             (id, workspace_id, type, title, created_at, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, NULL)
           RETURNING ${SELECT_COLUMNS}`,
        )
        .bind(id, this.#workspaceId, type, title, now, now),
    );

    return rowToEntity(row) as EntityRecord<TType>;
  }

  async getById(
    id: string,
    options: GetEntityOptions = {},
  ): Promise<EntityRecord | null> {
    const entityId = validateEntityId(id);

    const deletedClause = options.includeDeleted
      ? ""
      : " AND deleted_at IS NULL";
    const row = await this.#first(
      this.#db
        .prepare(
          `SELECT ${SELECT_COLUMNS} FROM entities
           WHERE id = ? AND workspace_id = ?${deletedClause}`,
        )
        .bind(entityId, this.#workspaceId),
    );

    return row ? rowToEntity(row) : null;
  }

  async update(id: string, input: UpdateEntityInput): Promise<EntityRecord> {
    const entityId = validateEntityId(id);
    const { title } = validateUpdateInput(input);
    const now = toStorageTimestamp(this.#clock());

    // Only live entities in this workspace are updatable; identity/creation
    // columns are untouched. A row in another workspace never matches.
    const row = await this.#first(
      this.#db
        .prepare(
          `UPDATE entities
             SET title = ?, updated_at = ?
           WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL
           RETURNING ${SELECT_COLUMNS}`,
        )
        .bind(title, now, entityId, this.#workspaceId),
    );

    if (!row) {
      throw new EntityNotFoundError();
    }
    return rowToEntity(row);
  }

  async list<TType extends EntityType = EntityType>(
    input: ScopedListEntitiesInput<TType> = {},
  ): Promise<EntityPage<TType>> {
    const type = validateOptionalType(input.type);
    const limit = validateLimit(input.limit);
    const includeDeleted = input.includeDeleted === true;

    // The scope this page is bound to. A cursor is only accepted if it was
    // issued for exactly this workspace + type filter + deleted-mode.
    const scope: CursorScope = {
      workspaceId: this.#workspaceId,
      type: type ?? null,
      includeDeleted,
    };

    const conditions: string[] = ["workspace_id = ?"];
    const params: unknown[] = [this.#workspaceId];

    if (!includeDeleted) {
      conditions.push("deleted_at IS NULL");
    }
    if (type !== undefined) {
      conditions.push("type = ?");
      params.push(type);
    }
    if (input.cursor !== undefined) {
      const position = decodeCursorForScope(input.cursor, scope);
      // Deterministic keyset pagination on the (created_at, id) tuple.
      conditions.push("(created_at > ? OR (created_at = ? AND id > ?))");
      params.push(position.createdAt, position.createdAt, position.id);
    }

    // Fetch one more than requested to detect whether a further page exists.
    const fetchLimit = limit + 1;
    params.push(fetchLimit);

    const rows = await this.#all(
      this.#db
        .prepare(
          `SELECT ${SELECT_COLUMNS} FROM entities
           WHERE ${conditions.join(" AND ")}
           ORDER BY created_at ASC, id ASC
           LIMIT ?`,
        )
        .bind(...params),
    );

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const items = pageRows.map(rowToEntity) as EntityRecord<TType>[];
    const last = pageRows.at(-1);
    const nextCursor =
      hasMore && last
        ? encodeCursor(scope, { createdAt: last.created_at, id: last.id })
        : null;

    return { items, nextCursor, hasMore };
  }

  async softDelete(id: string): Promise<LifecycleResult> {
    const entityId = validateEntityId(id);

    const existing = await this.#findAny(entityId);
    if (!existing) {
      throw new EntityNotFoundError();
    }
    if (existing.deleted_at !== null) {
      // Idempotent: already deleted, no timestamp churn.
      return {
        entity: rowToEntity(existing),
        outcome: "already_deleted",
        changed: false,
      };
    }

    const now = toStorageTimestamp(this.#clock());
    const row = await this.#firstOrThrow(
      this.#db
        .prepare(
          `UPDATE entities
             SET deleted_at = ?, updated_at = ?
           WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL
           RETURNING ${SELECT_COLUMNS}`,
        )
        .bind(now, now, entityId, this.#workspaceId),
    );

    return { entity: rowToEntity(row), outcome: "deleted", changed: true };
  }

  async restore(id: string): Promise<LifecycleResult> {
    const entityId = validateEntityId(id);

    const existing = await this.#findAny(entityId);
    if (!existing) {
      throw new EntityNotFoundError();
    }
    if (existing.deleted_at === null) {
      // Idempotent: already active, no timestamp churn.
      return {
        entity: rowToEntity(existing),
        outcome: "already_active",
        changed: false,
      };
    }

    const now = toStorageTimestamp(this.#clock());
    const row = await this.#firstOrThrow(
      this.#db
        .prepare(
          `UPDATE entities
             SET deleted_at = NULL, updated_at = ?
           WHERE id = ? AND workspace_id = ? AND deleted_at IS NOT NULL
           RETURNING ${SELECT_COLUMNS}`,
        )
        .bind(now, entityId, this.#workspaceId),
    );

    return { entity: rowToEntity(row), outcome: "restored", changed: true };
  }

  /** Find a row by id within the bound workspace regardless of delete state. */
  async #findAny(id: string): Promise<EntityRow | null> {
    return this.#first(
      this.#db
        .prepare(
          `SELECT ${SELECT_COLUMNS} FROM entities
           WHERE id = ? AND workspace_id = ?`,
        )
        .bind(id, this.#workspaceId),
    );
  }

  /** Run a statement returning at most one row, mapping D1 failures. */
  async #first(statement: D1PreparedStatement): Promise<EntityRow | null> {
    try {
      return await statement.first<EntityRow>();
    } catch (cause) {
      throw new EntityStorageError(undefined, { cause });
    }
  }

  /** Like {@link #first} but throws when no row is returned (invariant guard). */
  async #firstOrThrow(statement: D1PreparedStatement): Promise<EntityRow> {
    const row = await this.#first(statement);
    if (!row) {
      // A RETURNING statement we expected to affect exactly one row produced
      // none — treat as a storage-level invariant violation, not a domain case.
      throw new EntityStorageError();
    }
    return row;
  }

  /** Run a statement returning many rows, mapping D1 failures. */
  async #all(statement: D1PreparedStatement): Promise<EntityRow[]> {
    try {
      const { results } = await statement.all<EntityRow>();
      return results;
    } catch (cause) {
      throw new EntityStorageError(undefined, { cause });
    }
  }
}
