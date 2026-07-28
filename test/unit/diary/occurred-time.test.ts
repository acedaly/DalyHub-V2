import { describe, expect, it } from "vitest";

import {
  DIARY_DISPLAY_TIME_ZONE,
  addDaysToDayKey,
  diaryDayHeading,
  endOfLocalDayUtc,
  formatDayKeyLong,
  formatDayKeyMedium,
  formatZonedDateLong,
  formatZonedDateTimeLong,
  formatZonedTime,
  isValidDayKey,
  ownerLocalToUtc,
  startOfLocalDayUtc,
  utcToOwnerLocal,
} from "~/modules/diary/occurred-time";

/**
 * DIARY-01 — the owner-local ⇄ UTC conversion and Timeline labelling.
 *
 * Every assertion uses an EXPLICIT zone (the display zone is Australia/Sydney,
 * which observes DST) and fixed instants, so the results never depend on the CI
 * runner's clock or locale. The conversions are checked at both offsets, across
 * local midnight, and around both daylight-saving transitions.
 */

const SYDNEY = DIARY_DISPLAY_TIME_ZONE;

describe("ownerLocalToUtc / utcToOwnerLocal", () => {
  it("converts a winter (AEST, +10) wall-clock to the right UTC instant", () => {
    // 2026-07-19 14:30 in Sydney (UTC+10) is 04:30 UTC the same day.
    const utc = ownerLocalToUtc("2026-07-19T14:30", SYDNEY);
    expect(utc?.toISOString()).toBe("2026-07-19T04:30:00.000Z");
  });

  it("converts a summer (AEDT, +11) wall-clock to the right UTC instant", () => {
    // 2026-01-15 14:30 in Sydney (UTC+11) is 03:30 UTC the same day.
    const utc = ownerLocalToUtc("2026-01-15T14:30", SYDNEY);
    expect(utc?.toISOString()).toBe("2026-01-15T03:30:00.000Z");
  });

  it("keeps a late-evening local time on its own local day (near midnight)", () => {
    // 23:30 Sydney (winter) is 13:30 UTC the SAME calendar day.
    const utc = ownerLocalToUtc("2026-07-19T23:30", SYDNEY);
    expect(utc?.toISOString()).toBe("2026-07-19T13:30:00.000Z");
  });

  it("maps an early-morning local time back to the previous UTC day", () => {
    // 00:30 Sydney (winter) is 14:30 UTC the PREVIOUS calendar day.
    const utc = ownerLocalToUtc("2026-07-19T00:30", SYDNEY);
    expect(utc?.toISOString()).toBe("2026-07-18T14:30:00.000Z");
  });

  it("round-trips an instant back to the same owner-local wall-clock", () => {
    for (const local of [
      "2026-07-19T14:30",
      "2026-01-15T09:05",
      "2026-12-31T23:59",
      "2026-06-01T00:00",
    ]) {
      const utc = ownerLocalToUtc(local, SYDNEY);
      expect(utc).not.toBeNull();
      expect(utcToOwnerLocal(utc as Date, SYDNEY)).toBe(local);
    }
  });

  it("rejects a nonexistent spring-forward gap time (can’t round-trip)", () => {
    // DST begins 2026-10-04 02:00 → 03:00; 02:30 does not exist locally, so it
    // cannot faithfully represent the entered wall-clock and is rejected.
    expect(ownerLocalToUtc("2026-10-04T02:30", SYDNEY)).toBeNull();
  });

  it("resolves an autumn overlap time to the standard-time occurrence", () => {
    // DST ends 2026-04-05 03:00 → 02:00; 02:30 occurs twice. It round-trips to
    // itself, so it is accepted deterministically at the post-transition (AEST,
    // +10) occurrence, 2026-04-04T16:30Z.
    const utc = ownerLocalToUtc("2026-04-05T02:30", SYDNEY);
    expect(utc?.toISOString()).toBe("2026-04-04T16:30:00.000Z");
    expect(utcToOwnerLocal(utc as Date, SYDNEY)).toBe("2026-04-05T02:30");
  });

  it("rejects an invalid calendar date instead of silently normalising it", () => {
    // JS would normalise Feb 30/31 into March; the round-trip check catches it.
    expect(ownerLocalToUtc("2026-02-31T10:00", SYDNEY)).toBeNull();
    expect(ownerLocalToUtc("2026-02-30T10:00", SYDNEY)).toBeNull();
    expect(ownerLocalToUtc("2026-04-31T10:00", SYDNEY)).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(ownerLocalToUtc("", SYDNEY)).toBeNull();
    expect(ownerLocalToUtc("2026-13-01T00:00", SYDNEY)).toBeNull();
    expect(ownerLocalToUtc("2026-07-19T24:00", SYDNEY)).toBeNull();
    expect(ownerLocalToUtc("not-a-date", SYDNEY)).toBeNull();
  });
});

