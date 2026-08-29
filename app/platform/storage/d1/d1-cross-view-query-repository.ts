/**
 * X-02 — the D1 cross-module query engine.
 *
 * How a saved view actually runs, and the rules it holds itself to:
 *
 *   - **Workspace isolation is in the SQL.** Every statement constrains
 *     `workspace_id = ?` with the context bound at construction. A saved-view id, a
 *     stored filter value or a crafted URL can never widen that.
 *   - **Nothing from a configuration reaches SQL as text.** A config names closed-set
 *     DIMENSIONS; this file maps an already-validated dimension to its OWN trusted
 *     predicate fragment and BINDS every scalar. There is no string interpolation of
 *     any caller value anywhere in this file.
 *   - **Several small bounded queries, not one enormous UNION.** Each scope has its
 *     own predicates and its own indexes; a UNION over six differently-shaped scopes
 *     produces a plan that depends on which filters happened to be applied. One
 *     capped, deterministically ordered read per scope merges in memory instead.
 *   - **No N+1.** Spine anchors are resolved for the WHOLE merged candidate set in a
 *     fixed number of grouped queries, and the derived dimensions (PROJ-02 health,
 *     AREA-03 alignment) reuse those features' own batched facts repositories.
 *   - **Nothing derived is re-derived.** Project health comes from
 *     `evaluateProjectHealth`, Goal alignment from `evaluateGoalAlignment`, and the
 *     REVIEW-03 comparison from REVIEW-03's own stored snapshot. This file computes
 *     no health, no alignment and no Review insight of its own.
 */

import {
  composeGoalAlignmentFacts,
  evaluateGoalAlignment,
  type AlignmentEvaluationContext,
  type AlignmentRepository,
  type GoalAlignmentState,
} from "~/kernel/alignment";
import type { GoalRepository } from "~/kernel/goals";
import {
  evaluateProjectHealth,
  type HealthEvaluationContext,
  type ProjectHealthRepository,
  type ProjectHealthState,
} from "~/kernel/project-health";
import {
  parseReviewInsightSnapshot,
  type ReviewInsightSnapshot,
} from "~/kernel/review-insights";
import {
  GOAL_BELONGS_TO_AREA,
  PROJECT_ADVANCES_GOAL,
  PROJECT_BELONGS_TO_AREA,
  TASK_BELONGS_TO_AREA,
  TASK_BELONGS_TO_PROJECT,
} from "~/kernel/spine";
import {
  CROSS_VIEW_PAGE_LIMIT,
  CROSS_VIEW_SCOPE_CANDIDATE_LIMIT,
  resolveViewScopes,
  type CrossViewConfig,
  type CrossViewPage,
  type CrossViewQueryContext,
  type CrossViewQueryRepository,
  type CrossViewResult,
  type CrossViewResultDetail,
  type UnavailableViewScope,
  type ViewAnchor,
  type ViewScope,
} from "~/kernel/views";
import { canonicalTagKey } from "~/kernel/tags";
import type { WorkspaceContext } from "~/kernel/workspaces";

import { fromStorageTimestamp } from "./database";
import {
  entityTagsProjection,
  parseTagProjection,
  tagFilterPredicate,
} from "./d1-entity-tags";

/** The health states that mean a Project currently needs a look. */
const ATTENTION_HEALTH_STATES: readonly ProjectHealthState[] = [
  "at_risk",
  "stale",
  "blocked",
];

/** The alignment states that mean a Goal currently needs a look. */
const ATTENTION_ALIGNMENT_STATES: readonly GoalAlignmentState[] = [
  "neglected",
  "unreachable",
  "no_structure",
];

/** One SQL fragment plus the values it binds, in order. */
interface Predicate {
  readonly sql: string;
  readonly params: (string | number)[];
}

/** A raw candidate row, before anchors and derived dimensions are attached. */
interface Candidate {
  readonly scope: ViewScope;
  readonly id: string;
  readonly title: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly archived: boolean;
  readonly dueDate: string | null;
  /** The direct structural/link parent id, when the scope has one. */
  readonly parentId: string | null;
  readonly parentKind: "area" | "project" | "goal" | null;
  readonly detail: CrossViewResultDetail;
}

interface CandidateRow {
  readonly id: string;
  readonly title: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly parent_id: string | null;
  readonly parent_type: string | null;
  readonly archived_at: string | null;
  readonly completed_at: string | null;
  readonly due_date: string | null;
  readonly status: string | null;
  readonly priority: string | null;
  readonly time_sector: string | null;
  readonly commitment_state: string | null;
  readonly delegate_to: string | null;
  readonly waiting_since: string | null;
  readonly tags: string | null;
  readonly starts_at: string | null;
  readonly open_actions: number | null;
  readonly review_type: string | null;
  readonly period_start: string | null;
  readonly period_end: string | null;
}

/** How many days "next 7 days" and "due soon" span. */
const DUE_SOON_DAYS = 7;

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map((part) => Number.parseInt(part, 10));
  const stamp = Date.UTC(y, (m ?? 1) - 1, d ?? 1) + days * 86_400_000;
  return new Date(stamp).toISOString().slice(0, 10);
}

/** The ISO-instant lower bound of a relative window's first day (UTC prefix). */
function windowStart(
  todayIso: string,
  weekStartIso: string,
  window: string,
): string {
  switch (window) {
    case "today":
      return todayIso;
    case "this_week":
      return weekStartIso;
    case "last_7_days":
      return addDays(todayIso, -6);
    default:
      return addDays(todayIso, -29);
  }
}

export class D1CrossViewQueryRepository implements CrossViewQueryRepository {
  readonly #db: D1Database;
  readonly #workspaceId: string;
  readonly #health: ProjectHealthRepository | null;
  readonly #goals: GoalRepository | null;
  readonly #alignment: AlignmentRepository | null;

