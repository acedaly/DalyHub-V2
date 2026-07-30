/**
 * TODAY-02 Tasks kernel — the repository contract.
 *
 * A storage-independent, WORKSPACE-BOUND repository for the additive task-detail
 * slice TODAY-02 introduces (ADR-028). It COMPOSES the FND-07 spine rather than
 * replacing it: identity, title, completion and optional structural parentage remain
 * the spine's; this repository owns the `task_details` fields (status, priority,
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
  BulkFieldResult,
  BulkPlanResult,
  ClearPlanResult,
  ClearWaitingResult,
  CommitmentState,
  CompleteTaskResult,
  GetTaskOptions,
  ListPlanningTasksInput,
  ListProjectTasksInput,
  ListTasksInput,
  ListWaitingTasksInput,
  ListWorkspaceTaskGroupsInput,
  ListWorkspaceTasksInput,
  NewTaskInput,
  PlanTaskInput,
  PlanTaskResult,
  ProjectTaskListPage,
  SearchTaskParentsInput,
  SearchTasksInput,
  SetTaskParentInput,
  SetTaskParentResult,
  SetWaitingInput,
  SetWaitingResult,
  TaskListPage,
  TaskParentCandidate,
  TaskPriority,
  TaskSearchHit,
  TaskStatus,
  TaskView,
  TimeSector,
  UpdateTaskInput,
  UpdateTaskResult,
  WaitingTaskPage,
  WorkspaceTaskGrouping,
  WorkspaceTaskListPage,
} from "./task";

export interface TaskRepository {
  /**
   * Create a Task AND its initial planning fields as ONE atomic operation. A Task
   * may be intentionally Unassigned: then the batch writes the `entities` row, the
   * `spine_records` row, `entity.created` Activity and optional `task_details`, but
   * no structural EntityLink. When a parent is supplied, the same batch also writes
   * the structural parent link and `entity_link.created` Activity after validating
   * an active Area or non-archived Project in this workspace. Either everything
   * commits or nothing does; callers never write structural links directly.
   */
  createTask(input: NewTaskInput): Promise<TaskView>;

  /**
   * Read one task as a full `TaskView` — the entity header, the spine's
   * completion, the additive details (documented defaults when it has no
   * `task_details` row yet), and the resolved project/goal/area relationships.
   * Returns `null` when the id is not a task in this workspace (nonexistent,
   * soft-deleted without `includeDeleted`, wrong entity type, or cross-workspace).
   */
  getTask(id: string, options?: GetTaskOptions): Promise<TaskView | null>;

  /**
   * Assign, move or clear a Task's structural parent. `null` means intentional
   * Unassigned. The repository validates destination parents inside the workspace,
   * preserves Task details/completion/waiting state, appends structural Activity and
   * reports idempotent no-ops without writing duplicate links.
   */
  setTaskParent(
    id: string,
    parent: SetTaskParentInput,
  ): Promise<SetTaskParentResult>;

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
   * Search non-deleted Tasks by title for global Search. Returns the planning
   * fields and parent context in one bounded projection so Search can render
   * priority/urgency signals without per-result detail reads.
   */
  searchTasks(input: SearchTasksInput): Promise<readonly TaskSearchHit[]>;

  /**
   * List the tasks belonging to ONE Project (PROJ-01) as bounded, deterministic
   * summaries — the efficient query behind a project's task list. Resolves every
   * task in a single bounded, workspace-scoped statement (no N+1, no per-task
   * `getTask`); never loads every workspace task to filter in the client. Tasks are
   * matched by their active `task.belongs_to_project` parent link to `projectId`, so
   * a wrong-kind or missing id simply yields no tasks (never a cross-workspace
   * disclosure). Completed tasks are included per `state` (default `open`), waiting
   * tasks are included with their waiting representation, and ordering is
   * deterministic `(createdAt, id)` — a stable keyset so the returned page carries
   * an opaque `nextCursor` (bound to workspace + project + state) that resumes
   * exactly after the last row, making every matching task reachable without an
   * unbounded query, a skip or a duplicate.
   */
  listProjectTasks(
    projectId: string,
    input?: ListProjectTasksInput,
  ): Promise<ProjectTaskListPage>;

  /**
   * List the tasks the planning surface needs (TODAY-04), bounded per band so the
   * owner's commitments are never lost to backlog truncation: ALL scheduled (planned)
   * open tasks up to a generous bound (ordered scheduled-date ascending, so overdue
   * and today are preserved first), a bounded page of the unscheduled backlog, and a
   * bounded page of the most-recent completions (for "completed today"). Waiting
   * tasks are excluded. The result is a flat list the caller buckets by scheduled
   * date; unlike `listTasks`, a large early-due backlog can never hide planned work.
   */
  listPlanningTasks(input: ListPlanningTasksInput): Promise<TaskListPage>;

  /**
   * List the workspace-wide Tasks collection for `/tasks` (TASKS-01) as a bounded,
   * deterministic, cursor-paginated page over the SAME canonical task records — the
   * read model behind every `/tasks` system view (Focus/Matrix/Sectors/All and the
   * Inbox/Today/This Week/…/Someday/Waiting/Overdue/Completed/Cancelled views). All
   * filtering, sorting, counting, overdue detection and grouping is server-
   * authoritative (never "load the workspace into React"): one bounded, N+1-free,
   * workspace-scoped statement per page. Membership follows ADR-043 §5–§6 (Someday/
   * Cancelled/Completed/Waiting are their own views, excluded from the active
   * execution views). The page carries an opaque, versioned cursor bound to the full
   * query scope (workspace + view + filters + sort + day); a cursor that does not
   * match the current query is rejected (`InvalidSpineCursorError`), never
   * reinterpreted. This method is READ-ONLY presentation/query ownership — it is
   * never a second mutation authority.
   */
  listWorkspaceTasks(
    input: ListWorkspaceTasksInput,
  ): Promise<WorkspaceTaskListPage>;

  /**
   * Group the ACTIVE planning collection server-side for the Matrix (`quadrant`) and
   * Sectors (`sector`) views (ADR-043 §11 / decision 12). In ONE bounded, N+1-free,
   * workspace-scoped query it returns, per bucket, the AUTHORITATIVE total `count`
   * (over the whole active scope — never "how many were loaded") AND a bounded,
   * deterministically-sorted (`sort`, default `smart`) top slice of that bucket's
   * tasks, with `hasMore` when the bucket holds more than the returned slice. This
   * makes quadrant/sector counts and empty states correct independent of record
   * paging: a bucket is never shown empty because its first task fell beyond a global
   * page. The remainder of an overflowing bucket is reached through the equivalent
   * filtered `all` view (priority/sector filter), which paginates that one bucket on
   * its own cursor. READ-ONLY presentation/query ownership — never a mutation path.
   */
  listWorkspaceTaskGroups(
    input: ListWorkspaceTaskGroupsInput,
  ): Promise<WorkspaceTaskGrouping>;

  /**
   * TASKS-03 — the DISTINCT delegatees recorded on the workspace's tasks, for the
   * "Delegated to" filter. ONE bounded, workspace-scoped, N+1-free aggregate — the
   * filter therefore offers only values that genuinely exist, so it is a closed
   * option set that the shared control sheet can render without searching, and a
   * filter can never name someone with no tasks. Ordered deterministically.
   */
  listTaskDelegates(limit?: number): Promise<readonly string[]>;

  /**
   * Search the workspace's candidate task PARENTS — active Areas and non-archived
   * Projects — by title, for the `/tasks` create flow (ADR-043 §9 / decision 13). A
   * bounded, indexed, workspace-scoped SQL search over the WHOLE collection (never a
   * fixed-prefix scan that can hide a newer Area/Project in a long-lived workspace):
   * a case-insensitive title match, parameterised, ordered deterministically
   * (Projects first, then title, then id) and capped. An empty query returns the
   * first bounded page of parents. Returns only entities this workspace can see, so
   * an inaccessible title never leaks; the create action re-verifies the chosen
   * parent independently, so this is a convenience for selection, never the authority.
   */
  searchTaskParents(
    input?: SearchTaskParentsInput,
  ): Promise<readonly TaskParentCandidate[]>;

  /**
   * Resolve one candidate capture parent by id, using the same active Area /
   * non-archived Project rule as `searchTaskParents`. Returns null when the id is
   * missing, wrong-kind, archived, deleted or outside the bound workspace.
   */
  getTaskParentCandidate(id: string): Promise<TaskParentCandidate | null>;

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
   * Plan a task (TODAY-04): set its scheduled date to the owner's committed day
   * ATOMICALLY. One batch bumps the active task's `updated_at`, writes ONLY
   * `scheduled_date` on `task_details` (never the due date, waiting state or
   * completion), and appends exactly one `task.planned` (the task had no plan) or
   * `task.rescheduled` (the plan moved to a different date) event. Planning a task
   * that is already scheduled for that exact date is an idempotent no-op (no
   * Activity, `changed: false`). Throws `TaskValidationError` for an invalid/absent
   * date and `TaskNotFoundError` for a missing/deleted/non-task/cross-workspace id.
   */
  planTask(id: string, input: PlanTaskInput): Promise<PlanTaskResult>;

  /**
   * Clear a task's plan (TODAY-04): remove its scheduled date ATOMICALLY. One batch
   * clears ONLY `scheduled_date` and appends exactly one `task.plan_cleared` event.
   * It never changes the due date, waiting state or completion. Clearing a task
   * that has no plan is an idempotent no-op (no Activity, `changed: false`). Throws
   * `TaskNotFoundError` for a missing/deleted task.
   */
  clearPlan(id: string): Promise<ClearPlanResult>;

  /**
   * Plan MANY tasks to the same date as ONE ATOMIC operation (TODAY-04). The date
   * and the id list are validated first; every id must resolve to a task in this
   * workspace or the whole operation is rejected (`TaskNotFoundError`) and nothing
   * is written. Then a single `D1Database.batch()` plans every task whose date
   * actually changes — each with its own guarded `task.planned`/`task.rescheduled`
   * event — so either all commit or none do. Tasks already on the requested date
   * are counted as `unchanged` and get no statements. Throws `TaskValidationError`
   * for an invalid date or an empty/oversized/invalid id list.
   */
  planTasks(
    ids: readonly string[],
    input: PlanTaskInput,
  ): Promise<BulkPlanResult>;

  /**
   * Clear the plan on MANY tasks as ONE ATOMIC operation (TODAY-04). Mirrors
   * `planTasks`: the id list is validated, every id must resolve to a task in this
   * workspace, and a single batch clears the plan on every currently-planned task
   * (each with a guarded `task.plan_cleared` event). Tasks with no plan are counted
   * as `unchanged`. Throws `TaskValidationError`/`TaskNotFoundError` as `planTasks`.
   */
  clearPlans(ids: readonly string[]): Promise<BulkPlanResult>;

  /**
   * Set the priority (P1–P4, or null to clear) on MANY tasks as ONE ATOMIC
   * operation (TASKS-01). Mirrors `planTasks`: every id is validated and resolved to
   * a task in this workspace first (any missing/cross-workspace id rejects the WHOLE
   * operation), then a single batch updates only the tasks whose priority actually
   * changes — each with its own guarded `entity.updated` event. No-op tasks are
   * counted `unchanged`. Throws `TaskValidationError`/`TaskNotFoundError` as `planTasks`.
   */
  setPriorityMany(
    ids: readonly string[],
    priority: TaskPriority | null,
  ): Promise<BulkFieldResult>;

  /** Set the Time Sector (or null → Inbox) on MANY tasks atomically. See `setPriorityMany`. */
  setSectorMany(
    ids: readonly string[],
    timeSector: TimeSector | null,
  ): Promise<BulkFieldResult>;

  /** Set the commitment state (active/someday) on MANY tasks atomically. See `setPriorityMany`. */
  setCommitmentMany(
    ids: readonly string[],
    commitmentState: CommitmentState,
  ): Promise<BulkFieldResult>;

  /**
   * TASKS-03 — set (or clear, with `null`) the DUE date on MANY tasks atomically.
   * See `setPriorityMany`. The due date is a DEADLINE and stays strictly separate
   * from the scheduled/planned date `planTasks` writes (ADR-043 §3): neither ever
   * silently overwrites the other.
   */
  setDueDateMany(
    ids: readonly string[],
    dueDate: string | null,
  ): Promise<BulkFieldResult>;

  /** Set the workflow status on MANY tasks atomically. See `setPriorityMany`. */
  setStatusMany(
    ids: readonly string[],
    status: TaskStatus,
  ): Promise<BulkFieldResult>;

  /**
   * Complete MANY tasks (each with any active waiting cleared, per ADR-029) as ONE
   * ATOMIC operation (TASKS-01 §16). Mirrors `setPriorityMany`/`planTasks`: the id
   * list is validated and EVERY id is resolved to a task in this workspace first —
   * any missing/cross-workspace/archived id rejects the WHOLE operation before a
   * single write, so nothing is partially applied. Then ONE `D1Database.batch()`
   * runs every open task's full completion group (the shared spine completion write,
   * the guarded `task.completed` event, and the atomic waiting clearance) so either
   * all commit or none do — a storage fault mid-batch can never leave a subset of
   * the selection completed. Tasks that are already completed are idempotent no-ops,
   * counted as `unchanged` and contributing no statements. Throws
   * `TaskValidationError` for an empty/oversized/invalid id list and
   * `TaskNotFoundError`/`TaskProjectArchivedError` as the other bulk methods.
   */
  completeTasks(ids: readonly string[]): Promise<BulkFieldResult>;

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
