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
  decodeGoalOutcomeCursorForScope,
  encodeGoalAlignmentCursor,
  encodeGoalCursor,
  encodeGoalListCursor,
  encodeGoalOutcomeCursor,
  evaluateGoalProjectContribution,
  GOAL_MEASUREMENT_ON_TRACK_STATUSES,
  GOAL_MEASUREMENT_TYPES,
  GOAL_OUTCOME_COMPLETED_RANK,
  GOAL_OUTCOME_DISPLAY_RANK,
  GOAL_SCHEDULE_MARGIN,
  GOAL_STALE_AFTER_DAYS,
  GoalStorageError,
  type GoalAlignmentCursorScope,
  type GoalAlignmentListInput,
  type GoalAlignmentListPage,
  type GoalChildrenInput,
  type GoalCollectionView,
  type GoalCursorScope,
  type GoalListCursorScope,
  type GoalListInput,
  type GoalListItem,
  type GoalListPage,
  type GoalOutcomeCountsInput,
  type GoalOutcomeCursorScope,
  type GoalOutcomeLensCounts,
  type GoalOutcomeListInput,
  type GoalOutcomeListPage,
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

/** The Area's rank and chosen identity, joined off the Area the Goal resolved to. */
const AREA_IDENTITY_JOINS = `
  LEFT JOIN area_ranks arank ON arank.id = ae.id
  LEFT JOIN area_details adet
    ON adet.workspace_id = ae.workspace_id AND adet.entity_id = ae.id`;

const AREA_IDENTITY_COLUMNS = `arank.colour_rank AS area_colour_rank,
                  adet.icon_key AS area_icon_key,
                  adet.colour_slot AS area_colour_slot`;

interface GoalAreaIdentityRow {
  readonly area_colour_rank: number | null;
  readonly area_icon_key: string | null;
  readonly area_colour_slot: string | null;
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
 * STEER-01 — the measurement-type vocabulary as trusted, inlined SQL lists.
 *
 * Both derive from the kernel's `GOAL_MEASUREMENT_TYPES`, so the SQL status
 * derivation recognises exactly the set `parseGoalMeasurementType` recognises:
 * an unknown stored type reads as unmeasured on BOTH sides (the migration-0038
 * degradation rule), which the parity test asserts. Reading types are the ones
 * `goalMeasurementAcceptsReadings` accepts — everything but `milestone`, whose
 * value derives from stages.
 */
/**
 * V2.7 RECALL-04 — the ONE measurement predicate as a trusted, inlined SQL list
 * (DEBT-234).
 *
 * Derived from `GOAL_MEASUREMENT_ON_TRACK_STATUSES`, exactly as the lists above
 * derive from their kernel vocabularies, so the `on_track` lens's SQL and the
 * pure `goalMatchesCollectionView` / `goalIsOnTrack` predicate are one
 * declaration with two renderings rather than two sets that must be kept in
 * step. The literal used to be hand-written here as `('on_track', 'ahead')` —
 * it omitted `achieved`, which is precisely how `/goals` and Today came to count
 * different numbers over one workspace. The parity is asserted by
 * `test/kernel/recall-04-day-week-truth.test.ts` over every one of the nine
 * statuses.
 */
const MEASUREMENT_ON_TRACK_LIST = GOAL_MEASUREMENT_ON_TRACK_STATUSES.map(
  (status) => `'${status}'`,
).join(", ");

const MEASUREMENT_TYPE_LIST = GOAL_MEASUREMENT_TYPES.map(
  (type) => `'${type}'`,
).join(", ");
const READING_TYPE_LIST = GOAL_MEASUREMENT_TYPES.filter(
  (type) => type !== "milestone",
)
  .map((type) => `'${type}'`)
  .join(", ");

/**
 * STEER-01/02 — one lens, one SQL predicate, used verbatim by the filtered
 * page read AND the counts aggregate, so a lens's result set and its count
 * cannot disagree. Mirrors the kernel's `goalMatchesCollectionView` exactly:
 * `completed` is the spine's explicit completion and wins first; the status
 * lenses are condition-blind; `set_aside` is the owner's stored condition
 * (ADR-111 decision 3 — scope, never truth). Values are trusted kernel
 * literals, never caller input.
 */
function outcomeLensPredicate(view: GoalCollectionView): string {
  switch (view) {
    case "completed":
      return "completed_at IS NOT NULL";
    case "on_track":
      return `(completed_at IS NULL AND status IN (${MEASUREMENT_ON_TRACK_LIST}))`;
    case "attention":
      return "(completed_at IS NULL AND status IN ('needs_attention', 'overdue'))";
    case "set_aside":
      return "(completed_at IS NULL AND own_condition = 'set_aside')";
    default:
      return "1 = 1";
  }
}

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
    const omitSetAside = input.omitSetAside === true;
    const scope: GoalAlignmentCursorScope = {
      workspaceId: this.#workspaceId,
      windowStartIso: input.activeBoundaryIso,
      omitSetAside,
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
             LEFT JOIN activity act ON act.goal_id = ge.id${
               omitSetAside
                 ? `
             LEFT JOIN goal_details gcond
               ON gcond.workspace_id = ge.workspace_id AND gcond.entity_id = ge.id`
                 : ""
             }
             WHERE gl.workspace_id = ? AND gl.type = '${GOAL_BELONGS_TO_AREA}'
                   AND gl.deleted_at IS NULL${
                     /*
                      * STEER-02 — an attention surface's read excludes the
                      * Goals the owner has set aside, in SQL, before the page
                      * boundary: filtering after the scan would let a workspace
                      * of set-aside Goals produce an empty panel while
                      * pursued Goals waited on page two. It is a join on the
                      * Goal-owned slice the ranking never otherwise reads,
                      * added only when asked for, so the ordinary alignment
                      * read is byte-for-byte what it was.
                      */
                     omitSetAside
                       ? " AND (gcond.condition IS NULL OR gcond.condition <> 'set_aside')"
                       : ""
                   }
           )
           SELECT id, title, created_at, updated_at, completed_at,
                  area_id, area_title, area_colour_rank, area_icon_key,
                  area_colour_slot, display_rank
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

