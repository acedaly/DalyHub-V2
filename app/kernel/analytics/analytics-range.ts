/**
 * UIX-05 Analytics — the RANGE, and how it is cut into buckets. Pure, React-free
 * and storage-free, so the whole rule set is unit-testable directly.
 *
 * Analytics answers one question — "where has my effort actually gone?" — over a
 * span the owner chooses. Everything about that span is decided here:
 *
 *   - which spans are offered (three, and only three: see below);
 *   - which owner-calendar days each covers;
 *   - how the span is cut into the buckets the trend is drawn from.
 *
 * ── Why three ranges and not a date picker ──────────────────────────────────
 * A free date picker on an analytics screen is a control that has to be USED
 * before the screen says anything, and it invites comparisons the underlying
 * reads cannot make honestly (an arbitrary 3-day window against "the previous
 * 3 days" is noise presented as a trend). Three fixed spans — this week, four
 * weeks, twelve weeks — each have a natural previous period of exactly the same
 * length, which is what makes the comparison arithmetic defensible.
 *
 * ── Why the bucket count is capped ──────────────────────────────────────────
 * The series is read through the SAME grouped Activity aggregate the Review's
 * trend uses (`countPeriodCompletions`), which is one statement regardless of
 * how many buckets are asked for and is capped at `MAX_TREND_PERIODS` (8). So
 * the bucketing here is chosen to fit inside that bound rather than to look
 * pretty: a week is seven daily buckets, four weeks is four weekly ones, twelve
 * weeks is six fortnightly ones. Analytics adds no new read to the product.
 *
 * The range's own TOTAL is a separate window rather than the sum of these
 * buckets, and `analytics-context.ts` explains why: the aggregate counts each
 * record once per window, so summing buckets would double-count a Task
 * completed, reopened and completed again on two different days.
 *
 * Dates are wall-calendar `YYYY-MM-DD` strings compared and stepped as integers,
 * never routed through `Date` for comparison, so a bucket boundary never shifts
 * by a timezone (ADR-022 §22.7). "Today" is always supplied by the caller as the
 * owner-calendar day.
 */

import { addCalendarDays, calendarDaysBetween } from "~/kernel/datetime";

/** The spans Analytics offers. Exactly one is always active. */
export type AnalyticsRangeId = "week" | "month" | "quarter";

export const ANALYTICS_RANGES: readonly {
  readonly id: AnalyticsRangeId;
  /** The rail's wording. */
  readonly label: string;
  /** How many owner-calendar days the span covers, ending today. */
  readonly days: number;
  /** How many days each trend bucket covers. `days / bucketDays` ≤ 8. */
  readonly bucketDays: number;
  /** What one bucket is called, for the trend's own summary sentence. */
  readonly bucketNoun: string;
}[] = [
  { id: "week", label: "7 days", days: 7, bucketDays: 1, bucketNoun: "day" },
  {
    id: "month",
    label: "4 weeks",
    days: 28,
    bucketDays: 7,
    bucketNoun: "week",
  },
  {
    id: "quarter",
    label: "12 weeks",
    days: 84,
    bucketDays: 14,
    bucketNoun: "fortnight",
  },
];

const RANGE_BY_ID = new Map(ANALYTICS_RANGES.map((range) => [range.id, range]));

/** Narrow an untrusted query-string value to a range. Defaults to the week. */
export function parseAnalyticsRange(value: string | null): AnalyticsRangeId {
  return value !== null && RANGE_BY_ID.has(value as AnalyticsRangeId)
    ? (value as AnalyticsRangeId)
    : "week";
}

/** The definition behind a range id. */
export function analyticsRange(id: AnalyticsRangeId) {
  // Non-null by construction: `AnalyticsRangeId` is exactly the map's key set.
  return RANGE_BY_ID.get(id) ?? ANALYTICS_RANGES[0];
}

/* -------------------------------------------------------------------------- */
/* Calendar arithmetic                                                         */
/* -------------------------------------------------------------------------- */

/*
 * DEBT-52 — the kernel's ONE calendar-day implementation
 * (`~/kernel/datetime`), under the names Analytics reads.
 */

/** `YYYY-MM-DD` shifted by whole days. Calendar arithmetic only — no zone. */
export const addDays = addCalendarDays;

/** Whole days from `from` to `to`; positive means `to` is later. */
export const daysBetween = calendarDaysBetween;

/* -------------------------------------------------------------------------- */
/* Windows and buckets                                                         */
/* -------------------------------------------------------------------------- */

/** An inclusive owner-calendar span. Instants are added by the loader, which is
 * the only layer that knows the owner's timezone. */
export interface AnalyticsSpan {
  readonly startIso: string;
  readonly endIso: string;
}

/** One bucket of the trend — a span, and the key the aggregate answers under. */
export interface AnalyticsBucket extends AnalyticsSpan {
  readonly key: string;
}

/**
 * The span a range covers, ending on (and including) `todayIso`.
 *
 * The span ENDS today rather than at the end of the current calendar week, so a
 * figure never counts days that have not happened. "7 days" therefore means the
 * last seven days including today, which is what an owner reads it as, and what
 * makes the previous-period comparison a like-for-like one.
 */
export function rangeSpan(
  id: AnalyticsRangeId,
  todayIso: string,
): AnalyticsSpan {
  const { days } = analyticsRange(id);
  return { startIso: addDays(todayIso, -(days - 1)), endIso: todayIso };
}

/**
 * The equally-long span immediately BEFORE `span`.
 *
 * Same length, no gap and no overlap, so "12 more than the previous 7 days" is a
 * statement about two comparable windows rather than about two arbitrary ones.
 */
export function previousSpan(span: AnalyticsSpan): AnalyticsSpan {
  const length = daysBetween(span.startIso, span.endIso) + 1;
  return {
    startIso: addDays(span.startIso, -length),
    endIso: addDays(span.startIso, -1),
  };
}

/**
 * Cut a span into the trend's buckets, oldest first.
 *
 * Buckets are laid out BACKWARD from the end of the span, so the most recent
 * bucket is always a whole one and any remainder falls at the oldest end. That
 * matters: a partial bucket at the RECENT end would draw the current period as a
 * dip every single time the page is opened mid-week, which is a chart that lies
 * about the direction of travel. A partial bucket at the old end is visible,
 * explainable and cannot be mistaken for a trend.
 *
 * The count is `ceil(days / bucketDays)` and is bounded by construction to at
 * most eight for every range in `ANALYTICS_RANGES` — see the module comment.
 */
export function rangeBuckets(
  id: AnalyticsRangeId,
  span: AnalyticsSpan,
): readonly AnalyticsBucket[] {
  const { bucketDays } = analyticsRange(id);
  const total = daysBetween(span.startIso, span.endIso) + 1;
  const count = Math.max(1, Math.ceil(total / bucketDays));
  const buckets: AnalyticsBucket[] = [];
  for (let index = count - 1; index >= 0; index -= 1) {
    const endIso = addDays(span.endIso, -(index * bucketDays));
    const rawStart = addDays(endIso, -(bucketDays - 1));
    // Clamp the oldest bucket to the span, so nothing outside the window is
    // counted into it.
    const startIso = rawStart < span.startIso ? span.startIso : rawStart;
    buckets.push({ key: `b${count - 1 - index}`, startIso, endIso });
  }
  return buckets;
}
