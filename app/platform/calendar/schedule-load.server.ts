/**
 * CAL-01/CAL-02 — the ONE workspace read behind Today's Schedule, Tomorrow and
 * Next 7 Days, and (NOTIFY-01) behind the day's line in the morning digest.
 *
 * NOTIFY-01 moved this file from `app/modules/today/day/` to the calendar
 * platform without changing a line of it. The reason is the reason it says
 * below: three surfaces, one loader, one ordering. A background cron tick has no
 * Today loader to borrow from, and the alternative — a second schedule read for
 * the digest — is exactly how the digest and the page come to disagree about
 * what is on this afternoon. It was never Today-specific code; it was a
 * workspace read that happened to live in Today's folder.
 *
 * Three surfaces, one loader, one ordering, one set of bounds. The alternative —
 * a schedule read per surface — is exactly how two pages come to disagree about
 * what is happening on Thursday.
 *
 * ── What it reads, and what it deliberately does not ────────────────────────
 * Two bounded reads: the external occurrence projection for the window, and the
 * DalyHub Meetings in it. **No feed is fetched here.** Today reads the local
 * projection and nothing else, so the page renders at the same speed whether
 * Outlook is up, down or slow, and a calendar outage cannot make Today fail
 * (CAL-01 §33). External network work happens only in the scheduled handler, in
 * "Refresh now" and when a source is first validated.
 *
 * ── Why Meetings are merged here rather than listed separately ──────────────
 * See `~/kernel/calendar/schedule.ts`. In short: a Meeting created FROM an
 * imported event would otherwise appear twice, and the owner would be given two
 * chronologies of one day to reconcile. A Meeting that IS linked to an
 * occurrence in this window is dropped from the Meeting side, because the
 * occurrence row already carries it and draws "Open notes".
 */

import {
  buildDaySchedule,
  calendarSyncWindow,
  emptyDaySchedule,
  scheduleFactDates,
  type DaySchedule,
  type ScheduleEntryFacts,
  type ScheduleRow,
} from "~/kernel/calendar";
import type { Meeting } from "~/kernel/meetings";
import type { WorkspaceScope } from "~/platform/workspaces";
import { ownerCalendarDateResolver } from "~/shared/datetime";

/**
 * How many DalyHub Meetings are read from each side of "now".
 *
 * The same shape Today has always used, widened for the seven-day surface. It is
 * a bound on a personal workspace's meetings over one week, not a paging model:
 * a week with more than sixty meetings in it has a different problem.
 */
const MEETINGS_UPCOMING_LIMIT = 60;
const MEETINGS_RECENT_LIMIT = 20;

/** Owner-facing words for a Meeting's mode — the same words its record uses. */
const MEETING_MODE_LABELS: Record<string, string> = {
  in_person: "In person",
  phone: "Phone",
  online: "Online",
};

/** One external occurrence, as schedule facts. */
function factsForEvent(row: ScheduleRow): ScheduleEntryFacts {
  return {
    id: row.event.id,
    kind: "event",
    title: row.event.title,
    startsAt: row.event.startsAt,
    endsAt: row.event.endsAt,
    allDay: row.event.allDay,
    allDayStartDate: row.event.allDayStartDate,
    allDayEndDate: row.event.allDayEndDate,
    location: row.event.location,
    meetingUrl: row.event.meetingUrl,
    status: row.event.status,
    sourceId: row.event.sourceId,
    sourceName: row.sourceName,
    sourceRank: row.sourceRank,
    meetingId: row.meetingId,
  };
}

/** One DalyHub Meeting, as schedule facts. */
function factsForMeeting(meeting: Meeting): ScheduleEntryFacts {
  return {
    id: meeting.id,
    kind: "meeting",
    title: meeting.title,
    startsAt: meeting.startsAt,
    // A Meeting may legitimately have no end. Treating it as instantaneous is
    // truthful — it is never drawn as a range and never claims a duration.
    endsAt: meeting.endsAt ?? meeting.startsAt,
    allDay: false,
    allDayStartDate: null,
    allDayEndDate: null,
    location:
      meeting.location?.trim() ||
      (meeting.mode ? (MEETING_MODE_LABELS[meeting.mode] ?? null) : null),
    meetingUrl: meeting.meetingUrl,
    // A cancelled DalyHub Meeting is still shown, greyed, exactly as a cancelled
    // external occurrence is: the owner decided it, and hiding it would make the
    // day look emptier than it is.
    status: meeting.status === "cancelled" ? "cancelled" : "confirmed",
    sourceId: null,
    sourceName: null,
    sourceRank: null,
    meetingId: meeting.id,
  };
}

