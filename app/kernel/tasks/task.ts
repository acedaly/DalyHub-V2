/**
 * TODAY-02 Tasks kernel — domain types.
 *
 * The storage-independent shapes the Task Drawer reads and edits. A Task is still
 * an ordinary `entities` row (id, workspace, title, timestamps, soft-delete) plus
 * the spine's single `completedAt` and its structural parent EntityLink (FND-07 /
 * ADR-014). TODAY-02 adds ONLY the additive detail fields the Drawer needs —
 * workflow status, priority, due/scheduled dates and a Markdown description — in a
 * separate `task_details` table (ADR-028). No field here is invented on
 * `entities` or `spine_records`.
 *
 * "Done" is NOT a status value: completion is the spine's `completedAt`. `status`
 * carries the open-state workflow position only, so the two can never disagree in
 * a way the user sees (a completed task DISPLAYS as done regardless of `status`).
 */

import type { MarkdownSource } from "~/kernel/markdown";
import type { WorkspaceId } from "~/kernel/workspaces";
import type {
  TaskRecurrenceInput,
  TaskRecurrenceRule,
  TaskRecurrenceSeries,
} from "./task-recurrence";

/**
 * The closed set of open-state workflow positions (TASKS-01 widened this from the
 * TODAY-02 `todo`/`in_progress` pair). "done" is NEVER a status — completion is the
 * spine's `completedAt`. Waiting, Someday/Maybe, Inbox and Planned are also NOT
 * status values: they are DERIVED display states (from the waiting model, the
 * commitment state, and the sector/schedule respectively), so nothing here can
 * contradict them. `cancelled` is a deliberate decision not to proceed, retained in
 * history — distinct from the reversible soft-delete (ADR-043 §5).
 */
