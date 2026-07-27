/**
 * TASKS-01 — the `/tasks` module route: the authoritative workspace-wide Tasks
 * planning and execution surface (ADR-043).
 *
 * The loader reads the bounded, cursor-paginated workspace read model
 * (`scope.tasks.listWorkspaceTasks`) for the resolved system view; the action
 * creates a task through the trusted spine (parent bound server-side) and applies
 * the quick-capture planning fields through the workspace-bound TaskRepository. The
 * component composes the shared frame (CollectionLayout, Card, Drawer) — the task
 * record itself opens in the ONE canonical shared Task Drawer.
 */

import { env } from "cloudflare:workers";

import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { DEFAULT_APP_PREFERENCES } from "~/kernel/preferences";
import { ownerCalendarIso } from "~/shared/datetime";
import { serializeTaskListItem } from "~/shared/task-record/task-view";
import {
  type CommitmentState,
  type TaskPriority,
  type TaskStatus,
  type TimeSector,
  type WorkspaceTaskFilters,
} from "~/kernel/tasks";

import type { Route } from "./+types/index";
import {
  resolvePrimaryView,
  resolveSort,
  resolveSystemView,
  systemViewFor,
} from "../tasks-view-model";
import type { TasksFilterState, TasksPageData } from "../tasks-contract";
import { TasksWorkspace } from "../TasksWorkspace";

export function meta() {
  return [{ title: "Tasks · DalyHub" }];
}

/** Read the applied filters from the URL search params. */
function readFilters(url: URL): TasksFilterState {
  const get = (k: string): string | null => {
    const v = url.searchParams.get(k);
    return v !== null && v.length > 0 ? v : null;
  };
  return {
    priority: get("priority"),
    timeSector: get("sector"),
    commitmentState: get("commitment"),
    status: get("status"),
    projectId: get("project"),
    goalId: get("goal"),
    areaId: get("area"),
    delegatedOnly: url.searchParams.get("delegated") === "1",
    waitingOnly: url.searchParams.get("waiting") === "1",
  };
}

/**
 * Build the kernel filter object from the URL filter state. Values are passed
 * through as-is; the repository validates them at the boundary (a malformed value
 * throws, which the loader degrades to the calm error state).
 */
function toKernelFilters(filters: TasksFilterState): WorkspaceTaskFilters {
  const out: {
    -readonly [K in keyof WorkspaceTaskFilters]: WorkspaceTaskFilters[K];
  } = {};
  // `__none` is the explicit "no priority / no sector" filter behind a Matrix
  // Unprioritised or Sectors Inbox "view all" link — distinct from "no filter"
  // (undefined). It maps to an explicit null so the repository queries `IS NULL`.
  if (filters.priority === "__none") out.priority = null;
  else if (filters.priority) out.priority = filters.priority as TaskPriority;
  if (filters.timeSector === "__none") out.timeSector = null;
  else if (filters.timeSector)
    out.timeSector = filters.timeSector as TimeSector;
  if (filters.commitmentState)
    out.commitmentState = filters.commitmentState as CommitmentState;
  if (filters.status) out.status = filters.status as TaskStatus;
  if (filters.projectId) out.projectId = filters.projectId;
  if (filters.goalId) out.goalId = filters.goalId;
  if (filters.areaId) out.areaId = filters.areaId;
  if (filters.delegatedOnly) out.delegatedOnly = true;
  if (filters.waitingOnly) out.waitingOnly = true;
  return out;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const url = new URL(request.url);
  let preferredPrimaryView = DEFAULT_APP_PREFERENCES.defaultTasksView;
  let timezone = DEFAULT_APP_PREFERENCES.timezone;
  try {
    const preferenceScope = await resolveAuthenticatedWorkspaceScope(
      env,
      session,
    );
    const preferences = await preferenceScope.appPreferences.get(
      session.user.subject,
    );
    preferredPrimaryView = preferences.defaultTasksView;
    timezone = preferences.timezone;
  } catch {
    // The task list itself handles storage failures below; preference read failure
    // falls back deterministically so /tasks remains reachable.
  }
  const primaryView = resolvePrimaryView(
    url.searchParams.get("view"),
    preferredPrimaryView,
  );
  const sort = resolveSort(url.searchParams.get("sort"));
  const explicitSystem = resolveSystemView(url.searchParams.get("system"));
  const systemView = systemViewFor(primaryView, explicitSystem);
  const filters = readFilters(url);
  const cursor = url.searchParams.get("cursor");
  const todayIso = ownerCalendarIso(new Date(), timezone);

  const base: Omit<
    TasksPageData,
    "items" | "nextCursor" | "grouping" | "failed"
  > = {
    primaryView,
    systemView,
    sort,
    filters,
    todayIso,
  };

  // The Matrix and Sectors views render from a SERVER-AUTHORITATIVE grouping —
  // accurate per-bucket counts + bounded per-bucket records — never from a single
  // global page grouped in the client (ADR-043 §11 / decision 12).
  const groupDimension =
    primaryView === "matrix"
      ? "quadrant"
      : primaryView === "sectors"
        ? "sector"
        : null;

  try {
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);
    if (groupDimension !== null) {
      const grouping = await scope.tasks.listWorkspaceTaskGroups({
        dimension: groupDimension,
        sort,
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
            items: group.items.map(serializeTaskListItem),
          })),
        },
        failed: false,
      } satisfies TasksPageData;
    }
    const page = await scope.tasks.listWorkspaceTasks({
      view: systemView,
      sort,
      filters: toKernelFilters(filters),
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