  constructor(
    db: D1Database,
    context: WorkspaceContext,
    derived?: {
      readonly health?: ProjectHealthRepository;
      readonly goals?: GoalRepository;
      readonly alignment?: AlignmentRepository;
    },
  ) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
    this.#health = derived?.health ?? null;
    this.#goals = derived?.goals ?? null;
    this.#alignment = derived?.alignment ?? null;
  }

  async runCrossView(
    config: CrossViewConfig,
    context: CrossViewQueryContext,
  ): Promise<CrossViewPage> {
    const available = new Set(context.availableScopes);
    const resolved = resolveViewScopes(config, context.availableScopes);

    const unavailable: UnavailableViewScope[] = [];
    for (const scope of config.scopes) {
      if (!available.has(scope)) {
        unavailable.push({ scope, reason: "module_hidden" });
      }
    }
    for (const entry of resolved.excluded) {
      unavailable.push({
        scope: entry.scope,
        reason: "unsupported_dimension",
        dimension: entry.dimension,
      });
    }

    // REVIEW-03 boundary. Read, never recomputed: the snapshot IS the record of
    // when the owner declared a period closed.
    //
    // It is read when the view FILTERS on it, and also whenever Projects are in
    // scope — because that is what lets every Project result state how its health
    // compares with the last Review without a second round trip. One bounded,
    // indexed read either way.
    const wantsBoundary =
      config.shared.changedSince === "last_review" ||
      resolved.included.includes("project");
    const boundary = wantsBoundary ? await this.#lastReviewBoundary() : null;
    if (config.shared.changedSince === "last_review" && !boundary) {
      // No completed Review has a snapshot yet, so there is no honest boundary to
      // filter against. Returning everything would silently broaden the query into
      // something the owner did not ask for.
      return {
        results: [],
        bounded: false,
        unavailable,
        changeBoundary: null,
      };
    }

    const changedSinceIso = boundary
      ? `${addDays(boundary.periodEnd, 1)}T00:00:00.000Z`
      : null;

    let bounded = false;
    const candidates: Candidate[] = [];
    for (const scope of resolved.included) {
      const rows = await this.#readScope(
        scope,
        config,
        context,
        changedSinceIso,
      );
      if (rows.length >= CROSS_VIEW_SCOPE_CANDIDATE_LIMIT) bounded = true;
      candidates.push(...rows);
    }

    const withDerived = await this.#applyDerivedDimensions(
      candidates,
      config,
      context,
      boundary?.snapshot ?? null,
    );

    const ordered = sortCandidates(withDerived, config).slice(
      0,
      CROSS_VIEW_PAGE_LIMIT,
    );
    const results = await this.#attachAnchors(ordered);

    return {
      results,
      bounded,
      unavailable,
      changeBoundary: boundary
        ? { periodEnd: boundary.periodEnd, reviewId: boundary.reviewId }
        : null,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* REVIEW-03 boundary                                                      */
  /* ---------------------------------------------------------------------- */

  async #lastReviewBoundary(): Promise<{
    readonly reviewId: string;
    readonly periodEnd: string;
    readonly snapshot: ReviewInsightSnapshot | null;
  } | null> {
    const row = await this.#db
      .prepare(
        `SELECT review_id, period_end, facts_json
           FROM review_insight_snapshots
          WHERE workspace_id = ?
          ORDER BY period_end DESC, captured_at DESC, review_id DESC
          LIMIT 1`,
      )
      .bind(this.#workspaceId)
      .first<{
        readonly review_id: string;
        readonly period_end: string;
        readonly facts_json: string;
      }>();
    if (!row) return null;
    return {
      reviewId: row.review_id,
      periodEnd: row.period_end,
      snapshot: parseReviewInsightSnapshot(row.facts_json),
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Per-scope reads                                                         */
  /* ---------------------------------------------------------------------- */

  async #readScope(
    scope: ViewScope,
    config: CrossViewConfig,
    context: CrossViewQueryContext,
    changedSinceIso: string | null,
  ): Promise<Candidate[]> {
    const source = SCOPE_SOURCES[scope];
    const where: string[] = [];
    const params: (string | number)[] = [];

    const push = (predicate: Predicate | null): void => {
      if (!predicate) return;
      where.push(predicate.sql);
      params.push(...predicate.params);
    };

    const shared = config.shared;

    // Archive. Absent means `exclude`; a scope with no archive column has nothing
    // archived, so `exclude`/`include` are both trivially satisfied there.
    const archiveMode = shared.archived ?? "exclude";
    if (source.archivedColumn) {
      if (archiveMode === "exclude") {
        where.push(`${source.archivedColumn} IS NULL`);
      } else if (archiveMode === "only") {
        where.push(`${source.archivedColumn} IS NOT NULL`);
      }
    }

    if (shared.state && source.completedColumn) {
      where.push(
        shared.state === "open"
          ? `${source.completedColumn} IS NULL`
          : `${source.completedColumn} IS NOT NULL`,
      );
    }

    // HARDEN-06C (F-05) — the window's first DAY, as the instant the owner's day
    // actually begins. See `CrossViewQueryContext.dayStartInstantOf`.
    if (shared.createdWithin) {
      where.push("e.created_at >= ?");
      params.push(
        context
          .dayStartInstantOf(
            windowStart(
              context.todayIso,
              context.weekStartIso,
              shared.createdWithin,
            ),
          )
          .toISOString(),
      );
    }
    if (shared.updatedWithin) {
      where.push("e.updated_at >= ?");
      params.push(
        context
          .dayStartInstantOf(
            windowStart(
              context.todayIso,
              context.weekStartIso,
              shared.updatedWithin,
            ),
          )
          .toISOString(),
      );
    }
    if (changedSinceIso) {
      where.push("e.updated_at >= ?");
      params.push(changedSinceIso);
    }

    if (shared.dueWithin && source.dueColumn) {
      push(dueWindowPredicate(source.dueColumn, shared.dueWithin, context));
    }

    if (shared.areaId) push(areaPredicate(scope, shared.areaId));
    if (shared.goalId) push(goalPredicate(scope, shared.goalId));
    if (shared.projectId) push(projectPredicate(scope, shared.projectId));
    if (shared.linkedToId) push(linkedPredicate(shared.linkedToId));
    if (shared.attention) push(attentionPredicate(scope, context));

    push(modulePredicate(scope, config, context));

    const orderBy = orderExpression(source, config);
    const sql = `
      SELECT ${source.columns}
        FROM entities e
        ${source.joins}
       WHERE e.workspace_id = ?
         AND e.type = '${source.entityType}'
         AND e.deleted_at IS NULL
         ${where.map((clause) => `AND (${clause})`).join("\n         ")}
       ORDER BY ${orderBy}
       LIMIT ?`;

    const result = await this.#db
      .prepare(sql)
      .bind(this.#workspaceId, ...params, CROSS_VIEW_SCOPE_CANDIDATE_LIMIT)
      .all<CandidateRow>();

    return (result.results ?? []).map((row) => toCandidate(scope, row));
  }

  /* ---------------------------------------------------------------------- */
  /* Derived dimensions (PROJ-02 health, AREA-03 alignment, REVIEW-03)       */
  /* ---------------------------------------------------------------------- */

  async #applyDerivedDimensions(
    candidates: readonly Candidate[],
    config: CrossViewConfig,
    context: CrossViewQueryContext,
    snapshot: ReviewInsightSnapshot | null,
  ): Promise<Candidate[]> {
    const projectFilters = config.modules.project;
    const needsHealth =
      Boolean(this.#health) &&
      candidates.some((candidate) => candidate.scope === "project") &&
      (config.shared.attention === true ||
        projectFilters?.health !== undefined ||
        projectFilters?.healthMovedSinceLastReview === true);

    const needsAlignment =
      Boolean(this.#alignment && this.#goals) &&
      candidates.some((candidate) => candidate.scope === "goal") &&
      (config.shared.attention === true ||
        config.modules.goal?.alignment !== undefined);

    if (!needsHealth && !needsAlignment) return [...candidates];

    const healthContext: HealthEvaluationContext = {
      now: context.now,
      todayIso: context.todayIso,
      calendarIsoOf: context.calendarIsoOf,
    };
    const alignmentContext: AlignmentEvaluationContext = healthContext;

    const healthByProject = new Map<string, ProjectHealthState>();
    if (needsHealth && this.#health) {
      const ids = candidates
        .filter((candidate) => candidate.scope === "project")
        .map((candidate) => candidate.id);
      const facts = await this.#health.listProjectHealthFacts(
        ids,
        context.todayIso,
      );
      for (const [id, fact] of facts) {
        healthByProject.set(
          id,
          evaluateProjectHealth(fact, healthContext).state,
        );
      }
    }

    const alignmentByGoal = new Map<string, GoalAlignmentState>();
    if (needsAlignment && this.#alignment && this.#goals) {
      const goals = candidates.filter(
        (candidate) => candidate.scope === "goal",
      );
      const ids = goals.map((candidate) => candidate.id);
      const [contributions, activity] = await Promise.all([
        this.#goals.listGoalProjectContributions(ids),
        this.#alignment.listGoalAlignmentFacts(ids, {
          recentWindowStartIso: context.alignmentRecentWindowStartIso,
        }),
      ]);
      for (const goal of goals) {
        const contribution = contributions.get(goal.id);
        if (!contribution) continue;
        const detail = goal.detail;
        const facts = composeGoalAlignmentFacts({
          goalId: goal.id,
          completedAt:
            detail.kind === "goal" && detail.completed ? goal.updatedAt : null,
          contribution,
          activity: activity.get(goal.id),
        });
        alignmentByGoal.set(
          goal.id,
          evaluateGoalAlignment(facts, alignmentContext).state,
        );
      }
    }

    const snapshotHealth = new Map<string, ProjectHealthState>();
    if (snapshot) {
      for (const project of snapshot.projects) {
        snapshotHealth.set(project.id, project.health);
      }
    }

    const kept: Candidate[] = [];
    for (const candidate of candidates) {
      if (
        candidate.scope === "project" &&
        candidate.detail.kind === "project"
      ) {
        const health = healthByProject.get(candidate.id) ?? null;
        const previous = snapshotHealth.get(candidate.id) ?? null;
        if (needsHealth) {
          if (
            projectFilters?.health !== undefined &&
            health !== projectFilters.health
          ) {
            continue;
          }
          if (
            config.shared.attention === true &&
            (health === null || !ATTENTION_HEALTH_STATES.includes(health))
          ) {
            continue;
          }
          if (
            projectFilters?.healthMovedSinceLastReview === true &&
            (previous === null || health === null || previous === health)
          ) {
            continue;
          }
        }
        kept.push({
          ...candidate,
          detail: {
            ...candidate.detail,
            health,
            healthSinceLastReview: previous,
          },
        });
        continue;
      }

      if (candidate.scope === "goal" && candidate.detail.kind === "goal") {
        const alignment = alignmentByGoal.get(candidate.id) ?? null;
        if (needsAlignment) {
          const wanted = config.modules.goal?.alignment;
          if (wanted !== undefined && alignment !== wanted) continue;
          if (
            config.shared.attention === true &&
            (alignment === null ||
              !ATTENTION_ALIGNMENT_STATES.includes(alignment))
          ) {
            continue;
          }
        }
        kept.push({
          ...candidate,
          detail: { ...candidate.detail, alignment },
        });
        continue;
      }

      kept.push(candidate);
    }
    return kept;
  }

  /* ---------------------------------------------------------------------- */
  /* Anchors                                                                 */
  /* ---------------------------------------------------------------------- */

  /**
   * Resolve the Area / Project / Goal anchors for the WHOLE bounded page in a
   * fixed number of grouped queries: one to title the direct parents, one to walk
   * a Project parent up to its own Area/Goal, and one to find a Note's or
   * Meeting's linked Area/Project. Never one query per row.
   */
  async #attachAnchors(
    candidates: readonly Candidate[],
  ): Promise<readonly CrossViewResult[]> {
    if (candidates.length === 0) return [];

    const linkedScopes = candidates.filter(
      (candidate) =>
        candidate.scope === "note" || candidate.scope === "meeting",
    );
    const linkAnchors = await this.#resolveLinkAnchors(
      linkedScopes.map((candidate) => candidate.id),
    );

    const directIds = new Set<string>();
    for (const candidate of candidates) {
      if (candidate.parentId) directIds.add(candidate.parentId);
    }
    for (const anchors of linkAnchors.values()) {
      if (anchors.area) directIds.add(anchors.area);
      if (anchors.project) directIds.add(anchors.project);
    }

    // A Task under a Project inherits that Project's anchors, and a Project under
    // a Goal inherits that Goal's Area. Both hops are resolved once for every
    // distinct parent, never per row — two grouped reads, whatever the page size.
    const grandparents = await this.#resolveParents([...directIds]);
    const goalIds = new Set<string>();
    for (const anchors of grandparents.values()) {
      if (anchors.area) directIds.add(anchors.area);
      if (anchors.goal) {
        directIds.add(anchors.goal);
        if (!grandparents.has(anchors.goal)) goalIds.add(anchors.goal);
      }
    }
    if (goalIds.size > 0) {
      for (const [id, anchors] of await this.#resolveParents([...goalIds])) {
        grandparents.set(id, anchors);
        if (anchors.area) directIds.add(anchors.area);
      }
    }
    const titles = await this.#resolveTitles([...directIds]);

    const anchorOf = (id: string | null): ViewAnchor | null => {
      if (!id) return null;
      const entry = titles.get(id);
      return entry ? { id, title: entry.title } : null;
    };

    return candidates.map((candidate) => {
      let areaId: string | null = null;
      let projectId: string | null = null;
      let goalId: string | null = null;

      if (candidate.scope === "note" || candidate.scope === "meeting") {
        const linked = linkAnchors.get(candidate.id);
        areaId = linked?.area ?? null;
        projectId = linked?.project ?? null;
      } else if (candidate.parentKind === "area") {
        areaId = candidate.parentId;
      } else if (candidate.parentKind === "project") {
        projectId = candidate.parentId;
      } else if (candidate.parentKind === "goal") {
        goalId = candidate.parentId;
      }

      if (projectId) {
        const inherited = grandparents.get(projectId);
        areaId = areaId ?? inherited?.area ?? null;
        goalId = goalId ?? inherited?.goal ?? null;
      }
      if (goalId && !areaId) {
        areaId = grandparents.get(goalId)?.area ?? null;
      }

      return {
        scope: candidate.scope,
        entityType: candidate.scope,
        id: candidate.id,
        title: candidate.title,
        createdAt: candidate.createdAt,
        updatedAt: candidate.updatedAt,
        area: anchorOf(areaId),
        project: anchorOf(projectId),
        goal: anchorOf(goalId),
        archived: candidate.archived,
        dueDate: candidate.dueDate,
        detail: candidate.detail,
      };
    });
  }

  async #resolveTitles(
    ids: readonly string[],
  ): Promise<Map<string, { readonly title: string }>> {
    const resolved = new Map<string, { readonly title: string }>();
    if (ids.length === 0) return resolved;
    const placeholders = ids.map(() => "?").join(", ");
    const result = await this.#db
      .prepare(
        `SELECT id, title FROM entities
          WHERE workspace_id = ? AND deleted_at IS NULL AND id IN (${placeholders})`,
      )
      .bind(this.#workspaceId, ...ids)
      .all<{ readonly id: string; readonly title: string }>();
    for (const row of result.results ?? []) {
      resolved.set(row.id, { title: row.title });
    }
    return resolved;
  }

  async #resolveParents(
    ids: readonly string[],
  ): Promise<
    Map<string, { readonly area: string | null; readonly goal: string | null }>
  > {
    const resolved = new Map<
      string,
      { readonly area: string | null; readonly goal: string | null }
    >();
    if (ids.length === 0) return resolved;
    const placeholders = ids.map(() => "?").join(", ");
    const result = await this.#db
      .prepare(
        `SELECT source_entity_id, type, target_entity_id
           FROM entity_links
          WHERE workspace_id = ?
            AND deleted_at IS NULL
            AND type IN ('${PROJECT_BELONGS_TO_AREA}', '${PROJECT_ADVANCES_GOAL}', '${GOAL_BELONGS_TO_AREA}')
            AND source_entity_id IN (${placeholders})`,
      )
      .bind(this.#workspaceId, ...ids)
      .all<{
        readonly source_entity_id: string;
        readonly type: string;
        readonly target_entity_id: string;
      }>();
    for (const row of result.results ?? []) {
      const current = resolved.get(row.source_entity_id) ?? {
        area: null,
        goal: null,
      };
      resolved.set(
        row.source_entity_id,
        row.type === PROJECT_ADVANCES_GOAL
          ? { area: current.area, goal: row.target_entity_id }
          : { area: row.target_entity_id, goal: current.goal },
      );
    }
    return resolved;
  }

  /**
   * A Note's or Meeting's Area/Project, through EntityLinks in either direction.
   * Relationships are read from the link graph, never inferred from titles.
   */
  async #resolveLinkAnchors(
    ids: readonly string[],
  ): Promise<
    Map<
      string,
      { readonly area: string | null; readonly project: string | null }
    >
  > {
    const resolved = new Map<
      string,
      { readonly area: string | null; readonly project: string | null }
    >();
    if (ids.length === 0) return resolved;
    const placeholders = ids.map(() => "?").join(", ");
    const result = await this.#db
      .prepare(
        `SELECT l.source_entity_id AS anchor_id, t.id AS other_id, t.type AS other_type
           FROM entity_links l
           JOIN entities t
             ON t.workspace_id = l.workspace_id
            AND t.id = l.target_entity_id
            AND t.deleted_at IS NULL
            AND t.type IN ('area', 'project')
          WHERE l.workspace_id = ? AND l.deleted_at IS NULL
            AND l.source_entity_id IN (${placeholders})
          UNION ALL
         SELECT l.target_entity_id AS anchor_id, s.id AS other_id, s.type AS other_type
           FROM entity_links l
           JOIN entities s
             ON s.workspace_id = l.workspace_id
            AND s.id = l.source_entity_id
            AND s.deleted_at IS NULL
            AND s.type IN ('area', 'project')
          WHERE l.workspace_id = ? AND l.deleted_at IS NULL
            AND l.target_entity_id IN (${placeholders})
          ORDER BY anchor_id, other_type, other_id`,
      )
      .bind(this.#workspaceId, ...ids, this.#workspaceId, ...ids)
      .all<{
        readonly anchor_id: string;
        readonly other_id: string;
        readonly other_type: string;
      }>();
    for (const row of result.results ?? []) {
      const current = resolved.get(row.anchor_id) ?? {
        area: null,
        project: null,
      };
      resolved.set(row.anchor_id, {
        area:
          row.other_type === "area"
            ? (current.area ?? row.other_id)
            : current.area,
        project:
          row.other_type === "project"
            ? (current.project ?? row.other_id)
            : current.project,
      });
    }
    return resolved;
  }
}