describe("startOfLocalDayUtc / endOfLocalDayUtc", () => {
  it("bounds a local day inclusively across the whole day", () => {
    // Sydney winter (+10): local midnight 2026-07-19 is 2026-07-18T14:00Z; the
    // inclusive end is the next local midnight minus 1 ms.
    expect(startOfLocalDayUtc("2026-07-19", SYDNEY)?.toISOString()).toBe(
      "2026-07-18T14:00:00.000Z",
    );
    expect(endOfLocalDayUtc("2026-07-19", SYDNEY)?.toISOString()).toBe(
      "2026-07-19T13:59:59.999Z",
    );
  });

  it("returns null for a malformed day key", () => {
    expect(startOfLocalDayUtc("nope", SYDNEY)).toBeNull();
    expect(endOfLocalDayUtc("2026-13-40", SYDNEY)).toBeNull();
  });
});

describe("formatZonedTime", () => {
  it("formats the local 24-hour time in the display zone", () => {
    // 04:30 UTC is 14:30 in Sydney (winter).
    expect(formatZonedTime(new Date("2026-07-19T04:30:00.000Z"), SYDNEY)).toBe(
      "14:30",
    );
    // Midnight local.
    expect(formatZonedTime(new Date("2026-07-18T14:00:00.000Z"), SYDNEY)).toBe(
      "00:00",
    );
  });
});

describe("diaryDayHeading", () => {
  it("labels the reference day 'Today' and the day before 'Yesterday'", () => {
    expect(diaryDayHeading("2026-07-19", "2026-07-19")).toBe("Today");
    expect(diaryDayHeading("2026-07-18", "2026-07-19")).toBe("Yesterday");
  });

  it("labels 'Yesterday' correctly across a month boundary", () => {
    expect(diaryDayHeading("2026-06-30", "2026-07-01")).toBe("Yesterday");
  });

  it("labels older days with an absolute weekday date", () => {
    expect(diaryDayHeading("2026-07-15", "2026-07-19")).toMatch(
      /^\w+day, 15 July 2026$/,
    );
  });
});

describe("Day-mode navigator helpers", () => {
  it("steps forward and backward across month/year boundaries", () => {
    expect(addDaysToDayKey("2026-07-15", 1)).toBe("2026-07-16");
    expect(addDaysToDayKey("2026-07-01", -1)).toBe("2026-06-30");
    expect(addDaysToDayKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToDayKey("not-a-day", 1)).toBeNull();
  });

  it("accepts real local days and rejects malformed ones", () => {
    expect(isValidDayKey("2026-07-19", SYDNEY)).toBe(true);
    expect(isValidDayKey("2026-13-40", SYDNEY)).toBe(false);
    expect(isValidDayKey("2026-02-31", SYDNEY)).toBe(false);
    expect(isValidDayKey("nope", SYDNEY)).toBe(false);
  });

  it("formats day keys for the navigator and headings", () => {
    expect(formatDayKeyLong("2024-05-20")).toBe("Monday, 20 May 2024");
    expect(formatDayKeyMedium("2024-05-20")).toBe("Mon, 20 May 2024");
  });
});

describe("zoned date labels", () => {
  it("formats an absolute date and date-time in the display zone", () => {
    // 2026-07-19T04:30Z is 14:30 on 2026-07-19 in Sydney (AEST, +10).
    const instant = new Date("2026-07-19T04:30:00.000Z");
    expect(formatZonedDateLong(instant, SYDNEY)).toBe("19 July 2026");
    expect(formatZonedDateTimeLong(instant, SYDNEY)).toBe(
      "19 July 2026 at 14:30",
    );
  });
});
