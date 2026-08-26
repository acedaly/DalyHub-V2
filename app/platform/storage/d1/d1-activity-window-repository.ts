/**
 * FOLLOW-01 — the bounded Activity window, in D1 (ADR-079).
 *
 * Read-only, and it OWNS NO STORAGE: there is no table behind this file, no
 * column, no index and no migration. Everything it reads already existed before
 * FOLLOW-01 — the append-only Activity stream (ADR-005/ADR-012), the Task's own
 * canonical `scheduled_date` (ADR-030) and the spine's completion instant — which
 * is the whole of [ADR-110]: follow-through is DERIVED.
 *
 * ── Two statements, and why it is two rather than one or four ───────────────
 * The set of Tasks a period's plan touched is computed ONCE, in SQL, as a common
 * table expression; both statements carry the same expression with the same
 * deterministic bound, so they describe the same set without the id list ever
 * crossing the process boundary. That matters for a reason TASKS-13 and UX-02
 * both found the expensive way: **D1 accepts at most 100 bound parameters per
 * query**, and binding one per Task id would put the ceiling on the size of the
 * owner's week. These statements bind THIRTEEN and FIFTEEN parameters
 * respectively — dates, instants and limits — whatever the week holds.
 *
 * ── The three arms of the candidate set ─────────────────────────────────────
 *   1. **Planned into the period now.** `task_details.scheduled_date` inside the
 *      period's days. This is the ordinary case, and it is also what covers a
 *      Task CREATED with a planned day: creation emits `entity.created` and no
 *      planning event, so for a Task nothing has re-planned, the date it carries
 *      is the date it has always carried. The derivation uses it only as the
 *      initial condition and only where no event speaks.
 *   2. **Touched inside the period.** Any plan movement, completion or reopen
 *      whose instant falls in `[startInstant, endInstant)`. Bounded by the
 *      period itself, and served by `activities_workspace_occurred_idx`.
 *   3. **Withdrawn after the period.** A planning event AFTER the period whose
 *      `previous` day is inside it — the arm that stops a Task the owner
 *      committed to on Wednesday and re-planned the following Monday from
 *      vanishing out of the week it was committed to. Empty by construction for
 *      a period that has not closed, and served by
 *      `activities_workspace_type_occurred_idx`.
 *
 * ── Which stored events carry a plan change ─────────────────────────────────
 * `task.planned`, `task.rescheduled` and `task.plan_cleared` are the domain
 * authority and carry `scheduledDate` / `previous` in their payloads. They are
 * not the only writer: TASKS-07's series move and skip change an occurrence's
 * planned day too, and record it as a `changes.scheduledDate` pair on the event
 * they already write. Both shapes are read here and normalised to ONE kernel
 * vocabulary, so the kernel never learns a storage event name and no second
 * planning authority is created to make this query easier.
 *
 * No caller-supplied value is interpolated into SQL. Dates, instants and limits
 * are BOUND; entity types, link types and Activity types are inlined as trusted
 * kernel constants, exactly as `D1ReviewInsightRepository` already does.
 */

import {
  MAX_WINDOW_EVENTS,
  MAX_WINDOW_TASKS,
  type ActivityWindow,
  type ActivityWindowRepository,
  type TaskPlanEvent,
  type TaskPlanEventKind,
  type TaskPlanSubject,
  type TaskPlanWindowRead,
} from "~/kernel/activity-window";
import {
  PROJECT,
  TASK,
  TASK_BELONGS_TO_AREA,
  TASK_BELONGS_TO_PROJECT,
  TASK_COMPLETED,
  TASK_REOPENED,
} from "~/kernel/spine";
import {
  TASK_PLAN_CLEARED,
  TASK_PLANNED,
  TASK_RESCHEDULED,
  isTaskOutOfCommitment,
  type TaskStatus,
} from "~/kernel/tasks";
import type { WorkspaceContext } from "~/kernel/workspaces";

