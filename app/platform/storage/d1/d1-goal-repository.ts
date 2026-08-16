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
import { GOAL_ALIGNMENT_DISPLAY_RANK } from "~/kernel/alignment";
import { normaliseEntityIconKey } from "~/kernel/entities/entity-icon-keys";
import { normaliseIdentityColourSlot } from "~/kernel/entities/identity-colour-slots";
import {
  decodeGoalAlignmentCursorForScope,
  decodeGoalCursorForScope,
  decodeGoalListCursorForScope,
  encodeGoalAlignmentCursor,
  encodeGoalCursor,
  encodeGoalListCursor,
  evaluateGoalProjectContribution,
  GoalStorageError,
  type GoalAlignmentCursorScope,
  type GoalAlignmentListInput,
  type GoalAlignmentListPage,
  type GoalChildrenInput,
  type GoalCursorScope,
  type GoalListCursorScope,
  type GoalListInput,
  type GoalListItem,
  type GoalListPage,
  type GoalOverview,
  type GoalProjectContribution,
  type GoalProjectFact,
  type GoalProjectItem,
  type GoalProjectPage,
  type GoalRepository,
  type GoalSearchHit,
  type GoalSearchInput,
} from "~/kernel/goals";
import { MEANINGFUL_HEALTH_ACTIVITY_TYPES } from "~/kernel/project-health";
import { parseProjectWorkflowStatus } from "~/kernel/project-settings";
import { parseWorkspaceId, type WorkspaceContext } from "~/kernel/workspaces";

import { fromStorageTimestamp } from "./database";
import { likeContains, likePrefix } from "./like-pattern";

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

/**
 * UIX-03 — the AREA identity every Goal read now resolves.
 *
 * A Goal inherits its Area's accent, so every read that already joins the Area
 * for its title also ranks it. The rank is derived from immutable creation
 * facts — `ROW_NUMBER()` over `(created_at, id)`, the identical expression
 * `d1-project-repository.ts` uses — so the colour survives refresh, rename,
 * re-sorting and the creation of other Areas, and two repositories can never
 * disagree about which colour an Area is.
 */
const AREA_RANKS_CTE = `area_ranks AS (
           SELECT id,
                  ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) - 1
                    AS colour_rank
           FROM entities
           WHERE workspace_id = ? AND type = '${AREA}'
         )`;

/** The Area's rank and chosen glyph, joined off the Area the Goal resolved to. */
const AREA_IDENTITY_JOINS = `
  LEFT JOIN area_ranks arank ON arank.id = ae.id
  LEFT JOIN area_details adet
    ON adet.workspace_id = ae.workspace_id AND adet.entity_id = ae.id`;

const AREA_IDENTITY_COLUMNS = `arank.colour_rank AS area_colour_rank,
                  adet.icon_key AS area_icon_key`;

interface GoalAreaIdentityRow {
  readonly area_colour_rank: number | null;
  readonly area_icon_key: string | null;
}

interface GoalOverviewRow extends GoalAreaIdentityRow {
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

interface GoalProjectFactBatchRow extends GoalProjectFactRow {
  readonly goal_id: string;
}

interface GoalListRow extends GoalAreaIdentityRow {
  readonly id: string;
  readonly title: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly completed_at: string | null;
  readonly area_id: string;
  readonly area_title: string;
}

interface GoalAlignmentListRow extends GoalListRow {
  readonly display_rank: number;
}

/**
 * DEBT-23 — the meaningful Activity types as a trusted, inlined SQL list, the SAME
 * vocabulary the alignment-facts read and Project Health use (ADR-035 §35.4 /
 * ADR-040 §40.3). Reused here so the workspace-wide ranking's active/neglected split
 * is derived from the identical facts as the pure evaluator — never a second
 * classification.
 */
const MEANINGFUL_TYPE_LIST = MEANINGFUL_HEALTH_ACTIVITY_TYPES.map(
  (type) => `'${type}'`,
).join(", ");

/**
 * The per-query id chunk size for the batched contribution read
 * (`listGoalProjectContributions`, ADR-040 §40.6). Mirrors
 * `ProjectHealthRepository`'s `HEALTH_CHUNK_SIZE`: D1 caps bound variables at
 * 100 per statement; a chunk of 50 (the id set bound once here, unlike the
 * activity UNION's two binds) keeps every statement comfortably under that
 * limit while gathering a whole page of Goals in a small, FIXED number of
 * statements — never one query per Goal.
 */
const GOAL_PROJECT_CONTRIBUTION_CHUNK_SIZE = 50;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
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

