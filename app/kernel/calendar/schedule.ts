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
  /**
   * "10:30" — the end, in the OWNER's timezone. Null for an all-day item and for
   * a zero-length one, which has no distinct end to state.
   *
   * Given as its own field rather than left to be split back out of
   * `timeRangeLabel`: the range label is prose and now varies with whether the
   * row crosses a day, so a surface that needs the two clock faces separately
   * must be handed them separately.
   */
  readonly endTimeLabel: string | null;
  /** "09:30–10:30", or null for an all-day item. */
  readonly timeRangeLabel: string | null;
  /**
   * The accessible statement of when this is — "9:30 am to 10:30 am" or "All
   * day". A screen reader must not be handed "09:30 – 10:30" as an en-dashed
   * fragment and left to guess.
   *
   * When the row's start or end falls on an owner-calendar date OTHER than the
   * day being shown, the date is stated here too: "2:00 pm to 12:00 pm on
   * Thursday 13 August" rather than "2:00 pm to 12:00 pm", which reads as an end
   * before its own start.
   */
  readonly timeAccessibleLabel: string;
  /**
   * True when a TIMED row begins and ends on different owner-calendar dates.
   *
   * The boundary is the OWNER's midnight, not UTC's, and an end falling exactly
   * on midnight is not a crossing — ICS ends are exclusive, so it belongs to the
   * day it started, which is also the rule `scheduleFactDates` files it under.
   *
   * A cross-day timed row is NOT an all-day row: it keeps its times, its
   * ordering and its place in the timed column (CAL-01 §27).
   */
  readonly crossesDay: boolean;
  /**
   * "Until Thu 13 Aug" / "From Wed 12 Aug" — the compact statement of the date
   * transition, for the row's supporting line. Null unless this row's start or
   * end sits on a date other than the day being shown.
   */
  readonly dayTransitionLabel: string | null;
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

/**
 * The OWNER's calendar date for an instant, `YYYY-MM-DD`.
 *
 * The day boundary a cross-day event is measured against has to be the owner's
 * midnight: an event running 14:00 Wednesday to 12:00 Thursday in Sydney is
 * 04:00Z Wednesday to 02:00Z Thursday, and one that runs 09:00 to 10:00 Sydney
 * is 23:00Z the PREVIOUS day to 00:00Z — which a UTC reading would call a
 * crossing when it is not.
 */
function ownerDateIso(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * "Thu 13 Aug" — the compact date, assembled from parts.
 *
 * From parts rather than from the formatted string because `en-AU` renders this
 * combination as "Thu, 13 Aug", and the comma reads badly inside a supporting
 * line whose own separator is a middle dot.
 */
function shortDayLabel(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone,
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")}`;
}

/** "Thursday 13 August" — the spoken date, for the accessible statement. */
function longDayLabel(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone,
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")}`;
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
        endTimeLabel: null,
        timeRangeLabel: null,
        timeAccessibleLabel: "All day",
        crossesDay: false,
        dayTransitionLabel: null,
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

    /*
     * WHICH owner-calendar day each end of the row lands on.
     *
     * The end is measured one millisecond BEFORE `endsAt`, exactly as
     * `scheduleFactDates` does, so an event finishing at midnight belongs to the
     * day it started rather than announcing a transition it did not make. Get
     * this wrong and a 23:00–00:00 call claims to end "Thu 13 Aug" while sitting
     * only on Wednesday's page.
     */
    const startDay = ownerDateIso(facts.startsAt, timeZone);
    const endInstant = new Date(
      Math.max(facts.startsAt.getTime(), facts.endsAt.getTime() - 1),
    );
    const endDay = ownerDateIso(endInstant, timeZone);
    const crossesDay = !sameInstant && endDay !== startDay;
    // Stated against the day BEING SHOWN, not against the start: a cross-day
    // event appears on both of its days, and on the second one the fact the
    // owner needs is where it began.
    const startElsewhere = startDay !== dateIso;
    const endElsewhere = crossesDay && endDay !== dateIso;

    const spokenStart = spokenLabel(facts.startsAt, timeZone);
    const spokenEnd = spokenLabel(facts.endsAt, timeZone);
    const startOn = startElsewhere
      ? ` on ${longDayLabel(facts.startsAt, timeZone)}`
      : "";
    const endOn = endElsewhere
      ? ` on ${longDayLabel(endInstant, timeZone)}`
      : "";

    let timeRangeLabel: string;
    if (sameInstant) {
      timeRangeLabel = startElsewhere
        ? `${shortDayLabel(facts.startsAt, timeZone)} ${start}`
        : start;
    } else if (startElsewhere || endElsewhere) {
      // The arrow, and a date on whichever end is not today's, is the shortest
      // form that cannot be read as "ends before it starts".
      const from = startElsewhere
        ? `${shortDayLabel(facts.startsAt, timeZone)} ${start}`
        : start;
      const to = endElsewhere
        ? `${shortDayLabel(endInstant, timeZone)} ${end}`
        : end;
      timeRangeLabel = `${from} → ${to}`;
    } else {
      timeRangeLabel = `${start}–${end}`;
    }

    return {
      id: facts.id,
      kind: facts.kind,
      title,
      startsAtIso: facts.startsAt.toISOString(),
      endsAtIso: facts.endsAt.toISOString(),
      allDay: false,
      timeLabel: start,
      endTimeLabel: sameInstant ? null : end,
      timeRangeLabel,
      timeAccessibleLabel: sameInstant
        ? `${spokenStart}${startOn}`
        : `${spokenStart}${startOn} to ${spokenEnd}${endOn}`,
      crossesDay,
      dayTransitionLabel: endElsewhere
        ? `Until ${shortDayLabel(endInstant, timeZone)}`
        : startElsewhere
          ? `From ${shortDayLabel(facts.startsAt, timeZone)}`
          : null,
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
