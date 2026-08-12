/**
 * CAL-01 — the UNIFIED SCHEDULE read model (pure, React-free, clock-free).
 *
 * One ordered answer to *what is happening on this day?*, assembled from every
 * enabled external source plus the DalyHub Meetings that are not already
 * represented by one of those events. Today, Tomorrow and Next 7 Days all render
 * THIS model; none of them knows what an ICS feed is, what a provider is, or how
 * recurrence was expanded.
 *
 * ── Why DalyHub Meetings are in it ──────────────────────────────────────────
 * Today already had a Schedule panel, and it held Meetings. Putting external
 * events in a SECOND list beside it would have given the owner two chronologies
 * of the same day to reconcile — and a Meeting created FROM an event would have
 * appeared in both. So the schedule is one list, and an entry is either:
 *
 *   - an external occurrence (optionally linked to a Meeting, which is what the
 *     "Open notes" affordance is drawn from), or
 *   - a DalyHub Meeting that no external occurrence in this window links to.
 *
 * The result is exactly one row per real thing happening, whichever side it came
 * from. Meetings authority is untouched: this composes the existing Meeting read,
 * it does not replace it.
 *
 * ── The ordering rule, stated once ──────────────────────────────────────────
 *   1. all-day items first, in their own region — an all-day item has no time,
 *      and drawing it at 00:00 would be an invented claim (CAL-01 §27);
 *   2. then timed items by start instant;
 *   3. then, for identical starts, the shorter item first (a 30-minute meeting
 *      inside a 3-hour block reads better above it than below it);
 *   4. then title, then id — so the sort is TOTAL and identical on the server
 *      and in the browser.
 *
 * ── Timezone ────────────────────────────────────────────────────────────────
 * Times are formatted in the OWNER's timezone, from the AUDIT-14 owner-timezone
 * authority, because this list answers "what does MY day look like". A merged
 * chronological list showing each row in its own source's local time would put
 * 09:00 below 17:00 and be actively misleading. All-day items are never
 * converted at all: they are floating calendar dates and are compared as dates.
 */

import { EXTERNAL_TITLE_MAX_LENGTH } from "./calendar";
import type { ExternalEventStatus } from "./calendar";

/** Where a schedule row came from. The UI uses it for the row's one action. */
export type ScheduleEntryKind = "event" | "meeting";

/**
 * How a row sits against "now".
 *
 * `current` and `next` are each awarded to AT MOST ONE row on a day, and only on
 * the owner's actual today — "Now" on a page showing Thursday would be false.
 * Never colour alone: the UI draws a word ("Now", "Next") beside the row.
 */
export type ScheduleRelativeState = "past" | "current" | "next" | "upcoming";

/** The facts a schedule row is built from. Instants are real `Date`s. */
export interface ScheduleEntryFacts {
  readonly id: string;
  readonly kind: ScheduleEntryKind;
  readonly title: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly allDay: boolean;
  /** For an all-day item, the first and last calendar dates it covers. */
  readonly allDayStartDate: string | null;
  readonly allDayEndDate: string | null;
  readonly location: string | null;
  readonly meetingUrl: string | null;
  readonly status: ExternalEventStatus;
  /** The source's id and owner-given name, for the quiet source label. */
  readonly sourceId: string | null;
  readonly sourceName: string | null;
  /**
   * A stable small integer for the source, used to allocate a design-system
   * accent. Never a colour from the feed — see CAL-01 §28.
   */
  readonly sourceRank: number | null;
  /** The linked DalyHub Meeting, when this occurrence has one. */
  readonly meetingId: string | null;
}

/** One row, resolved to the exact strings the surface draws. JSON-safe. */
export interface ScheduleEntry {
  readonly id: string;
  readonly kind: ScheduleEntryKind;
  readonly title: string;
  /** The start instant, ISO-8601 UTC. Present for ordering and for detail. */
  readonly startsAtIso: string;
  readonly endsAtIso: string;
  readonly allDay: boolean;
  /** "09:30", or null for an all-day item. In the OWNER's timezone. */
  readonly timeLabel: string | null;
  /** "09:30 – 10:30", or null for an all-day item. */
  readonly timeRangeLabel: string | null;
  /**
   * The accessible statement of when this is — "9:30 am to 10:30 am" or "All
   * day". A screen reader must not be handed "09:30 – 10:30" as an en-dashed
   * fragment and left to guess.
   */
  readonly timeAccessibleLabel: string;
  /** For a multi-day all-day item: "Day 2 of 3", else null. */
  readonly spanLabel: string | null;
  readonly location: string | null;
  readonly meetingUrl: string | null;
  readonly cancelled: boolean;
  readonly tentative: boolean;
  readonly sourceId: string | null;
  readonly sourceName: string | null;
  readonly sourceRank: number | null;
  readonly meetingId: string | null;
  readonly relative: ScheduleRelativeState;
}

