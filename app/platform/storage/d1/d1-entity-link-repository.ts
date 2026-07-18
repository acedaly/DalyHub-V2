/**
 * FND-04/FND-05 EntityLinks — D1 implementation of the link repository.
 *
 * Implements the storage-independent, WORKSPACE-BOUND `EntityLinkRepository`
 * contract over Cloudflare D1 (SQLite) using prepared, parameterised statements
 * only. The repository is constructed with a single `WorkspaceContext`; every
 * statement constrains `workspace_id = ?` with that context's id, both endpoints
 * of every link are checked in the bound workspace, and no module-facing method
 * accepts a `workspaceId` (ADR-010/ADR-011). No caller-supplied value is ever
 * interpolated into SQL — every value is bound (AGENTS.md §17).
 *
 * FND-05 (ADR-012): every SUCCESSFUL, MEANINGFUL link mutation appends exactly one
 * uniform Activity event, atomically with the domain mutation, and BOTH endpoints
 * are Activity subjects (`source` and `target`) — so a single link event appears
 * in both endpoints' timelines while remaining one event. Idempotent no-ops
 * (`already_exists`, `already_unlinked`, `already_active`) append nothing; under
 * concurrency only the caller whose statement actually changed the row appends an
 * event (the append is guarded on the domain statement's `changes()`). The trusted
 * actor is bound at construction, never accepted through a method parameter.
 *
 * D1 specifics stay inside this file, `database.ts` and `entity-link-database.ts`.
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
  EntityLinkConflictError,
  EntityLinkEndpointNotFoundError,
  EntityLinkError,
  EntityLinkNotFoundError,
  EntityLinkStorageError,
  secureIdGenerator,
  systemClock,
  type Clock,
  type CreateEntityLinkInput,
  type CreateEntityLinkResult,
  type EntityLinkLifecycleResult,
  type EntityLinkPage,
  type EntityLinkRecord,
  type EntityLinkRepository,
  type GetEntityLinkOptions,
  type IdGenerator,
  type ListEntityLinksInput,
} from "~/kernel/entity-links";
import {
  decodeEntityLinkCursorForScope,
  encodeEntityLinkCursor,
  type EntityLinkCursorPosition,
  type EntityLinkCursorScope,
} from "~/kernel/entity-links/entity-link-cursor";
import {
  validateCreateEntityLinkInput,
  validateDirectionFilter,
  validateEntityLinkId,
  validateLinkLimit,
  validateOptionalLinkType,
} from "~/kernel/entity-links/entity-link-validation";
import type { EntityLinkDirectionFilter } from "~/kernel/entity-links";
import type { WorkspaceContext } from "~/kernel/workspaces";

import { toStorageTimestamp } from "./database";
import { D1ActivityRecorder } from "./d1-activity-recorder";
import {
  recordAtomicMutation,
  type AtomicMutationFault,
} from "./d1-atomic-mutation";
import {
  rowToEntityLink,
  viewRowToEntityLinkView,
  type EntityLinkRow,
  type EntityLinkViewRow,
} from "./entity-link-database";

/** Optional dependencies for the repository, injectable for deterministic tests. */
export interface D1EntityLinkRepositoryOptions {
  /** Clock used for lifecycle AND Activity timestamps (one call per mutation). */
  readonly clock?: Clock;
  /** Id generator for new links. Defaults to a secure UUID generator. */
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

/** The link columns selected for every direct read, matching {@link EntityLinkRow}. */
const LINK_COLUMNS =
  "id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at";

/** Built-in EntityLink Activity event types (ADR-012). */
const LINK_CREATED = "entity_link.created";
const LINK_UNLINKED = "entity_link.unlinked";
const LINK_RESTORED = "entity_link.restored";

/** The roles the two endpoints play in a link event. */
const ROLE_SOURCE = "source";
const ROLE_TARGET = "target";

/** The stable identity of a link, used to build a link Activity event. */
interface LinkIdentity {
  readonly id: string;
  readonly sourceEntityId: string;
  readonly targetEntityId: string;
  readonly type: string;
}

const OUTGOING_PROJECTION = `
  l.id AS link_id,
  l.workspace_id AS link_workspace_id,
  l.source_entity_id AS link_source_entity_id,
  l.target_entity_id AS link_target_entity_id,
  l.type AS link_type,
  l.created_at AS link_created_at,
  l.updated_at AS link_updated_at,
  l.deleted_at AS link_deleted_at,
  'outgoing' AS direction,
  e.id AS cp_id,
  e.workspace_id AS cp_workspace_id,
  e.type AS cp_type,
  e.title AS cp_title,
  e.created_at AS cp_created_at,
  e.updated_at AS cp_updated_at,
  e.deleted_at AS cp_deleted_at`;

const INCOMING_PROJECTION = OUTGOING_PROJECTION.replace(
  "'outgoing' AS direction",
  "'incoming' AS direction",
);

/** True when a raw D1 failure is a UNIQUE-constraint violation (the duplicate
 * backstop firing), so create can reconcile instead of surfacing an error. */
function isUniqueConstraintViolation(cause: unknown): boolean {
  const message = cause instanceof Error ? cause.message : String(cause);
  return /UNIQUE constraint failed/i.test(message);
}

export class D1EntityLinkRepository implements EntityLinkRepository {
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
    options: D1EntityLinkRepositoryOptions = {},
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

