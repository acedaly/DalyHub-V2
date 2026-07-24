/**
 * AREA-02 Goals — D1 implementation of the workspace-bound read projection.
 *
 * Read-only and storage-specific, resolving Goal record facts directly from the
 * FND-07 spine tables (`entities`, `spine_records`, structural `entity_links`)
 * plus the existing `project_details` slice for workflow status/archival —
 * mirroring `~/platform/storage/d1/d1-area-repository.ts`. All statements are
 * workspace-scoped and parameterised; structural type literals are trusted
 * kernel constants. Mutations stay with `SpineRepository`.
 */

import {
  AREA,
  GOAL,
  GOAL_BELONGS_TO_AREA,
  PROJECT,
  PROJECT_ADVANCES_GOAL,
  TASK,
  TASK_BELONGS_TO_PROJECT,
  validateSpineId,
  validateSpineLimit,
} from "~/kernel/spine";
import {
  decodeGoalCursorForScope,
  encodeGoalCursor,
  evaluateGoalProjectContribution,
  GoalStorageError,
  type GoalChildrenInput,
  type GoalCursorScope,
  type GoalOverview,
  type GoalProjectContribution,
  type GoalProjectFact,
  type GoalProjectItem,
  type GoalProjectPage,
  type GoalRepository,
} from "~/kernel/goals";
import { parseProjectWorkflowStatus } from "~/kernel/project-settings";
import { parseWorkspaceId, type WorkspaceContext } from "~/kernel/workspaces";

import { fromStorageTimestamp } from "./database";

/**
 * The authoritative PRESENTATION timestamp expression (mirrors ADR-037 §37.2 for
 * Projects): the later of the spine entity's `updated_at` and `goal_details.updated_at`.
 * A target-date/definition-of-done edit touches ONLY `goal_details.updated_at` (the
 * spine's `entities.updated_at` is reserved for identity/title — ADR-014), so without
 * this MAX the Activity tab's `reloadKey` would never notice a details-only edit. ISO-8601
 * UTC strings compare correctly lexicographically.
 */
const EFFECTIVE_UPDATED_AT_EXPR =
  "(CASE WHEN gd.updated_at IS NOT NULL AND gd.updated_at > ge.updated_at THEN gd.updated_at ELSE ge.updated_at END)";

interface GoalOverviewRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly title: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly effective_updated_at: string;
  readonly area_id: string;
  readonly area_title: string;
  readonly completed_at: string | null;
}

interface GoalProjectFactRow {
  readonly id: string;
  readonly status: string;
  readonly completed_at: string | null;
  readonly archived_at: string | null;
}

interface GoalProjectRow {
  readonly id: string;
  readonly title: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly completed_at: string | null;
  readonly status: string;
  readonly archived_at: string | null;
  readonly task_total: number | null;
  readonly task_completed: number | null;
}

export class D1GoalRepository implements GoalRepository {
  readonly #db: D1Database;
  readonly #workspaceId: string;

