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
  TaskWaiting,
  TaskWaitingSubject,
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

/**
 * The JSON-serialised waiting subject (a discriminated union, mirroring the kernel
 * {@link TaskWaitingSubject}). Structurally identical — only kept as a distinct
 * type so the serialised boundary is explicit.
 */
export type SerializedTaskWaitingSubject = TaskWaitingSubject;

/** The JSON-serialised waiting state: `since` as an ISO string, subject preserved. */
export interface SerializedTaskWaiting {
  readonly since: string;
  readonly subject: SerializedTaskWaitingSubject;
}

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
  readonly waiting: SerializedTaskWaiting | null;
}

/** Serialise a kernel waiting state (Date → ISO string). */
export function serializeTaskWaiting(
  waiting: TaskWaiting,
): SerializedTaskWaiting {
  return { since: waiting.since.toISOString(), subject: waiting.subject };
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
    waiting: task.waiting ? serializeTaskWaiting(task.waiting) : null,
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
 * The derived display status (a pill), by explicit precedence:
 * completion → waiting → the open-state workflow position. Waiting is a
 * first-class display state derived from the waiting record (ADR-029) — `status`
 * itself stays `todo`/`in_progress`, so the two can never contradict. Meaning is
 * carried by the label, never colour alone.
 */
export function taskDisplayStatus(
  completed: boolean,
  status: TaskStatus,
  isWaiting = false,
): { readonly label: string; readonly tone: RecordTone } {
  if (completed) {
    return { label: "Completed", tone: "success" };
  }
  if (isWaiting) {
    return { label: "Waiting", tone: "warning" };
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

/* -------------------------------------------------------------------------- */
/* Waiting (TODAY-03) display derivations                                     */
/* -------------------------------------------------------------------------- */

/** Is the task currently waiting AND not completed? Completion hides waiting. */
export function isTaskWaiting(task: {
  readonly completedAt: string | null;
  readonly waiting: SerializedTaskWaiting | null;
}): boolean {
  return task.waiting !== null && !isTaskComplete(task);
}

/**
 * A human label for the waiting subject: the entity's current title, the free-text
 * note, or a calm fallback when an entity target is no longer available (deleted or
 * unlinked). Never dumps an id and never crashes on an unresolved subject.
 */
export function waitingSubjectLabel(
  subject: SerializedTaskWaitingSubject,
): string {
  if (subject.kind === "text") {
    return subject.note;
  }
  return subject.title ?? "someone no longer available";
}

/**
 * Format the waiting-since instant as a UTC calendar date, e.g. "18 Jul 2026".
 * Manual formatting (no `Intl`/`Date` locale) keeps it deterministic. Returns null
 * for an unparseable value.
 */
export function formatWaitingSince(sinceIso: string): string | null {
  const ms = Date.parse(sinceIso);
  if (Number.isNaN(ms)) {
    return null;
  }
  const d = new Date(ms);
  const day = d.getUTCDate();
  const monthName = MONTHS[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  if (!monthName) {
    return null;
  }
  return `${day} ${monthName} ${year}`;
}

/**
 * Format how long a task has been waiting, given a reference `nowMs`, as a calm
 * elapsed phrase: "today", "1 day", "5 days", "3 weeks", "2 months". Bounded to
 * whole units so "since" never becomes noisy. Returns "" for an unparseable value.
 * Injecting `nowMs` keeps it deterministic (an accepted test clock in tests).
 */
export function formatWaitingElapsed(sinceIso: string, nowMs: number): string {
  const ms = Date.parse(sinceIso);
  if (Number.isNaN(ms)) {
    return "";
  }
  const dayMs = 86_400_000;
  const days = Math.max(0, Math.floor((nowMs - ms) / dayMs));
  if (days === 0) {
    return "today";
  }
  if (days === 1) {
    return "1 day";
  }
  if (days < 21) {
    return `${days} days`;
  }
  if (days < 60) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? "1 week" : `${weeks} weeks`;
  }
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month" : `${months} months`;
}
