/**
 * PLAN-01 — the Weekly Planning fixture.
 *
 * The committed `seed-tasks.sql` is deliberately date-STABLE: every date in it is
 * either far future (`2099-12-31`) or far past (`2000-01-01`), because a fixture
 * with a near date is a test that fails on one specific day. A planning week is
 * the one surface that cannot be tested that way — its whole subject is "the seven
 * days around today" — so this fixture writes dates RELATIVE to the owner's
 * calendar day, at run time, and removes them again afterwards.
 *
 * Everything it writes is its own: ids are prefixed `t-plan-`, so no journey that
 * borrows a shared seed task can be disturbed by it and it can be deleted without
 * ordering against anything else.
 */

import { d1Execute, sqlLiteral } from "./d1";
import { OWNER_TIMEZONE } from "./helpers";

const WORKSPACE = "local-dev-workspace";

/** The owner's calendar day — the only "today" the product has (ADR-022). */
export function ownerTodayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: OWNER_TIMEZONE,
  }).format(new Date());
}

/** Add whole days to a wall-calendar date, in UTC component arithmetic only. */
export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/**
 * The MONDAY of the owner's current calendar week.
 *
 * `firstDayOfWeek` defaults to `monday` (`DEFAULT_APP_PREFERENCES`), and the
 * fixture does not change the preference — so this mirrors what the product will
 * compute, without importing app code into the E2E project.
 */
export function ownerWeekStart(todayIso: string): string {
  const day = Math.round(Date.parse(`${todayIso}T00:00:00Z`) / 86_400_000);
  const offsetFromMonday = (((day + 3) % 7) + 7) % 7;
  return addDays(todayIso, -offsetFromMonday);
}

/** One fixture Task, as the fields the planning surface reads. */
export interface PlanFixtureTask {
  readonly id: string;
  readonly title: string;
  readonly scheduledDate: string | null;
  readonly dueDate: string | null;
  readonly priority: "p1" | "p2" | "p3" | "p4" | null;
  /** A free-text waiting note, which makes the Task blocked. */
  readonly waitingNote?: string;
  /**
   * True for a Task that REPEATS.
   *
   * The committed seed has no recurring Task, so SMART-01's repeats filter had
   * nothing to find and its journey could not distinguish "the filter works and
   * matched nothing" from "the filter is broken". One is enough, and it is written
   * as a real `task_recurrence_rules` row so the filter reads the same join the
   * product reads.
   */
  readonly repeats?: boolean;
}

export interface PlanFixture {
  readonly todayIso: string;
  readonly weekStart: string;
  readonly nextWeekStart: string;
  readonly tasks: readonly PlanFixtureTask[];
  /** Look one fixture Task up by its id suffix. */
  readonly task: (suffix: string) => PlanFixtureTask;
}

/**
 * Build the fixture's dataset from the owner's today. Pure — writing it is
 * {@link seedPlanFixture}, so a test can reason about the dates it expects
 * without touching the database.
 */
export function planFixture(): PlanFixture {
  const todayIso = ownerTodayIso();
  const weekStart = ownerWeekStart(todayIso);
  const nextWeekStart = addDays(weekStart, 7);
  const tasks: readonly PlanFixtureTask[] = [
    // Planned INSIDE this week, on its first two days, one of them with a due
    // date FAR LATER — the pair that proves planned and due stay distinct.
    {
      id: "t-plan-mon",
      title: "Plan fixture — Monday commitment",
      scheduledDate: weekStart,
      dueDate: addDays(weekStart, 40),
      priority: "p2",
    },
    {
      id: "t-plan-tue",
      title: "Plan fixture — Tuesday commitment",
      scheduledDate: addDays(weekStart, 1),
      dueDate: null,
      priority: "p3",
    },
    // Planned inside this week AND blocked, so the week shows waiting work as
    // waiting rather than hiding it.
    {
      id: "t-plan-waiting",
      title: "Plan fixture — blocked commitment",
      scheduledDate: addDays(weekStart, 2),
      dueDate: null,
      priority: "p3",
      waitingNote: "the supplier",
    },
    // Planned inside NEXT week, so week navigation is provably a different set.
    {
      id: "t-plan-next",
      title: "Plan fixture — next week commitment",
      scheduledDate: nextWeekStart,
      dueDate: null,
      priority: "p3",
    },
    /*
     * Unplanned, HIGH priority and OVERDUE.
     *
     * Overdue on purpose, and the reason is worth stating: the committed E2E
     * workspace is deliberately heavy (hundreds of Tasks), and the planning queue
     * is BOUNDED — so a fixture Task in a late band is genuinely, correctly,
     * beyond the bound. Putting this one in the first band (`overdue`, ordered by
     * due date ascending) is what makes it reliably visible without weakening
     * either the bound or the assertion. The band rule itself is proven
     * exhaustively and cheaply in `test/unit/plan/planning-queue.test.ts`.
     */
    {
      id: "t-plan-unplaced",
      title: "Plan fixture — unplaced priority work",
      scheduledDate: null,
      dueDate: "2000-01-02",
      priority: "p1",
    },
    // Unplanned with a due date INSIDE this week — the `due_this_week` band.
    {
      id: "t-plan-due",
      title: "Plan fixture — due this week, no day",
      scheduledDate: null,
      dueDate: addDays(weekStart, 4),
      priority: "p3",
    },
    /*
     * TWO repeating Tasks — one PLACED in the week, one not.
     *
     * The committed seed has no recurring Task at all, so SMART-01's repeats
     * filter had nothing to find. Two rather than one, and the pair is deliberate:
     * a saved view of `repeats=1` then returns both in Tasks and exactly ONE in
     * the planning queue, which is what makes the programme's central claim
     * falsifiable — the same query ran, and the only difference is the one rule
     * Planning documents (work already placed in the week is placed).
     */
    {
      id: "t-plan-routine",
      title: "Plan fixture — weekly routine",
      scheduledDate: addDays(weekStart, 3),
      dueDate: null,
      priority: "p3",
      repeats: true,
    },
    {
      id: "t-plan-routine-unplaced",
      title: "Plan fixture — routine with no day",
      scheduledDate: null,
      dueDate: "2000-01-03",
      priority: "p3",
      repeats: true,
    },
  ];
  return {
    todayIso,
    weekStart,
    nextWeekStart,
    tasks,
    task: (suffix) => {
      const found = tasks.find((task) => task.id === `t-plan-${suffix}`);
      if (found === undefined) {
        throw new Error(`No plan fixture task named ${suffix}`);
      }
      return found;
    },
  };
}

