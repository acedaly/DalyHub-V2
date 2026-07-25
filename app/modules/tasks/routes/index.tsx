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
import {
  resolveAuthenticatedWorkspaceScope,
  type WorkspaceScope,
} from "~/platform/workspaces";
import { ownerCalendarIso } from "~/shared/datetime";
import { serializeTaskListItem } from "~/shared/task-record/task-view";
import {
  SpineParentUnavailableError,
  SpineValidationError,
} from "~/kernel/spine";
import {
  TaskValidationError,
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
import type {
  TasksCreateResult,
  TasksFilterState,
  TasksPageData,
} from "../tasks-contract";
import { TasksWorkspace } from "../TasksWorkspace";

export function meta() {
  return [{ title: "Tasks · DalyHub" }];
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
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
  const primaryView = resolvePrimaryView(url.searchParams.get("view"));
  const sort = resolveSort(url.searchParams.get("sort"));
  const explicitSystem = resolveSystemView(url.searchParams.get("system"));
  const systemView = systemViewFor(primaryView, explicitSystem);
  const filters = readFilters(url);
  const cursor = url.searchParams.get("cursor");
  const todayIso = ownerCalendarIso(new Date());

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

/** Create a task under a chosen parent, then apply quick-capture planning fields. */
async function handleCreate(
  scope: WorkspaceScope,
  form: FormData,
): Promise<TasksCreateResult> {
  const title = String(form.get("title") ?? "");
  const parentId = String(form.get("parentId") ?? "");
  const parentKind = String(form.get("parentKind") ?? "");
  if (parentKind !== "area" && parentKind !== "project") {
    return {
      kind: "create",
      ok: false,
      fieldErrors: { parentId: "Choose a Project or Area for this task." },
    };
  }
  // The task AND its quick-capture planning fields are created in ONE atomic
  // repository operation (ADR-043 §13 / decision 15) — never a spine create
  // followed by a separate detail write, so a failure can never leave a created-
  // but-unplanned or orphaned task, and there is no partial-commit to retry over.
  const priority = form.get("priority");
  const sector = form.get("timeSector");
  const commitment = form.get("commitmentState");
  const dueDate = form.get("dueDate");
  const scheduledDate = form.get("scheduledDate");
  try {
    const task = await scope.tasks.createTask({
      title,
      parent: { kind: parentKind, id: parentId },
      ...(priority ? { priority: String(priority) as TaskPriority } : {}),
      ...(sector ? { timeSector: String(sector) as TimeSector } : {}),
      ...(commitment
        ? { commitmentState: String(commitment) as CommitmentState }
        : {}),
      ...(dueDate ? { dueDate: String(dueDate) } : {}),
      ...(scheduledDate ? { scheduledDate: String(scheduledDate) } : {}),
    });
    return { kind: "create", ok: true, taskId: task.id };
  } catch (cause) {
    if (cause instanceof TaskValidationError) {
      return {
        kind: "create",
        ok: false,
        fieldErrors: { [cause.field]: cause.message },
      };
    }
    if (cause instanceof SpineValidationError) {
      return {
        kind: "create",
        ok: false,
        fieldErrors: { title: cause.message },
      };
    }
    if (cause instanceof SpineParentUnavailableError) {
      return {
        kind: "create",
        ok: false,
        formError: "That Project or Area is no longer available.",
      };
    }
    return {
      kind: "create",
      ok: false,
      formError: "The task couldn't be created. Your text is safe — try again.",
    };
  }
}

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const session = requireAuthenticatedSession(context);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  if (intent === "create") {
    return json(await handleCreate(scope, form));
  }
  return json({ kind: "create", ok: false, formError: "Unknown action." }, 400);
}

export default function TasksRoute({ loaderData }: Route.ComponentProps) {
  return <TasksWorkspace data={loaderData} />;
}
