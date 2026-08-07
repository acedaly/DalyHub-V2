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
  const parts = partsInTimeZone(new Date(iso), timezone);
  const hour23 = Number(parts.hour);
  const meridiem = hour23 < 12 ? "am" : "pm";
  const hour12 = hour23 % 12 === 0 ? 12 : hour23 % 12;
  return `${formatMeetingDate(iso, timezone)}, ${hour12}:${parts.minute} ${meridiem}`;
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
