/**
 * DHDS-11 — the fixture the drag journeys drive.
 *
 * Everything the phase claims is a claim about SERVER TRUTH, so every journey
 * needs real rows: two Projects to move a Task between, a Goal with stages whose
 * order is the owner's, and a Task with a checklist. All of them are written
 * here, all of them are owned by this suite, and all of them are removed again.
 *
 * ── How the Tasks are ISOLATED ──────────────────────────────────────────────
 * The committed E2E workspace holds ninety-odd Tasks across a dozen parents, so
 * `/tasks?group=parent` there is a page of buckets. Every fixture Task carries
 * the same unique `delegate_to`, which is a real, indexed, filterable field —
 * `?person=<DELEGATE>` therefore isolates exactly these Tasks, and grouping THAT
 * by parent produces exactly two buckets whose contents the journeys can assert
 * on completely. No test-only column, no test-only route: the isolation is an
 * ordinary product filter.
 */

import { futureInstant } from "./calendar-dates";
import { d1Execute, d1Query, sqlLiteral } from "./d1";

export const WORKSPACE_ID = "local-dev-workspace";

/** Every seeded id starts with this, so one sweep finds them all. */
export const DRAG_ID_PREFIX = "e2e-dhds11-";

/** The delegatee that isolates this fixture's Tasks in the Tasks collection. */
export const DRAG_DELEGATE = "DHDS-11 Fixture";

/** The seeded Projects a Task is dragged between. */
export const WORK_PROJECT = {
  id: `${DRAG_ID_PREFIX}pr-work`,
  title: "DHDS-11 Workshop",
} as const;
export const HOME_PROJECT = {
  id: `${DRAG_ID_PREFIX}pr-home`,
  title: "DHDS-11 Homestead",
} as const;

/** The seeded Goal whose stages are reordered. */
export const STAGED_GOAL = {
  id: `${DRAG_ID_PREFIX}g-stages`,
  title: "DHDS-11 Certification",
} as const;

/** The stage titles, in the order they are seeded. */
export const GOAL_STAGES = [
  "Book the course",
  "Sit the exam",
  "File the paperwork",
] as const;

/**
 * The Tasks, which Project each starts in, and its priority.
 *
 * The priorities are deliberately MIXED. A `priority` grouping hides an empty
 * bucket (only Time Sectors draw theirs), so a fixture whose Tasks were all P3
 * would render one bucket and the priority-drop journey would have nowhere to
 * drop TO. Two priorities is the smallest set that makes the journey possible.
 */
export const WORK_TASKS = [
  {
    id: `${DRAG_ID_PREFIX}t-brief`,
    title: "DHDS-11 — prepare the brief",
    priority: "p3",
  },
  {
    id: `${DRAG_ID_PREFIX}t-invoice`,
    title: "DHDS-11 — send the invoice",
    priority: "p1",
  },
] as const;
export const HOME_TASKS = [
  {
    id: `${DRAG_ID_PREFIX}t-plants`,
    title: "DHDS-11 — water the plants",
    priority: "p3",
  },
] as const;

/** The Task whose checklist is reordered. */
export const CHECKLIST_TASK = {
  id: `${DRAG_ID_PREFIX}t-steps`,
  title: "DHDS-11 — pack the van",
  priority: "p3",
} as const;

export const CHECKLIST_STEPS = [
  "Check tyre pressures",
  "Fill water tanks",
  "Charge the batteries",
] as const;

/**
 * Far ahead of every other seeded fixture, so a newest-first collection puts
 * these rows where the journeys expect them. Deterministic placement rather
 * than luck — and derived from the run, because a fixed "far ahead" instant
 * is ahead only until the calendar reaches it (CONV-00-E).
 */
const AT = futureInstant(366);

/**
 * The committed seed's DalyHub Area.
 *
 * Every Project and every Goal in this fixture hangs off it, because the record
 * routes resolve a spine record through its parent: a Goal with no
 * `goal.belongs_to_area` link renders "We couldn't find that Goal", which is how
 * this fixture's first version failed.
 */
const AREA_ID = "a-dh";

const lit = sqlLiteral;
const WS = lit(WORKSPACE_ID);

