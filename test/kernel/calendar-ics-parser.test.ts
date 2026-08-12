/**
 * CAL-01 — the ICS parser, exercised INSIDE the real Workers runtime.
 *
 * This file lives in the Workers pool rather than in `test/unit` for one
 * specific reason: "does `ical.js` work on Cloudflare Workers?" is a question
 * about the runtime, and answering it in Node would not answer it. Every case
 * below therefore also stands as the compatibility evidence for the dependency
 * decision recorded in ADR-091.
 *
 * Every fixture is synthetic (`test/support/ics-fixtures.ts`). No real feed
 * address and no real calendar content appears anywhere.
 */

import { describe, expect, it } from "vitest";

import { parseIcsOccurrences, IcsParseError } from "~/platform/calendar";
import {
  ALL_DAY_EVENT,
  DAILY_SERIES,
  DST_WEEKLY_SERIES,
  FOLDED_AND_ESCAPED_EVENT,
  HTML_NOT_CALENDAR,
  LONG_RUNNING_DAILY_SERIES,
  MALFORMED_EVENT_NO_UID,
  MEETING_URL_EVENT,
  MIDNIGHT_STRADDLING_EVENT,
  MONTHLY_SERIES,
  MULTI_DAY_ALL_DAY_EVENT,
  RECURRENCE_BOMB,
  SYDNEY_VTIMEZONE,
  TIMED_EVENT,
  UNSAFE_URL_EVENT,
  UTC_EVENT,
  WEEKLY_SERIES_WITH_EXCEPTIONS,
  icsCalendar,
} from "../support/ics-fixtures";

/** A generous window around the fixtures' reference week. */
const FROM = new Date("2026-07-01T00:00:00.000Z");
const TO = new Date("2026-12-01T00:00:00.000Z");

function parse(...body: string[]) {
  return parseIcsOccurrences({
    body: icsCalendar(...body),
    from: FROM,
    to: TO,
  });
}

/** Sydney wall-clock for an instant, so assertions read as the owner sees them. */
function inSydney(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(instant)
    .replace(", ", " ");
}

