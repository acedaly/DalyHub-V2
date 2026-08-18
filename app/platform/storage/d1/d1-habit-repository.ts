/**
 * HABITS-01 Habits — D1 implementation of the authoritative, workspace-bound
 * `HabitRepository`.
 *
 * Implements the storage-independent Habits contract over Cloudflare D1 (SQLite)
 * using prepared, parameterised statements only. Constructed with a single
 * `WorkspaceContext`; every statement constrains `workspace_id = ?` and no method
 * accepts a `workspaceId` (ADR-010). No caller value is ever interpolated into
 * SQL (AGENTS.md §17) — the only inlined literals are trusted kernel constants
 * (`'habit'`, the two link types) and the fixed placeholder lists built from a
 * bounded id array.
 *
 * ## Atomicity (ADR-012)
 *
 * `create` writes the `entities` row, the `habit_details` row, the FIRST
 * `habit_schedules` version, any relationship links and one `habit.created`
 * event in ONE `D1Database.batch()` — a single transaction that rolls back
 * entirely on any failure, so a Habit can never exist without a schedule.
 * `update`, `changeSchedule`, `archive` and `restore` fold their precondition
 * and change-detection into the mutating SQL, atomic with their Activity append
 * through the shared `recordAtomicMutation` seam.
 *
 * ## Check-ins record no Activity, deliberately
 *
 * A daily Habit produces hundreds of check-ins a year, each one bit wide.
 * Appending every one to the ONE shared Activity stream would drown the events
 * that are genuinely the owner's history (ADR-102 §7, following ADR-012's
 * calendar-sync reasoning and ADR-073's usage ledger). A check-in is therefore a
 * single guarded statement against `habit_completions`, which IS the Habit's own
 * history and is rendered in full on its record.
 *
 * ## Bounded by construction
 *
 * Every read is a FIXED number of statements whatever it returns:
 *
 *   get                     2  (the record + its schedule chain)
 *   list                    2  (the page + every version for the page's ids)
 *   listCompletionsInRange  1
 *   listSupportingHabits    2
 *
 * There is deliberately no per-Habit completion read: a collection of twenty
 * Habits would become twenty-one queries, which is precisely the N+1 the
 * contract forbids.
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
  systemClock,
  secureIdGenerator,
  type Clock,
  type IdGenerator,
} from "~/kernel/entities";
import { normaliseEntityIconKey } from "~/kernel/entities/entity-icon-keys";
import { normaliseIdentityColourSlot } from "~/kernel/entities/identity-colour-slots";
import {
  HABIT_ARCHIVED,
  HABIT_BELONGS_TO_AREA,
  HABIT_CREATED,
  HABIT_ENTITY_TYPE,
  HABIT_RESTORED,
  HABIT_SCHEDULE_CHANGED,
  HABIT_SUPPORTS_GOAL,
  HABIT_UPDATED,
  HabitArchivedError,
  HabitConflictError,
  HabitError,
  HabitNotFoundError,
  HabitStorageError,
  currentScheduleVersion,
  decodeHabitCursorForScope,
  encodeHabitCursor,
  habitSchedulesEqual,
  normaliseHabitQuery,
  validateHabitCheckInDate,
  validateHabitDateWindow,
  validateHabitId,
  validateHabitLimit,
  validateHabitNotes,
  validateHabitSchedule,
  validateHabitStatus,
  validateHabitTitle,
  type CreateHabitInput,
  type GetHabitOptions,
  type Habit,
  type HabitChangeResult,
  type HabitCheckInResult,
  type HabitCompletion,
  type HabitCompletionRangeInput,
  type HabitCursorScope,
  type HabitLifecycleResult,
  type HabitLinkedRecord,
  type HabitPage,
  type HabitRepository,
  type HabitSchedule,
  type HabitScheduleChangeResult,
  type HabitScheduleVersion,
  type ListHabitsInput,
  type UpdateHabitInput,
} from "~/kernel/habits";
import { addPlanningDays } from "~/kernel/planning";
import { AREA, GOAL } from "~/kernel/spine";
import { parseWorkspaceId, type WorkspaceContext } from "~/kernel/workspaces";

import { fromStorageTimestamp, toStorageTimestamp } from "./database";
import { D1ActivityRecorder } from "./d1-activity-recorder";
import {
  recordAtomicMutation,
  type AtomicMutationFault,
} from "./d1-atomic-mutation";
import { likeContains } from "./like-pattern";

/** TEST-ONLY deterministic create-batch failure injection. Never set in production. */
export type D1HabitCreateFault =
  "after-entity" | "after-details" | "after-schedule";

export interface D1HabitRepositoryOptions {
  readonly clock?: Clock;
  readonly idGenerator?: IdGenerator;
  readonly actorContext?: ActivityActorContext;
  readonly activityIdGenerator?: IdGenerator;
  /**
   * The ONE authority for "which calendar day is it for the owner?" (AUDIT-14).
   * Injected rather than read here, so a Habit's first schedule day, a schedule
   * change's boundary and an archive's expectation cut-off all come from the
   * same resolved answer the rest of the request used.
   */
  readonly ownerTimeZone?: () => Promise<string>;
  /** TEST-ONLY create-batch fault (proves the whole create rolls back). */
  readonly createFault?: D1HabitCreateFault;
  /** TEST-ONLY mutation-batch fault. */
  readonly mutationFault?: AtomicMutationFault;
}

const SUBJECT_ROLE = "subject";

