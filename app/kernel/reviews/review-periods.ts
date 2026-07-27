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

function isoFromDate(date: Date): string {
  const y = date.getUTCFullYear().toString().padStart(4, "0");
  const m = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const d = date.getUTCDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addCalendarDays(iso: string, days: number): string {
  const { y, m, d } = parts(iso);
  return isoFromDate(new Date(Date.UTC(y, m - 1, d + days)));
}

export function addCalendarMonths(iso: string, months: number): string {
  const { y, m, d } = parts(iso);
  return isoFromDate(new Date(Date.UTC(y, m - 1 + months, d)));
}

export function weeklyPeriod(
  todayIso: string,
  firstDayOfWeek: FirstDayOfWeek,
): ReviewPeriod {
  const { y, m, d } = parts(todayIso);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay();
  const startIndex = firstDayOfWeek === "sunday" ? 0 : 1;
  const delta = (day - startIndex + 7) % 7;
  const start = isoFromDate(new Date(Date.UTC(y, m - 1, d - delta)));
  return { start, end: addCalendarDays(start, 6) };
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
