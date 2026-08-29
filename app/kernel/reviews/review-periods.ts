import {
  addCalendarDays as addKernelCalendarDays,
  calendarDateFromParts,
} from "~/kernel/datetime";
import { planningWeekStart } from "~/kernel/planning";
import type { DateFormat, FirstDayOfWeek } from "~/kernel/preferences";
import { formatPreferenceDate } from "~/kernel/preferences";
import type { ReviewType } from "./review";
import { validateDateOnly } from "./review-validation";

export interface ReviewPeriod {
  readonly start: string;
  readonly end: string;
}

function parts(iso: string): {
  readonly y: number;
  readonly m: number;
  readonly d: number;
} {
  validateDateOnly(iso, "periodStart");
  const [y, m, d] = iso.split("-").map((part) => Number(part));
  return { y, m, d };
}

/*
 * DEBT-52 — the arithmetic is the kernel's ONE implementation
 * (`~/kernel/datetime`). `parts` stays, because the REFUSAL is this domain's:
 * a bad period boundary is a Review validation error, not a `RangeError`.
 */
function isoFromDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addCalendarDays(iso: string, days: number): string {
  parts(iso);
  return addKernelCalendarDays(iso, days);
}

export function addCalendarMonths(iso: string, months: number): string {
  const { y, m, d } = parts(iso);
  return calendarDateFromParts(y, m + months, d);
}

/**
 * The owner's calendar week containing `todayIso`.
 *
 * DEBT-152 / DEBT-154 — `planningWeekStart` is the product's ONE answer to
 * "which week is this?", and this function used to derive its own. The two
 * agreed, which is precisely why the drift was invisible: `weeklyPeriod`,
 * `planningWeek`, `habitWeek` and Today's strip were four derivations of one
 * rule, and only three of them read the preference.
 */
export function weeklyPeriod(
  todayIso: string,
  firstDayOfWeek: FirstDayOfWeek,
): ReviewPeriod {
  parts(todayIso);
  const start = planningWeekStart(todayIso, firstDayOfWeek);
  return { start, end: addKernelCalendarDays(start, 6) };
}

export function monthlyPeriod(todayIso: string): ReviewPeriod {
  const { y, m } = parts(todayIso);
  const start = `${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}-01`;
  const end = isoFromDate(new Date(Date.UTC(y, m, 0)));
  return { start, end };
}

export function quarterlyPeriod(todayIso: string): ReviewPeriod {
  const { y, m } = parts(todayIso);
  const quarterStartMonth = Math.floor((m - 1) / 3) * 3 + 1;
  const start = `${y.toString().padStart(4, "0")}-${quarterStartMonth
    .toString()
    .padStart(2, "0")}-01`;
  const end = isoFromDate(new Date(Date.UTC(y, quarterStartMonth + 2, 0)));
  return { start, end };
}

export function annualPeriod(todayIso: string): ReviewPeriod {
  const { y } = parts(todayIso);
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}

export function currentReviewPeriod(
  type: ReviewType,
  todayIso: string,
  firstDayOfWeek: FirstDayOfWeek,
): ReviewPeriod {
  switch (type) {
    case "weekly":
      return weeklyPeriod(todayIso, firstDayOfWeek);
    case "monthly":
      return monthlyPeriod(todayIso);
    case "quarterly":
      return quarterlyPeriod(todayIso);
    case "annual":
      return annualPeriod(todayIso);
    case "custom":
      return { start: todayIso, end: todayIso };
  }
}

const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function monthYear(iso: string): string {
  const { y, m } = parts(iso);
  return `${MONTH_LONG[m - 1]} ${y}`;
}

export function quarterLabel(iso: string): string {
  const { y, m } = parts(iso);
  return `Q${Math.floor((m - 1) / 3) + 1} ${y}`;
}

function compactRange(
  start: string,
  end: string,
  dateFormat: DateFormat,
): string {
  const s = parts(start);
  const e = parts(end);
  if (dateFormat !== "d_mmm_yyyy") {
    return `${formatPreferenceDate(start, dateFormat)}–${formatPreferenceDate(
      end,
      dateFormat,
    )}`;
  }
  if (s.y === e.y && s.m === e.m) {
    return `${s.d} ${MONTH_LONG[s.m - 1]}–${e.d} ${MONTH_LONG[e.m - 1]} ${e.y}`;
  }
  if (s.y === e.y) {
    return `${s.d} ${MONTH_LONG[s.m - 1]}–${e.d} ${MONTH_LONG[e.m - 1]} ${e.y}`;
  }
  return `${s.d} ${MONTH_LONG[s.m - 1]} ${s.y}–${e.d} ${MONTH_LONG[e.m - 1]} ${e.y}`;
}

export function defaultReviewTitle(input: {
  readonly type: ReviewType;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly dateFormat: DateFormat;
}): string {
  switch (input.type) {
    case "weekly":
      return `Weekly Review — ${compactRange(input.periodStart, input.periodEnd, input.dateFormat)}`;
    case "monthly":
      return `Monthly Review — ${monthYear(input.periodStart)}`;
    case "quarterly":
      return `Quarterly Review — ${quarterLabel(input.periodStart)}`;
    case "annual":
      return `Annual Review — ${parts(input.periodStart).y}`;
    case "custom":
      return `Custom Review — ${compactRange(input.periodStart, input.periodEnd, input.dateFormat)}`;
  }
}

/**
 * STEER-05 — the label a period wears, wherever a surface names one.
 *
 * It lived in `app/modules/reviews/review-view.ts` (with its own private
 * `monthYear` and `quarterLabel`, duplicating this file's) until Today needed to
 * name the week it is offering. A module may not import another module's
 * internals, and a second implementation is how the Reviews collection and
 * Today come to print two different names for one week — so the rule moved down
 * beside `currentReviewPeriod`, which is the authority it labels. The Reviews
 * module re-exports it from its old path, so no call site changed.
 */
export function reviewPeriodLabel(
  type: ReviewType,
  periodStart: string,
  periodEnd: string,
  dateFormat: DateFormat,
): string {
  if (type === "monthly") return monthYear(periodStart);
  if (type === "quarterly") return quarterLabel(periodStart);
  if (type === "annual") return periodStart.slice(0, 4);
  if (periodStart === periodEnd) {
    return formatPreferenceDate(periodStart, dateFormat);
  }
  return `${formatPreferenceDate(periodStart, dateFormat)}–${formatPreferenceDate(
    periodEnd,
    dateFormat,
  )}`;
}