import { fromStorageTimestamp } from "./database";

/**
 * The payload path TASKS-07's series operations write a planned-day change to.
 *
 * One convention rather than two: `entity.updated` already used
 * `changes.<field>.{before,after}` for every other field, and FOLLOW-01 made the
 * occurrence SKIP write the same pair rather than inventing a third shape for
 * the same fact.
 */
const CHANGES_SCHEDULED = "$.changes.scheduledDate";

/**
 * True for any event that MOVED the plan, in either recorded shape.
 *
 * The three domain types are matched by name; anything else qualifies by
 * carrying the `changes.scheduledDate` pair, which is what makes this read a
 * reader of the Activity STREAM rather than of three event types.
 */
const IS_PLAN_EVENT = `(
  a.type IN ('${TASK_PLANNED}', '${TASK_RESCHEDULED}', '${TASK_PLAN_CLEARED}')
  OR json_extract(a.payload_json, '${CHANGES_SCHEDULED}') IS NOT NULL
)`;

/** The plan the event REPLACED, from whichever shape recorded it. */
const PLAN_BEFORE = `CASE
    WHEN json_extract(a.payload_json, '${CHANGES_SCHEDULED}') IS NOT NULL
      THEN json_extract(a.payload_json, '${CHANGES_SCHEDULED}.before')
    ELSE json_extract(a.payload_json, '$.previous')
  END`;

/** The plan the event LEFT IN FORCE. NULL is a real answer: the plan was cleared. */
const PLAN_AFTER = `CASE
    WHEN json_extract(a.payload_json, '${CHANGES_SCHEDULED}') IS NOT NULL
      THEN json_extract(a.payload_json, '${CHANGES_SCHEDULED}.after')
    ELSE json_extract(a.payload_json, '$.scheduledDate')
  END`;

/**
 * The candidate set, as SQL. Written once and embedded in both statements so
 * the two can never describe different sets.
 *
 * Bind order: `ws, d0, d1, ws, t0, t1, ws, t1, d0, d1, limit`.
 */
const CANDIDATE_CTE = `WITH candidate AS (
    SELECT td.entity_id AS task_id
    FROM task_details td
    JOIN entities te
      ON te.workspace_id = td.workspace_id AND te.id = td.entity_id
         AND te.type = '${TASK}' AND te.deleted_at IS NULL
    WHERE td.workspace_id = ?
      AND td.scheduled_date IS NOT NULL
      AND td.scheduled_date >= ? AND td.scheduled_date <= ?

    UNION

    SELECT s.entity_id AS task_id
    FROM activities a
    JOIN activity_subjects s
      ON s.workspace_id = a.workspace_id AND s.activity_id = a.id
    JOIN entities ae
      ON ae.workspace_id = s.workspace_id AND ae.id = s.entity_id
         AND ae.type = '${TASK}' AND ae.deleted_at IS NULL
    WHERE a.workspace_id = ?
      AND a.occurred_at >= ? AND a.occurred_at < ?
      AND (
        ${IS_PLAN_EVENT}
        OR a.type IN ('${TASK_COMPLETED}', '${TASK_REOPENED}')
      )

    UNION

    SELECT s.entity_id AS task_id
    FROM activities a
    JOIN activity_subjects s
      ON s.workspace_id = a.workspace_id AND s.activity_id = a.id
    JOIN entities ae
      ON ae.workspace_id = s.workspace_id AND ae.id = s.entity_id
         AND ae.type = '${TASK}' AND ae.deleted_at IS NULL
    WHERE a.workspace_id = ?
      AND a.type IN ('${TASK_PLANNED}', '${TASK_RESCHEDULED}', '${TASK_PLAN_CLEARED}')
      AND a.occurred_at >= ?
      AND json_extract(a.payload_json, '$.previous') >= ?
      AND json_extract(a.payload_json, '$.previous') <= ?
  ),
  windowed AS (
    SELECT task_id FROM candidate ORDER BY task_id LIMIT ?
  )`;