/* -------------------------------------------------------------------------- */
/* Scope sources — trusted, constant SQL. No caller value appears here.       */
/* -------------------------------------------------------------------------- */

interface ScopeSource {
  readonly entityType: string;
  readonly columns: string;
  readonly joins: string;
  readonly archivedColumn: string | null;
  readonly completedColumn: string | null;
  readonly dueColumn: string | null;
}

const NULL_COLUMNS = [
  "NULL AS archived_at",
  "NULL AS completed_at",
  "NULL AS due_date",
  "NULL AS status",
  "NULL AS priority",
  "NULL AS time_sector",
  "NULL AS commitment_state",
  "NULL AS delegate_to",
  "NULL AS waiting_since",
  "NULL AS tags",
  "NULL AS starts_at",
  "NULL AS open_actions",
  "NULL AS review_type",
  "NULL AS period_start",
  "NULL AS period_end",
];

/** Build a scope's SELECT list: the shared header, then only its own columns. */
function columns(overrides: Record<string, string>): string {
  const base = [
    "e.id AS id",
    "e.title AS title",
    "e.created_at AS created_at",
    "e.updated_at AS updated_at",
    "NULL AS parent_id",
    "NULL AS parent_type",
    ...NULL_COLUMNS,
  ];
  return base
    .map((column) => {
      const alias = column.slice(column.lastIndexOf(" AS ") + 4);
      return overrides[alias] ? `${overrides[alias]} AS ${alias}` : column;
    })
    .join(", ");
}

