/**
 * PROJ-01 — the Projects view-model (pure, React-free, testable).
 *
 * The seam between the workspace-scoped `ProjectListItem`/`ProjectOverview`/spine
 * rollup a loader reads and the display shapes the collection Cards and the project
 * Record Layout render. It owns JSON serialisation (Dates → ISO strings, since a
 * loader returns JSON to the browser) and the small display derivations — the
 * open/completed pill, the progress presentation, the Area/Goal labels — kept out of
 * the React components so they can be unit-tested directly. Area/Goal titles come
 * from the resolved relations (never copied); progress is derived, and an empty
 * project is presented as 0% / "No tasks yet", NEVER 100%.
 */

import { normaliseProgress, type CardTone } from "~/shared/card";
import {
  formatCalendarDate,
  serializeTaskWaiting,
  type SerializedTaskWaiting,
} from "~/shared/task-record/task-view";
import type {
  ProjectListItem,
  ProjectOverview,
  ProjectRelation,
} from "~/kernel/projects";
import type { CompletionRollup } from "~/kernel/spine";
import type { TaskListItem, TaskPriority, TaskStatus } from "~/kernel/tasks";

/** JSON-serialised project collection item (Dates → ISO strings). */
export interface SerializedProjectListItem {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
  readonly area: ProjectRelation | null;
  readonly goal: ProjectRelation | null;
  readonly taskTotal: number;
  readonly taskCompleted: number;
}

/** JSON-serialised project overview (Dates → ISO strings). */
export interface SerializedProjectOverview {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
  readonly area: ProjectRelation | null;
  readonly goal: ProjectRelation | null;
}

/** Serialise a `ProjectListItem` for a JSON loader response. */
export function serializeProjectListItem(
  item: ProjectListItem,
): SerializedProjectListItem {
  return {
    id: item.id,
    title: item.title,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    completedAt: item.completedAt ? item.completedAt.toISOString() : null,
    area: item.area,
    goal: item.goal,
    taskTotal: item.taskTotal,
    taskCompleted: item.taskCompleted,
  };
}

/** Serialise a `ProjectOverview` for a JSON loader response. */
export function serializeProjectOverview(
  overview: ProjectOverview,
): SerializedProjectOverview {
  return {
    id: overview.id,
    title: overview.title,
    createdAt: overview.createdAt.toISOString(),
    updatedAt: overview.updatedAt.toISOString(),
    completedAt: overview.completedAt
      ? overview.completedAt.toISOString()
      : null,
    area: overview.area,
    goal: overview.goal,
  };
}

/** Is the project completed? Completion is the spine's `completedAt`. */
export function isProjectComplete(project: {
  readonly completedAt: string | null;
}): boolean {
  return project.completedAt !== null;
}

/**
 * The open/completed display pill. PROJ-01 models ONLY open vs completed (no health,
 * no custom status — those are PROJ-02/PROJ-05). Meaning is in the label, never
 * colour alone.
 */
export function projectStateLabel(project: {
  readonly completedAt: string | null;
}): { readonly label: string; readonly tone: CardTone } {
  return isProjectComplete(project)
    ? { label: "Completed", tone: "success" }
    : { label: "Open", tone: "neutral" };
}

/**
 * The progress presentation for a project's task roll-up. An empty project (no
 * active direct tasks) is `has: false` — presented as "No tasks yet", NEVER 100%.
 * `percent`/`fraction`/`text` reuse the shared `normaliseProgress` so the collection
 * Card bar and the record summary agree.
 */
export interface ProjectProgress {
  readonly has: boolean;
  readonly total: number;
  readonly completed: number;
  readonly percent: number;
  readonly fraction: number;
  /** e.g. "3 of 8 tasks", or "No tasks yet" when empty. */
  readonly summary: string;
}

/** Build the progress presentation from a completed/total pair. */
export function projectProgress(
  completed: number,
  total: number,
): ProjectProgress {
  if (total <= 0) {
    return {
      has: false,
      total: 0,
      completed: 0,
      percent: 0,
      fraction: 0,
      summary: "No tasks yet",
    };
  }
  const { percent, fraction } = normaliseProgress({
    value: completed,
    max: total,
  });
  const noun = total === 1 ? "task" : "tasks";
  return {
    has: true,
    total,
    completed,
    percent,
    fraction,
    summary: `${completed} of ${total} ${noun}`,
  };
}

/** Build the progress presentation from a spine `CompletionRollup`. */
export function projectProgressFromRollup(
  rollup: CompletionRollup,
): ProjectProgress {
  return projectProgress(rollup.completed, rollup.total);
}

/** The display data for one project Card (pure derivation, unit-tested). */
export interface ProjectCardData {
  readonly id: string;
  readonly title: string;
  readonly areaLabel: string | null;
  readonly goalLabel: string | null;
  readonly state: { readonly label: string; readonly tone: CardTone };
  readonly progress: ProjectProgress;
  /** e.g. "Updated 21 Jul 2026", or null when it doesn't genuinely help. */
  readonly updatedLabel: string | null;
}

/**
 * A JSON-serialised task summary for a project's task list (includes the waiting
 * state, which the generic `serializeTaskListItem` omits, so a project shows its
 * blocked work with the TODAY-03 waiting representation).
 */
export interface SerializedProjectTask {
  readonly id: string;
  readonly title: string;
  readonly completedAt: string | null;
  readonly status: TaskStatus;
  readonly priority: TaskPriority | null;
  readonly dueDate: string | null;
  readonly scheduledDate: string | null;
  readonly waiting: SerializedTaskWaiting | null;
}

/** Serialise a kernel `TaskListItem` for a project's task list (Dates → ISO). */
export function serializeProjectTask(
  item: TaskListItem,
): SerializedProjectTask {
  return {
    id: item.id,
    title: item.title,
    completedAt: item.completedAt ? item.completedAt.toISOString() : null,
    status: item.status,
    priority: item.priority,
    dueDate: item.dueDate,
    scheduledDate: item.scheduledDate,
    waiting: item.waiting ? serializeTaskWaiting(item.waiting) : null,
  };
}

/** Map a serialised project list item into its Card display data. */
export function toProjectCardData(
  item: SerializedProjectListItem,
): ProjectCardData {
  const updated = formatCalendarDate(item.updatedAt.slice(0, 10));
  return {
    id: item.id,
    title: item.title,
    areaLabel: item.area?.title ?? null,
    goalLabel: item.goal?.title ?? null,
    state: projectStateLabel(item),
    progress: projectProgress(item.taskCompleted, item.taskTotal),
    updatedLabel: updated ? `Updated ${updated}` : null,
  };
}
