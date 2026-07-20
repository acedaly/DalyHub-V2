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
};

/** A bounded page of task summaries. */
export type TaskListPage = {
  readonly items: readonly TaskListItem[];
};
