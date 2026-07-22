/**
 * PROJ-01 Projects — D1 implementation of the workspace-bound read projection.
 *
 * Implements the storage-independent, READ-ONLY `ProjectRepository` over Cloudflare
 * D1 (SQLite) using prepared, parameterised statements only. Constructed with a
 * single `WorkspaceContext`; every statement constrains `workspace_id = ?` with that
 * context's id, and no method accepts a `workspaceId` (ADR-010/ADR-034). No
 * caller-supplied value is ever interpolated into SQL — every value is bound; the
 * project entity type and the structural link types ARE inlined as trusted kernel
 * constants (the same literals the migration pins), never caller data.
 *
 * It performs NO mutations: project identity/completion/parentage stay the
 * SpineRepository's, and the authoritative rollup stays `SpineRepository.getRollup`.
 * This adapter resolves each project's Area/Goal context and active direct-task
 * counts in ONE bounded query per read (no N+1). Task counts use the SAME definition
 * as the spine project rollup — active (non-deleted, non-completed-parent) direct
 * child tasks — computed live, never a cached column.
 */

import {
  GOAL_BELONGS_TO_AREA,
  PROJECT,
  PROJECT_ADVANCES_GOAL,
  PROJECT_BELONGS_TO_AREA,
  TASK,
  TASK_BELONGS_TO_PROJECT,
  validateSpineId,
  validateSpineLimit,
} from "~/kernel/spine";
import {
  decodeProjectCursorForScope,
  encodeProjectCursor,
  ProjectStorageError,
  type ListProjectsInput,
  type ProjectCursorScope,
  type ProjectListItem,
  type ProjectListPage,
  type ProjectOverview,
  type ProjectOrder,
  type ProjectRelation,
  type ProjectRepository,
  type ProjectStateFilter,
} from "~/kernel/projects";
import { parseProjectWorkflowStatus } from "~/kernel/project-settings";
import type { WorkspaceContext } from "~/kernel/workspaces";
import { parseWorkspaceId } from "~/kernel/workspaces";

import { fromStorageTimestamp } from "./database";

/**
 * The LEFT JOINs that resolve a project's Area/Goal context from the structural
 * links (a trusted, constant fragment — every link type is a kernel literal). It
 * requires the driving project entity aliased `e`:
 *   - `pa`/`ae`   — the direct `project.belongs_to_area` link and its Area entity;
 *   - `pg`/`ge`   — the `project.advances_goal` link and its Goal entity;
 *   - `gpa`/`gae` — the Goal's own `goal.belongs_to_area` link and Area entity, so a
 *                   goal-advancing project resolves its Area through its Goal.
 * A project has exactly ONE active structural parent (the partial unique index), so
 * at most one of `pa`/`pg` is present for an active project.
 */
const PROJECT_RELATION_JOINS = `
  LEFT JOIN entity_links pa
    ON pa.workspace_id = e.workspace_id AND pa.source_entity_id = e.id
       AND pa.deleted_at IS NULL AND pa.type = '${PROJECT_BELONGS_TO_AREA}'
  LEFT JOIN entities ae
    ON ae.workspace_id = e.workspace_id AND ae.id = pa.target_entity_id
       AND ae.deleted_at IS NULL
  LEFT JOIN entity_links pg
    ON pg.workspace_id = e.workspace_id AND pg.source_entity_id = e.id
       AND pg.deleted_at IS NULL AND pg.type = '${PROJECT_ADVANCES_GOAL}'
  LEFT JOIN entities ge
    ON ge.workspace_id = e.workspace_id AND ge.id = pg.target_entity_id
       AND ge.deleted_at IS NULL
  LEFT JOIN entity_links gpa
    ON gpa.workspace_id = e.workspace_id AND gpa.source_entity_id = pg.target_entity_id
       AND gpa.deleted_at IS NULL AND gpa.type = '${GOAL_BELONGS_TO_AREA}'
  LEFT JOIN entities gae
    ON gae.workspace_id = e.workspace_id AND gae.id = gpa.target_entity_id
       AND gae.deleted_at IS NULL`;

