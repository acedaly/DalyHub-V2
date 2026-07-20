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
  systemClock,
  type Clock,
  type IdGenerator,
} from "~/kernel/spine";
import {
  TaskNotFoundError,
  TaskStorageError,
  validateTaskDate,
  validateTaskDescription,
  validateTaskId,
  validateTaskLimit,
  validateTaskPriority,
  validateTaskStatus,
  validateTaskTitle,
  type GetTaskOptions,
  type ListTasksInput,
  type TaskDetails,
  type TaskListItem,
  type TaskListPage,
  type TaskRelation,
  type TaskRelationKind,
  type TaskRepository,
  type TaskView,
  type UpdateTaskInput,
  type UpdateTaskResult,
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
  rowToTaskDetails,
  TASK_DETAIL_COLUMNS,
  type TaskJoinedRow,
} from "./task-database";

/** The entity columns a mutation returns, matching {@link EntityRow}. */
const ENTITY_RETURNING =
  "id, workspace_id, type, title, created_at, updated_at, deleted_at";

const ENTITY_UPDATED = "entity.updated";
const SUBJECT_ROLE = "subject";

/** The two structural parent link types a Task can carry, as a trusted SQL list. */
const TASK_PARENT_LINK_LIST = `'${TASK_BELONGS_TO_AREA}', '${TASK_BELONGS_TO_PROJECT}'`;

/** Optional dependencies for the repository, injectable for deterministic tests. */
export interface D1TaskRepositoryOptions {
  /** Clock used for domain AND Activity timestamps (one call per mutation). */
  readonly clock?: Clock;
  /** Trusted actor context recorded on every Activity event. Defaults to `system`. */
  readonly actorContext?: ActivityActorContext;
  /** Id generator for Activity events. Defaults to a secure UUID generator. */
  readonly activityIdGenerator?: IdGenerator;
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

    const completedClause = includeCompleted
      ? ""
      : " AND sr.completed_at IS NULL";
    const statement = this.#db
      .prepare(
        `SELECT ${TASK_DETAIL_COLUMNS},
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
         WHERE e.workspace_id = ? AND e.type = '${TASK}' AND e.deleted_at IS NULL${completedClause}
         ORDER BY (sr.completed_at IS NOT NULL) ASC,
                  (td.due_date IS NULL) ASC,
                  td.due_date ASC,
                  e.created_at ASC,
                  e.id ASC
         LIMIT ?`,
      )
      .bind(this.#workspaceId, limit);

    const result = await this.#run(statement);
    const rows = (result.results ?? []) as (TaskJoinedRow & {
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

    const changes: Record<string, JsonValue> = {};
    if (afterTitle !== current.title) {
      changes["title"] = { before: current.title, after: afterTitle };
    }
    if (afterStatus !== current.status) {
      changes["status"] = { before: current.status, after: afterStatus };
    }
    if (afterPriority !== current.priority) {
      changes["priority"] = { before: current.priority, after: afterPriority };
    }
    if (afterDue !== current.dueDate) {
      changes["dueDate"] = { before: current.dueDate, after: afterDue };
    }
    if (afterScheduled !== current.scheduledDate) {
      changes["scheduledDate"] = {
        before: current.scheduledDate,
        after: afterScheduled,
      };
    }
    // Never dump description content into the payload — only note that it changed.
    if ((afterDescription ?? null) !== (current.description ?? null)) {
      changes["descriptionChanged"] = true;
    }

    if (Object.keys(changes).length === 0) {
      // A no-op update: nothing changes, no `updated_at` churn, no Activity.
      return { task: current, changed: false };
    }

    const afterDetails: TaskDetails = {
      status: afterStatus,
      priority: afterPriority,
      dueDate: afterDue,
      scheduledDate: afterScheduled,
      description: afterDescription,
    };

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);

    // 1. The guarded domain statement: bump the active task's title + updated_at.
    const entityStmt = this.#db
      .prepare(
        `UPDATE entities SET title = ?, updated_at = ?
         WHERE id = ? AND workspace_id = ? AND type = '${TASK}' AND deleted_at IS NULL
         RETURNING ${ENTITY_RETURNING}`,
      )
      .bind(afterTitle, nowTs, entityId, this.#workspaceId);

    // 2. Upsert the additive details, gated on the task still being active — so a
    //    delete racing this update writes nothing (matching the entity guard).
    const detailsStmt = this.#db
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
           status = excluded.status,
           priority = excluded.priority,
           due_date = excluded.due_date,
           scheduled_date = excluded.scheduled_date,
           description = excluded.description,
           updated_at = excluded.updated_at`,
      )
      .bind(
        this.#workspaceId,
        entityId,
        afterDetails.status,
        afterDetails.priority,
        afterDetails.dueDate,
        afterDetails.scheduledDate,
        afterDetails.description,
        nowTs,
        this.#workspaceId,
        entityId,
      );

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

    // Relationships and completion are unchanged by an edit — reuse the read view.
    return {
      task: {
        ...current,
        title: entityRow.title,
        updatedAt: fromStorageTimestamp(entityRow.updated_at),
        status: afterDetails.status,
        priority: afterDetails.priority,
        dueDate: afterDetails.dueDate,
        scheduledDate: afterDetails.scheduledDate,
        description: afterDetails.description,
      },
      changed: true,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Internals                                                              */
  /* ---------------------------------------------------------------------- */

  /** Read the joined task row (entity + spine + details + structural parent). */
  async #readJoined(
    entityId: string,
    includeDeleted: boolean,
  ): Promise<TaskJoinedRow | null> {
    const deletedClause = includeDeleted ? "" : " AND e.deleted_at IS NULL";
    const statement = this.#db
      .prepare(
        `SELECT ${TASK_DETAIL_COLUMNS},
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
         WHERE e.id = ? AND e.workspace_id = ? AND e.type = '${TASK}'${deletedClause}`,
      )
      .bind(entityId, this.#workspaceId);
    const result = await this.#run(statement);
    const rows = (result.results ?? []) as TaskJoinedRow[];
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
    row: TaskJoinedRow,
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
    detailsStmt: D1PreparedStatement,
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
      detailsStmt,
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
