/**
 * PROJECT-02 Project templates — D1 implementation of the workspace-bound
 * `ProjectTemplateRepository`.
 *
 * ── The two properties this file exists to guarantee ─────────────────────────
 *
 * **Atomicity.** `instantiate` builds ONE `D1Database.batch()` holding the
 * Project's `entities`/`spine_records`/`entity_links` rows, every Task's four
 * rows, every checklist row and the Activity appends. A batch is a SQL
 * transaction: if any statement fails, the entire sequence rolls back. There is
 * therefore no state in which a Project exists holding seven of its twelve
 * Tasks, or holding Tasks whose checklists never arrived.
 *
 * Every dependent statement is additionally GATED on the row it depends on
 * having been written (`WHERE EXISTS (… the project …)`), the same device the
 * recurrence successor clone uses. And the Project's OWN insert re-asserts both
 * of its preconditions at ITS commit — the chosen Area/Goal is still active,
 * and the TEMPLATE is still active — rather than trusting the reads that
 * preceded it. So when either has changed underneath the request, every later
 * statement declines with it, nothing is committed, and the caller raises a
 * typed error rather than discovering a foreign-key failure. Which of the two
 * failed is reconciled by re-reading, never by assuming.
 *
 * **Bounds enforced inside the write.** `MAX_TEMPLATE_TASKS`,
 * `MAX_TEMPLATE_CHECKLIST_ITEMS_PER_TASK` and `MAX_TEMPLATE_CHECKLIST_ITEMS` are
 * asserted by the inserting statement's own `WHERE (SELECT COUNT(*) …) < n`,
 * evaluated at that statement's commit. Reading the count first and deciding in
 * TypeScript leaves a window two devices can both pass at the bound — the
 * defect TASKS-13 fixed the same way, carried forward rather than re-learned.
 *
 * ── What is NOT here ─────────────────────────────────────────────────────────
 * No status, no completion, no dates, no sector, no waiting state, no
 * delegation, no recurrence and no checklist tick is ever read from a template
 * or written from one, because `migrations/0046` gives a template nowhere to
 * keep any of them. Every created Task is `todo`/`active` with null dates, and
 * every created checklist item is `completed = 0` — both as SQL LITERALS, so
 * the reset is a property of the statement rather than of a value someone could
 * pass through.
 */

import {
  buildActivityWriteModel,
  createSystemActorContext,
  secureIdGenerator,
  type ActivityActorContext,
  type ActivityWriteModel,
  type NewActivityEvent,
} from "~/kernel/activity";
import {
  normaliseEntityIconKey,
  type EntityIconKey,
} from "~/kernel/entities/entity-icon-keys";
import {
  normaliseIdentityColourSlot,
  type IdentityColourSlot,
} from "~/kernel/entities/identity-colour-slots";
import {
  AREA,
  GOAL,
  PROJECT,
  PROJECT_ADVANCES_GOAL,
  PROJECT_BELONGS_TO_AREA,
  TASK,
  TASK_BELONGS_TO_PROJECT,
  systemClock,
  type Clock,
  type IdGenerator,
} from "~/kernel/spine";
import {
  MAX_TEMPLATE_CHECKLIST_ITEMS,
  MAX_TEMPLATE_CHECKLIST_ITEMS_PER_TASK,
  MAX_TEMPLATE_TASKS,
  PROJECT_CREATED_FROM_TEMPLATE,
  PROJECT_TEMPLATE,
  PROJECT_TEMPLATE_CREATED,
  PROJECT_TEMPLATE_DELETED,
  PROJECT_TEMPLATE_UPDATED,
  ProjectTemplateChecklistFullError,
  ProjectTemplateFullError,
  ProjectTemplateNotFoundError,
  ProjectTemplateParentUnavailableError,
  ProjectTemplateStorageError,
  ProjectTemplateTaskNotFoundError,
  ProjectTemplateTooLargeError,
  validateTemplateDescription,
  validateTemplateId,
  validateTemplateLimit,
  validateTemplateName,
  validateTemplateOrder,
  validateTemplatePriority,
  validateTemplateTaskDescription,
  validateTemplateTaskTitle,
  type InstantiateTemplateInput,
  type InstantiateTemplateResult,
  type ProjectTemplateChangeResult,
  type ProjectTemplateChecklistItem,
  type ProjectTemplateDetail,
  type ProjectTemplateHeaderInput,
  type ProjectTemplatePage,
  type ProjectTemplateRepository,
  type ProjectTemplateSummary,
  type ProjectTemplateTask,
  type ProjectTemplateTaskInput,
  type TemplateParent,
  type TemplateParentKind,
} from "~/kernel/project-templates";
import { validateChecklistTitle } from "~/kernel/tasks";
import type { TaskPriority } from "~/kernel/tasks";
import { parseWorkspaceId, type WorkspaceContext } from "~/kernel/workspaces";

import { D1ActivityRecorder } from "./d1-activity-recorder";
import { fromStorageTimestamp, toStorageTimestamp } from "./database";

/**
 * How many ids one `IN (…)` list binds.
 *
 * D1 accepts at most 100 bound parameters per statement and the workspace id is
 * one of them, so a chunk of 100 is a hundred-and-one and the statement fails —
 * the defect TASKS-13 measured on a real workspace. Forty is far below the
 * ceiling and, because a template holds at most `MAX_TEMPLATE_TASKS` (40) tasks,
 * a template's whole checklist is read in ONE statement anyway.
 */
const TEMPLATE_ID_CHUNK = 40;

/** The `entities` row a template read projects. */
interface TemplateRow {
  readonly id: string;
  readonly title: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly description: string | null;
  readonly icon_key: string | null;
  readonly colour_slot: string | null;
  readonly default_parent_id: string | null;
  readonly default_parent_kind: string | null;
  readonly default_parent_title: string | null;
  readonly colour_rank: number | null;
}

interface TemplateTaskRow {
  readonly id: string;
  readonly template_id: string;
  readonly title: string;
  readonly description: string | null;
  readonly priority: string | null;
  readonly position: number;
}

interface TemplateChecklistRow {
  readonly id: string;
  readonly template_task_id: string;
  readonly title: string;
  readonly position: number;
}

export type D1ProjectTemplateRepositoryOptions = {
  readonly actorContext?: ActivityActorContext;
  readonly clock?: Clock;
  readonly idGenerator?: IdGenerator;
  readonly activityIdGenerator?: IdGenerator;
};

/**
 * The template's own stable identity rank — its 0-based position in the
 * workspace's `(created_at, id)` ordering over EVERY `project_template` row.
 *
 * The ADR-068 mechanism a Project already uses, applied to a second entity type
 * rather than reimplemented: the same window, the same total ordering, and the
 * same lifecycle independence (ranked over every row, so deleting one template
 * never recolours another). No column, no migration, no index.
 */
const TEMPLATE_RANKS_CTE = `template_ranks AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) - 1 AS colour_rank
  FROM entities
  WHERE workspace_id = ? AND type = '${PROJECT_TEMPLATE}'
)`;

/**
 * The projected columns of a template read.
 *
 * The default parent is resolved against the LIVE hierarchy in the same
 * statement: an inner join that yields NULL when the stored id no longer names
 * an ACTIVE Area or Goal. That is why the column is not a foreign key — the
 * template keeps a hint, and the hint simply stops resolving.
 */
const TEMPLATE_COLUMNS = `
  e.id AS id,
  e.title AS title,
  e.created_at AS created_at,
  e.updated_at AS updated_at,
  d.description AS description,
  d.icon_key AS icon_key,
  d.colour_slot AS colour_slot,
  CASE WHEN pe.id IS NULL THEN NULL ELSE d.default_parent_id END AS default_parent_id,
  CASE WHEN pe.id IS NULL THEN NULL ELSE d.default_parent_kind END AS default_parent_kind,
  pe.title AS default_parent_title,
  tr.colour_rank AS colour_rank`;

const TEMPLATE_FROM = `
  FROM entities e
  JOIN project_template_details d
    ON d.workspace_id = e.workspace_id AND d.entity_id = e.id
  LEFT JOIN template_ranks tr ON tr.id = e.id
  LEFT JOIN entities pe
    ON pe.workspace_id = e.workspace_id
   AND pe.id = d.default_parent_id
   AND pe.type = d.default_parent_kind
   AND pe.deleted_at IS NULL
  WHERE e.workspace_id = ? AND e.type = '${PROJECT_TEMPLATE}' AND e.deleted_at IS NULL`;

