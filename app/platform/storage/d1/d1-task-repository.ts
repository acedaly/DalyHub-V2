/**
 * TODAY-02 Tasks — D1 implementation of the workspace-bound TaskRepository.
 *
 * Implements the storage-independent `TaskRepository` over Cloudflare D1 (SQLite)
 * using prepared, parameterised statements only. Constructed with a single
 * `WorkspaceContext`; every statement constrains `workspace_id = ?` with that
 * context's id, and no method accepts a `workspaceId` (ADR-010/ADR-028). No
 * caller-supplied value is ever interpolated into SQL — every value is bound
 * (AGENTS.md §17). The task entity type and the structural link types ARE inlined
 * as trusted kernel constants (the same literals the migration pins), never caller
 * data.
 *
 * This adapter COMPOSES the spine: it never writes `spine_records.completed_at`
 * (completion stays the SpineRepository's authority) and never mutates structural
 * links. `updateTask` is ONE `D1Database.batch()` — a single transaction that
 * writes `entities.title`/`updated_at`, upserts `task_details` and appends exactly
 * one `entity.updated` event guarded on the entity update's `changes()`, so a
 * no-op (or a task deleted mid-flight) appends nothing and writes nothing.
 *
 * D1 specifics (rows, SQL, timestamp strings) stay inside this file,
 * `database.ts` and `task-database.ts`.
 */

import {
  ActivityError,
  buildActivityWriteModel,
  createSystemActorContext,
  secureIdGenerator as activitySecureIdGenerator,
  type ActivityActorContext,
  type JsonValue,
  type NewActivityEvent,
} from "~/kernel/activity";
import type { MarkdownSource } from "~/kernel/markdown";
import {
  AREA,
  GOAL_BELONGS_TO_AREA,
  PROJECT,
  PROJECT_ADVANCES_GOAL,
  PROJECT_BELONGS_TO_AREA,
  SpineInvalidParentKindError,
  SpineParentUnavailableError,
  TASK,
  TASK_BELONGS_TO_AREA,
  TASK_BELONGS_TO_PROJECT,
  TASK_COMPLETED,
  TASK_REOPENED,
  secureIdGenerator,
  spineLinkTypeFor,
  systemClock,
  validateSpineTitle,
  type Clock,
  type IdGenerator,
} from "~/kernel/spine";
import {
  decodeProjectTaskCursorForScope,
  decodeWorkspaceTaskCursorForScope,
  encodeProjectTaskCursor,
  encodeWorkspaceTaskCursor,
  isWaitingTargetType,
  TASK_PLAN_CLEARED,
  TASK_PLANNED,
  TASK_RESCHEDULED,
  TASK_WAITING_ON,
  TASK_WAITING_CHANGED,
  TASK_WAITING_CLEARED,
  TASK_RECURRENCE_OCCURRENCE_CREATED,
  TASK_RECURRENCE_OCCURRENCE_SKIPPED,
  TASK_RECURRENCE_OCCURRENCE_WITHDRAWN,
  TASK_WAITING_STARTED,
  TaskNotFoundError,
  TaskProjectArchivedError,
  TaskStorageError,
  TaskValidationError,
  addCalendarDays,
  calendarDaysBetween,
  nextTaskOccurrenceStep,
  planNextTaskOccurrence,
  EMPTY_TASK_DEPENDENCIES,
  MAX_DEPENDENCY_DEPTH,
  MAX_TASK_BLOCKERS,
  MAX_TASK_BLOCKS,
  TASK_BLOCKS,
  TASK_DEPENDENCY_ADDED,
  TASK_DEPENDENCY_REMOVED,
  TaskDependencyCycleError,
  TaskDependencyLimitError,
  validateTaskDependencyPair,
  type TaskBlockedSummary,
  type TaskDependencies,
  type TaskDependencyEndpoint,
  recurrenceAnchorField,
  resolveTaskRecurrenceRule,
  workspaceTaskFiltersSignature,
  validateCommitmentState,
  validateDelegationInput,
  validatePlanDate,
  validateSetWaitingInput,
  validateTaskDate,
  validateTaskDescription,
  validateTaskTagSet,
  validateTaskId,
  validateTaskIdList,
  validateTaskLimit,
  validateTaskPriorities,
  validateTaskPriority,
  validateTaskDateBound,
  validateTaskSeriesEditScope,
  validateTaskSort,
  validateTaskSortDirection,
  validateTaskStatus,
  validateTaskSystemView,
  validateTaskTitle,
  validateTimeSector,
  validateTaskCompletedVisibility,
  validateTaskDueState,
  validateTaskFollowUpState,
  validateTaskGroupDimension,
  validateTaskParentKind,
  validateTaskPlannedState,
  validateTaskRecencyWindow,
  recencyWindowStart,
  shiftCalendarDate,
  weekWindowEnd,
  NEXT_ACTION_VIEW,
  type BulkFieldResult,
  type BulkPlanResult,
  type ClearPlanResult,
  type ClearWaitingResult,
  type CommitmentState,
  type CompleteTaskOptions,
  type CompleteTaskResult,
  type CompletedTaskWindow,
  type CountCompletedInBucketsInput,
  type CompletedTaskWindowCount,
  type GetTaskOptions,
  type ListPlanningTasksInput,
  type ListProjectTasksInput,
  type ListTasksInput,
  type ListTaskActivityInput,
  type TaskActivityDayCount,
  type ListWaitingTasksInput,
  type CountWaitingTasksInput,
  type ListWorkspaceTaskGroupsInput,
  type ListProjectNextActionsInput,
  type ListWorkspaceTasksInput,
  type MoveTaskOccurrenceInput,
  type MoveTaskOccurrenceResult,
  type NewTaskInput,
  type PlanTaskInput,
  type PlanTaskResult,
  type ProjectTaskCursorScope,
  type ProjectTaskListPage,
  type ReopenTaskResult,
  type ReopenTaskSuccessorOutcome,
  type SearchTaskParentsInput,
  type SearchTasksInput,
  type SetTaskParentInput,
  type SetTaskParentResult,
  type SetTaskRecurrenceInput,
  type SetTaskRecurrenceResult,
  type SetWaitingInput,
  type SetWaitingResult,
  type SkipTaskOccurrenceOptions,
  type SkipTaskOccurrenceResult,
  type TaskDelegation,
  type TaskDetails,
  type TaskFollowUpState,
  type TaskListItem,
  type TaskListPage,
  type TaskParentCandidate,
  type TaskPriority,
  type TaskRecurrenceRule,
  type TaskRecurrenceSeries,
  decodeWaitingTaskCursorForScope,
  encodeWaitingTaskCursor,
  MAX_CHECKLIST_ITEMS,
  TaskChecklistFullError,
  TaskChecklistItemNotFoundError,
  validateChecklistItemId,
  validateChecklistOrder,
  validateChecklistTitle,
  type TaskChecklistItem,
  type TaskChecklistProgress,
  type TaskRelation,
  type TaskRelationKind,
  type TaskRepository,
  type TaskMatchSource,
  type TaskSearchHit,
  type TaskStatus,
  type TaskView,
  type TaskWaiting,
  type TimeSector,
  type UpdateTaskInput,
  type UpdateTaskResult,
  type WaitingCounts,
  type WaitingTaskCursorScope,
  type WaitingTaskListItem,
  type WaitingTaskPage,
  type WorkspaceTaskCursorScope,
  type WorkspaceTaskFilters,
  type WorkspaceTaskGroup,
  type WorkspaceTaskGroupDimension,
  type WorkspaceTaskGrouping,
  type WorkspaceTaskListPage,
} from "~/kernel/tasks";
import { canonicalTagKey, parseTagFilterKeys } from "~/kernel/tags";
import type { WorkspaceContext } from "~/kernel/workspaces";
import { parseWorkspaceId } from "~/kernel/workspaces";
import { ownerDayStartInstant } from "~/shared/datetime";

import {
  fromStorageTimestamp,
  toStorageTimestamp,
  type EntityRow,
} from "./database";
import { MAX_HISTORY_BUCKETS } from "./history-window-read";
import { D1ActivityRecorder } from "./d1-activity-recorder";
import { likeContains, likeContainsNeedle, likePrefix } from "./like-pattern";
import {
  readSearchExcerptRow,
  searchExcerpt,
  searchExcerptColumns,
  searchExcerptMatched,
} from "./search-excerpt";
import {
  buildEntityUpdatedAtBumpStatement,
  buildSpineChildEntityInsertStatement,
  buildSpineChildLinkInsertStatement,
  buildSpineChildRecordInsertStatement,
  buildSpineCompleteStatement,
  spineEntityCreatedEvent,
  spineLinkCreatedEvent,
} from "./spine-database";
import {
  rowToChecklistItem,
  rowToTaskDetails,
  rowToTaskWaiting,
  TASK_CHECKLIST_COLUMNS,
  TASK_CHECKLIST_ORDER,
  TASK_DETAIL_COLUMNS,
  TASK_SEARCH_DETAIL_COLUMNS,
  TASK_RECURRENCE_JOIN,
  WAITING_TARGET_COLUMNS,
  type TaskChecklistItemRow,
  type TaskJoinedRow,
  type WaitingTargetColumns,
} from "./task-database";
import {
  buildEntityTagStatements,
  entityTagsStatement,
  parseTagProjection,
  tagFilterPredicate,
} from "./d1-entity-tags";

/** The entity columns a mutation returns, matching {@link EntityRow}. */
const ENTITY_RETURNING =
  "id, workspace_id, type, title, created_at, updated_at, deleted_at";

const ENTITY_UPDATED = "entity.updated";
/** The generic reversible-lifecycle events, shared with the spine and entity repos. */
const ENTITY_DELETED = "entity.deleted";
const ENTITY_RESTORED = "entity.restored";
const LINK_CREATED = "entity_link.created";
const LINK_UNLINKED = "entity_link.unlinked";
const LINK_RESTORED = "entity_link.restored";
const SUBJECT_ROLE = "subject";
/** The Activity subject role of the occurrence a completion produced (TASKS-04). */
const ROLE_SUCCESSOR = "successor";
/** TASKS-12 — the Activity subject role of the Task that does the blocking. */
const ROLE_BLOCKER = "blocker";
const ROLE_SOURCE = "source";
const ROLE_TARGET = "target";

/** The two structural parent link types a Task can carry, as a trusted SQL list. */
const TASK_PARENT_LINK_LIST = `'${TASK_BELONGS_TO_AREA}', '${TASK_BELONGS_TO_PROJECT}'`;

/**
 * TODAY-TASK-01 / DEBT-144 — a task PARENT's identity, resolved by the read that
 * already resolves its title.
 *
 * ── Why a CTE and not three more joins ──────────────────────────────────────
 * Two of the three identity inputs are plain columns on `project_details` /
 * `area_details` and could be joined directly. The third — `colour_rank` — is a
 * WINDOW over the whole type ("this Project is the 4th ever created in this
 * workspace"), exactly as `PROJECT_RANKS_CTE`/`AREA_RANKS_CTE` compute it in
 * `d1-project-repository.ts`, and a window function cannot be evaluated inside a
 * correlated join. Ranking both types in ONE partitioned CTE gives each type its
 * own 0-based sequence, which is what the two separate CTEs there produce and is
 * what `identityForRank` folds — so a Project is the same colour on `/projects`,
 * on `/tasks` and on `/today` because the same number reaches the same resolver.
 *
 * ── What it costs ───────────────────────────────────────────────────────────
 * One extra scan of the workspace's Areas and Projects per task-list statement —
 * tens of rows in a real workspace, indexed by `(workspace_id, type)` — and NO
 * extra round trip and NO per-row query. That is the whole point: DEBT-144 was
 * open because the alternatives were an N+1 or half a list carrying identity.
 *
 * The CTE takes the workspace id as its FIRST bind, so every statement that
 * prefixes it binds `this.#workspaceId` ahead of its own parameters.
 */
const TASK_PARENT_IDENTITY_CTE = `task_parent_identity AS (
           SELECT pie.id AS id,
                  COALESCE(pipd.icon_key, piad.icon_key) AS icon_key,
                  COALESCE(pipd.colour_slot, piad.colour_slot) AS colour_slot,
                  ROW_NUMBER() OVER (
                    PARTITION BY pie.type ORDER BY pie.created_at ASC, pie.id ASC
                  ) - 1 AS colour_rank
           FROM entities pie
           LEFT JOIN project_details pipd
             ON pipd.workspace_id = pie.workspace_id AND pipd.entity_id = pie.id
           LEFT JOIN area_details piad
             ON piad.workspace_id = pie.workspace_id AND piad.entity_id = pie.id
           WHERE pie.workspace_id = ? AND pie.type IN ('${PROJECT}', '${AREA}')
         )`;

/** Attach the resolved identity of whichever entity the parent link points at. */
const TASK_PARENT_IDENTITY_JOIN = `
  LEFT JOIN task_parent_identity pi ON pi.id = pl.target_entity_id`;

/** The three identity columns a joined task-list row carries for its parent. */
const TASK_PARENT_IDENTITY_COLUMNS = `pi.icon_key AS parent_icon_key,
                pi.colour_slot AS parent_colour_slot,
                pi.colour_rank AS parent_colour_rank`;

/** Map a sector-named system view to its stored `time_sector` value (TASKS-01). */
const SECTOR_FOR_VIEW: Record<string, string> = {
  this_week: "this_week",
  next_week: "next_week",
  this_month: "this_month",
  next_month: "next_month",
  long_term: "long_term",
  routines: "routines",
};

/**
 * The LEFT JOIN that resolves a task's active `task.waiting_on` link (`wl`) and its
 * active counterpart entity (`we`) live — a trusted, constant fragment (the link
 * type is a kernel literal, never caller data). Requires the driving table aliased
 * `e` (the task entity).
 */
const WAITING_TARGET_JOIN = `
  LEFT JOIN entity_links wl
    ON wl.workspace_id = e.workspace_id AND wl.source_entity_id = e.id
       AND wl.deleted_at IS NULL AND wl.type = '${TASK_WAITING_ON}'
  LEFT JOIN entities we
    ON we.workspace_id = e.workspace_id AND we.id = wl.target_entity_id
       AND we.deleted_at IS NULL`;

/** The joined read row shape when the waiting-on target columns are selected. */
type TaskWaitingJoinedRow = TaskJoinedRow & WaitingTargetColumns;

/**
 * RECALL-00-C — the per-statement id chunk size for `getTasksByIds`, mirroring
 * `entities.getByIds`: D1 caps bound variables at 100 per statement and each
 * chunk binds the ids plus one `workspace_id`, so 90 keeps every statement well
 * within the limit while resolving a whole follow-up list in a fixed number of
 * reads (no N+1).
 */
const GET_TASKS_BY_IDS_CHUNK_SIZE = 90;

/** Split `items` into contiguous chunks of at most `size` (for bounded IN reads). */
function chunkTaskIds(items: readonly string[], size: number): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * A `getTasksByIds` row: the joined task columns plus the parent's title and the
 * project → goal → area hops, resolved by LEFT JOINs in the SAME statement so the
 * batch needs no per-task relationship reads.
 */
type TaskBatchJoinedRow = TaskWaitingJoinedRow & {
  readonly parent_title: string | null;
  readonly project_goal_id: string | null;
  readonly project_goal_title: string | null;
  readonly project_area_id: string | null;
  readonly project_area_title: string | null;
  readonly goal_area_id: string | null;
  readonly goal_area_title: string | null;
};

/**
 * Fold a batch row's joined columns into the SAME project/goal/area relationships
 * `#resolveRelationships` walks with per-hop reads: an area parent is the area;
 * a project parent contributes the project, its advanced Goal (whose own Area
 * wins) or otherwise its direct Area. A hop whose entity is deleted resolves to
 * null exactly as the per-hop `#resolveEntity` does — the link may still carry
 * the walk (a deleted Goal's Area still resolves, matching the sequential read).
 */
function batchRowRelationships(row: TaskBatchJoinedRow): {
  project: TaskRelation | null;
  goal: TaskRelation | null;
  area: TaskRelation | null;
} {
  if (row.parent_id === null || row.parent_link_type === null) {
    return { project: null, goal: null, area: null };
  }
  if (row.parent_link_type === TASK_BELONGS_TO_AREA) {
    return {
      project: null,
      goal: null,
      area:
        row.parent_title === null
          ? null
          : { kind: "area", id: row.parent_id, title: row.parent_title },
    };
  }
  const project: TaskRelation | null =
    row.parent_title === null
      ? null
      : { kind: "project", id: row.parent_id, title: row.parent_title };
  if (row.project_goal_id !== null) {
    return {
      project,
      goal:
        row.project_goal_title === null
          ? null
          : {
              kind: "goal",
              id: row.project_goal_id,
              title: row.project_goal_title,
            },
      area:
        row.goal_area_id === null || row.goal_area_title === null
          ? null
          : { kind: "area", id: row.goal_area_id, title: row.goal_area_title },
    };
  }
  return {
    project,
    goal: null,
    area:
      row.project_area_id === null || row.project_area_title === null
        ? null
        : {
            kind: "area",
            id: row.project_area_id,
            title: row.project_area_title,
          },
  };
}

/**
 * A joined task-list row: the detail/parent columns, with the waiting-target columns
 * OPTIONAL — `listTasks` selects them, the planning bands (which exclude waiting) do
 * not. `rowToTaskWaiting` returns null when `waiting_since` is null, so their absence
 * is safe.
 */
type TaskListRow = TaskJoinedRow & {
  readonly parent_title: string | null;
} & Partial<TaskParentIdentityColumns> &
  Partial<WaitingTargetColumns>;

/**
 * RECALL-01 — a task-list row plus the shared excerpt triple over
 * `task_details.description` and the checklist-hit probe, so the match source
 * can be resolved without a second read.
 */
type TaskSearchRow = TaskListRow & {
  readonly description_hit: number | null;
  readonly description_window: string | null;
  readonly description_window_start: number | null;
  readonly checklist_hit: number;
};

/** DEBT-144 — the parent identity columns, present on every task-LIST read. */
type TaskParentIdentityColumns = {
  readonly parent_icon_key: string | null;
  readonly parent_colour_slot: string | null;
  readonly parent_colour_rank: number | null;
};

type TaskParentLinkRow = {
  readonly task_id: string;
  readonly link_id: string | null;
  readonly parent_id: string | null;
  readonly parent_link_type: string | null;
};

type AnyLinkRow = {
  readonly id: string;
  readonly source_entity_id: string;
  readonly target_entity_id: string;
  readonly type: string;
  readonly deleted_at: string | null;
};

/**
 * Everything the ONE successor of a completed recurring occurrence is written from,
 * resolved before the batch so the write itself is pure SQL. `id`/`linkId` are
 * allocated up front so the caller can read the successor back after the commit.
 */
type SuccessorPlan = {
  readonly id: string;
  readonly linkId: string | null;
  readonly predecessorId: string;
  readonly rule: TaskRecurrenceRule;
  readonly series: TaskRecurrenceSeries;
  readonly scheduledDate: string | null;
  readonly dueDate: string | null;
  readonly title: string;
  readonly description: MarkdownSource | null;
  readonly priority: TaskPriority | null;
  readonly timeSector: TimeSector | null;
  readonly commitmentState: CommitmentState;
  readonly parent: {
    readonly kind: "area" | "project";
    readonly id: string;
  } | null;
  /**
   * TASKS-13 — the checklist STRUCTURE the successor inherits, with fresh ids and
   * every item RESET to unticked.
   *
   * Resolved before the batch (it needs one id per row, and SQL cannot mint them)
   * and written inside it, so the successor arrives with its steps or does not
   * arrive at all. Bounded by MAX_CHECKLIST_ITEMS, so the completion batch stays
   * a known size.
   */
  readonly checklist: readonly {
    readonly id: string;
    readonly title: string;
    readonly position: number;
  }[];
};

/** The row shape a successor-safety read needs from a candidate successor. */
type SuccessorRow = {
  readonly entity_id: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly completed_at: string | null;
  readonly sequence: number;
  readonly extra_links: number;
};

/**
 * The structural parent KIND behind a task's parent link type, or null when the task
 * is Unassigned (TASKS-04). The one place the link type is mapped back to a kind.
 */
function taskParentKindOf(linkType: string | null): "area" | "project" | null {
  if (linkType === TASK_BELONGS_TO_PROJECT) return "project";
  if (linkType === TASK_BELONGS_TO_AREA) return "area";
  return null;
}

/**
 * The safe-undo predicate. A successor may be withdrawn ONLY when it is still exactly
 * as completion created it: open, never edited (its `updated_at` still equals its
 * `created_at`) and carrying no relationship beyond the structural parent link it was
 * born with. Anything else is real work the owner has done since, so undo keeps it.
 */
function successorIsUntouched(row: SuccessorRow): boolean {
  return (
    row.completed_at === null &&
    row.updated_at === row.created_at &&
    row.extra_links === 0
  );
}

/**
 * TASKS-07 — everything a series-scoped date operation needs about one occurrence,
 * read once and validated once, so `moveTaskOccurrence` and `skipTaskOccurrence`
 * share exactly one set of preconditions.
 */
type OccurrenceMove = {
  readonly task: TaskView;
  readonly rule: TaskRecurrenceRule;
  readonly series: TaskRecurrenceSeries;
  /** Which Task date the rule advances. */
  readonly anchorKey: "scheduledDate" | "dueDate";
  /** This occurrence's own anchor date. */
  readonly anchorIso: string;
  /** The date the SERIES grid is stepped from (the anchor unless moved off it). */
  readonly gridAnchorIso: string;
  /** The non-anchor date, which keeps its distance from the anchor. */
  readonly otherIso: string | null;
};

/** The stored weekday set: a comma-separated ascending list, or NULL for "none". */
function serialiseWeekdays(weekdays: readonly number[]): string | null {
  return weekdays.length === 0 ? null : weekdays.join(",");
}

/** Structural equality of two recurrence rules (either may be absent). */
function recurrenceRulesEqual(
  a: TaskRecurrenceRule | null,
  b: TaskRecurrenceRule | null,
): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.frequency === b.frequency &&
    a.interval === b.interval &&
    a.dateKind === b.dateKind &&
    a.mode === b.mode &&
    a.anchorDay === b.anchorDay &&
    a.anchorMonth === b.anchorMonth &&
    // TASKS-12 — the advanced fields are part of the rule's IDENTITY. Leaving
    // them out would make "ends after 12" an idempotent no-op over "never ends".
    a.ordinal === b.ordinal &&
    a.weekendRule === b.weekendRule &&
    a.endsAfterCount === b.endsAfterCount &&
    a.endsOnDate === b.endsOnDate &&
    serialiseWeekdays(a.weekdays) === serialiseWeekdays(b.weekdays)
  );
}

/**
 * The Activity `changes` value for a recurrence edit: a compact, non-sensitive
 * descriptor of the RULE (never prose the user typed), so the shared Activity feed
 * can say what changed without a recurrence-specific event type.
 */
function describeRecurrence(rule: TaskRecurrenceRule | null): string | null {
  if (rule === null) return null;
  const weekdays = serialiseWeekdays(rule.weekdays);
  return [
    rule.dateKind,
    rule.frequency,
    `x${rule.interval}`,
    rule.mode === "after_completion" ? "after" : "",
    weekdays === null ? "" : `d${weekdays}`,
    rule.anchorDay === null ? "" : `m${rule.anchorDay}`,
    rule.anchorMonth === null ? "" : `y${rule.anchorMonth}`,
    // TASKS-12 — still calendar data and closed-set tokens only, never free text.
    rule.ordinal === null ? "" : `o${rule.ordinal}`,
    rule.weekendRule === "allow" ? "" : `w${rule.weekendRule}`,
    rule.endsAfterCount === null ? "" : `n${rule.endsAfterCount}`,
    rule.endsOnDate === null ? "" : `u${rule.endsOnDate}`,
  ]
    .filter((part) => part.length > 0)
    .join(":");
}

/**
 * Planning query band bounds (TODAY-04). Each band is fetched independently so the
 * planning view never loses commitments to backlog truncation. Scheduled work gets a
 * generous bound and is ordered scheduled-date ascending (overdue/today first, only
 * far-future upcoming ever truncated); the backlog and recent completions are
 * bounded modestly (calm daily surface, not a report).
 */
const PLANNING_SCHEDULED_LIMIT = 200;
const PLANNING_BACKLOG_LIMIT = 100;
const PLANNING_COMPLETED_LIMIT = 100;

/**
 * Default and hard-max bounded records returned PER BUCKET by the Matrix/Sectors
 * grouping query (ADR-043 §11). Generous enough that most buckets show in
 * full, but always bounded — an overflowing bucket is reached through the equivalent
 * filtered `all` view, which paginates that one bucket independently.
 */
const WORKSPACE_GROUP_BUCKET_LIMIT = 50;
const WORKSPACE_GROUP_BUCKET_MAX = 200;

/**
 * The maximum number of BUCKETS a grouped read returns.
 *
 * The closed dimensions have at most eight, but `parent` and `delegate` are
 * open-ended — one bucket per Project, Area or delegatee. Bounding rows per bucket
 * alone would let a large workspace return `buckets × 50` rows in a single
 * payload, which is precisely the unbounded read the collection contract forbids.
 * The largest buckets are kept, so what is dropped is the tail.
 */
const WORKSPACE_GROUP_MAX_BUCKETS = 24;

/** Default and hard-max results for the bounded task-parent title search (ADR-043 §9). */
/**
 * TASKS-13 — the most Tasks one checklist-progress read may cover.
 *
 * Generously above every page in the product (a Tasks page is at most 100 rows,
 * a grouped view at most 24 buckets of 50) and present so a caller cannot turn a
 * bounded aggregate into an unbounded one by handing it a whole workspace.
 */
const CHECKLIST_PROGRESS_MAX_TASKS = 1_500;

/**
 * How many Task ids one progress statement binds.
 *
 * **D1 accepts at most 100 bound parameters per query**, and the workspace id is
 * one of them — so a chunk of 100 is a hundred-and-one, and the statement fails.
 * MEASURED: it did, on a development workspace of 212 Tasks, and because Today
 * degrades a failed section rather than 500ing, the symptom was a day that said
 * "Nothing planned today" while the database held thirty-seven planned Tasks.
 *
 * Eighty leaves real headroom under the limit and still means a full 100-row
 * Tasks page costs two statements rather than a hundred. The statement count is
 * a function of the caller's PAGE SIZE — a constant per surface — never of how
 * many Tasks the workspace holds, which is the property `no N+1` actually asks
 * for.
 */
const CHECKLIST_ID_CHUNK = 80;

/**
 * TASKS-12 — the most Tasks one blocked-state read may cover, and how many ids
 * one statement binds.
 *
 * The same two numbers as checklist progress, for the same two reasons: the cap
 * stops a caller turning a bounded aggregate into an unbounded one, and the chunk
 * keeps every statement safely under D1's 100-bound-parameter ceiling (the
 * workspace id and the link type are two of them, so eighty ids is
 * eighty-two). The statement count is a function of the caller's PAGE, never of
 * the workspace's size.
 */
const BLOCKED_SUMMARY_MAX_TASKS = 1_500;
const DEPENDENCY_ID_CHUNK = 80;

/**
 * STEER-04 — how many Project ids one next-action statement may carry.
 *
 * The statement binds the workspace id twice, the owner's day, the week end and
 * the active scope's own handful of parameters beside these ids, so forty
 * leaves ample room under D1's 100-bound-parameter ceiling. A caller with more
 * Projects than this pays one more ROUND TRIP, never one query per Project.
 */
const NEXT_ACTION_PROJECT_CHUNK_SIZE = 40;

const TASK_PARENT_SEARCH_LIMIT = 25;
const TASK_PARENT_SEARCH_MAX = 50;

/**
 * V2.7 RECALL-03 — the ONE follow-up predicate (DEBT-231).
 *
 * `task_details.follow_up_on` is a wall-calendar `YYYY-MM-DD`, so the comparison
 * is a plain string comparison against the OWNER's calendar day — never a naïve
 * UTC date, and never a second timezone authority. The owner-day value arrives
 * already resolved (`ownerCalendarIso(now, preferences.timezone)`, ADR-022) and
 * reaches SQL as `todayExpr` — today always the `cal.today_iso` column, which
 * the collection query already CROSS JOINs for the due and planned states and
 * which the Waiting list and count join once for the same reason. So the
 * predicate costs NO bind of its own however many times it appears in one
 * statement, which is what makes the keyset resume affordable.
 *
 * `todayExpr` is TRUSTED, constant SQL chosen by this module — never caller data
 * — exactly like the grouping bucket expressions beside it. It is a parameter
 * rather than a constant so a future caller with a differently-named calendar
 * source cannot be tempted to write a second predicate.
 *
 * There is deliberately one definition. Today's attention fact, the daily
 * digest, the `/tasks` filter and the Waiting surface all resolve "a follow-up
 * is due" here, which is what makes their numbers comparable as machine values
 * rather than as two implementations that happen to agree today.
 */
function followUpStatePredicate(
  state: TaskFollowUpState,
  todayExpr: string,
): string {
  switch (state) {
    // The union of `overdue` and `due_today` — "who do I chase now?".
    case "due":
      return `(td.follow_up_on IS NOT NULL AND td.follow_up_on <= ${todayExpr})`;
    case "due_today":
      return `(td.follow_up_on IS NOT NULL AND td.follow_up_on = ${todayExpr})`;
    case "overdue":
      return `(td.follow_up_on IS NOT NULL AND td.follow_up_on < ${todayExpr})`;
    case "upcoming":
      return `(td.follow_up_on IS NOT NULL AND td.follow_up_on > ${todayExpr})`;
    case "none":
      return "td.follow_up_on IS NULL";
  }
}

/**
 * TASKS-03 — the bucket-key expression per grouping dimension. Trusted, constant
 * SQL keyed by an already-validated dimension; a caller supplies the dimension
 * NAME, never an expression.
 *
 * The derived buckets (`due_state`, `planned`) mirror the filter predicates above
 * exactly, so "group by due state, then filter to Overdue" always lands on the same
 * records the Overdue bucket counted.
 */
const WORKSPACE_GROUP_BUCKET_EXPR: Record<WorkspaceTaskGroupDimension, string> =
  {
    /*
     * CONTROL-01 — grouping by priority folds `null` into P4.
     *
     * It coalesced to a fifth bucket, `untriaged`, so a list grouped by priority
     * grew a "No priority" section holding tasks every row in it labels P4. Two
     * headings for one state, and the one the product does not have a name for
     * was the larger. `null` IS P4 (see the filter above); the grouping now says
     * the same thing the rows do.
     */
    priority: "COALESCE(td.priority, 'p4')",
    sector: "COALESCE(td.time_sector, '__none')",
    status:
      "CASE WHEN sr.completed_at IS NOT NULL THEN 'completed'" +
      " ELSE COALESCE(td.status, 'todo') END",
    due_state:
      "CASE WHEN td.due_date IS NULL THEN 'no_due_date'" +
      " WHEN sr.completed_at IS NULL AND td.due_date < cal.today_iso THEN 'overdue'" +
      " WHEN td.due_date < cal.today_iso THEN 'due_past'" +
      " WHEN td.due_date = cal.today_iso THEN 'due_today'" +
      " WHEN td.due_date <= cal.week_end THEN 'due_this_week'" +
      " ELSE 'due_later' END",
    planned:
      "CASE WHEN td.scheduled_date IS NULL THEN 'unplanned'" +
      " WHEN td.scheduled_date < cal.today_iso THEN 'planned_earlier'" +
      " WHEN td.scheduled_date = cal.today_iso THEN 'planned_today'" +
      " WHEN td.scheduled_date <= cal.week_end THEN 'planned_this_week'" +
      " ELSE 'planned_later' END",
    parent: "COALESCE(pl.target_entity_id, '__none')",
    delegate: "COALESCE(td.delegate_to, '__none')",
  };

/**
 * AUDIT-13 — a Task creation reduced to statements, so another D1 adapter in this
 * package can fuse it into ITS batch and make a compound domain operation ONE
 * transaction. Never leaves `app/platform/storage/d1`.
 */
export interface CreateTaskStatementPlan {
  /** The id the create will mint. Valid only if the batch commits. */
  readonly taskId: string;
  /** Whether a structural parent was requested (decides the zero-change error). */
  readonly hasParent: boolean;
  /** The statements, entity insert FIRST. Run them in this order, at the FRONT. */
  readonly statements: readonly D1PreparedStatement[];
}

/**
 * AUDIT-13 — what completing a Task means inside somebody else's batch.
 *
 * `statements` is empty for every outcome except `completed`: an already-closed or
 * missing Task needs no write, and saying so is what keeps the composing
 * operation's Activity payload honest.
 */
export interface TaskCompletionPlan {
  readonly outcome: "completed" | "already_closed" | "missing";
  readonly statements: readonly D1PreparedStatement[];
}

/**
 * TEST-ONLY deterministic failure injection points for `completeTask`'s atomic
 * batch, used to prove the WHOLE operation rolls back when any statement after the
 * completion write fails. Each value forces a failure immediately AFTER the named
 * statement; the D1 batch is one transaction, so nothing commits. Never set in
 * production.
 */
export type CompleteTaskFault =
  | "after-completion"
  | "after-completion-activity"
  | "after-waiting-update"
  | "after-waiting-cleared-activity"
  | "after-waiting-link";

/** Optional dependencies for the repository, injectable for deterministic tests. */
export interface D1TaskRepositoryOptions {
  /** Clock used for domain AND Activity timestamps (one call per mutation). */
  readonly clock?: Clock;
  /** Trusted actor context recorded on every Activity event. Defaults to `system`. */
  readonly actorContext?: ActivityActorContext;
  /** Id generator for Activity events. Defaults to a secure UUID generator. */
  readonly activityIdGenerator?: IdGenerator;
  /**
   * Id generator for the ENTITY + structural link ids minted by the atomic
   * `createTask` (the spine stays the identity authority; this is the same secure
   * generator it uses). Injectable for deterministic tests.
   */
  readonly idGenerator?: IdGenerator;
  /** TEST-ONLY: force `completeTask`'s batch to fail at a chosen point. */
  readonly completeFault?: CompleteTaskFault;
  /**
   * TEST-ONLY: force `createTask`'s single atomic batch to fail (a forced-error
   * statement appended at the end), to prove no entity/spine/link/details/Activity
   * survives the rollback. Never set in production.
   */
  readonly createTaskFault?: boolean;
  /**
   * TEST-ONLY: force `completeTasks`' single atomic batch to fail (a forced-error
   * statement appended at the end), to prove no task in the selection is left
   * completed when the batch rolls back. Never set in production.
   */
  readonly bulkCompleteFault?: boolean;
  /**
   * TEST-ONLY: force `reopenTask`'s single atomic batch to fail (a forced-error
   * statement appended at the end), to prove the reopen, the successor withdrawal and
   * the release of that successor's recurrence reservation commit together or not at
   * all. Never set in production.
   */
  readonly reopenFault?: boolean;
  /**
   * TEST-ONLY: invoked once inside a planning mutation AFTER the initial read (and
   * the open-state check) but BEFORE the guarded write, to simulate a concurrent
   * mutation — e.g. the task being completed — racing the plan. Lets a test prove
   * the in-write `completed_at IS NULL` guard rejects the race, not just the read.
   */
  readonly planRaceHook?: () => Promise<void>;
}

/** A resolved id → title lookup for a related entity, or null when unavailable. */
interface ResolvedEntity {
  readonly id: string;
  readonly title: string;
}

/** Structural equality for two delegation records (both may be null). */
function delegationEquals(
  a: TaskDelegation | null,
  b: TaskDelegation | null,
): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return (
    a.to === b.to &&
    (a.delegatedOn ?? null) === (b.delegatedOn ?? null) &&
    (a.followUpOn ?? null) === (b.followUpOn ?? null) &&
    (a.note ?? null) === (b.note ?? null)
  );
}

/**
 * The most days the workload trend will count in one call.
 *
 * Fourteen: Today asks for seven, and the bound exists so a caller cannot turn
 * one statement into a hundred `SUM(CASE ...)` columns. Beyond a fortnight the
 * question stops being "is my workload moving" and becomes reporting, which this
 * feature is explicitly scoped out of.
 */
const TASK_ACTIVITY_MAX_DAYS = 14;

/**
 * The most buckets one completion SERIES will count over (V2.9 INS-01).
 *
 * The largest of the history kernel's `GRAIN_MAXIMUMS` (366 days). Unlike
 * `TASK_ACTIVITY_MAX_DAYS` above — which is a real limit, imposed by D1's
 * 100-bound-variable ceiling on a column-per-window statement — this is a
 * policy: the `json_each` shape costs the same three bound parameters at any
 * bucket count, and this simply keeps the storage layer's own ceiling rather
 * than trusting a caller's.
 */
const MAX_COMPLETION_BUCKETS = MAX_HISTORY_BUCKETS;

export class D1TaskRepository implements TaskRepository {
  readonly #db: D1Database;
  readonly #workspaceId: string;
  readonly #clock: Clock;
  readonly #actor: ActivityActorContext;
  readonly #newActivityId: IdGenerator;
  readonly #newEntityId: IdGenerator;
  readonly #recorder: D1ActivityRecorder;
  readonly #completeFault?: CompleteTaskFault;
  readonly #bulkCompleteFault?: boolean;
  readonly #reopenFault?: boolean;
  readonly #createTaskFault?: boolean;
  readonly #planRaceHook?: () => Promise<void>;

