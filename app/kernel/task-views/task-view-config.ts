/**
 * TASKS-03 — the declarative Tasks view CONFIGURATION (pure, storage-independent).
 *
 * One shape describes a Tasks workspace configuration everywhere it exists: in the
 * URL (shareable, Back/Forward-correct), in a persisted saved view, and in the
 * loader payload. There is deliberately no second representation, so a saved view
 * and a copied link can never mean different things.
 *
 * Three rules make this safe to persist and safe to restore from an untrusted URL:
 *
 *   1. **Declarative, never a query.** A config names FILTER DIMENSIONS from closed
 *      sets — it can never carry a repository field name, a column, a sort
 *      expression or a SQL fragment. The repository maps a validated dimension to
 *      its own trusted predicate; nothing here reaches SQL as text.
 *   2. **Total, lenient parsing.** `parseTaskViewConfig` never throws on values: an
 *      unknown key, a removed filter dimension or a value from a FUTURE version is
 *      dropped and the rest is kept. A view saved by a later version therefore
 *      degrades to "the parts this version understands", never to an error page.
 *   3. **Canonical on write.** The write path stores the re-serialised, validated
 *      config, so only known keys with known values are ever persisted.
 */

import {
  TASK_COMPLETED_VISIBILITIES,
  TASK_DUE_STATES,
  TASK_PARENT_KINDS,
  TASK_PLANNED_STATES,
  TASK_PRIORITIES,
  TASK_RECENCY_WINDOWS,
  TASK_SORTS,
  TASK_SORT_DIRECTIONS,
  TASK_STATUSES,
  TASK_SYSTEM_VIEWS,
  TIME_SECTORS,
  type TaskCompletedVisibility,
  type TaskDueState,
  type TaskParentKind,
  type TaskPlannedState,
  type TaskPriority,
  type TaskRecencyWindow,
  type TaskSort,
  type TaskSortDirection,
  type TaskStatus,
  type TaskSystemView,
  type TimeSector,
} from "~/kernel/tasks";

/** The current config format version. Bump only for a shape change, not a new key. */
export const TASK_VIEW_CONFIG_VERSION = 1;

/**
 * The primary presentations of the Tasks workspace. `list` is the default — and, since
 * V2.2, unambiguously the PRIMARY — way to manage tasks; `board` is the same query
 * rendered as grouped columns; `sectors` is the OPTIONAL Time Sectors planning view.
 *
 * `matrix` was removed in V2.2 (TASKS-05). Parsing is lenient by design, so a stored
 * or hand-typed `presentation: "matrix"` degrades to `list` rather than erroring; the
 * `/tasks` loader additionally REDIRECTS a legacy `?view=matrix` link into the
 * equivalent priority-grouped list, so an old bookmark lands somewhere honest instead
 * of silently losing its grouping. See `TASKS_MODULE.md → The Matrix was removed`.
 */
export const TASK_PRESENTATIONS = ["list", "board", "sectors"] as const;
export type TaskPresentation = (typeof TASK_PRESENTATIONS)[number];

/**
 * The optional grouping of the List and Board presentations. `none` is ungrouped.
 * Every value maps 1:1 to a server grouping dimension, so a grouped view always
 * shows AUTHORITATIVE counts and never a client re-bucket of one loaded page.
 *
 * There is exactly one priority axis: `priority`. The Eisenhower quadrant grouping
 * that used to sit beside it was the same stored field under a second name, and it
 * went with the Matrix in V2.2.
 */
export const TASK_GROUP_BYS = [
  "none",
  "priority",
  "due_state",
  "planned",
  "status",
  "parent",
  "delegate",
  "sector",
] as const;
export type TaskGroupBy = (typeof TASK_GROUP_BYS)[number];

/** The shared collection-density contract (DS-04), not a Tasks-only fork. */
export const TASK_DENSITIES = ["comfortable", "compact"] as const;
export type TaskDensity = (typeof TASK_DENSITIES)[number];

