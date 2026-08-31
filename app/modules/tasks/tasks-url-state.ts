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
  type TaskViewConfig,
  type TaskViewFilters,
} from "~/kernel/task-views";
import {
  TASK_SORTS,
  TASK_SORT_DIRECTIONS,
  TASK_SYSTEM_VIEWS,
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
  // SMART-01 — the parameter KEEPS its name while the dimension became a set, so
  // every `?priority=p1` link ever shared still selects exactly Priority 1.
  priorities: "priority",
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
  // V2.7 RECALL-02 — the completion-time window. `completed` above is already
  // the VISIBILITY dimension, so the window names itself in full rather than
  // overloading that parameter; the from/to pair matches `dueFrom`/`dueTo`
  // exactly, which is what makes a completed range read like every other range
  // in a shared link.
  completedWithin: "completedWithin",
  completedFrom: "completedFrom",
  completedTo: "completedTo",
  // V2.7 RECALL-03 — the follow-up dimension. `followUp` is the derived state
  // ("due", "overdue", "none"); the from/to pair matches `dueFrom`/`dueTo`
  // exactly, so a follow-up window reads like every other range in a shared
  // link and needs no second grammar to explain it.
  followUp: "followUp",
  followUpFrom: "followUpFrom",
  followUpTo: "followUpTo",
  dueFrom: "dueFrom",
  dueTo: "dueTo",
  plannedFrom: "plannedFrom",
  plannedTo: "plannedTo",
  recurring: "repeats",
  // TASKS-12 — `?state=blocked` would collide with the workflow `status` this
  // collection already has, so the parameter is named after the dimension it
  // filters, exactly as `repeats` is.
  blocked: "blocked",
  // V2.6 FIND-03 — `?tag=errand,deep-work`. Singular, like `person` above, because
  // a link reads as "the tag filter" whatever number of members it names, and a
  // SET already encodes as one comma-joined parameter (see `paramsFromConfig`).
  tags: "tag",
};

/** The boolean filter keys, which encode as `1` and are absent when off. */
const BOOLEAN_FILTER_KEYS = ["delegated", "waiting", "someday"] as const;

/**
 * The TRISTATE filter keys, which encode as `1`/`0` and are absent when unset.
 *
 * `repeats=0` ("only one-off Tasks") is a real filter, so unlike the boolean keys
 * above an explicit `0` must survive the decode rather than being read as "off".
 */
const TRISTATE_FILTER_KEYS = ["recurring", "blocked"] as const;

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
    if ((TRISTATE_FILTER_KEYS as readonly string[]).includes(key)) {
      // The kernel's parse accepts "1"/"0"/"true"/"false"; anything else is
      // dropped there, so an unrecognised value degrades to "no filter".
      rawFilters[key] = value;
      continue;
    }
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
    if (value === undefined) {
      next.delete(param);
    } else if (Array.isArray(value)) {
      // A SET writes one comma-joined parameter, in the canonical order the
      // config already put it in, so two equivalent sets produce one link.
      if (value.length === 0) next.delete(param);
      else next.set(param, value.join(","));
    } else if (
      (TRISTATE_FILTER_KEYS as readonly string[]).includes(key) &&
      typeof value === "boolean"
    ) {
      next.set(param, value ? "1" : "0");
    } else if (value === false) {
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

/**
 * Translate a validated config's filters into the kernel's repository filters.
 *
 * Re-exported from the KERNEL (`~/kernel/task-views`), where it moved in PLAN-01.
 * It never had any Tasks-module knowledge — it maps one validated kernel shape to
 * another — and Weekly Planning needs the same translation to run a saved view
 * through the same canonical query path. A second module importing this file
 * would be a cross-module import (AGENTS.md §9.1); one definition in the kernel is
 * what keeps "one filter vocabulary, two consumers" literally true.
 */
export { toWorkspaceFilters } from "~/kernel/task-views";

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
  if (config.presentation === "sectors") return "sector";
  if (config.groupBy !== "none") {
    return config.groupBy as WorkspaceTaskGroupDimension;
  }
  return config.presentation === "board" ? "priority" : null;
}

/** The grouping the UI should show as selected (Board's implicit fallback included). */
export function effectiveGroupBy(config: TaskViewConfig): TaskGroupBy {
  if (config.presentation === "board" && config.groupBy === "none") {
    return "priority";
  }
  return config.groupBy;
}