  constructor(
    db: D1Database,
    context: WorkspaceContext,
    options: D1TaskRepositoryOptions = {},
  ) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
    this.#clock = options.clock ?? systemClock;
    this.#actor = options.actorContext ?? createSystemActorContext();
    this.#newActivityId =
      options.activityIdGenerator ?? activitySecureIdGenerator;
    this.#newEntityId = options.idGenerator ?? secureIdGenerator;
    this.#recorder = new D1ActivityRecorder(db);
    this.#completeFault = options.completeFault;
    this.#bulkCompleteFault = options.bulkCompleteFault;
    this.#reopenFault = options.reopenFault;
    this.#createTaskFault = options.createTaskFault;
    this.#planRaceHook = options.planRaceHook;
  }

  /* ---------------------------------------------------------------------- */
  /* Atomic create (identity + planning slice in ONE batch) — ADR-043 §13     */
  /* ---------------------------------------------------------------------- */

  async createTask(input: NewTaskInput): Promise<TaskView> {
    const plan = this.buildCreateTaskStatements(input);
    const statements = [...plan.statements];
    // TEST-ONLY: prove the WHOLE create rolls back — no entity/spine/link/details/
    // Activity survives — when a statement fails mid-batch.
    if (this.#createTaskFault) {
      statements.push(this.#forcedFailure());
    }

    let results: D1Result<EntityRow>[];
    try {
      results = await this.#db.batch<EntityRow>(statements);
    } catch (cause) {
      if (cause instanceof ActivityError) {
        throw cause;
      }
      throw new TaskStorageError(undefined, { cause });
    }

    this.interpretCreateTaskResults(plan, results);

    const view = await this.getTask(plan.taskId);
    if (!view) {
      throw new TaskStorageError();
    }
    return view;
  }

  /**
   * AUDIT-13 — the create's statements, without running them.
   *
   * An INTERNAL adapter seam (not on the `TaskRepository` port), in the same
   * spirit as `D1ActivityRecorder`: it hands back prepared statements, never a
   * write, so a caller cannot use it to reconstruct a multi-transaction sequence.
   * Its one purpose is to let another D1 adapter in this package fuse a Task
   * creation into ITS batch — the meeting item → Task conversion — so the whole
   * user-visible operation is one D1 transaction rather than a saga with a
   * compensating delete. Task SQL stays here; only its assembly moves.
   *
   * The entity insert is ALWAYS statement 0 of the returned array, which is what
   * `interpretCreateTaskResults` relies on; a composing caller must therefore put
   * these statements FIRST in its batch and pass the batch results straight back.
   */
  buildCreateTaskStatements(
    input: NewTaskInput,
    options: {
      /**
       * AUDIT-13 — the composing operation's OWN precondition, re-asserted inside
       * the batch. A zero-row entity insert then declines the whole create, and
       * everything gated on that entity declines with it.
       */
      readonly guard?: {
        readonly sql: string;
        readonly params: readonly unknown[];
      };
    } = {},
  ): CreateTaskStatementPlan {
    const title = validateSpineTitle(input.title);
    const parent =
      input.parent === null || input.parent === undefined ? null : input.parent;
    if (
      parent !== null &&
      parent.kind !== "area" &&
      parent.kind !== "project"
    ) {
      throw new SpineInvalidParentKindError();
    }
    const parentKind = parent?.kind ?? null;
    const parentId = parent ? validateTaskId(parent.id) : null;
    const linkType =
      parentKind === null ? null : spineLinkTypeFor(TASK, parentKind);
    if (parentKind !== null && linkType === null) {
      throw new SpineInvalidParentKindError();
    }

    // Validate + normalise the OPTIONAL planning fields at the boundary.
    const priority =
      input.priority === undefined
        ? null
        : validateTaskPriority(input.priority);
    const timeSector =
      input.timeSector === undefined
        ? null
        : validateTimeSector(input.timeSector);
    const commitmentState =
      input.commitmentState === undefined
        ? "active"
        : validateCommitmentState(input.commitmentState);
    const dueDate = validateTaskDate(input.dueDate ?? null, "dueDate");
    const scheduledDate = validateTaskDate(
      input.scheduledDate ?? null,
      "scheduledDate",
    );
    // AUDIT-13: status and description are part of the create, not a follow-up
    // write. Both are validated here, so an invalid value fails BEFORE the batch.
    const status =
      input.status === undefined ? "todo" : validateTaskStatus(input.status);
    const description =
      input.description === undefined || input.description === null
        ? null
        : validateTaskDescription(input.description);
    // V2.6 FIND-03: tags too, through the ONE tag validator, so a Task created
    // from a `#tag` capture can never carry a tag a Person could not.
    const tags = input.tags === undefined ? [] : validateTaskTagSet(input.tags);
    // TASKS-04: an optional recurrence rule is validated against the dates being
    // created in this very batch, so a captured "every Monday" either commits WITH
    // its rule or not at all — never a repeating task that silently forgot to repeat.
    const recurrence =
      input.recurrence === undefined || input.recurrence === null
        ? null
        : resolveTaskRecurrenceRule(
            input.recurrence,
            input.recurrence.dateKind === "due" ? dueDate : scheduledDate,
          );

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const id = this.#newEntityId();
    const linkId = parentId === null ? null : this.#newEntityId();

    // Identity: assigned tasks still use the shared parent-gated spine builder.
    // Unassigned Tasks are a TASKS-04 exception: they are valid spine records with
    // no structural EntityLink, not damaged children of a hidden parent.
    const entityStmt =
      parentKind === null || parentId === null
        ? this.#createUnassignedTaskEntityStatement(
            id,
            title,
            nowTs,
            options.guard,
          )
        : buildSpineChildEntityInsertStatement(this.#db, this.#workspaceId, {
            id,
            kind: TASK,
            title,
            parentKind,
            parentId,
            nowTs,
            ...(options.guard ? { guard: options.guard } : {}),
          });
    const spineStmt = buildSpineChildRecordInsertStatement(
      this.#db,
      this.#workspaceId,
      { id, kind: TASK },
    );
    const linkStmt =
      parentKind !== null && parentId !== null && linkId !== null && linkType
        ? buildSpineChildLinkInsertStatement(this.#db, this.#workspaceId, {
            linkId,
            sourceEntityId: id,
            targetEntityId: parentId,
            parentKind,
            linkType,
            nowTs,
          })
        : null;

    // The two create events, each guarded (via the recorder's `changes() > 0`
    // predicate) on the insert IMMEDIATELY before it in the batch.
    const entityModel = buildActivityWriteModel(
      spineEntityCreatedEvent(id, TASK, title),
      this.#actor.actor,
      this.#newActivityId(),
      now,
    );
    const [entityActivity, ...entitySubjects] =
      this.#recorder.buildAppendStatements(this.#workspaceId, entityModel);
    const linkStatements =
      linkId !== null && parentId !== null && linkType !== null
        ? this.#recorder.buildAppendStatements(
            this.#workspaceId,
            buildActivityWriteModel(
              spineLinkCreatedEvent(linkId, id, parentId, linkType),
              this.#actor.actor,
              this.#newActivityId(),
              now,
            ),
          )
        : [];

    // The additive planning slice — written in the SAME batch, ONLY when a planning
    // field is supplied (otherwise the task reads documented defaults with no row),
    // gated on the just-created entity so it cannot outlive a rolled-back create.
    const writeDetails =
      priority !== null ||
      timeSector !== null ||
      commitmentState !== "active" ||
      dueDate !== null ||
      scheduledDate !== null ||
      status !== "todo" ||
      description !== null;

    const statements: D1PreparedStatement[] = [
      entityStmt,
      entityActivity!,
      ...entitySubjects,
      spineStmt,
    ];
    if (linkStmt) statements.push(linkStmt, ...linkStatements);
    if (writeDetails) {
      statements.push(
        this.#createDetailsStatement(
          id,
          {
            priority,
            dueDate,
            scheduledDate,
            timeSector,
            commitmentState,
            status,
            description,
          },
          nowTs,
        ),
      );
    }
    if (recurrence) {
      // A brand-new recurring task STARTS a series: its own id is the series id and
      // it is occurrence 0. Gated on the entity insert so it cannot outlive a
      // rolled-back create.
      statements.push(
        this.#insertRecurrenceStatement(
          id,
          recurrence,
          { seriesId: id, sequence: 0, scheduleAnchorDate: null },
          nowTs,
        ),
      );
    }
    /*
     * V2.6 FIND-03 — the Task's tags, written in the SAME create batch.
     *
     * Guarded on the entity-created Activity event, which is itself guarded on
     * the entity insert, so a rolled-back create leaves no tag rows behind and a
     * captured `#errand` either commits WITH its Task or not at all.
     */
    if (tags.length > 0) {
      statements.push(
        ...buildEntityTagStatements({
          db: this.#db,
          workspaceId: this.#workspaceId,
          entityId: id,
          tags,
          now: nowTs,
          activityId: entityModel.id,
        }),
      );
    }
    return { taskId: id, hasParent: parentKind !== null, statements };
  }

  /**
   * Read a create batch's results and raise the same typed errors `createTask`
   * always raised. Shared with the composing caller so one create means one set of
   * failure semantics, wherever the batch was assembled.
   */
  interpretCreateTaskResults(
    plan: CreateTaskStatementPlan,
    results: readonly D1Result[],
  ): void {
    // The entity insert is index 0. For assigned Tasks a zero-change result means
    // the parent was missing/deleted/wrong-kind/archived/cross-workspace; for
    // Unassigned Tasks it would indicate an id collision or storage corruption.
    const entityResult = results[0];
    const entityRow = (entityResult?.results ?? [])[0];
    if ((entityResult?.meta?.changes ?? 0) === 0 || !entityRow) {
      if (plan.hasParent) throw new SpineParentUnavailableError();
      throw new TaskStorageError();
    }
  }

  #createUnassignedTaskEntityStatement(
    id: string,
    title: string,
    nowTs: string,
    /** AUDIT-13 — see `buildCreateTaskStatements`. Absent for an ordinary create. */
    guard?: { readonly sql: string; readonly params: readonly unknown[] },
  ): D1PreparedStatement {
    // An unassigned Task has no parent to gate on, so without a guard this is an
    // unconditional VALUES insert. With one it becomes conditional, and the
    // `RETURNING`/`changes()` contract the rest of the batch depends on still
    // holds: zero rows means the create declined.
    return this.#db
      .prepare(
        guard
          ? `INSERT INTO entities
               (id, workspace_id, type, title, created_at, updated_at, deleted_at)
             SELECT ?, ?, '${TASK}', ?, ?, ?, NULL
             WHERE ${guard.sql}
             RETURNING ${ENTITY_RETURNING}`
          : `INSERT INTO entities
               (id, workspace_id, type, title, created_at, updated_at, deleted_at)
             VALUES (?, ?, '${TASK}', ?, ?, ?, NULL)
             RETURNING ${ENTITY_RETURNING}`,
      )
      .bind(
        id,
        this.#workspaceId,
        title,
        nowTs,
        nowTs,
        ...(guard?.params ?? []),
      );
  }

  async setTaskParent(
    id: string,
    parent: SetTaskParentInput,
  ): Promise<SetTaskParentResult> {
    const taskId = validateTaskId(id);
    const target =
      parent === null
        ? null
        : { kind: parent.kind, id: validateTaskId(parent.id) };
    if (
      target !== null &&
      target.kind !== "area" &&
      target.kind !== "project"
    ) {
      throw new SpineInvalidParentKindError();
    }

    const current = await this.#readCurrentTaskParentLink(taskId);
    if (!current) throw new TaskNotFoundError();

    const targetLinkType =
      target === null ? null : spineLinkTypeFor(TASK, target.kind);
    if (target !== null && targetLinkType === null) {
      throw new SpineInvalidParentKindError();
    }
    if (
      target !== null &&
      current.parent_id === target.id &&
      current.parent_link_type === targetLinkType
    ) {
      const task = await this.getTask(taskId);
      if (!task) throw new TaskNotFoundError();
      return { task, changed: false };
    }
    if (target === null && current.link_id === null) {
      const task = await this.getTask(taskId);
      if (!task) throw new TaskNotFoundError();
      return { task, changed: false };
    }

    if (target !== null) {
      const candidate = await this.getTaskParentCandidate(target.id);
      if (!candidate || candidate.kind !== target.kind) {
        throw new SpineParentUnavailableError();
      }
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const statements: D1PreparedStatement[] = [
      this.#bumpTaskUpdatedAtStatement(taskId, nowTs),
    ];

    if (
      current.link_id !== null &&
      current.parent_id !== null &&
      current.parent_link_type !== null
    ) {
      const unlinkIdentity: AnyLinkRow = {
        id: current.link_id,
        source_entity_id: taskId,
        target_entity_id: current.parent_id,
        type: current.parent_link_type,
        deleted_at: null,
      };
      statements.push(
        this.#unlinkTaskParentStatement(current.link_id, nowTs),
        ...this.#linkActivityStatements(LINK_UNLINKED, unlinkIdentity, now),
      );
    }

    if (target !== null && targetLinkType !== null) {
      const existing = await this.#findTaskParentLink(
        taskId,
        target.id,
        targetLinkType,
      );
      const linkIdentity: AnyLinkRow = existing ?? {
        id: this.#newEntityId(),
        source_entity_id: taskId,
        target_entity_id: target.id,
        type: targetLinkType,
        deleted_at: null,
      };
      statements.push(
        existing
          ? this.#restoreTaskParentStatement(existing.id, target, nowTs)
          : this.#insertTaskParentStatement(
              linkIdentity.id,
              taskId,
              target,
              targetLinkType,
              nowTs,
            ),
        ...this.#linkActivityStatements(
          existing ? LINK_RESTORED : LINK_CREATED,
          linkIdentity,
          now,
        ),
      );
    }

    try {
      await this.#db.batch(statements);
    } catch (cause) {
      throw new TaskStorageError(undefined, { cause });
    }

    const task = await this.getTask(taskId);
    if (!task) throw new TaskNotFoundError();
    return { task, changed: true };
  }

  async #readCurrentTaskParentLink(
    taskId: string,
  ): Promise<TaskParentLinkRow | null> {
    return await this.#db
      .prepare(
        `SELECT e.id AS task_id,
                pl.id AS link_id,
                pl.target_entity_id AS parent_id,
                pl.type AS parent_link_type
         FROM entities e
         JOIN spine_records sr
           ON sr.workspace_id = e.workspace_id AND sr.entity_id = e.id
          AND sr.kind = '${TASK}'
         LEFT JOIN entity_links pl
           ON pl.workspace_id = e.workspace_id
          AND pl.source_entity_id = e.id
          AND pl.type IN (${TASK_PARENT_LINK_LIST})
          AND pl.deleted_at IS NULL
         WHERE e.workspace_id = ?
           AND e.id = ?
           AND e.type = '${TASK}'
           AND e.deleted_at IS NULL
         LIMIT 1`,
      )
      .bind(this.#workspaceId, taskId)
      .first<TaskParentLinkRow>();
  }

  async #findTaskParentLink(
    taskId: string,
    parentId: string,
    linkType: string,
  ): Promise<AnyLinkRow | null> {
    return await this.#db
      .prepare(
        `SELECT id, source_entity_id, target_entity_id, type, deleted_at
         FROM entity_links
         WHERE workspace_id = ?
           AND source_entity_id = ?
           AND target_entity_id = ?
           AND type = ?
         LIMIT 1`,
      )
      .bind(this.#workspaceId, taskId, parentId, linkType)
      .first<AnyLinkRow>();
  }

  #bumpTaskUpdatedAtStatement(
    taskId: string,
    nowTs: string,
  ): D1PreparedStatement {
    return this.#db
      .prepare(
        `UPDATE entities SET updated_at = ?
         WHERE workspace_id = ? AND id = ? AND type = '${TASK}' AND deleted_at IS NULL`,
      )
      .bind(nowTs, this.#workspaceId, taskId);
  }

  #unlinkTaskParentStatement(
    linkId: string,
    nowTs: string,
  ): D1PreparedStatement {
    return this.#db
      .prepare(
        `UPDATE entity_links
         SET deleted_at = ?, updated_at = ?
         WHERE workspace_id = ?
           AND id = ?
           AND deleted_at IS NULL
           AND type IN (${TASK_PARENT_LINK_LIST})
           AND EXISTS (
                 SELECT 1 FROM entities
                 WHERE workspace_id = ? AND id = source_entity_id
                   AND type = '${TASK}' AND deleted_at IS NULL
               )`,
      )
      .bind(nowTs, nowTs, this.#workspaceId, linkId, this.#workspaceId);
  }

  #insertTaskParentStatement(
    linkId: string,
    taskId: string,
    parent: { readonly kind: "area" | "project"; readonly id: string },
    linkType: string,
    nowTs: string,
  ): D1PreparedStatement {
    return this.#db
      .prepare(
        `INSERT INTO entity_links
           (id, workspace_id, source_entity_id, target_entity_id, type,
            created_at, updated_at, deleted_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, NULL
         WHERE EXISTS (
                 SELECT 1 FROM entities
                 WHERE workspace_id = ? AND id = ? AND type = '${TASK}'
                   AND deleted_at IS NULL
               )
           AND EXISTS (
                 SELECT 1
                 FROM entities target
                 LEFT JOIN project_details pd
                   ON pd.workspace_id = target.workspace_id
                  AND pd.entity_id = target.id
                 WHERE target.workspace_id = ?
                   AND target.id = ?
                   AND target.type = ?
                   AND target.deleted_at IS NULL
                   AND (target.type <> '${PROJECT}' OR pd.archived_at IS NULL)
               )`,
      )
      .bind(
        linkId,
        this.#workspaceId,
        taskId,
        parent.id,
        linkType,
        nowTs,
        nowTs,
        this.#workspaceId,
        taskId,
        this.#workspaceId,
        parent.id,
        parent.kind,
      );
  }

  #restoreTaskParentStatement(
    linkId: string,
    parent: { readonly kind: "area" | "project"; readonly id: string },
    nowTs: string,
  ): D1PreparedStatement {
    return this.#db
      .prepare(
        `UPDATE entity_links
         SET deleted_at = NULL, updated_at = ?
         WHERE workspace_id = ?
           AND id = ?
           AND deleted_at IS NOT NULL
           AND EXISTS (
                 SELECT 1
                 FROM entities target
                 LEFT JOIN project_details pd
                   ON pd.workspace_id = target.workspace_id
                  AND pd.entity_id = target.id
                 WHERE target.workspace_id = ?
                   AND target.id = ?
                   AND target.type = ?
                   AND target.deleted_at IS NULL
                   AND (target.type <> '${PROJECT}' OR pd.archived_at IS NULL)
               )`,
      )
      .bind(
        nowTs,
        this.#workspaceId,
        linkId,
        this.#workspaceId,
        parent.id,
        parent.kind,
      );
  }

  /* ---------------------------------------------------------------------- */
  /* Recurrence (TASKS-04 / ADR-062)                                         */
  /* ---------------------------------------------------------------------- */

  /**
   * Set, change or remove a Task's recurrence rule — see the
   * `TaskRepository.setTaskRecurrence` contract. ONE batch writes the rule row (or
   * removes it), bumps `entities.updated_at` and appends the single guarded
   * `entity.updated` event, so a stored rule and its audit entry can never diverge.
   */
  async setTaskRecurrence(
    id: string,
    recurrence: SetTaskRecurrenceInput,
  ): Promise<SetTaskRecurrenceResult> {
    const entityId = validateTaskId(id);
    const current = await this.getTask(entityId);
    if (!current) throw new TaskNotFoundError();
    await this.#rejectIfParentProjectArchived(current);

    // Validated against THIS task's anchor date, so a rule that could never compute
    // a successor is refused at the boundary rather than stored and found later.
    const rule =
      recurrence === null
        ? null
        : resolveTaskRecurrenceRule(
            recurrence,
            recurrence.dateKind === "due"
              ? current.dueDate
              : current.scheduledDate,
          );

    const before = current.recurrence ?? null;
    if (recurrenceRulesEqual(before, rule)) {
      return { task: current, changed: false };
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    // An occurrence already inside a series keeps its identity when the rule is
    // edited; a first rule starts a series anchored on the task's own id.
    const series = current.recurrenceSeries ?? {
      seriesId: entityId,
      sequence: 0,
      scheduleAnchorDate: null,
    };

    const entityStmt = this.#bumpTaskUpdatedAtReturningStatement(
      entityId,
      nowTs,
    );
    const activity = this.#recorder.buildAppendStatements(
      this.#workspaceId,
      buildActivityWriteModel(
        {
          type: ENTITY_UPDATED,
          subjects: [{ entityId, role: SUBJECT_ROLE }],
          payload: {
            entityType: TASK,
            changes: {
              recurrence: {
                before: describeRecurrence(before),
                after: describeRecurrence(rule),
              },
            },
          },
        },
        this.#actor.actor,
        this.#newActivityId(),
        now,
      ),
    );

    const statements: D1PreparedStatement[] = [entityStmt, ...activity];
    statements.push(
      rule === null
        ? this.#deleteRecurrenceStatement(entityId)
        : this.#insertRecurrenceStatement(entityId, rule, series, nowTs),
    );

    let results: D1Result<EntityRow>[];
    try {
      results = await this.#db.batch<EntityRow>(statements);
    } catch (cause) {
      if (cause instanceof ActivityError) throw cause;
      throw new TaskStorageError(undefined, { cause });
    }
    if (((results[0]?.results ?? []).length ?? 0) === 0) {
      // The guarded bump matched nothing: the task was deleted between the read and
      // the write, so nothing was written or recorded.
      throw new TaskNotFoundError();
    }

    const task = await this.getTask(entityId);
    if (!task) throw new TaskNotFoundError();
    return { task, changed: true };
  }

  /**
   * Upsert one recurrence row, gated on the Task existing (so it can never outlive a
   * rolled-back create) and on the series identity supplied by the caller. The
   * UNIQUE (workspace, series, sequence) index is the database boundary that makes a
   * duplicate successor impossible.
   */
  #insertRecurrenceStatement(
    entityId: string,
    rule: TaskRecurrenceRule,
    series: TaskRecurrenceSeries,
    nowTs: string,
    seriesAnchorDate: string | null = null,
  ): D1PreparedStatement {
    return this.#db
      .prepare(
        `INSERT INTO task_recurrence_rules
           (workspace_id, entity_id, entity_type, date_kind, frequency, interval,
            weekdays, anchor_day, anchor_month, mode, series_anchor_date,
            ordinal, weekend_rule, ends_after_count, ends_on_date,
            series_id, sequence, created_at, updated_at)
         SELECT ?, ?, '${TASK}', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE EXISTS (
                 SELECT 1 FROM entities
                 WHERE workspace_id = ? AND id = ? AND type = '${TASK}'
                   AND deleted_at IS NULL
               )
         ON CONFLICT (workspace_id, entity_id) DO UPDATE SET
           date_kind = excluded.date_kind,
           frequency = excluded.frequency,
           interval = excluded.interval,
           weekdays = excluded.weekdays,
           anchor_day = excluded.anchor_day,
           anchor_month = excluded.anchor_month,
           mode = excluded.mode,
           series_anchor_date = excluded.series_anchor_date,
           ordinal = excluded.ordinal,
           weekend_rule = excluded.weekend_rule,
           ends_after_count = excluded.ends_after_count,
           ends_on_date = excluded.ends_on_date,
           updated_at = excluded.updated_at`,
      )
      .bind(
        this.#workspaceId,
        entityId,
        rule.dateKind,
        rule.frequency,
        rule.interval,
        serialiseWeekdays(rule.weekdays),
        rule.anchorDay,
        rule.anchorMonth,
        rule.mode,
        seriesAnchorDate,
        // TASKS-12 — the four advanced columns. Written from the VALIDATED rule,
        // so a value outside the closed set never reaches a column SQLite cannot
        // constrain (migration 0047 explains why the CHECK lives here).
        rule.ordinal,
        rule.weekendRule,
        rule.endsAfterCount,
        rule.endsOnDate,
        series.seriesId,
        series.sequence,
        nowTs,
        nowTs,
        this.#workspaceId,
        entityId,
      );
  }

  /**
   * Remove a Task's recurrence row. Recurrence is per-occurrence CONFIGURATION, not
   * history: the audit trail of the change is the `entity.updated` event written in
   * the same batch, and a COMPLETED occurrence keeps its row untouched (nothing here
   * ever reaches another occurrence of the series).
   */
  #deleteRecurrenceStatement(entityId: string): D1PreparedStatement {
    return this.#db
      .prepare(
        `DELETE FROM task_recurrence_rules
         WHERE workspace_id = ? AND entity_id = ?`,
      )
      .bind(this.#workspaceId, entityId);
  }

  /** The guarded `entities.updated_at` bump, RETURNING the row so the batch can prove it applied. */
  #bumpTaskUpdatedAtReturningStatement(
    taskId: string,
    nowTs: string,
  ): D1PreparedStatement {
    return this.#db
      .prepare(
        `UPDATE entities SET updated_at = ?
         WHERE workspace_id = ? AND id = ? AND type = '${TASK}' AND deleted_at IS NULL
         RETURNING ${ENTITY_RETURNING}`,
      )
      .bind(nowTs, this.#workspaceId, taskId);
  }

  #linkActivityStatements(
    type: string,
    link: AnyLinkRow,
    occurredAt: Date,
  ): D1PreparedStatement[] {
    return this.#recorder.buildAppendStatements(
      this.#workspaceId,
      buildActivityWriteModel(
        {
          type,
          subjects: [
            { entityId: link.source_entity_id, role: ROLE_SOURCE },
            { entityId: link.target_entity_id, role: ROLE_TARGET },
          ],
          payload: {
            linkId: link.id,
            linkType: link.type,
            sourceEntityId: link.source_entity_id,
            targetEntityId: link.target_entity_id,
          },
        },
        this.#actor.actor,
        this.#newActivityId(),
        occurredAt,
      ),
    );
  }

  /**
   * The `task_details` insert for an atomic create: write the initial planning slice
   * for the just-created task, gated on the entity existing (so it commits only with
   * the create). Delegation is never set at creation. The column literals are trusted.
   */
  #createDetailsStatement(
    entityId: string,
    fields: {
      readonly priority: string | null;
      readonly dueDate: string | null;
      readonly scheduledDate: string | null;
      readonly timeSector: string | null;
      readonly commitmentState: string;
      readonly status: string;
      readonly description: string | null;
    },
    nowTs: string,
  ): D1PreparedStatement {
    return this.#db
      .prepare(
        `INSERT INTO task_details
           (workspace_id, entity_id, entity_type, status, priority,
            due_date, scheduled_date, time_sector, commitment_state,
            delegate_to, delegated_on, follow_up_on, delegate_note,
            description, updated_at)
         SELECT ?, ?, '${TASK}', ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?
         WHERE EXISTS (
                 SELECT 1 FROM entities
                 WHERE workspace_id = ? AND id = ? AND type = '${TASK}'
                   AND deleted_at IS NULL
               )`,
      )
      .bind(
        this.#workspaceId,
        entityId,
        fields.status,
        fields.priority,
        fields.dueDate,
        fields.scheduledDate,
        fields.timeSector,
        fields.commitmentState,
        fields.description === null ? null : String(fields.description),
        nowTs,
        this.#workspaceId,
        entityId,
      );
  }

  /* ---------------------------------------------------------------------- */
  /* Reads                                                                  */
  /* ---------------------------------------------------------------------- */

  async getTask(
    id: string,
    options: GetTaskOptions = {},
  ): Promise<TaskView | null> {
    const entityId = validateTaskId(id);
    const row = await this.#readJoined(
      entityId,
      options.includeDeleted ?? false,
    );
    if (!row) {
      return null;
    }
    const relationships = await this.#resolveRelationships(row);
    return this.#toView(row, rowToTaskDetails(row), relationships);
  }

  async getTasksByIds(
    ids: readonly string[],
    options: GetTaskOptions = {},
  ): Promise<Map<string, TaskView>> {
    const resolved = new Map<string, TaskView>();
    if (ids.length === 0) {
      return resolved;
    }

    // De-duplicate and validate up front, exactly as `entities.getByIds` does —
    // one bad id is a clean rejection, never a silent partial read.
    const unique = [...new Set(ids)].map((id) => validateTaskId(id));
    const deletedClause = options.includeDeleted
      ? ""
      : " AND e.deleted_at IS NULL";

    // A FIXED number of chunked `IN (…)` reads (one per ≤90 ids, `1 + n` binds
    // each — inside D1's 100-bind cap), run concurrently — never one `getTask`
    // per id. The project → goal → area chain `#resolveRelationships` walks with
    // per-hop reads is resolved by LEFT JOINs INSIDE the same statement, so the
    // whole batch stays at `ceil(n/chunk)` statements while every view carries
    // the same relationships `getTask` returns. Workspace-scoped in SQL, so a
    // cross-workspace id simply never matches.
    const chunks = chunkTaskIds(unique, GET_TASKS_BY_IDS_CHUNK_SIZE);
    const results = await Promise.all(
      chunks.map((idChunk) => {
        const placeholders = idChunk.map(() => "?").join(", ");
        return this.#run(
          this.#db
            .prepare(
              `SELECT ${TASK_DETAIL_COLUMNS},
                      ${WAITING_TARGET_COLUMNS},
                      pl.target_entity_id AS parent_id,
                      pl.type AS parent_link_type,
                      pe.title AS parent_title,
                      pgl.target_entity_id AS project_goal_id,
                      pge.title AS project_goal_title,
                      pal.target_entity_id AS project_area_id,
                      pae.title AS project_area_title,
                      gal.target_entity_id AS goal_area_id,
                      gae.title AS goal_area_title
               FROM entities e
               JOIN spine_records sr
                 ON sr.workspace_id = e.workspace_id AND sr.entity_id = e.id
               LEFT JOIN task_details td
                 ON td.workspace_id = e.workspace_id AND td.entity_id = e.id
               ${TASK_RECURRENCE_JOIN}
               LEFT JOIN entity_links pl
                 ON pl.workspace_id = e.workspace_id AND pl.source_entity_id = e.id
                    AND pl.deleted_at IS NULL AND pl.type IN (${TASK_PARENT_LINK_LIST})
               LEFT JOIN entities pe
                 ON pe.workspace_id = e.workspace_id AND pe.id = pl.target_entity_id
                    AND pe.deleted_at IS NULL
               LEFT JOIN entity_links pgl
                 ON pl.type = '${TASK_BELONGS_TO_PROJECT}'
                    AND pgl.workspace_id = e.workspace_id
                    AND pgl.source_entity_id = pl.target_entity_id
                    AND pgl.deleted_at IS NULL AND pgl.type = '${PROJECT_ADVANCES_GOAL}'
               LEFT JOIN entities pge
                 ON pge.workspace_id = e.workspace_id AND pge.id = pgl.target_entity_id
                    AND pge.deleted_at IS NULL
               LEFT JOIN entity_links pal
                 ON pl.type = '${TASK_BELONGS_TO_PROJECT}'
                    AND pal.workspace_id = e.workspace_id
                    AND pal.source_entity_id = pl.target_entity_id
                    AND pal.deleted_at IS NULL AND pal.type = '${PROJECT_BELONGS_TO_AREA}'
               LEFT JOIN entities pae
                 ON pae.workspace_id = e.workspace_id AND pae.id = pal.target_entity_id
                    AND pae.deleted_at IS NULL
               LEFT JOIN entity_links gal
                 ON gal.workspace_id = e.workspace_id
                    AND gal.source_entity_id = pgl.target_entity_id
                    AND gal.deleted_at IS NULL AND gal.type = '${GOAL_BELONGS_TO_AREA}'
               LEFT JOIN entities gae
                 ON gae.workspace_id = e.workspace_id AND gae.id = gal.target_entity_id
                    AND gae.deleted_at IS NULL
               ${WAITING_TARGET_JOIN}
               WHERE e.workspace_id = ? AND e.type = '${TASK}'${deletedClause}
                 AND e.id IN (${placeholders})`,
            )
            .bind(this.#workspaceId, ...idChunk),
        );
      }),
    );

    for (const result of results) {
      for (const raw of result.results ?? []) {
        const row = raw as TaskBatchJoinedRow;
        // Keep the FIRST row per task (matching `#readJoined`'s `rows[0]`): a
        // task can only carry one active structural parent, so extra rows would
        // mean corrupt links, and first-wins keeps the read deterministic.
        if (resolved.has(row.id)) continue;
        resolved.set(
          row.id,
          this.#toView(row, rowToTaskDetails(row), batchRowRelationships(row)),
        );
      }
    }
    return resolved;
  }

  async listTasks(input: ListTasksInput = {}): Promise<TaskListPage> {
    const limit = validateTaskLimit(input.limit);
    const includeCompleted = input.includeCompleted ?? false;
    const excludeWaiting = input.excludeWaiting ?? false;

    const completedClause = includeCompleted
      ? ""
      : " AND sr.completed_at IS NULL";
    const waitingClause = excludeWaiting ? " AND td.waiting_since IS NULL" : "";
    const statement = this.#db
      .prepare(
        `WITH ${TASK_PARENT_IDENTITY_CTE}
         SELECT ${TASK_DETAIL_COLUMNS},
                ${WAITING_TARGET_COLUMNS},
                pl.target_entity_id AS parent_id,
                pl.type AS parent_link_type,
                pe.title AS parent_title,
                ${TASK_PARENT_IDENTITY_COLUMNS}
         FROM entities e
         JOIN spine_records sr
           ON sr.workspace_id = e.workspace_id AND sr.entity_id = e.id
         LEFT JOIN task_details td
           ON td.workspace_id = e.workspace_id AND td.entity_id = e.id
         ${TASK_RECURRENCE_JOIN}
         LEFT JOIN entity_links pl
           ON pl.workspace_id = e.workspace_id AND pl.source_entity_id = e.id
              AND pl.deleted_at IS NULL AND pl.type IN (${TASK_PARENT_LINK_LIST})
         LEFT JOIN entities pe
           ON pe.workspace_id = e.workspace_id AND pe.id = pl.target_entity_id
              AND pe.deleted_at IS NULL
         ${TASK_PARENT_IDENTITY_JOIN}
         ${WAITING_TARGET_JOIN}
         WHERE e.workspace_id = ? AND e.type = '${TASK}' AND e.deleted_at IS NULL${completedClause}${waitingClause}
         ORDER BY (sr.completed_at IS NOT NULL) ASC,
                  (td.due_date IS NULL) ASC,
                  td.due_date ASC,
                  e.created_at ASC,
                  e.id ASC
         LIMIT ?`,
      )
      .bind(this.#workspaceId, this.#workspaceId, limit);

    const result = await this.#run(statement);
    const rows = (result.results ?? []) as TaskListRow[];
    const items = rows.map((row) => this.#toTaskListItem(row));
    return { items };
  }

  /**
   * RECALL-01 — a Task is found by its TITLE, by its checklist-item text, and by
   * its DESCRIPTION, in ONE bounded, workspace-scoped statement.
   *
   * The description is the body source this projection gained: before RECALL-01
   * `task_details.description` was unmatched, so a Task remembered only by what
   * was written inside it was unfindable. It joins the same statement — no
   * second read, no "search ids then load bodies" — and the excerpt around the
   * hit is cut in SQL by the shared excerpt contract, so a 1 MiB description
   * ships a few hundred bytes.
   *
   * Match source follows the product's fixed precedence — title > metadata >
   * body — so a Task that matches in several places still returns ONCE, labelled
   * by the strongest reason it is here.
   */
  async searchTasks(
    input: SearchTasksInput,
  ): Promise<readonly TaskSearchHit[]> {
    const text = input.text.trim().toLocaleLowerCase();
    if (text.length === 0) return [];
    const limit = validateTaskLimit(input.limit);
    /*
     * ONE bounded needle. `likeContains` truncates to D1's 50-byte pattern
     * budget, so a longer query matches on its opening characters — and the
     * excerpt `instr()` and the match-source checks must reason about exactly
     * that prefix, or a body hit comes back mislabelled with no excerpt.
     */
    const needle = likeContainsNeedle(text);
    const like = likeContains(needle);
    const descriptionExcerpt = searchExcerptColumns(
      "coalesce(td.description, '')",
      "description",
    );
    const statement = this.#db
      .prepare(
        `WITH ${TASK_PARENT_IDENTITY_CTE}
         SELECT ${TASK_SEARCH_DETAIL_COLUMNS},
                ${WAITING_TARGET_COLUMNS},
                pl.target_entity_id AS parent_id,
                pl.type AS parent_link_type,
                pe.title AS parent_title,
                ${TASK_PARENT_IDENTITY_COLUMNS},
                ${descriptionExcerpt},
                EXISTS (
                  SELECT 1 FROM task_checklist_items ci
                  WHERE ci.workspace_id = e.workspace_id
                    AND ci.task_id = e.id
                    AND lower(ci.title) LIKE ? ESCAPE '\\'
                ) AS checklist_hit
         FROM entities e
         JOIN spine_records sr
           ON sr.workspace_id = e.workspace_id AND sr.entity_id = e.id
         LEFT JOIN task_details td
           ON td.workspace_id = e.workspace_id AND td.entity_id = e.id
         ${TASK_RECURRENCE_JOIN}
         LEFT JOIN entity_links pl
           ON pl.workspace_id = e.workspace_id AND pl.source_entity_id = e.id
              AND pl.deleted_at IS NULL AND pl.type IN (${TASK_PARENT_LINK_LIST})
         LEFT JOIN entities pe
           ON pe.workspace_id = e.workspace_id AND pe.id = pl.target_entity_id
              AND pe.deleted_at IS NULL
         ${TASK_PARENT_IDENTITY_JOIN}
         ${WAITING_TARGET_JOIN}
         WHERE e.workspace_id = ? AND e.type = '${TASK}' AND e.deleted_at IS NULL
               AND (
                 lower(e.title) LIKE ? ESCAPE '\\'
                 /*
                  * TASKS-13 — a Task is also found by the text of its own
                  * checklist, so "tyre pressures" reaches "Prepare camper for
                  * trip". The item is never a RESULT: this is an EXISTS over the
                  * same statement, it returns the parent TASK, and there is no
                  * route, no record and no search hit a checklist item could be.
                  * Ranked below every title match by the CASE below, so a Task
                  * actually called "tyre pressures" still comes first.
                  */
                 OR EXISTS (
                      SELECT 1 FROM task_checklist_items ci
                      WHERE ci.workspace_id = e.workspace_id
                        AND ci.task_id = e.id
                        AND lower(ci.title) LIKE ? ESCAPE '\\'
                    )
                 /*
                  * RECALL-01 — the Task's own DESCRIPTION. Ranked below every
                  * title match by the CASE below, exactly as the checklist is,
                  * and excerpted by the shared contract rather than read whole.
                  */
                 OR lower(coalesce(td.description, '')) LIKE ? ESCAPE '\\'
               )
         ORDER BY CASE
                    WHEN lower(e.title) = ? THEN 0
                    WHEN lower(e.title) LIKE ? ESCAPE '\\' THEN 1
                    WHEN lower(e.title) LIKE ? ESCAPE '\\' THEN 2
                    ELSE 3
                  END,
                  (sr.completed_at IS NOT NULL) ASC,
                  lower(e.title) ASC,
                  e.id ASC
         LIMIT ?`,
      )
      /*
       * Placeholders bind POSITIONALLY, in the order they appear in the
       * statement text: the parent-identity CTE, the SELECT list (the shared
       * description excerpt triple, then the checklist-hit probe), the WHERE
       * clause, the ranking CASE, and the LIMIT. This array mirrors that order
       * exactly.
       */
      .bind(
        this.#workspaceId,
        needle, // description_hit
        needle, // description_window
        needle, // description_window_start
        like, // checklist_hit probe
        this.#workspaceId,
        like, // title
        like, // checklist EXISTS
        like, // description
        text, // rank: exact title
        likePrefix(text), // rank: title prefix
        like, // rank: title contains
        limit,
      );

    const result = await this.#run(statement);
    const rows = (result.results ?? []) as TaskSearchRow[];
    return rows.map((row) => {
      const excerptRow = readSearchExcerptRow(
        row as unknown as Record<string, unknown>,
        "description",
      );
      const titleMatched = row.title.toLocaleLowerCase().includes(needle);
      // Fixed precedence: title > metadata (checklist) > body (description).
      const matchSource: TaskMatchSource = titleMatched
        ? "title"
        : row.checklist_hit === 1
          ? "checklist"
          : searchExcerptMatched(excerptRow)
            ? "description"
            : "title";
      return {
        ...this.#toTaskListItem(row),
        matchSource,
        excerpt:
          matchSource === "description"
            ? searchExcerpt(excerptRow, needle)
            : "",
      };
    });
  }

  /**
   * List the tasks belonging to ONE Project (PROJ-01) in a single bounded,
   * workspace-scoped statement. Drives from the task entity joined to its active
   * `task.belongs_to_project` parent link constrained to `projectId` AND to an active
   * `project` entity — so a wrong-kind or missing project id yields no rows (never a
   * cross-workspace disclosure), completed tasks are included per `state`, waiting
   * tasks carry their waiting representation, and ordering is deterministic
   * `(createdAt, id)`. That stable keyset — over columns that never change once the
   * task is created — lets the page carry a `nextCursor` (bound to workspace +
   * project + state) that resumes exactly after the last row, so EVERY matching
   * task is reachable across pages without a skip, a duplicate or an unbounded
   * query. No N+1, no per-task `getTask`, never "load every workspace task and
   * filter in the client".
   */
  async listProjectTasks(
    projectId: string,
    input: ListProjectTasksInput = {},
  ): Promise<ProjectTaskListPage> {
    const parentId = validateTaskId(projectId);
    const limit = validateTaskLimit(input.limit);
    const state = input.state ?? "open";
    const completedClause =
      state === "open"
        ? " AND sr.completed_at IS NULL"
        : state === "completed"
          ? " AND sr.completed_at IS NOT NULL"
          : "";

    // The cursor is bound to the FULL query scope (workspace + project + state); a
    // cursor issued for a different scope is rejected, never reinterpreted. The
    // keyset predicate resumes strictly AFTER the last returned row in the
    // `(created_at ASC, id ASC)` ordering.
    const scope: ProjectTaskCursorScope = {
      workspaceId: this.#workspaceId,
      projectId: parentId,
      state,
    };
    const cursorParams: string[] = [];
    let cursorClause = "";
    if (input.cursor !== undefined) {
      const position = decodeProjectTaskCursorForScope(input.cursor, scope);
      cursorClause =
        " AND (e.created_at > ? OR (e.created_at = ? AND e.id > ?))";
      cursorParams.push(position.createdAt, position.createdAt, position.id);
    }

    // Fetch one more than the page size: the extra row (if present) proves another
    // page exists, and is trimmed before returning.
    const fetchLimit = limit + 1;

    const statement = this.#db
      .prepare(
        `WITH ${TASK_PARENT_IDENTITY_CTE}
         SELECT ${TASK_DETAIL_COLUMNS},
                ${WAITING_TARGET_COLUMNS},
                pl.target_entity_id AS parent_id,
                pl.type AS parent_link_type,
                pe.title AS parent_title,
                ${TASK_PARENT_IDENTITY_COLUMNS}
         FROM entities e
         JOIN spine_records sr
           ON sr.workspace_id = e.workspace_id AND sr.entity_id = e.id
         JOIN entity_links pl
           ON pl.workspace_id = e.workspace_id AND pl.source_entity_id = e.id
              AND pl.deleted_at IS NULL AND pl.type = '${TASK_BELONGS_TO_PROJECT}'
              AND pl.target_entity_id = ?
         JOIN entities pe
           ON pe.workspace_id = e.workspace_id AND pe.id = pl.target_entity_id
              AND pe.type = '${PROJECT}' AND pe.deleted_at IS NULL
         ${TASK_PARENT_IDENTITY_JOIN}
         LEFT JOIN task_details td
           ON td.workspace_id = e.workspace_id AND td.entity_id = e.id
         ${TASK_RECURRENCE_JOIN}
         ${WAITING_TARGET_JOIN}
         WHERE e.workspace_id = ? AND e.type = '${TASK}' AND e.deleted_at IS NULL${completedClause}${cursorClause}
         ORDER BY e.created_at ASC, e.id ASC
         LIMIT ?`,
      )
      .bind(
        this.#workspaceId,
        parentId,
        this.#workspaceId,
        ...cursorParams,
        fetchLimit,
      );

    const result = await this.#run(statement);
    const rows = (result.results ?? []) as TaskListRow[];

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeProjectTaskCursor(scope, {
            createdAt: last.created_at,
            id: last.id,
          })
        : null;

    return {
      items: pageRows.map((row) => this.#toTaskListItem(row)),
      nextCursor,
    };
  }

  /**
   * Planning query (TODAY-04): fetch the tasks the planning surface buckets, each
   * band bounded INDEPENDENTLY so a large unscheduled backlog can never crowd out
   * the owner's planned/overdue/today tasks or today's completions (unlike the
   * single, due-date-ordered `listTasks` page). Three bounded reads — scheduled
   * (planned) open tasks ordered scheduled-date ascending so overdue/today are kept
   * first, the unscheduled backlog, and the most-recent completions — are unioned
   * into one flat list for the caller to bucket. Waiting tasks are excluded. The
   * three bands are disjoint (open-scheduled / open-unscheduled / completed), so no
   * task appears twice.
   */
  async listPlanningTasks(
    input: ListPlanningTasksInput,
  ): Promise<TaskListPage> {
    const scheduledLimit = input.scheduledLimit ?? PLANNING_SCHEDULED_LIMIT;
    const backlogLimit = input.backlogLimit ?? PLANNING_BACKLOG_LIMIT;
    const completedLimit = input.completedLimit ?? PLANNING_COMPLETED_LIMIT;

    // TASKS-01/TASKS-04: Today excludes Someday/Maybe, Cancelled and On-hold tasks
    // from normal active work — in addition to waiting and completed.
    const activeExclusions =
      "COALESCE(td.commitment_state, 'active') <> 'someday' AND COALESCE(td.status, 'todo') NOT IN ('cancelled', 'on_hold')";
    const scheduled = await this.#queryPlanningBand(
      `sr.completed_at IS NULL AND td.waiting_since IS NULL AND td.scheduled_date IS NOT NULL AND ${activeExclusions}`,
      "td.scheduled_date ASC, e.id ASC",
      scheduledLimit,
    );
    const backlog = await this.#queryPlanningBand(
      `sr.completed_at IS NULL AND td.waiting_since IS NULL AND td.scheduled_date IS NULL AND ${activeExclusions}`,
      "(td.due_date IS NULL) ASC, td.due_date ASC, e.created_at ASC, e.id ASC",
      backlogLimit,
    );
    const completed = await this.#queryPlanningBand(
      "sr.completed_at IS NOT NULL AND td.waiting_since IS NULL",
      "sr.completed_at DESC, e.id ASC",
      completedLimit,
    );

    return { items: [...scheduled, ...backlog, ...completed] };
  }

  /**
   * Run one bounded planning band. Waiting is excluded by the WHERE clause, so no
   * waiting-target join is needed. The WHERE/ORDER fragments are trusted, constant
   * kernel SQL (never caller data); the workspace id and limit are bound.
   */
  async #queryPlanningBand(
    where: string,
    order: string,
    limit: number,
  ): Promise<TaskListItem[]> {
    const statement = this.#db
      .prepare(
        `WITH ${TASK_PARENT_IDENTITY_CTE}
         SELECT ${TASK_DETAIL_COLUMNS},
                pl.target_entity_id AS parent_id,
                pl.type AS parent_link_type,
                pe.title AS parent_title,
                ${TASK_PARENT_IDENTITY_COLUMNS}
         FROM entities e
         JOIN spine_records sr
           ON sr.workspace_id = e.workspace_id AND sr.entity_id = e.id
         LEFT JOIN task_details td
           ON td.workspace_id = e.workspace_id AND td.entity_id = e.id
         ${TASK_RECURRENCE_JOIN}
         LEFT JOIN entity_links pl
           ON pl.workspace_id = e.workspace_id AND pl.source_entity_id = e.id
              AND pl.deleted_at IS NULL AND pl.type IN (${TASK_PARENT_LINK_LIST})
         LEFT JOIN entities pe
           ON pe.workspace_id = e.workspace_id AND pe.id = pl.target_entity_id
              AND pe.deleted_at IS NULL
         ${TASK_PARENT_IDENTITY_JOIN}
         WHERE e.workspace_id = ? AND e.type = '${TASK}' AND e.deleted_at IS NULL
           AND ${where}
         ORDER BY ${order}
         LIMIT ?`,
      )
      .bind(this.#workspaceId, this.#workspaceId, limit);
    const result = await this.#run(statement);
    const rows = (result.results ?? []) as TaskListRow[];
    return rows.map((row) => this.#toTaskListItem(row));
  }

  /** Map a joined task-list row into a `TaskListItem` (shared by the list queries). */
  #toTaskListItem(row: TaskListRow): TaskListItem {
    const details = rowToTaskDetails(row);
    return {
      id: row.id,
      workspaceId: parseWorkspaceId(row.workspace_id),
      title: row.title,
      createdAt: fromStorageTimestamp(row.created_at),
      updatedAt: fromStorageTimestamp(row.updated_at),
      completedAt:
        row.completed_at === null
          ? null
          : fromStorageTimestamp(row.completed_at),
      status: details.status,
      priority: details.priority,
      dueDate: details.dueDate,
      scheduledDate: details.scheduledDate,
      timeSector: details.timeSector,
      commitmentState: details.commitmentState,
      delegation: details.delegation,
      recurrence: details.recurrence,
      recurrenceSeries: details.recurrenceSeries,
      parent: this.#parentRelation(
        row.parent_link_type,
        row.parent_id,
        row.parent_title,
        row,
      ),
      waiting: rowToTaskWaiting(row),
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Workspace-wide read model (TASKS-01)                                    */
  /* ---------------------------------------------------------------------- */

  /**
   * TASKS-03 — the ONE resolved query scope both workspace reads share.
   *
   * The flat list and the grouped query must agree exactly: a grouped view showing
   * counts that a filtered list then contradicts is worse than no counts at all. So
   * the view membership, every filter and the completed-visibility override are
   * built ONCE here and consumed by both. Every caller value is validated against a
   * closed set first and then BOUND — nothing is interpolated into SQL.
   */
  #resolveWorkspaceScope(
    view: string,
    filters: WorkspaceTaskFilters,
    todayIso: string,
    timezone: string,
  ): { whereParts: string[]; params: (string | number)[] } {
    const whereParts: string[] = [];
    const params: (string | number)[] = [];

    // View membership (ADR-043 §5–§6). `todayIso` is bound where a view needs it.
    this.#appendViewClause(view, todayIso, whereParts, params);

    // Normalise/validate filter values that reach SQL (still bound, never inlined).
    const filterPriority =
      filters.priority === undefined
        ? undefined
        : validateTaskPriority(filters.priority);
    const filterSector =
      filters.timeSector === undefined
        ? undefined
        : validateTimeSector(filters.timeSector);
    const filterCommitment =
      filters.commitmentState === undefined
        ? undefined
        : validateCommitmentState(filters.commitmentState);
    const filterStatus =
      filters.status === undefined
        ? undefined
        : validateTaskStatus(filters.status);
    const filterProjectId =
      filters.projectId === undefined
        ? undefined
        : validateTaskId(filters.projectId);
    const filterGoalId =
      filters.goalId === undefined ? undefined : validateTaskId(filters.goalId);
    const filterAreaId =
      filters.areaId === undefined ? undefined : validateTaskId(filters.areaId);
    const filterDueState = validateTaskDueState(filters.dueState);
    const filterPlannedState = validateTaskPlannedState(filters.plannedState);
    const filterParentKind = validateTaskParentKind(filters.parentKind);
    const filterCreatedWithin = validateTaskRecencyWindow(
      filters.createdWithin,
    );
    const filterUpdatedWithin = validateTaskRecencyWindow(
      filters.updatedWithin,
    );
    const filterCompletedVisibility = validateTaskCompletedVisibility(
      filters.completedVisibility,
    );
    // V2.7 RECALL-02 — the completion-time window, validated through the SAME
    // closed-set / date-bound validators the created-updated window and the
    // due-planned range already use. Nothing new reaches SQL as text.
    const filterCompletedWithin = validateTaskRecencyWindow(
      filters.completedWithin,
    );
    const filterCompletedFrom = validateTaskDateBound(filters.completedFrom);
    const filterCompletedTo = validateTaskDateBound(filters.completedTo);
    // V2.7 RECALL-03 — the follow-up dimension, validated through the SAME
    // closed-set / date-bound validators the due state and the due range use.
    const filterFollowUp = validateTaskFollowUpState(filters.followUp);
    const filterFollowUpFrom = validateTaskDateBound(filters.followUpFrom);
    const filterFollowUpTo = validateTaskDateBound(filters.followUpTo);
    const filterDelegatedTo =
      filters.delegatedTo === undefined || filters.delegatedTo === null
        ? undefined
        : String(filters.delegatedTo);
    // PLAN-01 / SMART-01 — the set and range filters. Every value is validated
    // here and BOUND below; nothing reaches SQL as text.
    const filterPriorities = validateTaskPriorities(filters.priorities);
    const filterDueFrom = validateTaskDateBound(filters.dueFrom);
    const filterDueTo = validateTaskDateBound(filters.dueTo);
    const filterPlannedFrom = validateTaskDateBound(filters.plannedFrom);
    const filterPlannedTo = validateTaskDateBound(filters.plannedTo);
    const filterRecurring =
      typeof filters.recurring === "boolean" ? filters.recurring : undefined;
    // V2.6 FIND-03 — the tag dimension. Canonicalised and bounded by the shared
    // parser, so a crafted URL cannot widen the query or name a key the
    // vocabulary could not hold.
    const filterTagKeys = parseTagFilterKeys(filters.tagKeys);
    const filterBlocked =
      typeof filters.blocked === "boolean" ? filters.blocked : undefined;

    if (filterPriority !== undefined) {
      if (filterPriority === null) {
        whereParts.push("td.priority IS NULL");
      } else if (filterPriority === "p4") {
        /*
         * CONTROL-01 — filtering to P4 includes the tasks stored as `null`.
         *
         * The product's priority contract is that a stored `null` IS Priority 4
         * (`PriorityIndicator`: "legacy stored null is treated as normal
         * Priority 4 in the UI"). The UI has drawn a grey P4 flag on those rows
         * for some time; the QUERY did not agree, so "Priority 4" returned only
         * the rows someone had explicitly triaged to P4 and silently omitted
         * every row the same screen was labelling P4. On the seeded workspace
         * that is most of them.
         *
         * The `null` branch above is kept: the repository contract still allows
         * an explicit "stored empty" query, and a legacy `?priority=__none`
         * bookmark still resolves to it. It is simply no longer something the
         * product's own controls can produce.
         */
        whereParts.push("(td.priority = ? OR td.priority IS NULL)");
        params.push(filterPriority);
      } else {
        whereParts.push("td.priority = ?");
        params.push(filterPriority);
      }
    }
    if (filterSector !== undefined) {
      if (filterSector === null) {
        whereParts.push("td.time_sector IS NULL");
      } else {
        whereParts.push("td.time_sector = ?");
        params.push(filterSector);
      }
    }
    if (filterCommitment !== undefined) {
      whereParts.push("COALESCE(td.commitment_state, 'active') = ?");
      params.push(filterCommitment);
    }
    if (filterStatus !== undefined) {
      whereParts.push("COALESCE(td.status, 'todo') = ?");
      params.push(filterStatus);
    }
    if (filters.delegatedOnly) {
      whereParts.push("td.delegate_to IS NOT NULL");
    }
    if (filterDelegatedTo !== undefined) {
      // Delegation is plain text today (ADR-043 §7). The value is compared as a
      // BOUND parameter, so a delegatee containing quotes or SQL-looking text is
      // just text — and this stays EntityLink-ready for a future Person target.
      whereParts.push("td.delegate_to = ?");
      params.push(filterDelegatedTo);
    }
    if (filters.waitingOnly) {
      whereParts.push("td.waiting_since IS NOT NULL");
    }
    if (filterProjectId !== undefined) {
      whereParts.push(
        `EXISTS (SELECT 1 FROM entity_links tpl
                 WHERE tpl.workspace_id = e.workspace_id AND tpl.source_entity_id = e.id
                   AND tpl.deleted_at IS NULL AND tpl.type = '${TASK_BELONGS_TO_PROJECT}'
                   AND tpl.target_entity_id = ?)`,
      );
      params.push(filterProjectId);
    }
    if (filterAreaId !== undefined) {
      // A task is "in" an Area if its structural parent is that Area, OR its parent
      // Project belongs to that Area.
      whereParts.push(
        `(EXISTS (SELECT 1 FROM entity_links tal
                  WHERE tal.workspace_id = e.workspace_id AND tal.source_entity_id = e.id
                    AND tal.deleted_at IS NULL AND tal.type = '${TASK_BELONGS_TO_AREA}'
                    AND tal.target_entity_id = ?)
          OR EXISTS (SELECT 1 FROM entity_links tpl2
                     JOIN entity_links pal ON pal.workspace_id = tpl2.workspace_id
                       AND pal.source_entity_id = tpl2.target_entity_id
                       AND pal.deleted_at IS NULL AND pal.type = '${PROJECT_BELONGS_TO_AREA}'
                     WHERE tpl2.workspace_id = e.workspace_id AND tpl2.source_entity_id = e.id
                       AND tpl2.deleted_at IS NULL AND tpl2.type = '${TASK_BELONGS_TO_PROJECT}'
                       AND pal.target_entity_id = ?))`,
      );
      params.push(filterAreaId, filterAreaId);
    }
    if (filterGoalId !== undefined) {
      whereParts.push(
        `EXISTS (SELECT 1 FROM entity_links tpg
                 JOIN entity_links pag ON pag.workspace_id = tpg.workspace_id
                   AND pag.source_entity_id = tpg.target_entity_id
                   AND pag.deleted_at IS NULL AND pag.type = '${PROJECT_ADVANCES_GOAL}'
                 WHERE tpg.workspace_id = e.workspace_id AND tpg.source_entity_id = e.id
                   AND tpg.deleted_at IS NULL AND tpg.type = '${TASK_BELONGS_TO_PROJECT}'
                   AND pag.target_entity_id = ?)`,
      );
      params.push(filterGoalId);
    }
    if (filterParentKind !== undefined) {
      // `pl` is the LEFT-JOINed structural parent link. `none` is a real, reachable
      // state (a task whose parent was deleted), not an impossible one.
      whereParts.push(
        filterParentKind === "none"
          ? "pl.type IS NULL"
          : filterParentKind === "project"
            ? `pl.type = '${TASK_BELONGS_TO_PROJECT}'`
            : `pl.type = '${TASK_BELONGS_TO_AREA}'`,
      );
    }
    // The derived DUE and PLANNED states are selected from the SAME expression
    // the grouping buckets by, so "group by due state, then open Overdue" always
    // lands on exactly the records the Overdue bucket counted. Two separate
    // definitions could — and did — drift.
    if (filterDueState !== undefined) {
      whereParts.push(`(${WORKSPACE_GROUP_BUCKET_EXPR.due_state}) = ?`);
      params.push(filterDueState);
    }
    if (filterPlannedState !== undefined) {
      whereParts.push(`(${WORKSPACE_GROUP_BUCKET_EXPR.planned}) = ?`);
      params.push(filterPlannedState);
    }
    /*
     * HARDEN-06C (F-05) — the window's start DAY, as the instant the owner's day
     * actually begins.
     *
     * This used to bind `${windowStart}T00:00:00.000Z` and the comment beside it
     * described being "free of any timezone conversion" as the design. That is
     * exactly what made it wrong: `todayIso` is the OWNER's calendar day
     * (`ownerCalendarIso(now, preferences.timezone)`) and `created_at` is a UTC
     * instant, so for the default Sydney owner `Created: Today` silently omitted
     * everything captured before ~10 or 11 a.m. local — up to half the working
     * day — and for a negative-offset owner it included several hours of
     * yesterday instead.
     *
     * The conversion is still done ONCE, outside SQL, and the result is still a
     * single bound instant compared with `>=`, so the index use is unchanged.
     */
    if (filterCreatedWithin !== undefined) {
      whereParts.push("e.created_at >= ?");
      params.push(
        ownerDayStartInstant(
          recencyWindowStart(todayIso, filterCreatedWithin),
          timezone,
        ).toISOString(),
      );
    }
    if (filterUpdatedWithin !== undefined) {
      whereParts.push("e.updated_at >= ?");
      params.push(
        ownerDayStartInstant(
          recencyWindowStart(todayIso, filterUpdatedWithin),
          timezone,
        ).toISOString(),
      );
    }
    /*
     * V2.7 RECALL-02 — the COMPLETION-TIME window, over the one authority.
     *
     * `sr.completed_at` is a UTC instant and every bound below is an OWNER
     * calendar day, so each is converted ONCE, outside SQL, by the same
     * `ownerDayStartInstant` the created/updated windows use (HARDEN-06C F-05).
     * "Completed yesterday" therefore means the owner's yesterday: a completion
     * at 23:50 local is inside their day, and the same UTC instant is outside it
     * for an owner living in another zone. There is no second timezone helper
     * and no UTC-day assumption anywhere in this window.
     *
     * Each dimension costs exactly ONE bind and ONE comparison against a single
     * instant, so the index use is the same shape as the existing windows'. The
     * `IS NOT NULL` guard is written out rather than implied: it states that an
     * unfinished Task is not inside a completion window, which is the rule that
     * stops "completed this week" quietly returning the open backlog.
     */
    if (filterCompletedWithin !== undefined) {
      whereParts.push("sr.completed_at IS NOT NULL AND sr.completed_at >= ?");
      params.push(
        ownerDayStartInstant(
          recencyWindowStart(todayIso, filterCompletedWithin),
          timezone,
        ).toISOString(),
      );
    }
    if (filterCompletedFrom !== undefined) {
      whereParts.push("sr.completed_at IS NOT NULL AND sr.completed_at >= ?");
      params.push(
        ownerDayStartInstant(filterCompletedFrom, timezone).toISOString(),
      );
    }
    if (filterCompletedTo !== undefined) {
      // INCLUSIVE of the whole named day: the bound is the instant the owner's
      // NEXT day begins, compared with `<`. Binding the start of `completedTo`
      // itself would silently drop everything finished that day — the same
      // off-by-a-day the analytics window closes with its own next-day bound.
      whereParts.push("sr.completed_at IS NOT NULL AND sr.completed_at < ?");
      params.push(
        ownerDayStartInstant(
          shiftCalendarDate(filterCompletedTo, 1),
          timezone,
        ).toISOString(),
      );
    }
    /*
     * V2.7 RECALL-03 — the FOLLOW-UP dimension, over `td.follow_up_on`.
     *
     * The derived state costs ZERO binds: `cal.today_iso` is already CROSS
     * JOINed once per query for the due and planned states, so the owner's day
     * is a joined column here rather than a fifth placeholder. The explicit
     * window costs exactly the two binds the roadmap budgets for it, and is the
     * same `IS NOT NULL AND <= / >=` shape `dueFrom`/`dueTo` use — a Task with
     * no chase date is inside no window.
     */
    if (filterFollowUp !== undefined) {
      whereParts.push(followUpStatePredicate(filterFollowUp, "cal.today_iso"));
    }
    if (filterFollowUpFrom !== undefined) {
      whereParts.push("td.follow_up_on IS NOT NULL AND td.follow_up_on >= ?");
      params.push(filterFollowUpFrom);
    }
    if (filterFollowUpTo !== undefined) {
      whereParts.push("td.follow_up_on IS NOT NULL AND td.follow_up_on <= ?");
      params.push(filterFollowUpTo);
    }
    if (filterPriorities !== undefined) {
      /*
       * A SET of priorities, as one bound IN-list plus an explicit NULL branch.
       *
       * The members come from the closed priority vocabulary, so the placeholder
       * count is derived from validated data and every value is bound — the list
       * is never assembled from caller text. `p4` carries the same
       * stored-null-IS-P4 contract the scalar filter documents (CONTROL-01), so
       * "P1 and P4" returns exactly the rows the screen labels P1 and P4.
       */
      const explicit = filterPriorities.filter(
        (value): value is TaskPriority => value !== null,
      );
      const wantsNull =
        filterPriorities.includes(null) || explicit.includes("p4");
      const clauses: string[] = [];
      if (explicit.length > 0) {
        clauses.push(`td.priority IN (${explicit.map(() => "?").join(", ")})`);
        params.push(...explicit);
      }
      if (wantsNull) clauses.push("td.priority IS NULL");
      whereParts.push(`(${clauses.join(" OR ")})`);
    }
    if (filterDueFrom !== undefined) {
      whereParts.push("td.due_date IS NOT NULL AND td.due_date >= ?");
      params.push(filterDueFrom);
    }
    if (filterDueTo !== undefined) {
      whereParts.push("td.due_date IS NOT NULL AND td.due_date <= ?");
      params.push(filterDueTo);
    }
    if (filterPlannedFrom !== undefined) {
      whereParts.push(
        "td.scheduled_date IS NOT NULL AND td.scheduled_date >= ?",
      );
      params.push(filterPlannedFrom);
    }
    if (filterPlannedTo !== undefined) {
      whereParts.push(
        "td.scheduled_date IS NOT NULL AND td.scheduled_date <= ?",
      );
      params.push(filterPlannedTo);
    }
    if (filterRecurring !== undefined) {
      // `rr` is the LEFT-JOINed recurrence rule the list already resolves for
      // the row's repeat signal, so this costs no extra join.
      whereParts.push(
        filterRecurring ? "rr.entity_id IS NOT NULL" : "rr.entity_id IS NULL",
      );
    }
    if (filterBlocked !== undefined) {
      /*
       * TASKS-12 — blocked, DERIVED in the predicate itself.
       *
       * A correlated EXISTS over the `task.blocks` edges pointing AT this row,
       * joined to each blocker's own entity and spine record: an edge counts only
       * while its blocker is alive and incomplete. There is no stored flag, so
       * this cannot go stale, and `blocked=false` is the exact complement of
       * `blocked=true` rather than a second query with its own opinion.
       *
       * It rides `entity_links_active_target_type_idx`, so it is an index seek per
       * candidate row rather than a scan, and it adds no join to the outer query —
       * which is what keeps the page a single bounded statement.
       */
      const blockedExists = `EXISTS (
             SELECT 1 FROM entity_links bl
             JOIN entities be
               ON be.workspace_id = bl.workspace_id AND be.id = bl.source_entity_id
              AND be.type = '${TASK}' AND be.deleted_at IS NULL
             LEFT JOIN spine_records bs
               ON bs.workspace_id = be.workspace_id AND bs.entity_id = be.id
             WHERE bl.workspace_id = ? AND bl.type = ?
               AND bl.target_entity_id = e.id
               AND bl.deleted_at IS NULL
               AND bs.completed_at IS NULL
           )`;
      whereParts.push(filterBlocked ? blockedExists : `NOT ${blockedExists}`);
      params.push(this.#workspaceId, TASK_BLOCKS);
    }
    if (filterTagKeys.length > 0) {
      /*
       * V2.6 FIND-03 — the ONE tag dimension, as a SEMI-join.
       *
       * `EXISTS`, never a `JOIN`: a Task carrying two of the filtered tags
       * matches a join twice, which would duplicate it in the page, corrupt the
       * count beside the filter and make cursor pagination skip a row. `EXISTS`
       * stops at the first match, so a Task appears exactly once however many of
       * the named tags it carries.
       *
       * It rides `entity_tags_by_tag`, so it is an index seek per candidate row
       * rather than a scan, and it adds no join to the outer query — which is
       * what keeps the page a single bounded statement.
       */
      const predicate = tagFilterPredicate("e", filterTagKeys, "id");
      whereParts.push(predicate.sql);
      params.push(...predicate.params);
    }
    // Completed visibility is applied LAST and on top of the view, so it can widen
    // (`include` on an execution view) or narrow (`hide` on `all`) without the view
    // and the filter fighting each other.
    if (filterCompletedVisibility === "hide") {
      whereParts.push("sr.completed_at IS NULL");
    } else if (filterCompletedVisibility === "only") {
      whereParts.push("sr.completed_at IS NOT NULL");
    }

    return { whereParts, params };
  }

  async listWorkspaceTasks(
    input: ListWorkspaceTasksInput,
  ): Promise<WorkspaceTaskListPage> {
    const view = validateTaskSystemView(input.view);
    const sort = validateTaskSort(input.sort);
    const direction = validateTaskSortDirection(input.direction);
    const limit = validateTaskLimit(input.limit);
    const filters = input.filters ?? {};
    const todayIso = validateTaskDate(input.todayIso, "scheduledDate") ?? "";
    const weekEnd = todayIso.length > 0 ? weekWindowEnd(todayIso) : "";

    const scope: WorkspaceTaskCursorScope = {
      workspaceId: this.#workspaceId,
      view,
      sort,
      direction,
      todayIso,
      filtersSignature: workspaceTaskFiltersSignature(filters),
    };

    const sortSpec = this.#workspaceSortSpec(sort, direction);
    const { whereParts, params } = this.#resolveWorkspaceScope(
      view,
      filters,
      todayIso,
      input.timezone,
    );

    // Keyset cursor over (sort_value <dir>, created_at ASC, id ASC).
    if (input.cursor !== undefined) {
      const position = decodeWorkspaceTaskCursorForScope(input.cursor, scope);
      const cmp = sortSpec.dir === "DESC" ? "<" : ">";
      whereParts.push(
        `(${sortSpec.expr} ${cmp} ? OR (${sortSpec.expr} = ? AND (e.created_at > ? OR (e.created_at = ? AND e.id > ?))))`,
      );
      params.push(
        position.sortValue,
        position.sortValue,
        position.createdAt,
        position.createdAt,
        position.id,
      );
    }

    const fetchLimit = limit + 1;
    const whereSql =
      whereParts.length > 0 ? ` AND ${whereParts.join(" AND ")}` : "";

    const statement = this.#db
      .prepare(
        `WITH ${TASK_PARENT_IDENTITY_CTE}
         SELECT ${TASK_DETAIL_COLUMNS},
                ${WAITING_TARGET_COLUMNS},
                pl.target_entity_id AS parent_id,
                pl.type AS parent_link_type,
                pe.title AS parent_title,
                ${TASK_PARENT_IDENTITY_COLUMNS},
                ${sortSpec.expr} AS sort_value
         FROM entities e
         JOIN spine_records sr
           ON sr.workspace_id = e.workspace_id AND sr.entity_id = e.id
         LEFT JOIN task_details td
           ON td.workspace_id = e.workspace_id AND td.entity_id = e.id
         ${TASK_RECURRENCE_JOIN}
         LEFT JOIN entity_links pl
           ON pl.workspace_id = e.workspace_id AND pl.source_entity_id = e.id
              AND pl.deleted_at IS NULL AND pl.type IN (${TASK_PARENT_LINK_LIST})
         LEFT JOIN entities pe
           ON pe.workspace_id = e.workspace_id AND pe.id = pl.target_entity_id
              AND pe.deleted_at IS NULL
         ${TASK_PARENT_IDENTITY_JOIN}
         ${WAITING_TARGET_JOIN}
         CROSS JOIN (SELECT ? AS today_iso, ? AS week_end) cal
         WHERE e.workspace_id = ? AND e.type = '${TASK}'
           AND ${this.#taskLifecycleWhere(view)}${whereSql}
         ORDER BY sort_value ${sortSpec.dir}, e.created_at ASC, e.id ASC
         LIMIT ?`,
      )
      .bind(
        this.#workspaceId,
        todayIso,
        weekEnd,
        this.#workspaceId,
        ...params,
        fetchLimit,
      );

    const result = await this.#run(statement);
    const rows = (result.results ?? []) as (TaskListRow & {
      readonly sort_value: string | null;
    })[];

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeWorkspaceTaskCursor(scope, {
            sortValue: last.sort_value ?? "",
            createdAt: last.created_at,
            id: last.id,
          })
        : null;

    return {
      items: pageRows.map((row) => this.#toTaskListItem(row)),
      nextCursor,
    };
  }

  async listWorkspaceTaskGroups(
    input: ListWorkspaceTaskGroupsInput,
  ): Promise<WorkspaceTaskGrouping> {
    const dimension = validateTaskGroupDimension(input.dimension);
    const sort = validateTaskSort(input.sort);
    const direction = validateTaskSortDirection(input.direction);
    const todayIso = validateTaskDate(input.todayIso, "scheduledDate") ?? "";
    const weekEnd = todayIso.length > 0 ? weekWindowEnd(todayIso) : "";
    // The Matrix and Sectors views group the ACTIVE planning scope; a grouped List
    // or Board view passes its OWN view and filters, so grouping never silently
    // re-scopes what the user is looking at (TASKS-03).
    const view = validateTaskSystemView(input.view ?? "active");
    const filters = input.filters ?? {};
    // Bounded records per bucket (never unbounded); overflow is reached through the
    // equivalent filtered `all` view, which paginates that bucket on its own cursor.
    const bucketLimit = Math.min(
      Math.max(1, input.bucketLimit ?? WORKSPACE_GROUP_BUCKET_LIMIT),
      WORKSPACE_GROUP_BUCKET_MAX,
    );

    const sortSpec = this.#workspaceSortSpec(sort, direction);
    // The bucket key is a TRUSTED column expression chosen from a closed set of
    // dimensions (never caller data), so a grouping can never inject SQL.
    const bucketExpr = WORKSPACE_GROUP_BUCKET_EXPR[dimension];
    const { whereParts, params } = this.#resolveWorkspaceScope(
      view,
      filters,
      todayIso,
      input.timezone,
    );
    const whereSql =
      whereParts.length > 0 ? ` AND ${whereParts.join(" AND ")}` : "";

    // ONE query: scope the population, compute each row's bucket + sort value, then
    // window over the buckets for the AUTHORITATIVE per-bucket total (`COUNT(*)
    // OVER`) and a deterministic within-bucket rank (`ROW_NUMBER() OVER`), finally
    // keeping only the top `bucketLimit` rows per bucket. Counts are computed over
    // the whole scope, independent of the returned slice — so empty states and
    // bucket counts are correct before any paging (ADR-043 decision 12).
    const statement = this.#db
      .prepare(
        `WITH ${TASK_PARENT_IDENTITY_CTE},
         scoped AS (
           SELECT ${TASK_DETAIL_COLUMNS},
                  ${WAITING_TARGET_COLUMNS},
                  pl.target_entity_id AS parent_id,
                  pl.type AS parent_link_type,
                  pe.title AS parent_title,
                  ${TASK_PARENT_IDENTITY_COLUMNS},
                  ${bucketExpr} AS bucket,
                  ${sortSpec.expr} AS sort_value
           FROM entities e
           JOIN spine_records sr
             ON sr.workspace_id = e.workspace_id AND sr.entity_id = e.id
           LEFT JOIN task_details td
             ON td.workspace_id = e.workspace_id AND td.entity_id = e.id
           ${TASK_RECURRENCE_JOIN}
           LEFT JOIN entity_links pl
             ON pl.workspace_id = e.workspace_id AND pl.source_entity_id = e.id
                AND pl.deleted_at IS NULL AND pl.type IN (${TASK_PARENT_LINK_LIST})
           LEFT JOIN entities pe
             ON pe.workspace_id = e.workspace_id AND pe.id = pl.target_entity_id
                AND pe.deleted_at IS NULL
           ${TASK_PARENT_IDENTITY_JOIN}
           ${WAITING_TARGET_JOIN}
           CROSS JOIN (SELECT ? AS today_iso, ? AS week_end) cal
           WHERE e.workspace_id = ? AND e.type = '${TASK}'
             AND ${this.#taskLifecycleWhere(view)}${whereSql}
         ),
         counted AS (
           SELECT *,
                  COUNT(*) OVER (PARTITION BY bucket) AS bucket_count,
                  ROW_NUMBER() OVER (
                    PARTITION BY bucket
                    ORDER BY sort_value ${sortSpec.dir}, created_at ASC, id ASC
                  ) AS rn
           FROM scoped
         ),
         ranked AS (
           -- A separate level: SQLite refuses a window function nested inside
           -- another window function's ORDER BY, so the bucket rank is computed
           -- over the already-counted rows.
           SELECT *,
                  DENSE_RANK() OVER (
                    ORDER BY bucket_count DESC, bucket ASC
                  ) AS bucket_rank
           FROM counted
         )
         SELECT * FROM ranked
         WHERE rn <= ? AND bucket_rank <= ?
         ORDER BY bucket ASC, rn ASC`,
      )
      .bind(
        this.#workspaceId,
        todayIso,
        weekEnd,
        this.#workspaceId,
        ...params,
        bucketLimit,
        WORKSPACE_GROUP_MAX_BUCKETS,
      );

    const result = await this.#run(statement);
    const rows = (result.results ?? []) as (TaskListRow & {
      readonly bucket: string;
      readonly bucket_count: number;
    })[];

    // Rows arrive ordered by (bucket, rn), so a single pass builds each group in
    // deterministic within-bucket order; `bucket_count` (constant per bucket) is the
    // authoritative total, and `hasMore` compares it to the bounded slice length.
    const byBucket = new Map<
      string,
      { count: number; items: TaskListItem[]; label: string | null }
    >();
    for (const row of rows) {
      let group = byBucket.get(row.bucket);
      if (!group) {
        group = {
          count: row.bucket_count,
          items: [],
          // Open-ended buckets carry their own label from the row, so the caller
          // never needs a second query (or an N+1) to name a Project column.
          label:
            dimension === "parent"
              ? (row.parent_title ?? null)
              : dimension === "delegate"
                ? (row.delegate_to ?? null)
                : null,
        };
        byBucket.set(row.bucket, group);
      }
      group.items.push(this.#toTaskListItem(row));
    }

    const groups: WorkspaceTaskGroup[] = [...byBucket.entries()].map(
      ([key, g]) => ({
        key,
        count: g.count,
        items: g.items,
        hasMore: g.count > g.items.length,
        label: g.label,
      }),
    );

    return { dimension, groups };
  }

  /**
   * STEER-04 — the canonical NEXT ACTION for a bounded set of Projects.
   *
   * DEBT-77 prescribed this statement's shape in 2026 and it is built exactly
   * as written: *"a single bounded, workspace-scoped statement over the … project
   * ids — a `ROW_NUMBER() OVER (PARTITION BY project ORDER BY <the Tasks
   * smart-sort expression>)` filtered to rank 1"*. Six cards cost what two do.
   *
   * Every rule it applies is one the repository ALREADY owns, reached through
   * the same code path the `/tasks` collection uses, so there is no second
   * notion of "next" to drift:
   *
   *   - the population is `#resolveWorkspaceScope("active", { blocked: false })`
   *     — the canonical active planning scope (not completed, cancelled, on
   *     hold, Someday/Maybe or waiting) minus TASKS-12's dependency-blocked
   *     work, derived from live `task.blocks` edges rather than a stored flag;
   *   - the ordering is `#workspaceSortSpec("smart")`, character for character,
   *     with the collection's own `created_at ASC, id ASC` tiebreak, so the
   *     answer is deterministic across reads of unchanged data;
   *   - the kernel mirror of both is `~/kernel/tasks/next-action`, and
   *     `test/kernel/task-next-action.test.ts` drives the two over one fact
   *     matrix and fails if they disagree.
   *
   * Ids are chunked so a caller with many Projects stays inside D1's
   * 100-bound-parameter ceiling; each chunk is ONE statement, and a Project with
   * no eligible Task is simply absent from the result.
   */
  async listProjectNextActions(
    input: ListProjectNextActionsInput,
  ): Promise<Map<string, TaskListItem>> {
    const ids = [...new Set(input.projectIds.map((id) => validateTaskId(id)))];
    const nextActions = new Map<string, TaskListItem>();
    if (ids.length === 0) return nextActions;

    const todayIso = validateTaskDate(input.todayIso, "scheduledDate") ?? "";
    const weekEnd = todayIso.length > 0 ? weekWindowEnd(todayIso) : "";
    const sortSpec = this.#workspaceSortSpec("smart");

    for (
      let start = 0;
      start < ids.length;
      start += NEXT_ACTION_PROJECT_CHUNK_SIZE
    ) {
      const chunk = ids.slice(start, start + NEXT_ACTION_PROJECT_CHUNK_SIZE);
      /*
       * Rebuilt PER CHUNK, because `#resolveWorkspaceScope` returns bind
       * parameters as well as SQL and reusing one array across chunks would
       * bind the first chunk's values to the second chunk's statement.
       */
      const { whereParts, params } = this.#resolveWorkspaceScope(
        NEXT_ACTION_VIEW,
        { blocked: false },
        todayIso,
        input.timezone,
      );
      const whereSql =
        whereParts.length > 0 ? ` AND ${whereParts.join(" AND ")}` : "";
      const marks = new Array(chunk.length).fill("?").join(", ");

      const statement = this.#db
        .prepare(
          `WITH ${TASK_PARENT_IDENTITY_CTE},
           scoped AS (
             SELECT ${TASK_DETAIL_COLUMNS},
                    ${WAITING_TARGET_COLUMNS},
                    pl.target_entity_id AS parent_id,
                    pl.type AS parent_link_type,
                    pe.title AS parent_title,
                    ${TASK_PARENT_IDENTITY_COLUMNS},
                    ${sortSpec.expr} AS sort_value
             FROM entities e
             JOIN spine_records sr
               ON sr.workspace_id = e.workspace_id AND sr.entity_id = e.id
             LEFT JOIN task_details td
               ON td.workspace_id = e.workspace_id AND td.entity_id = e.id
             ${TASK_RECURRENCE_JOIN}
             JOIN entity_links pl
               ON pl.workspace_id = e.workspace_id AND pl.source_entity_id = e.id
                  AND pl.deleted_at IS NULL
                  AND pl.type = '${TASK_BELONGS_TO_PROJECT}'
                  AND pl.target_entity_id IN (${marks})
             JOIN entities pe
               ON pe.workspace_id = e.workspace_id AND pe.id = pl.target_entity_id
                  AND pe.type = '${PROJECT}' AND pe.deleted_at IS NULL
             ${TASK_PARENT_IDENTITY_JOIN}
             ${WAITING_TARGET_JOIN}
             CROSS JOIN (SELECT ? AS today_iso, ? AS week_end) cal
             WHERE e.workspace_id = ? AND e.type = '${TASK}'
               AND e.deleted_at IS NULL${whereSql}
           ),
           ranked AS (
             SELECT *,
                    ROW_NUMBER() OVER (
                      PARTITION BY parent_id
                      ORDER BY sort_value ASC, created_at ASC, id ASC
                    ) AS rn
             FROM scoped
           )
           SELECT * FROM ranked WHERE rn = 1`,
        )
        .bind(
          this.#workspaceId,
          ...chunk,
          todayIso,
          weekEnd,
          this.#workspaceId,
          ...params,
        );

      const result = await this.#run(statement);
      const rows = (result.results ?? []) as (TaskListRow & {
        readonly parent_id: string | null;
      })[];
      for (const row of rows) {
        if (row.parent_id === null) continue;
        nextActions.set(row.parent_id, this.#toTaskListItem(row));
      }
    }

    return nextActions;
  }

  async listTaskDelegates(limit = 50): Promise<readonly string[]> {
    const bounded = Math.min(Math.max(1, limit), 200);
    const result = await this.#run(
      this.#db
        .prepare(
          `SELECT DISTINCT td.delegate_to AS delegate
           FROM task_details td
           JOIN entities e
             ON e.workspace_id = td.workspace_id AND e.id = td.entity_id
                AND e.type = '${TASK}' AND e.deleted_at IS NULL
           WHERE td.workspace_id = ? AND td.delegate_to IS NOT NULL
           ORDER BY lower(td.delegate_to) ASC
           LIMIT ?`,
        )
        .bind(this.#workspaceId, bounded),
    );
    return ((result.results ?? []) as { readonly delegate: string }[]).map(
      (row) => row.delegate,
    );
  }

  async searchTaskParents(
    input: SearchTaskParentsInput = {},
  ): Promise<readonly TaskParentCandidate[]> {
    const limit = Math.min(
      Math.max(1, input.limit ?? TASK_PARENT_SEARCH_LIMIT),
      TASK_PARENT_SEARCH_MAX,
    );
    // Case-insensitive substring match. The shared helper escapes LIKE
    // metacharacters and bounds the pattern to D1's 50-byte LIKE limit.
    const needle = (input.query ?? "").trim().toLocaleLowerCase();
    const pattern = likeContains(needle);

    // Indexed, workspace-scoped search over the WHOLE collection (never a fixed
    // prefix scan): active Areas and NON-ARCHIVED Projects whose title matches, so a
    // newer parent in a long-lived workspace is always found (ADR-043 §9 / decision
    // 13). Deterministic order: Projects first (the preferred parent), then title,
    // then id. The type slugs are trusted kernel constants, never caller data.
    /*
     * TODAY-TASK-01 / DEBT-144 — a candidate carries its IDENTITY too.
     *
     * The row's inline project editor paints the chosen parent OPTIMISTICALLY,
     * from the option the owner picked, and everything the option does not carry
     * is a fact the row loses until the revalidation answers. Without identity
     * here, re-filing a task made its mark flash neutral and then come back
     * coloured — half a second of the exact "some rows carry identity and some do
     * not" reading DEBT-144 refused to ship. The CTE is the same one the task
     * list reads its parents' identity from, so the option and the row cannot
     * disagree about what colour a Project is.
     */
    const statement = this.#db
      .prepare(
        `WITH ${TASK_PARENT_IDENTITY_CTE}
         SELECT e.id AS id, e.type AS type, e.title AS title,
                pi.icon_key AS icon_key,
                pi.colour_slot AS colour_slot,
                pi.colour_rank AS colour_rank
         FROM entities e
         LEFT JOIN project_details pd
           ON pd.workspace_id = e.workspace_id AND pd.entity_id = e.id
         LEFT JOIN task_parent_identity pi ON pi.id = e.id
         WHERE e.workspace_id = ?
           AND e.type IN ('${AREA}', '${PROJECT}')
           AND e.deleted_at IS NULL
           AND (e.type <> '${PROJECT}' OR pd.archived_at IS NULL)
           AND lower(e.title) LIKE ? ESCAPE '\\'
         ORDER BY CASE e.type WHEN '${PROJECT}' THEN 0 ELSE 1 END,
                  lower(e.title) ASC, e.id ASC
         LIMIT ?`,
      )
      .bind(this.#workspaceId, this.#workspaceId, pattern, limit);

    const result = await this.#run(statement);
    const rows = (result.results ?? []) as {
      readonly id: string;
      readonly type: string;
      readonly title: string;
      readonly icon_key: string | null;
      readonly colour_slot: string | null;
      readonly colour_rank: number | null;
    }[];
    return rows.map((row) => ({
      id: row.id,
      kind: row.type === AREA ? "area" : "project",
      title: row.title,
      iconKey: row.icon_key,
      colourSlot: row.colour_slot,
      colourRank: row.colour_rank === null ? null : Number(row.colour_rank),
    }));
  }

  async getTaskParentCandidate(
    id: string,
  ): Promise<TaskParentCandidate | null> {
    const parentId = validateTaskId(id);
    const row = await this.#db
      .prepare(
        `SELECT e.id AS id, e.type AS type, e.title AS title
         FROM entities e
         LEFT JOIN project_details pd
           ON pd.workspace_id = e.workspace_id AND pd.entity_id = e.id
         WHERE e.workspace_id = ?
           AND e.id = ?
           AND e.type IN ('${AREA}', '${PROJECT}')
           AND e.deleted_at IS NULL
           AND (e.type <> '${PROJECT}' OR pd.archived_at IS NULL)
         LIMIT 1`,
      )
      .bind(this.#workspaceId, parentId)
      .first<{
        readonly id: string;
        readonly type: string;
        readonly title: string;
      }>();
    return row
      ? {
          id: row.id,
          kind: row.type === AREA ? "area" : "project",
          title: row.title,
        }
      : null;
  }

  /**
   * The single primary sort expression + direction for a workspace-tasks sort.
   *
   * TASKS-03 adds an explicit `direction`. `natural` keeps each sort's documented
   * default (due-date ascending, updated descending, smart most-relevant-first);
   * `asc`/`desc` override it. `smart` deliberately IGNORES a requested reversal —
   * "least relevant first" is not a useful order, and silently producing one would
   * make the default view unpredictable — so a reversal is offered in the UI only
   * for the sorts where it is meaningful.
   */
  #workspaceSortSpec(
    sort: string,
    direction: "natural" | "asc" | "desc" = "natural",
  ): { expr: string; dir: "ASC" | "DESC" } {
    const oriented = (
      expr: string,
      natural: "ASC" | "DESC",
    ): { expr: string; dir: "ASC" | "DESC" } => ({
      expr,
      dir:
        direction === "asc" ? "ASC" : direction === "desc" ? "DESC" : natural,
    });
    switch (sort) {
      case "due_date":
        return oriented("COALESCE(td.due_date, '9999-99-99')", "ASC");
      case "scheduled_date":
        return oriented("COALESCE(td.scheduled_date, '9999-99-99')", "ASC");
      case "priority":
        return oriented("COALESCE(td.priority, 'p9')", "ASC");
      case "created":
        return oriented("e.created_at", "ASC");
      case "updated":
        return oriented("e.updated_at", "DESC");
      case "completed": {
        /*
         * V2.7 RECALL-02 — COMPLETION TIME, from the one authority.
         *
         * `sr.completed_at` is already joined by this query (the `smart` order
         * reads it), so the sort is one more ORDER BY arm over the existing
         * statement rather than a new join, a new column or a second truth
         * (ADR-114 decision 4). It is a UTC ISO-8601 instant, which sorts
         * correctly as text.
         *
         * Natural direction is DESC — most recently completed first, which is
         * what the Completed view has always CLAIMED to show. A Task that has
         * never been completed has no place in a completion order at all, so the
         * sentinel FLIPS with the direction to keep it last under both, exactly
         * as `parent` keeps unparented Tasks last: an empty string sorts below
         * every timestamp (last under DESC) and `￿` above every one (last
         * under ASC). Reversing the order must never promote "not finished" to
         * the head of a list of finished work.
         */
        const dir = direction === "asc" ? "ASC" : "DESC";
        const sentinel = dir === "DESC" ? "" : "\uffff";
        return { expr: `COALESCE(sr.completed_at, '${sentinel}')`, dir };
      }
      case "title":
        return oriented("lower(e.title)", "ASC");
      case "parent": {
        // Parent title, with UNPARENTED tasks last under BOTH directions: the
        // sentinel flips with the direction, so reversing A→Z never promotes "no
        // parent" to the top of the list where it would read as a group heading.
        const dir = direction === "desc" ? "DESC" : "ASC";
        const sentinel = dir === "DESC" ? "" : "￿";
        return {
          expr: `lower(COALESCE(pe.title, '${sentinel}'))`,
          dir,
        };
      }
      case "smart":
      default:
        // Smart order, as ONE comparable string so it keysets as a single column
        // (ADR-043 §11 / decision 14). Segments, most-significant first:
        //   1. open (0) before completed (1);
        //   2. among OPEN tasks, OVERDUE (0) before non-overdue (1) — overdue means
        //      an open task whose due date is strictly before the owner's calendar
        //      day (`cal.today_iso`, bound once via the CROSS JOIN; due-TODAY is not
        //      overdue). Completed tasks are forced non-overdue so they never lead.
        //   3. priority P1..P4 (nulls → 'p9', last);
        //   4. due date ascending (nulls → '9999-99-99', last).
        // `cal.today_iso` is a joined column, not a bind placeholder, so this expr
        // stays param-free and reusable in SELECT, the keyset WHERE, and ORDER BY.
        return {
          expr:
            `(CASE WHEN sr.completed_at IS NULL THEN '0' ELSE '1' END` +
            ` || '|' || ` +
            `CASE WHEN sr.completed_at IS NULL AND td.due_date IS NOT NULL` +
            ` AND td.due_date < cal.today_iso THEN '0' ELSE '1' END` +
            ` || '|' || COALESCE(td.priority, 'p9')` +
            ` || '|' || COALESCE(td.due_date, '9999-99-99'))`,
          dir: "ASC",
        };
    }
  }

  /**
   * The ACTIVE PLANNING scope predicate (no bind params): actionable-now work only —
   * not completed, not cancelled, not Someday/Maybe, not waiting and not on_hold. The
   * single source for the `active` system view AND the Matrix/Sectors grouping query,
   * so both scope planning buckets identically (ADR-043 §11).
   */
  get #activePlanningWhere(): string {
    return (
      "sr.completed_at IS NULL" +
      " AND COALESCE(td.status, 'todo') NOT IN ('cancelled', 'on_hold')" +
      " AND COALESCE(td.commitment_state, 'active') <> 'someday'" +
      " AND td.waiting_since IS NULL"
    );
  }

  /**
   * Append the WHERE fragments for a system view (ADR-043 §5–§6). Active-execution
   * views exclude completed, cancelled and someday; the three DATE views
   * (Today/Upcoming/Overdue) additionally exclude the parked states, waiting and
   * on-hold (TODAY-10); the terminal/parked views select exactly their state; `all`
   * is every non-deleted task.
   */
  /**
   * The LIFECYCLE predicate of a workspace read: ordinary views see live Tasks, and
   * the `deleted` view sees exactly the soft-deleted ones (TASKS-06).
   *
   * It is a fixed literal chosen from the already-validated view name — never caller
   * text — and it is the ONE place the lifecycle boundary of the workspace collection
   * is expressed, so the flat list and the grouped query can never disagree about
   * which Tasks exist.
   */
  #taskLifecycleWhere(view: string): string {
    return view === "deleted"
      ? "e.deleted_at IS NOT NULL"
      : "e.deleted_at IS NULL";
  }

  #appendViewClause(
    view: string,
    todayIso: string,
    whereParts: string[],
    params: (string | number)[],
  ): void {
    const notTerminal =
      "sr.completed_at IS NULL AND COALESCE(td.status, 'todo') <> 'cancelled' AND COALESCE(td.commitment_state, 'active') <> 'someday'";
    /*
     * TODAY-10 — parked work is not DATED work.
     *
     * The three date-driven views (`today`/`upcoming`/`overdue`) already excluded
     * one parked state, `waiting`: a Task blocked on someone else is not the
     * owner's work today, and it has a view of its own. `on_hold` — a Task the
     * owner deliberately paused — is the same kind of state and was NOT excluded,
     * which left one Task in two places at once: `/tasks?system=today` counted it
     * and Today's Focus panel did not (Today reads `listPlanningTasks`, which has
     * excluded `on_hold` since TASKS-04 resolved DEBT-37 by "deciding the intent
     * once"). Measured on the heavy fixture with one on-hold Task due today,
     * `/tasks?system=today` said "14 Tasks" while Today's own figure — a link
     * straight to that view — said 12.
     *
     * That decision is honoured here rather than reversed: the exclusion moves to
     * the canonical view, so the two surfaces agree by construction and there is
     * still exactly one rule. It applies to the DATE views alone. `inbox` is about
     * FILING, not dating — a paused unfiled Task still needs a home — which is why
     * `waiting` was never excluded from it either.
     */
    const notParked =
      "td.waiting_since IS NULL AND COALESCE(td.status, 'todo') <> 'on_hold'";
    switch (view) {
      case "all":
        return;
      case "deleted":
        // The lifecycle predicate (`#taskLifecycleWhere`) already restricted the
        // population to soft-deleted Tasks; nothing further narrows it, so every
        // deleted Task — completed, cancelled, parked or ordinary — is restorable.
        return;
      case "open":
        /*
         * PLAN-01 — the OPEN scope: still committed, not yet finished.
         *
         * `notTerminal` alone, which is the whole definition: completed,
         * cancelled and Someday/Maybe are out; waiting and on_hold stay IN,
         * because a Task blocked on someone else is still a commitment the
         * owner made and a week that hides it is a week that lies. It is the
         * one view of the fifteen that keeps the parked states.
         */
        whereParts.push(notTerminal);
        return;
      case "active":
        // The ACTIVE PLANNING scope (Matrix/Sectors, ADR-043 §11): actionable-now
        // work only. Beyond completed/cancelled/someday it ALSO excludes the parked/
        // blocked states — waiting (blocked on someone else) and on_hold (paused) —
        // so neither clutters a sector bucket. They stay reachable via
        // `all`, the `waiting` view and the status filter.
        whereParts.push(this.#activePlanningWhere);
        return;
      case "completed":
        whereParts.push("sr.completed_at IS NOT NULL");
        return;
      case "cancelled":
        whereParts.push(
          "sr.completed_at IS NULL AND COALESCE(td.status, 'todo') = 'cancelled'",
        );
        return;
      case "someday":
        whereParts.push(
          "sr.completed_at IS NULL AND COALESCE(td.commitment_state, 'active') = 'someday'",
        );
        return;
      case "waiting":
        whereParts.push(
          "sr.completed_at IS NULL AND td.waiting_since IS NOT NULL AND COALESCE(td.commitment_state, 'active') <> 'someday'",
        );
        return;
      case "inbox":
        whereParts.push(`${notTerminal} AND pl.type IS NULL`);
        return;
      case "today":
        whereParts.push(
          `${notTerminal} AND ${notParked} AND (td.scheduled_date = ? OR td.due_date = ?)`,
        );
        params.push(todayIso, todayIso);
        return;
      case "upcoming":
        whereParts.push(
          `${notTerminal} AND ${notParked} AND ((td.scheduled_date IS NOT NULL AND td.scheduled_date > ?) OR (td.due_date IS NOT NULL AND td.due_date > ?))`,
        );
        params.push(todayIso, todayIso);
        return;
      case "overdue":
        whereParts.push(
          `${notTerminal} AND ${notParked} AND ((td.scheduled_date IS NOT NULL AND td.scheduled_date < ?) OR (td.due_date IS NOT NULL AND td.due_date < ?))`,
        );
        params.push(todayIso, todayIso);
        return;
      case "this_week":
      case "next_week":
      case "this_month":
      case "next_month":
      case "long_term":
      case "routines": {
        const sector = SECTOR_FOR_VIEW[view];
        whereParts.push(`${notTerminal} AND td.time_sector = ?`);
        params.push(sector);
        return;
      }
      default:
        return;
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Update                                                                 */
  /* ---------------------------------------------------------------------- */

  async updateTask(
    id: string,
    input: UpdateTaskInput,
  ): Promise<UpdateTaskResult> {
    const entityId = validateTaskId(id);

    const current = await this.getTask(entityId);
    if (!current) {
      throw new TaskNotFoundError();
    }
    await this.#rejectIfParentProjectArchived(current);

    // Normalise and validate every provided field at the boundary before writing.
    const afterTitle =
      input.title === undefined
        ? current.title
        : validateTaskTitle(input.title);
    const afterStatus =
      input.status === undefined
        ? current.status
        : validateTaskStatus(input.status);
    const afterPriority =
      input.priority === undefined
        ? current.priority
        : validateTaskPriority(input.priority);
    const afterDue =
      input.dueDate === undefined
        ? current.dueDate
        : validateTaskDate(input.dueDate, "dueDate");
    const afterScheduled =
      input.scheduledDate === undefined
        ? current.scheduledDate
        : validateTaskDate(input.scheduledDate, "scheduledDate");
    const afterDescription: MarkdownSource | null =
      input.description === undefined
        ? current.description
        : validateTaskDescription(input.description);
    const afterSector =
      input.timeSector === undefined
        ? current.timeSector
        : validateTimeSector(input.timeSector);
    const afterCommitment =
      input.commitmentState === undefined
        ? current.commitmentState
        : validateCommitmentState(input.commitmentState);
    const afterDelegation: TaskDelegation | null =
      input.delegation === undefined
        ? current.delegation
        : validateDelegationInput(input.delegation);
    // V2.6 FIND-03 — the ONE tag validator, and the ONE vocabulary behind it.
    const afterTags =
      input.tags === undefined ? null : validateTaskTagSet(input.tags);

    // Only fields that ACTUALLY changed are written; a field the caller did not
    // change is never touched, so a concurrent partial update to a DIFFERENT field
    // cannot be clobbered by this update's stale snapshot (the "omitted fields are
    // left unchanged" contract holds under concurrency).
    const titleChanged = afterTitle !== current.title;
    const statusChanged = afterStatus !== current.status;
    const priorityChanged = afterPriority !== current.priority;
    const dueChanged = afterDue !== current.dueDate;
    const scheduledChanged = afterScheduled !== current.scheduledDate;
    const descriptionChanged =
      (afterDescription ?? null) !== (current.description ?? null);
    const sectorChanged = afterSector !== current.timeSector;
    const commitmentChanged = afterCommitment !== current.commitmentState;
    const delegationChanged = !delegationEquals(
      current.delegation,
      afterDelegation,
    );
    /*
     * Tags are compared by canonical KEY, never by label: a Task carries tag
     * IDENTITIES, and the label it displays belongs to the workspace vocabulary.
     * Re-submitting `ERRAND` for a Task already tagged `Errand` changes nothing,
     * and must not record an Activity event saying it did.
     */
    const tagsChanged =
      afterTags !== null &&
      (afterTags.length !== current.tags.length ||
        !afterTags.every((tag) =>
          current.tags.some((label) => canonicalTagKey(label) === tag.key),
        ));

    const changes: Record<string, JsonValue> = {};
    if (titleChanged) {
      changes["title"] = { before: current.title, after: afterTitle };
    }
    if (statusChanged) {
      changes["status"] = { before: current.status, after: afterStatus };
    }
    if (priorityChanged) {
      changes["priority"] = { before: current.priority, after: afterPriority };
    }
    if (dueChanged) {
      changes["dueDate"] = { before: current.dueDate, after: afterDue };
    }
    if (scheduledChanged) {
      changes["scheduledDate"] = {
        before: current.scheduledDate,
        after: afterScheduled,
      };
    }
    if (sectorChanged) {
      changes["timeSector"] = {
        before: current.timeSector,
        after: afterSector,
      };
    }
    if (commitmentChanged) {
      changes["commitmentState"] = {
        before: current.commitmentState,
        after: afterCommitment,
      };
    }
    // Never dump description or the (possibly sensitive) delegatee/note content
    // into the payload — only note that it changed (ADR-043 §8).
    if (descriptionChanged) {
      changes["descriptionChanged"] = true;
    }
    if (delegationChanged) {
      changes["delegationChanged"] = true;
    }
    // A tag can name something private, so the COUNT travels and the text does
    // not — the same rule `note.tags_updated` follows (ADR-043 §8).
    if (tagsChanged) {
      changes["tagsChanged"] = true;
    }

    const detailChanged =
      statusChanged ||
      priorityChanged ||
      dueChanged ||
      scheduledChanged ||
      descriptionChanged ||
      sectorChanged ||
      commitmentChanged ||
      delegationChanged;

    if (!titleChanged && !detailChanged && !tagsChanged) {
      // A no-op update: nothing changes, no `updated_at` churn, no Activity.
      return { task: current, changed: false };
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);

    // 1. The guarded domain statement: bump the active task's `updated_at`, and set
    //    the title ONLY when it changed (so an unchanged title is never rewritten
    //    over a concurrent rename). Gated on the task's PARENT PROJECT (if any)
    //    not being archived (ADR-037) — a title/detail edit under an archived
    //    Project is read-only.
    const entityStmt = titleChanged
      ? this.#db
          .prepare(
            `UPDATE entities SET title = ?, updated_at = ?
             WHERE id = ? AND workspace_id = ? AND type = '${TASK}' AND deleted_at IS NULL
               AND ${this.#taskParentProjectNotArchivedSql}
             RETURNING ${ENTITY_RETURNING}`,
          )
          .bind(
            afterTitle,
            nowTs,
            entityId,
            this.#workspaceId,
            this.#workspaceId,
            entityId,
          )
      : this.#db
          .prepare(
            `UPDATE entities SET updated_at = ?
             WHERE id = ? AND workspace_id = ? AND type = '${TASK}' AND deleted_at IS NULL
               AND ${this.#taskParentProjectNotArchivedSql}
             RETURNING ${ENTITY_RETURNING}`,
          )
          .bind(
            nowTs,
            entityId,
            this.#workspaceId,
            this.#workspaceId,
            entityId,
          );

    // 2. Upsert the additive details — but ON CONFLICT update ONLY the columns that
    //    changed (plus `updated_at`), so an omitted/unchanged column keeps its DB
    //    value even if a concurrent update changed it. The INSERT (new-row) branch
    //    supplies every column (unchanged ones = current/defaults), and is gated on
    //    the task still being active (and its parent Project not archived) so a
    //    racing delete or archive writes nothing. The SET fragments are fixed,
    //    trusted column literals — never caller data.
    let detailsStmt: D1PreparedStatement | undefined;
    if (detailChanged) {
      const setParts: string[] = [];
      if (statusChanged) setParts.push("status = excluded.status");
      if (priorityChanged) setParts.push("priority = excluded.priority");
      if (dueChanged) setParts.push("due_date = excluded.due_date");
      if (scheduledChanged)
        setParts.push("scheduled_date = excluded.scheduled_date");
      if (sectorChanged) setParts.push("time_sector = excluded.time_sector");
      if (commitmentChanged)
        setParts.push("commitment_state = excluded.commitment_state");
      if (delegationChanged) {
        setParts.push("delegate_to = excluded.delegate_to");
        setParts.push("delegated_on = excluded.delegated_on");
        setParts.push("follow_up_on = excluded.follow_up_on");
        setParts.push("delegate_note = excluded.delegate_note");
      }
      if (descriptionChanged)
        setParts.push("description = excluded.description");
      setParts.push("updated_at = excluded.updated_at");

      detailsStmt = this.#db
        .prepare(
          `INSERT INTO task_details
             (workspace_id, entity_id, entity_type, status, priority,
              due_date, scheduled_date, time_sector, commitment_state,
              delegate_to, delegated_on, follow_up_on, delegate_note,
              description, updated_at)
           SELECT ?, ?, '${TASK}', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
           WHERE EXISTS (
                   SELECT 1 FROM entities
                   WHERE workspace_id = ? AND id = ? AND type = '${TASK}'
                     AND deleted_at IS NULL
                 )
             AND ${this.#taskParentProjectNotArchivedSql}
           ON CONFLICT (workspace_id, entity_id) DO UPDATE SET
             ${setParts.join(",\n             ")}`,
        )
        .bind(
          this.#workspaceId,
          entityId,
          afterStatus,
          afterPriority,
          afterDue,
          afterScheduled,
          afterSector,
          afterCommitment,
          afterDelegation?.to ?? null,
          afterDelegation?.delegatedOn ?? null,
          afterDelegation?.followUpOn ?? null,
          afterDelegation?.note ?? null,
          afterDescription,
          nowTs,
          this.#workspaceId,
          entityId,
          this.#workspaceId,
          entityId,
        );
    }

    const event: NewActivityEvent = {
      type: ENTITY_UPDATED,
      subjects: [{ entityId, role: SUBJECT_ROLE }],
      payload: { entityType: TASK, changes },
    };

    const entityRow = await this.#runUpdate(
      entityStmt,
      event,
      detailsStmt,
      now,
      // V2.6 FIND-03 — the tag write joins the SAME atomic batch, guarded on the
      // Activity event this update appends, so a Task's tags change if and only
      // if the Task genuinely changed and the change was recorded.
      tagsChanged && afterTags !== null
        ? (activityId) =>
            buildEntityTagStatements({
              db: this.#db,
              workspaceId: this.#workspaceId,
              entityId,
              tags: afterTags,
              now: nowTs,
              activityId,
            })
        : undefined,
    );
    if (!entityRow) {
      // The guarded update matched nothing: the task was deleted between the read
      // and the write. Nothing was written or recorded.
      throw new TaskNotFoundError();
    }

    // Relationships and completion are unchanged by an edit — reuse the read view,
    // applying the changed fields.
    return {
      task: {
        ...current,
        title: entityRow.title,
        updatedAt: fromStorageTimestamp(entityRow.updated_at),
        status: afterStatus,
        priority: afterPriority,
        dueDate: afterDue,
        scheduledDate: afterScheduled,
        timeSector: afterSector,
        commitmentState: afterCommitment,
        delegation: afterDelegation,
        recurrence: current.recurrence,
        recurrenceSeries: current.recurrenceSeries,
        description: afterDescription,
        // The vocabulary keeps the FIRST spelling of a tag, which may be one
        // another record introduced, so the labels are re-read rather than
        // assumed from what was submitted.
        tags: tagsChanged ? await this.#readTags(entityId) : current.tags,
      },
      changed: true,
    };
  }

  /**
   * Read one Task's tag labels, in canonical order.
   *
   * One bounded statement, used only after a tag WRITE — every ordinary read
   * gets its tags from the projection in `TASK_DETAIL_COLUMNS` and costs no
   * extra statement at all.
   */
  async #readTags(entityId: string): Promise<readonly string[]> {
    const result = await this.#run(
      entityTagsStatement(this.#db, this.#workspaceId, entityId),
    );
    const row = (result.results ?? [])[0] as
      { tags: string | null } | undefined;
    return parseTagProjection(row?.tags ?? null);
  }

  /* ---------------------------------------------------------------------- */
  /* Waiting (TODAY-03)                                                      */
  /* ---------------------------------------------------------------------- */

  async setWaiting(
    id: string,
    input: SetWaitingInput,
  ): Promise<SetWaitingResult> {
    const entityId = validateTaskId(id);
    const subject = validateSetWaitingInput(input);

    const current = await this.getTask(entityId);
    if (!current) {
      throw new TaskNotFoundError();
    }
    await this.#rejectIfParentProjectArchived(current);

    // Resolve + validate an entity target BEFORE writing (active, in-workspace,
    // allowed type, not the task itself). A missing/cross-workspace/deleted target
    // resolves to null and is rejected as invalid input — never disclosed as a
    // cross-workspace existence.
    let target: { id: string; type: string; title: string } | null = null;
    if (subject.kind === "entity") {
      if (subject.targetId === entityId) {
        throw new TaskValidationError(
          "waitingTargetId",
          "a task cannot wait on itself",
        );
      }
      target = await this.#resolveWaitingTarget(subject.targetId);
      if (!target) {
        throw new TaskValidationError(
          "waitingTargetId",
          "that record is not available to wait on",
        );
      }
      if (!isWaitingTargetType(target.type)) {
        throw new TaskValidationError(
          "waitingTargetId",
          "you can only wait on a person, project, goal, area or task",
        );
      }
    }

    // Detect a no-op: the identical subject is already the active waiting subject.
    const before = current.waiting;
    if (before !== null && this.#sameSubject(before, subject)) {
      return { task: current, changed: false };
    }

    const isStart = before === null;
    // Changing only the subject preserves the original `since` (same episode).
    const since = isStart ? this.#clock() : before.since;
    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const sinceTs = toStorageTimestamp(since);
    const note = subject.kind === "text" ? subject.note : null;

    // 1. Guard anchor: bump the ACTIVE task's `updated_at` (RETURNING).
    const entityStmt = this.#bumpEntityStatement(entityId, nowTs);

    // 2. Upsert the waiting state onto `task_details` (gated on the active task).
    //    Every value is bound in ONE bind() call (D1 replaces on each bind()).
    const detailsStmt = this.#db
      .prepare(
        `INSERT INTO task_details
           (workspace_id, entity_id, entity_type, status, priority,
            due_date, scheduled_date, description, waiting_since, waiting_note,
            updated_at)
         SELECT ?, ?, '${TASK}', ?, ?, ?, ?, ?, ?, ?, ?
         WHERE EXISTS (${this.#activeTaskExistsSql})
         ON CONFLICT (workspace_id, entity_id) DO UPDATE SET
           waiting_since = excluded.waiting_since,
           waiting_note = excluded.waiting_note,
           updated_at = excluded.updated_at`,
      )
      .bind(
        this.#workspaceId,
        entityId,
        current.status,
        current.priority,
        current.dueDate,
        current.scheduledDate,
        current.description,
        sinceTs,
        note,
        nowTs,
        this.#workspaceId,
        entityId,
        this.#workspaceId,
        entityId,
      );

    // 3. Replace the active `task.waiting_on` link (entity subject) or clear it
    //    (text subject): soft-delete any active waiting link FIRST, then create/
    //    restore the new one.
    const linkStmts = this.#waitingLinkStatements(
      entityId,
      subject.kind === "entity" ? subject.targetId : null,
      nowTs,
    );

    const event: NewActivityEvent = {
      type: isStart ? TASK_WAITING_STARTED : TASK_WAITING_CHANGED,
      subjects: [{ entityId, role: SUBJECT_ROLE }],
      // Payload carries no free-text content — only the subject kind and, for an
      // entity, its (non-sensitive) type/id.
      payload:
        subject.kind === "entity"
          ? {
              entityType: TASK,
              subjectKind: "entity",
              targetType: target!.type,
              targetId: subject.targetId,
            }
          : { entityType: TASK, subjectKind: "text" },
    };

    const entityRow = await this.#runGuardedMutation(
      entityStmt,
      event,
      [detailsStmt, ...linkStmts],
      now,
    );
    if (!entityRow) {
      throw new TaskNotFoundError();
    }

    const waiting: TaskWaiting =
      subject.kind === "entity"
        ? {
            since,
            subject: {
              kind: "entity",
              id: target!.id,
              type: target!.type,
              title: target!.title,
            },
          }
        : { since, subject: { kind: "text", note: subject.note } };

    return {
      task: {
        ...current,
        updatedAt: fromStorageTimestamp(entityRow.updated_at),
        waiting,
      },
      changed: true,
    };
  }

  async clearWaiting(id: string): Promise<ClearWaitingResult> {
    const entityId = validateTaskId(id);

    const current = await this.getTask(entityId);
    if (!current) {
      throw new TaskNotFoundError();
    }
    await this.#rejectIfParentProjectArchived(current);
    if (current.waiting === null) {
      // Not waiting: idempotent no-op, no Activity.
      return { task: current, changed: false };
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);

    const entityStmt = this.#bumpEntityStatement(entityId, nowTs);

    // Clear the waiting state on `task_details` (only the waiting columns). Gated
    // on the active task whose parent Project (if any) is not archived — this
    // statement is independent of the anchor bump, so it needs its OWN gate.
    const detailsStmt = this.#db
      .prepare(
        `UPDATE task_details
         SET waiting_since = NULL, waiting_note = NULL, updated_at = ?
         WHERE workspace_id = ? AND entity_id = ?
           AND EXISTS (${this.#activeTaskExistsSql})`,
      )
      .bind(
        nowTs,
        this.#workspaceId,
        entityId,
        this.#workspaceId,
        entityId,
        this.#workspaceId,
        entityId,
      );

    // Soft-delete any active `task.waiting_on` link (gated on the active task).
    const linkStmts = this.#waitingLinkStatements(entityId, null, nowTs);

    const event: NewActivityEvent = {
      type: TASK_WAITING_CLEARED,
      subjects: [{ entityId, role: SUBJECT_ROLE }],
      payload: { entityType: TASK },
    };

    const entityRow = await this.#runGuardedMutation(
      entityStmt,
      event,
      [detailsStmt, ...linkStmts],
      now,
    );
    if (!entityRow) {
      throw new TaskNotFoundError();
    }

    return {
      task: {
        ...current,
        updatedAt: fromStorageTimestamp(entityRow.updated_at),
        waiting: null,
      },
      changed: true,
    };
  }

  /**
   * GOAL-02 — the created/completed counts per owner-calendar day.
   *
   * TWO aggregate statements for the whole window, each one bounded by the
   * window's outer instants so the `entities` and `spine_records` reads are
   * index ranges rather than workspace scans (0038 adds the `spine_records`
   * completion index this relies on). Every day is a `SUM(CASE ...)` column, so
   * the counts come back in one row and no rows are shipped to be bucketed here.
   *
   * The boundaries are the caller's, computed in the owner's timezone — this
   * method contains no timezone logic at all, which is what makes it exactly
   * testable and what stops a second calendar rule appearing in SQL.
   */
  async countTaskActivityByDay(
    input: ListTaskActivityInput,
  ): Promise<readonly TaskActivityDayCount[]> {
    const days = input.days.slice(0, TASK_ACTIVITY_MAX_DAYS);
    if (days.length === 0) return [];

    const windowStart = toStorageTimestamp(days[0]!.startsAt);
    const windowEnd = toStorageTimestamp(days[days.length - 1]!.endsAt);
    const bounds = days.flatMap((day) => [
      toStorageTimestamp(day.startsAt),
      toStorageTimestamp(day.endsAt),
    ]);
    const columns = (column: string) =>
      days
        .map(
          (_day, index) =>
            `SUM(CASE WHEN ${column} >= ? AND ${column} < ? THEN 1 ELSE 0 END) AS d${index}`,
        )
        .join(", ");

    type CountRow = Record<string, number | null>;
    try {
      const [created, completed] = await Promise.all([
        this.#db
          .prepare(
            `SELECT ${columns("created_at")}
             FROM entities
             WHERE workspace_id = ? AND type = '${TASK}' AND deleted_at IS NULL
                   AND created_at >= ? AND created_at < ?`,
          )
          .bind(...bounds, this.#workspaceId, windowStart, windowEnd)
          .first<CountRow>(),
        this.#db
          .prepare(
            `SELECT ${columns("sr.completed_at")}
             FROM spine_records sr
             JOIN entities e
               ON e.workspace_id = sr.workspace_id AND e.id = sr.entity_id
                  AND e.deleted_at IS NULL
             WHERE sr.workspace_id = ? AND sr.kind = '${TASK}'
                   AND sr.completed_at >= ? AND sr.completed_at < ?`,
          )
          .bind(...bounds, this.#workspaceId, windowStart, windowEnd)
          .first<CountRow>(),
      ]);

      return days.map((day, index) => ({
        dateIso: day.dateIso,
        created: Number(created?.[`d${index}`] ?? 0),
        completed: Number(completed?.[`d${index}`] ?? 0),
      }));
    } catch (cause) {
      throw new TaskStorageError(undefined, { cause });
    }
  }

  /**
   * V2.7 RECALL-02 — how many Tasks are CURRENTLY completed inside each window.
   *
   * ONE statement: a `SUM(CASE …)` column per window over a single
   * `spine_records` index range (migration 0038's
   * `spine_records_workspace_kind_completed_idx`), bounded by the outer
   * instants. Only the column ALIAS index is generated, and it is an integer
   * this method produced — every instant is bound.
   *
   * The predicate is deliberately IDENTICAL to the one the Completed collection
   * applies: this workspace, `kind = task`, a live entity, and
   * `completed_at` inside the window. A figure counted here and the list a
   * reader opens to check it therefore describe the same records — reopening a
   * Task or deleting it moves both, together. That is the whole reason this read
   * exists beside the Activity-derived `countPeriodCompletions`, which counts
   * EVENTS and is deliberately immutable for past periods (HARDEN-06C F-07).
   */
  async countCompletedTasksInWindows(
    windows: readonly CompletedTaskWindow[],
  ): Promise<readonly CompletedTaskWindowCount[]> {
    const wanted = windows.slice(0, TASK_ACTIVITY_MAX_DAYS);
    if (wanted.length === 0) return [];

    const bounds = wanted.flatMap((window) => [
      toStorageTimestamp(window.startsAt),
      toStorageTimestamp(window.endsAt),
    ]);
    // The outer range, so the scan is one index range rather than the
    // workspace's whole completion history. The windows a period surface asks
    // about need not be contiguous, so it is derived rather than assumed.
    const overallStart = bounds
      .filter((_value, index) => index % 2 === 0)
      .reduce((earliest, value) => (value < earliest ? value : earliest));
    const overallEnd = bounds
      .filter((_value, index) => index % 2 === 1)
      .reduce((latest, value) => (value > latest ? value : latest));
    const columns = wanted
      .map(
        (_window, index) =>
          `SUM(CASE WHEN sr.completed_at >= ? AND sr.completed_at < ? THEN 1 ELSE 0 END) AS d${index}`,
      )
      .join(", ");

    try {
      const row = await this.#db
        .prepare(
          `SELECT ${columns}
           FROM spine_records sr
           JOIN entities e
             ON e.workspace_id = sr.workspace_id AND e.id = sr.entity_id
                AND e.deleted_at IS NULL
           WHERE sr.workspace_id = ? AND sr.kind = '${TASK}'
                 AND sr.completed_at >= ? AND sr.completed_at < ?`,
        )
        .bind(...bounds, this.#workspaceId, overallStart, overallEnd)
        .first<Record<string, number | null>>();
      return wanted.map((window, index) => ({
        key: window.key,
        completed: Number(row?.[`d${index}`] ?? 0),
      }));
    } catch (cause) {
      throw new TaskStorageError(undefined, { cause });
    }
  }

  /**
   * V2.9 INS-01 — the completion SERIES: how many Tasks are currently completed
   * inside each bucket, in ONE statement whatever the window (DEBT-238).
   *
   * ── The same authority, read over a longer window ─────────────────────────
   * The predicate is character-for-character the sibling's above:
   * `spine_records.completed_at` inside the bucket, `kind = task`, live entity,
   * this workspace. It is the ONE completion-time truth (RECALL-02, ADR-114
   * decision 4), so a Task completed, reopened and completed again is counted
   * once — in the bucket its CURRENT completion falls in — and a deleted Task
   * is counted nowhere. Reading current state rather than events is what makes
   * both true, and it is why a Task series is never derived from
   * `task.completed` Activity, which survives both.
   *
   * ── Why a different SQL shape from the sibling ────────────────────────────
   * `countCompletedTasksInWindows` binds two parameters per window against
   * D1's 100-bound-variable ceiling, and is capped at fourteen accordingly. A
   * twelve-week, 52-week or 366-day series does not fit that shape at all. Here
   * the bucket boundaries travel as ONE bound JSON parameter expanded by
   * `json_each`, so the statement's shape is independent of the window: three
   * bound parameters for one bucket or for 366. The outer boundaries still
   * bound the scan to a single index range over
   * `spine_records_workspace_kind_completed_idx` (migration 0038), so the read
   * stays flat in workspace size — it touches the completions inside the
   * window, once, and nothing else.
   *
   * `LEFT JOIN` rather than an inner one, so a bucket in which nothing was
   * completed comes back as a zero rather than as an absent row: an absent
   * bucket is indistinguishable from a quiet one.
   */
  async countCompletedInBuckets(
    input: CountCompletedInBucketsInput,
  ): Promise<readonly CompletedTaskWindowCount[]> {
    // Refused rather than sliced: a series cut here would come back shorter
    // than the buckets it was asked for, and the surface would draw the cut as
    // the whole. The kernel's own bucketer never produces more than this.
    if (input.buckets.length > MAX_COMPLETION_BUCKETS) {
      throw new TaskValidationError(
        "buckets",
        `must hold at most ${MAX_COMPLETION_BUCKETS} buckets`,
      );
    }
    const buckets = input.buckets;
    if (buckets.length === 0) return [];

    // Only the bucket INDEX is generated into the JSON, and it is an integer
    // this method produced; every instant is bound.
    const boundaries = JSON.stringify(
      buckets.map((bucket, index) => [
        index,
        toStorageTimestamp(bucket.startsAt),
        toStorageTimestamp(bucket.endsAt),
      ]),
    );
    const overallStart = buckets
      .map((bucket) => toStorageTimestamp(bucket.startsAt))
      .reduce((earliest, value) => (value < earliest ? value : earliest));
    const overallEnd = buckets
      .map((bucket) => toStorageTimestamp(bucket.endsAt))
      .reduce((latest, value) => (value > latest ? value : latest));

    try {
      const { results } = await this.#db
        .prepare(
          `WITH b AS (
             SELECT CAST(json_extract(value, '$[0]') AS INTEGER) AS idx,
                    json_extract(value, '$[1]') AS start_at,
                    json_extract(value, '$[2]') AS end_at
             FROM json_each(?)
           )
           SELECT b.idx AS idx, COUNT(sr.entity_id) AS n
           FROM b
           LEFT JOIN spine_records sr
             ON sr.workspace_id = ? AND sr.kind = '${TASK}'
                AND sr.completed_at >= b.start_at
                AND sr.completed_at < b.end_at
                AND sr.completed_at >= ? AND sr.completed_at < ?
                AND EXISTS (
                  SELECT 1 FROM entities e
                  WHERE e.workspace_id = sr.workspace_id
                    AND e.id = sr.entity_id
                    AND e.deleted_at IS NULL
                )
           GROUP BY b.idx`,
        )
        .bind(boundaries, this.#workspaceId, overallStart, overallEnd)
        .all<{ idx: number; n: number }>();

      const byBucket = new Map(
        results.map((row) => [Number(row.idx), Number(row.n)]),
      );
      return buckets.map((bucket, index) => ({
        key: bucket.key,
        completed: byBucket.get(index) ?? 0,
      }));
    } catch (cause) {
      throw new TaskStorageError(undefined, { cause });
    }
  }

  /**
   * V2.7 RECALL-03 — the shared Waiting POPULATION predicate.
   *
   * The list and the count must describe the same set or the surface states a
   * number its own rows contradict, which is the DEBT-232 defect wearing a
   * different hat. So the membership rule is written once: an alive, incomplete
   * Task that is waiting on someone or something and is not parked in
   * Someday/Maybe.
   */
  static readonly #WAITING_POPULATION_SQL = `e.workspace_id = ? AND e.type = '${TASK}' AND e.deleted_at IS NULL
           AND sr.completed_at IS NULL AND td.waiting_since IS NOT NULL
           AND COALESCE(td.commitment_state, 'active') <> 'someday'`;

  /**
   * V2.7 RECALL-03 — the Waiting order, as ONE lexicographically-comparable key.
   *
   * The documented Waiting order is four facts deep (overdue first, then
   * longest-waiting, then dated-before-undated, then the due date itself) with
   * `e.id` as the tiebreaker that totalises it. A keyset resume over four levels
   * is a nest that is easy to get subtly wrong, so the four are projected into
   * one string and the query ORDERS BY that same expression — which is what
   * makes the resume predicate and the ordering the same rule by construction,
   * rather than two rules that must be kept in agreement.
   *
   * `char(1)` is the separator because it sorts BELOW every character an ISO
   * timestamp or a `YYYY-MM-DD` date can contain, so the concatenation compares
   * exactly as the tuple does whatever the field widths are. The owner's day
   * comes from the `cal` CROSS JOIN, so the expression costs no bind however
   * many times it appears.
   */
  static readonly #WAITING_SORT_SQL = `((CASE WHEN td.due_date IS NOT NULL AND td.due_date < cal.today_iso THEN '0' ELSE '1' END)
              || char(1) || td.waiting_since
              || char(1) || (CASE WHEN td.due_date IS NULL THEN '1' ELSE '0' END)
              || char(1) || COALESCE(td.due_date, ''))`;

  async listWaitingTasks(
    input: ListWaitingTasksInput = {},
  ): Promise<WaitingTaskPage> {
    const limit = validateTaskLimit(input.limit);
    // Empty string sorts before any real date, so with no `todayIso` nothing is
    // "overdue" and ordering falls to longest-waiting.
    const todayIso = input.todayIso ?? "";
    const followUp = validateTaskFollowUpState(input.followUp);

    const scope: WaitingTaskCursorScope = {
      workspaceId: this.#workspaceId,
      todayIso,
      followUp: followUp ?? "",
    };

    const whereParts: string[] = [];
    const params: (string | number)[] = [];
    if (followUp !== undefined) {
      // The ONE follow-up predicate, against the owner's day from `cal`.
      whereParts.push(followUpStatePredicate(followUp, "cal.today_iso"));
    }
    if (input.cursor !== undefined) {
      const position = decodeWaitingTaskCursorForScope(input.cursor, scope);
      whereParts.push(
        `(${D1TaskRepository.#WAITING_SORT_SQL} > ? OR (${D1TaskRepository.#WAITING_SORT_SQL} = ? AND e.id > ?))`,
      );
      params.push(position.sortValue, position.sortValue, position.id);
    }
    const whereSql =
      whereParts.length > 0 ? ` AND ${whereParts.join(" AND ")}` : "";

    // One row beyond the page decides whether a cursor is issued, without a
    // second COUNT and without ever claiming a total the page cannot show.
    const fetchLimit = limit + 1;

    const statement = this.#db
      .prepare(
        `WITH ${TASK_PARENT_IDENTITY_CTE}
         SELECT ${TASK_DETAIL_COLUMNS},
                ${WAITING_TARGET_COLUMNS},
                pl.target_entity_id AS parent_id,
                pl.type AS parent_link_type,
                pe.title AS parent_title,
                ${TASK_PARENT_IDENTITY_COLUMNS},
                ${D1TaskRepository.#WAITING_SORT_SQL} AS sort_value
         FROM entities e
         JOIN spine_records sr
           ON sr.workspace_id = e.workspace_id AND sr.entity_id = e.id
         JOIN task_details td
           ON td.workspace_id = e.workspace_id AND td.entity_id = e.id
         ${TASK_RECURRENCE_JOIN}
         LEFT JOIN entity_links pl
           ON pl.workspace_id = e.workspace_id AND pl.source_entity_id = e.id
              AND pl.deleted_at IS NULL AND pl.type IN (${TASK_PARENT_LINK_LIST})
         LEFT JOIN entities pe
           ON pe.workspace_id = e.workspace_id AND pe.id = pl.target_entity_id
              AND pe.deleted_at IS NULL
         ${TASK_PARENT_IDENTITY_JOIN}
         ${WAITING_TARGET_JOIN}
         CROSS JOIN (SELECT ? AS today_iso) cal
         WHERE ${D1TaskRepository.#WAITING_POPULATION_SQL}${whereSql}
         ORDER BY sort_value ASC, e.id ASC
         LIMIT ?`,
      )
      .bind(
        this.#workspaceId,
        todayIso,
        this.#workspaceId,
        ...params,
        fetchLimit,
      );

    const result = await this.#run(statement);
    const rows = (result.results ?? []) as (TaskWaitingJoinedRow & {
      readonly parent_title: string | null;
      readonly sort_value: string | null;
    } & Partial<TaskParentIdentityColumns>)[];
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const items: WaitingTaskListItem[] = [];
    for (const row of pageRows) {
      const waiting = rowToTaskWaiting(row);
      if (waiting === null) {
        continue;
      }
      /*
       * V2.8 CONV-02 — the SHARED list-item mapper, so the Waiting surface's
       * rows are the same shape every other Task surface renders. The
       * statement above already joins the recurrence rule, the parent identity
       * and the delegation group; the private mapper this replaced simply
       * threw them away, and the shared row would have had to be forked to do
       * without them. One statement, one mapper, no second read.
       */
      const item = this.#toTaskListItem(row);
      items.push({
        ...item,
        waiting,
        // V2.7 RECALL-03 — the chase date, so the surface can SAY why a row is
        // in a follow-up-filtered page instead of leaving the owner to open it.
        followUpOn: item.delegation?.followUpOn ?? null,
      });
    }
    // The cursor names the LAST ROW OF THE PAGE, which is the last row actually
    // returned — never the peeked row — so the next page resumes exactly after
    // what the owner has seen.
    const last = pageRows[pageRows.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeWaitingTaskCursor(scope, {
            sortValue: last.sort_value ?? "",
            id: last.id,
          })
        : null;
    return { items, nextCursor };
  }

  async countWaitingTasks(
    input: CountWaitingTasksInput = {},
  ): Promise<WaitingCounts> {
    const todayIso = input.todayIso ?? "";
    /*
     * V2.7 RECALL-03 — ONE bounded aggregate, and BOTH facts from it.
     *
     * This is the single definition behind Today's waiting row and the digest's
     * waiting and follow-up lines. Two things about its shape are load-bearing:
     *
     *   1. **It is asked of the database, not of a page.** Counting a bounded
     *      page in JavaScript is exactly how the old Waiting subtitle came to
     *      state a truncated number as fact, and the rail was doing the same
     *      thing with the same kind of read.
     *   2. **The total and the subset are counted over the SAME rows**, in one
     *      statement, with the follow-up subset as a conditional SUM. Reading
     *      them separately — an unbounded subset beside a page-length total —
     *      lets a workspace with more waiting work than the rail's page size
     *      print "50 waiting items · 100 follow-ups due", which is not merely
     *      wrong but impossible. Here the subset relationship is a property of
     *      the SQL rather than a convention two call sites must remember.
     *
     * Two binds, one row, whatever the workspace holds.
     */
    try {
      const row = await this.#db
        .prepare(
          `SELECT COUNT(*) AS total,
                  SUM(CASE WHEN ${followUpStatePredicate("due", "cal.today_iso")}
                           THEN 1 ELSE 0 END) AS follow_up_due
           FROM entities e
           JOIN spine_records sr
             ON sr.workspace_id = e.workspace_id AND sr.entity_id = e.id
           JOIN task_details td
             ON td.workspace_id = e.workspace_id AND td.entity_id = e.id
           CROSS JOIN (SELECT ? AS today_iso) cal
           WHERE ${D1TaskRepository.#WAITING_POPULATION_SQL}`,
        )
        .bind(todayIso, this.#workspaceId)
        .first<{
          readonly total: number | null;
          readonly follow_up_due: number | null;
        }>();
      return {
        total: Number(row?.total ?? 0),
        followUpDue: Number(row?.follow_up_due ?? 0),
      };
    } catch (cause) {
      throw new TaskStorageError(undefined, { cause });
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Planning (TODAY-04) — the scheduled date as the owner's commitment       */
  /* ---------------------------------------------------------------------- */

  async planTask(id: string, input: PlanTaskInput): Promise<PlanTaskResult> {
    const entityId = validateTaskId(id);
    const scheduledDate = validatePlanDate(input.scheduledDate);

    const current = await this.getTask(entityId);
    if (!current) {
      throw new TaskNotFoundError();
    }
    await this.#rejectIfParentProjectArchived(current);
    // Planning applies to OPEN work only: reject a completed task up front (and the
    // guarded write below re-checks, so a completion racing this call is also caught).
    this.#rejectIfCompleted(current);
    // Already planned for that exact date: idempotent no-op, no Activity.
    if (current.scheduledDate === scheduledDate) {
      return { task: current, changed: false };
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const group = this.#buildPlanGroup(entityId, current, scheduledDate, nowTs);

    await this.#planRaceHook?.();
    const entityRow = await this.#runGuardedMutation(
      group.entityStmt,
      group.event,
      group.domainStmts,
      now,
    );
    if (!entityRow) {
      // The open-gated guard matched nothing: the task was completed or deleted
      // between the read and the write. Nothing was written or recorded — reject.
      await this.#throwPlanGuardMiss(entityId);
    }
    return {
      task: {
        ...current,
        updatedAt: fromStorageTimestamp(entityRow!.updated_at),
        scheduledDate,
      },
      changed: true,
    };
  }

  async clearPlan(id: string): Promise<ClearPlanResult> {
    const entityId = validateTaskId(id);

    const current = await this.getTask(entityId);
    if (!current) {
      throw new TaskNotFoundError();
    }
    await this.#rejectIfParentProjectArchived(current);
    // Planning applies to OPEN work only: reject a completed task up front (and the
    // guarded write below re-checks, so a completion racing this call is also caught).
    this.#rejectIfCompleted(current);
    // No plan to clear: idempotent no-op, no Activity.
    if (current.scheduledDate === null) {
      return { task: current, changed: false };
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const group = this.#buildPlanGroup(entityId, current, null, nowTs);

    await this.#planRaceHook?.();
    const entityRow = await this.#runGuardedMutation(
      group.entityStmt,
      group.event,
      group.domainStmts,
      now,
    );
    if (!entityRow) {
      // The open-gated guard matched nothing: completed or deleted mid-flight — reject.
      await this.#throwPlanGuardMiss(entityId);
    }
    return {
      task: {
        ...current,
        updatedAt: fromStorageTimestamp(entityRow!.updated_at),
        scheduledDate: null,
      },
      changed: true,
    };
  }

  async planTasks(
    ids: readonly string[],
    input: PlanTaskInput,
  ): Promise<BulkPlanResult> {
    const scheduledDate = validatePlanDate(input.scheduledDate);
    return this.#bulkPlan(ids, scheduledDate);
  }

  async clearPlans(ids: readonly string[]): Promise<BulkPlanResult> {
    return this.#bulkPlan(ids, null);
  }

  /**
   * The shared bulk-planning path (plan-to-date or clear). Validates the id list,
   * resolves EVERY id to a task in this workspace (rejecting the WHOLE operation if
   * any is missing, so nothing is partially applied), then runs a single atomic
   * batch that changes only the tasks whose plan actually differs — each with its
   * own guarded Activity event. Tasks already in the requested state are counted as
   * `unchanged` and contribute no statements.
   */
  async #bulkPlan(
    ids: readonly string[],
    scheduledDate: string | null,
  ): Promise<BulkPlanResult> {
    const entityIds = validateTaskIdList(ids);

    // Resolve all first; ANY id that is missing/cross-workspace/deleted (→ not
    // found) OR completed (→ planning applies to open work) rejects the WHOLE
    // operation up front, so no partial plan is ever committed. The open-gated
    // per-task writes below are a second line of defence against a completion that
    // races the batch — that task's group then no-ops (no plan, no Activity).
    const currents: TaskView[] = [];
    for (const entityId of entityIds) {
      const current = await this.getTask(entityId);
      if (!current) {
        throw new TaskNotFoundError();
      }
      await this.#rejectIfParentProjectArchived(current);
      this.#rejectIfCompleted(current);
      currents.push(current);
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);

    await this.#planRaceHook?.();

    const statements: D1PreparedStatement[] = [];
    let changed = 0;
    let unchanged = 0;
    for (const current of currents) {
      if ((current.scheduledDate ?? null) === scheduledDate) {
        unchanged += 1;
        continue;
      }
      const group = this.#buildPlanGroup(
        current.id,
        current,
        scheduledDate,
        nowTs,
      );
      const model = buildActivityWriteModel(
        group.event,
        this.#actor.actor,
        this.#newActivityId(),
        now,
      );
      const eventStmts = this.#recorder.buildAppendStatements(
        this.#workspaceId,
        model,
      );
      // Per-task ordering [bump, activity, ...subjects, details]: the activity's
      // `changes() > 0` guard refers to the bump IMMEDIATELY before it, and each
      // group's own bump resets `changes()` for that group's activity — so many
      // guarded events compose correctly in one batch (mirrors `completeTask`).
      statements.push(group.entityStmt, ...eventStmts, ...group.domainStmts);
      changed += 1;
    }

    if (statements.length > 0) {
      try {
        await this.#db.batch(statements);
      } catch (cause) {
        if (cause instanceof ActivityError) {
          throw cause;
        }
        throw new TaskStorageError(undefined, { cause });
      }
    }

    return { changed, unchanged };
  }

  /* ---------------------------------------------------------------------- */
  /* Bulk field mutations (TASKS-01)                                          */
  /* ---------------------------------------------------------------------- */

  async setPriorityMany(
    ids: readonly string[],
    priority: TaskPriority | null,
  ): Promise<BulkFieldResult> {
    const value = validateTaskPriority(priority);
    return this.#bulkSetField(ids, {
      column: "priority",
      changesKey: "priority",
      value,
      currentOf: (t) => t.priority,
    });
  }

  async setSectorMany(
    ids: readonly string[],
    timeSector: TimeSector | null,
  ): Promise<BulkFieldResult> {
    const value = validateTimeSector(timeSector);
    return this.#bulkSetField(ids, {
      column: "time_sector",
      changesKey: "timeSector",
      value,
      currentOf: (t) => t.timeSector,
    });
  }

  async setCommitmentMany(
    ids: readonly string[],
    commitmentState: CommitmentState,
  ): Promise<BulkFieldResult> {
    const value = validateCommitmentState(commitmentState);
    return this.#bulkSetField(ids, {
      column: "commitment_state",
      changesKey: "commitmentState",
      value,
      currentOf: (t) => t.commitmentState,
    });
  }

  async setStatusMany(
    ids: readonly string[],
    status: TaskStatus,
  ): Promise<BulkFieldResult> {
    const value = validateTaskStatus(status);
    return this.#bulkSetField(ids, {
      column: "status",
      changesKey: "status",
      value,
      currentOf: (t) => t.status,
    });
  }

  async setDueDateMany(
    ids: readonly string[],
    dueDate: string | null,
  ): Promise<BulkFieldResult> {
    // The DUE date is a deadline and is kept strictly separate from the scheduled
    // (planned) date (ADR-043 §3): this writes `due_date` only and can never
    // silently move a task's plan. It runs through the SAME atomic, guarded bulk
    // path as every other field, so a list-level "Due today" produces exactly the
    // Activity the Drawer's own due-date edit produces.
    const value = validateTaskDate(dueDate, "dueDate");
    return this.#bulkSetField(ids, {
      column: "due_date",
      changesKey: "dueDate",
      value,
      currentOf: (t) => t.dueDate,
    });
  }

  /**
   * The shared bulk single-field path (TASKS-01). Validates the id list, resolves
   * EVERY id to a task in this workspace (rejecting the WHOLE operation if any is
   * missing/archived, so nothing is partially applied), then runs ONE atomic batch
   * that changes only the tasks whose value actually differs — each with its own
   * guarded `entity.updated` event (payload records the field's before/after; never
   * free text). Tasks already at the value are counted `unchanged`.
   */
  async #bulkSetField(
    ids: readonly string[],
    field: {
      readonly column:
        "priority" | "time_sector" | "commitment_state" | "status" | "due_date";
      readonly changesKey: string;
      readonly value: string | null;
      readonly currentOf: (task: TaskView) => string | null;
    },
  ): Promise<BulkFieldResult> {
    const entityIds = validateTaskIdList(ids);

    const currents: TaskView[] = [];
    for (const entityId of entityIds) {
      const current = await this.getTask(entityId);
      if (!current) {
        throw new TaskNotFoundError();
      }
      await this.#rejectIfParentProjectArchived(current);
      currents.push(current);
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);

    const statements: D1PreparedStatement[] = [];
    let changed = 0;
    let unchanged = 0;
    for (const current of currents) {
      const before = field.currentOf(current);
      if ((before ?? null) === (field.value ?? null)) {
        unchanged += 1;
        continue;
      }
      const entityStmt = this.#bumpEntityStatement(current.id, nowTs);
      const event: NewActivityEvent = {
        type: ENTITY_UPDATED,
        subjects: [{ entityId: current.id, role: SUBJECT_ROLE }],
        payload: {
          entityType: TASK,
          changes: { [field.changesKey]: { before, after: field.value } },
        },
      };
      const model = buildActivityWriteModel(
        event,
        this.#actor.actor,
        this.#newActivityId(),
        now,
      );
      const eventStmts = this.#recorder.buildAppendStatements(
        this.#workspaceId,
        model,
      );
      const detailsStmt = this.#fieldUpsertStatement(
        current,
        field.column,
        field.value,
        nowTs,
      );
      statements.push(entityStmt, ...eventStmts, detailsStmt);
      changed += 1;
    }

    if (statements.length > 0) {
      try {
        await this.#db.batch(statements);
      } catch (cause) {
        if (cause instanceof ActivityError) {
          throw cause;
        }
        throw new TaskStorageError(undefined, { cause });
      }
    }

    return { changed, unchanged };
  }

  /**
   * Build a `task_details` upsert that sets exactly ONE column (creating the row
   * from the task's current values on first edit), gated on the active task whose
   * parent Project is not archived. The SET fragment is a fixed, trusted column
   * literal — never caller data.
   */
  #fieldUpsertStatement(
    current: TaskView,
    column:
      "priority" | "time_sector" | "commitment_state" | "status" | "due_date",
    value: string | null,
    nowTs: string,
  ): D1PreparedStatement {
    const after = {
      status: column === "status" ? (value ?? "todo") : current.status,
      priority: column === "priority" ? value : current.priority,
      timeSector: column === "time_sector" ? value : current.timeSector,
      commitmentState:
        column === "commitment_state"
          ? (value ?? "active")
          : current.commitmentState,
      dueDate: column === "due_date" ? value : current.dueDate,
    };
    return this.#db
      .prepare(
        `INSERT INTO task_details
           (workspace_id, entity_id, entity_type, status, priority,
            due_date, scheduled_date, time_sector, commitment_state,
            delegate_to, delegated_on, follow_up_on, delegate_note,
            description, updated_at)
         SELECT ?, ?, '${TASK}', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE EXISTS (${this.#activeTaskExistsSql})
         ON CONFLICT (workspace_id, entity_id) DO UPDATE SET
           ${column} = excluded.${column},
           updated_at = excluded.updated_at`,
      )
      .bind(
        this.#workspaceId,
        current.id,
        after.status,
        after.priority,
        after.dueDate,
        current.scheduledDate,
        after.timeSector,
        after.commitmentState,
        current.delegation?.to ?? null,
        current.delegation?.delegatedOn ?? null,
        current.delegation?.followUpOn ?? null,
        current.delegation?.note ?? null,
        current.description,
        nowTs,
        this.#workspaceId,
        current.id,
        this.#workspaceId,
        current.id,
      );
  }

  /**
   * Build the statements for planning ONE task to `scheduledDate` (a date, or null
   * to clear): the guard-anchor entity bump, the `changes()`-guarded planning event
   * (`task.planned`/`task.rescheduled`/`task.plan_cleared`) with its subjects, and
   * the `task_details` write that touches ONLY the scheduled date. It writes neither
   * the due date, the waiting state nor completion (ADR-030). Payloads carry only
   * the non-sensitive calendar dates. The caller guarantees the plan actually
   * changes (no-ops are filtered before this is called).
   */
  #buildPlanGroup(
    entityId: string,
    current: TaskView,
    scheduledDate: string | null,
    nowTs: string,
  ): {
    readonly entityStmt: D1PreparedStatement;
    readonly event: NewActivityEvent;
    readonly domainStmts: readonly D1PreparedStatement[];
  } {
    const isClear = scheduledDate === null;
    const type = isClear
      ? TASK_PLAN_CLEARED
      : current.scheduledDate === null
        ? TASK_PLANNED
        : TASK_RESCHEDULED;

    const payload: Record<string, JsonValue> = { entityType: TASK };
    if (!isClear) {
      payload["scheduledDate"] = scheduledDate;
    }
    if (current.scheduledDate !== null) {
      payload["previous"] = current.scheduledDate;
    }
    const event: NewActivityEvent = {
      type,
      subjects: [{ entityId, role: SUBJECT_ROLE }],
      payload,
    };

    // The guard anchor and both detail writes gate on the task being OPEN, so a
    // completion racing the write causes the whole group to no-op (ADR-030 §30.4a).
    const entityStmt = this.#bumpOpenTaskStatement(entityId, nowTs);
    const detailsStmt = isClear
      ? this.#clearScheduledStatement(entityId, nowTs)
      : this.#setScheduledStatement(entityId, current, scheduledDate, nowTs);

    return { entityStmt, event, domainStmts: [detailsStmt] };
  }

  /**
   * Write ONLY `scheduled_date` on `task_details` (creating the row from the task's
   * current values on first edit), gated on the active AND OPEN task. Never touches
   * the due date, waiting columns or any other field, and never plans completed work.
   */
  #setScheduledStatement(
    entityId: string,
    current: TaskView,
    scheduledDate: string,
    nowTs: string,
  ): D1PreparedStatement {
    return this.#db
      .prepare(
        `INSERT INTO task_details
           (workspace_id, entity_id, entity_type, status, priority,
            due_date, scheduled_date, description, updated_at)
         SELECT ?, ?, '${TASK}', ?, ?, ?, ?, ?, ?
         WHERE EXISTS (${this.#openTaskExistsSql})
         ON CONFLICT (workspace_id, entity_id) DO UPDATE SET
           scheduled_date = excluded.scheduled_date,
           updated_at = excluded.updated_at`,
      )
      .bind(
        this.#workspaceId,
        entityId,
        current.status,
        current.priority,
        current.dueDate,
        scheduledDate,
        current.description,
        nowTs,
        this.#workspaceId,
        entityId,
        this.#workspaceId,
        entityId,
      );
  }

  /**
   * Clear ONLY `scheduled_date` on `task_details` (leaves every other column), gated
   * on the active AND OPEN task so a completed task's plan is never cleared here.
   */
  #clearScheduledStatement(
    entityId: string,
    nowTs: string,
  ): D1PreparedStatement {
    return this.#db
      .prepare(
        `UPDATE task_details
         SET scheduled_date = NULL, updated_at = ?
         WHERE workspace_id = ? AND entity_id = ?
           AND EXISTS (${this.#openTaskExistsSql})`,
      )
      .bind(
        nowTs,
        this.#workspaceId,
        entityId,
        this.#workspaceId,
        entityId,
        this.#workspaceId,
        entityId,
      );
  }

  /* ---------------------------------------------------------------------- */
  /* Completion + waiting clearance — one atomic operation (ADR-029)         */
  /* ---------------------------------------------------------------------- */

  /**
   * AUDIT-13 — completing a Task, reduced to statements for somebody else's batch.
   *
   * The Asset obligation → Task completion used to run `completeTask` in its own
   * transaction and THEN open the obligation's transaction; a failure in the second
   * left a Task ticked off against an obligation that was still open. This seam is
   * how that becomes one batch: the caller appends these statements to its own,
   * behind `guard` — a SQL predicate evaluated INSIDE the transaction, so the Task
   * only closes if the caller's own domain write actually committed.
   *
   * INTERNAL to `app/platform/storage/d1` (not on the `TaskRepository` port), and
   * it performs no write, so it cannot be used to rebuild the two-transaction
   * sequence it replaces.
   */
  async planCompletion(
    id: string,
    options: {
      readonly ownerTodayIso: string;
      /** Extra SQL predicate + params gating the completion (AND-ed into the gate). */
      readonly guard?: {
        readonly sql: string;
        readonly params: readonly unknown[];
      };
      readonly now?: Date;
    },
  ): Promise<TaskCompletionPlan> {
    let entityId: string;
    try {
      entityId = validateTaskId(id);
    } catch {
      return { outcome: "missing", statements: [] };
    }
    const current = await this.getTask(entityId);
    // A deleted / cross-workspace / wrong-type Task is not an error here: the
    // caller simply has nothing left to close.
    if (!current) return { outcome: "missing", statements: [] };
    if (current.completedAt !== null) {
      return { outcome: "already_closed", statements: [] };
    }

    const now = options.now ?? this.#clock();
    const nowTs = toStorageTimestamp(now);
    const successorPlan = await this.#planSuccessor(
      current,
      options.ownerTodayIso,
    );
    const group = this.#buildCompleteGroup(entityId, now, nowTs, options.guard);

    return {
      outcome: "completed",
      statements: [
        group.spineStmt,
        group.entityStmt,
        group.completionActivity,
        ...group.completionSubjects,
        group.waitingClearStmt,
        group.waitingClearedActivity,
        ...group.waitingClearedSubjects,
        group.waitingLinkStmt,
        ...(successorPlan
          ? this.#buildSuccessorGroup(successorPlan, now, nowTs)
          : []),
      ],
    };
  }

  async completeTask(
    id: string,
    options?: CompleteTaskOptions,
  ): Promise<CompleteTaskResult> {
    const entityId = validateTaskId(id);

    const current = await this.getTask(entityId);
    if (!current) {
      throw new TaskNotFoundError();
    }
    await this.#rejectIfParentProjectArchived(current);
    // Already completed: idempotent no-op (matching the spine contract). No batch,
    // no Activity, and — crucially for TASKS-04 — no second successor.
    if (current.completedAt !== null) {
      return { task: current, changed: false, successor: null };
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const ownerTodayIso =
      options?.ownerTodayIso ?? now.toISOString().slice(0, 10);

    // TASKS-04: a recurring occurrence's successor is planned BEFORE the batch (pure
    // calendar arithmetic) and written INSIDE it, so completion and exactly one
    // successor share one transaction.
    const successorPlan = await this.#planSuccessor(current, ownerTodayIso);

    const entityRow = await this.#runCompleteBatch(
      entityId,
      current,
      now,
      nowTs,
      successorPlan,
    );
    if (!entityRow) {
      // The completion gate matched nothing: the task was completed or deleted by a
      // concurrent racer between the read and the batch. Nothing was written; report
      // honestly from the fresh state — including the successor the racer created.
      const refreshed = await this.getTask(entityId);
      if (!refreshed) {
        throw new TaskNotFoundError();
      }
      return {
        task: refreshed,
        changed: false,
        successor: await this.#readExistingSuccessor(refreshed),
      };
    }

    return {
      task: {
        ...current,
        completedAt: now,
        updatedAt: fromStorageTimestamp(entityRow.updated_at),
        waiting: null,
      },
      changed: true,
      // The planned successor, or — when the guarded group declined because a LIVE
      // occurrence already holds this series slot (a successor RETAINED through a
      // reopen, or one a concurrent completion created) — that occurrence. Read back
      // by series identity, so it is always this workspace's occupant of exactly this
      // slot, never a guess and never a silent null (AUDIT-FIX-01).
      successor: successorPlan
        ? ((await this.getTask(successorPlan.id)) ??
          (await this.#readExistingSuccessor(current)))
        : null,
    };
  }

  /**
   * Resolve the ONE next occurrence a completion must create, or null when the task
   * does not recur. Pure: only calendar arithmetic over the persisted rule, the
   * occurrence's own anchor date and the OWNER's completion day (never a UTC guess),
   * so the same completion always plans the same successor.
   *
   * The next date is strictly after the LATER of the current anchor and the owner's
   * completion day, which is what makes a long-missed daily task resume tomorrow
   * rather than replaying every skipped day.
   */
  async #planSuccessor(
    current: TaskView,
    ownerTodayIso: string,
  ): Promise<SuccessorPlan | null> {
    const rule = current.recurrence ?? null;
    if (rule === null) return null;
    const anchorIso =
      rule.dateKind === "due" ? current.dueDate : current.scheduledDate;
    if (anchorIso === null) {
      // A rule with no anchor cannot compute a date. The mutation boundary refuses
      // to store one, so this is only reachable if the anchor was cleared later:
      // completion still succeeds, and the series simply stops here rather than
      // failing the user's completion.
      return null;
    }
    // TASKS-07 — the SERIES grid, which is the occurrence's own anchor unless this
    // occurrence was deliberately moved off it ("change this occurrence"). A fixed
    // routine therefore returns to its schedule after a one-off shift instead of
    // dragging the whole series along with it.
    const gridAnchorIso =
      current.recurrenceSeries?.scheduleAnchorDate ?? anchorIso;
    const series = current.recurrenceSeries ?? {
      seriesId: current.id,
      sequence: 0,
      scheduleAnchorDate: null,
    };
    /*
     * TASKS-12 — the ONE authority that decides whether this series continues.
     *
     * `planNextTaskOccurrence` applies the end conditions (after N occurrences, on
     * a date) and the weekend rule together, and returns null when the series has
     * ENDED — the ordinary, expected outcome of completing the last occurrence of
     * a bounded routine. The completion still succeeds; it simply creates nothing,
     * which is also why no phantom successor can exist for an occurrence that will
     * never be.
     */
    const step = planNextTaskOccurrence(
      rule,
      series,
      gridAnchorIso,
      ownerTodayIso,
    );
    if (step === null) return null;
    const nextAnchorIso = step.date;
    // The NON-anchor date keeps its distance from THIS occurrence's anchor, so a task
    // scheduled Monday and due Friday stays a four-day window instead of inheriting a
    // deadline already in the past (or silently losing it).
    const otherIso =
      rule.dateKind === "due" ? current.scheduledDate : current.dueDate;
    const shiftedOther =
      otherIso === null
        ? null
        : addCalendarDays(
            nextAnchorIso,
            calendarDaysBetween(anchorIso, otherIso),
          );
    // The STRUCTURAL parent, read from the active parent link rather than inferred
    // from the derived project/area relations (a Project-parented task also reports an
    // Area, so only the link says which one is structural).
    const parentLink = await this.#readCurrentTaskParentLink(current.id);
    const parentKind = taskParentKindOf(parentLink?.parent_link_type ?? null);
    const parent =
      parentLink?.parent_id && parentKind !== null
        ? { kind: parentKind, id: parentLink.parent_id }
        : null;
    /*
     * TASKS-13 — the checklist STRUCTURE carries over; the TICKS do not.
     *
     * A routine's steps are part of the routine: "Monthly camper check" means
     * the same four checks every month, and a successor that arrived empty would
     * make the owner retype them. But last month's ticks describe last month's
     * work, and copying them would have this month's occurrence claim, on the day
     * it is created, that its steps are already done. So each item is cloned by
     * title and position with a FRESH id and `completed` reset — which is also
     * what keeps the completed occurrence's own checklist intact as history.
     *
     * Read here, before the batch, because each cloned row needs an id and SQL
     * cannot mint one per row. Bounded by MAX_CHECKLIST_ITEMS.
     */
    const checklist = (await this.listChecklist(current.id)).map(
      (item, index) => ({
        id: this.#newEntityId(),
        title: item.title,
        position: index,
      }),
    );
    return {
      id: this.#newEntityId(),
      linkId: parent === null ? null : this.#newEntityId(),
      predecessorId: current.id,
      rule,
      series: {
        seriesId: series.seriesId,
        sequence: series.sequence + 1,
        /*
         * The successor is back ON the grid, whatever this occurrence was moved to
         * — EXCEPT when TASKS-12's weekend rule moved the successor itself off it.
         *
         * Then the unadjusted schedule date is remembered here, through the SAME
         * field TASKS-07 added for "change this occurrence", and the step after
         * this one is computed from the grid. That is what stops "the 1st of every
         * month, moved to the Friday before" from walking two days earlier every
         * month until it is a completely different routine.
         */
        scheduleAnchorDate: step.gridDate,
      },
      scheduledDate: rule.dateKind === "due" ? shiftedOther : nextAnchorIso,
      dueDate: rule.dateKind === "due" ? nextAnchorIso : shiftedOther,
      title: current.title,
      description: current.description,
      priority: current.priority,
      timeSector: current.timeSector,
      commitmentState: current.commitmentState,
      parent,
      checklist,
    };
  }

  /**
   * The already-created successor of a completed occurrence, if any. Used when a
   * concurrent completion won the race: the caller is told about the ONE successor
   * that exists rather than being handed a second one or a silent null.
   */
  async #readExistingSuccessor(task: TaskView): Promise<TaskView | null> {
    const series = task.recurrenceSeries ?? null;
    if (series === null) return null;
    const row = await this.#db
      .prepare(
        `SELECT entity_id FROM task_recurrence_rules
         WHERE workspace_id = ? AND series_id = ? AND sequence = ?`,
      )
      .bind(this.#workspaceId, series.seriesId, series.sequence + 1)
      .first<{ readonly entity_id: string }>();
    return row ? await this.getTask(row.entity_id) : null;
  }

  /**
   * The successor's write group. EVERY statement is gated on the completion having
   * been written in THIS batch (`spine_records.completed_at = <this batch's
   * timestamp>`), so a losing racer writes nothing at all; the UNIQUE (workspace,
   * series, sequence) index is the second, database-level boundary that makes a
   * duplicate occurrence impossible even under a retry.
   *
   * The series slot `(series_id, sequence)` holds AT MOST ONE occurrence, so the
   * group also decides — in SQL, inside the batch — which of the two things the slot
   * can mean (AUDIT-FIX-01):
   *
   *   - a LIVE task already occupies it (a successor RETAINED through a reopen
   *     because it was edited/linked/completed, or one a concurrent completion just
   *     created): the whole group declines. `completeTask` then reports THAT
   *     occurrence rather than minting a second one — the group is a cascade off the
   *     entity insert, so declining it writes no entity, no spine record, no detail
   *     row, no recurrence row and no Activity, never a detached half-task.
   *   - a STALE row occupies it — its task is soft-deleted, because the reopen
   *     withdrew it or the owner trashed it — in which case the slot is not held by
   *     any live occurrence and the row is released first, so the fresh successor can
   *     take it. Releasing is gated on this batch's completion exactly like every
   *     other successor statement.
   *
   * The two predicates are exact complements of one another, so the pair is total:
   * the insert can never meet a row the release did not clear, and the UNIQUE index
   * stays the backstop rather than the mechanism (ADR-062 §1) — no constraint
   * exception is caught or suppressed.
   *
   * Field-copy contract (documented in TASKS_MODULE.md): title, description, parent,
   * priority, Time Sector, commitment state, the recurrence rule and the series
   * identity carry over. Completion, waiting, delegation and workflow status do NOT —
   * they are the transient state of the occurrence that was just finished.
   */
  #buildSuccessorGroup(
    plan: SuccessorPlan,
    now: Date,
    nowTs: string,
  ): readonly D1PreparedStatement[] {
    const committed = `EXISTS (
             SELECT 1 FROM spine_records
             WHERE workspace_id = ? AND entity_id = ? AND completed_at = ?
           )`;
    const committedBinds = [this.#workspaceId, plan.predecessorId, nowTs];
    // "A LIVE task occupies this series slot" — the one condition under which a
    // successor must NOT be created, whichever occurrence put it there.
    const slotHeldByLiveTask = `EXISTS (
             SELECT 1 FROM task_recurrence_rules rr
             JOIN entities re
               ON re.workspace_id = rr.workspace_id AND re.id = rr.entity_id
             WHERE rr.workspace_id = ? AND rr.series_id = ? AND rr.sequence = ?
               AND re.deleted_at IS NULL
           )`;
    const slotBinds = [
      this.#workspaceId,
      plan.series.seriesId,
      plan.series.sequence,
    ];

    const statements: D1PreparedStatement[] = [];

    // Release a recurrence row left behind by a task that no longer exists. A
    // soft-deleted task is not a member of the series, so its reservation must not
    // outlive it and wedge the slot — which is precisely the state AUDIT-01
    // reproduced. Gated on THIS batch's completion, and by construction it can only
    // ever match the row `slotHeldByLiveTask` rejects. (A later restore from the
    // trash brings the task back as an ordinary non-recurring Task rather than
    // silently displacing whatever now holds the slot — PX-04's reversible delete
    // restores the record, not a claim on a series position another task owns.)
    statements.push(
      this.#db
        .prepare(
          `DELETE FROM task_recurrence_rules
           WHERE workspace_id = ? AND series_id = ? AND sequence = ?
             AND NOT EXISTS (
                   SELECT 1 FROM entities re
                   WHERE re.workspace_id = task_recurrence_rules.workspace_id
                     AND re.id = task_recurrence_rules.entity_id
                     AND re.deleted_at IS NULL
                 )
             AND ${committed}`,
        )
        .bind(...slotBinds, ...committedBinds),
    );

    statements.push(
      this.#db
        .prepare(
          `INSERT INTO entities
             (id, workspace_id, type, title, created_at, updated_at, deleted_at)
           SELECT ?, ?, '${TASK}', ?, ?, ?, NULL
           WHERE ${committed}
             AND NOT ${slotHeldByLiveTask}`,
        )
        .bind(
          plan.id,
          this.#workspaceId,
          plan.title,
          nowTs,
          nowTs,
          ...committedBinds,
          ...slotBinds,
        ),
    );
    // The SHARED spine child-record builder: the spine stays the identity authority
    // for an occurrence exactly as it is for a hand-created Task.
    statements.push(
      buildSpineChildRecordInsertStatement(this.#db, this.#workspaceId, {
        id: plan.id,
        kind: TASK,
      }),
    );
    statements.push(
      ...this.#recorder.buildAppendStatements(
        this.#workspaceId,
        buildActivityWriteModel(
          spineEntityCreatedEvent(plan.id, TASK, plan.title),
          this.#actor.actor,
          this.#newActivityId(),
          now,
        ),
      ),
    );

    // The structural parent is COPIED, never re-validated against a picker: an
    // occurrence of a repeating task belongs where its predecessor belonged. The
    // insert is still gated on the parent being an active, non-archived destination,
    // so a Project archived in the meantime simply yields an Inbox occurrence rather
    // than a link into a read-only Project.
    if (plan.parent !== null && plan.linkId !== null) {
      const linkType = spineLinkTypeFor(TASK, plan.parent.kind);
      if (linkType !== null) {
        statements.push(
          this.#insertTaskParentStatement(
            plan.linkId,
            plan.id,
            { kind: plan.parent.kind, id: plan.parent.id },
            linkType,
            nowTs,
          ),
          ...this.#recorder.buildAppendStatements(
            this.#workspaceId,
            buildActivityWriteModel(
              spineLinkCreatedEvent(
                plan.linkId,
                plan.id,
                plan.parent.id,
                linkType,
              ),
              this.#actor.actor,
              this.#newActivityId(),
              now,
            ),
          ),
        );
      }
    }

    // The copied detail slice. `status` resets to `todo` and delegation/waiting are
    // NOT copied: they are the finished occurrence's transient state, and an `on_hold`
    // successor would silently vanish from Today.
    statements.push(
      this.#db
        .prepare(
          `INSERT INTO task_details
             (workspace_id, entity_id, entity_type, status, priority,
              due_date, scheduled_date, time_sector, commitment_state,
              delegate_to, delegated_on, follow_up_on, delegate_note,
              description, updated_at)
           SELECT ?, ?, '${TASK}', 'todo', ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?
           WHERE EXISTS (
                   SELECT 1 FROM entities
                   WHERE workspace_id = ? AND id = ? AND type = '${TASK}'
                     AND deleted_at IS NULL
                 )`,
        )
        .bind(
          this.#workspaceId,
          plan.id,
          plan.priority,
          plan.dueDate,
          plan.scheduledDate,
          plan.timeSector,
          plan.commitmentState,
          plan.description === null ? null : String(plan.description),
          nowTs,
          this.#workspaceId,
          plan.id,
        ),
    );

    statements.push(
      this.#insertRecurrenceStatement(
        plan.id,
        plan.rule,
        plan.series,
        nowTs,
        // TASKS-12 — the grid the successor's own successor is stepped from, set
        // only when a weekend rule moved this occurrence off the schedule.
        plan.series.scheduleAnchorDate,
      ),
    );

    /*
     * TASKS-13 — the successor's checklist, cloned STRUCTURE-ONLY.
     *
     * One statement per item, each gated on the successor entity actually
     * existing, so the clone rides on the same cascade as the detail row: if the
     * successor was declined because a live occurrence already holds this series
     * slot, no checklist row is written either, and there is never a set of items
     * belonging to a Task that was not created. `completed` is hard-coded 0 -- the
     * reset is in the SQL, not in a value someone could pass through.
     */
    for (const item of plan.checklist) {
      statements.push(
        this.#db
          .prepare(
            `INSERT INTO task_checklist_items
               (id, workspace_id, task_id, task_type, title, position, completed,
                created_at, updated_at)
             SELECT ?, ?, ?, '${TASK}', ?, ?, 0, ?, ?
             WHERE EXISTS (
                     SELECT 1 FROM entities
                     WHERE workspace_id = ? AND id = ? AND type = '${TASK}'
                       AND deleted_at IS NULL
                   )`,
          )
          .bind(
            item.id,
            this.#workspaceId,
            plan.id,
            item.title,
            item.position,
            nowTs,
            nowTs,
            this.#workspaceId,
            plan.id,
          ),
      );
    }

    // ONE legible event on the SERIES: the completed occurrence and the occurrence it
    // produced, so the timeline explains where the new task came from.
    statements.push(
      ...this.#recorder.buildAppendStatements(
        this.#workspaceId,
        buildActivityWriteModel(
          {
            type: TASK_RECURRENCE_OCCURRENCE_CREATED,
            subjects: [
              { entityId: plan.predecessorId, role: SUBJECT_ROLE },
              { entityId: plan.id, role: ROLE_SUCCESSOR },
            ],
            payload: {
              entityType: TASK,
              seriesId: plan.series.seriesId,
              sequence: plan.series.sequence,
              dateKind: plan.rule.dateKind,
              scheduledDate: plan.scheduledDate,
              dueDate: plan.dueDate,
            },
          },
          this.#actor.actor,
          this.#newActivityId(),
          now,
        ),
      ),
    );

    return statements;
  }

  /**
   * Run completion AND waiting clearance as ONE atomic `D1Database.batch()`.
   * Statement order and guards:
   *   1. spine completion gate (RETURNING) — `changes()` iff completed now;
   *   2. entity `updated_at` bump, guarded on (1)'s `changes()` (RETURNING the row);
   *   3. `task.completed` event, guarded on (2)'s `changes()`;
   *   4. waiting-state clear — gated on the freshly-written completion AND
   *      `waiting_since IS NOT NULL`, so it fires iff the task WAS waiting and the
   *      completion committed; its `changes()` drives the next event;
   *   5. `task.waiting_cleared` event, guarded on (4)'s `changes()` (so it is
   *      appended ONLY when the task was actively waiting);
   *   6. active `task.waiting_on` link soft-delete, gated on the committed completion.
   * The completion SQL is the SHARED spine builder (the spine stays the authority).
   * Any failure rolls the entire batch back — a completed-but-still-waiting task is
   * impossible. Returns the entity RETURNING row iff completion happened, else null.
   */
  async #runCompleteBatch(
    entityId: string,
    current: TaskView,
    now: Date,
    nowTs: string,
    successorPlan: SuccessorPlan | null = null,
  ): Promise<EntityRow | null> {
    const fault = this.#completeFault;
    const group = this.#buildCompleteGroup(entityId, now, nowTs);

    // Flatten the group in canonical order, interleaving the TEST-ONLY forced
    // failures at their named points to prove the whole batch rolls back.
    const batch: D1PreparedStatement[] = [
      group.spineStmt,
      group.entityStmt,
      ...(fault === "after-completion" ? [this.#forcedFailure()] : []),
      group.completionActivity,
      ...(fault === "after-completion-activity" ? [this.#forcedFailure()] : []),
      ...group.completionSubjects,
      group.waitingClearStmt,
      ...(fault === "after-waiting-update" ? [this.#forcedFailure()] : []),
      group.waitingClearedActivity,
      ...(fault === "after-waiting-cleared-activity"
        ? [this.#forcedFailure()]
        : []),
      ...group.waitingClearedSubjects,
      group.waitingLinkStmt,
      ...(fault === "after-waiting-link" ? [this.#forcedFailure()] : []),
      // 7. TASKS-04: the ONE recurrence successor, every statement gated on THIS
      //    batch's completion, so completion and succession commit together or not
      //    at all.
      ...(successorPlan
        ? this.#buildSuccessorGroup(successorPlan, now, nowTs)
        : []),
    ];

    let results: D1Result<EntityRow>[];
    try {
      results = await this.#db.batch<EntityRow>(batch);
    } catch (cause) {
      if (cause instanceof ActivityError) {
        throw cause;
      }
      throw new TaskStorageError(undefined, { cause });
    }

    // The entity bump is always at index 1 (fault statements only exist in test
    // paths, which throw before results are read).
    const rows = results[1]?.results ?? [];
    return rows[0] ?? null;
  }

  /**
   * Complete MANY tasks as ONE atomic batch (TASKS-01 §16). See the
   * `TaskRepository.completeTasks` contract: validate + resolve every id up front
   * (any missing/cross-workspace/archived id rejects the WHOLE operation before a
   * single write), then concatenate each still-open task's full completion group
   * (spine completion + guarded `task.completed` event + atomic waiting clearance)
   * into ONE `D1Database.batch()`, so either all commit or none do. Already-completed
   * tasks are idempotent no-ops counted as `unchanged`. Each group's own spine gate
   * → entity bump resets `changes()` for that group's guarded events, so many guarded
   * completions compose correctly in a single transaction (mirrors `#bulkPlan`).
   */
  async completeTasks(
    ids: readonly string[],
    options?: CompleteTaskOptions,
  ): Promise<BulkFieldResult> {
    const entityIds = validateTaskIdList(ids);

    // Resolve all first; ANY missing/cross-workspace/deleted id (→ not found) or an
    // archived parent Project rejects the WHOLE operation before a single write.
    const currents: TaskView[] = [];
    for (const entityId of entityIds) {
      const current = await this.getTask(entityId);
      if (!current) {
        throw new TaskNotFoundError();
      }
      await this.#rejectIfParentProjectArchived(current);
      currents.push(current);
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const ownerTodayIso =
      options?.ownerTodayIso ?? now.toISOString().slice(0, 10);

    const statements: D1PreparedStatement[] = [];
    let changed = 0;
    let unchanged = 0;
    for (const current of currents) {
      // Already completed: idempotent no-op (matches `completeTask`), no statements.
      if (current.completedAt !== null) {
        unchanged += 1;
        continue;
      }
      const group = this.#buildCompleteGroup(current.id, now, nowTs);
      const plan = await this.#planSuccessor(current, ownerTodayIso);
      statements.push(
        group.spineStmt,
        group.entityStmt,
        group.completionActivity,
        ...group.completionSubjects,
        group.waitingClearStmt,
        group.waitingClearedActivity,
        ...group.waitingClearedSubjects,
        group.waitingLinkStmt,
        // A bulk completion of a recurring task creates its ONE successor in the
        // SAME transaction, so /tasks and Today can never disagree about whether a
        // repeating task continued.
        ...(plan ? this.#buildSuccessorGroup(plan, now, nowTs) : []),
      );
      changed += 1;
    }

    // TEST-ONLY: prove a storage fault mid-batch leaves NONE of the selection
    // completed. Appended once at the end so the whole transaction rolls back.
    if (this.#bulkCompleteFault && statements.length > 0) {
      statements.push(this.#forcedFailure());
    }

    if (statements.length > 0) {
      try {
        await this.#db.batch(statements);
      } catch (cause) {
        if (cause instanceof ActivityError) {
          throw cause;
        }
        throw new TaskStorageError(undefined, { cause });
      }
    }

    return { changed, unchanged };
  }

  /* ---------------------------------------------------------------------- */
  /* Series editing and Skip (TASKS-07 / ADR-085)                            */
  /* ---------------------------------------------------------------------- */

  async moveTaskOccurrence(
    id: string,
    input: MoveTaskOccurrenceInput,
  ): Promise<MoveTaskOccurrenceResult> {
    const entityId = validateTaskId(id);
    const scope = validateTaskSeriesEditScope(input.scope);
    const date = validatePlanDate(input.date);
    const move = await this.#readOccurrenceMove(entityId);

    // "This occurrence" REMEMBERS the routine's grid so the next occurrence returns
    // to it; "this and future" re-anchors the grid here. A move that lands back on
    // the grid needs no override either way, so the column stays NULL rather than
    // storing a redundant duplicate of the occurrence's own date.
    const nextGridAnchor =
      scope === "series" || move.gridAnchorIso === date
        ? null
        : move.gridAnchorIso;
    if (
      move.anchorIso === date &&
      (move.series.scheduleAnchorDate ?? null) === nextGridAnchor
    ) {
      return { task: move.task, changed: false };
    }

    const result = await this.#writeOccurrenceDates(
      move,
      date,
      nextGridAnchor,
      {
        type: ENTITY_UPDATED,
        subjects: [{ entityId, role: SUBJECT_ROLE }],
        payload: {
          entityType: TASK,
          changes: {
            [move.anchorKey]: { before: move.anchorIso, after: date },
          },
          // The scope is part of the record: "I moved this one" and "I moved the
          // routine" are different decisions, and the timeline should not conflate them.
          seriesScope: scope,
          seriesId: move.series.seriesId,
        },
      },
    );
    return { task: result, changed: true };
  }

  async skipTaskOccurrence(
    id: string,
    options: SkipTaskOccurrenceOptions,
  ): Promise<SkipTaskOccurrenceResult> {
    const entityId = validateTaskId(id);
    const ownerTodayIso = validatePlanDate(options.ownerTodayIso);
    const move = await this.#readOccurrenceMove(entityId);

    // One step along the SERIES, from the grid — never from the occurrence's own
    // date if it was moved off it, and never a completion. An after-completion rule
    // steps from the owner's day, which is what "skip this one" means for an
    // interval that restarts when the work is done.
    const step = nextTaskOccurrenceStep(
      move.rule,
      move.gridAnchorIso,
      ownerTodayIso,
    );
    const nextIso = step.date;
    /*
     * TASKS-12 — a skip may not step PAST the series' end date.
     *
     * "Ends on 30 September" means there is no occurrence after it, and skipping
     * the last one into October would invent the very occurrence the end condition
     * exists to prevent. The count condition is deliberately NOT checked here: a
     * skip consumes no sequence, so "twelve times" still means twelve.
     */
    if (move.rule.endsOnDate !== null && nextIso > move.rule.endsOnDate) {
      throw new TaskValidationError(
        "recurrence",
        "this repeat ends before its next date, so there is nothing to skip to",
      );
    }
    if (nextIso === move.anchorIso) {
      return {
        task: move.task,
        changed: false,
        skippedFrom: move.anchorIso,
        nextDate: nextIso,
      };
    }

    // A skip puts the occurrence back ON the grid — unless TASKS-12's weekend rule
    // moved the new date off it, in which case the grid is remembered exactly as a
    // successor's is, so the routine does not drift.
    const task = await this.#writeOccurrenceDates(
      move,
      nextIso,
      step.gridDate,
      {
        type: TASK_RECURRENCE_OCCURRENCE_SKIPPED,
        subjects: [{ entityId, role: SUBJECT_ROLE }],
        payload: {
          entityType: TASK,
          seriesId: move.series.seriesId,
          sequence: move.series.sequence,
          dateKind: move.rule.dateKind,
          skippedFrom: move.anchorIso,
          nextDate: nextIso,
        },
      },
    );
    return {
      task,
      changed: true,
      skippedFrom: move.anchorIso,
      nextDate: nextIso,
    };
  }

  /**
   * The shared precondition read for both series-scoped date operations: the Task
   * must exist in this workspace, be open, not sit in an archived Project, repeat,
   * and have the anchor date its rule advances. Each refusal is a typed task error
   * naming what the owner must do, never a storage error.
   */
  async #readOccurrenceMove(entityId: string): Promise<OccurrenceMove> {
    const task = await this.getTask(entityId);
    if (!task) throw new TaskNotFoundError();
    await this.#rejectIfParentProjectArchived(task);
    this.#rejectIfCompleted(task);
    const rule = task.recurrence ?? null;
    if (rule === null) {
      throw new TaskValidationError(
        "recurrence",
        "this task does not repeat, so there is no series to change",
      );
    }
    const anchorKey = recurrenceAnchorField(rule);
    const anchorIso =
      anchorKey === "dueDate" ? task.dueDate : task.scheduledDate;
    if (anchorIso === null) {
      throw new TaskValidationError(
        "recurrence",
        anchorKey === "dueDate"
          ? "this repeat needs a due date to repeat from"
          : "this repeat needs a scheduled date to repeat from",
      );
    }
    const series = task.recurrenceSeries ?? {
      seriesId: entityId,
      sequence: 0,
      scheduleAnchorDate: null,
    };
    return {
      task,
      rule,
      series,
      anchorKey,
      anchorIso,
      // The routine's grid: the remembered series anchor when this occurrence was
      // moved off it, otherwise the occurrence's own date (the ordinary case, and
      // the behaviour of every rule written before TASKS-07).
      gridAnchorIso: series.scheduleAnchorDate ?? anchorIso,
      otherIso: anchorKey === "dueDate" ? task.scheduledDate : task.dueDate,
    };
  }

  /**
   * Write a series-scoped date move as ONE atomic batch: the guarded open-task bump
   * (the Activity anchor), both dates on `task_details`, the recurrence row's
   * `series_anchor_date`, and exactly one Activity event. The non-anchor date keeps
   * its distance from the anchor, so a Monday/Friday window stays four days wide.
   *
   * ── FOLLOW-01: the planned day is RECORDED, whichever date the rule anchors on
   * Both series operations move the PLANNED day — directly when the rule anchors
   * on it, and by the same shift when the rule anchors on the due date and the
   * occurrence also carries a planned one. Only the first was written down: the
   * move recorded `changes.<anchorKey>` and the skip recorded the anchor's two
   * dates under its own names, so a due-anchored routine's planned day moved with
   * NOTHING in the Activity stream saying it had.
   *
   * That was a genuine information gap rather than a preference: [ADR-110] makes
   * the stream the only historical record of a plan, and a period account
   * reconstructed from it would have read a moved occurrence as one that never
   * moved. The correction is the smallest one available — the event these paths
   * ALREADY write gains the pair it was missing, under the `changes.<field>`
   * shape `entity.updated` has always used. No new event type, no new payload
   * key vocabulary, no schema change, and no second planning authority.
   */
  async #writeOccurrenceDates(
    move: OccurrenceMove,
    nextAnchorIso: string,
    nextGridAnchor: string | null,
    event: NewActivityEvent,
  ): Promise<TaskView> {
    const shift = calendarDaysBetween(move.anchorIso, nextAnchorIso);
    const nextOtherIso =
      move.otherIso === null ? null : addCalendarDays(move.otherIso, shift);
    const scheduledDate =
      move.anchorKey === "dueDate" ? nextOtherIso : nextAnchorIso;
    const dueDate = move.anchorKey === "dueDate" ? nextAnchorIso : nextOtherIso;
    const previousScheduled =
      move.anchorKey === "dueDate" ? move.otherIso : move.anchorIso;

    const recorded: NewActivityEvent =
      previousScheduled === scheduledDate
        ? event
        : {
            ...event,
            payload: {
              ...event.payload,
              changes: {
                ...((event.payload["changes"] as
                  Record<string, JsonValue> | undefined) ?? {}),
                scheduledDate: {
                  before: previousScheduled,
                  after: scheduledDate,
                },
              },
            },
          };

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const entityRow = await this.#runGuardedMutation(
      this.#bumpOpenTaskStatement(move.task.id, nowTs),
      recorded,
      [
        this.#setOccurrenceDatesStatement(
          move.task,
          scheduledDate,
          dueDate,
          nowTs,
        ),
        this.#setSeriesAnchorStatement(move.task.id, nextGridAnchor, nowTs),
      ],
      now,
    );
    if (!entityRow) {
      // The open-gated guard matched nothing: completed, deleted or archived between
      // the read and the write. Nothing was written or recorded.
      await this.#throwPlanGuardMiss(move.task.id);
    }
    const task = await this.getTask(move.task.id);
    if (!task) throw new TaskNotFoundError();
    return task;
  }

  /**
   * Write BOTH planning dates on `task_details` in one statement (creating the row
   * from the task's current values on first edit), gated on the active AND OPEN task.
   * A series move changes the anchor and carries the other date with it, so writing
   * them separately would leave a visible half-moved window if only one applied.
   */
  #setOccurrenceDatesStatement(
    current: TaskView,
    scheduledDate: string | null,
    dueDate: string | null,
    nowTs: string,
  ): D1PreparedStatement {
    return this.#db
      .prepare(
        `INSERT INTO task_details
           (workspace_id, entity_id, entity_type, status, priority,
            due_date, scheduled_date, description, updated_at)
         SELECT ?, ?, '${TASK}', ?, ?, ?, ?, ?, ?
         WHERE EXISTS (${this.#openTaskExistsSql})
         ON CONFLICT (workspace_id, entity_id) DO UPDATE SET
           due_date = excluded.due_date,
           scheduled_date = excluded.scheduled_date,
           updated_at = excluded.updated_at`,
      )
      .bind(
        this.#workspaceId,
        current.id,
        current.status,
        current.priority,
        dueDate,
        scheduledDate,
        current.description,
        nowTs,
        this.#workspaceId,
        current.id,
        this.#workspaceId,
        current.id,
      );
  }

  /** Set (or clear) the SERIES grid anchor on an existing recurrence row. */
  #setSeriesAnchorStatement(
    entityId: string,
    seriesAnchorDate: string | null,
    nowTs: string,
  ): D1PreparedStatement {
    return this.#db
      .prepare(
        `UPDATE task_recurrence_rules
         SET series_anchor_date = ?, updated_at = ?
         WHERE workspace_id = ? AND entity_id = ?`,
      )
      .bind(seriesAnchorDate, nowTs, this.#workspaceId, entityId);
  }

  /* ---------------------------------------------------------------------- */
  /* Bulk structural, lifecycle and reopen operations (TASKS-06)             */
  /* ---------------------------------------------------------------------- */

  async setParentMany(
    ids: readonly string[],
    parent: SetTaskParentInput,
  ): Promise<BulkFieldResult> {
    const entityIds = validateTaskIdList(ids);
    const target =
      parent === null
        ? null
        : { kind: parent.kind, id: validateTaskId(parent.id) };
    if (
      target !== null &&
      target.kind !== "area" &&
      target.kind !== "project"
    ) {
      throw new SpineInvalidParentKindError();
    }
    const targetLinkType =
      target === null ? null : spineLinkTypeFor(TASK, target.kind);
    if (target !== null && targetLinkType === null) {
      throw new SpineInvalidParentKindError();
    }
    // The destination is validated ONCE for the whole move — the same active-Area /
    // non-archived-Project rule a single `setTaskParent` applies — rather than once
    // per selected Task.
    if (target !== null) {
      const candidate = await this.getTaskParentCandidate(target.id);
      if (!candidate || candidate.kind !== target.kind) {
        throw new SpineParentUnavailableError();
      }
    }

    // Resolve EVERY id first: a missing, cross-workspace or archived-Project Task
    // rejects the whole move before a single write, so a selection is never left
    // half-filed.
    const currents: TaskParentLinkRow[] = [];
    for (const entityId of entityIds) {
      const current = await this.#readCurrentTaskParentLink(entityId);
      if (!current) throw new TaskNotFoundError();
      const task = await this.getTask(entityId);
      if (!task) throw new TaskNotFoundError();
      await this.#rejectIfParentProjectArchived(task);
      currents.push(current);
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const statements: D1PreparedStatement[] = [];
    let changed = 0;
    let unchanged = 0;

    for (const current of currents) {
      const taskId = current.task_id;
      const alreadyThere =
        target === null
          ? current.link_id === null
          : current.parent_id === target.id &&
            current.parent_link_type === targetLinkType;
      if (alreadyThere) {
        unchanged += 1;
        continue;
      }
      statements.push(this.#bumpTaskUpdatedAtStatement(taskId, nowTs));
      if (
        current.link_id !== null &&
        current.parent_id !== null &&
        current.parent_link_type !== null
      ) {
        statements.push(
          this.#unlinkTaskParentStatement(current.link_id, nowTs),
          ...this.#linkActivityStatements(
            LINK_UNLINKED,
            {
              id: current.link_id,
              source_entity_id: taskId,
              target_entity_id: current.parent_id,
              type: current.parent_link_type,
              deleted_at: null,
            },
            now,
          ),
        );
      }
      if (target !== null && targetLinkType !== null) {
        // A previously-used link row is RESTORED rather than duplicated, exactly as
        // the single move does, so moving work back and forth never accumulates rows.
        const existing = await this.#findTaskParentLink(
          taskId,
          target.id,
          targetLinkType,
        );
        const identity: AnyLinkRow = existing ?? {
          id: this.#newEntityId(),
          source_entity_id: taskId,
          target_entity_id: target.id,
          type: targetLinkType,
          deleted_at: null,
        };
        statements.push(
          existing
            ? this.#restoreTaskParentStatement(existing.id, target, nowTs)
            : this.#insertTaskParentStatement(
                identity.id,
                taskId,
                target,
                targetLinkType,
                nowTs,
              ),
          ...this.#linkActivityStatements(
            existing ? LINK_RESTORED : LINK_CREATED,
            identity,
            now,
          ),
        );
      }
      changed += 1;
    }

    await this.#runBulkBatch(statements);
    return { changed, unchanged };
  }

  async reopenTasks(ids: readonly string[]): Promise<BulkFieldResult> {
    const entityIds = validateTaskIdList(ids);

    const currents: TaskView[] = [];
    for (const entityId of entityIds) {
      const current = await this.getTask(entityId);
      if (!current) throw new TaskNotFoundError();
      // Reopening must not put unfinished work back inside an ARCHIVED Project.
      await this.#rejectIfParentProjectArchived(current);
      currents.push(current);
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const statements: D1PreparedStatement[] = [];
    let changed = 0;
    let unchanged = 0;

    for (const current of currents) {
      if (current.completedAt === null) {
        unchanged += 1;
        continue;
      }
      const entityId = current.id;
      const observedCompletedAt = toStorageTimestamp(current.completedAt);
      statements.push(
        this.#reopenSpineStatement(entityId, observedCompletedAt),
        buildEntityUpdatedAtBumpStatement(
          this.#db,
          this.#workspaceId,
          entityId,
          nowTs,
        ),
        ...this.#recorder.buildAppendStatements(
          this.#workspaceId,
          buildActivityWriteModel(
            {
              type: TASK_REOPENED,
              subjects: [{ entityId, role: SUBJECT_ROLE }],
              payload: { previousCompletedAt: observedCompletedAt },
            },
            this.#actor.actor,
            this.#newActivityId(),
            now,
          ),
        ),
      );
      // The SAME safe withdrawal a single reopen performs, decided from persisted
      // series identity: an untouched successor is withdrawn and its slot released;
      // one the owner has since changed is retained (ADR-062).
      const successor = await this.#readSuccessorSafety(current);
      if (successor !== null && successorIsUntouched(successor)) {
        statements.push(
          this.#withdrawSuccessorStatement(
            entityId,
            successor.entity_id,
            nowTs,
          ),
          ...this.#recorder.buildAppendStatements(
            this.#workspaceId,
            buildActivityWriteModel(
              {
                type: TASK_RECURRENCE_OCCURRENCE_WITHDRAWN,
                subjects: [
                  { entityId, role: SUBJECT_ROLE },
                  { entityId: successor.entity_id, role: ROLE_SUCCESSOR },
                ],
                payload: {
                  entityType: TASK,
                  seriesId: current.recurrenceSeries?.seriesId ?? null,
                  sequence: successor.sequence,
                },
              },
              this.#actor.actor,
              this.#newActivityId(),
              now,
            ),
          ),
          this.#releaseWithdrawnRecurrenceStatement(successor.entity_id, nowTs),
        );
      }
      changed += 1;
    }

    await this.#runBulkBatch(statements);
    return { changed, unchanged };
  }

  async deleteTasks(ids: readonly string[]): Promise<BulkFieldResult> {
    return await this.#bulkLifecycle(ids, "delete");
  }

  async restoreTasks(ids: readonly string[]): Promise<BulkFieldResult> {
    return await this.#bulkLifecycle(ids, "restore");
  }

  /**
   * The shared REVERSIBLE bulk lifecycle path: soft-delete or restore, as ONE atomic
   * batch with one `entity.deleted`/`entity.restored` event per Task that actually
   * transitions. Nothing here destroys a record — the Task keeps its details,
   * relationships, Activity and recurrence row and stays restorable from the
   * built-in Deleted view.
   *
   * A restore re-checks the RETAINED structural parent, so deleted work is never
   * silently re-filed into a Project that has since been archived or removed. A Task
   * that never had a parent restores to the Inbox it came from (AUDIT-15).
   */
  async #bulkLifecycle(
    ids: readonly string[],
    action: "delete" | "restore",
  ): Promise<BulkFieldResult> {
    const entityIds = validateTaskIdList(ids);

    const currents: TaskView[] = [];
    for (const entityId of entityIds) {
      const current = await this.getTask(entityId, { includeDeleted: true });
      if (!current) throw new TaskNotFoundError();
      currents.push(current);
      if (action === "restore" && current.deletedAt !== null) {
        const parent = await this.#readRetainedParent(entityId);
        if (parent !== null && !parent.available) {
          throw new SpineParentUnavailableError();
        }
      }
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const statements: D1PreparedStatement[] = [];
    let changed = 0;
    let unchanged = 0;

    for (const current of currents) {
      const isDeleted = current.deletedAt !== null;
      if (action === "delete" ? isDeleted : !isDeleted) {
        unchanged += 1;
        continue;
      }
      statements.push(
        action === "delete"
          ? this.#softDeleteTaskStatement(current.id, nowTs)
          : this.#restoreTaskStatement(current.id, nowTs),
        ...this.#recorder.buildAppendStatements(
          this.#workspaceId,
          buildActivityWriteModel(
            {
              type: action === "delete" ? ENTITY_DELETED : ENTITY_RESTORED,
              subjects: [{ entityId: current.id, role: SUBJECT_ROLE }],
              payload: { entityType: TASK, title: current.title },
            },
            this.#actor.actor,
            this.#newActivityId(),
            now,
          ),
        ),
      );
      changed += 1;
    }

    await this.#runBulkBatch(statements);
    return { changed, unchanged };
  }

  /** Soft-delete ONE Task, gated on it still being active. Never a hard delete. */
  #softDeleteTaskStatement(
    entityId: string,
    nowTs: string,
  ): D1PreparedStatement {
    return this.#db
      .prepare(
        `UPDATE entities SET deleted_at = ?, updated_at = ?
         WHERE workspace_id = ? AND id = ? AND type = '${TASK}'
           AND deleted_at IS NULL`,
      )
      .bind(nowTs, nowTs, this.#workspaceId, entityId);
  }

  /**
   * Restore ONE soft-deleted Task, gated on it still being deleted AND on its
   * retained structural parent (if any) still being an available destination — the
   * check is folded into the UPDATE, so a Project archived between the read and the
   * write cannot receive restored work.
   */
  #restoreTaskStatement(entityId: string, nowTs: string): D1PreparedStatement {
    return this.#db
      .prepare(
        `UPDATE entities SET deleted_at = NULL, updated_at = ?
         WHERE workspace_id = ? AND id = ? AND type = '${TASK}'
           AND deleted_at IS NOT NULL
           AND NOT EXISTS (
                 SELECT 1
                 FROM entity_links pl
                 LEFT JOIN entities pe
                   ON pe.workspace_id = pl.workspace_id
                  AND pe.id = pl.target_entity_id
                  AND pe.deleted_at IS NULL
                 LEFT JOIN project_details pd
                   ON pd.workspace_id = pe.workspace_id
                  AND pd.entity_id = pe.id
                 WHERE pl.workspace_id = ?
                   AND pl.source_entity_id = ?
                   AND pl.type IN (${TASK_PARENT_LINK_LIST})
                   AND pl.deleted_at IS NULL
                   AND (pe.id IS NULL
                        OR (pe.type = '${PROJECT}' AND pd.archived_at IS NOT NULL))
               )`,
      )
      .bind(nowTs, this.#workspaceId, entityId, this.#workspaceId, entityId);
  }

  /**
   * The retained structural parent of a (possibly deleted) Task and whether it is
   * still an available destination. `null` means the Task has no structural parent at
   * all — a valid Inbox Task, which restores to the Inbox (AUDIT-15).
   */
  async #readRetainedParent(
    entityId: string,
  ): Promise<{ readonly available: boolean } | null> {
    const row = await this.#db
      .prepare(
        `SELECT CASE
                  WHEN pe.id IS NULL THEN 0
                  WHEN pe.type = '${PROJECT}' AND pd.archived_at IS NOT NULL THEN 0
                  ELSE 1
                END AS available
         FROM entity_links pl
         LEFT JOIN entities pe
           ON pe.workspace_id = pl.workspace_id
          AND pe.id = pl.target_entity_id
          AND pe.deleted_at IS NULL
         LEFT JOIN project_details pd
           ON pd.workspace_id = pe.workspace_id AND pd.entity_id = pe.id
         WHERE pl.workspace_id = ?
           AND pl.source_entity_id = ?
           AND pl.type IN (${TASK_PARENT_LINK_LIST})
           AND pl.deleted_at IS NULL
         LIMIT 1`,
      )
      .bind(this.#workspaceId, entityId)
      .first<{ readonly available: number }>();
    return row === null ? null : { available: row.available === 1 };
  }

  /** The guarded spine reopen used by both the single and the bulk reopen path. */
  #reopenSpineStatement(
    entityId: string,
    observedCompletedAt: string,
  ): D1PreparedStatement {
    return this.#db
      .prepare(
        `UPDATE spine_records SET completed_at = NULL
         WHERE workspace_id = ? AND entity_id = ? AND completed_at = ?
           AND EXISTS (SELECT 1 FROM entities
                       WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL)
           AND NOT EXISTS (
                 SELECT 1
                 FROM entity_links pl
                 JOIN project_details pd
                   ON pd.workspace_id = pl.workspace_id
                  AND pd.entity_id = pl.target_entity_id
                 WHERE pl.workspace_id = ?
                   AND pl.source_entity_id = ?
                   AND pl.type = '${TASK_BELONGS_TO_PROJECT}'
                   AND pl.deleted_at IS NULL
                   AND pd.archived_at IS NOT NULL
               )`,
      )
      .bind(
        this.#workspaceId,
        entityId,
        observedCompletedAt,
        this.#workspaceId,
        entityId,
        this.#workspaceId,
        entityId,
      );
  }

  /** Run a bulk statement list as ONE transaction, or nothing at all when empty. */
  async #runBulkBatch(
    statements: readonly D1PreparedStatement[],
  ): Promise<void> {
    if (statements.length === 0) return;
    try {
      await this.#db.batch([...statements]);
    } catch (cause) {
      if (cause instanceof ActivityError) throw cause;
      throw new TaskStorageError(undefined, { cause });
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Reopen — the task-domain undo, with SAFE recurrence withdrawal          */
  /* ---------------------------------------------------------------------- */

  async reopenTask(id: string): Promise<ReopenTaskResult> {
    const entityId = validateTaskId(id);
    const current = await this.getTask(entityId);
    if (!current) throw new TaskNotFoundError();
    // Reopening must not put unfinished work back inside an ARCHIVED Project
    // (PROJ-05 / ADR-037) — the same rule the spine enforces.
    await this.#rejectIfParentProjectArchived(current);
    if (current.completedAt === null) {
      return { task: current, changed: false, successorOutcome: "none" };
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const observedCompletedAt = toStorageTimestamp(current.completedAt);

    // Decide from PERSISTED identity — series + sequence — whether a successor exists
    // and whether it is still safe to withdraw. Never a guess, never a title match.
    const successor = await this.#readSuccessorSafety(current);
    const withdraw = successor !== null && successorIsUntouched(successor);

    // The archived-Project guard is folded into the guarded UPDATE as well as checked
    // above (mirroring the spine's own reopen), so a Project archived BETWEEN the read
    // and the write cannot have unfinished work reopened inside it.
    const spineStmt = this.#db
      .prepare(
        `UPDATE spine_records SET completed_at = NULL
         WHERE workspace_id = ? AND entity_id = ? AND completed_at = ?
           AND EXISTS (SELECT 1 FROM entities
                       WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL)
           AND NOT EXISTS (
                 SELECT 1
                 FROM entity_links pl
                 JOIN project_details pd
                   ON pd.workspace_id = pl.workspace_id
                  AND pd.entity_id = pl.target_entity_id
                 WHERE pl.workspace_id = ?
                   AND pl.source_entity_id = ?
                   AND pl.type = '${TASK_BELONGS_TO_PROJECT}'
                   AND pl.deleted_at IS NULL
                   AND pd.archived_at IS NOT NULL
               )
         RETURNING entity_id`,
      )
      .bind(
        this.#workspaceId,
        entityId,
        observedCompletedAt,
        this.#workspaceId,
        entityId,
        this.#workspaceId,
        entityId,
      );
    const entityStmt = buildEntityUpdatedAtBumpStatement(
      this.#db,
      this.#workspaceId,
      entityId,
      nowTs,
    );
    const reopenActivity = this.#recorder.buildAppendStatements(
      this.#workspaceId,
      buildActivityWriteModel(
        {
          type: TASK_REOPENED,
          subjects: [{ entityId, role: SUBJECT_ROLE }],
          payload: { previousCompletedAt: observedCompletedAt },
        },
        this.#actor.actor,
        this.#newActivityId(),
        now,
      ),
    );

    const statements: D1PreparedStatement[] = [
      spineStmt,
      entityStmt,
      ...reopenActivity,
    ];

    if (withdraw && successor !== null) {
      // Gated on the reopen having committed in THIS batch (the predecessor is open
      // again) AND on the successor still being untouched and open, so a successor
      // edited between the safety read and the write survives regardless.
      statements.push(
        this.#withdrawSuccessorStatement(entityId, successor.entity_id, nowTs),
        ...this.#recorder.buildAppendStatements(
          this.#workspaceId,
          buildActivityWriteModel(
            {
              type: TASK_RECURRENCE_OCCURRENCE_WITHDRAWN,
              subjects: [
                { entityId, role: SUBJECT_ROLE },
                { entityId: successor.entity_id, role: ROLE_SUCCESSOR },
              ],
              payload: {
                entityType: TASK,
                seriesId: current.recurrenceSeries?.seriesId ?? null,
                sequence: successor.sequence,
              },
            },
            this.#actor.actor,
            this.#newActivityId(),
            now,
          ),
        ),
        // A withdrawn occurrence must not keep its seat in the series: its
        // `(series_id, sequence)` reservation is released in the SAME batch, so
        // re-completing the reopened predecessor can plan that sequence again
        // (AUDIT-FIX-01). Gated on the successor bearing THIS batch's soft delete —
        // the same shape as the successor group's completion gate — so a successor
        // the guarded withdrawal declined to touch keeps both its row and its place.
        this.#releaseWithdrawnRecurrenceStatement(successor.entity_id, nowTs),
      );
    }

    // TEST-ONLY: prove the reopen, the withdrawal and the recurrence release commit
    // as ONE transaction — a fault here must leave the occurrence completed and its
    // successor and series row exactly as they were.
    if (this.#reopenFault) {
      statements.push(this.#forcedFailure());
    }

    let results: D1Result<{ readonly entity_id: string }>[];
    try {
      results = await this.#db.batch<{ readonly entity_id: string }>(
        statements,
      );
    } catch (cause) {
      if (cause instanceof ActivityError) throw cause;
      throw new TaskStorageError(undefined, { cause });
    }
    if ((results[0]?.results ?? []).length === 0) {
      // A concurrent racer reopened or deleted the task first: nothing was written.
      const refreshed = await this.getTask(entityId);
      if (!refreshed) throw new TaskNotFoundError();
      return { task: refreshed, changed: false, successorOutcome: "none" };
    }

    const task = await this.getTask(entityId);
    if (!task) throw new TaskNotFoundError();
    // Report what ACTUALLY happened: the guarded withdrawal may have declined even
    // though the safety read allowed it (a concurrent edit), so read it back.
    let successorOutcome: ReopenTaskSuccessorOutcome = "none";
    if (successor !== null) {
      const stillPresent = await this.getTask(successor.entity_id);
      successorOutcome = stillPresent === null ? "removed" : "retained";
    }
    return { task, changed: true, successorOutcome };
  }

  /**
   * Read the successor of a completed occurrence together with everything the safety
   * decision needs, in ONE statement: its timestamps, its completion, its sequence
   * and how many ACTIVE links it carries beyond the structural parent it was created
   * with. Returns null when this occurrence produced no successor.
   */
  async #readSuccessorSafety(task: TaskView): Promise<SuccessorRow | null> {
    const series = task.recurrenceSeries ?? null;
    if (series === null) return null;
    return await this.#db
      .prepare(
        `SELECT e.id AS entity_id,
                e.created_at AS created_at,
                e.updated_at AS updated_at,
                sr.completed_at AS completed_at,
                rr.sequence AS sequence,
                (SELECT COUNT(*) FROM entity_links l
                  WHERE l.workspace_id = e.workspace_id
                    AND l.deleted_at IS NULL
                    AND (l.source_entity_id = e.id OR l.target_entity_id = e.id)
                    AND l.type NOT IN (${TASK_PARENT_LINK_LIST})) AS extra_links
         FROM task_recurrence_rules rr
         JOIN entities e
           ON e.workspace_id = rr.workspace_id AND e.id = rr.entity_id
          AND e.type = '${TASK}' AND e.deleted_at IS NULL
         JOIN spine_records sr
           ON sr.workspace_id = e.workspace_id AND sr.entity_id = e.id
         WHERE rr.workspace_id = ? AND rr.series_id = ? AND rr.sequence = ?
         LIMIT 1`,
      )
      .bind(this.#workspaceId, series.seriesId, series.sequence + 1)
      .first<SuccessorRow>();
  }

  /**
   * Soft-delete an untouched successor as part of the reopen. Gated on (a) the
   * predecessor being OPEN again — the reopen in this same batch — and (b) the
   * successor still being open and still bearing no edit (`updated_at =
   * created_at`), so a successor changed between the safety read and the write is
   * never destroyed. Soft delete, never a purge: the reversible-delete lifecycle
   * (PX-04) still applies, and its Activity history is retained.
   */
  #withdrawSuccessorStatement(
    predecessorId: string,
    successorId: string,
    nowTs: string,
  ): D1PreparedStatement {
    return this.#db
      .prepare(
        `UPDATE entities
         SET deleted_at = ?, updated_at = ?
         WHERE workspace_id = ? AND id = ? AND type = '${TASK}'
           AND deleted_at IS NULL
           AND updated_at = created_at
           AND EXISTS (SELECT 1 FROM spine_records
                       WHERE workspace_id = ? AND entity_id = ?
                         AND completed_at IS NULL)
           AND EXISTS (SELECT 1 FROM spine_records
                       WHERE workspace_id = ? AND entity_id = ?
                         AND completed_at IS NULL)`,
      )
      .bind(
        nowTs,
        nowTs,
        this.#workspaceId,
        successorId,
        this.#workspaceId,
        successorId,
        this.#workspaceId,
        predecessorId,
      );
  }

  /**
   * Release the withdrawn successor's `(series_id, sequence)` reservation, in the
   * SAME batch as the withdrawal it belongs to (AUDIT-FIX-01).
   *
   * A recurrence row is per-occurrence configuration, not history (ADR-062 §6): a
   * COMPLETED occurrence keeps its row, because that is what preserves the series for
   * undo, but an occurrence that has been withdrawn out of existence has nothing left
   * to configure. Leaving its row behind reserved a sequence no task occupies, and
   * re-completing the reopened predecessor then collided with the UNIQUE
   * `(workspace_id, series_id, sequence)` index and rolled the whole completion back
   * — the defect AUDIT-01 reproduced.
   *
   * The gate is the withdrawal itself: the row goes only if the successor now carries
   * THIS batch's `deleted_at`. A successor edited between the safety read and the
   * write survives `#withdrawSuccessorStatement`, and therefore survives here too,
   * keeping both its task and its position in the series. Deleting the CHILD row
   * never touches the `ON DELETE RESTRICT` parent direction of the foreign key.
   */
  #releaseWithdrawnRecurrenceStatement(
    successorId: string,
    nowTs: string,
  ): D1PreparedStatement {
    return this.#db
      .prepare(
        `DELETE FROM task_recurrence_rules
         WHERE workspace_id = ? AND entity_id = ?
           AND EXISTS (SELECT 1 FROM entities
                       WHERE workspace_id = ? AND id = ? AND type = '${TASK}'
                         AND deleted_at = ?)`,
      )
      .bind(
        this.#workspaceId,
        successorId,
        this.#workspaceId,
        successorId,
        nowTs,
      );
  }

  /**
   * Build the ordered statement group that completes ONE task AND clears any active
   * waiting (ADR-029), shared by `completeTask` (single, with fault injection) and
   * `completeTasks` (many, concatenated into one batch). Statement order and guards:
   *   1. spine completion gate (RETURNING) — `changes()` iff completed now;
   *   2. entity `updated_at` bump, guarded on (1)'s `changes()` (RETURNING the row);
   *   3. `task.completed` event, guarded on (2)'s `changes()`;
   *   4. waiting-state clear — gated on the freshly-written completion AND
   *      `waiting_since IS NOT NULL`, so it fires iff the task WAS waiting and the
   *      completion committed; its `changes()` drives the next event;
   *   5. `task.waiting_cleared` event, guarded on (4)'s `changes()` (appended ONLY
   *      when the task was actively waiting);
   *   6. active `task.waiting_on` link soft-delete, gated on the committed completion.
   * The completion SQL is the SHARED spine builder (the spine stays the authority).
   */
  #buildCompleteGroup(
    entityId: string,
    now: Date,
    nowTs: string,
    /** AUDIT-13 — see `planCompletion`. Absent for every in-module completion. */
    guard?: { readonly sql: string; readonly params: readonly unknown[] },
  ): {
    readonly spineStmt: D1PreparedStatement;
    readonly entityStmt: D1PreparedStatement;
    readonly completionActivity: D1PreparedStatement;
    readonly completionSubjects: readonly D1PreparedStatement[];
    readonly waitingClearStmt: D1PreparedStatement;
    readonly waitingClearedActivity: D1PreparedStatement;
    readonly waitingClearedSubjects: readonly D1PreparedStatement[];
    readonly waitingLinkStmt: D1PreparedStatement;
  } {
    // 1-2. Shared spine completion gate + guarded entity bump.
    const spineStmt = buildSpineCompleteStatement(
      this.#db,
      this.#workspaceId,
      entityId,
      nowTs,
      guard,
    );
    const entityStmt = buildEntityUpdatedAtBumpStatement(
      this.#db,
      this.#workspaceId,
      entityId,
      nowTs,
    );

    // 3. Completion Activity (guarded on the entity bump's changes()).
    const completionModel = buildActivityWriteModel(
      {
        type: TASK_COMPLETED,
        subjects: [{ entityId, role: SUBJECT_ROLE }],
        payload: { completedAt: nowTs },
      },
      this.#actor.actor,
      this.#newActivityId(),
      now,
    );
    const [completionActivity, ...completionSubjects] =
      this.#recorder.buildAppendStatements(this.#workspaceId, completionModel);

    // 4. Clear the waiting state — only when the task WAS waiting AND the completion
    //    with THIS timestamp is now present (visible within the same transaction),
    //    so it cannot fire without the completion committing.
    const waitingClearStmt = this.#db
      .prepare(
        `UPDATE task_details
         SET waiting_since = NULL, waiting_note = NULL, updated_at = ?
         WHERE workspace_id = ? AND entity_id = ? AND waiting_since IS NOT NULL
           AND EXISTS (SELECT 1 FROM spine_records
                       WHERE workspace_id = ? AND entity_id = ? AND completed_at = ?)`,
      )
      .bind(
        nowTs,
        this.#workspaceId,
        entityId,
        this.#workspaceId,
        entityId,
        nowTs,
      );

    // 5. Waiting-cleared Activity (guarded on the waiting clear's changes(), so it
    //    is appended ONLY when the task was actively waiting).
    const waitingClearedModel = buildActivityWriteModel(
      {
        type: TASK_WAITING_CLEARED,
        subjects: [{ entityId, role: SUBJECT_ROLE }],
        payload: { entityType: TASK },
      },
      this.#actor.actor,
      this.#newActivityId(),
      now,
    );
    const [waitingClearedActivity, ...waitingClearedSubjects] =
      this.#recorder.buildAppendStatements(
        this.#workspaceId,
        waitingClearedModel,
      );

    // 6. Soft-delete the active waiting link, gated on the committed completion.
    const waitingLinkStmt = this.#db
      .prepare(
        `UPDATE entity_links SET deleted_at = ?, updated_at = ?
         WHERE workspace_id = ? AND source_entity_id = ?
           AND type = '${TASK_WAITING_ON}' AND deleted_at IS NULL
           AND EXISTS (SELECT 1 FROM spine_records
                       WHERE workspace_id = ? AND entity_id = ? AND completed_at = ?)`,
      )
      .bind(
        nowTs,
        nowTs,
        this.#workspaceId,
        entityId,
        this.#workspaceId,
        entityId,
        nowTs,
      );

    return {
      spineStmt,
      entityStmt,
      completionActivity: completionActivity!,
      completionSubjects,
      waitingClearStmt,
      waitingClearedActivity: waitingClearedActivity!,
      waitingClearedSubjects,
      waitingLinkStmt,
    };
  }

  /** A statement guaranteed to fail, aborting and rolling back the batch (tests). */
  #forcedFailure(): D1PreparedStatement {
    return this.#db.prepare("SELECT 1 FROM __dalyhub_forced_task_fault__");
  }

  /* ---------------------------------------------------------------------- */
  /* Internals                                                              */
  /* ---------------------------------------------------------------------- */

  /**
   * Reusable NOT-EXISTS clause: the task's direct PROJECT parent (if any) is not
   * archived (PROJ-05 / ADR-037) — an archived Project's structural children are
   * read-only until restored. A Task floating directly under an Area has no
   * Project parent, so this is trivially satisfied for it. Binds
   * `(workspaceId, entityId)` at its embedding site, immediately after whatever
   * params precede it in the same clause.
   */
  get #taskParentProjectNotArchivedSql(): string {
    return `NOT EXISTS (
              SELECT 1 FROM entity_links pl
              JOIN project_details pd
                ON pd.workspace_id = pl.workspace_id AND pd.entity_id = pl.target_entity_id
              WHERE pl.workspace_id = ? AND pl.source_entity_id = ?
                AND pl.type = '${TASK_BELONGS_TO_PROJECT}' AND pl.deleted_at IS NULL
                AND pd.archived_at IS NOT NULL
            )`;
  }

  /** Reusable EXISTS clause: the anchor is an active task in this workspace WHOSE
   * PARENT PROJECT (if any) is not archived. Binds `(workspaceId, entityId,
   * workspaceId, entityId)` at its embedding site. */
  get #activeTaskExistsSql(): string {
    return `SELECT 1 FROM entities
            WHERE workspace_id = ? AND id = ? AND type = '${TASK}'
              AND deleted_at IS NULL
              AND ${this.#taskParentProjectNotArchivedSql}`;
  }

  /**
   * Reusable EXISTS clause: the anchor is an active AND OPEN task in this workspace
   * (`spine_records.completed_at IS NULL`) whose PARENT PROJECT (if any) is not
   * archived. Planning applies to open work only, so the planning writes gate on
   * this INSIDE the guarded batch — enforcing the invariant even against a
   * completion that races between the read and the write (ADR-030 §30.4a), or a
   * project archived between the read and the write (ADR-037). Binds
   * `(workspaceId, entityId, workspaceId, entityId)`.
   */
  get #openTaskExistsSql(): string {
    return `SELECT 1 FROM entities oe
            JOIN spine_records osr
              ON osr.workspace_id = oe.workspace_id AND osr.entity_id = oe.id
            WHERE oe.workspace_id = ? AND oe.id = ? AND oe.type = '${TASK}'
              AND oe.deleted_at IS NULL AND osr.completed_at IS NULL
              AND ${this.#taskParentProjectNotArchivedSql}`;
  }

  /** The guarded entity `updated_at` bump used as the Activity append anchor,
   * gated on the task's PARENT PROJECT (if any) not being archived (ADR-037). */
  #bumpEntityStatement(entityId: string, nowTs: string): D1PreparedStatement {
    return this.#db
      .prepare(
        `UPDATE entities SET updated_at = ?
         WHERE id = ? AND workspace_id = ? AND type = '${TASK}' AND deleted_at IS NULL
           AND ${this.#taskParentProjectNotArchivedSql}
         RETURNING ${ENTITY_RETURNING}`,
      )
      .bind(nowTs, entityId, this.#workspaceId, this.#workspaceId, entityId);
  }

  /**
   * The planning guard-anchor bump: like {@link #bumpEntityStatement} but gated on
   * the task being OPEN and on the task's PARENT PROJECT (if any) not being
   * archived. If the task was completed (or deleted) between the read and this
   * write, it matches nothing → `changes() = 0` → the guarded planning Activity
   * is NOT appended and the gated `task_details` write no-ops, so a completed task
   * is never planned and no planning Activity is ever recorded against it. The
   * same applies to a project archived between the read and the write (ADR-037).
   */
  #bumpOpenTaskStatement(entityId: string, nowTs: string): D1PreparedStatement {
    return this.#db
      .prepare(
        `UPDATE entities SET updated_at = ?
         WHERE id = ? AND workspace_id = ? AND type = '${TASK}' AND deleted_at IS NULL
           AND EXISTS (SELECT 1 FROM spine_records
                       WHERE workspace_id = ? AND entity_id = ? AND completed_at IS NULL)
           AND ${this.#taskParentProjectNotArchivedSql}
         RETURNING ${ENTITY_RETURNING}`,
      )
      .bind(
        nowTs,
        entityId,
        this.#workspaceId,
        this.#workspaceId,
        entityId,
        this.#workspaceId,
        entityId,
      );
  }

  /** The task-domain rejection for a planning mutation attempted on completed work. */
  #completedError(): TaskValidationError {
    return new TaskValidationError(
      "completed",
      "this task is completed — planning applies to open work",
    );
  }

  /** Reject a planning mutation up front when the read shows the task completed. */
  #rejectIfCompleted(task: TaskView): void {
    if (task.completedAt !== null) {
      throw this.#completedError();
    }
  }

  /**
   * Reject ANY mutation up front when the task's direct parent is an ARCHIVED
   * Project (PROJ-05 / ADR-037) — an archived Project is read-only until
   * restored, and this is the shared repository-level guard every Task-detail
   * mutation (title/detail edit, waiting, planning, single or bulk, and
   * completion) runs through, so no route needs its own bespoke check. A Task
   * floating directly under an Area has no Project parent to check.
   *
   * This up-front read gives a FAST, PRECISE rejection (`TaskProjectArchivedError`)
   * in the common case. For `updateTask`/`setWaiting`/`clearWaiting`/`planTask`/
   * `clearPlan` (single and bulk), the SAME precondition is ALSO folded directly
   * into every domain statement those methods write via the shared
   * `#taskParentProjectNotArchivedSql`/`#activeTaskExistsSql`/`#openTaskExistsSql`
   * fragments — including each statement that is independent of the guard-anchor
   * bump (a detail upsert or a waiting-link write), so NONE of them can commit
   * even if a Project is archived in the instant between this read and the write.
   * A race that slips past this read therefore surfaces as the method's ordinary
   * not-found/conflict fallback (the guarded statement matches nothing), never a
   * silent partial mutation. `completeTask` keeps ONLY this read-based check
   * (not folded into its shared spine-completion SQL, which every spine kind
   * uses): completing an already-completed Task, or a Task whose Project could
   * only be archived because it holds no unfinished work, can never itself
   * recreate unfinished work, so no interleaving of `completeTask` and `archive`
   * threatens the invariant — see ADR-037 for the argument in full.
   */
  async #rejectIfParentProjectArchived(task: TaskView): Promise<void> {
    if (task.project === null) return;
    const row = await this.#db
      .prepare(
        `SELECT 1 FROM project_details
         WHERE workspace_id = ? AND entity_id = ? AND archived_at IS NOT NULL`,
      )
      .bind(this.#workspaceId, task.project.id)
      .first();
    if (row !== null) {
      throw new TaskProjectArchivedError();
    }
  }

  /**
   * Re-read a task after its open-gated planning guard matched nothing, and throw the
   * honest reason: a completion that raced the write → the completed rejection; a
   * deletion (or a vanished task) → not found. Used so the race is REJECTED, never
   * silently swallowed.
   */
  async #throwPlanGuardMiss(entityId: string): Promise<never> {
    const refreshed = await this.getTask(entityId, { includeDeleted: true });
    if (
      refreshed &&
      refreshed.completedAt !== null &&
      refreshed.deletedAt === null
    ) {
      throw this.#completedError();
    }
    throw new TaskNotFoundError();
  }

  /**
   * Statements that make the active `task.waiting_on` link reflect `targetId`:
   * always soft-delete any current active waiting link, then (when a target is
   * given) create-or-restore the link to it. Both gated on the active task AND its
   * parent Project not being archived (ADR-037) — this statement is independent of
   * the guard-anchor bump, so it needs its OWN gate or it could commit even when
   * the anchor's guard blocks the rest of the mutation; the create is additionally
   * gated on the active, in-workspace target (the composite FK is the final
   * backstop). Soft-delete runs before create so the one-active partial unique
   * index never conflicts within the transaction.
   */
  #waitingLinkStatements(
    taskId: string,
    targetId: string | null,
    nowTs: string,
  ): D1PreparedStatement[] {
    const softDelete = this.#db
      .prepare(
        `UPDATE entity_links SET deleted_at = ?, updated_at = ?
         WHERE workspace_id = ? AND source_entity_id = ?
           AND type = '${TASK_WAITING_ON}' AND deleted_at IS NULL
           AND ${this.#taskParentProjectNotArchivedSql}`,
      )
      .bind(nowTs, nowTs, this.#workspaceId, taskId, this.#workspaceId, taskId);
    if (targetId === null) {
      return [softDelete];
    }
    const create = this.#db
      .prepare(
        `INSERT INTO entity_links
           (id, workspace_id, source_entity_id, target_entity_id, type,
            created_at, updated_at, deleted_at)
         SELECT ?, ?, ?, ?, '${TASK_WAITING_ON}', ?, ?, NULL
         WHERE EXISTS (${this.#activeTaskExistsSql})
           AND EXISTS (SELECT 1 FROM entities
                       WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL)
         ON CONFLICT (workspace_id, source_entity_id, target_entity_id, type)
         DO UPDATE SET deleted_at = NULL, updated_at = excluded.updated_at`,
      )
      .bind(
        this.#newActivityId(),
        this.#workspaceId,
        taskId,
        targetId,
        nowTs,
        nowTs,
        this.#workspaceId,
        taskId,
        this.#workspaceId,
        taskId,
        this.#workspaceId,
        targetId,
      );
    return [softDelete, create];
  }

  /** True when the current waiting subject equals the requested subject. */
  #sameSubject(
    current: TaskWaiting,
    subject:
      | { readonly kind: "entity"; readonly targetId: string }
      | { readonly kind: "text"; readonly note: string },
  ): boolean {
    if (subject.kind === "text") {
      return (
        current.subject.kind === "text" && current.subject.note === subject.note
      );
    }
    return (
      current.subject.kind === "entity" &&
      current.subject.id === subject.targetId
    );
  }

  /** Resolve an active in-workspace entity's id, type and title, or null. */
  async #resolveWaitingTarget(
    entityId: string,
  ): Promise<{ id: string; type: string; title: string } | null> {
    const statement = this.#db
      .prepare(
        `SELECT id, type, title FROM entities
         WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL`,
      )
      .bind(this.#workspaceId, entityId);
    const result = await this.#run(statement);
    const rows = (result.results ?? []) as {
      readonly id: string;
      readonly type: string;
      readonly title: string;
    }[];
    const first = rows[0];
    return first
      ? { id: first.id, type: first.type, title: first.title }
      : null;
  }

  /**
   * Run a single-task guarded mutation as ONE atomic batch: the guard-anchor entity
   * bump FIRST, then its `changes()`-guarded event append, then the gated domain
   * writes (e.g. the `task_details` upsert and any link statements). Returns the
   * entity RETURNING row when the guard matched, else null (task deleted mid-flight).
   * Shared by the waiting and planning mutations (TODAY-03/04).
   */
  async #runGuardedMutation(
    entityStmt: D1PreparedStatement,
    event: NewActivityEvent,
    domainStmts: readonly D1PreparedStatement[],
    now: Date,
  ): Promise<EntityRow | null> {
    const model = buildActivityWriteModel(
      event,
      this.#actor.actor,
      this.#newActivityId(),
      now,
    );
    const [activityInsert, ...subjectInserts] =
      this.#recorder.buildAppendStatements(this.#workspaceId, model);

    const batch: D1PreparedStatement[] = [
      entityStmt,
      activityInsert!,
      ...subjectInserts,
      ...domainStmts,
    ];

    let results: D1Result<EntityRow>[];
    try {
      results = await this.#db.batch<EntityRow>(batch);
    } catch (cause) {
      if (cause instanceof ActivityError) {
        throw cause;
      }
      throw new TaskStorageError(undefined, { cause });
    }

    const entityResult = results[0];
    const rows = entityResult?.results ?? [];
    return rows[0] ?? null;
  }

  /**
   * Read the joined task row (entity + spine + details + structural parent + the
   * resolved active `task.waiting_on` target).
   */
  async #readJoined(
    entityId: string,
    includeDeleted: boolean,
  ): Promise<TaskWaitingJoinedRow | null> {
    const deletedClause = includeDeleted ? "" : " AND e.deleted_at IS NULL";
    const statement = this.#db
      .prepare(
        `SELECT ${TASK_DETAIL_COLUMNS},
                ${WAITING_TARGET_COLUMNS},
                pl.target_entity_id AS parent_id,
                pl.type AS parent_link_type
         FROM entities e
         JOIN spine_records sr
           ON sr.workspace_id = e.workspace_id AND sr.entity_id = e.id
         LEFT JOIN task_details td
           ON td.workspace_id = e.workspace_id AND td.entity_id = e.id
         ${TASK_RECURRENCE_JOIN}
         LEFT JOIN entity_links pl
           ON pl.workspace_id = e.workspace_id AND pl.source_entity_id = e.id
              AND pl.deleted_at IS NULL AND pl.type IN (${TASK_PARENT_LINK_LIST})
         ${WAITING_TARGET_JOIN}
         WHERE e.id = ? AND e.workspace_id = ? AND e.type = '${TASK}'${deletedClause}`,
      )
      .bind(entityId, this.#workspaceId);
    const result = await this.#run(statement);
    const rows = (result.results ?? []) as TaskWaitingJoinedRow[];
    return rows[0] ?? null;
  }

  /**
   * Resolve the real project/goal/area relationships for a task by walking the
   * spine hierarchy. A task's structural parent is exactly one of an Area or a
   * Project; a project-parented task's Goal (via `project.advances_goal`) and Area
   * (via `project.belongs_to_area`, or the Goal's Area) are resolved from the
   * hierarchy — never stored twice. All lookups are workspace-scoped and
   * active-only, so an inaccessible related record simply resolves to null.
   */
  async #resolveRelationships(row: TaskJoinedRow): Promise<{
    project: TaskRelation | null;
    goal: TaskRelation | null;
    area: TaskRelation | null;
  }> {
    if (row.parent_id === null || row.parent_link_type === null) {
      return { project: null, goal: null, area: null };
    }

    if (row.parent_link_type === TASK_BELONGS_TO_AREA) {
      const area = await this.#resolveEntity(row.parent_id);
      return {
        project: null,
        goal: null,
        area: area ? this.#relation("area", area) : null,
      };
    }

    // Parent is a Project. Resolve the project, then its Goal and/or Area.
    const projectEntity = await this.#resolveEntity(row.parent_id);
    const project = projectEntity
      ? this.#relation("project", projectEntity)
      : null;

    const projectParent = await this.#resolveStructuralParent(row.parent_id, [
      PROJECT_ADVANCES_GOAL,
      PROJECT_BELONGS_TO_AREA,
    ]);

    let goal: TaskRelation | null = null;
    let area: TaskRelation | null = null;
    if (projectParent?.linkType === PROJECT_ADVANCES_GOAL) {
      const goalEntity = await this.#resolveEntity(projectParent.targetId);
      goal = goalEntity ? this.#relation("goal", goalEntity) : null;
      // A goal-advancing project's Area is the Goal's Area.
      const goalParent = await this.#resolveStructuralParent(
        projectParent.targetId,
        [GOAL_BELONGS_TO_AREA],
      );
      if (goalParent) {
        const areaEntity = await this.#resolveEntity(goalParent.targetId);
        area = areaEntity ? this.#relation("area", areaEntity) : null;
      }
    } else if (projectParent?.linkType === PROJECT_BELONGS_TO_AREA) {
      const areaEntity = await this.#resolveEntity(projectParent.targetId);
      area = areaEntity ? this.#relation("area", areaEntity) : null;
    }

    return { project, goal, area };
  }

  /** Resolve an active entity's id + title within the workspace, or null. */
  async #resolveEntity(entityId: string): Promise<ResolvedEntity | null> {
    const statement = this.#db
      .prepare(
        `SELECT id, title FROM entities
         WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL`,
      )
      .bind(this.#workspaceId, entityId);
    const result = await this.#run(statement);
    const rows = (result.results ?? []) as {
      readonly id: string;
      readonly title: string;
    }[];
    const first = rows[0];
    return first ? { id: first.id, title: first.title } : null;
  }

  /** The single active structural parent link of a record among the given types. */
  async #resolveStructuralParent(
    sourceEntityId: string,
    linkTypes: readonly string[],
  ): Promise<{ targetId: string; linkType: string } | null> {
    const list = linkTypes.map((t) => `'${t}'`).join(", ");
    const statement = this.#db
      .prepare(
        `SELECT target_entity_id AS target_id, type AS link_type
         FROM entity_links
         WHERE workspace_id = ? AND source_entity_id = ?
           AND deleted_at IS NULL AND type IN (${list})
         LIMIT 1`,
      )
      .bind(this.#workspaceId, sourceEntityId);
    const result = await this.#run(statement);
    const rows = (result.results ?? []) as {
      readonly target_id: string;
      readonly link_type: string;
    }[];
    const first = rows[0];
    return first
      ? { targetId: first.target_id, linkType: first.link_type }
      : null;
  }

  #relation(kind: TaskRelationKind, entity: ResolvedEntity): TaskRelation {
    return { kind, id: entity.id, title: entity.title };
  }

  /** Derive the structural parent relation for a list row's parent columns. */
  /**
   * A joined row's structural parent, WITH its identity when the read resolved it.
   *
   * DEBT-144: the three identity columns are optional on the row type because not
   * every statement prefixes `TASK_PARENT_IDENTITY_CTE` — a statement that does
   * not simply produces the relation it produced before, and the surfaces drawing
   * it fall back to the neutral entity mark. Every task-LIST read does prefix it,
   * which is what makes a parent the same colour on every list in the product.
   */
  #parentRelation(
    linkType: string | null,
    parentId: string | null,
    parentTitle: string | null,
    identity?: Partial<TaskParentIdentityColumns>,
  ): TaskRelation | null {
    if (linkType === null || parentId === null || parentTitle === null) {
      return null;
    }
    const kind: TaskRelationKind =
      linkType === TASK_BELONGS_TO_PROJECT ? "project" : "area";
    const rank = identity?.parent_colour_rank;
    return {
      kind,
      id: parentId,
      title: parentTitle,
      colourSlot: identity?.parent_colour_slot ?? null,
      iconKey: identity?.parent_icon_key ?? null,
      colourRank: rank === null || rank === undefined ? null : Number(rank),
    };
  }

  #toView(
    row: TaskWaitingJoinedRow,
    details: TaskDetails,
    relationships: {
      project: TaskRelation | null;
      goal: TaskRelation | null;
      area: TaskRelation | null;
    },
  ): TaskView {
    return {
      id: row.id,
      workspaceId: parseWorkspaceId(row.workspace_id),
      title: row.title,
      createdAt: fromStorageTimestamp(row.created_at),
      updatedAt: fromStorageTimestamp(row.updated_at),
      deletedAt:
        row.deleted_at === null ? null : fromStorageTimestamp(row.deleted_at),
      completedAt:
        row.completed_at === null
          ? null
          : fromStorageTimestamp(row.completed_at),
      status: details.status,
      priority: details.priority,
      dueDate: details.dueDate,
      scheduledDate: details.scheduledDate,
      timeSector: details.timeSector,
      commitmentState: details.commitmentState,
      delegation: details.delegation,
      recurrence: details.recurrence,
      recurrenceSeries: details.recurrenceSeries,
      description: details.description,
      tags: details.tags,
      project: relationships.project,
      goal: relationships.goal,
      area: relationships.area,
      waiting: rowToTaskWaiting(row),
    };
  }

  /**
   * Run the update as ONE atomic batch: the guarded entity update FIRST, then its
   * `changes()`-guarded `entity.updated` append, then the gated details upsert.
   * Returns the entity RETURNING row when the guard matched (the update happened),
   * or null when it matched nothing (the task was deleted mid-flight).
   */
  async #runUpdate(
    entityStmt: D1PreparedStatement,
    event: NewActivityEvent,
    detailsStmt: D1PreparedStatement | undefined,
    now: Date,
    /**
     * V2.6 FIND-03 — further guarded statements produced by the same write. A
     * BUILDER rather than a list, because they are guarded on this event's id
     * and the id is minted here.
     */
    trailing?: (activityId: string) => readonly D1PreparedStatement[],
  ): Promise<EntityRow | null> {
    const model = buildActivityWriteModel(
      event,
      this.#actor.actor,
      this.#newActivityId(),
      now,
    );
    const [activityInsert, ...subjectInserts] =
      this.#recorder.buildAppendStatements(this.#workspaceId, model);

    // The details upsert (when a detail field changed) runs LAST in the batch — the
    // event's `changes() > 0` guard refers to the entity update immediately before
    // it, so it is unaffected. A title-only update omits the details statement.
    const batch: D1PreparedStatement[] = [
      entityStmt,
      activityInsert!,
      ...subjectInserts,
      ...(detailsStmt ? [detailsStmt] : []),
      ...(trailing?.(model.id) ?? []),
    ];

    let results: D1Result<EntityRow>[];
    try {
      results = await this.#db.batch<EntityRow>(batch);
    } catch (cause) {
      if (cause instanceof ActivityError) {
        throw cause;
      }
      throw new TaskStorageError(undefined, { cause });
    }

    const entityResult = results[0];
    const rows = entityResult?.results ?? [];
    return rows[0] ?? null;
  }

  /** Run a single read statement, re-typing raw storage failures. */
  async #run(statement: D1PreparedStatement): Promise<D1Result> {
    try {
      return await statement.all();
    } catch (cause) {
      throw new TaskStorageError(undefined, { cause });
    }
  }

  /* ---------------------------------------------------------------------- */
  /* TASKS-13 — checklists                                                    */
  /*                                                                          */
  /* The ONE place a checklist item is written. Every surface — the record,   */
  /* the phone, an offline replay and (later) a Project Template clone —      */
  /* reaches these methods, so consistency between them is structural rather  */
  /* than a convention. Nothing here appends Activity: a checklist tick is    */
  /* STATE, not history (TASKS_MODULE.md records the decision and its         */
  /* reasoning), and every mutation instead bumps the parent Task's           */
  /* `updated_at` so a Task whose steps changed reads as recently changed.    */
  /* ---------------------------------------------------------------------- */

  async listChecklist(taskId: string): Promise<readonly TaskChecklistItem[]> {
    let entityId: string;
    try {
      entityId = validateTaskId(taskId);
    } catch {
      // A malformed id is not an error on a READ: it simply names no Task, and
      // a Task that names nothing has no checklist.
      return [];
    }
    const result = await this.#run(
      this.#db
        .prepare(
          `SELECT ${TASK_CHECKLIST_COLUMNS}
           FROM task_checklist_items ci
           WHERE ci.workspace_id = ? AND ci.task_id = ?
           ORDER BY ${TASK_CHECKLIST_ORDER}
           LIMIT ?`,
        )
        .bind(this.#workspaceId, entityId, MAX_CHECKLIST_ITEMS),
    );
    return ((result.results ?? []) as TaskChecklistItemRow[]).map(
      rowToChecklistItem,
    );
  }

  /**
   * DEBT-59 — the OPEN subset of an id list, in a bounded number of statements.
   *
   * The Asset record resolved each obligation's linked-Task open state with its
   * own `getTask`, capped at 50 lookups per load — so 50 obligations cost 50
   * statements, and obligation 51 onward silently read as "not open", showing
   * the "record what actually happened" prompt for a Task that was still open.
   *
   * The predicate is the one `OPEN_TASK_EXISTS` already expresses in the Assets
   * attention query, moved here so there is ONE definition of an open Task
   * rather than a second one per surface.
   */
  async listOpenTaskIds(
    taskIds: readonly string[],
  ): Promise<ReadonlySet<string>> {
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const raw of taskIds) {
      if (typeof raw !== "string" || raw.length === 0) continue;
      if (seen.has(raw)) continue;
      seen.add(raw);
      unique.push(raw);
    }
    const open = new Set<string>();
    // An empty list costs NOTHING — no statement can answer anything but "none".
    if (unique.length === 0) return open;

    /*
     * ONE statement per CHUNK, never one per Task. The chunk exists only because
     * D1 accepts a finite number of bound parameters, so the statement count is
     * ceil(ids / CHECKLIST_ID_CHUNK) — a function of the caller's page, not of
     * the workspace's size.
     */
    const chunks: string[][] = [];
    for (let start = 0; start < unique.length; start += CHECKLIST_ID_CHUNK) {
      chunks.push(unique.slice(start, start + CHECKLIST_ID_CHUNK));
    }
    // PERF-01 — concurrent, for the reason `listChecklistProgress` records: a
    // chunk boundary is arithmetic, so no chunk waits on another.
    const results = await Promise.all(
      chunks.map((chunk) =>
        this.#run(
          this.#db
            .prepare(
              `SELECT e.id AS id
               FROM entities e
               JOIN spine_records sr
                 ON sr.workspace_id = e.workspace_id AND sr.entity_id = e.id
               LEFT JOIN task_details td
                 ON td.workspace_id = e.workspace_id AND td.entity_id = e.id
              WHERE e.workspace_id = ?
                AND e.id IN (${chunk.map(() => "?").join(", ")})
                AND e.type = 'task'
                AND e.deleted_at IS NULL
                AND sr.completed_at IS NULL
                AND coalesce(td.status, 'todo') <> 'cancelled'`,
            )
            .bind(this.#workspaceId, ...chunk),
        ),
      ),
    );
    for (const result of results) {
      for (const row of (result.results ?? []) as {
        readonly id: string;
      }[]) {
        open.add(row.id);
      }
    }
    return open;
  }

  async listChecklistProgress(
    taskIds: readonly string[],
  ): Promise<ReadonlyMap<string, TaskChecklistProgress>> {
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const raw of taskIds) {
      if (typeof raw !== "string" || raw.length === 0) continue;
      if (seen.has(raw)) continue;
      seen.add(raw);
      unique.push(raw);
    }
    const progress = new Map<string, TaskChecklistProgress>();
    // An empty page costs NOTHING. A surface with no Tasks must not pay for a
    // statement that can only answer "none".
    if (unique.length === 0) return progress;
    if (unique.length > CHECKLIST_PROGRESS_MAX_TASKS) {
      throw new TaskValidationError(
        "limit",
        `checklist progress is read for at most ${CHECKLIST_PROGRESS_MAX_TASKS} tasks at a time`,
      );
    }

    /*
     * ONE aggregate per CHUNK, never one per Task — and every chunk CONCURRENT.
     *
     * The chunk exists only because D1 accepts a finite number of bound
     * parameters; the statement count is therefore
     * ceil(pageSize / CHECKLIST_ID_CHUNK) — a function of the caller's PAGE,
     * which is a constant per surface, and independent of how many Tasks the
     * workspace holds. That is the property `no N+1` actually asks for, and
     * `task-checklist-query-bounds.test.ts` asserts it.
     *
     * PERF-01 — the chunks used to be awaited one after another, and on a real
     * workspace that was measurable: Today reads 240 Tasks, which is three
     * chunks, which was THREE serial D1 round trips inside one aggregate whose
     * whole point was to be one. Chunk *n* does not depend on chunk *n-1* — the
     * ids were split by arithmetic, not by anything the database says — so they
     * are issued together and the aggregate costs one round trip again. The
     * statement count is unchanged; the depth is not
     * (`navigation-statement-budget.test.ts`).
     */
    const chunks: string[][] = [];
    for (let start = 0; start < unique.length; start += CHECKLIST_ID_CHUNK) {
      chunks.push(unique.slice(start, start + CHECKLIST_ID_CHUNK));
    }
    const results = await Promise.all(
      chunks.map((chunk) =>
        this.#run(
          this.#db
            .prepare(
              `SELECT task_id AS task_id,
                    COUNT(*) AS total,
                    SUM(completed) AS done
             FROM task_checklist_items
             WHERE workspace_id = ? AND task_id IN (${chunk.map(() => "?").join(", ")})
             GROUP BY task_id`,
            )
            .bind(this.#workspaceId, ...chunk),
        ),
      ),
    );
    for (const result of results) {
      for (const row of (result.results ?? []) as {
        readonly task_id: string;
        readonly total: number;
        readonly done: number | null;
      }[]) {
        progress.set(row.task_id, {
          total: Number(row.total ?? 0),
          completed: Number(row.done ?? 0),
        });
      }
    }
    return progress;
  }

  async createChecklistItem(
    taskId: string,
    input: { readonly title: string },
  ): Promise<TaskChecklistItem> {
    const entityId = validateTaskId(taskId);
    const title = validateChecklistTitle(input.title);
    await this.#requireWritableTask(entityId);

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const itemId = this.#newEntityId();

    /*
     * The position is resolved INSIDE the insert, from the table itself.
     *
     * Reading `MAX(position)` first and binding the result would leave a gap two
     * quick additions could both read through, and both would land on the same
     * slot. `COALESCE(MAX(position) + 1, 0)` over this Task's rows makes the
     * database choose, so the second insert sees the first.
     *
     * The insert is also gated on the Task being present and active, so a Task
     * deleted between the guard above and this statement yields no orphan row.
     *
     * The LIMIT is enforced by the same statement, for the same reason. Reading
     * the count first and deciding in TypeScript leaves a window two devices can
     * both pass at ninety-nine, and a hundred-and-first row is worse than a
     * refusal: `listChecklist` stops at a hundred, so the extra row becomes
     * invisible to the record while `listChecklistProgress` — which counts
     * without a limit — keeps counting it. The owner would see a total they
     * could not reach. Asking the database to decide closes the window.
     */
    const statements: D1PreparedStatement[] = [
      this.#db
        .prepare(
          `INSERT INTO task_checklist_items
             (id, workspace_id, task_id, task_type, title, position, completed,
              created_at, updated_at)
           SELECT ?, ?, ?, '${TASK}', ?,
                  (SELECT COALESCE(MAX(ci.position) + 1, 0)
                     FROM task_checklist_items ci
                    WHERE ci.workspace_id = ? AND ci.task_id = ?),
                  0, ?, ?
           WHERE EXISTS (
                   SELECT 1 FROM entities
                   WHERE workspace_id = ? AND id = ? AND type = '${TASK}'
                     AND deleted_at IS NULL
                 )
             AND (SELECT COUNT(*)
                    FROM task_checklist_items held
                   WHERE held.workspace_id = ? AND held.task_id = ?)
                 < ${MAX_CHECKLIST_ITEMS}`,
        )
        .bind(
          itemId,
          this.#workspaceId,
          entityId,
          title,
          this.#workspaceId,
          entityId,
          nowTs,
          nowTs,
          this.#workspaceId,
          entityId,
          this.#workspaceId,
          entityId,
        ),
      // Guarded on the insert's own `changes()`, so a refused insert leaves the
      // Task's timestamp exactly where it was.
      buildEntityUpdatedAtBumpStatement(
        this.#db,
        this.#workspaceId,
        entityId,
        nowTs,
      ),
    ];

    const results = await this.#runTaskBatch(statements);

    if ((results[0]?.meta?.changes ?? 0) === 0) {
      /*
       * The statement refused it, and only the statement knows which of its two
       * conditions said no. Counting now distinguishes them, and it costs a
       * query only on the path that is already failing.
       */
      if ((await this.#countChecklist(entityId)) >= MAX_CHECKLIST_ITEMS) {
        throw new TaskChecklistFullError(MAX_CHECKLIST_ITEMS);
      }
      // The Task vanished between the guard and the insert. Nothing was written.
      throw new TaskNotFoundError();
    }

    const item = await this.#readChecklistItem(entityId, itemId);
    if (item === null) {
      throw new TaskNotFoundError();
    }
    return item;
  }

  async renameChecklistItem(
    taskId: string,
    itemId: string,
    title: string,
  ): Promise<{ readonly item: TaskChecklistItem; readonly changed: boolean }> {
    const entityId = validateTaskId(taskId);
    const checklistItemId = validateChecklistItemId(itemId);
    const next = validateChecklistTitle(title);
    await this.#requireWritableTask(entityId);

    const current = await this.#readChecklistItem(entityId, checklistItemId);
    if (current === null) {
      throw new TaskChecklistItemNotFoundError();
    }
    if (current.title === next) {
      return { item: current, changed: false };
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const results = await this.#runTaskBatch([
      // ONE column. A rename cannot disturb completion or order, so two devices
      // renaming two different items — or the same item's tick — never contend.
      this.#db
        .prepare(
          `UPDATE task_checklist_items
           SET title = ?, updated_at = ?
           WHERE workspace_id = ? AND task_id = ? AND id = ? AND title <> ?`,
        )
        .bind(next, nowTs, this.#workspaceId, entityId, checklistItemId, next),
      buildEntityUpdatedAtBumpStatement(
        this.#db,
        this.#workspaceId,
        entityId,
        nowTs,
      ),
    ]);

    const item = await this.#readChecklistItem(entityId, checklistItemId);
    if (item === null) {
      throw new TaskChecklistItemNotFoundError();
    }
    // `changed` is what the GUARDED statement actually did, not what was asked
    // for: a racer that wrote the same title first leaves this one at zero, and
    // saying "changed" then would be a claim about a write that did not happen.
    return { item, changed: (results[0]?.meta?.changes ?? 0) > 0 };
  }

  async setChecklistItemCompleted(
    taskId: string,
    itemId: string,
    completed: boolean,
  ): Promise<{ readonly item: TaskChecklistItem; readonly changed: boolean }> {
    const entityId = validateTaskId(taskId);
    const checklistItemId = validateChecklistItemId(itemId);
    await this.#requireWritableTask(entityId);

    const current = await this.#readChecklistItem(entityId, checklistItemId);
    if (current === null) {
      throw new TaskChecklistItemNotFoundError();
    }
    if (current.completed === completed) {
      // Idempotent. This is what makes a replayed offline tick safe to repeat,
      // and it is the SECOND of the two protections — the offline receipt is the
      // first, and neither is load-bearing alone.
      return { item: current, changed: false };
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const flag = completed ? 1 : 0;
    const results = await this.#runTaskBatch([
      /*
       * ONE row, ONE column, guarded on the value actually changing.
       *
       * Note what is NOT in this batch: any statement touching the parent Task's
       * `spine_records.completed_at`. Completing every step does not complete the
       * Task, and completing the Task does not touch a step. The two are separate
       * decisions and the schema keeps them separate.
       */
      this.#db
        .prepare(
          `UPDATE task_checklist_items
           SET completed = ?, updated_at = ?
           WHERE workspace_id = ? AND task_id = ? AND id = ? AND completed <> ?`,
        )
        .bind(flag, nowTs, this.#workspaceId, entityId, checklistItemId, flag),
      buildEntityUpdatedAtBumpStatement(
        this.#db,
        this.#workspaceId,
        entityId,
        nowTs,
      ),
    ]);

    const item = await this.#readChecklistItem(entityId, checklistItemId);
    if (item === null) {
      throw new TaskChecklistItemNotFoundError();
    }
    // The guarded UPDATE's own answer. Two devices ticking the same item in the
    // same instant both see the intended state, and at most ONE of them reports
    // having written it.
    return { item, changed: (results[0]?.meta?.changes ?? 0) > 0 };
  }

  async deleteChecklistItem(
    taskId: string,
    itemId: string,
  ): Promise<{ readonly changed: boolean }> {
    const entityId = validateTaskId(taskId);
    const checklistItemId = validateChecklistItemId(itemId);
    await this.#requireWritableTask(entityId);

    const current = await this.#readChecklistItem(entityId, checklistItemId);
    if (current === null) {
      // Deleting what is already gone is the outcome that was asked for. On a
      // surface two devices can both act on, that is not an error.
      return { changed: false };
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const results = await this.#runTaskBatch([
      this.#db
        .prepare(
          `DELETE FROM task_checklist_items
           WHERE workspace_id = ? AND task_id = ? AND id = ?`,
        )
        .bind(this.#workspaceId, entityId, checklistItemId),
      // Close the gap IN THE SAME transaction, so positions stay dense and the
      // next item added cannot collide with a slot the deletion vacated. Gated on
      // the delete's own `changes()`.
      this.#db
        .prepare(
          `UPDATE task_checklist_items
           SET position = position - 1, updated_at = ?
           WHERE workspace_id = ? AND task_id = ? AND position > ?
             AND changes() > 0`,
        )
        .bind(nowTs, this.#workspaceId, entityId, current.position),
      this.#db
        .prepare(
          `UPDATE entities SET updated_at = ?
           WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL`,
        )
        .bind(nowTs, this.#workspaceId, entityId),
    ]);
    // The DELETE is the first statement. A racer that removed the row between the
    // read and the batch leaves it at zero, and the honest answer is "nothing
    // changed here" rather than a claim this call made the removal.
    return { changed: (results[0]?.meta?.changes ?? 0) > 0 };
  }

  async reorderChecklist(
    taskId: string,
    orderedItemIds: readonly string[],
  ): Promise<{ readonly changed: boolean }> {
    const entityId = validateTaskId(taskId);
    const order = validateChecklistOrder(orderedItemIds);
    await this.#requireWritableTask(entityId);

    const current = await this.listChecklist(entityId);
    /*
     * The submitted list must name EXACTLY this Task's items, each once.
     *
     * A partial reorder is refused rather than applied, because the alternative
     * is silently inventing an order the owner never chose: a device holding a
     * stale list (one item short, because another device added one) would push
     * the missing item to an arbitrary place. Refusing means the surface re-reads
     * and the owner sees the truth.
     */
    const currentIds = new Set(current.map((item) => item.id));
    if (
      order.length !== current.length ||
      order.some((id) => !currentIds.has(id))
    ) {
      throw new TaskChecklistItemNotFoundError(
        "This checklist changed somewhere else, so the new order was not saved.",
      );
    }
    const unchanged = current.every((item, index) => order[index] === item.id);
    if (unchanged) {
      return { changed: false };
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    /*
     * ONE statement per row, in ONE batch, so the whole order commits or none of
     * it does — a half-applied reorder is not a state the owner can be shown.
     *
     * `position` carries no UNIQUE index (migration 0045 says why): a renumber
     * necessarily passes through states where two rows briefly share a value, and
     * SQLite checks a unique index row by row rather than at commit. The read
     * order's `(created_at, id)` tiebreak means even that transient state has one
     * deterministic answer.
     */
    /*
     * The membership check above ran against a SNAPSHOT, so it is carried into
     * the write as a precondition rather than trusted across the gap.
     *
     * Every statement in the batch — the rows and the Task's own timestamp —
     * requires the checklist to still hold exactly the number of steps the
     * submitted order names. A step added or deleted between the read and the
     * batch changes that count, so every statement finds nothing, the whole
     * transaction writes nothing, and the caller is told the list moved instead
     * of being told a stale order was saved. The batch is one transaction and
     * every statement carries the SAME condition, so it cannot half-apply.
     *
     * What it does not separate is a delete and an add landing together, which
     * leaves the count where it was. The order then applies to the steps it can
     * still find and the added one keeps its own place — not a corrupt list,
     * because `(position, created_at, id)` is a TOTAL order, and the next
     * reorder or delete renumbers it. Closing that window as well would mean
     * naming every id inside the condition, and a hundred ids do not fit D1's
     * bound-parameter budget.
     */
    const stillHolds = `(SELECT COUNT(*)
                           FROM task_checklist_items held
                          WHERE held.workspace_id = ? AND held.task_id = ?) = ?`;
    const statements = order.map((id, index) =>
      this.#db
        .prepare(
          `UPDATE task_checklist_items
           SET position = ?, updated_at = ?
           WHERE workspace_id = ? AND task_id = ? AND id = ? AND position <> ?
             AND ${stillHolds}`,
        )
        .bind(
          index,
          nowTs,
          this.#workspaceId,
          entityId,
          id,
          index,
          this.#workspaceId,
          entityId,
          order.length,
        ),
    );
    statements.push(
      this.#db
        .prepare(
          `UPDATE entities SET updated_at = ?
           WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL
             AND ${stillHolds}`,
        )
        .bind(
          nowTs,
          this.#workspaceId,
          entityId,
          this.#workspaceId,
          entityId,
          order.length,
        ),
    );
    const results = await this.#runTaskBatch(statements);

    /*
     * At least one row MUST have moved: the unchanged case returned above, so a
     * batch that wrote nothing means the precondition refused it.
     */
    const rowsWritten = results
      .slice(0, order.length)
      .reduce((total, result) => total + (result.meta?.changes ?? 0), 0);
    if (rowsWritten === 0) {
      throw new TaskChecklistItemNotFoundError(
        "This checklist changed somewhere else, so the new order was not saved.",
      );
    }
    return { changed: true };
  }

  /**
   * The guard every checklist MUTATION passes: the id names a live Task in this
   * workspace, and its Project is not archived.
   *
   * Workspace isolation is proved twice over — once here, and again by the
   * `workspace_id = ?` on every statement below — so an item can never be reached
   * through a Task in another workspace, and a Task id from another workspace is
   * indistinguishable from one that does not exist.
   */
  async #requireWritableTask(entityId: string): Promise<TaskView> {
    const task = await this.getTask(entityId);
    if (!task) {
      throw new TaskNotFoundError();
    }
    await this.#rejectIfParentProjectArchived(task);
    return task;
  }

  /** How many steps this Task holds right now. Used only on a refused write. */
  async #countChecklist(taskId: string): Promise<number> {
    const row = await this.#db
      .prepare(
        `SELECT COUNT(*) AS total
         FROM task_checklist_items ci
         WHERE ci.workspace_id = ? AND ci.task_id = ?`,
      )
      .bind(this.#workspaceId, taskId)
      .first<{ total: number }>();
    return row?.total ?? 0;
  }

  /** Read ONE checklist item, scoped to its workspace AND its parent Task. */
  async #readChecklistItem(
    taskId: string,
    itemId: string,
  ): Promise<TaskChecklistItem | null> {
    const row = await this.#db
      .prepare(
        `SELECT ${TASK_CHECKLIST_COLUMNS}
         FROM task_checklist_items ci
         WHERE ci.workspace_id = ? AND ci.task_id = ? AND ci.id = ?`,
      )
      .bind(this.#workspaceId, taskId, itemId)
      .first<TaskChecklistItemRow>();
    return row === null ? null : rowToChecklistItem(row);
  }

  /* ---------------------------------------------------------------------- */
  /* TASKS-12 — dependencies                                                  */
  /*                                                                          */
  /* The ONE place a `task.blocks` edge is written. The generic EntityLink     */
  /* repository refuses the type (RESERVED_TASK_LINK_TYPES), so every          */
  /* dependency in the workspace passed through these two mutations and every  */
  /* invariant they enforce.                                                   */
  /*                                                                          */
  /* Every invariant is a PREDICATE INSIDE THE WRITE, never a read-then-decide */
  /* — Task-only live endpoints, the two bounds, and the cycle walk. SQLite    */
  /* serialises writers and a D1 batch is one transaction, so a statement whose */
  /* WHERE clause carries the check re-evaluates it against committed state:   */
  /* two concurrent adds cannot both see nineteen blockers, and two concurrent */
  /* edges cannot close a cycle between them. A test proves both.              */
  /* ---------------------------------------------------------------------- */

  async listTaskDependencies(taskId: string): Promise<TaskDependencies> {
    let entityId: string;
    try {
      entityId = validateTaskId(taskId);
    } catch {
      // A malformed id names no Task, and a Task that does not exist has no
      // dependencies. Never an error on a read.
      return EMPTY_TASK_DEPENDENCIES;
    }
    /*
     * ONE statement for BOTH directions.
     *
     * The two halves read the same rows from the two ends the relationship
     * already has, so "what blocks me" and "what I block" can never be answered
     * from two different reads that disagree. The counterpart's title and
     * completion are joined in, so a record with twenty blockers costs one
     * statement rather than twenty-one.
     *
     * A soft-deleted counterpart is excluded by the join: a Task in the trash is
     * not holding anything up, and it is not being held up either.
     */
    const result = await this.#run(
      this.#db
        .prepare(
          `SELECT 'blocked_by' AS direction,
                  other.id AS task_id,
                  other.title AS title,
                  sr.completed_at AS completed_at
           FROM entity_links l
           JOIN entities other
             ON other.workspace_id = l.workspace_id
            AND other.id = l.source_entity_id
            AND other.type = '${TASK}'
            AND other.deleted_at IS NULL
           LEFT JOIN spine_records sr
             ON sr.workspace_id = other.workspace_id AND sr.entity_id = other.id
           WHERE l.workspace_id = ? AND l.target_entity_id = ?
             AND l.type = ? AND l.deleted_at IS NULL
           UNION ALL
           SELECT 'blocks' AS direction,
                  other.id AS task_id,
                  other.title AS title,
                  sr.completed_at AS completed_at
           FROM entity_links l
           JOIN entities other
             ON other.workspace_id = l.workspace_id
            AND other.id = l.target_entity_id
            AND other.type = '${TASK}'
            AND other.deleted_at IS NULL
           LEFT JOIN spine_records sr
             ON sr.workspace_id = other.workspace_id AND sr.entity_id = other.id
           WHERE l.workspace_id = ? AND l.source_entity_id = ?
             AND l.type = ? AND l.deleted_at IS NULL
           ORDER BY direction, title, task_id
           LIMIT ?`,
        )
        .bind(
          this.#workspaceId,
          entityId,
          TASK_BLOCKS,
          this.#workspaceId,
          entityId,
          TASK_BLOCKS,
          // Both bounds are enforced by the WRITE, so this can only ever be a
          // backstop -- but a read with no LIMIT is a read that can grow.
          MAX_TASK_BLOCKERS + MAX_TASK_BLOCKS,
        ),
    );
    const blockedBy: TaskDependencyEndpoint[] = [];
    const blocks: TaskDependencyEndpoint[] = [];
    for (const row of (result.results ?? []) as {
      readonly direction: string;
      readonly task_id: string;
      readonly title: string;
      readonly completed_at: string | null;
    }[]) {
      const endpoint: TaskDependencyEndpoint = {
        taskId: row.task_id,
        title: row.title,
        completedAt:
          row.completed_at === null
            ? null
            : fromStorageTimestamp(row.completed_at),
      };
      if (row.direction === "blocked_by") blockedBy.push(endpoint);
      else blocks.push(endpoint);
    }
    return { blockedBy, blocks };
  }

  async listBlockedSummaries(
    taskIds: readonly string[],
  ): Promise<ReadonlyMap<string, TaskBlockedSummary>> {
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const raw of taskIds) {
      if (typeof raw !== "string" || raw.length === 0) continue;
      if (seen.has(raw)) continue;
      seen.add(raw);
      unique.push(raw);
    }
    const summaries = new Map<string, TaskBlockedSummary>();
    // An empty page costs NOTHING, exactly as checklist progress does.
    if (unique.length === 0) return summaries;
    if (unique.length > BLOCKED_SUMMARY_MAX_TASKS) {
      throw new TaskValidationError(
        "limit",
        `blocked state is read for at most ${BLOCKED_SUMMARY_MAX_TASKS} tasks at a time`,
      );
    }

    /*
     * ONE aggregate per CHUNK, never one per Task, and never "read every edge
     * and count in JavaScript".
     *
     * The chunk exists only because D1 accepts a finite number of bound
     * parameters, so the statement count is ceil(pageSize / DEPENDENCY_ID_CHUNK)
     * — a function of the caller's page, not of how many Tasks or edges the
     * workspace holds. `task-dependency-query-bounds.test.ts` asserts it.
     *
     * The predicate is the DERIVATION: a blocker counts only while its Task is
     * alive and has no completion. There is no stored flag, so completing the
     * last blocker unblocks the Task on the very next read and reopening it
     * blocks the Task again -- with nothing to reconcile.
     *
     * MIN(title) is the same blocker every device names, so two clients drawing
     * "Blocked by X" cannot disagree about which X.
     */
    const chunks: string[][] = [];
    for (let start = 0; start < unique.length; start += DEPENDENCY_ID_CHUNK) {
      chunks.push(unique.slice(start, start + DEPENDENCY_ID_CHUNK));
    }
    // PERF-01 — concurrent, for the reason `listChecklistProgress` records.
    const results = await Promise.all(
      chunks.map((chunk) =>
        this.#run(
          this.#db
            .prepare(
              `SELECT l.target_entity_id AS task_id,
                    COUNT(*) AS blockers,
                    MIN(blocker.title) AS first_title
             FROM entity_links l
             JOIN entities blocker
               ON blocker.workspace_id = l.workspace_id
              AND blocker.id = l.source_entity_id
              AND blocker.type = '${TASK}'
              AND blocker.deleted_at IS NULL
             LEFT JOIN spine_records sr
               ON sr.workspace_id = blocker.workspace_id
              AND sr.entity_id = blocker.id
             WHERE l.workspace_id = ?
               AND l.type = ?
               AND l.deleted_at IS NULL
               AND l.target_entity_id IN (${chunk.map(() => "?").join(", ")})
               AND sr.completed_at IS NULL
             GROUP BY l.target_entity_id`,
            )
            .bind(this.#workspaceId, TASK_BLOCKS, ...chunk),
        ),
      ),
    );
    for (const result of results) {
      for (const row of (result.results ?? []) as {
        readonly task_id: string;
        readonly blockers: number;
        readonly first_title: string | null;
      }[]) {
        const blockerCount = Number(row.blockers ?? 0);
        if (blockerCount < 1) continue;
        summaries.set(row.task_id, {
          blockerCount,
          firstBlockerTitle: row.first_title ?? "another task",
        });
      }
    }
    return summaries;
  }

  async addTaskDependency(
    taskId: string,
    blockerId: string,
  ): Promise<{ readonly changed: boolean }> {
    // The pair is (BLOCKER, BLOCKED) — the stored direction — while the method
    // is addressed by the BLOCKED Task, which is the record the owner is on.
    const pair = validateTaskDependencyPair(
      validateTaskId(blockerId),
      validateTaskId(taskId),
    );
    // The BLOCKED Task is the one being changed, so it is the one whose archived
    // Project makes the record read-only. (The blocker is merely referenced.)
    await this.#requireWritableTask(pair.blockedId);

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);

    /*
     * The edge may already exist, ACTIVE or unlinked. The unique identity index
     * spans deleted rows (migration 0003), so re-adding a removed dependency must
     * RESTORE the original relationship rather than insert a second identity --
     * which is also what keeps one dependency one row in every export.
     */
    const existing = await this.#db
      .prepare(
        `SELECT id, deleted_at FROM entity_links
         WHERE workspace_id = ? AND source_entity_id = ? AND target_entity_id = ?
           AND type = ?`,
      )
      .bind(this.#workspaceId, pair.blockerId, pair.blockedId, TASK_BLOCKS)
      .first<{ readonly id: string; readonly deleted_at: string | null }>();
    if (existing !== null && existing.deleted_at === null) {
      // Already there. Idempotent, and deliberately NOT an error: two devices
      // adding the same blocker both get the state they asked for.
      return { changed: false };
    }

    const linkId = existing?.id ?? this.#newEntityId();
    const guard = this.#dependencyWriteGuard(pair.blockerId, pair.blockedId);
    const write =
      existing === null
        ? this.#db
            .prepare(
              `INSERT INTO entity_links
                 (id, workspace_id, source_entity_id, target_entity_id, type,
                  created_at, updated_at, deleted_at)
               SELECT ?, ?, ?, ?, ?, ?, ?, NULL
               WHERE ${guard.sql}`,
            )
            .bind(
              linkId,
              this.#workspaceId,
              pair.blockerId,
              pair.blockedId,
              TASK_BLOCKS,
              nowTs,
              nowTs,
              ...guard.params,
            )
        : this.#db
            .prepare(
              `UPDATE entity_links
               SET deleted_at = NULL, updated_at = ?
               WHERE workspace_id = ? AND id = ? AND deleted_at IS NOT NULL
                 AND ${guard.sql}`,
            )
            .bind(nowTs, this.#workspaceId, linkId, ...guard.params);

    const results = await this.#runDependencyWrite([
      write,
      // The Activity is guarded on the write's own `changes()`, so a refused
      // dependency leaves no entry claiming it was added.
      ...this.#recorder.buildAppendStatements(
        this.#workspaceId,
        buildActivityWriteModel(
          {
            type: TASK_DEPENDENCY_ADDED,
            subjects: [
              { entityId: pair.blockedId, role: SUBJECT_ROLE },
              { entityId: pair.blockerId, role: ROLE_BLOCKER },
            ],
            payload: {
              entityType: TASK,
              blockerId: pair.blockerId,
              blockedId: pair.blockedId,
            },
          },
          this.#actor.actor,
          this.#newActivityId(),
          now,
        ),
      ),
    ]);

    if (results === "already_linked") {
      /*
       * A concurrent request inserted the SAME edge between this method's read
       * and its write, and the UNIQUE identity index fired. That is the
       * duplicate backstop doing its job, and the outcome is the one that was
       * asked for: the dependency exists. Reconciled rather than surfaced,
       * exactly as the generic link repository reconciles the same race.
       */
      return { changed: false };
    }
    if ((results[0]?.meta?.changes ?? 0) === 0) {
      // The statement refused it, and only the statement knows which of its
      // conditions said no. Diagnosing it costs reads only on the path that has
      // already failed, and each answer is a sentence rather than a constraint.
      await this.#explainDependencyRefusal(pair.blockerId, pair.blockedId);
      // Every known refusal throws above. Reaching here means the row moved under
      // us (a racer added the same edge first), which is the idempotent outcome.
      return { changed: false };
    }
    return { changed: true };
  }

  async removeTaskDependency(
    taskId: string,
    blockerId: string,
  ): Promise<{ readonly changed: boolean }> {
    // The pair is (BLOCKER, BLOCKED) — the stored direction — while the method
    // is addressed by the BLOCKED Task, which is the record the owner is on.
    const pair = validateTaskDependencyPair(
      validateTaskId(blockerId),
      validateTaskId(taskId),
    );
    await this.#requireWritableTask(pair.blockedId);

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const results = await this.#runTaskBatch([
      /*
       * UNLINK, never DELETE. The relationship keeps its stable id, so adding the
       * same dependency back later restores ONE relationship rather than minting
       * a second identity for the same fact -- the lifecycle every EntityLink has
       * (ADR-011), reached here through the Task's own authority.
       */
      this.#db
        .prepare(
          `UPDATE entity_links
           SET deleted_at = ?, updated_at = ?
           WHERE workspace_id = ? AND source_entity_id = ? AND target_entity_id = ?
             AND type = ? AND deleted_at IS NULL`,
        )
        .bind(
          nowTs,
          nowTs,
          this.#workspaceId,
          pair.blockerId,
          pair.blockedId,
          TASK_BLOCKS,
        ),
      ...this.#recorder.buildAppendStatements(
        this.#workspaceId,
        buildActivityWriteModel(
          {
            type: TASK_DEPENDENCY_REMOVED,
            subjects: [
              { entityId: pair.blockedId, role: SUBJECT_ROLE },
              { entityId: pair.blockerId, role: ROLE_BLOCKER },
            ],
            payload: {
              entityType: TASK,
              blockerId: pair.blockerId,
              blockedId: pair.blockedId,
            },
          },
          this.#actor.actor,
          this.#newActivityId(),
          now,
        ),
      ),
    ]);
    // Removing an edge that is not there is the outcome that was asked for.
    return { changed: (results[0]?.meta?.changes ?? 0) > 0 };
  }

  /**
   * Run a dependency write batch, reconciling the ONE race the guard cannot see.
   *
   * Every dependency invariant is a predicate inside the write, so a losing
   * racer normally just changes no rows. The exception is two requests inserting
   * the SAME edge at once: both read "no row", both build an insert, and the
   * second meets `entity_links_identity_idx`. That is the duplicate backstop
   * firing correctly, and the outcome — the dependency exists — is exactly what
   * the second request asked for, so it is reconciled here rather than surfaced
   * as a storage error. Every other failure is re-typed and rethrown.
   */
  async #runDependencyWrite(
    statements: readonly D1PreparedStatement[],
  ): Promise<D1Result[] | "already_linked"> {
    try {
      return await this.#db.batch(statements as D1PreparedStatement[]);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (/UNIQUE constraint failed/i.test(message)) return "already_linked";
      throw new TaskStorageError(undefined, { cause });
    }
  }

  /**
   * The SQL that decides whether one dependency may exist, as a predicate to be
   * AND-ed into the write itself.
   *
   * Four conditions, in one expression, evaluated inside the same statement (and
   * therefore the same transaction) as the row it gates:
   *
   *   1. the BLOCKER is a live Task in this workspace;
   *   2. the BLOCKED Task is a live Task in this workspace;
   *   3. neither bound is reached — counted here, not read first, so two
   *      concurrent adds at nineteen cannot both succeed;
   *   4. the blocker is NOT already reachable from the blocked Task by following
   *      `task.blocks` edges — the bounded cycle walk.
   *
   * The walk is a RECURSIVE CTE with an explicit `depth` column and a
   * `depth < MAX_DEPENDENCY_DEPTH` bound in the recursive term, plus `UNION`
   * (not `UNION ALL`) so an already-visited Task is never expanded twice. It is
   * therefore bounded on BOTH axes — breadth by the fan-out limit the same
   * predicate enforces, depth by the constant — and it terminates even on a graph
   * that somehow already contained a cycle. Both directions of the walk ride the
   * `entity_links_active_source_type_idx` partial index, so each level is an index
   * seek rather than a scan.
   *
   * Starting the walk at the BLOCKED Task and looking for the BLOCKER covers the
   * self-edge (depth 0), the two-node pair (depth 1) and any longer chain with one
   * rule, rather than three special cases that could disagree.
   */
  #dependencyWriteGuard(
    blockerId: string,
    blockedId: string,
  ): { readonly sql: string; readonly params: readonly unknown[] } {
    const liveTask = `EXISTS (
             SELECT 1 FROM entities
             WHERE workspace_id = ? AND id = ? AND type = '${TASK}'
               AND deleted_at IS NULL
           )`;
    const blockerCount = `(SELECT COUNT(*) FROM entity_links held
              WHERE held.workspace_id = ? AND held.type = ?
                AND held.target_entity_id = ? AND held.deleted_at IS NULL
                AND held.source_entity_id <> ?)`;
    const blocksCount = `(SELECT COUNT(*) FROM entity_links held
              WHERE held.workspace_id = ? AND held.type = ?
                AND held.source_entity_id = ? AND held.deleted_at IS NULL
                AND held.target_entity_id <> ?)`;
    const reachesBlocker = `EXISTS (
             WITH RECURSIVE downstream(id, depth) AS (
               SELECT ?, 0
               UNION
               SELECT dep.target_entity_id, downstream.depth + 1
               FROM entity_links dep
               JOIN downstream ON dep.source_entity_id = downstream.id
               WHERE dep.workspace_id = ? AND dep.type = ?
                 AND dep.deleted_at IS NULL
                 AND downstream.depth < ${MAX_DEPENDENCY_DEPTH}
             )
             SELECT 1 FROM downstream WHERE id = ?
           )`;
    return {
      sql: `${liveTask}
             AND ${liveTask}
             AND ${blockerCount} < ${MAX_TASK_BLOCKERS}
             AND ${blocksCount} < ${MAX_TASK_BLOCKS}
             AND NOT ${reachesBlocker}`,
      params: [
        this.#workspaceId,
        blockerId,
        this.#workspaceId,
        blockedId,
        // The two counts EXCLUDE the edge being written, so restoring an
        // unlinked edge at the bound is judged on the other nineteen.
        this.#workspaceId,
        TASK_BLOCKS,
        blockedId,
        blockerId,
        this.#workspaceId,
        TASK_BLOCKS,
        blockerId,
        blockedId,
        blockedId,
        this.#workspaceId,
        TASK_BLOCKS,
        blockerId,
      ],
    };
  }

  /**
   * Turn a refused dependency write into the sentence that explains it.
   *
   * Runs ONLY after a write changed nothing, so the ordinary path pays for none
   * of it. Each check re-asks one of the guard's conditions on its own; the order
   * is the order the owner would want to hear them in.
   */
  async #explainDependencyRefusal(
    blockerId: string,
    blockedId: string,
  ): Promise<void> {
    const blocker = await this.getTask(blockerId);
    if (blocker === null) {
      // A missing, deleted, non-Task or cross-workspace blocker: all
      // indistinguishable, disclosing nothing about another workspace.
      throw new TaskNotFoundError();
    }
    const cycle = await this.#db
      .prepare(
        `WITH RECURSIVE downstream(id, depth) AS (
           SELECT ?, 0
           UNION
           SELECT dep.target_entity_id, downstream.depth + 1
           FROM entity_links dep
           JOIN downstream ON dep.source_entity_id = downstream.id
           WHERE dep.workspace_id = ? AND dep.type = ?
             AND dep.deleted_at IS NULL
             AND downstream.depth < ${MAX_DEPENDENCY_DEPTH}
         )
         SELECT 1 AS hit FROM downstream WHERE id = ?`,
      )
      .bind(blockedId, this.#workspaceId, TASK_BLOCKS, blockerId)
      .first<{ readonly hit: number }>();
    if (cycle !== null) throw new TaskDependencyCycleError();

    const counts = await this.#db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM entity_links held
             WHERE held.workspace_id = ? AND held.type = ?
               AND held.target_entity_id = ? AND held.deleted_at IS NULL
               AND held.source_entity_id <> ?) AS blockers,
           (SELECT COUNT(*) FROM entity_links held
             WHERE held.workspace_id = ? AND held.type = ?
               AND held.source_entity_id = ? AND held.deleted_at IS NULL
               AND held.target_entity_id <> ?) AS blocks`,
      )
      .bind(
        this.#workspaceId,
        TASK_BLOCKS,
        blockedId,
        blockerId,
        this.#workspaceId,
        TASK_BLOCKS,
        blockerId,
        blockedId,
      )
      .first<{ readonly blockers: number; readonly blocks: number }>();
    if ((counts?.blockers ?? 0) >= MAX_TASK_BLOCKERS) {
      throw new TaskDependencyLimitError(MAX_TASK_BLOCKERS, "blockers");
    }
    if ((counts?.blocks ?? 0) >= MAX_TASK_BLOCKS) {
      throw new TaskDependencyLimitError(MAX_TASK_BLOCKS, "blocks");
    }
    // The blocked Task vanished between the guard and the write.
    if ((await this.getTask(blockedId)) === null) throw new TaskNotFoundError();
  }

  /**
   * Run a small domain write batch, re-typing raw storage failures.
   *
   * Shared by the checklist and the dependency mutations — both are narrow,
   * guarded statement groups that need the same failure translation, and neither
   * needs the Activity-first coordination `recordAtomicMutation` provides
   * (each builds its own guarded append statements).
   */
  async #runTaskBatch(
    statements: readonly D1PreparedStatement[],
  ): Promise<D1Result[]> {
    try {
      return await this.#db.batch(statements as D1PreparedStatement[]);
    } catch (cause) {
      throw new TaskStorageError(undefined, { cause });
    }
  }
}