  async create(input: CreateEntityLinkInput): Promise<CreateEntityLinkResult> {
    // 1-2. Validate all inputs and reject self-links BEFORE any storage access.
    const { sourceEntityId, targetEntityId, type } =
      validateCreateEntityLinkInput(input);

    // 3-4. Both endpoints must exist, be active, and be in the bound workspace.
    // Re-asserted atomically in the INSERT (below), so a concurrent soft-delete
    // cannot slip a link past the active-endpoint requirement.
    await this.#requireEndpointsActive(sourceEntityId, targetEntityId);

    // 5. An existing exact relationship (any lifecycle state) reuses its row/id.
    const existing = await this.#findExact(
      sourceEntityId,
      targetEntityId,
      type,
    );
    if (existing) {
      return this.#reconcileExisting(existing);
    }

    // 6. Otherwise insert a new relationship row, atomically appending the
    // `entity_link.created` event with BOTH endpoints as subjects. The generated
    // id is validated at the boundary; an invalid id throws before any write.
    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const id = validateEntityLinkId(this.#newId());
    const identity: LinkIdentity = {
      id,
      sourceEntityId,
      targetEntityId,
      type,
    };

    const domainStatement = this.#db
      .prepare(
        `INSERT INTO entity_links
           (id, workspace_id, source_entity_id, target_entity_id, type,
            created_at, updated_at, deleted_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, NULL
         WHERE EXISTS (
                 SELECT 1 FROM entities
                 WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL
               )
           AND EXISTS (
                 SELECT 1 FROM entities
                 WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL
               )
         RETURNING ${LINK_COLUMNS}`,
      )
      .bind(
        id,
        this.#workspaceId,
        sourceEntityId,
        targetEntityId,
        type,
        nowTs,
        nowTs,
        this.#workspaceId,
        sourceEntityId,
        this.#workspaceId,
        targetEntityId,
      );

    try {
      const model = buildActivityWriteModel(
        this.#linkEvent(LINK_CREATED, identity),
        this.#actor.actor,
        this.#newActivityId(),
        now,
      );
      const { changed, row } = await recordAtomicMutation<EntityLinkRow>({
        db: this.#db,
        workspaceId: this.#workspaceId,
        domainStatement,
        recorder: this.#recorder,
        model,
        fault: this.#activityFault,
      });
      if (changed && row) {
        return {
          link: rowToEntityLink(row),
          outcome: "created",
          created: true,
        };
      }
      // Nothing inserted and no UNIQUE violation: an endpoint is no longer active
      // (a concurrent soft-delete raced the pre-check). Fail safely and
      // indistinguishably from a nonexistent/cross-workspace endpoint.
      throw new EntityLinkEndpointNotFoundError();
    } catch (cause) {
      if (cause instanceof EntityLinkError || cause instanceof ActivityError) {
        throw cause;
      }
      // A concurrent create won the race: the uniqueness index is the final
      // backstop, so the whole batch (link + event) rolled back. Re-read and
      // reconcile so duplicates cannot produce two rows or two events.
      if (isUniqueConstraintViolation(cause)) {
        const raced = await this.#findExact(
          sourceEntityId,
          targetEntityId,
          type,
        );
        if (raced) {
          return this.#reconcileExisting(raced);
        }
        throw new EntityLinkConflictError(undefined, { cause });
      }
      throw new EntityLinkStorageError(undefined, { cause });
    }
  }