/** Everything the three schedule surfaces read, in one shape. */
export interface ScheduleWindowData {
  /** Every entry in the window, already ordered and de-duplicated. */
  readonly facts: readonly ScheduleEntryFacts[];
  /** Which owner-calendar dates each entry touches, keyed by entry id. */
  readonly datesByEntry: ReadonlyMap<string, readonly string[]>;
  /**
   * True when at least one enabled source exists. Distinguishes "nothing is on"
   * from "no calendar is connected", which are different empty states and must
   * not be given the same sentence.
   */
  readonly hasSources: boolean;
  /** True when the last refresh of at least one enabled source failed. */
  readonly anySourceFailing: boolean;
}

/** The empty window used when every read fails. Never a 500, never a blank. */
export const EMPTY_SCHEDULE_WINDOW: ScheduleWindowData = {
  facts: [],
  datesByEntry: new Map(),
  hasSources: false,
  anySourceFailing: false,
};

/**
 * Read the schedule for an owner-calendar date range, inclusive.
 *
 * One projection read and two bounded Meeting reads, whatever the range's size —
 * so Next 7 Days costs the same number of queries as Today (CAL-01 §34).
 */
export async function loadScheduleWindow(
  scope: WorkspaceScope,
  input: {
    readonly fromDateIso: string;
    readonly toDateIso: string;
    readonly timeZone: string;
  },
): Promise<ScheduleWindowData> {
  const window = calendarSyncWindow({
    todayIso: input.fromDateIso,
    timeZone: input.timeZone,
    pastDays: 0,
    futureDays: Math.max(
      0,
      Math.round(
        (Date.parse(`${input.toDateIso}T00:00:00Z`) -
          Date.parse(`${input.fromDateIso}T00:00:00Z`)) /
          86_400_000,
      ),
    ),
  });

  const [rows, sources, upcomingMeetings, recentMeetings] = await Promise.all([
    scope.calendarEvents.listWindow(window).catch(() => []),
    scope.calendarSources.list().catch(() => []),
    scope.meetings
      .list({ view: "upcoming", limit: MEETINGS_UPCOMING_LIMIT })
      .catch(() => ({ items: [] as readonly Meeting[] })),
    scope.meetings
      .list({ view: "recent", limit: MEETINGS_RECENT_LIMIT })
      .catch(() => ({ items: [] as readonly Meeting[] })),
  ]);

  /*
   * A Meeting already represented by an occurrence in this window is dropped
   * here rather than in the component, so every consumer of this read gets one
   * row per real thing — and so the count a surface reports is the count it
   * draws.
   */
  const linkedMeetingIds = new Set(
    rows
      .map((row) => row.meetingId)
      .filter((id): id is string => typeof id === "string"),
  );

  const facts: ScheduleEntryFacts[] = rows.map(factsForEvent);
  const seenMeetings = new Set<string>();
  for (const meeting of [...recentMeetings.items, ...upcomingMeetings.items]) {
    if (linkedMeetingIds.has(meeting.id) || seenMeetings.has(meeting.id)) {
      continue;
    }
    seenMeetings.add(meeting.id);
    if (
      meeting.startsAt.getTime() < window.fromInstant.getTime() ||
      meeting.startsAt.getTime() >= window.toInstant.getTime()
    ) {
      continue;
    }
    facts.push(factsForMeeting(meeting));
  }

  const resolveDate = ownerCalendarDateResolver(input.timeZone);
  const datesByEntry = new Map<string, readonly string[]>();
  for (const entry of facts) {
    datesByEntry.set(
      entry.id,
      scheduleFactDates(entry, (instant) => resolveDate(instant) ?? ""),
    );
  }

  const enabled = sources.filter((source) => source.enabled);
  return {
    facts,
    datesByEntry,
    hasSources: enabled.length > 0,
    anySourceFailing: enabled.some(
      (source) => source.lastSyncStatus === "failed",
    ),
  };
}

/** The entries that touch one owner-calendar date. */
export function scheduleForDate(
  data: ScheduleWindowData,
  input: {
    readonly dateIso: string;
    readonly timeZone: string;
    readonly now: Date;
    readonly isToday: boolean;
  },
): DaySchedule {
  const entries = data.facts.filter((entry) =>
    (data.datesByEntry.get(entry.id) ?? []).includes(input.dateIso),
  );
  if (entries.length === 0) return emptyDaySchedule(input.dateIso);
  return buildDaySchedule({
    dateIso: input.dateIso,
    timeZone: input.timeZone,
    now: input.now,
    isToday: input.isToday,
    entries,
  });
}