/** Seed everything. Idempotent: it removes its own rows first. */
export function seedDragFixture(): void {
  cleanupDragFixture();

  const statements: string[] = [];

  for (const project of [WORK_PROJECT, HOME_PROJECT]) {
    statements.push(
      `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
         VALUES (${lit(project.id)}, ${WS}, 'project', ${lit(project.title)}, ${lit(AT)}, ${lit(AT)}, NULL);`,
      `INSERT INTO spine_records (workspace_id, entity_id, kind, completed_at)
         VALUES (${WS}, ${lit(project.id)}, 'project', NULL);`,
      `INSERT INTO project_details (workspace_id, entity_id, status, archived_at, updated_at)
         VALUES (${WS}, ${lit(project.id)}, 'active', NULL, ${lit(AT)});`,
      `INSERT INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
         VALUES (${lit(`l-${project.id}-area`)}, ${WS}, ${lit(project.id)}, ${lit(AREA_ID)},
                 'project.belongs_to_area', ${lit(AT)}, ${lit(AT)}, NULL);`,
    );
  }

  const tasks = [
    ...WORK_TASKS.map((task) => ({ ...task, project: WORK_PROJECT.id })),
    ...HOME_TASKS.map((task) => ({ ...task, project: HOME_PROJECT.id })),
    { ...CHECKLIST_TASK, project: WORK_PROJECT.id },
  ];
  tasks.forEach((task, index) => {
    const stamp = lit(futureInstant(366, index));
    statements.push(
      `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
         VALUES (${lit(task.id)}, ${WS}, 'task', ${lit(task.title)}, ${stamp}, ${stamp}, NULL);`,
      `INSERT INTO spine_records (workspace_id, entity_id, kind, completed_at)
         VALUES (${WS}, ${lit(task.id)}, 'task', NULL);`,
      `INSERT INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
         VALUES (${lit(`l-${task.id}`)}, ${WS}, ${lit(task.id)}, ${lit(task.project)}, 'task.belongs_to_project', ${stamp}, ${stamp}, NULL);`,
      `INSERT INTO task_details
         (workspace_id, entity_id, entity_type, status, priority, due_date, scheduled_date,
          time_sector, commitment_state, delegate_to, updated_at)
       VALUES (${WS}, ${lit(task.id)}, 'task', 'todo', ${lit(task.priority)},
               NULL, NULL, NULL, 'active', ${lit(DRAG_DELEGATE)}, ${stamp});`,
    );
  });

  CHECKLIST_STEPS.forEach((title, index) => {
    statements.push(
      `INSERT INTO task_checklist_items
         (id, workspace_id, task_id, task_type, title, position, completed, created_at, updated_at)
       VALUES (${lit(`${CHECKLIST_TASK.id}-i${index}`)}, ${WS}, ${lit(CHECKLIST_TASK.id)},
               'task', ${lit(title)}, ${index}, 0, ${lit(AT)}, ${lit(AT)});`,
    );
  });

  statements.push(
    `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
       VALUES (${lit(STAGED_GOAL.id)}, ${WS}, 'goal', ${lit(STAGED_GOAL.title)}, ${lit(AT)}, ${lit(AT)}, NULL);`,
    `INSERT INTO spine_records (workspace_id, entity_id, kind, completed_at)
       VALUES (${WS}, ${lit(STAGED_GOAL.id)}, 'goal', NULL);`,
    `INSERT INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
       VALUES (${lit(`l-${STAGED_GOAL.id}-area`)}, ${WS}, ${lit(STAGED_GOAL.id)}, ${lit(AREA_ID)},
               'goal.belongs_to_area', ${lit(AT)}, ${lit(AT)}, NULL);`,
    // A MILESTONE-measured Goal, so the record draws its stages.
    `INSERT INTO goal_details
       (workspace_id, entity_id, entity_type, target_date, definition_of_done,
        measurement_type, measurement_unit, measurement_direction, baseline_value,
        target_value, updated_at)
     VALUES (${WS}, ${lit(STAGED_GOAL.id)}, 'goal', '2027-12-31', NULL, -- fixed-date: the drag journeys reorder stages; no assertion reads the target
             'milestone', NULL, NULL, NULL, NULL, ${lit(AT)});`,
  );
  GOAL_STAGES.forEach((title, index) => {
    statements.push(
      `INSERT INTO goal_milestones
         (workspace_id, id, entity_id, title, weight, position, completed_at, created_at, updated_at)
       VALUES (${WS}, ${lit(`${STAGED_GOAL.id}-m${index}`)}, ${lit(STAGED_GOAL.id)},
               ${lit(title)}, 1, ${index}, NULL, ${lit(AT)}, ${lit(AT)});`,
    );
  });

  d1Execute(statements.join(" "));
}