const SPINE_PARENT_JOIN = (types: readonly string[]) => `
  LEFT JOIN entity_links pl
    ON pl.workspace_id = e.workspace_id
   AND pl.source_entity_id = e.id
   AND pl.deleted_at IS NULL
   AND pl.type IN (${types.map((type) => `'${type}'`).join(", ")})
  LEFT JOIN entities pe
    ON pe.workspace_id = pl.workspace_id
   AND pe.id = pl.target_entity_id
   AND pe.deleted_at IS NULL`;

const SCOPE_SOURCES: Readonly<Record<ViewScope, ScopeSource>> = {
  task: {
    entityType: "task",
    columns: columns({
      parent_id: "pl.target_entity_id",
      parent_type: "pe.type",
      completed_at: "sr.completed_at",
      due_date: "td.due_date",
      status: "COALESCE(td.status, 'todo')",
      priority: "td.priority",
      time_sector: "td.time_sector",
      commitment_state: "COALESCE(td.commitment_state, 'active')",
      delegate_to: "td.delegate_to",
      waiting_since: "td.waiting_since",
    }),
    joins: `
      JOIN spine_records sr
        ON sr.workspace_id = e.workspace_id AND sr.entity_id = e.id AND sr.kind = 'task'
      LEFT JOIN task_details td
        ON td.workspace_id = e.workspace_id AND td.entity_id = e.id
      ${SPINE_PARENT_JOIN([TASK_BELONGS_TO_PROJECT, TASK_BELONGS_TO_AREA])}`,
    archivedColumn: null,
    completedColumn: "sr.completed_at",
    dueColumn: "td.due_date",
  },
  project: {
    entityType: "project",
    columns: columns({
      parent_id: "pl.target_entity_id",
      parent_type: "pe.type",
      completed_at: "sr.completed_at",
      archived_at: "pd.archived_at",
      status: "COALESCE(pd.status, 'active')",
    }),
    joins: `
      JOIN spine_records sr
        ON sr.workspace_id = e.workspace_id AND sr.entity_id = e.id AND sr.kind = 'project'
      LEFT JOIN project_details pd
        ON pd.workspace_id = e.workspace_id AND pd.entity_id = e.id
      ${SPINE_PARENT_JOIN([PROJECT_BELONGS_TO_AREA, PROJECT_ADVANCES_GOAL])}`,
    archivedColumn: "pd.archived_at",
    completedColumn: "sr.completed_at",
    dueColumn: null,
  },
  goal: {
    entityType: "goal",
    columns: columns({
      parent_id: "pl.target_entity_id",
      parent_type: "pe.type",
      completed_at: "sr.completed_at",
      due_date: "gd.target_date",
    }),
    joins: `
      JOIN spine_records sr
        ON sr.workspace_id = e.workspace_id AND sr.entity_id = e.id AND sr.kind = 'goal'
      LEFT JOIN goal_details gd
        ON gd.workspace_id = e.workspace_id AND gd.entity_id = e.id
      ${SPINE_PARENT_JOIN([GOAL_BELONGS_TO_AREA])}`,
    archivedColumn: null,
    completedColumn: "sr.completed_at",
    dueColumn: "gd.target_date",
  },
  note: {
    entityType: "note",
    columns: columns({
      archived_at: "nd.archived_at",
      tags: entityTagsProjection("e", "id"),
    }),
    joins: `
      LEFT JOIN note_details nd
        ON nd.workspace_id = e.workspace_id AND nd.entity_id = e.id`,
    archivedColumn: "nd.archived_at",
    completedColumn: null,
    dueColumn: null,
  },
  meeting: {
    entityType: "meeting",
    columns: columns({
      archived_at: "md.archived_at",
      status: "md.status",
      starts_at: "md.starts_at",
      due_date: "substr(md.starts_at, 1, 10)",
      completed_at: `CASE WHEN md.status = 'planned' THEN NULL ELSE md.starts_at END`,
      open_actions: `(
        SELECT COUNT(*) FROM meeting_items mi
         WHERE mi.workspace_id = e.workspace_id
           AND mi.meeting_id = e.id
           AND mi.kind = 'action'
           AND NOT EXISTS (
             SELECT 1 FROM meeting_item_tasks mit
              JOIN spine_records tsr
                ON tsr.workspace_id = mit.workspace_id
               AND tsr.entity_id = mit.task_id
             WHERE mit.workspace_id = mi.workspace_id
               AND mit.item_id = mi.id
               AND tsr.completed_at IS NOT NULL
           )
      )`,
    }),
    joins: `
      JOIN meeting_details md
        ON md.workspace_id = e.workspace_id AND md.entity_id = e.id`,
    archivedColumn: "md.archived_at",
    completedColumn: `CASE WHEN md.status = 'planned' THEN NULL ELSE md.starts_at END`,
    dueColumn: "substr(md.starts_at, 1, 10)",
  },
  review: {
    entityType: "review",
    columns: columns({
      archived_at: "rd.archived_at",
      completed_at: "rd.completed_at",
      status: "rd.status",
      review_type: "rd.review_type",
      period_start: "rd.period_start",
      period_end: "rd.period_end",
      due_date: "rd.period_end",
    }),
    joins: `
      JOIN review_details rd
        ON rd.workspace_id = e.workspace_id AND rd.entity_id = e.id`,
    archivedColumn: "rd.archived_at",
    completedColumn: "rd.completed_at",
    dueColumn: "rd.period_end",
  },
};

