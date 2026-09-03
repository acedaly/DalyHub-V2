/**
 * V2.8 CONV-01 — the ONE read behind a Project's Tasks tab.
 *
 * Both the record loader (`routes/detail.tsx`, the first page) and the
 * "Load more" endpoint (`routes/tasks.tsx`, every later page) read a page of a
 * Project's tasks the same way, and until CONV-01 each spelled it out: the
 * keyset page, then the page's blocked state and its checklist figures as two
 * bounded aggregates, then a Project-private serialiser. The tab now renders the
 * shared `TaskRow`, which reads the shared list-item shape, so the read lives
 * here once and both routes call it — and the kernel test that pins the tab's
 * statement budget (`test/kernel/conv-01-project-tasks-budget.test.ts`) counts
 * THIS function rather than a copy of it.
 *
 * ── The budget, stated ──────────────────────────────────────────────────────
 * A page costs THREE statements whatever its size: one for the page (which
 * already joins the parent identity and the recurrence — the two facts the
 * shared row draws that the old Card path did not), one bounded aggregate for
 * blocked state, one for checklist progress. The parent candidates the row's
 * inline Project editor and the bulk bar's "Move" offer are a FOURTH, read once
 * per record load beside the page — never per row, and bounded at the same
 * fifty `/tasks` and Today use. Nothing here reads per task.
 *
 * Plain TypeScript, no React and no `cloudflare:workers` import, so the kernel
 * test can call it over a counting D1 exactly as the routes do.
 */

import type { TaskRepository } from "~/kernel/tasks";
import type { TaskBlockedSummary, TaskChecklistProgress } from "~/kernel/tasks";
import type { TaskParentOption } from "~/shared/task-record/TaskRowFields";
import {
  TASK_PARENT_OPTION_LIMIT,
  loadTaskParentOptions,
} from "~/shared/task-record/task-parent-options.server";
import {
  serializeTaskListPage,
  type SerializedTaskListItem,
} from "~/shared/task-record/task-view";

export type ProjectTaskState = "open" | "completed" | "all";

/** One page of a Project's tasks, in the shared list-item shape. */
export interface ProjectTasksPage {
  readonly tasks: readonly SerializedTaskListItem[];
  readonly nextCursor: string | null;
}

/**
 * How many candidate parents the row's inline Project editor offers before its
 * searchable escape hatch takes over — `/tasks`'s and Today's own bound. The
 * number now lives on the shared read (V2.8 CONV-02); this is its name here.
 */
export const PROJECT_TASK_PARENT_OPTION_LIMIT = TASK_PARENT_OPTION_LIMIT;

/** Parse the tab's `?tasks=` / `?state=` value; anything unknown is `open`. */
export function parseProjectTaskState(value: string | null): ProjectTaskState {
  return value === "completed" || value === "all" ? value : "open";
}

export async function loadProjectTasksPage(
  tasks: TaskRepository,
  projectId: string,
  input: { readonly state: ProjectTaskState; readonly cursor?: string },
): Promise<ProjectTasksPage> {
  const page = await tasks.listProjectTasks(projectId, {
    state: input.state,
    ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
  });
  const ids = page.items.map((item) => item.id);
  /*
   * TASKS-12 / TASKS-13 — the page's blocked state and checklist figures, each
   * in ONE bounded aggregate and each guarded on its own: a Project's task list
   * must render even when a dependency or checklist read does not, and then it
   * simply reads as it did before those facts existed.
   */
  const [blocked, checklist] = await Promise.all([
    tasks
      .listBlockedSummaries(ids)
      .catch(() => new Map() as ReadonlyMap<string, TaskBlockedSummary>),
    tasks
      .listChecklistProgress(ids)
      .catch(() => new Map() as ReadonlyMap<string, TaskChecklistProgress>),
  ]);
  return {
    tasks: serializeTaskListPage(page.items, checklist, blocked),
    nextCursor: page.nextCursor,
  };
}

/**
 * The bounded parent candidates for the row's inline Project editor and the
 * bulk bar's "Move" — the SHARED read (V2.8 CONV-02), which fails soft to none
 * and is counted once per record load, never per row.
 */
export async function loadProjectTaskParents(
  tasks: TaskRepository,
): Promise<readonly TaskParentOption[]> {
  return loadTaskParentOptions(tasks);
}