/** The owner's calendar date for an instant, in an explicit timezone. */
function ownerDate(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(instant);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/* -------------------------------------------------------------------------- */
/* Row shapes (never escape this adapter)                                     */
/* -------------------------------------------------------------------------- */

interface HabitRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly title: string;
  readonly notes: string | null;
  readonly created_at: string;
  readonly deleted_at: string | null;
  readonly archived_at: string | null;
  readonly archived_on: string | null;
  readonly effective_updated_at: string;
  readonly goal_id: string | null;
  readonly goal_title: string | null;
  readonly area_id: string | null;
  readonly area_title: string | null;
  readonly area_colour_rank: number | null;
  readonly area_icon_key: string | null;
  readonly area_colour_slot: string | null;
}

interface ScheduleRow {
  readonly id: string;
  readonly habit_id: string;
  readonly kind: string;
  readonly weekdays: string | null;
  readonly target_count: number | null;
  readonly effective_from: string;
  readonly effective_to: string | null;
}

interface CompletionRow {
  readonly habit_id: string;
  readonly completed_on: string;
  readonly recorded_at: string;
}

/* -------------------------------------------------------------------------- */
/* SQL fragments                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The Area's stable 0-based colour rank, derived from immutable creation facts
 * — the identical `ROW_NUMBER()` expression the Projects and Goals repositories
 * use, so three repositories can never disagree about which colour an Area is.
 */
const AREA_RANKS_CTE = `area_ranks AS (
  SELECT id,
         ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) - 1 AS colour_rank
  FROM entities
  WHERE workspace_id = ? AND type = '${AREA}'
)`;

/**
 * The Goal and Area a Habit is attached to, resolved through its own EntityLinks.
 *
 * LEFT JOINs, because both relationships are optional and a Habit with neither is
 * an ordinary Habit rather than a broken one. Each link is constrained to the
 * ACTIVE row (`deleted_at IS NULL`) and to a live counterpart of the right type,
 * so unlinking, deleting the Goal or deleting the Area all degrade to "no
 * context" rather than to a dangling title.
 */
const CONTEXT_JOINS = `
  LEFT JOIN entity_links gl
    ON gl.workspace_id = e.workspace_id AND gl.source_entity_id = e.id
       AND gl.type = '${HABIT_SUPPORTS_GOAL}' AND gl.deleted_at IS NULL
  LEFT JOIN entities ge
    ON ge.workspace_id = gl.workspace_id AND ge.id = gl.target_entity_id
       AND ge.type = '${GOAL}' AND ge.deleted_at IS NULL
  LEFT JOIN entity_links al
    ON al.workspace_id = e.workspace_id AND al.source_entity_id = e.id
       AND al.type = '${HABIT_BELONGS_TO_AREA}' AND al.deleted_at IS NULL
  LEFT JOIN entities ae
    ON ae.workspace_id = al.workspace_id AND ae.id = al.target_entity_id
       AND ae.type = '${AREA}' AND ae.deleted_at IS NULL
  LEFT JOIN area_ranks arank ON arank.id = ae.id
  LEFT JOIN area_details adet
    ON adet.workspace_id = ae.workspace_id AND adet.entity_id = ae.id`;

/**
 * The PRESENTATION timestamp: the later of the entity's `updated_at` (identity
 * and title) and the detail slice's (notes, archive state). Without the MAX, a
 * notes-only edit would never advance the value the record's Activity tab keys
 * its reload on — the same device `d1-goal-repository.ts` uses.
 */
const EFFECTIVE_UPDATED_AT = `(CASE WHEN d.updated_at > e.updated_at
                                    THEN d.updated_at ELSE e.updated_at END)`;

const READ_COLUMNS = `
  e.id AS id,
  e.workspace_id AS workspace_id,
  e.title AS title,
  e.created_at AS created_at,
  e.deleted_at AS deleted_at,
  d.notes AS notes,
  d.archived_at AS archived_at,
  d.archived_on AS archived_on,
  ${EFFECTIVE_UPDATED_AT} AS effective_updated_at,
  ge.id AS goal_id,
  ge.title AS goal_title,
  ae.id AS area_id,
  ae.title AS area_title,
  arank.colour_rank AS area_colour_rank,
  adet.icon_key AS area_icon_key,
  adet.colour_slot AS area_colour_slot`;

const BASE_FROM = `FROM entities e
  JOIN habit_details d
    ON d.workspace_id = e.workspace_id AND d.entity_id = e.id${CONTEXT_JOINS}`;

/** A statement guaranteed to fail at execution, rolling the whole batch back. */
function forcedFailure(db: D1Database): D1PreparedStatement {
  return db.prepare("SELECT 1 FROM __dalyhub_habit_forced_fault__");
}

/** `?, ?, ?` for a bounded id list. Never caller text — only placeholders. */
function placeholders(count: number): string {
  return new Array(count).fill("?").join(", ");
}

/* -------------------------------------------------------------------------- */
/* Schedule (de)serialisation                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Read a stored schedule row into the domain union.
 *
 * A kind this build does not recognise, or a malformed weekday list, degrades to
 * `null` rather than throwing: a row written by a future version must read as
 * "no expectation" instead of taking the page down (the same rule 0038 states
 * for an unrecognised measurement type).
 */
function toSchedule(row: ScheduleRow): HabitSchedule | null {
  if (row.kind === "daily") return { kind: "daily" };
  if (row.kind === "weekdays") {
    const days = (row.weekdays ?? "")
      .split(",")
      .map((part) => Number.parseInt(part, 10))
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
    const unique = [...new Set(days)].sort((a, b) => a - b);
    return unique.length === 0 ? null : { kind: "weekdays", weekdays: unique };
  }
  if (row.kind === "weekly_count") {
    const count = row.target_count ?? 0;
    return count >= 1 && count <= 7
      ? { kind: "weekly_count", timesPerWeek: count }
      : null;
  }
  return null;
}

