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

import { parseTagFilterKeys } from "~/kernel/tags";
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
  /**
   * SMART-01 — the priorities to include, as a SET.
   *
   * A single priority was the TASKS-03 shape, and "P1 and P2" — the most common
   * real filter an owner wants — could not be said at all. This is ONE dimension
   * with more than one accepted value, not a nested OR clause: every member comes
   * from the closed priority vocabulary, the repository still chooses the
   * predicate, and the URL parameter keeps its name and accepts a comma list, so
   * every previously-shared `?priority=p1` link and every stored single-value
   * saved view continues to mean exactly what it meant (`parseTaskViewConfig`
   * canonicalises both into this set).
   *
   * `__none` is the explicit "no priority recorded" member. An EMPTY set is not a
   * filter and is dropped.
   */
  readonly priorities?: readonly (TaskPriority | "__none")[];
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
  /**
   * PLAN-01 / SMART-01 — explicit DATE-RANGE bounds, `YYYY-MM-DD`.
   *
   * The derived `dueState`/`plannedState` dimensions above answer relative
   * questions ("overdue", "planned this week") against the owner's calendar day,
   * and they are the right thing for an everyday view. They cannot express a
   * SPECIFIC window, which is what a planning week is and what "due between these
   * two dates" is, so these four bounds exist beside them rather than instead of
   * them. Due and planned stay strictly separate, exactly as the dates do.
   */
  readonly dueFrom?: string;
  readonly dueTo?: string;
  readonly plannedFrom?: string;
  readonly plannedTo?: string;
  /** Only Tasks that repeat (`true`) or only one-off Tasks (`false`). */
  readonly recurring?: boolean;
  /**
   * TASKS-12 — only Tasks that are BLOCKED (`true`) or only ones that are not
   * (`false`).
   *
   * A filter on the existing declarative vocabulary rather than a new system
   * view: a blocked Task is still an ordinary Task and still belongs to whichever
   * view its dates and state put it in. The state is DERIVED server-side from the
   * dependency edges and the blockers' own completion, so a saved view named
   * "Blocked" is always current and never stores a stale answer.
   */
  readonly blocked?: boolean;
  /**
   * V2.6 FIND-03 — the ONE tag dimension (DEBT-48).
   *
   * A SET of canonical tag keys, matched as ANY, exactly like `priorities`
   * above: one dimension with more than one accepted value, not a nested OR
   * clause and not a second filter model. DEBT-49 closed a two-filter-model
   * split once; re-opening it for tags would be the same mistake with a new
   * noun, so a tag filter is a member of THIS declaration and nothing else.
   *
   * The members are canonicalised (whitespace-normalised, case-folded) on parse,
   * so a saved view naming `Errand` and a link naming `errand` are the same
   * view. An empty set is not a filter and is dropped.
   */
  readonly tags?: readonly string[];
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
  /*
   * FINAL-UI — `compact` is the default, and `comfortable` remains the choice.
   *
   * The approved concepts draw the Tasks list dense: a 36px row carrying a 14px
   * title, roughly 2.5× the type. `comfortable` resolves to DS-01's `default`
   * preset — a 56px row at 3.5× — which is what the whole product shipped and
   * what made the list read as spacious where the concepts read as fast.
   * Nothing is removed: the density control still offers both, and the coarse-
   * pointer floor in `tokens.css` hands a finger the full target back either
   * way. Only which one an owner starts on has changed.
   */
  density: "compact",
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
 * A TRISTATE flag: `true`, `false` or absent. Distinct from {@link flag}, which
 * models a filter that is only ever on — "only one-off Tasks" is a real filter,
 * so `false` has to survive the parse rather than being read as "no filter".
 */
function tristate(value: unknown): boolean | undefined {
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
  return undefined;
}

/** A wall-calendar `YYYY-MM-DD` bound, or undefined for anything else. */
function dateBound(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (match === null) return undefined;
  const utc = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  if (Number.isNaN(utc)) return undefined;
  // The components must round-trip, so `2026-02-31` never becomes 2026-03-03.
  return new Date(utc).toISOString().slice(0, 10) === trimmed
    ? trimmed
    : undefined;
}

/**
 * Canonicalise a priority SET from any of the three shapes it legitimately
 * arrives in: an array (the current form), a comma-separated string (the URL),
 * or one bare value (a TASKS-03 saved view, and every link shared before
 * SMART-01). Unrecognised members are dropped, duplicates collapse, and the
 * result is ordered by the canonical priority vocabulary — so two equivalent
 * sets always serialise identically and compare equal.
 */
function priorityMembers(
  value: unknown,
): readonly (TaskPriority | "__none")[] | undefined {
  const raw: unknown[] = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const candidate = member(typeof entry === "string" ? entry.trim() : entry, [
      ...TASK_PRIORITIES,
      "__none",
    ] as const);
    if (candidate) seen.add(candidate);
  }
  if (seen.size === 0) return undefined;
  const ordered: (TaskPriority | "__none")[] = TASK_PRIORITIES.filter(
    (priority) => seen.has(priority),
  );
  if (seen.has("__none")) ordered.push("__none");
  return ordered;
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
  const priorities = priorityMembers(
    rawFilters.priorities ?? rawFilters.priority,
  );
  if (priorities) filters.priorities = priorities;
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
  const dueFrom = dateBound(rawFilters.dueFrom);
  if (dueFrom) filters.dueFrom = dueFrom;
  const dueTo = dateBound(rawFilters.dueTo);
  if (dueTo) filters.dueTo = dueTo;
  const plannedFrom = dateBound(rawFilters.plannedFrom);
  if (plannedFrom) filters.plannedFrom = plannedFrom;
  const plannedTo = dateBound(rawFilters.plannedTo);
  if (plannedTo) filters.plannedTo = plannedTo;
  const recurring = tristate(rawFilters.recurring);
  if (recurring !== undefined) filters.recurring = recurring;
  const blocked = tristate(rawFilters.blocked);
  if (blocked !== undefined) filters.blocked = blocked;
  // V2.6 FIND-03 — canonicalised, bounded and total, exactly like every other
  // dimension: an unusable member is dropped, never thrown on.
  const tags = parseTagFilterKeys(rawFilters.tags);
  if (tags.length > 0) filters.tags = tags;

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
  "priorities",
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
  "dueFrom",
  "dueTo",
  "plannedFrom",
  "plannedTo",
  "recurring",
  "blocked",
  "tags",
] as const satisfies readonly (keyof TaskViewFilters)[];
