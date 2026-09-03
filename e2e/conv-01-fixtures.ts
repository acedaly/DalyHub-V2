/**
 * V2.8 CONV-01 — the fixture the Project-record TaskRow journey drives.
 *
 * Every claim the item makes is a claim about SERVER TRUTH on one Project's
 * record: a rename, a date, a priority, a completion, a reopen, a move to
 * another Project and one bulk action over three rows, each proven by what the
 * loader answers afterwards. So every journey needs real rows it owns
 * outright — nothing here borrows a shared seed Task, and nothing it does can
 * disturb a journey that does.
 *
 * Two Projects under the committed seed's DalyHub Area: the one whose record
 * is read, holding ten tasks in the states the row draws (open, completed,
 * repeating, dated, undated), and a destination for the move. Every id starts
 * with {@link CONV01_ID_PREFIX}, so one sweep removes them all.
 *
 * Fixture dates are DERIVED from the run (CONV-00-E): the created stamps sit a
 * year ahead so the rows sort where the journeys expect them on a newest-first
 * surface, the repeating Task's planned date is a week from the owner's day,
 * and the one completed Task's completion is in the fixed past.
 */

import { futureInstant, ownerDayPlus } from "./calendar-dates";
import { d1Execute, sqlLiteral } from "./d1";

export const WORKSPACE_ID = "local-dev-workspace";

/** Every seeded id starts with this, so one sweep finds them all. */
export const CONV01_ID_PREFIX = "e2e-conv01-";

/** The committed seed's DalyHub Area — both Projects hang off it. */
const AREA_ID = "a-dh";

/** The Project whose record the journeys read. */
export const CONV01_PROJECT = {
  id: `${CONV01_ID_PREFIX}pr-home`,
  title: "CONV-01 fixture project",
} as const;

/** The Project a Task is moved TO from the row. */
export const CONV01_DESTINATION = {
  id: `${CONV01_ID_PREFIX}pr-dest`,
  title: "CONV-01 destination project",
} as const;

/**
 * The Tasks, keyed by the journey that uses each. Titles carry the prefix so a
 * locator by title can never match a shared-seed row.
 */
export const CONV01_TASKS = {
  rename: { id: `${CONV01_ID_PREFIX}t-rename`, title: "CONV-01 — rename me" },
  date: { id: `${CONV01_ID_PREFIX}t-date`, title: "CONV-01 — date me" },
  priority: {
    id: `${CONV01_ID_PREFIX}t-priority`,
    title: "CONV-01 — prioritise me",
  },
  complete: {
    id: `${CONV01_ID_PREFIX}t-complete`,
    title: "CONV-01 — complete me",
  },
  repeat: {
    id: `${CONV01_ID_PREFIX}t-repeat`,
    title: "CONV-01 — weekly repeat",
  },
  move: { id: `${CONV01_ID_PREFIX}t-move`, title: "CONV-01 — move me" },
  bulkOne: { id: `${CONV01_ID_PREFIX}t-bulk-1`, title: "CONV-01 — bulk one" },
  bulkTwo: { id: `${CONV01_ID_PREFIX}t-bulk-2`, title: "CONV-01 — bulk two" },
  bulkThree: {
    id: `${CONV01_ID_PREFIX}t-bulk-3`,
    title: "CONV-01 — bulk three",
  },
  done: { id: `${CONV01_ID_PREFIX}t-done`, title: "CONV-01 — reopen me" },
} as const;

/** How many Tasks the Project holds, and how many start completed. */
export const CONV01_TASK_TOTAL = Object.keys(CONV01_TASKS).length;
export const CONV01_COMPLETED_AT_SEED = 1;

/** The one completed Task's completion instant — fixed, and in the past. */
const DONE_AT = "2026-01-15T09:00:00.000Z"; // fixed-date: a completion in the past reads as history and never arms

const lit = sqlLiteral;
const WS = lit(WORKSPACE_ID);

