/**
 * PWA-04 — the seven-day retention window.
 *
 * These are the tests that would catch a mis-set window on the day it is wrong,
 * not a week later: the exact inclusive boundaries, and the timezone/daylight-
 * saving cases where naive date arithmetic silently produces yesterday.
 * Australia/Sydney is used throughout because it is the owner's timezone, it is
 * far enough east of UTC that a UTC-based implementation is wrong for part of
 * every day, and its DST transitions give real 23- and 25-hour days.
 */

import { describe, expect, it } from "vitest";

import {
  OFFLINE_RETENTION_FUTURE_DAYS,
  OFFLINE_RETENTION_PAST_DAYS,
  addCalendarDays,
  calendarDaysBetween,
  isCalendarIso,
  isWithinWindow,
  offlineWindow,
  windowInstantBounds,
} from "~/kernel/offline";
import { ownerCalendarIso, ownerLocalToUtc } from "~/shared/datetime";

const SYDNEY = "Australia/Sydney";

describe("offlineWindow", () => {
  it("spans exactly seven days back, today, and seven days forward", () => {
    const window = offlineWindow("2026-08-02", SYDNEY);
    expect(window.startIso).toBe("2026-07-26");
    expect(window.todayIso).toBe("2026-08-02");
    expect(window.endIso).toBe("2026-08-09");
    expect(calendarDaysBetween(window.startIso, window.endIso)).toBe(
      OFFLINE_RETENTION_PAST_DAYS + OFFLINE_RETENTION_FUTURE_DAYS,
    );
  });

  it("includes both boundary days and excludes the days either side", () => {
    const window = offlineWindow("2026-08-02", SYDNEY);
    expect(isWithinWindow("2026-07-26", window)).toBe(true);
    expect(isWithinWindow("2026-07-25", window)).toBe(false);
    expect(isWithinWindow("2026-08-09", window)).toBe(true);
    expect(isWithinWindow("2026-08-10", window)).toBe(false);
  });

  it("rejects a value that is not a calendar date", () => {
    expect(() => offlineWindow("2026-8-2", SYDNEY)).toThrow(RangeError);
    expect(() => offlineWindow("not-a-date", SYDNEY)).toThrow(RangeError);
  });
});

describe("calendar arithmetic", () => {
  it("crosses month and year boundaries", () => {
    expect(addCalendarDays("2026-01-01", -7)).toBe("2025-12-25");
    expect(addCalendarDays("2026-02-24", 7)).toBe("2026-03-03");
    expect(addCalendarDays("2024-02-22", 7)).toBe("2024-02-29"); // leap year
  });

  it("is unaffected by daylight-saving transitions", () => {
    // Australia/Sydney: DST ends on the first Sunday of April (a 25-hour day)
    // and starts on the first Sunday of October (a 23-hour day). A millisecond-
    // based "seven days ago" lands on the wrong calendar date across both.
    expect(addCalendarDays("2026-04-08", -7)).toBe("2026-04-01");
    expect(addCalendarDays("2026-10-11", -7)).toBe("2026-10-04");
    expect(calendarDaysBetween("2026-04-01", "2026-04-08")).toBe(7);
    expect(calendarDaysBetween("2026-10-04", "2026-10-11")).toBe(7);
  });

  it("rejects impossible dates rather than rolling them over", () => {
    expect(isCalendarIso("2026-02-30")).toBe(false);
    expect(isCalendarIso("2026-13-01")).toBe(false);
    expect(isCalendarIso("2026-02-28")).toBe(true);
  });
});

describe("the owner's calendar date, not the runtime's", () => {
  it("resolves the Sydney date for an instant that is still yesterday in UTC", () => {
    // 09:00 on 2 August in Sydney (UTC+10) is 23:00 on 1 August in UTC. A
    // snapshot built from the UTC date would be a whole day wrong every morning.
    const instant = new Date("2026-08-01T23:00:00.000Z");
    expect(instant.toISOString().slice(0, 10)).toBe("2026-08-01");
    expect(ownerCalendarIso(instant, SYDNEY)).toBe("2026-08-02");
    expect(
      offlineWindow(ownerCalendarIso(instant, SYDNEY), SYDNEY).todayIso,
    ).toBe("2026-08-02");
  });
});

describe("windowInstantBounds", () => {
  it("produces a half-open interval that includes the whole final day", () => {
    const window = offlineWindow("2026-08-02", SYDNEY);
    const { startUtc, endUtc } = windowInstantBounds(window, ownerLocalToUtc);

    // Sydney is UTC+10 in August (no DST), so local midnight is 14:00 UTC the
    // day before.
    expect(startUtc.toISOString()).toBe("2026-07-25T14:00:00.000Z");
    // The end is the first moment of the day AFTER endIso, so a record at
    // 23:59 on the final day is still inside the interval.
    expect(endUtc.toISOString()).toBe("2026-08-09T14:00:00.000Z");

    const lastMomentOfWindow = ownerLocalToUtc("2026-08-09T23:59", SYDNEY)!;
    expect(lastMomentOfWindow.getTime()).toBeLessThan(endUtc.getTime());
  });

  it("uses the offset in effect on each boundary day across a DST change", () => {
    // A window whose start is in AEDT (UTC+11) and whose end is in AEST (UTC+10):
    // Sydney leaves DST on 2026-04-05. A single fixed offset would be an hour
    // wrong at one end.
    const window = offlineWindow("2026-04-05", SYDNEY);
    const { startUtc, endUtc } = windowInstantBounds(window, ownerLocalToUtc);
    expect(window.startIso).toBe("2026-03-29");
    expect(window.endIso).toBe("2026-04-12");
    expect(startUtc.toISOString()).toBe("2026-03-28T13:00:00.000Z"); // UTC+11
    expect(endUtc.toISOString()).toBe("2026-04-12T14:00:00.000Z"); // UTC+10
  });
});
