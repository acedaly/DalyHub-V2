/**
 * V2.10 LIFE-01 — the D1 adapter for the ONE Obligation store.
 *
 * This is `d1-asset-history-repository.ts`'s obligation half, moved and
 * generalised: the table is `obligation_details` beside an ordinary `entities`
 * row, the subject is optional and may be any entity, and an amount may be
 * attached. Nothing about the transaction shape changed — completion is still
 * ONE `D1Database.batch()` (ADR-083), the successor is still guarded twice, and
 * the linked Task's statements still join the obligation's own batch.
 *
 * THE SUBJECT IS WRITTEN TWICE, IN ONE BATCH. `obligation_details.subject_entity_id`
 * is the authority — it is what the indexes carry and what every structural read
 * uses — and the `obligation.subject` EntityLink beside it is its projection, so
 * the subject's record shows the obligation in its Linked items without a
 * bespoke reverse reader (ADR-118 decision 1). Both are created, cleared and
 * soft-deleted together, never apart.
 *
 * THE SUBJECT'S PROOF ARRIVES THROUGH A SEAM, not through SQL authored here.
 * An Asset-subject completion writes an `asset_events` logbook row and advances
 * the Asset's canonical dates; those statements belong to the Assets adapter
 * and are handed over by `ObligationProofGateway`. Re-authoring them here would
 * be exactly what ADR-083 decision 2 forbids.
 *
 * Every read is ONE statement. The subject's title and the linked Task's open
 * state arrive with the row through LEFT JOINs, so there is no per-obligation
 * subject query and no per-obligation Task query at any list width.
 */

import {
  buildActivityWriteModel,
  createSystemActorContext,
  secureIdGenerator as activitySecureIdGenerator,
  ActivityError,
  type ActivityActorContext,
  type ActivityPayload,
  type NewActivityEvent,
} from "~/kernel/activity";
import {
  systemClock,
  secureIdGenerator,
  type Clock,
  type IdGenerator,
} from "~/kernel/entities";
import {
  OBLIGATION_COMPLETED,
  OBLIGATION_CREATED,
  OBLIGATION_DELETED,
  OBLIGATION_DISMISSED,
  OBLIGATION_ENTITY_TYPE,
  OBLIGATION_REOPENED,
  OBLIGATION_RESCHEDULED,
  OBLIGATION_SUBJECT_LINK,
  OBLIGATION_TASK_LINKED,
  ObligationValidationError,
  decodeObligationCursorForScope,
  encodeObligationCursor,
  evaluateObligation,
  nextObligationDate,
  obligationFilterKey,
  obligationSubjectLinkId,
  validateObligation,
  validateObligationCompletion,
  validateObligationFilters,
  validateObligationId,
  validateObligationsLimit,
  validateOptionalObligationId,
  type CompleteObligationInput,
  type CompleteObligationResult,
  type CreateObligationInput,
  type ListObligationsInput,
  type LinkObligationTaskResult,
  type Obligation,
  type ObligationMeterEvaluation,
  type ObligationAttentionInput,
  type ObligationAttentionItem,
  type ObligationCategory,
  type ObligationChangeResult,
  type ObligationCursorScope,
  type ObligationProofRef,
  type ObligationRecurrenceKind,
  type ObligationRepository,
  type ObligationStatus,
  type ObligationSubject,
  type ObligationSummary,
  type ObligationTaskOutcome,
  type ObligationTaskReconciliation,
  type ObligationWithSubject,
  type ObligationWithSubjectPage,
  type UpdateObligationInput,
} from "~/kernel/obligations";
import { DEFAULT_OWNER_TIME_ZONE } from "~/kernel/preferences";
import { parseWorkspaceId, type WorkspaceContext } from "~/kernel/workspaces";
import { ownerCalendarIso } from "~/shared/datetime";

import { fromStorageTimestamp, toStorageTimestamp } from "./database";
import { D1ActivityRecorder } from "./d1-activity-recorder";
import type { AtomicMutationFault } from "./d1-atomic-mutation";

/**
 * AUDIT-13's seam, unchanged: a linked Task's completion joins the OBLIGATION's
 * batch instead of preceding it in a transaction of its own. It hands back
 * prepared statements and never writes; `guard` is AND-ed into the Task's
 * completion gate so the Task closes only if the obligation actually closed in
 * the same transaction.
 */
export interface ObligationTaskCompletionPlanner {
  planCompletion(
    taskId: string,
    options: {
      readonly ownerTodayIso: string;
      readonly guard?: {
        readonly sql: string;
        readonly params: readonly unknown[];
      };
      readonly now?: Date;
    },
  ): Promise<{
    readonly outcome: "completed" | "already_closed" | "missing";
    readonly statements: readonly D1PreparedStatement[];
  }>;
}

/** The narrow write port used to RESCHEDULE a linked Task. */
export interface ObligationTaskGateway {
  rescheduleTask(taskId: string, dueDate: string | null): Promise<boolean>;
}

/**
 * ADR-083's statement seam for a SUBJECT'S OWN history.
 *
 * An Asset keeps a logbook and canonical dates; a Person, a Project and an Area
 * do not, and an obligation about nothing has nowhere to write. So this is
 * optional by construction: a gateway that does not support a subject type
 * returns null, the completion still happens, and `proof` is null.
 *
 * The gateway returns STATEMENTS. It never writes, and the obligation's batch
 * is the only transaction.
 */
export interface ObligationProofGateway {
  /** Which subject types this gateway can write a proof for. */
  supports(subjectEntityType: string): boolean;
  planProof(input: {
    readonly obligationId: string;
    /** The id the obligation has already reserved for this proof. */
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
    /** The raw completion input, so a subject may validate its own extras. */
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
    readonly proof: ObligationProofRef;
    /** The proof row's id, stored on the obligation as `completed_event_id`. */
    readonly proofId: string;
    /**
     * Where the successor's METER threshold falls, for a meter recurrence.
     * The subject owns its meter, so it owns the arithmetic: a service done 400
     * km late schedules the next one a full interval after the reading the work
     * was done at, never a full interval after the threshold that was met.
     */
    readonly nextMeterThreshold?: number | null;
  } | null>;
}

/**
 * The meter seam: an obligation's threshold and a subject's current reading in,
 * the ONE shared evaluator's meter side out. The reading's unit is unnarrowed
 * here on purpose — this store does not know what a kilometre is, and the
 * domain that does decides whether the pair can be compared at all.
 */
export type ObligationMeterEvaluator = (
  obligation: Pick<Obligation, "meterThreshold" | "meterUnit">,
  reading: { readonly value: number | null; readonly unit: string | null },
) => ObligationMeterEvaluation | null;

export interface D1ObligationRepositoryOptions {
  readonly clock?: Clock;
  readonly idGenerator?: IdGenerator;
  readonly actorContext?: ActivityActorContext;
  readonly activityIdGenerator?: IdGenerator;
  readonly taskGateway?: ObligationTaskGateway;
  readonly taskCompletionPlanner?: ObligationTaskCompletionPlanner;
  readonly proofGateway?: ObligationProofGateway;
  /** The meter units this workspace's subjects accept. */
  readonly meterUnits?: readonly string[];
  /**
   * Evaluate a meter commitment against a subject's current reading.
   *
   * Injected, like `proofGateway`, because a meter belongs to the domain that
   * owns its units: this store knows a threshold and an unnarrowed unit string,
   * and the Assets kernel knows what 60,000 km MEANS against an odometer,
   * including how close counts as approaching. Absent — a workspace with no
   * metered subjects, or a test that supplies none — every meter side is
   * `null`, which is the same answer as "no reading".
   */
  readonly meterEvaluator?: ObligationMeterEvaluator;
  /** TEST-ONLY deterministic batch fault, proving whole-transaction rollback. */
  readonly mutationFault?: AtomicMutationFault;
  /** TEST-ONLY: fail the completion batch AFTER the linked Task's statements. */
  readonly obligationTaskFault?: boolean;
  /** Resolve the OWNER's timezone, so "today" is the one every module uses. */
  readonly ownerTimeZone?: () => Promise<string>;
}

/** Storage refused, and the domain could not say why in its own terms. */
export class ObligationStorageError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("The obligation store could not complete that.", options);
    this.name = "ObligationStorageError";
  }
}

