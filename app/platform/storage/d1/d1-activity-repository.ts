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
  validateActivityAnchorIds,
  validateActivityId,
  validateActivityLimit,
  validateOptionalActivityType,
  validateSubjectEntityId,
  type ActivityPage,
  type ActivityRecord,
  type ActivityRepository,
  type ActivityTypeBucketCount,
  type CountActivityByTypeInput,
  type ListActivityInWindowInput,
  type ListEntitiesActivityInput,
  type ListEntityActivityInput,
  type ListWorkspaceActivityInput,
} from "~/kernel/activity";
import {
  activityAnchorKey,
  activityWindowKey,
  decodeActivityCursorForScope,
  encodeActivityCursor,
  type ActivityCursorPosition,
  type ActivityCursorScope,
} from "~/kernel/activity";
import type { WorkspaceContext } from "~/kernel/workspaces";

import { toStorageTimestamp } from "./database";
import {
  countPrimarySubjectsByTypeInBuckets,
  MAX_HISTORY_BUCKETS,
} from "./history-window-read";

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

/**
 * The per-query id chunk size for the page's subject read (HARDEN-06D, F-12).
 *
 * D1 caps bound variables at 100 per statement and the read binds the ids plus one
 * `workspace_id`, so `MAX_ACTIVITY_PAGE_SIZE` (100) produced 101 and D1 refused it.
 * 90 is the same constant `d1-entity-repository.ts` uses for the same reason, and
 * it still resolves an ordinary page in a single read.
 */