  async searchGoals(input: GoalSearchInput): Promise<readonly GoalSearchHit[]> {
    const text = input.text.trim().toLocaleLowerCase();
    if (text.length === 0) return [];
    const limit = validateSpineLimit(input.limit);
    const like = likeContains(text);
    const prefix = likePrefix(text);
    const result = await this.#run(
      this.#db
        .prepare(
          `WITH contrib AS (
             SELECT pg.target_entity_id AS goal_id,
                    COUNT(pe.id) AS total,
                    SUM(CASE WHEN psr.completed_at IS NOT NULL THEN 1 ELSE 0 END) AS completed,
                    SUM(CASE WHEN psr.completed_at IS NULL AND pd.archived_at IS NULL AND COALESCE(pd.status, 'planned') = 'active' THEN 1 ELSE 0 END) AS active,
                    SUM(CASE WHEN psr.completed_at IS NULL AND pd.archived_at IS NULL AND COALESCE(pd.status, 'planned') = 'planned' THEN 1 ELSE 0 END) AS planned,
                    SUM(CASE WHEN psr.completed_at IS NULL AND pd.archived_at IS NULL AND COALESCE(pd.status, 'planned') = 'on_hold' THEN 1 ELSE 0 END) AS on_hold,
                    SUM(CASE WHEN pd.archived_at IS NOT NULL THEN 1 ELSE 0 END) AS archived
             FROM entity_links pg
             JOIN entities pe
               ON pe.workspace_id = pg.workspace_id AND pe.id = pg.source_entity_id
                  AND pe.type = '${PROJECT}' AND pe.deleted_at IS NULL
             JOIN spine_records psr
               ON psr.workspace_id = pe.workspace_id AND psr.entity_id = pe.id
             LEFT JOIN project_details pd
               ON pd.workspace_id = pe.workspace_id AND pd.entity_id = pe.id
             WHERE pg.workspace_id = ? AND pg.type = '${PROJECT_ADVANCES_GOAL}'
                   AND pg.deleted_at IS NULL
             GROUP BY pg.target_entity_id
           )
           SELECT ge.id, ge.title, ge.created_at, ge.updated_at, gsr.completed_at,
                  ae.id AS area_id, ae.title AS area_title,
                  gd.target_date,
                  COALESCE(c.total, 0) AS total,
                  COALESCE(c.completed, 0) AS completed,
                  COALESCE(c.active, 0) AS active,
                  COALESCE(c.planned, 0) AS planned,
                  COALESCE(c.on_hold, 0) AS on_hold,
                  COALESCE(c.archived, 0) AS archived
           FROM entity_links gl
           JOIN entities ge
             ON ge.workspace_id = gl.workspace_id AND ge.id = gl.source_entity_id
                AND ge.type = '${GOAL}' AND ge.deleted_at IS NULL
           JOIN spine_records gsr
             ON gsr.workspace_id = ge.workspace_id AND gsr.entity_id = ge.id
           JOIN entities ae
             ON ae.workspace_id = gl.workspace_id AND ae.id = gl.target_entity_id
                AND ae.type = '${AREA}' AND ae.deleted_at IS NULL
           LEFT JOIN goal_details gd
             ON gd.workspace_id = ge.workspace_id AND gd.entity_id = ge.id
           LEFT JOIN contrib c ON c.goal_id = ge.id
           WHERE gl.workspace_id = ? AND gl.type = '${GOAL_BELONGS_TO_AREA}'
                 AND gl.deleted_at IS NULL
                 AND lower(ge.title) LIKE ? ESCAPE '\\'
           ORDER BY CASE
                      WHEN lower(ge.title) = ? THEN 0
                      WHEN lower(ge.title) LIKE ? ESCAPE '\\' THEN 1
                      ELSE 2
                    END,
                    lower(ge.title) ASC,
                    ge.id ASC
           LIMIT ?`,
        )
        .bind(this.#workspaceId, this.#workspaceId, like, text, prefix, limit),
    );
    const rows = (result.results ?? []) as Array<{
      readonly id: string;
      readonly title: string;
      readonly completed_at: string | null;
      readonly area_id: string;
      readonly area_title: string;
      readonly target_date: string | null;
      readonly total: number | null;
      readonly completed: number | null;
      readonly active: number | null;
      readonly planned: number | null;
      readonly on_hold: number | null;
      readonly archived: number | null;
    }>;
    return rows.map((row) => {
      const total = Number(row.total ?? 0);
      const completed = Number(row.completed ?? 0);
      return {
        id: row.id,
        title: row.title,
        completedAt:
          row.completed_at === null
            ? null
            : fromStorageTimestamp(row.completed_at),
        area: { id: row.area_id, title: row.area_title },
        targetDate: row.target_date,
        contribution: {
          total,
          completed,
          incomplete: Math.max(0, total - completed),
          active: Number(row.active ?? 0),
          planned: Number(row.planned ?? 0),
          onHold: Number(row.on_hold ?? 0),
          archived: Number(row.archived ?? 0),
        },
      };
    });
  }