/** The relation columns selected by both reads. */
const PROJECT_RELATION_COLUMNS = `
  ae.id AS area_id, ae.title AS area_title,
  ge.id AS goal_id, ge.title AS goal_title,
  gae.id AS goal_area_id, gae.title AS goal_area_title`;

/**
 * The authoritative PRESENTATION timestamp expression (ADR-037 §37.2): the later of
 * the spine entity's `updated_at` and the PROJ-05 `project_details.updated_at`. A
 * status change, archive or restore touches ONLY `project_details.updated_at` (the
 * spine's `entities.updated_at` is reserved for identity/title — ADR-014) — so
 * without this MAX, a settings-only transition would never affect "recent" ordering,
 * health staleness or the Activity tab's reload key. ISO-8601 UTC strings compare
 * correctly lexicographically. Used as a raw expression (not just the `AS` alias)
 * because a cursor's keyset predicate is a WHERE clause, where SQLite cannot resolve
 * a SELECT-list alias.
 */
const EFFECTIVE_UPDATED_AT_EXPR =
  "(CASE WHEN pd.updated_at IS NOT NULL AND pd.updated_at > e.updated_at THEN pd.updated_at ELSE e.updated_at END)";

/** The base project columns selected by both reads. */
const PROJECT_BASE_COLUMNS = `e.id AS id, e.workspace_id AS workspace_id, e.title AS title,
  e.created_at AS created_at, e.updated_at AS updated_at,
  ${EFFECTIVE_UPDATED_AT_EXPR} AS effective_updated_at,
  sr.completed_at AS completed_at, COALESCE(pd.status, 'planned') AS status, pd.archived_at AS archived_at`;

interface ProjectRelationRow {
  readonly area_id: string | null;
  readonly area_title: string | null;
  readonly goal_id: string | null;
  readonly goal_title: string | null;
  readonly goal_area_id: string | null;
  readonly goal_area_title: string | null;
}

interface ProjectBaseRow extends ProjectRelationRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly title: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly effective_updated_at: string;
  readonly completed_at: string | null;
  readonly status: string;
  readonly archived_at: string | null;
}

interface ProjectListRow extends ProjectBaseRow {
  readonly task_total: number | null;
  readonly task_completed: number | null;
}

export class D1ProjectRepository implements ProjectRepository {
  readonly #db: D1Database;
  readonly #workspaceId: string;

