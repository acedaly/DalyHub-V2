/**
 * HABITS-01 — the evidence fixture.
 *
 * A small, realistic set of Habits with real history, written directly to the
 * local D1 so the capture pass photographs a populated surface rather than an
 * empty state. Everything it writes is its own (ids prefixed `h-ev-`), and every
 * date is RELATIVE to the owner's calendar day at run time — a habit surface's
 * whole subject is "this week", so a fixed date would be a screenshot that
 * looked wrong the following Monday.
 *
 * It attaches the Habits to the permanent seeded Area (`a-dh`) and Goal
 * (`g-launch`) so the Goal record's supporting section has something to show.
 */

import { d1Execute, sqlLiteral } from "./d1";
import { OWNER_TIMEZONE } from "./helpers";

const WORKSPACE = "local-dev-workspace";
const AREA = "a-dh";
const GOAL = "g-launch";
const STAMP = "2026-07-19T02:00:00.000Z";

/** The owner's calendar day — the only "today" the product has (ADR-022). */
export function evidenceToday(): string {
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

/** The MONDAY of the owner's current calendar week (`firstDayOfWeek` default). */
export function weekStart(todayIso: string): string {
  const day = Math.round(Date.parse(`${todayIso}T00:00:00Z`) / 86_400_000);
  return addDays(todayIso, -((((day + 3) % 7) + 7) % 7));
}

interface EvidenceHabit {
  readonly id: string;
  readonly title: string;
  readonly notes: string | null;
  readonly kind: "daily" | "weekdays" | "weekly_count";
  readonly weekdays: string | null;
  readonly targetCount: number | null;
  readonly goal: boolean;
  /** Day offsets from the start of the CURRENT week that carry a check-in. */
  readonly done: readonly number[];
  /** Day offsets from the start of the PREVIOUS three weeks that carry one. */
  readonly history: readonly number[];
}

export function evidenceHabits(): readonly EvidenceHabit[] {
  return [
    {
      id: "h-ev-strength",
      title: "Strength training",
      notes: "Three sessions, any days. Legs at least once.",
      kind: "weekly_count",
      weekdays: null,
      targetCount: 3,
      goal: true,
      done: [0, 2],
      history: [-21, -19, -17, -14, -12, -7, -5, -3],
    },
    {
      id: "h-ev-read",
      title: "Read",
      notes: "Twenty pages before anything else.",
      kind: "daily",
      weekdays: null,
      targetCount: null,
      goal: false,
      done: [0, 1, 2, 3],
      history: [-1, -2, -3, -4, -6, -8, -9, -10, -12, -15, -16, -18],
    },
    {
      id: "h-ev-medication",
      title: "Take medication",
      notes: null,
      kind: "daily",
      weekdays: null,
      targetCount: null,
      goal: false,
      done: [0, 1, 2, 3, 4],
      history: [-1, -2, -3, -4, -5, -6, -7, -8, -9, -10, -11],
    },
    {
      id: "h-ev-walk",
      title: "Long walk",
      notes: null,
      kind: "weekdays",
      weekdays: "0,6",
      targetCount: null,
      goal: false,
      done: [],
      history: [-8, -15],
    },
  ];
}

/** Write the fixture. Idempotent: every insert is `INSERT OR IGNORE`. */
export function seedHabitEvidence(): void {
  const today = evidenceToday();
  const start = weekStart(today);
  // The schedule chain starts four weeks back, so the record's history window is
  // fully inside a period the habit actually existed for.
  const effectiveFrom = addDays(start, -28);
  const statements: string[] = [];

  for (const habit of evidenceHabits()) {
    statements.push(
      `INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
       VALUES (${sqlLiteral(habit.id)}, ${sqlLiteral(WORKSPACE)}, 'habit', ${sqlLiteral(habit.title)}, ${sqlLiteral(STAMP)}, ${sqlLiteral(STAMP)}, NULL);`,
      `INSERT OR IGNORE INTO habit_details (workspace_id, entity_id, entity_type, notes, archived_at, archived_on, created_at, updated_at)
       VALUES (${sqlLiteral(WORKSPACE)}, ${sqlLiteral(habit.id)}, 'habit', ${habit.notes === null ? "NULL" : sqlLiteral(habit.notes)}, NULL, NULL, ${sqlLiteral(STAMP)}, ${sqlLiteral(STAMP)});`,
      `INSERT OR IGNORE INTO habit_schedules (id, workspace_id, habit_id, kind, weekdays, target_count, effective_from, effective_to, created_at)
       VALUES (${sqlLiteral(`s-${habit.id}`)}, ${sqlLiteral(WORKSPACE)}, ${sqlLiteral(habit.id)}, ${sqlLiteral(habit.kind)}, ${habit.weekdays === null ? "NULL" : sqlLiteral(habit.weekdays)}, ${habit.targetCount ?? "NULL"}, ${sqlLiteral(effectiveFrom)}, NULL, ${sqlLiteral(STAMP)});`,
      `INSERT OR IGNORE INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
       VALUES (${sqlLiteral(`l-${habit.id}-area`)}, ${sqlLiteral(WORKSPACE)}, ${sqlLiteral(habit.id)}, ${sqlLiteral(AREA)}, 'habit.belongs_to_area', ${sqlLiteral(STAMP)}, ${sqlLiteral(STAMP)}, NULL);`,
    );
    if (habit.goal) {
      statements.push(
        `INSERT OR IGNORE INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
         VALUES (${sqlLiteral(`l-${habit.id}-goal`)}, ${sqlLiteral(WORKSPACE)}, ${sqlLiteral(habit.id)}, ${sqlLiteral(GOAL)}, 'habit.supports_goal', ${sqlLiteral(STAMP)}, ${sqlLiteral(STAMP)}, NULL);`,
      );
    }
    for (const offset of [...habit.done, ...habit.history]) {
      const date = addDays(start, offset);
      // Never a future date: the domain refuses one, and a fixture that wrote
      // one would be photographing a state the product cannot reach.
      if (date > today) continue;
      statements.push(
        `INSERT OR IGNORE INTO habit_completions (workspace_id, habit_id, completed_on, recorded_at)
         VALUES (${sqlLiteral(WORKSPACE)}, ${sqlLiteral(habit.id)}, ${sqlLiteral(date)}, ${sqlLiteral(`${date}T08:00:00.000Z`)});`,
      );
    }
  }
  d1Execute(statements);
}

/** Remove the fixture, dependents first (every foreign key is RESTRICT). */
export function clearHabitEvidence(): void {
  const ws = sqlLiteral(WORKSPACE);
  const ids = evidenceHabits()
    .map((habit) => sqlLiteral(habit.id))
    .join(", ");
  d1Execute([
    `DELETE FROM habit_completions WHERE workspace_id = ${ws} AND habit_id IN (${ids});`,
    `DELETE FROM habit_schedules WHERE workspace_id = ${ws} AND habit_id IN (${ids});`,
    `DELETE FROM entity_links WHERE workspace_id = ${ws} AND source_entity_id IN (${ids});`,
    `DELETE FROM habit_details WHERE workspace_id = ${ws} AND entity_id IN (${ids});`,
    `DELETE FROM entities WHERE workspace_id = ${ws} AND id IN (${ids});`,
  ]);
}
