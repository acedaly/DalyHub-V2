/**
 * AREA-01 Areas — D1 implementation of the workspace-bound read projection.
 *
 * This adapter is read-only and storage-specific. It resolves Area collection and
 * record facts directly from the FND-07 spine tables (`entities`, `spine_records`
 * and structural `entity_links`) plus the existing project-details slice for
 * reversible project archival/status. All statements are workspace-scoped and
 * parameterised; structural type literals are trusted kernel constants. Mutations
 * stay with `SpineRepository`.
 */

import {
  AREA,
  GOAL,
  GOAL_BELONGS_TO_AREA,
  PROJECT,
  PROJECT_ADVANCES_GOAL,
  PROJECT_BELONGS_TO_AREA,
  TASK,
  TASK_BELONGS_TO_AREA,
  TASK_BELONGS_TO_PROJECT,
  validateSpineId,
  validateSpineLimit,
  type AreaRollup,
  type CompletionRollup,
} from "~/kernel/spine";
import {
  AreaStorageError,
  decodeAreaCursorForScope,
  encodeAreaCursor,
  type AreaAlignedProjectFact,
  type AreaCursorScope,
  type AreaGoalItem,
  type AreaGoalPage,
  type AreaListItem,
  type AreaListPage,
  type AreaMomentumSourceFacts,
  type AreaOverview,
  type AreaProjectItem,
  type AreaProjectPage,
  type AreaRepository,
} from "~/kernel/areas";
import { parseProjectWorkflowStatus } from "~/kernel/project-settings";
import type { WorkspaceContext } from "~/kernel/workspaces";
import { parseWorkspaceId } from "~/kernel/workspaces";

import { fromStorageTimestamp } from "./database";

const EFFECTIVE_PROJECT_UPDATED_AT_EXPR =
  "(CASE WHEN pd.updated_at IS NOT NULL AND pd.updated_at > e.updated_at THEN pd.updated_at ELSE e.updated_at END)";

interface AreaRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly title: string;
  readonly created_at: string;
  readonly updated_at: string;
}

interface AreaListRow extends AreaRow {
  readonly goal_total: number | null;
  readonly goal_completed: number | null;
  readonly project_total: number | null;
  readonly project_completed: number | null;
  readonly active_project_count: number | null;
  readonly completed_project_count: number | null;
  readonly task_total: number | null;
  readonly task_completed: number | null;
}

interface AreaGoalRow {
  readonly id: string;
  readonly title: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly completed_at: string | null;
  readonly project_total: number | null;
  readonly project_completed: number | null;
  readonly task_total: number | null;
  readonly task_completed: number | null;
  /** AREA-02: batched via a `LEFT JOIN` against `goal_details` in the SAME
   * query — never a per-Goal follow-up read. */
  readonly target_date: string | null;
}

interface AreaProjectRow {
  readonly id: string;
  readonly title: string;
  readonly created_at: string;
  readonly effective_updated_at: string;
  readonly completed_at: string | null;
  readonly status: string;
  readonly archived_at: string | null;
  readonly parent_kind: "area" | "goal";
  readonly goal_id: string | null;
  readonly goal_title: string | null;
  readonly task_total: number | null;
  readonly task_completed: number | null;
}

interface AreaAlignedProjectFactRow {
  readonly id: string;
  readonly created_at: string;
  readonly effective_updated_at: string;
  readonly completed_at: string | null;
  readonly status: string;
  readonly archived_at: string | null;
}

interface AreaDirectTaskFactsRow {
  readonly unfinished_total: number | null;
  readonly completed_total: number | null;
}

function rollup(completed: number, total: number): CompletionRollup {
  return {
    total,
    completed,
    ratio: total === 0 ? null : completed / total,
  };
}

