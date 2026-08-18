/**
 * HABITS-01 — the schedule vocabulary and its calendar arithmetic.
 *
 * These are the rules every habit figure in the product is derived from, so they
 * are tested as pure functions with the owner's calendar day supplied as an
 * argument. Nothing here reads a clock.
 */

import { describe, expect, it } from "vitest";

import {
  currentScheduleVersion,
  habitDateRange,
  habitDaysBetween,
  habitFirstEffectiveDate,
  habitScheduleLabel,
  habitScheduleShortLabel,
  habitWeek,
  habitWeekdayIndex,
  habitWeekdayName,
  habitWeekdayOrder,
  isHabitDate,
  isScheduledOn,
  scheduleVersionForDate,
  weekScheduleVersion,
  type HabitScheduleVersion,
} from "~/kernel/habits";

/** 2026-08-17 is a Monday; the fixtures below are anchored to that week. */
const MONDAY = "2026-08-17";
const TUESDAY = "2026-08-18";
const WEDNESDAY = "2026-08-19";
const SUNDAY = "2026-08-23";

function version(
  id: string,
  schedule: HabitScheduleVersion["schedule"],
  from: string,
  to: string | null = null,
): HabitScheduleVersion {
  return { id, schedule, effectiveFrom: from, effectiveTo: to };
}

describe("wall-calendar arithmetic", () => {
  it("reads the weekday from the DATE, never from an ambient timezone", () => {
    expect(habitWeekdayIndex(MONDAY)).toBe(1);
    expect(habitWeekdayIndex(TUESDAY)).toBe(2);
    expect(habitWeekdayIndex(SUNDAY)).toBe(0);
  });

  it("rejects a value that is not a real calendar date", () => {
    expect(isHabitDate("2026-02-31")).toBe(false);
    expect(isHabitDate("2026-8-1")).toBe(false);
    expect(isHabitDate(MONDAY)).toBe(true);
  });

  it("counts whole days between two dates, across a month boundary", () => {
    expect(habitDaysBetween("2026-08-30", "2026-09-02")).toBe(3);
    expect(habitDaysBetween(MONDAY, MONDAY)).toBe(0);
    expect(habitDaysBetween("nope", MONDAY)).toBeNull();
  });

  it("enumerates a bounded inclusive range", () => {
    expect(habitDateRange(MONDAY, WEDNESDAY)).toEqual([
      MONDAY,
      TUESDAY,
      WEDNESDAY,
    ]);
    expect(habitDateRange(WEDNESDAY, MONDAY)).toEqual([]);
    expect(habitDateRange("2026-01-01", "2026-12-31", 5)).toHaveLength(5);
  });
});

