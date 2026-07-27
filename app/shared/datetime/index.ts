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
