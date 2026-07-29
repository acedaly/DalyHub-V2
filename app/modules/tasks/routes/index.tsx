/**
 * TASKS-01 / TASKS-03 — the `/tasks` module route: the authoritative workspace-wide
 * Tasks planning and execution surface (ADR-043, ADR-059).
 *
 * The loader resolves ONE validated {@link TaskViewConfig} from the URL (falling
 * back to the owner's chosen default view), then reads the bounded, cursor-
 * paginated workspace projection — flat for a list, server-grouped for a grouped or
 * specialist view. There is exactly one task query path: every presentation, every
 * filter combination and every saved view goes through `scope.tasks`, so no view
 * can invent its own definition of what a task is.
 *
 * Everything the surface needs to EXPLAIN itself is resolved here too — the view
 * switcher's system and saved views, the closed option sets for the delegate and
 * parent filters — each from one bounded query, never per-record.
 */

import { env } from "cloudflare:workers";
import { redirect } from "react-router";

import { requireAuthenticatedSession } from "~/platform/request";
import {
  resolveAuthenticatedWorkspaceScope,
  type WorkspaceScope,
} from "~/platform/workspaces";
import {
  DEFAULT_APP_PREFERENCES,
  type TaskDefaultView,
} from "~/kernel/preferences";
import { ownerCalendarIso } from "~/shared/datetime";
import { serializeTaskListItem } from "~/shared/task-record/task-view";
import {
  DEFAULT_TASK_VIEW_CONFIG,
  TASK_SYSTEM_VIEW_DEFINITIONS,
  findTaskSystemView,
  serialiseTaskViewConfig,
  taskViewConfigsEqual,
  type TaskPresentation,
  type TaskSavedView,
  type TaskViewConfig,
} from "~/kernel/task-views";

import type { Route } from "./+types/index";
import { migrateLegacyViewParams } from "../tasks-view-model";
import {
  configFromParams,
  groupDimensionFor,
  paramsFromConfig,
  TASKS_PARAMS,
  toWorkspaceFilters,
} from "../tasks-url-state";
import type { TasksPageData, TasksViewOption } from "../tasks-contract";
import { TasksWorkspace } from "../TasksWorkspace";

export function meta() {
  return [{ title: "Tasks · DalyHub" }];
}

/** How many delegatees / parents the filter option sets offer. Bounded, not "all". */
const DELEGATE_OPTION_LIMIT = 50;
const PARENT_OPTION_LIMIT = 50;

/**
 * Resolve the view switcher's options: the DERIVED system views first, then the
 * owner's saved views. Each carries the query string that applies it, so selecting
 * a view is an ordinary navigation — shareable, bookmarkable and Back/Forward-safe.
 */
function buildViewOptions(
  saved: readonly TaskSavedView[],
  defaultViewId: string | null,
): readonly TasksViewOption[] {
  const system: TasksViewOption[] = TASK_SYSTEM_VIEW_DEFINITIONS.map(
    (definition) => ({
      id: definition.id,
      name: definition.name,
      description: definition.description,
      kind: "system" as const,
      query: viewQuery(definition.id, definition.config),
      isDefault: defaultViewId === definition.id,
    }),
  );
  const user: TasksViewOption[] = saved.map((view) => ({
    id: view.id,
    name: view.name,
    description: null,
    kind: "user" as const,
    query: viewQuery(view.id, view.config),
    isDefault: defaultViewId === view.id,
  }));
  return [...system, ...user];
}

/** The full query string that selects a view: its config plus the view id. */
function viewQuery(viewId: string, config: TaskViewConfig): string {
  const params = paramsFromConfig(config);
  if (viewId !== "default") params.set(TASKS_PARAMS.savedView, viewId);
  return params.toString();
}

/**
 * The configuration a bare `/tasks` starts from: the owner's chosen default view
 * when it still resolves, otherwise the standard workspace. A default that no
 * longer resolves (a deleted saved view) degrades to the standard workspace rather
 * than to an error — a preference is a starting point, never a lock.
 */
function resolveFallbackConfig(
  defaultViewId: string | null,
  defaultPresentation: TaskDefaultView,
  saved: readonly TaskSavedView[],
): { config: TaskViewConfig; viewId: string | null } {
  const standard: TaskViewConfig = {
    ...DEFAULT_TASK_VIEW_CONFIG,
    presentation: presentationForPreference(defaultPresentation),
  };
  if (defaultViewId === null) {
    return { config: standard, viewId: null };
  }
  const system = findTaskSystemView(defaultViewId);
  if (system) return { config: system.config, viewId: system.id };
  const own = saved.find((view) => view.id === defaultViewId);
  if (own) return { config: own.config, viewId: own.id };
  return { config: standard, viewId: null };
}

