/**
 * HABITS-01 — the Habit SCHEDULE vocabulary and its calendar arithmetic.
 *
 * Pure, React-free, clock-free and storage-free. Every function takes the
 * owner's calendar day as an ARGUMENT and returns facts about wall-calendar
 * dates; nothing here reads a clock, a browser timezone or a database.
 *
 * ── The vocabulary is deliberately SMALL ────────────────────────────────────
 * Three kinds, and the smallness is the design rather than a first cut:
 *
 *   `daily`         every day
 *   `weekdays`      selected days of the week (Monday/Wednesday/Friday, weekdays)
 *   `weekly_count`  N times in the owner's calendar week, on any days
 *
 * Monthly cadences, nth-weekday-of-month, "every X hours", end conditions,
 * multiple completions per day, times of day and reminders are all deliberately
 * ABSENT. Each of them turns "how often do I want to do this?" into a rule
 * language, and none of them is needed to answer the question a habit surface
 * exists for — *am I practising this consistently?* Advanced TASK recurrence is
 * a different item with a different model (TASKS-12, ADR-062/ADR-085), and a
 * Habit deliberately does not share it.
 *
 * ── Dates are dates ─────────────────────────────────────────────────────────
 * Every value is a wall-calendar `YYYY-MM-DD` stepped as an integer number of
 * days, exactly as `~/kernel/planning` does — which is where the week boundaries
 * themselves come from, so Weekly Planning, a weekly Review and a Habit's week
 * are the SAME week. No `Date` is mutated, no UTC-midnight arithmetic decides a
 * calendar day, and a DST transition cannot move a completion onto another day
 * because no completion is ever stored as an instant-to-be-reinterpreted: the
 * owner-local date is resolved ONCE, at the moment of the check-in, through the
 * owner's timezone.
 */

import type { FirstDayOfWeek } from "~/kernel/preferences";
import { addPlanningDays, planningWeekStart } from "~/kernel/planning";
import {
  calendarWeekday,
  isCalendarDate,
  tryCalendarEpochDay,
} from "~/kernel/datetime";

/* -------------------------------------------------------------------------- */
/* The vocabulary                                                             */
/* -------------------------------------------------------------------------- */

/** The three schedule kinds a Habit may carry. A closed set. */
export const HABIT_SCHEDULE_KINDS = [
  "daily",
  "weekdays",
  "weekly_count",
] as const;

export type HabitScheduleKind = (typeof HABIT_SCHEDULE_KINDS)[number];

/** The most times a week a Habit may ask for. Seven — a week has seven days. */
export const HABIT_MAX_TIMES_PER_WEEK = 7;

/**
 * A Habit's schedule, as a discriminated union so an impossible combination
 * (weekdays with a count, a count with no number) is a type error rather than a
 * runtime check.
 *
 * `weekdays` are zero-based with **Sunday = 0**, matching `Date.getUTCDay()` and
 * the arithmetic in `~/kernel/planning`. The list is always sorted, unique and
 * non-empty; the owner's `firstDayOfWeek` preference decides only the ORDER the
 * days are OFFERED and DISPLAYED in, never what a stored value means.
 */
export type HabitSchedule =
  | { readonly kind: "daily" }
  | { readonly kind: "weekdays"; readonly weekdays: readonly number[] }
  | { readonly kind: "weekly_count"; readonly timesPerWeek: number };

/**
 * One stored, effective-dated version of a Habit's schedule.
 *
 * ── Why versions exist at all ───────────────────────────────────────────────
 * Changing a Habit from Monday/Wednesday/Friday to Tuesday/Thursday must not
 * rewrite what DalyHub says the owner was supposed to do LAST MONTH. If the
 * current schedule were the only stored fact, every historical figure would be
 * recomputed from it and the owner's past would change every time they changed
 * their mind — which is the one thing a consistency measure must never do.
 *
 * The smallest architecture that prevents it is a contiguous, non-overlapping
 * chain of effective-dated versions per Habit: `effective_from` inclusive,
 * `effective_to` inclusive, the newest version open-ended. There is no generic
 * versioning framework, no temporal table machinery and nothing versioned that
 * did not need to be — a Habit's TITLE and NOTES are not versioned, because
 * renaming a Habit does not change what was expected of it.
 */
export interface HabitScheduleVersion {
  readonly id: string;
  readonly schedule: HabitSchedule;
  /** Owner-local `YYYY-MM-DD`, inclusive. */
  readonly effectiveFrom: string;
  /** Owner-local `YYYY-MM-DD`, inclusive; `null` for the current version. */
  readonly effectiveTo: string | null;
}

/* -------------------------------------------------------------------------- */
/* Calendar arithmetic                                                        */
/* -------------------------------------------------------------------------- */

