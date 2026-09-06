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
import { redirect, type ShouldRevalidateFunctionArgs } from "react-router";

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
import {
  isSameDocumentParameterChange,
  parametersUnchanged,
} from "~/shared/router/revalidation";
import type { TaskBlockedSummary, TaskChecklistProgress } from "~/kernel/tasks";
import { serializeTaskListPage } from "~/shared/task-record/task-view";
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
  TASKS_FILTER_PARAMS,
  TASKS_PARAMS,
  toWorkspaceFilters,
} from "../tasks-url-state";
import type { TasksPageData, TasksViewOption } from "../tasks-contract";
import { TasksWorkspace } from "../TasksWorkspace";

export function meta() {
  return [{ title: "Tasks · DalyHub" }];
}

/**
 * Every URL parameter this loader actually reads.
 *
 * Derived from the two authoritative maps rather than restated, so a filter or a
 * view dimension added later cannot be forgotten here and quietly stop
 * revalidating the list it changes.
 */
const LOADER_PARAMS: readonly string[] = [
  ...Object.values(TASKS_PARAMS),
  ...Object.values(TASKS_FILTER_PARAMS),
];

/**
 * Opening or closing a Drawer only toggles the `drawer` parameter — which this
 * loader does not read — yet React Router would still re-run the whole task
 * query, its grouping and its four bounded option reads to produce byte-for-byte
 * the same answer. Skipping that is worth doing on its own merits; the same
 * precedent already exists in the Notes collection, for the same reason.
 *
 * PWA-12 — it is also what stops opening a task while OFFLINE taking the page
 * down. A drawer opens by navigating, a navigation re-runs the loader, and a
 * loader that cannot reach the server throws into the global error boundary —
 * so a previously loaded Tasks surface, which is meant to stay usable through a
 * short outage, answered a tap on a row with "Something went wrong". The fix is
 * to not make the request, not to soften the boundary: a request that is never
 * needed cannot fail (§38). Every change this loader DOES depend on still
 * revalidates through the default.
 */
export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  // The shared clause first: a submission and an explicit `revalidate()` are not
  // navigations, and must never be skipped — which is how every mutation on this
  // surface asks the list to re-read itself.
  if (!isSameDocumentParameterChange(args)) {
    return args.defaultShouldRevalidate;
  }
  return parametersUnchanged(args, LOADER_PARAMS)
    ? false
    : args.defaultShouldRevalidate;
}

/** How many delegatees / parents the filter option sets offer. Bounded, not "all". */
const DELEGATE_OPTION_LIMIT = 50;
const PARENT_OPTION_LIMIT = 50;

/**
 * Resolve the view switcher's options: the DERIVED system views first, then the
 * owner's saved views. Each carries the query string that applies it, so selecting
 * a view is an ordinary navigation — shareable, bookmarkable and Back/Forward-safe.
 */
/**
 * TASKS-13 — read checklist progress for a page, and never let it cost the page.
 *
 * The Tasks loader degrades a read failure to a calm empty collection, which is
 * the right answer for the TASKS and the wrong one for a step count beside them:
 * a figure that cannot be read must cost the figure, not the list. So the
 * aggregate is guarded on its own and an empty map means "no figures this time".
 *
 * The ids are supplied by a callback rather than as an array, so the caller's own
 * mapping runs inside the guard too.
 */
async function checklistProgressOrNone(
  scope: WorkspaceScope,
  ids: () => readonly string[],
): Promise<ReadonlyMap<string, TaskChecklistProgress>> {
  try {
    return await scope.tasks.listChecklistProgress(ids());
  } catch {
    return new Map();
  }
}

/**
 * TASKS-12 — read blocked state for a page, on exactly the same terms.
 *
 * One bounded aggregate, guarded on its own, degrading to "no blocked state this
 * time" rather than to an empty collection: a Task that cannot be shown as
 * blocked still has to be shown.
 */
