/**
 * TASKS-03 — the `/tasks` URL ⇄ configuration codec (pure, React-free, testable).
 *
 * The Tasks workspace has exactly ONE state model: the kernel's declarative
 * {@link TaskViewConfig}. This file is the only translation between that model and
 * the URL, so:
 *
 *   - a configuration is always shareable and bookmarkable (it IS the URL);
 *   - a saved view and a copied link mean the same thing, because both round-trip
 *     through the same config;
 *   - Back/Forward is correct for free, because nothing lives in component state.
 *
 * Every parameter is decoded through the kernel's closed-set validation, so a
 * hostile or stale URL degrades to the documented default rather than reaching the
 * repository. Nothing here fetches, mutates or imports React.
 */

import {
  DEFAULT_TASK_VIEW_CONFIG,
  parseTaskViewConfig,
  TASK_DENSITIES,
  TASK_GROUP_BYS,
  TASK_PRESENTATIONS,
  TASK_VIEW_FILTER_KEYS,
  type TaskGroupBy,
  type TaskPresentation,
  type TaskViewConfig,
  type TaskViewFilters,
} from "~/kernel/task-views";
import {
  TASK_RECENCY_WINDOW_DAYS,
  TASK_SORTS,
  TASK_SORT_DIRECTIONS,
  TASK_SYSTEM_VIEWS,
  type TaskPriority,
  type WorkspaceTaskFilters,
  type WorkspaceTaskGroupDimension,
} from "~/kernel/tasks";

/**
 * The URL parameter each configuration dimension writes. Short, stable, readable —
 * a Tasks link should be legible to the person pasting it.
 */
export const TASKS_PARAMS = {
  presentation: "view",
  systemView: "system",
  sort: "sort",
  direction: "dir",
  groupBy: "group",
  density: "density",
  savedView: "saved",
  cursor: "cursor",
} as const;

/** The URL parameter each FILTER dimension writes, keyed by its config key. */
export const TASKS_FILTER_PARAMS: Record<keyof TaskViewFilters, string> = {
  status: "status",
  priority: "priority",
  dueState: "due",
  plannedState: "planned",
  parentKind: "parentType",
  projectId: "project",
  areaId: "area",
  goalId: "goal",
  timeSector: "sector",
  delegatedTo: "person",
  delegated: "delegated",
  waiting: "waiting",
  someday: "someday",
  createdWithin: "created",
  updatedWithin: "updated",
  completed: "completed",
};

/** The boolean filter keys, which encode as `1` and are absent when off. */
const BOOLEAN_FILTER_KEYS = ["delegated", "waiting", "someday"] as const;

/** Every parameter this module OWNS — the exact set a reset clears. */
export const TASKS_OWNED_PARAMS: readonly string[] = [
  ...Object.values(TASKS_PARAMS),
  ...Object.values(TASKS_FILTER_PARAMS),
];

/** The parameters a FILTER reset clears (never the presentation, sort or view). */
export const TASKS_FILTER_PARAM_NAMES: readonly string[] =
  Object.values(TASKS_FILTER_PARAMS);

function read(params: URLSearchParams, name: string): string | null {
  const value = params.get(name);
  return value !== null && value.length > 0 ? value : null;
}

/**
 * Decode a URL into a validated configuration.
 *
 * `fallback` supplies the values a bare `/tasks` takes — the owner's default view
 * when they have chosen one. An explicit parameter ALWAYS wins over the fallback,
 * so a deep link and Back/Forward stay authoritative over a preference.
 */
export function configFromParams(
  params: URLSearchParams,
  fallback: TaskViewConfig = DEFAULT_TASK_VIEW_CONFIG,
): TaskViewConfig {
  const rawFilters: Record<string, unknown> = { ...fallback.filters };
  for (const key of TASK_VIEW_FILTER_KEYS) {
    const param = TASKS_FILTER_PARAMS[key];
    const value = read(params, param);
    if (value === null) continue;
    if ((BOOLEAN_FILTER_KEYS as readonly string[]).includes(key)) {
      // A boolean filter is present-and-`1` or absent. `0` is an explicit OFF, so a
      // link can turn off a filter the owner's default view turns on.
      rawFilters[key] = value === "1";
      if (value !== "1") delete rawFilters[key];
      continue;
    }
    rawFilters[key] = value;
  }

  // A scalar dimension has no "unset" state, so an INVALID URL value must degrade
  // to the fallback (the owner's default view) rather than to the global default —
  // otherwise a typo in a shared link would silently discard their preference.
  // Validity is checked against the kernel's closed sets, never guessed.
  const scalar = <T extends string>(
    param: string,
    allowed: readonly T[],
    fallbackValue: T,
  ): T => {
    const raw = read(params, param);
    return raw !== null && (allowed as readonly string[]).includes(raw)
      ? (raw as T)
      : fallbackValue;
  };

  return parseTaskViewConfig({
    presentation: scalar(
      TASKS_PARAMS.presentation,
      TASK_PRESENTATIONS,
      fallback.presentation,
    ),
    systemView: scalar(
      TASKS_PARAMS.systemView,
      TASK_SYSTEM_VIEWS,
      fallback.systemView,
    ),
    sort: scalar(TASKS_PARAMS.sort, TASK_SORTS, fallback.sort),
    direction: scalar(
      TASKS_PARAMS.direction,
      TASK_SORT_DIRECTIONS,
      fallback.direction,
    ),
    groupBy: scalar(TASKS_PARAMS.groupBy, TASK_GROUP_BYS, fallback.groupBy),
    density: scalar(TASKS_PARAMS.density, TASK_DENSITIES, fallback.density),
    filters: rawFilters,
  });
}

