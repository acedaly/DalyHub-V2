/**
 * PROJECT-02 — shared E2E fixtures for the Project-template journeys.
 *
 * The specs drive a REAL Project, a REAL template and REAL instantiation in the
 * seeded Worker/D1 app, and must tear every one of them down deterministically.
 * Mirrors `checklist-fixtures.ts`: one ordered, retriable cleanup through the
 * shared `d1Execute`, scoped strictly to test-owned ids so it can never touch a
 * developer's own local data.
 *
 * Rows are removed dependents-first, because every foreign key here is
 * ON DELETE RESTRICT: template checklist items, then template tasks, then the
 * template detail row, then the entity.
 */

import { futureInstant, ownerDayPlus } from "./calendar-dates";
import { d1Execute, d1Query, sqlLiteral } from "./d1";

export const WORKSPACE_ID = "local-dev-workspace";

/** Every seeded id starts with this, so one sweep can find them all. */
export const TEMPLATE_ID_PREFIX = "e2e-tpl-";

/**
 * A creation instant far ahead of every other seeded fixture, so these records
 * sort to the top of any recency-ordered collection. Deterministic placement
 * rather than luck — and derived from the run, because a fixed "far ahead"
 * instant is ahead only until the calendar reaches it (CONV-00-E).
 */
const SEEDED_AT = futureInstant(366);

function lit(value: string): string {
  return sqlLiteral(value);
}

/** One Task to seed under the source Project, in the order it should appear. */
export interface SeedProjectTask {
  readonly title: string;
  /** Steps inside it. Ticks are seeded so the template can prove it drops them. */
  readonly items?: readonly {
    readonly title: string;
    readonly done?: boolean;
  }[];
  /** Seeded as COMPLETED, so the template can prove it leaves it behind. */
  readonly completed?: boolean;
  readonly priority?: "p1" | "p2" | "p3" | "p4";
  /** A `YYYY-MM-DD` due date, so the template can prove it drops it. */
  readonly dueDate?: string;
  /** A `YYYY-MM-DD` planned date, so Today and /plan can be checked. */
  readonly scheduledDate?: string;
}

export interface SeedProjectOptions {
  readonly id: string;
  readonly title: string;
  /** The Area the Project belongs to. Seeded too, and torn down with it. */
  readonly areaId: string;
  readonly areaTitle: string;
  readonly tasks: readonly SeedProjectTask[];
}

/**
 * Seed one Area, one Project under it, and the Project's Tasks and checklists.
 *
 * Removes first rather than using `INSERT OR REPLACE`: REPLACE on `entities` is
 * a delete-then-insert, and a leftover child row from a previous run holds a
 * RESTRICT foreign key that makes the delete fail. Removing the children
 * explicitly, in order, is the only sequence that is idempotent across runs.
 */
export function seedTemplateSourceProject(options: SeedProjectOptions): void {
  removeTemplateFixtures();
  const ws = lit(WORKSPACE_ID);
  const at = lit(SEEDED_AT);
  const areaId = lit(options.areaId);
  const projectId = lit(options.id);

  const statements: string[] = [
    `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
       VALUES (${areaId}, ${ws}, 'area', ${lit(options.areaTitle)}, ${at}, ${at}, NULL);`,
    `INSERT INTO spine_records (workspace_id, entity_id, kind, completed_at)
       VALUES (${ws}, ${areaId}, 'area', NULL);`,
    `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
       VALUES (${projectId}, ${ws}, 'project', ${lit(options.title)}, ${at}, ${at}, NULL);`,
    `INSERT INTO spine_records (workspace_id, entity_id, kind, completed_at)
       VALUES (${ws}, ${projectId}, 'project', NULL);`,
    `INSERT INTO project_details (workspace_id, entity_id, entity_type, status, archived_at, updated_at)
       VALUES (${ws}, ${projectId}, 'project', 'active', NULL, ${at});`,
    `INSERT INTO entity_links
       (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
       VALUES (${lit(`${options.id}-link`)}, ${ws}, ${projectId}, ${areaId},
               'project.belongs_to_area', ${at}, ${at}, NULL);`,
  ];

  options.tasks.forEach((task, index) => {
    const taskId = `${options.id}-t${index}`;
    const id = lit(taskId);
    // One millisecond apart, so `(created_at, id)` is the seeded order.
    const taskAt = lit(new Date(Date.parse(SEEDED_AT) + index).toISOString());
    statements.push(
      `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
         VALUES (${id}, ${ws}, 'task', ${lit(task.title)}, ${taskAt}, ${taskAt}, NULL);`,
      `INSERT INTO spine_records (workspace_id, entity_id, kind, completed_at)
         VALUES (${ws}, ${id}, 'task', ${task.completed ? at : "NULL"});`,
      `INSERT INTO task_details
         (workspace_id, entity_id, status, priority, due_date, scheduled_date, updated_at)
         VALUES (${ws}, ${id}, 'todo', ${task.priority ? lit(task.priority) : "NULL"},
                 ${task.dueDate ? lit(task.dueDate) : "NULL"},
                 ${task.scheduledDate ? lit(task.scheduledDate) : "NULL"}, ${taskAt});`,
      `INSERT INTO entity_links
         (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
         VALUES (${lit(`${taskId}-link`)}, ${ws}, ${id}, ${projectId},
                 'task.belongs_to_project', ${taskAt}, ${taskAt}, NULL);`,
    );
    (task.items ?? []).forEach((item, itemIndex) => {
      statements.push(
        `INSERT INTO task_checklist_items
           (id, workspace_id, task_id, task_type, title, position, completed, created_at, updated_at)
           VALUES (${lit(`${taskId}-i${itemIndex}`)}, ${ws}, ${id}, 'task',
                   ${lit(item.title)}, ${itemIndex}, ${item.done ? 1 : 0}, ${taskAt}, ${taskAt});`,
      );
    });
  });

  d1Execute(statements.join(" "));
}

