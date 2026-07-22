/**
 * PROJ-02 Project Health — D1 implementation of the read-only facts projection.
 *
 * Implements the storage-independent `ProjectHealthRepository` over Cloudflare D1
 * using prepared, parameterised statements only. Constructed with a single
 * `WorkspaceContext`; every statement constrains `workspace_id = ?`, and no method
 * accepts a `workspaceId` (ADR-010/ADR-035). No caller-supplied value is ever
 * interpolated into SQL — project ids and dates are BOUND; the project/task entity
 * types, the structural link type and the meaningful Activity types ARE inlined as
 * trusted kernel constants (never caller data).
 *
 * It performs NO mutations and caches NOTHING. Health is DERIVED from live data every
 * read (ADR-035), so it can never drift from the spine, task details or Activity.
 * Facts for a WHOLE bounded page of projects are gathered in a FIXED number of
 * grouped queries (three), never one query per project — no N+1. Every count follows
 * the spine project-rollup definition: active (non-deleted) direct child tasks linked
 * by an active `task.belongs_to_project` link. Soft-deleted tasks and unlinked
 * (soft-deleted) links never contribute. The per-signal counts consider OPEN tasks
 * only, so a completed task never triggers an open-work warning.
 */

import {
  addDaysToIsoDate,
  MEANINGFUL_HEALTH_ACTIVITY_TYPES,
  UPCOMING_WITHIN_DAYS,
  type ProjectHealthFacts,
  type ProjectHealthRepository,
} from "~/kernel/project-health";
import {
  PROJECT,
  TASK,
  TASK_BELONGS_TO_PROJECT,
  validateSpineId,
} from "~/kernel/spine";
import type { WorkspaceContext } from "~/kernel/workspaces";

import { fromStorageTimestamp } from "./database";

/** The absolute cap on ids per facts read — a bounded collection page, never an
 * unbounded "load everything". Mirrors the spine page-size ceiling. */
const MAX_HEALTH_BATCH = 100;

/**
 * The per-query id chunk size. D1 caps bound variables at 100 per statement; the
 * activity query binds the id set twice (once per UNION branch), so a chunk of 40
 * keeps every statement's variable count well under the limit (worst case ≈ 82). A
 * whole bounded page is gathered as a small, FIXED number of chunk reads — never one
 * query per project (no N+1).
 */
const HEALTH_CHUNK_SIZE = 40;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** The meaningful Activity types as a trusted, inlined SQL list. */
const MEANINGFUL_TYPE_LIST = MEANINGFUL_HEALTH_ACTIVITY_TYPES.map(
  (type) => `'${type}'`,
).join(", ");

