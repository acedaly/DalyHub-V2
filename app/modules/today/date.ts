/**
 * TODAY-01 — the Today date formatter (compatibility re-export).
 *
 * The owner-calendar helpers were promoted to the shared `~/shared/datetime`
 * module in PROJ-01 (Today, Tasks and Projects all resolve the owner's day). This
 * file preserves the `~/modules/today/date` import path the Today module still uses;
 * the implementation now lives in one shared place.
 */

export {
  OWNER_TIME_ZONE,
  formatTodayDate,
  ownerCalendarIso,
} from "~/shared/datetime";