export const TASK_STATUSES = [
  "todo",
  "in_progress",
  "on_hold",
  "cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/**
 * The canonical Todoist-style / Eisenhower priority set (TASKS-01 replaced the
 * legacy `low/medium/high` set — ADR-043 §2). Absence of a priority is `null`, not
 * a value (an untriaged task). The Matrix maps each value to a quadrant: `p1`·Do,
 * `p2`·Defer, `p3`·Delegate, `p4`·Delete/Review.
 */
export const TASK_PRIORITIES = ["p1", "p2", "p3", "p4"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/**
 * The Carl Pullein-inspired Time Sector (TASKS-01 / ADR-043 §3): the broad planning
 * WINDOW in which the owner intends to address a task, kept distinct from the
 * scheduled date (a specific day) and the due date (a deadline). Absence of a
 * sector is `null` — read as "No sector". (TASKS-04: that is NOT Inbox. Inbox means
 * an active Task with no structural PARENT; a Task can be filed under a Project and
 * still have no sector.) Sector is not a Project hierarchy and never changes
 * parentage, priority, dates or completion.
 */
export const TIME_SECTORS = [
  "this_week",
  "next_week",
  "this_month",
  "next_month",
  "long_term",
  "routines",
] as const;
export type TimeSector = (typeof TIME_SECTORS)[number];

/**
 * The commitment state (TASKS-01 / ADR-043 §4): whether the owner is genuinely
 * committed to the task (`active`) or has parked it as Someday/Maybe (`someday`).
 * Someday/Maybe is a first-class state — NOT a priority, hold, sector, cancellation
 * or delete — excluded from active counts and normal execution views while
 * retaining the full record. `active` is the default.
 */
export const COMMITMENT_STATES = ["active", "someday"] as const;
export type CommitmentState = (typeof COMMITMENT_STATES)[number];

/** The kinds of record a Task can be related to and displayed against. */
export type TaskRelationKind = "project" | "goal" | "area";

/**
 * The subject a task is waiting ON. A waiting state has EXACTLY ONE subject
 * representation: an entity-backed target (via the `task.waiting_on` EntityLink,
 * resolved to its CURRENT title so a rename is reflected and a deleted target
 * degrades gracefully) OR a free-text note (for a party/circumstance with no
 * DalyHub record). The two are never both present.
 */
export type TaskWaitingSubject =
  | {
      readonly kind: "entity";
      /** The linked entity's id, or null when the target was deleted/unlinked. */
      readonly id: string | null;
      /** The linked entity's type (e.g. "person"), or null when unavailable. */
      readonly type: string | null;
      /** The target's CURRENT title, or null when it is no longer available. */
      readonly title: string | null;
    }
  | { readonly kind: "text"; readonly note: string };

/**
 * A task's active waiting state: WHAT/WHOM it waits on and WHEN it entered
 * waiting. `null` on a `TaskView` means the task is not waiting — distinct from a
 * waiting state whose entity subject is temporarily unresolved (`subject.kind ===
 * "entity"` with null fields).
 */
export type TaskWaiting = {
  /** The instant the task entered its current waiting state (UTC). */
  readonly since: Date;
  readonly subject: TaskWaitingSubject;
};

/**
 * A resolved, REAL entity relationship (never a copied label): the id and current
 * title of a related project, goal or area, resolved within the bound workspace.
 */
export type TaskRelation = {
  readonly kind: TaskRelationKind;
  readonly id: string;
  readonly title: string;
};

/**
 * A task's delegation record (TASKS-01 / ADR-043 §7). Honest and additive: the
 * delegatee is PLAIN TEXT now (People is not yet a module), designed so a future
 * Person EntityLink can coexist or replace it without a destructive migration. A
 * task is "delegated" iff `to` is present; the dates/note are optional context.
 * `null` on a view means the task is not delegated.
 */
export type TaskDelegation = {
  /** The delegatee — a plain-text external name/label (never a fake Person record). */
  readonly to: string;
  /** The date-only `YYYY-MM-DD` the task was delegated, or null. */
  readonly delegatedOn: string | null;
  /** The date-only `YYYY-MM-DD` to follow up, or null. */
  readonly followUpOn: string | null;
  /** An optional short note / expected outcome (plain text), or null. */
  readonly note: string | null;
};

/** The additive, task-only detail fields (the columns of `task_details`). */
export type TaskDetails = {
  readonly status: TaskStatus;
  readonly priority: TaskPriority | null;
  /** Date-only `YYYY-MM-DD`, or null. Never routed through a timezone. */
  readonly dueDate: string | null;
  /** Date-only `YYYY-MM-DD`, or null. */
  readonly scheduledDate: string | null;
  /** The planning window (ADR-043 §3), or null — "No sector" (TASKS-04). */
  readonly timeSector: TimeSector | null;
  /** The commitment state (ADR-043 §4). `active` unless parked as Someday/Maybe. */
  readonly commitmentState: CommitmentState;
  /** The delegation record (ADR-043 §7), or null when not delegated. */
  readonly delegation: TaskDelegation | null;
  /** Structured calendar recurrence (TASKS-04), or null for a one-off task. */
  readonly recurrence?: TaskRecurrenceRule | null;
  /** The persisted series identity of a recurring occurrence, else null. */
  readonly recurrenceSeries?: TaskRecurrenceSeries | null;
  /** Markdown SOURCE (FND-08 / ADR-015), rendered through the one shared pipeline. */
  readonly description: MarkdownSource | null;
};

/** The documented defaults a task takes when it has no `task_details` row yet. */
export const DEFAULT_TASK_DETAILS: TaskDetails = {
  status: "todo",
  priority: null,
  dueDate: null,
  scheduledDate: null,
  timeSector: null,
  commitmentState: "active",
  delegation: null,
  recurrence: null,
  recurrenceSeries: null,
  description: null,
};

/**
 * The full task record the Drawer renders: the shared entity header, the spine's
 * completion, the additive details, and the resolved project/goal/area
 * relationships. `project`/`goal`/`area` are derived from the spine hierarchy — a
 * task's structural parent is exactly one of an Area or a Project; the Goal (and,
 * for a project-parented task, the Area) are resolved by walking the hierarchy, so
 * they are real relationships, not stored duplicates.
 */
export type TaskView = {
  readonly id: string;
  readonly workspaceId: WorkspaceId;
  readonly title: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
  readonly completedAt: Date | null;
  readonly status: TaskStatus;
  readonly priority: TaskPriority | null;
  readonly dueDate: string | null;
  readonly scheduledDate: string | null;
  readonly timeSector: TimeSector | null;
  readonly commitmentState: CommitmentState;
  readonly delegation: TaskDelegation | null;
  readonly recurrence?: TaskRecurrenceRule | null;
  readonly recurrenceSeries?: TaskRecurrenceSeries | null;
  readonly description: MarkdownSource | null;
  /** The Project the task belongs to, if its structural parent is a Project. */
  readonly project: TaskRelation | null;
  /** The Goal the task advances (via its Project's `advances_goal` link), if any. */
  readonly goal: TaskRelation | null;
  /** The Area context: the structural Area parent, or the parent Project's Area. */
  readonly area: TaskRelation | null;
  /** The active waiting state, or null when the task is not waiting (TODAY-03). */
  readonly waiting: TaskWaiting | null;
};

/** Options for a single task read. */
export type GetTaskOptions = {
  /** Include a soft-deleted task instead of treating it as not found. Default false. */
  readonly includeDeleted?: boolean;
};

/**
 * The editable patch. Every field is optional; an omitted (`undefined`) field is
 * left unchanged, while an explicit `null` clears a nullable field. `description`
 * is validated as Markdown SOURCE; an empty/whitespace-only string clears it.
 */
export type UpdateTaskInput = {
  readonly title?: string;
  readonly status?: TaskStatus;
  readonly priority?: TaskPriority | null;
  readonly dueDate?: string | null;
  readonly scheduledDate?: string | null;
  readonly timeSector?: TimeSector | null;
  readonly commitmentState?: CommitmentState;
  /**
   * The delegation record, or `null` to clear delegation. An omitted field is left
   * unchanged. A present value REQUIRES a non-empty `to`; the dates/note are
   * optional. Setting delegation never itself changes priority or waiting — the
   * route composes those explicitly (ADR-043 §7).
   */
  readonly delegation?: TaskDelegationInput | null;
  readonly description?: string | null;
};

/** The editable delegation input (dates/note optional; `to` required when present). */
export type TaskDelegationInput = {
  readonly to: string;
  readonly delegatedOn?: string | null;
  readonly followUpOn?: string | null;
  readonly note?: string | null;
};

/** The outcome of an update: the fresh record and whether anything actually changed. */
export type UpdateTaskResult = {
  readonly task: TaskView;
  readonly changed: boolean;
};

export type SetTaskParentInput = {
  readonly kind: "area" | "project";
  readonly id: string;
} | null;

export type SetTaskParentResult = {
  readonly task: TaskView;
  readonly changed: boolean;
};

/** Options for listing a workspace's tasks (bounded — never "load everything"). */
export type ListTasksInput = {
  /** Page size, clamped to a safe maximum; defaults to a safe page size. */
  readonly limit?: number;
  /** Include completed tasks. Default false (Today shows open work first). */
  readonly includeCompleted?: boolean;
  /**
   * Exclude tasks that are currently waiting (TODAY-03). Today's focus surfaces
   * active work, not blocked work — waiting tasks live in the Waiting view.
   */
  readonly excludeWaiting?: boolean;
};

/** A lightweight task summary for a collection surface (Today's focus section). */
export type TaskListItem = {
  readonly id: string;
  readonly workspaceId: WorkspaceId;
  readonly title: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly completedAt: Date | null;
  readonly status: TaskStatus;
  readonly priority: TaskPriority | null;
  readonly dueDate: string | null;
  readonly scheduledDate: string | null;
  readonly timeSector: TimeSector | null;
  readonly commitmentState: CommitmentState;
  readonly delegation: TaskDelegation | null;
  readonly recurrence?: TaskRecurrenceRule | null;
  readonly recurrenceSeries?: TaskRecurrenceSeries | null;
  /** The structural parent (a Project or an Area) as a context line, or null. */
  readonly parent: TaskRelation | null;
  /** The active waiting state, or null when the task is not waiting (TODAY-03). */
  readonly waiting: TaskWaiting | null;
};

/** A bounded page of task summaries. */
export type TaskListPage = {
  readonly items: readonly TaskListItem[];
};

export type SearchTasksInput = {
  readonly text: string;
  readonly limit?: number;
};

export type TaskSearchHit = TaskListItem;

/** The completion filter for a project's task list (PROJ-01). */
export type TaskStateFilter = "open" | "completed" | "all";

/**
 * Options for listing the tasks belonging to one Project (PROJ-01). Bounded and
 * workspace-scoped — never "load every workspace task and filter in the client".
 * Waiting tasks are INCLUDED (a project shows its blocked work, surfaced with its
 * waiting representation, unlike Today's focus which excludes them).
 */
export type ListProjectTasksInput = {
  /** Completion filter. Defaults to `open` (a project shows active work first). */
  readonly state?: TaskStateFilter;
  /** Page size, clamped to a safe maximum; defaults to a safe page size. */
  readonly limit?: number;
  /**
   * An opaque cursor from a previous page's `nextCursor`, to fetch the following
   * page. It is bound to the workspace, project id and `state` filter it was
   * issued for; a cursor that does not match the current query scope is rejected
   * (`InvalidSpineCursorError`), never silently reinterpreted. Omit for the first
   * page.
   */
  readonly cursor?: string;
};

/**
 * A bounded page of a project's task summaries (PROJ-01), with a keyset cursor to
 * fetch the next page. The roll-up totals shown against the project stay the
 * SpineRepository's authority — this page bounds only how many task ROWS load at
 * once, never what the project's completion counts report.
 */
export type ProjectTaskListPage = {
  readonly items: readonly TaskListItem[];
  /**
   * An opaque cursor to fetch the next page, or `null` when this is the last page
   * (no more matching tasks). Pass it back as `ListProjectTasksInput.cursor`. It
   * is bound to this query's workspace, project id and `state` filter.
   */
  readonly nextCursor: string | null;
};

/**
 * Options for the planning query (TODAY-04). Unlike `listTasks` — a single generic,
 * due-date-ordered page — the planning view must NEVER lose the owner's actual
 * commitments to backlog truncation. Each planning band (scheduled work, the
 * unscheduled backlog, and recent completions) is fetched and bounded INDEPENDENTLY,
 * so a large unscheduled backlog can never crowd out today's/overdue/upcoming
 * planned tasks or today's completions.
 */
export type ListPlanningTasksInput = {
  /** The owner's calendar date `YYYY-MM-DD` (for the caller's bucketing). */
  readonly todayIso: string;
  /**
   * Max scheduled (planned) tasks — ordered scheduled-date ascending, so overdue and
   * today are preserved first; only far-future upcoming is ever truncated. Defaults
   * to a generous planning bound.
   */
  readonly scheduledLimit?: number;
  /** Max unscheduled backlog tasks (the "Anytime" band). Truncation here is calm. */
  readonly backlogLimit?: number;
  /**
   * Max recently-completed tasks (most-recent first). The caller filters these to
   * "completed today" in the owner's timezone; today's completions are the most
   * recent, so a bounded page captures them.
   */
  readonly completedLimit?: number;
};

/**
 * The input that activates or changes a task's waiting state. EXACTLY ONE subject
 * must be supplied: an entity target (by id) OR a free-text note — never both,
 * never neither. The waiting `since` timestamp is set server-side (never
 * client-supplied); changing only the subject on an already-waiting task preserves
 * the original `since`.
 */
export type SetWaitingInput =
  | { readonly target: { readonly kind: "entity"; readonly targetId: string } }
  | { readonly target: { readonly kind: "text"; readonly note: string } };

/** The outcome of `setWaiting`: the fresh task view and whether anything changed. */
export type SetWaitingResult = {
  readonly task: TaskView;
  readonly changed: boolean;
};

/** The outcome of `clearWaiting`: the fresh task view and whether it was waiting. */
export type ClearWaitingResult = {
  readonly task: TaskView;
  readonly changed: boolean;
};

/**
 * The outcome of `completeTask`: the fresh (completed, non-waiting) task view and
 * whether completion actually happened (`false` for an already-completed no-op).
 *
 * When the completed occurrence carried a recurrence rule, `successor` is the ONE
 * next occurrence created in the SAME transaction (TASKS-04 / ADR-062). It is null
 * for a one-off task, and null on an idempotent no-op — a repeated completion never
 * creates a second successor.
 */
export type CompleteTaskResult = {
  readonly task: TaskView;
  readonly changed: boolean;
  readonly successor?: TaskView | null;
};

/**
 * Options for `completeTask`. `ownerTodayIso` is the OWNER's calendar day (ADR-022),
 * resolved server-side from their timezone preference. Recurrence uses it to schedule
 * the successor after the later of the current anchor and the day the owner actually
 * completed the task, so a task completed late at night in Sydney never repeats on
 * yesterday's date. Omitted, the repository falls back to the clock's UTC day.
 */
export type CompleteTaskOptions = {
  readonly ownerTodayIso?: string;
};

/**
 * The outcome of `reopenTask` — the task-domain undo of completion.
 *
 * `successorOutcome` reports what happened to a recurrence successor created by the
 * completion being undone:
 *   - `none` — the completion created no successor (a one-off task);
 *   - `removed` — the successor was still UNTOUCHED and provably created by this
 *     completion, so it was withdrawn (soft-deleted) in the same transaction;
 *   - `retained` — the successor has since been edited, completed, linked or
 *     otherwise materially changed, so it was KEPT and the user is told.
 */
export type ReopenTaskSuccessorOutcome = "none" | "removed" | "retained";

export type ReopenTaskResult = {
  readonly task: TaskView;
  readonly changed: boolean;
  readonly successorOutcome: ReopenTaskSuccessorOutcome;
};

/**
 * The recurrence a mutation asks for: a validated rule, or `null` to remove
 * recurrence from the task. `anchorDay`/`anchorMonth` may be omitted — the
 * repository derives them from the Task's anchor date.
 */
export type SetTaskRecurrenceInput = TaskRecurrenceInput | null;

export type SetTaskRecurrenceResult = {
  readonly task: TaskView;
  readonly changed: boolean;
};

/* -------------------------------------------------------------------------- */
/* Planning (TODAY-04)                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The input that plans a task: the calendar date the owner commits to working on
 * it. Planning EXTENDS the existing scheduled date — the date IS the commitment
 * ("I intend to work on this today"). It is always a real date-only `YYYY-MM-DD`
 * (clearing a plan is `clearPlan`, not a null here). Planning never touches the
 * due date, waiting state or completion (ADR-030).
 */
export type PlanTaskInput = {
  /** The scheduled (planned) date, `YYYY-MM-DD`. Never routed through a timezone. */
  readonly scheduledDate: string;
};

/** The outcome of `planTask`: the fresh task view and whether the plan changed. */
export type PlanTaskResult = {
  readonly task: TaskView;
  readonly changed: boolean;
};

/** The outcome of `clearPlan`: the fresh task view and whether it was planned. */
export type ClearPlanResult = {
  readonly task: TaskView;
  readonly changed: boolean;
};

/**
 * The outcome of a bulk planning operation (`planTasks`/`clearPlans`): how many of
 * the selected tasks actually changed and how many were already in the requested
 * state (a no-op, no Activity). The operation is ATOMIC — either every change in
 * `changed` commits together, or none does.
 */
export type BulkPlanResult = {
  readonly changed: number;
  readonly unchanged: number;
};

/** Options for the bounded, deterministic Waiting collection query. */
export type ListWaitingTasksInput = {
  /** Page size, clamped to a safe maximum; defaults to a safe page size. */
  readonly limit?: number;
  /** The owner's current calendar date `YYYY-MM-DD`, for the overdue-first sort. */
  readonly todayIso?: string;
};

/** A waiting task as shown in the Waiting collection. */
export type WaitingTaskListItem = {
  readonly id: string;
  readonly workspaceId: WorkspaceId;
  readonly title: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly status: TaskStatus;
  readonly priority: TaskPriority | null;
  readonly dueDate: string | null;
  readonly scheduledDate: string | null;
  /** The structural parent (a Project or an Area) as a context line, or null. */
  readonly parent: TaskRelation | null;
  /** The active waiting state (always present in this list). */
  readonly waiting: TaskWaiting;
};

/** A bounded page of waiting tasks. */
export type WaitingTaskPage = {
  readonly items: readonly WaitingTaskListItem[];
};

/* -------------------------------------------------------------------------- */
/* Workspace-wide Tasks read model (TASKS-01 / ADR-043 §8)                     */
/* -------------------------------------------------------------------------- */

/**
 * The workspace-wide system views `/tasks` exposes. Each is a bounded, server-
 * authoritative query over the SAME canonical task records — not a parallel model.
 * Membership rules (ADR-043 §5–§6): `someday`/`cancelled`/`completed`/`waiting`
 * are their own views and are EXCLUDED from the active execution views (`inbox`,
 * `today`, `this_week`…`routines`, `overdue`); `all` is the complete bounded
 * collection (open + every terminal/parked state).
 */
export const TASK_SYSTEM_VIEWS = [
  "inbox",
  "today",
  "upcoming",
  "this_week",
  "next_week",
  "this_month",
  "next_month",
  "long_term",
  "someday",
  "waiting",
  "routines",
  "overdue",
  "completed",
  "cancelled",
  /**
   * The ACTIVE PLANNING scope — the default for the Matrix and Sectors planning
   * views (ADR-043 §11), distinct from `all` (the complete collection incl.
   * terminal/parked records). It excludes every state that is not actionable *now*:
   * completed, cancelled and Someday/Maybe (as the other views do) AND the two
   * parked/blocked states — **waiting** (blocked on someone else — surfaced by the
   * dedicated Waiting view) and **on_hold** (deliberately paused). Excluding those
   * keeps a task out of a Matrix quadrant or a Time Sector bucket until it is real
   * active work again; they remain fully reachable through `all`, the `waiting`
   * view, and the status filter. (ADR-043 §11 / decision point 11.)
   */
  "active",
  "all",
] as const;
export type TaskSystemView = (typeof TASK_SYSTEM_VIEWS)[number];

/** Deterministic sort orders for the workspace-wide collection. */
export const TASK_SORTS = [
  "smart",
  "due_date",
  "scheduled_date",
  "priority",
  "created",
  "updated",
  "title",
  /**
   * TASKS-03: order by the structural parent's title (tasks with no parent last),
   * so a list can be read Project-by-Project without switching to a grouped view.
   */
  "parent",
] as const;
export type TaskSort = (typeof TASK_SORTS)[number];

/**
 * TASKS-03 — the explicit sort DIRECTION. Every sort declares a natural direction
 * (`smart` is always most-relevant-first; `due_date` ascending; `updated`
 * descending); `direction` flips it where flipping is meaningful. It is bound into
 * the pagination cursor because it changes ordering.
 */
export const TASK_SORT_DIRECTIONS = ["natural", "asc", "desc"] as const;
export type TaskSortDirection = (typeof TASK_SORT_DIRECTIONS)[number];

/**
 * TASKS-03 — the DERIVED due state, resolved against the owner's calendar day
 * (never browser-local time, ADR-022).
 *
 * The values are MUTUALLY EXCLUSIVE — every task has exactly one — because this
 * one vocabulary serves both the filter and the grouping buckets. That is what
 * guarantees "group by due state, then open Overdue" lands on exactly the records
 * the Overdue bucket counted; two separate definitions would drift.
 *
 * `overdue` means an OPEN task due strictly before today; due-today is deliberately
 * NOT overdue (the same rule the `smart` sort and the `overdue` system view use).
 * A COMPLETED task with a past due date is `due_past` — it is finished, so calling
 * it overdue would be wrong, and calling it "due later" would be nonsense.
 * `due_this_week` is the rolling window AFTER today (`today + 1 … today + 6`), so
 * it never depends on a week-start preference and never overlaps `due_today`.
 */
export const TASK_DUE_STATES = [
  "overdue",
  "due_past",
  "due_today",
  "due_this_week",
  "due_later",
  "no_due_date",
] as const;
export type TaskDueState = (typeof TASK_DUE_STATES)[number];

/**
 * TASKS-03 — the DERIVED planned state over the SCHEDULED date (the owner's
 * "I intend to work on this that day" commitment, ADR-030). Distinct from the due
 * state: a task can be planned today and due next month, or overdue and unplanned.
 * Mutually exclusive for the same reason {@link TASK_DUE_STATES} is, so
 * `planned_this_week` means the rolling window AFTER today.
 */
export const TASK_PLANNED_STATES = [
  "planned_today",
  "planned_this_week",
  "planned_earlier",
  "planned_later",
  "unplanned",
] as const;
export type TaskPlannedState = (typeof TASK_PLANNED_STATES)[number];

/** TASKS-03 — filter by the KIND of structural parent a task hangs from. */
export const TASK_PARENT_KINDS = ["project", "area", "none"] as const;
export type TaskParentKind = (typeof TASK_PARENT_KINDS)[number];

/**
 * TASKS-03 — the closed set of created/updated recency windows. A closed set (not
 * a free-form day count) keeps the URL, the cursor signature and the saved-view
 * config validatable and bounded.
 */
export const TASK_RECENCY_WINDOWS = ["1d", "7d", "30d", "90d"] as const;
export type TaskRecencyWindow = (typeof TASK_RECENCY_WINDOWS)[number];

/** The number of days each recency window looks back, inclusive of today. */
export const TASK_RECENCY_WINDOW_DAYS: Record<TaskRecencyWindow, number> = {
  "1d": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

/**
 * TASKS-03 — completed/terminal visibility, applied ON TOP of the system view.
 * The system view decides the population; this decides whether the finished work
 * inside it is shown, hidden or shown alone. `default` leaves the view's own rule
 * untouched (so `all` still includes completed and `this_week` still excludes it).
 */
export const TASK_COMPLETED_VISIBILITIES = [
  "default",
  "hide",
  "include",
  "only",
] as const;
export type TaskCompletedVisibility =
  (typeof TASK_COMPLETED_VISIBILITIES)[number];

/**
 * The filters the workspace-wide read model applies SERVER-SIDE (never by loading
 * the workspace into React). Every filter that can change which tasks appear — or
 * their order — is bound into the pagination cursor (ADR-043 §8), so a cursor from
 * one filter set is rejected under another.
 */
export type WorkspaceTaskFilters = {
  readonly priority?: TaskPriority | null;
  readonly timeSector?: TimeSector | null;
  readonly commitmentState?: CommitmentState;
  readonly status?: TaskStatus;
  /** Restrict to tasks under a Project (by id). */
  readonly projectId?: string;
  /** Restrict to tasks under a Goal (by id, resolved through the Project link). */
  readonly goalId?: string;
  /** Restrict to tasks under an Area (structural Area parent or the Project's Area). */
  readonly areaId?: string;
  /** Only delegated tasks (a delegatee is recorded). */
  readonly delegatedOnly?: boolean;
  /** Only waiting tasks. */
  readonly waitingOnly?: boolean;

  /* ---- TASKS-03 additions. Every one is resolved SERVER-side and bound into --
     the cursor signature, so a page-two cursor can never survive a filter change. */

  /** The derived due state against the owner's calendar day. */
  readonly dueState?: TaskDueState;
  /** The derived planned (scheduled-date) state against the owner's calendar day. */
  readonly plannedState?: TaskPlannedState;
  /** The kind of structural parent (`none` = a task whose parent link is gone). */
  readonly parentKind?: TaskParentKind;
  /**
   * Restrict to tasks delegated to exactly this person/label. Delegation is
   * plain text today (ADR-043 §7) and this compares the stored value verbatim —
   * it is never interpolated into SQL.
   */
  readonly delegatedTo?: string;
  /** Only tasks created within this window (inclusive of today). */
  readonly createdWithin?: TaskRecencyWindow;
  /** Only tasks updated within this window (inclusive of today). */
  readonly updatedWithin?: TaskRecencyWindow;
  /** Completed/terminal visibility applied on top of the system view. */
  readonly completedVisibility?: TaskCompletedVisibility;
};

/** Options for the bounded, cursor-paginated workspace-wide Tasks query. */
export type ListWorkspaceTasksInput = {
  /** The system view (default `all`). */
  readonly view?: TaskSystemView;
  /** Additional filters applied on top of the view. */
  readonly filters?: WorkspaceTaskFilters;
  /** Sort order (default `smart`). */
  readonly sort?: TaskSort;
  /** Sort direction (default `natural` — each sort's documented direction). */
  readonly direction?: TaskSortDirection;
  /** Page size, clamped to a safe maximum; defaults to a safe page size. */
  readonly limit?: number;
  /**
   * An opaque, versioned cursor from a previous page's `nextCursor`. It is bound to
   * the full query scope (workspace + view + every filter + sort + date window); a
   * cursor that does not match the current query is rejected, never reinterpreted.
   */
  readonly cursor?: string;
  /**
   * The owner's current calendar date `YYYY-MM-DD` — required for the calendar-
   * relative VIEWS (`today`, `overdue`, `this_week`…), which resolve their
   * membership against it. The `smart` SORT deliberately orders by open-first →
   * priority (P1–P4) → due date (earliest first, nulls last): priority is the
   * primary Eisenhower axis, and overdue work is surfaced by the dedicated
   * `overdue` view and by the due-date tiebreak — it does not override priority.
   * Never derived in browser-local code (ADR-022).
   */
  readonly todayIso: string;
};

/** A bounded page of the workspace-wide Tasks collection, with a keyset cursor. */
export type WorkspaceTaskListPage = {
  readonly items: readonly TaskListItem[];
  /** Opaque cursor for the next page, or null when this is the last page. */
  readonly nextCursor: string | null;
};

/**
 * The dimension the collection is grouped by, SERVER-side (ADR-043 decision 12,
 * widened by TASKS-03). `quadrant` and `sector` back the Eisenhower Matrix and the
 * Time Sectors views; the rest back the optional grouping of the ordinary List and
 * Board views. Every dimension is a TRUSTED column expression chosen from this
 * closed set — a caller never supplies SQL.
 *
 * `quadrant` and `priority` bucket identically (by `task_details.priority`); they
 * are separate names because they are PRESENTED differently — the Matrix labels a
 * bucket with its Eisenhower action word, a grouped list labels it `P1 · Urgent`.
 */
export const WORKSPACE_TASK_GROUP_DIMENSIONS = [
  "quadrant",
  "sector",
  "priority",
  "due_state",
  "planned",
  "status",
  "parent",
  "delegate",
] as const;
export type WorkspaceTaskGroupDimension =
  (typeof WORKSPACE_TASK_GROUP_DIMENSIONS)[number];

/**
 * One server-computed bucket of the ACTIVE planning collection. The `count` is the
 * AUTHORITATIVE total for the bucket — computed over the whole active scope, never
 * "how many happen to be loaded" — so quadrant/sector counts and empty states are
 * correct before (and independent of) any record paging. `items` is a bounded,
 * deterministically-sorted top slice of the bucket; `hasMore` is true when the
 * bucket holds more than `items` (the rest are reached through the equivalent
 * filtered `all` view, which paginates that one bucket independently).
 */
export type WorkspaceTaskGroup = {
  /**
   * The bucket key: for `quadrant`, one of `p1`|`p2`|`p3`|`p4`|`untriaged`; for
   * `sector`, a `TimeSector` value or `__none` ("No sector"). TASKS-04 renamed that
   * bucket: "Inbox" now means an UNASSIGNED Task, never an unsectored one.
   */
  readonly key: string;
  readonly count: number;
  readonly items: readonly TaskListItem[];
  readonly hasMore: boolean;
  /**
   * TASKS-03 — the human label for an OPEN-ENDED bucket key whose text the caller
   * cannot derive from a closed vocabulary: the parent's current title (`parent`)
   * or the delegatee (`delegate`). `null` for closed dimensions, whose labels are
   * owned by the presentation layer.
   */
  readonly label: string | null;
};

/** The full server-authoritative grouping of the active planning collection. */
export type WorkspaceTaskGrouping = {
  readonly dimension: WorkspaceTaskGroupDimension;
  readonly groups: readonly WorkspaceTaskGroup[];
};

/** Options for the bounded, server-grouped query (Matrix / Sectors / grouped list). */
export type ListWorkspaceTaskGroupsInput = {
  readonly dimension: WorkspaceTaskGroupDimension;
  /**
   * The system view that defines the POPULATION being grouped. Defaults to
   * `active` — the actionable-now planning scope the Matrix and Sectors use. A
   * grouped List/Board view passes its own current view, so grouping never
   * silently re-scopes what the user is looking at.
   */
  readonly view?: TaskSystemView;
  /** The same filters the flat query applies, so grouping honours them exactly. */
  readonly filters?: WorkspaceTaskFilters;
  /** Within-bucket sort (default `smart` — overdue-first, then priority, then due). */
  readonly sort?: TaskSort;
  /** Within-bucket sort direction (default `natural`). */
  readonly direction?: TaskSortDirection;
  /** Bounded records returned per bucket; clamped to a safe maximum. */
  readonly bucketLimit?: number;
  /** The owner's calendar date `YYYY-MM-DD` — drives the `smart` overdue ranking. */
  readonly todayIso: string;
};

/**
 * A candidate parent (Area or Project) for creating a task, resolved by a bounded,
 * indexed, workspace-scoped title search over the WHOLE collection (ADR-043 §9 /
 * decision 13) — never a fixed-prefix scan. `kind` is the entity's real type.
 */
export type TaskParentCandidate = {
  readonly id: string;
  readonly kind: "area" | "project";
  readonly title: string;
};

/** Options for the bounded task-parent title search. */
export type SearchTaskParentsInput = {
  /** Case-insensitive title query; empty returns the first bounded page of parents. */
  readonly query?: string;
  /** Max results to return; clamped to a safe maximum. */
  readonly limit?: number;
};

/**
 * Create a task AND its initial planning fields as ONE atomic operation. TASKS-04
 * permits an intentional Unassigned Task: structural parentage is optional for Tasks
 * only, while the entity row, spine record, Activity and optional `task_details` slice
 * are still written together. When a parent is supplied it must be an active Area or
 * non-archived Project in the authenticated workspace.
 */
export type NewTaskInput = {
  readonly title: string;
  readonly parent?: {
    readonly kind: "area" | "project";
    readonly id: string;
  } | null;
  readonly priority?: TaskPriority | null;
  readonly timeSector?: TimeSector | null;
  readonly commitmentState?: CommitmentState;
  readonly dueDate?: string | null;
  readonly scheduledDate?: string | null;
  /**
   * TASKS-04 — an optional recurrence rule written in the SAME create batch, so a
   * captured "every Monday" Task is never persisted without the rule it asked for.
   * Validated against the Task's own anchor date: a `scheduled` rule needs
   * `scheduledDate`, a `due` rule needs `dueDate`, and nothing is written if not.
   */
  readonly recurrence?: TaskRecurrenceInput | null;
};

/**
 * The result of a bulk field mutation (`setPriorityMany`, `setSectorMany`,
 * `setCommitmentMany`, `setStatusMany`): how many tasks actually changed vs were
 * already in the requested state. ATOMIC — either every change commits, or none.
 */
export type BulkFieldResult = {
  readonly changed: number;
  readonly unchanged: number;
};
