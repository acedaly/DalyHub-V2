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
import { isTaskBlocked, isTaskStillOwed } from "~/kernel/tasks";
import type {
  CommitmentState,
  TaskBlockedSummary,
  TaskChecklistItem,
  TaskChecklistProgress,
  TaskDependencies,
  TaskDependencyEndpoint,
  TaskDelegation,
  TaskListItem,
  TaskPriority,
  TaskRecurrenceRule,
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
  readonly recurrence?: TaskRecurrenceRule | null;
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
    recurrence: task.recurrence,
    description: task.description,
    project: task.project,
    goal: task.goal,
    area: task.area,
    waiting: task.waiting ? serializeTaskWaiting(task.waiting) : null,
  };
}

/**
 * TASKS-13 — one checklist item, JSON-serialised.
 *
 * The Dates become ISO strings like every other serialised record. Nothing else
 * is added, removed or derived: a checklist item is a title, an order and a tick,
 * and the wire shape says so as plainly as the domain type does.
 */
export interface SerializedChecklistItem {
  readonly id: string;
  readonly taskId: string;
  readonly title: string;
  readonly position: number;
  readonly completed: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Serialise a kernel checklist item for a JSON loader/action response. */
export function serializeChecklistItem(
  item: TaskChecklistItem,
): SerializedChecklistItem {
  return {
    id: item.id,
    taskId: item.taskId,
    title: item.title,
    position: item.position,
    completed: item.completed,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

/** Serialise a whole checklist, preserving the repository's canonical order. */
export function serializeChecklist(
  items: readonly TaskChecklistItem[],
): readonly SerializedChecklistItem[] {
  return items.map(serializeChecklistItem);
}

/** Progress over the SERIALISED shape, so a client counts the same way the server does. */
export function serializedChecklistProgress(
  items: readonly SerializedChecklistItem[],
): TaskChecklistProgress {
  let completed = 0;
  for (const item of items) {
    if (item.completed) completed += 1;
  }
  return { total: items.length, completed };
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
  readonly recurrence?: TaskRecurrenceRule | null;
  readonly parent: TaskRelation | null;
  readonly waiting: SerializedTaskWaiting | null;
  /**
   * TASKS-13 — this Task's checklist progress, when the surface asked for it.
   *
   * `undefined` means the loader did not project it (most surfaces do not), and
   * is deliberately different from `{ total: 0 }`, which means "this Task has no
   * checklist". A row draws the indicator only for a real, non-empty checklist,
   * so neither value can be mistaken for the other.
   *
   * It is only ever filled from the repository's ONE bounded aggregate
   * (`listChecklistProgress`), never by counting items a surface fetched.
   */
  readonly checklist?: TaskChecklistProgress;
  /**
   * TASKS-12 — this Task's BLOCKED state, when the surface asked for it.
   *
   * `undefined` means the loader did not project it, which is deliberately
   * different from "not blocked" — a Task with no incomplete blockers simply has
   * no entry in the aggregate, and both read as "draw nothing". A row therefore
   * never claims a Task is unblocked on a surface that did not ask.
   *
   * Only ever filled from the repository's ONE bounded aggregate
   * (`listBlockedSummaries`), never by counting edges a surface fetched, and
   * never stored: it is derived on every read from the edges plus the blockers'
   * own completion.
   */
  readonly blocked?: TaskBlockedSummary;
}

/**
 * TASKS-09 — the fields of a list item a SURFACE may change in place, as a patch.
 *
 * It exists so an optimistic presentation can be expressed as data rather than as a
 * second copy of the item: a row that has just been completed is
 * `{ completedAt: "…" }` applied over the loader's record, and every derived display
 * value (the state pill, the urgency chip, the strike-through) is re-derived from the
 * result by the SAME pure functions that read the server's own answer. Nothing here is
 * an authority — the patch describes what the server was ASKED to do, and it is
 * discarded the moment the server's answer arrives.
 *
 * Deliberately narrow: only fields a row can edit, never `id`, `createdAt`,
 * `updatedAt`, `recurrence` or `delegation`. A change the row cannot make is a change
 * the row must not pretend to.
 */
export type TaskListItemPatch = Partial<
  Pick<
    SerializedTaskListItem,
    | "title"
    | "completedAt"
    | "status"
    | "priority"
    | "dueDate"
    | "scheduledDate"
    | "timeSector"
    | "commitmentState"
    | "parent"
  >
>;

/**
 * Apply an optimistic patch to ONE record, returning the record itself when
 * nothing actually changed.
 *
 * TODAY-TASK-01 moved this out of the Tasks module. It is the mechanism ADR-086
 * describes — "presentation may lead the server" expressed as data over the
 * loader's own record, so every derived display value is re-derived by the SAME
 * pure functions that read the server's answer — and Today needs exactly it for
 * exactly that reason. Generic in the record type so a surface carrying extra
 * per-day facts alongside the item (Today's `DayTask`) keeps them.
 *
 * A parent is compared by the identity of its id, not by object identity: the
 * patch constructs a fresh relation object every time.
 */
export function applyTaskListItemPatch<T extends SerializedTaskListItem>(
  item: T,
  patch: TaskListItemPatch | undefined,
): T {
  if (patch === undefined) return item;
  let changed = false;
  for (const key of Object.keys(patch) as (keyof TaskListItemPatch)[]) {
    const value = patch[key];
    if (value === undefined) continue;
    if (key === "parent") {
      const current = item.parent?.id ?? null;
      const next = (value as SerializedTaskListItem["parent"])?.id ?? null;
      if (current !== next) changed = true;
      continue;
    }
    if (item[key] !== value) changed = true;
  }
  return changed ? { ...item, ...patch } : item;
}

/**
 * Serialise a `TaskListItem` for a JSON loader response.
 *
 * TASKS-13 — `progress` is the SECOND argument rather than a field of the kernel
 * item, because a checklist figure costs a query and most surfaces do not draw
 * one. A loader that wants it reads `listChecklistProgress` ONCE for the whole
 * page and passes each Task its entry, which is what makes "no N+1" visible at
 * the call site rather than hidden inside a list method.
 */
export function serializeTaskListItem(
  item: TaskListItem,
  progress?: TaskChecklistProgress | null,
): SerializedTaskListItem {
  return {
    ...(progress ? { checklist: progress } : {}),
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
    recurrence: item.recurrence,
    parent: item.parent,
    waiting: item.waiting ? serializeTaskWaiting(item.waiting) : null,
  };
}

/**
 * TASKS-13 — serialise a whole PAGE of Tasks with their checklist progress.
 *
 * The shape every surface that draws the figure uses, so the "read progress ONCE
 * for the page, then stamp it" discipline is one call rather than a pattern each
 * loader re-implements (and one of them eventually gets wrong by reading inside
 * the map).
 */
export function serializeTaskListPage(
  items: readonly TaskListItem[],
  progress: ReadonlyMap<string, TaskChecklistProgress>,
  /**
   * TASKS-12 — the page's blocked state, from its own bounded aggregate. Optional
   * so a surface that does not draw blocked state pays nothing for it, exactly as
   * `progress` is optional per item.
   */
  blocked?: ReadonlyMap<string, TaskBlockedSummary>,
): readonly SerializedTaskListItem[] {
  return items.map((item) => {
    const serialised = serializeTaskListItem(item, progress.get(item.id));
    const summary = blocked?.get(item.id);
    return summary ? { ...serialised, blocked: summary } : serialised;
  });
}

/**
 * TASKS-13 — stamp checklist progress onto an ALREADY-serialised item.
 *
 * For a loader that builds its projection through several nested steps (Weekly
 * Planning composes days and a banded queue before it has one list to map over):
 * it collects the ids it ended up with, makes ONE bounded progress read, and
 * stamps the result. Returns the SAME object when there is nothing to add, so an
 * unchanged page is not needlessly re-allocated.
 */
export function withChecklistProgress<T extends SerializedTaskListItem>(
  item: T,
  progress: ReadonlyMap<string, TaskChecklistProgress>,
): T {
  const found = progress.get(item.id);
  return found === undefined ? item : { ...item, checklist: found };
}

/**
 * TODAY-TASK-01 — the SHARED display projection of one list item.
 *
 * Every surface that draws a task ROW needs the same six derivations over the
 * loader's record: is it complete, is it waiting, what display state does the
 * precedence evaluator give it, and the three values (`priority`, the two dates)
 * that pass through untouched. The Tasks module had them, inside its own
 * `toTaskCardData`, and Today could not adopt the shared row without either
 * importing a module-private view-model (which the module-isolation rule forbids)
 * or writing a second copy of `taskDisplayState`'s plumbing.
 *
 * So the projection lives here, beside the row it feeds. `toTaskCardData` now
 * composes it rather than restating it, which is what makes "the same task is the
 * same row on `/today` and on `/tasks`" true by construction rather than by two
 * files agreeing.
 */
export interface TaskRowProjection {
  readonly id: string;
  readonly title: string;
  readonly priority: TaskPriority | null;
  readonly stateKind: TaskDisplayStateKind;
  readonly stateLabel: string;
  readonly stateTone: RecordTone;
  readonly dueDate: string | null;
  readonly scheduledDate: string | null;
  readonly parent: TaskRelation | null;
  readonly completed: boolean;
  readonly waiting: boolean;
  /**
   * V2.4-GATE-02 — is this Task still a commitment the owner OWES?
   *
   * The kernel's `open`-scope answer (`isTaskStillOwed`), carried on the
   * projection rather than re-derived per surface, because it is the input to
   * every "is this date late?" decision a row makes: the date's urgency ramp, the
   * row's own `data-overdue` and the completion control's affordance. Projecting
   * it once is what makes a cancelled Task's passed date read the same on
   * `/tasks`, `/today`, `/plan` and a Project's Tasks tab.
   */
  readonly stillOwed: boolean;
  readonly recurrence: TaskRecurrenceRule | null;
  /** TASKS-13 — checklist progress, when the surface projected it. */
  readonly checklist?: TaskChecklistProgress;
  /** TASKS-12 — blocked state, when the surface projected it. */
  readonly blocked?: TaskBlockedSummary;
}

/** Project one serialised list item into the shared row's data contract. */
export function toTaskRowProjection(
  item: SerializedTaskListItem,
): TaskRowProjection {
  const state = taskDisplayState({
    deletedAt: null,
    completedAt: item.completedAt,
    status: item.status,
    commitmentState: item.commitmentState,
    timeSector: item.timeSector,
    scheduledDate: item.scheduledDate,
    waiting: item.waiting,
    // TASKS-12 — passed through so ONE evaluator decides the state. A surface
    // that did not project blocked state passes `undefined` and gets exactly the
    // state it got before TASKS-12.
    blocked: isTaskBlocked(item.blocked),
  });
  return {
    id: item.id,
    title: item.title,
    priority: item.priority,
    stateKind: state.kind,
    stateLabel: state.label,
    stateTone: state.tone,
    dueDate: item.dueDate,
    scheduledDate: item.scheduledDate,
    // The relation is passed through WHOLE — including the identity DEBT-144
    // added to it — so a row's parent mark is the parent's own, everywhere.
    parent: item.parent,
    completed: item.completedAt !== null,
    waiting: item.waiting !== null && item.completedAt === null,
    stillOwed: taskStillOwed(item),
    recurrence: item.recurrence ?? null,
    // Passed through whole, so every surface drawing the shared row shows the
    // same figure — and a surface that did not project it shows none.
    ...(item.checklist ? { checklist: item.checklist } : {}),
    ...(item.blocked ? { blocked: item.blocked } : {}),
  };
}

/** Is the task complete? Completion is the spine's `completedAt`, never a status. */
export function isTaskComplete(task: {
  readonly completedAt: string | null;
}): boolean {
  return task.completedAt !== null;
}

/**
 * V2.4-GATE-02 — the kernel's commitment answer, over the SERIALISED shape.
 *
 * An adapter and nothing more: it spells the three facts
 * {@link isTaskStillOwed} reads out of the shape a loader actually hands a
 * surface, and delegates. The status list itself is stated exactly once, in
 * `app/kernel/tasks/task.ts`, so no surface can grow a second opinion about what
 * "still owed" means.
 */
export function taskStillOwed(task: {
  readonly completedAt: string | null;
  readonly status: TaskStatus;
  readonly commitmentState: CommitmentState;
}): boolean {
  return isTaskStillOwed({
    completed: task.completedAt !== null,
    status: task.status,
    someday: task.commitmentState === "someday",
  });
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

/*
 * TASKS-05 (V2.2) — the Eisenhower QUADRANT vocabulary was removed with the Matrix
 * view. `priorityQuadrant`, `quadrantActionLabel` and `EisenhowerQuadrant` existed
 * only to name the 2×2's cells and to carry "Do / Defer / Delegate / Delete" as a
 * second reading of the ONE stored priority field. With no Matrix there is no second
 * reading: P1–P4 is the whole axis, and `taskPriorityLabel` / `taskPriorityTag` below
 * are its only vocabulary. The stored priorities are untouched — see
 * `TASKS_MODULE.md → The Matrix was removed`.
 */

/**
 * The full everyday priority label. UI maps the legacy stored `null` value to
 * Priority 4 until a deliberate data migration stores that value explicitly.
 */
export function taskPriorityLabel(priority: TaskPriority | null): string {
  switch (priority) {
    case "p1":
      return "Priority 1";
    case "p2":
      return "Priority 2";
    case "p3":
      return "Priority 3";
    case "p4":
      return "Priority 4";
    default:
      return "Priority 4";
  }
}

/** The short priority tag, e.g. "P1". Legacy `null` displays as normal P4. */
export function taskPriorityTag(priority: TaskPriority | null): string {
  return priority === null ? "P4" : priority.toUpperCase();
}

/**
 * TASKS-04 / TASKS-07 — the ONE human label for a recurrence rule, in the same
 * restrained vocabulary the quick-capture parser recognises ("Every weekday", "Every
 * 2 weeks"), so what the user typed, what the preview showed, what the custom editor
 * summarises and what every read-only surface reports all read alike. `null` means
 * the task does not repeat.
 *
 * An `after_completion` rule is worded as an INTERVAL rather than a schedule ("14
 * days after completion"), because that is what it means: saying "Every 14 days"
 * for a rule whose clock restarts when the work is done would describe the wrong
 * product.
 */
export function taskRecurrenceLabel(
  rule:
    | (Pick<
        TaskRecurrenceRule,
        "frequency" | "interval" | "dateKind" | "weekdays"
      > &
        Partial<
          Pick<
            TaskRecurrenceRule,
            "mode" | "ordinal" | "weekendRule" | "endsAfterCount" | "endsOnDate"
          >
        >)
    | null
    | undefined,
): string | null {
  if (!rule) return null;
  // An after-completion rule always states its NUMBER, even at one: "1 week after
  // completion" is an interval, whereas a bare "week after completion" reads as a
  // fragment.
  const counted = (unit: string) =>
    rule.interval === 1 ? `1 ${unit}` : `${rule.interval} ${unit}s`;
  if ((rule.mode ?? "fixed") === "after_completion") {
    const unit =
      rule.frequency === "week"
        ? "week"
        : rule.frequency === "month"
          ? "month"
          : rule.frequency === "year"
            ? "year"
            : "day";
    return `${counted(unit)} after completion`;
  }
  const every = (unit: string) =>
    rule.interval === 1 ? `Every ${unit}` : `Every ${rule.interval} ${unit}s`;
  const base =
    rule.frequency === "day"
      ? every("day")
      : rule.frequency === "weekday"
        ? "Every weekday"
        : rule.frequency === "week"
          ? rule.weekdays.length > 0
            ? `Every ${rule.weekdays.map((day) => TASK_WEEKDAY_NAMES[day] ?? "day").join(", ")}${rule.interval === 1 ? "" : `, every ${rule.interval} weeks`}`
            : every("week")
          : rule.frequency === "month"
            ? // TASKS-12 — the nth-weekday monthly rule reads as the phrase people
              // actually say: "The last Friday of every month".
              (rule.ordinal ?? null) !== null && rule.weekdays.length === 1
              ? `The ${rule.ordinal} ${TASK_WEEKDAY_NAMES[rule.weekdays[0]!] ?? "day"} of ${rule.interval === 1 ? "every month" : `every ${rule.interval} months`}`
              : every("month")
            : every("year");
  const parts = [rule.dateKind === "due" ? `${base}, from the due date` : base];
  /*
   * TASKS-12 — the weekend rule and the end condition are stated as CLAUSES of
   * the same sentence rather than as separate chips, because they qualify the
   * rule rather than standing beside it: "The last Friday of every month, moved
   * to the Friday before, 12 times".
   */
  const weekend = rule.weekendRule ?? "allow";
  if (weekend === "before") parts.push("moved to the Friday before");
  else if (weekend === "after") parts.push("moved to the Monday after");
  else if (weekend === "skip") parts.push("skipping weekends");
  const count = rule.endsAfterCount ?? null;
  const until = rule.endsOnDate ?? null;
  if (count !== null) parts.push(count === 1 ? "once only" : `${count} times`);
  else if (until !== null) parts.push(`until ${until}`);
  return parts.join(", ");
}

/**
 * Weekday names for a selected-weekday weekly rule (0 = Sunday). Exported so the
 * recurrence editor's toggles carry the FULL name as their accessible name — a
 * three-letter abbreviation is a visual shorthand, not a label.
 */
export const TASK_WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** The short weekday names the custom recurrence editor's toggles use (0 = Sunday). */
export const TASK_WEEKDAY_SHORT_NAMES = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

/** Human label for a Time Sector; `null` is the explicit "No sector" value. */
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
      return "No sector";
  }
}

/**
 * The ONE canonical task display-state precedence evaluator (ADR-043 §6), consumed
 * by Tasks, Today and Projects — no duplicated status logic anywhere. Precedence,
 * highest first: Deleted → Completed → Cancelled → Waiting → On hold →
 * Someday/Maybe → In progress → Planned → Unscheduled. The result is a stable key
 * plus a label and a tone; meaning is carried by the LABEL, never colour alone.
 */
export type TaskDisplayStateKind =
  | "deleted"
  | "completed"
  | "cancelled"
  | "waiting"
  | "blocked"
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
  /**
   * TASKS-12 — does at least one incomplete blocker remain?
   *
   * Optional, and absent means "the surface did not ask", not "no". It is DERIVED
   * on every read (there is no stored flag), so a Task cannot be left displaying
   * Blocked after its last blocker was completed, or displaying Planned after one
   * was reopened.
   */
  readonly blocked?: boolean;
}

/** Evaluate the deterministic display state of a task (ADR-043 §6). */
export function taskDisplayState(
  task: TaskDisplayStateInput,
): TaskDisplayState {
  if (task.deletedAt != null) {
    return { kind: "deleted", label: "Deleted", tone: "neutral" };
  }
  if (task.completedAt !== null) {
    return { kind: "completed", label: "Completed", tone: "completed" };
  }
  if (task.status === "cancelled") {
    return { kind: "cancelled", label: "Cancelled", tone: "neutral" };
  }
  if (task.waiting !== null) {
    return { kind: "waiting", label: "Waiting", tone: "waiting" };
  }
  /*
   * TASKS-12 — Blocked sits BELOW Waiting and ABOVE On hold.
   *
   * Below Waiting because waiting is a statement the owner made about this Task
   * ("I have asked Finance"), and a statement the owner made outranks one derived
   * from another record. Above On hold, Someday and In progress because those
   * describe how the owner is treating the work, while blocked describes whether
   * it can be done at all — and a Task that says "In progress" when it cannot
   * start is the more misleading of the two.
   *
   * It takes the WAITING tone deliberately: blocked and waiting are the same
   * family ("this cannot proceed"), and a new colour for a second flavour of the
   * same fact would be status-pill inflation. Meaning is carried by the label.
   */
  if (task.blocked === true) {
    return { kind: "blocked", label: "Blocked", tone: "waiting" };
  }
  if (task.status === "on_hold") {
    return { kind: "on_hold", label: "On hold", tone: "on-hold" };
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
  return { kind: "inbox", label: "Unscheduled", tone: "neutral" };
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

/** How a relative date reads against the owner's day. Never a colour on its own. */
export type RelativeDateUrgency = "overdue" | "today" | "soon" | "future";

/**
 * UIX-01 — a date-only value as the WORDS a list is scanned by.
 *
 * `formatCalendarDate` prints "7 Aug 2026", which is exact and unreadable at a
 * glance: down a column of thirty rows, deciding which of them have passed
 * means comparing three-part dates against a date you have to remember. Every
 * reference productivity application answers this the same way, and so does the
 * UIX-01 design: the near days get their names, and only the far ones get a
 * date.
 *
 *     beyond    Over a year ago
 *     -365…-31  3 months ago
 *     -30 … -2  20 days ago
 *     -1        Yesterday
 *      0        Today
 *      +1       Tomorrow
 *     +2 … +6   Thu               (this coming week — the weekday alone)
 *     beyond    Thu, 12 Jun       (and "Thu, 12 Jun 2027" across a year)
 *
 * DS-04 BOUNDED the past, and deliberately did not make it absolute.
 *
 * The unbounded form was the worst-reading thing on the Tasks screen — a column
 * ending in "9722 days ago" is arithmetic the reader has to undo, and it grows
 * without limit. The first fix was to print a date past a week, and that was
 * wrong for a reason a screenshot does not show: an absolute date says nothing
 * about having PASSED, so in an ungrouped list the only thing left saying a task
 * had slipped was the colour — which §15 forbids as the sole carrier.
 *
 * The ladder above is the one `relativePastLabel` already uses on Today, so the
 * product has ONE vocabulary for how long ago something was rather than two. It
 * is bounded at every distance, and it keeps the state in words.
 *
 * The `urgency` alongside is what a surface tints with. It is never the only
 * signal: the label itself SAYS the state ("Yesterday", "Today"), which is why
 * this function let the task row drop its separate urgency chip.
 *
 * Pure string arithmetic on the owner's calendar day (ADR-022) — no `Date`
 * construction from a local clock, no timezone, hydration-safe. Returns `null`
 * for a null or malformed value, exactly as `formatCalendarDate` does.
 */
export function relativeCalendarDate(
  value: string | null,
  todayIso: string,
): { readonly label: string; readonly urgency: RelativeDateUrgency } | null {
  const absolute = formatCalendarDate(value);
  if (value === null || absolute === null) {
    return null;
  }
  const days = calendarDayDifference(todayIso, value);
  if (days === null) {
    return { label: absolute, urgency: "future" };
  }
  if (days === 0) return { label: "Today", urgency: "today" };
  if (days === 1) return { label: "Tomorrow", urgency: "soon" };
  if (days === -1) return { label: "Yesterday", urgency: "overdue" };
  if (days < -1) {
    return { label: elapsedPhrase(-days), urgency: "overdue" };
  }
  const weekday = calendarWeekday(value);
  if (weekday === null) {
    return { label: absolute, urgency: "future" };
  }
  // Inside the coming week the weekday alone is unambiguous and shortest.
  if (days <= 6) return { label: weekday, urgency: "soon" };
  // Beyond it the weekday needs a date.
  return {
    label: absoluteWithWeekday(absolute, weekday, value, todayIso),
    urgency: "future",
  };
}

/**
 * "20 days ago" / "3 months ago" / "Over a year ago" — the elapsed phrase.
 *
 * The SAME ladder `relativePastLabel` uses on Today (`app/modules/today/day/
 * day-view.ts`), so the product has one answer to "how long ago was that?".
 * Bounded at every distance: a task whose due date is a seeded 1 Jan 2000 reads
 * "Over a year ago" rather than counting nine thousand days.
 */
function elapsedPhrase(days: number): string {
  if (days <= 30) return `${days} days ago`;
  if (days <= 365) {
    const months = Math.round(days / 30);
    return months === 1 ? "1 month ago" : `${months} months ago`;
  }
  return "Over a year ago";
}

/**
 * "Thu, 12 Jun" — the far form, in ONE place so the far past and the far future
 * cannot drift into two spellings of the same thing.
 *
 * `formatCalendarDate` already produced "12 Jun 2027"; the YEAR is dropped when
 * the value is in the owner's current year, which is the only case where it
 * disambiguates nothing.
 */
function absoluteWithWeekday(
  absolute: string,
  weekday: string,
  value: string,
  todayIso: string,
): string {
  const sameYear = value.slice(0, 4) === todayIso.slice(0, 4);
  const dayAndMonth = absolute.slice(0, absolute.lastIndexOf(" "));
  return `${weekday}, ${sameYear ? dayAndMonth : absolute}`;
}

/** Whole calendar days from `fromIso` to `toIso`, or null if either is malformed. */
function calendarDayDifference(fromIso: string, toIso: string): number | null {
  const utc = (iso: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    return match
      ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
      : null;
  };
  const from = utc(fromIso);
  const to = utc(toIso);
  return from === null || to === null
    ? null
    : Math.round((to - from) / 86_400_000);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** The short weekday name for a date-only ISO value, or null if malformed. */
function calendarWeekday(iso: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const day = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  ).getUTCDay();
  return WEEKDAYS[day] ?? null;
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

/**
 * The shape {@link taskUrgency} reads: the two dates plus the three facts that
 * decide whether the owner still OWES the work.
 *
 * V2.4-GATE-02 widened it from `completedAt` alone. Completion was only one
 * third of the kernel's own answer, so a **cancelled** or **Someday / Maybe**
 * Task with a passed deadline was labelled "Overdue · due 6 Jul 2026" in the
 * danger tone, beside its own state pill. The facts are REQUIRED rather than
 * optional: a caller that cannot say whether a Task is still owed cannot
 * honestly ask whether its date is late.
 */
export interface TaskUrgencyInput {
  readonly completedAt: string | null;
  readonly status: TaskStatus;
  readonly commitmentState: CommitmentState;
  readonly dueDate: string | null;
  readonly scheduledDate: string | null;
}

/** Evaluate the deterministic urgency signal of a task (TASKS-02). */
export function taskUrgency(
  task: TaskUrgencyInput,
  todayIso: string,
): TaskUrgency | null {
  /*
   * V2.4-GATE-02 — "still owed", from the kernel, not from completion alone.
   *
   * `taskStillOwed` delegates to `isTaskStillOwed`, which states the terminal /
   * parked triple exactly once. Nothing in this file re-derives it.
   */
  const owed = taskStillOwed(task);
  if (task.dueDate !== null) {
    const formatted = formatCalendarDate(task.dueDate);
    if (formatted === null) {
      return null;
    }
    if (owed && task.dueDate < todayIso) {
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
        tone: owed ? "warning" : "neutral",
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
        tone: owed ? "info" : "neutral",
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
  task: TaskUrgencyInput,
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

/* -------------------------------------------------------------------------- */
/* TASKS-12 — dependencies                                                    */
/* -------------------------------------------------------------------------- */

/** One end of a dependency, JSON-serialised (`completedAt` → ISO string). */
export interface SerializedTaskDependency {
  readonly taskId: string;
  readonly title: string;
  readonly completedAt: string | null;
}

/** A Task's dependencies in both directions, JSON-serialised. */
export interface SerializedTaskDependencies {
  readonly blockedBy: readonly SerializedTaskDependency[];
  readonly blocks: readonly SerializedTaskDependency[];
}

function serializeDependencyEndpoint(
  endpoint: TaskDependencyEndpoint,
): SerializedTaskDependency {
  return {
    taskId: endpoint.taskId,
    title: endpoint.title,
    completedAt: endpoint.completedAt
      ? endpoint.completedAt.toISOString()
      : null,
  };
}

/** Serialise both directions, preserving the repository's canonical order. */
export function serializeTaskDependencies(
  dependencies: TaskDependencies,
): SerializedTaskDependencies {
  return {
    blockedBy: dependencies.blockedBy.map(serializeDependencyEndpoint),
    blocks: dependencies.blocks.map(serializeDependencyEndpoint),
  };
}

/**
 * TASKS-12 — the blocked summary a RECORD derives from its own dependency list.
 *
 * The record already holds every blocker, so asking the server a second time for
 * a figure it can count would be a query for nothing. It counts the SAME way the
 * server's aggregate does — a blocker blocks only while it is incomplete — and
 * names the alphabetically-first such blocker, so the record's wording and the
 * row's wording are the same sentence about the same Task.
 */
export function blockedSummaryOf(
  dependencies: SerializedTaskDependencies | null | undefined,
): TaskBlockedSummary | null {
  const open = (dependencies?.blockedBy ?? []).filter(
    (blocker) => blocker.completedAt === null,
  );
  if (open.length === 0) return null;
  const first = [...open].sort((a, b) =>
    a.title === b.title
      ? a.taskId.localeCompare(b.taskId)
      : a.title.localeCompare(b.title),
  )[0]!;
  return { blockerCount: open.length, firstBlockerTitle: first.title };
}

/**
 * TASKS-12 — stamp blocked state onto an ALREADY-serialised list item.
 *
 * The mirror of `withChecklistProgress`, and it exists for the same reason: a
 * loader collects the ids it ended up with, makes ONE bounded read, and stamps
 * the result — so "no N+1" is visible at the call site rather than hidden inside
 * a list method. Returns the SAME object when there is nothing to add.
 */
export function withBlockedSummary<T extends SerializedTaskListItem>(
  item: T,
  blocked: ReadonlyMap<string, TaskBlockedSummary>,
): T {
  const found = blocked.get(item.id);
  return found === undefined ? item : { ...item, blocked: found };
}