/**
 * The SET-01 `defaultTasksView` preference, in the TASKS-03 vocabulary.
 *
 * Two of its four values were never layouts (TASKS-03's whole premise): `focus`
 * was a system view and `all` the absence of a filter, and both now mean "the
 * list". The other two remain real presentations. Honouring it here keeps the
 * shipped Settings control meaningful instead of leaving it silently inert — the
 * worst possible state for a preference. A SAVED default view, when the owner has
 * chosen one, is more specific and wins.
 */
function presentationForPreference(value: TaskDefaultView): TaskPresentation {
  return value === "matrix" || value === "sectors"
    ? value
    : DEFAULT_TASK_VIEW_CONFIG.presentation;
}

/**
 * The id of the view whose configuration EQUALS this one, if any. Built-in views
 * are checked first so a configuration that happens to match both is named by the
 * one the product defines rather than the one the owner happened to save.
 */
function findMatchingViewId(
  config: TaskViewConfig,
  saved: readonly TaskSavedView[],
): string | undefined {
  // Serialise the target ONCE. `taskViewConfigsEqual` serialises both sides, so
  // comparing against up to 58 candidates would otherwise stringify the same
  // config 58 times on every request.
  const target = serialiseTaskViewConfig(config);
  return (
    TASK_SYSTEM_VIEW_DEFINITIONS.find(
      (definition) => serialiseTaskViewConfig(definition.config) === target,
    )?.id ??
    saved.find((view) => serialiseTaskViewConfig(view.config) === target)?.id
  );
}

