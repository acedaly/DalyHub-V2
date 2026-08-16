/**
 * TODAY-11 — the Schedule panel's WEEK STRIP (pure, React-free, clock-free).
 *
 * `MOCKUP 5.png` draws the day's schedule under a seven-day strip: a month
 * label, the week's weekday initials and dates, a filled mark on the selected
 * day, and a dot under every day that holds something. This module owns the
 * arithmetic behind that strip and nothing else — no React, no repository, no
 * wall clock. The owner's calendar day is always supplied by the caller, exactly
 * as `evaluateGoalProgress` and `analytics-range` take theirs.
 *
 * ── Why a strip and not a date picker ───────────────────────────────────────
 * CAL-01 §45 and CAL-02 both refuse a month grid, and `DayNav.tsx` records the
 * reason it is not even a date picker: "a date picker is the first step towards
 * the month grid CAL-01 explicitly is not building". A strip is neither. It is a
 * bounded, seven-item view of the ONE window the page already read, so selecting
 * a day costs no request and reaches no date the loader did not fetch.
 *
 * ── The week starts on Monday ───────────────────────────────────────────────
 * The mockup draws `MON TUE WED THU FRI SAT SUN`, and that is the week an
 * en-AU owner reads. It is a constant here rather than a preference: DalyHub has
 * no first-day-of-week setting, and inventing one to serve a strip would be the
 * feature creep this pass is told to avoid.
 *
 * ── Dates are dates ─────────────────────────────────────────────────────────
 * Every value below is a wall-calendar `YYYY-MM-DD` string, stepped as an
 * integer number of days and formatted from a NOON UTC instant, so no label can
 * shift by a timezone (ADR-022 §22.7). Nothing here converts an instant.
 */

import { addDaysToIsoDate } from "~/kernel/alignment";

/** Seven days, because a week is seven days. */
export const WEEK_STRIP_DAYS = 7;

/** One day of the strip. JSON-safe: a loader hands these straight to the screen. */
export interface WeekStripDay {
  readonly dateIso: string;
  /** The weekday, abbreviated for the strip's own row: "Mon". */
  readonly weekdayLabel: string;
  /** The date, as the strip prints it: "12". */
  readonly dayNumber: string;
  /** The whole day in words, for the control's accessible name: "Monday 12 May". */
  readonly fullLabel: string;
  /** True for the owner's actual today — never for a merely selected day. */
  readonly isToday: boolean;
  /**
   * How many schedule items the day holds. The dot is drawn from `> 0`; the
   * COUNT travels because the accessible name says it in words, and a mark that
   * only exists visually would be exactly the colour-alone signal AGENTS.md §15
   * forbids.
   */
  readonly itemCount: number;
}

/** Parse `YYYY-MM-DD` to a UTC day number, or null when it is not a date. */
function dayNumberOf(iso: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (match === null) return null;
  const utc = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  return Number.isNaN(utc) ? null : Math.round(utc / 86_400_000);
}

/**
 * The Monday of the calendar week containing `dateIso`.
 *
 * The epoch day 0 (1970-01-01) was a Thursday, so `(day + 3) mod 7` is the
 * zero-based offset from Monday. Integer arithmetic on a day number, never a
 * `Date` mutated through `setDate` — the codebase has been bitten by that once
 * already (see `PRODUCT_DEBT` DEBT on duplicated ISO day-shift arithmetic).
 */
export function weekStartIso(dateIso: string): string {
  const day = dayNumberOf(dateIso);
  if (day === null) return dateIso;
  const offsetFromMonday = (((day + 3) % 7) + 7) % 7;
  return addDaysToIsoDate(dateIso, -offsetFromMonday);
}

/** The seven owner-calendar dates of the week containing `todayIso`. */
export function weekDatesFor(todayIso: string): readonly string[] {
  const start = weekStartIso(todayIso);
  const dates: string[] = [];
  for (let offset = 0; offset < WEEK_STRIP_DAYS; offset += 1) {
    dates.push(addDaysToIsoDate(start, offset));
  }
  return dates;
}

/** A label formatted from the DATE at noon UTC, so no timezone can move it. */
function formatDate(
  dateIso: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat("en-AU", {
    ...options,
    timeZone: "UTC",
  }).format(new Date(`${dateIso}T12:00:00Z`));
}

/**
 * Build the strip.
 *
 * `itemCountFor` is asked once per day and is expected to read a map the page
 * has ALREADY loaded — the strip adds no query of its own, which is the whole
 * reason it covers exactly the window the schedule read covers.
 */
export function buildWeekStrip(input: {
  readonly todayIso: string;
  readonly itemCountFor: (dateIso: string) => number;
}): readonly WeekStripDay[] {
  return weekDatesFor(input.todayIso).map((dateIso) => ({
    dateIso,
    weekdayLabel: formatDate(dateIso, { weekday: "short" }),
    dayNumber: formatDate(dateIso, { day: "numeric" }),
    fullLabel: formatDate(dateIso, {
      weekday: "long",
      day: "numeric",
      month: "long",
    }),
    isToday: dateIso === input.todayIso,
    itemCount: Math.max(0, Math.trunc(input.itemCountFor(dateIso))),
  }));
}

/**
 * The strip's heading: "May 2025", or "April – May 2025" when the week spans
 * two months, or "December 2025 – January 2026" when it spans two years.
 *
 * A week that crosses a boundary genuinely has two months in it, and printing
 * only the first one would mislabel four of the seven dates underneath.
 */
export function weekStripMonthLabel(
  days: readonly WeekStripDay[],
): string | null {
  const first = days[0];
  const last = days[days.length - 1];
  if (first === undefined || last === undefined) return null;
  const firstMonth = formatDate(first.dateIso, { month: "long" });
  const lastMonth = formatDate(last.dateIso, { month: "long" });
  const firstYear = formatDate(first.dateIso, { year: "numeric" });
  const lastYear = formatDate(last.dateIso, { year: "numeric" });
  if (firstYear !== lastYear) {
    return `${firstMonth} ${firstYear} – ${lastMonth} ${lastYear}`;
  }
  if (firstMonth !== lastMonth) {
    return `${firstMonth} – ${lastMonth} ${lastYear}`;
  }
  return `${firstMonth} ${firstYear}`;
}

/**
 * How a selected day is announced beside the timeline.
 *
 * The selected day and the owner's today are kept strictly distinct: "Today" is
 * a fact about the calendar, and a strip that called Thursday "Today" because it
 * happened to be selected would be the same class of untruth as a "Now" badge on
 * a page showing next week (`ScheduleList` refuses that one for the same reason).
 */
export function weekStripDayHeading(day: WeekStripDay): string {
  return day.isToday ? `Today · ${day.fullLabel}` : day.fullLabel;
}
