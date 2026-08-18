/**
 * HABITS-01 — the ONE bounded Habit read, shared by every surface that shows one.
 *
 * Today, `/habits`, the Habit record, a Goal's supporting section and an Area's
 * all come through here, so there is exactly one query shape, one set of bounds
 * and one projection. A surface that read Habits its own way would eventually
 * disagree with another about the same week.
 *
 * ── The query budget, stated so it can be checked ───────────────────────────
 * Every function below is a FIXED number of statements whatever it returns:
 *
 *   readHabitPage        2  — the Habit page (with its Goal/Area joins), then
 *                             EVERY completion for the whole page's week, in one
 *                             statement. Never one read per Habit.
 *   readHabitRecord      2  — the Habit, then its four-week completion window.
 *   readSupportingHabits 3  — the linked Habits for a bounded set of anchors,
 *                             their schedule chains, and one completion window.
 *
 * `test/unit/habits/habit-query-bounds.test.ts` asserts the budget, following
 * PLAN-01's precedent.
 */

import {
  HABIT_RECENT_WINDOW_DAYS,
  evaluateHabitWeek,
  habitScheduleShortLabel,
  habitWeek,
  type Habit,
  type HabitCalendarContext,
} from "~/kernel/habits";
import { addPlanningDays } from "~/kernel/planning";
import type { WorkspaceScope } from "~/platform/workspaces";
import {
  serializeHabit,
  serializeHabitRecord,
  type SerializedHabit,
  type SerializedHabitRecord,
} from "~/shared/habits/habit-view";

