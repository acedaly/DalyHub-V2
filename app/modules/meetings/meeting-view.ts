import type { Meeting, MeetingStatus } from "~/kernel/meetings";
import { partsInTimeZone } from "~/shared/datetime";

/**
 * UIQ-005 — the presented status vocabulary, in the product's Sentence case.
 * The raw domain enum was rendered straight into the status pill ("planned"
 * beside every other module's "Planned"); the label is derived HERE so the
 * collection row, the record header and the details list cannot drift apart.
 */
const MEETING_STATUS_LABELS: Record<MeetingStatus, string> = {
  planned: "Planned",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function meetingStatusLabel(status: MeetingStatus): string {
  return MEETING_STATUS_LABELS[status] ?? status;
}

/**
 * UIQ-006 — meeting instants speak the product's day-first date language.
 * A module-local `Intl` formatter said "Aug 10, 2026, 7:00 PM" beside a product
 * that everywhere else says "10 Aug 2026" (urgency chips, card facts,
 * `formatCalendarDate`). Formatted in the MEETING's own display timezone
 * (MEET-01 semantics), never browser or server local time.
 */
const MONTH_ABBREVIATIONS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function formatMeetingDate(iso: string, timezone: string): string {
  const parts = partsInTimeZone(new Date(iso), timezone);
  const month = MONTH_ABBREVIATIONS[Number(parts.month) - 1] ?? parts.month;
  return `${Number(parts.day)} ${month} ${parts.year}`;
}

export function formatMeetingInstant(iso: string, timezone: string): string {
  return `${formatMeetingDate(iso, timezone)}, ${formatMeetingTime(iso, timezone)}`;
}

/**
 * UIX-04 §25 — the TIME alone, for the collection's leading time column.
 *
 * Same 12-hour vocabulary `formatMeetingInstant` already spoke (which now
 * composes this rather than repeating it), in the meeting's own display
 * timezone. The date is not repeated per row because the row sits under a day
 * heading that states it.
 */
export function formatMeetingTime(iso: string, timezone: string): string {
  const parts = partsInTimeZone(new Date(iso), timezone);
  const hour23 = Number(parts.hour);
  const meridiem = hour23 < 12 ? "am" : "pm";
  const hour12 = hour23 % 12 === 0 ? 12 : hour23 % 12;
  return `${hour12}:${parts.minute} ${meridiem}`;
}

/**
 * The full weekday names the day headings use. Fixed English tables rather than
 * a locale-dependent `Intl` format, for the reason the Diary's own headings give:
 * these are rendered on the server and hydrated on the client, and the two must
 * agree byte for byte.
 */
const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const MONTH_NAMES = [
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

/**
 * UIX-04 §25 — the meeting's own calendar day, `YYYY-MM-DD`, in ITS timezone.
 *
 * The collection groups by this rather than by the UTC prefix of `startsAt`.
 * They are not the same day: a 9am Sydney meeting is 23:00 UTC the day BEFORE,
 * so slicing the ISO string put it in the previous day's group and then labelled
 * that group with the heading of whichever meeting opened it. Every day boundary
 * in this module is resolved in the meeting's zone; this is that rule, exported
 * so the grouping and the heading cannot disagree about which day it is.
 */
export function meetingDayKey(iso: string, timezone: string): string {
  const parts = partsInTimeZone(new Date(iso), timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * UIX-04 §25 — the collection's day heading, relative to the owner's today.
 *
 * "Today", "Tomorrow", "Yesterday", or an absolute "Thursday, 13 August 2026".
 * `todayKey` is the owner's calendar day (`YYYY-MM-DD`) resolved server-side, so
 * the relative words are computed against the OWNER's day rather than the
 * browser's — a meeting at 9am Sydney must not read as "Yesterday" because the
 * page was opened from London.
 */
export function formatMeetingDayGroup(
  iso: string,
  timezone: string,
  todayKey: string,
): string {
  const parts = partsInTimeZone(new Date(iso), timezone);
  const dayKey = meetingDayKey(iso, timezone);
  if (dayKey === todayKey) return "Today";
  if (dayKey === shiftDayKey(todayKey, 1)) return "Tomorrow";
  if (dayKey === shiftDayKey(todayKey, -1)) return "Yesterday";
  // `Date.UTC` on the parsed parts, so the weekday is the MEETING's own day and
  // never shifts with the reader's timezone.
  const at = new Date(
    Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)),
  );
  return `${WEEKDAY_NAMES[at.getUTCDay()]}, ${Number(parts.day)} ${MONTH_NAMES[Number(parts.month) - 1]} ${parts.year}`;
}

/** Pure `YYYY-MM-DD` day arithmetic, for the relative headings above. */
function shiftDayKey(dayKey: string, deltaDays: number): string {
  const at = new Date(`${dayKey}T00:00:00Z`);
  if (Number.isNaN(at.getTime())) return "";
  at.setUTCDate(at.getUTCDate() + deltaDays);
  return at.toISOString().slice(0, 10);
}

export function serializeMeeting(m: Meeting) {
  return {
    ...m,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
    deletedAt: null,
    startsAt: m.startsAt.toISOString(),
    endsAt: m.endsAt?.toISOString() ?? null,
    archivedAt: m.archivedAt?.toISOString() ?? null,
    heldAt: m.heldAt?.toISOString() ?? null,
    items: m.items.map((i) => ({
      ...i,
      createdAt: i.createdAt.toISOString(),
      updatedAt: i.updatedAt.toISOString(),
    })),
  };
}
export type SerializedMeeting = ReturnType<typeof serializeMeeting>;

/**
 * UIX-04 §27 — the human name for a meeting's MODE.
 *
 * The stored values are `in_person` / `phone` / `online` (migration 0014). They
 * were previously only ever mapped to words inside the details FORM's `<option>`
 * list, so the record header — which falls back to the mode when a meeting has
 * no location — showed the raw `in_person`. One mapping, here, for both.
 */
export function meetingModeLabel(mode: string | null): string | null {
  switch (mode) {
    case "in_person":
      return "In person";
    case "phone":
      return "Phone";
    case "online":
      return "Online";
    default:
      return null;
  }
}