/** The stored columns for a schedule. Sorted/de-duplicated by validation first. */
function scheduleColumns(schedule: HabitSchedule): {
  readonly kind: string;
  readonly weekdays: string | null;
  readonly targetCount: number | null;
} {
  switch (schedule.kind) {
    case "daily":
      return { kind: "daily", weekdays: null, targetCount: null };
    case "weekdays":
      return {
        kind: "weekdays",
        weekdays: schedule.weekdays.join(","),
        targetCount: null,
      };
    case "weekly_count":
      return {
        kind: "weekly_count",
        weekdays: null,
        targetCount: schedule.timesPerWeek,
      };
  }
}

function toVersion(row: ScheduleRow): HabitScheduleVersion | null {
  const schedule = toSchedule(row);
  if (schedule === null) return null;
  return {
    id: row.id,
    schedule,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
  };
}

/* -------------------------------------------------------------------------- */
/* The repository                                                             */
/* -------------------------------------------------------------------------- */

export class D1HabitRepository implements HabitRepository {
  readonly #db: D1Database;
  readonly #workspaceId: string;
  readonly #clock: Clock;
  readonly #newId: IdGenerator;
  readonly #actor: ActivityActorContext;
  readonly #newActivityId: IdGenerator;
  readonly #recorder: D1ActivityRecorder;
  readonly #ownerTimeZone: () => Promise<string>;
  readonly #createFault?: D1HabitCreateFault;
  readonly #mutationFault?: AtomicMutationFault;

