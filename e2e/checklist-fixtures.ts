/**
 * TASKS-13 — shared E2E fixtures for the Task checklist journeys.
 *
 * The specs drive REAL Task records with REAL checklist rows in the seeded
 * Worker/D1 app, and must tear every one of them down deterministically.
 * Mirrors `habits-fixtures.ts`: one ordered, retriable cleanup through the
 * shared `d1Execute`, scoped strictly to test-owned ids so it can never touch a
 * developer's own local data.
 *
 * Rows are removed dependents-first, because every foreign key here is
 * ON DELETE RESTRICT: checklist items, then recurrence rules, then details, then
 * the spine record, then activity subjects, then the entity.
 */

import { futureInstant } from "./calendar-dates";
import { d1Execute, d1Query, sqlLiteral } from "./d1";

export const WORKSPACE_ID = "local-dev-workspace";

/** Every seeded id starts with this, so one sweep can find them all. */
export const CHECKLIST_ID_PREFIX = "e2e-cl-";

/**
 * A creation instant far ahead of every other seeded fixture, so a Tasks list
 * sorted newest-first puts these rows at the top of a collection that already
 * holds ninety-odd others. Deterministic placement rather than luck — and
 * derived from the run, because a fixed "far ahead" instant is ahead only
 * until the calendar reaches it (CONV-00-E).
 */
const SEEDED_AT = futureInstant(366);

/** One step to seed, in the order it should appear. */
export interface SeedChecklistItem {
  readonly title: string;
  readonly completed?: boolean;
}

export interface SeedTaskOptions {
  readonly id: string;
  readonly title: string;
  readonly items?: readonly SeedChecklistItem[];
  /** A `YYYY-MM-DD` planned date, so the Task appears on Today and in /plan. */
  readonly scheduledDate?: string;
  /** A structured repeat, for the recurrence journey. */
  readonly repeat?: {
    readonly frequency: "day" | "week" | "month";
    readonly seriesId: string;
    /**
     * The day of the month a MONTHLY rule repeats on. Required by the schema's
     * own CHECK for `month`, because a monthly rule with no anchor cannot say
     * which day it means.
     */
    readonly anchorDay?: number;
  };
}

function lit(value: string): string {
  return sqlLiteral(value);
}

/**
 * Seed one Task and its checklist.
 *
 * Removes first rather than using `INSERT OR REPLACE`: REPLACE on `entities` is
 * a delete-then-insert, and a leftover child row from a previous run holds a
 * RESTRICT foreign key that makes the delete fail. Removing the children
 * explicitly, in order, is the only sequence that is idempotent across runs.
 */
export function seedChecklistTask(options: SeedTaskOptions): void {
  removeChecklistTask(options.id);
  const ws = lit(WORKSPACE_ID);
  const id = lit(options.id);
  const at = lit(SEEDED_AT);
  const statements = [
    `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
       VALUES (${id}, ${ws}, 'task', ${lit(options.title)}, ${at}, ${at}, NULL);`,
    `INSERT INTO spine_records (workspace_id, entity_id, kind, completed_at)
       VALUES (${ws}, ${id}, 'task', NULL);`,
    `INSERT INTO task_details (workspace_id, entity_id, status, priority, due_date, scheduled_date, updated_at)
       VALUES (${ws}, ${id}, 'todo', NULL, NULL, ${
         options.scheduledDate ? lit(options.scheduledDate) : "NULL"
       }, ${at});`,
  ];
  if (options.repeat) {
    statements.push(
      `INSERT INTO task_recurrence_rules
         (workspace_id, entity_id, date_kind, frequency, interval, weekdays,
          anchor_day, anchor_month, series_id, sequence, mode, created_at, updated_at)
       VALUES (${ws}, ${id}, 'scheduled', ${lit(options.repeat.frequency)}, 1, NULL,
               ${options.repeat.anchorDay ?? "NULL"}, NULL,
               ${lit(options.repeat.seriesId)}, 0, 'fixed', ${at}, ${at});`,
    );
  }
  (options.items ?? []).forEach((item, index) => {
    statements.push(
      `INSERT INTO task_checklist_items
         (id, workspace_id, task_id, task_type, title, position, completed, created_at, updated_at)
       VALUES (${lit(`${options.id}-i${index}`)}, ${ws}, ${id}, 'task',
               ${lit(item.title)}, ${index}, ${item.completed ? 1 : 0}, ${at}, ${at});`,
    );
  });
  d1Execute(statements.join(" "));
}

/** Remove one seeded Task and everything that hangs off it, dependents first. */
export function removeChecklistTask(id: string): void {
  const ws = lit(WORKSPACE_ID);
  const value = lit(id);
  d1Execute(
    [
      `DELETE FROM task_checklist_items WHERE workspace_id = ${ws} AND task_id = ${value};`,
      `DELETE FROM task_recurrence_rules WHERE workspace_id = ${ws} AND entity_id = ${value};`,
      `DELETE FROM task_details WHERE workspace_id = ${ws} AND entity_id = ${value};`,
      `DELETE FROM spine_records WHERE workspace_id = ${ws} AND entity_id = ${value};`,
      `DELETE FROM entity_links WHERE workspace_id = ${ws} AND (source_entity_id = ${value} OR target_entity_id = ${value});`,
      `DELETE FROM activity_subjects WHERE workspace_id = ${ws} AND entity_id = ${value};`,
      `DELETE FROM entities WHERE workspace_id = ${ws} AND id = ${value};`,
    ].join(" "),
  );
}

/**
 * Remove every Task this suite seeded, AND every successor a recurrence created
 * from one.
 *
 * A successor is a real Task with a generated id, so it cannot be found by the
 * prefix. It is found by its SERIES instead — the same series the fixture named
 * — which is exactly the relationship that makes it a successor.
 */
export function cleanupAllChecklistTasks(): void {
  const ws = lit(WORKSPACE_ID);
  const prefix = lit(`${CHECKLIST_ID_PREFIX}%`);
  /*
   * The id list is RESOLVED FIRST, before anything is deleted.
   *
   * A successor is found through the recurrence rule that links it to the series
   * the fixture named — and that rule is one of the rows the cleanup removes. A
   * subquery evaluated statement by statement would therefore stop finding
   * successors halfway through its own sweep.
   */
  const owned = d1Query<{ readonly id: string }>(
    `SELECT e.id AS id FROM entities e
      WHERE e.workspace_id = ${ws} AND e.type = 'task'
        AND (
          e.id LIKE ${prefix}
          OR e.id IN (
            SELECT r.entity_id FROM task_recurrence_rules r
            WHERE r.workspace_id = ${ws}
              AND r.series_id IN (
                SELECT r2.series_id FROM task_recurrence_rules r2
                WHERE r2.workspace_id = ${ws} AND r2.entity_id LIKE ${prefix}
              )
          )
        )`,
  ).map((row) => row.id);
  for (const id of owned) removeChecklistTask(id);
}