  async getById(
    id: string,
    options: GetEntityLinkOptions = {},
  ): Promise<EntityLinkRecord | null> {
    const linkId = validateEntityLinkId(id);
    const deletedClause = options.includeUnlinked
      ? ""
      : " AND deleted_at IS NULL";
    const row = await this.#first(
      this.#db
        .prepare(
          `SELECT ${LINK_COLUMNS} FROM entity_links
           WHERE id = ? AND workspace_id = ?${deletedClause}`,
        )
        .bind(linkId, this.#workspaceId),
    );
    return row ? rowToEntityLink(row) : null;
  }

  async listForEntity(
    entityId: string,
    input: ListEntityLinksInput = {},
  ): Promise<EntityLinkPage> {
    const anchorId = validateEntityLinkId(entityId);
    const direction = validateDirectionFilter(input.direction);
    const type = validateOptionalLinkType(input.type);
    const limit = validateLinkLimit(input.limit);

    await this.#requireAnchorActive(anchorId);

    const scope: EntityLinkCursorScope = {
      workspaceId: this.#workspaceId,
      anchorEntityId: anchorId,
      direction,
      type: type ?? null,
    };

    let position: EntityLinkCursorPosition | undefined;
    if (input.cursor !== undefined) {
      position = decodeEntityLinkCursorForScope(input.cursor, scope);
    }

    const fetchLimit = limit + 1;
    const { sql, params } = this.#buildListQuery(
      anchorId,
      direction,
      type,
      position,
      fetchLimit,
    );

    const rows = await this.#allViews(this.#db.prepare(sql).bind(...params));

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const items = pageRows.map(viewRowToEntityLinkView);
    const last = pageRows.at(-1);
    const nextCursor =
      hasMore && last
        ? encodeEntityLinkCursor(scope, {
            createdAt: last.link_created_at,
            id: last.link_id,
          })
        : null;