/*
 * DEBT-52 — the parse, the weekday and the difference below are the kernel's ONE
 * calendar-day implementation (`~/kernel/datetime`), re-exported under the names
 * the habits domain reads. The round-tripping parse is the one this module has
 * always used, and it is now published rather than re-derived.
 */

/** True when `value` is a real wall-calendar date. */
export function isHabitDate(value: unknown): value is string {
  return isCalendarDate(value);
}

/**
 * The zero-based weekday of a calendar date, **Sunday = 0**.
 *
 * Epoch day 0 (1970-01-01) was a Thursday, so `(day + 4) mod 7` is the weekday.
 * Integer arithmetic on a day number — never a `Date` read in some ambient
 * timezone, which is how a weekday quietly becomes wrong for half the planet.
 */
export function habitWeekdayIndex(dateIso: string): number {
  return isCalendarDate(dateIso) ? calendarWeekday(dateIso) : 0;
}

/** Whole days from `fromIso` to `toIso`, or `null` when either is not a date. */
export function habitDaysBetween(
  fromIso: string,
  toIso: string,
): number | null {
  const from = tryCalendarEpochDay(fromIso);
  const to = tryCalendarEpochDay(toIso);
  if (from === null || to === null) return null;
  return to - from;
}

/** Every date from `fromIso` to `toIso` inclusive, bounded by `maxDays`. */
export function habitDateRange(
  fromIso: string,
  toIso: string,
  maxDays = 400,
): readonly string[] {
  const span = habitDaysBetween(fromIso, toIso);
  if (span === null || span < 0) return [];
  const dates: string[] = [];
  for (let index = 0; index <= span && index < maxDays; index += 1) {
    dates.push(addPlanningDays(fromIso, index));
  }
  return dates;
}

/**
 * The owner's calendar week containing `dateIso`.
 *
 * `planningWeekStart` is PLAN-01's own authority, reused verbatim rather than
 * reimplemented: Weekly Planning, a weekly Review and a Habit's week are the
 * same seven days, resolved from the same `firstDayOfWeek` preference, or the
 * product would tell the owner two different things about one week.
 */
export function habitWeek(
  dateIso: string,
  firstDayOfWeek: FirstDayOfWeek,
): { readonly startIso: string; readonly endIso: string } {
  const startIso = planningWeekStart(dateIso, firstDayOfWeek);
  return { startIso, endIso: addPlanningDays(startIso, 6) };
}

/** The weekday indices of a week, in the owner's own display order. */
export function habitWeekdayOrder(
  firstDayOfWeek: FirstDayOfWeek,
): readonly number[] {
  const first = firstDayOfWeek === "sunday" ? 0 : 1;
  return [0, 1, 2, 3, 4, 5, 6].map((offset) => (first + offset) % 7);
}

/* -------------------------------------------------------------------------- */
/* Version resolution                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The schedule version in effect on `dateIso`, or `null` when the Habit had no
 * schedule that day (a date before it was created).
 *
 * Versions are contiguous and non-overlapping by construction, so this is a
 * plain scan rather than an interval tree — a Habit accumulates one version per
 * time its cadence changes, which for a real habit is a handful over years.
 */
export function scheduleVersionForDate(
  versions: readonly HabitScheduleVersion[],
  dateIso: string,
): HabitScheduleVersion | null {
  for (const version of versions) {
    if (
      version.effectiveFrom <= dateIso &&
      (version.effectiveTo === null || dateIso <= version.effectiveTo)
    ) {
      return version;
    }
  }
  return null;
}

/** The earliest date any version covers — the day the Habit began to be expected. */
export function habitFirstEffectiveDate(
  versions: readonly HabitScheduleVersion[],
): string | null {
  let earliest: string | null = null;
  for (const version of versions) {
    if (earliest === null || version.effectiveFrom < earliest) {
      earliest = version.effectiveFrom;
    }
  }
  return earliest;
}

/** The current (open-ended, or latest) version — what the record is TODAY. */
export function currentScheduleVersion(
  versions: readonly HabitScheduleVersion[],
): HabitScheduleVersion | null {
  let latest: HabitScheduleVersion | null = null;
  for (const version of versions) {
    if (latest === null || version.effectiveFrom > latest.effectiveFrom) {
      latest = version;
    }
  }
  return latest;
}

/* -------------------------------------------------------------------------- */
/* Expectation                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Is this Habit scheduled ON a specific calendar day?
 *
 * `weekly_count` answers **false**, and that is the point rather than a gap: a
 * Habit that asks for three sessions a week is not "due Tuesday", and pretending
 * it is would be a manufactured obligation the owner never expressed. The weekly
 * TARGET is the expectation for such a Habit, and it is a property of the week.
 */
