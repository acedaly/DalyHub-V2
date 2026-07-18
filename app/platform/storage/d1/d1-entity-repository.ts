/**
 * FND-02/FND-03/FND-05 Data kernel — D1 implementation of the entity repository.
 *
 * Implements the storage-independent, WORKSPACE-BOUND `EntityRepository` contract
 * over Cloudflare D1 (SQLite) using prepared, parameterised statements only. The
 * repository is constructed with a single `WorkspaceContext`; every statement
 * constrains `workspace_id = ?` with that context's id, and no module-facing
 * method accepts a `workspaceId` (FND-03 / ADR-010). No caller-supplied value is
 * ever interpolated into SQL — every value is bound (AGENTS.md §17).
 *
 * FND-05 (ADR-012): every SUCCESSFUL, MEANINGFUL entity mutation appends exactly
 * one uniform Activity event, and the domain mutation and its Activity append are
 * ONE atomic D1 batch. A failed mutation writes no event; an idempotent no-op
 * (already-deleted / already-active) writes no event; and under concurrency only
 * the caller whose statement actually changed the row appends an event — the
 * append is guarded on the domain statement's `changes()` (see `D1ActivityRecorder`
 * and `recordAtomicMutation`). The trusted actor is bound at construction and is
 * never accepted through a method parameter.
 *
 * D1 specifics (rows, SQL, timestamp strings) stay inside this file and
 * `database.ts`; nothing D1-shaped escapes the public interface.
 */

