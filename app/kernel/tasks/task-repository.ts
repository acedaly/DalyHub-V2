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
  CompleteTaskOptions,
  CompleteTaskResult,
  GetTaskOptions,
  ListPlanningTasksInput,
  ListProjectTasksInput,
  ListTasksInput,
  ListTaskActivityInput,
  ListWaitingTasksInput,
  TaskActivityDayCount,
  ListWorkspaceTaskGroupsInput,
  ListProjectNextActionsInput,
  ListWorkspaceTasksInput,
  MoveTaskOccurrenceInput,
  MoveTaskOccurrenceResult,
  NewTaskInput,
  PlanTaskInput,
  PlanTaskResult,
  ProjectTaskListPage,
  ReopenTaskResult,
  SearchTaskParentsInput,
  SearchTasksInput,
  SetTaskParentInput,
  SetTaskParentResult,
  SetTaskRecurrenceInput,
  SetTaskRecurrenceResult,
  SetWaitingInput,
  SetWaitingResult,
  SkipTaskOccurrenceOptions,
  SkipTaskOccurrenceResult,
  TaskListItem,
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
import type {
  TaskChecklistItem,
  TaskChecklistProgress,
} from "./task-checklist";
import type { TaskBlockedSummary, TaskDependencies } from "./task-dependencies";

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
   * TASKS-04 — set, change or REMOVE the Task's structured recurrence rule
   * (ADR-062). The rule is validated through the kernel against the Task's own
   * anchor date (a `scheduled` rule needs a scheduled date, a `due` rule a due
   * date), stored as DATA in `task_recurrence_rules`, and recorded through the ONE
   * existing `entity.updated` Activity event — recurrence is a task-detail field,
   * not a second history model.
   *
   * The first rule on a Task starts a SERIES: the persisted `series_id` /
   * `sequence` pair that later makes successor creation and undo deterministic. A
   * Task that is already part of a series keeps its series identity when the rule is
   * edited, so history is never re-parented. Passing `null` removes the rule (and
   * with it the Task's membership of the series); every other Task field —
   * completion, dates, waiting, delegation, parent — is untouched. An unchanged rule
   * is an idempotent no-op with no Activity.
   *
   * Throws `TaskValidationError` for an invalid rule or a missing anchor date,
   * `TaskNotFoundError` for a missing/deleted/cross-workspace id, and
   * `TaskProjectArchivedError` when the Task sits in an archived Project.
   */
  setTaskRecurrence(
    id: string,
    recurrence: SetTaskRecurrenceInput,
  ): Promise<SetTaskRecurrenceResult>;

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
   * Group the ACTIVE planning collection server-side for the Time Sectors view
   * (`sector`) and every grouped List or Board (ADR-043 §11 / decision 12). In ONE
   * bounded, N+1-free,
   * workspace-scoped query it returns, per bucket, the AUTHORITATIVE total `count`
   * (over the whole active scope — never "how many were loaded") AND a bounded,
   * deterministically-sorted (`sort`, default `smart`) top slice of that bucket's
   * tasks, with `hasMore` when the bucket holds more than the returned slice. This
   * makes bucket counts and empty states correct independent of record
   * paging: a bucket is never shown empty because its first task fell beyond a global
   * page. The remainder of an overflowing bucket is reached through the equivalent
   * filtered `all` view (priority/sector filter), which paginates that one bucket on
   * its own cursor. READ-ONLY presentation/query ownership — never a mutation path.
   */
  listWorkspaceTaskGroups(
    input: ListWorkspaceTaskGroupsInput,
  ): Promise<WorkspaceTaskGrouping>;

  /**
   * STEER-04 — each Project's canonical NEXT ACTION, in ONE bounded statement.
   *
   * The product's one next-action rule (`~/kernel/tasks/next-action`,
   * ADR-111 decision 4) evaluated at the database: the population is the
   * canonical ACTIVE planning scope minus TASKS-12's dependency-blocked work,
   * the ordering is the canonical `smart` expression with the collection's own
   * `created_at, id` tiebreak, and `ROW_NUMBER() OVER (PARTITION BY project)`
   * keeps rank 1 per Project. One statement per chunk of ids — never one query
   * per Project, and never a bounded scan of the workspace pretending to be
   * exhaustive (which is what the guided Review's disclosed approximation is,
   * and why it stays what it is rather than being widened).
   *
   * A Project with no eligible Task is simply absent from the map: the caller
   * renders REVIEW-02's honest absence rather than inventing a step.
   */
  listProjectNextActions(
    input: ListProjectNextActionsInput,
  ): Promise<Map<string, TaskListItem>>;

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
   * GOAL-02 — the created-vs-completed counts for a handful of owner-calendar
   * days, for Today's workload trend.
   *
   * TWO bounded aggregate queries for the WHOLE window — never one per day and
   * never a row-by-row read the surface then buckets (AGENTS.md §16). The day
   * boundaries are supplied as UTC instant ranges by the caller, so the SQL
   * carries no timezone assumption of its own. Every requested day appears, with
   * zeroes when nothing happened — an absent day would be indistinguishable from
   * a quiet one.
   */
  countTaskActivityByDay(
    input: ListTaskActivityInput,
  ): Promise<readonly TaskActivityDayCount[]>;

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
  completeTasks(
    ids: readonly string[],
    options?: CompleteTaskOptions,
  ): Promise<BulkFieldResult>;

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
  completeTask(
    id: string,
    options?: CompleteTaskOptions,
  ): Promise<CompleteTaskResult>;

  /**
   * TASKS-07 — move a recurring occurrence's ANCHOR date at an explicit series scope
   * (ADR-085). The anchor is whichever date the rule advances (`dateKind`): a
   * `scheduled` rule moves the scheduled date, a `due` rule the due date. The other
   * date keeps its distance from it, so a Monday/Friday window stays four days wide.
   *
   *   - `scope: "occurrence"` moves THIS occurrence only and REMEMBERS the series'
   *     grid, so the next occurrence returns to the routine's schedule;
   *   - `scope: "series"` moves this occurrence AND re-anchors the schedule here, so
   *     every future occurrence follows from the new date.
   *
   * Completed occurrences are never touched under either scope — the series' history
   * is not rewritten because its future changed. One atomic batch; one guarded
   * `task.planned`/`task.rescheduled` (or `entity.updated` for a due-date rule)
   * Activity event, so a series edit is as legible as any other date change. An
   * unchanged date under an unchanged scope is an idempotent no-op.
   *
   * Throws `TaskValidationError` when the Task does not repeat, is completed, or the
   * date is invalid; `TaskNotFoundError` for a missing/cross-workspace id; and
   * `TaskProjectArchivedError` inside an archived Project.
   */
  moveTaskOccurrence(
    id: string,
    input: MoveTaskOccurrenceInput,
  ): Promise<MoveTaskOccurrenceResult>;

  /**
   * TASKS-07 — SKIP one occurrence of a series (ADR-085): advance this occurrence to
   * the series' next date without completing it, so "I am not mowing the lawn this
   * week" needs neither a false completion nor a deleted routine.
   *
   * It is deliberately NOT completion and NOT an ordinary reschedule. The occurrence
   * stays open, its dates move exactly one step along the rule (respecting the
   * scheduling mode — an after-completion rule steps from the owner's day), no
   * successor is created, no sequence is consumed and the series identity is
   * untouched. ONE atomic batch appends exactly one
   * `task.recurrence_occurrence_skipped` event carrying the date skipped from, the
   * date skipped to and the series identity, so the history says what happened
   * instead of claiming the work was done.
   *
   * Throws `TaskValidationError` when the Task does not repeat, has no anchor date or
   * is already completed; `TaskNotFoundError` for a missing/cross-workspace id; and
   * `TaskProjectArchivedError` inside an archived Project.
   */
  skipTaskOccurrence(
    id: string,
    options: SkipTaskOccurrenceOptions,
  ): Promise<SkipTaskOccurrenceResult>;

  /**
   * TASKS-06 — move MANY Tasks to the same structural parent (or to Inbox with
   * `null`) as ONE ATOMIC operation. It is the bulk form of `setTaskParent` and
   * shares its authority: the destination is validated once inside this workspace
   * (rejecting missing, deleted, archived, wrong-kind and cross-workspace parents),
   * every id is resolved before a single write, and then ONE `D1Database.batch()`
   * unlinks each Task's current parent, links the new one — RESTORING a previously
   * used link row rather than duplicating it — and appends the same
   * `entity_link.unlinked` / `entity_link.created` / `entity_link.restored` Activity a
   * single move appends. Either all commit or none do, so a selection is never left
   * half-filed. Tasks already under the destination are counted `unchanged`.
   *
   * Throws `TaskValidationError` for an empty/oversized/invalid id list,
   * `TaskNotFoundError` for a missing id or destination, `SpineInvalidParentKindError`
   * for a wrong-kind destination and `TaskProjectArchivedError` for an archived one.
   */
  setParentMany(
    ids: readonly string[],
    parent: SetTaskParentInput,
  ): Promise<BulkFieldResult>;

  /**
   * TASKS-06 — reopen MANY completed Tasks as ONE ATOMIC operation, with the SAME
   * safe recurrence-successor withdrawal `reopenTask` performs for each of them
   * (ADR-062): a successor still exactly as completion made it is withdrawn and its
   * series slot released; one the owner has since edited, planned, linked or
   * completed is RETAINED. Every id is resolved first, so a missing or archived id
   * rejects the whole operation; already-open Tasks are counted `unchanged`.
   */
  reopenTasks(ids: readonly string[]): Promise<BulkFieldResult>;

  /**
   * TASKS-06 — REVERSIBLY delete MANY Tasks as ONE ATOMIC operation: a soft delete
   * (`entities.deleted_at`), exactly the same lifecycle transition the spine's own
   * `softDelete` performs, with one `entity.deleted` event per Task that actually
   * changed. Nothing is destroyed: a deleted Task keeps its title, details,
   * relationships, Activity and recurrence row, stays out of every ordinary view, and
   * is reachable and restorable through the built-in **Deleted** view.
   *
   * Permanent destruction is NOT reachable from here, deliberately: a bulk toolbar
   * button must never be able to erase records irrecoverably (AGENTS.md §7).
   *
   * Already-deleted Tasks are counted `unchanged`. Throws `TaskValidationError` for an
   * empty/oversized/invalid id list and `TaskNotFoundError` for an id that is not a
   * Task in this workspace.
   */
  deleteTasks(ids: readonly string[]): Promise<BulkFieldResult>;

  /**
   * TASKS-06 — restore MANY soft-deleted Tasks as ONE ATOMIC operation, mirroring
   * `deleteTasks` and the spine's `restore`: `deleted_at` is cleared and one
   * `entity.restored` event appended per Task that actually changed. A Task whose
   * retained structural parent is gone or archived cannot be restored into it, so the
   * whole operation is rejected rather than silently re-filing work somewhere the
   * owner did not choose — except for a Task that never had a parent, which returns
   * to the Inbox it came from (AUDIT-15). Already-active Tasks count `unchanged`.
   */
  restoreTasks(ids: readonly string[]): Promise<BulkFieldResult>;

  /**
   * TASKS-04 — reopen a completed Task, and safely undo the recurrence successor the
   * completion created (ADR-062). ONE `D1Database.batch()` clears the spine
   * completion, bumps `updated_at`, appends `task.reopened` and — ONLY when the
   * successor is provably safe to withdraw — soft-deletes that successor and appends
   * its withdrawal Activity. Either all of that commits or none of it does.
   *
   * "Provably safe" is decided from PERSISTED identity, never a guess: the successor
   * must be the next `sequence` of THIS occurrence's series, still open, still
   * unassigned of any change (its `updated_at` still equals its `created_at`), and
   * carry no relationships beyond the structural parent link it was created with. A
   * successor the owner has since edited, completed, planned or linked is RETAINED
   * and reported as `retained`, so undo can never destroy real work.
   *
   * Reopening an already-open Task is an idempotent no-op. Reopening never restores a
   * prior waiting state (the documented default) and never un-archives a Project:
   * `TaskProjectArchivedError` is thrown when the parent Project is archived.
   */
  reopenTask(id: string): Promise<ReopenTaskResult>;

  /* ------------------------------------------------------------------------ */
  /* TASKS-13 — checklists                                                     */
  /* ------------------------------------------------------------------------ */

  /**
   * TASKS-13 — the ordered checklist of ONE Task.
   *
   * One bounded, workspace-scoped statement, already in the owner's order
   * (`position, created_at, id` — a total order, so the list is deterministic
   * even if two items ever shared a position). Returns an empty list for a Task
   * with no checklist AND for an id that is not a Task in this workspace: a
   * checklist read discloses nothing about what exists elsewhere.
   */
  listChecklist(taskId: string): Promise<readonly TaskChecklistItem[]>;

  /**
   * TASKS-13 — the checklist progress of MANY Tasks, for a collection surface.
   *
   * ONE bounded, indexed, workspace-scoped aggregate over the whole id list —
   * never one statement per Task, and never "read every item and count in
   * JavaScript". This is the only way a row surface may obtain progress, which
   * is what makes the no-N+1 property structural rather than a habit.
   *
   * Only Tasks that HAVE at least one item appear in the returned map; a caller
   * reads a missing key as {@link EMPTY_CHECKLIST_PROGRESS}, so "no checklist"
   * costs no row. An empty id list returns an empty map and issues no statement.
   */
  listChecklistProgress(
    taskIds: readonly string[],
  ): Promise<ReadonlyMap<string, TaskChecklistProgress>>;

  /**
   * DEBT-59 — which of these Tasks are OPEN, for a surface that holds many ids.
   *
   * ONE bounded, indexed, workspace-scoped read over the whole id list — never
   * one `getTask` per id, and never a client-side filter over a page of full
   * Task views. It exists for the same reason `listChecklistProgress` does: the
   * only way for a collection surface to obtain a per-Task fact is to ask for
   * all of them at once, which makes "no N+1" structural rather than a habit.
   *
   * OPEN is the kernel's own definition and the SAME one the Assets attention
   * query already uses in SQL: the Task exists, is not soft-deleted, is not
   * completed on the spine, and is not cancelled. Cancellation is a deliberate
   * decision not to proceed ([ADR-043](../../docs/decisions/ARCHITECTURE_DECISIONS.md)
   * §5), so a cancelled Task is no longer an actionable commitment.
   *
   * Ids that do not resolve — deleted, cross-workspace, never existed — are
   * simply absent from the result, which is the conservative direction: a
   * surface reads a missing id as "not open" rather than inventing a state for
   * it. An empty id list returns an empty set and issues no statement.
   */
  listOpenTaskIds(taskIds: readonly string[]): Promise<ReadonlySet<string>>;

  /**
   * TASKS-13 — append one item to the END of a Task's checklist, atomically.
   *
   * One batch inserts the item at the next dense position and bumps the parent
   * Task's `updated_at`, so a Task whose steps changed reads as recently changed.
   * NO Activity event is appended: see `TASKS_MODULE.md` — a checklist tick is
   * state, not history, and ten items would otherwise put ten rows into a
   * timeline that describes commitments.
   *
   * The position is resolved from `MAX(position) + 1` INSIDE the write, so two
   * items added at once cannot claim the same slot through a read-then-write gap.
   *
   * Throws `TaskNotFoundError` for a missing/deleted/non-task/cross-workspace id,
   * `TaskProjectArchivedError` inside an archived Project, `TaskValidationError`
   * for an unusable title, and `TaskChecklistFullError` at the bound.
   */
  createChecklistItem(
    taskId: string,
    input: { readonly title: string },
  ): Promise<TaskChecklistItem>;

  /**
   * TASKS-13 — rename one checklist item. Narrow by construction: the statement
   * writes `title` and nothing else, so a rename cannot disturb an item's
   * completion or its place in the order, and two devices renaming two different
   * items never contend.
   *
   * An unchanged title is an idempotent no-op reporting `changed: false`.
   */
  renameChecklistItem(
    taskId: string,
    itemId: string,
    title: string,
  ): Promise<{
    readonly item: TaskChecklistItem;
    readonly changed: boolean;
  }>;

  /**
   * TASKS-13 — tick or untick one checklist item.
   *
   * The narrowest mutation in the domain: ONE row, ONE column. It never touches
   * any other item, and — this is the decision TASKS-13 records — it never
   * touches the PARENT Task's completion. Completing every item does not
   * complete the Task, because the checklist describes the steps and the Task is
   * the commitment; the owner decides when that commitment is met.
   *
   * Idempotent: setting the state it already holds reports `changed: false` and
   * writes nothing, which is what makes an offline replay safe to repeat.
   */
  setChecklistItemCompleted(
    taskId: string,
    itemId: string,
    completed: boolean,
  ): Promise<{
    readonly item: TaskChecklistItem;
    readonly changed: boolean;
  }>;

  /**
   * TASKS-13 — delete one checklist item and CLOSE THE GAP, atomically.
   *
   * One batch removes the row, renumbers every later item down one place so
   * positions stay dense, and bumps the parent Task. Deleting an item that is
   * already gone is an idempotent no-op rather than an error: on a surface where
   * two devices can both delete, "it is not there" is the outcome that was
   * asked for.
   */
  deleteChecklistItem(
    taskId: string,
    itemId: string,
  ): Promise<{ readonly changed: boolean }>;

  /**
   * TASKS-13 — set the whole order of ONE Task's checklist, atomically.
   *
   * The submitted list must name EXACTLY the Task's current items — every one of
   * them, each once. Anything else (a stale list missing an item another device
   * added, a list naming a deleted item) is refused with
   * `TaskChecklistItemNotFoundError` and NOTHING is written, because a partial
   * reorder would silently invent an order the owner never chose. The check and
   * the write happen in the same request against the same read, so the loser of
   * a race retries against the truth rather than overwriting it.
   *
   * One batch renumbers every row to its dense index. An order identical to the
   * stored one is an idempotent no-op.
   */
  reorderChecklist(
    taskId: string,
    orderedItemIds: readonly string[],
  ): Promise<{ readonly changed: boolean }>;

  /* ------------------------------------------------------------------------ */
  /* TASKS-12 — dependencies                                                   */
  /* ------------------------------------------------------------------------ */

  /**
   * TASKS-12 — the Tasks that block THIS one, and the Tasks it blocks.
   *
   * ONE bounded, workspace-scoped statement returning both directions of the same
   * `task.blocks` relationship, with each counterpart's title and completion
   * already resolved — so the record draws its dependencies without a read per
   * row. Soft-deleted counterparts are excluded: a Task in the trash is not
   * holding anything up (see `TASKS_MODULE.md → Deleted blockers`).
   *
   * Returns {@link EMPTY_TASK_DEPENDENCIES} for a Task with none AND for an id
   * that is not a Task in this workspace — a dependency read discloses nothing
   * about what exists elsewhere.
   */
  listTaskDependencies(taskId: string): Promise<TaskDependencies>;

  /**
   * TASKS-12 — the BLOCKED state of many Tasks, for a collection surface.
   *
   * ONE bounded, indexed, workspace-scoped aggregate over the whole id list —
   * never one statement per Task, and never "read every edge and count in
   * JavaScript". This is the only way a row surface may learn that a Task is
   * blocked, which is what makes the no-N+1 property structural rather than a
   * habit.
   *
   * Only Tasks with at least one LIVE, INCOMPLETE blocker appear in the map; a
   * caller reads a missing key as "not blocked", so an unblocked Task costs no
   * row. An empty id list returns an empty map and issues no statement.
   *
   * The state is DERIVED here, on every read, from the edges and the blockers'
   * own completion — there is no stored flag to go stale, which is what makes
   * "completing the last blocker unblocks it" and "reopening a blocker blocks it
   * again" true with no reconciliation anywhere.
   */
  listBlockedSummaries(
    taskIds: readonly string[],
  ): Promise<ReadonlyMap<string, TaskBlockedSummary>>;

  /**
   * TASKS-12 — record that `blockerId` must be complete before `taskId` can
   * proceed.
   *
   * ONE atomic statement group. Every invariant is a predicate INSIDE the write
   * rather than a read-then-decide, so two concurrent adds cannot both pass:
   *
   *   - both endpoints are live, non-deleted TASKS in the bound workspace;
   *   - neither id is the other (also a schema CHECK);
   *   - the blocked Task has fewer than {@link MAX_TASK_BLOCKERS} blockers and the
   *     blocker blocks fewer than {@link MAX_TASK_BLOCKS} Tasks, counted in the
   *     same statement that inserts;
   *   - the blocker is not already reachable FROM the blocked Task by following
   *     `task.blocks` edges — the bounded cycle walk, evaluated in SQL in the same
   *     statement.
   *
   * Adding a dependency that already exists is an idempotent no-op reporting
   * `changed: false`; re-adding one that was previously removed RESTORES the
   * original relationship row rather than minting a second identity, exactly as
   * the generic link lifecycle does.
   *
   * It NEVER changes a date, a priority, a status or a completion on either Task
   * (ADR-106). A dependency describes what must happen first; it does not
   * reschedule the owner's plan.
   *
   * Throws `TaskNotFoundError` for a missing/deleted/non-task/cross-workspace id
   * on either end, `TaskValidationError` for a self-dependency,
   * `TaskDependencyCycleError` for a cycle, `TaskDependencyLimitError` at either
   * bound, and `TaskProjectArchivedError` when the blocked Task sits in an
   * archived Project.
   */
  addTaskDependency(
    taskId: string,
    blockerId: string,
  ): Promise<{ readonly changed: boolean }>;

  /**
   * TASKS-12 — remove one dependency edge (`blockerId` no longer blocks
   * `taskId`).
   *
   * The relationship is UNLINKED, not destroyed: its stable id survives, so
   * re-adding the same dependency later restores one relationship rather than
   * creating a second. Removing an edge that is not there is an idempotent no-op
   * — on a surface where two devices can both remove, "it is not there" is the
   * outcome that was asked for.
   */
  removeTaskDependency(
    taskId: string,
    blockerId: string,
  ): Promise<{ readonly changed: boolean }>;
}
