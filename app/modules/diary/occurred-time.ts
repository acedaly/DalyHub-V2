/**
 * DIARY-01 — owner-local ⇄ UTC conversion and Timeline day/time labelling.
 *
 * A Diary Entry stores its occurred instant as a UTC `Date` plus the IANA zone
 * captured at occurrence (`app/kernel/diary`); the Timeline groups and labels it
 * in a DISPLAY time zone. DalyHub already has ONE accepted display-zone seam —
 * `OWNER_TIME_ZONE` (`app/shared/datetime`), documented to become the
 * user/workspace timezone setting at SET-01. DIARY-01 REUSES that seam rather
 * than inventing a second convention or hardcoding a zone in the module; when
 * SET-01 lands, the Diary Timeline follows the setting with no further change.
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

import { OWNER_TIME_ZONE } from "~/shared/datetime";

/**
 * The Diary Timeline's display time zone. Reuses the single accepted owner-zone
 * seam (`OWNER_TIME_ZONE`); when SET-01 introduces a user/workspace timezone
 * preference, `OWNER_TIME_ZONE` becomes that preference and the Diary Timeline
 * follows it unchanged.
 */
export const DIARY_DISPLAY_TIME_ZONE = OWNER_TIME_ZONE;

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

/** A local wall-clock, as the value a native `datetime-local` control uses. */
const LOCAL_DATETIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** A local calendar day key, `YYYY-MM-DD`. */
const DAY_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

type ZonedParts = {
  readonly year: string;
  readonly month: string;
  readonly day: string;
  readonly hour: string;
  readonly minute: string;
  readonly second: string;
};

/**
 * The `{year…second}` an instant reads as on the wall clock of `timeZone`. Built
 * with an explicit zone and `hourCycle: "h23"` (so midnight is `00`, never `24`),
 * assembled from numeric parts so the result never depends on a locale's ordering
 * or separators.
 */
function partsInZone(instant: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    year: map.year ?? "0000",
    month: map.month ?? "01",
    day: map.day ?? "01",
    hour: map.hour ?? "00",
    minute: map.minute ?? "00",
    second: map.second ?? "00",
  };
}

/** The offset of `timeZone` (minutes east of UTC) in effect at `instant`. */
function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = partsInZone(instant, timeZone);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/**
 * Convert an owner-local wall-clock (`YYYY-MM-DDTHH:MM`, as a `datetime-local`
 * control yields) in `timeZone` to the UTC instant the kernel stores. DST-aware:
 * the offset is resolved at the target instant, then re-resolved once in case the
 * naive guess landed on the wrong side of a transition. Returns `null` for a
 * syntactically invalid or out-of-range value (the caller surfaces a field
 * error). A nonexistent spring-forward local time resolves to a deterministic,
 * best-effort instant rather than throwing.
 */
export function ownerLocalToUtc(local: string, timeZone: string): Date | null {
  const match = LOCAL_DATETIME_PATTERN.exec(local);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59) return null;

  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute);
  const firstOffset = zoneOffsetMinutes(new Date(naiveUtc), timeZone);
  let utcMs = naiveUtc - firstOffset * 60_000;
  const secondOffset = zoneOffsetMinutes(new Date(utcMs), timeZone);
  if (secondOffset !== firstOffset) {
    utcMs = naiveUtc - secondOffset * 60_000;
  }
  const result = new Date(utcMs);
  if (Number.isNaN(result.getTime())) return null;
  // Require the instant to round-trip EXACTLY to the entered wall-clock. This
  // rejects two classes of input that cannot faithfully represent what the user
  // typed: an invalid calendar date (JS normalises `2026-02-31T10:00` to March),
  // and a nonexistent spring-forward local time (`2026-10-04T02:30` in Sydney,
  // which the two-offset resolution shifts to 03:30). Both return null so the
  // route surfaces the existing "valid date and time" field error. An autumn
  // OVERLAP time round-trips to itself, so it is accepted deterministically at
  // the standard-time (post-transition) occurrence — see the tests.
  if (utcToOwnerLocal(result, timeZone) !== local) return null;
  return result;
}

/**
 * The inverse of {@link ownerLocalToUtc}: the owner-local wall-clock
 * (`YYYY-MM-DDTHH:MM`) an instant reads as in `timeZone` — used to seed the
 * editor's "when" control from a stored UTC `occurredAt`.
 */
export function utcToOwnerLocal(instant: Date, timeZone: string): string {
  const parts = partsInZone(instant, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** The local `HH:MM` time an instant reads as in `timeZone` (24-hour). */
export function formatZonedTime(instant: Date, timeZone: string): string {
  const parts = partsInZone(instant, timeZone);
  return `${parts.hour}:${parts.minute}`;
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
