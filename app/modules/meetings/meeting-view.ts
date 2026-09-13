import type { Meeting, MeetingMode, MeetingStatus } from "~/kernel/meetings";
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
 * UIX-04 §25 — an instant's calendar day, `YYYY-MM-DD`, in a NAMED timezone.
 *
 * The collection groups by this rather than by the UTC prefix of `startsAt`.
 * They are not the same day: a 9am Sydney meeting is 23:00 UTC the day BEFORE,
 * so slicing the ISO string put it in the previous day's group and then labelled
 * that group with the heading of whichever meeting opened it.
 *
 * Which zone is passed is the caller's decision and it matters: the collection
 * passes the OWNER's, because grouping and the relative headings above are one
 * question ("where does this sit in my week?") and must be answered in one
 * frame. The record passes the meeting's, because a start time is stated in the
 * zone it was scheduled in.
 */
export function meetingDayKey(iso: string, timezone: string): string {
  const parts = partsInTimeZone(new Date(iso), timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * UIX-04 §25 — the short, hydration-stable name of a meeting's own zone.
 *
 * The collection groups by the OWNER's calendar day (see `formatMeetingDayGroup`)
 * but shows each time in the MEETING's zone, which is MEET-01's rule and the
 * only time an attendee would recognise. When those two zones differ the two
 * facts can look contradictory — "9:00 am" under "Tomorrow" — so the row names
 * the zone the time belongs to. Derived from the IANA identifier's own last
 * segment rather than from `Intl`'s zone names, because this renders on the
 * server and hydrates in the browser and the two must agree byte for byte.
 */
export function meetingZoneLabel(timezone: string): string {
  const segment = timezone.split("/").pop() ?? timezone;
  return segment.replace(/_/g, " ");
}

/**
 * UIX-04 §25 — the collection's day heading, relative to the owner's today.
 *
 * "Today", "Tomorrow", "Yesterday", or an absolute "Thursday, 13 August 2026".
 * `todayKey` is the owner's calendar day (`YYYY-MM-DD`) resolved server-side, so
 * the relative words are computed against the OWNER's day rather than the
 * browser's — a meeting at 9am Sydney must not read as "Yesterday" because the
 * page was opened from London.
 *
 * `timezone` is therefore the OWNER's zone, not the meeting's: both sides of the
 * comparison have to be resolved in ONE zone or the arithmetic is meaningless.
 * Reading them in different zones is exactly the defect this parameter's name
 * used to hide — a meeting still dated the 10th in New York, for an owner whose
 * day is the 11th in Sydney, came out as "Yesterday" in a list of UPCOMING
 * meetings. A schedule is the owner's schedule; the meeting's own zone belongs
 * to the TIME (see `meetingZoneLabel`), which is a different question.
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
    // HARDEN-06B (F-01) — the base version the Notebook editor quotes on every
    // autosave, so the server can refuse a save written against text that has
    // since changed elsewhere.
    detailsUpdatedAt: m.detailsUpdatedAt.toISOString(),
    items: m.items.map((i) => ({
      ...i,
      createdAt: i.createdAt.toISOString(),
      updatedAt: i.updatedAt.toISOString(),
    })),
  };
}
export type SerializedMeeting = ReturnType<typeof serializeMeeting>;

/**
 * REFINE — a meeting's DURATION, in words, from the two instants it already has.
 *
 * §40 of the refinement brief asks a sparse Meetings list to carry more real
 * information rather than more space, and names duration first. Nothing is added
 * to the record to supply it: `startsAt` and `endsAt` are both stored and both
 * already serialized, and a meeting without an end simply has no duration to
 * state — which returns `null` and prints nothing, rather than a guessed hour.
 *
 * The wording is the shortest true one: "30m", "1h", "1h 30m". A schedule is
 * scanned, and "1 hour 30 minutes" beside a title is a sentence in a column of
 * facts.
 */
export function formatMeetingDuration(
  startsAt: string,
  endsAt: string | null,
): string | null {
  if (endsAt === null) return null;
  const minutes = Math.round(
    (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000,
  );
  // A non-positive or absurd span is a data problem, not a fact worth printing.
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 60 * 24) {
    return null;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

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

/**
 * UNTITLED-13 — what a COLLECTION ROW needs, and nothing else.
 *
 * ── The defect this closes ──────────────────────────────────────────────────
 *
 * Every `/meetings/*` loader serialised each meeting with `serializeMeeting`,
 * which spreads the whole kernel record. That includes `agendaMarkdown`,
 * `notesMarkdown` and the full `items` array — so a page of thirty meetings
 * shipped thirty complete notebooks to the browser in order to draw thirty
 * one-line rows, and a meeting whose notes run to a few thousand words shipped
 * those too. AGENTS.md §16 is explicit ("ship what the view needs"); the row
 * had simply inherited the record's projection because both existed before
 * either was measured.
 *
 * ── And what it BUYS ────────────────────────────────────────────────────────
 *
 * Trimming the payload is not the interesting half. §7 of the brief asks for
 * upcoming and past meetings to read differently, and the facts that make a
 * past meeting worth opening — what was decided, what came out of it, what
 * someone now has to do — were in that over-fetched `items` array all along,
 * unread. The row projection COUNTS them server-side, so a past row can say
 * "3 decisions · 2 actions · Notes" from data the page was already paying for,
 * and the notebook itself stops travelling.
 *
 * Nothing is derived that is not stored: every count is a `meeting_items.kind`
 * tally (migration 0021) and `hasNotes` is whether the notes column has any
 * non-whitespace in it. A meeting with no outcomes recorded says nothing rather
 * than "0 decisions", because an absence is drawn as an absence.
 */
export interface MeetingRowOutcomes {
  readonly decisions: number;
  readonly outcomes: number;
  readonly actions: number;
  /** Whether the owner wrote anything in the notes body. */
  readonly hasNotes: boolean;
}

/** One meeting, as the collection draws it. */
export interface SerializedMeetingRow {
  readonly id: string;
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string | null;
  readonly timezone: string;
  readonly location: string | null;
  readonly mode: MeetingMode | null;
  readonly meetingUrl: string | null;
  readonly status: MeetingStatus;
  readonly archivedAt: string | null;
  readonly heldAt: string | null;
  readonly updatedAt: string;
  /** How much of the agenda exists, for an UPCOMING row's readiness. */
  readonly agendaItems: number;
  readonly hasAgendaBody: boolean;
  /** What came out of it, for a PAST row. */
  readonly outcomes: MeetingRowOutcomes;
}

export function serializeMeetingRow(m: Meeting): SerializedMeetingRow {
  let agendaItems = 0;
  let decisions = 0;
  let outcomes = 0;
  let actions = 0;
  for (const item of m.items) {
    if (item.kind === "agenda") agendaItems += 1;
    else if (item.kind === "decision") decisions += 1;
    else if (item.kind === "outcome") outcomes += 1;
    else if (item.kind === "action") actions += 1;
  }

  return {
    id: m.id,
    title: m.title,
    startsAt: m.startsAt.toISOString(),
    endsAt: m.endsAt?.toISOString() ?? null,
    timezone: m.timezone,
    location: m.location,
    mode: m.mode,
    meetingUrl: m.meetingUrl,
    status: m.status,
    archivedAt: m.archivedAt?.toISOString() ?? null,
    heldAt: m.heldAt?.toISOString() ?? null,
    updatedAt: m.updatedAt.toISOString(),
    agendaItems,
    hasAgendaBody: m.agendaMarkdown.trim().length > 0,
    outcomes: {
      decisions,
      outcomes,
      actions,
      hasNotes: m.notesMarkdown.trim().length > 0,
    },
  };
}
