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
 * a value (an untriaged task). Until V2.2 each value also carried an Eisenhower
 * ACTION word (Do / Defer / Delegate / Delete-Review) so the Matrix view could name
 * its quadrants; removing the Matrix (TASKS-05) left P1–P4 as the one vocabulary. The
 * stored values are unchanged.
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

/* -------------------------------------------------------------------------- */
/* Commitment — the ONE answer to "does the owner still owe this?"            */
/* -------------------------------------------------------------------------- */

/**
 * The three facts that decide whether a Task is still a COMMITMENT.
 *
 * Deliberately not `TaskView`: this question is asked of a full record, of a
 * serialised list item, of a cross-view result and of a Project's task row, and
 * every one of those spells the same three facts differently. Naming the facts
 * rather than the record is what lets all four ask the kernel instead of each
 * writing the status list out again.
 */
export interface TaskCommitmentFacts {
  /** Completion is the spine's `completedAt`, never a status (see above). */
  readonly completed: boolean;
  readonly status: TaskStatus;
  /** `commitmentState === "someday"` — parked out of the committed set. */
  readonly someday: boolean;
}

/**
 * Is this Task OUT OF COMMITMENT — terminal, or parked out of the committed set?
 *
 * Exactly the triple the `open` system view excludes: **completed, cancelled and
 * Someday / Maybe**. It is stated once, here, because it is a kernel fact about
 * what a Task IS and not a rendering decision — and until V2.4-GATE-02 three
 * surfaces answered it independently (`views-presentation.ts` had the triple,
 * `TaskRow` had completion alone, and `InlineTaskDate` had nothing at all, so a
 * cancelled Task's passed due date was painted in the overdue colour beside its
 * own "Cancelled" pill).
 *
 * `waiting` and `on_hold` are deliberately ABSENT, by the same authority: the
 * `open` scope keeps both because they are work the owner still intends to do,
 * blocked or paused rather than abandoned. A Task somebody else is sitting on IS
 * late, and the row says so in words beside the date.
 */
export function isTaskOutOfCommitment(task: TaskCommitmentFacts): boolean {
  return task.completed || task.status === "cancelled" || task.someday;
}

/**
 * Is this Task still OWED — the positive form, and the one a surface reads.
 *
 * "Overdue" is a claim that the owner still owes the work and it has slipped.
 * Work nobody is going to do cannot slip, and saying it has is the manufactured
 * urgency `AGENTS.md` §2.4 ("calm over urgent") rules out. A closed Task keeps
 * its date — history is not hidden — it simply stops claiming to be late.
 */
export function isTaskStillOwed(task: TaskCommitmentFacts): boolean {
  return !isTaskOutOfCommitment(task);
}

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
 *
 * ── TODAY-TASK-01 / DEBT-144 — the relation carries the parent's IDENTITY ────
 * A task's parent is drawn on `/today`, on `/tasks`, in the Task record and in
 * search, and IDENTITY-01's whole premise is that one record has one appearance.
 * Until this pass the relation was `{ kind, id, title }` alone, so every one of
 * those surfaces drew a neutral mark for a Project that is violet on `/projects`
 * — and the alternatives were both bad: a read per row (an N+1), or colouring
 * only the parents that happened to be in another already-loaded list (a list
 * where some rows carry identity and some do not reads as a rendering fault).
 *
 * The three fields below are exactly the inputs `resolveIdentity` walks — the
 * record's own stored slot, its stored glyph and its derived rank — and they are
 * resolved by the SAME joined statement that already resolves `title`, so a
 * parent's identity costs no query. They are OPTIONAL because not every read
 * that produces a relation resolves them (the record overview's project/goal/area
 * trio does not), and a surface that has none draws the neutral mark it drew
 * before rather than inventing one.
 */
