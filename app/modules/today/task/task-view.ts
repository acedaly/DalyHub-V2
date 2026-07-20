/**
 * TODAY-02 — the task Drawer view-model (pure, React-free, testable).
 *
 * The seam between the workspace-scoped `TaskView`/`TaskListItem` a loader reads
 * and the display-ready shapes the Drawer renders. It owns the JSON serialisation
 * (Dates → ISO strings, since a resource-route loader returns JSON to the browser)
 * and the small display derivations — the derived status pill, priority labels and
 * calendar-date formatting — kept out of the React components so they can be unit
 * tested directly. Dates are date-only `YYYY-MM-DD` and are formatted MANUALLY
 * (never through `Intl`/`Date`) so server and client render identical text and no
 * timezone shift is possible (ADR-022 dates rule).
 */

import type { RecordTone } from "~/shared/record-layout";
import type {
  TaskListItem,
  TaskPriority,
  TaskRelation,
  TaskStatus,
  TaskView,
} from "~/kernel/tasks";

/**
 * The non-structural association the Task Drawer's Links tab creates. It is a
 * NON-reserved kernel link type (the reserved spine link types stay the
 * SpineRepository's; TODAY-02 never mutates structural parentage through the
 * generic link repository), so the generic FND-04 EntityLink repository accepts
 * it. The structural project/goal/area relationships are shown separately as real,
 * derived relationships — never as `relates_to` links.
 */
export const TASK_RELATES_TO = "task.relates_to";

/** The entity types a task may be related to via `task.relates_to` (curated). */
export const TASK_RELATE_TARGET_TYPES = [
  "task",
  "project",
  "goal",
  "area",
  "note",
  "meeting",
  "person",
] as const;

/** The JSON-serialised task the resource-route loader returns to the browser. */
export interface SerializedTaskView {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
  readonly completedAt: string | null;
  readonly status: TaskStatus;
  readonly priority: TaskPriority | null;
  readonly dueDate: string | null;
  readonly scheduledDate: string | null;
  readonly description: string | null;
  readonly project: TaskRelation | null;
  readonly goal: TaskRelation | null;
  readonly area: TaskRelation | null;
}

/** Serialise a `TaskView` for a JSON loader response (Dates → ISO strings). */
export function serializeTaskView(task: TaskView): SerializedTaskView {
  return {
    id: task.id,
    title: task.title,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    deletedAt: task.deletedAt ? task.deletedAt.toISOString() : null,
    completedAt: task.completedAt ? task.completedAt.toISOString() : null,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
    scheduledDate: task.scheduledDate,
    description: task.description,
    project: task.project,
    goal: task.goal,
    area: task.area,
  };
}

/** A lightweight focus-task summary for the Today surface (Dates → ISO strings). */
export interface SerializedTaskListItem {
  readonly id: string;
  readonly title: string;
  readonly completedAt: string | null;
  readonly status: TaskStatus;
  readonly priority: TaskPriority | null;
  readonly dueDate: string | null;
  readonly scheduledDate: string | null;
  readonly parent: TaskRelation | null;
}

/** Serialise a `TaskListItem` for a JSON loader response. */
export function serializeTaskListItem(
  item: TaskListItem,
): SerializedTaskListItem {
  return {
    id: item.id,
    title: item.title,
    completedAt: item.completedAt ? item.completedAt.toISOString() : null,
    status: item.status,
    priority: item.priority,
    dueDate: item.dueDate,
    scheduledDate: item.scheduledDate,
    parent: item.parent,
  };
}

/** Is the task complete? Completion is the spine's `completedAt`, never a status. */
export function isTaskComplete(task: {
  readonly completedAt: string | null;
}): boolean {
  return task.completedAt !== null;
}

/**
 * The derived display status (a pill): completion wins, else the open-state
 * workflow position. Meaning is carried by the label, never colour alone.
 */
export function taskDisplayStatus(
  completed: boolean,
  status: TaskStatus,
): { readonly label: string; readonly tone: RecordTone } {
  if (completed) {
    return { label: "Completed", tone: "success" };
  }
  if (status === "in_progress") {
    return { label: "In progress", tone: "info" };
  }
  return { label: "To do", tone: "neutral" };
}

/** Human label for a workflow status value (edit control options). */
export function taskStatusLabel(status: TaskStatus): string {
  return status === "in_progress" ? "In progress" : "To do";
}

/** Human label for a priority value; `null` reads as "None". */
export function taskPriorityLabel(priority: TaskPriority | null): string {
  switch (priority) {
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    default:
      return "None";
  }
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * Format a date-only `YYYY-MM-DD` string as, e.g., "1 Aug 2026" — manually, so it
 * is hydration-safe and never timezone-shifted. Returns null for a null/invalid
 * value (the caller renders nothing rather than a broken date).
 */
export function formatCalendarDate(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const monthName = MONTHS[month - 1];
  if (!monthName || day < 1 || day > 31) {
    return null;
  }
  return `${day} ${monthName} ${year}`;
}

/**
 * The Card's date label for a task: the due date (preferred) or the scheduled
 * date, with an `overdue` tone when a due date is in the past and the task is not
 * complete. `todayIso` is the owner's current calendar date (`YYYY-MM-DD`),
 * compared as strings (lexicographic == chronological for ISO dates).
 */
export function taskDateLabel(
  task: {
    readonly completedAt: string | null;
    readonly dueDate: string | null;
    readonly scheduledDate: string | null;
  },
  todayIso: string,
): { readonly label: string; readonly tone?: "danger" } | null {
  if (task.dueDate !== null) {
    const formatted = formatCalendarDate(task.dueDate);
    if (formatted === null) {
      return null;
    }
    const overdue = !isTaskComplete(task) && task.dueDate < todayIso;
    return overdue
      ? { label: `Due ${formatted}`, tone: "danger" }
      : { label: `Due ${formatted}` };
  }
  if (task.scheduledDate !== null) {
    const formatted = formatCalendarDate(task.scheduledDate);
    return formatted === null ? null : { label: `Scheduled ${formatted}` };
  }
  return null;
}