  /**
   * STEER-01 — the WORKSPACE-WIDE Goal list ordered by the deterministic
   * OUTCOME display precedence, established in SQL BEFORE pagination, with the
   * lens applied in the same read.
   *
   * The rank is GOAL-02's derived status (`evaluateGoalProgress`), reproduced
   * as a layered SQL derivation over the SAME stored facts the summary-based
   * evaluation reads: the measurement configuration on `goal_details`, the
   * latest/earliest reading per Goal (identical `(measured_on, created_at)`
   * tiebreaks to `listMeasurementSummaries`), the milestone weights, the
   * owner-calendar target date, the bound owner day, and each Goal's schedule
   * origin — its creation day in the owner's calendar, resolved by ONE bounded
   * preliminary statement (`#selectGoalStartedOnMap`) and passed back as a
   * single JSON parameter, because SQLite cannot perform IANA time-zone
   * conversion and an approximate UTC date would break exact parity with the
   * evaluator. The rank CASE derives from `GOAL_OUTCOME_DISPLAY_RANK` — the
   * one kernel authority — and a parity test drives both over the same fact
   * matrix (`test/kernel/goal-outcome.test.ts`), the DEBT-23 precedent.
   *
   * Cost: TWO statements per page (the origin scan + the ranked page), flat in
   * the number of Goals, measurements and milestones — never one query per
   * Goal, and no unbounded cross-workspace scan. Nothing is persisted: no rank
   * column, no status column (ADR-111 decision 5 / ADR-110's rule).
   */
  async listGoalsByOutcome(
    input: GoalOutcomeListInput,
  ): Promise<GoalOutcomeListPage> {
    const limit = validateSpineLimit(input.limit);
    const view: GoalCollectionView = input.view ?? "all";
    const scope: GoalOutcomeCursorScope = {
      workspaceId: this.#workspaceId,
      todayIso: input.todayIso,
      timeZone: input.timeZone,
      view,
    };
    const cursorParams: (string | number)[] = [];
    const cursorClause =
      input.cursor !== undefined
        ? (() => {
            const position = decodeGoalOutcomeCursorForScope(
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
    const startedJson = await this.#selectGoalStartedOnMap(input.calendarIsoOf);
    const fetchLimit = limit + 1;
    const result = await this.#run(
      this.#db
        .prepare(
          `${this.#outcomeCtes()}
           SELECT id, title, created_at, updated_at, completed_at,
                  area_id, area_title, area_colour_rank, area_icon_key,
                  area_colour_slot, display_rank
           FROM ranked
           WHERE ${outcomeLensPredicate(view)}${cursorClause}
           ORDER BY display_rank ASC, created_at ASC, id ASC
           LIMIT ?`,
        )
        .bind(
          ...this.#outcomeBinds(input.todayIso, startedJson),
          ...cursorParams,
          fetchLimit,
        ),
    );
    const rows = (result.results ?? []) as GoalAlignmentListRow[];
    const pageRows = rows.length > limit ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];
    const nextCursor =
      rows.length > limit && last
        ? encodeGoalOutcomeCursor(scope, {
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

  /**
   * STEER-01 — the WORKSPACE-TRUE count behind every collection lens, from the
   * SAME status/lens expressions the ordered read uses, so a lens's count and
   * its result set cannot disagree (DEBT-121's closing condition). TWO
   * statements (the origin scan + one aggregate), flat in everything.
   */
  async countGoalsByOutcomeLens(
    input: GoalOutcomeCountsInput,
  ): Promise<GoalOutcomeLensCounts> {
    const startedJson = await this.#selectGoalStartedOnMap(input.calendarIsoOf);
    const result = await this.#run(
      this.#db
        .prepare(
          `${this.#outcomeCtes()}
           SELECT COUNT(*) AS total,
                  SUM(CASE WHEN ${outcomeLensPredicate("on_track")} THEN 1 ELSE 0 END) AS on_track,
                  SUM(CASE WHEN ${outcomeLensPredicate("attention")} THEN 1 ELSE 0 END) AS attention,
                  SUM(CASE WHEN ${outcomeLensPredicate("set_aside")} THEN 1 ELSE 0 END) AS set_aside,
                  SUM(CASE WHEN ${outcomeLensPredicate("completed")} THEN 1 ELSE 0 END) AS completed
           FROM ranked`,
        )
        .bind(...this.#outcomeBinds(input.todayIso, startedJson)),
    );
    const row = (
      (result.results ?? []) as Array<{
        readonly total: number | null;
        readonly on_track: number | null;
        readonly attention: number | null;
        readonly set_aside: number | null;
        readonly completed: number | null;
      }>
    )[0];
    return {
      total: Number(row?.total ?? 0),
      on_track: Number(row?.on_track ?? 0),
      attention: Number(row?.attention ?? 0),
      set_aside: Number(row?.set_aside ?? 0),
      completed: Number(row?.completed ?? 0),
    };
  }

  /**
   * ONE bounded statement resolving every active Goal's `(id, created_at)`,
   * converted to the owner-calendar schedule origin by the injected
   * `calendarIsoOf` and returned as a single JSON parameter for `json_each`.
   * Two short columns per Goal — flat in measurements, milestones and events —
   * so the whole map stays far below D1's statement and parameter limits for a
   * personal workspace.
   */
  async #selectGoalStartedOnMap(
    calendarIsoOf: (instant: Date) => string,
  ): Promise<string> {
    const result = await this.#run(
      this.#db
        .prepare(
          `SELECT ge.id, ge.created_at
           FROM entity_links gl
           JOIN entities ge
             ON ge.workspace_id = gl.workspace_id AND ge.id = gl.source_entity_id
                AND ge.type = '${GOAL}' AND ge.deleted_at IS NULL
           WHERE gl.workspace_id = ? AND gl.type = '${GOAL_BELONGS_TO_AREA}'
                 AND gl.deleted_at IS NULL`,
        )
        .bind(this.#workspaceId),
    );
    const rows = (result.results ?? []) as Array<{
      readonly id: string;
      readonly created_at: string;
    }>;
    return JSON.stringify(
      rows.map((row) => [
        row.id,
        calendarIsoOf(fromStorageTimestamp(row.created_at)),
      ]),
    );
  }

  /**
   * The shared CTE pipeline both outcome statements are built from — ONE text,
   * so the ordered page, the lens filter and the counts derive the status from
   * identical SQL. See `listGoalsByOutcome` for the derivation notes; the
   * status CASE mirrors `evaluateGoalProgress`'s precedence exactly
   * (not_measured → achieved → not_started → overdue → stale → regressing →
   * in_progress guards → the ±schedule-margin comparison), and the rank CASE
   * is generated from `GOAL_OUTCOME_DISPLAY_RANK` so it cannot drift from the
   * kernel authority.
   */
  #outcomeCtes(): string {
    const rankCase =
      `CASE WHEN completed_at IS NOT NULL THEN ${GOAL_OUTCOME_COMPLETED_RANK}` +
      ` ELSE CASE status` +
      Object.entries(GOAL_OUTCOME_DISPLAY_RANK)
        .filter(([status]) => status !== "not_measured")
        .map(([status, rank]) => ` WHEN '${status}' THEN ${rank}`)
        .join("") +
      ` ELSE ${GOAL_OUTCOME_DISPLAY_RANK.not_measured} END END`;
    /*
     * The schedule's expected fraction — the straight line from the Goal's
     * owner-calendar creation day to its target date, clamped to [0, 1],
     * exactly as `evaluateStatus` computes it. `julianday` over date-only
     * strings yields x.5 values whose differences are exact integers, so the
     * division and the ±margin comparison are the same IEEE-754 operations the
     * evaluator performs — which is what the parity test relies on.
     */
    const expected =
      "min(1.0, max(0.0, (julianday(today) - julianday(started_on)) / (julianday(target_date) - julianday(started_on))))";
    return `WITH ctx(today) AS (SELECT ?),
         started(goal_id, started_on) AS (
           SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]')
           FROM json_each(?)
         ),
         latest AS (
           SELECT entity_id, value, measured_on FROM (
             SELECT m.entity_id, m.value, m.measured_on,
                    ROW_NUMBER() OVER (
                      PARTITION BY m.entity_id
                      ORDER BY m.measured_on DESC, m.created_at DESC
                    ) AS rn
             FROM goal_measurements m
             WHERE m.workspace_id = ?
           ) WHERE rn = 1
         ),
         earliest AS (
           SELECT entity_id, value, measured_on FROM (
             SELECT m.entity_id, m.value, m.measured_on,
                    ROW_NUMBER() OVER (
                      PARTITION BY m.entity_id
                      ORDER BY m.measured_on ASC, m.created_at ASC
                    ) AS rn
             FROM goal_measurements m
             WHERE m.workspace_id = ?
           ) WHERE rn = 1
         ),
         stages AS (
           SELECT entity_id,
                  SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) AS completed_count,
                  SUM(weight) AS total_weight,
                  SUM(CASE WHEN completed_at IS NOT NULL THEN weight ELSE 0 END) AS completed_weight
           FROM goal_milestones
           WHERE workspace_id = ?
           GROUP BY entity_id
         ),
         ${AREA_RANKS_CTE},
         base AS (
           SELECT ge.id AS id, ge.title AS title, ge.created_at AS created_at,
                  ge.updated_at AS updated_at, gsr.completed_at AS completed_at,
                  ae.id AS area_id, ae.title AS area_title,
                  ${AREA_IDENTITY_COLUMNS},
                  gd.target_date AS target_date,
                  gd.condition AS own_condition,
                  CASE WHEN gd.measurement_type IN (${MEASUREMENT_TYPE_LIST})
                       THEN gd.measurement_type END AS mtype,
                  gd.baseline_value AS bval,
                  gd.target_value AS tval,
                  gd.measurement_direction AS direction_raw,
                  l.value AS lv, l.measured_on AS lo,
                  f.value AS ev, f.measured_on AS eo,
                  COALESCE(ms.completed_count, 0) AS ms_completed,
                  COALESCE(ms.total_weight, 0) AS ms_total_weight,
                  COALESCE(ms.completed_weight, 0) AS ms_completed_weight,
                  st.started_on AS started_on,
                  ctx.today AS today
           FROM entity_links gl
           JOIN entities ge
             ON ge.workspace_id = gl.workspace_id AND ge.id = gl.source_entity_id
                AND ge.type = '${GOAL}' AND ge.deleted_at IS NULL
           JOIN spine_records gsr
             ON gsr.workspace_id = ge.workspace_id AND gsr.entity_id = ge.id
           JOIN entities ae
             ON ae.workspace_id = gl.workspace_id AND ae.id = gl.target_entity_id
                AND ae.type = '${AREA}' AND ae.deleted_at IS NULL${AREA_IDENTITY_JOINS}
           LEFT JOIN goal_details gd
             ON gd.workspace_id = ge.workspace_id AND gd.entity_id = ge.id
           LEFT JOIN latest l ON l.entity_id = ge.id
           LEFT JOIN earliest f ON f.entity_id = ge.id
           LEFT JOIN stages ms ON ms.entity_id = ge.id
           LEFT JOIN started st ON st.goal_id = ge.id
           CROSS JOIN ctx
           WHERE gl.workspace_id = ? AND gl.type = '${GOAL_BELONGS_TO_AREA}'
                 AND gl.deleted_at IS NULL
         ),
         shaped AS (
           SELECT base.*,
                  CASE WHEN mtype = 'milestone' THEN (ms_completed > 0)
                       WHEN mtype IS NULL THEN 0
                       ELSE (lv IS NOT NULL) END AS has_reading,
                  CASE WHEN mtype IS NULL THEN NULL
                       WHEN mtype = 'target_value' THEN
                         (CASE WHEN bval IS NOT NULL THEN bval * 1.0 ELSE ev * 1.0 END)
                       ELSE 0.0 END AS baseline,
                  CASE WHEN mtype = 'milestone' THEN
                         (CASE WHEN ms_total_weight > 0 THEN ms_total_weight * 1.0 END)
                       WHEN mtype = 'manual' THEN 100.0
                       WHEN mtype IS NULL THEN NULL
                       ELSE tval * 1.0 END AS target,
                  CASE WHEN mtype = 'milestone' THEN ms_completed_weight * 1.0
                       WHEN mtype IS NULL THEN NULL
                       WHEN lo IS NOT NULL AND eo IS NOT NULL AND lo = eo THEN ev * 1.0
                       ELSE lv * 1.0 END AS current_value,
                  CASE WHEN mtype = 'target_value' THEN
                         (CASE WHEN direction_raw IN ('increase', 'decrease') THEN direction_raw
                               WHEN bval IS NOT NULL AND tval IS NOT NULL AND tval < bval THEN 'decrease'
                               ELSE 'increase' END)
                       ELSE 'increase' END AS direction,
                  CASE WHEN mtype IN (${READING_TYPE_LIST}) AND lo IS NOT NULL
                       THEN julianday(today) - julianday(lo) END AS days_since,
                  CASE WHEN mtype IN ('milestone', 'manual') THEN 1
                       WHEN mtype IN ('target_value', 'accumulation') THEN (tval IS NOT NULL)
                       ELSE 0 END AS configured
           FROM base
         ),
         valued AS (
           SELECT shaped.*,
                  ((completed_at IS NOT NULL)
                    OR (current_value IS NOT NULL AND target IS NOT NULL
                        AND ((direction = 'decrease' AND current_value <= target)
                             OR (direction <> 'decrease' AND current_value >= target)))) AS achieved,
                  CASE WHEN baseline IS NOT NULL AND current_value IS NOT NULL
                            AND target IS NOT NULL AND (target - baseline) <> 0
                       THEN (current_value - baseline) / (target - baseline) END AS fraction
           FROM shaped
         ),
         classified AS (
           SELECT valued.*,
                  CASE
                    WHEN mtype IS NULL THEN 'not_measured'
                    WHEN achieved THEN 'achieved'
                    WHEN NOT has_reading THEN 'not_started'
                    WHEN target_date IS NOT NULL AND target_date < today THEN 'overdue'
                    WHEN days_since IS NOT NULL AND days_since > ${GOAL_STALE_AFTER_DAYS} THEN 'stale'
                    WHEN fraction IS NOT NULL AND fraction < 0 THEN 'needs_attention'
                    WHEN target_date IS NULL OR started_on IS NULL OR fraction IS NULL
                         OR NOT configured THEN 'in_progress'
                    WHEN julianday(target_date) - julianday(started_on) <= 0 THEN 'in_progress'
                    WHEN fraction >= ${expected} + ${GOAL_SCHEDULE_MARGIN} THEN 'ahead'
                    WHEN fraction >= ${expected} - ${GOAL_SCHEDULE_MARGIN} THEN 'on_track'
                    ELSE 'needs_attention'
                  END AS status
           FROM valued
         ),
         ranked AS (
           SELECT classified.*, ${rankCase} AS display_rank
           FROM classified
         )`;
  }

  /** The bind values for `#outcomeCtes`, in SQL-text order. */
  #outcomeBinds(todayIso: string, startedJson: string): (string | number)[] {
    return [
      todayIso, // ctx(today)
      startedJson, // started(json_each)
      this.#workspaceId, // latest
      this.#workspaceId, // earliest
      this.#workspaceId, // stages
      this.#workspaceId, // area_ranks
      this.#workspaceId, // base
    ];
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
    readonly area_colour_slot: string | null;
  }) {
    return {
      id: row.area_id,
      title: row.area_title,
      colourRank:
        row.area_colour_rank === null ? null : Number(row.area_colour_rank),
      iconKey: normaliseEntityIconKey(row.area_icon_key),
      /*
       * IDENTITY-01 — the Area's CHOSEN colour, which beats its rank.
       *
       * Without this a Goal inherited the Area's DERIVED colour even when the
       * Area had chosen a different one, so the same Area was one colour on the
       * Areas collection and another on every Goal that belongs to it. The
       * resolver has always preferred the chosen slot; the read simply was not
       * supplying it.
       */
      colourSlot: normaliseIdentityColourSlot(row.area_colour_slot),
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