describe("ICS parsing (Workers runtime)", () => {
  it("reads a timed event in an explicit VTIMEZONE as the right instant", () => {
    const { occurrences } = parse(SYDNEY_VTIMEZONE, TIMED_EVENT);
    expect(occurrences).toHaveLength(1);
    const event = occurrences[0]!;
    expect(event.title).toBe("Operational Officer Program");
    expect(event.externalUid).toBe("synthetic-timed-1");
    // A non-recurring event has the EMPTY occurrence key.
    expect(event.occurrenceKey).toBe("");
    // 08:30 in Sydney in August (AEST, +10) is 22:30Z the day before.
    expect(event.startsAt.toISOString()).toBe("2026-08-11T22:30:00.000Z");
    expect(event.endsAt.toISOString()).toBe("2026-08-11T23:00:00.000Z");
    expect(event.allDay).toBe(false);
    expect(event.timezone).toBe("Australia/Sydney");
    expect(event.location).toBe("Training Room 2");
    expect(event.status).toBe("confirmed");
  });

  it("reads a UTC event, and records no timezone it was not given", () => {
    const { occurrences } = parse(UTC_EVENT);
    expect(occurrences[0]!.startsAt.toISOString()).toBe(
      "2026-08-12T03:00:00.000Z",
    );
    // `Z` IS a zone statement, and `ical.js` reports it as "UTC". Recording it
    // is truthful — unlike a floating time, where the feed named no zone at all
    // and the parser records null rather than guessing (see the last case).
    expect(occurrences[0]!.timezone).toBe("UTC");
  });

  it("reads an all-day event as floating DATES with an inclusive end", () => {
    const { occurrences } = parse(ALL_DAY_EVENT);
    const event = occurrences[0]!;
    expect(event.allDay).toBe(true);
    expect(event.allDayStartDate).toBe("2026-08-12");
    // DTEND is 20260813 and is EXCLUSIVE, so the inclusive last day is the 12th.
    expect(event.allDayEndDate).toBe("2026-08-12");
  });

  it("keeps a multi-day all-day block as a real span", () => {
    const { occurrences } = parse(MULTI_DAY_ALL_DAY_EVENT);
    expect(occurrences[0]!.allDayStartDate).toBe("2026-08-14");
    expect(occurrences[0]!.allDayEndDate).toBe("2026-08-16");
  });

  it("unfolds folded lines and unescapes TEXT values", () => {
    const { occurrences } = parse(SYDNEY_VTIMEZONE, FOLDED_AND_ESCAPED_EVENT);
    // The line was folded mid-word and the comma/semicolon were escaped — the
    // exact things a `split("\n")` parser gets wrong.
    expect(occurrences[0]!.title).toBe(
      "SAF19 Workshop, planning and review session",
    );
    expect(occurrences[0]!.location).toBe("Level 3; Room A");
  });

  it("expands a daily series into distinct, stably-identified occurrences", () => {
    const { occurrences } = parse(SYDNEY_VTIMEZONE, DAILY_SERIES);
    expect(occurrences).toHaveLength(5);
    // Same UID, different occurrence keys — one series, five occurrences.
    expect(new Set(occurrences.map((o) => o.externalUid)).size).toBe(1);
    expect(new Set(occurrences.map((o) => o.occurrenceKey)).size).toBe(5);
    expect(occurrences.map((o) => inSydney(o.startsAt).slice(0, 10))).toEqual([
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
      "2026-08-15",
      "2026-08-16",
    ]);
  });

  it("expands a monthly series", () => {
    const { occurrences } = parse(SYDNEY_VTIMEZONE, MONTHLY_SERIES);
    expect(occurrences.map((o) => inSydney(o.startsAt))).toEqual([
      "2026-08-05 15:00",
      "2026-09-05 15:00",
      "2026-10-05 15:00",
      "2026-11-05 15:00",
    ]);
  });

  it("applies EXDATE, a moved instance and a cancelled instance to one series", () => {
    const { occurrences } = parse(
      SYDNEY_VTIMEZONE,
      WEEKLY_SERIES_WITH_EXCEPTIONS,
    );
    const byLocal = new Map(
      occurrences.map((o) => [inSydney(o.startsAt), o] as const),
    );

    // Five weekly slots, minus the EXDATE, is four occurrences.
    expect(occurrences).toHaveLength(4);

    // 3 August: ordinary.
    expect(byLocal.get("2026-08-03 10:00")?.title).toBe("Weekly Catch-up");

    // 10 August: MOVED to 11:30 and retitled. It is the same occurrence, so it
    // must appear ONCE — at its new time, under its new title.
    const moved = byLocal.get("2026-08-10 11:30");
    expect(moved?.title).toBe("L&D Weekly Catch-up");
    expect(moved?.location).toBe("Room 4");
    expect(byLocal.has("2026-08-10 10:00")).toBe(false);

    // 17 August: excluded outright.
    expect(byLocal.has("2026-08-17 10:00")).toBe(false);

    // 24 August: present, and CANCELLED — never silently dropped, because "the
    // 10:00 is cancelled" is what the owner needs to know on the day.
    expect(byLocal.get("2026-08-24 10:00")?.status).toBe("cancelled");

    // 31 August: ordinary.
    expect(byLocal.get("2026-08-31 10:00")?.title).toBe("Weekly Catch-up");
  });

  it("keeps a moved occurrence's IDENTITY anchored to its original slot", () => {
    const { occurrences } = parse(
      SYDNEY_VTIMEZONE,
      WEEKLY_SERIES_WITH_EXCEPTIONS,
    );
    const moved = occurrences.find((o) => o.title === "L&D Weekly Catch-up")!;
    // The key is the ORIGINAL 10:00 slot (2026-08-10T00:00:00Z), not the 11:30
    // it moved to. This is what stops a moved meeting looking like a new one —
    // and therefore what keeps its DalyHub Meeting link attached.
    expect(moved.occurrenceKey).toBe(
      String(Date.parse("2026-08-10T00:00:00.000Z") / 1000),
    );
  });

  it("holds a recurring series' local time across a DST transition", () => {
    const { occurrences } = parse(SYDNEY_VTIMEZONE, DST_WEEKLY_SERIES);
    // Sydney springs forward on 4 October 2026. The meeting stays at 09:00
    // LOCAL, so its UTC instant moves by an hour — not the other way round.
    expect(occurrences.map((o) => inSydney(o.startsAt))).toEqual([
      "2026-09-29 09:00",
      "2026-10-06 09:00",
      "2026-10-13 09:00",
    ]);
    expect(occurrences.map((o) => o.startsAt.toISOString())).toEqual([
      "2026-09-28T23:00:00.000Z", // AEST, +10
      "2026-10-05T22:00:00.000Z", // AEDT, +11
      "2026-10-12T22:00:00.000Z",
    ]);
  });

  it("keeps an event that straddles midnight as one occurrence", () => {
    const { occurrences } = parse(SYDNEY_VTIMEZONE, MIDNIGHT_STRADDLING_EVENT);
    expect(occurrences).toHaveLength(1);
    expect(inSydney(occurrences[0]!.startsAt)).toBe("2026-08-12 23:30");
    expect(inSydney(occurrences[0]!.endsAt)).toBe("2026-08-13 00:30");
  });

  it("extracts a reliable https join URL and refuses an unsafe one", () => {
    const { occurrences } = parse(
      SYDNEY_VTIMEZONE,
      MEETING_URL_EVENT,
      UNSAFE_URL_EVENT,
    );
    const join = occurrences.find((o) => o.title === "L&D Team Meeting");
    expect(join?.meetingUrl).toBe(
      "https://teams.example.com/l/meetup-join/synthetic",
    );
    // `javascript:` in an untrusted feed must never become a pressable link.
    const unsafe = occurrences.find((o) => o.title === "Reminder");
    expect(unsafe?.meetingUrl).toBeNull();
  });

  it("skips one unreadable event without losing the rest of the feed", () => {
    const result = parse(SYDNEY_VTIMEZONE, MALFORMED_EVENT_NO_UID, TIMED_EVENT);
    expect(result.skipped).toBe(1);
    expect(result.occurrences).toHaveLength(1);
    expect(result.occurrences[0]!.title).toBe("Operational Officer Program");
  });

  it("expands a series that started long BEFORE the window", () => {
    // The regression. The per-series bound used to count every step from
    // `DTSTART`, so this series exhausted its allowance ~13 months before the
    // window opened and contributed nothing at all — a stand-up that had run
    // daily for two years simply disappeared from the schedule.
    const narrow = parseIcsOccurrences({
      body: icsCalendar(SYDNEY_VTIMEZONE, LONG_RUNNING_DAILY_SERIES),
      from: new Date("2026-08-12T00:00:00.000Z"),
      to: new Date("2026-08-19T00:00:00.000Z"),
    });
    expect(narrow.truncated).toBe(false);
    // 07:00 Sydney is 21:00Z the previous day, so the 12th falls just before
    // this instant window opens and the seven days from the 13th are inside it.
    expect(narrow.occurrences.map((o) => inSydney(o.startsAt))).toEqual([
      "2026-08-13 07:00",
      "2026-08-14 07:00",
      "2026-08-15 07:00",
      "2026-08-16 07:00",
      "2026-08-17 07:00",
      "2026-08-18 07:00",
      "2026-08-19 07:00",
    ]);
  });

  it("bounds a recurrence bomb instead of expanding it", () => {
    const result = parse(SYDNEY_VTIMEZONE, RECURRENCE_BOMB);
    // `FREQ=MINUTELY` over a five-month window is ~216,000 occurrences. The
    // per-series bound stops it, and the result SAYS it was truncated rather
    // than quietly reporting a partial calendar as complete.
    expect(result.truncated).toBe(true);
    expect(result.occurrences.length).toBeLessThanOrEqual(400);
  });

  it("keeps only occurrences that overlap the window", () => {
    const narrow = parseIcsOccurrences({
      body: icsCalendar(SYDNEY_VTIMEZONE, DAILY_SERIES),
      from: new Date("2026-08-13T00:00:00.000Z"),
      to: new Date("2026-08-15T00:00:00.000Z"),
    });
    // The window is in INSTANTS, and 07:00 Sydney is 21:00Z the previous day.
    // So 13 August (2026-08-12T21:00Z) falls before the window opens, and 14
    // and 15 August fall inside it. Getting this "wrong by one day" is exactly
    // the class of error a UTC-anchored window produces, which is why the
    // schedule window is anchored on the OWNER's midnights instead.
    expect(narrow.occurrences.map((o) => inSydney(o.startsAt))).toEqual([
      "2026-08-14 07:00",
      "2026-08-15 07:00",
    ]);
  });

  it("refuses an HTML page rather than trying to parse it", () => {
    expect(() =>
      parseIcsOccurrences({ body: HTML_NOT_CALENDAR, from: FROM, to: TO }),
    ).toThrowError(IcsParseError);
    try {
      parseIcsOccurrences({ body: HTML_NOT_CALENDAR, from: FROM, to: TO });
    } catch (cause) {
      // The single most common owner mistake gets its own code, so the message
      // can say "you copied the page, not the link".
      expect((cause as IcsParseError).failure).toBe("not_calendar");
    }
  });

  it("refuses a truncated calendar with `unparseable`, not a crash", () => {
    const truncated = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:x";
    try {
      parseIcsOccurrences({ body: truncated, from: FROM, to: TO });
      throw new Error("expected a parse failure");
    } catch (cause) {
      expect(cause).toBeInstanceOf(IcsParseError);
      expect((cause as IcsParseError).failure).toBe("unparseable");
    }
  });

  it("does not leak one feed's VTIMEZONE into the next parse", () => {
    // Parse a feed that DEFINES Australia/Sydney...
    parse(SYDNEY_VTIMEZONE, TIMED_EVENT);
    // ...then one that references it without defining it. It must fall back to
    // floating time rather than silently inheriting the previous feed's zone,
    // because one publisher's idea of a zone is not another's.
    const { occurrences } = parse(TIMED_EVENT);
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]!.timezone).toBeNull();
  });
});