    return { items, nextCursor, hasMore };
  }

  async unlink(id: string): Promise<EntityLinkLifecycleResult> {
    const linkId = validateEntityLinkId(id);

    // Read first so the `entity_link.unlinked` event carries the link's endpoints
    // (its subjects) and identity. Unknown id / other workspace → not found.
    const existing = await this.#findById(linkId);
    if (!existing) {
      throw new EntityLinkNotFoundError();
    }
    if (existing.deleted_at !== null) {
      // Idempotent no-op: already unlinked → NO event, no timestamp churn.
      return {
        link: rowToEntityLink(existing),
        outcome: "already_unlinked",
        changed: false,
      };
    }

    // Attempt the transition atomically: only an ACTIVE row is affected. The
    // conditional UPDATE plus SQLite's serialised writes make concurrent/retried
    // unlinks safe — only the winner changes a row and appends an event.
    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const domainStatement = this.#db
      .prepare(
        `UPDATE entity_links
           SET deleted_at = ?, updated_at = ?
         WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL
         RETURNING ${LINK_COLUMNS}`,
      )
      .bind(nowTs, nowTs, linkId, this.#workspaceId);

    const { changed, row } = await this.#recordLinkMutation(
      domainStatement,
      this.#linkEvent(LINK_UNLINKED, existing),
      now,
    );
    if (changed && row) {
      return { link: rowToEntityLink(row), outcome: "unlinked", changed: true };
    }

    // A concurrent unlink won: no row changed here, so no event. Re-read and keep
    // it idempotent.
    const current = await this.#findById(linkId);
    if (!current) {
      throw new EntityLinkNotFoundError();
    }
    return {
      link: rowToEntityLink(current),
      outcome: "already_unlinked",
      changed: false,
    };
  }

  async restore(id: string): Promise<EntityLinkLifecycleResult> {
    const linkId = validateEntityLinkId(id);

    const existing = await this.#findById(linkId);
    if (!existing) {
      throw new EntityLinkNotFoundError();
    }
    if (existing.deleted_at === null) {
      // Idempotent no-op: already active → NO event, no endpoint requirement.
      return {
        link: rowToEntityLink(existing),
        outcome: "already_active",
        changed: false,
      };
    }

    // The active-endpoint requirement is enforced ATOMICALLY inside the restore
    // UPDATE, and the `entity_link.restored` event is appended in the same batch.
    const now = this.#clock();
    const row = await this.#restoreWithActivity(existing, now);
    if (row) {
      return { link: rowToEntityLink(row), outcome: "restored", changed: true };
    }

    // The conditional UPDATE matched no row. Re-read and classify safely.
    return this.#classifyFailedRestore(linkId, (link) => ({
      link,
      outcome: "already_active",
      changed: false,
    }));
  }

  /**
   * Reconcile an existing exact relationship for `create`: an active row is an
   * idempotent `already_exists` (NO event); an unlinked row is restored IN PLACE
   * (same id) to `restored` — appending `entity_link.restored` in the same atomic
   * batch — but ONLY when both endpoints are still active.
   */
  async #reconcileExisting(
    existing: EntityLinkRow,
  ): Promise<CreateEntityLinkResult> {
    if (existing.deleted_at === null) {
      return {
        link: rowToEntityLink(existing),
        outcome: "already_exists",
        created: false,
      };
    }
    const now = this.#clock();
    const row = await this.#restoreWithActivity(existing, now);
    if (row) {
      return {
        link: rowToEntityLink(row),
        outcome: "restored",
        created: false,
      };
    }

    // The conditional restore matched no row. Re-read and classify safely.
    return this.#classifyFailedRestore(existing.id, (link) => ({
      link,
      outcome: "already_exists",
      created: false,
    }));
  }

  /**
   * Restore an unlinked link IN PLACE (same id) when both endpoints are still
   * active, appending `entity_link.restored` atomically. The endpoint-active
   * requirement and the `deleted_at IS NOT NULL` race guard live in the SAME
   * UPDATE; the event is appended only when that UPDATE actually re-activates the
   * row (`changes() > 0`). Returns the refreshed row, or null when nothing matched
   * (already active, an endpoint inactive, or the row vanished).
   */
  async #restoreWithActivity(
    existing: EntityLinkRow,
    now: Date,
  ): Promise<EntityLinkRow | null> {
    const nowTs = toStorageTimestamp(now);
    const domainStatement = this.#db
      .prepare(
        `UPDATE entity_links
           SET deleted_at = NULL, updated_at = ?
         WHERE id = ? AND workspace_id = ? AND deleted_at IS NOT NULL
           AND EXISTS (
                 SELECT 1 FROM entities
                 WHERE workspace_id = entity_links.workspace_id
                   AND id = entity_links.source_entity_id
                   AND deleted_at IS NULL
               )
           AND EXISTS (
                 SELECT 1 FROM entities
                 WHERE workspace_id = entity_links.workspace_id
                   AND id = entity_links.target_entity_id
                   AND deleted_at IS NULL
               )
         RETURNING ${LINK_COLUMNS}`,
      )
      .bind(nowTs, existing.id, this.#workspaceId);

    const { changed, row } = await this.#recordLinkMutation(
      domainStatement,
      this.#linkEvent(LINK_RESTORED, existing),
      now,
    );
    return changed ? row : null;
  }

  /**
   * Determine why a conditional restore UPDATE affected no row and return a safe
   * outcome — the link is now active (a concurrent restore won → the caller's
   * idempotent already-active outcome), still unlinked (an endpoint is
   * missing/inactive → `EntityLinkEndpointNotFoundError`), or gone (not expected —
   * a typed `EntityLinkConflictError`).
   */
  async #classifyFailedRestore<T>(
    id: string,
    onAlreadyActive: (link: EntityLinkRecord) => T,
  ): Promise<T> {
    const current = await this.#findById(id);
    if (current && current.deleted_at === null) {
      return onAlreadyActive(rowToEntityLink(current));
    }
    if (current) {
      throw new EntityLinkEndpointNotFoundError();
    }
    throw new EntityLinkConflictError();
  }

  /** Build the (possibly UNION ALL) listing query for the requested direction. */
  #buildListQuery(
    anchorId: string,
    direction: EntityLinkDirectionFilter,
    type: string | undefined,
    position: EntityLinkCursorPosition | undefined,
    fetchLimit: number,
  ): { sql: string; params: unknown[] } {
    const parts: string[] = [];
    const params: unknown[] = [];

    if (direction === "outgoing" || direction === "both") {
      const sub = this.#buildDirectionSubquery(
        "outgoing",
        anchorId,
        type,
        position,
      );
      parts.push(sub.sql);
      params.push(...sub.params);
    }
    if (direction === "incoming" || direction === "both") {
      const sub = this.#buildDirectionSubquery(
        "incoming",
        anchorId,
        type,
        position,
      );
      parts.push(sub.sql);
      params.push(...sub.params);
    }

    const combined =
      parts.length === 1
        ? parts[0]!
        : `SELECT * FROM (${parts.join(" UNION ALL ")})`;
    const sql = `${combined} ORDER BY link_created_at ASC, link_id ASC LIMIT ?`;
    params.push(fetchLimit);
    return { sql, params };
  }

  /** Build one direction's SELECT + its bound params (no ORDER BY / LIMIT). */
  #buildDirectionSubquery(
    kind: "outgoing" | "incoming",
    anchorId: string,
    type: string | undefined,
    position: EntityLinkCursorPosition | undefined,
  ): { sql: string; params: unknown[] } {
    const outgoing = kind === "outgoing";
    const projection = outgoing ? OUTGOING_PROJECTION : INCOMING_PROJECTION;
    const anchorColumn = outgoing ? "source_entity_id" : "target_entity_id";
    const counterpartColumn = outgoing
      ? "target_entity_id"
      : "source_entity_id";

    const conditions = [
      "l.workspace_id = ?",
      `l.${anchorColumn} = ?`,
      "l.deleted_at IS NULL",
      "e.deleted_at IS NULL",
    ];
    const params: unknown[] = [this.#workspaceId, anchorId];

    if (type !== undefined) {
      conditions.push("l.type = ?");
      params.push(type);
    }
    if (position) {
      conditions.push("(l.created_at > ? OR (l.created_at = ? AND l.id > ?))");
      params.push(position.createdAt, position.createdAt, position.id);
    }

    const sql = `SELECT ${projection}
      FROM entity_links l
      JOIN entities e
        ON e.workspace_id = l.workspace_id AND e.id = l.${counterpartColumn}
      WHERE ${conditions.join(" AND ")}`;
    return { sql, params };
  }

  /** Build a link Activity event from a link's stable identity, with both
   * endpoints as subjects (`source` and `target`). */
  #linkEvent(
    type: string,
    link: LinkIdentity | EntityLinkRow,
  ): NewActivityEvent {
    const sourceEntityId =
      "sourceEntityId" in link ? link.sourceEntityId : link.source_entity_id;
    const targetEntityId =
      "targetEntityId" in link ? link.targetEntityId : link.target_entity_id;
    return {
      type,
      subjects: [
        { entityId: sourceEntityId, role: ROLE_SOURCE },
        { entityId: targetEntityId, role: ROLE_TARGET },
      ],
      payload: {
        linkId: link.id,
        linkType: link.type,
        sourceEntityId,
        targetEntityId,
      },
    };
  }

  /**
   * Run a link domain mutation and its Activity append atomically. Kernel errors
   * propagate as-is; a raw D1 failure (including a forced rollback) is mapped to
   * `EntityLinkStorageError`. Used for unlink/restore; `create` handles its own
   * try/catch so it can detect the UNIQUE-constraint race and reconcile.
   */
  async #recordLinkMutation(
    domainStatement: D1PreparedStatement,
    event: NewActivityEvent,
    now: Date,
  ): Promise<{ changed: boolean; row: EntityLinkRow | null }> {
    try {
      const model = buildActivityWriteModel(
        event,
        this.#actor.actor,
        this.#newActivityId(),
        now,
      );
      return await recordAtomicMutation<EntityLinkRow>({
        db: this.#db,
        workspaceId: this.#workspaceId,
        domainStatement,
        recorder: this.#recorder,
        model,
        fault: this.#activityFault,
      });
    } catch (cause) {
      if (cause instanceof EntityLinkError || cause instanceof ActivityError) {
        throw cause;
      }
      throw new EntityLinkStorageError(undefined, { cause });
    }
  }

  /** Find an exact relationship by identity tuple within the bound workspace,
   * regardless of lifecycle state. */
  async #findExact(
    sourceEntityId: string,
    targetEntityId: string,
    type: string,
  ): Promise<EntityLinkRow | null> {
    return this.#first(
      this.#db
        .prepare(
          `SELECT ${LINK_COLUMNS} FROM entity_links
           WHERE workspace_id = ? AND source_entity_id = ?
             AND target_entity_id = ? AND type = ?`,
        )
        .bind(this.#workspaceId, sourceEntityId, targetEntityId, type),
    );
  }

  /** Find a link by id within the bound workspace, regardless of lifecycle state. */
  async #findById(id: string): Promise<EntityLinkRow | null> {
    return this.#first(
      this.#db
        .prepare(
          `SELECT ${LINK_COLUMNS} FROM entity_links
           WHERE id = ? AND workspace_id = ?`,
        )
        .bind(id, this.#workspaceId),
    );
  }

  /** Require both endpoint entities to exist, be active, and be in the bound
   * workspace. A missing/soft-deleted/cross-workspace endpoint is reported
   * identically, disclosing nothing about other workspaces. */
  async #requireEndpointsActive(
    sourceEntityId: string,
    targetEntityId: string,
  ): Promise<void> {
    let ids: Set<string>;
    try {
      const { results } = await this.#db
        .prepare(
          `SELECT id FROM entities
           WHERE workspace_id = ? AND deleted_at IS NULL AND id IN (?, ?)`,
        )
        .bind(this.#workspaceId, sourceEntityId, targetEntityId)
        .all<{ id: string }>();
      ids = new Set(results.map((r) => r.id));
    } catch (cause) {
      throw new EntityLinkStorageError(undefined, { cause });
    }
    if (!ids.has(sourceEntityId) || !ids.has(targetEntityId)) {
      throw new EntityLinkEndpointNotFoundError();
    }
  }

  /** Require the anchor entity to exist and be active in the bound workspace. */
  async #requireAnchorActive(entityId: string): Promise<void> {
    let present: boolean;
    try {
      const row = await this.#db
        .prepare(
          `SELECT 1 AS present FROM entities
           WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1`,
        )
        .bind(this.#workspaceId, entityId)
        .first<{ present: number }>();
      present = row !== null;
    } catch (cause) {
      throw new EntityLinkStorageError(undefined, { cause });
    }
    if (!present) {
      throw new EntityLinkEndpointNotFoundError();
    }
  }

  /** Run a statement returning at most one link row, mapping D1 failures. */
  async #first(statement: D1PreparedStatement): Promise<EntityLinkRow | null> {
    try {
      return await statement.first<EntityLinkRow>();
    } catch (cause) {
      throw new EntityLinkStorageError(undefined, { cause });
    }
  }

  /** Run a listing statement returning many view rows, mapping D1 failures. */
  async #allViews(
    statement: D1PreparedStatement,
  ): Promise<EntityLinkViewRow[]> {
    try {
      const { results } = await statement.all<EntityLinkViewRow>();
      return results;
    } catch (cause) {
      throw new EntityLinkStorageError(undefined, { cause });
    }
  }
}
