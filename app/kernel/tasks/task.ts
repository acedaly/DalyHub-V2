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

/** The closed set of open-state workflow positions. "done" is derived from completion. */
export const TASK_STATUSES = ["todo", "in_progress"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** The closed set of task priorities. Absence of a priority is `null`, not a value. */
export const TASK_PRIORITIES = ["low", "medium", "high"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

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

/** The additive, task-only detail fields (the columns of `task_details`). */
export type TaskDetails = {
  readonly status: TaskStatus;
  readonly priority: TaskPriority | null;
  /** Date-only `YYYY-MM-DD`, or null. Never routed through a timezone. */
  readonly dueDate: string | null;
  /** Date-only `YYYY-MM-DD`, or null. */
  readonly scheduledDate: string | null;
  /** Markdown SOURCE (FND-08 / ADR-015), rendered through the one shared pipeline. */
  readonly description: MarkdownSource | null;
};

/** The documented defaults a task takes when it has no `task_details` row yet. */
export const DEFAULT_TASK_DETAILS: TaskDetails = {
  status: "todo",
  priority: null,
  dueDate: null,
  scheduledDate: null,
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
  readonly description?: string | null;
};

/** The outcome of an update: the fresh record and whether anything actually changed. */
export type UpdateTaskResult = {
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
  /** The structural parent (a Project or an Area) as a context line, or null. */
  readonly parent: TaskRelation | null;
  /** The active waiting state, or null when the task is not waiting (TODAY-03). */
  readonly waiting: TaskWaiting | null;
};

/** A bounded page of task summaries. */
export type TaskListPage = {
  readonly items: readonly TaskListItem[];
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
 */
export type CompleteTaskResult = {
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
