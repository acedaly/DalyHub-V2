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
 *   readHabitOverview    2  — every active Habit up to a stated bound, then ONE
 *                             four-week completion window for all of them.
 *
 * `test/unit/habits/habit-query-bounds.test.ts` asserts the budget, following
 * PLAN-01's precedent.
 */

import {
  HABIT_RECENT_WINDOW_DAYS,
  MAX_HABIT_CONSISTENCY_WEEKS,
  evaluateHabitConsistency,
  evaluateHabitWeek,
  habitScheduleShortLabel,
  habitWeek,
  type Habit,
  type HabitCalendarContext,
  type HabitPeriodConsistency,
} from "~/kernel/habits";
import { addPlanningDays } from "~/kernel/planning";
import type { WorkspaceScope } from "~/platform/workspaces";
import {
  habitConsistencyPercent,
  habitDueToday,
  habitFactsFor,
  habitOpenToday,
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
    /** UX-02 — include each Habit's week as one entry per day (the dot strip). */
    readonly weekHistory?: boolean;
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
  const options =
    input.weekHistory === true ? { weekHistory: true as const } : {};
  return {
    items: page.items.map((habit) =>
      serializeHabit(
        habit,
        byHabit.get(habit.id) ?? new Set(),
        calendar,
        options,
      ),
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
/* The collection's overview (UX-02)                                          */
/* -------------------------------------------------------------------------- */

/**
 * How many active Habits one overview reads.
 *
 * SIXTY, and the number is a constraint rather than a preference: the completion
 * window below binds one parameter per Habit id plus the workspace and two
 * dates, and **D1 accepts at most 100 bound parameters per query** — the limit
 * TASKS-13 found the hard way, where a 100-id chunk failed and a Today section
 * silently reported "nothing planned" against thirty-seven planned Tasks. Sixty
 * leaves room the shape of this query cannot outgrow, and it is far above any
 * plausible number of behaviours one person is practising at once.
 *
 * A workspace holding more says so: `truncated` is reported and the surface
 * prints what the figures cover, rather than a total that quietly is not one.
 */
export const HABIT_OVERVIEW_LIMIT = 60;

/** One Goal and the Habits supporting it, as the collection's rail lists them. */
export interface HabitOverviewGoal {
  readonly id: string;
  readonly title: string;
  readonly habits: readonly { readonly id: string; readonly title: string }[];
}

/**
 * UX-02 — the workspace-level reading the rebuilt `/habits` collection prints.
 *
 * Every figure here is a COUNT or a ratio of two counts, and each one names its
 * own denominator on the screen that draws it. There is no score, no streak and
 * no grade: `consistencyPercent` is the bounded four-week window expressed as a
 * proportion of what was expected, drawn beside the words that state both
 * integers ([ADR-104](../../../docs/decisions/ARCHITECTURE_DECISIONS.md)).
 */
export interface HabitOverview {
  /** Every active Habit read, week-history included, in the collection's order. */
  readonly habits: readonly SerializedHabit[];
  /** True when the workspace holds more active Habits than the bound above. */
  readonly truncated: boolean;
  readonly activeCount: number;
  /** How many the day asks for — `habitDueToday`, never "every active one". */
  readonly dueTodayCount: number;
  /** Due today and not yet checked in. */
  readonly openTodayCount: number;
  readonly doneTodayCount: number;
  /** Check-ins recorded inside the owner's current calendar week. */
  readonly completedThisWeek: number;
  /** What this week asked for across every active Habit, and what happened. */
  readonly weekExpected: number;
  readonly weekCompleted: number;
  /** The four-week window, summed across every active Habit. */
  readonly consistencyFromIso: string;
  readonly consistencyExpected: number;
  readonly consistencyCompleted: number;
  /** "84%", as a number 0–100, or `null` when the window expected nothing. */
  readonly consistencyPercent: number | null;
  /** The Goals these Habits support, each with its supporting Habits. */
  readonly goals: readonly HabitOverviewGoal[];
}

/**
 * The workspace's Habit overview: two statements, whatever it holds.
 *
 * The first lists the active Habits (with their Goal/Area joins and schedule
 * chains, as every Habit read does); the second reads FOUR WEEKS of completions
 * for all of them at once, which is the same single range read `readHabitRecord`
 * makes for one Habit — the completion index is `(workspace, completed_on,
 * habit)`, so widening the id set costs nothing extra.
 *
 * Everything else is arithmetic over those two results. In particular the
 * supporting-Goal grouping adds NO query: a Habit already carries its Goal
 * through its EntityLink join, so the rail's "Supporting goals" card is that
 * same data inverted rather than a second read of the Goals collection.
 */
export async function readHabitOverview(
  scope: WorkspaceScope,
  calendar: HabitCalendarContext,
  input: { readonly limit?: number } = {},
): Promise<HabitOverview> {
  const limit = Math.min(
    input.limit ?? HABIT_OVERVIEW_LIMIT,
    HABIT_OVERVIEW_LIMIT,
  );
  const page = await scope.habits.list({ status: "active", limit });
  const week = habitWeek(calendar.todayIso, calendar.firstDayOfWeek);
  const fromIso = habitWindowStart(calendar);

  const completions =
    page.items.length === 0
      ? []
      : await scope.habits.listCompletionsInRange({
          habitIds: page.items.map((habit) => habit.id),
          fromIso,
          toIso: calendar.todayIso,
        });
  const byHabit = completionsByHabit(completions);

  const habits = page.items.map((habit) =>
    serializeHabit(habit, byHabit.get(habit.id) ?? new Set(), calendar, {
      weekHistory: true,
    }),
  );

  let weekExpected = 0;
  let weekCompleted = 0;
  let consistencyExpected = 0;
  let consistencyCompleted = 0;
  let dueTodayCount = 0;
  let openTodayCount = 0;
  let doneTodayCount = 0;
  let completedThisWeek = 0;

  const goals = new Map<
    string,
    { title: string; habits: { id: string; title: string }[] }
  >();

  for (const habit of page.items) {
    const dates = byHabit.get(habit.id) ?? new Set<string>();
    const facts = habitFactsFor(habit, dates);
    const reading = evaluateHabitWeek(facts, calendar, week.startIso);
    weekExpected += reading.expected;
    weekCompleted += reading.completed;

    const consistency = evaluateHabitConsistency(facts, calendar, fromIso);
    consistencyExpected += consistency.expected;
    consistencyCompleted += consistency.completed;

    // Every check-in inside the owner's current calendar week — the recorded
    // count, not the expected one, because "completed this week" is a tally of
    // what happened and a Habit may be checked on a day it was not asked for.
    for (const dateIso of dates) {
      if (dateIso >= week.startIso && dateIso <= week.endIso)
        completedThisWeek += 1;
    }
  }

  for (const habit of habits) {
    if (habitDueToday(habit)) dueTodayCount += 1;
    if (habitOpenToday(habit)) openTodayCount += 1;
    if (habit.today.done) doneTodayCount += 1;
    if (habit.goal !== null) {
      const bucket = goals.get(habit.goal.id) ?? {
        title: habit.goal.title,
        habits: [],
      };
      bucket.habits.push({ id: habit.id, title: habit.title });
      goals.set(habit.goal.id, bucket);
    }
  }

  return {
    habits,
    truncated: page.hasMore,
    activeCount: habits.length,
    dueTodayCount,
    openTodayCount,
    doneTodayCount,
    completedThisWeek,
    weekExpected,
    weekCompleted,
    consistencyFromIso: fromIso,
    consistencyExpected,
    consistencyCompleted,
    consistencyPercent: habitConsistencyPercent({
      expected: consistencyExpected,
      completed: consistencyCompleted,
    }),
    goals: [...goals.entries()].map(([id, value]) => ({
      id,
      title: value.title,
      habits: value.habits,
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* The period reading (FOLLOW-01 / DEBT-156)                                  */
/* -------------------------------------------------------------------------- */

/**
 * HABITS-01's consistency reading, summed across the active Habits, for an
 * ARBITRARY named period — the read DEBT-156 said the Review needed and
 * deliberately did not build.
 *
 * ── Why it is three lines rather than a second metric ───────────────────────
 * DEBT-156's stated risk was the denominator: *"a Review's period is an
 * arbitrary range, neither a week nor a fixed number of days, so a correct
 * denominator means summing expectations across a schedule-VERSION chain over
 * that range"*. `evaluateHabitConsistency` has ALWAYS taken `fromIso`/`toIso`
 * and has ALWAYS summed a version chain — a day-based week contributes one
 * expectation per scheduled day the version in force ON THAT DAY asked for, and
 * a count-based week contributes its target only once the week is whole and
 * elapsed. So the historically-correct denominator was already built, by the
 * authority that owns it; what was missing was a caller. Inventing a second
 * Habit metric here would have been the duplicate the architecture forbids.
 *
 * ── The two sentences it cannot say ─────────────────────────────────────────
 * `toIso` is clamped to the owner's today by the evaluator itself, so a Review
 * opened mid-period never counts a day that has not happened; and an unscheduled
 * day contributes no expectation, so it can never be reported as a miss. Those
 * are HABITS-01's two unsayable sentences, and this read inherits both rather
 * than re-asserting them in prose.
 *
 * TWO bounded statements, the same pair every other Habit read makes.
 */
export async function readHabitPeriodConsistency(
  scope: WorkspaceScope,
  calendar: HabitCalendarContext,
  input: {
    readonly fromIso: string;
    readonly toIso: string;
    readonly limit?: number;
  },
): Promise<HabitPeriodConsistency> {
  const limit = Math.min(
    input.limit ?? HABIT_OVERVIEW_LIMIT,
    HABIT_OVERVIEW_LIMIT,
  );
  const page = await scope.habits.list({ status: "active", limit });
  const clampedTo =
    input.toIso > calendar.todayIso ? calendar.todayIso : input.toIso;
  /*
   * A Review period is whatever two dates the owner picked, and
   * `evaluateHabitConsistency` walks a fixed number of owner-calendar weeks. Ask
   * it for more and it stops — dropping the LATEST weeks, which are the ones the
   * Review is most about. So the window is clamped here instead, forward from
   * the end, and the reading says where it really starts. A partial total that
   * names its own window is a fact; one that silently omits last month is not.
   */
  const earliestSupported = addPlanningDays(
    habitWeek(clampedTo, calendar.firstDayOfWeek).startIso,
    -(MAX_HABIT_CONSISTENCY_WEEKS - 1) * 7,
  );
  const truncated = input.fromIso < earliestSupported;
  const fromIso = truncated ? earliestSupported : input.fromIso;
  const empty: HabitPeriodConsistency = {
    fromIso,
    toIso: clampedTo,
    expected: 0,
    completed: 0,
    habitsCounted: 0,
    bounded: page.hasMore || truncated,
    available: true,
  };
  if (page.items.length === 0 || clampedTo < fromIso) return empty;

  const completions = await scope.habits.listCompletionsInRange({
    habitIds: page.items.map((habit) => habit.id),
    fromIso,
    toIso: clampedTo,
  });
  const byHabit = completionsByHabit(completions);

  let expected = 0;
  let completed = 0;
  let habitsCounted = 0;
  for (const habit of page.items) {
    const reading = evaluateHabitConsistency(
      habitFactsFor(habit, byHabit.get(habit.id) ?? new Set()),
      calendar,
      fromIso,
      clampedTo,
    );
    if (reading.expected === 0) continue;
    expected += reading.expected;
    completed += reading.completed;
    habitsCounted += 1;
  }
  return { ...empty, expected, completed, habitsCounted };
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