/* -------------------------------------------------------------------------- */
/* Predicates — one trusted fragment per validated dimension                  */
/* -------------------------------------------------------------------------- */

const ACTIVE_LINK = "deleted_at IS NULL";

function areaPredicate(scope: ViewScope, areaId: string): Predicate | null {
  switch (scope) {
    case "task":
      // A Task is "in" an Area if its structural parent is that Area, OR its
      // parent Project belongs to that Area — the same rule TASKS-03 applies.
      return {
        sql: `EXISTS (SELECT 1 FROM entity_links tal
                       WHERE tal.workspace_id = e.workspace_id AND tal.source_entity_id = e.id
                         AND tal.${ACTIVE_LINK} AND tal.type = '${TASK_BELONGS_TO_AREA}'
                         AND tal.target_entity_id = ?)
              OR EXISTS (SELECT 1 FROM entity_links tpl
                          JOIN entity_links pal
                            ON pal.workspace_id = tpl.workspace_id
                           AND pal.source_entity_id = tpl.target_entity_id
                           AND pal.${ACTIVE_LINK} AND pal.type = '${PROJECT_BELONGS_TO_AREA}'
                         WHERE tpl.workspace_id = e.workspace_id AND tpl.source_entity_id = e.id
                           AND tpl.${ACTIVE_LINK} AND tpl.type = '${TASK_BELONGS_TO_PROJECT}'
                           AND pal.target_entity_id = ?)`,
        params: [areaId, areaId],
      };
    case "project":
      return {
        sql: `EXISTS (SELECT 1 FROM entity_links pal
                       WHERE pal.workspace_id = e.workspace_id AND pal.source_entity_id = e.id
                         AND pal.${ACTIVE_LINK} AND pal.type = '${PROJECT_BELONGS_TO_AREA}'
                         AND pal.target_entity_id = ?)
              OR EXISTS (SELECT 1 FROM entity_links pgl
                          JOIN entity_links gal
                            ON gal.workspace_id = pgl.workspace_id
                           AND gal.source_entity_id = pgl.target_entity_id
                           AND gal.${ACTIVE_LINK} AND gal.type = '${GOAL_BELONGS_TO_AREA}'
                         WHERE pgl.workspace_id = e.workspace_id AND pgl.source_entity_id = e.id
                           AND pgl.${ACTIVE_LINK} AND pgl.type = '${PROJECT_ADVANCES_GOAL}'
                           AND gal.target_entity_id = ?)`,
        params: [areaId, areaId],
      };
    case "goal":
      return {
        sql: `EXISTS (SELECT 1 FROM entity_links gal
                       WHERE gal.workspace_id = e.workspace_id AND gal.source_entity_id = e.id
                         AND gal.${ACTIVE_LINK} AND gal.type = '${GOAL_BELONGS_TO_AREA}'
                         AND gal.target_entity_id = ?)`,
        params: [areaId],
      };
    default:
      // Notes and Meetings reach an Area through the universal link graph, in
      // either direction — the SAME EntityLinks the Linked Items section shows.
      return linkedPredicate(areaId);
  }
}

