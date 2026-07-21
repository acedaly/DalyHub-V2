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
  GOAL_BELONGS_TO_AREA,
  PROJECT_ADVANCES_GOAL,
  PROJECT_BELONGS_TO_AREA,
  TASK,
  TASK_BELONGS_TO_AREA,
  TASK_BELONGS_TO_PROJECT,
  TASK_COMPLETED,
  systemClock,
  type Clock,
  type IdGenerator,
} from "~/kernel/spine";
import {
  isWaitingTargetType,
  TASK_WAITING_ON,
  TASK_WAITING_CHANGED,
  TASK_WAITING_CLEARED,
  TASK_WAITING_STARTED,
  TaskNotFoundError,
  TaskStorageError,
  TaskValidationError,
  validateSetWaitingInput,
  validateTaskDate,
  validateTaskDescription,
  validateTaskId,
  validateTaskLimit,
  validateTaskPriority,
  validateTaskStatus,
  validateTaskTitle,
  type ClearWaitingResult,
  type CompleteTaskResult,
  type GetTaskOptions,
  type ListTasksInput,
  type ListWaitingTasksInput,
  type SetWaitingInput,
  type SetWaitingResult,
  type TaskDetails,
  type TaskListItem,
  type TaskListPage,
  type TaskRelation,
  type TaskRelationKind,
  type TaskRepository,
  type TaskView,
  type TaskWaiting,
  type UpdateTaskInput,
  type UpdateTaskResult,
  type WaitingTaskListItem,
  type WaitingTaskPage,
} from "~/kernel/tasks";
import type { WorkspaceContext } from "~/kernel/workspaces";
import { parseWorkspaceId } from "~/kernel/workspaces";

import {
  fromStorageTimestamp,
  toStorageTimestamp,
  type EntityRow,
} from "./database";
import { D1ActivityRecorder } from "./d1-activity-recorder";
import {
  buildEntityUpdatedAtBumpStatement,
  buildSpineCompleteStatement,
} from "./spine-database";
import {
  rowToTaskDetails,
  rowToTaskWaiting,
  TASK_DETAIL_COLUMNS,
  WAITING_TARGET_COLUMNS,
  type TaskJoinedRow,
  type WaitingTargetColumns,
} from "./task-database";

/** The entity columns a mutation returns, matching {@link EntityRow}. */
const ENTITY_RETURNING =
  "id, workspace_id, type, title, created_at, updated_at, deleted_at";

const ENTITY_UPDATED = "entity.updated";
const SUBJECT_ROLE = "subject";

/** The two structural parent link types a Task can carry, as a trusted SQL list. */
const TASK_PARENT_LINK_LIST = `'${TASK_BELONGS_TO_AREA}', '${TASK_BELONGS_TO_PROJECT}'`;

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
  /** TEST-ONLY: force `completeTask`'s batch to fail at a chosen point. */
  readonly completeFault?: CompleteTaskFault;
}

/** A resolved id → title lookup for a related entity, or null when unavailable. */
interface ResolvedEntity {
  readonly id: string;
  readonly title: string;
}

