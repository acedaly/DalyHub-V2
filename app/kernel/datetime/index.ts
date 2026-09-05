/**
 * The kernel's calendar-day arithmetic — one implementation, one convention.
 *
 * See {@link ./calendar-day} for why this module exists and which eight copies
 * it replaced (DEBT-52). Every domain that needs to move a `YYYY-MM-DD` value
 * along the calendar imports from here; nothing re-derives it.
 */

export {
  addCalendarDays,
  addCalendarMonths,
  calendarDateFromEpochDay,
  calendarDateFromParts,
  calendarDaysBetween,
  calendarEpochDay,
  calendarWeekday,
  daysInCalendarMonth,
  isCalendarDate,
  tryCalendarEpochDay,
} from "./calendar-day";
