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
  CommitmentState,
  TaskDelegation,
  TaskListItem,
  TaskPriority,
  TaskRelation,
  TaskStatus,
  TaskView,
  TaskWaiting,
  TaskWaitingSubject,
  TimeSector,
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
  readonly timeSector: TimeSector | null;
  readonly commitmentState: CommitmentState;
  readonly delegation: TaskDelegation | null;
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
    timeSector: task.timeSector,
    commitmentState: task.commitmentState,
    delegation: task.delegation,
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
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly completedAt: string | null;
  readonly status: TaskStatus;
  readonly priority: TaskPriority | null;
  readonly dueDate: string | null;
  readonly scheduledDate: string | null;
  readonly timeSector: TimeSector | null;
  readonly commitmentState: CommitmentState;
  readonly delegation: TaskDelegation | null;
  readonly parent: TaskRelation | null;
  readonly waiting: SerializedTaskWaiting | null;
}

/** Serialise a `TaskListItem` for a JSON loader response. */
export function serializeTaskListItem(
  item: TaskListItem,
): SerializedTaskListItem {
  return {
    id: item.id,
    title: item.title,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    completedAt: item.completedAt ? item.completedAt.toISOString() : null,
    status: item.status,
    priority: item.priority,
    dueDate: item.dueDate,
    scheduledDate: item.scheduledDate,
    timeSector: item.timeSector,
    commitmentState: item.commitmentState,
    delegation: item.delegation,
    parent: item.parent,
    waiting: item.waiting ? serializeTaskWaiting(item.waiting) : null,
  };
}

/** Is the task complete? Completion is the spine's `completedAt`, never a status. */
export function isTaskComplete(task: {
  readonly completedAt: string | null;
}): boolean {
  return task.completedAt !== null;
}

/** Human label for a workflow status value (edit control options). */
export function taskStatusLabel(status: TaskStatus): string {
  switch (status) {
    case "in_progress":
      return "In progress";
    case "on_hold":
      return "On hold";
    case "cancelled":
      return "Cancelled";
    default:
      return "To do";
  }
}

/**
 * The Eisenhower quadrant a priority maps to (ADR-043 §2), or null for an untriaged
 * (no-priority) task. The single source of truth for Matrix placement — the Matrix
 * view, the Drawer and the card presentation all read this.
 */
export type EisenhowerQuadrant = "do" | "defer" | "delegate" | "delete";

/** Map a P1–P4 priority to its Matrix quadrant. `null` → null (unprioritised). */
export function priorityQuadrant(
  priority: TaskPriority | null,
): EisenhowerQuadrant | null {
  switch (priority) {
    case "p1":
      return "do";
    case "p2":
      return "defer";
    case "p3":
      return "delegate";
    case "p4":
      return "delete";
    default:
      return null;
  }
}

/** The Do/Defer/Delegate/Delete-Review action word for a quadrant. */
export function quadrantActionLabel(quadrant: EisenhowerQuadrant): string {
  switch (quadrant) {
    case "do":
      return "Do";
    case "defer":
      return "Defer";
    case "delegate":
      return "Delegate";
    case "delete":
      return "Delete / Review";
  }
}

/**
 * The full everyday priority label, e.g. "P1 · Urgent", "P4 · Low", or
 * "No priority" for null. Meaning is always carried by the label, never colour.
 */
export function taskPriorityLabel(priority: TaskPriority | null): string {
  switch (priority) {
    case "p1":
      return "P1 · Urgent";
    case "p2":
      return "P2 · High";
    case "p3":
      return "P3 · Normal";
    case "p4":
      return "P4 · Low";
    default:
      return "No priority";
  }
}

/** The short priority tag, e.g. "P1". `null` → "—". */
export function taskPriorityTag(priority: TaskPriority | null): string {
  return priority === null ? "—" : priority.toUpperCase();
}

/** Human label for a Time Sector; `null` reads as "Inbox" (the derived state). */
export function timeSectorLabel(sector: TimeSector | null): string {
  switch (sector) {
    case "this_week":
      return "This Week";
    case "next_week":
      return "Next Week";
    case "this_month":
      return "This Month";
    case "next_month":
      return "Next Month";
    case "long_term":
      return "Long Term";
    case "routines":
      return "Routines";
    default:
      return "Inbox";
  }
}

/**
 * The ONE canonical task display-state precedence evaluator (ADR-043 §6), consumed
 * by Tasks, Today and Projects — no duplicated status logic anywhere. Precedence,
 * highest first: Deleted → Completed → Cancelled → Waiting → On hold →
 * Someday/Maybe → In progress → Planned → Inbox. The result is a stable key plus a
 * label and a tone; meaning is carried by the LABEL, never colour alone.
 */
export type TaskDisplayStateKind =
  | "deleted"
  | "completed"
  | "cancelled"
  | "waiting"
  | "on_hold"
  | "someday"
  | "in_progress"
  | "planned"
  | "inbox";

export interface TaskDisplayState {
  readonly kind: TaskDisplayStateKind;
  readonly label: string;
  readonly tone: RecordTone;
}

/** The minimal shape the precedence evaluator reads (serialised or not). */
export interface TaskDisplayStateInput {
  readonly deletedAt?: string | null;
  readonly completedAt: string | null;
  readonly status: TaskStatus;
  readonly commitmentState: CommitmentState;
  readonly timeSector: TimeSector | null;
  readonly scheduledDate: string | null;
  readonly waiting: SerializedTaskWaiting | null;
}

