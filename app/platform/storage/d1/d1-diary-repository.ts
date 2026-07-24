/**
 * DIARY-01A Diary — D1 implementation of the authoritative, workspace-bound
 * `DiaryRepository`.
 *
 * Implements the storage-independent Diary contract over Cloudflare D1 (SQLite)
 * using prepared, parameterised statements only. The repository is constructed
 * with a single `WorkspaceContext`; every statement constrains `workspace_id = ?`
 * and no method accepts a `workspaceId` (ADR-010). No caller value is ever
 * interpolated into SQL (AGENTS.md §17) — the only inlined literal is the trusted
 * kernel constant `'diary'`.
 *
 * Atomicity (ADR-012 / ADR-041): `create` writes the `entities` row, the
 * `diary_entry_details` row and one `diary_entry.created` Activity event in ONE
 * `D1Database.batch()` — a single transaction that rolls back entirely on any
 * failure, so a Diary Entry can never exist without its chronological detail
 * slice (nor without its capture event). `update` is ONE conditional statement
 * whose precondition (an ACTIVE `diary` entity) and change-detection are folded
 * into its `WHERE`, atomic with its `diary_entry.updated` append via the shared
 * `recordAtomicMutation` seam — an idempotent no-op appends nothing, and an
 * Activity-insert failure rolls the detail write back too.
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
  DIARY_ENTITY_TYPE,
  DIARY_ENTRY_CREATED,
  DIARY_ENTRY_UPDATED,
  DiaryError,
  DiaryConflictError,
  DiaryNotFoundError,
  DiaryStorageError,
  decodeDiaryCursorForScope,
  encodeDiaryCursor,
  normaliseEntryTypeScope,
  parseDiaryEntryType,
  validateCreateInput,
  validateDiaryId,
  validateDiaryLimit,
  validateDiaryBody,
  validateEntryTypeFilter,
  validateOrder,
  validateRangeBound,
  validateUpdateInput,
  type CreateDiaryEntryInput,
  type DiaryCursorScope,
  type DiaryEntry,
  type DiaryEntryChangeResult,
  type DiaryEntrySource,
  type DiaryRepository,
  type DiaryTimelinePage,
  type ListDiaryTimelineInput,
  type UpdateDiaryEntryInput,
} from "~/kernel/diary";
import {
  systemClock,
  secureIdGenerator,
  type Clock,
  type IdGenerator,
} from "~/kernel/entities";
import { parseWorkspaceId, type WorkspaceContext } from "~/kernel/workspaces";

import { fromStorageTimestamp, toStorageTimestamp } from "./database";
import { D1ActivityRecorder } from "./d1-activity-recorder";
import {
  recordAtomicMutation,
  type AtomicMutationFault,
} from "./d1-atomic-mutation";

/** TEST-ONLY deterministic create-batch failure injection. Never set in production. */
export type D1DiaryCreateFault = "after-entity" | "after-details";

export interface D1DiaryRepositoryOptions {
  readonly clock?: Clock;
  readonly idGenerator?: IdGenerator;
  readonly actorContext?: ActivityActorContext;
  readonly activityIdGenerator?: IdGenerator;
  /** TEST-ONLY create-batch fault (proves the whole create rolls back). */
  readonly createFault?: D1DiaryCreateFault;
  /** TEST-ONLY update-batch fault (proves the detail write + event roll back). */
  readonly mutationFault?: AtomicMutationFault;
}

const SUBJECT_ROLE = "subject";

/** The entity columns a create returns, matching the `entities` row shape. */
const ENTITY_RETURNING =
  "id, workspace_id, type, title, created_at, updated_at, deleted_at";

