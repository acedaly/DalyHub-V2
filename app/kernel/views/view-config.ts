/**
 * X-02 — the shared, declarative CROSS-MODULE view configuration (pure,
 * storage-independent).
 *
 * This is the Tasks configuration model (ADR-059) generalised, not a second
 * filtering architecture. It keeps every rule that made a Task saved view safe to
 * persist and safe to restore from an untrusted URL, and adds exactly one idea: a
 * view names a SET of entity scopes rather than assuming Tasks.
 *
 *   1. **Declarative, never a query.** A config names SCOPES and FILTER DIMENSIONS
 *      from closed sets. It can never carry a table, a column, an operator or a SQL
 *      fragment; the repository maps an already-validated dimension to its OWN
 *      trusted predicate, and every scalar is bound.
 *   2. **Total, lenient parsing.** `parseCrossViewConfig` never throws on values:
 *      an unknown key, a removed dimension, a scope this build no longer knows or a
 *      value from a FUTURE version is dropped and the rest is kept. A view saved by
 *      a later build degrades to the parts this build understands.
 *   3. **Canonical on write.** The write path stores the re-serialised, validated
 *      config, so only known keys with known values are ever persisted.
 *
 * The dimensions are split deliberately (ROADMAP X-02 §5):
 *   - **SHARED** dimensions mean the same thing across more than one scope — the
 *     Area/Goal/Project spine, lifecycle, dates, attention, archive state. Each one
 *     declares which scopes SUPPORT it (`SHARED_DIMENSION_SUPPORT`), because
 *     pretending a field exists everywhere is how a cross-module query starts
 *     lying. Applying a dimension a scope cannot answer REMOVES that scope from the
 *     query and says so — it never silently broadens the result.
 *   - **MODULE** dimensions stay strongly typed per scope, in that module's own
 *     vocabulary (a Task priority, a Project health, a Review type).
 */

import type { GoalAlignmentState } from "~/kernel/alignment";
import { GOAL_ALIGNMENT_STATES } from "~/kernel/alignment";
import type { MeetingStatus } from "~/kernel/meetings";
import type { ProjectHealthState } from "~/kernel/project-health";
import { PROJECT_HEALTH_STATES } from "~/kernel/project-health";
import type { ReviewStatus, ReviewType } from "~/kernel/reviews";
import { REVIEW_STATUSES, REVIEW_TYPES } from "~/kernel/reviews";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  TIME_SECTORS,
  type TaskPriority,
  type TaskStatus,
  type TimeSector,
} from "~/kernel/tasks";

import { VIEW_SCOPES, type ViewScope } from "./view-scopes";

/** The current config format version. Bump only for a shape change, not a new key. */
export const CROSS_VIEW_CONFIG_VERSION = 1;

/* -------------------------------------------------------------------------- */
/* Shared dimension vocabularies                                              */
/* -------------------------------------------------------------------------- */

/**
 * The relative "recently" windows. They are resolved against the OWNER's calendar
 * day by the caller (`~/shared/datetime`), never against the server's clock and
 * never re-defined here — X-02 introduces no second definition of "today"
 * (ROADMAP X-02 §22).
 */
export const VIEW_DATE_WINDOWS = [
  "today",
  "this_week",
  "last_7_days",
  "last_30_days",
] as const;
export type ViewDateWindow = (typeof VIEW_DATE_WINDOWS)[number];

/** The forward-looking date windows, for scopes that carry a due-shaped date. */
export const VIEW_DUE_WINDOWS = [
  "overdue",
  "today",
  "this_week",
  "next_7_days",
] as const;
export type ViewDueWindow = (typeof VIEW_DUE_WINDOWS)[number];

/**
 * How archived records participate. `exclude` is the default everywhere, so a
 * saved view never surprises the owner with filed-away records; `only` is the
 * explicit "show me what I archived" view. Soft-DELETED records are not a mode:
 * they are excluded unconditionally and there is no configuration that can
 * include them.
 */
