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
  type AreaDependencySummary,
  type AreaGoalItem,
  type AreaGoalPage,
  type AreaListItem,
  type AreaListPage,
  type AreaMomentumSourceFacts,
  type AreaOverview,
  type AreaProjectItem,
  type AreaProjectPage,
  type AreaRepository,
  type AreaSearchHit,
  type AreaSearchInput,
} from "~/kernel/areas";
import { normaliseEntityIconKey } from "~/kernel/entities/entity-icon-keys";
import { parseProjectWorkflowStatus } from "~/kernel/project-settings";
import type { WorkspaceContext } from "~/kernel/workspaces";
import { parseWorkspaceId } from "~/kernel/workspaces";

import { fromStorageTimestamp } from "./database";
import { likeContains, likePrefix } from "./like-pattern";

const EFFECTIVE_PROJECT_UPDATED_AT_EXPR =
  "(CASE WHEN pd.updated_at IS NOT NULL AND pd.updated_at > e.updated_at THEN pd.updated_at ELSE e.updated_at END)";

/** Supporting entity-type literals used only to classify a linked dependent's
 * kind for the AREA-05 dependency summary. These entity types are stored as-is on
 * `entities.type` (migrations 0010 `note`, 0011 `diary`). */
const NOTE_TYPE = "note";
const DIARY_TYPE = "diary";

interface AreaRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly title: string;
  readonly created_at: string;
  readonly updated_at: string;
  /** AREA-05: joined from `area_details` on the record read; absent on the active
   * collection read (which excludes archived Areas entirely). */
  readonly archived_at?: string | null;
}

interface AreaDependencyRow {
  readonly goals: number | null;
  readonly projects: number | null;
  readonly tasks: number | null;
  readonly notes: number | null;
  readonly diary: number | null;
  readonly other: number | null;
}

/** The single-record read's row: an `AreaRow` plus its computed identity rank. */
interface AreaOverviewRow extends AreaRow {
  /** ADR-068 decision 5's lifecycle-independent colour rank (0-based). */
  readonly colour_rank: number | null;
}

interface AreaListRow extends AreaRow {
  /** ADR-068 decision 5's lifecycle-independent colour rank (0-based). */
  readonly colour_rank: number;
  /** The owner's chosen icon key, from the `area_details` row already joined. */
  readonly icon_key: string | null;
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

