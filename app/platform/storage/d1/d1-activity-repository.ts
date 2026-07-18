/**
 * FND-05 Activity — D1 implementation of the read-only Activity repository.
 *
 * Implements the storage-independent, WORKSPACE-BOUND, READ-ONLY
 * `ActivityRepository` over Cloudflare D1 (SQLite) using prepared, parameterised
 * statements only. The repository is constructed with a single `WorkspaceContext`;
 * every statement constrains `workspace_id = ?` with that context's id, and no
 * method accepts a `workspaceId` (ADR-010/ADR-012). There is no write path here —
 * events are appended only atomically by the mutation repositories via the
 * recording seam. No caller-supplied value is ever interpolated into SQL.
 *
 * Both listings avoid N+1: a page of events is fetched with one query, then ALL
 * subjects for that page are fetched with a single `activity_id IN (...)` query and
 * grouped in memory — never one subject query per event. D1 specifics (rows, SQL,
 * JSON text) stay inside this file and `activity-database.ts`.
 */

import {
  ActivityStorageError,
  ActivitySubjectUnavailableError,
  validateActivityId,
  validateActivityLimit,
  validateOptionalActivityType,
  validateSubjectEntityId,
  type ActivityPage,
  type ActivityRecord,
  type ActivityRepository,
  type ListEntityActivityInput,
  type ListWorkspaceActivityInput,
} from "~/kernel/activity";
import {
  decodeActivityCursorForScope,
  encodeActivityCursor,
  type ActivityCursorPosition,
  type ActivityCursorScope,
} from "~/kernel/activity";
import type { WorkspaceContext } from "~/kernel/workspaces";

import {
  rowToActivity,
  type ActivityRow,
  type ActivitySubjectRow,
} from "./activity-database";

/** The activity columns selected for every read, matching {@link ActivityRow}. */
const ACTIVITY_COLUMNS =
  "id, workspace_id, type, actor_type, actor_id, occurred_at, payload_json";

/** Same columns, aliased to a table for the entity-Timeline JOIN. */
const ACTIVITY_COLUMNS_A =
  "a.id, a.workspace_id, a.type, a.actor_type, a.actor_id, a.occurred_at, a.payload_json";

export class D1ActivityRepository implements ActivityRepository {
  readonly #db: D1Database;
  readonly #workspaceId: string;

