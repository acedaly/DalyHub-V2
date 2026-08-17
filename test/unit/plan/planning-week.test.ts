/**
 * PLAN-01 — the planning week's arithmetic.
 *
 * Pure, so every claim the surface makes about "which week is this?" is asserted
 * here without a database, a browser or a clock. The cases that matter are the
 * ones a planner gets wrong: a month edge, a year edge, a DST edge, and the
 * owner's first-day-of-week preference.
 */

import { describe, expect, it } from "vitest";

import {
  PLANNING_WEEK_DAYS,
  addPlanningDays,
  clampPlanningOffset,
  defaultPlanningDay,
  isPlanningDate,
  parsePlanningWeekParam,
  planningWeek,
  planningWeekRangeLabel,
  planningWeekStart,
  resolvePlanningDay,
} from "~/kernel/planning";

describe("planningWeekStart", () => {
  it("resolves the owner's Monday-start week", () => {
    // 2026-08-17 is a Monday; 2026-08-23 the Sunday that closes its week.
    expect(planningWeekStart("2026-08-17", "monday")).toBe("2026-08-17");
    expect(planningWeekStart("2026-08-19", "monday")).toBe("2026-08-17");
    expect(planningWeekStart("2026-08-23", "monday")).toBe("2026-08-17");
  });

  it("resolves the owner's Sunday-start week", () => {
    expect(planningWeekStart("2026-08-17", "sunday")).toBe("2026-08-16");
    expect(planningWeekStart("2026-08-16", "sunday")).toBe("2026-08-16");
    expect(planningWeekStart("2026-08-22", "sunday")).toBe("2026-08-16");
  });

  it("returns the input unchanged for a value that is not a date", () => {
    expect(planningWeekStart("not-a-date", "monday")).toBe("not-a-date");
    // A component that does not round-trip is not a date either.
    expect(planningWeekStart("2026-02-31", "monday")).toBe("2026-02-31");
  });
});

describe("planningWeek", () => {
  it("builds seven consecutive days from the owner's week start", () => {
    const week = planningWeek({
      todayIso: "2026-08-19",
      firstDayOfWeek: "monday",
    });
    expect(week.startIso).toBe("2026-08-17");
    expect(week.endIso).toBe("2026-08-23");
    expect(week.days).toHaveLength(PLANNING_WEEK_DAYS);
    expect(week.days.map((day) => day.dateIso)).toEqual([
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
      "2026-08-23",
    ]);
    expect(week.relativeLabel).toBe("This week");
  });

  it("marks exactly one day as today, and past days as past", () => {
    const week = planningWeek({
      todayIso: "2026-08-19",
      firstDayOfWeek: "monday",
    });
    expect(week.days.filter((day) => day.isToday)).toHaveLength(1);
    expect(week.days.find((day) => day.isToday)?.dateIso).toBe("2026-08-19");
    expect(week.days.filter((day) => day.isPast).map((d) => d.dateIso)).toEqual([
      "2026-08-17",
      "2026-08-18",
    ]);
  });

  it("names the weekend without relying on colour", () => {
    const week = planningWeek({
      todayIso: "2026-08-19",
      firstDayOfWeek: "monday",
    });
    expect(
      week.days.filter((day) => day.isWeekend).map((day) => day.weekdayShort),
    ).toEqual(["Sat", "Sun"]);
  });

  it("crosses a MONTH boundary without mislabelling a day", () => {
    // 2026-08-31 is a Monday; its week runs into September.
    const week = planningWeek({
      todayIso: "2026-09-02",
      firstDayOfWeek: "monday",
    });
    expect(week.startIso).toBe("2026-08-31");
    expect(week.endIso).toBe("2026-09-06");
    expect(week.rangeLabel).toBe("31 August – 6 September 2026");
    expect(week.days[0]?.weekdayLong).toBe("Monday");
    expect(week.days[6]?.weekdayLong).toBe("Sunday");
  });

  it("crosses a YEAR boundary without mislabelling a day", () => {
    // 2026-12-28 is a Monday; its week runs into 2027.
    const week = planningWeek({
      todayIso: "2026-12-31",
      firstDayOfWeek: "monday",
    });
    expect(week.startIso).toBe("2026-12-28");
    expect(week.endIso).toBe("2027-01-03");
    expect(week.rangeLabel).toBe("28 December 2026 – 3 January 2027");
  });

  it("navigates to the previous and next week across a month edge", () => {
    const week = planningWeek({
      todayIso: "2026-09-02",
      firstDayOfWeek: "monday",
      offset: 1,
    });
    expect(week.startIso).toBe("2026-09-07");
    expect(week.endIso).toBe("2026-09-13");
    expect(week.relativeLabel).toBe("Next week");

    const back = planningWeek({
      todayIso: "2026-09-02",
      firstDayOfWeek: "monday",
      offset: -1,
    });
    expect(back.startIso).toBe("2026-08-24");
    expect(back.relativeLabel).toBe("Last week");
  });

  it("bounds navigation, so a hand-typed offset lands somewhere real", () => {
    const far = planningWeek({
      todayIso: "2026-08-19",
      firstDayOfWeek: "monday",
      offset: 99,
    });
    expect(far.offset).toBe(1);
    expect(far.nextOffset).toBeNull();
    const back = planningWeek({
      todayIso: "2026-08-19",
      firstDayOfWeek: "monday",
      offset: -99,
    });
    expect(back.offset).toBe(-1);
    expect(back.previousOffset).toBeNull();
  });

  /**
   * The DST case, stated in full.
   *
   * Sydney leaves daylight saving on the first Sunday of April: 2026-04-05. A
   * week built by adding 86,400,000 ms seven times to a local `Date` gains an
   * hour that day and can land on the wrong calendar date. Every value in this
   * module is a wall-calendar string stepped as an integer number of days and
   * formatted from noon UTC, so the intended owner-local day cannot move.
   */
  it("is unaffected by a DST transition inside the week", () => {
    const week = planningWeek({
      todayIso: "2026-04-01",
      firstDayOfWeek: "monday",
    });
    expect(week.startIso).toBe("2026-03-30");
    expect(week.endIso).toBe("2026-04-05");
    expect(week.days.map((day) => day.dateIso)).toEqual([
      "2026-03-30",
      "2026-03-31",
      "2026-04-01",
      "2026-04-02",
      "2026-04-03",
      "2026-04-04",
      "2026-04-05",
    ]);
    // The last day is still the Sunday it is meant to be, not the Saturday an
    // hour of drift would make it.
    expect(week.days[6]?.weekdayLong).toBe("Sunday");
    // …and the northern-hemisphere transition in the other direction, too.
    const spring = planningWeek({
      todayIso: "2026-03-30",
      firstDayOfWeek: "sunday",
    });
    expect(spring.startIso).toBe("2026-03-29");
    expect(spring.days[6]?.dateIso).toBe("2026-04-04");
  });
});