interface SubjectRow {
  readonly id: string;
  readonly title: string;
  readonly scheduled_date: string | null;
  readonly completed_at: string | null;
  readonly status: string;
  readonly commitment_state: string;
  readonly project_id: string | null;
  readonly project_title: string | null;
  readonly area_id: string | null;
  readonly area_title: string | null;
}

interface EventRow {
  readonly task_id: string;
  readonly type: string;
  readonly occurred_at: string;
  readonly plan_before: string | null;
  readonly plan_after: string | null;
}

function clampLimit(value: number | undefined, fallback: number): number {
  const wanted = Math.trunc(value ?? fallback);
  if (!Number.isFinite(wanted) || wanted < 1) return 1;
  return Math.min(wanted, fallback);
}

/** Turn a stored event type and its normalised dates into the kernel's kind. */
function toEventKind(row: EventRow): TaskPlanEventKind {
  switch (row.type) {
    case TASK_COMPLETED:
      return "completed";
    case TASK_REOPENED:
      return "reopened";
    case TASK_PLANNED:
      return "planned";
    case TASK_RESCHEDULED:
      return "rescheduled";
    case TASK_PLAN_CLEARED:
      return "cleared";
    default:
      /*
       * A `changes.scheduledDate` pair on some other event. The pair itself says
       * which of the three movements it is, which is exactly why the kernel
       * takes a normalised kind rather than a stored type name.
       */
      if (row.plan_after === null) return "cleared";
      return row.plan_before === null ? "planned" : "rescheduled";
  }
}

export class D1ActivityWindowRepository implements ActivityWindowRepository {
  readonly #db: D1Database;
  readonly #workspaceId: string;