/** One day of the unified schedule. */
export interface DaySchedule {
  /** The owner's calendar date this schedule is for (`YYYY-MM-DD`). */
  readonly dateIso: string;
  readonly allDay: readonly ScheduleEntry[];
  readonly timed: readonly ScheduleEntry[];
  /** Every row, all-day first — the count the surface reports. */
  readonly count: number;
}

/** An empty day. A real state, not a failure — most Saturdays look like this. */
export function emptyDaySchedule(dateIso: string): DaySchedule {
  return { dateIso, allDay: [], timed: [], count: 0 };
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                  */
/* -------------------------------------------------------------------------- */

/** "09:30" in `timeZone`, 24-hour, so the day lines up on one axis. */
function clockLabel(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(instant);
}

/** "9:30 am" — the spoken form, for the accessible label alone. */
function spokenLabel(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  }).format(instant);
}

/** Whole days from `fromIso` to `toIso`, over date-only strings. */
function dayOffset(fromIso: string, toIso: string): number {
  return Math.round(
    (Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) /
      86_400_000,
  );
}

/** Trim a possibly-hostile external string to a bounded, single-line value. */
export function boundedExternalText(
  value: string | null,
  maxLength: number,
): string | null {
  if (value === null) return null;
  // Control characters (including the line breaks ICS escapes as `\n`) would
  // break a single-line row and can be used to fake structure in a label.
  const cleaned = value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length === 0) return null;
  return cleaned.length > maxLength
    ? `${cleaned.slice(0, maxLength - 1)}…`
    : cleaned;
}

/* -------------------------------------------------------------------------- */
/* The model                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Order two rows totally. Exported so the Next-7-Days grouping sorts identically
 * — two orderings of one list is how two surfaces come to disagree.
 */