/** Basic `YYYY-MM-DD` shape guard for the caller-supplied owner-calendar today. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

interface ProjectBaseRow {
  readonly id: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly completed_at: string | null;
}

interface TaskFactsRow {
  readonly project_id: string;
  readonly task_total: number | null;
  readonly task_completed: number | null;
  readonly waiting_open: number | null;
  readonly overdue_open: number | null;
  readonly slipped_open: number | null;
  readonly upcoming_due_open: number | null;
  readonly upcoming_scheduled_open: number | null;
  readonly oldest_waiting_since: string | null;
}

interface ActivityFactsRow {
  readonly project_id: string;
  readonly last_at: string | null;
}

export class D1ProjectHealthRepository implements ProjectHealthRepository {
  readonly #db: D1Database;
  readonly #workspaceId: string;

  constructor(db: D1Database, context: WorkspaceContext) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
  }

  async getProjectHealthFacts(
    id: string,
    todayIso: string,
  ): Promise<ProjectHealthFacts | null> {
    const facts = await this.listProjectHealthFacts([id], todayIso);
    return facts.get(validateSpineId(id, "id")) ?? null;
  }

  async listProjectHealthFacts(
    projectIds: readonly string[],
    todayIso: string,
  ): Promise<Map<string, ProjectHealthFacts>> {
    if (!ISO_DATE.test(todayIso)) {
      throw new RangeError("todayIso must be a YYYY-MM-DD calendar date");
    }
    // Validate and de-duplicate; a repeated id must never inflate a query or a
    // count. The bound is a hard ceiling so the read is always bounded.
    const ids = [...new Set(projectIds.map((id) => validateSpineId(id, "id")))];
    if (ids.length === 0) {
      return new Map();
    }
    if (ids.length > MAX_HEALTH_BATCH) {
      throw new RangeError(
        `Too many project ids for a bounded health read (max ${MAX_HEALTH_BATCH})`,
      );
    }

    // Gather each chunk (bounded variable count) and merge. Chunks run concurrently;
    // the total number of statements is a small fixed multiple of the page, not one
    // per project.
    const chunks = chunk(ids, HEALTH_CHUNK_SIZE);
    const gathered = await Promise.all(
      chunks.map((idChunk) => this.#gatherChunk(idChunk, todayIso)),
    );

    const baseRows: ProjectBaseRow[] = [];
    const taskByProject = new Map<string, TaskFactsRow>();
    const activityByProject = new Map<string, string | null>();
    for (const part of gathered) {
      baseRows.push(...part.baseRows);
      for (const row of part.taskRows) {
        taskByProject.set(row.project_id, row);
      }
      for (const row of part.activityRows) {
        activityByProject.set(row.project_id, row.last_at);
      }
    }

    const facts = new Map<string, ProjectHealthFacts>();
    for (const base of baseRows) {
      const task = taskByProject.get(base.id);
      const lastAt = activityByProject.get(base.id) ?? null;
      facts.set(base.id, {
        projectId: base.id,
        createdAt: fromStorageTimestamp(base.created_at),
        updatedAt: fromStorageTimestamp(base.updated_at),
        completedAt:
          base.completed_at === null
            ? null
            : fromStorageTimestamp(base.completed_at),
        taskTotal: Number(task?.task_total ?? 0),
        taskCompleted: Number(task?.task_completed ?? 0),
        waitingOpen: Number(task?.waiting_open ?? 0),
        overdueOpen: Number(task?.overdue_open ?? 0),
        slippedOpen: Number(task?.slipped_open ?? 0),
        upcomingDueOpen: Number(task?.upcoming_due_open ?? 0),
        upcomingScheduledOpen: Number(task?.upcoming_scheduled_open ?? 0),
        oldestWaitingSince:
          task?.oldest_waiting_since == null
            ? null
            : fromStorageTimestamp(task.oldest_waiting_since),
        lastMeaningfulActivityAt:
          lastAt === null ? null : fromStorageTimestamp(lastAt),
      });
    }
    return facts;
  }

  /** Gather the three fact reads for ONE chunk (each statement stays within D1's
   * bound-variable limit). */
  async #gatherChunk(
    ids: readonly string[],
    todayIso: string,
  ): Promise<{
    baseRows: ProjectBaseRow[];
    taskRows: TaskFactsRow[];
    activityRows: ActivityFactsRow[];
  }> {
    const placeholders = ids.map(() => "?").join(", ");
    const [baseRows, taskRows, activityRows] = await Promise.all([
      this.#runProjectBase(ids, placeholders),
      this.#runTaskFacts(ids, placeholders, todayIso),
      this.#runActivityFacts(ids, placeholders),
    ]);
    return { baseRows, taskRows, activityRows };
  }

  /**
   * The project base rows (identity, dates, completion). Only real, active projects
   * in this workspace appear — a missing, soft-deleted, wrong-kind or cross-workspace
   * id is simply absent (never disclosed). This is the set that gets facts.
   */
  async #runProjectBase(
    ids: readonly string[],
    placeholders: string,
  ): Promise<ProjectBaseRow[]> {
    const statement = this.#db
      .prepare(
        `SELECT e.id AS id, e.created_at AS created_at, e.updated_at AS updated_at,
                sr.completed_at AS completed_at
         FROM entities e
         JOIN spine_records sr
           ON sr.workspace_id = e.workspace_id AND sr.entity_id = e.id
         WHERE e.workspace_id = ? AND e.type = '${PROJECT}' AND e.deleted_at IS NULL
               AND e.id IN (${placeholders})`,
      )
      .bind(this.#workspaceId, ...ids);
    const result = await this.#run(statement);
    return (result.results ?? []) as ProjectBaseRow[];
  }

  /**
   * The per-project child-task aggregates, computed once for the whole page (no
   * per-project rollup call). Signal counts consider OPEN tasks only; date-only
   * comparisons are string comparisons against the owner's calendar today and the
   * inclusive upcoming-window boundary (never routed through a timezone).
   */
  async #runTaskFacts(
    ids: readonly string[],
    placeholders: string,
    todayIso: string,
  ): Promise<TaskFactsRow[]> {
    const windowEnd = addDaysToIsoDate(todayIso, UPCOMING_WITHIN_DAYS);
    const statement = this.#db
      .prepare(
        `SELECT tl.target_entity_id AS project_id,
                COUNT(*) AS task_total,
                SUM(CASE WHEN tsr.completed_at IS NOT NULL THEN 1 ELSE 0 END) AS task_completed,
                SUM(CASE WHEN tsr.completed_at IS NULL AND td.waiting_since IS NOT NULL THEN 1 ELSE 0 END) AS waiting_open,
                SUM(CASE WHEN tsr.completed_at IS NULL AND td.due_date IS NOT NULL AND td.due_date < ? THEN 1 ELSE 0 END) AS overdue_open,
                SUM(CASE WHEN tsr.completed_at IS NULL AND td.scheduled_date IS NOT NULL AND td.scheduled_date < ? THEN 1 ELSE 0 END) AS slipped_open,
                SUM(CASE WHEN tsr.completed_at IS NULL AND td.due_date IS NOT NULL AND td.due_date >= ? AND td.due_date <= ? THEN 1 ELSE 0 END) AS upcoming_due_open,
                SUM(CASE WHEN tsr.completed_at IS NULL AND td.scheduled_date IS NOT NULL AND td.scheduled_date >= ? AND td.scheduled_date <= ? THEN 1 ELSE 0 END) AS upcoming_scheduled_open,
                MIN(CASE WHEN tsr.completed_at IS NULL AND td.waiting_since IS NOT NULL THEN td.waiting_since END) AS oldest_waiting_since
         FROM entity_links tl
         JOIN entities te
           ON te.workspace_id = tl.workspace_id AND te.id = tl.source_entity_id
              AND te.type = '${TASK}' AND te.deleted_at IS NULL
         JOIN spine_records tsr
           ON tsr.workspace_id = te.workspace_id AND tsr.entity_id = te.id
         LEFT JOIN task_details td
           ON td.workspace_id = te.workspace_id AND td.entity_id = te.id
         WHERE tl.workspace_id = ? AND tl.type = '${TASK_BELONGS_TO_PROJECT}'
               AND tl.deleted_at IS NULL
               AND tl.target_entity_id IN (${placeholders})
         GROUP BY tl.target_entity_id`,
      )
      .bind(
        todayIso,
        todayIso,
        todayIso,
        windowEnd,
        todayIso,
        windowEnd,
        this.#workspaceId,
        ...ids,
      );
    const result = await this.#run(statement);
    return (result.results ?? []) as TaskFactsRow[];
  }

  /**
   * The latest MEANINGFUL activity per project across the project itself AND its
   * child tasks, via one UNION grouped by project. `MAX(occurred_at)` is idempotent
   * to duplicate activity subjects or repeated links, so neither can inflate a count
   * or produce an incorrect date. Only active `task.belongs_to_project` links map a
   * task's activity to its project, AND the task entity must still be active — a
   * soft-deleted task retains its structural parent link (for a faithful restore), so
   * the entity join is what keeps its historical activity from inflating project
   * momentum (matching the task-facts query's `te.deleted_at IS NULL`).
   */
  async #runActivityFacts(
    ids: readonly string[],
    placeholders: string,
  ): Promise<ActivityFactsRow[]> {
    const statement = this.#db
      .prepare(
        `SELECT project_id, MAX(occurred_at) AS last_at
         FROM (
           SELECT s.entity_id AS project_id, a.occurred_at AS occurred_at
           FROM activities a
           JOIN activity_subjects s
             ON s.workspace_id = a.workspace_id AND s.activity_id = a.id
           WHERE a.workspace_id = ? AND a.type IN (${MEANINGFUL_TYPE_LIST})
                 AND s.entity_id IN (${placeholders})
           UNION ALL
           SELECT tl.target_entity_id AS project_id, a.occurred_at AS occurred_at
           FROM activities a
           JOIN activity_subjects s
             ON s.workspace_id = a.workspace_id AND s.activity_id = a.id
           JOIN entities te
             ON te.workspace_id = a.workspace_id AND te.id = s.entity_id
                AND te.type = '${TASK}' AND te.deleted_at IS NULL
           JOIN entity_links tl
             ON tl.workspace_id = a.workspace_id AND tl.source_entity_id = s.entity_id
                AND tl.type = '${TASK_BELONGS_TO_PROJECT}' AND tl.deleted_at IS NULL
           WHERE a.workspace_id = ? AND a.type IN (${MEANINGFUL_TYPE_LIST})
                 AND tl.target_entity_id IN (${placeholders})
         )
         GROUP BY project_id`,
      )
      .bind(this.#workspaceId, ...ids, this.#workspaceId, ...ids);
    const result = await this.#run(statement);
    return (result.results ?? []) as ActivityFactsRow[];
  }

  async #run(statement: D1PreparedStatement): Promise<D1Result> {
    return statement.all();
  }
}
