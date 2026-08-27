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
 * owner's week. These statements bind EIGHTEEN and TWENTY parameters
 * respectively — workspace ids, dates, instants and limits — whatever the week
 * holds. Both numbers are asserted, not asserted about.
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
 *   3. **Withdrawn after the period.** A plan movement AFTER the period whose
 *      `before` day is inside it — the arm that stops a Task the owner
 *      committed to on Wednesday and re-planned the following Monday from
 *      vanishing out of the week it was committed to. Empty by construction for
 *      a period that has not closed, and served by
 *      `activities_workspace_occurred_idx`.
 *
 * ── Reaching PAST the period, in both directions ────────────────────────────
 * Arm 3 makes the Task a candidate; the event statement then has to fetch enough
 * of the movement for the derivation to judge it, and that reach is symmetric
 * where the arm is not. A plan can also be moved INTO a period that has already
 * closed — the owner backdates a Task onto a Wednesday the week already spent —
 * and then `task_details.scheduled_date` reads as a day inside the period while
 * nothing inside the period ever happened. Arm 1 holds that Task as a candidate
 * either way, so the ONLY thing that keeps the account honest is fetching the
 * post-period movement that put it there: with the movement in hand the plan at
 * the period's open resolves to what it replaced (a day in June), the Task falls
 * out of the account, and the week is not credited with work committed to it in
 * hindsight. Without it the derivation would have no event to read and would
 * fall back to the current date — the one inference [ADR-110] forbids.
 *
 * So the post-period branch matches a movement whose `before` OR whose `after`
 * lands in the period, in either recorded shape. Both are bounded by the
 * period's own days, and neither widens what a period that is still running
 * reads: for an open period there is nothing after it yet.
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
  GOAL_MOVEMENT_CHUNK_SIZE,
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
  GOAL_MOVEMENT_KINDS,
  type GoalMovementFacts,
  type GoalMovementKind,
} from "~/kernel/alignment";
import {
  GOAL_MEASUREMENT_LOGGED,
  GOAL_MILESTONE_COMPLETED,
} from "~/kernel/goals";
import {
  GOAL,
  GOAL_COMPLETED,
  PROJECT,
  PROJECT_ADVANCES_GOAL,
  PROJECT_COMPLETED,
  TASK,
  TASK_BELONGS_TO_AREA,
  TASK_BELONGS_TO_PROJECT,
  TASK_COMPLETED,
  TASK_REOPENED,
  validateSpineId,
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
      AND a.occurred_at >= ?
      AND ${IS_PLAN_EVENT}
      AND ${PLAN_BEFORE} >= ? AND ${PLAN_BEFORE} <= ?
  ),
  windowed AS (
    SELECT task_id FROM candidate ORDER BY task_id LIMIT ?
  )`;

/* -------------------------------------------------------------------------- */
/* FOLLOW-02 — Goal movement                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The Goal ids, bound ONCE per statement as a `VALUES` common table expression.
 *
 * Every arm below joins this rather than repeating an `IN (…)` list, which is
 * what keeps a fifty-Goal page at sixty bound parameters instead of a hundred
 * and sixty — D1 refuses past a hundred, and TASKS-13 and UX-02 each found that
 * out the expensive way.
 */
function goalIdsCte(count: number): string {
  const rows = Array.from({ length: count }, () => "(?)").join(", ");
  return `goal_ids(id) AS (VALUES ${rows})`;
}

/**
 * The Projects that can currently move each requested Goal.
 *
 * Resolved from the CURRENT `project.advances_goal` links — the same documented
 * approximation `D1AlignmentRepository` and FOLLOW-01's ancestry resolution both
 * make and both state, and the reason a link event is NOT counted as movement:
 * a Project linked to a Goal today already contributes whatever it has done, so
 * counting the link as well would credit a window with work finished outside it.
 */
const CONTRIBUTING_CTE = `contributing AS (
    SELECT pg.target_entity_id AS goal_id, pe.id AS project_id
    FROM entity_links pg
    JOIN goal_ids gi ON gi.id = pg.target_entity_id
    JOIN entities pe
      ON pe.workspace_id = pg.workspace_id AND pe.id = pg.source_entity_id
         AND pe.type = '${PROJECT}' AND pe.deleted_at IS NULL
    WHERE pg.workspace_id = ?
      AND pg.type = '${PROJECT_ADVANCES_GOAL}' AND pg.deleted_at IS NULL
  )`;

/**
 * The Goal-DIRECT movement events, mapped from stored type to kernel kind.
 *
 * `goal.target_reached` is deliberately absent: it is appended by the SAME
 * atomic write as the reading that caused it, so counting both would count one
 * act twice. `goal.measurement_corrected` and `goal.measurement_removed` are
 * absent too — repairing the record of the past is not new movement.
 */
const GOAL_DIRECT_KIND = `CASE a.type
      WHEN '${GOAL_MEASUREMENT_LOGGED}' THEN 'measurement_logged'
      WHEN '${GOAL_MILESTONE_COMPLETED}' THEN 'milestone_completed'
      ELSE 'goal_completed'
    END`;

const GOAL_DIRECT_TYPES = [
  GOAL_MEASUREMENT_LOGGED,
  GOAL_MILESTONE_COMPLETED,
  GOAL_COMPLETED,
]
  .map((type) => `'${type}'`)
  .join(", ");

interface GoalStructureRow {
  readonly goal_id: string;
  readonly contributing_projects: number | null;
}

interface GoalMovementRow {
  readonly goal_id: string;
  readonly moved_projects: number | null;
  readonly latest_at: string | null;
  readonly task_completed: number | null;
  readonly project_completed: number | null;
  readonly measurement_logged: number | null;
  readonly milestone_completed: number | null;
  readonly goal_completed: number | null;
}

/** `SUM`s come back as `null` for an empty group; a count is never null here. */
function countOf(value: number | null | undefined): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) && numeric > 0 ? Math.trunc(numeric) : 0;
}

function chunkIds(ids: readonly string[], size: number): string[][] {
  const out: string[][] = [];
  for (let index = 0; index < ids.length; index += size) {
    out.push([...ids.slice(index, index + size)]);
  }
  return out;
}

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
                 AND ${IS_PLAN_EVENT}
                 AND (
                   (${PLAN_BEFORE} >= ? AND ${PLAN_BEFORE} <= ?)
                   OR (${PLAN_AFTER} >= ? AND ${PLAN_AFTER} <= ?)
                 )
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

  /* ------------------------------------------------------------------------ */
  /* FOLLOW-02 — did each Goal move inside the window?                        */
  /* ------------------------------------------------------------------------ */

  async readGoalMovementFacts(
    window: ActivityWindow,
    goalIds: readonly string[],
  ): Promise<Map<string, GoalMovementFacts>> {
    const ids = [...new Set(goalIds.map((id) => validateSpineId(id, "id")))];
    const result = new Map<string, GoalMovementFacts>();
    if (ids.length === 0) return result;

    const chunks = chunkIds(ids, GOAL_MOVEMENT_CHUNK_SIZE);
    const gathered = await Promise.all(
      chunks.map((chunk) => this.#readGoalMovementChunk(window, chunk)),
    );
    for (const chunkResult of gathered) {
      for (const [goalId, facts] of chunkResult) {
        result.set(goalId, facts);
      }
    }
    return result;
  }

  /**
   * ONE chunk, in EXACTLY TWO statements, whatever the history holds.
   *
   * 1. **Structure.** How many Projects can currently move each Goal. Every
   *    requested Goal that is an open Goal in this workspace appears, including
   *    one nothing advances — so "no Projects contribute" is a fact the surface
   *    receives rather than an absence it has to infer.
   * 2. **Movement.** The qualifying OUTCOME events inside the window, aggregated
   *    per Goal in SQL. Three arms, unioned:
   *      - a Task completed under a contributing Project (the ONE indirect path
   *        `SPINE_MODEL.md` allows: `Task → Project → Goal`);
   *      - a contributing Project itself completed;
   *      - a reading, a completed milestone or the Goal's own completion,
   *        recorded against the Goal directly.
   *
   *    Every count is `COUNT(DISTINCT a.id)` rather than `COUNT(*)`, so a
   *    duplicate `activity_subjects` row can never inflate a figure — the same
   *    defence in depth `D1AlignmentRepository` states for its own aggregate.
   *
   * Bound parameters: `N + 1` and `N + 10`. Nothing else is bound and no id list
   * is repeated, because both arms join one `VALUES` CTE.
   *
   * No caller-supplied value is interpolated into SQL: ids, instants and the
   * workspace are BOUND; entity types, link types and Activity types are inlined
   * as trusted kernel constants, exactly as the plan-window read above does.
   */
  async #readGoalMovementChunk(
    window: ActivityWindow,
    ids: readonly string[],
  ): Promise<Map<string, GoalMovementFacts>> {
    const cte = goalIdsCte(ids.length);

    const [structureResult, movementResult] = await Promise.all([
      this.#db
        .prepare(
          `WITH ${cte}
           SELECT gi.id AS goal_id,
                  COUNT(DISTINCT pe.id) AS contributing_projects
           FROM goal_ids gi
           JOIN entities ge
             ON ge.workspace_id = ? AND ge.id = gi.id
                AND ge.type = '${GOAL}' AND ge.deleted_at IS NULL
           LEFT JOIN entity_links pg
             ON pg.workspace_id = ge.workspace_id AND pg.target_entity_id = ge.id
                AND pg.type = '${PROJECT_ADVANCES_GOAL}' AND pg.deleted_at IS NULL
           LEFT JOIN entities pe
             ON pe.workspace_id = pg.workspace_id AND pe.id = pg.source_entity_id
                AND pe.type = '${PROJECT}' AND pe.deleted_at IS NULL
           GROUP BY gi.id`,
        )
        .bind(...ids, this.#workspaceId)
        .all<GoalStructureRow>(),
      this.#db
        .prepare(
          `WITH ${cte},
           ${CONTRIBUTING_CTE},
           movement AS (
             SELECT c.goal_id AS goal_id, c.project_id AS project_id,
                    'task_completed' AS kind, a.id AS activity_id,
                    a.occurred_at AS occurred_at
             FROM contributing c
             JOIN entity_links tl
               ON tl.workspace_id = ? AND tl.target_entity_id = c.project_id
                  AND tl.type = '${TASK_BELONGS_TO_PROJECT}' AND tl.deleted_at IS NULL
             JOIN entities te
               ON te.workspace_id = tl.workspace_id AND te.id = tl.source_entity_id
                  AND te.type = '${TASK}' AND te.deleted_at IS NULL
             JOIN activity_subjects s
               ON s.workspace_id = te.workspace_id AND s.entity_id = te.id
             JOIN activities a
               ON a.workspace_id = s.workspace_id AND a.id = s.activity_id
                  AND a.type = '${TASK_COMPLETED}'
             WHERE a.occurred_at >= ? AND a.occurred_at < ?

             UNION ALL

             SELECT c.goal_id, c.project_id, 'project_completed', a.id, a.occurred_at
             FROM contributing c
             JOIN activity_subjects s
               ON s.workspace_id = ? AND s.entity_id = c.project_id
             JOIN activities a
               ON a.workspace_id = s.workspace_id AND a.id = s.activity_id
                  AND a.type = '${PROJECT_COMPLETED}'
             WHERE a.occurred_at >= ? AND a.occurred_at < ?

             UNION ALL

             SELECT gi.id, NULL, ${GOAL_DIRECT_KIND}, a.id, a.occurred_at
             FROM goal_ids gi
             JOIN activity_subjects s
               ON s.workspace_id = ? AND s.entity_id = gi.id
             JOIN activities a
               ON a.workspace_id = s.workspace_id AND a.id = s.activity_id
                  AND a.type IN (${GOAL_DIRECT_TYPES})
             WHERE a.occurred_at >= ? AND a.occurred_at < ?
           )
           SELECT goal_id,
                  COUNT(DISTINCT project_id) AS moved_projects,
                  MAX(occurred_at) AS latest_at,
                  COUNT(DISTINCT CASE WHEN kind = 'task_completed' THEN activity_id END) AS task_completed,
                  COUNT(DISTINCT CASE WHEN kind = 'project_completed' THEN activity_id END) AS project_completed,
                  COUNT(DISTINCT CASE WHEN kind = 'measurement_logged' THEN activity_id END) AS measurement_logged,
                  COUNT(DISTINCT CASE WHEN kind = 'milestone_completed' THEN activity_id END) AS milestone_completed,
                  COUNT(DISTINCT CASE WHEN kind = 'goal_completed' THEN activity_id END) AS goal_completed
           FROM movement
           GROUP BY goal_id`,
        )
        .bind(
          ...ids,
          this.#workspaceId,
          this.#workspaceId,
          window.startInstantIso,
          window.endInstantIso,
          this.#workspaceId,
          window.startInstantIso,
          window.endInstantIso,
          this.#workspaceId,
          window.startInstantIso,
          window.endInstantIso,
        )
        .all<GoalMovementRow>(),
    ]);

    const movementByGoal = new Map<string, GoalMovementRow>();
    for (const row of movementResult.results ?? []) {
      movementByGoal.set(row.goal_id, row);
    }

    const facts = new Map<string, GoalMovementFacts>();
    for (const row of structureResult.results ?? []) {
      const movement = movementByGoal.get(row.goal_id);
      const counts: Partial<Record<GoalMovementKind, number>> = {};
      if (movement) {
        for (const kind of GOAL_MOVEMENT_KINDS) {
          const count = countOf(movement[kind]);
          if (count > 0) counts[kind] = count;
        }
      }
      facts.set(row.goal_id, {
        goalId: row.goal_id,
        contributingProjectCount: countOf(row.contributing_projects),
        movedProjectCount: countOf(movement?.moved_projects),
        counts,
        latestMovementAt:
          movement?.latest_at == null
            ? null
            : fromStorageTimestamp(movement.latest_at),
      });
    }
    return facts;
  }
}
