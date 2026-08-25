/**
 * CAL-01 — the synchronisation window, derived in ONE place.
 *
 * Three callers need the same window and must not disagree about it: the
 * synchroniser (what to import), the pruner (what to discard) and the schedule
 * read (what is available). If the pruner's window were narrower than the
 * reader's, Next 7 Days would show a hole; if it were wider, the projection
 * would grow without bound.
 *
 * The window is anchored on the OWNER's calendar date, not on UTC — the AUDIT-14
 * rule that "today" is the owner's day, resolved from their stored timezone,
 * applies here exactly as it does on Today.
 */

import { SYNC_WINDOW_FUTURE_DAYS, SYNC_WINDOW_PAST_DAYS } from "./calendar";
import type { ScheduleWindow } from "./calendar-repository";
import { addCalendarDays } from "~/kernel/datetime";

export interface CalendarWindowInput {
  /** The owner's calendar date, `YYYY-MM-DD`. */
  readonly todayIso: string;
  /** Days before today to keep. Defaults to the CAL-01 retention horizon. */
  readonly pastDays?: number;
  /** Days after today to keep. Defaults to the CAL-01 retention horizon. */
  readonly futureDays?: number;
  /** The owner's IANA timezone, so the instant bounds land on their midnights. */
  readonly timeZone: string;
}

/** The offset of `timeZone` (minutes east of UTC) in effect at `instant`. */
function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const value = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour"),
    value("minute"),
    value("second"),
  );
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/** The UTC instant at which `dateIso` begins in `timeZone`. */
function startOfDayUtc(dateIso: string, timeZone: string): Date {
  const naive = Date.parse(`${dateIso}T00:00:00Z`);
  // Two passes, exactly as `ownerLocalToUtc` does: the first offset may itself
  // be the wrong side of a DST transition, and the second settles it.
  const first = zoneOffsetMinutes(new Date(naive), timeZone);
  let utc = naive - first * 60_000;
  const second = zoneOffsetMinutes(new Date(utc), timeZone);
  if (second !== first) utc = naive - second * 60_000;
  return new Date(utc);
}

// DEBT-52 — the kernel's ONE calendar-day implementation.
const shiftDate = addCalendarDays;

/**
 * The window, as both instant bounds (for timed events) and date bounds (for
 * floating all-day items).
 *
 * Both are needed because the two kinds of item genuinely differ: a timed event
 * is an instant and belongs to whichever owner-day contains it, while an all-day
 * item is a calendar date that no timezone conversion may move.
 */
export function calendarSyncWindow(input: CalendarWindowInput): ScheduleWindow {
  const pastDays = input.pastDays ?? SYNC_WINDOW_PAST_DAYS;
  const futureDays = input.futureDays ?? SYNC_WINDOW_FUTURE_DAYS;
  const fromDate = shiftDate(input.todayIso, -pastDays);
  // Inclusive last day, so a window of `futureDays` covers today plus that many.
  const toDate = shiftDate(input.todayIso, futureDays);
  return {
    fromDate,
    toDate,
    fromInstant: startOfDayUtc(fromDate, input.timeZone),
    // Exclusive: the instant the day AFTER `toDate` begins.
    toInstant: startOfDayUtc(shiftDate(toDate, 1), input.timeZone),
  };
}
