/**
 * TASKS-12 — shared E2E fixtures for the advanced-recurrence and dependency
 * journeys.
 *
 * The specs drive REAL Task records, REAL recurrence rules and REAL `task.blocks`
 * EntityLinks in the seeded Worker/D1 app, and must tear every one of them down
 * deterministically. Mirrors `checklist-fixtures.ts`: one ordered, retriable
 * cleanup through the shared `d1Execute`, scoped strictly to test-owned ids so it
 * can never touch a developer's own local data.
 *
 * Rows are removed dependents-first, because every foreign key here is
 * ON DELETE RESTRICT: dependency links and checklist items, then recurrence
 * rules, then details, then the spine record, then activity subjects, then the
 * entity.
 */

import { futureInstant } from "./calendar-dates";
import { d1Execute, d1Query, sqlLiteral } from "./d1";

export const WORKSPACE_ID = "local-dev-workspace";

/** Every seeded id starts with this, so one sweep can find them all. */
export const DEPENDENCY_ID_PREFIX = "e2e-dep-";

/**
 * A creation instant far ahead of every other seeded fixture, so a Tasks list
 * sorted newest-first puts these rows at the top of a collection that already
 * holds ninety-odd others. Deterministic placement rather than luck — and
 * derived from the run, because a fixed "far ahead" instant is ahead only
 * until the calendar reaches it (CONV-00-E).
 */
const SEEDED_AT = futureInstant(366);

/** The advanced recurrence shape a fixture may attach. */
export interface SeedRecurrence {
  readonly frequency: "day" | "week" | "month" | "year";
  readonly seriesId: string;
  readonly interval?: number;
  /** 0 = Sunday. A weekly rule's selected days, or an ordinal rule's one day. */
  readonly weekdays?: readonly number[];
  /** The day of the month an ordinary MONTHLY rule repeats on (schema CHECK). */
  readonly anchorDay?: number;
  readonly anchorMonth?: number;
  readonly ordinal?: "first" | "second" | "third" | "fourth" | "last";
  readonly weekendRule?: "allow" | "before" | "after" | "skip";
  readonly endsAfterCount?: number;
  readonly endsOnDate?: string;
  /** The occurrence's position in its series. Defaults to 0. */
  readonly sequence?: number;
}

export interface SeedTaskOptions {
  readonly id: string;
  readonly title: string;
  /** A `YYYY-MM-DD` planned date, so the Task appears on Today and in /plan. */
  readonly scheduledDate?: string;
  readonly completed?: boolean;
  readonly repeat?: SeedRecurrence;
}

function lit(value: string): string {
  return sqlLiteral(value);
}

/**
 * Seed one Task, optionally with an advanced recurrence rule.
 *
 * Removes first rather than using `INSERT OR REPLACE`: REPLACE on `entities` is
 * a delete-then-insert, and a leftover child row from a previous run holds a
 * RESTRICT foreign key that makes the delete fail. Removing the children
 * explicitly, in order, is the only sequence that is idempotent across runs.
 */
export function seedDependencyTask(options: SeedTaskOptions): void {
  removeDependencyTask(options.id);
  const ws = lit(WORKSPACE_ID);
  const id = lit(options.id);
  const at = lit(SEEDED_AT);
  const statements = [
    `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
       VALUES (${id}, ${ws}, 'task', ${lit(options.title)}, ${at}, ${at}, NULL);`,
    `INSERT INTO spine_records (workspace_id, entity_id, kind, completed_at)
       VALUES (${ws}, ${id}, 'task', ${
         options.completed ? lit(SEEDED_AT) : "NULL"
       });`,
    `INSERT INTO task_details (workspace_id, entity_id, status, priority, due_date, scheduled_date, updated_at)
       VALUES (${ws}, ${id}, 'todo', NULL, NULL, ${
         options.scheduledDate ? lit(options.scheduledDate) : "NULL"
       }, ${at});`,
  ];
  const repeat = options.repeat;
  if (repeat) {
    statements.push(
      `INSERT INTO task_recurrence_rules
         (workspace_id, entity_id, date_kind, frequency, interval, weekdays,
          anchor_day, anchor_month, series_id, sequence, mode, series_anchor_date,
          ordinal, weekend_rule, ends_after_count, ends_on_date,
          created_at, updated_at)
       VALUES (${ws}, ${id}, 'scheduled', ${lit(repeat.frequency)},
               ${repeat.interval ?? 1},
               ${
                 repeat.weekdays && repeat.weekdays.length > 0
                   ? lit(repeat.weekdays.join(","))
                   : "NULL"
               },
               ${repeat.anchorDay ?? "NULL"}, ${repeat.anchorMonth ?? "NULL"},
               ${lit(repeat.seriesId)}, ${repeat.sequence ?? 0}, 'fixed', NULL,
               ${repeat.ordinal ? lit(repeat.ordinal) : "NULL"},
               ${lit(repeat.weekendRule ?? "allow")},
               ${repeat.endsAfterCount ?? "NULL"},
               ${repeat.endsOnDate ? lit(repeat.endsOnDate) : "NULL"},
               ${at}, ${at});`,
    );
  }
  d1Execute(statements.join(" "));
}