/** The joined Diary columns every read selects. */
const READ_COLUMNS = `
  e.id AS id,
  e.workspace_id AS workspace_id,
  e.title AS title,
  e.created_at AS created_at,
  e.deleted_at AS deleted_at,
  d.entry_type AS entry_type,
  d.body AS body,
  d.occurred_at AS occurred_at,
  d.timezone AS timezone,
  d.source_channel AS source_channel,
  d.source_reference AS source_reference,
  CASE WHEN e.updated_at >= d.updated_at THEN e.updated_at ELSE d.updated_at END
    AS effective_updated_at`;

/** The raw joined row a read returns. Never escapes this adapter. */
interface DiaryJoinedRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly title: string;
  readonly created_at: string;
  readonly deleted_at: string | null;
  readonly entry_type: string;
  readonly body: string | null;
  readonly occurred_at: string;
  readonly timezone: string;
  readonly source_channel: string;
  readonly source_reference: string | null;
  readonly effective_updated_at: string;
}

/** The `entities` RETURNING row a create returns. */
interface CreatedEntityRow {
  readonly id: string;
  readonly title: string;
  readonly created_at: string;
  readonly updated_at: string;
}

/** A statement guaranteed to fail at execution, aborting/rolling back the batch. */
function forcedFailure(db: D1Database): D1PreparedStatement {
  return db.prepare("SELECT 1 FROM __dalyhub_diary_forced_fault__");
}

export class D1DiaryRepository implements DiaryRepository {
  readonly #db: D1Database;
  readonly #workspaceId: string;
  readonly #clock: Clock;
  readonly #newId: IdGenerator;
  readonly #actor: ActivityActorContext;
  readonly #newActivityId: IdGenerator;
  readonly #recorder: D1ActivityRecorder;
  readonly #createFault?: D1DiaryCreateFault;
  readonly #mutationFault?: AtomicMutationFault;

