/**
 * DEBT-52 — the ONE calendar-day arithmetic in the kernel.
 *
 * A DalyHub date-only value is a wall-calendar day (`YYYY-MM-DD`), never an
 * instant: ADR-022 makes the owner's day a server fact and ADR-030 forbids
 * routing a date-only value through a timezone. Moving one along the calendar
 * is therefore integer arithmetic anchored at UTC midnight — DST-free by
 * construction, and incapable of the off-by-one a local-time `Date` produces.
 *
 * The arithmetic itself is three lines, which is exactly why the kernel grew
 * EIGHT copies of it: `addDaysToIsoDate` in `alignment` and again in
 * `project-health`, `addPlanningDays` in `planning`, `addCalendarDays` in
 * `tasks/task-recurrence` and again in `offline`, `shiftCalendarDate` in
 * `tasks/task-validation`, plus three private `epochDay` parsers and a
 * `daysBetween` in `assets`. Each was correct; the debt was that a change to
 * the inclusive/exclusive convention had to be found in eight places under
 * eight different entity names, and that a ninth copy cost nothing to write.
 *
 * So this module is the authority and every one of those names survives as a
 * thin, domain-worded re-export. Nothing about any caller's behaviour changes —
 * including the two deliberately different parse contracts, which are published
 * here rather than re-derived:
 *
 *   - {@link calendarEpochDay} checks the SHAPE and throws. It is what the
 *     evaluators want: their inputs are values the kernel itself produced, so a
 *     malformed one is a programming error and must be loud.
 *   - {@link tryCalendarEpochDay} additionally round-trips the parse and
 *     returns `null` instead of throwing. It is what the planning surfaces
 *     want: their inputs come from a URL, so `2026-02-31` must be REFUSED
 *     rather than silently becoming 3 March.
 *
 * Storage-, platform- and framework-independent: no `Date.now()`, no timezone
 * database, no I/O. Every function here is pure and total over its stated
 * domain.
 */

/** The wall-calendar shape every date-only value in DalyHub takes. */
const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Milliseconds in a calendar day at the UTC-midnight anchor. */
const MS_PER_DAY = 86_400_000;

/**
 * The epoch-day number of a `YYYY-MM-DD` calendar date.
 *
 * Shape-checked, not range-checked: `2026-02-31` parses to 3 March, which is
 * the long-standing behaviour of every evaluator that used to carry its own
 * copy. Use {@link tryCalendarEpochDay} where the input is untrusted.
 *
 * @throws RangeError when `iso` is not `YYYY-MM-DD`.
 */
export function calendarEpochDay(iso: string): number {
  const match = CALENDAR_DATE_PATTERN.exec(iso);
  if (match === null) {
    throw new RangeError(`Not a YYYY-MM-DD calendar date: ${iso}`);
  }
  return Math.floor(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) /
      MS_PER_DAY,
  );
}

/**
 * The epoch-day number of a `YYYY-MM-DD` calendar date, or `null`.
 *
 * Stricter than {@link calendarEpochDay} in the one way that matters for an
 * untrusted value: the parse must ROUND-TRIP, so a date whose components do not
 * name a real day (`2026-02-31`, `2026-13-01`) is refused rather than rolled
 * over into a different day.
 */
export function tryCalendarEpochDay(iso: string): number | null {
  const match = CALENDAR_DATE_PATTERN.exec(iso);
  if (match === null) {
    return null;
  }
  const utc = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  if (Number.isNaN(utc)) {
    return null;
  }
  return new Date(utc).toISOString().slice(0, 10) === iso
    ? Math.round(utc / MS_PER_DAY)
    : null;
}

/** True when `value` is a real wall-calendar date (round-trip validated). */
export function isCalendarDate(value: unknown): value is string {
  return typeof value === "string" && tryCalendarEpochDay(value) !== null;
}

/** Format an epoch-day number back to `YYYY-MM-DD`. */
export function calendarDateFromEpochDay(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * Add whole days to a `YYYY-MM-DD` calendar date.
 *
 * @throws RangeError when `iso` is not `YYYY-MM-DD`.
 */
export function addCalendarDays(iso: string, days: number): string {
  return calendarDateFromEpochDay(calendarEpochDay(iso) + days);
}

/**
 * Whole calendar days from `fromIso` up to `toIso` — positive when `toIso` is
 * later, negative when it is earlier, zero on the same day.
 *
 * @throws RangeError when either value is not `YYYY-MM-DD`.
 */
export function calendarDaysBetween(fromIso: string, toIso: string): number {
  return calendarEpochDay(toIso) - calendarEpochDay(fromIso);
}

/**
 * The zero-based weekday of a calendar date, Sunday `0` … Saturday `6`.
 *
 * Epoch day 0 (1970-01-01) was a Thursday, so `(day + 4) mod 7` is the weekday
 * — integer arithmetic on a day number, never a `Date` mutated through
 * `setDate`.
 */
export function calendarWeekday(iso: string): number {
  return (((calendarEpochDay(iso) + 4) % 7) + 7) % 7;
}

/** The number of days in a calendar month (`month` is 1-based). */
export function daysInCalendarMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Build a `YYYY-MM-DD` calendar date from its parts (`month` is 1-based). */
export function calendarDateFromParts(
  year: number,
  month: number,
  day: number,
): string {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

/**
 * `YYYY-MM-DD` shifted by whole calendar MONTHS, clamping the day to the target
 * month's length: 31 January minus one month is 28 February (29 in a leap
 * year), never 3 March.
 *
 * Clamping rather than overflowing is what makes a sequence of month boundaries
 * computed from ONE anchor strictly monotonic — `addCalendarMonths(end, -1)`,
 * `-2`, `-3` … always step back exactly one month each, whatever the anchor's
 * day of month. V2.9's month buckets (`~/kernel/history`) rely on that: the
 * boundaries have to tile a window with no gap and no overlap, and an
 * overflowing 31 March − 1 month = 3 March would put two boundaries in the same
 * month and produce a bucket with negative length.
 *
 * Added by V2.9 INS-01 rather than re-derived at the call site, for DEBT-52's
 * reason: calendar arithmetic has one home.
 */
export function addCalendarMonths(iso: string, months: number): string {
  const epoch = calendarEpochDay(iso);
  const anchor = new Date(epoch * MS_PER_DAY);
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth() + 1 + months;
  const day = anchor.getUTCDate();
  // Normalise the (possibly out-of-range) month into a year/month pair before
  // clamping, so `-14` months is a year and two months back rather than a
  // month index nothing can bound the day against.
  const targetYear = year + Math.floor((month - 1) / 12);
  const targetMonth = ((((month - 1) % 12) + 12) % 12) + 1;
  const last = daysInCalendarMonth(targetYear, targetMonth);
  return calendarDateFromParts(
    targetYear,
    targetMonth,
    day < last ? day : last,
  );
}