/** Seed everything. Idempotent: it removes its own rows first. */
export function seedConv01Fixture(): void {
  cleanupConv01Fixture();

  const at = futureInstant(366);
  const statements: string[] = [];

  for (const project of [CONV01_PROJECT, CONV01_DESTINATION]) {
    statements.push(
      `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
         VALUES (${lit(project.id)}, ${WS}, 'project', ${lit(project.title)}, ${lit(at)}, ${lit(at)}, NULL);`,
      `INSERT INTO spine_records (workspace_id, entity_id, kind, completed_at)
         VALUES (${WS}, ${lit(project.id)}, 'project', NULL);`,
      `INSERT INTO project_details (workspace_id, entity_id, status, archived_at, updated_at)
         VALUES (${WS}, ${lit(project.id)}, 'active', NULL, ${lit(at)});`,
      `INSERT INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
         VALUES (${lit(`l-${project.id}-area`)}, ${WS}, ${lit(project.id)}, ${lit(AREA_ID)},
                 'project.belongs_to_area', ${lit(at)}, ${lit(at)}, NULL);`,
    );
  }

  const repeatOn = ownerDayPlus(7);
  Object.values(CONV01_TASKS).forEach((task, index) => {
    const stamp = lit(futureInstant(366, index + 1));
    const completedAt =
      task.id === CONV01_TASKS.done.id ? lit(DONE_AT) : "NULL";
    const scheduled =
      task.id === CONV01_TASKS.repeat.id ? lit(repeatOn) : "NULL";
    statements.push(
      `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
         VALUES (${lit(task.id)}, ${WS}, 'task', ${lit(task.title)}, ${stamp}, ${stamp}, NULL);`,
      `INSERT INTO spine_records (workspace_id, entity_id, kind, completed_at)
         VALUES (${WS}, ${lit(task.id)}, 'task', ${completedAt});`,
      `INSERT INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
         VALUES (${lit(`l-${task.id}`)}, ${WS}, ${lit(task.id)}, ${lit(CONV01_PROJECT.id)}, 'task.belongs_to_project', ${stamp}, ${stamp}, NULL);`,
      `INSERT INTO task_details
         (workspace_id, entity_id, entity_type, status, priority, due_date, scheduled_date,
          time_sector, commitment_state, updated_at)
       VALUES (${WS}, ${lit(task.id)}, 'task', 'todo', 'p3', NULL, ${scheduled},
               NULL, 'active', ${stamp});`,
    );
  });

  // The repeating Task's rule: every week, on its planned date.
  statements.push(
    `INSERT INTO task_recurrence_rules
       (workspace_id, entity_id, date_kind, frequency, interval, weekdays,
        anchor_day, anchor_month, series_id, sequence, mode, created_at, updated_at)
     VALUES (${WS}, ${lit(CONV01_TASKS.repeat.id)}, 'scheduled', 'week', 1, NULL,
             NULL, NULL, ${lit(`${CONV01_ID_PREFIX}series-repeat`)}, 0, 'fixed', ${lit(at)}, ${lit(at)});`,
  );

  d1Execute(statements.join(" "));
}

/** Remove every row this fixture owns, dependents first. */
export function cleanupConv01Fixture(): void {
  const prefix = lit(`${CONV01_ID_PREFIX}%`);
  const owned = `SELECT id FROM entities WHERE workspace_id = ${WS} AND id LIKE ${prefix}`;
  d1Execute(
    [
      `DELETE FROM task_recurrence_rules WHERE workspace_id = ${WS} AND entity_id IN (${owned});`,
      `DELETE FROM task_checklist_items WHERE workspace_id = ${WS} AND task_id IN (${owned});`,
      `DELETE FROM activity_subjects WHERE workspace_id = ${WS} AND entity_id IN (${owned});`,
      `DELETE FROM activities WHERE workspace_id = ${WS} AND NOT EXISTS (
         SELECT 1 FROM activity_subjects s
         WHERE s.workspace_id = activities.workspace_id AND s.activity_id = activities.id);`,
      `DELETE FROM task_details WHERE workspace_id = ${WS} AND entity_id IN (${owned});`,
      `DELETE FROM project_details WHERE workspace_id = ${WS} AND entity_id IN (${owned});`,
      `DELETE FROM entity_links WHERE workspace_id = ${WS}
         AND (source_entity_id IN (${owned}) OR target_entity_id IN (${owned}));`,
      `DELETE FROM spine_records WHERE workspace_id = ${WS} AND entity_id IN (${owned});`,
      `DELETE FROM entities WHERE workspace_id = ${WS} AND id LIKE ${prefix};`,
    ].join(" "),
  );
}