/**
 * Seed one dependency: `blockerId` must be complete before `blockedId` can
 * proceed.
 *
 * The row is written in the CANONICAL direction (source = blocker), which is the
 * one and only way the product stores it — a fixture that wrote it the other way
 * round would be testing a state the product cannot produce.
 */
export function seedDependency(blockedId: string, blockerId: string): void {
  const ws = lit(WORKSPACE_ID);
  const at = lit(SEEDED_AT);
  const linkId = lit(`${DEPENDENCY_ID_PREFIX}link-${blockerId}-${blockedId}`);
  d1Execute(
    [
      `DELETE FROM entity_links WHERE workspace_id = ${ws} AND id = ${linkId};`,
      `INSERT INTO entity_links
         (id, workspace_id, source_entity_id, target_entity_id, type,
          created_at, updated_at, deleted_at)
       VALUES (${linkId}, ${ws}, ${lit(blockerId)}, ${lit(blockedId)},
               'task.blocks', ${at}, ${at}, NULL);`,
    ].join(" "),
  );
}

/** The ACTIVE blockers of one Task, straight from the database. */
export function storedBlockers(taskId: string): readonly string[] {
  return d1Query<{ readonly source_entity_id: string }>(
    `SELECT source_entity_id FROM entity_links
      WHERE workspace_id = ${lit(WORKSPACE_ID)}
        AND target_entity_id = ${lit(taskId)}
        AND type = 'task.blocks' AND deleted_at IS NULL
      ORDER BY source_entity_id`,
  ).map((row) => row.source_entity_id);
}

/** The occurrence at one position of a seeded series, or null. */
export function occurrenceAt(
  seriesId: string,
  sequence: number,
): { readonly id: string; readonly scheduledDate: string | null } | null {
  const rows = d1Query<{
    readonly entity_id: string;
    readonly scheduled_date: string | null;
  }>(
    `SELECT r.entity_id AS entity_id, d.scheduled_date AS scheduled_date
       FROM task_recurrence_rules r
       LEFT JOIN task_details d
         ON d.workspace_id = r.workspace_id AND d.entity_id = r.entity_id
      WHERE r.workspace_id = ${lit(WORKSPACE_ID)}
        AND r.series_id = ${lit(seriesId)} AND r.sequence = ${sequence}`,
  );
  const row = rows[0];
  return row ? { id: row.entity_id, scheduledDate: row.scheduled_date } : null;
}

/** Remove one seeded Task and everything that hangs off it, dependents first. */
export function removeDependencyTask(id: string): void {
  const ws = lit(WORKSPACE_ID);
  const value = lit(id);
  d1Execute(
    [
      `DELETE FROM entity_links WHERE workspace_id = ${ws} AND (source_entity_id = ${value} OR target_entity_id = ${value});`,
      `DELETE FROM task_checklist_items WHERE workspace_id = ${ws} AND task_id = ${value};`,
      `DELETE FROM task_recurrence_rules WHERE workspace_id = ${ws} AND entity_id = ${value};`,
      `DELETE FROM task_details WHERE workspace_id = ${ws} AND entity_id = ${value};`,
      `DELETE FROM spine_records WHERE workspace_id = ${ws} AND entity_id = ${value};`,
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
 * — which is exactly the relationship that makes it a successor. The id list is
 * RESOLVED FIRST, before anything is deleted, because the rule that identifies a
 * successor is itself one of the rows the sweep removes.
 */
export function cleanupAllDependencyTasks(): void {
  const ws = lit(WORKSPACE_ID);
  const prefix = lit(`${DEPENDENCY_ID_PREFIX}%`);
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
  for (const id of owned) removeDependencyTask(id);
}
