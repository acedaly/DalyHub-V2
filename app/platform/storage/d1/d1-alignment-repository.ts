/**
 * AREA-03 Alignment — D1 implementation of the read-only activity-facts
 * projection (ADR-040).
 *
 * Read-only and storage-specific. Resolves the Task-activity contribution a
 * Goal has received via the ONLY indirect path the spine allows —
 * `Task --task.belongs_to_project--> Project --project.advances_goal--> Goal`
 * (`SPINE_MODEL.md`) — using prepared, parameterised statements only. No
 * caller-supplied value is ever interpolated into SQL: Goal ids, the window
 * boundary and the limit are BOUND; the entity types, the structural link
 * types and the meaningful Activity types ARE inlined as trusted kernel
 * constants (never caller data, mirroring `D1ProjectHealthRepository`).
 *
 * It performs NO mutations and caches NOTHING. `listGoalAlignmentFacts`
 * gathers the COMPLETE aggregate for a whole bounded page of Goals in a
 * fixed number of grouped, chunked queries (never one query per Goal) — the
 * SAME chunking shape `D1ProjectHealthRepository`/`D1GoalRepository`
 * (`listGoalProjectContributions`) already use. `listGoalAlignmentEvidence`
 * is the one query in this file that uses a SQL window function
 * (`ROW_NUMBER() OVER (PARTITION BY ...)`) — deliberately scoped to a SINGLE
 * Goal's bounded evidence read (never the batched collection-page path),
 * so it can rank each contributing Task's most recent qualifying event
 * without a second round trip; it is exercised by a dedicated real-D1 kernel
 * test to confirm platform support.
 */

import {
  type GoalAlignmentActivityFacts,
  type GoalAlignmentEvidencePage,
  type AlignmentRepository,
  type AlignmentWindow,
} from "~/kernel/alignment";
import { MEANINGFUL_HEALTH_ACTIVITY_TYPES } from "~/kernel/project-health";
import {
  PROJECT,
  PROJECT_ADVANCES_GOAL,
  TASK,
  TASK_BELONGS_TO_PROJECT,
  validateSpineId,
} from "~/kernel/spine";
import type { WorkspaceContext } from "~/kernel/workspaces";

import { fromStorageTimestamp } from "./database";

/**
 * The per-query Goal-id chunk size for `listGoalAlignmentFacts`. D1 caps
 * bound variables at 100 per statement; the id set is bound once here (the
 * activity window/workspace binds add only two more), so a chunk of 50 stays
 * comfortably under that limit while gathering a whole page of Goals in a
 * small, FIXED number of statements — never one query per Goal. Mirrors
 * `GOAL_PROJECT_CONTRIBUTION_CHUNK_SIZE`.
 */
const ALIGNMENT_FACTS_CHUNK_SIZE = 50;

/** A hard ceiling on the single-Goal evidence read — a bounded collection
 * page, never an unbounded "load everything". */
const MAX_EVIDENCE_LIMIT = 50;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** The meaningful Activity types as a trusted, inlined SQL list — the SAME
 * vocabulary Project Health already established (ADR-035 §35.4), reused
 * unchanged (ADR-040 §40.3): no second "momentum" classification. */
const MEANINGFUL_TYPE_LIST = MEANINGFUL_HEALTH_ACTIVITY_TYPES.map(
  (type) => `'${type}'`,
).join(", ");

interface AlignmentFactsRow {
  readonly goal_id: string;
  readonly last_at: string | null;
  readonly recent_count: number | null;
}

interface AlignmentEvidenceRow {
  readonly task_id: string;
  readonly task_title: string;
  readonly project_id: string;
  readonly project_title: string;
  readonly activity_type: string;
  readonly occurred_at: string;
}

export class D1AlignmentRepository implements AlignmentRepository {
  readonly #db: D1Database;
  readonly #workspaceId: string;

