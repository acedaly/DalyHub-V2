/**
 * Shared owner-calendar date helpers.
 *
 * The owner's *calendar* date must be formatted in the owner's timezone, not the
 * runtime's: Cloudflare Workers run in UTC, so a naïve `new Date()` format shows
 * the previous day during the Australian morning (the UTC/AEST offset window) —
 * misleading on any daily surface. These helpers were introduced by TODAY-01 (as
 * `app/modules/today/date.ts`) and promoted to a shared module in PROJ-01 because
 * Today, Tasks (the re-homed Task record surface) and Projects all resolve the
 * owner's day — so the calendar logic must live in one place, not one module.
 *
 * SET-01 persists the owner/workspace timezone and passes it into these helpers
 * from server loaders. The constant below remains the deterministic application
 * default (`Australia/Sydney`) for no-row/fallback paths.
 */

/** The default owner-calendar timezone when no persisted preference exists. */
export const OWNER_TIME_ZONE = "Australia/Sydney";

/**
 * Format an instant as the owner's calendar date (e.g. "Sunday 19 July 2026"),
 * resolved in the provided timezone so it is correct across the UTC/AEST/AEDT day
 * boundary regardless of the runtime timezone.
 */
export function formatTodayDate(
  now: Date,
  timeZone: string = OWNER_TIME_ZONE,
): string {
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  }).format(now);
}

/**
 * The owner's current calendar date as `YYYY-MM-DD`, resolved in the provided timezone
 * — the reference date for date-only comparisons (e.g. overdue detection), so
 * "overdue" matches the owner's day, not the UTC runtime's. Uses the `en-CA` locale
 * (which formats as `YYYY-MM-DD`), assembled from parts to stay locale-stable.
 */
export function ownerCalendarIso(
  now: Date,
  timeZone: string = OWNER_TIME_ZONE,
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** A local wall-clock, as the value a native `datetime-local` control uses. */
const LOCAL_DATETIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

type ZonedParts = {
  readonly year: string;
  readonly month: string;
  readonly day: string;
  readonly hour: string;
  readonly minute: string;
  readonly second: string;
};

/**
 * The numeric wall-clock parts an instant reads as in `timeZone`.
 * This is explicit-zone formatting, never browser/server local timezone.
 */
export function partsInTimeZone(instant: Date, timeZone: string): ZonedParts {
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
  const parts = partsInTimeZone(instant, timeZone);
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
 * Convert an owner-local wall-clock (`YYYY-MM-DDTHH:MM`) in `timeZone` to the UTC
 * instant the kernel stores. Returns `null` for malformed values, impossible
 * calendar dates and nonexistent spring-forward local times.
 */
export function ownerLocalToUtc(local: string, timeZone: string): Date | null {
  const match = LOCAL_DATETIME_PATTERN.exec(local);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
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
  return utcToOwnerLocal(result, timeZone) === local ? result : null;
}

/**
 * The inverse of {@link ownerLocalToUtc}: a native `datetime-local` wall-clock
 * string for an instant in `timeZone`.
 */
export function utcToOwnerLocal(instant: Date, timeZone: string): string {
  const parts = partsInTimeZone(instant, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