import {
  ActivityError,
  buildActivityWriteModel,
  createSystemActorContext,
  secureIdGenerator as activitySecureIdGenerator,
  type ActivityActorContext,
  type NewActivityEvent,
} from "~/kernel/activity";
import {
  EntityError,
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
import { D1ActivityRecorder } from "./d1-activity-recorder";
import {
  recordAtomicMutation,
  type AtomicMutationFault,
} from "./d1-atomic-mutation";

/** Optional dependencies for the repository, injectable for deterministic tests. */
export interface D1EntityRepositoryOptions {
  /** Clock used for lifecycle AND Activity timestamps (one call per mutation). */
  readonly clock?: Clock;
  /** Id generator for new entities. Defaults to a secure UUID generator. */
  readonly idGenerator?: IdGenerator;
  /**
   * Trusted actor context recorded on every Activity event this repository
   * appends. Established at the composition boundary; defaults to the `system`
   * actor. Never sourced from a method parameter (ADR-012).
   */
  readonly actorContext?: ActivityActorContext;
  /** Id generator for Activity events. Defaults to a secure UUID generator. */
  readonly activityIdGenerator?: IdGenerator;
  /**
   * TEST-ONLY deterministic Activity-append failure injection, used to prove the
   * domain mutation is rolled back when the append fails. Never set in production.
   */
  readonly activityFault?: AtomicMutationFault;
}

/** The columns selected for every read, matching {@link EntityRow}. */
const SELECT_COLUMNS =
  "id, workspace_id, type, title, created_at, updated_at, deleted_at";

/** Built-in entity Activity event types (ADR-012). */
const ENTITY_CREATED = "entity.created";
const ENTITY_UPDATED = "entity.updated";
const ENTITY_DELETED = "entity.deleted";
const ENTITY_RESTORED = "entity.restored";

/** The role an entity plays in its own lifecycle event. */
const SUBJECT_ROLE = "subject";

/** Bounded optimistic-retry budget for `update`, so a concurrent title change
 * cannot cause a stale before/after payload. */
const MAX_UPDATE_ATTEMPTS = 5;

export class D1EntityRepository implements EntityRepository {
  readonly #db: D1Database;
  readonly #workspaceId: string;
  readonly #clock: Clock;
  readonly #newId: IdGenerator;
  readonly #actor: ActivityActorContext;
  readonly #newActivityId: IdGenerator;
  readonly #recorder: D1ActivityRecorder;
  readonly #activityFault?: AtomicMutationFault;

  constructor(
    db: D1Database,
    context: WorkspaceContext,
    options: D1EntityRepositoryOptions = {},
  ) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
    this.#clock = options.clock ?? systemClock;
    this.#newId = options.idGenerator ?? secureIdGenerator;
    this.#actor = options.actorContext ?? createSystemActorContext();
    this.#newActivityId =
      options.activityIdGenerator ?? activitySecureIdGenerator;
    this.#recorder = new D1ActivityRecorder(db);
    this.#activityFault = options.activityFault;
  }

  async create<TType extends EntityType>(
    input: CreateEntityInput<TType>,
  ): Promise<EntityRecord<TType>> {
    const { type, title } = validateCreateInput(input);
    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const id = this.#newId();

    const domainStatement = this.#db
      .prepare(
        `INSERT INTO entities
           (id, workspace_id, type, title, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL)
         RETURNING ${SELECT_COLUMNS}`,
      )
      .bind(id, this.#workspaceId, type, title, nowTs, nowTs);

    const event: NewActivityEvent = {
      type: ENTITY_CREATED,
      subjects: [{ entityId: id, role: SUBJECT_ROLE }],
      payload: { entityType: type, title },
    };

    const { row } = await this.#recordMutation(domainStatement, event, now);
    if (!row) {
      // A create we expected to insert a row produced none — storage invariant.
      throw new EntityStorageError();
    }
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
    const { title: after } = validateUpdateInput(input);

    // Read the live row for the accurate `before` title. Only live entities are
    // updatable; a row in another workspace never matches.
    let existing = await this.#findLive(entityId);
    if (!existing) {
      throw new EntityNotFoundError();
    }

    // Optimistic concurrency: the UPDATE is guarded on the `before` title, so a
    // concurrent change invalidates the attempt (0 rows changed → no event) and
    // we re-read a fresh `before`. Bounded retries prevent recording stale data.
    for (let attempt = 0; attempt < MAX_UPDATE_ATTEMPTS; attempt++) {
      const before = existing.title;
      // A submitted title identical to the stored one changes nothing meaningful:
      // this is an idempotent no-op, so return the record unchanged WITHOUT
      // advancing `updatedAt` or appending a misleading `entity.updated` event
      // whose before/after are identical (ADR-012: no-ops write no Activity). The
      // check is re-evaluated each attempt, so a concurrent update that lands on
      // the same title also resolves to a no-op instead of a spurious event.
      if (before === after) {
        return rowToEntity(existing);
      }
      const now = this.#clock();
      const nowTs = toStorageTimestamp(now);

      const domainStatement = this.#db
        .prepare(
          `UPDATE entities
             SET title = ?, updated_at = ?
           WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL AND title = ?
           RETURNING ${SELECT_COLUMNS}`,
        )
        .bind(after, nowTs, entityId, this.#workspaceId, before);

      const event: NewActivityEvent = {
        type: ENTITY_UPDATED,
        subjects: [{ entityId, role: SUBJECT_ROLE }],
        payload: { changes: { title: { before, after } } },
      };

      const { changed, row } = await this.#recordMutation(
        domainStatement,
        event,
        now,
      );
      if (changed && row) {
        return rowToEntity(row);
      }

      // The optimistic guard matched nothing: re-read. Gone/soft-deleted → the
      // entity is no longer updatable; otherwise retry with the fresh `before`.
      const refreshed = await this.#findLive(entityId);
      if (!refreshed) {
        throw new EntityNotFoundError();
      }
      existing = refreshed;
    }

    // Persistent contention exhausted the retry budget — surface as storage.
    throw new EntityStorageError();
  }

  async list<TType extends EntityType = EntityType>(
    input: ScopedListEntitiesInput<TType> = {},
  ): Promise<EntityPage<TType>> {
    const type = validateOptionalType(input.type);
    const limit = validateLimit(input.limit);
    const includeDeleted = input.includeDeleted === true;

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
      conditions.push("(created_at > ? OR (created_at = ? AND id > ?))");
      params.push(position.createdAt, position.createdAt, position.id);
    }

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
      // Idempotent no-op: already deleted → NO Activity event, no timestamp churn.
      return {
        entity: rowToEntity(existing),
        outcome: "already_deleted",
        changed: false,
      };
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const domainStatement = this.#db
      .prepare(
        `UPDATE entities
           SET deleted_at = ?, updated_at = ?
         WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL
         RETURNING ${SELECT_COLUMNS}`,
      )
      .bind(nowTs, nowTs, entityId, this.#workspaceId);

    const event: NewActivityEvent = {
      type: ENTITY_DELETED,
      subjects: [{ entityId, role: SUBJECT_ROLE }],
      payload: { entityType: existing.type, title: existing.title },
    };

    const { changed, row } = await this.#recordMutation(
      domainStatement,
      event,
      now,
    );
    if (changed && row) {
      return { entity: rowToEntity(row), outcome: "deleted", changed: true };
    }

    // A concurrent delete won the race: no row changed here, so no event was
    // appended. Re-read and return the idempotent no-op.
    const current = await this.#findAny(entityId);
    if (current && current.deleted_at !== null) {
      return {
        entity: rowToEntity(current),
        outcome: "already_deleted",
        changed: false,
      };
    }
    throw new EntityStorageError();
  }

  async restore(id: string): Promise<LifecycleResult> {
    const entityId = validateEntityId(id);

    const existing = await this.#findAny(entityId);
    if (!existing) {
      throw new EntityNotFoundError();
    }
    if (existing.deleted_at === null) {
      // Idempotent no-op: already active → NO Activity event, no timestamp churn.
      return {
        entity: rowToEntity(existing),
        outcome: "already_active",
        changed: false,
      };
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const domainStatement = this.#db
      .prepare(
        `UPDATE entities
           SET deleted_at = NULL, updated_at = ?
         WHERE id = ? AND workspace_id = ? AND deleted_at IS NOT NULL
         RETURNING ${SELECT_COLUMNS}`,
      )
      .bind(nowTs, entityId, this.#workspaceId);

    const event: NewActivityEvent = {
      type: ENTITY_RESTORED,
      subjects: [{ entityId, role: SUBJECT_ROLE }],
      payload: { entityType: existing.type, title: existing.title },
    };

    const { changed, row } = await this.#recordMutation(
      domainStatement,
      event,
      now,
    );
    if (changed && row) {
      return { entity: rowToEntity(row), outcome: "restored", changed: true };
    }

    // A concurrent restore won the race: no row changed here, so no event. Re-read.
    const current = await this.#findAny(entityId);
    if (current && current.deleted_at === null) {
      return {
        entity: rowToEntity(current),
        outcome: "already_active",
        changed: false,
      };
    }
    throw new EntityStorageError();
  }

  /**
   * Run a domain mutation and its Activity append atomically. Builds the validated
   * write model (throwing a typed Activity error BEFORE any storage access on
   * invalid input), then executes the one batch. Kernel errors propagate as-is; a
   * raw D1 failure (including a forced rollback) is mapped to `EntityStorageError`
   * so no database detail escapes.
   */
  async #recordMutation(
    domainStatement: D1PreparedStatement,
    event: NewActivityEvent,
    now: Date,
  ): Promise<{ changed: boolean; row: EntityRow | null }> {
    try {
      const model = buildActivityWriteModel(
        event,
        this.#actor.actor,
        this.#newActivityId(),
        now,
      );
      return await recordAtomicMutation<EntityRow>({
        db: this.#db,
        workspaceId: this.#workspaceId,
        domainStatement,
        recorder: this.#recorder,
        model,
        fault: this.#activityFault,
      });
    } catch (cause) {
      if (cause instanceof EntityError || cause instanceof ActivityError) {
        throw cause;
      }
      throw new EntityStorageError(undefined, { cause });
    }
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

  /** Find a LIVE row by id within the bound workspace. */
  async #findLive(id: string): Promise<EntityRow | null> {
    return this.#first(
      this.#db
        .prepare(
          `SELECT ${SELECT_COLUMNS} FROM entities
           WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL`,
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