function goalPredicate(scope: ViewScope, goalId: string): Predicate | null {
  switch (scope) {
    case "task":
      return {
        sql: `EXISTS (SELECT 1 FROM entity_links tpl
                       JOIN entity_links pgl
                         ON pgl.workspace_id = tpl.workspace_id
                        AND pgl.source_entity_id = tpl.target_entity_id
                        AND pgl.${ACTIVE_LINK} AND pgl.type = '${PROJECT_ADVANCES_GOAL}'
                      WHERE tpl.workspace_id = e.workspace_id AND tpl.source_entity_id = e.id
                        AND tpl.${ACTIVE_LINK} AND tpl.type = '${TASK_BELONGS_TO_PROJECT}'
                        AND pgl.target_entity_id = ?)`,
        params: [goalId],
      };
    case "project":
      return {
        sql: `EXISTS (SELECT 1 FROM entity_links pgl
                       WHERE pgl.workspace_id = e.workspace_id AND pgl.source_entity_id = e.id
                         AND pgl.${ACTIVE_LINK} AND pgl.type = '${PROJECT_ADVANCES_GOAL}'
                         AND pgl.target_entity_id = ?)`,
        params: [goalId],
      };
    /* v8 ignore next 2 -- unreachable: no other scope declares goal support. */
    default:
      return null;
  }
}

