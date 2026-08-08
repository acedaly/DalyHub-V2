/**
 * TODAY-01 — the Today date formatter (compatibility re-export).
 *
 * The owner-calendar helpers were promoted to the shared `~/shared/datetime`
 * module in PROJ-01 (Today, Tasks and Projects all resolve the owner's day). This
 * file preserves the `~/modules/today/date` import path the Today module still uses;
 * the implementation now lives in one shared place.
 *
 * AUDIT-14 — the shared module's `OWNER_TIME_ZONE` default is gone with it: the
 * owner's timezone is resolved from their stored preference and passed in, never
 * re-exported as an application constant that a call site could mistake for the
 * answer.
 */

export { formatTodayDate, ownerCalendarIso } from "~/shared/datetime";