/** The config the explicitly-selected `?saved=` view carries, when it resolves. */
function selectedViewConfig(
  selectedId: string | null,
  saved: readonly TaskSavedView[],
): TaskViewConfig | null {
  if (selectedId === null) return null;
  const system = findTaskSystemView(selectedId);
  if (system) return system.config;
  return saved.find((view) => view.id === selectedId)?.config ?? null;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const url = new URL(request.url);

  // TASKS-01's `?view=focus|all` were a system view and a filter wearing a layout
  // switcher's clothes. Redirect them ONCE into the TASKS-03 vocabulary rather than
  // reinterpreting them silently, so the address bar always states what is applied.
  const migrated = migrateLegacyViewParams(url.searchParams);
  if (migrated) {
    throw redirect(`/tasks?${migrated.toString()}`);
  }

  const cursor = url.searchParams.get(TASKS_PARAMS.cursor);
  /**
   * A cursored request is "Load more": the paginator reads `items` and
   * `nextCursor` and discards the rest of the payload. Resolving the switcher's
   * views and the filter option sets for it would be three D1 round trips per
   * page, thrown away every time — so the chrome is resolved only for a real page
   * render.
   */
  const isPageLoad = cursor === null;

  let timezone = DEFAULT_APP_PREFERENCES.timezone;
  let defaultViewId: string | null = DEFAULT_APP_PREFERENCES.defaultTaskViewId;
  let defaultPresentation = DEFAULT_APP_PREFERENCES.defaultTasksView;
  let defaultCaptureParent: TasksPageData["defaultCaptureParent"] = null;
  let saved: readonly TaskSavedView[] = [];
  let delegates: readonly string[] = [];
  let parents: TasksPageData["parents"] = [];
  let scope: WorkspaceScope | null = null;

  try {
    scope = await resolveAuthenticatedWorkspaceScope(env, session);
    const preferences = await scope.appPreferences.get(session.user.subject);
    timezone = preferences.timezone;
    defaultViewId = preferences.defaultTaskViewId;
    defaultPresentation = preferences.defaultTasksView;

    // Everything else this page needs is INDEPENDENT of everything else, so it
    // runs concurrently rather than as a chain of round trips. Each read fails
    // soft on its own: a saved-view or option-set failure narrows the controls,
    // it does not take the task list down.
    const soft = <T,>(work: Promise<T>, fallback: T): Promise<T> =>
      work.catch(() => fallback);
    const [parent, savedViews, delegateNames, parentOptions] =
      await Promise.all([
        preferences.defaultTaskCaptureParentId
          ? soft(
              scope.tasks.getTaskParentCandidate(
                preferences.defaultTaskCaptureParentId,
              ),
              null,
            )
          : Promise.resolve(null),
        isPageLoad
          ? soft(scope.taskViews.list(session.user.subject), [])
          : Promise.resolve([]),
        isPageLoad
          ? soft(scope.tasks.listTaskDelegates(DELEGATE_OPTION_LIMIT), [])
          : Promise.resolve([]),
        isPageLoad
          ? soft(
              scope.tasks.searchTaskParents({ limit: PARENT_OPTION_LIMIT }),
              [],
            )
          : Promise.resolve([]),
      ] as const);

    if (parent) {
      defaultCaptureParent = {
        id: parent.id,
        kind: parent.kind,
        title: parent.title,
        context: parent.kind === "project" ? "Project" : "Area",
      };
    }
    saved = savedViews;
    delegates = delegateNames;
    parents = parentOptions.map((candidate) => ({
      id: candidate.id,
      kind: candidate.kind,
      title: candidate.title,
    }));
  } catch {
    // The task list itself handles storage failures below; a preference read
    // failure falls back deterministically so /tasks stays reachable.
  }

  const selectedId = url.searchParams.get(TASKS_PARAMS.savedView);
  const selectedConfig = selectedViewConfig(selectedId, saved);
  const fallback =
    selectedConfig !== null
      ? { config: selectedConfig, viewId: selectedId }
      : resolveFallbackConfig(defaultViewId, defaultPresentation, saved);

  // An explicit URL parameter ALWAYS wins over the selected view and over the
  // owner's default, so a deep link, a shared URL and Back/Forward stay
  // authoritative — a preference never overrides an address the user is looking at.
  const config = configFromParams(url.searchParams, fallback.config);
  // When nothing is explicitly selected, recognise a configuration that MATCHES a
  // view and name it — a bare `/tasks` is the standard workspace, not a "Custom"
  // one, and the switcher should say what you are LOOKING AT rather than merely
  // what you last clicked. Matching by configuration also means a shared link and
  // the view it came from report themselves identically.
  const activeViewId =
    selectedConfig !== null
      ? selectedId
      : (findMatchingViewId(config, saved) ?? null);
  const viewModified =
    selectedConfig !== null && !taskViewConfigsEqual(selectedConfig, config);

  const views = buildViewOptions(saved, defaultViewId);
  const todayIso = ownerCalendarIso(new Date(), timezone);
  const groupDimension = groupDimensionFor(config);

  const base: Omit<
    TasksPageData,
    "items" | "nextCursor" | "grouping" | "failed"
  > = {
    config,
    activeViewId,
    viewModified,
    views,
    delegates,
    parents,
    todayIso,
    defaultCaptureParent,
  };

  if (!scope) {
    return {
      ...base,
      items: [],
      nextCursor: null,
      grouping: null,
      failed: true,
    } satisfies TasksPageData;
  }

  const filters = toWorkspaceFilters(config);
  try {
    if (groupDimension !== null) {
      // A grouped view renders from a SERVER-AUTHORITATIVE grouping — accurate
      // per-bucket counts over the whole filtered scope plus a bounded per-bucket
      // slice — never from one global page re-bucketed in the client.
      const grouping = await scope.tasks.listWorkspaceTaskGroups({
        dimension: groupDimension,
        view: config.systemView,
        filters,
        sort: config.sort,
        direction: config.direction,
        todayIso,
      });
      return {
        ...base,
        items: [],
        nextCursor: null,
        grouping: {
          dimension: grouping.dimension,
          groups: grouping.groups.map((group) => ({
            key: group.key,
            count: group.count,
            hasMore: group.hasMore,
            label: group.label,
            items: group.items.map(serializeTaskListItem),
          })),
        },
        failed: false,
      } satisfies TasksPageData;
    }
    const page = await scope.tasks.listWorkspaceTasks({
      view: config.systemView,
      sort: config.sort,
      direction: config.direction,
      filters,
      todayIso,
      cursor: cursor ?? undefined,
    });
    return {
      ...base,
      items: page.items.map(serializeTaskListItem),
      nextCursor: page.nextCursor,
      grouping: null,
      failed: false,
    } satisfies TasksPageData;
  } catch {
    // A malformed/cross-scope cursor or a transient read failure degrades to a calm
    // empty error state rather than a 500 — the surface can never render broken.
    return {
      ...base,
      items: [],
      nextCursor: null,
      grouping: null,
      failed: true,
    } satisfies TasksPageData;
  }
}

export default function TasksRoute({ loaderData }: Route.ComponentProps) {
  return <TasksWorkspace data={loaderData} />;
}