  constructor(
    db: D1Database,
    context: WorkspaceContext,
    options: D1DiaryRepositoryOptions = {},
  ) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
    this.#clock = options.clock ?? systemClock;
    this.#newId = options.idGenerator ?? secureIdGenerator;
    this.#actor = options.actorContext ?? createSystemActorContext();
    this.#newActivityId =
      options.activityIdGenerator ?? activitySecureIdGenerator;
    this.#recorder = new D1ActivityRecorder(db);
    this.#createFault = options.createFault;
    this.#mutationFault = options.mutationFault;
  }

  /* ---------------------------------------------------------------------- */
  /* Capture                                                                */
  /* ---------------------------------------------------------------------- */

  async create(input: CreateDiaryEntryInput): Promise<DiaryEntry> {
    const validated = validateCreateInput(input);
    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    // Capture-first: default the occurred instant to the capture time.
    const occurredAt = validated.occurredAt ?? now;
    const occurredTs = toStorageTimestamp(occurredAt);
    const id = this.#newId();

    const entityStmt = this.#db
      .prepare(
        `INSERT INTO entities
           (id, workspace_id, type, title, created_at, updated_at, deleted_at)
         VALUES (?, ?, '${DIARY_ENTITY_TYPE}', ?, ?, ?, NULL)
         RETURNING ${ENTITY_RETURNING}`,
      )
      .bind(id, this.#workspaceId, validated.title, nowTs, nowTs);

    const detailsStmt = this.#db
      .prepare(
        `INSERT INTO diary_entry_details
           (workspace_id, entity_id, entry_type, body, occurred_at, timezone,
            source_channel, source_reference, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        this.#workspaceId,
        id,
        validated.entryType,
        validated.body,
        occurredTs,
        validated.timezone,
        validated.source.channel,
        validated.source.reference,
        nowTs,
      );

    const event: NewActivityEvent = {
      type: DIARY_ENTRY_CREATED,
      subjects: [{ entityId: id, role: SUBJECT_ROLE }],
      // Only structural metadata — NEVER the private body (AGENTS.md §17).
      payload: { entryType: validated.entryType, occurredAt: occurredTs },
    };

    let model;
    try {
      model = buildActivityWriteModel(
        event,
        this.#actor.actor,
        this.#newActivityId(),
        now,
      );
    } catch (cause) {
      if (cause instanceof DiaryError || cause instanceof ActivityError)
        throw cause;
      throw new DiaryStorageError({ cause });
    }
    const append = this.#recorder.buildAppendStatements(
      this.#workspaceId,
      model,
    );

    // Batch order: entity, details, then the guarded Activity append. The append's
    // `changes() > 0` guard refers to the details insert immediately before it,
    // which always inserts one row on a successful create — so a committed create
    // always records exactly one event, and any failure rolls the whole batch back.
    const batch: D1PreparedStatement[] = [entityStmt];
    if (this.#createFault === "after-entity")
      batch.push(forcedFailure(this.#db));
    batch.push(detailsStmt);
    if (this.#createFault === "after-details")
      batch.push(forcedFailure(this.#db));
    batch.push(...append);

    let entityRow: CreatedEntityRow | null;
    try {
      const results = await this.#db.batch<CreatedEntityRow>(batch);
      entityRow = results[0]?.results?.[0] ?? null;
    } catch (cause) {
      throw new DiaryStorageError({ cause });
    }
    if (!entityRow) {
      throw new DiaryStorageError();
    }

    return {
      id,
      workspaceId: parseWorkspaceId(this.#workspaceId),
      entryType: validated.entryType,
      title: entityRow.title,
      body: validated.body,
      occurredAt,
      timezone: validated.timezone,
      source: validated.source,
      createdAt: fromStorageTimestamp(entityRow.created_at),
      updatedAt: fromStorageTimestamp(entityRow.updated_at),
      deletedAt: null,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Read                                                                   */
  /* ---------------------------------------------------------------------- */

  async get(
    id: string,
    options: { includeDeleted?: boolean } = {},
  ): Promise<DiaryEntry | null> {
    const entryId = validateDiaryId(id);
    const deletedClause = options.includeDeleted
      ? ""
      : " AND e.deleted_at IS NULL";
    let row: DiaryJoinedRow | null;
    try {
      row = await this.#db
        .prepare(
          `SELECT ${READ_COLUMNS}
           FROM entities e
           JOIN diary_entry_details d
             ON d.workspace_id = e.workspace_id AND d.entity_id = e.id
           WHERE e.workspace_id = ? AND e.id = ? AND e.type = '${DIARY_ENTITY_TYPE}'${deletedClause}
           LIMIT 1`,
        )
        .bind(this.#workspaceId, entryId)
        .first<DiaryJoinedRow>();
    } catch (cause) {
      throw new DiaryStorageError({ cause });
    }
    return row ? this.#rowToEntry(row) : null;
  }

  /* ---------------------------------------------------------------------- */
  /* Timeline read model                                                    */
  /* ---------------------------------------------------------------------- */

  async list(input: ListDiaryTimelineInput = {}): Promise<DiaryTimelinePage> {
    const order = validateOrder(input.order);
    const limit = validateDiaryLimit(input.limit);
    const entryTypes = validateEntryTypeFilter(input.entryTypes);
    const from = validateRangeBound(input.occurredFrom, "from");
    const to = validateRangeBound(input.occurredTo, "to");
    const includeDeleted = input.includeDeleted === true;

    const fromTs = from ? toStorageTimestamp(from) : null;
    const toTs = to ? toStorageTimestamp(to) : null;

    const scope: DiaryCursorScope = {
      workspaceId: this.#workspaceId,
      order,
      entryTypes: normaliseEntryTypeScope(entryTypes),
      from: fromTs,
      to: toTs,
      includeDeleted,
    };

    const conditions: string[] = [
      "e.workspace_id = ?",
      `e.type = '${DIARY_ENTITY_TYPE}'`,
    ];
    const params: unknown[] = [this.#workspaceId];

    if (!includeDeleted) conditions.push("e.deleted_at IS NULL");
    if (entryTypes && entryTypes.length > 0) {
      conditions.push(
        `d.entry_type IN (${entryTypes.map(() => "?").join(", ")})`,
      );
      params.push(...entryTypes);
    }
    if (fromTs !== null) {
      conditions.push("d.occurred_at >= ?");
      params.push(fromTs);
    }
    if (toTs !== null) {
      conditions.push("d.occurred_at <= ?");
      params.push(toTs);
    }
    if (input.cursor !== undefined) {
      const position = decodeDiaryCursorForScope(input.cursor, scope);
      const comparator = order === "newest" ? "<" : ">";
      conditions.push(
        `(d.occurred_at ${comparator} ? OR (d.occurred_at = ? AND e.id ${comparator} ?))`,
      );
      params.push(position.occurredAt, position.occurredAt, position.id);
    }

    const orderSql =
      order === "newest"
        ? "d.occurred_at DESC, e.id DESC"
        : "d.occurred_at ASC, e.id ASC";

    const fetchLimit = limit + 1;
    params.push(fetchLimit);

    let rows: DiaryJoinedRow[];
    try {
      const result = await this.#db
        .prepare(
          `SELECT ${READ_COLUMNS}
           FROM entities e
           JOIN diary_entry_details d
             ON d.workspace_id = e.workspace_id AND d.entity_id = e.id
           WHERE ${conditions.join(" AND ")}
           ORDER BY ${orderSql}
           LIMIT ?`,
        )
        .bind(...params)
        .all<DiaryJoinedRow>();
      rows = result.results;
    } catch (cause) {
      if (cause instanceof DiaryError) throw cause;
      throw new DiaryStorageError({ cause });
    }

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const items = pageRows.map((row) => this.#rowToEntry(row));
    const last = pageRows.at(-1);
    const nextCursor =
      hasMore && last
        ? encodeDiaryCursor(scope, {
            occurredAt: last.occurred_at,
            id: last.id,
          })
        : null;

    return { items, nextCursor, hasMore };
  }

  /* ---------------------------------------------------------------------- */
  /* Edit                                                                   */
  /* ---------------------------------------------------------------------- */

  async update(
    id: string,
    changes: UpdateDiaryEntryInput,
  ): Promise<DiaryEntryChangeResult> {
    const entryId = validateDiaryId(id);
    const validated = validateUpdateInput(changes);

    const current = await this.get(entryId);
    if (!current) throw new DiaryNotFoundError();

    // Merge the present fields over the current entry to get the desired state.
    const nextEntryType =
      validated.entryType !== undefined
        ? validated.entryType
        : current.entryType;
    const nextBody =
      validated.body !== undefined ? validated.body : current.body;
    const nextOccurredAt =
      validated.occurredAt !== undefined
        ? validated.occurredAt
        : current.occurredAt;
    const nextTimezone =
      validated.timezone !== undefined ? validated.timezone : current.timezone;
    const nextSource: DiaryEntrySource =
      validated.source !== undefined ? validated.source : current.source;

    const unchanged =
      nextEntryType === current.entryType &&
      nextBody === current.body &&
      nextOccurredAt.getTime() === current.occurredAt.getTime() &&
      nextTimezone === current.timezone &&
      nextSource.channel === current.source.channel &&
      nextSource.reference === current.source.reference;
    if (unchanged) {
      return { entry: current, changed: false };
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const occurredTs = toStorageTimestamp(nextOccurredAt);

    // ONE conditional statement: the ACTIVE-entity precondition and the
    // change-detection (`IS NOT` handles nullable body/reference correctly) are
    // folded into the WHERE, so an entry soft-deleted between the read and the
    // write cannot commit, and a concurrent identical edit changes nothing.
    const domainStatement = this.#db
      .prepare(
        `UPDATE diary_entry_details
            SET entry_type = ?, body = ?, occurred_at = ?, timezone = ?,
                source_channel = ?, source_reference = ?, updated_at = ?
          WHERE workspace_id = ? AND entity_id = ?
            AND EXISTS (
                  SELECT 1 FROM entities
                  WHERE workspace_id = ? AND id = ? AND type = '${DIARY_ENTITY_TYPE}'
                        AND deleted_at IS NULL
                )
            AND (entry_type IS NOT ? OR body IS NOT ? OR occurred_at IS NOT ?
                 OR timezone IS NOT ? OR source_channel IS NOT ? OR source_reference IS NOT ?)
          RETURNING entry_type`,
      )
      .bind(
        nextEntryType,
        nextBody,
        occurredTs,
        nextTimezone,
        nextSource.channel,
        nextSource.reference,
        nowTs,
        this.#workspaceId,
        entryId,
        this.#workspaceId,
        entryId,
        nextEntryType,
        nextBody,
        occurredTs,
        nextTimezone,
        nextSource.channel,
        nextSource.reference,
      );

    const event: NewActivityEvent = {
      type: DIARY_ENTRY_UPDATED,
      subjects: [{ entityId: entryId, role: SUBJECT_ROLE }],
      payload: { entryType: nextEntryType, occurredAt: occurredTs },
    };

    let result;
    try {
      const model = buildActivityWriteModel(
        event,
        this.#actor.actor,
        this.#newActivityId(),
        now,
      );
      result = await recordAtomicMutation<{ entry_type: string }>({
        db: this.#db,
        workspaceId: this.#workspaceId,
        domainStatement,
        recorder: this.#recorder,
        model,
        fault: this.#mutationFault,
      });
    } catch (cause) {
      if (cause instanceof DiaryError || cause instanceof ActivityError)
        throw cause;
      throw new DiaryStorageError({ cause });
    }

    if (result.changed) {
      const refreshed = await this.get(entryId);
      if (!refreshed) throw new DiaryStorageError();
      return { entry: refreshed, changed: true };
    }

    // The gate matched nothing. Reconcile honestly (mirrors the Note repository):
    // the entry became unavailable, or a concurrent racer already wrote the same
    // desired state (a benign idempotent no-op), or a different concurrent edit
    // won (a real conflict).
    const refreshed = await this.get(entryId);
    if (!refreshed) throw new DiaryNotFoundError();
    const nowMatchesDesired =
      refreshed.entryType === nextEntryType &&
      refreshed.body === nextBody &&
      refreshed.occurredAt.getTime() === nextOccurredAt.getTime() &&
      refreshed.timezone === nextTimezone &&
      refreshed.source.channel === nextSource.channel &&
      refreshed.source.reference === nextSource.reference;
    if (nowMatchesDesired) {
      return { entry: refreshed, changed: false };
    }
    throw new DiaryConflictError();
  }

  /* ---------------------------------------------------------------------- */
  /* Internals                                                              */
  /* ---------------------------------------------------------------------- */

  /** Map a joined row into a `DiaryEntry`, defensively re-validating stored
   * Markdown/type values (impossible to fail except on genuinely corrupt state,
   * which surfaces honestly as a storage error rather than a silent coercion). */
  #rowToEntry(row: DiaryJoinedRow): DiaryEntry {
    try {
      return {
        id: row.id,
        workspaceId: parseWorkspaceId(row.workspace_id),
        entryType: parseDiaryEntryType(row.entry_type),
        title: row.title,
        body: validateDiaryBody(row.body),
        occurredAt: fromStorageTimestamp(row.occurred_at),
        timezone: row.timezone,
        source: {
          channel: row.source_channel,
          reference: row.source_reference,
        },
        createdAt: fromStorageTimestamp(row.created_at),
        updatedAt: fromStorageTimestamp(row.effective_updated_at),
        deletedAt:
          row.deleted_at === null ? null : fromStorageTimestamp(row.deleted_at),
      };
    } catch (cause) {
      if (cause instanceof DiaryError) throw cause;
      throw new DiaryStorageError({ cause });
    }
  }
}
