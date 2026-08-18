/**
 * HABITS-01 — what a Habit's history MEANS, as pure functions.
 *
 * Storage-free, clock-free, React-free. Every input is a fact the caller already
 * holds — the schedule versions, the set of completed owner-local dates, the
 * owner's today and their week — and every output is a plain, JSON-safe reading
 * of them. Nothing here is stored: a Habit's progress is recomputed on every
 * read, so it can never drift from the completions it describes.
 *
 * ── CALM OVER URGENT is a constraint on this file specifically ──────────────
 * AGENTS.md §2 forbids manufactured streaks in as many words, and the roadmap
 * raises the concern by name. This module therefore computes **no streak**, no
 * score, no percentage-of-perfection and no "days since you broke the chain".
 * What it computes is three factual readings:
 *
 *   TODAY        done, or not yet — and "not scheduled today" is a THIRD state,
 *                never a miss;
 *   THIS WEEK    "2 of 3", counted against what the week actually asked for;
 *   RECENTLY     "9 of 12 expected check-ins", over a bounded window.
 *
 * Every one of them is a count of things that happened against a number the
 * owner themselves chose. None of them can go negative, none of them is lost by
 * a single missed day, and none of them is phrased as a failure. A future day is
 * never described as incomplete, and an unscheduled day is never described as a
 * miss — those are the two sentences this module exists to make unsayable.
 */

import type { FirstDayOfWeek } from "~/kernel/preferences";

import { addPlanningDays } from "~/kernel/planning";

import {
  habitDateRange,
  habitFirstEffectiveDate,
  habitWeek,
  habitWeekdayIndex,
  isScheduledOn,
  scheduleVersionForDate,
  weekScheduleVersion,
  type HabitScheduleKind,
  type HabitScheduleVersion,
} from "./habit-schedule";

/* -------------------------------------------------------------------------- */
/* Inputs                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Everything an evaluation needs about ONE Habit. `completedDates` is the set of
 * owner-local `YYYY-MM-DD` values the Habit has been checked in on, restricted
 * by the caller to the window being asked about.
 *
 * `archivedOnIso` is the owner-local date the Habit was put away, or `null`. It
 * bounds expectation: an archived Habit is not expected on the days after it was
 * archived, so archiving cannot manufacture a run of misses.
 */
export interface HabitFacts {
  readonly versions: readonly HabitScheduleVersion[];
  readonly completedDates: ReadonlySet<string>;
  readonly archivedOnIso: string | null;
}

/** The owner-calendar context every evaluation is resolved against. */
export interface HabitCalendarContext {
  /** The owner's calendar day, resolved server-side from their timezone. */
  readonly todayIso: string;
  readonly firstDayOfWeek: FirstDayOfWeek;
}

/* -------------------------------------------------------------------------- */
/* Today                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * What today IS for a Habit.
 *
 *   `scheduled`      the day-based schedule asks for it today
 *   `flexible`       a count-based Habit: today is available, never "due"
 *   `not_scheduled`  the day-based schedule does not ask for it today
 *   `inactive`       archived, or a day before the Habit existed
 */
export type HabitTodayKind =
  "scheduled" | "flexible" | "not_scheduled" | "inactive";

export interface HabitTodayState {
  readonly kind: HabitTodayKind;
  /** Whether today already carries a completion. */
  readonly done: boolean;
  /**
   * Whether a check-in control belongs on the row today.
   *
   * True for a scheduled day, for a count-based Habit whose week is not yet met,
   * and ALWAYS when today is already done — because undoing a check-in must stay
   * possible even once the week's target is reached.
   */
  readonly checkable: boolean;
  /** The factual words for this state, for the row and for assistive tech. */
  readonly label: string;
}

/* -------------------------------------------------------------------------- */
/* The week                                                                   */
/* -------------------------------------------------------------------------- */

/** One owner-calendar week's reading of a Habit. */
export interface HabitWeekProgress {
  readonly startIso: string;
  readonly endIso: string;
  /** The schedule kind that governed this week (see `weekScheduleVersion`). */
  readonly kind: HabitScheduleKind | null;
  /**
   * How many check-ins the week asked for. Zero when the Habit was not active
   * during the week at all — which is a real answer, not a missing one.
   */
  readonly expected: number;
  /** How many of them happened. Never greater than `expected`. */
  readonly completed: number;
  /** Every completion inside the week, including any beyond the expectation. */
  readonly recorded: number;
  /** True once the week's expectation is satisfied. */
  readonly met: boolean;
}

/* -------------------------------------------------------------------------- */
/* A bounded recent window                                                    */
/* -------------------------------------------------------------------------- */

/** How many days a Habit's own "recent consistency" reading looks back. */
export const HABIT_RECENT_WINDOW_DAYS = 28;

/** The bounded consistency reading: expected against completed, and nothing else. */
export interface HabitConsistency {
  readonly fromIso: string;
  readonly toIso: string;
  readonly expected: number;
  readonly completed: number;
}