  constructor(db: D1Database, context: WorkspaceContext) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
  }

  async readTaskPlanWindow(
    window: ActivityWindow,
    limits: { readonly tasks?: number; readonly events?: number } = {},
  ): Promise<TaskPlanWindowRead> {
    const taskLimit = clampLimit(limits.tasks, MAX_WINDOW_TASKS);
    const eventLimit = clampLimit(limits.events, MAX_WINDOW_EVENTS);
    /*
     * One past the bound, in BOTH statements, so "there were more" is knowable
     * without a third counting statement — and so the two statements still agree
     * about the set, because they take the same over-fetch.
     */
    const probe = taskLimit + 1;

    const candidateBinds = [
      this.#workspaceId,
      window.periodStart,
      window.periodEnd,
      this.#workspaceId,
      window.startInstantIso,
      window.endInstantIso,
      this.#workspaceId,
      window.endInstantIso,
      window.periodStart,
      window.periodEnd,
      probe,
    ];

    const [subjectResult, eventResult] = await Promise.all([
      this.#db
        .prepare(
          `${CANDIDATE_CTE}
           SELECT e.id AS id, e.title AS title,
                  td.scheduled_date AS scheduled_date,
                  sr.completed_at AS completed_at,
                  COALESCE(td.status, 'todo') AS status,
                  COALESCE(td.commitment_state, 'active') AS commitment_state,
                  p.id AS project_id, p.title AS project_title,
                  ar.id AS area_id, ar.title AS area_title
           FROM windowed w
           JOIN entities e
             ON e.workspace_id = ? AND e.id = w.task_id
           LEFT JOIN spine_records sr
             ON sr.workspace_id = ? AND sr.entity_id = w.task_id
           LEFT JOIN task_details td
             ON td.workspace_id = ? AND td.entity_id = w.task_id
           LEFT JOIN entity_links tp
             ON tp.workspace_id = ? AND tp.source_entity_id = w.task_id
                AND tp.type = '${TASK_BELONGS_TO_PROJECT}' AND tp.deleted_at IS NULL
           LEFT JOIN entities p
             ON p.workspace_id = ? AND p.id = tp.target_entity_id
                AND p.type = '${PROJECT}' AND p.deleted_at IS NULL
           LEFT JOIN entity_links ta
             ON ta.workspace_id = ? AND ta.source_entity_id = w.task_id
                AND ta.type = '${TASK_BELONGS_TO_AREA}' AND ta.deleted_at IS NULL
           LEFT JOIN entities ar
             ON ar.workspace_id = ? AND ar.id = ta.target_entity_id
                AND ar.deleted_at IS NULL
           ORDER BY e.id ASC`,
        )
        .bind(...candidateBinds, ...Array<string>(7).fill(this.#workspaceId))
        .all<SubjectRow>(),
      this.#db
        .prepare(
          `${CANDIDATE_CTE}
           SELECT s.entity_id AS task_id, a.type AS type, a.occurred_at AS occurred_at,
                  ${PLAN_BEFORE} AS plan_before,
                  ${PLAN_AFTER} AS plan_after
           FROM activities a
           JOIN activity_subjects s
             ON s.workspace_id = a.workspace_id AND s.activity_id = a.id
           JOIN windowed w ON w.task_id = s.entity_id
           WHERE a.workspace_id = ?
             AND (
               (
                 a.occurred_at >= ? AND a.occurred_at < ?
                 AND (
                   ${IS_PLAN_EVENT}
                   OR a.type IN ('${TASK_COMPLETED}', '${TASK_REOPENED}')
                 )
               )
               OR (
                 a.occurred_at >= ?
                 AND a.type IN ('${TASK_PLANNED}', '${TASK_RESCHEDULED}', '${TASK_PLAN_CLEARED}')
                 AND json_extract(a.payload_json, '$.previous') >= ?
                 AND json_extract(a.payload_json, '$.previous') <= ?
               )
             )
           ORDER BY a.occurred_at ASC, a.id ASC
           LIMIT ?`,
        )
        .bind(
          ...candidateBinds,
          this.#workspaceId,
          window.startInstantIso,
          window.endInstantIso,
          window.endInstantIso,
          window.periodStart,
          window.periodEnd,
          eventLimit + 1,
        )
        .all<EventRow>(),
    ]);

    const subjectRows = subjectResult.results ?? [];
    const eventRows = eventResult.results ?? [];
    const boundedTasks = subjectRows.length > taskLimit;
    const boundedEvents = eventRows.length > eventLimit;

    const subjects: TaskPlanSubject[] = subjectRows
      .slice(0, taskLimit)
      .map((row) => ({
        id: row.id,
        title: row.title,
        scheduledDate: row.scheduled_date,
        completedAtIso:
          row.completed_at === null
            ? null
            : fromStorageTimestamp(row.completed_at).toISOString(),
        /*
         * The NON-COMPLETION half of GATE-02's `isTaskOutOfCommitment`, on
         * purpose: completion carries an instant and is folded from history, so
         * feeding it in here as well would let a Task finished AFTER the period
         * report as abandoned during it.
         */
        abandonedNow: isTaskOutOfCommitment({
          completed: false,
          status: row.status as TaskStatus,
          someday: row.commitment_state === "someday",
        }),
        parent:
          row.project_id !== null
            ? {
                kind: "project",
                id: row.project_id,
                title: row.project_title ?? "",
              }
            : row.area_id !== null
              ? { kind: "area", id: row.area_id, title: row.area_title ?? "" }
              : null,
      }));

    const known = new Set(subjects.map((subject) => subject.id));
    const events: TaskPlanEvent[] = [];
    for (const row of eventRows.slice(0, eventLimit)) {
      if (!known.has(row.task_id)) continue;
      events.push({
        taskId: row.task_id,
        kind: toEventKind(row),
        occurredAtIso: fromStorageTimestamp(row.occurred_at).toISOString(),
        planBefore: row.plan_before,
        planAfter: row.plan_after,
      });
    }

    return { subjects, events, bounded: boundedTasks || boundedEvents };
  }
}