/** One page of Habits, already serialised for the surface that asked. */
export interface HabitPageResult {
  readonly items: readonly SerializedHabit[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

/** Group a flat completion list into "which dates does each Habit hold?". */
function completionsByHabit(
  rows: readonly { readonly habitId: string; readonly completedOn: string }[],
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const row of rows) {
    const bucket = map.get(row.habitId) ?? new Set<string>();
    bucket.add(row.completedOn);
    map.set(row.habitId, bucket);
  }
  return map;
}

/**
 * A bounded page of Habits with this week's reading for each.
 *
 * TWO statements: the page, then every completion inside the owner's calendar
 * week for the whole page's ids. The second is the one that would have been an
 * N+1 in a naive implementation, and it is a single range read precisely because
 * the completion table's index is `(workspace, completed_on, habit)`.
 */
export async function readHabitPage(
  scope: WorkspaceScope,
  calendar: HabitCalendarContext,
  input: {
    readonly status?: "active" | "archived" | "all";
    readonly query?: string;
    readonly limit?: number;
    readonly cursor?: string;
  } = {},
): Promise<HabitPageResult> {
  const page = await scope.habits.list({
    status: input.status ?? "active",
    query: input.query,
    limit: input.limit,
    cursor: input.cursor,
  });
  const week = habitWeek(calendar.todayIso, calendar.firstDayOfWeek);
  const completions =
    page.items.length === 0
      ? []
      : await scope.habits.listCompletionsInRange({
          habitIds: page.items.map((habit) => habit.id),
          fromIso: week.startIso,
          toIso: week.endIso,
        });
  const byHabit = completionsByHabit(completions);
  return {
    items: page.items.map((habit) =>
      serializeHabit(habit, byHabit.get(habit.id) ?? new Set(), calendar),
    ),
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  };
}

/**
 * ONE Habit with its four-week history window.
 *
 * The window is deliberately bounded and deliberately SHORT: four weeks is long
 * enough to see a pattern and short enough that the strip fits a 320px phone
 * without becoming a contribution graph. It starts at the beginning of an owner
 * calendar week so the strip's columns line up under weekday headings.
 */
export async function readHabitRecord(
  scope: WorkspaceScope,
  habitId: string,
  calendar: HabitCalendarContext,
): Promise<SerializedHabitRecord | null> {
  const habit = await scope.habits.get(habitId);
  if (habit === null) return null;
  const windowFromIso = habitWindowStart(calendar);
  const completions = await scope.habits.listCompletionsInRange({
    habitIds: [habit.id],
    fromIso: windowFromIso,
    toIso: calendar.todayIso,
  });
  return serializeHabitRecord(
    habit,
    new Set(completions.map((row) => row.completedOn)),
    calendar,
    windowFromIso,
  );
}

/** The first day of the record's history window: four whole owner weeks back. */
export function habitWindowStart(calendar: HabitCalendarContext): string {
  const thisWeek = habitWeek(calendar.todayIso, calendar.firstDayOfWeek);
  return addPlanningDays(thisWeek.startIso, -(HABIT_RECENT_WINDOW_DAYS - 7));
}

/**
 * The active Habits attached to a bounded set of Goals (or Areas), with this
 * week's reading for each.
 *
 * A Goal gallery or an Area record asks for its whole page's anchors at once, so
 * this never becomes a query per card. The Habits it returns are SUPPORTING
 * evidence: a Goal's mathematical progress is untouched by them, and nothing
 * here feeds a percentage.
 */
export async function readSupportingHabits(
  scope: WorkspaceScope,
  calendar: HabitCalendarContext,
  input: {
    readonly anchorIds: readonly string[];
    readonly relation: "goal" | "area";
    readonly limitPerAnchor?: number;
  },
): Promise<ReadonlyMap<string, readonly SerializedHabit[]>> {
  const result = new Map<string, readonly SerializedHabit[]>();
  if (input.anchorIds.length === 0) return result;
  const grouped = await scope.habits.listSupportingHabits(input);
  const all: Habit[] = [];
  for (const habits of grouped.values()) all.push(...habits);
  if (all.length === 0) return result;

  const week = habitWeek(calendar.todayIso, calendar.firstDayOfWeek);
  const completions = await scope.habits.listCompletionsInRange({
    habitIds: all.map((habit) => habit.id),
    fromIso: week.startIso,
    toIso: week.endIso,
  });
  const byHabit = completionsByHabit(completions);
  for (const [anchorId, habits] of grouped) {
    result.set(
      anchorId,
      habits.map((habit) =>
        serializeHabit(habit, byHabit.get(habit.id) ?? new Set(), calendar),
      ),
    );
  }
  return result;
}

/* -------------------------------------------------------------------------- */
/* The planning summary                                                       */
/* -------------------------------------------------------------------------- */

/** One routine, as Weekly Planning prints it. Read-only, and never a Task. */
export interface HabitWeekSummaryItem {
  readonly id: string;
  readonly title: string;
  /** "3x weekly", "Weekdays" — what the week asks for. */
  readonly scheduleLabel: string;
  /**
   * "2 of 3 this week", or `null`.
   *
   * Present ONLY when the shown week is the one the owner is actually in. A
   * future week has nothing to report — printing "0 of 3" against days that have
   * not happened would describe a future day as incomplete, which is exactly the
   * manufactured urgency this product refuses.
   */
  readonly progressLabel: string | null;
}

/**
 * HABITS-01 — the routine CONTEXT Weekly Planning shows beside the week.
 *
 * Deliberately narrow, and deliberately read-only. Planning owns TASK placement
 * (PLAN-01, ADR-101); a Habit is not a Task, cannot be placed on a day and must
 * never appear in the "Still to place" queue or consume its bulk selection. What
 * a planner genuinely needs to know is what the week ALREADY asks of them before
 * they commit more work to it — so this is a list of names and cadences, with no
 * control on it at all.
 *
 * TWO bounded statements, the same pair every other Habit read makes.
 */
export async function readHabitWeekSummary(
  scope: WorkspaceScope,
  calendar: HabitCalendarContext,
  input: {
    readonly weekStartIso: string;
    readonly weekEndIso: string;
    readonly limit?: number;
  },
): Promise<readonly HabitWeekSummaryItem[]> {
  const page = await scope.habits.list({
    status: "active",
    limit: input.limit ?? 12,
  });
  if (page.items.length === 0) return [];
  const completions = await scope.habits.listCompletionsInRange({
    habitIds: page.items.map((habit) => habit.id),
    fromIso: input.weekStartIso,
    toIso: input.weekEndIso,
  });
  const byHabit = completionsByHabit(completions);
  // The shown week is the CURRENT one exactly when it contains the owner's today.
  const isCurrentWeek =
    calendar.todayIso >= input.weekStartIso &&
    calendar.todayIso <= input.weekEndIso;

  return (
    page.items
      .map((habit) => {
        const reading = evaluateHabitWeek(
          {
            versions: habit.versions,
            completedDates: byHabit.get(habit.id) ?? new Set(),
            archivedOnIso: habit.archivedOn,
          },
          calendar,
          input.weekStartIso,
        );
        return {
          id: habit.id,
          title: habit.title,
          scheduleLabel: habitScheduleShortLabel(
            habit.schedule,
            calendar.firstDayOfWeek,
          ),
          progressLabel:
            isCurrentWeek && reading.expected > 0
              ? reading.met
                ? "done"
                : `${reading.completed} of ${reading.expected}`
              : null,
          expected: reading.expected,
        };
      })
      // A Habit the week asks nothing of is not part of the week's picture.
      .filter((item) => item.expected > 0)
      .map(({ expected: _expected, ...item }) => item)
  );
}