/** Evaluate the deterministic display state of a task (ADR-043 §6). */
export function taskDisplayState(
  task: TaskDisplayStateInput,
): TaskDisplayState {
  if (task.deletedAt != null) {
    return { kind: "deleted", label: "Deleted", tone: "neutral" };
  }
  if (task.completedAt !== null) {
    return { kind: "completed", label: "Completed", tone: "success" };
  }
  if (task.status === "cancelled") {
    return { kind: "cancelled", label: "Cancelled", tone: "neutral" };
  }
  if (task.waiting !== null) {
    return { kind: "waiting", label: "Waiting", tone: "warning" };
  }
  if (task.status === "on_hold") {
    return { kind: "on_hold", label: "On hold", tone: "neutral" };
  }
  if (task.commitmentState === "someday") {
    return { kind: "someday", label: "Someday / Maybe", tone: "info" };
  }
  if (task.status === "in_progress") {
    return { kind: "in_progress", label: "In progress", tone: "info" };
  }
  if (task.timeSector !== null || task.scheduledDate !== null) {
    return { kind: "planned", label: "Planned", tone: "neutral" };
  }
  return { kind: "inbox", label: "Inbox", tone: "neutral" };
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
 * The canonical task URGENCY signal (TASKS-02): what the task's dates say about
 * *when* it needs attention, as a self-describing chip. The distinction the
 * 2026-07 UI/UX audit found missing is made explicit here — **Overdue**, **Due
 * today** and **Scheduled today** are their own kinds with their own WORDS, so a
 * card never signals urgency by colour alone and "due today" is never
 * indistinguishable from a future due date (DEBT-27).
 *
 * The due date (a deadline) takes precedence over the scheduled date (a planned
 * day). `todayIso` is the owner's current calendar date (`YYYY-MM-DD`), compared
 * as strings (lexicographic == chronological for ISO dates) and never routed
 * through a timezone (ADR-022). Completion neutralises the tone (a completed task
 * is not urgent) but the label is retained for context. Returns `null` when the
 * task has neither a due nor a scheduled date (no urgency to signal).
 *
 * The `tone` is REINFORCEMENT only — every meaning is already stated in the label,
 * so a colour-blind or monochrome reader loses nothing (AGENTS.md §15).
 */
export type TaskUrgencyKind =
  "overdue" | "due_today" | "due" | "scheduled_today" | "scheduled";

export type TaskUrgencyTone = "danger" | "warning" | "info" | "neutral";

export interface TaskUrgency {
  readonly kind: TaskUrgencyKind;
  /** A short label that ALWAYS carries the meaning in words (never colour-only). */
  readonly label: string;
  /** Colour reinforcement for the label; the label alone is sufficient. */
  readonly tone: TaskUrgencyTone;
}

/** Evaluate the deterministic urgency signal of a task (TASKS-02). */
export function taskUrgency(
  task: {
    readonly completedAt: string | null;
    readonly dueDate: string | null;
    readonly scheduledDate: string | null;
  },
  todayIso: string,
): TaskUrgency | null {
  const complete = isTaskComplete(task);
  if (task.dueDate !== null) {
    const formatted = formatCalendarDate(task.dueDate);
    if (formatted === null) {
      return null;
    }
    if (!complete && task.dueDate < todayIso) {
      return {
        kind: "overdue",
        label: `Overdue · due ${formatted}`,
        tone: "danger",
      };
    }
    if (task.dueDate === todayIso) {
      return {
        kind: "due_today",
        label: "Due today",
        tone: complete ? "neutral" : "warning",
      };
    }
    return { kind: "due", label: `Due ${formatted}`, tone: "neutral" };
  }
  if (task.scheduledDate !== null) {
    const formatted = formatCalendarDate(task.scheduledDate);
    if (formatted === null) {
      return null;
    }
    if (task.scheduledDate === todayIso) {
      return {
        kind: "scheduled_today",
        label: "Scheduled today",
        tone: complete ? "neutral" : "info",
      };
    }
    return {
      kind: "scheduled",
      label: `Scheduled ${formatted}`,
      tone: "neutral",
    };
  }
  return null;
}

/**
 * The Card's date label for a task, as a plain string slot (retained for the
 * string-only `dateLabel` consumers such as the Waiting list). Delegates to the
 * canonical {@link taskUrgency} so the WORD ("Overdue", "Due today", "Scheduled
 * today") is present here too; the narrow `danger` tone is preserved for the
 * overdue case, and the richer tones are reserved for the {@link taskUrgency}
 * chip. Surfaces that can render a component should use `taskUrgency` +
 * `UrgencyChip` instead.
 */
export function taskDateLabel(
  task: {
    readonly completedAt: string | null;
    readonly dueDate: string | null;
    readonly scheduledDate: string | null;
  },
  todayIso: string,
): { readonly label: string; readonly tone?: "danger" } | null {
  const urgency = taskUrgency(task, todayIso);
  if (urgency === null) {
    return null;
  }
  return urgency.tone === "danger"
    ? { label: urgency.label, tone: "danger" }
    : { label: urgency.label };
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