const SUBJECT_ID_CHUNK_SIZE = 90;

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

  async listForEntities(
    entityIds: readonly string[],
    input: ListEntitiesActivityInput = {},
  ): Promise<ActivityPage> {
    // Deduped + sorted, so the anchor set (and therefore the cursor scope) does
    // not depend on the order the caller happened to supply.
    const anchors = validateActivityAnchorIds(entityIds);
    const type = validateOptionalActivityType(input.type);
    const limit = validateActivityLimit(input.limit);

    // EVERY anchor must exist in the bound workspace (active or soft-deleted, as
    // for a single-entity Timeline). One query, not N — and a cross-workspace or
    // nonexistent anchor is reported identically, disclosing nothing.
    await this.#requireEntitiesExist(anchors);

    const scope: ActivityCursorScope = {
      workspaceId: this.#workspaceId,
      scope: "entities",
      entityId: activityAnchorKey(anchors),
      type: type ?? null,
    };

    const placeholders = anchors.map(() => "?").join(", ");
    const conditions: string[] = [
      "s.workspace_id = ?",
      `s.entity_id IN (${placeholders})`,
    ];
    const params: unknown[] = [this.#workspaceId, ...anchors];
    if (type !== undefined) {
      conditions.push("a.type = ?");
      params.push(type);
    }
    this.#applyKeyset(input.cursor, scope, conditions, params, "a.");

    const fetchLimit = limit + 1;
    params.push(fetchLimit);

    // DISTINCT collapses the duplicate join rows an event with SEVERAL matching
    // subjects would otherwise produce (e.g. a link between the Person and one of
    // their linked records is a subject of BOTH anchors) — every selected column
    // comes from `activities`, whose `id` is unique, so nothing else is merged.
    const rows = await this.#allActivities(
      this.#db
        .prepare(
          `SELECT DISTINCT ${ACTIVITY_COLUMNS_A}
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

  /**
   * V2.9 INS-01 — count events by type across a series of buckets, in ONE
   * grouped statement whatever the window (DEBT-238).
   *
   * ── Why the buckets travel as JSON rather than as bound parameters ─────────
   * The obvious shapes both break at the window lengths V2.9 asks for. A
   * `SUM(CASE …)` column per bucket (the RECALL-02 shape) and a `CASE WHEN …
   * THEN index` arm per bucket (the `countPeriodCompletions` shape) each bind
   * TWO parameters per bucket, and D1 refuses a statement with more than 100
   * bound variables — so both stop at about 48 buckets, while a grain maximum
   * here is 52 weeks or 366 days. Passing the boundaries as ONE JSON parameter
   * and expanding them with `json_each` makes the statement's shape independent
   * of the window: four bound parameters for one bucket or for 366.
   *
   * The scan stays one index range over `(workspace_id, type, occurred_at, id)`
   * bounded by the outermost boundaries, so the read is flat in workspace size
   * — the cost is the events inside the window, counted once, and nothing else.
   *
   * ── What is counted ───────────────────────────────────────────────────────
   * DISTINCT subject entities per (bucket, type), which is
   * `countPeriodCompletions`'s semantics preserved rather than a second answer
   * to the same question: one Task completed twice inside a bucket is one
   * completion of one Task. Like that read, and for HARDEN-06C F-07's reason,
   * it does NOT require the entity to be live — deleting a completed Project
   * must not silently move a closed period's figure.
   */
  async countByTypeInBuckets(
    input: CountActivityByTypeInput,
  ): Promise<readonly ActivityTypeBucketCount[]> {
    const types = input.types.map((type) =>
      validateOptionalActivityType(type)!,
    );
    const buckets = input.buckets.slice(0, MAX_HISTORY_BUCKETS);
    if (buckets.length === 0) return [];

    try {
      const counts = await countPrimarySubjectsByTypeInBuckets(
        this.#db,
        this.#workspaceId,
        types,
        buckets.map((bucket) => ({
          key: bucket.key,
          startAt: toStorageTimestamp(bucket.startsAt),
          endAt: toStorageTimestamp(bucket.endsAt),
        })),
      );
      return buckets.map((bucket, index) => ({
        key: bucket.key,
        counts: counts[index],
      }));
    } catch (cause) {
      throw new ActivityStorageError(undefined, { cause });
    }
  }

  /**
   * V2.9 INS-01 — one bounded page of the events inside a window, newest first.
   *
   * The windowed sibling of {@link listForWorkspace}: the same
   * `ORDER BY occurred_at DESC, id DESC`, the same over-fetch-by-one to learn
   * `hasMore`, the same single chunked subject read, and the same cursor
   * discipline — with the cursor bound to the WINDOW as well as the workspace
   * and the type filter, so a cursor from one fortnight is rejected against
   * another instead of silently skipping events.
   */
  async listInWindow(input: ListActivityInWindowInput): Promise<ActivityPage> {
    const limit = validateActivityLimit(input.limit);
    const types = (input.types ?? []).map((type) =>
      validateOptionalActivityType(type)!,
    );
    const startsAt = toStorageTimestamp(input.startsAt);
    const endsAt = toStorageTimestamp(input.endsAt);

    const scope: ActivityCursorScope = {
      workspaceId: this.#workspaceId,
      scope: "window",
      entityId: activityWindowKey(startsAt, endsAt),
      // The whole filter, sorted so the same set always yields the same scope,
      // and null when unfiltered.
      type: types.length === 0 ? null : [...types].sort().join(","),
    };

    // An empty or inverted window is empty, never an unbounded scan.
    if (startsAt >= endsAt) {
      return { items: [], nextCursor: null, hasMore: false };
    }

    const conditions: string[] = [
      "workspace_id = ?",
      "occurred_at >= ?",
      "occurred_at < ?",
    ];
    const params: unknown[] = [this.#workspaceId, startsAt, endsAt];
    if (types.length > 0) {
      conditions.push(`type IN (${types.map(() => "?").join(", ")})`);
      params.push(...types);
    }
    this.#applyKeyset(input.cursor, scope, conditions, params, "");
    params.push(limit + 1);

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
  /**
   * HARDEN-06D (F-12) — the subject read is CHUNKED, because the kernel's own
   * validated maximum produced a statement D1 refuses.
   *
   * `MAX_ACTIVITY_PAGE_SIZE` is 100 and this binds `workspace_id` plus one id per
   * page row — 101 bound parameters at the maximum, against D1's ceiling of 100
   * (`D1_ERROR: too many SQL variables`, measured). No product caller reaches it
   * today: every one passes 30 or fewer, and Settings passes 8. But a limit the
   * validator ACCEPTS must not be a limit the storage refuses, and it is the same
   * trap TASKS-13 fell into at 100 checklist ids.
   *
   * Chunked rather than capped, so `MAX_ACTIVITY_PAGE_SIZE` stays a product
   * decision instead of being quietly lowered to suit a storage limit — the same
   * choice `d1-entity-repository.ts` made at `GET_BY_IDS_CHUNK_SIZE = 90`, with
   * the same constant, for the same reason.
   */
  async #fetchSubjects(
    activityIds: readonly string[],
  ): Promise<Map<string, ActivitySubjectRow[]>> {
    const grouped = new Map<string, ActivitySubjectRow[]>();
    if (activityIds.length === 0) {
      return grouped;
    }
    for (
      let start = 0;
      start < activityIds.length;
      start += SUBJECT_ID_CHUNK_SIZE
    ) {
      const chunk = activityIds.slice(start, start + SUBJECT_ID_CHUNK_SIZE);
      const placeholders = chunk.map(() => "?").join(", ");
      const rows = await this.#allSubjects(
        this.#db
          .prepare(
            `SELECT workspace_id, activity_id, entity_id, role
             FROM activity_subjects
             WHERE workspace_id = ? AND activity_id IN (${placeholders})
             ORDER BY activity_id, role, entity_id`,
          )
          .bind(this.#workspaceId, ...chunk),
      );
      for (const row of rows) {
        const bucket = grouped.get(row.activity_id);
        if (bucket) {
          bucket.push(row);
        } else {
          grouped.set(row.activity_id, [row]);
        }
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

  /**
   * Require EVERY id in a bounded anchor set to exist (active or soft-deleted) in
   * the bound workspace, in ONE query. Any missing or cross-workspace anchor
   * fails the whole listing closed with the same indistinguishable error.
   */
  async #requireEntitiesExist(entityIds: readonly string[]): Promise<void> {
    const placeholders = entityIds.map(() => "?").join(", ");
    let found: number;
    try {
      const row = await this.#db
        .prepare(
          `SELECT COUNT(*) AS found FROM entities
           WHERE workspace_id = ? AND id IN (${placeholders})`,
        )
        .bind(this.#workspaceId, ...entityIds)
        .first<{ found: number }>();
      found = row?.found ?? 0;
    } catch (cause) {
      throw new ActivityStorageError(undefined, { cause });
    }
    if (found !== entityIds.length) {
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
