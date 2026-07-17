/**
 * FND-04 EntityLinks — D1 implementation of the link repository.
 *
 * Implements the storage-independent, WORKSPACE-BOUND `EntityLinkRepository`
 * contract over Cloudflare D1 (SQLite) using prepared, parameterised statements
 * only. The repository is constructed with a single `WorkspaceContext`; every
 * statement constrains `workspace_id = ?` with that context's id, both endpoints
 * of every link are checked in the bound workspace, and no module-facing method
 * accepts a `workspaceId` (ADR-010/ADR-011). No caller-supplied value is ever
 * interpolated into SQL — every value is bound (AGENTS.md §17). D1 specifics
 * (rows, SQL, timestamp strings) stay inside this file, `database.ts` and
 * `entity-link-database.ts`; nothing D1-shaped escapes the public interface.
 */

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
import {
  rowToEntityLink,
  viewRowToEntityLinkView,
  type EntityLinkRow,
  type EntityLinkViewRow,
} from "./entity-link-database";

/** Optional dependencies for the repository, injectable for deterministic tests. */
export interface D1EntityLinkRepositoryOptions {
  /** Clock used for lifecycle timestamps. Defaults to the system clock. */
  readonly clock?: Clock;
  /** Id generator for new links. Defaults to a secure UUID generator. */
  readonly idGenerator?: IdGenerator;
}

/** The link columns selected for every direct read, matching {@link EntityLinkRow}. */
const LINK_COLUMNS =
  "id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at";

/**
 * Projection for the OUTGOING branch of a listing: the anchor is the link's
 * source, so the counterpart `e` is the target. `'outgoing'` is a fixed literal
 * chosen by the code, never caller input.
 */
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