  constructor(
    db: D1Database,
    context: WorkspaceContext,
    options: D1HabitRepositoryOptions = {},
  ) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
    this.#clock = options.clock ?? systemClock;
    this.#newId = options.idGenerator ?? secureIdGenerator;
    this.#actor = options.actorContext ?? createSystemActorContext();
    this.#newActivityId =
      options.activityIdGenerator ?? activitySecureIdGenerator;
    this.#recorder = new D1ActivityRecorder(db);
    this.#ownerTimeZone = options.ownerTimeZone ?? (async () => "UTC");
    this.#createFault = options.createFault;
    this.#mutationFault = options.mutationFault;
  }

  /* ---------------------------------------------------------------------- */
  /* Create                                                                 */
  /* ---------------------------------------------------------------------- */

  async create(input: CreateHabitInput): Promise<Habit> {
    const title = validateHabitTitle(input.title);
    const notes = validateHabitNotes(input.notes);
    const schedule = validateHabitSchedule(input.schedule);
    const goalId =
      input.goalId === undefined || input.goalId === null
        ? null
        : validateHabitId(input.goalId, "goalId");
    const areaId =
      input.areaId === undefined || input.areaId === null
        ? null
        : validateHabitId(input.areaId, "areaId");

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const todayIso = await this.#today(now);
    const id = this.#newId();
    const scheduleId = this.#newId();
    const columns = scheduleColumns(schedule);

    const entityStmt = this.#db
      .prepare(
        `INSERT INTO entities
           (id, workspace_id, type, title, created_at, updated_at, deleted_at)
         VALUES (?, ?, '${HABIT_ENTITY_TYPE}', ?, ?, ?, NULL)
         RETURNING id, title, created_at, updated_at`,
      )
      .bind(id, this.#workspaceId, title, nowTs, nowTs);

    const detailsStmt = this.#db
      .prepare(
        `INSERT INTO habit_details
           (workspace_id, entity_id, entity_type, notes, archived_at, archived_on,
            created_at, updated_at)
         VALUES (?, ?, '${HABIT_ENTITY_TYPE}', ?, NULL, NULL, ?, ?)`,
      )
      .bind(this.#workspaceId, id, notes, nowTs, nowTs);

    const scheduleStmt = this.#db
      .prepare(
        `INSERT INTO habit_schedules
           (id, workspace_id, habit_id, kind, weekdays, target_count,
            effective_from, effective_to, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      )
      .bind(
        scheduleId,
        this.#workspaceId,
        id,
        columns.kind,
        columns.weekdays,
        columns.targetCount,
        todayIso,
        nowTs,
      );

    const event: NewActivityEvent = {
      type: HABIT_CREATED,
      subjects: [{ entityId: id, role: SUBJECT_ROLE }],
      payload: { schedule: columns.kind },
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
      if (cause instanceof HabitError || cause instanceof ActivityError)
        throw cause;
      throw new HabitStorageError({ cause });
    }

    /*
     * Statement ORDER is load-bearing, not cosmetic.
     *
     * `D1ActivityRecorder` guards its `activities` insert on `changes() > 0`,
     * which refers to the IMMEDIATELY PRECEDING statement in the batch. The
     * Activity append must therefore follow the last statement that is
     * guaranteed to change a row — the schedule insert — and the relationship
     * links come AFTER it, because a link whose target does not exist writes no
     * row and would otherwise silently suppress the `habit.created` event.
     */
    const batch: D1PreparedStatement[] = [entityStmt];
    if (this.#createFault === "after-entity")
      batch.push(forcedFailure(this.#db));
    batch.push(detailsStmt);
    if (this.#createFault === "after-details")
      batch.push(forcedFailure(this.#db));
    batch.push(scheduleStmt);
    if (this.#createFault === "after-schedule")
      batch.push(forcedFailure(this.#db));
    batch.push(
      ...this.#recorder.buildAppendStatements(this.#workspaceId, model),
    );
    /*
     * The relationships are part of the SAME transaction as the Habit.
     *
     * A Habit created "for the Health area" that arrives with no Area because a
     * second request failed is a Habit the owner has to fix by hand. Each link
     * insert is guarded on the target existing, being the right type and being
     * live, so naming a Goal that is not there creates the Habit WITHOUT the
     * relationship rather than failing the creation outright.
     */
    if (goalId !== null) {
      batch.push(
        this.#linkStatement(id, goalId, HABIT_SUPPORTS_GOAL, GOAL, nowTs),
      );
    }
    if (areaId !== null) {
      batch.push(
        this.#linkStatement(id, areaId, HABIT_BELONGS_TO_AREA, AREA, nowTs),
      );
    }

    try {
      await this.#db.batch(batch);
    } catch (cause) {
      throw new HabitStorageError({ cause });
    }

    const created = await this.get(id);
    if (created === null) throw new HabitStorageError();
    return created;
  }

  /**
   * One relationship insert, guarded on the target being a live record of the
   * right type in this workspace. `INSERT … SELECT` rather than a bare INSERT so
   * the guard is part of the statement instead of a separate read that a
   * concurrent delete could invalidate between.
   */
  #linkStatement(
    habitId: string,
    targetId: string,
    linkType: string,
    targetType: string,
    nowTs: string,
  ): D1PreparedStatement {
    return this.#db
      .prepare(
        `INSERT INTO entity_links
           (id, workspace_id, source_entity_id, target_entity_id, type,
            created_at, updated_at, deleted_at)
         SELECT ?, ?, ?, t.id, '${linkType}', ?, ?, NULL
         FROM entities t
         WHERE t.workspace_id = ? AND t.id = ? AND t.type = '${targetType}'
               AND t.deleted_at IS NULL`,
      )
      .bind(
        this.#newId(),
        this.#workspaceId,
        habitId,
        nowTs,
        nowTs,
        this.#workspaceId,
        targetId,
      );
  }

  /* ---------------------------------------------------------------------- */
  /* Read                                                                   */
  /* ---------------------------------------------------------------------- */

  async get(id: string, options: GetHabitOptions = {}): Promise<Habit | null> {
    const habitId = validateHabitId(id);
    const deletedClause = options.includeDeleted
      ? ""
      : " AND e.deleted_at IS NULL";
    let row: HabitRow | null;
    try {
      row = await this.#db
        .prepare(
          `WITH ${AREA_RANKS_CTE}
           SELECT ${READ_COLUMNS}
           ${BASE_FROM}
           WHERE e.workspace_id = ? AND e.id = ?
                 AND e.type = '${HABIT_ENTITY_TYPE}'${deletedClause}
           LIMIT 1`,
        )
        .bind(this.#workspaceId, this.#workspaceId, habitId)
        .first<HabitRow>();
    } catch (cause) {
      throw new HabitStorageError({ cause });
    }
    if (row === null) return null;
    const versions = await this.#readVersions([habitId]);
    return this.#toHabit(row, versions.get(habitId) ?? []);
  }

  async list(input: ListHabitsInput = {}): Promise<HabitPage> {
    const status = validateHabitStatus(input.status);
    const limit = validateHabitLimit(input.limit);
    const query = normaliseHabitQuery(input.query);
    const scope: HabitCursorScope = {
      workspaceId: this.#workspaceId,
      status,
      query,
    };

    const conditions: string[] = [
      "e.workspace_id = ?",
      `e.type = '${HABIT_ENTITY_TYPE}'`,
      "e.deleted_at IS NULL",
    ];
    // The first bind is the CTE's workspace, the second the outer query's.
    const params: unknown[] = [this.#workspaceId, this.#workspaceId];

    if (status === "active") conditions.push("d.archived_at IS NULL");
    else if (status === "archived")
      conditions.push("d.archived_at IS NOT NULL");

    if (query !== null) {
      const like = likeContains(query);
      conditions.push(
        `(lower(e.title) LIKE ? ESCAPE '\\' OR lower(d.notes) LIKE ? ESCAPE '\\')`,
      );
      params.push(like, like);
    }

    if (input.cursor !== undefined) {
      const position = decodeHabitCursorForScope(input.cursor, scope);
      conditions.push("(e.created_at < ? OR (e.created_at = ? AND e.id < ?))");
      params.push(position.createdAt, position.createdAt, position.id);
    }

    const fetchLimit = limit + 1;
    params.push(fetchLimit);

    let rows: HabitRow[];
    try {
      const result = await this.#db
        .prepare(
          `WITH ${AREA_RANKS_CTE}
           SELECT ${READ_COLUMNS}
           ${BASE_FROM}
           WHERE ${conditions.join(" AND ")}
           ORDER BY e.created_at DESC, e.id DESC
           LIMIT ?`,
        )
        .bind(...params)
        .all<HabitRow>();
      rows = result.results;
    } catch (cause) {
      if (cause instanceof HabitError) throw cause;
      throw new HabitStorageError({ cause });
    }

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    // ONE schedule read for the WHOLE page — never one per row.
    const versions = await this.#readVersions(pageRows.map((row) => row.id));
    const items = pageRows.map((row) =>
      this.#toHabit(row, versions.get(row.id) ?? []),
    );
    const last = pageRows.at(-1);
    const nextCursor =
      hasMore && last !== undefined
        ? encodeHabitCursor(scope, { createdAt: last.created_at, id: last.id })
        : null;
    return { items, nextCursor, hasMore };
  }

  /* ---------------------------------------------------------------------- */
  /* Update                                                                 */
  /* ---------------------------------------------------------------------- */

  async update(
    id: string,
    changes: UpdateHabitInput,
  ): Promise<HabitChangeResult> {
    const habitId = validateHabitId(id);
    const current = await this.get(habitId);
    if (current === null) throw new HabitNotFoundError();

    const nextTitle =
      changes.title === undefined ? null : validateHabitTitle(changes.title);
    const notesProvided = changes.notes !== undefined;
    const nextNotes = notesProvided ? validateHabitNotes(changes.notes) : null;
    const goalProvided = changes.goalId !== undefined;
    const nextGoalId =
      changes.goalId === undefined || changes.goalId === null
        ? null
        : validateHabitId(changes.goalId, "goalId");
    const areaProvided = changes.areaId !== undefined;
    const nextAreaId =
      changes.areaId === undefined || changes.areaId === null
        ? null
        : validateHabitId(changes.areaId, "areaId");

    const titleChanged = nextTitle !== null && nextTitle !== current.title;
    const notesChanged = notesProvided && nextNotes !== current.notes;
    const goalChanged =
      goalProvided && nextGoalId !== (current.goal?.id ?? null);
    const areaChanged =
      areaProvided && nextAreaId !== (current.area?.id ?? null);

    if (!titleChanged && !notesChanged && !goalChanged && !areaChanged) {
      return { habit: current, changed: false };
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const fields: string[] = [];
    const extra: D1PreparedStatement[] = [];

    /*
     * The DOMAIN statement is always the detail slice, even for a title-only
     * edit: `recordAtomicMutation` guards the Activity append on the FIRST
     * statement having changed a row, so the first statement has to be one that
     * always changes exactly one row when the edit is real. The detail slice's
     * `updated_at` is that row, and advancing it is also what makes a
     * relationship-only change visible to the record's reload key.
     */
    const detailSets: string[] = ["updated_at = ?"];
    const detailValues: unknown[] = [nowTs];
    if (notesChanged) {
      detailSets.unshift("notes = ?");
      detailValues.unshift(nextNotes);
      fields.push("notes");
    }
    const domainStatement = this.#db
      .prepare(
        `UPDATE habit_details
            SET ${detailSets.join(", ")}
          WHERE workspace_id = ? AND entity_id = ?
            AND EXISTS (
                  SELECT 1 FROM entities
                  WHERE workspace_id = ? AND id = ?
                        AND type = '${HABIT_ENTITY_TYPE}' AND deleted_at IS NULL
                )
          RETURNING entity_id`,
      )
      .bind(
        ...detailValues,
        this.#workspaceId,
        habitId,
        this.#workspaceId,
        habitId,
      );

    if (titleChanged) {
      fields.push("title");
      extra.push(
        this.#db
          .prepare(
            `UPDATE entities SET title = ?, updated_at = ?
              WHERE workspace_id = ? AND id = ?
                    AND type = '${HABIT_ENTITY_TYPE}' AND deleted_at IS NULL`,
          )
          .bind(nextTitle, nowTs, this.#workspaceId, habitId),
      );
    }
    if (goalChanged) {
      fields.push("goal");
      extra.push(
        ...this.#relinkStatements(
          habitId,
          nextGoalId,
          HABIT_SUPPORTS_GOAL,
          GOAL,
          nowTs,
        ),
      );
    }
    if (areaChanged) {
      fields.push("area");
      extra.push(
        ...this.#relinkStatements(
          habitId,
          nextAreaId,
          HABIT_BELONGS_TO_AREA,
          AREA,
          nowTs,
        ),
      );
    }

    await this.#runMutation(
      domainStatement,
      {
        type: HABIT_UPDATED,
        subjects: [{ entityId: habitId, role: SUBJECT_ROLE }],
        payload: { fields },
      },
      now,
      extra,
    );

    const refreshed = await this.get(habitId);
    if (refreshed === null) throw new HabitNotFoundError();
    return { habit: refreshed, changed: true };
  }

  /**
   * Replace a Habit's single active link of one type.
   *
   * Two statements: retire whatever is linked now, then link the new target if
   * there is one. "At most one active link of each type" is a repository
   * invariant (a Habit belongs in one part of a life), enforced here rather than
   * by a schema constraint, exactly as a spine record's single structural parent
   * is enforced by `SpineRepository` rather than by a column.
   */
  #relinkStatements(
    habitId: string,
    targetId: string | null,
    linkType: string,
    targetType: string,
    nowTs: string,
  ): readonly D1PreparedStatement[] {
    const statements: D1PreparedStatement[] = [
      this.#db
        .prepare(
          `UPDATE entity_links SET deleted_at = ?, updated_at = ?
            WHERE workspace_id = ? AND source_entity_id = ?
                  AND type = '${linkType}' AND deleted_at IS NULL`,
        )
        .bind(nowTs, nowTs, this.#workspaceId, habitId),
    ];
    if (targetId !== null) {
      statements.push(
        this.#linkStatement(habitId, targetId, linkType, targetType, nowTs),
      );
    }
    return statements;
  }

  /* ---------------------------------------------------------------------- */
  /* Schedule versioning                                                    */
  /* ---------------------------------------------------------------------- */

  async changeSchedule(
    id: string,
    schedule: HabitSchedule,
  ): Promise<HabitScheduleChangeResult> {
    const habitId = validateHabitId(id);
    const next = validateHabitSchedule(schedule);
    const current = await this.get(habitId);
    if (current === null) throw new HabitNotFoundError();

    const version = currentScheduleVersion(current.versions);
    if (version !== null && habitSchedulesEqual(version.schedule, next)) {
      return { habit: current, outcome: "unchanged", changed: false };
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const todayIso = await this.#today(now);
    const columns = scheduleColumns(next);

    /*
     * Two shapes, and which one applies is decided by ONE question: does the
     * version in force already begin today?
     *
     *   - it does → the owner is correcting a cadence they set this morning, so
     *     the version is AMENDED in place. Opening a second version for the same
     *     day would leave a zero-length one behind, and the unique index on
     *     (workspace, habit, effective_from) refuses it anyway.
     *   - it does not → the version is CLOSED at yesterday and a new one opened
     *     today. Every day before today keeps the schedule it actually had,
     *     which is the whole reason this table is versioned.
     */
    const amending = version !== null && version.effectiveFrom === todayIso;
    const scheduleId = amending ? version.id : this.#newId();
    const extra: D1PreparedStatement[] = [];

    const domainStatement = this.#db
      .prepare(
        `UPDATE habit_details SET updated_at = ?
          WHERE workspace_id = ? AND entity_id = ?
            AND EXISTS (
                  SELECT 1 FROM entities
                  WHERE workspace_id = ? AND id = ?
                        AND type = '${HABIT_ENTITY_TYPE}' AND deleted_at IS NULL
                )
          RETURNING entity_id`,
      )
      .bind(nowTs, this.#workspaceId, habitId, this.#workspaceId, habitId);

    if (amending) {
      extra.push(
        this.#db
          .prepare(
            `UPDATE habit_schedules
                SET kind = ?, weekdays = ?, target_count = ?
              WHERE workspace_id = ? AND habit_id = ? AND id = ?`,
          )
          .bind(
            columns.kind,
            columns.weekdays,
            columns.targetCount,
            this.#workspaceId,
            habitId,
            scheduleId,
          ),
      );
    } else {
      extra.push(
        this.#db
          .prepare(
            `UPDATE habit_schedules SET effective_to = ?
              WHERE workspace_id = ? AND habit_id = ? AND effective_to IS NULL`,
          )
          .bind(addPlanningDays(todayIso, -1), this.#workspaceId, habitId),
        this.#db
          .prepare(
            `INSERT INTO habit_schedules
               (id, workspace_id, habit_id, kind, weekdays, target_count,
                effective_from, effective_to, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
          )
          .bind(
            scheduleId,
            this.#workspaceId,
            habitId,
            columns.kind,
            columns.weekdays,
            columns.targetCount,
            todayIso,
            nowTs,
          ),
      );
    }

    await this.#runMutation(
      domainStatement,
      {
        type: HABIT_SCHEDULE_CHANGED,
        subjects: [{ entityId: habitId, role: SUBJECT_ROLE }],
        payload: { kind: columns.kind, effectiveFrom: todayIso },
      },
      now,
      extra,
    );

    const refreshed = await this.get(habitId);
    if (refreshed === null) throw new HabitNotFoundError();
    return {
      habit: refreshed,
      outcome: amending ? "amended" : "versioned",
      changed: true,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Archive lifecycle                                                      */
  /* ---------------------------------------------------------------------- */

  async archive(id: string): Promise<HabitLifecycleResult> {
    return this.#setArchived(id, true);
  }

  async restore(id: string): Promise<HabitLifecycleResult> {
    return this.#setArchived(id, false);
  }

  async #setArchived(
    id: string,
    archived: boolean,
  ): Promise<HabitLifecycleResult> {
    const habitId = validateHabitId(id);
    const current = await this.get(habitId);
    if (current === null) throw new HabitNotFoundError();

    const isArchived = current.archivedAt !== null;
    if (isArchived === archived) {
      return {
        habit: current,
        outcome: archived ? "already_archived" : "already_active",
        changed: false,
      };
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const todayIso = await this.#today(now);
    const guard = archived ? "archived_at IS NULL" : "archived_at IS NOT NULL";

    const domainStatement = this.#db
      .prepare(
        `UPDATE habit_details
            SET archived_at = ?, archived_on = ?, updated_at = ?
          WHERE workspace_id = ? AND entity_id = ?
            AND EXISTS (
                  SELECT 1 FROM entities
                  WHERE workspace_id = ? AND id = ?
                        AND type = '${HABIT_ENTITY_TYPE}' AND deleted_at IS NULL
                )
            AND ${guard}
          RETURNING entity_id`,
      )
      .bind(
        archived ? nowTs : null,
        archived ? todayIso : null,
        nowTs,
        this.#workspaceId,
        habitId,
        this.#workspaceId,
        habitId,
      );

    const result = await this.#runMutation(
      domainStatement,
      {
        type: archived ? HABIT_ARCHIVED : HABIT_RESTORED,
        subjects: [{ entityId: habitId, role: SUBJECT_ROLE }],
        payload: {},
      },
      now,
      [],
      { allowNoChange: true },
    );

    const refreshed = await this.get(habitId);
    if (refreshed === null) throw new HabitNotFoundError();
    if (result.changed) {
      return {
        habit: refreshed,
        outcome: archived ? "archived" : "restored",
        changed: true,
      };
    }
    // The gate matched nothing: reconcile honestly against fresh state.
    const nowArchived = refreshed.archivedAt !== null;
    if (nowArchived === archived) {
      return {
        habit: refreshed,
        outcome: archived ? "already_archived" : "already_active",
        changed: false,
      };
    }
    throw new HabitConflictError();
  }

  /* ---------------------------------------------------------------------- */
  /* Check-ins                                                              */
  /* ---------------------------------------------------------------------- */

  async checkIn(id: string, dateIso: string): Promise<HabitCheckInResult> {
    const habitId = validateHabitId(id);
    const now = this.#clock();
    const date = this.#validateDate(dateIso, await this.#today(now));

    /*
     * `INSERT OR IGNORE … SELECT` — the whole invariant in one statement.
     *
     * The SELECT is the GUARD: it yields a row only when the Habit exists in
     * this workspace, is a live `habit`, and is NOT archived. `OR IGNORE` is the
     * IDEMPOTENCE: the table's primary key is (workspace, habit, date), so a
     * second check-in for the same day writes nothing and reports zero changes —
     * including when two taps genuinely race, because the database arbitrates
     * rather than application code.
     */
    let changed: boolean;
    try {
      const result = await this.#db
        .prepare(
          `INSERT OR IGNORE INTO habit_completions
             (workspace_id, habit_id, completed_on, recorded_at)
           SELECT d.workspace_id, d.entity_id, ?, ?
           FROM habit_details d
           JOIN entities e
             ON e.workspace_id = d.workspace_id AND e.id = d.entity_id
                AND e.type = '${HABIT_ENTITY_TYPE}' AND e.deleted_at IS NULL
           WHERE d.workspace_id = ? AND d.entity_id = ? AND d.archived_at IS NULL`,
        )
        .bind(date, toStorageTimestamp(now), this.#workspaceId, habitId)
        .run();
      changed = (result.meta?.changes ?? 0) > 0;
    } catch (cause) {
      throw new HabitStorageError({ cause });
    }

    if (changed) {
      return { habitId, date, outcome: "recorded", changed: true };
    }

    // Nothing was written. Say WHY, from fresh state, rather than reporting a
    // silent success the owner would have to discover was a lie.
    const habit = await this.get(habitId);
    if (habit === null) throw new HabitNotFoundError();
    if (habit.archivedAt !== null) throw new HabitArchivedError();
    return { habitId, date, outcome: "already_recorded", changed: false };
  }

  async undoCheckIn(id: string, dateIso: string): Promise<HabitCheckInResult> {
    const habitId = validateHabitId(id);
    const now = this.#clock();
    const date = this.#validateDate(dateIso, await this.#today(now));
    let changed: boolean;
    try {
      const result = await this.#db
        .prepare(
          `DELETE FROM habit_completions
            WHERE workspace_id = ? AND habit_id = ? AND completed_on = ?`,
        )
        .bind(this.#workspaceId, habitId, date)
        .run();
      changed = (result.meta?.changes ?? 0) > 0;
    } catch (cause) {
      throw new HabitStorageError({ cause });
    }
    if (changed) {
      return { habitId, date, outcome: "removed", changed: true };
    }
    const habit = await this.get(habitId);
    if (habit === null) throw new HabitNotFoundError();
    return { habitId, date, outcome: "already_absent", changed: false };
  }

  async listCompletionsInRange(
    input: HabitCompletionRangeInput,
  ): Promise<readonly HabitCompletion[]> {
    const window = validateHabitDateWindow(input.fromIso, input.toIso);
    const ids = [...new Set(input.habitIds.map((id) => validateHabitId(id)))];
    if (ids.length === 0) return [];

    try {
      const result = await this.#db
        .prepare(
          `SELECT habit_id, completed_on, recorded_at
             FROM habit_completions
            WHERE workspace_id = ?
              AND completed_on >= ? AND completed_on <= ?
              AND habit_id IN (${placeholders(ids.length)})
            ORDER BY habit_id ASC, completed_on ASC`,
        )
        .bind(this.#workspaceId, window.fromIso, window.toIso, ...ids)
        .all<CompletionRow>();
      return result.results.map((row) => ({
        habitId: row.habit_id,
        completedOn: row.completed_on,
        recordedAt: fromStorageTimestamp(row.recorded_at),
      }));
    } catch (cause) {
      if (cause instanceof HabitError) throw cause;
      throw new HabitStorageError({ cause });
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Supporting habits                                                      */
  /* ---------------------------------------------------------------------- */

  async listSupportingHabits(input: {
    readonly anchorIds: readonly string[];
    readonly relation: "goal" | "area";
    readonly limitPerAnchor?: number;
  }): Promise<ReadonlyMap<string, readonly Habit[]>> {
    const ids = [
      ...new Set(input.anchorIds.map((id) => validateHabitId(id, "id"))),
    ];
    const perAnchor = Math.min(Math.max(input.limitPerAnchor ?? 5, 1), 20);
    const map = new Map<string, Habit[]>();
    if (ids.length === 0) return map;

    const linkType =
      input.relation === "goal" ? HABIT_SUPPORTS_GOAL : HABIT_BELONGS_TO_AREA;

    let rows: (HabitRow & { readonly anchor_id: string })[];
    try {
      const result = await this.#db
        .prepare(
          `WITH ${AREA_RANKS_CTE}
           SELECT ${READ_COLUMNS}, l.target_entity_id AS anchor_id
           FROM entity_links l
           JOIN entities e
             ON e.workspace_id = l.workspace_id AND e.id = l.source_entity_id
                AND e.type = '${HABIT_ENTITY_TYPE}' AND e.deleted_at IS NULL
           JOIN habit_details d
             ON d.workspace_id = e.workspace_id AND d.entity_id = e.id${CONTEXT_JOINS}
           WHERE l.workspace_id = ? AND l.type = '${linkType}'
                 AND l.deleted_at IS NULL AND d.archived_at IS NULL
                 AND l.target_entity_id IN (${placeholders(ids.length)})
           ORDER BY l.target_entity_id ASC, e.created_at ASC, e.id ASC
           LIMIT ?`,
        )
        .bind(
          this.#workspaceId,
          this.#workspaceId,
          ...ids,
          // Bounded by construction: at most `perAnchor` rows per anchor could
          // ever be shown, so the statement never returns more than that could
          // need, whatever the workspace holds.
          ids.length * perAnchor,
        )
        .all<HabitRow & { readonly anchor_id: string }>();
      rows = result.results;
    } catch (cause) {
      if (cause instanceof HabitError) throw cause;
      throw new HabitStorageError({ cause });
    }

    const versions = await this.#readVersions(rows.map((row) => row.id));
    for (const row of rows) {
      const bucket = map.get(row.anchor_id) ?? [];
      if (bucket.length >= perAnchor) continue;
      bucket.push(this.#toHabit(row, versions.get(row.id) ?? []));
      map.set(row.anchor_id, bucket);
    }
    return map;
  }

  /* ---------------------------------------------------------------------- */
  /* Internals                                                              */
  /* ---------------------------------------------------------------------- */

  /** The owner's calendar day, from the ONE scope-level authority (AUDIT-14). */
  async #today(now: Date): Promise<string> {
    try {
      return ownerDate(now, await this.#ownerTimeZone());
    } catch {
      return ownerDate(now, "UTC");
    }
  }

  /** The kernel's own rule, called rather than re-implemented: a real calendar
   * date, never in the owner's future. */
  #validateDate(value: string, todayIso: string): string {
    return validateHabitCheckInDate(value, todayIso);
  }

  /** Every schedule version for a bounded set of Habit ids, in ONE statement. */
  async #readVersions(
    habitIds: readonly string[],
  ): Promise<Map<string, HabitScheduleVersion[]>> {
    const map = new Map<string, HabitScheduleVersion[]>();
    const ids = [...new Set(habitIds)];
    if (ids.length === 0) return map;
    let rows: ScheduleRow[];
    try {
      const result = await this.#db
        .prepare(
          `SELECT id, habit_id, kind, weekdays, target_count,
                  effective_from, effective_to
             FROM habit_schedules
            WHERE workspace_id = ? AND habit_id IN (${placeholders(ids.length)})
            ORDER BY habit_id ASC, effective_from ASC`,
        )
        .bind(this.#workspaceId, ...ids)
        .all<ScheduleRow>();
      rows = result.results;
    } catch (cause) {
      throw new HabitStorageError({ cause });
    }
    for (const row of rows) {
      const version = toVersion(row);
      if (version === null) continue;
      const bucket = map.get(row.habit_id) ?? [];
      bucket.push(version);
      map.set(row.habit_id, bucket);
    }
    return map;
  }

  #toHabit(row: HabitRow, versions: readonly HabitScheduleVersion[]): Habit {
    const current = currentScheduleVersion(versions);
    const goal: HabitLinkedRecord | null =
      row.goal_id === null || row.goal_title === null
        ? null
        : { id: row.goal_id, title: row.goal_title };
    const area: HabitLinkedRecord | null =
      row.area_id === null || row.area_title === null
        ? null
        : {
            id: row.area_id,
            title: row.area_title,
            colourRank: row.area_colour_rank,
            iconKey: normaliseEntityIconKey(row.area_icon_key),
            colourSlot: normaliseIdentityColourSlot(row.area_colour_slot),
          };
    return {
      id: row.id,
      workspaceId: parseWorkspaceId(row.workspace_id),
      title: row.title,
      notes: row.notes,
      createdAt: fromStorageTimestamp(row.created_at),
      updatedAt: fromStorageTimestamp(row.effective_updated_at),
      deletedAt:
        row.deleted_at === null ? null : fromStorageTimestamp(row.deleted_at),
      archivedAt:
        row.archived_at === null ? null : fromStorageTimestamp(row.archived_at),
      archivedOn: row.archived_on,
      // A Habit whose stored schedule this build cannot read falls back to the
      // most permissive honest answer rather than throwing: it exists, it has no
      // expectation, and its history is untouched.
      schedule: current?.schedule ?? { kind: "daily" },
      versions,
      goal,
      area,
    };
  }

  /** Run a domain mutation with its Activity append, atomically. */
  async #runMutation(
    domainStatement: D1PreparedStatement,
    event: NewActivityEvent,
    now: Date,
    extra: readonly D1PreparedStatement[],
    options: { readonly allowNoChange?: boolean } = {},
  ): Promise<{ readonly changed: boolean }> {
    try {
      const model = buildActivityWriteModel(
        event,
        this.#actor.actor,
        this.#newActivityId(),
        now,
      );
      const result = await recordAtomicMutationWithExtras({
        db: this.#db,
        workspaceId: this.#workspaceId,
        domainStatement,
        recorder: this.#recorder,
        model,
        extra,
        fault: this.#mutationFault,
      });
      if (!result.changed && options.allowNoChange !== true) {
        throw new HabitConflictError();
      }
      return result;
    } catch (cause) {
      if (cause instanceof HabitError || cause instanceof ActivityError)
        throw cause;
      throw new HabitStorageError({ cause });
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

/**
 * `recordAtomicMutation`, plus the extra domain statements a Habit mutation
 * sometimes needs (the entity title, the schedule chain, the relationship
 * links).
 *
 * They are appended to the SAME batch — one transaction — rather than issued
 * separately, because "the schedule changed but the old version was never
 * closed" and "the title changed but the relationship did not" are exactly the
 * half-applied states ADR-012 exists to make impossible. The Activity guard is
 * unchanged: the FIRST statement is still the one the append is conditioned on.
 */
async function recordAtomicMutationWithExtras(input: {
  readonly db: D1Database;
  readonly workspaceId: string;
  readonly domainStatement: D1PreparedStatement;
  readonly recorder: D1ActivityRecorder;
  readonly model: Parameters<typeof recordAtomicMutation>[0]["model"];
  readonly extra: readonly D1PreparedStatement[];
  readonly fault?: AtomicMutationFault;
}): Promise<{ readonly changed: boolean }> {
  if (input.extra.length === 0) {
    const result = await recordAtomicMutation<{ entity_id: string }>({
      db: input.db,
      workspaceId: input.workspaceId,
      domainStatement: input.domainStatement,
      recorder: input.recorder,
      model: input.model,
      fault: input.fault,
    });
    return { changed: result.changed };
  }
  const appends = input.recorder.buildAppendStatements(
    input.workspaceId,
    input.model,
  );
  /*
   * The appends sit IMMEDIATELY after the domain statement, and the extras after
   * them. `D1ActivityRecorder` guards its `activities` insert on `changes() > 0`,
   * which refers to the statement directly before it — putting the extras in
   * between would make the guard read the last extra's outcome instead, and an
   * extra that legitimately changes nothing (retiring a link that was never
   * there) would silently suppress the event.
   */
  const batch = [input.domainStatement, ...appends, ...input.extra];
  const results = await input.db.batch(batch);
  return { changed: (results[0]?.meta?.changes ?? 0) > 0 };
}