/**
 * Remove EVERY record this suite owns — the seeded Area, Project and Tasks, the
 * templates saved from them, and every Project instantiated from one.
 *
 * An instantiated Project has a generated id, so it cannot be found by the
 * prefix. It is found through the `project.created_from_template` Activity
 * event instead — the same event that IS the provenance — and the id list is
 * resolved BEFORE anything is deleted, because that event's subject rows are
 * among the rows the sweep removes.
 */
export function removeTemplateFixtures(): void {
  const ws = lit(WORKSPACE_ID);
  const prefix = lit(`${TEMPLATE_ID_PREFIX}%`);

  const templateIds = d1Query<{ readonly id: string }>(
    `SELECT id FROM entities
      WHERE workspace_id = ${ws} AND type = 'project_template'`,
  ).map((row) => row.id);

  const instantiated = d1Query<{ readonly entity_id: string }>(
    `SELECT DISTINCT s.entity_id AS entity_id
       FROM activity_subjects s
       JOIN activities a ON a.id = s.activity_id AND a.workspace_id = s.workspace_id
       JOIN entities e ON e.id = s.entity_id AND e.workspace_id = s.workspace_id
      WHERE s.workspace_id = ${ws}
        AND a.type = 'project.created_from_template'
        AND e.type = 'project'`,
  ).map((row) => row.entity_id);

  /*
   * The instantiated Projects' Tasks, resolved BEFORE anything is deleted.
   *
   * They are found through the structural link — and that link is one of the
   * rows the sweep removes, and is itself ON DELETE RESTRICT against the Task
   * it points at. So the ids are read once, up front, and every DELETE below
   * names them explicitly: a subquery evaluated statement by statement would
   * stop finding Tasks halfway through its own sweep, and deleting the Task
   * before its link would violate the key.
   */
  const instantiatedTaskIds =
    instantiated.length === 0
      ? []
      : d1Query<{ readonly id: string }>(
          `SELECT e.id AS id FROM entity_links l
             JOIN entities e ON e.id = l.source_entity_id AND e.workspace_id = l.workspace_id
            WHERE l.workspace_id = ${ws}
              AND l.type = 'task.belongs_to_project'
              AND l.target_entity_id IN (${instantiated.map(lit).join(", ")})`,
        ).map((row) => row.id);

  const statements: string[] = [];

  // Templates: checklist items, then tasks, then the detail row, then the entity.
  for (const id of templateIds) {
    const value = lit(id);
    statements.push(
      `DELETE FROM project_template_checklist_items
         WHERE workspace_id = ${ws}
           AND template_task_id IN (
             SELECT id FROM project_template_tasks
              WHERE workspace_id = ${ws} AND template_id = ${value});`,
      `DELETE FROM project_template_tasks WHERE workspace_id = ${ws} AND template_id = ${value};`,
      `DELETE FROM project_template_details WHERE workspace_id = ${ws} AND entity_id = ${value};`,
      `DELETE FROM activity_subjects WHERE workspace_id = ${ws} AND entity_id = ${value};`,
      `DELETE FROM entities WHERE workspace_id = ${ws} AND id = ${value};`,
    );
  }

  // Every Task an instantiation created, dependents first and LINKS BEFORE the
  // entity they point at.
  for (const id of instantiatedTaskIds) {
    const value = lit(id);
    statements.push(
      `DELETE FROM task_checklist_items WHERE workspace_id = ${ws} AND task_id = ${value};`,
      `DELETE FROM task_details WHERE workspace_id = ${ws} AND entity_id = ${value};`,
      `DELETE FROM spine_records WHERE workspace_id = ${ws} AND entity_id = ${value};`,
      `DELETE FROM entity_links WHERE workspace_id = ${ws}
         AND (source_entity_id = ${value} OR target_entity_id = ${value});`,
      `DELETE FROM activity_subjects WHERE workspace_id = ${ws} AND entity_id = ${value};`,
      `DELETE FROM entities WHERE workspace_id = ${ws} AND id = ${value};`,
    );
  }

  // Then the Projects themselves.
  for (const id of instantiated) {
    const value = lit(id);
    statements.push(
      `DELETE FROM project_details WHERE workspace_id = ${ws} AND entity_id = ${value};`,
      `DELETE FROM spine_records WHERE workspace_id = ${ws} AND entity_id = ${value};`,
      `DELETE FROM entity_links WHERE workspace_id = ${ws}
         AND (source_entity_id = ${value} OR target_entity_id = ${value});`,
      `DELETE FROM activity_subjects WHERE workspace_id = ${ws} AND entity_id = ${value};`,
      `DELETE FROM entities WHERE workspace_id = ${ws} AND id = ${value};`,
    );
  }

  // The seeded Area, Project and Tasks, by prefix. Links first, for the same
  // reason: `entity_links` references `entities` ON DELETE RESTRICT.
  statements.push(
    `DELETE FROM task_checklist_items WHERE workspace_id = ${ws} AND task_id LIKE ${prefix};`,
    `DELETE FROM task_details WHERE workspace_id = ${ws} AND entity_id LIKE ${prefix};`,
    `DELETE FROM project_details WHERE workspace_id = ${ws} AND entity_id LIKE ${prefix};`,
    `DELETE FROM entity_links WHERE workspace_id = ${ws}
       AND (id LIKE ${prefix} OR source_entity_id LIKE ${prefix} OR target_entity_id LIKE ${prefix});`,
    `DELETE FROM spine_records WHERE workspace_id = ${ws} AND entity_id LIKE ${prefix};`,
    `DELETE FROM activity_subjects WHERE workspace_id = ${ws} AND entity_id LIKE ${prefix};`,
    `DELETE FROM entities WHERE workspace_id = ${ws} AND id LIKE ${prefix};`,
  );

  d1Execute(statements.join(" "));
}