/** Remove every row this fixture owns, dependents first. */
export function cleanupDragFixture(): void {
  const prefix = lit(`${DRAG_ID_PREFIX}%`);
  const owned = `SELECT id FROM entities WHERE workspace_id = ${WS} AND id LIKE ${prefix}`;
  d1Execute(
    [
      `DELETE FROM goal_milestones WHERE workspace_id = ${WS} AND entity_id IN (${owned});`,
      `DELETE FROM goal_measurements WHERE workspace_id = ${WS} AND entity_id IN (${owned});`,
      `DELETE FROM task_checklist_items WHERE workspace_id = ${WS} AND task_id IN (${owned});`,
      `DELETE FROM task_recurrence_rules WHERE workspace_id = ${WS} AND entity_id IN (${owned});`,
      `DELETE FROM task_details WHERE workspace_id = ${WS} AND entity_id IN (${owned});`,
      `DELETE FROM project_details WHERE workspace_id = ${WS} AND entity_id IN (${owned});`,
      `DELETE FROM goal_details WHERE workspace_id = ${WS} AND entity_id IN (${owned});`,
      `DELETE FROM entity_links WHERE workspace_id = ${WS}
         AND (source_entity_id IN (${owned}) OR target_entity_id IN (${owned}));`,
      `DELETE FROM activity_subjects WHERE workspace_id = ${WS} AND entity_id IN (${owned});`,
      `DELETE FROM activities WHERE workspace_id = ${WS}
         AND NOT EXISTS (SELECT 1 FROM activity_subjects s
                          WHERE s.workspace_id = activities.workspace_id
                            AND s.activity_id = activities.id);`,
      `DELETE FROM spine_records WHERE workspace_id = ${WS} AND entity_id IN (${owned});`,
      `DELETE FROM entities WHERE workspace_id = ${WS} AND id LIKE ${prefix};`,
    ].join(" "),
  );
}

/** The Project a Task belongs to RIGHT NOW, straight from the database. */
export function storedParentOf(taskId: string): string | null {
  const rows = d1Query<{ readonly target: string }>(
    `SELECT target_entity_id AS target FROM entity_links
      WHERE workspace_id = ${WS} AND source_entity_id = ${lit(taskId)}
        AND type IN ('task.belongs_to_project', 'task.belongs_to_area')
        AND deleted_at IS NULL`,
  );
  return rows[0]?.target ?? null;
}

/** This Task's checklist, in stored order. */
export function storedSteps(taskId: string): readonly string[] {
  return d1Query<{ readonly title: string }>(
    `SELECT title FROM task_checklist_items
      WHERE workspace_id = ${WS} AND task_id = ${lit(taskId)}
      ORDER BY position, created_at, id`,
  ).map((row) => row.title);
}

/** This Goal's stages, in stored order. */
export function storedStages(goalId: string): readonly string[] {
  return d1Query<{ readonly title: string }>(
    `SELECT title FROM goal_milestones
      WHERE workspace_id = ${WS} AND entity_id = ${lit(goalId)}
      ORDER BY position, created_at`,
  ).map((row) => row.title);
}

/** This Task's stored priority, for the priority-bucket journey. */
export function storedPriority(taskId: string): string | null {
  const rows = d1Query<{ readonly priority: string | null }>(
    `SELECT priority FROM task_details
      WHERE workspace_id = ${WS} AND entity_id = ${lit(taskId)}`,
  );
  return rows[0]?.priority ?? null;
}