  constructor(db: D1Database, context: WorkspaceContext) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
  }

  async getGoalOverview(id: string): Promise<GoalOverview | null> {
    const goalId = validateSpineId(id, "id");
    const result = await this.#run(
      this.#db
        .prepare(
          `SELECT ge.id, ge.workspace_id, ge.title, ge.created_at, ge.updated_at,
                  ${EFFECTIVE_UPDATED_AT_EXPR} AS effective_updated_at,
                  gsr.completed_at, ae.id AS area_id, ae.title AS area_title
           FROM entity_links gl
           JOIN entities ge
             ON ge.workspace_id = gl.workspace_id AND ge.id = gl.source_entity_id
                AND ge.type = '${GOAL}' AND ge.deleted_at IS NULL
           JOIN spine_records gsr
             ON gsr.workspace_id = ge.workspace_id AND gsr.entity_id = ge.id
           LEFT JOIN goal_details gd
             ON gd.workspace_id = ge.workspace_id AND gd.entity_id = ge.id
           JOIN entities ae
             ON ae.workspace_id = gl.workspace_id AND ae.id = gl.target_entity_id
                AND ae.type = '${AREA}' AND ae.deleted_at IS NULL
           WHERE gl.workspace_id = ? AND gl.type = '${GOAL_BELONGS_TO_AREA}'
                 AND gl.deleted_at IS NULL AND ge.id = ?
           LIMIT 1`,
        )
        .bind(this.#workspaceId, goalId),
    );
    const row = ((result.results ?? []) as GoalOverviewRow[])[0];
    return row ? this.#toGoalOverview(row) : null;
  }

  async getGoalProjectContribution(
    goalId: string,
  ): Promise<GoalProjectContribution> {
    const id = validateSpineId(goalId, "id");
    const facts = await this.#selectGoalProjectFacts(id);
    return evaluateGoalProjectContribution(facts);
  }

  async listGoalProjects(input: GoalChildrenInput): Promise<GoalProjectPage> {
    const goalId = validateSpineId(input.goalId, "id");
    const limit = validateSpineLimit(input.limit);
    const scope: GoalCursorScope = { workspaceId: this.#workspaceId, goalId };
    const cursorParams: string[] = [];
    const cursorClause =
      input.cursor !== undefined
        ? (() => {
            const position = decodeGoalCursorForScope(input.cursor!, scope);
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
          `WITH task_counts AS (
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
           SELECT e.id, e.title, e.created_at, e.updated_at, sr.completed_at,
                  COALESCE(pd.status, 'planned') AS status,
                  pd.archived_at,
                  COALESCE(tc.total, 0) AS task_total,
                  COALESCE(tc.completed, 0) AS task_completed
           FROM entity_links pg
           JOIN entities e
             ON e.workspace_id = pg.workspace_id AND e.id = pg.source_entity_id
                AND e.type = '${PROJECT}' AND e.deleted_at IS NULL
           JOIN spine_records sr
             ON sr.workspace_id = e.workspace_id AND sr.entity_id = e.id
           LEFT JOIN project_details pd
             ON pd.workspace_id = e.workspace_id AND pd.entity_id = e.id
           LEFT JOIN task_counts tc ON tc.project_id = e.id
           WHERE pg.workspace_id = ? AND pg.type = '${PROJECT_ADVANCES_GOAL}'
                 AND pg.deleted_at IS NULL AND pg.target_entity_id = ?${cursorClause}
           ORDER BY e.created_at ASC, e.id ASC
           LIMIT ?`,
        )
        .bind(
          this.#workspaceId,
          this.#workspaceId,
          goalId,
          ...cursorParams,
          fetchLimit,
        ),
    );
    const rows = (result.results ?? []) as GoalProjectRow[];
    const pageRows = rows.length > limit ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];
    const nextCursor =
      rows.length > limit && last
        ? encodeGoalCursor(scope, { createdAt: last.created_at, id: last.id })
        : null;
    return {
      items: pageRows.map((row) => this.#toProjectItem(row)),
      nextCursor,
    };
  }

  /**
   * The COMPLETE fact set for every active Project advancing this Goal — no
   * `LIMIT`, one workspace-scoped parameterised query, never one query per
   * Project. A moved, soft-deleted or cross-workspace Project can never appear
   * (the join requires an active `project.advances_goal` link AND an active
   * Project entity in THIS workspace); a direct Area Project never appears
   * (this query only follows `project.advances_goal`, never
   * `project.belongs_to_area`).
   */
  async #selectGoalProjectFacts(
    goalId: string,
  ): Promise<readonly GoalProjectFact[]> {
    const result = await this.#run(
      this.#db
        .prepare(
          `SELECT e.id, COALESCE(pd.status, 'planned') AS status,
                  sr.completed_at, pd.archived_at
           FROM entity_links pg
           JOIN entities e
             ON e.workspace_id = pg.workspace_id AND e.id = pg.source_entity_id
                AND e.type = '${PROJECT}' AND e.deleted_at IS NULL
           JOIN spine_records sr
             ON sr.workspace_id = e.workspace_id AND sr.entity_id = e.id
           LEFT JOIN project_details pd
             ON pd.workspace_id = e.workspace_id AND pd.entity_id = e.id
           WHERE pg.workspace_id = ? AND pg.type = '${PROJECT_ADVANCES_GOAL}'
                 AND pg.deleted_at IS NULL AND pg.target_entity_id = ?`,
        )
        .bind(this.#workspaceId, goalId),
    );
    const rows = (result.results ?? []) as GoalProjectFactRow[];
    return rows.map((row) => ({
      id: row.id,
      status: this.#parseStatus(row.status),
      completedAt:
        row.completed_at === null
          ? null
          : fromStorageTimestamp(row.completed_at),
      archivedAt:
        row.archived_at === null ? null : fromStorageTimestamp(row.archived_at),
    }));
  }

  #toGoalOverview(row: GoalOverviewRow): GoalOverview {
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
      area: { id: row.area_id, title: row.area_title },
    };
  }

  #toProjectItem(row: GoalProjectRow): GoalProjectItem {
    return {
      id: row.id,
      title: row.title,
      createdAt: fromStorageTimestamp(row.created_at),
      updatedAt: fromStorageTimestamp(row.updated_at),
      completedAt:
        row.completed_at === null
          ? null
          : fromStorageTimestamp(row.completed_at),
      status: this.#parseStatus(row.status),
      archivedAt:
        row.archived_at === null ? null : fromStorageTimestamp(row.archived_at),
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
      throw new GoalStorageError(undefined, { cause });
    }
  }

  async #run(statement: D1PreparedStatement): Promise<D1Result> {
    try {
      return await statement.all();
    } catch (cause) {
      throw new GoalStorageError(undefined, { cause });
    }
  }
}