export const VIEW_ARCHIVE_MODES = ["exclude", "include", "only"] as const;
export type ViewArchiveMode = (typeof VIEW_ARCHIVE_MODES)[number];

/** The shared lifecycle axis: is this record still live work, or finished? */
export const VIEW_STATES = ["open", "closed"] as const;
export type ViewState = (typeof VIEW_STATES)[number];

/**
 * REVIEW-03 integration. `last_review` resolves to the period end of the most
 * recent COMPLETED Review that has an insight snapshot — REVIEW-03's own recorded
 * boundary, read rather than recomputed. When no snapshot exists the dimension
 * resolves to "no boundary", the query says so, and nothing is fabricated.
 */
export const VIEW_CHANGE_BOUNDARIES = ["last_review"] as const;
export type ViewChangeBoundary = (typeof VIEW_CHANGE_BOUNDARIES)[number];

export const VIEW_SORTS = ["updated", "created", "due", "title"] as const;
export type ViewSort = (typeof VIEW_SORTS)[number];

export const VIEW_SORT_DIRECTIONS = ["desc", "asc"] as const;
export type ViewSortDirection = (typeof VIEW_SORT_DIRECTIONS)[number];

/** How results are banded. `entity` is the cross-module default reading order. */
export const VIEW_GROUP_BYS = ["none", "entity"] as const;
export type ViewGroupBy = (typeof VIEW_GROUP_BYS)[number];

/** The maximum length of an entity-id filter value (mirrors `ID_MAX_LENGTH`). */
export const VIEW_ID_MAX_LENGTH = 128;
/** The maximum length of a free-text dimension value (a Note tag). */
export const VIEW_TEXT_MAX_LENGTH = 80;

/* -------------------------------------------------------------------------- */
/* Shared filters                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Dimensions that mean the same thing across more than one scope.
 *
 * `undefined` is "no filter"; there is deliberately no "all"/"any" sentinel, so
 * absence and a wildcard can never disagree.
 */
export interface SharedViewFilters {
  /** The Area anchor, resolved through the spine wherever the relationship exists. */
  readonly areaId?: string;
  /** The Goal anchor. */
  readonly goalId?: string;
  /** The Project anchor. */
  readonly projectId?: string;
  /** Any active EntityLink to this record, in either direction. */
  readonly linkedToId?: string;
  /** Open (live work) or closed (completed/finished). */
  readonly state?: ViewState;
  /** Records whose module says they currently need attention. */
  readonly attention?: true;
  readonly createdWithin?: ViewDateWindow;
  readonly updatedWithin?: ViewDateWindow;
  /** A due-shaped date window, for scopes that carry one. */
  readonly dueWithin?: ViewDueWindow;
  /** How archived records participate. Absent means `exclude`. */
  readonly archived?: ViewArchiveMode;
  /** Meaningfully changed since a derived boundary (REVIEW-03). */
  readonly changedSince?: ViewChangeBoundary;
}

/** The canonical shared-filter key order — the one place the key set is enumerated. */
export const SHARED_VIEW_FILTER_KEYS = [
  "areaId",
  "goalId",
  "projectId",
  "linkedToId",
  "state",
  "attention",
  "createdWithin",
  "updatedWithin",
  "dueWithin",
  "archived",
  "changedSince",
] as const satisfies readonly (keyof SharedViewFilters)[];

/**
 * Which scopes can answer each shared dimension.
 *
 * This is the honest half of "cross-module": a Note has no due date and no
 * open/closed state, and a Task has no archive state of its own. A view that
 * applies such a dimension DROPS the scopes that cannot answer it and reports them,
 * rather than either inventing a value or quietly widening the query
 * (ROADMAP X-02 §5, §25).
 *
 * `archived` is absent from this map on purpose: `exclude`/`include` are answerable
 * by every scope (a scope with no archive column simply has nothing archived), and
 * only `archived: "only"` narrows to the scopes that have one — handled where the
 * mode is known, not by a blanket entry here.
 */