  constructor(db: D1Database, context: WorkspaceContext) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
  }

  async listProjects(input: ListProjectsInput = {}): Promise<ProjectListPage> {
    const limit = validateSpineLimit(input.limit);
    const state: ProjectStateFilter = input.state ?? "all";
    const order: ProjectOrder = input.orderBy ?? "created";
    // `state` meaning (PROJ-05, documented — ADR-037 / PROJECTS_MODULE.md):
    //   "open"      — non-completed, non-archived.
    //   "completed" — completed, non-archived.
    //   "archived"  — archived only (regardless of completion).
    //   "all"       — every NON-ARCHIVED project (open or completed). Archived
    //                 Projects never leak into this ordinary active-work bucket;
    //                 they are reached only via the dedicated "archived" state.
    const completedClause =
      state === "open"
        ? " AND sr.completed_at IS NULL AND pd.archived_at IS NULL"
        : state === "completed"
          ? " AND sr.completed_at IS NOT NULL AND pd.archived_at IS NULL"
          : state === "archived"
            ? " AND pd.archived_at IS NOT NULL"
            : " AND pd.archived_at IS NULL";
    // An additional, independent exact workflow-status filter (e.g. Today's
    // "Continue working" passes `workflowStatus: "active"` so Planned/On-hold
    // Projects — open but not actively worked — never appear as ordinary active
    // work). `?? 'planned'` mirrors the same default the base columns COALESCE.
    const workflowStatusClause =
      input.workflowStatus !== undefined
        ? " AND COALESCE(pd.status, 'planned') = ?"
        : "";

    // Ordering is a trusted closed set (never caller data). `recent` selects the
    // globally most-recently-updated projects AT the database before the limit, so
    // no recently-updated project beyond a creation-ordered page can be missed.
    // Every ordering carries `e.id` as a deterministic unique tiebreaker so the
    // sequence is TOTAL — a keyset cursor can resume after it without skipping or
    // duplicating a row.
    const sortColumn =
      order === "recent" ? EFFECTIVE_UPDATED_AT_EXPR : "e.created_at";
    const orderClause =
      order === "recent"
        ? `${EFFECTIVE_UPDATED_AT_EXPR} DESC, e.id DESC`
        : "e.created_at ASC, e.id ASC";

    // The cursor is bound to the FULL query scope (workspace + state + order); a
    // cursor issued for a different scope is rejected, never reinterpreted against
    // a different result set. The keyset predicate resumes strictly AFTER the last
    // returned row in the ordering's direction.
    const scope: ProjectCursorScope = {
      workspaceId: this.#workspaceId,
      state,
      workflowStatus: input.workflowStatus ?? null,
      order,
    };
    const conditions: string[] = [];
    const cursorParams: string[] = [];
    if (input.cursor !== undefined) {
      const position = decodeProjectCursorForScope(input.cursor, scope);
      const comparator = order === "recent" ? "<" : ">";
      conditions.push(
        `(${sortColumn} ${comparator} ? OR (${sortColumn} = ? AND e.id ${comparator} ?))`,
      );
      cursorParams.push(position.sortValue, position.sortValue, position.id);
    }
    const cursorClause =
      conditions.length > 0 ? ` AND ${conditions.join(" AND ")}` : "";

    // Fetch one more than the page size: the extra row (if present) proves another
    // page exists WITHOUT a second COUNT query, and is trimmed before returning.
    const fetchLimit = limit + 1;

    // Active direct child-task counts per project, computed once for the whole page
    // (no per-project rollup call). Matches the spine rollup definition: active
    // (non-deleted) tasks linked by an active `task.belongs_to_project` link.
    const statement = this.#db
      .prepare(
        `SELECT ${PROJECT_BASE_COLUMNS},${PROJECT_RELATION_COLUMNS},
                COALESCE(tc.total, 0) AS task_total,
                COALESCE(tc.completed, 0) AS task_completed
         FROM entities e
         JOIN spine_records sr
           ON sr.workspace_id = e.workspace_id AND sr.entity_id = e.id
         LEFT JOIN project_details pd ON pd.workspace_id = e.workspace_id AND pd.entity_id = e.id
         ${PROJECT_RELATION_JOINS}
         LEFT JOIN (
           SELECT tl.target_entity_id AS project_id,
                  COUNT(*) AS total,
                  SUM(CASE WHEN tsr.completed_at IS NOT NULL THEN 1 ELSE 0 END) AS completed
           FROM entity_links tl
           JOIN entities te
             ON te.workspace_id = tl.workspace_id AND te.id = tl.source_entity_id
                AND te.type = '${TASK}' AND te.deleted_at IS NULL
           JOIN spine_records tsr
             ON tsr.workspace_id = te.workspace_id AND tsr.entity_id = te.id
           WHERE tl.workspace_id = ? AND tl.type = '${TASK_BELONGS_TO_PROJECT}'
                 AND tl.deleted_at IS NULL
           GROUP BY tl.target_entity_id
         ) tc ON tc.project_id = e.id
         WHERE e.workspace_id = ? AND e.type = '${PROJECT}' AND e.deleted_at IS NULL${completedClause}${workflowStatusClause}${cursorClause}
         ORDER BY ${orderClause}
         LIMIT ?`,
      )
      .bind(
        this.#workspaceId,
        this.#workspaceId,
        ...(input.workflowStatus !== undefined ? [input.workflowStatus] : []),
        ...cursorParams,
        fetchLimit,
      );

    const result = await this.#run(statement);
    const rows = (result.results ?? []) as ProjectListRow[];

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeProjectCursor(scope, {
            sortValue:
              order === "recent" ? last.effective_updated_at : last.created_at,
            id: last.id,
          })
        : null;

    return { items: pageRows.map((row) => this.#toListItem(row)), nextCursor };
  }

  async getProjectOverview(id: string): Promise<ProjectOverview | null> {
    const projectId = validateSpineId(id, "id");
    const statement = this.#db
      .prepare(
        `SELECT ${PROJECT_BASE_COLUMNS},${PROJECT_RELATION_COLUMNS}
         FROM entities e
         JOIN spine_records sr
           ON sr.workspace_id = e.workspace_id AND sr.entity_id = e.id
         LEFT JOIN project_details pd ON pd.workspace_id = e.workspace_id AND pd.entity_id = e.id
         ${PROJECT_RELATION_JOINS}
         WHERE e.id = ? AND e.workspace_id = ? AND e.type = '${PROJECT}'
               AND e.deleted_at IS NULL
         LIMIT 1`,
      )
      .bind(projectId, this.#workspaceId);

    const result = await this.#run(statement);
    const rows = (result.results ?? []) as ProjectBaseRow[];
    const row = rows[0];
    if (!row) {
      return null;
    }
    const relations = this.#resolveRelations(row);
    return {
      id: row.id,
      workspaceId: parseWorkspaceId(row.workspace_id),
      title: row.title,
      createdAt: fromStorageTimestamp(row.created_at),
      updatedAt: fromStorageTimestamp(row.effective_updated_at),
      completedAt:
        row.completed_at === null
          ? null
          : fromStorageTimestamp(row.completed_at),
      status: this.#parseStatus(row.status),
      archivedAt:
        row.archived_at === null ? null : fromStorageTimestamp(row.archived_at),
      area: relations.area,
      goal: relations.goal,
    };
  }

  #toListItem(row: ProjectListRow): ProjectListItem {
    const relations = this.#resolveRelations(row);
    return {
      id: row.id,
      workspaceId: parseWorkspaceId(row.workspace_id),
      title: row.title,
      createdAt: fromStorageTimestamp(row.created_at),
      updatedAt: fromStorageTimestamp(row.effective_updated_at),
      completedAt:
        row.completed_at === null
          ? null
          : fromStorageTimestamp(row.completed_at),
      status: this.#parseStatus(row.status),
      archivedAt:
        row.archived_at === null ? null : fromStorageTimestamp(row.archived_at),
      area: relations.area,
      goal: relations.goal,
      taskTotal: Number(row.task_total ?? 0),
      taskCompleted: Number(row.task_completed ?? 0),
    };
  }

  /**
   * Parse a persisted `project_details.status` string at the storage boundary
   * (Phase 9 — no unsafe `as` cast from an arbitrary DB string). The column has a DB
   * CHECK constraint restricting it to the three valid values, so a parse failure
   * here means genuinely corrupt state, not caller input — surfaced as a storage
   * error rather than a validation error.
   */
  #parseStatus(
    value: string,
  ): import("~/kernel/project-settings").ProjectWorkflowStatus {
    try {
      return parseProjectWorkflowStatus(value);
    } catch (cause) {
      throw new ProjectStorageError(undefined, { cause });
    }
  }

  /**
   * Resolve a project's Area and Goal from the joined relation columns. The Area is
   * the direct `project.belongs_to_area` target when present, otherwise the Goal's
   * Area (a goal-advancing project). The Goal is present only when the project
   * advances one. Titles are the live current titles — never stored duplicates.
   */
  #resolveRelations(row: ProjectRelationRow): {
    area: ProjectRelation | null;
    goal: ProjectRelation | null;
  } {
    const goal: ProjectRelation | null =
      row.goal_id !== null && row.goal_title !== null
        ? { kind: "goal", id: row.goal_id, title: row.goal_title }
        : null;

    let area: ProjectRelation | null = null;
    if (row.area_id !== null && row.area_title !== null) {
      area = { kind: "area", id: row.area_id, title: row.area_title };
    } else if (row.goal_area_id !== null && row.goal_area_title !== null) {
      area = {
        kind: "area",
        id: row.goal_area_id,
        title: row.goal_area_title,
      };
    }
    return { area, goal };
  }

  /** Run a single read statement, re-typing raw storage failures. */
  async #run(statement: D1PreparedStatement): Promise<D1Result> {
    try {
      return await statement.all();
    } catch (cause) {
      throw new ProjectStorageError(undefined, { cause });
    }
  }
}
