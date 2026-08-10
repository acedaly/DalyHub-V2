/**
 * DIARY-01 — owner-local ⇄ UTC conversion and Timeline day/time labelling.
 *
 * A Diary Entry stores its occurred instant as a UTC `Date` plus the IANA zone
 * captured at occurrence (`app/kernel/diary`); the Timeline groups and labels it
 * in a DISPLAY time zone. Since SET-01 the route reads the persisted
 * owner/workspace timezone and passes it into the grouping/window helpers. This
 * module keeps `DIARY_DISPLAY_TIME_ZONE` only as the deterministic default
 * fallback for a workspace with no stored preference.
 *
 * Capture and editing let the owner pick a LOCAL wall-clock ("when did this
 * happen?"). This module converts that owner-local wall-clock to the UTC instant
 * the kernel stores, and back, DST-aware and deterministically: every conversion
 * is done against an EXPLICIT IANA zone via `Intl.DateTimeFormat`, never the
 * machine's local zone (the DS-05 hydration hazard is machine-local formatting,
 * not explicitly-zoned formatting), so the server and client agree byte-for-byte.
 *
 * Day HEADINGS ("Today"/"Yesterday"/absolute) are computed from a `YYYY-MM-DD`
 * local day key against a single server-rendered reference day, using fixed
 * English month/weekday tables (not a locale-dependent `Intl` format), mirroring
 * the Activity Feed's deterministic heading approach.
 */

import { DEFAULT_OWNER_TIME_ZONE } from "~/kernel/preferences";
import { ownerLocalToUtc, partsInTimeZone } from "~/shared/datetime";

export { ownerLocalToUtc, utcToOwnerLocal } from "~/shared/datetime";

/**
 * Default Diary display timezone when no persisted preference is available.
 * AUDIT-14 — an alias of the ONE product-wide fallback, so "no preference yet"
 * resolves to the same day in the Diary as everywhere else.
 */
export const DIARY_DISPLAY_TIME_ZONE = DEFAULT_OWNER_TIME_ZONE;

const MONTHS = [
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
] as const;

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** A local calendar day key, `YYYY-MM-DD`. */
const DAY_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The local `HH:MM` time an instant reads as in `timeZone` (24-hour). */
export function formatZonedTime(instant: Date, timeZone: string): string {
  const parts = partsInTimeZone(instant, timeZone);
  return `${parts.hour}:${parts.minute}`;
}

/** An absolute `"20 May 2024"` for an instant, resolved in `timeZone`. */
export function formatZonedDateLong(instant: Date, timeZone: string): string {
  const parts = partsInTimeZone(instant, timeZone);
  const month = MONTHS[Number(parts.month) - 1] ?? parts.month;
  return `${Number(parts.day)} ${month} ${parts.year}`;
}

/** An absolute `"20 May 2024 at 06:30"` for an instant, resolved in `timeZone`. */
export function formatZonedDateTimeLong(
  instant: Date,
  timeZone: string,
): string {
  return `${formatZonedDateLong(instant, timeZone)} at ${formatZonedTime(instant, timeZone)}`;
}

/** Parse a `YYYY-MM-DD` day key to its UTC-midnight instant, or `null`. */
function dayKeyToUtcMidnight(dayKey: string): Date | null {
  const match = DAY_KEY_PATTERN.exec(dayKey);
  if (!match) return null;
  const instant = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  return Number.isNaN(instant.getTime()) ? null : instant;
}

/** The `YYYY-MM-DD` calendar day immediately before `dayKey`. */
function previousDayKey(dayKey: string): string | null {
  return adjacentDayKey(dayKey, -1);
}

/** The `YYYY-MM-DD` calendar day immediately after `dayKey`. */
function nextDayKey(dayKey: string): string | null {
  return adjacentDayKey(dayKey, 1);
}

/**
 * The `YYYY-MM-DD` calendar day `deltaDays` away from `dayKey` (pure date
 * arithmetic), or `null` for a malformed key. The Day-mode navigator's
 * previous/next controls step through days with this.
 */
export function addDaysToDayKey(
  dayKey: string,
  deltaDays: number,
): string | null {
  return adjacentDayKey(dayKey, deltaDays);
}

/**
 * Whether `dayKey` is a syntactically valid, real `YYYY-MM-DD` local day in
 * `timeZone` (rejects e.g. month 13 and a nonexistent calendar date). A URL
 * `?date=` that fails this degrades to today rather than a broken range.
 */
export function isValidDayKey(dayKey: string, timeZone: string): boolean {
  return startOfLocalDayUtc(dayKey, timeZone) !== null;
}

/** An absolute `"Monday, 20 May 2024"` heading for a `YYYY-MM-DD` day key. */
export function formatDayKeyLong(dayKey: string): string {
  const midnight = dayKeyToUtcMidnight(dayKey);
  if (!midnight) return dayKey;
  const weekday = WEEKDAYS[midnight.getUTCDay()];
  return `${weekday}, ${midnight.getUTCDate()} ${MONTHS[midnight.getUTCMonth()]} ${midnight.getUTCFullYear()}`;
}

/**
 * UIX-04 §18 — one day in the week strip: its short weekday, its day number and
 * the month it belongs to.
 *
 * Deterministic and locale-independent for the same reason every other label in
 * this file is: the strip is server-rendered and hydrated, and a locale-dependent
 * `Intl` format would let the two disagree.
 */
