/**
 * ASSET-02 Assets — D1 implementation of the authoritative `AssetHistoryRepository`.
 *
 * Implements the Asset LOGBOOK contract over Cloudflare D1 using prepared,
 * parameterised statements only. Constructed with one `WorkspaceContext`; every
 * statement constrains `workspace_id = ?` and no method accepts a `workspaceId`
 * (ADR-010). No caller value is ever interpolated into SQL — the only inlined
 * literals are trusted kernel constants and trusted column names used to build
 * partial-update statements (§17).
 *
 * V2.10 LIFE-01 — obligations left this file. They are one workspace-wide
 * domain now, owned by `D1ObligationRepository`, whether or not their subject
 * is an Asset (ADR-116 decision 1). What stays here is the Asset's own logbook
 * and the two canonical facts an event asserts.
 *
 * What remains of the seam is `planProof` (ADR-083 decision 2): when an
 * obligation ABOUT an Asset is completed, this repository — the authority on
 * `asset_events` and on the Asset's canonical facts — hands the obligation's
 * batch the statements that record the work, advance the canonical date and
 * move the meter. It returns prepared statements and writes nothing itself, so
 * the whole completion is still exactly ONE `D1Database.batch()` and an Asset's
 * record behaves precisely as it did before the obligation store existed.
 *
 * ATOMICITY (ADR-012). `recordEvent` writes the event, its Activity and any
 * canonical Asset fact the event asserts as ONE batch.
 *
 * ACTIVITY PRIVACY (§17). Payloads carry only structural terms — the category
 * token, the derived state, whether a successor was created. Never a cost, a
 * provider name, a meter reading, a serial number or a private note.
 */

import {
  ActivityError,
  buildActivityWriteModel,
  createSystemActorContext,
  secureIdGenerator as activitySecureIdGenerator,
  type ActivityActorContext,
  type ActivityPayload,
  type NewActivityEvent,
} from "~/kernel/activity";
import {
  ASSET_ENTITY_TYPE,
  ASSET_EVENT_ARCHIVED,
  ASSET_EVENT_CREATED,
  ASSET_EVENT_DELETED,
  ASSET_EVENT_RESTORED,
  ASSET_EVENT_UPDATED,
  ASSET_METER_UPDATED,
  AssetConflictError,
  AssetError,
  AssetNotFoundError,
  AssetStorageError,
  AssetValidationError,
  SERVICE_EVENT_CATEGORIES,
  canonicalFactForCategory,
  validateAssetCompletionExtras,
  DEFAULT_CURRENCY,
  canonicalFactForEventCategory,
  completionEventCategory,
  decodeAssetHistoryCursorForScope,
  encodeAssetHistoryCursor,
  historyFilterKey,
  validateAssetEvent,
  validateAssetId,
  validateEventFilters,
  validateEventsLimit,
  type AssetCostGroup,
  type AssetCostSummary,
  type AssetEvent,
  type AssetEventCategory,
  type AssetEventChangeResult,
  type AssetEventPage,
  type AssetHistoryCursorScope,
  type AssetHistoryRepository,
  type AssetMeterUnit,
  type ObligationCategory,
  type AssetValuationPoint,
  type CreateAssetEventInput,
  type ListAssetEventsInput,
  type RecordMeterReadingInput,
  type RecordMeterReadingResult,
  type UpdateAssetEventInput,
} from "~/kernel/assets";
import {
  systemClock,
  secureIdGenerator,
  type Clock,
  type IdGenerator,
} from "~/kernel/entities";
import type { CompleteObligationInput } from "~/kernel/obligations";
import { parseWorkspaceId, type WorkspaceContext } from "~/kernel/workspaces";
import { DEFAULT_OWNER_TIME_ZONE } from "~/kernel/preferences";
import { ownerCalendarIso } from "~/shared/datetime";

import { nextMeterThreshold as nextMeterThreshold_ } from "~/kernel/assets";
import { fromStorageTimestamp, toStorageTimestamp } from "./database";
import { D1ActivityRecorder } from "./d1-activity-recorder";
import type { AtomicMutationFault } from "./d1-atomic-mutation";

export interface D1AssetHistoryRepositoryOptions {
  readonly clock?: Clock;
  readonly idGenerator?: IdGenerator;
  readonly actorContext?: ActivityActorContext;
  readonly activityIdGenerator?: IdGenerator;
  /** TEST-ONLY deterministic batch fault, proving whole-transaction rollback. */
  readonly mutationFault?: AtomicMutationFault;
  /**
   * AUDIT-14 — resolve the OWNER's timezone, so this repository's idea of
   * "today" is the same one every other module uses. It used to be a hard-coded
   * `Australia/Sydney`, which day-shifted obligation due state and the dates
   * written onto generated work for any owner living elsewhere. Omitted, it
   * falls back to `DEFAULT_OWNER_TIME_ZONE` — the no-preference case only.
   */
  readonly ownerTimeZone?: () => Promise<string>;
}

const SUBJECT_ROLE = "subject";

/* -------------------------------------------------------------------------- */
/* Row shapes                                                                 */
/* -------------------------------------------------------------------------- */

