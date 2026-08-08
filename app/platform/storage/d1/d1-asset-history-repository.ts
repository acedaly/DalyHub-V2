/**
 * ASSET-02 Assets — D1 implementation of the authoritative `AssetHistoryRepository`.
 *
 * Implements the Asset history + obligations contract over Cloudflare D1 using
 * prepared, parameterised statements only. Constructed with one `WorkspaceContext`;
 * every statement constrains `workspace_id = ?` and no method accepts a
 * `workspaceId` (ADR-010). No caller value is ever interpolated into SQL — the only
 * inlined literals are trusted kernel constants and trusted column names used to
 * build partial-update statements (§17).
 *
 * ATOMICITY (ADR-012). The interesting operations span more than one table, and
 * each runs as ONE `D1Database.batch()`:
 *
 *   - `recordEvent` writes the event, its Activity, and any canonical Asset fact
 *     the event asserts.
 *   - `completeObligation` closes the occurrence, writes the event that PROVES the
 *     work happened, advances the Asset's canonical fact and meter, and creates AT
 *     MOST ONE successor — every later statement guarded on the first having
 *     actually changed a row, so a retry or a concurrent completion produces no
 *     second event and no second successor.
 *
 * The ONE deliberate exception is the linked Task. Completing a Task also drives
 * Task recurrence, project rollup and the Task's own Activity, all of which the
 * `TaskRepository` owns; reimplementing that in SQL here would be exactly the
 * duplicated authority §22 forbids. So the Task is completed FIRST, through the
 * injected `ObligationTaskGateway`, and the obligation transaction follows. If the
 * transaction then fails, the system lands in "Task done, work not yet recorded" —
 * a state the product already models and surfaces, rather than an invented one.
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
  ASSET_OBLIGATION_COMPLETED,
  ASSET_OBLIGATION_CREATED,
  ASSET_OBLIGATION_DISMISSED,
  ASSET_OBLIGATION_REOPENED,
  ASSET_OBLIGATION_RESCHEDULED,
  ASSET_TASK_LINKED,
  AssetConflictError,
  AssetError,
  AssetNotFoundError,
  AssetStorageError,
  AssetValidationError,
  DEFAULT_ATTENTION_HORIZON_DAYS,
  MAX_ATTENTION_ITEMS,
  SERVICE_EVENT_CATEGORIES,
  canonicalFactForCategory,
  canonicalFactForEventCategory,
  completionEventCategory,
  decodeAssetHistoryCursorForScope,
  encodeAssetHistoryCursor,
  evaluateObligation,
  historyFilterKey,
  nextMeterThreshold,
  nextObligationDate,
  validateAssetEvent,
  validateAssetId,
  validateAssetObligation,
  validateEventFilters,
  validateEventsLimit,
  validateObligationCompletion,
  validateObligationFilters,
  validateObligationsLimit,
  type AssetAttentionInput,
  type AssetAttentionItem,
  type AssetCostGroup,
  type AssetCostSummary,
  type AssetEvent,
  type AssetEventCategory,
  type AssetEventChangeResult,
  type AssetEventPage,
  type AssetHistoryCursorScope,
  type AssetHistoryRepository,
  type AssetMeterUnit,
  type AssetObligation,
  type AssetObligationCategory,
  type AssetObligationChangeResult,
  type AssetObligationPage,
  type AssetObligationStatus,
  type AssetObligationSummary,
  type AssetRecurrenceKind,
  type AssetValuationPoint,
  type CompleteAssetObligationInput,
  type CompleteAssetObligationResult,
  type CreateAssetEventInput,
  type CreateAssetObligationInput,
  type ListAssetEventsInput,
  type ListAssetObligationsInput,
  type LinkObligationTaskResult,
  type ObligationTaskGateway,
  type ObligationTaskReconciliation,
  type RecordMeterReadingInput,
  type RecordMeterReadingResult,
  type UpdateAssetEventInput,
  type UpdateAssetObligationInput,
} from "~/kernel/assets";
import {
  systemClock,
  secureIdGenerator,
  type Clock,
  type IdGenerator,
} from "~/kernel/entities";
import { parseWorkspaceId, type WorkspaceContext } from "~/kernel/workspaces";
import { DEFAULT_OWNER_TIME_ZONE } from "~/kernel/preferences";
import { ownerCalendarIso } from "~/shared/datetime";

import { fromStorageTimestamp, toStorageTimestamp } from "./database";
import { D1ActivityRecorder } from "./d1-activity-recorder";
import type { AtomicMutationFault } from "./d1-atomic-mutation";

export interface D1AssetHistoryRepositoryOptions {
  readonly clock?: Clock;
  readonly idGenerator?: IdGenerator;
  readonly actorContext?: ActivityActorContext;
  readonly activityIdGenerator?: IdGenerator;
  /** The canonical Task write port. Omitted in tests that link no Tasks. */
  readonly taskGateway?: ObligationTaskGateway;
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
/** A far-future sentinel so NULL due dates sort LAST under ascending order. */
const DATE_SENTINEL = "9999-12-31";

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

