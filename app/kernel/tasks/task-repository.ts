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
  ClearWaitingResult,
  CompleteTaskResult,
  GetTaskOptions,
  ListTasksInput,
  ListWaitingTasksInput,
  SetWaitingInput,
  SetWaitingResult,
  TaskListPage,
  TaskView,
  UpdateTaskInput,
  UpdateTaskResult,
  WaitingTaskPage,
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

  /**
   * Activate or change a task's waiting state (TODAY-03) ATOMICALLY: one batch
   * writes the `waiting_since`/`waiting_note` state, replaces the active
   * `task.waiting_on` link (for an entity subject), and appends exactly one
   * `task.waiting_started` (new) or `task.waiting_changed` (target replaced) event.
   * EXACTLY ONE subject must be supplied (entity id XOR free-text note). Changing
   * only the subject preserves the original `since`. A no-op (the identical subject
   * is already set) appends no Activity and reports `changed: false`. Throws
   * `TaskValidationError` for invalid/absent/duplicate subject input, and
   * `TaskNotFoundError` for a missing/deleted task or a missing/cross-workspace/
   * non-allowed-type/self entity target.
   */
  setWaiting(id: string, input: SetWaitingInput): Promise<SetWaitingResult>;

  /**
   * Clear a task's active waiting state ATOMICALLY: one batch clears
   * `waiting_since`/`waiting_note`, unlinks any active `task.waiting_on` link, and
   * appends exactly one `task.waiting_cleared` event. Clearing a task that is not
   * waiting is an idempotent no-op (no Activity, `changed: false`). Throws
   * `TaskNotFoundError` for a missing/deleted task.
   */
  clearWaiting(id: string): Promise<ClearWaitingResult>;

  /**
   * List the workspace's currently-waiting, active (non-completed) tasks as a
   * bounded, deterministic page for the Waiting collection. Ordered overdue-first,
   * then longest-waiting, then due date, then id. Never an unbounded query.
   */
  listWaitingTasks(input?: ListWaitingTasksInput): Promise<WaitingTaskPage>;

  /**
   * Complete a task AND clear any active waiting state as ONE atomic domain
   * operation (ADR-029). A single `D1Database.batch()` sets the spine completion,
   * bumps `updated_at`, clears `waiting_since`/`waiting_note`, soft-deletes the
   * active `task.waiting_on` link, appends the `task.completed` event, and — ONLY
   * when the task was actively waiting — appends exactly one `task.waiting_cleared`
   * event. Either all of that commits, or nothing does: a completed task can never
   * be left still-waiting. The FND-07 spine stays the completion authority (the
   * completion SQL is the shared spine builder); this method owns the cross-domain
   * invariant so no route coordinates it through two calls.
   *
   * Completing an already-completed task is an idempotent no-op (no Activity,
   * `changed: false`). Throws `TaskNotFoundError` for a missing/deleted/non-task/
   * cross-workspace id. Reopening is unchanged and never restores waiting.
   */
  completeTask(id: string): Promise<CompleteTaskResult>;
}