/** One day of the record's history strip. */
export type HabitHistoryDayState =
  "completed" | "expected" | "unscheduled" | "inactive";

export interface HabitHistoryDay {
  readonly dateIso: string;
  readonly state: HabitHistoryDayState;
  /** The weekday index (Sunday = 0), so the strip can label its columns. */
  readonly weekday: number;
}

/* -------------------------------------------------------------------------- */
/* Evaluation                                                                 */
/* -------------------------------------------------------------------------- */

/** Whether the Habit was ACTIVE (existed, not yet archived) on a calendar day. */
function activeOn(facts: HabitFacts, dateIso: string): boolean {
  const first = habitFirstEffectiveDate(facts.versions);
  if (first === null || dateIso < first) return false;
  return facts.archivedOnIso === null || dateIso <= facts.archivedOnIso;
}

/**
 * How many check-ins a specific day asks for: 1 or 0. Count-based Habits ask
 * for nothing on any particular day — their expectation lives on the week.
 */
function expectedOnDay(facts: HabitFacts, dateIso: string): boolean {
  if (!activeOn(facts, dateIso)) return false;
  const version = scheduleVersionForDate(facts.versions, dateIso);
  return version !== null && isScheduledOn(version.schedule, dateIso);
}

/** The reading of one owner-calendar week. */
export function evaluateHabitWeek(
  facts: HabitFacts,
  context: HabitCalendarContext,
  weekStartIso?: string,
): HabitWeekProgress {
  const week = habitWeek(
    weekStartIso ?? context.todayIso,
    context.firstDayOfWeek,
  );
  const days = habitDateRange(week.startIso, week.endIso, 7);
  let recorded = 0;
  for (const dateIso of days) {
    if (facts.completedDates.has(dateIso)) recorded += 1;
  }

  const version = weekScheduleVersion(facts.versions, week, context.todayIso);
  if (version === null) {
    return {
      startIso: week.startIso,
      endIso: week.endIso,
      kind: null,
      expected: 0,
      completed: 0,
      recorded,
      met: false,
    };
  }

  if (version.schedule.kind === "weekly_count") {
    /*
     * A count-based week: the target is a property of the WEEK, and the
     * completions that satisfy it may fall on any of its days. `completed` is
     * capped at the target so a seven-session week cannot hide a missed week in
     * the consistency figure that sums these.
     *
     * ── The PARTIAL FIRST WEEK (V2.3-GATE-01) ───────────────────────────────
     * A week the Habit did not exist for the whole of expects NOTHING, and the
     * rule is the one this module already applies twice rather than a new idea:
     *
     *   - a day-based week counts only the scheduled days the Habit was active
     *     on, which is why "a Habit created on Friday did not fail Monday to
     *     Thursday" (`habitWeekLabel`);
     *   - the consistency window takes a count-based week only "once the week is
     *     over — half a week's target is a number nobody chose, so a partial
     *     week is excluded rather than pro-rated"
     *     (`evaluateHabitConsistency`).
     *
     * A week that is partial because the Habit was CREATED inside it is the same
     * sentence with the same number nobody chose. Start "three times a week" on
     * the Sunday and the old rule charged the full three: a target that cannot be
     * reached in the time remaining, printed as "0 of 3 this week", and — worse,
     * because it is permanent — carried into the recent-window figure as three
     * expectations against a week the owner never had a chance in. That is
     * manufactured guilt about days before the Habit existed, which is precisely
     * what ADR-102 and AGENTS.md §2 forbid.
     *
     * So: expectation applies only to a week the Habit was active on EVERY day
     * of. The first whole week is the first week with a target, completions made
     * before it still count as `recorded`, and nothing is pro-rated. The rule is
     * symmetric at the other end by construction — archiving on Tuesday cannot
     * leave three sessions owed for that week either.
     */
    const wholeWeek = days.every((dateIso) => activeOn(facts, dateIso));
    const expected = wholeWeek ? version.schedule.timesPerWeek : 0;
    const completed = Math.min(recorded, expected);
    return {
      startIso: week.startIso,
      endIso: week.endIso,
      kind: "weekly_count",
      expected,
      completed,
      recorded,
      met: expected > 0 && recorded >= expected,
    };
  }

  /*
   * A day-based week: every day of the week is asked about individually, using
   * the version in effect ON THAT DAY. A week that straddles a schedule change
   * therefore reads half under the old cadence and half under the new one, which
   * is exactly what happened.
   */
  let expected = 0;
  let completed = 0;
  for (const dateIso of days) {
    if (!expectedOnDay(facts, dateIso)) continue;
    expected += 1;
    if (facts.completedDates.has(dateIso)) completed += 1;
  }
  return {
    startIso: week.startIso,
    endIso: week.endIso,
    kind: version.schedule.kind,
    expected,
    completed,
    recorded,
    met: expected > 0 && completed >= expected,
  };
}