export const SHARED_DIMENSION_SUPPORT: Readonly<
  Record<Exclude<keyof SharedViewFilters, "archived">, readonly ViewScope[]>
> = {
  areaId: ["task", "project", "goal", "note", "meeting"],
  goalId: ["task", "project"],
  projectId: ["task", "note", "meeting"],
  linkedToId: ["task", "project", "goal", "note", "meeting", "review"],
  state: ["task", "project", "goal", "meeting", "review"],
  attention: ["task", "project", "goal", "meeting", "review"],
  createdWithin: ["task", "project", "goal", "note", "meeting", "review"],
  updatedWithin: ["task", "project", "goal", "note", "meeting", "review"],
  dueWithin: ["task", "goal", "meeting", "review"],
  changedSince: ["task", "project", "goal", "note", "meeting", "review"],
};

/** The scopes whose module owns an archive lifecycle of its own. */
export const ARCHIVABLE_VIEW_SCOPES: readonly ViewScope[] = [
  "project",
  "note",
  "meeting",
  "review",
];

/* -------------------------------------------------------------------------- */
/* Module-specific filters (strongly typed, never generalised away)           */
/* -------------------------------------------------------------------------- */

/** Tasks: TASKS-01/TASKS-03 vocabulary, unchanged. */
export interface TaskScopeFilters {
  readonly priority?: TaskPriority | "__none";
  readonly timeSector?: TimeSector | "__none";
  readonly status?: TaskStatus;
  readonly waiting?: true;
  readonly delegated?: true;
  readonly someday?: true;
}

/** Projects: PROJ-05 workflow status and PROJ-02 derived health. */
export interface ProjectScopeFilters {
  readonly workflowStatus?: "planned" | "active" | "on_hold";
  readonly health?: ProjectHealthState;
  /**
   * REVIEW-03 integration: Projects whose PROJ-02 health has MOVED since the last
   * completed Review's insight snapshot (improved or worsened, in either
   * direction). The comparison is REVIEW-03's own `classifyProjectHealthChange`,
   * read from its snapshot — never a second derivation.
   */
  readonly healthMovedSinceLastReview?: true;
}

/** Goals: AREA-03 derived alignment. */
export interface GoalScopeFilters {
  readonly alignment?: GoalAlignmentState;
}

/** Notes: NOTES-02 knowledge tags. */
export interface NoteScopeFilters {
  readonly tag?: string;
}

/** Meetings: MEET-01 status and the past/upcoming axis. */
export interface MeetingScopeFilters {
  readonly status?: MeetingStatus;
  readonly when?: "upcoming" | "past";
}

/** Reviews: REVIEWS-01 type and lifecycle. */
export interface ReviewScopeFilters {
  readonly reviewType?: ReviewType;
  readonly status?: ReviewStatus;
}

/** Every module dimension set, keyed by the scope that owns it. */
export interface ModuleViewFilters {
  readonly task?: TaskScopeFilters;
  readonly project?: ProjectScopeFilters;
  readonly goal?: GoalScopeFilters;
  readonly note?: NoteScopeFilters;
  readonly meeting?: MeetingScopeFilters;
  readonly review?: ReviewScopeFilters;
}

/* -------------------------------------------------------------------------- */
/* The configuration                                                          */
/* -------------------------------------------------------------------------- */

/** A complete, validated cross-module view configuration. */
export interface CrossViewConfig {
  readonly version: number;
  /** At least one scope, de-duplicated and in canonical `VIEW_SCOPES` order. */
  readonly scopes: readonly ViewScope[];
  readonly shared: SharedViewFilters;
  readonly modules: ModuleViewFilters;
  readonly sort: ViewSort;
  readonly direction: ViewSortDirection;
  readonly groupBy: ViewGroupBy;
}

