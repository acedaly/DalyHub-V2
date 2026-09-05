/**
 * V2.9 INS-01 — the GRAIN, and how a window is cut into buckets.
 *
 * One vocabulary for "over time", so that every surface asking *"what happened
 * over this period?"* asks it the same way. Pure: no D1, no JSX, no clock, no
 * timezone database — resolving an owner-local midnight to an instant is the
 * platform's job and arrives as an argument, exactly as `buildActivityWindow`
 * takes it (ADR-110 decision 5, AUDIT-14).
 *
 * ── This generalises `rangeBuckets`, it does not compete with it ─────────────
 * Analytics' `rangeBuckets` (`~/kernel/analytics/analytics-range.ts`) had the
 * right rule trapped inside one module and capped at an inherited eight, because
 * it was written to fit `MAX_TREND_PERIODS`. The rule is preserved verbatim
 * here; only the cap and the privacy change (DEBT-239).
 *
 * ── The rule: buckets are generated BACKWARD from the window's end ──────────
 * The most recent bucket is always a WHOLE one, and any remainder falls at the
 * OLDEST end, clamped to the window. A partial bucket at the recent end would
 * draw the current period as a dip every single time the page is opened
 * mid-week — a chart that lies about the direction of travel. A partial bucket
 * at the old end is visible, explainable, and cannot be mistaken for a trend.
 *
 * **This is why there is no `weekStart` parameter, and the omission is
 * deliberate rather than forgotten.** Aligning a week bucket to the owner's
 * Monday would make the most recent bucket partial whenever the window ends
 * mid-week, which is precisely the defect the backward rule exists to prevent.
 * A caller who wants calendar weeks gets them for free by ending the window on
 * the owner's week end — the boundaries coincide exactly, and
 * `history-grain.test.ts` asserts that case beside the mid-week one. The
 * owner's week start remains `planningWeekStart`'s (`~/kernel/planning`) single
 * authority; this module does not acquire a second one. Every bucket names its
 * own window in words at the surface, so a Saturday-to-Friday week is stated
 * rather than implied (the V2.9 acceptance rule).
 *
 * ── Bounds are stated, never silently applied ───────────────────────────────
 * Each grain has a maximum, and a window wider than it does not quietly become
 * a shorter one presented as exact: the result carries `bounded`, the
 * `maximum` that bound it and the count that was asked for, so a surface can
 * refuse, say so, or both (ADR-079 decision 11).
 */

import {
  addCalendarDays,
  addCalendarMonths,
  calendarDaysBetween,
  isCalendarDate,
} from "~/kernel/datetime";

import type { ActivityWindow } from "~/kernel/activity-window";
import { buildActivityWindow } from "~/kernel/activity-window";

/**
 * The grains DalyHub measures its own history at.
 *
 * `review_period` is not calendar-derived — a Review period is whatever the
 * owner's Reviews actually covered — so it is built by {@link bucketPeriods}
 * from windows that already exist, never generated from a calendar rule.
 */
export const HISTORY_GRAINS = [
  "day",
  "week",
  "month",
  "review_period",
] as const;

export type Grain = (typeof HISTORY_GRAINS)[number];

/** Narrow an untrusted value (a query string, a stored config) to a grain. */
export function isGrain(value: unknown): value is Grain {
  return (
    typeof value === "string" &&
    (HISTORY_GRAINS as readonly string[]).includes(value)
  );
}

/**
 * How many buckets of each grain a series may hold.
 *
 * These are the roadmap's numbers, and each is a statement about what a person
 * can read rather than about what the database can do: two years of months, a
 * year of weeks, a year of days, and a quarter of weekly Reviews. A history
 * question wider than its grain's maximum is a different question — one the
 * Review's across-Reviews facts and, from V2.13, a Report answer — not a longer
 * chart.
 */
export const GRAIN_MAXIMUMS: Readonly<Record<Grain, number>> = {
  day: 366,
  week: 52,
  month: 24,
  review_period: 12,
};

/** Why a series holds fewer points than the caller's window could have held. */
export type HistoryBoundReason =
  /** The window needed more buckets of this grain than `GRAIN_MAXIMUMS` allows. */
  | "grain_maximum"
  /** The store returned its row ceiling; there may be more history. */
  | "row_limit";

/**
 * One bucket: a window in its own right, plus the key its count comes back
 * under.
 *
 * A bucket IS an {@link ActivityWindow} rather than a pair of dates beside one,
 * so a read never has to re-derive instants from days — the conversion happens
 * once, here, through the caller's owner-day resolver.
 */
export interface HistoryBucket extends ActivityWindow {
  /** Stable within one series, and ordered: `b0` is the OLDEST bucket. */
  readonly key: string;
}

