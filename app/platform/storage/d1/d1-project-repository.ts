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
  ProjectStorageError,
  type ListProjectsInput,
  type ProjectListItem,
  type ProjectListPage,
  type ProjectOverview,
  type ProjectRelation,
  type ProjectRepository,
} from "~/kernel/projects";
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

/** The base project columns selected by both reads. */
const PROJECT_BASE_COLUMNS = `e.id AS id, e.workspace_id AS workspace_id, e.title AS title,
  e.created_at AS created_at, e.updated_at AS updated_at, sr.completed_at AS completed_at`;

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
  readonly completed_at: string | null;
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
    const state = input.state ?? "all";
    const completedClause =
      state === "open"
        ? " AND sr.completed_at IS NULL"
        : state === "completed"
          ? " AND sr.completed_at IS NOT NULL"
          : "";

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
         WHERE e.workspace_id = ? AND e.type = '${PROJECT}' AND e.deleted_at IS NULL${completedClause}
         ORDER BY e.created_at ASC, e.id ASC
         LIMIT ?`,
      )
      .bind(this.#workspaceId, this.#workspaceId, limit);

    const result = await this.#run(statement);
    const rows = (result.results ?? []) as ProjectListRow[];
    return { items: rows.map((row) => this.#toListItem(row)) };
  }

  async getProjectOverview(id: string): Promise<ProjectOverview | null> {
    const projectId = validateSpineId(id, "id");
    const statement = this.#db
      .prepare(
        `SELECT ${PROJECT_BASE_COLUMNS},${PROJECT_RELATION_COLUMNS}
         FROM entities e
         JOIN spine_records sr
           ON sr.workspace_id = e.workspace_id AND sr.entity_id = e.id
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
      updatedAt: fromStorageTimestamp(row.updated_at),
      completedAt:
        row.completed_at === null ? null : fromStorageTimestamp(row.completed_at),
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
      updatedAt: fromStorageTimestamp(row.updated_at),
      completedAt:
        row.completed_at === null ? null : fromStorageTimestamp(row.completed_at),
      area: relations.area,
      goal: relations.goal,
      taskTotal: Number(row.task_total ?? 0),
      taskCompleted: Number(row.task_completed ?? 0),
    };
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