interface ObligationRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly asset_id: string;
  readonly category: string;
  readonly title: string;
  readonly description: string | null;
  readonly due_date: string | null;
  readonly lead_days: number;
  readonly recurrence_kind: string;
  readonly recurrence_interval: number | null;
  readonly meter_threshold: number | null;
  readonly meter_interval: number | null;
  readonly meter_unit: string | null;
  readonly status: string;
  readonly task_id: string | null;
  readonly completed_event_id: string | null;
  readonly completed_at: string | null;
  readonly next_obligation_id: string | null;
  readonly series_id: string;
  readonly sequence: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly archived_at: string | null;
  readonly deleted_at: string | null;
}

const EVENT_COLUMNS = `id, workspace_id, asset_id, category, title, event_date,
  completed_at, description, provider, person_id, cost_minor, value_minor,
  currency_code, meter_value, meter_unit, warranty_expiry, next_due_date,
  task_id, note_id, obligation_id, created_at, updated_at, archived_at, deleted_at`;

const OBLIGATION_COLUMNS = `id, workspace_id, asset_id, category, title, description,
  due_date, lead_days, recurrence_kind, recurrence_interval, meter_threshold,
  meter_interval, meter_unit, status, task_id, completed_event_id, completed_at,
  next_obligation_id, series_id, sequence, created_at, updated_at, archived_at,
  deleted_at`;

/**
 * A Task counts as OPEN when it exists, is not soft-deleted, has not been
 * completed on the spine, and was not cancelled. Cancellation is a deliberate
 * decision not to proceed (ADR-043 §5), so a cancelled Task is no longer the
 * obligation's actionable commitment and the owner may create a fresh one (§7).
 */