export class D1TaskRepository implements TaskRepository {
  readonly #db: D1Database;
  readonly #workspaceId: string;
  readonly #clock: Clock;
  readonly #actor: ActivityActorContext;
  readonly #newActivityId: IdGenerator;
  readonly #recorder: D1ActivityRecorder;
  readonly #completeFault?: CompleteTaskFault;

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
    this.#recorder = new D1ActivityRecorder(db);
    this.#completeFault = options.completeFault;
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
        `SELECT ${TASK_DETAIL_COLUMNS},
                ${WAITING_TARGET_COLUMNS},
                pl.target_entity_id AS parent_id,
                pl.type AS parent_link_type,
                pe.title AS parent_title
         FROM entities e
         JOIN spine_records sr
           ON sr.workspace_id = e.workspace_id AND sr.entity_id = e.id
         LEFT JOIN task_details td
           ON td.workspace_id = e.workspace_id AND td.entity_id = e.id
         LEFT JOIN entity_links pl
           ON pl.workspace_id = e.workspace_id AND pl.source_entity_id = e.id
              AND pl.deleted_at IS NULL AND pl.type IN (${TASK_PARENT_LINK_LIST})
         LEFT JOIN entities pe
           ON pe.workspace_id = e.workspace_id AND pe.id = pl.target_entity_id
              AND pe.deleted_at IS NULL
         ${WAITING_TARGET_JOIN}
         WHERE e.workspace_id = ? AND e.type = '${TASK}' AND e.deleted_at IS NULL${completedClause}${waitingClause}
         ORDER BY (sr.completed_at IS NOT NULL) ASC,
                  (td.due_date IS NULL) ASC,
                  td.due_date ASC,
                  e.created_at ASC,
                  e.id ASC
         LIMIT ?`,
      )
      .bind(this.#workspaceId, limit);

    const result = await this.#run(statement);
    const rows = (result.results ?? []) as (TaskWaitingJoinedRow & {
      readonly parent_title: string | null;
    })[];
    const items: TaskListItem[] = rows.map((row) => {
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
        parent: this.#parentRelation(
          row.parent_link_type,
          row.parent_id,
          row.parent_title,
        ),
        waiting: rowToTaskWaiting(row),
      };
    });
    return { items };
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
    // Never dump description content into the payload — only note that it changed.
    if (descriptionChanged) {
      changes["descriptionChanged"] = true;
    }

    const detailChanged =
      statusChanged ||
      priorityChanged ||
      dueChanged ||
      scheduledChanged ||
      descriptionChanged;

    if (!titleChanged && !detailChanged) {
      // A no-op update: nothing changes, no `updated_at` churn, no Activity.
      return { task: current, changed: false };
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);

    // 1. The guarded domain statement: bump the active task's `updated_at`, and set
    //    the title ONLY when it changed (so an unchanged title is never rewritten
    //    over a concurrent rename).
    const entityStmt = titleChanged
      ? this.#db
          .prepare(
            `UPDATE entities SET title = ?, updated_at = ?
             WHERE id = ? AND workspace_id = ? AND type = '${TASK}' AND deleted_at IS NULL
             RETURNING ${ENTITY_RETURNING}`,
          )
          .bind(afterTitle, nowTs, entityId, this.#workspaceId)
      : this.#db
          .prepare(
            `UPDATE entities SET updated_at = ?
             WHERE id = ? AND workspace_id = ? AND type = '${TASK}' AND deleted_at IS NULL
             RETURNING ${ENTITY_RETURNING}`,
          )
          .bind(nowTs, entityId, this.#workspaceId);

    // 2. Upsert the additive details — but ON CONFLICT update ONLY the columns that
    //    changed (plus `updated_at`), so an omitted/unchanged column keeps its DB
    //    value even if a concurrent update changed it. The INSERT (new-row) branch
    //    supplies every column (unchanged ones = current/defaults), and is gated on
    //    the task still being active so a racing delete writes nothing. The SET
    //    fragments are fixed, trusted column literals — never caller data.
    let detailsStmt: D1PreparedStatement | undefined;
    if (detailChanged) {
      const setParts: string[] = [];
      if (statusChanged) setParts.push("status = excluded.status");
      if (priorityChanged) setParts.push("priority = excluded.priority");
      if (dueChanged) setParts.push("due_date = excluded.due_date");
      if (scheduledChanged)
        setParts.push("scheduled_date = excluded.scheduled_date");
      if (descriptionChanged)
        setParts.push("description = excluded.description");
      setParts.push("updated_at = excluded.updated_at");

      detailsStmt = this.#db
        .prepare(
          `INSERT INTO task_details
             (workspace_id, entity_id, entity_type, status, priority,
              due_date, scheduled_date, description, updated_at)
           SELECT ?, ?, '${TASK}', ?, ?, ?, ?, ?, ?
           WHERE EXISTS (
                   SELECT 1 FROM entities
                   WHERE workspace_id = ? AND id = ? AND type = '${TASK}'
                     AND deleted_at IS NULL
                 )
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
          afterDescription,
          nowTs,
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
        description: afterDescription,
      },
      changed: true,
    };
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

    const entityRow = await this.#runWaiting(
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
    if (current.waiting === null) {
      // Not waiting: idempotent no-op, no Activity.
      return { task: current, changed: false };
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);

    const entityStmt = this.#bumpEntityStatement(entityId, nowTs);

    // Clear the waiting state on `task_details` (only the waiting columns).
    const detailsStmt = this.#db
      .prepare(
        `UPDATE task_details
         SET waiting_since = NULL, waiting_note = NULL, updated_at = ?
         WHERE workspace_id = ? AND entity_id = ?`,
      )
      .bind(nowTs, this.#workspaceId, entityId);

    // Soft-delete any active `task.waiting_on` link (gated on the active task).
    const linkStmts = this.#waitingLinkStatements(entityId, null, nowTs);

    const event: NewActivityEvent = {
      type: TASK_WAITING_CLEARED,
      subjects: [{ entityId, role: SUBJECT_ROLE }],
      payload: { entityType: TASK },
    };

    const entityRow = await this.#runWaiting(
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

  async listWaitingTasks(
    input: ListWaitingTasksInput = {},
  ): Promise<WaitingTaskPage> {
    const limit = validateTaskLimit(input.limit);
    // Empty string sorts before any real date, so with no `todayIso` nothing is
    // "overdue" and ordering falls to longest-waiting.
    const todayIso = input.todayIso ?? "";

    const statement = this.#db
      .prepare(
        `SELECT ${TASK_DETAIL_COLUMNS},
                ${WAITING_TARGET_COLUMNS},
                pl.target_entity_id AS parent_id,
                pl.type AS parent_link_type,
                pe.title AS parent_title
         FROM entities e
         JOIN spine_records sr
           ON sr.workspace_id = e.workspace_id AND sr.entity_id = e.id
         JOIN task_details td
           ON td.workspace_id = e.workspace_id AND td.entity_id = e.id
         LEFT JOIN entity_links pl
           ON pl.workspace_id = e.workspace_id AND pl.source_entity_id = e.id
              AND pl.deleted_at IS NULL AND pl.type IN (${TASK_PARENT_LINK_LIST})
         LEFT JOIN entities pe
           ON pe.workspace_id = e.workspace_id AND pe.id = pl.target_entity_id
              AND pe.deleted_at IS NULL
         ${WAITING_TARGET_JOIN}
         WHERE e.workspace_id = ? AND e.type = '${TASK}' AND e.deleted_at IS NULL
           AND sr.completed_at IS NULL AND td.waiting_since IS NOT NULL
         ORDER BY
           (CASE WHEN td.due_date IS NOT NULL AND td.due_date < ? THEN 0 ELSE 1 END) ASC,
           td.waiting_since ASC,
           (td.due_date IS NULL) ASC,
           td.due_date ASC,
           e.id ASC
         LIMIT ?`,
      )
      .bind(this.#workspaceId, todayIso, limit);

    const result = await this.#run(statement);
    const rows = (result.results ?? []) as (TaskWaitingJoinedRow & {
      readonly parent_title: string | null;
    })[];
    const items: WaitingTaskListItem[] = [];
    for (const row of rows) {
      const waiting = rowToTaskWaiting(row);
      if (waiting === null) {
        continue;
      }
      const details = rowToTaskDetails(row);
      items.push({
        id: row.id,
        workspaceId: parseWorkspaceId(row.workspace_id),
        title: row.title,
        createdAt: fromStorageTimestamp(row.created_at),
        updatedAt: fromStorageTimestamp(row.updated_at),
        status: details.status,
        priority: details.priority,
        dueDate: details.dueDate,
        scheduledDate: details.scheduledDate,
        parent: this.#parentRelation(
          row.parent_link_type,
          row.parent_id,
          row.parent_title,
        ),
        waiting,
      });
    }
    return { items };
  }

  /* ---------------------------------------------------------------------- */
  /* Completion + waiting clearance — one atomic operation (ADR-029)         */
  /* ---------------------------------------------------------------------- */

  async completeTask(id: string): Promise<CompleteTaskResult> {
    const entityId = validateTaskId(id);

    const current = await this.getTask(entityId);
    if (!current) {
      throw new TaskNotFoundError();
    }
    // Already completed: idempotent no-op (matching the spine contract). No batch,
    // no Activity. Any waiting was cleared by the completion that first set it.
    if (current.completedAt !== null) {
      return { task: current, changed: false };
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);

    const entityRow = await this.#runCompleteBatch(
      entityId,
      current,
      now,
      nowTs,
    );
    if (!entityRow) {
      // The completion gate matched nothing: the task was completed or deleted by a
      // concurrent racer between the read and the batch. Nothing was written; report
      // honestly from the fresh state.
      const refreshed = await this.getTask(entityId);
      if (!refreshed) {
        throw new TaskNotFoundError();
      }
      return { task: refreshed, changed: false };
    }

    return {
      task: {
        ...current,
        completedAt: now,
        updatedAt: fromStorageTimestamp(entityRow.updated_at),
        waiting: null,
      },
      changed: true,
    };
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
  ): Promise<EntityRow | null> {
    const fault = this.#completeFault;

    // 1-2. Shared spine completion gate + guarded entity bump.
    const spineStmt = buildSpineCompleteStatement(
      this.#db,
      this.#workspaceId,
      entityId,
      nowTs,
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

    const batch: D1PreparedStatement[] = [
      spineStmt,
      entityStmt,
      ...(fault === "after-completion" ? [this.#forcedFailure()] : []),
      completionActivity!,
      ...(fault === "after-completion-activity" ? [this.#forcedFailure()] : []),
      ...completionSubjects,
      waitingClearStmt,
      ...(fault === "after-waiting-update" ? [this.#forcedFailure()] : []),
      waitingClearedActivity!,
      ...(fault === "after-waiting-cleared-activity"
        ? [this.#forcedFailure()]
        : []),
      ...waitingClearedSubjects,
      waitingLinkStmt,
      ...(fault === "after-waiting-link" ? [this.#forcedFailure()] : []),
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

  /** A statement guaranteed to fail, aborting and rolling back the batch (tests). */
  #forcedFailure(): D1PreparedStatement {
    return this.#db.prepare("SELECT 1 FROM __dalyhub_forced_task_fault__");
  }

  /* ---------------------------------------------------------------------- */
  /* Internals                                                              */
  /* ---------------------------------------------------------------------- */

  /** Reusable EXISTS clause: the anchor is an active task in this workspace. */
  get #activeTaskExistsSql(): string {
    return `SELECT 1 FROM entities
            WHERE workspace_id = ? AND id = ? AND type = '${TASK}'
              AND deleted_at IS NULL`;
  }

  /** The guarded entity `updated_at` bump used as the Activity append anchor. */
  #bumpEntityStatement(entityId: string, nowTs: string): D1PreparedStatement {
    return this.#db
      .prepare(
        `UPDATE entities SET updated_at = ?
         WHERE id = ? AND workspace_id = ? AND type = '${TASK}' AND deleted_at IS NULL
         RETURNING ${ENTITY_RETURNING}`,
      )
      .bind(nowTs, entityId, this.#workspaceId);
  }

  /**
   * Statements that make the active `task.waiting_on` link reflect `targetId`:
   * always soft-delete any current active waiting link, then (when a target is
   * given) create-or-restore the link to it. Both gated on the active task; the
   * create is additionally gated on the active, in-workspace target (the composite
   * FK is the final backstop). Soft-delete runs before create so the one-active
   * partial unique index never conflicts within the transaction.
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
           AND type = '${TASK_WAITING_ON}' AND deleted_at IS NULL`,
      )
      .bind(nowTs, nowTs, this.#workspaceId, taskId);
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
   * Run a waiting mutation as ONE atomic batch: the guard-anchor entity bump FIRST,
   * then its `changes()`-guarded event append, then the gated domain writes (the
   * `task_details` upsert and the `task.waiting_on` link statements). Returns the
   * entity RETURNING row when the guard matched, else null (task deleted mid-flight).
   */
  async #runWaiting(
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
  #parentRelation(
    linkType: string | null,
    parentId: string | null,
    parentTitle: string | null,
  ): TaskRelation | null {
    if (linkType === null || parentId === null || parentTitle === null) {
      return null;
    }
    const kind: TaskRelationKind =
      linkType === TASK_BELONGS_TO_PROJECT ? "project" : "area";
    return { kind, id: parentId, title: parentTitle };
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
      description: details.description,
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
}