/** A window cut into buckets, with whatever bound was applied stated. */
export interface HistoryBuckets {
  readonly grain: Grain;
  /** Oldest first. */
  readonly buckets: readonly HistoryBucket[];
  /**
   * The window the buckets actually cover — equal to the requested window
   * unless a bound shortened it, in which case it is the retained (most
   * recent) span.
   */
  readonly window: ActivityWindow;
  readonly bounded: boolean;
  /** The bound that applied, or null when none did. */
  readonly bound: number | null;
  readonly boundReason: HistoryBoundReason | null;
  /** How many buckets the requested window would have held, unbounded. */
  readonly requested: number;
}

/** Resolves an owner-local midnight to its UTC instant. */
export type OwnerDayStart = (dayIso: string) => Date | null;

function bucketKey(index: number): string {
  return `b${index}`;
}

/**
 * The wall-calendar day each bucket boundary falls on, most recent FIRST.
 *
 * Returns `count + 1` inclusive end-days: `ends[0]` is the window's last day,
 * and bucket *i* runs from the day after `ends[i + 1]` to `ends[i]`. Computing
 * every boundary from the same anchor (rather than iteratively) is what keeps
 * month boundaries strictly monotonic under day clamping — see
 * `addCalendarMonths`.
 */
function boundaryDays(endIso: string, grain: Grain, count: number): string[] {
  const days: string[] = [];
  for (let index = 0; index <= count; index += 1) {
    days.push(
      grain === "month"
        ? monthBoundary(endIso, index)
        : addCalendarDays(endIso, -index * (grain === "week" ? 7 : 1)),
    );
  }
  return days;
}

/**
 * The day `index` months before `endIso` on which a month bucket ends.
 *
 * Found by review: `addCalendarMonths` clamps the DAY, which is right when a
 * window ends mid-month (5 September → 5 August → 5 July tiles cleanly), and
 * wrong when it ends on a month end shorter than 31 days: stepping back from
 * 30 April landed on 30 March, and 31 March was counted in the "April" bucket.
 * A window that ends on ANY month end therefore tiles into whole calendar
 * months — each boundary is the last day of its month — and a window ending
 * mid-month keeps the day-anchored rule, which is the only one that keeps the
 * most recent bucket whole.
 */
function monthBoundary(endIso: string, index: number): string {
  if (!isMonthEnd(endIso)) return addCalendarMonths(endIso, -index);
  // The first of the anchor month, stepped back, then the day before the
  // following first: the last day of the target month whatever its length.
  const firstOfMonth = `${endIso.slice(0, 8)}01`;
  return addCalendarDays(addCalendarMonths(firstOfMonth, 1 - index), -1);
}

/** True when `iso` is the last day of its calendar month. */
function isMonthEnd(iso: string): boolean {
  return addCalendarDays(iso, 1).slice(0, 7) !== iso.slice(0, 7);
}

/**
 * Cut a window into buckets of one calendar grain, oldest first.
 *
 * `review_period` is rejected here on purpose: its buckets are the periods the
 * owner's Reviews actually covered, which no calendar rule can derive. Use
 * {@link bucketPeriods}.
 */
export function bucketWindow(input: {
  readonly window: ActivityWindow;
  readonly grain: Grain;
  readonly startOfOwnerDay: OwnerDayStart;
}): HistoryBuckets {
  const { window, grain, startOfOwnerDay } = input;
  if (grain === "review_period") {
    throw new TypeError(
      "review_period buckets are the Reviews' own periods — use bucketPeriods()",
    );
  }
  assertCalendarWindow(window);

  const maximum = GRAIN_MAXIMUMS[grain];
  const requested = requestedBucketCount(window, grain);
  const bounded = requested > maximum;
  const count = bounded ? maximum : requested;

  const ends = boundaryDays(window.periodEnd, grain, count);
  const buckets: HistoryBucket[] = [];
  // Walk from the OLDEST retained bucket forward, so `b0` is the oldest and the
  // series reads left to right the way it is drawn.
  for (let index = count - 1; index >= 0; index -= 1) {
    const endDay = ends[index];
    const rawStart = addCalendarDays(ends[index + 1], 1);
    // Clamp the oldest bucket to the window: nothing outside the window the
    // caller asked for is ever counted into it. When a bound applied, the
    // retained span starts at a whole bucket boundary and there is nothing to
    // clamp.
    const startDay =
      !bounded && rawStart < window.periodStart ? window.periodStart : rawStart;
    buckets.push({
      key: bucketKey(count - 1 - index),
      ...buildActivityWindow({
        periodStart: startDay,
        periodEnd: endDay,
        startOfOwnerDay,
      }),
    });
  }

  const covered =
    buckets.length === 0
      ? window
      : buildActivityWindow({
          periodStart: buckets[0].periodStart,
          periodEnd: buckets[buckets.length - 1].periodEnd,
          startOfOwnerDay,
        });

  return {
    grain,
    buckets,
    window: covered,
    bounded,
    bound: bounded ? maximum : null,
    boundReason: bounded ? "grain_maximum" : null,
    requested,
  };
}