/**
 * The validated filter dimensions. Every optional field is a CLOSED set or a bound
 * scalar; `"__none"` is the explicit "this field is empty" filter (no priority, no
 * sector), distinct from "no filter at all" (the key absent).
 */
export interface TaskViewFilters {
  readonly status?: TaskStatus;
  /** A priority, or `__none` for untriaged. */
  readonly priority?: TaskPriority | "__none";
  readonly dueState?: TaskDueState;
  readonly plannedState?: TaskPlannedState;
  readonly parentKind?: TaskParentKind;
  readonly projectId?: string;
  readonly areaId?: string;
  readonly goalId?: string;
  /** A time sector, or `__none` for "No sector". */
  readonly timeSector?: TimeSector | "__none";
  /** Only tasks delegated to this exact person/label. */
  readonly delegatedTo?: string;
  /** Only delegated tasks (any delegatee). */
  readonly delegated?: boolean;
  /** Only waiting tasks. */
  readonly waiting?: boolean;
  /** Only Someday/Maybe tasks. */
  readonly someday?: boolean;
  readonly createdWithin?: TaskRecencyWindow;
  readonly updatedWithin?: TaskRecencyWindow;
  /** Completed/terminal visibility on top of the system view. */
  readonly completed?: TaskCompletedVisibility;
}

/** A complete, validated Tasks workspace configuration. */
export interface TaskViewConfig {
  readonly version: number;
  readonly presentation: TaskPresentation;
  readonly systemView: TaskSystemView;
  readonly sort: TaskSort;
  readonly direction: TaskSortDirection;
  readonly groupBy: TaskGroupBy;
  readonly density: TaskDensity;
  readonly filters: TaskViewFilters;
}

/** The standard, unfiltered Tasks workspace — the "return to normal" destination. */
export const DEFAULT_TASK_VIEW_CONFIG: TaskViewConfig = {
  version: TASK_VIEW_CONFIG_VERSION,
  presentation: "list",
  systemView: "active",
  sort: "smart",
  direction: "natural",
  groupBy: "none",
  density: "comfortable",
  filters: {},
};

/** The maximum length of a stored delegatee filter value (mirrors the column). */
export const TASK_VIEW_DELEGATE_MAX_LENGTH = 120;
/** The maximum length of a stored entity-id filter value (mirrors `ID_MAX_LENGTH`). */
export const TASK_VIEW_ID_MAX_LENGTH = 128;