export function isScheduledOn(
  schedule: HabitSchedule,
  dateIso: string,
): boolean {
  switch (schedule.kind) {
    case "daily":
      return true;
    case "weekdays":
      return schedule.weekdays.includes(habitWeekdayIndex(dateIso));
    case "weekly_count":
      return false;
  }
}

/**
 * The version whose schedule governs a whole WEEK's target for a count-based
 * Habit, given the owner's today.
 *
 * The rule, stated once so nothing else has to guess it: **a week's target comes
 * from the version in effect on the LAST day of that week that has actually
 * happened** — that is, `min(weekEnd, today)`, floored at the Habit's first
 * effective day. Two properties follow, and both are the ones that matter:
 *
 *   - a PAST week's last day is in the past, so its target is read from the
 *     version that was in effect then. Changing 3×/week to 2×/week today cannot
 *     touch what last month's weeks expected.
 *   - the CURRENT week's last elapsed day is today, so a change made today
 *     applies to this week immediately, which is what an owner who just edited
 *     their cadence expects to see on Today.
 *
 * Returns `null` when the Habit did not exist during the week at all.
 */
export function weekScheduleVersion(
  versions: readonly HabitScheduleVersion[],
  week: { readonly startIso: string; readonly endIso: string },
  todayIso: string,
): HabitScheduleVersion | null {
  const firstEffective = habitFirstEffectiveDate(versions);
  if (firstEffective === null || firstEffective > week.endIso) return null;
  const lastElapsed = week.endIso < todayIso ? week.endIso : todayIso;
  const reference = lastElapsed < firstEffective ? firstEffective : lastElapsed;
  return scheduleVersionForDate(versions, reference);
}

/* -------------------------------------------------------------------------- */
/* Display                                                                    */
/* -------------------------------------------------------------------------- */

/** Short weekday names, indexed Sunday = 0. Formatted from a fixed UTC date. */
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Long weekday names, indexed Sunday = 0. */
const WEEKDAY_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** A weekday's short name ("Mon"). Total: an out-of-range index yields "". */
export function habitWeekdayShortName(index: number): string {
  return WEEKDAY_SHORT[index] ?? "";
}

/** A weekday's full name ("Monday"). Total: an out-of-range index yields "". */
export function habitWeekdayName(index: number): string {
  return WEEKDAY_LONG[index] ?? "";
}

const WEEKDAYS_MON_TO_FRI = [1, 2, 3, 4, 5];
const WEEKEND = [0, 6];

/** Two weekday sets, compared as SETS (both sides sorted numerically first). */
function sameDays(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort((x, y) => x - y);
  const right = [...b].sort((x, y) => x - y);
  return left.every((value, index) => value === right[index]);
}

/**
 * The schedule IN WORDS — the accessible equivalent of every schedule glyph, and
 * the string the collection row, the record and Today all print.
 *
 * There is exactly one of these, so a Habit's cadence is described identically
 * everywhere it appears (AGENTS.md §7). The owner's `firstDayOfWeek` decides the
 * order the days are read in, because "Sun, Mon & Wed" reads wrong to someone
 * whose week starts on Monday.
 */
export function habitScheduleLabel(
  schedule: HabitSchedule,
  firstDayOfWeek: FirstDayOfWeek = "monday",
): string {
  switch (schedule.kind) {
    case "daily":
      return "Every day";
    case "weekdays": {
      const ordered = habitWeekdayOrder(firstDayOfWeek).filter((day) =>
        schedule.weekdays.includes(day),
      );
      if (ordered.length === 7) return "Every day";
      if (sameDays(ordered, WEEKDAYS_MON_TO_FRI)) return "Weekdays";
      if (sameDays(ordered, WEEKEND)) return "Weekends";
      const names = ordered.map((day) => habitWeekdayShortName(day));
      if (names.length === 1) return `Every ${habitWeekdayName(ordered[0]!)}`;
      return `${names.slice(0, -1).join(", ")} & ${names.at(-1)}`;
    }
    case "weekly_count":
      return schedule.timesPerWeek === 1
        ? "Once a week"
        : schedule.timesPerWeek === 2
          ? "Twice a week"
          : `${schedule.timesPerWeek}× a week`;
  }
}

/** The compact form the collection row prints beside the title ("3× weekly"). */
export function habitScheduleShortLabel(
  schedule: HabitSchedule,
  firstDayOfWeek: FirstDayOfWeek = "monday",
): string {
  return schedule.kind === "weekly_count"
    ? `${schedule.timesPerWeek}× weekly`
    : habitScheduleLabel(schedule, firstDayOfWeek);
}
