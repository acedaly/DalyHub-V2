/**
 * V2.4-GATE-02 — four past-due Tasks, one per commitment state.
 *
 * The claim under test is a SEMANTIC one — *a passed date is late only while the
 * owner still owes the work* — and it needs a Task in each of the four states the
 * kernel distinguishes, all with the same passed deadline, all visible on the
 * same surface at the same time. The committed `seed-tasks.sql` happens to
 * contain cancelled and Someday/Maybe Tasks today; relying on that would be a
 * test that passes by coincidence and breaks the day the seed is re-balanced, so
 * this fixture owns its four rows outright.
 *
 * Every id is prefixed `t-gate02-`, so nothing here can disturb a journey that
 * borrows a shared seed Task, and `clearGate02Fixture` removes exactly them.
 *
 * The deadline is FAR past (`2000-01-05`) for the same reason the rest of the
 * committed seed uses far dates: a fixture with a near date is a test that fails
 * on one specific day of the year.
 */

import { d1Execute, sqlLiteral } from "./d1";

const WORKSPACE = "local-dev-workspace";

/** The Project the four Tasks hang from, so a Project's Tasks tab draws them. */
export const GATE_02_PROJECT_ID = "pr-website";

/** The one passed deadline all four share. */
export const GATE_02_DUE = "2000-01-05";

export interface Gate02FixtureTask {
  readonly id: string;
  readonly title: string;
  /** Is this Task still a commitment the owner owes? The expected answer. */
  readonly stillOwed: boolean;
  readonly status: "todo" | "in_progress" | "on_hold" | "cancelled";
  readonly commitmentState: "active" | "someday";
  readonly completedAt: string | null;
}

export const GATE_02_TASKS: readonly Gate02FixtureTask[] = [
  {
    id: "t-gate02-live",
    title: "Gate02 fixture — live overdue commitment",
    stillOwed: true,
    status: "todo",
    commitmentState: "active",
    completedAt: null,
  },
  {
    id: "t-gate02-cancelled",
    title: "Gate02 fixture — cancelled past due",
    stillOwed: false,
    status: "cancelled",
    commitmentState: "active",
    completedAt: null,
  },
  {
    id: "t-gate02-completed",
    title: "Gate02 fixture — completed past due",
    stillOwed: false,
    status: "todo",
    commitmentState: "active",
    completedAt: "2026-01-06T02:00:00.000Z",
  },
  {
    id: "t-gate02-someday",
    title: "Gate02 fixture — parked past due",
    stillOwed: false,
    status: "todo",
    commitmentState: "someday",
    completedAt: null,
  },
  /*
   * ON HOLD — the control that stops this being a test of "closed means not
   * completed". A parked-but-still-owed Task IS late, and if the rule ever
   * widened to the two blocked states this row would catch it.
   */
  {
    id: "t-gate02-onhold",
    title: "Gate02 fixture — on hold past due",
    stillOwed: true,
    status: "on_hold",
    commitmentState: "active",
    completedAt: null,
  },
];

/** Look one fixture Task up by its id suffix. */
export function gate02Task(suffix: string): Gate02FixtureTask {
  const found = GATE_02_TASKS.find((task) => task.id === `t-gate02-${suffix}`);
  if (found === undefined) {
    throw new Error(`No gate-02 fixture task named ${suffix}`);
  }
  return found;
}

/**
 * Write the fixture. Idempotent, in the shape `plan-fixtures.ts` uses: an
 * `INSERT OR IGNORE` per row followed by an `UPDATE` to the exact intended
 * values, so a re-run repairs a Task a previous journey mutated.
 */
export function seedGate02Fixture(): void {
  const statements: string[] = [];
  for (const [index, task] of GATE_02_TASKS.entries()) {
    const stamp = `2026-07-19T03:00:0${index}.000Z`;
    statements.push(
      `INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
       VALUES (${sqlLiteral(task.id)}, ${sqlLiteral(WORKSPACE)}, 'task', ${sqlLiteral(task.title)}, ${sqlLiteral(stamp)}, ${sqlLiteral(stamp)}, NULL);`,
      `INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
       VALUES (${sqlLiteral(WORKSPACE)}, ${sqlLiteral(task.id)}, 'task', NULL);`,
      `INSERT OR IGNORE INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
       VALUES (${sqlLiteral(`l-${task.id}-proj`)}, ${sqlLiteral(WORKSPACE)}, ${sqlLiteral(task.id)}, ${sqlLiteral(GATE_02_PROJECT_ID)}, 'task.belongs_to_project', ${sqlLiteral(stamp)}, ${sqlLiteral(stamp)}, NULL);`,
      `INSERT OR IGNORE INTO task_details (workspace_id, entity_id, entity_type, status, updated_at)
       VALUES (${sqlLiteral(WORKSPACE)}, ${sqlLiteral(task.id)}, 'task', 'todo', ${sqlLiteral(stamp)});`,
      `UPDATE entities SET deleted_at = NULL, title = ${sqlLiteral(task.title)}
        WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND id = ${sqlLiteral(task.id)};`,
      `UPDATE spine_records SET completed_at = ${task.completedAt === null ? "NULL" : sqlLiteral(task.completedAt)}
        WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND entity_id = ${sqlLiteral(task.id)};`,
      `UPDATE task_details SET status = ${sqlLiteral(task.status)},
          priority = 'p3',
          due_date = ${sqlLiteral(GATE_02_DUE)},
          scheduled_date = NULL,
          time_sector = NULL,
          commitment_state = ${sqlLiteral(task.commitmentState)},
          waiting_since = NULL,
          waiting_note = NULL,
          updated_at = ${sqlLiteral(stamp)}
        WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND entity_id = ${sqlLiteral(task.id)};`,
    );
  }
  d1Execute(statements);
}

/** Remove every fixture row, children first (the same order the plan fixture uses). */
export function clearGate02Fixture(): void {
  const ids = GATE_02_TASKS.map((task) => sqlLiteral(task.id)).join(", ");
  d1Execute([
    `DELETE FROM activity_subjects WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND entity_id IN (${ids});`,
    `DELETE FROM activities WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND NOT EXISTS (SELECT 1 FROM activity_subjects s WHERE s.workspace_id = activities.workspace_id AND s.activity_id = activities.id);`,
    `DELETE FROM entity_links WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND source_entity_id IN (${ids});`,
    `DELETE FROM task_details WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND entity_id IN (${ids});`,
    `DELETE FROM spine_records WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND entity_id IN (${ids});`,
    `DELETE FROM entities WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND id IN (${ids});`,
  ]);
}