interface EventRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly asset_id: string;
  readonly category: string;
  readonly title: string;
  readonly event_date: string;
  readonly completed_at: string | null;
  readonly description: string | null;
  readonly provider: string | null;
  readonly person_id: string | null;
  readonly cost_minor: number | null;
  readonly value_minor: number | null;
  readonly currency_code: string | null;
  readonly meter_value: number | null;
  readonly meter_unit: string | null;
  readonly warranty_expiry: string | null;
  readonly next_due_date: string | null;
  readonly task_id: string | null;
  readonly note_id: string | null;
  readonly obligation_id: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly archived_at: string | null;
  readonly deleted_at: string | null;
}

const EVENT_COLUMNS = `id, workspace_id, asset_id, category, title, event_date,
  completed_at, description, provider, person_id, cost_minor, value_minor,
  currency_code, meter_value, meter_unit, warranty_expiry, next_due_date,
  task_id, note_id, obligation_id, created_at, updated_at, archived_at, deleted_at`;

/* -------------------------------------------------------------------------- */
/* Repository                                                                 */
/* -------------------------------------------------------------------------- */

export class D1AssetHistoryRepository implements AssetHistoryRepository {
  readonly #db: D1Database;
  readonly #workspaceId: string;
  readonly #clock: Clock;
  readonly #newId: IdGenerator;
  readonly #actor: ActivityActorContext;
  readonly #newActivityId: IdGenerator;
  readonly #recorder: D1ActivityRecorder;
  readonly #mutationFault?: AtomicMutationFault;
  readonly #ownerTimeZone: () => Promise<string>;