  async searchAreas(input: AreaSearchInput): Promise<readonly AreaSearchHit[]> {
    const text = input.text.trim().toLocaleLowerCase();
    if (text.length === 0) return [];
    const limit = validateSpineLimit(input.limit);
    const like = likeContains(text);
    const prefix = likePrefix(text);
    const result = await this.#run(
      this.#db
        .prepare(
          `WITH
           open_goals AS (
             SELECT gl.target_entity_id AS area_id, COUNT(*) AS open_goal_count
             FROM entity_links gl
             JOIN entities ge
               ON ge.workspace_id = gl.workspace_id AND ge.id = gl.source_entity_id
                  AND ge.type = '${GOAL}' AND ge.deleted_at IS NULL
             JOIN spine_records gsr
               ON gsr.workspace_id = ge.workspace_id AND gsr.entity_id = ge.id
                  AND gsr.completed_at IS NULL
             WHERE gl.workspace_id = ? AND gl.type = '${GOAL_BELONGS_TO_AREA}'
                   AND gl.deleted_at IS NULL
             GROUP BY gl.target_entity_id
           ),
           active_projects AS (
             SELECT area_id, COUNT(*) AS active_project_count
             FROM (
               SELECT pl.target_entity_id AS area_id, pe.id AS project_id
               FROM entity_links pl
               JOIN entities pe
                 ON pe.workspace_id = pl.workspace_id AND pe.id = pl.source_entity_id
                    AND pe.type = '${PROJECT}' AND pe.deleted_at IS NULL
               JOIN spine_records psr
                 ON psr.workspace_id = pe.workspace_id AND psr.entity_id = pe.id
                    AND psr.completed_at IS NULL
               LEFT JOIN project_details pd
                 ON pd.workspace_id = pe.workspace_id AND pd.entity_id = pe.id
               WHERE pl.workspace_id = ? AND pl.type = '${PROJECT_BELONGS_TO_AREA}'
                     AND pl.deleted_at IS NULL AND pd.archived_at IS NULL
               UNION
               SELECT gl.target_entity_id AS area_id, pe.id AS project_id
               FROM entity_links gl
               JOIN entities ge
                 ON ge.workspace_id = gl.workspace_id AND ge.id = gl.source_entity_id
                    AND ge.type = '${GOAL}' AND ge.deleted_at IS NULL
               JOIN entity_links pg
                 ON pg.workspace_id = gl.workspace_id AND pg.target_entity_id = ge.id
                    AND pg.type = '${PROJECT_ADVANCES_GOAL}' AND pg.deleted_at IS NULL
               JOIN entities pe
                 ON pe.workspace_id = pg.workspace_id AND pe.id = pg.source_entity_id
                    AND pe.type = '${PROJECT}' AND pe.deleted_at IS NULL
               JOIN spine_records psr
                 ON psr.workspace_id = pe.workspace_id AND psr.entity_id = pe.id
                    AND psr.completed_at IS NULL
               LEFT JOIN project_details pd
                 ON pd.workspace_id = pe.workspace_id AND pd.entity_id = pe.id
               WHERE gl.workspace_id = ? AND gl.type = '${GOAL_BELONGS_TO_AREA}'
                     AND gl.deleted_at IS NULL AND pd.archived_at IS NULL
             )
             GROUP BY area_id
           ),
           direct_tasks AS (
             SELECT tl.target_entity_id AS area_id, COUNT(*) AS direct_task_count
             FROM entity_links tl
             JOIN entities te
               ON te.workspace_id = tl.workspace_id AND te.id = tl.source_entity_id
                  AND te.type = '${TASK}' AND te.deleted_at IS NULL
             JOIN spine_records tsr
               ON tsr.workspace_id = te.workspace_id AND tsr.entity_id = te.id
                  AND tsr.completed_at IS NULL
             WHERE tl.workspace_id = ? AND tl.type = '${TASK_BELONGS_TO_AREA}'
                   AND tl.deleted_at IS NULL
             GROUP BY tl.target_entity_id
           )
           SELECT e.id, e.title,
                  COALESCE(ap.active_project_count, 0) AS active_project_count,
                  COALESCE(og.open_goal_count, 0) AS open_goal_count,
                  COALESCE(dt.direct_task_count, 0) AS direct_task_count
           FROM entities e
           JOIN spine_records sr
             ON sr.workspace_id = e.workspace_id AND sr.entity_id = e.id
           LEFT JOIN area_details ad
             ON ad.workspace_id = e.workspace_id AND ad.entity_id = e.id
           LEFT JOIN active_projects ap ON ap.area_id = e.id
           LEFT JOIN open_goals og ON og.area_id = e.id
           LEFT JOIN direct_tasks dt ON dt.area_id = e.id
           WHERE e.workspace_id = ? AND e.type = '${AREA}' AND e.deleted_at IS NULL
                 AND ad.archived_at IS NULL
                 AND lower(e.title) LIKE ? ESCAPE '\\'
           ORDER BY CASE
                      WHEN lower(e.title) = ? THEN 0
                      WHEN lower(e.title) LIKE ? ESCAPE '\\' THEN 1
                      ELSE 2
                    END,
                    lower(e.title) ASC,
                    e.id ASC
           LIMIT ?`,
        )
        .bind(
          this.#workspaceId,
          this.#workspaceId,
          this.#workspaceId,
          this.#workspaceId,
          this.#workspaceId,
          like,
          text,
          prefix,
          limit,
        ),
    );
    const rows = (result.results ?? []) as Array<{
      readonly id: string;
      readonly title: string;
      readonly active_project_count: number | null;
      readonly open_goal_count: number | null;
      readonly direct_task_count: number | null;
    }>;
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      activeProjectCount: Number(row.active_project_count ?? 0),
      openGoalCount: Number(row.open_goal_count ?? 0),
      directTaskCount: Number(row.direct_task_count ?? 0),
    }));
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
           /*
            * DS-14 / ADR-068 decision 5 — the Area's colour rank.
            *
            * Ranked over EVERY \`area\` row in the workspace, deliberately
            * WITHOUT the \`deleted_at\` / \`archived_at\` filters the outer
            * query applies. That is the whole point: the accent must not move
            * when an Area is archived or soft-deleted, and it only moves on a
            * permanent delete, which is already a typed-confirmation
            * destructive act. Ranking over the ACTIVE set instead would make
            * archiving one Area recolour every Area created after it.
            *
            * \`(created_at, id)\` is the canonical total ordering (ADR-065
            * decision 3), already served by
            * \`entities_workspace_type_created_idx\` on
            * \`(workspace_id, type, created_at, id)\` — so this needs no new
            * index. 0-based to match \`areaAccentForRank\`.
            */
           area_ranks AS (
             SELECT id,
                    ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) - 1
                      AS colour_rank
             FROM entities
             WHERE workspace_id = ? AND type = '${AREA}'
           ),
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
           /*
            * EVERY Project aligned to the Area — directly, or through one of
            * its Goals — regardless of lifecycle state. This is the set the
            * PROJECT roll-up is computed over, because "2 of 5 Projects
            * complete" is a statement about the Area's whole body of work.
            *
            * It is deliberately NOT the set the TASK roll-up uses; see
            * \`unarchived_area_projects\` below.
            */
           area_projects AS (
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
             FROM area_projects ap
             JOIN spine_records psr
               ON psr.workspace_id = ? AND psr.entity_id = ap.project_id
             LEFT JOIN project_details pd
               ON pd.workspace_id = ? AND pd.entity_id = ap.project_id
             GROUP BY ap.area_id
           ),
           /*
            * The Area's aligned Projects MINUS the archived ones.
            *
            * Archival is reversible and is NOT soft-deletion (ADR-037 §37.1):
            * an archived Project stays structurally present and readable, but
            * it is deliberately out of the ordinary active-work buckets
            * everywhere else in the product — \`listProjects\` excludes it from
            * "all", and \`active_count\` above already excludes it. The TASK
            * roll-up did not, which meant an Area whose only remaining work sat
            * inside an archived Project reported open tasks and read as
            * active. Putting work away has to actually put it away.
            *
            * \`LEFT JOIN … WHERE pd.archived_at IS NULL\` rather than an inner
            * join: \`project_details\` is SPARSE (a Project has no row until it
            * is archived or given a status/icon), so an inner join would drop
            * every Project that has never been touched — which is most of them.
            */
           unarchived_area_projects AS (
             SELECT ap.area_id, ap.project_id
             FROM area_projects ap
             LEFT JOIN project_details pd
               ON pd.workspace_id = ? AND pd.entity_id = ap.project_id
             WHERE pd.archived_at IS NULL
           ),
           /*
            * The Area's task universe, for BOTH the total and the completed
            * count, so a percentage derived from them stays coherent:
            *
            *   - Tasks parented DIRECTLY to the Area, always. These belong to
            *     the Area itself and no Project's lifecycle can hide them.
            *   - Tasks under the Area's NON-ARCHIVED Projects. Planned, active,
            *     on-hold and completed Projects all still contribute, exactly
            *     as before; only archived ones drop out, and they drop out
            *     WHOLE — their completed tasks leave with their open ones, so
            *     archiving can never inflate a completion ratio.
            *
            * A grouped aggregate over the whole workspace, joined once — never
            * a per-Area or per-Project follow-up read, and never anything
            * derived from the rows this page happens to return.
            */
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
             FROM unarchived_area_projects ap
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
                  ar.colour_rank,
                  ad.icon_key AS icon_key,
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
           JOIN area_ranks ar ON ar.id = e.id
           LEFT JOIN goal_counts gc ON gc.area_id = e.id
           LEFT JOIN project_counts pc ON pc.area_id = e.id
           LEFT JOIN task_counts tc ON tc.area_id = e.id
           LEFT JOIN area_details ad
             ON ad.workspace_id = e.workspace_id AND ad.entity_id = e.id
           WHERE e.workspace_id = ? AND e.type = '${AREA}' AND e.deleted_at IS NULL
                 AND ad.archived_at IS NULL${cursorClause}
           ORDER BY e.created_at ASC, e.id ASC
           LIMIT ?`,
        )
        .bind(
          /*
           * Twelve workspace binds, in CTE order — the placeholders are
           * positional, so this list and the query above have to be read
           * together:
           *   area_ranks 1 · active_goals 1 · goal_counts 1 ·
           *   area_projects 2 · project_counts 2 ·
           *   unarchived_area_projects 1 · area_tasks 2 · task_counts 1 ·
           *   the outer SELECT 1.
           */
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
          // AREA-05: an ARCHIVED Area stays directly readable by its canonical
          // URL (the record page labels it and guards its mutations), so this read
          // deliberately does NOT filter on `area_details.archived_at` — only on
          // soft-delete. The archival timestamp is joined so the record can render
          // its lifecycle state.
          // UIX-02 — the record carries its own `colour_rank`, so the Area's
          // identity mark on its record is the SAME colour the gallery drew.
          // Without it the one screen dedicated to a single Area was the one
          // screen on which that Area had no identity.
          //
          // Expressed as a COUNT of the Areas that sort before this one, which
          // is exactly `ROW_NUMBER() OVER (ORDER BY created_at, id) - 1` for
          // this row — the identical ADR-068 ordering `listAreas` computes with
          // a window function — without making a single-record read build the
          // whole ranking CTE. It runs on `entities_workspace_type_created_idx`.
          `SELECT e.id, e.workspace_id, e.title, e.created_at, e.updated_at,
                  ad.archived_at AS archived_at,
                  (SELECT COUNT(*)
                     FROM entities r
                    WHERE r.workspace_id = e.workspace_id
                      AND r.type = '${AREA}'
                      AND (r.created_at < e.created_at
                           OR (r.created_at = e.created_at AND r.id < e.id))
                  ) AS colour_rank
           FROM entities e
           JOIN spine_records sr
             ON sr.workspace_id = e.workspace_id AND sr.entity_id = e.id
           LEFT JOIN area_details ad
             ON ad.workspace_id = e.workspace_id AND ad.entity_id = e.id
           WHERE e.workspace_id = ? AND e.id = ? AND e.type = '${AREA}'
                 AND e.deleted_at IS NULL
           LIMIT 1`,
        )
        .bind(this.#workspaceId, areaId),
    );
    const row = ((result.results ?? []) as AreaOverviewRow[])[0];
    return row ? this.#toAreaOverview(row) : null;
  }

  async getAreaDependencySummary(
    areaId: string,
  ): Promise<AreaDependencySummary> {
    const id = validateSpineId(areaId, "id");
    // Count the ACTIVE links referencing the Area, grouped by what they attach.
    // The three `*.belongs_to_area` types (Area is always the target) are the
    // structural children; every OTHER active link is classified by its
    // counterpart entity's type (Note / Diary / anything else). This is the SAME
    // "genuinely empty" boundary the SpineRepository re-checks atomically at delete
    // time — `total === 0` iff no active link references the Area — so a summary of
    // zero and a successful delete can never disagree except across a real
    // concurrent change (which the trusted re-check catches).
    const structural = `'${GOAL_BELONGS_TO_AREA}', '${PROJECT_BELONGS_TO_AREA}', '${TASK_BELONGS_TO_AREA}'`;
    const result = await this.#run(
      this.#db
        .prepare(
          `SELECT
             SUM(CASE WHEN l.type = '${GOAL_BELONGS_TO_AREA}' THEN 1 ELSE 0 END) AS goals,
             SUM(CASE WHEN l.type = '${PROJECT_BELONGS_TO_AREA}' THEN 1 ELSE 0 END) AS projects,
             SUM(CASE WHEN l.type = '${TASK_BELONGS_TO_AREA}' THEN 1 ELSE 0 END) AS tasks,
             SUM(CASE WHEN l.type NOT IN (${structural}) AND ce.type = '${NOTE_TYPE}' THEN 1 ELSE 0 END) AS notes,
             SUM(CASE WHEN l.type NOT IN (${structural}) AND ce.type = '${DIARY_TYPE}' THEN 1 ELSE 0 END) AS diary,
             SUM(CASE WHEN l.type NOT IN (${structural})
                       AND (ce.type IS NULL OR ce.type NOT IN ('${NOTE_TYPE}', '${DIARY_TYPE}'))
                      THEN 1 ELSE 0 END) AS other
           FROM entity_links l
           LEFT JOIN entities ce
             ON ce.workspace_id = l.workspace_id
                AND ce.id = (CASE WHEN l.target_entity_id = ?
                                  THEN l.source_entity_id ELSE l.target_entity_id END)
           WHERE l.workspace_id = ? AND l.deleted_at IS NULL
             AND (l.target_entity_id = ? OR l.source_entity_id = ?)`,
        )
        .bind(id, this.#workspaceId, id, id),
    );
    const row = ((result.results ?? []) as AreaDependencyRow[])[0];
    const goals = Number(row?.goals ?? 0);
    const projects = Number(row?.projects ?? 0);
    const tasks = Number(row?.tasks ?? 0);
    const notes = Number(row?.notes ?? 0);
    const diary = Number(row?.diary ?? 0);
    const other = Number(row?.other ?? 0);
    const total = goals + projects + tasks + notes + diary + other;
    return {
      areaId: id,
      goals,
      projects,
      tasks,
      notes,
      diary,
      other,
      total,
      deletable: total === 0,
    };
  }

  async listArchivedAreaIds(
    candidateIds: readonly string[],
  ): Promise<readonly string[]> {
    const ids = candidateIds.filter((id) => id.length > 0);
    if (ids.length === 0) {
      return [];
    }
    const placeholders = ids.map(() => "?").join(", ");
    const result = await this.#run(
      this.#db
        .prepare(
          `SELECT ad.entity_id AS id
           FROM area_details ad
           JOIN entities e
             ON e.workspace_id = ad.workspace_id AND e.id = ad.entity_id
                AND e.type = '${AREA}' AND e.deleted_at IS NULL
           WHERE ad.workspace_id = ? AND ad.archived_at IS NOT NULL
             AND ad.entity_id IN (${placeholders})`,
        )
        .bind(this.#workspaceId, ...ids),
    );
    return ((result.results ?? []) as { id: string }[]).map((row) => row.id);
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

  #toAreaOverview(row: AreaOverviewRow): AreaOverview {
    return {
      id: row.id,
      workspaceId: parseWorkspaceId(row.workspace_id),
      title: row.title,
      colourRank: row.colour_rank ?? 0,
      createdAt: fromStorageTimestamp(row.created_at),
      updatedAt: fromStorageTimestamp(row.updated_at),
      archivedAt: row.archived_at
        ? fromStorageTimestamp(row.archived_at)
        : null,
    };
  }

  #toAreaListItem(row: AreaListRow): AreaListItem {
    return {
      ...this.#toAreaOverview(row),
      colourRank: Number(row.colour_rank),
      // Normalised on the way OUT, not only on the way in: a key removed from
      // the vocabulary in a later release, or restored from an older export,
      // must degrade to the Area's default icon rather than reach a component
      // that cannot draw it.
      iconKey: normaliseEntityIconKey(row.icon_key),
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