function projectPredicate(
  scope: ViewScope,
  projectId: string,
): Predicate | null {
  if (scope === "task") {
    return {
      sql: `EXISTS (SELECT 1 FROM entity_links tpl
                     WHERE tpl.workspace_id = e.workspace_id AND tpl.source_entity_id = e.id
                       AND tpl.${ACTIVE_LINK} AND tpl.type = '${TASK_BELONGS_TO_PROJECT}'
                       AND tpl.target_entity_id = ?)`,
      params: [projectId],
    };
  }
  return linkedPredicate(projectId);
}

/** Any ACTIVE EntityLink between this record and the given one, either direction. */
function linkedPredicate(targetId: string): Predicate {
  return {
    sql: `EXISTS (SELECT 1 FROM entity_links ul
                   WHERE ul.workspace_id = e.workspace_id AND ul.${ACTIVE_LINK}
                     AND ((ul.source_entity_id = e.id AND ul.target_entity_id = ?)
                       OR (ul.target_entity_id = e.id AND ul.source_entity_id = ?)))`,
    params: [targetId, targetId],
  };
}

function dueWindowPredicate(
  column: string,
  window: string,
  context: CrossViewQueryContext,
): Predicate {
  switch (window) {
    case "overdue":
      return {
        sql: `${column} IS NOT NULL AND ${column} < ?`,
        params: [context.todayIso],
      };
    case "today":
      return { sql: `${column} = ?`, params: [context.todayIso] };
    case "this_week":
      return {
        sql: `${column} IS NOT NULL AND ${column} >= ? AND ${column} <= ?`,
        params: [context.weekStartIso, context.weekEndIso],
      };
    default:
      return {
        sql: `${column} IS NOT NULL AND ${column} >= ? AND ${column} <= ?`,
        params: [context.todayIso, addDays(context.todayIso, DUE_SOON_DAYS)],
      };
  }
}

/**
 * "Needs attention", stated per scope in that module's own terms. Nothing here is
 * a score: each clause is a plain fact the surface can name back to the owner.
 *
 * Projects and Goals carry only their OPEN precondition in SQL; their derived
 * PROJ-02 health and AREA-03 alignment are applied afterwards over the bounded
 * candidate set, by those features' own evaluators.
 */
function attentionPredicate(
  scope: ViewScope,
  context: CrossViewQueryContext,
): Predicate | null {
  switch (scope) {
    case "task":
      return {
        sql: `sr.completed_at IS NULL
              AND (
                (td.due_date IS NOT NULL AND td.due_date <= ?)
                OR td.waiting_since IS NOT NULL
              )`,
        params: [context.todayIso],
      };
    case "project":
      return { sql: "sr.completed_at IS NULL", params: [] };
    case "goal":
      return { sql: "sr.completed_at IS NULL", params: [] };
    case "meeting":
      return {
        sql: `(md.status = 'planned' AND substr(md.starts_at, 1, 10) < ?)
              OR (
                SELECT COUNT(*) FROM meeting_items mi
                 WHERE mi.workspace_id = e.workspace_id
                   AND mi.meeting_id = e.id
                   AND mi.kind = 'action'
                   AND NOT EXISTS (
                     SELECT 1 FROM meeting_item_tasks mit
                      JOIN spine_records tsr
                        ON tsr.workspace_id = mit.workspace_id
                       AND tsr.entity_id = mit.task_id
                     WHERE mit.workspace_id = mi.workspace_id
                       AND mit.item_id = mi.id
                       AND tsr.completed_at IS NOT NULL
                   )
              ) > 0`,
        params: [context.todayIso],
      };
    /* v8 ignore next 2 -- the closed set ends here; `note` declares no support. */
    default:
      return {
        sql: `rd.status <> 'completed' AND rd.period_end < ?`,
        params: [context.todayIso],
      };
  }
}