/** No such obligation in this workspace — including "it is somebody else's". */
export class ObligationNotFoundError extends Error {
  constructor() {
    super("No such obligation.");
    this.name = "ObligationNotFoundError";
  }
}

/** The obligation changed underneath the operation. */
export class ObligationConflictError extends Error {
  constructor() {
    super("That obligation changed while you were working on it.");
    this.name = "ObligationConflictError";
  }
}

const SUBJECT_ROLE = "subject";
/** A far-future sentinel so NULL due dates sort LAST under ascending order. */
const DATE_SENTINEL = "9999-12-31";

const OBLIGATION_COLUMNS = `o.entity_id, o.workspace_id, o.subject_entity_id,
  o.subject_entity_type, o.category, o.description, o.due_date, o.lead_days,
  o.recurrence_kind, o.recurrence_interval, o.meter_threshold, o.meter_interval,
  o.meter_unit, o.expected_amount_minor, o.completed_amount_minor,
  o.currency_code, o.status, o.task_id, o.completed_event_id, o.completed_at,
  o.completed_on, o.next_obligation_id, o.series_id, o.sequence, o.created_at,
  o.updated_at, o.archived_at, o.deleted_at, e.title AS title`;

/**
 * A Task counts as OPEN when it exists, is not soft-deleted, has not been
 * completed on the spine, and was not cancelled. Cancellation is a deliberate
 * decision not to proceed (ADR-043 §5), so a cancelled Task is no longer the
 * obligation's actionable commitment and the owner may create a fresh one.
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

interface ObligationRow {
  readonly entity_id: string;
  readonly workspace_id: string;
  readonly subject_entity_id: string | null;
  readonly subject_entity_type: string | null;
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
  readonly expected_amount_minor: number | null;
  readonly completed_amount_minor: number | null;
  readonly currency_code: string | null;
  readonly status: string;
  readonly task_id: string | null;
  readonly completed_event_id: string | null;
  readonly completed_at: string | null;
  readonly completed_on: string | null;
  readonly next_obligation_id: string | null;
  readonly series_id: string;
  readonly sequence: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly archived_at: string | null;
  readonly deleted_at: string | null;
}

type SubjectColumns = {
  readonly subject_title: string | null;
  readonly subject_type: string | null;
  readonly has_open_task: number;
};

export class D1ObligationRepository implements ObligationRepository {
  readonly #db: D1Database;
  readonly #workspaceId: string;
  readonly context: WorkspaceContext;
  readonly #clock: Clock;
  readonly #newId: IdGenerator;
  readonly #actor: ActivityActorContext;
  readonly #newActivityId: IdGenerator;
  readonly #recorder: D1ActivityRecorder;
  readonly #taskGateway?: ObligationTaskGateway;
  readonly #taskCompletionPlanner?: ObligationTaskCompletionPlanner;
  readonly #proofGateway?: ObligationProofGateway;
  readonly #meterUnits: readonly string[];
  readonly #meterEvaluator?: ObligationMeterEvaluator;
  readonly #mutationFault?: AtomicMutationFault;
  readonly #obligationTaskFault?: boolean;
  readonly #ownerTimeZone: () => Promise<string>;

  constructor(
    db: D1Database,
    context: WorkspaceContext,
    options: D1ObligationRepositoryOptions = {},
  ) {
    this.#db = db;
    this.context = context;
    this.#workspaceId = context.workspaceId;
    this.#clock = options.clock ?? systemClock;
    this.#newId = options.idGenerator ?? secureIdGenerator;
    this.#actor = options.actorContext ?? createSystemActorContext();
    this.#newActivityId =
      options.activityIdGenerator ?? activitySecureIdGenerator;
    this.#recorder = new D1ActivityRecorder(db);
    this.#taskGateway = options.taskGateway;
    this.#taskCompletionPlanner = options.taskCompletionPlanner;
    this.#proofGateway = options.proofGateway;
    this.#meterUnits = options.meterUnits ?? [];
    this.#meterEvaluator = options.meterEvaluator;
    this.#mutationFault = options.mutationFault;
    this.#obligationTaskFault = options.obligationTaskFault;
    this.#ownerTimeZone =
      options.ownerTimeZone ?? (() => Promise.resolve(DEFAULT_OWNER_TIME_ZONE));
  }

  /* ---------------------------------------------------------------------- */
  /* Shared internals                                                       */
  /* ---------------------------------------------------------------------- */

  #forcedFailure(): D1PreparedStatement {
    return this.#db.prepare("SELECT 1 FROM __dalyhub_obligation_fault__");
  }

  #withFault(batch: D1PreparedStatement[]): D1PreparedStatement[] {
    if (this.#mutationFault === undefined) return batch;
    const spliced = [...batch];
    spliced.splice(1, 0, this.#forcedFailure());
    return spliced;
  }

  /**
   * The obligation is a subject of its own events, and so is the thing it is
   * about — the multi-anchor shape `asset.task_linked` already uses. That is
   * what keeps an Asset's timeline showing what happened to its obligations
   * without a bespoke read, and what gives a subject-less obligation a timeline
   * at all.
   */
  #appendStatements(
    type: string,
    subjects: readonly (string | null)[],
    payload: ActivityPayload,
    now: Date,
  ): D1PreparedStatement[] {
    const anchors = [...new Set(subjects.filter((id): id is string => !!id))];
    const event: NewActivityEvent = {
      type,
      subjects: anchors.map((entityId) => ({ entityId, role: SUBJECT_ROLE })),
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
    if (
      cause instanceof ObligationValidationError ||
      cause instanceof ObligationNotFoundError ||
      cause instanceof ObligationConflictError ||
      cause instanceof ActivityError
    ) {
      throw cause;
    }
    throw new ObligationStorageError({ cause });
  }

  /** The owner-calendar day, so every derived state resolves in one timezone. */
  async #today(): Promise<string> {
    return ownerCalendarIso(this.#clock(), await this.#ownerTimeZone());
  }

  #rowToObligation(row: ObligationRow): Obligation {
    return {
      id: row.entity_id,
      workspaceId: parseWorkspaceId(row.workspace_id),
      subjectEntityId: row.subject_entity_id,
      subjectEntityType: row.subject_entity_type,
      category: row.category as ObligationCategory,
      title: row.title,
      description: row.description,
      dueDate: row.due_date,
      leadDays: row.lead_days,
      recurrenceKind: row.recurrence_kind as ObligationRecurrenceKind,
      recurrenceInterval: row.recurrence_interval,
      meterThreshold: row.meter_threshold,
      meterInterval: row.meter_interval,
      meterUnit: row.meter_unit,
      expectedAmountMinor: row.expected_amount_minor,
      completedAmountMinor: row.completed_amount_minor,
      currencyCode: row.currency_code,
      status: row.status as ObligationStatus,
      taskId: row.task_id,
      completedEventId: row.completed_event_id,
      completedAt:
        row.completed_at === null
          ? null
          : fromStorageTimestamp(row.completed_at),
      completedOn: row.completed_on,
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

  #subjectOf(
    row: ObligationRow & Partial<SubjectColumns>,
  ): ObligationSubject | null {
    if (
      row.subject_entity_id === null ||
      row.subject_entity_type === null ||
      !row.subject_title
    ) {
      return null;
    }
    return {
      id: row.subject_entity_id,
      type: row.subject_entity_type,
      title: row.subject_title,
    };
  }

  /**
   * Assert a referenced record exists IN THIS WORKSPACE. A foreign id is
   * refused here with a field-level message; the composite foreign key refuses
   * it again at the database, which is the boundary that actually holds.
   */
  async #assertExists(
    id: string,
    type: string,
    field: string,
  ): Promise<string | null> {
    const row = await this.#db
      .prepare(
        `SELECT type FROM entities
          WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1`,
      )
      .bind(this.#workspaceId, id)
      .first<{ type: string }>();
    if (!row || (type !== "*" && row.type !== type)) {
      throw new ObligationValidationError(
        field,
        "does not point at a record in this workspace",
      );
    }
    return row.type;
  }

  /* ---------------------------------------------------------------------- */
  /* Create                                                                 */
  /* ---------------------------------------------------------------------- */

  async create(input: CreateObligationInput): Promise<Obligation> {
    const v = validateObligation(input, "create", undefined, this.#meterUnits);
    const subjectId = validateOptionalObligationId(
      input.subjectEntityId,
      "subjectEntityId",
    );

    // A meter belongs to the thing that has one. The database says so too, but
    // a named refusal is better than a constraint violation.
    if (
      v.meterThreshold !== null &&
      v.meterThreshold !== undefined &&
      !subjectId
    ) {
      throw new ObligationValidationError(
        "meterThreshold",
        "needs something to measure — add what this is about first",
      );
    }

    let subjectType: string | null = null;
    if (subjectId) {
      subjectType = await this.#assertExists(subjectId, "*", "subjectEntityId");
    }

    const obligationId = this.#newId();
    // A fresh series starts at sequence 0. Every successor shares this id, which
    // is what makes a recurrence walkable and its successors unique.
    const seriesId = obligationId;
    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const title = v.title ?? "";

    const insertEntity = this.#db
      .prepare(
        `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        obligationId,
        this.#workspaceId,
        OBLIGATION_ENTITY_TYPE,
        title,
        nowTs,
        nowTs,
      );

    const insertDetails = this.#db
      .prepare(
        `INSERT INTO obligation_details
           (workspace_id, entity_id, subject_entity_id, subject_entity_type,
            category, description, due_date, lead_days, recurrence_kind,
            recurrence_interval, meter_threshold, meter_interval, meter_unit,
            expected_amount_minor, completed_amount_minor, currency_code,
            status, task_id, completed_event_id, completed_at, completed_on,
            next_obligation_id, series_id, sequence, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?,
                 'open', NULL, NULL, NULL, NULL, NULL, ?, 0, ?, ?)`,
      )
      .bind(
        this.#workspaceId,
        obligationId,
        subjectId,
        subjectType,
        v.category ?? "reminder",
        v.description ?? null,
        v.dueDate ?? null,
        v.leadDays ?? 14,
        v.recurrenceKind ?? "none",
        v.recurrenceInterval ?? null,
        v.meterThreshold ?? null,
        v.meterInterval ?? null,
        v.meterUnit ?? null,
        v.expectedAmountMinor ?? null,
        v.currencyCode ?? null,
        seriesId,
        nowTs,
        nowTs,
      );

    const batch: D1PreparedStatement[] = [insertEntity, insertDetails];

    // The subject's PROJECTION, in the same transaction as its authority.
    if (subjectId) {
      batch.push(this.#subjectLinkStatement(obligationId, subjectId, nowTs));
    }

    batch.push(
      ...this.#appendStatements(
        OBLIGATION_CREATED,
        [obligationId, subjectId],
        {
          category: v.category ?? "reminder",
          recurrence: v.recurrenceKind ?? "none",
          hasSubject: subjectId !== null,
          // A payload carries structure, never a value: whether an amount was
          // set, never what it was (ADR-049 decision 5).
          hasExpectedAmount:
            v.expectedAmountMinor !== null &&
            v.expectedAmountMinor !== undefined,
        },
        now,
      ),
    );

    try {
      await this.#db.batch(this.#withFault(batch));
    } catch (cause) {
      this.#fail(cause);
    }

    const created = await this.get(obligationId);
    if (!created) throw new ObligationStorageError();
    return created;
  }

  /** The `obligation.subject` projection, created or restored idempotently. */
  #subjectLinkStatement(
    obligationId: string,
    subjectId: string,
    nowTs: string,
  ): D1PreparedStatement {
    return this.#db
      .prepare(
        `INSERT INTO entity_links
           (id, workspace_id, source_entity_id, target_entity_id, type,
            created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT (workspace_id, source_entity_id, target_entity_id, type)
         DO UPDATE SET deleted_at = NULL, updated_at = excluded.updated_at`,
      )
      .bind(
        obligationSubjectLinkId(obligationId),
        this.#workspaceId,
        obligationId,
        subjectId,
        OBLIGATION_SUBJECT_LINK,
        nowTs,
        nowTs,
      );
  }

  /* ---------------------------------------------------------------------- */
  /* Reads                                                                  */
  /* ---------------------------------------------------------------------- */

  async get(obligationId: string): Promise<Obligation | null> {
    const id = validateObligationId(obligationId);
    try {
      const row = await this.#db
        .prepare(
          `SELECT ${OBLIGATION_COLUMNS}
             FROM obligation_details o
             JOIN entities e
               ON e.workspace_id = o.workspace_id AND e.id = o.entity_id
              AND e.type = '${OBLIGATION_ENTITY_TYPE}'
            WHERE o.workspace_id = ? AND o.entity_id = ? AND o.deleted_at IS NULL
            LIMIT 1`,
        )
        .bind(this.#workspaceId, id)
        .first<ObligationRow>();
      return row ? this.#rowToObligation(row) : null;
    } catch (cause) {
      this.#fail(cause);
    }
  }

  async getWithSubject(
    obligationId: string,
  ): Promise<ObligationWithSubject | null> {
    const id = validateObligationId(obligationId);
    try {
      const row = await this.#db
        .prepare(
          `SELECT ${OBLIGATION_COLUMNS},
                  s.title AS subject_title, s.type AS subject_type,
                  CASE WHEN o.task_id IS NOT NULL AND ${OPEN_TASK_EXISTS}
                       THEN 1 ELSE 0 END AS has_open_task
             FROM obligation_details o
             JOIN entities e
               ON e.workspace_id = o.workspace_id AND e.id = o.entity_id
              AND e.type = '${OBLIGATION_ENTITY_TYPE}'
             LEFT JOIN entities s
               ON s.workspace_id = o.workspace_id AND s.id = o.subject_entity_id
              AND s.deleted_at IS NULL
            WHERE o.workspace_id = ? AND o.entity_id = ? AND o.deleted_at IS NULL
            LIMIT 1`,
        )
        .bind(this.#workspaceId, id)
        .first<ObligationRow & SubjectColumns>();
      if (!row) return null;
      return {
        obligation: this.#rowToObligation(row),
        subject: this.#subjectOf(row),
        hasOpenTask: row.has_open_task === 1,
      };
    } catch (cause) {
      this.#fail(cause);
    }
  }

  async list(
    input: ListObligationsInput = {},
  ): Promise<ObligationWithSubjectPage> {
    const limit = validateObligationsLimit(input.limit);
    const filters = validateObligationFilters(input.filters);
    const subjectEntityId =
      input.subjectEntityId === undefined
        ? undefined
        : input.subjectEntityId === null
          ? null
          : validateObligationId(input.subjectEntityId);

    const scope: ObligationCursorScope = {
      workspaceId: this.#workspaceId,
      subjectEntityId,
      filterKey: obligationFilterKey(filters.categories, filters.statuses),
    };

    const conditions = ["o.workspace_id = ?", "o.deleted_at IS NULL"];
    const params: unknown[] = [this.#workspaceId];

    if (subjectEntityId === null) {
      conditions.push("o.subject_entity_id IS NULL");
    } else if (subjectEntityId !== undefined) {
      conditions.push("o.subject_entity_id = ?");
      params.push(subjectEntityId);
    }
    if (filters.categories.length > 0) {
      conditions.push(
        `o.category IN (${filters.categories.map(() => "?").join(", ")})`,
      );
      params.push(...filters.categories);
    }
    if (filters.statuses.length > 0) {
      conditions.push(
        `o.status IN (${filters.statuses.map(() => "?").join(", ")})`,
      );
      params.push(...filters.statuses);
    }

    // Open work first, then soonest due — the order the owner reads. Ordering
    // happens in SQL over the WHOLE collection, never over the loaded page.
    const primary = `(CASE o.status WHEN 'open' THEN '0' WHEN 'on_hold' THEN '1' WHEN 'dismissed' THEN '2' ELSE '3' END
      || coalesce(o.due_date, '${DATE_SENTINEL}'))`;

    if (input.cursor !== undefined) {
      const position = decodeObligationCursorForScope(input.cursor, scope);
      conditions.push(
        `(${primary} > ? OR (${primary} = ? AND o.entity_id > ?))`,
      );
      params.push(position.primary, position.primary, position.id);
    }
    params.push(limit + 1);

    let rows: (ObligationRow & SubjectColumns & { sort_primary: string })[];
    try {
      const result = await this.#db
        .prepare(
          `SELECT ${OBLIGATION_COLUMNS}, ${primary} AS sort_primary,
                  s.title AS subject_title, s.type AS subject_type,
                  CASE WHEN o.task_id IS NOT NULL AND ${OPEN_TASK_EXISTS}
                       THEN 1 ELSE 0 END AS has_open_task
             FROM obligation_details o
             JOIN entities e
               ON e.workspace_id = o.workspace_id AND e.id = o.entity_id
              AND e.type = '${OBLIGATION_ENTITY_TYPE}'
             LEFT JOIN entities s
               ON s.workspace_id = o.workspace_id AND s.id = o.subject_entity_id
              AND s.deleted_at IS NULL
            WHERE ${conditions.join(" AND ")}
            ORDER BY ${primary} ASC, o.entity_id ASC
            LIMIT ?`,
        )
        .bind(...params)
        .all<ObligationRow & SubjectColumns & { sort_primary: string }>();
      rows = result.results;
    } catch (cause) {
      this.#fail(cause);
    }

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows.at(-1);
    const subjects = new Map<string, ObligationSubject>();
    const openTaskIds = new Set<string>();
    for (const row of pageRows) {
      const subject = this.#subjectOf(row);
      if (subject) subjects.set(subject.id, subject);
      if (row.has_open_task === 1) openTaskIds.add(row.entity_id);
    }

    return {
      items: pageRows.map((row) => this.#rowToObligation(row)),
      nextCursor:
        hasMore && last
          ? encodeObligationCursor(scope, {
              primary: last.sort_primary,
              id: last.entity_id,
            })
          : null,
      hasMore,
      subjects,
      openTaskIds,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Edits                                                                  */
  /* ---------------------------------------------------------------------- */

  async update(
    obligationId: string,
    changes: UpdateObligationInput,
  ): Promise<ObligationChangeResult> {
    const id = validateObligationId(obligationId);
    const current = await this.get(id);
    if (!current) throw new ObligationNotFoundError();
    const v = validateObligation(
      changes,
      "update",
      {
        dueDate: current.dueDate,
        meterThreshold: current.meterThreshold,
        meterUnit: current.meterUnit,
        meterInterval: current.meterInterval,
        recurrenceKind: current.recurrenceKind,
        currencyCode: current.currencyCode,
        expectedAmountMinor: current.expectedAmountMinor,
        completedAmountMinor: current.completedAmountMinor,
      },
      this.#meterUnits,
    );

    const COLUMN: Record<string, string> = {
      category: "category",
      description: "description",
      dueDate: "due_date",
      leadDays: "lead_days",
      recurrenceKind: "recurrence_kind",
      recurrenceInterval: "recurrence_interval",
      meterThreshold: "meter_threshold",
      meterInterval: "meter_interval",
      meterUnit: "meter_unit",
      expectedAmountMinor: "expected_amount_minor",
      currencyCode: "currency_code",
    };
    const CURRENT: Record<string, string | number | null> = {
      category: current.category,
      description: current.description,
      dueDate: current.dueDate,
      leadDays: current.leadDays,
      recurrenceKind: current.recurrenceKind,
      recurrenceInterval: current.recurrenceInterval,
      meterThreshold: current.meterThreshold,
      meterInterval: current.meterInterval,
      meterUnit: current.meterUnit,
      expectedAmountMinor: current.expectedAmountMinor,
      currencyCode: current.currencyCode,
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

    // The TITLE lives on the entity, so a rename is an entity write. One title,
    // one place — which is why `obligation_details` has no title column.
    const renamed = v.title !== undefined && v.title !== current.title;

    if (setColumns.length === 0 && !renamed) {
      return { obligation: current, changed: false };
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const batch: D1PreparedStatement[] = [];

    if (setColumns.length > 0) {
      batch.push(
        this.#db
          .prepare(
            `UPDATE obligation_details
                SET ${setColumns.map((c) => `${c} = ?`).join(", ")}, updated_at = ?
              WHERE workspace_id = ? AND entity_id = ? AND deleted_at IS NULL
             RETURNING entity_id`,
          )
          .bind(...setValues, nowTs, this.#workspaceId, id),
      );
    }
    if (renamed) {
      changedFields.push("title");
      batch.push(
        this.#db
          .prepare(
            `UPDATE entities SET title = ?, updated_at = ?
              WHERE workspace_id = ? AND id = ? AND type = ?
                AND deleted_at IS NULL
             RETURNING id`,
          )
          .bind(v.title, nowTs, this.#workspaceId, id, OBLIGATION_ENTITY_TYPE),
      );
    }

    batch.push(
      ...this.#appendStatements(
        OBLIGATION_RESCHEDULED,
        [id, current.subjectEntityId],
        { category: current.category, fields: changedFields },
        now,
      ),
    );

    try {
      const results = await this.#db.batch(this.#withFault(batch));
      if ((results[0]?.meta?.changes ?? 0) === 0) {
        throw new ObligationConflictError();
      }
    } catch (cause) {
      this.#fail(cause);
    }

    const refreshed = await this.get(id);
    if (!refreshed) throw new ObligationStorageError();

    // The obligation is authoritative for the due date, so an open linked Task
    // follows it. This is what stops the two permanently diverging.
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

  async setStatus(
    obligationId: string,
    status: Exclude<ObligationStatus, "completed">,
  ): Promise<ObligationChangeResult> {
    const id = validateObligationId(obligationId);
    const current = await this.get(id);
    if (!current) throw new ObligationNotFoundError();
    if (current.status === status) {
      return { obligation: current, changed: false };
    }
    if (current.status === "completed") {
      // Reopening a completed occurrence would orphan its successor and its proof.
      throw new ObligationValidationError(
        "status",
        "cannot be changed once the obligation is completed",
      );
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const update = this.#db
      .prepare(
        `UPDATE obligation_details
            SET status = ?, updated_at = ?
          WHERE workspace_id = ? AND entity_id = ? AND deleted_at IS NULL
            AND status = ?
         RETURNING entity_id`,
      )
      .bind(status, nowTs, this.#workspaceId, id, current.status);

    const append = this.#appendStatements(
      status === "open" ? OBLIGATION_REOPENED : OBLIGATION_DISMISSED,
      [id, current.subjectEntityId],
      { category: current.category, status },
      now,
    );

    try {
      const results = await this.#db.batch(
        this.#withFault([update, ...append]),
      );
      if ((results[0]?.meta?.changes ?? 0) === 0) {
        throw new ObligationConflictError();
      }
    } catch (cause) {
      this.#fail(cause);
    }

    const refreshed = await this.get(id);
    if (!refreshed) throw new ObligationStorageError();
    return { obligation: refreshed, changed: true };
  }

  async delete(obligationId: string): Promise<boolean> {
    const id = validateObligationId(obligationId);
    const current = await this.get(id);
    if (!current) return false;

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);

    // The record, its entity and its subject projection go together. A link
    // left behind would make a deleted obligation still show on its subject.
    const batch: D1PreparedStatement[] = [
      this.#db
        .prepare(
          `UPDATE obligation_details SET deleted_at = ?, updated_at = ?
            WHERE workspace_id = ? AND entity_id = ? AND deleted_at IS NULL
           RETURNING entity_id`,
        )
        .bind(nowTs, nowTs, this.#workspaceId, id),
      this.#db
        .prepare(
          `UPDATE entities SET deleted_at = ?, updated_at = ?
            WHERE workspace_id = ? AND id = ? AND type = ? AND deleted_at IS NULL`,
        )
        .bind(nowTs, nowTs, this.#workspaceId, id, OBLIGATION_ENTITY_TYPE),
      this.#db
        .prepare(
          `UPDATE entity_links SET deleted_at = ?, updated_at = ?
            WHERE workspace_id = ? AND source_entity_id = ?
              AND type = ? AND deleted_at IS NULL`,
        )
        .bind(nowTs, nowTs, this.#workspaceId, id, OBLIGATION_SUBJECT_LINK),
      ...this.#appendStatements(
        OBLIGATION_DELETED,
        [id, current.subjectEntityId],
        { category: current.category },
        now,
      ),
    ];

    try {
      const results = await this.#db.batch(this.#withFault(batch));
      return (results[0]?.meta?.changes ?? 0) > 0;
    } catch (cause) {
      this.#fail(cause);
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Completion — one transaction (ADR-083)                                 */
  /* ---------------------------------------------------------------------- */

  async complete(
    obligationId: string,
    input: CompleteObligationInput = {},
  ): Promise<CompleteObligationResult> {
    const id = validateObligationId(obligationId);
    const current = await this.get(id);
    if (!current) throw new ObligationNotFoundError();
    const c = validateObligationCompletion(input, current.currencyCode);

    // Idempotent: an already-completed occurrence returns its existing
    // completion rather than writing a second proof or a second successor.
    if (current.status === "completed") {
      return this.#existingCompletion(current);
    }

    const completedOn = c.completedOn ?? (await this.#today());
    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);

    // Work out the successor BEFORE writing anything, so the whole transaction
    // is decided up front and the batch is a pure write.
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

    /* -- The subject's own proof, through the ADR-083 seam ------------------
     * An Asset keeps a logbook and canonical dates; a Person, a Project and an
     * obligation about nothing do not. The gateway that owns those tables
     * authors their statements; this repository never does.
     */
    /*
     * THE COMPLETION GUARD, and why it names three things.
     *
     * Every dependent statement in this batch — the proof, the successor, the
     * linked Task's completion — must fire only if THIS attempt closed the
     * obligation, never if an earlier one did. So the guard has to be unique to
     * the attempt, and `completed_at` alone is not: a fake clock returns one
     * instant, and two real requests inside one millisecond return one too. A
     * retry against a guard that matched the WINNER's row would insert a second
     * successor entity, which is the exact invariant this domain must not lose.
     *
     * The two ids the attempt generates — the proof's and the successor's —
     * ARE unique to it, and they are exactly the things a second attempt could
     * duplicate. Naming all three makes the guard attempt-unique whenever
     * anything duplicable exists, and where neither exists there is nothing for
     * a second attempt to duplicate. `coalesce` because a null never equals a
     * null in SQL, so a plain comparison would silently match nothing.
     */
    const guardFor = (proof: string | null) =>
      ({
        sql: `EXISTS (
      SELECT 1 FROM obligation_details
      WHERE workspace_id = ? AND entity_id = ? AND status = 'completed'
        AND completed_at = ?
        AND coalesce(next_obligation_id, '-') = ?
        AND coalesce(completed_event_id, '-') = ?
    )`,
        params: [
          this.#workspaceId,
          id,
          nowTs,
          successorId ?? "-",
          proof ?? "-",
        ] as const,
      }) as const;

    /*
     * The proof id is a CANDIDATE until a proof is actually planned.
     *
     * `completed_event_id` is a pointer into `asset_events`, and that chain has
     * no foreign key — `app/kernel/restore/restore-safety.ts` is its only
     * integrity authority. An obligation about nothing, about a Person, or
     * about an Asset the gateway can no longer read writes NO proof row, so
     * storing an id for one would leave a dangling reference that fails an
     * archive on the way back in. It is settled below, once the plan is known.
     */
    const candidateProofId = this.#proofGateway ? this.#newId() : null;
    const provisionalGuard = guardFor(candidateProofId);

    const plannedProof =
      current.subjectEntityId &&
      current.subjectEntityType &&
      this.#proofGateway?.supports(current.subjectEntityType)
        ? await this.#proofGateway.planProof({
            obligationId: id,
            subjectEntityId: current.subjectEntityId,
            category: current.category,
            title: c.title ?? current.title,
            completedOn,
            amountMinor: c.completedAmountMinor,
            currencyCode: c.currencyCode,
            nextDueDate: nextDue,
            taskId: current.taskId,
            now,
            proofId: candidateProofId as string,
            raw: input,
            meterRecurrence: current.recurrenceKind === "meter",
            meterThreshold: current.meterThreshold,
            meterInterval: current.meterInterval,
            meterUnit: current.meterUnit,
            guard: {
              sql: provisionalGuard.sql,
              params: [...provisionalGuard.params],
            },
          })
        : null;

    /*
     * Settled. A proof id is stored only where a proof row is genuinely in this
     * batch, and the guard names the same value — the two must agree, because
     * the guard re-reads the row this UPDATE writes and every statement gated
     * on it (the proof's own, the successor's, the linked Task's) fires only
     * when they match.
     */
    const proofId = plannedProof ? candidateProofId : null;
    const { sql: completionGuard, params: completionGuardParams } =
      guardFor(proofId);

    const closeObligation = this.#db
      .prepare(
        `UPDATE obligation_details
            SET status = 'completed', completed_at = ?, completed_on = ?,
                completed_amount_minor = ?, currency_code = coalesce(?, currency_code),
                completed_event_id = ?, next_obligation_id = ?, updated_at = ?
          WHERE workspace_id = ? AND entity_id = ? AND deleted_at IS NULL
            AND status = 'open'
         RETURNING entity_id`,
      )
      .bind(
        nowTs,
        completedOn,
        c.completedAmountMinor,
        c.currencyCode,
        proofId,
        successorId,
        nowTs,
        this.#workspaceId,
        id,
      );

    /* -- The linked Task joins THIS batch (AUDIT-13) -----------------------
     * Its statements are planned (never executed) here and appended below,
     * gated on the obligation having actually closed in this very transaction.
     * Either both commit or neither does.
     */
    const taskPlan =
      current.taskId && this.#taskCompletionPlanner
        ? await this.#taskCompletionPlanner.planCompletion(current.taskId, {
            // The OWNER's today, not the (possibly back-dated) completion date:
            // this anchors the Task's own recurrence exactly as the Task module
            // does, which is the AUDIT-14 contract this must not quietly change.
            ownerTodayIso: await this.#today(),
            guard: {
              sql: completionGuard,
              params: [...completionGuardParams],
            },
            now,
          })
        : null;
    const plannedOutcome: ObligationTaskOutcome =
      current.taskId === null
        ? "none"
        : (taskPlan?.outcome ?? "already_closed");

    /*
     * The Task's outcome is deliberately NOT in this payload, and neither is
     * the amount. The payload is serialised before the batch runs, so a Task
     * completed or deleted in the gap would leave a permanent event asserting
     * something this operation did not do; and a price in an Activity payload
     * is forbidden outright (ADR-049 decision 5). What the payload carries is
     * STRUCTURE: the category, whether a successor was made, whether money was
     * recorded — never how much.
     */
    const batch: D1PreparedStatement[] = [
      closeObligation,
      ...this.#appendStatements(
        OBLIGATION_COMPLETED,
        [id, current.subjectEntityId],
        {
          category: current.category,
          recurrence: current.recurrenceKind,
          createdSuccessor: successorId !== null,
          recordedAmount: c.completedAmountMinor !== null,
        },
        now,
      ),
    ];

    if (plannedProof) batch.push(...plannedProof.statements);

    // AT MOST ONE successor. Both the NOT EXISTS guard and the
    // (workspace_id, series_id, sequence) UNIQUE constraint have to be
    // satisfied, so neither a retry nor a concurrent completion can produce a
    // second one.
    if (successorId !== null) {
      batch.push(
        this.#db
          .prepare(
            `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at)
             SELECT ?, ?, ?, ?, ?, ?
              WHERE ${completionGuard}
                AND NOT EXISTS (
                      SELECT 1 FROM obligation_details
                      WHERE workspace_id = ? AND series_id = ? AND sequence = ?
                    )`,
          )
          .bind(
            successorId,
            this.#workspaceId,
            OBLIGATION_ENTITY_TYPE,
            current.title,
            nowTs,
            nowTs,
            ...completionGuardParams,
            this.#workspaceId,
            current.seriesId,
            current.sequence + 1,
          ),
        this.#db
          .prepare(
            `INSERT INTO obligation_details
               (workspace_id, entity_id, subject_entity_id, subject_entity_type,
                category, description, due_date, lead_days, recurrence_kind,
                recurrence_interval, meter_threshold, meter_interval, meter_unit,
                expected_amount_minor, completed_amount_minor, currency_code,
                status, task_id, completed_event_id, completed_at, completed_on,
                next_obligation_id, series_id, sequence, created_at, updated_at)
             SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?,
                    'open', NULL, NULL, NULL, NULL, NULL, ?, ?, ?, ?
              WHERE EXISTS (
                      SELECT 1 FROM entities
                      WHERE workspace_id = ? AND id = ? AND type = ?
                    )`,
          )
          .bind(
            this.#workspaceId,
            successorId,
            current.subjectEntityId,
            current.subjectEntityType,
            current.category,
            current.description,
            nextDue,
            current.leadDays,
            current.recurrenceKind,
            current.recurrenceInterval,
            // A meter successor's next threshold is the SUBJECT's arithmetic:
            // the gateway that owns the meter supplies it, and where it does
            // not the threshold carries over unchanged rather than being
            // advanced by a rule this repository does not have.
            plannedProof?.nextMeterThreshold ?? current.meterThreshold,
            current.meterInterval,
            current.meterUnit,
            // The EXPECTED amount carries forward — next year's rego is
            // expected to cost about what this year's did — but the ACTUAL one
            // never does: a successor has not been paid.
            current.expectedAmountMinor,
            current.currencyCode,
            current.seriesId,
            current.sequence + 1,
            nowTs,
            nowTs,
            this.#workspaceId,
            successorId,
            OBLIGATION_ENTITY_TYPE,
          ),
      );
      if (current.subjectEntityId) {
        batch.push(
          this.#db
            .prepare(
              `INSERT INTO entity_links
                 (id, workspace_id, source_entity_id, target_entity_id, type,
                  created_at, updated_at, deleted_at)
               SELECT ?, ?, ?, ?, ?, ?, ?, NULL
                WHERE EXISTS (
                        SELECT 1 FROM obligation_details
                        WHERE workspace_id = ? AND entity_id = ?
                      )
               ON CONFLICT (workspace_id, source_entity_id, target_entity_id, type)
               DO UPDATE SET deleted_at = NULL, updated_at = excluded.updated_at`,
            )
            .bind(
              obligationSubjectLinkId(successorId),
              this.#workspaceId,
              successorId,
              current.subjectEntityId,
              OBLIGATION_SUBJECT_LINK,
              nowTs,
              nowTs,
              this.#workspaceId,
              successorId,
            ),
        );
      }
    }

    /*
     * LAST, so the obligation's own guarded statements keep the `changes()`
     * chain they were written against, and the Task group's first statement
     * starts a fresh one. Its index is remembered so the outcome can be read
     * off what the batch DID, rather than off what was planned before it ran.
     */
    const taskGateIndex = taskPlan ? batch.length : -1;
    if (taskPlan) batch.push(...taskPlan.statements);
    if (this.#obligationTaskFault) batch.push(this.#forcedFailure());

    let taskClosedHere = false;
    try {
      const results = await this.#db.batch(this.#withFault(batch));
      if ((results[0]?.meta?.changes ?? 0) === 0) {
        // A concurrent completion won. Report ITS result — never a second one.
        const reread = await this.get(id);
        if (reread && reread.status === "completed") {
          return this.#existingCompletion(reread);
        }
        throw new ObligationConflictError();
      }
      // `#withFault` splices at index 1, so a faulted batch throws before this.
      taskClosedHere =
        taskGateIndex >= 0 && (results[taskGateIndex]?.meta?.changes ?? 0) > 0;
    } catch (cause) {
      this.#fail(cause);
    }

    /*
     * What the batch actually did to the Task. `plannedOutcome` was read before
     * the batch; the Task's completion gate also requires `completed_at IS
     * NULL`, so a Task closed or deleted by another request in the gap changes
     * no row here. Reporting the plan in that case would tell the owner this
     * operation closed a Task it did not touch.
     */
    let taskOutcome = plannedOutcome;
    if (plannedOutcome === "completed" && !taskClosedHere) {
      taskOutcome = current.taskId
        ? await this.#racedTaskOutcome(current.taskId)
        : "none";
    }

    const [obligation, successor] = await Promise.all([
      this.get(id),
      successorId ? this.get(successorId) : Promise.resolve(null),
    ]);
    if (!obligation) throw new ObligationStorageError();

    return {
      obligation,
      proof: plannedProof?.proof ?? null,
      successor,
      taskOutcome,
    };
  }

  /** The completion an already-completed obligation already has. */
  async #existingCompletion(
    current: Obligation,
  ): Promise<CompleteObligationResult> {
    const successor = current.nextObligationId
      ? await this.get(current.nextObligationId)
      : null;
    return {
      obligation: current,
      /*
       * Rebuilt from the obligation's OWN record rather than read back from
       * the subject's history: the obligation stores which entry proved it and
       * the day the work was done, which is what a retrying caller needs. The
       * title is the obligation's, not the proof entry's — those differ only
       * when the owner overrode it at completion, and a caller wanting the
       * entry itself reads it from the history that owns it.
       */
      proof:
        current.completedEventId === null
          ? null
          : {
              id: current.completedEventId,
              title: current.title,
              date: current.completedOn ?? "",
            },
      successor,
      taskOutcome: current.taskId === null ? "none" : "already_closed",
    };
  }

  /** Why a planned Task completion did not happen: closed already, or gone. */
  async #racedTaskOutcome(taskId: string): Promise<ObligationTaskOutcome> {
    const row = await this.#db
      .prepare(
        `SELECT 1 AS found FROM entities
          WHERE workspace_id = ? AND id = ? AND type = 'task'
            AND deleted_at IS NULL LIMIT 1`,
      )
      .bind(this.#workspaceId, taskId)
      .first<{ found: number }>();
    return row ? "already_closed" : "missing";
  }

  /* ---------------------------------------------------------------------- */
  /* The linked Task — a pointer, never ownership                           */
  /* ---------------------------------------------------------------------- */

  async linkTask(
    obligationId: string,
    taskId: string,
  ): Promise<LinkObligationTaskResult> {
    const id = validateObligationId(obligationId);
    const task = validateObligationId(taskId);
    const current = await this.get(id);
    if (!current) throw new ObligationNotFoundError();
    await this.#assertExists(task, "task", "taskId");

    if (current.taskId === task) {
      return { obligation: current, taskId: task, created: false };
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const update = this.#db
      .prepare(
        `UPDATE obligation_details
            SET task_id = ?, updated_at = ?
          WHERE workspace_id = ? AND entity_id = ? AND deleted_at IS NULL
            AND task_id IS NOT ?
         RETURNING entity_id`,
      )
      .bind(task, nowTs, this.#workspaceId, id, task);

    const append = this.#appendStatements(
      OBLIGATION_TASK_LINKED,
      [id, task, current.subjectEntityId],
      { category: current.category },
      now,
    );

    try {
      const results = await this.#db.batch(
        this.#withFault([update, ...append]),
      );
      if ((results[0]?.meta?.changes ?? 0) === 0) {
        throw new ObligationConflictError();
      }
    } catch (cause) {
      this.#fail(cause);
    }

    const refreshed = await this.get(id);
    if (!refreshed) throw new ObligationStorageError();
    return { obligation: refreshed, taskId: task, created: true };
  }

  async unlinkTask(obligationId: string): Promise<ObligationChangeResult> {
    const id = validateObligationId(obligationId);
    const current = await this.get(id);
    if (!current) throw new ObligationNotFoundError();
    if (current.taskId === null) {
      return { obligation: current, changed: false };
    }

    const nowTs = toStorageTimestamp(this.#clock());
    try {
      await this.#db
        .prepare(
          `UPDATE obligation_details SET task_id = NULL, updated_at = ?
            WHERE workspace_id = ? AND entity_id = ? AND deleted_at IS NULL`,
        )
        .bind(nowTs, this.#workspaceId, id)
        .run();
    } catch (cause) {
      this.#fail(cause);
    }

    const refreshed = await this.get(id);
    if (!refreshed) throw new ObligationStorageError();
    return { obligation: refreshed, changed: true };
  }

  async reconcileTask(
    obligationId: string,
  ): Promise<ObligationTaskReconciliation> {
    const id = validateObligationId(obligationId);
    const current = await this.get(id);
    if (!current) throw new ObligationNotFoundError();
    if (current.taskId === null) {
      return {
        obligation: current,
        taskId: null,
        taskState: "none",
        changed: false,
      };
    }

    let row: { open: number } | null;
    try {
      row = await this.#db
        .prepare(
          `SELECT CASE WHEN ${OPEN_TASK_EXISTS} THEN 1 ELSE 0 END AS open
             FROM obligation_details o
            WHERE o.workspace_id = ? AND o.entity_id = ?`,
        )
        .bind(this.#workspaceId, id)
        .first<{ open: number }>();
    } catch (cause) {
      this.#fail(cause);
    }

    if (row?.open === 1) {
      return {
        obligation: current,
        taskId: current.taskId,
        taskState: "open",
        changed: false,
      };
    }

    // Not open. Either the owner ticked it off — in which case the obligation
    // stays OPEN, because ticking a Task is not proof the work happened — or it
    // is gone, in which case the pointer is cleared so a fresh one can be made.
    const exists = await this.#db
      .prepare(
        `SELECT 1 AS found FROM entities
          WHERE workspace_id = ? AND id = ? AND type = 'task'
            AND deleted_at IS NULL LIMIT 1`,
      )
      .bind(this.#workspaceId, current.taskId)
      .first<{ found: number }>();

    if (exists) {
      return {
        obligation: current,
        taskId: current.taskId,
        taskState: "completed",
        changed: false,
      };
    }

    const cleared = await this.unlinkTask(id);
    return {
      obligation: cleared.obligation,
      taskId: null,
      taskState: "missing",
      changed: cleared.changed,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Attention and summaries                                                */
  /* ---------------------------------------------------------------------- */

  async listAttention(
    input: ObligationAttentionInput,
  ): Promise<readonly ObligationAttentionItem[]> {
    const today = input.today;
    const horizon = Math.max(0, Math.min(input.horizonDays ?? 30, 365));
    const limit = Math.max(1, Math.min(input.limit ?? 50, 50));
    const horizonDate = addCalendarDays(today, horizon);

    let rows: (ObligationRow &
      SubjectColumns & {
        readonly current_meter_value: number | null;
        readonly current_meter_unit: string | null;
        readonly subject_subtype: string | null;
        readonly subject_archived_at: string | null;
      })[];
    try {
      const result = await this.#db
        .prepare(
          `SELECT ${OBLIGATION_COLUMNS},
                  s.title AS subject_title, s.type AS subject_type,
                  ad.current_meter_value AS current_meter_value,
                  ad.current_meter_unit AS current_meter_unit,
                  ad.asset_type AS subject_subtype,
                  ad.archived_at AS subject_archived_at,
                  CASE WHEN o.task_id IS NOT NULL AND ${OPEN_TASK_EXISTS}
                       THEN 1 ELSE 0 END AS has_open_task
             FROM obligation_details o
             JOIN entities e
               ON e.workspace_id = o.workspace_id AND e.id = o.entity_id
              AND e.type = '${OBLIGATION_ENTITY_TYPE}' AND e.deleted_at IS NULL
             -- LEFT, deliberately: an obligation about nothing is the whole
             -- point of V2.10, and an inner join here would silently drop it.
             LEFT JOIN entities s
               ON s.workspace_id = o.workspace_id AND s.id = o.subject_entity_id
              AND s.deleted_at IS NULL
             LEFT JOIN asset_details ad
               ON ad.workspace_id = o.workspace_id
              AND ad.entity_id = o.subject_entity_id
            WHERE o.workspace_id = ? AND o.status = 'open' AND o.deleted_at IS NULL
              -- An ARCHIVED subject stops asking for things. An obligation with
              -- no subject has nothing to be archived, so it is never excluded.
              AND (ad.entity_id IS NULL OR ad.archived_at IS NULL)
              -- A subject that was soft-deleted takes its obligations with it.
              AND (o.subject_entity_id IS NULL OR s.id IS NOT NULL)
              AND (
                    (o.due_date IS NOT NULL AND o.due_date <= ?)
                    OR o.meter_threshold IS NOT NULL
                  )
            ORDER BY coalesce(o.due_date, '${DATE_SENTINEL}') ASC, o.entity_id ASC
            LIMIT ?`,
        )
        .bind(this.#workspaceId, horizonDate, limit)
        .all<
          ObligationRow &
            SubjectColumns & {
              current_meter_value: number | null;
              current_meter_unit: string | null;
              subject_subtype: string | null;
              subject_archived_at: string | null;
            }
        >();
      rows = result.results;
    } catch (cause) {
      this.#fail(cause);
    }

    return (
      rows
        .map((row) => ({
          obligation: this.#rowToObligation(row),
          subject: this.#subjectOf(row),
          hasOpenTask: row.has_open_task === 1,
          meterValue: row.current_meter_value,
          meterUnit: row.current_meter_unit,
          subjectSubtype: row.subject_subtype,
        }))
        // The SQL horizon is a coarse pre-filter; the ONE canonical evaluator has
        // the final say, so Today and the record can never disagree about whether
        // something needs attention. A meter obligation's meter side is supplied
        // by the caller that owns the units; here the date side decides, and an
        // un-evaluable meter obligation is kept for the caller to rank.
        .filter(
          (item) =>
            item.obligation.meterThreshold !== null ||
            evaluateObligation(item.obligation, today, null).needsAttention,
        )
    );
  }

  async summariseBySubject(
    subjectIds: readonly string[],
    today: string,
  ): Promise<ReadonlyMap<string, ObligationSummary>> {
    const ids = [...new Set(subjectIds)].filter((id) => id.length > 0);
    const out = new Map<string, ObligationSummary>();
    if (ids.length === 0) return out;
    // A collection page is already bounded; refuse to fan out beyond it.
    const bounded = ids.slice(0, 100);

    let rows: (ObligationRow & {
      readonly current_meter_value: number | null;
      readonly current_meter_unit: string | null;
    })[];
    try {
      const result = await this.#db
        .prepare(
          `SELECT ${OBLIGATION_COLUMNS},
                  ad.current_meter_value AS current_meter_value,
                  ad.current_meter_unit AS current_meter_unit
             FROM obligation_details o
             JOIN entities e
               ON e.workspace_id = o.workspace_id AND e.id = o.entity_id
              AND e.type = '${OBLIGATION_ENTITY_TYPE}'
             LEFT JOIN asset_details ad
               ON ad.workspace_id = o.workspace_id
              AND ad.entity_id = o.subject_entity_id
            WHERE o.workspace_id = ? AND o.status = 'open' AND o.deleted_at IS NULL
              AND o.subject_entity_id IN (${bounded.map(() => "?").join(", ")})
            ORDER BY coalesce(o.due_date, '${DATE_SENTINEL}') ASC, o.entity_id ASC`,
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
      const subjectId = row.subject_entity_id;
      if (!subjectId) continue;
      /*
       * The meter side, from the domain that owns the units. The row already
       * carries the subject's reading, so this costs no second statement — and
       * without it a service whose odometer is past its threshold counts as
       * neither overdue nor due soon, while the record it links to says
       * "Overdue by 500 km".
       */
      const evaluation = evaluateObligation(
        obligation,
        today,
        this.#meterEvaluator?.(obligation, {
          value: row.current_meter_value,
          unit: row.current_meter_unit,
        }) ?? null,
      );
      const existing = out.get(subjectId) ?? {
        openCount: 0,
        overdueCount: 0,
        dueSoonCount: 0,
        nextDueDate: null,
        nextTitle: null,
        nextCategory: null,
        needsMeterReading: false,
      };
      out.set(subjectId, {
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
          existing.needsMeterReading ||
          (obligation.meterThreshold !== null &&
            row.current_meter_value === null),
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
