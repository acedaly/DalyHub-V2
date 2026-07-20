/**
 * TODAY-01 — the Today date formatter.
 *
 * The pane-header subtitle is the owner's *calendar* date. It must be formatted in
 * the owner's timezone, not the runtime's: Cloudflare Workers run in UTC, so a
 * naïve `new Date()` format shows the previous day during the Australian morning
 * (the UTC/AEST offset window) — misleading on a daily planning surface.
 *
 * DalyHub is single-owner today, so the timezone is fixed to the owner's calendar
 * zone (`Australia/Sydney`, DST-aware via the IANA database) with the `en-AU`
 * locale. When a user/workspace **timezone setting** lands (with the Settings
 * framework, SET-01 — deliberately NOT part of TODAY-01), this constant becomes
 * that preference; the formatting itself does not change.
 */

/** The owner's calendar timezone. Becomes a user/workspace setting at SET-01. */
export const OWNER_TIME_ZONE = "Australia/Sydney";

/**
 * Format an instant as the owner's calendar date (e.g. "Sunday 19 July 2026"),
 * resolved in `OWNER_TIME_ZONE` so it is correct across the UTC/AEST/AEDT day
 * boundary regardless of the runtime timezone.
 */
export function formatTodayDate(now: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: OWNER_TIME_ZONE,
  }).format(now);
}

/**
 * The owner's current calendar date as `YYYY-MM-DD`, resolved in `OWNER_TIME_ZONE`
 * — the reference date for date-only comparisons (e.g. overdue detection), so
 * "overdue" matches the owner's day, not the UTC runtime's. Uses the `en-CA` locale
 * (which formats as `YYYY-MM-DD`), assembled from parts to stay locale-stable.
 */
export function ownerCalendarIso(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: OWNER_TIME_ZONE,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