  constructor(db: D1Database, context: WorkspaceContext) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
  }

  async getById(id: string): Promise<ActivityRecord | null> {
    const activityId = validateActivityId(id);
    const row = await this.#firstActivity(
      this.#db
        .prepare(
          `SELECT ${ACTIVITY_COLUMNS} FROM activities
           WHERE id = ? AND workspace_id = ?`,
        )
        .bind(activityId, this.#workspaceId),
    );
    if (!row) {
      return null;
    }
    const subjectsByActivity = await this.#fetchSubjects([row.id]);
    return rowToActivity(row, subjectsByActivity.get(row.id) ?? []);
  }

  async listForWorkspace(
    input: ListWorkspaceActivityInput = {},
  ): Promise<ActivityPage> {
    const type = validateOptionalActivityType(input.type);
    const limit = validateActivityLimit(input.limit);

    const scope: ActivityCursorScope = {
      workspaceId: this.#workspaceId,
      scope: "workspace",
      entityId: null,
      type: type ?? null,
    };

    const conditions: string[] = ["workspace_id = ?"];
    const params: unknown[] = [this.#workspaceId];
    if (type !== undefined) {
      conditions.push("type = ?");
      params.push(type);
    }
    this.#applyKeyset(input.cursor, scope, conditions, params, "");

    const fetchLimit = limit + 1;
    params.push(fetchLimit);

    const rows = await this.#allActivities(
      this.#db
        .prepare(
          `SELECT ${ACTIVITY_COLUMNS} FROM activities
           WHERE ${conditions.join(" AND ")}
           ORDER BY occurred_at DESC, id DESC
           LIMIT ?`,
        )
        .bind(...params),
    );

    return this.#assemblePage(rows, limit, scope);
  }

  async listForEntity(
    entityId: string,
    input: ListEntityActivityInput = {},
  ): Promise<ActivityPage> {
    const anchorId = validateSubjectEntityId(entityId);
    const type = validateOptionalActivityType(input.type);
    const limit = validateActivityLimit(input.limit);

    // The anchor entity must exist in the bound workspace. It may be active OR
    // soft-deleted — a deleted entity's Timeline remains queryable — so this
    // check does NOT filter on deleted_at. A cross-workspace/nonexistent anchor
    // is reported identically, disclosing nothing about other workspaces.
    await this.#requireEntityExists(anchorId);

    const scope: ActivityCursorScope = {
      workspaceId: this.#workspaceId,
      scope: "entity",
      entityId: anchorId,
      type: type ?? null,
    };

    const conditions: string[] = ["s.workspace_id = ?", "s.entity_id = ?"];
    const params: unknown[] = [this.#workspaceId, anchorId];
    if (type !== undefined) {
      conditions.push("a.type = ?");
      params.push(type);
    }
    this.#applyKeyset(input.cursor, scope, conditions, params, "a.");

    const fetchLimit = limit + 1;
    params.push(fetchLimit);

    const rows = await this.#allActivities(
      this.#db
        .prepare(
          `SELECT ${ACTIVITY_COLUMNS_A}
           FROM activity_subjects s
           JOIN activities a
             ON a.workspace_id = s.workspace_id AND a.id = s.activity_id
           WHERE ${conditions.join(" AND ")}
           ORDER BY a.occurred_at DESC, a.id DESC
           LIMIT ?`,
        )
        .bind(...params),
    );

    return this.#assemblePage(rows, limit, scope);
  }

  /** Append the newest-first keyset predicate for a cursor, if present. `prefix`
   * qualifies the columns (e.g. `"a."`) when they come from a joined table. */
  #applyKeyset(
    cursor: string | undefined,
    scope: ActivityCursorScope,
    conditions: string[],
    params: unknown[],
    prefix: string,
  ): void {
    if (cursor === undefined) {
      return;
    }
    const position = decodeActivityCursorForScope(cursor, scope);
    conditions.push(
      `(${prefix}occurred_at < ? OR (${prefix}occurred_at = ? AND ${prefix}id < ?))`,
    );
    params.push(position.occurredAt, position.occurredAt, position.id);
  }

  /** Trim the over-fetched page, load all subjects for it in one query, and build
   * the domain records + next cursor. */
  async #assemblePage(
    rows: ActivityRow[],
    limit: number,
    scope: ActivityCursorScope,
  ): Promise<ActivityPage> {
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    if (pageRows.length === 0) {
      return { items: [], nextCursor: null, hasMore: false };
    }

    const subjectsByActivity = await this.#fetchSubjects(
      pageRows.map((r) => r.id),
    );
    const items = pageRows.map((row) =>
      rowToActivity(row, subjectsByActivity.get(row.id) ?? []),
    );

    const last = pageRows.at(-1)!;
    const nextCursor = hasMore
      ? encodeActivityCursor(scope, {
          occurredAt: last.occurred_at,
          id: last.id,
        } satisfies ActivityCursorPosition)
      : null;

    return { items, nextCursor, hasMore };
  }

  /** Fetch every subject row for a set of activity ids in ONE query (no N+1),
   * grouped by activity id. */
  async #fetchSubjects(
    activityIds: readonly string[],
  ): Promise<Map<string, ActivitySubjectRow[]>> {
    const grouped = new Map<string, ActivitySubjectRow[]>();
    if (activityIds.length === 0) {
      return grouped;
    }
    const placeholders = activityIds.map(() => "?").join(", ");
    const rows = await this.#allSubjects(
      this.#db
        .prepare(
          `SELECT workspace_id, activity_id, entity_id, role
           FROM activity_subjects
           WHERE workspace_id = ? AND activity_id IN (${placeholders})
           ORDER BY activity_id, role, entity_id`,
        )
        .bind(this.#workspaceId, ...activityIds),
    );
    for (const row of rows) {
      const bucket = grouped.get(row.activity_id);
      if (bucket) {
        bucket.push(row);
      } else {
        grouped.set(row.activity_id, [row]);
      }
    }
    return grouped;
  }

  /** Require an entity (active or soft-deleted) to exist in the bound workspace. */
  async #requireEntityExists(entityId: string): Promise<void> {
    let present: boolean;
    try {
      const row = await this.#db
        .prepare(
          `SELECT 1 AS present FROM entities
           WHERE workspace_id = ? AND id = ? LIMIT 1`,
        )
        .bind(this.#workspaceId, entityId)
        .first<{ present: number }>();
      present = row !== null;
    } catch (cause) {
      throw new ActivityStorageError(undefined, { cause });
    }
    if (!present) {
      throw new ActivitySubjectUnavailableError();
    }
  }

  /** Run a statement returning at most one activity row, mapping D1 failures. */
  async #firstActivity(
    statement: D1PreparedStatement,
  ): Promise<ActivityRow | null> {
    try {
      return await statement.first<ActivityRow>();
    } catch (cause) {
      throw new ActivityStorageError(undefined, { cause });
    }
  }

  /** Run a statement returning many activity rows, mapping D1 failures. */
  async #allActivities(statement: D1PreparedStatement): Promise<ActivityRow[]> {
    try {
      const { results } = await statement.all<ActivityRow>();
      return results;
    } catch (cause) {
      throw new ActivityStorageError(undefined, { cause });
    }
  }

  /** Run a statement returning many subject rows, mapping D1 failures. */
  async #allSubjects(
    statement: D1PreparedStatement,
  ): Promise<ActivitySubjectRow[]> {
    try {
      const { results } = await statement.all<ActivitySubjectRow>();
      return results;
    } catch (cause) {
      throw new ActivityStorageError(undefined, { cause });
    }
  }
}