export type DiaryStripDay = {
  readonly dayKey: string;
  /** `"Mon"` — the strip's own label. */
  readonly weekday: string;
  /** `8` — the day of the month, the strip's largest text. */
  readonly dayOfMonth: number;
  /** `"August"` — used only for the strip's month caption. */
  readonly month: string;
};

/**
 * The seven days of the calendar week containing `dayKey`, Monday first.
 *
 * Monday rather than Sunday because a Diary is used to look back over a working
 * week, and Monday-first keeps Saturday and Sunday adjacent at the end of the
 * strip where they read as one weekend rather than as two ends of a row.
 *
 * Returns an empty array for a malformed key, so a bad `?date=` degrades to no
 * strip rather than to a broken one.
 */
export function weekStripDays(dayKey: string): readonly DiaryStripDay[] {
  const midnight = dayKeyToUtcMidnight(dayKey);
  if (!midnight) return [];
  // `getUTCDay()` is 0=Sunday; shift so Monday is 0.
  const offsetFromMonday = (midnight.getUTCDay() + 6) % 7;
  const days: DiaryStripDay[] = [];
  for (let index = 0; index < 7; index += 1) {
    const key = adjacentDayKey(dayKey, index - offsetFromMonday);
    if (key === null) return [];
    const day = dayKeyToUtcMidnight(key);
    if (!day) return [];
    days.push({
      dayKey: key,
      weekday: WEEKDAYS[day.getUTCDay()].slice(0, 3),
      dayOfMonth: day.getUTCDate(),
      month: MONTHS[day.getUTCMonth()],
    });
  }
  return days;
}

/**
 * The strip's month caption — `"August 2026"`, or `"July – August 2026"` when
 * the week straddles two months, so the strip never leaves the reader guessing
 * which August the 3rd belongs to.
 */
export function weekStripCaption(days: readonly DiaryStripDay[]): string {
  if (days.length === 0) return "";
  const first = days[0];
  const last = days[days.length - 1];
  const year = last.dayKey.slice(0, 4);
  if (first.month === last.month) return `${last.month} ${year}`;
  const firstYear = first.dayKey.slice(0, 4);
  return firstYear === year
    ? `${first.month} – ${last.month} ${year}`
    : `${first.month} ${firstYear} – ${last.month} ${year}`;
}

/** A compact `"Mon, 20 May 2024"` label for the Day-mode date navigator. */
export function formatDayKeyMedium(dayKey: string): string {
  const midnight = dayKeyToUtcMidnight(dayKey);
  if (!midnight) return dayKey;
  const weekday = WEEKDAYS[midnight.getUTCDay()].slice(0, 3);
  return `${weekday}, ${midnight.getUTCDate()} ${MONTHS[midnight.getUTCMonth()]} ${midnight.getUTCFullYear()}`;
}

/** The calendar day `deltaDays` away from `dayKey` (pure date arithmetic). */
function adjacentDayKey(dayKey: string, deltaDays: number): string | null {
  const midnight = dayKeyToUtcMidnight(dayKey);
  if (!midnight) return null;
  const shifted = new Date(midnight.getTime() + deltaDays * 86_400_000);
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
}

/**
 * The UTC instant at the START of a local `YYYY-MM-DD` day in `timeZone` (its
 * local midnight), or null for a malformed key. The inclusive lower bound of a
 * day-range filter.
 */
export function startOfLocalDayUtc(
  dayKey: string,
  timeZone: string,
): Date | null {
  return ownerLocalToUtc(`${dayKey}T00:00`, timeZone);
}

/**
 * The INCLUSIVE last UTC instant of a local `YYYY-MM-DD` day in `timeZone` — the
 * NEXT local day's midnight minus 1 ms. Using this (rather than a `23:59` bound)
 * keeps the final 59.999 s of the day inside an inclusive `occurredTo` filter.
 * Returns null for a malformed key.
 */
export function endOfLocalDayUtc(
  dayKey: string,
  timeZone: string,
): Date | null {
  // Reject the same invalid day keys the start bound rejects (e.g. month 13),
  // so a bad `to` filter produces no bound rather than a normalised one.
  if (startOfLocalDayUtc(dayKey, timeZone) === null) return null;
  const next = nextDayKey(dayKey);
  if (!next) return null;
  const nextStart = ownerLocalToUtc(`${next}T00:00`, timeZone);
  return nextStart ? new Date(nextStart.getTime() - 1) : null;
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/**
 * A friendly heading for a `YYYY-MM-DD` local day key, relative to the reference
 * day key `todayKey` (both in the display zone): `"Today"`, `"Yesterday"`, or an
 * absolute `"Saturday, 19 July 2026"`. Deterministic and locale-independent, so
 * the server and client render identical text (no hydration mismatch).
 */
export function diaryDayHeading(dayKey: string, todayKey: string): string {
  if (dayKey === todayKey) return "Today";
  if (dayKey === previousDayKey(todayKey)) return "Yesterday";
  const midnight = dayKeyToUtcMidnight(dayKey);
  if (!midnight) return dayKey;
  const weekday = WEEKDAYS[midnight.getUTCDay()];
  return `${weekday}, ${midnight.getUTCDate()} ${MONTHS[midnight.getUTCMonth()]} ${midnight.getUTCFullYear()}`;
}
