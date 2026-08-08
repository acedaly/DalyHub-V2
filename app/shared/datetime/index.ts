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
 * ## AUDIT-14 — the timezone is always an argument, never a default
 *
 * SET-01 persists the owner's timezone, and that stored value is the ONE
 * authority for "which calendar day is it for the owner?". These helpers used to
 * default it to a hard-coded `Australia/Sydney`, which meant a call site could
 * silently answer the question WITHOUT consulting the owner — and several did:
 * Task paths resolved the stored timezone while Asset history, obligations and
 * the obligation→task gateway resolved Sydney, so one instant became two
 * different calendar dates in one product for any owner living elsewhere.
 *
 * The parameter is therefore required. There is nothing to forget: a caller that
 * cannot name a timezone does not compile, and the timezone comes from
 * `WorkspaceScope.ownerTimeZone()` on the server or from a value the server
 * resolved on the client. The sole fallback for "no stored preference at all"
 * is `DEFAULT_OWNER_TIME_ZONE` in `~/kernel/preferences`, applied where the
 * preference is READ — not here.
 *
 * These functions remain pure and clock-free: every one takes the instant it is
 * asked about. UTC timestamps stay UTC timestamps; only the CALENDAR reading of
 * an instant is zoned.
 */

/**
 * Format an instant as the owner's calendar date (e.g. "Sunday 19 July 2026"),
 * resolved in the provided timezone so it is correct across the UTC/AEST/AEDT day
 * boundary regardless of the runtime timezone.
 */
export function formatTodayDate(now: Date, timeZone: string): string {
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
export function ownerCalendarIso(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * A reusable "instant → the owner's calendar date" function for one timezone.
 *
 * `ownerCalendarIso` builds an `Intl.DateTimeFormat` on every call, which is the
 * right shape for the once-per-request use it was written for and the wrong one
 * for a loop: the offline snapshot resolves a calendar date for every record it
 * stores, hundreds at a time, on a phone. This binds the formatter once.
 *
 * It also accepts the ISO string form directly, because the callers that need it
 * in bulk are reading stored records rather than holding `Date` objects. A value
 * that is not a usable instant resolves to `null` rather than to a plausible
 * wrong date.
 *
 * An unusable timezone falls back to the UTC reading instead of throwing. That
 * is wrong by at most one day at a day boundary, which is strictly better than
 * failing whatever the caller was doing — and every caller here is doing
 * something (storing a snapshot, pruning) that must not be lost to a bad
 * preference value.
 */
export function ownerCalendarDateResolver(
  timeZone: string,
): (value: Date | string | null | undefined) => string | null {
  let formatter: Intl.DateTimeFormat | null;
  try {
    formatter = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone,
    });
  } catch {
    formatter = null;
  }
  return (value) => {
    if (value === null || value === undefined) return null;
    const at = typeof value === "string" ? new Date(value) : value;
    if (Number.isNaN(at.getTime())) return null;
    if (formatter === null) return at.toISOString().slice(0, 10);
    const parts = formatter.formatToParts(at);
    const get = (type: string) =>
      parts.find((part) => part.type === type)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  };
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