  constructor(
    db: D1Database,
    context: WorkspaceContext,
    options: D1AssetHistoryRepositoryOptions = {},
  ) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
    this.#clock = options.clock ?? systemClock;
    this.#newId = options.idGenerator ?? secureIdGenerator;
    this.#actor = options.actorContext ?? createSystemActorContext();
    this.#newActivityId =
      options.activityIdGenerator ?? activitySecureIdGenerator;
    this.#recorder = new D1ActivityRecorder(db);
    this.#mutationFault = options.mutationFault;
    this.#ownerTimeZone =
      options.ownerTimeZone ?? (() => Promise.resolve(DEFAULT_OWNER_TIME_ZONE));
  }

  /* ---------------------------------------------------------------------- */
  /* Shared internals                                                       */
  /* ---------------------------------------------------------------------- */

  /** A statement guaranteed to fail, aborting and rolling back the whole batch. */
  #forcedFailure(): D1PreparedStatement {
    return this.#db.prepare("SELECT 1 FROM __dalyhub_asset_history_fault__");
  }

  /** Splice the TEST-ONLY fault into a batch immediately after the domain write. */
  #withFault(batch: D1PreparedStatement[]): D1PreparedStatement[] {
    if (this.#mutationFault === undefined) return batch;
    const spliced = [...batch];
    spliced.splice(1, 0, this.#forcedFailure());
    return spliced;
  }

  #appendStatements(
    type: string,
    subjects: readonly string[],
    payload: ActivityPayload,
    now: Date,
  ): D1PreparedStatement[] {
    const event: NewActivityEvent = {
      type,
      subjects: subjects.map((entityId) => ({ entityId, role: SUBJECT_ROLE })),
      payload,
    };
    const model = buildActivityWriteModel(
      event,
      this.#actor.actor,
      this.#newActivityId(),
      now,
    );
    return this.#recorder.buildAppendStatements(this.#workspaceId, model);
  }

  #fail(cause: unknown): never {
    if (cause instanceof AssetError || cause instanceof ActivityError) {
      throw cause;
    }
    throw new AssetStorageError({ cause });
  }

  /**
   * The owner-calendar day, so every derived state resolves in one timezone.
   *
   * AUDIT-14 — "one timezone" now means the OWNER's stored one, resolved through
   * the single scope-level authority, not a Sydney constant this module chose
   * for itself. The two callers are the meter reading's default date and the
   * obligation completion date, and both are calendar dates the owner will read
   * back as "today"; the instants this repository stores stay UTC.
   */
  async #today(): Promise<string> {
    return ownerCalendarIso(this.#clock(), await this.#ownerTimeZone());
  }

  /**
   * Read the Asset's own facts, failing closed. Returns null for a missing,
   * soft-deleted, wrong-type or cross-workspace id — indistinguishable by design.
   */
  async #assetFacts(assetId: string): Promise<{
    readonly archived: boolean;
    readonly currencyCode: string | null;
    readonly meterValue: number | null;
    readonly meterUnit: AssetMeterUnit | null;
    readonly meterDate: string | null;
  } | null> {
    const row = await this.#db
      .prepare(
        `SELECT d.archived_at, d.currency_code, d.current_meter_value,
                d.current_meter_unit, d.current_meter_date
           FROM entities e
           JOIN asset_details d
             ON d.workspace_id = e.workspace_id AND d.entity_id = e.id
          WHERE e.workspace_id = ? AND e.id = ?
            AND e.type = '${ASSET_ENTITY_TYPE}' AND e.deleted_at IS NULL
          LIMIT 1`,
      )
      .bind(this.#workspaceId, assetId)
      .first<{
        archived_at: string | null;
        currency_code: string | null;
        current_meter_value: number | null;
        current_meter_unit: string | null;
        current_meter_date: string | null;
      }>();
    if (!row) return null;
    return {
      archived: row.archived_at !== null,
      currencyCode: row.currency_code,
      meterValue: row.current_meter_value,
      meterUnit: (row.current_meter_unit as AssetMeterUnit | null) ?? null,
      meterDate: row.current_meter_date,
    };
  }

  /**
   * Assert every supplied relation id resolves to a live record of the right type
   * IN THIS WORKSPACE. This is the cross-workspace rejection (§20): an id from
   * another workspace is simply not found here, so it can never be stored.
   */
  async #assertRelations(refs: {
    readonly personId?: string | null;
    readonly taskId?: string | null;
    readonly noteId?: string | null;
  }): Promise<void> {
    const checks: {
      id: string;
      type: string;
      field: "personId" | "taskId" | "noteId";
    }[] = [];
    if (refs.personId)
      checks.push({ id: refs.personId, type: "person", field: "personId" });
    if (refs.taskId)
      checks.push({ id: refs.taskId, type: "task", field: "taskId" });
    if (refs.noteId)
      checks.push({ id: refs.noteId, type: "note", field: "noteId" });
    if (checks.length === 0) return;

    const placeholders = checks.map(() => "?").join(", ");
    const result = await this.#db
      .prepare(
        `SELECT id, type FROM entities
          WHERE workspace_id = ? AND deleted_at IS NULL AND id IN (${placeholders})`,
      )
      .bind(this.#workspaceId, ...checks.map((c) => c.id))
      .all<{ id: string; type: string }>();
    const found = new Map(result.results.map((r) => [r.id, r.type]));
    for (const check of checks) {
      if (found.get(check.id) !== check.type) {
        throw new AssetValidationError(
          check.field,
          "does not point at a record in this workspace",
        );
      }
    }
  }

  #rowToEvent(row: EventRow): AssetEvent {
    return {
      id: row.id,
      workspaceId: parseWorkspaceId(row.workspace_id),
      assetId: row.asset_id,
      category: row.category as AssetEventCategory,
      title: row.title,
      eventDate: row.event_date,
      completedAt:
        row.completed_at === null
          ? null
          : fromStorageTimestamp(row.completed_at),
      description: row.description,
      provider: row.provider,
      personId: row.person_id,
      costMinor: row.cost_minor,
      valueMinor: row.value_minor,
      currencyCode: row.currency_code,
      meterValue: row.meter_value,
      meterUnit: (row.meter_unit as AssetMeterUnit | null) ?? null,
      warrantyExpiry: row.warranty_expiry,
      nextDueDate: row.next_due_date,
      taskId: row.task_id,
      noteId: row.note_id,
      obligationId: row.obligation_id,
      createdAt: fromStorageTimestamp(row.created_at),
      updatedAt: fromStorageTimestamp(row.updated_at),
      archivedAt:
        row.archived_at === null ? null : fromStorageTimestamp(row.archived_at),
      deletedAt:
        row.deleted_at === null ? null : fromStorageTimestamp(row.deleted_at),
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Canonical-fact projection                                              */
  /* ---------------------------------------------------------------------- */

  /**
   * Build the statement that lets an event advance the Asset's canonical facts —
   * or null when the event asserts nothing.
   *
   * Every advance is FORWARD-ONLY and guarded IN SQL, which is what keeps
   * back-filling honest: recording last year's service must not rewind today's
   * next-service date, and entering an old odometer reading must not rewind the
   * odometer. Nothing here recomputes a fact from history — it only lets a new
   * fact move the current one forward (§3).
   */
  #canonicalUpdate(input: {
    readonly assetId: string;
    readonly category: AssetEventCategory;
    readonly eventDate: string;
    readonly warrantyExpiry: string | null;
    readonly nextDueDate: string | null;
    readonly meterValue: number | null;
    readonly meterUnit: AssetMeterUnit | null;
    readonly nowTs: string;
    /** Only apply when this event row actually landed. */
    readonly guardEventId: string;
  }): D1PreparedStatement | null {
    const sets: string[] = [];
    const params: (string | number | null)[] = [];

    if (input.warrantyExpiry !== null) {
      sets.push(
        "warranty_expiry = CASE WHEN warranty_expiry IS NULL OR ? > warranty_expiry THEN ? ELSE warranty_expiry END",
      );
      params.push(input.warrantyExpiry, input.warrantyExpiry);
    }

    const factColumn = canonicalFactForEventCategory(input.category);
    if (input.nextDueDate !== null && factColumn !== null) {
      const column =
        factColumn === "nextServiceDate" ? "next_service_date" : "renewal_date";
      sets.push(
        `${column} = CASE WHEN ${column} IS NULL OR ? > ${column} THEN ? ELSE ${column} END`,
      );
      params.push(input.nextDueDate, input.nextDueDate);
    }

    if (SERVICE_EVENT_CATEGORIES.includes(input.category)) {
      sets.push(
        "last_service_date = CASE WHEN last_service_date IS NULL OR ? > last_service_date THEN ? ELSE last_service_date END",
      );
      params.push(input.eventDate, input.eventDate);
    }

    if (input.meterValue !== null && input.meterUnit !== null) {
      // Forward-only: a newer date, and — within the same unit — a reading that
      // has not gone backwards. A DIFFERENT unit is an explicit re-baseline (the
      // owner switched the asset from km to miles), which is allowed on a newer
      // date because the two readings are simply not comparable.
      const guard = `(current_meter_date IS NULL
          OR (? >= current_meter_date
              AND (current_meter_unit IS NOT ? OR ? >= current_meter_value)))`;
      sets.push(
        `current_meter_value = CASE WHEN ${guard} THEN ? ELSE current_meter_value END`,
        `current_meter_unit = CASE WHEN ${guard} THEN ? ELSE current_meter_unit END`,
        `current_meter_date = CASE WHEN ${guard} THEN ? ELSE current_meter_date END`,
      );
      params.push(
        input.eventDate,
        input.meterUnit,
        input.meterValue,
        input.meterValue,
        input.eventDate,
        input.meterUnit,
        input.meterValue,
        input.meterUnit,
        input.eventDate,
        input.meterUnit,
        input.meterValue,
        input.eventDate,
      );
    }

    if (sets.length === 0) return null;

    return this.#db
      .prepare(
        `UPDATE asset_details
            SET ${sets.join(", ")}, updated_at = ?
          WHERE workspace_id = ? AND entity_id = ?
            AND EXISTS (
                  SELECT 1 FROM asset_events
                  WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL
                )`,
      )
      .bind(
        ...params,
        input.nowTs,
        this.#workspaceId,
        input.assetId,
        this.#workspaceId,
        input.guardEventId,
      );
  }

  /* ---------------------------------------------------------------------- */
  /* Events                                                                 */
  /* ---------------------------------------------------------------------- */

  async recordEvent(
    assetId: string,
    input: CreateAssetEventInput,
  ): Promise<AssetEvent> {
    const id = validateAssetId(assetId);
    const v = validateAssetEvent(input, "create");
    const facts = await this.#assetFacts(id);
    if (!facts) throw new AssetNotFoundError();
    await this.#assertRelations({
      personId: v.personId ?? null,
      taskId: v.taskId ?? null,
      noteId: v.noteId ?? null,
    });

    const obligationId =
      typeof input.obligationId === "string" && input.obligationId.length > 0
        ? input.obligationId
        : null;

    const eventId = this.#newId();
    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);

    const insert = this.#db
      .prepare(
        `INSERT INTO asset_events
           (${EVENT_COLUMNS.replace(/\s+/g, " ")})
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL
          WHERE EXISTS (
                  SELECT 1 FROM entities
                  WHERE workspace_id = ? AND id = ?
                    AND type = '${ASSET_ENTITY_TYPE}' AND deleted_at IS NULL
                )
         RETURNING id`,
      )
      .bind(
        eventId,
        this.#workspaceId,
        id,
        v.category ?? "history",
        v.title ?? "",
        v.eventDate ?? "",
        v.completedAt ? toStorageTimestamp(v.completedAt) : null,
        v.description ?? null,
        v.provider ?? null,
        v.personId ?? null,
        v.costMinor ?? null,
        v.valueMinor ?? null,
        v.currencyCode ?? null,
        v.meterValue ?? null,
        v.meterUnit ?? null,
        v.warrantyExpiry ?? null,
        v.nextDueDate ?? null,
        v.taskId ?? null,
        v.noteId ?? null,
        obligationId,
        nowTs,
        nowTs,
        this.#workspaceId,
        id,
      );

    // Payload: structural terms only. The category and whether a meter reading was
    // taken are safe; the reading itself, the cost and the provider are not (§17).
    const append = this.#appendStatements(
      ASSET_EVENT_CREATED,
      [id],
      {
        category: v.category ?? "history",
        hasCost: v.costMinor !== null && v.costMinor !== undefined,
        hasMeter: v.meterValue !== null && v.meterValue !== undefined,
      },
      now,
    );

    const canonical = this.#canonicalUpdate({
      assetId: id,
      category: (v.category ?? "history") as AssetEventCategory,
      eventDate: v.eventDate ?? "",
      warrantyExpiry: v.warrantyExpiry ?? null,
      nextDueDate: v.nextDueDate ?? null,
      meterValue: v.meterValue ?? null,
      meterUnit: v.meterUnit ?? null,
      nowTs,
      guardEventId: eventId,
    });

    const batch = [insert, ...append];
    if (canonical) batch.push(canonical);

    try {
      const results = await this.#db.batch(this.#withFault(batch));
      if ((results[0]?.meta?.changes ?? 0) === 0) {
        // The EXISTS guard failed at commit — the Asset vanished under us.
        throw new AssetNotFoundError();
      }
    } catch (cause) {
      this.#fail(cause);
    }

    const created = await this.getEvent(eventId);
    if (!created) throw new AssetStorageError();
    return created;
  }

  async getEvent(eventId: string): Promise<AssetEvent | null> {
    const id = validateAssetId(eventId);
    try {
      const row = await this.#db
        .prepare(
          `SELECT ${EVENT_COLUMNS} FROM asset_events
            WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL
            LIMIT 1`,
        )
        .bind(this.#workspaceId, id)
        .first<EventRow>();
      return row ? this.#rowToEvent(row) : null;
    } catch (cause) {
      this.#fail(cause);
    }
  }

  async updateEvent(
    eventId: string,
    changes: UpdateAssetEventInput,
  ): Promise<AssetEventChangeResult> {
    const id = validateAssetId(eventId);
    const current = await this.getEvent(id);
    if (!current) throw new AssetNotFoundError();
    const v = validateAssetEvent(changes, "update");
    await this.#assertRelations({
      personId: v.personId ?? null,
      taskId: v.taskId ?? null,
      noteId: v.noteId ?? null,
    });

    const COLUMN: Record<string, string> = {
      category: "category",
      title: "title",
      eventDate: "event_date",
      completedAt: "completed_at",
      description: "description",
      provider: "provider",
      personId: "person_id",
      costMinor: "cost_minor",
      valueMinor: "value_minor",
      currencyCode: "currency_code",
      meterValue: "meter_value",
      meterUnit: "meter_unit",
      warrantyExpiry: "warranty_expiry",
      nextDueDate: "next_due_date",
      taskId: "task_id",
      noteId: "note_id",
    };
    const CURRENT: Record<string, string | number | null> = {
      category: current.category,
      title: current.title,
      eventDate: current.eventDate,
      completedAt: current.completedAt
        ? toStorageTimestamp(current.completedAt)
        : null,
      description: current.description,
      provider: current.provider,
      personId: current.personId,
      costMinor: current.costMinor,
      valueMinor: current.valueMinor,
      currencyCode: current.currencyCode,
      meterValue: current.meterValue,
      meterUnit: current.meterUnit,
      warrantyExpiry: current.warrantyExpiry,
      nextDueDate: current.nextDueDate,
      taskId: current.taskId,
      noteId: current.noteId,
    };

    const setColumns: string[] = [];
    const setValues: (string | number | null)[] = [];
    const changedFields: string[] = [];
    for (const [field, column] of Object.entries(COLUMN)) {
      const next = (v as unknown as Record<string, unknown>)[field];
      if (next === undefined) continue;
      const value =
        next instanceof Date
          ? toStorageTimestamp(next)
          : (next as string | number | null);
      if (value === CURRENT[field]) continue;
      setColumns.push(column);
      setValues.push(value);
      changedFields.push(field);
    }

    if (setColumns.length === 0) {
      return { event: current, changed: false };
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const update = this.#db
      .prepare(
        `UPDATE asset_events
            SET ${setColumns.map((c) => `${c} = ?`).join(", ")}, updated_at = ?
          WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL
         RETURNING id`,
      )
      .bind(...setValues, nowTs, this.#workspaceId, id);

    const append = this.#appendStatements(
      ASSET_EVENT_UPDATED,
      [current.assetId],
      { fields: changedFields, category: current.category },
      now,
    );

    try {
      const results = await this.#db.batch(
        this.#withFault([update, ...append]),
      );
      if ((results[0]?.meta?.changes ?? 0) === 0) {
        throw new AssetConflictError();
      }
    } catch (cause) {
      this.#fail(cause);
    }

    const refreshed = await this.getEvent(id);
    if (!refreshed) throw new AssetStorageError();
    return { event: refreshed, changed: true };
  }

  archiveEvent(eventId: string): Promise<AssetEventChangeResult> {
    return this.#setEventArchived(eventId, true);
  }

  restoreEvent(eventId: string): Promise<AssetEventChangeResult> {
    return this.#setEventArchived(eventId, false);
  }

  async #setEventArchived(
    eventId: string,
    archived: boolean,
  ): Promise<AssetEventChangeResult> {
    const id = validateAssetId(eventId);
    const current = await this.getEvent(id);
    if (!current) throw new AssetNotFoundError();
    if ((current.archivedAt !== null) === archived) {
      return { event: current, changed: false };
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const statement = this.#db
      .prepare(
        `UPDATE asset_events
            SET archived_at = ?, updated_at = ?
          WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL
            AND archived_at IS ${archived ? "NULL" : "NOT NULL"}
         RETURNING id`,
      )
      .bind(archived ? nowTs : null, nowTs, this.#workspaceId, id);

    const append = this.#appendStatements(
      archived ? ASSET_EVENT_ARCHIVED : ASSET_EVENT_RESTORED,
      [current.assetId],
      { category: current.category },
      now,
    );

    try {
      await this.#db.batch(this.#withFault([statement, ...append]));
    } catch (cause) {
      this.#fail(cause);
    }

    const refreshed = await this.getEvent(id);
    if (!refreshed) throw new AssetStorageError();
    return {
      event: refreshed,
      changed: (refreshed.archivedAt !== null) === archived,
    };
  }

  async deleteEvent(eventId: string): Promise<boolean> {
    const id = validateAssetId(eventId);
    const current = await this.getEvent(id);
    if (!current) return false;

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);

    const statement = this.#db
      .prepare(
        `UPDATE asset_events
            SET deleted_at = ?, updated_at = ?
          WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL
         RETURNING id`,
      )
      .bind(nowTs, nowTs, this.#workspaceId, id);

    const append = this.#appendStatements(
      ASSET_EVENT_DELETED,
      [current.assetId],
      { category: current.category },
      now,
    );

    // An obligation whose completion PROOF is deleted keeps its completed status
    // and its series position — deleting history must never corrupt recurrence
    // (§18). Only the now-dangling pointer is cleared.
    const clearPointer = this.#db
      .prepare(
        `UPDATE obligation_details
            SET completed_event_id = NULL, updated_at = ?
          WHERE workspace_id = ? AND completed_event_id = ?`,
      )
      .bind(nowTs, this.#workspaceId, id);

    try {
      const results = await this.#db.batch(
        this.#withFault([statement, ...append, clearPointer]),
      );
      return (results[0]?.meta?.changes ?? 0) > 0;
    } catch (cause) {
      this.#fail(cause);
    }
  }

  async listEvents(input: ListAssetEventsInput): Promise<AssetEventPage> {
    const assetId = validateAssetId(input.assetId);
    const limit = validateEventsLimit(input.limit);
    const filters = validateEventFilters(input.filters);

    const scope: AssetHistoryCursorScope = {
      workspaceId: this.#workspaceId,
      assetId,
      kind: "events",
      filterKey: historyFilterKey(
        filters.categories,
        filters.includeArchived ? ["archived"] : [],
      ),
    };

    const conditions = [
      "workspace_id = ?",
      "asset_id = ?",
      "deleted_at IS NULL",
    ];
    const params: unknown[] = [this.#workspaceId, assetId];
    if (!filters.includeArchived) conditions.push("archived_at IS NULL");
    if (filters.categories.length > 0) {
      conditions.push(
        `category IN (${filters.categories.map(() => "?").join(", ")})`,
      );
      params.push(...filters.categories);
    }
    if (input.cursor !== undefined) {
      const position = decodeAssetHistoryCursorForScope(input.cursor, scope);
      // Newest first, so we resume at strictly SMALLER (date, id).
      conditions.push("(event_date < ? OR (event_date = ? AND id < ?))");
      params.push(position.primary, position.primary, position.id);
    }
    params.push(limit + 1);

    let rows: EventRow[];
    try {
      const result = await this.#db
        .prepare(
          `SELECT ${EVENT_COLUMNS} FROM asset_events
            WHERE ${conditions.join(" AND ")}
            ORDER BY event_date DESC, id DESC
            LIMIT ?`,
        )
        .bind(...params)
        .all<EventRow>();
      rows = result.results;
    } catch (cause) {
      this.#fail(cause);
    }

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows.at(-1);
    return {
      items: pageRows.map((row) => this.#rowToEvent(row)),
      nextCursor:
        hasMore && last
          ? encodeAssetHistoryCursor(scope, {
              primary: last.event_date,
              id: last.id,
            })
          : null,
      hasMore,
    };
  }

  async costSummary(assetId: string): Promise<AssetCostSummary> {
    const id = validateAssetId(assetId);
    const facts = await this.#assetFacts(id);
    if (!facts) throw new AssetNotFoundError();

    let purchasePriceMinor: number | null = null;
    let rows: {
      category: string;
      currency_code: string | null;
      total: number;
      n: number;
    }[];
    try {
      const priceRow = await this.#db
        .prepare(
          `SELECT purchase_price_minor FROM asset_details
            WHERE workspace_id = ? AND entity_id = ? LIMIT 1`,
        )
        .bind(this.#workspaceId, id)
        .first<{ purchase_price_minor: number | null }>();
      purchasePriceMinor = priceRow?.purchase_price_minor ?? null;

      // Aggregated IN SQL over the FULL history, never over a loaded page (§27).
      const result = await this.#db
        .prepare(
          `SELECT category, currency_code,
                  sum(cost_minor) AS total, count(*) AS n
             FROM asset_events
            WHERE workspace_id = ? AND asset_id = ?
              AND deleted_at IS NULL AND archived_at IS NULL
              AND cost_minor IS NOT NULL
            GROUP BY category, currency_code`,
        )
        .bind(this.#workspaceId, id)
        .all<{
          category: string;
          currency_code: string | null;
          total: number;
          n: number;
        }>();
      rows = result.results;
    } catch (cause) {
      this.#fail(cause);
    }

    // Pick the dominant currency by recorded event count, then report every other
    // currency as EXCLUDED rather than converting it (ADR-049 — never convert).
    const byCurrency = new Map<string, number>();
    for (const row of rows) {
      const code = row.currency_code ?? facts.currencyCode ?? "";
      if (!code) continue;
      byCurrency.set(code, (byCurrency.get(code) ?? 0) + row.n);
    }
    let currencyCode: string | null = facts.currencyCode;
    if (byCurrency.size > 0) {
      currencyCode = [...byCurrency.entries()].sort(
        (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1),
      )[0][0];
    }

    const byGroup: Record<AssetCostGroup, number> = {
      service: 0,
      repair: 0,
      renewal: 0,
      upgrade: 0,
    };
    let costedEventCount = 0;
    const excluded = new Set<string>();
    for (const row of rows) {
      const code = row.currency_code ?? facts.currencyCode ?? null;
      if (code !== currencyCode) {
        if (code) excluded.add(code);
        continue;
      }
      const group = costGroupOf(row.category as AssetEventCategory);
      if (group === null) continue;
      byGroup[group] += row.total ?? 0;
      costedEventCount += row.n ?? 0;
    }

    const ongoingTotalMinor =
      byGroup.service + byGroup.repair + byGroup.renewal + byGroup.upgrade;

    return {
      currencyCode,
      byGroup,
      ongoingTotalMinor,
      purchasePriceMinor,
      lifetimeTotalMinor:
        purchasePriceMinor === null
          ? null
          : purchasePriceMinor + ongoingTotalMinor,
      costedEventCount,
      mixedCurrency: excluded.size > 0,
      excludedCurrencies: [...excluded].sort(),
    };
  }

  async valuationHistory(
    assetId: string,
    limit = 50,
  ): Promise<readonly AssetValuationPoint[]> {
    const id = validateAssetId(assetId);
    const bounded = Math.max(1, Math.min(limit, 200));
    try {
      const result = await this.#db
        .prepare(
          `SELECT id, event_date, value_minor, currency_code, provider
             FROM asset_events
            WHERE workspace_id = ? AND asset_id = ? AND category = 'valuation'
              AND deleted_at IS NULL AND archived_at IS NULL
              AND value_minor IS NOT NULL
            ORDER BY event_date ASC, id ASC
            LIMIT ?`,
        )
        .bind(this.#workspaceId, id, bounded)
        .all<{
          id: string;
          event_date: string;
          value_minor: number;
          currency_code: string | null;
          provider: string | null;
        }>();
      return result.results.map((row) => ({
        eventId: row.id,
        date: row.event_date,
        valueMinor: row.value_minor,
        currencyCode: row.currency_code ?? "",
        source: row.provider,
      }));
    } catch (cause) {
      this.#fail(cause);
    }
  }

  async recordMeterReading(
    input: RecordMeterReadingInput,
  ): Promise<RecordMeterReadingResult> {
    const assetId = validateAssetId(input.assetId);
    const before = await this.#assetFacts(assetId);
    if (!before) throw new AssetNotFoundError();
    const readingDate = input.readingDate ?? (await this.#today());

    const event = await this.recordEvent(assetId, {
      category: "history",
      title: "Meter reading",
      eventDate: readingDate,
      description: input.note ?? null,
      meterValue: input.value,
      meterUnit: input.unit,
    });

    const after = await this.#assetFacts(assetId);
    const advanced =
      after !== null &&
      (after.meterValue !== before.meterValue ||
        after.meterUnit !== before.meterUnit ||
        after.meterDate !== before.meterDate);

    if (advanced) {
      // A separate, quiet Activity line so "meter updated" reads as its own act in
      // the audit trail (§19). The VALUE stays out of the payload (§17).
      const now = this.#clock();
      try {
        await this.#db.batch([
          this.#db
            .prepare(
              `UPDATE asset_details SET updated_at = updated_at
                WHERE workspace_id = ? AND entity_id = ? RETURNING entity_id`,
            )
            .bind(this.#workspaceId, assetId),
          ...this.#appendStatements(
            ASSET_METER_UPDATED,
            [assetId],
            { unit: event.meterUnit },
            now,
          ),
        ]);
      } catch (cause) {
        this.#fail(cause);
      }
    }

    return { event, advancedCurrentReading: advanced };
  }

  /* ---------------------------------------------------------------------- */
  /* ADR-083 — the obligation completion's PROOF, as statements              */
  /* ---------------------------------------------------------------------- */

  /**
   * The subject-side half of an obligation completion, for a subject that is an
   * Asset: the `asset_events` logbook row that proves the work happened, and
   * the forward-only advance of the Asset's canonical date for that category.
   *
   * It is here, and not in the obligation repository, because these are Assets'
   * tables and ADR-083 decision 2 is explicit: a composing operation assembles
   * the OWNING repository's own statements and never re-authors its SQL. It
   * returns statements and performs no write; the obligation's batch is the
   * only transaction, and every statement carries the obligation's own
   * completion guard so nothing lands if the obligation did not close.
   */
  supports(subjectEntityType: string): boolean {
    return subjectEntityType === ASSET_ENTITY_TYPE;
  }

  async planProof(input: {
    readonly obligationId: string;
    readonly proofId: string;
    readonly subjectEntityId: string;
    readonly category: ObligationCategory;
    readonly title: string;
    readonly completedOn: string;
    readonly amountMinor: number | null;
    readonly currencyCode: string | null;
    readonly nextDueDate: string | null;
    readonly taskId: string | null;
    readonly now: Date;
    readonly raw: CompleteObligationInput;
    /** The obligation's meter commitment, for the successor's threshold. */
    readonly meterRecurrence: boolean;
    readonly meterThreshold: number | null;
    readonly meterInterval: number | null;
    readonly meterUnit: string | null;
    readonly guard: {
      readonly sql: string;
      readonly params: readonly unknown[];
    };
  }): Promise<{
    readonly statements: readonly D1PreparedStatement[];
    readonly proof: {
      readonly id: string;
      readonly title: string;
      readonly date: string;
    };
    readonly proofId: string;
    readonly nextMeterThreshold: number | null;
  } | null> {
    const facts = await this.#assetFacts(input.subjectEntityId);
    if (!facts) return null;

    // The Asset-specific completion extras — a provider, a person, a meter
    // reading, a note — are validated by the domain that understands them.
    const extras = validateAssetCompletionExtras(
      (input.raw.subject ?? {}) as Parameters<
        typeof validateAssetCompletionExtras
      >[0],
      input.currencyCode ?? facts.currencyCode ?? DEFAULT_CURRENCY,
    );
    await this.#assertRelations({
      personId: extras.personId,
      noteId: extras.noteId,
    });

    // The obligation reserved this id before the batch was assembled: it is
    // what its completion guard names, so the two cannot disagree.
    const eventId = input.proofId;
    const nowTs = toStorageTimestamp(input.now);
    const eventCategory = completionEventCategory(input.category);
    const statements: D1PreparedStatement[] = [];

    statements.push(
      this.#db
        .prepare(
          `INSERT INTO asset_events
             (${EVENT_COLUMNS.replace(/\s+/g, " ")})
           SELECT ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL, NULL
            WHERE ${input.guard.sql}`,
        )
        .bind(
          eventId,
          this.#workspaceId,
          input.subjectEntityId,
          eventCategory,
          input.title,
          input.completedOn,
          extras.description,
          extras.provider,
          extras.personId,
          // The obligation's own recorded amount is the Asset logbook's cost.
          // One input, two facts: "what did this obligation cost" and "what has
          // this Asset cost me" (ADR-118 decision 2).
          input.amountMinor ?? extras.costMinor,
          input.amountMinor !== null || extras.costMinor !== null
            ? (input.currencyCode ?? facts.currencyCode ?? DEFAULT_CURRENCY)
            : null,
          extras.meterValue,
          extras.meterUnit,
          input.nextDueDate,
          input.taskId,
          extras.noteId,
          input.obligationId,
          nowTs,
          nowTs,
          ...input.guard.params,
        ),
    );

    // Advance the Asset's canonical fact for this category, forward-only.
    const factField = canonicalFactForCategory(input.category);
    const canonicalSets: string[] = [];
    const canonicalParams: (string | number | null)[] = [];
    if (factField !== null && input.nextDueDate !== null) {
      const column =
        factField === "renewalDate"
          ? "renewal_date"
          : factField === "warrantyExpiry"
            ? "warranty_expiry"
            : "next_service_date";
      canonicalSets.push(
        `${column} = CASE WHEN ${column} IS NULL OR ? > ${column} THEN ? ELSE ${column} END`,
      );
      canonicalParams.push(input.nextDueDate, input.nextDueDate);
    }
    if (factField === "nextServiceDate") {
      canonicalSets.push(
        "last_service_date = CASE WHEN last_service_date IS NULL OR ? > last_service_date THEN ? ELSE last_service_date END",
      );
      canonicalParams.push(input.completedOn, input.completedOn);
    }
    if (extras.meterValue !== null && extras.meterUnit !== null) {
      const guard = `(current_meter_date IS NULL
          OR (? >= current_meter_date
              AND (current_meter_unit IS NOT ? OR ? >= current_meter_value)))`;
      canonicalSets.push(
        `current_meter_value = CASE WHEN ${guard} THEN ? ELSE current_meter_value END`,
        `current_meter_unit = CASE WHEN ${guard} THEN ? ELSE current_meter_unit END`,
        `current_meter_date = CASE WHEN ${guard} THEN ? ELSE current_meter_date END`,
      );
      canonicalParams.push(
        input.completedOn,
        extras.meterUnit,
        extras.meterValue,
        extras.meterValue,
        input.completedOn,
        extras.meterUnit,
        extras.meterValue,
        extras.meterUnit,
        input.completedOn,
        extras.meterUnit,
        extras.meterValue,
        input.completedOn,
      );
    }
    if (canonicalSets.length > 0) {
      statements.push(
        this.#db
          .prepare(
            `UPDATE asset_details
                SET ${canonicalSets.join(", ")}, updated_at = ?
              WHERE workspace_id = ? AND entity_id = ?
                AND ${input.guard.sql}`,
          )
          .bind(
            ...canonicalParams,
            nowTs,
            this.#workspaceId,
            input.subjectEntityId,
            ...input.guard.params,
          ),
      );
    }

    /*
     * Anchored on the reading the work was actually done at when there is one,
     * else on the threshold that was met — so being 400 km late does not
     * permanently shift the whole schedule 400 km early. The same rule the date
     * recurrence uses, in the dimension the Asset owns.
     */
    const nextMeterThreshold =
      input.meterRecurrence && input.meterInterval !== null
        ? nextMeterThreshold_(
            extras.meterUnit === input.meterUnit && extras.meterValue !== null
              ? extras.meterValue
              : (input.meterThreshold ?? 0),
            input.meterInterval,
          )
        : null;

    return {
      statements,
      proof: { id: eventId, title: input.title, date: input.completedOn },
      proofId: eventId,
      nextMeterThreshold,
    };
  }
}

/** Local mirror of the kernel's cost grouping, to keep the aggregate loop tight. */
function costGroupOf(category: AssetEventCategory): AssetCostGroup | null {
  switch (category) {
    case "service":
    case "inspection":
      return "service";
    case "repair":
    case "damage":
      return "repair";
    case "registration":
    case "renewal":
    case "warranty":
    case "insurance":
      return "renewal";
    case "upgrade":
    case "modification":
      return "upgrade";
    default:
      return null;
  }
}
