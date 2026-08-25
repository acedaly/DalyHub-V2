/**
 * TASKS-01 — the Tasks module's REAL, repository-backed search provider (ADR-043
 * §18). Registered in the Tasks manifest, discovered by DS-08 through
 * `ModuleRegistry.listSearchProviders()` exactly like every other provider. Unlike
 * the retired fixture-backed Today task search, this resolves REAL workspace tasks
 * through the trusted, workspace-scoped `TaskRepository.searchTasks` projection
 * (a bounded, deterministic title match over task records that also returns parent
 * context and planning fields), so results resolve real tasks, never expose another
 * workspace, and render priority/urgency without N+1 detail reads.
 *
 * Server-only dependencies (`cloudflare:workers` env, the composition boundary) are
 * DYNAMICALLY imported INSIDE the executor so this manifest module stays safe to
 * include in the client registry bundle — the executor only ever runs server-side in
 * the `/search` loader. Results open the ONE canonical Task Drawer over `/tasks`.
 */

import type {
  SearchExecutor,
  SearchProviderContribution,
  SearchResultItem,
  SearchResultSignal,
} from "~/kernel/modules";
import { DEFAULT_APP_PREFERENCES } from "~/kernel/preferences";
import type { TaskSearchHit } from "~/kernel/tasks";
import { ownerCalendarIso } from "~/shared/datetime";
import {
  taskPriorityLabel,
  taskPriorityTag,
  taskUrgency,
} from "~/shared/task-record/task-view";

/** The route that hosts a DrawerProvider able to open a `task:<id>` key. */
const TASKS_PATH = "/tasks";

function subtitle(task: TaskSearchHit): string | undefined {
  const parts: string[] = [];
  if (task.parent) {
    parts.push(
      `${task.parent.kind === "project" ? "Project" : "Area"}: ${task.parent.title}`,
    );
  }
  if (task.completedAt) {
    parts.push("Completed");
  } else if (task.status === "cancelled") {
    parts.push("Cancelled");
  }
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function signals(task: TaskSearchHit, todayIso: string): SearchResultSignal[] {
  const items: SearchResultSignal[] = [];
  if (task.priority !== null) {
    items.push({
      id: "priority",
      kind: "priority",
      label: taskPriorityTag(task.priority),
      value: task.priority,
      tone: "neutral",
      accessibleLabel: `${taskPriorityTag(task.priority)} priority — ${taskPriorityLabel(task.priority)}`,
    });
  }
  const urgency = taskUrgency(
    {
      completedAt: task.completedAt ? task.completedAt.toISOString() : null,
      // V2.4-GATE-02 — the two facts that, with completion, decide whether this
      // date can still be late. The subtitle above already reads them.
      status: task.status,
      commitmentState: task.commitmentState,
      dueDate: task.dueDate,
      scheduledDate: task.scheduledDate,
    },
    todayIso,
  );
  if (
    urgency !== null &&
    (urgency.kind === "overdue" ||
      urgency.kind === "due_today" ||
      urgency.kind === "scheduled_today")
  ) {
    items.push({
      id: "urgency",
      kind: "urgency",
      label: urgency.label,
      value: urgency.kind,
      tone:
        urgency.tone === "danger"
          ? "danger"
          : urgency.tone === "warning"
            ? "warning"
            : urgency.tone === "info"
              ? "accent"
              : "neutral",
      accessibleLabel: urgency.label,
    });
  }
  return items;
}

const searchTasks: SearchExecutor = async (query, context) => {
  const text = query.text.trim();
  if (text.length === 0 || query.limit <= 0) {
    return [];
  }
  // Server-only imports, deferred so the manifest stays client-bundle-safe. The
  // `cloudflare:workers` specifier is computed + `@vite-ignore`d so vite never tries
  // to resolve the Workers-runtime built-in during the client/unit-test bundle (this
  // executor only ever runs server-side in the `/search` loader).
  const workersSpecifier = "cloudflare:workers";
  const [{ env }, { bindWorkspaceRepositories }, { createSystemActorContext }] =
    await Promise.all([
      import(/* @vite-ignore */ workersSpecifier) as Promise<{
        env: import("~/platform/workspaces").WorkspaceScopeEnv;
      }>,
      import("~/platform/workspaces"),
      import("~/kernel/activity"),
    ]);
  const scope = bindWorkspaceRepositories(
    env,
    context.workspace,
    createSystemActorContext(),
  );

  const timezone =
    context.ownerId !== undefined
      ? (await scope.appPreferences.get(context.ownerId)).timezone
      : DEFAULT_APP_PREFERENCES.timezone;
  const todayIso = ownerCalendarIso(new Date(), timezone);
  const tasks = await scope.tasks.searchTasks({ text, limit: query.limit });

  return tasks.map<SearchResultItem>((task) => ({
    id: `task:${task.id}`,
    // The canonical, unprefixed kernel id — so linked-record boosting matches.
    entityId: task.id,
    title: task.title,
    subtitle: subtitle(task),
    entityType: "task",
    signals: signals(task, todayIso),
    target: {
      kind: "drawer",
      drawerKey: `task:${task.id}`,
      canonicalPath: TASKS_PATH,
    },
  }));
};

/** The Tasks module's search-provider contribution (registered in the manifest). */
export const tasksSearchProvider: SearchProviderContribution = {
  id: "tasks.search",
  label: "Tasks",
  entityTypes: ["task"],
  search: searchTasks,
};