  constructor(db: D1Database, context: WorkspaceContext) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
  }

  async getGoalAlignmentFacts(
    goalId: string,
    window: AlignmentWindow,
  ): Promise<GoalAlignmentActivityFacts | null> {
    const id = validateSpineId(goalId, "id");
    const facts = await this.listGoalAlignmentFacts([id], window);
    return facts.get(id) ?? null;
  }

  async listGoalAlignmentFacts(
    goalIds: readonly string[],
    window: AlignmentWindow,
  ): Promise<Map<string, GoalAlignmentActivityFacts>> {
    const ids = [...new Set(goalIds.map((id) => validateSpineId(id, "id")))];
    const result = new Map<string, GoalAlignmentActivityFacts>();
    if (ids.length === 0) {
      return result;
    }
    const chunks = chunk(ids, ALIGNMENT_FACTS_CHUNK_SIZE);
    const gathered = await Promise.all(
      chunks.map((idChunk) => this.#selectAlignmentFactsChunk(idChunk, window)),
    );
    for (const rows of gathered) {
      for (const row of rows) {
        result.set(row.goal_id, {
          goalId: row.goal_id,
          recentContributingTaskCount: Number(row.recent_count ?? 0),
          lastContributingActivityAt:
            row.last_at === null ? null : fromStorageTimestamp(row.last_at),
        });
      }
    }
    return result;
  }

  /**
   * ONE workspace-scoped, parameterised query for a bounded chunk of Goal
   * ids: every Task with an active `task.belongs_to_project` link to a
   * Project with an active `project.advances_goal` link to one of the
   * requested Goals, joined to its qualifying (meaningful-type) Activity
   * subject rows, grouped by Goal. `MAX(occurred_at)` and the windowed
   * `COUNT(DISTINCT ...)` are both idempotent to a duplicate subject row, so
   * neither can inflate a count or produce an incorrect date. A Goal id with
   * no qualifying activity is simply absent from the result set.
   */
  async #selectAlignmentFactsChunk(
    goalIds: readonly string[],
    window: AlignmentWindow,
  ): Promise<AlignmentFactsRow[]> {
    const placeholders = goalIds.map(() => "?").join(", ");
    const statement = this.#db
      .prepare(
        `WITH contributing_tasks AS (
           SELECT pg.target_entity_id AS goal_id, te.id AS task_id
           FROM entity_links pg
           JOIN entities pe
             ON pe.workspace_id = pg.workspace_id AND pe.id = pg.source_entity_id
                AND pe.type = '${PROJECT}' AND pe.deleted_at IS NULL
           JOIN entity_links tl
             ON tl.workspace_id = pg.workspace_id AND tl.target_entity_id = pe.id
                AND tl.type = '${TASK_BELONGS_TO_PROJECT}' AND tl.deleted_at IS NULL
           JOIN entities te
             ON te.workspace_id = tl.workspace_id AND te.id = tl.source_entity_id
                AND te.type = '${TASK}' AND te.deleted_at IS NULL
           WHERE pg.workspace_id = ? AND pg.type = '${PROJECT_ADVANCES_GOAL}'
                 AND pg.deleted_at IS NULL
                 AND pg.target_entity_id IN (${placeholders})
         )
         SELECT ct.goal_id AS goal_id,
                MAX(a.occurred_at) AS last_at,
                COUNT(DISTINCT CASE WHEN a.occurred_at >= ? THEN ct.task_id END) AS recent_count
         FROM contributing_tasks ct
         JOIN activity_subjects s
           ON s.workspace_id = ? AND s.entity_id = ct.task_id
         JOIN activities a
           ON a.workspace_id = s.workspace_id AND a.id = s.activity_id
              AND a.type IN (${MEANINGFUL_TYPE_LIST})
         GROUP BY ct.goal_id`,
      )
      .bind(
        this.#workspaceId,
        ...goalIds,
        window.recentWindowStartIso,
        this.#workspaceId,
      );
    const result = await this.#run(statement);
    return (result.results ?? []) as AlignmentFactsRow[];
  }

  async listGoalAlignmentEvidence(
    goalId: string,
    limit: number,
  ): Promise<GoalAlignmentEvidencePage> {
    const id = validateSpineId(goalId, "id");
    const boundedLimit = Math.max(
      1,
      Math.min(Math.trunc(limit) || 1, MAX_EVIDENCE_LIMIT),
    );
    // Fetch one row past the bound — the same "fetch limit+1" pattern every
    // cursor-paginated collection in this codebase uses — so `hasMore` is
    // exact without a separate COUNT query.
    const fetchLimit = boundedLimit + 1;
    const statement = this.#db
      .prepare(
        `WITH ranked AS (
           SELECT te.id AS task_id, te.title AS task_title,
                  pe.id AS project_id, pe.title AS project_title,
                  a.type AS activity_type, a.occurred_at AS occurred_at,
                  ROW_NUMBER() OVER (
                    PARTITION BY te.id
                    ORDER BY a.occurred_at DESC, a.id DESC
                  ) AS rn
           FROM entity_links pg
           JOIN entities pe
             ON pe.workspace_id = pg.workspace_id AND pe.id = pg.source_entity_id
                AND pe.type = '${PROJECT}' AND pe.deleted_at IS NULL
           JOIN entity_links tl
             ON tl.workspace_id = pg.workspace_id AND tl.target_entity_id = pe.id
                AND tl.type = '${TASK_BELONGS_TO_PROJECT}' AND tl.deleted_at IS NULL
           JOIN entities te
             ON te.workspace_id = tl.workspace_id AND te.id = tl.source_entity_id
                AND te.type = '${TASK}' AND te.deleted_at IS NULL
           JOIN activity_subjects s
             ON s.workspace_id = te.workspace_id AND s.entity_id = te.id
           JOIN activities a
             ON a.workspace_id = s.workspace_id AND a.id = s.activity_id
                AND a.type IN (${MEANINGFUL_TYPE_LIST})
           WHERE pg.workspace_id = ? AND pg.type = '${PROJECT_ADVANCES_GOAL}'
                 AND pg.deleted_at IS NULL AND pg.target_entity_id = ?
         )
         SELECT task_id, task_title, project_id, project_title, activity_type, occurred_at
         FROM ranked
         WHERE rn = 1
         ORDER BY occurred_at DESC, task_id DESC
         LIMIT ?`,
      )
      .bind(this.#workspaceId, id, fetchLimit);
    const result = await this.#run(statement);
    const rows = (result.results ?? []) as AlignmentEvidenceRow[];
    const pageRows =
      rows.length > boundedLimit ? rows.slice(0, boundedLimit) : rows;
    return {
      items: pageRows.map((row) => ({
        taskId: row.task_id,
        taskTitle: row.task_title,
        projectId: row.project_id,
        projectTitle: row.project_title,
        activityType: row.activity_type,
        occurredAt: fromStorageTimestamp(row.occurred_at),
      })),
      hasMore: rows.length > boundedLimit,
    };
  }

  async #run(statement: D1PreparedStatement): Promise<D1Result> {
    return statement.all();
  }
}