describe("the owner's calendar week", () => {
  it("starts on Monday for an owner whose week starts on Monday", () => {
    expect(habitWeek(WEDNESDAY, "monday")).toEqual({
      startIso: MONDAY,
      endIso: SUNDAY,
    });
  });

  it("starts on Sunday for an owner whose week starts on Sunday", () => {
    // The SAME Wednesday lands in a different week. This is the preference that
    // makes "2 of 3 this week" mean what the owner means by "this week".
    expect(habitWeek(WEDNESDAY, "sunday")).toEqual({
      startIso: "2026-08-16",
      endIso: "2026-08-22",
    });
  });

  it("orders the weekdays for display from the owner's own first day", () => {
    expect(habitWeekdayOrder("monday")).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(habitWeekdayOrder("sunday")).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("is immune to a DST transition, because it never converts an instant", () => {
    // Australia's 2026 spring-forward is 2026-10-04 (a Sunday). The week
    // containing the Saturday before it, and the week containing the Sunday
    // itself, are both exactly seven wall-calendar days.
    expect(habitWeek("2026-10-03", "monday")).toEqual({
      startIso: "2026-09-28",
      endIso: "2026-10-04",
    });
    expect(habitWeek("2026-10-05", "monday")).toEqual({
      startIso: "2026-10-05",
      endIso: "2026-10-11",
    });
  });
});

describe("scheduled-on", () => {
  it("says yes to every day for a daily habit", () => {
    expect(isScheduledOn({ kind: "daily" }, MONDAY)).toBe(true);
    expect(isScheduledOn({ kind: "daily" }, SUNDAY)).toBe(true);
  });

  it("says yes only to the chosen weekdays", () => {
    const schedule = { kind: "weekdays", weekdays: [1, 3, 5] } as const;
    expect(isScheduledOn(schedule, MONDAY)).toBe(true);
    expect(isScheduledOn(schedule, TUESDAY)).toBe(false);
    expect(isScheduledOn(schedule, WEDNESDAY)).toBe(true);
  });

  it("says NO on every day for a count-based habit", () => {
    /*
     * The load-bearing case. A habit that asks for three sessions a week is not
     * "due Tuesday", and answering true here would manufacture an obligation the
     * owner never expressed. Its expectation lives on the WEEK.
     */
    const schedule = { kind: "weekly_count", timesPerWeek: 3 } as const;
    for (const date of habitDateRange(MONDAY, SUNDAY)) {
      expect(isScheduledOn(schedule, date)).toBe(false);
    }
  });
});

describe("effective-dated versions", () => {
  const versions = [
    version(
      "v1",
      { kind: "weekdays", weekdays: [1, 3, 5] },
      "2026-07-01",
      "2026-07-31",
    ),
    version("v2", { kind: "weekly_count", timesPerWeek: 2 }, "2026-08-01"),
  ];

  it("resolves the version in force on a given day", () => {
    expect(scheduleVersionForDate(versions, "2026-07-15")?.id).toBe("v1");
    expect(scheduleVersionForDate(versions, "2026-08-15")?.id).toBe("v2");
  });

  it("returns null for a day before the habit existed", () => {
    expect(scheduleVersionForDate(versions, "2026-06-30")).toBeNull();
  });

  it("names the earliest and the current version", () => {
    expect(habitFirstEffectiveDate(versions)).toBe("2026-07-01");
    expect(currentScheduleVersion(versions)?.id).toBe("v2");
  });
});

describe("which version governs a WEEK's target", () => {
  const versions = [
    version(
      "old",
      { kind: "weekly_count", timesPerWeek: 3 },
      "2026-07-01",
      "2026-08-18",
    ),
    version("new", { kind: "weekly_count", timesPerWeek: 2 }, "2026-08-19"),
  ];

  it("reads a PAST week from the version that was in force then", () => {
    // The rule that makes history true: the last day of a past week is in the
    // past, so its target cannot be changed by an edit made today.
    const july = habitWeek("2026-07-15", "monday");
    expect(weekScheduleVersion(versions, july, WEDNESDAY)?.id).toBe("old");
  });

  it("reads the CURRENT week from the version in force today", () => {
    // An owner who just changed their cadence expects this week to reflect it.
    const thisWeek = habitWeek(WEDNESDAY, "monday");
    expect(weekScheduleVersion(versions, thisWeek, WEDNESDAY)?.id).toBe("new");
  });

  it("returns null for a week the habit did not exist in", () => {
    const june = habitWeek("2026-06-10", "monday");
    expect(weekScheduleVersion(versions, june, WEDNESDAY)).toBeNull();
  });
});

describe("the schedule in words", () => {
  it("names every cadence in the owner's own terms", () => {
    expect(habitScheduleLabel({ kind: "daily" })).toBe("Every day");
    expect(
      habitScheduleLabel({ kind: "weekdays", weekdays: [1, 2, 3, 4, 5] }),
    ).toBe("Weekdays");
    expect(habitScheduleLabel({ kind: "weekdays", weekdays: [0, 6] })).toBe(
      "Weekends",
    );
    expect(habitScheduleLabel({ kind: "weekdays", weekdays: [1, 3, 5] })).toBe(
      "Mon, Wed & Fri",
    );
    expect(habitScheduleLabel({ kind: "weekdays", weekdays: [2] })).toBe(
      "Every Tuesday",
    );
    expect(habitScheduleLabel({ kind: "weekly_count", timesPerWeek: 1 })).toBe(
      "Once a week",
    );
    expect(habitScheduleLabel({ kind: "weekly_count", timesPerWeek: 3 })).toBe(
      "3× a week",
    );
  });

  it("reads the chosen days in the OWNER's week order", () => {
    const schedule = { kind: "weekdays", weekdays: [0, 1] } as const;
    expect(habitScheduleLabel(schedule, "monday")).toBe("Mon & Sun");
    expect(habitScheduleLabel(schedule, "sunday")).toBe("Sun & Mon");
  });

  it("has a compact row form for a count-based cadence", () => {
    expect(
      habitScheduleShortLabel({ kind: "weekly_count", timesPerWeek: 3 }),
    ).toBe("3× weekly");
    expect(habitScheduleShortLabel({ kind: "daily" })).toBe("Every day");
  });

  it("names every weekday", () => {
    expect(habitWeekdayName(0)).toBe("Sunday");
    expect(habitWeekdayName(6)).toBe("Saturday");
    expect(habitWeekdayName(99)).toBe("");
  });
});
