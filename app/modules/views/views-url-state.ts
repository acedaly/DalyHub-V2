/**
 * X-02 — the ONE codec between a cross-module view's URL and its configuration.
 *
 * The URL IS the configuration (ADR-059's rule, unchanged): the same shape backs
 * the address bar, the loader payload and the persisted saved view, so a saved view
 * and a copied link can never mean different things. Decoding is TOTAL and lenient —
 * every value goes through `parseCrossViewConfig`, so an unknown key, a removed
 * dimension or a hand-edited parameter is dropped rather than trusted.
 */

import {
  DEFAULT_CROSS_VIEW_CONFIG,
  VIEW_SCOPES,
  crossViewConfigsEqual,
  parseCrossViewConfig,
  type CrossViewConfig,
} from "~/kernel/views";

/** Every search parameter this surface owns. Anything else is left untouched. */
export const VIEWS_PARAMS = {
  view: "view",
  show: "show",
  area: "area",
  goal: "goal",
  project: "project",
  linked: "linked",
  state: "state",
  attention: "attention",
  created: "created",
  updated: "updated",
  due: "due",
  archived: "archived",
  changed: "changed",
  sort: "sort",
  direction: "dir",
  group: "group",
  taskPriority: "t.priority",
  taskSector: "t.sector",
  taskStatus: "t.status",
  taskWaiting: "t.waiting",
  taskDelegated: "t.delegated",
  taskSomeday: "t.someday",
  projectStatus: "p.status",
  projectHealth: "p.health",
  projectMoved: "p.moved",
  goalAlignment: "g.alignment",
  noteTag: "n.tag",
  meetingStatus: "m.status",
  meetingWhen: "m.when",
  reviewType: "r.type",
  reviewStatus: "r.status",
} as const;

function text(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key);
  return value === null || value.length === 0 ? undefined : value;
}

function truthy(params: URLSearchParams, key: string): true | undefined {
  const value = params.get(key);
  return value === "1" || value === "true" ? true : undefined;
}

/** Decode a URL into a validated configuration. Never throws. */
export function configFromParams(params: URLSearchParams): CrossViewConfig {
  const show = text(params, VIEWS_PARAMS.show);
  const scopes = show
    ? show.split(",").map((value) => value.trim())
    : undefined;

  return parseCrossViewConfig({
    scopes: scopes ?? [...DEFAULT_CROSS_VIEW_CONFIG.scopes],
    shared: {
      areaId: text(params, VIEWS_PARAMS.area),
      goalId: text(params, VIEWS_PARAMS.goal),
      projectId: text(params, VIEWS_PARAMS.project),
      linkedToId: text(params, VIEWS_PARAMS.linked),
      state: text(params, VIEWS_PARAMS.state),
      attention: truthy(params, VIEWS_PARAMS.attention),
      createdWithin: text(params, VIEWS_PARAMS.created),
      updatedWithin: text(params, VIEWS_PARAMS.updated),
      dueWithin: text(params, VIEWS_PARAMS.due),
      archived: text(params, VIEWS_PARAMS.archived),
      changedSince: text(params, VIEWS_PARAMS.changed),
    },
    modules: {
      task: {
        priority: text(params, VIEWS_PARAMS.taskPriority),
        timeSector: text(params, VIEWS_PARAMS.taskSector),
        status: text(params, VIEWS_PARAMS.taskStatus),
        waiting: truthy(params, VIEWS_PARAMS.taskWaiting),
        delegated: truthy(params, VIEWS_PARAMS.taskDelegated),
        someday: truthy(params, VIEWS_PARAMS.taskSomeday),
      },
      project: {
        workflowStatus: text(params, VIEWS_PARAMS.projectStatus),
        health: text(params, VIEWS_PARAMS.projectHealth),
        healthMovedSinceLastReview: truthy(params, VIEWS_PARAMS.projectMoved),
      },
      goal: { alignment: text(params, VIEWS_PARAMS.goalAlignment) },
      note: { tag: text(params, VIEWS_PARAMS.noteTag) },
      meeting: {
        status: text(params, VIEWS_PARAMS.meetingStatus),
        when: text(params, VIEWS_PARAMS.meetingWhen),
      },
      review: {
        reviewType: text(params, VIEWS_PARAMS.reviewType),
        status: text(params, VIEWS_PARAMS.reviewStatus),
      },
    },
    sort: text(params, VIEWS_PARAMS.sort),
    direction: text(params, VIEWS_PARAMS.direction),
    groupBy: text(params, VIEWS_PARAMS.group),
  });
}