const OPEN_TASK_EXISTS = `EXISTS (
  SELECT 1 FROM entities te
  JOIN spine_records sr
    ON sr.workspace_id = te.workspace_id AND sr.entity_id = te.id
  LEFT JOIN task_details td
    ON td.workspace_id = te.workspace_id AND td.entity_id = te.id
  WHERE te.workspace_id = o.workspace_id AND te.id = o.task_id
    AND te.type = 'task' AND te.deleted_at IS NULL
    AND sr.completed_at IS NULL
    AND coalesce(td.status, 'todo') <> 'cancelled'
)`;

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
  readonly #taskGateway?: ObligationTaskGateway;
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
    this.#taskGateway = options.taskGateway;
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

  #rowToObligation(row: ObligationRow): AssetObligation {
    return {
      id: row.id,
      workspaceId: parseWorkspaceId(row.workspace_id),
      assetId: row.asset_id,
      category: row.category as AssetObligationCategory,
      title: row.title,
      description: row.description,
      dueDate: row.due_date,
      leadDays: row.lead_days,
      recurrenceKind: row.recurrence_kind as AssetRecurrenceKind,
      recurrenceInterval: row.recurrence_interval,
      meterThreshold: row.meter_threshold,
      meterInterval: row.meter_interval,
      meterUnit: (row.meter_unit as AssetMeterUnit | null) ?? null,
      status: row.status as AssetObligationStatus,
      taskId: row.task_id,
      completedEventId: row.completed_event_id,
      completedAt:
        row.completed_at === null
          ? null
          : fromStorageTimestamp(row.completed_at),
      nextObligationId: row.next_obligation_id,
      seriesId: row.series_id,
      sequence: row.sequence,
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
        `UPDATE asset_obligations
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
  /* Obligations                                                            */
  /* ---------------------------------------------------------------------- */

  async createObligation(
    assetId: string,
    input: CreateAssetObligationInput,
  ): Promise<AssetObligation> {
    const id = validateAssetId(assetId);
    const v = validateAssetObligation(input, "create");
    const facts = await this.#assetFacts(id);
    if (!facts) throw new AssetNotFoundError();

    const obligationId = this.#newId();
    // A fresh series starts at sequence 0. Every successor shares this id, which
    // is what makes a recurrence walkable and its successors unique.
    const seriesId = obligationId;
    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);

    const insert = this.#db
      .prepare(
        `INSERT INTO asset_obligations
           (id, workspace_id, asset_id, category, title, description, due_date,
            lead_days, recurrence_kind, recurrence_interval, meter_threshold,
            meter_interval, meter_unit, status, task_id, completed_event_id,
            completed_at, next_obligation_id, series_id, sequence, created_at,
            updated_at, archived_at, deleted_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', NULL, NULL, NULL,
                NULL, ?, 0, ?, ?, NULL, NULL
          WHERE EXISTS (
                  SELECT 1 FROM entities
                  WHERE workspace_id = ? AND id = ?
                    AND type = '${ASSET_ENTITY_TYPE}' AND deleted_at IS NULL
                )
         RETURNING id`,
      )
      .bind(
        obligationId,
        this.#workspaceId,
        id,
        v.category ?? "reminder",
        v.title ?? "",
        v.description ?? null,
        v.dueDate ?? null,
        v.leadDays ?? 14,
        v.recurrenceKind ?? "none",
        v.recurrenceInterval ?? null,
        v.meterThreshold ?? null,
        v.meterInterval ?? null,
        v.meterUnit ?? null,
        seriesId,
        nowTs,
        nowTs,
        this.#workspaceId,
        id,
      );

    const append = this.#appendStatements(
      ASSET_OBLIGATION_CREATED,
      [id],
      {
        category: v.category ?? "reminder",
        recurrence: v.recurrenceKind ?? "none",
        meterBased: v.meterThreshold !== null && v.meterThreshold !== undefined,
      },
      now,
    );

    try {
      const results = await this.#db.batch(
        this.#withFault([insert, ...append]),
      );
      if ((results[0]?.meta?.changes ?? 0) === 0)
        throw new AssetNotFoundError();
    } catch (cause) {
      this.#fail(cause);
    }

    const created = await this.getObligation(obligationId);
    if (!created) throw new AssetStorageError();
    return created;
  }

  async getObligation(obligationId: string): Promise<AssetObligation | null> {
    const id = validateAssetId(obligationId);
    try {
      const row = await this.#db
        .prepare(
          `SELECT ${OBLIGATION_COLUMNS} FROM asset_obligations
            WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL
            LIMIT 1`,
        )
        .bind(this.#workspaceId, id)
        .first<ObligationRow>();
      return row ? this.#rowToObligation(row) : null;
    } catch (cause) {
      this.#fail(cause);
    }
  }

  async updateObligation(
    obligationId: string,
    changes: UpdateAssetObligationInput,
  ): Promise<AssetObligationChangeResult> {
    const id = validateAssetId(obligationId);
    const current = await this.getObligation(id);
    if (!current) throw new AssetNotFoundError();
    const v = validateAssetObligation(changes, "update", {
      dueDate: current.dueDate,
      meterThreshold: current.meterThreshold,
      meterUnit: current.meterUnit,
      meterInterval: current.meterInterval,
      recurrenceKind: current.recurrenceKind,
    });

    const COLUMN: Record<string, string> = {
      category: "category",
      title: "title",
      description: "description",
      dueDate: "due_date",
      leadDays: "lead_days",
      recurrenceKind: "recurrence_kind",
      recurrenceInterval: "recurrence_interval",
      meterThreshold: "meter_threshold",
      meterInterval: "meter_interval",
      meterUnit: "meter_unit",
    };
    const CURRENT: Record<string, string | number | null> = {
      category: current.category,
      title: current.title,
      description: current.description,
      dueDate: current.dueDate,
      leadDays: current.leadDays,
      recurrenceKind: current.recurrenceKind,
      recurrenceInterval: current.recurrenceInterval,
      meterThreshold: current.meterThreshold,
      meterInterval: current.meterInterval,
      meterUnit: current.meterUnit,
    };

    const setColumns: string[] = [];
    const setValues: (string | number | null)[] = [];
    const changedFields: string[] = [];
    for (const [field, column] of Object.entries(COLUMN)) {
      const next = (v as unknown as Record<string, unknown>)[field];
      if (next === undefined) continue;
      const value = next as string | number | null;
      if (value === CURRENT[field]) continue;
      setColumns.push(column);
      setValues.push(value);
      changedFields.push(field);
    }

    if (setColumns.length === 0) {
      return { obligation: current, changed: false };
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const update = this.#db
      .prepare(
        `UPDATE asset_obligations
            SET ${setColumns.map((c) => `${c} = ?`).join(", ")}, updated_at = ?
          WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL
         RETURNING id`,
      )
      .bind(...setValues, nowTs, this.#workspaceId, id);

    const append = this.#appendStatements(
      ASSET_OBLIGATION_RESCHEDULED,
      [current.assetId],
      { category: current.category, fields: changedFields },
      now,
    );

    try {
      const results = await this.#db.batch(
        this.#withFault([update, ...append]),
      );
      if ((results[0]?.meta?.changes ?? 0) === 0)
        throw new AssetConflictError();
    } catch (cause) {
      this.#fail(cause);
    }

    const refreshed = await this.getObligation(id);
    if (!refreshed) throw new AssetStorageError();

    // The obligation is authoritative for the due date, so an open linked Task
    // follows it. This is what stops the two permanently diverging (§7).
    if (
      changedFields.includes("dueDate") &&
      refreshed.taskId &&
      refreshed.status === "open" &&
      this.#taskGateway
    ) {
      try {
        await this.#taskGateway.rescheduleTask(
          refreshed.taskId,
          refreshed.dueDate,
        );
      } catch {
        // A Task that cannot be moved is surfaced by reconciliation, never a 500.
      }
    }

    return { obligation: refreshed, changed: true };
  }

  async setObligationStatus(
    obligationId: string,
    status: Exclude<AssetObligationStatus, "completed">,
  ): Promise<AssetObligationChangeResult> {
    const id = validateAssetId(obligationId);
    const current = await this.getObligation(id);
    if (!current) throw new AssetNotFoundError();
    if (current.status === status) {
      return { obligation: current, changed: false };
    }
    if (current.status === "completed") {
      // Reopening a completed occurrence would orphan its successor and its proof.
      throw new AssetValidationError(
        "status",
        "cannot be changed once the obligation is completed",
      );
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const update = this.#db
      .prepare(
        `UPDATE asset_obligations
            SET status = ?, updated_at = ?
          WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL
            AND status = ?
         RETURNING id`,
      )
      .bind(status, nowTs, this.#workspaceId, id, current.status);

    const append = this.#appendStatements(
      status === "open"
        ? ASSET_OBLIGATION_REOPENED
        : ASSET_OBLIGATION_DISMISSED,
      [current.assetId],
      { category: current.category, status },
      now,
    );

    try {
      const results = await this.#db.batch(
        this.#withFault([update, ...append]),
      );
      if ((results[0]?.meta?.changes ?? 0) === 0)
        throw new AssetConflictError();
    } catch (cause) {
      this.#fail(cause);
    }

    const refreshed = await this.getObligation(id);
    if (!refreshed) throw new AssetStorageError();
    return { obligation: refreshed, changed: true };
  }

  async completeObligation(
    obligationId: string,
    input: CompleteAssetObligationInput = {},
  ): Promise<CompleteAssetObligationResult> {
    const id = validateAssetId(obligationId);
    const current = await this.getObligation(id);
    if (!current) throw new AssetNotFoundError();
    const c = validateObligationCompletion(input);
    const facts = await this.#assetFacts(current.assetId);
    if (!facts) throw new AssetNotFoundError();
    await this.#assertRelations({
      personId: c.personId,
      noteId: c.noteId,
    });

    // Idempotent: an already-completed occurrence returns its existing completion
    // rather than writing a second event or a second successor.
    if (current.status === "completed") {
      return this.#existingCompletion(current);
    }

    const completedOn = c.completedOn ?? (await this.#today());
    const eventCategory = completionEventCategory(current.category);
    const eventId = this.#newId();
    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);

    // Work out the successor BEFORE writing anything, so the whole transaction is
    // decided up front and the batch is a pure write.
    const recurs = current.recurrenceKind !== "none";
    const successorId = recurs && c.createSuccessor ? this.#newId() : null;
    const nextDue =
      c.nextDueDate ??
      (current.recurrenceKind === "meter"
        ? current.dueDate
        : nextObligationDate(
            completedOn,
            current.recurrenceKind,
            current.recurrenceInterval,
          ));
    const nextThreshold =
      current.recurrenceKind === "meter" &&
      current.meterInterval !== null &&
      current.meterUnit !== null
        ? nextMeterThreshold(
            // Anchor on the reading the work was actually done at when we have
            // one, else on the threshold that was met.
            c.meterUnit === current.meterUnit && c.meterValue !== null
              ? c.meterValue
              : (current.meterThreshold ?? 0),
            current.meterInterval,
          )
        : null;

    /* -- The linked Task goes FIRST, through its own repository ------------ */
    let taskOutcome: CompleteAssetObligationResult["taskOutcome"] = "none";
    if (current.taskId) {
      if (this.#taskGateway) {
        try {
          taskOutcome = await this.#taskGateway.completeTask(current.taskId);
        } catch {
          taskOutcome = "already_closed";
        }
      } else {
        taskOutcome = "already_closed";
      }
    }

    /* -- Then the obligation transaction ---------------------------------- */

    const closeObligation = this.#db
      .prepare(
        `UPDATE asset_obligations
            SET status = 'completed', completed_at = ?, completed_event_id = ?,
                next_obligation_id = ?, updated_at = ?
          WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL
            AND status = 'open'
         RETURNING id`,
      )
      .bind(nowTs, eventId, successorId, nowTs, this.#workspaceId, id);

    const append = this.#appendStatements(
      ASSET_OBLIGATION_COMPLETED,
      [current.assetId],
      {
        category: current.category,
        recurrence: current.recurrenceKind,
        createdSuccessor: successorId !== null,
        taskOutcome,
      },
      now,
    );

    // The event only lands if the obligation actually closed and now points at
    // exactly this event id — so a losing concurrent completion writes nothing.
    const completionGuard = `EXISTS (
      SELECT 1 FROM asset_obligations
      WHERE workspace_id = ? AND id = ? AND status = 'completed'
        AND completed_event_id = ?
    )`;

    const insertEvent = this.#db
      .prepare(
        `INSERT INTO asset_events
           (${EVENT_COLUMNS.replace(/\s+/g, " ")})
         SELECT ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL, NULL
          WHERE ${completionGuard}`,
      )
      .bind(
        eventId,
        this.#workspaceId,
        current.assetId,
        eventCategory,
        c.title ?? current.title,
        completedOn,
        c.description,
        c.provider,
        c.personId,
        c.costMinor,
        c.currencyCode,
        c.meterValue,
        c.meterUnit,
        nextDue,
        current.taskId,
        c.noteId,
        id,
        nowTs,
        nowTs,
        this.#workspaceId,
        id,
        eventId,
      );

    const batch: D1PreparedStatement[] = [
      closeObligation,
      ...append,
      insertEvent,
    ];

    // AT MOST ONE successor. Both the NOT EXISTS guard and the
    // (workspace_id, series_id, sequence) UNIQUE constraint have to be satisfied,
    // so neither a retry nor a concurrent completion can produce a second one.
    if (successorId !== null) {
      batch.push(
        this.#db
          .prepare(
            `INSERT INTO asset_obligations
               (id, workspace_id, asset_id, category, title, description, due_date,
                lead_days, recurrence_kind, recurrence_interval, meter_threshold,
                meter_interval, meter_unit, status, task_id, completed_event_id,
                completed_at, next_obligation_id, series_id, sequence, created_at,
                updated_at, archived_at, deleted_at)
             SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', NULL, NULL,
                    NULL, NULL, ?, ?, ?, ?, NULL, NULL
              WHERE ${completionGuard}
                AND NOT EXISTS (
                      SELECT 1 FROM asset_obligations
                      WHERE workspace_id = ? AND series_id = ? AND sequence = ?
                    )`,
          )
          .bind(
            successorId,
            this.#workspaceId,
            current.assetId,
            current.category,
            current.title,
            current.description,
            nextDue,
            current.leadDays,
            current.recurrenceKind,
            current.recurrenceInterval,
            nextThreshold ?? current.meterThreshold,
            current.meterInterval,
            current.meterUnit,
            current.seriesId,
            current.sequence + 1,
            nowTs,
            nowTs,
            this.#workspaceId,
            id,
            eventId,
            this.#workspaceId,
            current.seriesId,
            current.sequence + 1,
          ),
      );
    }

    // Advance the Asset's canonical fact for this category, forward-only.
    const factField = canonicalFactForCategory(current.category);
    const canonicalSets: string[] = [];
    const canonicalParams: (string | number | null)[] = [];
    if (factField !== null && nextDue !== null) {
      const column =
        factField === "renewalDate"
          ? "renewal_date"
          : factField === "warrantyExpiry"
            ? "warranty_expiry"
            : "next_service_date";
      canonicalSets.push(
        `${column} = CASE WHEN ${column} IS NULL OR ? > ${column} THEN ? ELSE ${column} END`,
      );
      canonicalParams.push(nextDue, nextDue);
    }
    if (factField === "nextServiceDate") {
      canonicalSets.push(
        "last_service_date = CASE WHEN last_service_date IS NULL OR ? > last_service_date THEN ? ELSE last_service_date END",
      );
      canonicalParams.push(completedOn, completedOn);
    }
    if (c.meterValue !== null && c.meterUnit !== null) {
      const guard = `(current_meter_date IS NULL
          OR (? >= current_meter_date
              AND (current_meter_unit IS NOT ? OR ? >= current_meter_value)))`;
      canonicalSets.push(
        `current_meter_value = CASE WHEN ${guard} THEN ? ELSE current_meter_value END`,
        `current_meter_unit = CASE WHEN ${guard} THEN ? ELSE current_meter_unit END`,
        `current_meter_date = CASE WHEN ${guard} THEN ? ELSE current_meter_date END`,
      );
      canonicalParams.push(
        completedOn,
        c.meterUnit,
        c.meterValue,
        c.meterValue,
        completedOn,
        c.meterUnit,
        c.meterValue,
        c.meterUnit,
        completedOn,
        c.meterUnit,
        c.meterValue,
        completedOn,
      );
    }
    if (canonicalSets.length > 0) {
      batch.push(
        this.#db
          .prepare(
            `UPDATE asset_details
                SET ${canonicalSets.join(", ")}, updated_at = ?
              WHERE workspace_id = ? AND entity_id = ?
                AND ${completionGuard}`,
          )
          .bind(
            ...canonicalParams,
            nowTs,
            this.#workspaceId,
            current.assetId,
            this.#workspaceId,
            id,
            eventId,
          ),
      );
    }

    try {
      const results = await this.#db.batch(this.#withFault(batch));
      if ((results[0]?.meta?.changes ?? 0) === 0) {
        // A concurrent completion won. Report ITS result — never a second one.
        const reread = await this.getObligation(id);
        if (reread && reread.status === "completed") {
          return this.#existingCompletion(reread);
        }
        throw new AssetConflictError();
      }
    } catch (cause) {
      this.#fail(cause);
    }

    const [obligation, event, successor] = await Promise.all([
      this.getObligation(id),
      this.getEvent(eventId),
      successorId ? this.getObligation(successorId) : Promise.resolve(null),
    ]);
    if (!obligation || !event) throw new AssetStorageError();

    return {
      obligation,
      event: {
        id: event.id,
        title: event.title,
        eventDate: event.eventDate,
      },
      successor,
      taskOutcome,
    };
  }

  /** Rebuild the result of a completion that already happened (idempotency). */
  async #existingCompletion(
    obligation: AssetObligation,
  ): Promise<CompleteAssetObligationResult> {
    const [event, successor] = await Promise.all([
      obligation.completedEventId
        ? this.getEvent(obligation.completedEventId)
        : Promise.resolve(null),
      obligation.nextObligationId
        ? this.getObligation(obligation.nextObligationId)
        : Promise.resolve(null),
    ]);
    return {
      obligation,
      event: event
        ? { id: event.id, title: event.title, eventDate: event.eventDate }
        : {
            id: "",
            title: obligation.title,
            eventDate: obligation.dueDate ?? "",
          },
      successor,
      taskOutcome: obligation.taskId ? "already_closed" : "none",
    };
  }

  async deleteObligation(obligationId: string): Promise<boolean> {
    const id = validateAssetId(obligationId);
    const current = await this.getObligation(id);
    if (!current) return false;

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const update = this.#db
      .prepare(
        `UPDATE asset_obligations
            SET deleted_at = ?, updated_at = ?
          WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL
         RETURNING id`,
      )
      .bind(nowTs, nowTs, this.#workspaceId, id);

    const append = this.#appendStatements(
      ASSET_OBLIGATION_DISMISSED,
      [current.assetId],
      { category: current.category, status: "deleted" },
      now,
    );

    try {
      const results = await this.#db.batch(
        this.#withFault([update, ...append]),
      );
      return (results[0]?.meta?.changes ?? 0) > 0;
    } catch (cause) {
      this.#fail(cause);
    }
  }

  async listObligations(
    input: ListAssetObligationsInput,
  ): Promise<AssetObligationPage> {
    const assetId = validateAssetId(input.assetId);
    const limit = validateObligationsLimit(input.limit);
    const filters = validateObligationFilters(input.filters);

    const scope: AssetHistoryCursorScope = {
      workspaceId: this.#workspaceId,
      assetId,
      kind: "obligations",
      filterKey: historyFilterKey(filters.categories, filters.statuses),
    };

    const conditions = [
      "workspace_id = ?",
      "asset_id = ?",
      "deleted_at IS NULL",
    ];
    const params: unknown[] = [this.#workspaceId, assetId];
    if (filters.categories.length > 0) {
      conditions.push(
        `category IN (${filters.categories.map(() => "?").join(", ")})`,
      );
      params.push(...filters.categories);
    }
    if (filters.statuses.length > 0) {
      conditions.push(
        `status IN (${filters.statuses.map(() => "?").join(", ")})`,
      );
      params.push(...filters.statuses);
    }

    // Open work first, then soonest due — the order the owner reads.
    const primary = `(CASE status WHEN 'open' THEN '0' WHEN 'on_hold' THEN '1' WHEN 'dismissed' THEN '2' ELSE '3' END
      || coalesce(due_date, '${DATE_SENTINEL}'))`;

    if (input.cursor !== undefined) {
      const position = decodeAssetHistoryCursorForScope(input.cursor, scope);
      conditions.push(`(${primary} > ? OR (${primary} = ? AND id > ?))`);
      params.push(position.primary, position.primary, position.id);
    }
    params.push(limit + 1);

    let rows: (ObligationRow & { sort_primary: string })[];
    try {
      const result = await this.#db
        .prepare(
          `SELECT ${OBLIGATION_COLUMNS}, ${primary} AS sort_primary
             FROM asset_obligations
            WHERE ${conditions.join(" AND ")}
            ORDER BY ${primary} ASC, id ASC
            LIMIT ?`,
        )
        .bind(...params)
        .all<ObligationRow & { sort_primary: string }>();
      rows = result.results;
    } catch (cause) {
      this.#fail(cause);
    }

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows.at(-1);
    return {
      items: pageRows.map((row) => this.#rowToObligation(row)),
      nextCursor:
        hasMore && last
          ? encodeAssetHistoryCursor(scope, {
              primary: last.sort_primary,
              id: last.id,
            })
          : null,
      hasMore,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Task integration                                                       */
  /* ---------------------------------------------------------------------- */

  async linkObligationTask(
    obligationId: string,
    taskId: string,
  ): Promise<LinkObligationTaskResult> {
    const id = validateAssetId(obligationId);
    const task = validateAssetId(taskId);
    const current = await this.getObligation(id);
    if (!current) throw new AssetNotFoundError();
    await this.#assertRelations({ taskId: task });

    if (current.taskId === task) {
      return { obligation: current, taskId: task, created: false };
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const update = this.#db
      .prepare(
        `UPDATE asset_obligations
            SET task_id = ?, updated_at = ?
          WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL
            AND task_id IS NOT ?
         RETURNING id`,
      )
      .bind(task, nowTs, this.#workspaceId, id, task);

    const append = this.#appendStatements(
      ASSET_TASK_LINKED,
      [current.assetId, task],
      { category: current.category },
      now,
    );

    try {
      const results = await this.#db.batch(
        this.#withFault([update, ...append]),
      );
      if ((results[0]?.meta?.changes ?? 0) === 0)
        throw new AssetConflictError();
    } catch (cause) {
      this.#fail(cause);
    }

    const refreshed = await this.getObligation(id);
    if (!refreshed) throw new AssetStorageError();
    return { obligation: refreshed, taskId: task, created: true };
  }

  async unlinkObligationTask(
    obligationId: string,
  ): Promise<AssetObligationChangeResult> {
    const id = validateAssetId(obligationId);
    const current = await this.getObligation(id);
    if (!current) throw new AssetNotFoundError();
    if (current.taskId === null) {
      return { obligation: current, changed: false };
    }
    const nowTs = toStorageTimestamp(this.#clock());
    try {
      await this.#db
        .prepare(
          `UPDATE asset_obligations
              SET task_id = NULL, updated_at = ?
            WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL`,
        )
        .bind(nowTs, this.#workspaceId, id)
        .run();
    } catch (cause) {
      this.#fail(cause);
    }
    const refreshed = await this.getObligation(id);
    if (!refreshed) throw new AssetStorageError();
    return { obligation: refreshed, changed: true };
  }

  async reconcileObligationTask(
    obligationId: string,
  ): Promise<ObligationTaskReconciliation> {
    const id = validateAssetId(obligationId);
    const current = await this.getObligation(id);
    if (!current) throw new AssetNotFoundError();
    if (current.taskId === null) {
      return { obligation: current, taskState: "none", changed: false };
    }

    let row: { open: number; exists: number } | null;
    try {
      row = await this.#db
        .prepare(
          `SELECT
             (SELECT count(*) FROM entities
               WHERE workspace_id = ? AND id = ? AND type = 'task'
                 AND deleted_at IS NULL) AS exists_count,
             (SELECT count(*) FROM entities te
                JOIN spine_records sr
                  ON sr.workspace_id = te.workspace_id AND sr.entity_id = te.id
                LEFT JOIN task_details td
                  ON td.workspace_id = te.workspace_id AND td.entity_id = te.id
               WHERE te.workspace_id = ? AND te.id = ? AND te.type = 'task'
                 AND te.deleted_at IS NULL AND sr.completed_at IS NULL
                 AND coalesce(td.status, 'todo') <> 'cancelled') AS open_count`,
        )
        .bind(
          this.#workspaceId,
          current.taskId,
          this.#workspaceId,
          current.taskId,
        )
        .first<{ exists_count: number; open_count: number }>()
        .then((r) =>
          r ? { open: r.open_count, exists: r.exists_count } : null,
        );
    } catch (cause) {
      this.#fail(cause);
    }

    const exists = (row?.exists ?? 0) > 0;
    const open = (row?.open ?? 0) > 0;

    if (!exists) {
      // Heal the dangling pointer so the owner can create a fresh Task (§7).
      const cleared = await this.unlinkObligationTask(id);
      return {
        obligation: cleared.obligation,
        taskState: "missing",
        changed: cleared.changed,
      };
    }

    // A completed Task NEVER completes the obligation: ticking off "book the
    // service" is not proof the car was serviced (§7). The record surfaces
    // "record what happened" instead.
    return {
      obligation: current,
      taskState: open ? "open" : "completed",
      changed: false,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Cross-asset reads                                                      */
  /* ---------------------------------------------------------------------- */

  async listAttention(
    input: AssetAttentionInput,
  ): Promise<readonly AssetAttentionItem[]> {
    const today = input.today;
    const horizon = Math.max(
      0,
      Math.min(input.horizonDays ?? DEFAULT_ATTENTION_HORIZON_DAYS, 365),
    );
    const limit = Math.max(
      1,
      Math.min(input.limit ?? MAX_ATTENTION_ITEMS, MAX_ATTENTION_ITEMS),
    );
    const horizonDate = addCalendarDays(today, horizon);

    let rows: (ObligationRow & {
      asset_title: string;
      asset_type: string;
      current_meter_value: number | null;
      current_meter_unit: string | null;
      has_open_task: number;
    })[];
    try {
      const result = await this.#db
        .prepare(
          `SELECT ${OBLIGATION_COLUMNS.split(",")
            .map((c) => `o.${c.trim()}`)
            .join(", ")},
                  e.title AS asset_title,
                  d.asset_type AS asset_type,
                  d.current_meter_value AS current_meter_value,
                  d.current_meter_unit AS current_meter_unit,
                  CASE WHEN o.task_id IS NOT NULL AND ${OPEN_TASK_EXISTS}
                       THEN 1 ELSE 0 END AS has_open_task
             FROM asset_obligations o
             JOIN entities e
               ON e.workspace_id = o.workspace_id AND e.id = o.asset_id
              AND e.type = '${ASSET_ENTITY_TYPE}' AND e.deleted_at IS NULL
             JOIN asset_details d
               ON d.workspace_id = o.workspace_id AND d.entity_id = o.asset_id
            WHERE o.workspace_id = ? AND o.status = 'open' AND o.deleted_at IS NULL
              -- An ARCHIVED asset stops asking for things (§18).
              AND d.archived_at IS NULL
              AND (
                    (o.due_date IS NOT NULL AND o.due_date <= ?)
                    OR o.meter_threshold IS NOT NULL
                  )
            ORDER BY coalesce(o.due_date, '${DATE_SENTINEL}') ASC, o.id ASC
            LIMIT ?`,
        )
        .bind(this.#workspaceId, horizonDate, limit)
        .all<
          ObligationRow & {
            asset_title: string;
            asset_type: string;
            current_meter_value: number | null;
            current_meter_unit: string | null;
            has_open_task: number;
          }
        >();
      rows = result.results;
    } catch (cause) {
      this.#fail(cause);
    }

    return (
      rows
        .map((row) => {
          const obligation = this.#rowToObligation(row);
          const reading =
            row.current_meter_value !== null && row.current_meter_unit !== null
              ? {
                  value: row.current_meter_value,
                  unit: row.current_meter_unit as AssetMeterUnit,
                }
              : null;
          return {
            obligation,
            assetId: row.asset_id,
            assetTitle: row.asset_title,
            assetType: row.asset_type,
            reading,
            hasOpenTask: row.has_open_task === 1,
          };
        })
        // The SQL horizon is a coarse pre-filter; the ONE canonical evaluator has
        // the final say, so Today and the record can never disagree about whether
        // something needs attention.
        .filter(
          (item) =>
            evaluateObligation(item.obligation, today, item.reading)
              .needsAttention,
        )
    );
  }

  async summariseObligations(
    assetIds: readonly string[],
    today: string,
  ): Promise<ReadonlyMap<string, AssetObligationSummary>> {
    const ids = [...new Set(assetIds)].filter((id) => id.length > 0);
    const out = new Map<string, AssetObligationSummary>();
    if (ids.length === 0) return out;
    // A collection page is already bounded; refuse to fan out beyond it.
    const bounded = ids.slice(0, 100);

    let rows: (ObligationRow & {
      current_meter_value: number | null;
      current_meter_unit: string | null;
    })[];
    try {
      const result = await this.#db
        .prepare(
          `SELECT ${OBLIGATION_COLUMNS.split(",")
            .map((c) => `o.${c.trim()}`)
            .join(", ")},
                  d.current_meter_value AS current_meter_value,
                  d.current_meter_unit AS current_meter_unit
             FROM asset_obligations o
             JOIN asset_details d
               ON d.workspace_id = o.workspace_id AND d.entity_id = o.asset_id
            WHERE o.workspace_id = ? AND o.status = 'open' AND o.deleted_at IS NULL
              AND o.asset_id IN (${bounded.map(() => "?").join(", ")})
            ORDER BY coalesce(o.due_date, '${DATE_SENTINEL}') ASC, o.id ASC`,
        )
        .bind(this.#workspaceId, ...bounded)
        .all<
          ObligationRow & {
            current_meter_value: number | null;
            current_meter_unit: string | null;
          }
        >();
      rows = result.results;
    } catch (cause) {
      this.#fail(cause);
    }

    for (const row of rows) {
      const obligation = this.#rowToObligation(row);
      const reading =
        row.current_meter_value !== null && row.current_meter_unit !== null
          ? {
              value: row.current_meter_value,
              unit: row.current_meter_unit as AssetMeterUnit,
            }
          : null;
      const evaluation = evaluateObligation(obligation, today, reading);
      const existing = out.get(row.asset_id) ?? {
        openCount: 0,
        overdueCount: 0,
        dueSoonCount: 0,
        nextDueDate: null,
        nextTitle: null,
        nextCategory: null,
        needsMeterReading: false,
      };
      out.set(row.asset_id, {
        openCount: existing.openCount + 1,
        overdueCount:
          existing.overdueCount + (evaluation.state === "overdue" ? 1 : 0),
        dueSoonCount:
          existing.dueSoonCount + (evaluation.state === "due" ? 1 : 0),
        // Rows arrive due-date ascending, so the first one wins.
        nextDueDate: existing.nextDueDate ?? obligation.dueDate,
        nextTitle: existing.nextTitle ?? obligation.title,
        nextCategory: existing.nextCategory ?? obligation.category,
        needsMeterReading:
          existing.needsMeterReading || evaluation.state === "unknown",
      });
    }
    return out;
  }
}

/** Add whole days to a calendar date (UTC math, zone-free). */
function addCalendarDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map((p) => Number.parseInt(p, 10));
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
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