/** Projection for the INCOMING branch: the anchor is the target, so the
 * counterpart `e` is the source. */
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

  constructor(
    db: D1Database,
    context: WorkspaceContext,
    options: D1EntityLinkRepositoryOptions = {},
  ) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
    this.#clock = options.clock ?? systemClock;
    this.#newId = options.idGenerator ?? secureIdGenerator;
  }

  async create(input: CreateEntityLinkInput): Promise<CreateEntityLinkResult> {
    // 1-2. Validate all inputs and reject self-links BEFORE any storage access.
    const { sourceEntityId, targetEntityId, type } =
      validateCreateEntityLinkInput(input);

    // 3-4. Both endpoints must exist, be active, and be in the bound workspace.
    // This pre-check gives a clear, ordered endpoint-not-found for the common
    // cases (including the already-exists no-op path below). It is NOT relied on
    // alone: the INSERT and the restore UPDATE re-assert the same condition in
    // the SAME statement, so an endpoint soft-deleted between this check and the
    // write cannot slip a link past the active-endpoint requirement.
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

    // 6. Otherwise insert a new relationship row. Validate the GENERATED id at
    // the boundary too: the id generator is injectable and could return an
    // invalid value, so it is checked before any write — an invalid id throws
    // `EntityLinkValidationError` and nothing is inserted.
    const now = toStorageTimestamp(this.#clock());
    const id = validateEntityLinkId(this.#newId());
    try {
      // ATOMIC endpoint enforcement: the row is inserted only when BOTH endpoints
      // still exist, are active, and belong to the bound workspace, checked in
      // the same statement via `WHERE EXISTS (...) AND EXISTS (...)`. If either
      // endpoint was soft-deleted since the pre-check, the SELECT yields no row,
      // nothing is inserted, and RETURNING comes back empty.
      const row = await this.#db
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
          now,
          now,
          this.#workspaceId,
          sourceEntityId,
          this.#workspaceId,
          targetEntityId,
        )
        .first<EntityLinkRow>();
      if (row) {
        return {
          link: rowToEntityLink(row),
          outcome: "created",
          created: true,
        };
      }
      // Nothing was inserted and no UNIQUE violation was thrown, so an endpoint
      // is no longer active (a concurrent soft-delete raced the pre-check). Fail
      // safely and indistinguishably from a nonexistent/cross-workspace endpoint.
      throw new EntityLinkEndpointNotFoundError();
    } catch (cause) {
      if (cause instanceof EntityLinkError) {
        throw cause;
      }
      // A concurrent create won the race: the uniqueness index is the final
      // backstop. Re-read and reconcile so duplicates cannot produce two rows.
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

    // The anchor entity must exist and be active in the bound workspace.
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

    // Attempt the transition atomically: only an ACTIVE row in this workspace is
    // affected. Doing the conditional UPDATE first (rather than read-then-write)
    // makes concurrent/retried unlinks safe — SQLite serialises the writes.
    const now = toStorageTimestamp(this.#clock());
    const updated = await this.#first(
      this.#db
        .prepare(
          `UPDATE entity_links
             SET deleted_at = ?, updated_at = ?
           WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL
           RETURNING ${LINK_COLUMNS}`,
        )
        .bind(now, now, linkId, this.#workspaceId),
    );
    if (updated) {
      return {
        link: rowToEntityLink(updated),
        outcome: "unlinked",
        changed: true,
      };
    }

    // No active row matched. Re-read to distinguish "unknown id / other
    // workspace" (not found) from "already unlinked" — the latter includes the
    // loser of a concurrent unlink race, kept idempotent rather than erroring.
    const existing = await this.#findById(linkId);
    if (!existing) {
      throw new EntityLinkNotFoundError();
    }
    return {
      link: rowToEntityLink(existing),
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
      // Idempotent: already active, nothing to restore, no endpoint requirement.
      return {
        link: rowToEntityLink(existing),
        outcome: "already_active",
        changed: false,
      };
    }

    // The active-endpoint requirement is enforced ATOMICALLY inside the restore
    // UPDATE (not via a separate pre-check that could go stale): the row is
    // re-activated only when both of ITS endpoints are still active.
    const now = toStorageTimestamp(this.#clock());
    const row = await this.#clearDeletedAtIfEndpointsActive(linkId, now);
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
   * idempotent `already_exists`; an unlinked row is restored IN PLACE (same id)
   * to `restored`, but ONLY when both of its endpoints are still active — the
   * restore UPDATE enforces that in the same statement.
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
    const now = toStorageTimestamp(this.#clock());
    const row = await this.#clearDeletedAtIfEndpointsActive(existing.id, now);
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
   * Determine why a conditional restore UPDATE affected no row and return a safe
   * outcome. Called only after an `UPDATE ... deleted_at IS NOT NULL AND
   * <endpoints active>` matched nothing, so exactly one of these holds:
   *   - the link is now active (a concurrent restore won the race) → the caller's
   *     idempotent already-active outcome, built by `onAlreadyActive`;
   *   - the link is still unlinked → an endpoint is missing/soft-deleted/cross-
   *     workspace, so restoration fails safely as `EntityLinkEndpointNotFoundError`;
   *   - the row is gone (not expected — there is no hard-delete) → a typed
   *     `EntityLinkConflictError`, never a generic invariant failure.
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
      // Still unlinked → the endpoint-active EXISTS clauses failed.
      throw new EntityLinkEndpointNotFoundError();
    }
    throw new EntityLinkConflictError();
  }

  /**
   * Clear `deleted_at` on an unlinked link in the bound workspace, but ONLY when
   * both of the link's endpoints currently exist, are active, and are in the same
   * workspace — enforced atomically via correlated `EXISTS` sub-selects in the
   * same UPDATE. Returns the refreshed row, or null when nothing matched (already
   * active, an endpoint inactive, or the row is gone). The `deleted_at IS NOT
   * NULL` guard also makes concurrent restores race-safe.
   */
  async #clearDeletedAtIfEndpointsActive(
    id: string,
    now: string,
  ): Promise<EntityLinkRow | null> {
    return this.#first(
      this.#db
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
        .bind(now, id, this.#workspaceId),
    );
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
    // The anchor is compared against the source (outgoing) or target (incoming);
    // the counterpart entity `e` is joined on the opposite endpoint.
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