/**
 * Write the fixture. Idempotent: every row is an `INSERT OR IGNORE` followed by an
 * `UPDATE` to the exact intended values, so a re-run repairs a Task a previous
 * journey mutated rather than leaving it in whatever state it was left in.
 */
export function seedPlanFixture(fixture: PlanFixture): void {
  const statements: string[] = [];
  for (const [index, task] of fixture.tasks.entries()) {
    const stamp = `2026-07-19T02:00:0${index}.000Z`;
    statements.push(
      `INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
       VALUES (${sqlLiteral(task.id)}, ${sqlLiteral(WORKSPACE)}, 'task', ${sqlLiteral(task.title)}, ${sqlLiteral(stamp)}, ${sqlLiteral(stamp)}, NULL);`,
      `INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
       VALUES (${sqlLiteral(WORKSPACE)}, ${sqlLiteral(task.id)}, 'task', NULL);`,
      // Every fixture Task belongs to the seeded DalyHub Area, so none of them
      // lands in the Inbox band and the queue's bands stay predictable.
      `INSERT OR IGNORE INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
       VALUES (${sqlLiteral(`l-${task.id}-area`)}, ${sqlLiteral(WORKSPACE)}, ${sqlLiteral(task.id)}, 'a-dh', 'task.belongs_to_area', ${sqlLiteral(stamp)}, ${sqlLiteral(stamp)}, NULL);`,
      `INSERT OR IGNORE INTO task_details (workspace_id, entity_id, entity_type, status, updated_at)
       VALUES (${sqlLiteral(WORKSPACE)}, ${sqlLiteral(task.id)}, 'task', 'todo', ${sqlLiteral(stamp)});`,
      `UPDATE spine_records SET completed_at = NULL
        WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND entity_id = ${sqlLiteral(task.id)};`,
      `UPDATE entities SET deleted_at = NULL, title = ${sqlLiteral(task.title)}
        WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND id = ${sqlLiteral(task.id)};`,
      ...(task.repeats === true
        ? [
            `INSERT OR IGNORE INTO task_recurrence_rules
               (workspace_id, entity_id, entity_type, date_kind, frequency,
                interval, series_id, sequence, created_at, updated_at)
             VALUES (${sqlLiteral(WORKSPACE)}, ${sqlLiteral(task.id)}, 'task',
                     'scheduled', 'week', 1, ${sqlLiteral(`s-${task.id}`)}, 0,
                     ${sqlLiteral(stamp)}, ${sqlLiteral(stamp)});`,
          ]
        : []),
      `UPDATE task_details SET status = 'todo',
          priority = ${task.priority === null ? "NULL" : sqlLiteral(task.priority)},
          due_date = ${task.dueDate === null ? "NULL" : sqlLiteral(task.dueDate)},
          scheduled_date = ${task.scheduledDate === null ? "NULL" : sqlLiteral(task.scheduledDate)},
          time_sector = NULL,
          commitment_state = 'active',
          waiting_since = ${task.waitingNote === undefined ? "NULL" : sqlLiteral(`${fixture.todayIso}T00:00:00.000Z`)},
          waiting_note = ${task.waitingNote === undefined ? "NULL" : sqlLiteral(task.waitingNote)},
          updated_at = ${sqlLiteral(stamp)}
        WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND entity_id = ${sqlLiteral(task.id)};`,
    );
  }
  d1Execute(statements);
}

/** Remove every fixture row, children first. */
export function clearPlanFixture(fixture: PlanFixture): void {
  const ids = fixture.tasks.map((task) => sqlLiteral(task.id)).join(", ");
  d1Execute([
    // Activity first, and the association before the event, because both foreign
    // keys are ON DELETE RESTRICT: history cannot be orphaned, so it has to be
    // unwound from the leaf inwards (the same order `notes-fixtures.ts` uses).
    `DELETE FROM activity_subjects WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND entity_id IN (${ids});`,
    `DELETE FROM activities WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND NOT EXISTS (SELECT 1 FROM activity_subjects s WHERE s.workspace_id = activities.workspace_id AND s.activity_id = activities.id);`,
    `DELETE FROM entity_links WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND source_entity_id IN (${ids});`,
    `DELETE FROM task_recurrence_rules WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND entity_id IN (${ids});`,
    `DELETE FROM task_details WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND entity_id IN (${ids});`,
    `DELETE FROM spine_records WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND entity_id IN (${ids});`,
    `DELETE FROM entities WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND id IN (${ids});`,
  ]);
}

/** Remove every saved Tasks view a SMART-01 journey created. */
export function clearPlanSavedViews(namePrefix: string): void {
  d1Execute([
    `DELETE FROM task_saved_views
      WHERE workspace_id = ${sqlLiteral(WORKSPACE)}
        AND name LIKE ${sqlLiteral(`${namePrefix}%`)};`,
  ]);
}