/**
 * Write a configuration into search params, PRESERVING every parameter this module
 * does not own (a `drawer` key, a selected tab). A value equal to the default is
 * REMOVED rather than written, so the standard workspace has a clean `/tasks` URL
 * and two equivalent states always produce the same link.
 */
export function paramsFromConfig(
  config: TaskViewConfig,
  base: URLSearchParams = new URLSearchParams(),
): URLSearchParams {
  const next = new URLSearchParams(base);
  const setOrDelete = (name: string, value: string, fallback: string): void => {
    if (value === fallback) next.delete(name);
    else next.set(name, value);
  };
  setOrDelete(
    TASKS_PARAMS.presentation,
    config.presentation,
    DEFAULT_TASK_VIEW_CONFIG.presentation,
  );
  setOrDelete(
    TASKS_PARAMS.systemView,
    config.systemView,
    DEFAULT_TASK_VIEW_CONFIG.systemView,
  );
  setOrDelete(TASKS_PARAMS.sort, config.sort, DEFAULT_TASK_VIEW_CONFIG.sort);
  setOrDelete(
    TASKS_PARAMS.direction,
    config.direction,
    DEFAULT_TASK_VIEW_CONFIG.direction,
  );
  setOrDelete(
    TASKS_PARAMS.groupBy,
    config.groupBy,
    DEFAULT_TASK_VIEW_CONFIG.groupBy,
  );
  setOrDelete(
    TASKS_PARAMS.density,
    config.density,
    DEFAULT_TASK_VIEW_CONFIG.density,
  );

  for (const key of TASK_VIEW_FILTER_KEYS) {
    const param = TASKS_FILTER_PARAMS[key];
    const value = config.filters[key];
    if (value === undefined || value === false) {
      next.delete(param);
    } else if (value === true) {
      next.set(param, "1");
    } else {
      next.set(param, String(value));
    }
  }

  // A configuration change always invalidates a keyset cursor: page two of a query
  // that no longer exists is worse than page one of the query that does.
  next.delete(TASKS_PARAMS.cursor);
  return next;
}

/** Translate a validated config's filters into the kernel's repository filters. */
export function toWorkspaceFilters(
  config: TaskViewConfig,
): WorkspaceTaskFilters {
  const f = config.filters;
  const out: {
    -readonly [K in keyof WorkspaceTaskFilters]: WorkspaceTaskFilters[K];
  } = {};
  // `__none` is the explicit "this field is empty" filter — it maps to an explicit
  // null so the repository queries `IS NULL`, distinct from "no filter" (absent).
  if (f.priority === "__none") out.priority = null;
  else if (f.priority) out.priority = f.priority as TaskPriority;
  if (f.timeSector === "__none") out.timeSector = null;
  else if (f.timeSector) out.timeSector = f.timeSector;
  if (f.status) out.status = f.status;
  if (f.dueState) out.dueState = f.dueState;
  if (f.plannedState) out.plannedState = f.plannedState;
  if (f.parentKind) out.parentKind = f.parentKind;
  if (f.projectId) out.projectId = f.projectId;
  if (f.areaId) out.areaId = f.areaId;
  if (f.goalId) out.goalId = f.goalId;
  if (f.delegatedTo) out.delegatedTo = f.delegatedTo;
  if (f.delegated) out.delegatedOnly = true;
  if (f.waiting) out.waitingOnly = true;
  // Someday/Maybe is the COMMITMENT state, not a status or a priority (ADR-043 §4).
  if (f.someday) out.commitmentState = "someday";
  if (f.createdWithin) out.createdWithin = f.createdWithin;
  if (f.updatedWithin) out.updatedWithin = f.updatedWithin;
  if (f.completed) out.completedVisibility = f.completed;
  return out;
}

/**
 * The server grouping dimension a configuration renders from, or `null` for a flat
 * list. The Matrix and Sectors presentations imply their own dimension; the List
 * and Board presentations use the explicit `groupBy`.
 *
 * A BOARD is grouped by definition: choosing Board with no grouping falls back to
 * priority, because a board of one column is a list with extra chrome.
 */
export function groupDimensionFor(
  config: TaskViewConfig,
): WorkspaceTaskGroupDimension | null {
  if (config.presentation === "matrix") return "quadrant";
  if (config.presentation === "sectors") return "sector";
  if (config.groupBy !== "none") {
    return config.groupBy as WorkspaceTaskGroupDimension;
  }
  return config.presentation === "board" ? "priority" : null;
}

/** True when the presentation is one of the optional specialist planning views. */
export function isSpecialistView(presentation: TaskPresentation): boolean {
  return presentation === "matrix" || presentation === "sectors";
}

/** The grouping the UI should show as selected (Board's implicit fallback included). */
export function effectiveGroupBy(config: TaskViewConfig): TaskGroupBy {
  if (config.presentation === "board" && config.groupBy === "none") {
    return "priority";
  }
  return config.groupBy;
}

/** Human text for a recency window, used in chips and option labels. */
export function recencyWindowLabel(window: string): string {
  const days =
    TASK_RECENCY_WINDOW_DAYS[window as keyof typeof TASK_RECENCY_WINDOW_DAYS];
  if (days === undefined) return window;
  if (days === 1) return "Today";
  return `Last ${days} days`;
}