async function blockedSummariesOrNone(
  scope: WorkspaceScope,
  ids: () => readonly string[],
): Promise<ReadonlyMap<string, TaskBlockedSummary>> {
  try {
    return await scope.tasks.listBlockedSummaries(ids());
  } catch {
    return new Map();
  }
}

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
  /*
   * UIX-01 — the standard workspace IS the "All active" built-in view.
   *
   * It was `DEFAULT_TASK_VIEW_CONFIG` directly, which is the kernel's neutral
   * floor rather than a view: the two happened to be identical, so a bare
   * `/tasks` matched the built-in and the comment below could truthfully say "a
   * bare /tasks is the standard workspace". The moment the built-in gained its
   * due-state grouping they diverged, and a bare `/tasks` would have rendered
   * an ungrouped list that reported itself as "Custom" while the All active tab
   * beside it pointed somewhere else.
   *
   * Naming the view here keeps the two in step by construction: whatever "All
   * active" means, that is what an owner with no default preference lands on.
   */
  const standard: TaskViewConfig = {
    ...(findTaskSystemView("default")?.config ?? DEFAULT_TASK_VIEW_CONFIG),
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
 * The SET-01 `defaultTasksView` preference, in the current vocabulary.
 *
 * `focus` was a system view and `all` the absence of a filter (TASKS-03's premise);
 * both mean "the list". `sectors` is the one value that still names a presentation.
 * Honouring it here keeps the shipped Settings control meaningful instead of leaving
 * it silently inert — the worst possible state for a preference. A SAVED default view,
 * when the owner has chosen one, is more specific and wins.
 *
 * A stored `matrix` cannot reach this function: V2.2 removed it from
 * `TASK_DEFAULT_VIEWS`, and the preference read validates against that set and falls
 * back to the documented default. The owner gets the primary list, not a dead route.
 */
function presentationForPreference(value: TaskDefaultView): TaskPresentation {
  return value === "sectors"
    ? "sectors"
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
  let tags: TasksPageData["tags"] = [];
  let scope: WorkspaceScope | null = null;

  try {
    scope = await resolveAuthenticatedWorkspaceScope(env, session, {
      // PERF-01 — this loader reads the owner's preferences immediately, so the
      // read is started before the workspace check rather than after it.
      warmOwnerPreferences: true,
    });
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
    const [parent, savedViews, delegateNames, parentOptions, tagVocabulary] =
      await Promise.all([
        preferences.defaultTaskDestination === "chosen_parent" &&
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
        // V2.6 FIND-03 — the ONE tag filter's option set. It joins the same
        // concurrent group and fails soft like every other option read: a
        // vocabulary that could not be read narrows the controls, it does not
        // take the task list down.
        isPageLoad
          ? soft(scope.tags.listVocabulary(), [])
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
    tags = tagVocabulary.map((tag) => ({ key: tag.key, label: tag.label }));
    parents = parentOptions.map((candidate) => ({
      id: candidate.id,
      kind: candidate.kind,
      title: candidate.title,
      // DEBT-144 — the option carries the parent's identity, so the row's
      // optimistic mark is the parent's own colour from the moment it is chosen.
      iconKey: candidate.iconKey ?? null,
      colourSlot: candidate.colourSlot ?? null,
      colourRank: candidate.colourRank ?? null,
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

  /*
   * A URL that NAMES a built-in view's scope inherits THAT view.
   *
   * UIX-01 gave three built-ins a `due_state` grouping, which made the choice of
   * fallback visible for the first time: `?system=waiting` used to be
   * indistinguishable from the Waiting built-in, and with the fallback carrying
   * All active's grouping it silently became "Waiting, grouped by due state" —
   * a configuration that matches no view, reports itself as "Custom", and
   * cannot be made the owner's default.
   *
   * So a `system` parameter that identifies exactly one unfiltered built-in
   * resolves against that view's configuration; everything else still falls
   * back to the selected view, the owner's default, or the standard workspace.
   * A URL naming a scope means "this view", which is what a shared link is.
   */
  const namedSystem = url.searchParams.get(TASKS_PARAMS.systemView);
  const namedView =
    namedSystem === null
      ? undefined
      : TASK_SYSTEM_VIEW_DEFINITIONS.find(
          (view) =>
            view.config.systemView === namedSystem &&
            Object.keys(view.config.filters).length === 0,
        );

  // An explicit URL parameter ALWAYS wins over the selected view and over the
  // owner's default, so a deep link, a shared URL and Back/Forward stay
  // authoritative — a preference never overrides an address the user is looking at.
  const config = configFromParams(
    url.searchParams,
    namedView?.config ?? fallback.config,
  );
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
  const now = new Date();
  const todayIso = ownerCalendarIso(now, timezone);
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
    tags,
    todayIso,
    // V2.8 CONV-02 — the one clock the row's waiting fact is read against.
    nowMs: now.getTime(),
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
        timezone,
      });
      /*
       * TASKS-13 — checklist progress for the WHOLE grouping, read once.
       *
       * One aggregate over every id the grouping returned (bounded: at most
       * WORKSPACE_GROUP_MAX_BUCKETS buckets of WORKSPACE_GROUP_BUCKET_LIMIT
       * rows), never one per bucket and never one per Task.
       */
      const groupedIds = () =>
        grouping.groups.flatMap((group) => group.items.map((item) => item.id));
      // PERF-01 — read together. Neither aggregate reads what the other writes,
      // and each keeps its own guard, so this is one round trip instead of two
      // without merging two failure domains into one.
      const [groupedProgress, groupedBlocked] = await Promise.all([
        checklistProgressOrNone(scope, groupedIds),
        blockedSummariesOrNone(scope, groupedIds),
      ]);
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
            items: serializeTaskListPage(
              group.items,
              groupedProgress,
              groupedBlocked,
            ),
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
      timezone,
      cursor: cursor ?? undefined,
    });
    // TASKS-13 — ONE bounded aggregate for the page, whatever the page holds.
    // TASKS-12 — and ONE for the page's blocked state, on the same terms.
    // PERF-01 — both at once, for the reason the grouped path above records.
    const pageIds = () => page.items.map((item) => item.id);
    const [progress, blocked] = await Promise.all([
      checklistProgressOrNone(scope, pageIds),
      blockedSummariesOrNone(scope, pageIds),
    ]);
    return {
      ...base,
      items: serializeTaskListPage(page.items, progress, blocked),
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
