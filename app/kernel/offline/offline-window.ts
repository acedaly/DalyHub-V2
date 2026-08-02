/**
 * PWA-04 — the seven-day offline retention window.
 *
 * ONE definition of "the seven-day snapshot", shared by the server that builds it
 * and the browser that prunes it. If the two ever disagreed, the device would
 * either quietly keep records the policy says it must drop, or drop records the
 * server just sent — so the arithmetic lives here and nothing re-derives it.
 *
 * ── The policy, stated exactly ───────────────────────────────────────────────
 * The window is **calendar days in the OWNER's timezone**, not "the last 168
 * hours":
 *
 *     [ today − 7 ] … [ today − 1 ] … [ today ] … [ today + 1 ] … [ today + 7 ]
 *       ^ the previous seven days      ^ today     ^ the next seven days
 *
 * Both ends are INCLUSIVE, so the window is fifteen calendar days wide. Recent
 * records (notes, diary entries, completed tasks, meetings held) are retained by
 * the past half; upcoming work (tasks due or scheduled, meetings) by the future
 * half.
 *
 * ── Why calendar arithmetic, not milliseconds ────────────────────────────────
 * "Seven days ago" cannot be computed by subtracting `7 × 86_400_000` from an
 * instant: in Australia/Sydney the DST transitions make two days a year 23 or 25
 * hours long, so a millisecond subtraction lands on the wrong calendar date twice
 * a year and, for a user in a UTC+11 zone, is off by one day for part of every
 * day. Everything below therefore works on `YYYY-MM-DD` strings, converting to a
 * UTC midnight ONLY as an intermediate for day counting — a representation with
 * no DST at all. The owner's timezone is applied exactly once, by the CALLER,
 * which resolves the owner's calendar date before calling in. That keeps this
 * module a pure kernel contract with no `Intl`, no locale and no dependency on
 * the shared UI date helpers.
 */

/** How many calendar days BEFORE today the snapshot retains. */
export const OFFLINE_RETENTION_PAST_DAYS = 7;

/** How many calendar days AFTER today the snapshot retains. */
export const OFFLINE_RETENTION_FUTURE_DAYS = 7;

/** A calendar date, `YYYY-MM-DD`, in the owner's timezone. */
export type CalendarIso = string;

const CALENDAR_ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a well-formed `YYYY-MM-DD` naming a real calendar date. */
export function isCalendarIso(value: unknown): value is CalendarIso {
  if (typeof value !== "string") return false;
  const match = CALENDAR_ISO_PATTERN.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  const utc = Date.UTC(Number(year), Number(month) - 1, Number(day));
  // Round-trip through UTC so "2026-02-30" is rejected rather than rolled over.
  return new Date(utc).toISOString().slice(0, 10) === value;
}

/**
 * Shift a calendar date by whole days. Pure calendar arithmetic: the date is
 * interpreted at UTC midnight, where every day is exactly 24 hours, so no DST
 * transition in any timezone can move the result.
 */
export function addCalendarDays(iso: CalendarIso, days: number): CalendarIso {
  const match = CALENDAR_ISO_PATTERN.exec(iso);
  if (!match) {
    throw new RangeError(`Not a calendar date: ${iso}`);
  }
  const [, year, month, day] = match;
  const shifted = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day) + days),
  );
  return shifted.toISOString().slice(0, 10);
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function calendarDaysBetween(
  from: CalendarIso,
  to: CalendarIso,
): number {
  const asUtc = (iso: CalendarIso) => {
    const match = CALENDAR_ISO_PATTERN.exec(iso);
    if (!match) throw new RangeError(`Not a calendar date: ${iso}`);
    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  };
  return Math.round((asUtc(to) - asUtc(from)) / 86_400_000);
}

/** The retention window: the owner's today and the inclusive bounds around it. */
export interface OfflineWindow {
  /** The owner's calendar date at the moment the window was resolved. */
  readonly todayIso: CalendarIso;
  /** The earliest retained calendar date (inclusive) — `today − 7`. */
  readonly startIso: CalendarIso;
  /** The latest retained calendar date (inclusive) — `today + 7`. */
  readonly endIso: CalendarIso;
  /** The timezone the window was resolved in. */
  readonly timezone: string;
}

/**
 * Resolve the retention window around an owner calendar date.
 *
 * `todayIso` must already be the OWNER's calendar date — resolve it with
 * `ownerCalendarIso(now, timezone)` from `~/shared/datetime` at the call site.
 * `timezone` is carried through so the window can be turned back into instant
 * bounds, and so a stored snapshot records which timezone produced it.
 */
export function offlineWindow(
  todayIso: CalendarIso,
  timezone: string,
): OfflineWindow {
  if (!isCalendarIso(todayIso)) {
    throw new RangeError(`Not a calendar date: ${todayIso}`);
  }
  return {
    todayIso,
    startIso: addCalendarDays(todayIso, -OFFLINE_RETENTION_PAST_DAYS),
    endIso: addCalendarDays(todayIso, OFFLINE_RETENTION_FUTURE_DAYS),
    timezone,
  };
}

/** True when a calendar date falls inside the window (both ends inclusive). */
export function isWithinWindow(
  iso: CalendarIso,
  window: OfflineWindow,
): boolean {
  return iso >= window.startIso && iso <= window.endIso;
}

/**
 * The UTC instant bounds of the window, for querying stored timestamps. The start
 * is the first moment of `startIso` in the owner's timezone; the end is the first
 * moment of the day AFTER `endIso`, so the comparison is a half-open
 * `[start, end)` interval and no record on the final day is missed by a
 * millisecond.
 *
 * `resolveZonedMidnight` is injected so this stays pure and testable; production
 * passes the shared `ownerLocalToUtc`.
 */
export function windowInstantBounds(
  window: OfflineWindow,
  resolveZonedMidnight: (local: string, timezone: string) => Date | null,
): { readonly startUtc: Date; readonly endUtc: Date } {
  const startUtc =
    resolveZonedMidnight(`${window.startIso}T00:00`, window.timezone) ??
    new Date(`${window.startIso}T00:00:00.000Z`);
  const dayAfterEnd = addCalendarDays(window.endIso, 1);
  const endUtc =
    resolveZonedMidnight(`${dayAfterEnd}T00:00`, window.timezone) ??
    new Date(`${dayAfterEnd}T00:00:00.000Z`);
  return { startUtc, endUtc };
}