function areaRollup(row: {
  readonly goal_total: number | null;
  readonly goal_completed: number | null;
  readonly project_total: number | null;
  readonly project_completed: number | null;
  readonly task_total: number | null;
  readonly task_completed: number | null;
}): AreaRollup {
  const goalsTotal = Number(row.goal_total ?? 0);
  const goalsCompleted = Number(row.goal_completed ?? 0);
  const projectsTotal = Number(row.project_total ?? 0);
  const projectsCompleted = Number(row.project_completed ?? 0);
  const tasksTotal = Number(row.task_total ?? 0);
  const tasksCompleted = Number(row.task_completed ?? 0);
  return {
    kind: "area",
    goals: rollup(goalsCompleted, goalsTotal),
    projects: rollup(projectsCompleted, projectsTotal),
    tasks: rollup(tasksCompleted, tasksTotal),
  };
}

export class D1AreaRepository implements AreaRepository {
  readonly #db: D1Database;
  readonly #workspaceId: string;

  constructor(db: D1Database, context: WorkspaceContext) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
  }

  async listAreas(
    input: { limit?: number; cursor?: string } = {},
  ): Promise<AreaListPage> {
    const limit = validateSpineLimit(input.limit);
    const scope: AreaCursorScope = {
      workspaceId: this.#workspaceId,
      kind: "areas",
      areaId: null,
    };
    const cursorParams: string[] = [];
    const cursorClause =
      input.cursor !== undefined
        ? (() => {
            const position = decodeAreaCursorForScope(input.cursor, scope);
            cursorParams.push(
              position.createdAt,
              position.createdAt,
              position.id,
            );
            return " AND (e.created_at > ? OR (e.created_at = ? AND e.id > ?))";
          })()
        : "";
    const fetchLimit = limit + 1;
    const result = await this.#run(
      this.#db
        .prepare(
          `WITH
           active_goals AS (
             SELECT gl.target_entity_id AS area_id, ge.id AS goal_id
             FROM entity_links gl
             JOIN entities ge
               ON ge.workspace_id = gl.workspace_id AND ge.id = gl.source_entity_id
                  AND ge.type = '${GOAL}' AND ge.deleted_at IS NULL
             WHERE gl.workspace_id = ? AND gl.type = '${GOAL_BELONGS_TO_AREA}'
                   AND gl.deleted_at IS NULL
           ),
           goal_counts AS (
             SELECT ag.area_id,
                    COUNT(*) AS total,
                    SUM(CASE WHEN gsr.completed_at IS NOT NULL THEN 1 ELSE 0 END) AS completed
             FROM active_goals ag
             JOIN spine_records gsr
               ON gsr.workspace_id = ? AND gsr.entity_id = ag.goal_id
             GROUP BY ag.area_id
           ),
           active_projects AS (
             SELECT pl.target_entity_id AS area_id, pe.id AS project_id
             FROM entity_links pl
             JOIN entities pe
               ON pe.workspace_id = pl.workspace_id AND pe.id = pl.source_entity_id
                  AND pe.type = '${PROJECT}' AND pe.deleted_at IS NULL
             WHERE pl.workspace_id = ? AND pl.type = '${PROJECT_BELONGS_TO_AREA}'
                   AND pl.deleted_at IS NULL
             UNION
             SELECT ag.area_id, pe.id AS project_id
             FROM active_goals ag
             JOIN entity_links pg
               ON pg.workspace_id = ? AND pg.target_entity_id = ag.goal_id
                  AND pg.type = '${PROJECT_ADVANCES_GOAL}' AND pg.deleted_at IS NULL
             JOIN entities pe
               ON pe.workspace_id = pg.workspace_id AND pe.id = pg.source_entity_id
                  AND pe.type = '${PROJECT}' AND pe.deleted_at IS NULL
           ),
           project_counts AS (
             SELECT ap.area_id,
                    COUNT(*) AS total,
                    SUM(CASE WHEN psr.completed_at IS NOT NULL THEN 1 ELSE 0 END) AS completed,
                    SUM(CASE WHEN psr.completed_at IS NULL AND pd.archived_at IS NULL THEN 1 ELSE 0 END) AS active_count,
                    SUM(CASE WHEN psr.completed_at IS NOT NULL THEN 1 ELSE 0 END) AS completed_count
             FROM active_projects ap
             JOIN spine_records psr
               ON psr.workspace_id = ? AND psr.entity_id = ap.project_id
             LEFT JOIN project_details pd
               ON pd.workspace_id = ? AND pd.entity_id = ap.project_id
             GROUP BY ap.area_id
           ),
           area_tasks AS (
             SELECT tl.target_entity_id AS area_id, te.id AS task_id
             FROM entity_links tl
             JOIN entities te
               ON te.workspace_id = tl.workspace_id AND te.id = tl.source_entity_id
                  AND te.type = '${TASK}' AND te.deleted_at IS NULL
             WHERE tl.workspace_id = ? AND tl.type = '${TASK_BELONGS_TO_AREA}'
                   AND tl.deleted_at IS NULL
             UNION
             SELECT ap.area_id, te.id AS task_id
             FROM active_projects ap
             JOIN entity_links tl
               ON tl.workspace_id = ? AND tl.target_entity_id = ap.project_id
                  AND tl.type = '${TASK_BELONGS_TO_PROJECT}' AND tl.deleted_at IS NULL
             JOIN entities te
               ON te.workspace_id = tl.workspace_id AND te.id = tl.source_entity_id
                  AND te.type = '${TASK}' AND te.deleted_at IS NULL
           ),
           task_counts AS (
             SELECT at.area_id,
                    COUNT(*) AS total,
                    SUM(CASE WHEN tsr.completed_at IS NOT NULL THEN 1 ELSE 0 END) AS completed
             FROM area_tasks at
             JOIN spine_records tsr
               ON tsr.workspace_id = ? AND tsr.entity_id = at.task_id
             GROUP BY at.area_id
           )
           SELECT e.id, e.workspace_id, e.title, e.created_at, e.updated_at,
                  COALESCE(gc.total, 0) AS goal_total,
                  COALESCE(gc.completed, 0) AS goal_completed,
                  COALESCE(pc.total, 0) AS project_total,
                  COALESCE(pc.completed, 0) AS project_completed,
                  COALESCE(pc.active_count, 0) AS active_project_count,
                  COALESCE(pc.completed_count, 0) AS completed_project_count,
                  COALESCE(tc.total, 0) AS task_total,
                  COALESCE(tc.completed, 0) AS task_completed
           FROM entities e
           JOIN spine_records sr
             ON sr.workspace_id = e.workspace_id AND sr.entity_id = e.id
           LEFT JOIN goal_counts gc ON gc.area_id = e.id
           LEFT JOIN project_counts pc ON pc.area_id = e.id
           LEFT JOIN task_counts tc ON tc.area_id = e.id
           WHERE e.workspace_id = ? AND e.type = '${AREA}' AND e.deleted_at IS NULL${cursorClause}
           ORDER BY e.created_at ASC, e.id ASC
           LIMIT ?`,
        )
        .bind(
          this.#workspaceId,
          this.#workspaceId,
          this.#workspaceId,
          this.#workspaceId,
          this.#workspaceId,
          this.#workspaceId,
          this.#workspaceId,
          this.#workspaceId,
          this.#workspaceId,
          this.#workspaceId,
          ...cursorParams,
          fetchLimit,
        ),
    );
    const rows = (result.results ?? []) as AreaListRow[];
    const pageRows = rows.length > limit ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];
    const nextCursor =
      rows.length > limit && last
        ? encodeAreaCursor(scope, { createdAt: last.created_at, id: last.id })
        : null;
    return {
      items: pageRows.map((row) => this.#toAreaListItem(row)),
      nextCursor,
    };
  }

  async getAreaOverview(id: string): Promise<AreaOverview | null> {
    const areaId = validateSpineId(id, "id");
    const result = await this.#run(
      this.#db
        .prepare(
          `SELECT e.id, e.workspace_id, e.title, e.created_at, e.updated_at
           FROM entities e
           JOIN spine_records sr
             ON sr.workspace_id = e.workspace_id AND sr.entity_id = e.id
           WHERE e.workspace_id = ? AND e.id = ? AND e.type = '${AREA}'
                 AND e.deleted_at IS NULL
           LIMIT 1`,
        )
        .bind(this.#workspaceId, areaId),
    );
    const row = ((result.results ?? []) as AreaRow[])[0];
    return row ? this.#toAreaOverview(row) : null;
  }

  async listAreaGoals(input: {
    areaId: string;
    limit?: number;
    cursor?: string;
  }): Promise<AreaGoalPage> {
    const areaId = validateSpineId(input.areaId, "id");
    const limit = validateSpineLimit(input.limit);
    const scope: AreaCursorScope = {
      workspaceId: this.#workspaceId,
      kind: "goals",
      areaId,
    };
    const cursorParams: string[] = [];
    const cursorClause =
      input.cursor !== undefined
        ? (() => {
            const position = decodeAreaCursorForScope(input.cursor, scope);
            cursorParams.push(
              position.createdAt,
              position.createdAt,
              position.id,
            );
            return " AND (ge.created_at > ? OR (ge.created_at = ? AND ge.id > ?))";
          })()
        : "";
    const fetchLimit = limit + 1;
    const result = await this.#run(
      this.#db
        .prepare(
          `WITH goal_projects AS (
             SELECT pg.target_entity_id AS goal_id, pe.id AS project_id
             FROM entity_links pg
             JOIN entities pe
               ON pe.workspace_id = pg.workspace_id AND pe.id = pg.source_entity_id
                  AND pe.type = '${PROJECT}' AND pe.deleted_at IS NULL
             WHERE pg.workspace_id = ? AND pg.type = '${PROJECT_ADVANCES_GOAL}'
                   AND pg.deleted_at IS NULL
           ),
           project_counts AS (
             SELECT gp.goal_id,
                    COUNT(*) AS total,
                    SUM(CASE WHEN psr.completed_at IS NOT NULL THEN 1 ELSE 0 END) AS completed
             FROM goal_projects gp
             JOIN spine_records psr
               ON psr.workspace_id = ? AND psr.entity_id = gp.project_id
             GROUP BY gp.goal_id
           ),
           goal_tasks AS (
             SELECT gp.goal_id, te.id AS task_id
             FROM goal_projects gp
             JOIN entity_links tl
               ON tl.workspace_id = ? AND tl.target_entity_id = gp.project_id
                  AND tl.type = '${TASK_BELONGS_TO_PROJECT}' AND tl.deleted_at IS NULL
             JOIN entities te
               ON te.workspace_id = tl.workspace_id AND te.id = tl.source_entity_id
                  AND te.type = '${TASK}' AND te.deleted_at IS NULL
           ),
           task_counts AS (
             SELECT gt.goal_id,
                    COUNT(*) AS total,
                    SUM(CASE WHEN tsr.completed_at IS NOT NULL THEN 1 ELSE 0 END) AS completed
             FROM goal_tasks gt
             JOIN spine_records tsr
               ON tsr.workspace_id = ? AND tsr.entity_id = gt.task_id
             GROUP BY gt.goal_id
           )
           SELECT ge.id, ge.title, ge.created_at, ge.updated_at, gsr.completed_at,
                  COALESCE(pc.total, 0) AS project_total,
                  COALESCE(pc.completed, 0) AS project_completed,
                  COALESCE(tc.total, 0) AS task_total,
                  COALESCE(tc.completed, 0) AS task_completed,
                  gd.target_date AS target_date
           FROM entity_links gl
           JOIN entities ge
             ON ge.workspace_id = gl.workspace_id AND ge.id = gl.source_entity_id
                AND ge.type = '${GOAL}' AND ge.deleted_at IS NULL
           JOIN spine_records gsr
             ON gsr.workspace_id = ge.workspace_id AND gsr.entity_id = ge.id
           LEFT JOIN project_counts pc ON pc.goal_id = ge.id
           LEFT JOIN task_counts tc ON tc.goal_id = ge.id
           LEFT JOIN goal_details gd
             ON gd.workspace_id = ge.workspace_id AND gd.entity_id = ge.id
           WHERE gl.workspace_id = ? AND gl.type = '${GOAL_BELONGS_TO_AREA}'
                 AND gl.deleted_at IS NULL AND gl.target_entity_id = ?${cursorClause}
           ORDER BY ge.created_at ASC, ge.id ASC
           LIMIT ?`,
        )
        .bind(
          this.#workspaceId,
          this.#workspaceId,
          this.#workspaceId,
          this.#workspaceId,
          this.#workspaceId,
          areaId,
          ...cursorParams,
          fetchLimit,
        ),
    );
    const rows = (result.results ?? []) as AreaGoalRow[];
    const pageRows = rows.length > limit ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];
    const nextCursor =
      rows.length > limit && last
        ? encodeAreaCursor(scope, { createdAt: last.created_at, id: last.id })
        : null;
    return {
      items: pageRows.map((row) => this.#toGoalItem(row)),
      nextCursor,
    };
  }

  async listAreaProjects(input: {
    areaId: string;
    limit?: number;
    cursor?: string;
  }): Promise<AreaProjectPage> {
    const areaId = validateSpineId(input.areaId, "id");
    const limit = validateSpineLimit(input.limit);
    const scope: AreaCursorScope = {
      workspaceId: this.#workspaceId,
      kind: "projects",
      areaId,
    };
    const cursorParams: string[] = [];
    const cursorClause =
      input.cursor !== undefined
        ? (() => {
            const position = decodeAreaCursorForScope(input.cursor, scope);
            cursorParams.push(
              position.createdAt,
              position.createdAt,
              position.id,
            );
            return " AND (e.created_at > ? OR (e.created_at = ? AND e.id > ?))";
          })()
        : "";
    const fetchLimit = limit + 1;
    const result = await this.#run(
      this.#db
        .prepare(
          `WITH area_projects AS (
             SELECT pe.id AS project_id,
                    'area' AS parent_kind,
                    NULL AS goal_id,
                    NULL AS goal_title
             FROM entity_links pl
             JOIN entities pe
               ON pe.workspace_id = pl.workspace_id AND pe.id = pl.source_entity_id
                  AND pe.type = '${PROJECT}' AND pe.deleted_at IS NULL
             WHERE pl.workspace_id = ? AND pl.type = '${PROJECT_BELONGS_TO_AREA}'
                   AND pl.deleted_at IS NULL AND pl.target_entity_id = ?
             UNION
             SELECT pe.id AS project_id,
                    'goal' AS parent_kind,
                    ge.id AS goal_id,
                    ge.title AS goal_title
             FROM entity_links gl
             JOIN entities ge
               ON ge.workspace_id = gl.workspace_id AND ge.id = gl.source_entity_id
                  AND ge.type = '${GOAL}' AND ge.deleted_at IS NULL
             JOIN entity_links pg
               ON pg.workspace_id = ge.workspace_id AND pg.target_entity_id = ge.id
                  AND pg.type = '${PROJECT_ADVANCES_GOAL}' AND pg.deleted_at IS NULL
             JOIN entities pe
               ON pe.workspace_id = pg.workspace_id AND pe.id = pg.source_entity_id
                  AND pe.type = '${PROJECT}' AND pe.deleted_at IS NULL
             WHERE gl.workspace_id = ? AND gl.type = '${GOAL_BELONGS_TO_AREA}'
                   AND gl.deleted_at IS NULL AND gl.target_entity_id = ?
           ),
           task_counts AS (
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
           )
           SELECT e.id, e.title, e.created_at,
                  ${EFFECTIVE_PROJECT_UPDATED_AT_EXPR} AS effective_updated_at,
                  sr.completed_at,
                  COALESCE(pd.status, 'planned') AS status,
                  pd.archived_at,
                  ap.parent_kind,
                  ap.goal_id,
                  ap.goal_title,
                  COALESCE(tc.total, 0) AS task_total,
                  COALESCE(tc.completed, 0) AS task_completed
           FROM area_projects ap
           JOIN entities e
             ON e.workspace_id = ? AND e.id = ap.project_id
                AND e.type = '${PROJECT}' AND e.deleted_at IS NULL
           JOIN spine_records sr
             ON sr.workspace_id = e.workspace_id AND sr.entity_id = e.id
           LEFT JOIN project_details pd
             ON pd.workspace_id = e.workspace_id AND pd.entity_id = e.id
           LEFT JOIN task_counts tc ON tc.project_id = e.id
           WHERE 1 = 1${cursorClause}
           ORDER BY e.created_at ASC, e.id ASC
           LIMIT ?`,
        )
        .bind(
          this.#workspaceId,
          areaId,
          this.#workspaceId,
          areaId,
          this.#workspaceId,
          this.#workspaceId,
          ...cursorParams,
          fetchLimit,
        ),
    );
    const rows = (result.results ?? []) as AreaProjectRow[];
    const pageRows = rows.length > limit ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];
    const nextCursor =
      rows.length > limit && last
        ? encodeAreaCursor(scope, { createdAt: last.created_at, id: last.id })
        : null;
    return {
      items: pageRows.map((row) => this.#toProjectItem(row)),
      nextCursor,
    };
  }

  /**
   * The COMPLETE Area momentum-facts boundary. Unlike `listAreaProjects`, this
   * NEVER paginates: it reads every Project aligned to the Area (direct or
   * Goal-backed) so an at-risk/blocked/stale active Project past the bounded card
   * page still reaches the momentum evaluator. Two workspace-scoped, parameterised
   * aggregate queries — direct Area Task counts and the complete aligned-Project
   * list — run concurrently; neither is a query per Project.
   */
  async getAreaMomentumFacts(areaId: string): Promise<AreaMomentumSourceFacts> {
    const id = validateSpineId(areaId, "id");
    const [directTasks, projects] = await Promise.all([
      this.#selectDirectAreaTaskFacts(id),
      this.#selectAlignedProjectFacts(id),
    ]);
    return { directTasks, projects };
  }

  async #selectDirectAreaTaskFacts(
    areaId: string,
  ): Promise<AreaMomentumSourceFacts["directTasks"]> {
    const result = await this.#run(
      this.#db
        .prepare(
          `SELECT
             SUM(CASE WHEN tsr.completed_at IS NULL THEN 1 ELSE 0 END) AS unfinished_total,
             SUM(CASE WHEN tsr.completed_at IS NOT NULL THEN 1 ELSE 0 END) AS completed_total
           FROM entity_links tl
           JOIN entities te
             ON te.workspace_id = tl.workspace_id AND te.id = tl.source_entity_id
                AND te.type = '${TASK}' AND te.deleted_at IS NULL
           JOIN spine_records tsr
             ON tsr.workspace_id = te.workspace_id AND tsr.entity_id = te.id
           WHERE tl.workspace_id = ? AND tl.type = '${TASK_BELONGS_TO_AREA}'
                 AND tl.deleted_at IS NULL AND tl.target_entity_id = ?`,
        )
        .bind(this.#workspaceId, areaId),
    );
    const row = ((result.results ?? []) as AreaDirectTaskFactsRow[])[0];
    return {
      unfinishedTotal: Number(row?.unfinished_total ?? 0),
      completedTotal: Number(row?.completed_total ?? 0),
    };
  }

  async #selectAlignedProjectFacts(
    areaId: string,
  ): Promise<readonly AreaAlignedProjectFact[]> {
    const result = await this.#run(
      this.#db
        .prepare(
          `WITH area_projects AS (
             SELECT pe.id AS project_id
             FROM entity_links pl
             JOIN entities pe
               ON pe.workspace_id = pl.workspace_id AND pe.id = pl.source_entity_id
                  AND pe.type = '${PROJECT}' AND pe.deleted_at IS NULL
             WHERE pl.workspace_id = ? AND pl.type = '${PROJECT_BELONGS_TO_AREA}'
                   AND pl.deleted_at IS NULL AND pl.target_entity_id = ?
             UNION
             SELECT pe.id AS project_id
             FROM entity_links gl
             JOIN entities ge
               ON ge.workspace_id = gl.workspace_id AND ge.id = gl.source_entity_id
                  AND ge.type = '${GOAL}' AND ge.deleted_at IS NULL
             JOIN entity_links pg
               ON pg.workspace_id = ge.workspace_id AND pg.target_entity_id = ge.id
                  AND pg.type = '${PROJECT_ADVANCES_GOAL}' AND pg.deleted_at IS NULL
             JOIN entities pe
               ON pe.workspace_id = pg.workspace_id AND pe.id = pg.source_entity_id
                  AND pe.type = '${PROJECT}' AND pe.deleted_at IS NULL
             WHERE gl.workspace_id = ? AND gl.type = '${GOAL_BELONGS_TO_AREA}'
                   AND gl.deleted_at IS NULL AND gl.target_entity_id = ?
           )
           SELECT e.id, e.created_at,
                  ${EFFECTIVE_PROJECT_UPDATED_AT_EXPR} AS effective_updated_at,
                  sr.completed_at,
                  COALESCE(pd.status, 'planned') AS status,
                  pd.archived_at
           FROM area_projects ap
           JOIN entities e
             ON e.workspace_id = ? AND e.id = ap.project_id
                AND e.type = '${PROJECT}' AND e.deleted_at IS NULL
           JOIN spine_records sr
             ON sr.workspace_id = e.workspace_id AND sr.entity_id = e.id
           LEFT JOIN project_details pd
             ON pd.workspace_id = e.workspace_id AND pd.entity_id = e.id`,
        )
        .bind(
          this.#workspaceId,
          areaId,
          this.#workspaceId,
          areaId,
          this.#workspaceId,
        ),
    );
    const rows = (result.results ?? []) as AreaAlignedProjectFactRow[];
    return rows.map((row) => this.#toAlignedProjectFact(row));
  }

  #toAlignedProjectFact(
    row: AreaAlignedProjectFactRow,
  ): AreaAlignedProjectFact {
    return {
      id: row.id,
      status: this.#parseStatus(row.status),
      completedAt:
        row.completed_at === null
          ? null
          : fromStorageTimestamp(row.completed_at),
      archivedAt:
        row.archived_at === null ? null : fromStorageTimestamp(row.archived_at),
      createdAt: fromStorageTimestamp(row.created_at),
      updatedAt: fromStorageTimestamp(row.effective_updated_at),
    };
  }

  #toAreaOverview(row: AreaRow): AreaOverview {
    return {
      id: row.id,
      workspaceId: parseWorkspaceId(row.workspace_id),
      title: row.title,
      createdAt: fromStorageTimestamp(row.created_at),
      updatedAt: fromStorageTimestamp(row.updated_at),
    };
  }

  #toAreaListItem(row: AreaListRow): AreaListItem {
    return {
      ...this.#toAreaOverview(row),
      rollup: areaRollup(row),
      activeProjectCount: Number(row.active_project_count ?? 0),
      completedProjectCount: Number(row.completed_project_count ?? 0),
    };
  }

  #toGoalItem(row: AreaGoalRow): AreaGoalItem {
    return {
      id: row.id,
      title: row.title,
      createdAt: fromStorageTimestamp(row.created_at),
      updatedAt: fromStorageTimestamp(row.updated_at),
      completedAt:
        row.completed_at === null
          ? null
          : fromStorageTimestamp(row.completed_at),
      projectTotal: Number(row.project_total ?? 0),
      projectCompleted: Number(row.project_completed ?? 0),
      taskTotal: Number(row.task_total ?? 0),
      taskCompleted: Number(row.task_completed ?? 0),
      targetDate: row.target_date ?? null,
    };
  }

  #toProjectItem(row: AreaProjectRow): AreaProjectItem {
    return {
      id: row.id,
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
      parent:
        row.parent_kind === "goal" &&
        row.goal_id !== null &&
        row.goal_title !== null
          ? { kind: "goal", goal: { id: row.goal_id, title: row.goal_title } }
          : { kind: "area" },
      taskTotal: Number(row.task_total ?? 0),
      taskCompleted: Number(row.task_completed ?? 0),
    };
  }

  #parseStatus(
    value: string,
  ): import("~/kernel/project-settings").ProjectWorkflowStatus {
    try {
      return parseProjectWorkflowStatus(value);
    } catch (cause) {
      throw new AreaStorageError(undefined, { cause });
    }
  }

  async #run(statement: D1PreparedStatement): Promise<D1Result> {
    try {
      return await statement.all();
    } catch (cause) {
      throw new AreaStorageError(undefined, { cause });
    }
  }
}