function member<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | undefined {
  return typeof value === "string" &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

function boundedId(value: unknown, max: number): string | undefined {
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

/**
 * Parse an untrusted value (a stored JSON blob, a URL-derived object) into a
 * validated config. TOTAL: it never throws and never propagates an unrecognised
 * value — anything unknown, malformed or from a future version is dropped and the
 * documented default takes its place.
 */
export function parseTaskViewConfig(raw: unknown): TaskViewConfig {
  const source =
    typeof raw === "object" && raw !== null
      ? (raw as Record<string, unknown>)
      : {};
  const rawFilters =
    typeof source.filters === "object" && source.filters !== null
      ? (source.filters as Record<string, unknown>)
      : {};

  const filters: {
    -readonly [K in keyof TaskViewFilters]: TaskViewFilters[K];
  } = {};
  const status = member(rawFilters.status, TASK_STATUSES);
  if (status) filters.status = status;
  const priority = member(rawFilters.priority, [
    ...TASK_PRIORITIES,
    "__none",
  ] as const);
  if (priority) filters.priority = priority;
  const dueState = member(rawFilters.dueState, TASK_DUE_STATES);
  if (dueState) filters.dueState = dueState;
  const plannedState = member(rawFilters.plannedState, TASK_PLANNED_STATES);
  if (plannedState) filters.plannedState = plannedState;
  const parentKind = member(rawFilters.parentKind, TASK_PARENT_KINDS);
  if (parentKind) filters.parentKind = parentKind;
  const projectId = boundedId(rawFilters.projectId, TASK_VIEW_ID_MAX_LENGTH);
  if (projectId) filters.projectId = projectId;
  const areaId = boundedId(rawFilters.areaId, TASK_VIEW_ID_MAX_LENGTH);
  if (areaId) filters.areaId = areaId;
  const goalId = boundedId(rawFilters.goalId, TASK_VIEW_ID_MAX_LENGTH);
  if (goalId) filters.goalId = goalId;
  const timeSector = member(rawFilters.timeSector, [
    ...TIME_SECTORS,
    "__none",
  ] as const);
  if (timeSector) filters.timeSector = timeSector;
  const delegatedTo = boundedId(
    rawFilters.delegatedTo,
    TASK_VIEW_DELEGATE_MAX_LENGTH,
  );
  if (delegatedTo) filters.delegatedTo = delegatedTo;
  if (flag(rawFilters.delegated)) filters.delegated = true;
  if (flag(rawFilters.waiting)) filters.waiting = true;
  if (flag(rawFilters.someday)) filters.someday = true;
  const createdWithin = member(rawFilters.createdWithin, TASK_RECENCY_WINDOWS);
  if (createdWithin) filters.createdWithin = createdWithin;
  const updatedWithin = member(rawFilters.updatedWithin, TASK_RECENCY_WINDOWS);
  if (updatedWithin) filters.updatedWithin = updatedWithin;
  const completed = member(rawFilters.completed, TASK_COMPLETED_VISIBILITIES);
  if (completed && completed !== "default") filters.completed = completed;

  return {
    version: TASK_VIEW_CONFIG_VERSION,
    presentation:
      member(source.presentation, TASK_PRESENTATIONS) ??
      DEFAULT_TASK_VIEW_CONFIG.presentation,
    systemView:
      member(source.systemView, TASK_SYSTEM_VIEWS) ??
      DEFAULT_TASK_VIEW_CONFIG.systemView,
    sort: member(source.sort, TASK_SORTS) ?? DEFAULT_TASK_VIEW_CONFIG.sort,
    direction:
      member(source.direction, TASK_SORT_DIRECTIONS) ??
      DEFAULT_TASK_VIEW_CONFIG.direction,
    groupBy:
      member(source.groupBy, TASK_GROUP_BYS) ??
      DEFAULT_TASK_VIEW_CONFIG.groupBy,
    density:
      member(source.density, TASK_DENSITIES) ??
      DEFAULT_TASK_VIEW_CONFIG.density,
    filters,
  };
}

/** How many filter dimensions a config narrows by (drives the "active" badge). */
export function taskViewFilterCount(config: TaskViewConfig): number {
  return Object.keys(config.filters).length;
}

/** True when two configs describe the same query and presentation. */
export function taskViewConfigsEqual(
  a: TaskViewConfig,
  b: TaskViewConfig,
): boolean {
  return serialiseTaskViewConfig(a) === serialiseTaskViewConfig(b);
}

/**
 * The canonical JSON text of a config: keys in a FIXED order, so two equivalent
 * configs always serialise identically and a stored view can be compared to the
 * current one without a deep-equality helper.
 */
export function serialiseTaskViewConfig(config: TaskViewConfig): string {
  const filters = config.filters;
  const orderedFilters: Record<string, unknown> = {};
  for (const key of TASK_VIEW_FILTER_KEYS) {
    const value = filters[key];
    if (value !== undefined) orderedFilters[key] = value;
  }
  return JSON.stringify({
    version: config.version,
    presentation: config.presentation,
    systemView: config.systemView,
    sort: config.sort,
    direction: config.direction,
    groupBy: config.groupBy,
    density: config.density,
    filters: orderedFilters,
  });
}

/** The canonical filter-key order — the one place the key set is enumerated. */
export const TASK_VIEW_FILTER_KEYS = [
  "status",
  "priority",
  "dueState",
  "plannedState",
  "parentKind",
  "projectId",
  "areaId",
  "goalId",
  "timeSector",
  "delegatedTo",
  "delegated",
  "waiting",
  "someday",
  "createdWithin",
  "updatedWithin",
  "completed",
] as const satisfies readonly (keyof TaskViewFilters)[];
