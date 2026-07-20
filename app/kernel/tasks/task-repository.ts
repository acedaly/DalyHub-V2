/**
 * TODAY-02 Tasks kernel — the repository contract.
 *
 * A storage-independent, WORKSPACE-BOUND repository for the additive task-detail
 * slice TODAY-02 introduces (ADR-028). It COMPOSES the FND-07 spine rather than
 * replacing it: identity, title, completion and structural parentage remain the
 * spine's; this repository owns the `task_details` fields (status, priority,
 * due/scheduled dates, description) and reads the whole task (spine + details +
 * resolved relationships) back as one `TaskView`.
 *
 * No method accepts a `workspaceId` — scope is fixed at construction (ADR-010). A
 * task in another workspace, or one that does not exist, is indistinguishable from
 * "not found" and never disclosed. Completion is NOT on this contract: it stays
 * the spine's `complete`/`reopen` so there is a single authority for completion;
 * the route composes the two.
 */

import type {
  GetTaskOptions,
  ListTasksInput,
  TaskListPage,
  TaskView,
  UpdateTaskInput,
  UpdateTaskResult,
} from "./task";

export interface TaskRepository {
  /**
   * Read one task as a full `TaskView` — the entity header, the spine's
   * completion, the additive details (documented defaults when it has no
   * `task_details` row yet), and the resolved project/goal/area relationships.
   * Returns `null` when the id is not a task in this workspace (nonexistent,
   * soft-deleted without `includeDeleted`, wrong entity type, or cross-workspace).
   */
  getTask(id: string, options?: GetTaskOptions): Promise<TaskView | null>;

  /**
   * Update a task's editable fields (title + additive details) ATOMICALLY: one
   * batch writes `entities.title`/`updated_at` and upserts `task_details`, and
   * appends exactly one `entity.updated` Activity event guarded on an actual
   * change. An omitted field is left unchanged; an explicit `null` clears a
   * nullable field. A no-op update (nothing actually changes) appends no Activity
   * and reports `changed: false`. Throws `TaskNotFoundError` for a missing/deleted
   * task and `TaskValidationError` for invalid input.
   */
  updateTask(id: string, input: UpdateTaskInput): Promise<UpdateTaskResult>;

  /**
   * List the workspace's tasks as bounded, deterministic summaries for a
   * collection surface. Open tasks first, ordered by due date then creation, with
   * a safe default and maximum page size. Never an unbounded "load everything".
   */
  listTasks(input?: ListTasksInput): Promise<TaskListPage>;
}