/** The canonical fixture the journeys use. */
export const FIXTURE = {
  areaId: `${TEMPLATE_ID_PREFIX}area`,
  areaTitle: "Reporting",
  projectId: `${TEMPLATE_ID_PREFIX}project`,
  projectTitle: "August reporting",
  templateName: "Monthly reporting",
} as const;

/** Seed the canonical source Project: two open Tasks, one done, one checklist. */
export function seedCanonicalProject(): void {
  seedTemplateSourceProject({
    id: FIXTURE.projectId,
    title: FIXTURE.projectTitle,
    areaId: FIXTURE.areaId,
    areaTitle: FIXTURE.areaTitle,
    tasks: [
      {
        title: "Pull the numbers",
        priority: "p2",
        /*
         * Far enough ahead that the SOURCE Project's real Task never reaches
         * Today or the current planning week, so the only place its title
         * appears on Today is the Project's next-action line — which is what
         * the "never live work" journey relies on. Derived from the owner's
         * day: a fixed March 2027 pair would have put the Task on Today that
         * March (CONV-00-E).
         */
        dueDate: ownerDayPlus(400),
        scheduledDate: ownerDayPlus(390),
      },
      {
        title: "Write the summary",
        items: [
          { title: "Headline figure", done: true },
          { title: "One risk, one win" },
        ],
      },
      { title: "Last month's retro", completed: true },
    ],
  });
}