export type TaskRelation = {
  readonly kind: TaskRelationKind;
  readonly id: string;
  readonly title: string;
  /** The parent's own stored colour slot, or null for "no choice". */
  readonly colourSlot?: string | null;
  /** The parent's own stored icon key, or null for "no choice". */
  readonly iconKey?: string | null;
  /** The parent's stable 0-based rank in its own type (ADR-068 §5), or null. */
  readonly colourRank?: number | null;
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
  /**
   * V2.6 FIND-03 — the Task's tags, as display labels in canonical order.
   *
   * The SAME vocabulary People, Assets and Notes use (`~/kernel/tags`), not a
   * Task-owned field: DEBT-48's own prediction, confirmed. A tag labels the
   * Task and does nothing else — it never sets priority, never orders a
   * collection and never reaches the kernel next-action rule (ADR-112 §4).
   */
  readonly tags: readonly string[];
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
  tags: [],
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
  /** V2.6 FIND-03 — the Task's tags, from the ONE workspace vocabulary. */
  readonly tags: readonly string[];
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
  /**
   * V2.6 FIND-03 — the Task's whole tag set, or an empty array to clear it.
   *
   * An omitted field leaves the tags unchanged, exactly like every other field
   * here. The set is validated through the ONE tag validator, so a Task can
   * never carry a tag People could not.
   */
  readonly tags?: readonly string[];
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

/**
 * RECALL-01 — WHERE a Task search hit matched, in the product's fixed
 * precedence: `title` > `checklist` (structured metadata) > `description`
 * (body). One result per Task, whichever combination matched.
 */
export type TaskMatchSource = "title" | "checklist" | "description";

/**
 * A Task search hit: the list summary every other Task surface renders, plus the
 * honest match source and the bounded, syntax-free excerpt the repository cut
 * around a description match (empty for a title or checklist hit).
 */
export type TaskSearchHit = TaskListItem & {
  readonly matchSource: TaskMatchSource;
  readonly excerpt: string;
};

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
 * occurrence that holds the next position in the series — normally the one created in
 * the SAME transaction (TASKS-04 / ADR-062), and otherwise the occurrence that already
 * held that position: a successor RETAINED through a reopen because it had been
 * edited, linked or completed, or one a concurrent completion created. Either way
 * there is exactly one, and completing a recurring occurrence never mints a second.
 * It is null for a one-off task, and null on an idempotent no-op — a repeated
 * completion never creates a second successor.
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
/* Series editing (TASKS-07)                                                   */
/* -------------------------------------------------------------------------- */

/**
 * TASKS-07 — which occurrences a recurrence-sensitive DATE change applies to.
 *
 * DalyHub materialises a series incrementally (ADR-062): exactly one occurrence is
 * ever open, and the next one is copied from it at completion. That has a direct
 * consequence for scope, and it is the reason this set has two members rather than
 * three:
 *
 *   - **`occurrence`** — move THIS occurrence's date and leave the routine's schedule
 *     where it was. The series' grid is remembered (`series_anchor_date`), so the next
 *     occurrence lands back on schedule.
 *   - **`series`** — move this occurrence's date AND re-anchor the schedule here, so
 *     every future occurrence follows from the new date.
 *
 * Completed occurrences are never rewritten under either scope. See
 * `TASKS_MODULE.md → Series editing` for the full field-by-field contract.
 */
export const TASK_SERIES_EDIT_SCOPES = ["occurrence", "series"] as const;
export type TaskSeriesEditScope = (typeof TASK_SERIES_EDIT_SCOPES)[number];

/** Move a recurring occurrence's anchor date, at a chosen series scope. */
export type MoveTaskOccurrenceInput = {
  /** The new anchor date (`YYYY-MM-DD`) for THIS occurrence. */
  readonly date: string;
  readonly scope: TaskSeriesEditScope;
};

export type MoveTaskOccurrenceResult = {
  readonly task: TaskView;
  readonly changed: boolean;
};

/** Options for skipping one occurrence of a series. */
export type SkipTaskOccurrenceOptions = {
  /** The owner's calendar day (ADR-022). Required for an after-completion rule. */
  readonly ownerTodayIso: string;
};

export type SkipTaskOccurrenceResult = {
  readonly task: TaskView;
  readonly changed: boolean;
  /** The anchor date the occurrence was skipped FROM. */
  readonly skippedFrom: string;
  /** The anchor date it now sits on. */
  readonly nextDate: string;
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
  /**
   * V2.7 RECALL-03 — narrow to a FOLLOW-UP state, from the one declarative
   * vocabulary ({@link TASK_FOLLOW_UP_STATES}).
   *
   * The Waiting surface is where a chase is actually done, so it takes the same
   * dimension `/tasks` takes and resolves it through the same predicate. It is
   * the destination Today's attention fact links to, which is what makes the
   * stated number and the list beneath it the same population by construction.
   */
  readonly followUp?: TaskFollowUpState;
  /**
   * V2.7 RECALL-03 — the keyset cursor from a previous page's `nextCursor`
   * (DEBT-232). A cursor is bound to its workspace, its owner-day and its
   * follow-up filter, and is rejected under any other scope.
   */
  readonly cursor?: string;
};

/** Options for the bounded Waiting COUNTS the attention fact and digest share. */
export type CountWaitingTasksInput = {
  /** The owner's current calendar date `YYYY-MM-DD`. */
  readonly todayIso?: string;
};

/**
 * V2.7 RECALL-03 — the Waiting facts, from ONE statement.
 *
 * They are returned together, and read together, because they describe one
 * population and one is a SUBSET of the other. Reading them separately is how a
 * surface comes to state "50 waiting items · 100 follow-ups due" — an impossible
 * sentence, and exactly what happens when the total is a bounded page length
 * while the subset is an unbounded aggregate. Computing both in one query makes
 * the subset relationship a property of the SQL rather than of a convention two
 * call sites have to remember.
 */
export type WaitingCounts = {
  /**
   * Every waiting Task in the workspace — AUTHORITATIVE, never a page length.
   *
   * A count taken from a bounded page is the defect DEBT-232 named on the
   * Waiting subtitle; the attention rail and the digest were stating the same
   * kind of number from the same kind of read.
   */
  readonly total: number;
  /**
   * Of those, how many have a follow-up DUE (on or before the owner's today).
   *
   * A strict subset of {@link total} by construction, because both are counted
   * over the same rows of the same statement.
   */
  readonly followUpDue: number;
};

/**
 * A waiting task as shown in the Waiting collection.
 *
 * V2.8 CONV-02 — the SHARED list-item shape, narrowed. `/today/waiting` renders
 * the shared `TaskRow` (ADR-115 decision 2), which reads every fact
 * {@link TaskListItem} carries — the recurrence signal, the time sector, the
 * delegation group, the parent identity — so the Waiting read now returns that
 * shape rather than a Waiting-private subset the row would have had to be
 * forked around. Nothing is read twice: the one Waiting statement already
 * joined every column; the old item simply dropped them on the way out.
 *
 * Two facts are narrowed, not added: `waiting` is always PRESENT here (the
 * population predicate requires it), and `followUpOn` is lifted out of the
 * delegation group so the surface can say why a row is in a follow-up-filtered
 * page without re-deriving it (V2.7 RECALL-03).
 */
export type WaitingTaskListItem = TaskListItem & {
  /** The active waiting state (always present in this list). */
  readonly waiting: TaskWaiting;
  /**
   * V2.7 RECALL-03 — the delegation group's chase date (`YYYY-MM-DD`), or null.
   *
   * Carried so the Waiting surface can SAY why a row is in a follow-up-filtered
   * page, rather than leaving the owner to open each record to find out. The
   * same value as `delegation?.followUpOn`; lifted, never a second authority.
   */
  readonly followUpOn: string | null;
};

/** A keyset page of waiting tasks. */
export type WaitingTaskPage = {
  readonly items: readonly WaitingTaskListItem[];
  /**
   * V2.7 RECALL-03 (DEBT-232) — the cursor for the page after this one, or null
   * when the collection is exhausted.
   *
   * The Waiting surface used to end at `LIMIT 100` with no cursor and state the
   * truncated count as fact. It now pages in the standard keyset shape every
   * other DalyHub collection uses, so row 101 is reachable and the surface can
   * only ever claim a number it can actually show.
   */
  readonly nextCursor: string | null;
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
 *
 * TODAY-10 added one rule to the three DATE views (`today`, `upcoming`,
 * `overdue`): a PARKED Task is not dated work, so they exclude `on_hold`
 * alongside `waiting`. `inbox` is deliberately untouched — it is about filing,
 * not dating, and has never excluded waiting either.
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
   * TASKS-06 — the reversibly-DELETED Tasks (`entities.deleted_at IS NOT NULL`).
   *
   * The one system view whose population is outside the ordinary lifecycle filter, and
   * it exists so bulk delete can be genuinely reversible: a deleted Task keeps its
   * title, details, relationships, Activity and recurrence row, and this view is where
   * it is found and restored from. Nothing else surfaces deleted Tasks, and permanent
   * destruction is not reachable from it.
   */
  "deleted",
  /**
   * PLAN-01 — the OPEN scope: every Task the owner is still committed to.
   *
   * `active` was the closest existing scope and it is the wrong one for a
   * WEEK: it excludes the two parked states, so a Task the owner planned for
   * Wednesday and is waiting on someone for would vanish from Wednesday. A
   * planner that silently drops a commitment is worse than one that shows it
   * as blocked (PLAN-01 §B7), so this view keeps `waiting` and `on_hold` and
   * excludes only the three TERMINAL/parked-out-of-commitment states the whole
   * product excludes: completed, cancelled and Someday/Maybe.
   *
   * It is therefore the widest scope that still means "work I intend to do",
   * and it is what the planning week's own read and a date-range saved view
   * both want. The surface distinguishes blocked work in WORDS (the row's own
   * state pill), never by hiding it.
   */
  "open",
  /**
   * The ACTIVE PLANNING scope — the default for the Matrix and Sectors planning
   * views (ADR-043 §11), distinct from `all` (the complete collection incl.
   * terminal/parked records). It excludes every state that is not actionable *now*:
   * completed, cancelled and Someday/Maybe (as the other views do) AND the two
   * parked/blocked states — **waiting** (blocked on someone else — surfaced by the
   * dedicated Waiting view) and **on_hold** (deliberately paused). Excluding those
   * keeps a task out of a Time Sector bucket until it is real
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
  /**
   * V2.7 RECALL-02 — order by WHEN THE WORK WAS FINISHED.
   *
   * The one completion-time authority is `spine_records.completed_at` (ADR-114
   * decision 4), which the collection query already joins. It is the honest
   * per-record truth: a recurring occurrence keeps its own completion while its
   * successor is a new, incomplete record, and reopening a Task clears it — so a
   * reopened Task stops counting as completed with nothing to reconcile.
   *
   * Its natural direction is DESCENDING — most recently completed first — and a
   * Task with NO completion is not "completed a very long time ago": it has no
   * position in this order at all, so it sorts LAST under both directions (the
   * sentinel flips, exactly as `parent` flips its unparented sentinel).
   *
   * `updated` is deliberately NOT a stand-in for it. Edit time moves whenever
   * anything about a Task changes, so a Task completed last week and retitled
   * today leads an `updated` list — the defect DEBT-230 recorded, and the reason
   * the Completed system view now names THIS sort.
   */
  "completed",
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
 * V2.7 RECALL-03 — the DERIVED FOLLOW-UP state over `task_details.follow_up_on`
 * (DEBT-231), resolved against the owner's calendar day (ADR-022).
 *
 * `followUpOn` is the chase date on a Task's DELEGATION group — "ask them again
 * on Friday". It has been stored, validated, edited, exported and restored since
 * migration 0012 with no query predicate anywhere reading it, so the date the
 * owner wrote down only ever returned if they remembered to look. This is the one
 * vocabulary that makes it askable.
 *
 * It is a FILTER DIMENSION and deliberately not a new Task status (ADR-114
 * decision 5): a Task with a follow-up due is an ordinary Task that is usually
 * also waiting, and inventing a "follow-up" state would fork the lifecycle for a
 * date. `follow_up_on` is a wall-calendar `YYYY-MM-DD`, compared against the
 * owner's `todayIso` — never a naïve UTC day — exactly as the due and planned
 * states are.
 *
 * The members are shaped after {@link TASK_DUE_STATES} rather than invented:
 *
 * - `due`        — recorded and on or before the owner's today. The actionable
 *                  question ("who do I chase now?"), and the ONE definition
 *                  Today's attention fact and the daily digest both read.
 * - `due_today`  — recorded and exactly the owner's today.
 * - `overdue`    — recorded and strictly before the owner's today.
 * - `upcoming`   — recorded and strictly after it (written down, not yet due).
 * - `none`       — no follow-up date recorded at all.
 *
 * `due` is the union of `overdue` and `due_today` and is therefore the only
 * non-exclusive member; the other four partition the workspace. A SPECIFIC window
 * ("follow-ups between these two dates") is said with `followUpFrom`/`followUpTo`,
 * the same explicit pair the due and planned ranges already use — there is no
 * third date grammar here.
 */
export const TASK_FOLLOW_UP_STATES = [
  "due",
  "due_today",
  "overdue",
  "upcoming",
  "none",
] as const;
export type TaskFollowUpState = (typeof TASK_FOLLOW_UP_STATES)[number];

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
/**
 * STEER-04 — the input to the canonical per-Project next-action read.
 *
 * `todayIso` is the OWNER's calendar day (ADR-022), resolved server-side: it is
 * what decides which open Task counts as OVERDUE inside the `smart` ordering,
 * and a browser clock would make "next" depend on where the owner is sitting.
 * `timezone` travels with it, exactly as it does for every other calendar-
 * relative read.
 */
export type ListProjectNextActionsInput = {
  /** The Projects to answer for. Bounded by the caller; chunked internally. */
  readonly projectIds: readonly string[];
  /** The owner's current wall-calendar date, `YYYY-MM-DD`. */
  readonly todayIso: string;
  /** The zone `todayIso` was resolved in. Required: the scope predicate is
   * calendar-relative, and a defaulted zone would silently answer for a day the
   * owner is not living in. */
  readonly timezone: string;
};

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

  /* ---- V2.7 RECALL-02 — the COMPLETION-TIME window. ------------------------
     Three dimensions over the one completion authority, `spine_records.completed_at`
     (ADR-114 decision 4). They are the completion-time twins of the created/updated
     recency window and of the due/planned from-to pair, deliberately reusing both
     grammars rather than introducing a third date-filter model.

     Every one of them is a window over an INSTANT resolved against the OWNER's
     calendar day: `completed_at` is stored UTC, "yesterday" is the owner's, and
     the repository converts the owner-local day bounds to instants exactly as the
     created/updated windows do (HARDEN-06C F-05). A Task with no completion is
     never inside any of these windows — the same rule the due/planned ranges hold
     to, and what stops "completed this week" quietly returning the open backlog. */

  /**
   * Only Tasks COMPLETED within this window (inclusive of the owner's today).
   *
   * The closed {@link TaskRecencyWindow} vocabulary, unchanged: a bounded set
   * keeps the URL, the cursor signature and the saved-view config validatable.
   */
  readonly completedWithin?: TaskRecencyWindow;
  /** Only Tasks completed on or after this owner-calendar date (`YYYY-MM-DD`). */
  readonly completedFrom?: string;
  /**
   * Only Tasks completed on or before this owner-calendar date (`YYYY-MM-DD`).
   *
   * INCLUSIVE of the whole named day: the bound is the instant the owner's NEXT
   * day begins, so a completion at 23:50 owner-local on the last day of the
   * window is inside it.
   */
  readonly completedTo?: string;

  /* ---- V2.7 RECALL-03 — the FOLLOW-UP dimension (DEBT-231). ---------------
     `task_details.follow_up_on` is a wall-calendar date on the delegation group.
     The derived state is resolved against the OWNER's calendar day exactly as
     `dueState` is — the same `cal.today_iso` the repository already binds once
     per query — and the explicit pair below is the `dueFrom`/`dueTo` grammar,
     unchanged. No second date-filter model, and no new Task status. */

  /** The derived follow-up state against the owner's calendar day. */
  readonly followUp?: TaskFollowUpState;
  /** Only Tasks whose FOLLOW-UP date is on or after this date (`YYYY-MM-DD`). */
  readonly followUpFrom?: string;
  /**
   * Only Tasks whose FOLLOW-UP date is on or before this date (`YYYY-MM-DD`).
   *
   * A Task with no follow-up date is inside no window — the same rule the due
   * and planned ranges hold to, and what stops "follow up this week" quietly
   * returning every Task that was never given a chase date.
   */
  readonly followUpTo?: string;

  /* ---- PLAN-01 / SMART-01 additions. -------------------------------------
     Every one is resolved SERVER-side and bound into the cursor signature, so a
     page-two cursor can never survive a filter change — the same contract the
     TASKS-03 filters above hold to. */

  /**
   * PRIORITIES, as a SET rather than a single value.
   *
   * "Priority 1 and 2" is the most common real filter an owner wants and the one
   * the single-valued `priority` above cannot express. A closed set of at most
   * four members is not an arbitrary OR clause — it is one dimension with more
   * than one accepted value, which stays safe to persist and safe to restore from
   * an untrusted URL because the members come from a closed vocabulary and the
   * repository still chooses the predicate.
   *
   * `null` inside the set is the explicit "no priority recorded" member, so
   * "P1, P2 or untriaged" is expressible. An EMPTY set is not a filter (it would
   * match nothing, which no control can produce and no owner intends) and is
   * treated as absent.
   *
   * `priority` (the scalar) is retained: it is a genuinely different query — one
   * value, including its documented P4-includes-null behaviour — and existing
   * links, cursors and callers keep working. A caller supplying both is applying
   * both, which narrows to their intersection.
   */
  readonly priorities?: readonly (TaskPriority | null)[];
  /** Only Tasks whose DUE date is on or after this wall-calendar date. */
  readonly dueFrom?: string;
  /** Only Tasks whose DUE date is on or before this wall-calendar date. */
  readonly dueTo?: string;
  /**
   * Only Tasks whose PLANNED (scheduled) date is on or after this date.
   *
   * The planned date is the owner's intention and the due date is the deadline
   * (ADR-043 §3), and these two pairs of bounds are as strictly separate as the
   * dates they read. A range never matches a Task with no date in that field: a
   * missing date is not inside any window, and treating it as one is how "planned
   * next week" comes to include the entire unplanned backlog.
   */
  readonly plannedFrom?: string;
  /** Only Tasks whose PLANNED (scheduled) date is on or before this date. */
  readonly plannedTo?: string;
  /**
   * Only Tasks that REPEAT — that carry a stored recurrence rule (TASKS-04).
   *
   * `true` narrows to recurring Tasks and `false` to one-off ones; absent is no
   * filter. It reads the same `task_recurrence_rules` join the list already
   * makes for the row's repeat signal, so it costs no additional query.
   */
  readonly recurring?: boolean;

  /**
   * V2.6 FIND-03 — the Tasks collection's ONE tag dimension.
   *
   * A SET of canonical tag keys, matched as ANY (a Task carrying any one of them
   * is included), exactly like the `priorities` set above and for the same
   * reason: "errands or deep work" is the filter an owner reaches for, and it is
   * one dimension with more than one accepted value rather than a nested OR.
   *
   * The repository resolves it with a SEMI-join, never a join, so a Task
   * carrying two of the named tags appears once — a duplicated row would
   * corrupt the count beside the filter and make cursor pagination skip.
   *
   * Bounded by `MAX_TAG_FILTER_MEMBERS`, so a crafted URL cannot widen the
   * query past D1's bound-parameter ceiling.
   */
  readonly tagKeys?: readonly string[];

  /* ---- TASKS-12 addition. ------------------------------------------------- */

  /**
   * Only Tasks that are BLOCKED — that have at least one active `task.blocks`
   * edge from a Task that is still alive and still incomplete.
   *
   * `true` narrows to blocked Tasks and `false` to unblocked ones; absent is no
   * filter. It is DERIVED, exactly as `dueState` and `plannedState` are: there is
   * no stored flag to filter on, so completing the last blocker moves a Task out
   * of `blocked=1` on the very next query and reopening it moves the Task back in
   * — with nothing to reconcile.
   *
   * It is deliberately a FILTER on the existing declarative vocabulary rather
   * than a new system VIEW. A blocked Task is still an ordinary Task: it belongs
   * to whichever view its dates and state put it in, and a separate "Blocked"
   * view would be a second membership model for the same rows.
   */
  readonly blocked?: boolean;
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
  /**
   * HARDEN-06C (F-05) — the owner's IANA timezone: the zone `todayIso` was
   * derived in, and the zone a date-based filter has to be evaluated in.
   *
   * REQUIRED, and required for the same reason `todayIso` is: `created_at` and
   * `updated_at` are UTC instants, so "created today" is only answerable with
   * the boundary the owner's day actually starts at. Sending the calendar date
   * without the zone that produced it is what made `Created: Today` silently
   * omit everything captured before ~10 a.m. in Sydney.
   */
  readonly timezone: string;
};

/** A bounded page of the workspace-wide Tasks collection, with a keyset cursor. */
export type WorkspaceTaskListPage = {
  readonly items: readonly TaskListItem[];
  /** Opaque cursor for the next page, or null when this is the last page. */
  readonly nextCursor: string | null;
};

/**
 * The dimension the collection is grouped by, SERVER-side (ADR-043 decision 12,
 * widened by TASKS-03). `sector` backs the Time Sectors planning view; the rest back
 * the optional grouping of the ordinary List and Board views. Every dimension is a
 * TRUSTED column expression chosen from this closed set — a caller never supplies SQL.
 *
 * The `quadrant` dimension went with the Matrix in V2.2 (TASKS-05). It bucketed by
 * `task_details.priority`, exactly as `priority` does — it existed only to label the
 * same buckets with the Matrix's action words, and with no Matrix there was nothing
 * left for it to present. The GROUPING INFRASTRUCTURE it shared is untouched: Time
 * Sectors and every grouped list still run through the one window-function query.
 */
export const WORKSPACE_TASK_GROUP_DIMENSIONS = [
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
 * "how many happen to be loaded" — so bucket counts and empty states are
 * correct before (and independent of) any record paging. `items` is a bounded,
 * deterministically-sorted top slice of the bucket; `hasMore` is true when the
 * bucket holds more than `items` (the rest are reached through the equivalent
 * filtered `all` view, which paginates that one bucket independently).
 */
export type WorkspaceTaskGroup = {
  /**
   * The bucket key: for `priority`, one of `p1`|`p2`|`p3`|`p4`|`untriaged`; for
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
  /**
   * HARDEN-06C (F-05) — the owner's IANA timezone, travelling with `todayIso`
   * for the same reason it does on {@link ListWorkspaceTasksInput}: the grouped
   * query applies the SAME filters, including the recency windows, whose bounds
   * are UTC instants derived from an owner-calendar day.
   */
  readonly timezone: string;
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
  /**
   * TODAY-TASK-01 / DEBT-144 — the candidate's own identity, for the SAME reason
   * {@link TaskRelation} carries it: a row's inline project editor paints the
   * chosen parent optimistically from the option, and an option with no identity
   * makes the row's mark flash neutral before the revalidation restores it.
   * Resolved by the same read that resolves the title.
   */
  readonly iconKey?: string | null;
  readonly colourSlot?: string | null;
  readonly colourRank?: number | null;
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
  /**
   * AUDIT-13 — the Task's opening status, written in the SAME create batch.
   *
   * `createTask` used to force `todo` and leave any other status to a follow-up
   * `updateTask`. That second write is what made "convert this meeting item into
   * an on-hold Task" two transactions, and two transactions are two places to
   * fail. Omitted (or `todo`) writes exactly what it always did.
   */
  readonly status?: TaskStatus;
  /**
   * AUDIT-13 — the Task's Markdown description, written in the SAME create batch,
   * for the same reason as `status`. Validated as Markdown source at the boundary.
   */
  readonly description?: string | null;
  /**
   * V2.6 FIND-03 — the Task's tags, written in the SAME create batch as the
   * Task itself, for the same reason `status`, `description` and `recurrence`
   * are: a capture that said `#errand` either commits WITH its tag or not at
   * all. Validated through the ONE tag validator at the boundary.
   */
  readonly tags?: readonly string[];
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

/* -------------------------------------------------------------------------- */
/* GOAL-02 — the workload trend                                                */
/* -------------------------------------------------------------------------- */

/**
 * One owner-calendar day of the workload trend, as a pair of counts.
 *
 * Today's question is not "how productive was I" — it is *is my active workload
 * growing or shrinking?*, which only a COMPARISON can answer: five completed
 * means one thing beside three created and the opposite beside nine.
 */
export type TaskActivityDayCount = {
  /** The owner-calendar day, `YYYY-MM-DD`. */
  readonly dateIso: string;
  /** Tasks whose record was created within this day. */
  readonly created: number;
  /** Tasks completed within this day. Reflects the CURRENT completion state, so
   * a task completed and later reopened is not counted. */
  readonly completed: number;
};

/**
 * The days to count, as explicit UTC instant ranges.
 *
 * The CALLER computes the boundaries, because only the caller knows the owner's
 * timezone and only it can turn "Monday in Sydney" into a pair of instants
 * (AUDIT-14 — the timezone is always an argument). The repository then counts
 * inside ranges it is given, which keeps the SQL free of any timezone assumption
 * and makes the whole thing exactly testable.
 */
export type TaskActivityDayWindow = {
  readonly dateIso: string;
  /** Inclusive lower bound. */
  readonly startsAt: Date;
  /** Exclusive upper bound. */
  readonly endsAt: Date;
};

export type ListTaskActivityInput = {
  /** Oldest first. Bounded by the repository to a small number of days. */
  readonly days: readonly TaskActivityDayWindow[];
};

/**
 * V2.7 RECALL-02 — one window to count COMPLETED Tasks inside.
 *
 * The same shape as {@link TaskActivityDayWindow} and for the same reason — the
 * CALLER computes the boundaries, because only the caller knows the owner's
 * timezone (AUDIT-14) — with a caller-chosen `key` instead of a calendar date,
 * because the windows a period surface asks about are buckets and spans rather
 * than days.
 */
export type CompletedTaskWindow = {
  /** The caller's own identifier for this window; echoed back on the count. */
  readonly key: string;
  /** Inclusive lower bound. */
  readonly startsAt: Date;
  /** Exclusive upper bound. */
  readonly endsAt: Date;
};

/**
 * V2.9 INS-01 — a whole completion SERIES to count in one statement.
 *
 * The buckets are the caller's, cut from a window at a grain by
 * `~/kernel/history`, which resolved the owner-local midnights once. At most
 * the largest `GRAIN_MAXIMUMS`; a longer list is a caller bug and is REFUSED
 * rather than silently shortened.
 */
export type CountCompletedInBucketsInput = {
  /** Oldest first, non-overlapping. */
  readonly buckets: readonly CompletedTaskWindow[];
};

/** How many Tasks are CURRENTLY recorded as completed inside one window. */
export type CompletedTaskWindowCount = {
  readonly key: string;
  /**
   * Tasks whose `spine_records.completed_at` falls in the window and which are
   * still live. It is the CURRENT completion state, so a Task completed and
   * later reopened is not counted and a soft-deleted one is not counted —
   * exactly the population the Completed collection returns for the same
   * window, which is what makes a figure and the list behind it agree.
   */
  readonly completed: number;
};