/**
 * How many buckets of `grain` the window spans, counting the partial oldest one.
 *
 * Exported because a surface refuses a request over the maximum rather than
 * rendering a silently shortened one (INS-03's falsification), and refusing
 * needs the number before any bucket is built.
 */
export function requestedBucketCount(
  window: ActivityWindow,
  grain: Grain,
): number {
  if (grain === "review_period") return 0;
  assertCalendarWindow(window);
  if (grain === "month") {
    // Whole months between the two boundaries, by arithmetic rather than by
    // stepping: the count was found capped at 50 by a loop ceiling while days
    // and weeks were exact, and a field documented as "unbounded" must be. The
    // boundary rule is `monthBoundary`'s, so the count agrees with the buckets
    // it would get: the boundary `whole` months back is the last one at or
    // after the window's start, and the partial remainder (if any) is one more.
    const whole = monthsBetween(window.periodEnd, window.periodStart);
    const boundary = monthBoundary(window.periodEnd, whole);
    return Math.max(1, boundary >= window.periodStart ? whole + 1 : whole);
  }
  const days = calendarDaysBetween(window.periodStart, window.periodEnd) + 1;
  return Math.max(1, Math.ceil(days / (grain === "week" ? 7 : 1)));
}

/**
 * How many whole month steps back from `fromIso` stay at or after `toIso`,
 * under the same boundary rule the buckets use. Pure arithmetic on the
 * year/month pair, corrected by at most one step for the day.
 */
function monthsBetween(fromIso: string, toIso: string): number {
  const months =
    (Number(fromIso.slice(0, 4)) - Number(toIso.slice(0, 4))) * 12 +
    (Number(fromIso.slice(5, 7)) - Number(toIso.slice(5, 7)));
  let steps = Math.max(0, months);
  // The year/month difference can overshoot by one when the day clamps past
  // the start; step back until the boundary is inside the window.
  while (steps > 0 && monthBoundary(fromIso, steps) < toIso) steps -= 1;
  return steps;
}

/**
 * A window is two wall-calendar days in order. An inverted window is refused
 * rather than read: it was found producing one bucket with inverted instants,
 * which every read answered with zeros — "nothing happened" where the truth
 * was "nothing was asked".
 */
function assertCalendarWindow(window: ActivityWindow): void {
  if (
    !isCalendarDate(window.periodStart) ||
    !isCalendarDate(window.periodEnd)
  ) {
    throw new TypeError(
      "a history window needs two wall-calendar YYYY-MM-DD days",
    );
  }
  if (window.periodStart > window.periodEnd) {
    throw new TypeError(
      `a history window's start (${window.periodStart}) must not follow its end (${window.periodEnd})`,
    );
  }
}

/**
 * Buckets from periods that already exist — the `review_period` grain.
 *
 * The caller supplies the windows (a Review's own period is stored on the
 * Review, and its snapshot's `periodStart`/`periodEnd` carry it), oldest first
 * or newest first; the result is always oldest first and bounded to the
 * grain's maximum by keeping the MOST RECENT periods, because a trend is a
 * recent shape.
 */
export function bucketPeriods(
  periods: readonly ActivityWindow[],
): HistoryBuckets {
  const maximum = GRAIN_MAXIMUMS.review_period;
  const ordered = [...periods].sort((left, right) =>
    left.periodStart < right.periodStart
      ? -1
      : left.periodStart > right.periodStart
        ? 1
        : 0,
  );
  const bounded = ordered.length > maximum;
  const retained = bounded ? ordered.slice(-maximum) : ordered;
  const buckets = retained.map((period, index) => ({
    key: bucketKey(index),
    ...period,
  }));
  const window: ActivityWindow =
    buckets.length === 0
      ? {
          periodStart: "",
          periodEnd: "",
          startInstantIso: "",
          endInstantIso: "",
        }
      : {
          periodStart: buckets[0].periodStart,
          periodEnd: buckets[buckets.length - 1].periodEnd,
          startInstantIso: buckets[0].startInstantIso,
          endInstantIso: buckets[buckets.length - 1].endInstantIso,
        };
  return {
    grain: "review_period",
    buckets,
    window,
    bounded,
    bound: bounded ? maximum : null,
    boundReason: bounded ? "grain_maximum" : null,
    requested: ordered.length,
  };
}