export function compareScheduleFacts(
  a: ScheduleEntryFacts,
  b: ScheduleEntryFacts,
): number {
  const start = a.startsAt.getTime() - b.startsAt.getTime();
  if (start !== 0) return start;
  const duration =
    a.endsAt.getTime() -
    a.startsAt.getTime() -
    (b.endsAt.getTime() - b.startsAt.getTime());
  if (duration !== 0) return duration;
  const title = a.title.localeCompare(b.title);
  if (title !== 0) return title;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Build one day's schedule.
 *
 * `now` is supplied rather than read, so the same function runs in a unit test
 * against a fixed instant. `isToday` gates the Now/Next distinction: a row on
 * Thursday's page is never "Now", however the clock reads.
 */
export function buildDaySchedule(input: {
  readonly dateIso: string;
  readonly timeZone: string;
  readonly now: Date;
  readonly isToday: boolean;
  readonly entries: readonly ScheduleEntryFacts[];
}): DaySchedule {
  const { dateIso, timeZone, now, isToday } = input;
  const ordered = [...input.entries].sort(compareScheduleFacts);
  const allDayFacts = ordered.filter((entry) => entry.allDay);
  const timedFacts = ordered.filter((entry) => !entry.allDay);

  /*
   * Now/Next, decided ONCE over the ordered timed rows.
   *
   * "Current" is an event that has started and not finished. "Next" is the first
   * that has not started. Cancelled rows are skipped for both: pointing the
   * owner at a cancelled 10:00 as their next commitment would be worse than
   * pointing at nothing. A zero-length event (a reminder) is never "current",
   * because it is never true for any measurable interval — it becomes "next"
   * until it passes.
   */
  let currentId: string | null = null;
  let nextId: string | null = null;
  if (isToday) {
    const nowMs = now.getTime();
    for (const entry of timedFacts) {
      if (entry.status === "cancelled") continue;
      const started = entry.startsAt.getTime() <= nowMs;
      const finished = entry.endsAt.getTime() <= nowMs;
      if (started && !finished && currentId === null) {
        currentId = entry.id;
      }
      if (!started && nextId === null) {
        nextId = entry.id;
      }
    }
  }

  const toEntry = (facts: ScheduleEntryFacts): ScheduleEntry => {
    const title =
      boundedExternalText(facts.title, EXTERNAL_TITLE_MAX_LENGTH) ??
      "Untitled event";
    let relative: ScheduleRelativeState = "upcoming";
    if (facts.id === currentId) relative = "current";
    else if (facts.id === nextId) relative = "next";
    else if (
      isToday &&
      !facts.allDay &&
      facts.endsAt.getTime() <= now.getTime()
    )
      relative = "past";

    if (facts.allDay) {
      const from = facts.allDayStartDate ?? dateIso;
      const to = facts.allDayEndDate ?? from;
      const span = dayOffset(from, to) + 1;
      return {
        id: facts.id,
        kind: facts.kind,
        title,
        startsAtIso: facts.startsAt.toISOString(),
        endsAtIso: facts.endsAt.toISOString(),
        allDay: true,
        timeLabel: null,
        timeRangeLabel: null,
        timeAccessibleLabel: "All day",
        spanLabel:
          span > 1 ? `Day ${dayOffset(from, dateIso) + 1} of ${span}` : null,
        location: boundedExternalText(facts.location, 120),
        meetingUrl: facts.meetingUrl,
        cancelled: facts.status === "cancelled",
        tentative: facts.status === "tentative",
        sourceId: facts.sourceId,
        sourceName: facts.sourceName,
        sourceRank: facts.sourceRank,
        meetingId: facts.meetingId,
        // An all-day item is not "now" and is not "next": it is the whole day.
        relative: "upcoming",
      };
    }

    const start = clockLabel(facts.startsAt, timeZone);
    const end = clockLabel(facts.endsAt, timeZone);
    const sameInstant = facts.endsAt.getTime() <= facts.startsAt.getTime();
    return {
      id: facts.id,
      kind: facts.kind,
      title,
      startsAtIso: facts.startsAt.toISOString(),
      endsAtIso: facts.endsAt.toISOString(),
      allDay: false,
      timeLabel: start,
      timeRangeLabel: sameInstant ? start : `${start}–${end}`,
      timeAccessibleLabel: sameInstant
        ? spokenLabel(facts.startsAt, timeZone)
        : `${spokenLabel(facts.startsAt, timeZone)} to ${spokenLabel(facts.endsAt, timeZone)}`,
      spanLabel: null,
      location: boundedExternalText(facts.location, 120),
      meetingUrl: facts.meetingUrl,
      cancelled: facts.status === "cancelled",
      tentative: facts.status === "tentative",
      sourceId: facts.sourceId,
      sourceName: facts.sourceName,
      sourceRank: facts.sourceRank,
      meetingId: facts.meetingId,
      relative,
    };
  };

  const allDay = allDayFacts.map(toEntry);
  const timed = timedFacts.map(toEntry);
  return { dateIso, allDay, timed, count: allDay.length + timed.length };
}

/**
 * Which OWNER-calendar dates a schedule fact touches, within a window.
 *
 * A timed event that runs past midnight belongs to both days; an all-day item
 * spanning a week belongs to all seven. The dates come from the caller's
 * owner-timezone resolver for timed events and from the stored floating dates
 * for all-day ones — which is the whole point of storing those separately.
 */
export function scheduleFactDates(
  facts: ScheduleEntryFacts,
  resolveDate: (instant: Date) => string,
): readonly string[] {
  if (facts.allDay) {
    const from = facts.allDayStartDate;
    const to = facts.allDayEndDate ?? from;
    if (from === null || to === null) return [];
    const dates: string[] = [];
    // A bound, not a formality: a malformed feed can claim a decade-long
    // all-day event, and expanding it a day at a time is unbounded work.
    for (
      let offset = 0;
      offset <= Math.min(dayOffset(from, to), 366);
      offset += 1
    ) {
      dates.push(
        new Date(Date.parse(`${from}T00:00:00Z`) + offset * 86_400_000)
          .toISOString()
          .slice(0, 10),
      );
    }
    return dates;
  }
  const startDate = resolveDate(facts.startsAt);
  // ICS ends are EXCLUSIVE: an event finishing exactly at midnight belongs to
  // the day it started, not to the next one.
  const endInstant = new Date(
    Math.max(facts.startsAt.getTime(), facts.endsAt.getTime() - 1),
  );
  const endDate = resolveDate(endInstant);
  if (startDate === endDate) return [startDate];
  const dates: string[] = [];
  for (
    let offset = 0;
    offset <= Math.min(dayOffset(startDate, endDate), 366);
    offset += 1
  ) {
    dates.push(
      new Date(Date.parse(`${startDate}T00:00:00Z`) + offset * 86_400_000)
        .toISOString()
        .slice(0, 10),
    );
  }
  return dates;
}