/** The standard, unfiltered cross-module view — the "return to normal" destination. */
export const DEFAULT_CROSS_VIEW_CONFIG: CrossViewConfig = {
  version: CROSS_VIEW_CONFIG_VERSION,
  scopes: ["task", "project"],
  shared: {},
  modules: {},
  sort: "updated",
  direction: "desc",
  groupBy: "entity",
};

/* -------------------------------------------------------------------------- */
/* Parsing (total and lenient)                                                */
/* -------------------------------------------------------------------------- */

function member<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | undefined {
  return typeof value === "string" &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

function bounded(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) return undefined;
  // eslint-disable-next-line no-control-regex -- reject C0/C1 control characters.
  if (/[\u0000-\u001f\u007f-\u009f]/.test(trimmed)) return undefined;
  return trimmed;
}

function flag(value: unknown): true | undefined {
  return value === true ? true : undefined;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Parse the scope list: known scopes only, de-duplicated, canonical order. */
function parseScopes(raw: unknown): readonly ViewScope[] {
  if (!Array.isArray(raw)) return DEFAULT_CROSS_VIEW_CONFIG.scopes;
  const chosen = new Set<string>();
  for (const value of raw) {
    if (typeof value === "string") chosen.add(value);
  }
  const scopes = VIEW_SCOPES.filter((scope) => chosen.has(scope));
  // A view with no recognisable scope is not an error page: it degrades to the
  // documented default, exactly as a removed filter dimension does.
  return scopes.length > 0 ? scopes : DEFAULT_CROSS_VIEW_CONFIG.scopes;
}

function parseSharedFilters(raw: unknown): SharedViewFilters {
  const source = record(raw);
  const filters: {
    -readonly [K in keyof SharedViewFilters]: SharedViewFilters[K];
  } = {};

  const areaId = bounded(source.areaId, VIEW_ID_MAX_LENGTH);
  if (areaId) filters.areaId = areaId;
  const goalId = bounded(source.goalId, VIEW_ID_MAX_LENGTH);
  if (goalId) filters.goalId = goalId;
  const projectId = bounded(source.projectId, VIEW_ID_MAX_LENGTH);
  if (projectId) filters.projectId = projectId;
  const linkedToId = bounded(source.linkedToId, VIEW_ID_MAX_LENGTH);
  if (linkedToId) filters.linkedToId = linkedToId;
  const state = member(source.state, VIEW_STATES);
  if (state) filters.state = state;
  if (flag(source.attention)) filters.attention = true;
  const createdWithin = member(source.createdWithin, VIEW_DATE_WINDOWS);
  if (createdWithin) filters.createdWithin = createdWithin;
  const updatedWithin = member(source.updatedWithin, VIEW_DATE_WINDOWS);
  if (updatedWithin) filters.updatedWithin = updatedWithin;
  const dueWithin = member(source.dueWithin, VIEW_DUE_WINDOWS);
  if (dueWithin) filters.dueWithin = dueWithin;
  const archived = member(source.archived, VIEW_ARCHIVE_MODES);
  // `exclude` is the default: storing it would put a no-op in every URL and make
  // the active-filter badge lie.
  if (archived && archived !== "exclude") filters.archived = archived;
  const changedSince = member(source.changedSince, VIEW_CHANGE_BOUNDARIES);
  if (changedSince) filters.changedSince = changedSince;

  return filters;
}

function parseModuleFilters(raw: unknown): ModuleViewFilters {
  const source = record(raw);
  const modules: {
    -readonly [K in keyof ModuleViewFilters]: ModuleViewFilters[K];
  } = {};

  const task = record(source.task);
  const taskFilters: {
    -readonly [K in keyof TaskScopeFilters]: TaskScopeFilters[K];
  } = {};
  const priority = member(task.priority, [
    ...TASK_PRIORITIES,
    "__none",
  ] as const);
  if (priority) taskFilters.priority = priority;
  const timeSector = member(task.timeSector, [
    ...TIME_SECTORS,
    "__none",
  ] as const);
  if (timeSector) taskFilters.timeSector = timeSector;
  const taskStatus = member(task.status, TASK_STATUSES);
  if (taskStatus) taskFilters.status = taskStatus;
  if (flag(task.waiting)) taskFilters.waiting = true;
  if (flag(task.delegated)) taskFilters.delegated = true;
  if (flag(task.someday)) taskFilters.someday = true;
  if (Object.keys(taskFilters).length > 0) modules.task = taskFilters;

  const project = record(source.project);
  const projectFilters: {
    -readonly [K in keyof ProjectScopeFilters]: ProjectScopeFilters[K];
  } = {};
  const workflowStatus = member(project.workflowStatus, [
    "planned",
    "active",
    "on_hold",
  ] as const);
  if (workflowStatus) projectFilters.workflowStatus = workflowStatus;
  const health = member(project.health, PROJECT_HEALTH_STATES);
  if (health) projectFilters.health = health;
  if (flag(project.healthMovedSinceLastReview)) {
    projectFilters.healthMovedSinceLastReview = true;
  }
  if (Object.keys(projectFilters).length > 0) modules.project = projectFilters;

  const goal = record(source.goal);
  const alignment = member(goal.alignment, GOAL_ALIGNMENT_STATES);
  if (alignment) modules.goal = { alignment };

  const note = record(source.note);
  const tag = bounded(note.tag, VIEW_TEXT_MAX_LENGTH);
  if (tag) modules.note = { tag };

  const meeting = record(source.meeting);
  const meetingFilters: {
    -readonly [K in keyof MeetingScopeFilters]: MeetingScopeFilters[K];
  } = {};
  const meetingStatus = member(meeting.status, [
    "planned",
    "completed",
    "cancelled",
  ] as const);
  if (meetingStatus) meetingFilters.status = meetingStatus;
  const when = member(meeting.when, ["upcoming", "past"] as const);
  if (when) meetingFilters.when = when;
  if (Object.keys(meetingFilters).length > 0) modules.meeting = meetingFilters;

  const review = record(source.review);
  const reviewFilters: {
    -readonly [K in keyof ReviewScopeFilters]: ReviewScopeFilters[K];
  } = {};
  const reviewType = member(review.reviewType, REVIEW_TYPES);
  if (reviewType) reviewFilters.reviewType = reviewType;
  const reviewStatus = member(review.status, REVIEW_STATUSES);
  if (reviewStatus) reviewFilters.status = reviewStatus;
  if (Object.keys(reviewFilters).length > 0) modules.review = reviewFilters;

  return modules;
}

/**
 * Parse an untrusted value (a stored JSON blob, a URL-derived object) into a
 * validated config. TOTAL: it never throws and never propagates an unrecognised
 * value — anything unknown, malformed or from a future version is dropped and the
 * documented default takes its place.
 */
export function parseCrossViewConfig(raw: unknown): CrossViewConfig {
  const source = record(raw);
  return {
    version: CROSS_VIEW_CONFIG_VERSION,
    scopes: parseScopes(source.scopes),
    shared: parseSharedFilters(source.shared),
    modules: parseModuleFilters(source.modules),
    sort: member(source.sort, VIEW_SORTS) ?? DEFAULT_CROSS_VIEW_CONFIG.sort,
    direction:
      member(source.direction, VIEW_SORT_DIRECTIONS) ??
      DEFAULT_CROSS_VIEW_CONFIG.direction,
    groupBy:
      member(source.groupBy, VIEW_GROUP_BYS) ??
      DEFAULT_CROSS_VIEW_CONFIG.groupBy,
  };
}

/* -------------------------------------------------------------------------- */
/* Canonical serialisation                                                    */
/* -------------------------------------------------------------------------- */

const MODULE_FILTER_KEYS: Readonly<Record<ViewScope, readonly string[]>> = {
  task: ["priority", "timeSector", "status", "waiting", "delegated", "someday"],
  project: ["workflowStatus", "health", "healthMovedSinceLastReview"],
  goal: ["alignment"],
  note: ["tag"],
  meeting: ["status", "when"],
  review: ["reviewType", "status"],
};

/**
 * The canonical JSON text of a config: keys in a FIXED order, so two equivalent
 * configs always serialise identically and a stored view can be compared to the
 * current one without a deep-equality helper.
 */
export function serialiseCrossViewConfig(config: CrossViewConfig): string {
  const shared: Record<string, unknown> = {};
  for (const key of SHARED_VIEW_FILTER_KEYS) {
    const value = config.shared[key];
    if (value !== undefined) shared[key] = value;
  }

  const modules: Record<string, unknown> = {};
  for (const scope of VIEW_SCOPES) {
    const source = config.modules[scope] as Record<string, unknown> | undefined;
    if (!source) continue;
    const ordered: Record<string, unknown> = {};
    for (const key of MODULE_FILTER_KEYS[scope]) {
      const value = source[key];
      if (value !== undefined) ordered[key] = value;
    }
    if (Object.keys(ordered).length > 0) modules[scope] = ordered;
  }

  return JSON.stringify({
    version: config.version,
    scopes: [...config.scopes],
    shared,
    modules,
    sort: config.sort,
    direction: config.direction,
    groupBy: config.groupBy,
  });
}

/** True when two configs describe the same query and presentation. */
export function crossViewConfigsEqual(
  a: CrossViewConfig,
  b: CrossViewConfig,
): boolean {
  return serialiseCrossViewConfig(a) === serialiseCrossViewConfig(b);
}

/** How many filter dimensions a config narrows by (drives the "active" badge). */
export function crossViewFilterCount(config: CrossViewConfig): number {
  let count = Object.keys(config.shared).length;
  for (const scope of VIEW_SCOPES) {
    const source = config.modules[scope] as Record<string, unknown> | undefined;
    if (source) count += Object.keys(source).length;
  }
  return count;
}

/**
 * The scopes a config can actually query, and the ones its own filters excluded.
 *
 * A scope is dropped when the config applies a SHARED dimension that scope cannot
 * answer, or a MODULE dimension belonging to a different scope is irrelevant (that
 * never drops anything — module filters only ever narrow their own scope). This is
 * computed BEFORE any query runs, so the surface can state plainly why a scope the
 * owner selected contributed nothing.
 */
export interface ResolvedViewScopes {
  readonly included: readonly ViewScope[];
  /** Scope → the shared dimension that excluded it (first one wins, stable order). */
  readonly excluded: readonly {
    readonly scope: ViewScope;
    readonly dimension: keyof SharedViewFilters;
  }[];
}

export function resolveViewScopes(
  config: CrossViewConfig,
  availableScopes: readonly ViewScope[],
): ResolvedViewScopes {
  const available = new Set(availableScopes);
  const included: ViewScope[] = [];
  const excluded: { scope: ViewScope; dimension: keyof SharedViewFilters }[] =
    [];

  for (const scope of config.scopes) {
    if (!available.has(scope)) continue;
    let blockedBy: keyof SharedViewFilters | null = null;
    for (const key of SHARED_VIEW_FILTER_KEYS) {
      if (config.shared[key] === undefined) continue;
      if (key === "archived") {
        if (
          config.shared.archived === "only" &&
          !ARCHIVABLE_VIEW_SCOPES.includes(scope)
        ) {
          blockedBy = "archived";
          break;
        }
        continue;
      }
      const support = SHARED_DIMENSION_SUPPORT[key];
      if (!support.includes(scope)) {
        blockedBy = key;
        break;
      }
    }
    if (blockedBy) excluded.push({ scope, dimension: blockedBy });
    else included.push(scope);
  }

  return { included, excluded };
}