describe("planningWeekRangeLabel", () => {
  it("prints the month once when the week does not cross one", () => {
    expect(planningWeekRangeLabel("2026-08-17", "2026-08-23")).toBe(
      "17–23 August 2026",
    );
  });
});

describe("parsePlanningWeekParam", () => {
  it("accepts the words the product's own links use", () => {
    expect(parsePlanningWeekParam("next")).toBe(1);
    expect(parsePlanningWeekParam("this")).toBe(0);
    expect(parsePlanningWeekParam("last")).toBe(-1);
    expect(parsePlanningWeekParam("NEXT")).toBe(1);
  });

  it("accepts a bounded numeric offset and degrades everything else to 0", () => {
    expect(parsePlanningWeekParam("1")).toBe(1);
    expect(parsePlanningWeekParam("-1")).toBe(-1);
    expect(parsePlanningWeekParam("42")).toBe(1);
    expect(parsePlanningWeekParam("../etc/passwd")).toBe(0);
    expect(parsePlanningWeekParam(null)).toBe(0);
  });
});

describe("clampPlanningOffset", () => {
  it("never returns a value outside the bounded range", () => {
    expect(clampPlanningOffset(5)).toBe(1);
    expect(clampPlanningOffset(-5)).toBe(-1);
    expect(clampPlanningOffset(Number.NaN)).toBe(0);
    // A non-finite value is not "very far away", it is not a number of weeks at
    // all, so it degrades to THIS week rather than to the far edge.
    expect(clampPlanningOffset(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampPlanningOffset({})).toBe(0);
  });
});

describe("the selected day", () => {
  const week = planningWeek({
    todayIso: "2026-08-19",
    firstDayOfWeek: "monday",
  });

  it("opens on today when today is inside the week", () => {
    expect(defaultPlanningDay(week, "2026-08-19")).toBe("2026-08-19");
  });

  it("opens on the week's first day when today is outside it", () => {
    const next = planningWeek({
      todayIso: "2026-08-19",
      firstDayOfWeek: "monday",
      offset: 1,
    });
    expect(defaultPlanningDay(next, "2026-08-19")).toBe("2026-08-24");
  });

  it("never resolves a day the loader did not fetch", () => {
    expect(resolvePlanningDay(week, "2026-08-19", "2026-08-21")).toBe(
      "2026-08-21",
    );
    // Outside the week, malformed, and absent all degrade to the default.
    expect(resolvePlanningDay(week, "2026-08-19", "2026-09-01")).toBe(
      "2026-08-19",
    );
    expect(resolvePlanningDay(week, "2026-08-19", "tomorrow")).toBe(
      "2026-08-19",
    );
    expect(resolvePlanningDay(week, "2026-08-19", null)).toBe("2026-08-19");
  });
});

describe("addPlanningDays / isPlanningDate", () => {
  it("steps calendar days across a month and a leap day", () => {
    expect(addPlanningDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addPlanningDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addPlanningDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("rejects a value that is not a real calendar date", () => {
    expect(isPlanningDate("2026-08-17")).toBe(true);
    expect(isPlanningDate("2026-02-31")).toBe(false);
    expect(isPlanningDate("2026-8-17")).toBe(false);
    expect(isPlanningDate(17)).toBe(false);
  });
});