/** What today is for this Habit, and whether a check-in belongs on the row. */
export function evaluateHabitToday(
  facts: HabitFacts,
  context: HabitCalendarContext,
  week?: HabitWeekProgress,
): HabitTodayState {
  const { todayIso } = context;
  const done = facts.completedDates.has(todayIso);

  if (!activeOn(facts, todayIso)) {
    return {
      kind: "inactive",
      done,
      checkable: false,
      label: done ? "Done today" : "Not active today",
    };
  }

  const version = scheduleVersionForDate(facts.versions, todayIso);
  if (version === null) {
    return {
      kind: "inactive",
      done,
      checkable: false,
      label: done ? "Done today" : "Not active today",
    };
  }

  if (version.schedule.kind === "weekly_count") {
    const reading = week ?? evaluateHabitWeek(facts, context);
    return {
      kind: "flexible",
      done,
      checkable: done || !reading.met,
      label: done ? "Done today" : "Any day this week",
    };
  }

  if (isScheduledOn(version.schedule, todayIso)) {
    return {
      kind: "scheduled",
      done,
      checkable: true,
      label: done ? "Done today" : "Not yet today",
    };
  }

  /*
   * NOT a miss. A Habit scheduled for Monday, Wednesday and Friday is not
   * failing on a Tuesday, and the only honest word for a Tuesday is that it was
   * never asked for. The row says so and offers no control — unless the day
   * already carries a completion, which the owner must still be able to undo.
   */
  return {
    kind: "not_scheduled",
    done,
    checkable: done,
    label: done ? "Done today" : "Not scheduled today",
  };
}

/**
 * The bounded recent reading: how many of the check-ins the window ASKED FOR
 * actually happened.
 *
 * The window ends at the owner's today and never reaches beyond it, so a future
 * day is never counted as expected — describing tomorrow as an outstanding
 * obligation is exactly the manufactured urgency this product refuses.
 *
 * The unit of expectation follows the SCHEDULE THAT GOVERNED EACH WEEK, not the
 * one in force today: a window spanning a change from "three times a week" to
 * "Monday, Wednesday and Friday" sums the first weeks by target and the later
 * ones by day. That is what makes the reading historically true rather than a
 * recomputation of the past from the present.
 *
 *   - a DAY-based week contributes one expectation per scheduled day that has
 *     already happened;
 *   - a COUNT-based week contributes its target, and only once the week is over
 *     — half a week's target is a number nobody chose, so a partial week is
 *     excluded rather than pro-rated.
 */
export function evaluateHabitConsistency(
  facts: HabitFacts,
  context: HabitCalendarContext,
  fromIso: string,
  toIso?: string,
): HabitConsistency {
  const end = toIso ?? context.todayIso;
  const upperBound = end > context.todayIso ? context.todayIso : end;
  let expected = 0;
  let completed = 0;

  let cursor = habitWeek(fromIso, context.firstDayOfWeek).startIso;
  // Bounded by construction: one iteration per owner-calendar week in a window
  // the caller already bounds (28 days by default), with a hard stop either way.
  for (let index = 0; index < 60; index += 1) {
    const week = habitWeek(cursor, context.firstDayOfWeek);
    if (week.startIso > upperBound) break;
    const version = weekScheduleVersion(facts.versions, week, context.todayIso);
    if (version !== null && version.schedule.kind === "weekly_count") {
      // Whole, elapsed weeks only, and only weeks the window fully contains.
      if (week.startIso >= fromIso && week.endIso <= upperBound) {
        const reading = evaluateHabitWeek(facts, context, week.startIso);
        expected += reading.expected;
        completed += reading.completed;
      }
    } else {
      for (const dateIso of habitDateRange(week.startIso, week.endIso, 7)) {
        if (dateIso < fromIso || dateIso > upperBound) continue;
        if (!expectedOnDay(facts, dateIso)) continue;
        expected += 1;
        if (facts.completedDates.has(dateIso)) completed += 1;
      }
    }
    cursor = addPlanningDays(week.startIso, 7);
  }

  return { fromIso, toIso: upperBound, expected, completed };
}

/**
 * The record's history strip: one entry per day of a bounded window.
 *
 * Four states, and the two that are NOT failures matter most: `unscheduled` is a
 * day the Habit never asked for, and `inactive` is a day before it existed (or
 * after it was archived). Neither is drawn or described as a miss.
 */
export function buildHabitHistory(
  facts: HabitFacts,
  context: HabitCalendarContext,
  fromIso: string,
  toIso?: string,
): readonly HabitHistoryDay[] {
  const end = toIso ?? context.todayIso;
  const upperBound = end > context.todayIso ? context.todayIso : end;
  return habitDateRange(fromIso, upperBound).map((dateIso) => {
    const weekday = habitWeekdayIndex(dateIso);
    if (facts.completedDates.has(dateIso)) {
      return { dateIso, state: "completed" as const, weekday };
    }
    if (!activeOn(facts, dateIso)) {
      return { dateIso, state: "inactive" as const, weekday };
    }
    return {
      dateIso,
      state: expectedOnDay(facts, dateIso)
        ? ("expected" as const)
        : ("unscheduled" as const),
      weekday,
    };
  });
}