/** The module-specific dimensions for one scope, all bound. */
function modulePredicate(
  scope: ViewScope,
  config: CrossViewConfig,
  context: CrossViewQueryContext,
): Predicate | null {
  const clauses: string[] = [];
  const params: (string | number)[] = [];

  if (scope === "task") {
    const filters = config.modules.task;
    if (!filters) return null;
    if (filters.priority === "__none") clauses.push("td.priority IS NULL");
    else if (filters.priority) {
      clauses.push("td.priority = ?");
      params.push(filters.priority);
    }
    if (filters.timeSector === "__none") clauses.push("td.time_sector IS NULL");
    else if (filters.timeSector) {
      clauses.push("td.time_sector = ?");
      params.push(filters.timeSector);
    }
    if (filters.status) {
      clauses.push("COALESCE(td.status, 'todo') = ?");
      params.push(filters.status);
    }
    if (filters.waiting) clauses.push("td.waiting_since IS NOT NULL");
    if (filters.delegated) clauses.push("td.delegate_to IS NOT NULL");
    if (filters.someday) {
      clauses.push("COALESCE(td.commitment_state, 'active') = 'someday'");
    }
  } else if (scope === "project") {
    const filters = config.modules.project;
    if (!filters?.workflowStatus) return null;
    clauses.push("COALESCE(pd.status, 'active') = ?");
    params.push(filters.workflowStatus);
  } else if (scope === "note") {
    const tag = config.modules.note?.tag;
    if (!tag) return null;
    // FIND-02 — membership is an EXACT canonical-key match against the workspace
    // vocabulary, as a semi-join, with the value BOUND. It replaces the
    // `json_each` membership test over the old JSON column and now folds case,
    // so a saved view naming `Errand` finds a Note tagged `errand`.
    const predicate = tagFilterPredicate("e", [canonicalTagKey(tag)], "id");
    clauses.push(predicate.sql);
    params.push(...predicate.params);
  } else if (scope === "meeting") {
    const filters = config.modules.meeting;
    if (!filters) return null;
    if (filters.status) {
      clauses.push("md.status = ?");
      params.push(filters.status);
    }
    if (filters.when) {
      clauses.push(
        filters.when === "upcoming"
          ? "substr(md.starts_at, 1, 10) >= ?"
          : "substr(md.starts_at, 1, 10) < ?",
      );
      params.push(context.todayIso);
    }
  } else if (scope === "review") {
    const filters = config.modules.review;
    if (!filters) return null;
    if (filters.reviewType) {
      clauses.push("rd.review_type = ?");
      params.push(filters.reviewType);
    }
    if (filters.status) {
      clauses.push("rd.status = ?");
      params.push(filters.status);
    }
  }

  if (clauses.length === 0) return null;
  return { sql: clauses.join(" AND "), params };
}

/* -------------------------------------------------------------------------- */
/* Ordering and merging                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The per-scope ORDER BY. It matches the in-memory merge comparator exactly, so
 * the rows each scope contributes are the ones the merge would have kept — a
 * different order here would silently change WHICH records a bounded view shows.
 */
function orderExpression(source: ScopeSource, config: CrossViewConfig): string {
  const direction = config.direction === "asc" ? "ASC" : "DESC";
  switch (config.sort) {
    case "created":
      return `e.created_at ${direction}, e.id ASC`;
    case "title":
      return `lower(e.title) ${direction}, e.id ASC`;
    case "due": {
      // Records with no due-shaped date sort LAST in both directions: "no date" is
      // not "the earliest date", and pretending otherwise buries dated work.
      const column = source.dueColumn ?? "NULL";
      return `(CASE WHEN ${column} IS NULL THEN 1 ELSE 0 END) ASC, ${column} ${direction}, e.id ASC`;
    }
    default:
      return `e.updated_at ${direction}, e.id ASC`;
  }
}

function sortKey(candidate: Candidate, config: CrossViewConfig): string {
  switch (config.sort) {
    case "created":
      return candidate.createdAt.toISOString();
    case "title":
      return candidate.title.toLowerCase();
    case "due":
      return candidate.dueDate ?? "";
    default:
      return candidate.updatedAt.toISOString();
  }
}

function sortCandidates(
  candidates: readonly Candidate[],
  config: CrossViewConfig,
): Candidate[] {
  const factor = config.direction === "asc" ? 1 : -1;
  return [...candidates].sort((a, b) => {
    if (config.sort === "due") {
      const aMissing = a.dueDate === null ? 1 : 0;
      const bMissing = b.dueDate === null ? 1 : 0;
      if (aMissing !== bMissing) return aMissing - bMissing;
    }
    const keyA = sortKey(a, config);
    const keyB = sortKey(b, config);
    if (keyA !== keyB) return keyA < keyB ? -factor : factor;
    // A total order, ending in the immutable id, so two runs of the same view over
    // unchanged data always produce the same page.
    if (a.scope !== b.scope) return a.scope < b.scope ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/* -------------------------------------------------------------------------- */
/* Row mapping                                                                */
/* -------------------------------------------------------------------------- */

function toCandidate(scope: ViewScope, row: CandidateRow): Candidate {
  const createdAt = fromStorageTimestamp(row.created_at);
  const updatedAt = fromStorageTimestamp(row.updated_at);
  const parentKind =
    row.parent_type === "area" ||
    row.parent_type === "project" ||
    row.parent_type === "goal"
      ? row.parent_type
      : null;

  let detail: CrossViewResultDetail;
  switch (scope) {
    case "task":
      detail = {
        kind: "task",
        status: (row.status ?? "todo") as never,
        priority: (row.priority ?? null) as never,
        timeSector: (row.time_sector ?? null) as never,
        completed: row.completed_at !== null,
        waiting: row.waiting_since !== null,
        delegatedTo: row.delegate_to,
        someday: row.commitment_state === "someday",
      };
      break;
    case "project":
      detail = {
        kind: "project",
        workflowStatus: (row.status ?? "active") as never,
        completed: row.completed_at !== null,
        health: null,
        healthSinceLastReview: null,
      };
      break;
    case "goal":
      detail = {
        kind: "goal",
        completed: row.completed_at !== null,
        alignment: null,
        targetDate: row.due_date,
      };
      break;
    case "note":
      detail = { kind: "note", tags: parseTagProjection(row.tags) };
      break;
    case "meeting":
      detail = {
        kind: "meeting",
        status: (row.status ?? "planned") as never,
        startsAt: fromStorageTimestamp(row.starts_at ?? row.updated_at),
        openActions: row.open_actions ?? 0,
      };
      break;
    default:
      detail = {
        kind: "review",
        reviewType: (row.review_type ?? "custom") as never,
        status: (row.status ?? "draft") as never,
        periodStart: row.period_start ?? "",
        periodEnd: row.period_end ?? "",
      };
  }

  return {
    scope,
    id: row.id,
    title: row.title,
    createdAt,
    updatedAt,
    archived: row.archived_at !== null,
    dueDate: row.due_date,
    parentId: row.parent_id,
    parentKind,
    detail,
  };
}