/**
 * Encode a configuration back into a URL. Only NON-DEFAULT values are written, so
 * the address bar states exactly what is applied and nothing more; two equivalent
 * configurations always produce the same query string.
 */
export function paramsFromConfig(config: CrossViewConfig): URLSearchParams {
  const params = new URLSearchParams();
  const set = (key: string, value: string | undefined): void => {
    if (value !== undefined && value.length > 0) params.set(key, value);
  };
  const flag = (key: string, value: true | undefined): void => {
    if (value) params.set(key, "1");
  };

  // The scope list is always written: it is the one choice a cross-module view
  // cannot default away without changing what the URL means.
  set(
    VIEWS_PARAMS.show,
    VIEW_SCOPES.filter((scope) => config.scopes.includes(scope)).join(","),
  );

  const shared = config.shared;
  set(VIEWS_PARAMS.area, shared.areaId);
  set(VIEWS_PARAMS.goal, shared.goalId);
  set(VIEWS_PARAMS.project, shared.projectId);
  set(VIEWS_PARAMS.linked, shared.linkedToId);
  set(VIEWS_PARAMS.state, shared.state);
  flag(VIEWS_PARAMS.attention, shared.attention);
  set(VIEWS_PARAMS.created, shared.createdWithin);
  set(VIEWS_PARAMS.updated, shared.updatedWithin);
  set(VIEWS_PARAMS.due, shared.dueWithin);
  set(VIEWS_PARAMS.archived, shared.archived);
  set(VIEWS_PARAMS.changed, shared.changedSince);

  const task = config.modules.task;
  set(VIEWS_PARAMS.taskPriority, task?.priority);
  set(VIEWS_PARAMS.taskSector, task?.timeSector);
  set(VIEWS_PARAMS.taskStatus, task?.status);
  flag(VIEWS_PARAMS.taskWaiting, task?.waiting);
  flag(VIEWS_PARAMS.taskDelegated, task?.delegated);
  flag(VIEWS_PARAMS.taskSomeday, task?.someday);

  const project = config.modules.project;
  set(VIEWS_PARAMS.projectStatus, project?.workflowStatus);
  set(VIEWS_PARAMS.projectHealth, project?.health);
  flag(VIEWS_PARAMS.projectMoved, project?.healthMovedSinceLastReview);

  set(VIEWS_PARAMS.goalAlignment, config.modules.goal?.alignment);
  set(VIEWS_PARAMS.noteTag, config.modules.note?.tag);
  set(VIEWS_PARAMS.meetingStatus, config.modules.meeting?.status);
  set(VIEWS_PARAMS.meetingWhen, config.modules.meeting?.when);
  set(VIEWS_PARAMS.reviewType, config.modules.review?.reviewType);
  set(VIEWS_PARAMS.reviewStatus, config.modules.review?.status);

  if (config.sort !== DEFAULT_CROSS_VIEW_CONFIG.sort) {
    set(VIEWS_PARAMS.sort, config.sort);
  }
  if (config.direction !== DEFAULT_CROSS_VIEW_CONFIG.direction) {
    set(VIEWS_PARAMS.direction, config.direction);
  }
  if (config.groupBy !== DEFAULT_CROSS_VIEW_CONFIG.groupBy) {
    set(VIEWS_PARAMS.group, config.groupBy);
  }
  return params;
}

/** The query string that applies a view, including its identity. */
export function viewQuery(viewId: string, config: CrossViewConfig): string {
  const params = paramsFromConfig(config);
  params.set(VIEWS_PARAMS.view, viewId);
  return params.toString();
}

/** True when the URL's configuration differs from the named view's stored one. */
export function isModified(
  current: CrossViewConfig,
  stored: CrossViewConfig | null,
): boolean {
  return stored !== null && !crossViewConfigsEqual(current, stored);
}