export class D1ProjectTemplateRepository implements ProjectTemplateRepository {
  readonly #db: D1Database;
  readonly #workspaceId: string;
  readonly #actor: ActivityActorContext;
  readonly #clock: Clock;
  readonly #id: IdGenerator;
  readonly #activityId: IdGenerator;
  readonly #recorder: D1ActivityRecorder;

  constructor(
    db: D1Database,
    context: WorkspaceContext,
    options?: D1ProjectTemplateRepositoryOptions,
  ) {
    this.#db = db;
    this.#workspaceId = parseWorkspaceId(context.workspaceId);
    this.#actor = options?.actorContext ?? createSystemActorContext();
    this.#clock = options?.clock ?? systemClock;
    this.#id = options?.idGenerator ?? secureIdGenerator;
    this.#activityId = options?.activityIdGenerator ?? secureIdGenerator;
    this.#recorder = new D1ActivityRecorder(db);
  }

  /* ---------------------------------------------------------------------- */
  /* Internals                                                               */
  /* ---------------------------------------------------------------------- */

  async #all<T>(statement: D1PreparedStatement): Promise<T[]> {
    try {
      const result = await statement.all<T>();
      return (result.results ?? []) as T[];
    } catch (cause) {
      throw new ProjectTemplateStorageError({ cause });
    }
  }

  async #batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
    try {
      return await this.#db.batch(statements);
    } catch (cause) {
      throw new ProjectTemplateStorageError({ cause });
    }
  }

  #event(event: NewActivityEvent, occurredAt: Date): ActivityWriteModel {
    return buildActivityWriteModel(
      event,
      this.#actor.actor,
      this.#activityId(),
      occurredAt,
    );
  }

  /** The Activity append statements, guarded on the PRECEDING statement's changes(). */
  #appends(model: ActivityWriteModel): D1PreparedStatement[] {
    return this.#recorder.buildAppendStatements(this.#workspaceId, model);
  }

  #toSummary(
    row: TemplateRow,
    taskCount: number,
    checklistCount: number,
  ): ProjectTemplateSummary {
    const parent: TemplateParent | null =
      row.default_parent_id && row.default_parent_kind
        ? {
            kind: row.default_parent_kind as TemplateParentKind,
            id: row.default_parent_id,
            title: row.default_parent_title ?? "",
          }
        : null;
    return {
      id: row.id,
      workspaceId: parseWorkspaceId(this.#workspaceId),
      name: row.title,
      description: row.description,
      // Normalised on the way OUT: a key or slot this build no longer
      // recognises arrives as `null` and the record draws its default.
      iconKey: normaliseEntityIconKey(row.icon_key) as EntityIconKey | null,
      colourSlot: normaliseIdentityColourSlot(
        row.colour_slot,
      ) as IdentityColourSlot | null,
      colourRank: row.colour_rank ?? 0,
      defaultParent: parent,
      taskCount,
      checklistCount,
      createdAt: fromStorageTimestamp(row.created_at),
      updatedAt: fromStorageTimestamp(row.updated_at),
    };
  }

  /**
   * Require an ACTIVE template in this workspace, returning its id.
   *
   * A read guard, not a concurrency guarantee — every mutation below re-asserts
   * the template's existence inside its own statement, which is the check that
   * actually decides. This one exists so the caller gets a typed, calm error
   * rather than a silent no-op.
   */
  async #requireTemplate(templateId: string): Promise<string> {
    const id = validateTemplateId(templateId);
    const rows = await this.#all<{ readonly id: string }>(
      this.#db
        .prepare(
          `SELECT id FROM entities
           WHERE workspace_id = ? AND id = ? AND type = '${PROJECT_TEMPLATE}'
             AND deleted_at IS NULL`,
        )
        .bind(this.#workspaceId, id),
    );
    if (rows.length === 0) throw new ProjectTemplateNotFoundError();
    return id;
  }

  /* ---------------------------------------------------------------------- */
  /* Reads                                                                   */
  /* ---------------------------------------------------------------------- */

  async listTemplates(options?: {
    readonly limit?: number;
  }): Promise<ProjectTemplatePage> {
    const limit = validateTemplateLimit(options?.limit);
    /*
     * One row per template, most-recently-updated first. `limit + 1` so
     * `hasMore` is a fact rather than a guess, without a second COUNT.
     */
    const rows = await this.#all<TemplateRow>(
      this.#db
        .prepare(
          `WITH ${TEMPLATE_RANKS_CTE}
           SELECT ${TEMPLATE_COLUMNS}
           ${TEMPLATE_FROM}
           ORDER BY e.updated_at DESC, e.id DESC
           LIMIT ?`,
        )
        .bind(this.#workspaceId, this.#workspaceId, limit + 1),
    );
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const counts = await this.#countContents(page.map((row) => row.id));
    return {
      items: page.map((row) => {
        const count = counts.get(row.id);
        return this.#toSummary(row, count?.tasks ?? 0, count?.checklist ?? 0);
      }),
      hasMore,
    };
  }

  /**
   * The task and checklist counts for a whole PAGE of templates, in two grouped
   * aggregates over the bounded id list — never one statement per template.
   *
   * This is the only way a list surface may obtain those figures, which is what
   * makes the no-N+1 property structural rather than a habit
   * (`test/unit/projects/project-template-query-bounds.test.ts` asserts it).
   */
  async #countContents(
    templateIds: readonly string[],
  ): Promise<Map<string, { tasks: number; checklist: number }>> {
    const counts = new Map<string, { tasks: number; checklist: number }>();
    if (templateIds.length === 0) return counts;
    for (
      let start = 0;
      start < templateIds.length;
      start += TEMPLATE_ID_CHUNK
    ) {
      const chunk = templateIds.slice(start, start + TEMPLATE_ID_CHUNK);
      const marks = chunk.map(() => "?").join(", ");
      const [taskRows, checklistRows] = await Promise.all([
        this.#all<{ readonly template_id: string; readonly n: number }>(
          this.#db
            .prepare(
              `SELECT template_id, COUNT(*) AS n
               FROM project_template_tasks
               WHERE workspace_id = ? AND template_id IN (${marks})
               GROUP BY template_id`,
            )
            .bind(this.#workspaceId, ...chunk),
        ),
        this.#all<{ readonly template_id: string; readonly n: number }>(
          this.#db
            .prepare(
              `SELECT t.template_id AS template_id, COUNT(*) AS n
               FROM project_template_checklist_items c
               JOIN project_template_tasks t
                 ON t.id = c.template_task_id AND t.workspace_id = c.workspace_id
               WHERE c.workspace_id = ? AND t.template_id IN (${marks})
               GROUP BY t.template_id`,
            )
            .bind(this.#workspaceId, ...chunk),
        ),
      ]);
      for (const row of taskRows) {
        const entry = counts.get(row.template_id) ?? { tasks: 0, checklist: 0 };
        entry.tasks = Number(row.n ?? 0);
        counts.set(row.template_id, entry);
      }
      for (const row of checklistRows) {
        const entry = counts.get(row.template_id) ?? { tasks: 0, checklist: 0 };
        entry.checklist = Number(row.n ?? 0);
        counts.set(row.template_id, entry);
      }
    }
    return counts;
  }

  async #readTemplateRow(id: string): Promise<TemplateRow | null> {
    const rows = await this.#all<TemplateRow>(
      this.#db
        .prepare(
          `WITH ${TEMPLATE_RANKS_CTE}
           SELECT ${TEMPLATE_COLUMNS}
           ${TEMPLATE_FROM} AND e.id = ?
           LIMIT 1`,
        )
        .bind(this.#workspaceId, this.#workspaceId, id),
    );
    return rows[0] ?? null;
  }

  async getTemplate(id: string): Promise<ProjectTemplateSummary | null> {
    let templateId: string;
    try {
      templateId = validateTemplateId(id);
    } catch {
      // A malformed id names no template. A read discloses nothing.
      return null;
    }
    const row = await this.#readTemplateRow(templateId);
    if (!row) return null;
    const counts = await this.#countContents([row.id]);
    const count = counts.get(row.id);
    return this.#toSummary(row, count?.tasks ?? 0, count?.checklist ?? 0);
  }

  async getTemplateDetail(id: string): Promise<ProjectTemplateDetail | null> {
    let templateId: string;
    try {
      templateId = validateTemplateId(id);
    } catch {
      return null;
    }
    const row = await this.#readTemplateRow(templateId);
    if (!row) return null;
    const tasks = await this.#readTasks(templateId);
    const checklist = await this.#readChecklist(tasks.map((task) => task.id));
    const composed: ProjectTemplateTask[] = tasks.map((task) => ({
      id: task.id,
      templateId: task.template_id,
      title: task.title,
      description: task.description,
      priority: (task.priority as TaskPriority | null) ?? null,
      position: task.position,
      checklist: checklist.get(task.id) ?? [],
    }));
    let checklistCount = 0;
    for (const task of composed) checklistCount += task.checklist.length;
    return {
      ...this.#toSummary(row, composed.length, checklistCount),
      tasks: composed,
    };
  }

  /** The template's tasks, in the owner's total order, bounded by construction. */
  async #readTasks(templateId: string): Promise<TemplateTaskRow[]> {
    return await this.#all<TemplateTaskRow>(
      this.#db
        .prepare(
          `SELECT id, template_id, title, description, priority, position
           FROM project_template_tasks
           WHERE workspace_id = ? AND template_id = ?
           ORDER BY position ASC, created_at ASC, id ASC
           LIMIT ?`,
        )
        .bind(this.#workspaceId, templateId, MAX_TEMPLATE_TASKS),
    );
  }

  /**
   * Every checklist item of a bounded list of template tasks, in ONE statement
   * per chunk — never one per task.
   */
  async #readChecklist(
    taskIds: readonly string[],
  ): Promise<Map<string, ProjectTemplateChecklistItem[]>> {
    const byTask = new Map<string, ProjectTemplateChecklistItem[]>();
    if (taskIds.length === 0) return byTask;
    for (let start = 0; start < taskIds.length; start += TEMPLATE_ID_CHUNK) {
      const chunk = taskIds.slice(start, start + TEMPLATE_ID_CHUNK);
      const rows = await this.#all<TemplateChecklistRow>(
        this.#db
          .prepare(
            `SELECT id, template_task_id, title, position
             FROM project_template_checklist_items
             WHERE workspace_id = ? AND template_task_id IN (${chunk
               .map(() => "?")
               .join(", ")})
             ORDER BY position ASC, created_at ASC, id ASC
             LIMIT ?`,
          )
          .bind(this.#workspaceId, ...chunk, MAX_TEMPLATE_CHECKLIST_ITEMS),
      );
      for (const row of rows) {
        const list = byTask.get(row.template_task_id) ?? [];
        list.push({
          id: row.id,
          templateTaskId: row.template_task_id,
          title: row.title,
          position: row.position,
        });
        byTask.set(row.template_task_id, list);
      }
    }
    return byTask;
  }

  /* ---------------------------------------------------------------------- */
  /* Template lifecycle                                                      */
  /* ---------------------------------------------------------------------- */

  async createTemplate(
    input: ProjectTemplateHeaderInput & { readonly name: string },
  ): Promise<ProjectTemplateSummary> {
    const name = validateTemplateName(input.name);
    const description = validateTemplateDescription(input.description ?? null);
    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const id = this.#id();
    const parent = await this.#resolveDefaultParent(
      input.defaultParent?.id ?? null,
    );

    const statements = [
      ...this.#insertTemplateStatements({
        id,
        name,
        description,
        iconKey: normaliseEntityIconKey(input.iconKey ?? null),
        colourSlot: normaliseIdentityColourSlot(input.colourSlot ?? null),
        parent,
        nowTs,
      }),
      ...this.#appends(
        this.#event(
          {
            type: PROJECT_TEMPLATE_CREATED,
            subjects: [{ entityId: id, role: "subject" }],
            payload: { name },
          },
          now,
        ),
      ),
    ];
    const results = await this.#batch(statements);
    if ((results[0]?.meta?.changes ?? 0) === 0) {
      throw new ProjectTemplateStorageError();
    }
    const summary = await this.getTemplate(id);
    if (!summary) throw new ProjectTemplateStorageError();
    return summary;
  }

  /**
   * The `entities` + `project_template_details` inserts for a new template.
   *
   * The entity row is written FIRST and carries `RETURNING`, so the Activity
   * appends that follow are guarded on its `changes()` — the shared ADR-012
   * rule, applied by ordering rather than by a helper, because this batch also
   * carries the detail insert between them.
   */
  #insertTemplateStatements(params: {
    readonly id: string;
    readonly name: string;
    readonly description: string | null;
    readonly iconKey: string | null;
    readonly colourSlot: string | null;
    readonly parent: { readonly id: string; readonly kind: string } | null;
    readonly nowTs: string;
  }): D1PreparedStatement[] {
    return [
      this.#db
        .prepare(
          `INSERT INTO entities
             (id, workspace_id, type, title, created_at, updated_at, deleted_at)
           VALUES (?, ?, '${PROJECT_TEMPLATE}', ?, ?, ?, NULL)
           RETURNING id`,
        )
        .bind(
          params.id,
          this.#workspaceId,
          params.name,
          params.nowTs,
          params.nowTs,
        ),
      this.#db
        .prepare(
          `INSERT INTO project_template_details
             (workspace_id, entity_id, entity_type, description, icon_key,
              colour_slot, default_parent_id, default_parent_kind,
              created_at, updated_at)
           SELECT ?, ?, '${PROJECT_TEMPLATE}', ?, ?, ?, ?, ?, ?, ?
           WHERE changes() > 0`,
        )
        .bind(
          this.#workspaceId,
          params.id,
          params.description,
          params.iconKey,
          params.colourSlot,
          params.parent?.id ?? null,
          params.parent?.kind ?? null,
          params.nowTs,
          params.nowTs,
        ),
    ];
  }

  /**
   * Resolve a default-parent id to its KIND, server-side.
   *
   * A caller supplies an id and never asserts what it is. An id that does not
   * name an ACTIVE Area or Goal in this workspace resolves to `null` — the
   * template simply keeps no default. It is never an error, because the default
   * is a convenience and the create form asks for a real parent regardless.
   */
  async #resolveDefaultParent(
    parentId: string | null,
  ): Promise<{ readonly id: string; readonly kind: string } | null> {
    if (!parentId) return null;
    let id: string;
    try {
      id = validateTemplateId(parentId);
    } catch {
      return null;
    }
    const rows = await this.#all<{ readonly type: string }>(
      this.#db
        .prepare(
          `SELECT type FROM entities
           WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL
             AND type IN ('${AREA}', '${GOAL}')
           LIMIT 1`,
        )
        .bind(this.#workspaceId, id),
    );
    const row = rows[0];
    return row ? { id, kind: row.type } : null;
  }

  async createTemplateFromProject(
    projectId: string,
    input?: { readonly name?: string; readonly description?: string | null },
  ): Promise<ProjectTemplateSummary> {
    const sourceId = validateTemplateId(projectId, "id");
    const projects = await this.#all<{
      readonly id: string;
      readonly title: string;
      readonly icon_key: string | null;
      readonly colour_slot: string | null;
      readonly parent_id: string | null;
      readonly parent_type: string | null;
    }>(
      this.#db
        .prepare(
          `SELECT e.id AS id,
                  e.title AS title,
                  pd.icon_key AS icon_key,
                  pd.colour_slot AS colour_slot,
                  pe.id AS parent_id,
                  pe.type AS parent_type
           FROM entities e
           LEFT JOIN project_details pd
             ON pd.workspace_id = e.workspace_id AND pd.entity_id = e.id
           LEFT JOIN entity_links l
             ON l.workspace_id = e.workspace_id
            AND l.source_entity_id = e.id
            AND l.type IN ('${PROJECT_BELONGS_TO_AREA}', '${PROJECT_ADVANCES_GOAL}')
            AND l.deleted_at IS NULL
           LEFT JOIN entities pe
             ON pe.workspace_id = e.workspace_id
            AND pe.id = l.target_entity_id
            AND pe.deleted_at IS NULL
           WHERE e.workspace_id = ? AND e.id = ? AND e.type = '${PROJECT}'
             AND e.deleted_at IS NULL
           LIMIT 1`,
        )
        .bind(this.#workspaceId, sourceId),
    );
    const project = projects[0];
    if (!project) throw new ProjectTemplateNotFoundError();

    /*
     * The Tasks that become template tasks.
     *
     * OPEN and COMMITTED only: a completed occurrence, a cancelled decision and
     * a Someday/Maybe parking are all statements about what happened to THIS
     * Project, not about the shape it has. Ordered the way the Project's own
     * task list orders open work — by creation — so the template arrives in the
     * sequence the owner built.
     *
     * `LIMIT MAX_TEMPLATE_TASKS + 1` so "there are more than a template may
     * hold" is a fact the next line can state exactly, without an extra COUNT.
     */
    const sourceTasks = await this.#all<{
      readonly id: string;
      readonly title: string;
      readonly description: string | null;
      readonly priority: string | null;
    }>(
      this.#db
        .prepare(
          `SELECT e.id AS id, e.title AS title,
                  td.description AS description, td.priority AS priority
           FROM entity_links l
           JOIN entities e
             ON e.workspace_id = l.workspace_id AND e.id = l.source_entity_id
           JOIN spine_records s
             ON s.workspace_id = e.workspace_id AND s.entity_id = e.id
           LEFT JOIN task_details td
             ON td.workspace_id = e.workspace_id AND td.entity_id = e.id
           WHERE l.workspace_id = ? AND l.target_entity_id = ?
             AND l.type = '${TASK_BELONGS_TO_PROJECT}' AND l.deleted_at IS NULL
             AND e.type = '${TASK}' AND e.deleted_at IS NULL
             AND s.completed_at IS NULL
             AND COALESCE(td.status, 'todo') <> 'cancelled'
             AND COALESCE(td.commitment_state, 'active') = 'active'
           ORDER BY e.created_at ASC, e.id ASC
           LIMIT ?`,
        )
        .bind(this.#workspaceId, sourceId, MAX_TEMPLATE_TASKS + 1),
    );
    if (sourceTasks.length > MAX_TEMPLATE_TASKS) {
      throw new ProjectTemplateTooLargeError(
        "tasks",
        sourceTasks.length,
        MAX_TEMPLATE_TASKS,
      );
    }

    // The checklist STRUCTURE of those Tasks. Ticks are not read: the SELECT
    // does not name the `completed` column, so there is nothing to carry.
    const sourceChecklist = await this.#readSourceChecklist(
      sourceTasks.map((task) => task.id),
    );
    let checklistTotal = 0;
    let deepest = 0;
    for (const items of sourceChecklist.values()) {
      checklistTotal += items.length;
      deepest = Math.max(deepest, items.length);
    }
    /*
     * BOTH checklist bounds are checked, and both REFUSE rather than truncate.
     *
     * A live Task's checklist may hold a hundred items; a template step may hold
     * twenty. Copying the first twenty and dropping the rest would produce a
     * template that silently disagrees with the Project it claims to be the
     * shape of — the same reason an oversized Project is refused above.
     */
    if (deepest > MAX_TEMPLATE_CHECKLIST_ITEMS_PER_TASK) {
      throw new ProjectTemplateTooLargeError(
        "checklistItems",
        deepest,
        MAX_TEMPLATE_CHECKLIST_ITEMS_PER_TASK,
      );
    }
    if (checklistTotal > MAX_TEMPLATE_CHECKLIST_ITEMS) {
      throw new ProjectTemplateTooLargeError(
        "checklistItems",
        checklistTotal,
        MAX_TEMPLATE_CHECKLIST_ITEMS,
      );
    }

    const name = validateTemplateName(input?.name ?? project.title);
    const description = validateTemplateDescription(input?.description ?? null);
    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const templateId = this.#id();

    const statements: D1PreparedStatement[] = this.#insertTemplateStatements({
      id: templateId,
      name,
      description,
      iconKey: normaliseEntityIconKey(project.icon_key),
      colourSlot: normaliseIdentityColourSlot(project.colour_slot),
      // The Project's own Area/Goal becomes the template's DEFAULT — the
      // overwhelmingly likely answer next time, and still only a default.
      parent:
        project.parent_id && project.parent_type
          ? { id: project.parent_id, kind: project.parent_type }
          : null,
      nowTs,
    });

    sourceTasks.forEach((task, index) => {
      const templateTaskId = this.#id();
      statements.push(
        this.#insertTemplateTaskStatement({
          id: templateTaskId,
          templateId,
          title: task.title,
          description: task.description,
          priority: task.priority,
          position: index,
          nowTs,
        }),
      );
      const items = sourceChecklist.get(task.id) ?? [];
      items.forEach((item, itemIndex) => {
        statements.push(
          this.#insertTemplateChecklistStatement({
            id: this.#id(),
            templateTaskId,
            title: item.title,
            position: itemIndex,
            nowTs,
          }),
        );
      });
    });

    statements.push(
      ...this.#appends(
        this.#event(
          {
            type: PROJECT_TEMPLATE_CREATED,
            subjects: [
              { entityId: templateId, role: "subject" },
              { entityId: sourceId, role: "source" },
            ],
            payload: {
              name,
              taskCount: sourceTasks.length,
              fromProjectId: sourceId,
            },
          },
          now,
        ),
      ),
    );

    const results = await this.#batch(statements);
    if ((results[0]?.meta?.changes ?? 0) === 0) {
      throw new ProjectTemplateStorageError();
    }
    const summary = await this.getTemplate(templateId);
    if (!summary) throw new ProjectTemplateStorageError();
    return summary;
  }

  /**
   * The checklist STRUCTURE of a bounded list of Tasks — title and order only.
   *
   * `completed` is deliberately absent from the projection. A tick describes
   * what happened on one occasion; a template describes the shape, and the way
   * to guarantee a tick is never copied is to never read one.
   */
  async #readSourceChecklist(
    taskIds: readonly string[],
  ): Promise<Map<string, { title: string }[]>> {
    const byTask = new Map<string, { title: string }[]>();
    if (taskIds.length === 0) return byTask;
    for (let start = 0; start < taskIds.length; start += TEMPLATE_ID_CHUNK) {
      const chunk = taskIds.slice(start, start + TEMPLATE_ID_CHUNK);
      const rows = await this.#all<{
        readonly task_id: string;
        readonly title: string;
      }>(
        this.#db
          .prepare(
            `SELECT task_id, title
             FROM task_checklist_items
             WHERE workspace_id = ? AND task_id IN (${chunk
               .map(() => "?")
               .join(", ")})
             ORDER BY task_id ASC, position ASC, created_at ASC, id ASC
             LIMIT ?`,
          )
          .bind(this.#workspaceId, ...chunk, MAX_TEMPLATE_CHECKLIST_ITEMS + 1),
      );
      for (const row of rows) {
        const list = byTask.get(row.task_id) ?? [];
        list.push({ title: row.title });
        byTask.set(row.task_id, list);
      }
    }
    return byTask;
  }

  async updateTemplate(
    id: string,
    input: ProjectTemplateHeaderInput,
  ): Promise<ProjectTemplateChangeResult> {
    const templateId = await this.#requireTemplate(id);
    const current = await this.#readTemplateRow(templateId);
    if (!current) throw new ProjectTemplateNotFoundError();

    const name =
      input.name === undefined
        ? current.title
        : validateTemplateName(input.name);
    const description =
      input.description === undefined
        ? current.description
        : validateTemplateDescription(input.description);
    const iconKey =
      input.iconKey === undefined
        ? current.icon_key
        : normaliseEntityIconKey(input.iconKey);
    const colourSlot =
      input.colourSlot === undefined
        ? current.colour_slot
        : normaliseIdentityColourSlot(input.colourSlot);
    const parent =
      input.defaultParent === undefined
        ? current.default_parent_id && current.default_parent_kind
          ? { id: current.default_parent_id, kind: current.default_parent_kind }
          : null
        : await this.#resolveDefaultParent(input.defaultParent?.id ?? null);

    const unchanged =
      name === current.title &&
      description === current.description &&
      iconKey === normaliseEntityIconKey(current.icon_key) &&
      colourSlot === normaliseIdentityColourSlot(current.colour_slot) &&
      (parent?.id ?? null) === current.default_parent_id &&
      (parent?.kind ?? null) === current.default_parent_kind;
    // An update that changes nothing writes nothing: no `updated_at` churn, no
    // Activity, and no reordering of the collection it sits in.
    if (unchanged) return { changed: false };

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const statements: D1PreparedStatement[] = [
      this.#db
        .prepare(
          `UPDATE project_template_details
           SET description = ?, icon_key = ?, colour_slot = ?,
               default_parent_id = ?, default_parent_kind = ?, updated_at = ?
           WHERE workspace_id = ? AND entity_id = ?
             AND EXISTS (
                   SELECT 1 FROM entities
                   WHERE workspace_id = ? AND id = ?
                     AND type = '${PROJECT_TEMPLATE}' AND deleted_at IS NULL
                 )
           RETURNING entity_id`,
        )
        .bind(
          description,
          iconKey,
          colourSlot,
          parent?.id ?? null,
          parent?.kind ?? null,
          nowTs,
          this.#workspaceId,
          templateId,
          this.#workspaceId,
          templateId,
        ),
      this.#db
        .prepare(
          `UPDATE entities SET title = ?, updated_at = ?
           WHERE workspace_id = ? AND id = ? AND changes() > 0`,
        )
        .bind(name, nowTs, this.#workspaceId, templateId),
      ...this.#appends(
        this.#event(
          {
            type: PROJECT_TEMPLATE_UPDATED,
            subjects: [{ entityId: templateId, role: "subject" }],
            payload: { name },
          },
          now,
        ),
      ),
    ];
    const results = await this.#batch(statements);
    return { changed: (results[0]?.meta?.changes ?? 0) > 0 };
  }

  async deleteTemplate(id: string): Promise<ProjectTemplateChangeResult> {
    const templateId = validateTemplateId(id);
    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    /*
     * The soft-delete is ONE conditional statement: it transitions only a
     * template that is currently active, so a second delete changes no row and
     * appends no event. The template's task and checklist rows are RETAINED —
     * exactly as a soft-deleted Task retains its checklist — so a restore is
     * faithful and nothing is silently destroyed.
     *
     * Nothing here touches any Project. A Project created from this template
     * has no reference to it: provenance is an Activity event, and Activity is
     * append-only.
     */
    const results = await this.#batch([
      this.#db
        .prepare(
          `UPDATE entities SET deleted_at = ?, updated_at = ?
           WHERE workspace_id = ? AND id = ? AND type = '${PROJECT_TEMPLATE}'
             AND deleted_at IS NULL
           RETURNING id`,
        )
        .bind(nowTs, nowTs, this.#workspaceId, templateId),
      ...this.#appends(
        this.#event(
          {
            type: PROJECT_TEMPLATE_DELETED,
            subjects: [{ entityId: templateId, role: "subject" }],
            payload: {},
          },
          now,
        ),
      ),
    ]);
    return { changed: (results[0]?.meta?.changes ?? 0) > 0 };
  }

  /* ---------------------------------------------------------------------- */
  /* Template contents                                                       */
  /* ---------------------------------------------------------------------- */

  #insertTemplateTaskStatement(params: {
    readonly id: string;
    readonly templateId: string;
    readonly title: string;
    readonly description: string | null;
    readonly priority: string | null;
    readonly position: number;
    readonly nowTs: string;
  }): D1PreparedStatement {
    return this.#db
      .prepare(
        `INSERT INTO project_template_tasks
           (id, workspace_id, template_id, template_type, title, description,
            priority, position, created_at, updated_at)
         SELECT ?, ?, ?, '${PROJECT_TEMPLATE}', ?, ?, ?, ?, ?, ?
         WHERE EXISTS (
                 SELECT 1 FROM entities
                 WHERE workspace_id = ? AND id = ?
                   AND type = '${PROJECT_TEMPLATE}' AND deleted_at IS NULL
               )`,
      )
      .bind(
        params.id,
        this.#workspaceId,
        params.templateId,
        params.title,
        params.description,
        params.priority,
        params.position,
        params.nowTs,
        params.nowTs,
        this.#workspaceId,
        params.templateId,
      );
  }

  #insertTemplateChecklistStatement(params: {
    readonly id: string;
    readonly templateTaskId: string;
    readonly title: string;
    readonly position: number;
    readonly nowTs: string;
  }): D1PreparedStatement {
    return this.#db
      .prepare(
        `INSERT INTO project_template_checklist_items
           (id, workspace_id, template_task_id, title, position,
            created_at, updated_at)
         SELECT ?, ?, ?, ?, ?, ?, ?
         WHERE EXISTS (
                 SELECT 1 FROM project_template_tasks
                 WHERE workspace_id = ? AND id = ?
               )`,
      )
      .bind(
        params.id,
        this.#workspaceId,
        params.templateTaskId,
        params.title,
        params.position,
        params.nowTs,
        params.nowTs,
        this.#workspaceId,
        params.templateTaskId,
      );
  }

  async addTask(
    templateId: string,
    input: { readonly title: string } & ProjectTemplateTaskInput,
  ): Promise<ProjectTemplateTask> {
    const id = await this.#requireTemplate(templateId);
    const title = validateTemplateTaskTitle(input.title);
    const description = validateTemplateTaskDescription(
      input.description ?? null,
    );
    const priority = validateTemplatePriority(input.priority ?? null);
    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const taskId = this.#id();

    /*
     * The position is resolved INSIDE the insert, from the table itself, and
     * the bound is asserted by the SAME statement.
     *
     * Reading `MAX(position)` first would leave a gap two quick additions could
     * both read through, and reading `COUNT(*)` first would leave a window two
     * devices could both pass at thirty-nine. Asking the database to decide
     * closes both. This is the TASKS-13 checklist insert, one level up.
     */
    const results = await this.#batch([
      this.#db
        .prepare(
          `INSERT INTO project_template_tasks
             (id, workspace_id, template_id, template_type, title, description,
              priority, position, created_at, updated_at)
           SELECT ?, ?, ?, '${PROJECT_TEMPLATE}', ?, ?, ?,
                  (SELECT COALESCE(MAX(t.position) + 1, 0)
                     FROM project_template_tasks t
                    WHERE t.workspace_id = ? AND t.template_id = ?),
                  ?, ?
           WHERE EXISTS (
                   SELECT 1 FROM entities
                   WHERE workspace_id = ? AND id = ?
                     AND type = '${PROJECT_TEMPLATE}' AND deleted_at IS NULL
                 )
             AND (SELECT COUNT(*) FROM project_template_tasks held
                   WHERE held.workspace_id = ? AND held.template_id = ?)
                 < ${MAX_TEMPLATE_TASKS}
           RETURNING id, template_id, title, description, priority, position`,
        )
        .bind(
          taskId,
          this.#workspaceId,
          id,
          title,
          description,
          priority,
          this.#workspaceId,
          id,
          nowTs,
          nowTs,
          this.#workspaceId,
          id,
          this.#workspaceId,
          id,
        ),
      // Guarded on the insert's own changes(), so a refused insert leaves the
      // template's timestamp exactly where it was.
      this.#db
        .prepare(
          `UPDATE entities SET updated_at = ?
           WHERE workspace_id = ? AND id = ? AND changes() > 0`,
        )
        .bind(nowTs, this.#workspaceId, id),
    ]);
    const row = (results[0]?.results ?? [])[0] as TemplateTaskRow | undefined;
    if (!row) {
      // The only guard that can fail here after `#requireTemplate` is the bound.
      throw new ProjectTemplateFullError(MAX_TEMPLATE_TASKS);
    }
    return {
      id: row.id,
      templateId: row.template_id,
      title: row.title,
      description: row.description,
      priority: (row.priority as TaskPriority | null) ?? null,
      position: row.position,
      checklist: [],
    };
  }

  async updateTask(
    templateId: string,
    taskId: string,
    input: ProjectTemplateTaskInput,
  ): Promise<ProjectTemplateChangeResult> {
    const id = await this.#requireTemplate(templateId);
    const rowId = validateTemplateId(taskId, "id");
    const rows = await this.#all<TemplateTaskRow>(
      this.#db
        .prepare(
          `SELECT id, template_id, title, description, priority, position
           FROM project_template_tasks
           WHERE workspace_id = ? AND template_id = ? AND id = ?
           LIMIT 1`,
        )
        .bind(this.#workspaceId, id, rowId),
    );
    const current = rows[0];
    if (!current) throw new ProjectTemplateTaskNotFoundError();

    const title =
      input.title === undefined
        ? current.title
        : validateTemplateTaskTitle(input.title);
    const description =
      input.description === undefined
        ? current.description
        : validateTemplateTaskDescription(input.description);
    const priority =
      input.priority === undefined
        ? ((current.priority as TaskPriority | null) ?? null)
        : validateTemplatePriority(input.priority);
    if (
      title === current.title &&
      description === current.description &&
      priority === current.priority
    ) {
      return { changed: false };
    }

    const nowTs = toStorageTimestamp(this.#clock());
    const results = await this.#batch([
      this.#db
        .prepare(
          `UPDATE project_template_tasks
           SET title = ?, description = ?, priority = ?, updated_at = ?
           WHERE workspace_id = ? AND template_id = ? AND id = ?
           RETURNING id`,
        )
        .bind(
          title,
          description,
          priority,
          nowTs,
          this.#workspaceId,
          id,
          rowId,
        ),
      this.#db
        .prepare(
          `UPDATE entities SET updated_at = ?
           WHERE workspace_id = ? AND id = ? AND changes() > 0`,
        )
        .bind(nowTs, this.#workspaceId, id),
    ]);
    return { changed: (results[0]?.meta?.changes ?? 0) > 0 };
  }

  async deleteTask(
    templateId: string,
    taskId: string,
  ): Promise<ProjectTemplateChangeResult> {
    const id = await this.#requireTemplate(templateId);
    const rowId = validateTemplateId(taskId, "id");
    const nowTs = toStorageTimestamp(this.#clock());
    /*
     * One batch: the checklist rows first (the foreign key is ON DELETE
     * RESTRICT, so the order is not a style choice), then the task, then a
     * renumber of every later task so positions stay dense.
     *
     * Deleting a task that is already gone is an idempotent no-op rather than
     * an error: on a surface where two devices can both delete, "it is not
     * there" is the outcome that was asked for.
     */
    const results = await this.#batch([
      this.#db
        .prepare(
          `DELETE FROM project_template_checklist_items
           WHERE workspace_id = ? AND template_task_id = ?
             AND EXISTS (
                   SELECT 1 FROM project_template_tasks
                   WHERE workspace_id = ? AND template_id = ? AND id = ?
                 )`,
        )
        .bind(this.#workspaceId, rowId, this.#workspaceId, id, rowId),
      this.#db
        .prepare(
          `DELETE FROM project_template_tasks
           WHERE workspace_id = ? AND template_id = ? AND id = ?
           RETURNING position`,
        )
        .bind(this.#workspaceId, id, rowId),
      // Guarded on the DELETE's own `changes()`, so a no-op delete leaves the
      // template's timestamp exactly where it was.
      this.#db
        .prepare(
          `UPDATE entities SET updated_at = ?
           WHERE workspace_id = ? AND id = ? AND changes() > 0`,
        )
        .bind(nowTs, this.#workspaceId, id),
      /*
       * Close the gap in the SAME transaction, so positions are never sparse
       * between two requests.
       *
       * A whole-list renumber rather than a `position - 1` shift: it recomputes
       * each row's dense index from the total `(position, id)` order, so it is
       * correct whatever the list looked like before — including a list a
       * previous release left with a gap. Bounded at forty rows, one statement,
       * and idempotent: on a no-op delete it rewrites every position to the
       * value it already holds.
       */
      this.#db
        .prepare(
          `UPDATE project_template_tasks
           SET position = (
                 SELECT COUNT(*) FROM project_template_tasks earlier
                 WHERE earlier.workspace_id = project_template_tasks.workspace_id
                   AND earlier.template_id = project_template_tasks.template_id
                   AND (earlier.position < project_template_tasks.position
                        OR (earlier.position = project_template_tasks.position
                            AND earlier.id < project_template_tasks.id))
               )
           WHERE workspace_id = ? AND template_id = ?`,
        )
        .bind(this.#workspaceId, id),
    ]);
    return { changed: (results[1]?.meta?.changes ?? 0) > 0 };
  }

  async reorderTasks(
    templateId: string,
    orderedTaskIds: readonly string[],
  ): Promise<ProjectTemplateChangeResult> {
    const id = await this.#requireTemplate(templateId);
    const order = validateTemplateOrder(orderedTaskIds, MAX_TEMPLATE_TASKS);
    const current = await this.#readTasks(id);
    /*
     * The submitted list must name EXACTLY the template's current tasks — every
     * one, each once. Anything else (a stale list missing a task another device
     * added, a list naming a deleted one) is refused and NOTHING is written,
     * because a partial reorder would silently invent an order the owner never
     * chose. The check and the write happen in the same request against the
     * same read, so the loser of a race retries against the truth rather than
     * overwriting it.
     */
    if (current.length !== order.length) {
      throw new ProjectTemplateTaskNotFoundError();
    }
    const known = new Set(current.map((task) => task.id));
    for (const taskId of order) {
      if (!known.has(taskId)) throw new ProjectTemplateTaskNotFoundError();
    }
    const unchanged = current.every((task, index) => order[index] === task.id);
    if (unchanged) return { changed: false };

    const nowTs = toStorageTimestamp(this.#clock());
    await this.#batch([
      ...order.map((taskId, index) =>
        this.#db
          .prepare(
            `UPDATE project_template_tasks SET position = ?, updated_at = ?
             WHERE workspace_id = ? AND template_id = ? AND id = ?`,
          )
          .bind(index, nowTs, this.#workspaceId, id, taskId),
      ),
      this.#db
        .prepare(
          `UPDATE entities SET updated_at = ? WHERE workspace_id = ? AND id = ?`,
        )
        .bind(nowTs, this.#workspaceId, id),
    ]);
    return { changed: true };
  }

  async addChecklistItem(
    templateId: string,
    taskId: string,
    input: { readonly title: string },
  ): Promise<ProjectTemplateChangeResult> {
    const id = await this.#requireTemplate(templateId);
    const rowId = validateTemplateId(taskId, "id");
    const title = validateChecklistTitle(input.title);
    const nowTs = toStorageTimestamp(this.#clock());
    const itemId = this.#id();

    /*
     * BOTH bounds are asserted by this one statement, evaluated at its commit:
     * the per-task one and the template's total. Checking either in TypeScript
     * first would leave the window TASKS-13 documented, and the total is the
     * one that actually caps the instantiation batch — so it is the one it
     * would be most costly to get wrong.
     */
    const results = await this.#batch([
      this.#db
        .prepare(
          `INSERT INTO project_template_checklist_items
             (id, workspace_id, template_task_id, title, position,
              created_at, updated_at)
           SELECT ?, ?, ?, ?,
                  (SELECT COALESCE(MAX(c.position) + 1, 0)
                     FROM project_template_checklist_items c
                    WHERE c.workspace_id = ? AND c.template_task_id = ?),
                  ?, ?
           WHERE EXISTS (
                   SELECT 1 FROM project_template_tasks
                   WHERE workspace_id = ? AND template_id = ? AND id = ?
                 )
             AND (SELECT COUNT(*) FROM project_template_checklist_items held
                   WHERE held.workspace_id = ? AND held.template_task_id = ?)
                 < ${MAX_TEMPLATE_CHECKLIST_ITEMS_PER_TASK}
             AND (SELECT COUNT(*)
                    FROM project_template_checklist_items total
                    JOIN project_template_tasks owner
                      ON owner.id = total.template_task_id
                     AND owner.workspace_id = total.workspace_id
                   WHERE total.workspace_id = ? AND owner.template_id = ?)
                 < ${MAX_TEMPLATE_CHECKLIST_ITEMS}
           RETURNING id`,
        )
        .bind(
          itemId,
          this.#workspaceId,
          rowId,
          title,
          this.#workspaceId,
          rowId,
          nowTs,
          nowTs,
          this.#workspaceId,
          id,
          rowId,
          this.#workspaceId,
          rowId,
          this.#workspaceId,
          id,
        ),
      this.#db
        .prepare(
          `UPDATE entities SET updated_at = ?
           WHERE workspace_id = ? AND id = ? AND changes() > 0`,
        )
        .bind(nowTs, this.#workspaceId, id),
    ]);
    if ((results[0]?.meta?.changes ?? 0) > 0) return { changed: true };

    /*
     * The insert was declined. Reconcile by RE-READING the persisted state and
     * classifying honestly, rather than assuming which guard missed: a caller
     * told "the checklist is full" when the task was actually deleted underneath
     * them would go looking for the wrong thing.
     */
    const [perTask] = await this.#all<{ readonly n: number }>(
      this.#db
        .prepare(
          `SELECT COUNT(*) AS n FROM project_template_checklist_items
           WHERE workspace_id = ? AND template_task_id = ?`,
        )
        .bind(this.#workspaceId, rowId),
    );
    if ((perTask?.n ?? 0) >= MAX_TEMPLATE_CHECKLIST_ITEMS_PER_TASK) {
      throw new ProjectTemplateChecklistFullError(
        "task",
        MAX_TEMPLATE_CHECKLIST_ITEMS_PER_TASK,
      );
    }
    const [totals] = await this.#all<{ readonly n: number }>(
      this.#db
        .prepare(
          `SELECT COUNT(*) AS n
           FROM project_template_checklist_items c
           JOIN project_template_tasks t
             ON t.id = c.template_task_id AND t.workspace_id = c.workspace_id
           WHERE c.workspace_id = ? AND t.template_id = ?`,
        )
        .bind(this.#workspaceId, id),
    );
    if ((totals?.n ?? 0) >= MAX_TEMPLATE_CHECKLIST_ITEMS) {
      throw new ProjectTemplateChecklistFullError(
        "template",
        MAX_TEMPLATE_CHECKLIST_ITEMS,
      );
    }
    throw new ProjectTemplateTaskNotFoundError();
  }

  async renameChecklistItem(
    templateId: string,
    itemId: string,
    title: string,
  ): Promise<ProjectTemplateChangeResult> {
    const id = await this.#requireTemplate(templateId);
    const rowId = validateTemplateId(itemId, "id");
    const next = validateChecklistTitle(title);
    const nowTs = toStorageTimestamp(this.#clock());
    // Narrow by construction: the statement writes `title` and nothing else, so
    // a rename cannot disturb an item's place in the order, and two devices
    // renaming two different items never contend.
    const results = await this.#batch([
      this.#db
        .prepare(
          `UPDATE project_template_checklist_items
           SET title = ?, updated_at = ?
           WHERE workspace_id = ? AND id = ? AND title <> ?
             AND EXISTS (
                   SELECT 1 FROM project_template_tasks t
                   WHERE t.workspace_id = ? AND t.id = template_task_id
                     AND t.template_id = ?
                 )
           RETURNING id`,
        )
        .bind(
          next,
          nowTs,
          this.#workspaceId,
          rowId,
          next,
          this.#workspaceId,
          id,
        ),
      this.#db
        .prepare(
          `UPDATE entities SET updated_at = ?
           WHERE workspace_id = ? AND id = ? AND changes() > 0`,
        )
        .bind(nowTs, this.#workspaceId, id),
    ]);
    return { changed: (results[0]?.meta?.changes ?? 0) > 0 };
  }

  async deleteChecklistItem(
    templateId: string,
    itemId: string,
  ): Promise<ProjectTemplateChangeResult> {
    const id = await this.#requireTemplate(templateId);
    const rowId = validateTemplateId(itemId, "id");
    const nowTs = toStorageTimestamp(this.#clock());
    const rows = await this.#all<{ readonly template_task_id: string }>(
      this.#db
        .prepare(
          `SELECT c.template_task_id AS template_task_id
           FROM project_template_checklist_items c
           JOIN project_template_tasks t
             ON t.id = c.template_task_id AND t.workspace_id = c.workspace_id
           WHERE c.workspace_id = ? AND c.id = ? AND t.template_id = ?
           LIMIT 1`,
        )
        .bind(this.#workspaceId, rowId, id),
    );
    const owner = rows[0];
    // Already gone is the outcome that was asked for, not an error.
    if (!owner) return { changed: false };
    const results = await this.#batch([
      this.#db
        .prepare(
          `DELETE FROM project_template_checklist_items
           WHERE workspace_id = ? AND id = ?
           RETURNING id`,
        )
        .bind(this.#workspaceId, rowId),
      this.#db
        .prepare(
          `UPDATE entities SET updated_at = ?
           WHERE workspace_id = ? AND id = ? AND changes() > 0`,
        )
        .bind(nowTs, this.#workspaceId, id),
      // Close the gap in the same transaction, so positions are never sparse
      // between two requests. Idempotent, for the reason `deleteTask` gives.
      this.#db
        .prepare(
          `UPDATE project_template_checklist_items
           SET position = (
                 SELECT COUNT(*) FROM project_template_checklist_items earlier
                 WHERE earlier.workspace_id = project_template_checklist_items.workspace_id
                   AND earlier.template_task_id = project_template_checklist_items.template_task_id
                   AND (earlier.position < project_template_checklist_items.position
                        OR (earlier.position = project_template_checklist_items.position
                            AND earlier.id < project_template_checklist_items.id))
               )
           WHERE workspace_id = ? AND template_task_id = ?`,
        )
        .bind(this.#workspaceId, owner.template_task_id),
    ]);
    return { changed: (results[0]?.meta?.changes ?? 0) > 0 };
  }

  async reorderChecklist(
    templateId: string,
    taskId: string,
    orderedItemIds: readonly string[],
  ): Promise<ProjectTemplateChangeResult> {
    const id = await this.#requireTemplate(templateId);
    const rowId = validateTemplateId(taskId, "id");
    const order = validateTemplateOrder(
      orderedItemIds,
      MAX_TEMPLATE_CHECKLIST_ITEMS_PER_TASK,
    );
    const current = (await this.#readChecklist([rowId])).get(rowId) ?? [];
    if (current.length !== order.length) {
      throw new ProjectTemplateTaskNotFoundError();
    }
    const known = new Set(current.map((item) => item.id));
    for (const itemId of order) {
      if (!known.has(itemId)) throw new ProjectTemplateTaskNotFoundError();
    }
    if (current.every((item, index) => order[index] === item.id)) {
      return { changed: false };
    }
    const nowTs = toStorageTimestamp(this.#clock());
    await this.#batch([
      ...order.map((itemId, index) =>
        this.#db
          .prepare(
            `UPDATE project_template_checklist_items
             SET position = ?, updated_at = ?
             WHERE workspace_id = ? AND template_task_id = ? AND id = ?`,
          )
          .bind(index, nowTs, this.#workspaceId, rowId, itemId),
      ),
      this.#db
        .prepare(
          `UPDATE entities SET updated_at = ? WHERE workspace_id = ? AND id = ?`,
        )
        .bind(nowTs, this.#workspaceId, id),
    ]);
    return { changed: true };
  }

  /* ---------------------------------------------------------------------- */
  /* Instantiation                                                           */
  /* ---------------------------------------------------------------------- */

  async instantiate(
    templateId: string,
    input: InstantiateTemplateInput,
  ): Promise<InstantiateTemplateResult> {
    const detail = await this.getTemplateDetail(templateId);
    if (!detail) throw new ProjectTemplateNotFoundError();

    const parentId = validateTemplateId(input.parentId, "id");
    /*
     * The parent's KIND is resolved SERVER-SIDE from its id — a caller supplies
     * an id and never asserts what it is. This read only decides which
     * structural link type to write; the gated insert below re-asserts that the
     * parent is still active at COMMIT, so a parent deleted in the gap creates
     * nothing rather than creating an orphan.
     */
    const parentRows = await this.#all<{ readonly type: string }>(
      this.#db
        .prepare(
          `SELECT type FROM entities
           WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL
             AND type IN ('${AREA}', '${GOAL}')
           LIMIT 1`,
        )
        .bind(this.#workspaceId, parentId),
    );
    const parentKind = parentRows[0]?.type;
    if (parentKind !== AREA && parentKind !== GOAL) {
      throw new ProjectTemplateParentUnavailableError();
    }
    const projectLinkType =
      parentKind === AREA ? PROJECT_BELONGS_TO_AREA : PROJECT_ADVANCES_GOAL;

    const title =
      input.title === undefined || input.title === null
        ? detail.name
        : validateTemplateName(input.title);

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const projectId = this.#id();

    /*
     * ONE batch. Everything below either commits together or not at all.
     *
     * Every statement after the first is GATED on the Project's `entities` row
     * existing, so an unavailable parent declines the whole cascade rather than
     * failing a foreign key half way through — and the caller learns about it
     * from `changes()` on the first statement, which is a typed error rather
     * than a storage exception.
     */
    const statements: D1PreparedStatement[] = [
      /*
       * The FIRST statement decides everything after it, and it re-asserts BOTH
       * preconditions rather than trusting the reads above — either can change
       * in the gap. The chosen Area/Goal must still be active, and the TEMPLATE
       * must still be active: a template deleted on another device between
       * opening the drawer and pressing the button creates nothing at all.
       */
      this.#db
        .prepare(
          `INSERT INTO entities
             (id, workspace_id, type, title, created_at, updated_at, deleted_at)
           SELECT ?, ?, '${PROJECT}', ?, ?, ?, NULL
           WHERE EXISTS (
                   SELECT 1 FROM entities
                   WHERE workspace_id = ? AND id = ? AND type = ?
                     AND deleted_at IS NULL
                 )
             AND EXISTS (
                   SELECT 1 FROM entities
                   WHERE workspace_id = ? AND id = ?
                     AND type = '${PROJECT_TEMPLATE}' AND deleted_at IS NULL
                 )
           RETURNING id`,
        )
        .bind(
          projectId,
          this.#workspaceId,
          title,
          nowTs,
          nowTs,
          this.#workspaceId,
          parentId,
          parentKind,
          this.#workspaceId,
          detail.id,
        ),
      this.#db
        .prepare(
          `INSERT INTO spine_records (workspace_id, entity_id, kind, completed_at)
           SELECT ?, ?, '${PROJECT}', NULL
           WHERE EXISTS (SELECT 1 FROM entities WHERE workspace_id = ? AND id = ?)`,
        )
        .bind(this.#workspaceId, projectId, this.#workspaceId, projectId),
      this.#db
        .prepare(
          `INSERT INTO entity_links
             (id, workspace_id, source_entity_id, target_entity_id, type,
              created_at, updated_at, deleted_at)
           SELECT ?, ?, ?, ?, ?, ?, ?, NULL
           WHERE EXISTS (SELECT 1 FROM entities WHERE workspace_id = ? AND id = ?)`,
        )
        .bind(
          this.#id(),
          this.#workspaceId,
          projectId,
          parentId,
          projectLinkType,
          nowTs,
          nowTs,
          this.#workspaceId,
          projectId,
        ),
      /*
       * The Project's identity, from the template's intentional defaults. Its
       * STATUS is deliberately not carried: a Project created from a template
       * starts at the documented default (`planned`), because "on hold" is not
       * a thing a new body of work can meaningfully begin as.
       */
      this.#db
        .prepare(
          `INSERT INTO project_details
             (workspace_id, entity_id, entity_type, status, archived_at,
              icon_key, colour_slot, updated_at)
           SELECT ?, ?, '${PROJECT}', 'planned', NULL, ?, ?, ?
           WHERE EXISTS (SELECT 1 FROM entities WHERE workspace_id = ? AND id = ?)`,
        )
        .bind(
          this.#workspaceId,
          projectId,
          detail.iconKey,
          detail.colourSlot,
          nowTs,
          this.#workspaceId,
          projectId,
        ),
    ];

    let checklistCount = 0;
    detail.tasks.forEach((templateTask, index) => {
      const taskId = this.#id();
      /*
       * The created Task's timestamp carries the template's ORDER.
       *
       * A Project's task list reads in the canonical `(created_at, id)`
       * sequence, and every Task in this batch is written at the same instant —
       * so with one shared timestamp the tiebreak falls to `id`, which is a
       * random UUID, and a twelve-step template would arrive in twelve random
       * orders. MEASURED: it did, which is what this offset exists to fix.
       *
       * One millisecond per position is invisible to a human, keeps the
       * timestamps inside the same second, and makes the canonical order
       * exactly the order the owner arranged in the template. It is not a
       * fabricated history: the template says step one comes before step two,
       * and this is the field that says so.
       */
      const taskTs = toStorageTimestamp(new Date(now.getTime() + index));
      statements.push(
        // The Task's own entity row, gated on the Project existing.
        this.#db
          .prepare(
            `INSERT INTO entities
               (id, workspace_id, type, title, created_at, updated_at, deleted_at)
             SELECT ?, ?, '${TASK}', ?, ?, ?, NULL
             WHERE EXISTS (SELECT 1 FROM entities WHERE workspace_id = ? AND id = ?)`,
          )
          .bind(
            taskId,
            this.#workspaceId,
            templateTask.title,
            taskTs,
            taskTs,
            this.#workspaceId,
            projectId,
          ),
        this.#db
          .prepare(
            `INSERT INTO spine_records (workspace_id, entity_id, kind, completed_at)
             SELECT ?, ?, '${TASK}', NULL
             WHERE EXISTS (SELECT 1 FROM entities WHERE workspace_id = ? AND id = ?)`,
          )
          .bind(this.#workspaceId, taskId, this.#workspaceId, taskId),
        this.#db
          .prepare(
            `INSERT INTO entity_links
               (id, workspace_id, source_entity_id, target_entity_id, type,
                created_at, updated_at, deleted_at)
             SELECT ?, ?, ?, ?, '${TASK_BELONGS_TO_PROJECT}', ?, ?, NULL
             WHERE EXISTS (SELECT 1 FROM entities WHERE workspace_id = ? AND id = ?)`,
          )
          .bind(
            this.#id(),
            this.#workspaceId,
            taskId,
            projectId,
            taskTs,
            taskTs,
            this.#workspaceId,
            taskId,
          ),
        /*
         * The Task's details, and the RESET, written as SQL LITERALS.
         *
         * `status = 'todo'`, `commitment_state = 'active'`, and every date,
         * sector, waiting and delegation column left at NULL. They are literals
         * rather than bound values so no caller — and no future change that
         * widens what a template stores — can route a stale absolute date, a
         * completed status or a waiting state through this statement. Only the
         * title, description and priority travel, and only because they are
         * bound above.
         */
        this.#db
          .prepare(
            `INSERT INTO task_details
               (workspace_id, entity_id, entity_type, status, priority,
                due_date, scheduled_date, time_sector, commitment_state,
                description, updated_at)
             SELECT ?, ?, '${TASK}', 'todo', ?, NULL, NULL, NULL, 'active', ?, ?
             WHERE EXISTS (SELECT 1 FROM entities WHERE workspace_id = ? AND id = ?)`,
          )
          .bind(
            this.#workspaceId,
            taskId,
            templateTask.priority,
            templateTask.description,
            taskTs,
            this.#workspaceId,
            taskId,
          ),
      );
      templateTask.checklist.forEach((item, itemIndex) => {
        checklistCount += 1;
        statements.push(
          this.#db
            .prepare(
              `INSERT INTO task_checklist_items
                 (id, workspace_id, task_id, task_type, title, position,
                  completed, created_at, updated_at)
               SELECT ?, ?, ?, '${TASK}', ?, ?, 0, ?, ?
               WHERE EXISTS (SELECT 1 FROM entities WHERE workspace_id = ? AND id = ?)`,
            )
            .bind(
              this.#id(),
              this.#workspaceId,
              taskId,
              item.title,
              itemIndex,
              taskTs,
              taskTs,
              this.#workspaceId,
              taskId,
            ),
        );
      });
    });

    /*
     * ONE legible event on the new Project, naming the template it came from.
     *
     * This is the whole of provenance. It is informational: nothing reads it to
     * decide behaviour, editing the template later changes nothing about this
     * Project, and deleting the template leaves the event (Activity is
     * append-only) without leaving a dangling reference anybody has to resolve.
     */
    statements.push(
      ...this.#appends(
        this.#event(
          {
            type: PROJECT_CREATED_FROM_TEMPLATE,
            subjects: [
              { entityId: projectId, role: "subject" },
              { entityId: detail.id, role: "source" },
            ],
            payload: {
              templateId: detail.id,
              templateName: detail.name,
              taskCount: detail.tasks.length,
              checklistCount,
            },
          },
          now,
        ),
      ),
    );

    const results = await this.#batch(statements);
    if ((results[0]?.meta?.changes ?? 0) === 0) {
      /*
       * The Project's gated insert was declined, so every later statement
       * declined with it and nothing was committed. Reconcile by RE-READING
       * which precondition actually failed rather than assuming: an owner told
       * "choose an Area" when the template was deleted underneath them would go
       * looking for the wrong thing.
       */
      if ((await this.getTemplate(detail.id)) === null) {
        throw new ProjectTemplateNotFoundError();
      }
      throw new ProjectTemplateParentUnavailableError();
    }
    return {
      projectId,
      title,
      taskCount: detail.tasks.length,
      checklistCount,
    };
  }
}

/** Construct a workspace-bound D1 project-template repository. */
export function createProjectTemplateRepository(
  db: D1Database,
  context: WorkspaceContext,
  options?: D1ProjectTemplateRepositoryOptions,
): ProjectTemplateRepository {
  return new D1ProjectTemplateRepository(db, context, options);
}