  async getGoalOverview(id: string): Promise<GoalOverview | null> {
    const goalId = validateSpineId(id, "id");
    const result = await this.#run(
      this.#db
        .prepare(
          `WITH ${AREA_RANKS_CTE}
           SELECT ge.id, ge.workspace_id, ge.title, ge.created_at, ge.updated_at,
                  ${EFFECTIVE_UPDATED_AT_EXPR} AS effective_updated_at,
                  gsr.completed_at, ae.id AS area_id, ae.title AS area_title,
                  ${AREA_IDENTITY_COLUMNS}
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
                AND ae.type = '${AREA}' AND ae.deleted_at IS NULL${AREA_IDENTITY_JOINS}
           WHERE gl.workspace_id = ? AND gl.type = '${GOAL_BELONGS_TO_AREA}'
                 AND gl.deleted_at IS NULL AND ge.id = ?
           LIMIT 1`,
        )
        .bind(this.#workspaceId, this.#workspaceId, goalId),
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

  async listGoalProjectContributions(
    goalIds: readonly string[],
  ): Promise<Map<string, GoalProjectContribution>> {
    const ids = [...new Set(goalIds.map((id) => validateSpineId(id, "id")))];
    const result = new Map<string, GoalProjectContribution>();
    if (ids.length === 0) {
      return result;
    }
    const chunks = chunk(ids, GOAL_PROJECT_CONTRIBUTION_CHUNK_SIZE);
    const gathered = await Promise.all(
      chunks.map((idChunk) => this.#selectGoalProjectFactsBatch(idChunk)),
    );
    const factsByGoal = new Map<string, GoalProjectFact[]>();
    for (const part of gathered) {
      for (const [goalId, facts] of part) {
        const existing = factsByGoal.get(goalId);
        if (existing) {
          existing.push(...facts);
        } else {
          factsByGoal.set(goalId, [...facts]);
        }
      }
    }
    for (const id of ids) {
      result.set(
        id,
        evaluateGoalProjectContribution(factsByGoal.get(id) ?? []),
      );
    }
    return result;
  }

  async listGoals(input: GoalListInput = {}): Promise<GoalListPage> {
    const limit = validateSpineLimit(input.limit);
    const scope: GoalListCursorScope = { workspaceId: this.#workspaceId };
    const cursorParams: string[] = [];
    const cursorClause =
      input.cursor !== undefined
        ? (() => {
            const position = decodeGoalListCursorForScope(input.cursor!, scope);
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
          `WITH ${AREA_RANKS_CTE}
           SELECT ge.id, ge.title, ge.created_at, ge.updated_at, gsr.completed_at,
                  ae.id AS area_id, ae.title AS area_title,
                  ${AREA_IDENTITY_COLUMNS}
           FROM entity_links gl
           JOIN entities ge
             ON ge.workspace_id = gl.workspace_id AND ge.id = gl.source_entity_id
                AND ge.type = '${GOAL}' AND ge.deleted_at IS NULL
           JOIN spine_records gsr
             ON gsr.workspace_id = ge.workspace_id AND gsr.entity_id = ge.id
           JOIN entities ae
             ON ae.workspace_id = gl.workspace_id AND ae.id = gl.target_entity_id
                AND ae.type = '${AREA}' AND ae.deleted_at IS NULL${AREA_IDENTITY_JOINS}
           WHERE gl.workspace_id = ? AND gl.type = '${GOAL_BELONGS_TO_AREA}'
                 AND gl.deleted_at IS NULL${cursorClause}
           ORDER BY ge.created_at ASC, ge.id ASC
           LIMIT ?`,
        )
        .bind(
          this.#workspaceId,
          this.#workspaceId,
          ...cursorParams,
          fetchLimit,
        ),
    );
    const rows = (result.results ?? []) as GoalListRow[];
    const pageRows = rows.length > limit ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];
    const nextCursor =
      rows.length > limit && last
        ? encodeGoalListCursor(scope, {
            createdAt: last.created_at,
            id: last.id,
          })
        : null;
    return {
      items: pageRows.map((row) => this.#toGoalListItem(row)),
      nextCursor,
    };
  }

  /**
   * DEBT-23 — the WORKSPACE-WIDE Goal list ordered by the deterministic Alignment
   * display precedence (`GOAL_ALIGNMENT_DISPLAY_RANK`), established BEFORE
   * pagination, then keyset-paginated over `(displayRank, createdAt, id)`.
   *
   * The rank is computed in ONE workspace-scoped, parameterised statement: two
   * grouped CTEs gather each Goal's complete Project-contribution facts (total /
   * archived) and its most-recent qualifying two-hop Task activity (the SAME
   * structural links, meaningful-type vocabulary and `recentWindowStartIso` bound
   * the pure evaluator's facts reads use), and a CASE assigns the exact
   * `GOAL_ALIGNMENT_DISPLAY_RANK` integers — so the SQL order can never drift from
   * `evaluateGoalAlignment` (proven by a parity test). No per-Goal query (no N+1);
   * the output is strictly bounded by the page LIMIT and the statement scans only
   * this workspace's own Goals — never an unbounded cross-workspace scan.
   */
  async listGoalsByAlignment(
    input: GoalAlignmentListInput,
  ): Promise<GoalAlignmentListPage> {
    const limit = validateSpineLimit(input.limit);
    // The cursor is bound to the effective ranking window, so a cursor reused
    // under a different owner-calendar boundary (e.g. across a day rollover, when
    // a Goal's rank could shift around the activity cutoff) is rejected — never
    // silently reinterpreted into a duplicated or omitted page.
    const scope: GoalAlignmentCursorScope = {
      workspaceId: this.#workspaceId,
      windowStartIso: input.activeBoundaryIso,
    };
    const cursorParams: (string | number)[] = [];
    const cursorClause =
      input.cursor !== undefined
        ? (() => {
            const position = decodeGoalAlignmentCursorForScope(
              input.cursor!,
              scope,
            );
            cursorParams.push(
              position.rank,
              position.rank,
              position.createdAt,
              position.createdAt,
              position.id,
            );
            return " AND (display_rank > ? OR (display_rank = ? AND (created_at > ? OR (created_at = ? AND id > ?))))";
          })()
        : "";
    const fetchLimit = limit + 1;
    const rankCase =
      "CASE" +
      ` WHEN gsr.completed_at IS NOT NULL THEN ${GOAL_ALIGNMENT_DISPLAY_RANK.completed}` +
      ` WHEN COALESCE(c.total, 0) = 0 THEN ${GOAL_ALIGNMENT_DISPLAY_RANK.no_structure}` +
      ` WHEN COALESCE(c.archived, 0) = COALESCE(c.total, 0) THEN ${GOAL_ALIGNMENT_DISPLAY_RANK.unreachable}` +
      ` WHEN act.last_at IS NOT NULL AND act.last_at >= ? THEN ${GOAL_ALIGNMENT_DISPLAY_RANK.active}` + // ? = activeBoundaryIso (exact owner-calendar boundary)
      ` ELSE ${GOAL_ALIGNMENT_DISPLAY_RANK.neglected}` +
      " END";
    const result = await this.#run(
      this.#db
        .prepare(
          `WITH contrib AS (
             SELECT pg.target_entity_id AS goal_id,
                    COUNT(pe.id) AS total,
                    SUM(CASE WHEN pd.archived_at IS NOT NULL THEN 1 ELSE 0 END) AS archived
             FROM entity_links pg
             JOIN entities pe
               ON pe.workspace_id = pg.workspace_id AND pe.id = pg.source_entity_id
                  AND pe.type = '${PROJECT}' AND pe.deleted_at IS NULL
             LEFT JOIN project_details pd
               ON pd.workspace_id = pe.workspace_id AND pd.entity_id = pe.id
             WHERE pg.workspace_id = ? AND pg.type = '${PROJECT_ADVANCES_GOAL}'
                   AND pg.deleted_at IS NULL
             GROUP BY pg.target_entity_id
           ),
           activity AS (
             SELECT ct.goal_id AS goal_id, MAX(a.occurred_at) AS last_at
             FROM (
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
             ) ct
             JOIN activity_subjects s
               ON s.workspace_id = ? AND s.entity_id = ct.task_id
             JOIN activities a
               ON a.workspace_id = s.workspace_id AND a.id = s.activity_id
                  AND a.type IN (${MEANINGFUL_TYPE_LIST})
             GROUP BY ct.goal_id
           ),
           ${AREA_RANKS_CTE},
           ranked AS (
             SELECT ge.id AS id, ge.title AS title, ge.created_at AS created_at,
                    ge.updated_at AS updated_at, gsr.completed_at AS completed_at,
                    ae.id AS area_id, ae.title AS area_title,
                    ${AREA_IDENTITY_COLUMNS},
                    ${rankCase} AS display_rank
             FROM entity_links gl
             JOIN entities ge
               ON ge.workspace_id = gl.workspace_id AND ge.id = gl.source_entity_id
                  AND ge.type = '${GOAL}' AND ge.deleted_at IS NULL
             JOIN spine_records gsr
               ON gsr.workspace_id = ge.workspace_id AND gsr.entity_id = ge.id
             JOIN entities ae
               ON ae.workspace_id = gl.workspace_id AND ae.id = gl.target_entity_id
                  AND ae.type = '${AREA}' AND ae.deleted_at IS NULL${AREA_IDENTITY_JOINS}
             LEFT JOIN contrib c ON c.goal_id = ge.id
             LEFT JOIN activity act ON act.goal_id = ge.id
             WHERE gl.workspace_id = ? AND gl.type = '${GOAL_BELONGS_TO_AREA}'
                   AND gl.deleted_at IS NULL
           )
           SELECT id, title, created_at, updated_at, completed_at,
                  area_id, area_title, area_colour_rank, area_icon_key,
                  display_rank
           FROM ranked
           WHERE 1 = 1${cursorClause}
           ORDER BY display_rank ASC, created_at ASC, id ASC
           LIMIT ?`,
        )
        .bind(
          this.#workspaceId, // contrib
          this.#workspaceId, // activity inner
          this.#workspaceId, // activity subjects
          // Bind order follows the order the placeholders appear in the SQL
          // TEXT: `area_ranks` is declared before `ranked`, so its workspace
          // binds before the rank CASE's boundary inside `ranked`'s SELECT.
          this.#workspaceId, // area_ranks
          input.activeBoundaryIso, // rank CASE active/neglected boundary (exact)
          this.#workspaceId, // ranked goals
          ...cursorParams, // outer keyset (rank, rank, createdAt, createdAt, id)
          fetchLimit,
        ),
    );
    const rows = (result.results ?? []) as GoalAlignmentListRow[];
    const pageRows = rows.length > limit ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];
    const nextCursor =
      rows.length > limit && last
        ? encodeGoalAlignmentCursor(scope, {
            rank: Number(last.display_rank),
            createdAt: last.created_at,
            id: last.id,
          })
        : null;
    return {
      items: pageRows.map((row) => this.#toGoalListItem(row)),
      nextCursor,
    };
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

  /**
   * The batched equivalent of `#selectGoalProjectFacts`, for a bounded chunk
   * of Goal ids at once — one workspace-scoped, parameterised query, grouped
   * by Goal id in memory (ADR-040 §40.6). No `LIMIT` on the underlying
   * traversal: every active `project.advances_goal` Project for every
   * requested Goal is read, so a Project past any UI page size still reaches
   * `evaluateGoalProjectContribution`.
   */
  async #selectGoalProjectFactsBatch(
    goalIds: readonly string[],
  ): Promise<Map<string, GoalProjectFact[]>> {
    const placeholders = goalIds.map(() => "?").join(", ");
    const result = await this.#run(
      this.#db
        .prepare(
          `SELECT pg.target_entity_id AS goal_id, e.id AS id,
                  COALESCE(pd.status, 'planned') AS status,
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
                 AND pg.deleted_at IS NULL
                 AND pg.target_entity_id IN (${placeholders})`,
        )
        .bind(this.#workspaceId, ...goalIds),
    );
    const rows = (result.results ?? []) as GoalProjectFactBatchRow[];
    const byGoal = new Map<string, GoalProjectFact[]>();
    for (const row of rows) {
      const fact: GoalProjectFact = {
        id: row.id,
        status: this.#parseStatus(row.status),
        completedAt:
          row.completed_at === null
            ? null
            : fromStorageTimestamp(row.completed_at),
        archivedAt:
          row.archived_at === null
            ? null
            : fromStorageTimestamp(row.archived_at),
      };
      const existing = byGoal.get(row.goal_id);
      if (existing) {
        existing.push(fact);
      } else {
        byGoal.set(row.goal_id, [fact]);
      }
    }
    return byGoal;
  }

  #toGoalListItem(row: GoalListRow): GoalListItem {
    return {
      id: row.id,
      title: row.title,
      createdAt: fromStorageTimestamp(row.created_at),
      updatedAt: fromStorageTimestamp(row.updated_at),
      completedAt:
        row.completed_at === null
          ? null
          : fromStorageTimestamp(row.completed_at),
      area: this.#toAreaContext(row),
    };
  }

  /**
   * The Area context, with its identity.
   *
   * The rank is `null` — the neutral container — only when the join could not
   * rank the Area at all; `0` is a legitimate rank (the workspace's first Area),
   * so it must survive. The icon key is normalised on the way OUT, so a key
   * removed from the vocabulary in a later release degrades to the Area's
   * default glyph rather than reaching a component that cannot draw it.
   */
  #toAreaContext(row: {
    readonly area_id: string;
    readonly area_title: string;
    readonly area_colour_rank: number | null;
    readonly area_icon_key: string | null;
  }) {
    return {
      id: row.area_id,
      title: row.area_title,
      colourRank:
        row.area_colour_rank === null ? null : Number(row.area_colour_rank),
      iconKey: normaliseEntityIconKey(row.area_icon_key),
    };
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
      area: this.#toAreaContext(row),
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
