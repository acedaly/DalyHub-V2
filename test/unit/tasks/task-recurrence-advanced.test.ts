/**
 * TASKS-12 — the advanced recurrence vocabulary, over the ONE recurrence engine.
 *
 * Every case here goes through `planNextTaskOccurrence` or the pure functions it
 * composes, because that is the single authority for "does this series continue,
 * and where does the next occurrence fall". Nothing in this file computes a date
 * a second way to compare against; the expectations are calendar facts, checked
 * against the actual calendar.
 */

import { describe, expect, it } from "vitest";

import {
  ordinalWeekdayOfMonth,
  nextTaskOccurrenceStep,
  planNextTaskOccurrence,
  validateTaskRecurrenceRule,
  weekdayOfDate,
  type TaskRecurrenceRule,
} from "~/kernel/tasks";

const rule = (over: Partial<TaskRecurrenceRule>): TaskRecurrenceRule => ({
  frequency: "month",
  interval: 1,
  dateKind: "scheduled",
  mode: "fixed",
  weekdays: [],
  ordinal: null,
  weekendRule: "allow",
  endsAfterCount: null,
  endsOnDate: null,
  anchorDay: 1,
  anchorMonth: null,
  ...over,
});

const series = (sequence: number) => ({ sequence });

/** The next date, for a rule that has not ended. Fails loudly if it has. */
function nextDate(
  over: Partial<TaskRecurrenceRule>,
  anchorIso: string,
  todayIso = anchorIso,
  sequence = 0,
): string {
  const step = planNextTaskOccurrence(
    rule(over),
    series(sequence),
    anchorIso,
    todayIso,
  );
  expect(step).not.toBeNull();
  return step!.date;
}

/* -------------------------------------------------------------------------- */
/* Nth weekday of the month                                                   */
/* -------------------------------------------------------------------------- */

describe("ordinalWeekdayOfMonth", () => {
  it("finds each counted ordinal, and `last`, in a 31-day month", () => {
    // August 2026: 1st is a Saturday.
    expect(ordinalWeekdayOfMonth(2026, 8, 1, "first")).toBe("2026-08-03");
    expect(ordinalWeekdayOfMonth(2026, 8, 2, "second")).toBe("2026-08-11");
    expect(ordinalWeekdayOfMonth(2026, 8, 3, "third")).toBe("2026-08-19");
    expect(ordinalWeekdayOfMonth(2026, 8, 4, "fourth")).toBe("2026-08-27");
    expect(ordinalWeekdayOfMonth(2026, 8, 5, "last")).toBe("2026-08-28");
  });

  it("is correct in a 28-day February and in a 29-day leap February", () => {
    // February 2026 has exactly 28 days: the fourth Thursday IS the last one.
    expect(ordinalWeekdayOfMonth(2026, 2, 4, "fourth")).toBe("2026-02-26");
    expect(ordinalWeekdayOfMonth(2026, 2, 4, "last")).toBe("2026-02-26");
    // 2028 is a leap year: 29 February is a Tuesday, so the last Tuesday is the
    // 29th — the day a non-leap year does not have.
    expect(ordinalWeekdayOfMonth(2028, 2, 2, "last")).toBe("2028-02-29");
    expect(weekdayOfDate("2028-02-29")).toBe(2);
  });

  it("puts `last` on the final matching weekday, whatever the month length", () => {
    for (const [year, month] of [
      [2026, 1],
      [2026, 4],
      [2026, 9],
      [2027, 2],
      [2028, 2],
    ] as const) {
      const last = ordinalWeekdayOfMonth(year, month, 5, "last");
      expect(weekdayOfDate(last)).toBe(5);
      // There is no LATER Friday in the same month.
      const day = Number(last.slice(8, 10));
      const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
      expect(day + 7).toBeGreaterThan(daysInMonth);
    }
  });
});

describe("monthly nth-weekday recurrence", () => {
  const ordinalRule = (
    ordinal: TaskRecurrenceRule["ordinal"],
    weekday: number,
  ) => ({ frequency: "month" as const, ordinal, weekdays: [weekday] });

  it("advances first Monday to first Monday across a month boundary", () => {
    // 3 Aug 2026 is the first Monday; the next is 7 September.
    expect(nextDate(ordinalRule("first", 1), "2026-08-03")).toBe("2026-09-07");
  });

  it("advances second Tuesday, third Wednesday and fourth Thursday", () => {
    expect(nextDate(ordinalRule("second", 2), "2026-08-11")).toBe("2026-09-08");
    expect(nextDate(ordinalRule("third", 3), "2026-08-19")).toBe("2026-09-16");
    expect(nextDate(ordinalRule("fourth", 4), "2026-08-27")).toBe("2026-09-24");
  });

  it("advances LAST Friday, and lands on the 25th of a short September", () => {
    expect(nextDate(ordinalRule("last", 5), "2026-08-28")).toBe("2026-09-25");
  });

  it("crosses a YEAR boundary without drifting", () => {
    expect(nextDate(ordinalRule("last", 5), "2026-12-25")).toBe("2027-01-29");
  });

  it("returns the right date in February, including a leap February", () => {
    expect(nextDate(ordinalRule("last", 5), "2026-01-30")).toBe("2026-02-27");
    expect(nextDate(ordinalRule("last", 2), "2028-01-25")).toBe("2028-02-29");
  });

  it("honours an interval greater than one", () => {
    // Every SECOND month: August's last Friday to October's, skipping September.
    expect(
      nextDate({ ...ordinalRule("last", 5), interval: 2 }, "2026-08-28"),
    ).toBe("2026-10-30");
  });

  it("never produces a date on or before the completion day", () => {
    // Completed a fortnight late: the September occurrence has already passed, so
    // the series resumes in October rather than replaying a date behind the owner.
    expect(nextDate(ordinalRule("first", 1), "2026-08-03", "2026-09-20")).toBe(
      "2026-10-05",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Multiple weekdays                                                          */
/* -------------------------------------------------------------------------- */

describe("multi-weekday weekly recurrence", () => {
  const monWedFri = { frequency: "week" as const, weekdays: [1, 3, 5] };
  const tueThu = { frequency: "week" as const, weekdays: [2, 4] };

  it("steps Mon -> Wed -> Fri -> Mon as ONE series", () => {
    // 17 August 2026 is a Monday.
    expect(nextDate(monWedFri, "2026-08-17")).toBe("2026-08-19");
    expect(nextDate(monWedFri, "2026-08-19")).toBe("2026-08-21");
    expect(nextDate(monWedFri, "2026-08-21")).toBe("2026-08-24");
  });

  it("steps Tue -> Thu -> Tue", () => {
    expect(nextDate(tueThu, "2026-08-18")).toBe("2026-08-20");
    expect(nextDate(tueThu, "2026-08-20")).toBe("2026-08-25");
  });

  it("produces no duplicate dates over a long run", () => {
    const seen = new Set<string>();
    let current = "2026-08-17";
    for (let step = 0; step < 60; step += 1) {
      const next = nextDate(monWedFri, current);
      expect(next > current).toBe(true);
      expect(seen.has(next)).toBe(false);
      seen.add(next);
      current = next;
    }
    // Sixty steps of Mon/Wed/Fri is twenty weeks, and every date is one of them.
    expect(seen.size).toBe(60);
    for (const date of seen) expect([1, 3, 5]).toContain(weekdayOfDate(date));
  });

  it("keeps the weekday set across a month AND a year boundary", () => {
    expect(nextDate(monWedFri, "2026-12-30")).toBe("2027-01-01");
    expect(nextDate(monWedFri, "2027-01-01")).toBe("2027-01-04");
  });
});

/* -------------------------------------------------------------------------- */
/* End conditions                                                             */
/* -------------------------------------------------------------------------- */

describe("ends after N occurrences", () => {
  /*
   * The counting rule, stated once and asserted here: the CURRENT occurrence
   * counts. Occurrence number is `sequence + 1`, so a series of three produces
   * successors from sequence 0 and 1 and nothing from sequence 2.
   */
  const thrice = { frequency: "day" as const, endsAfterCount: 3 };

  it("produces exactly N occurrences in total", () => {
    expect(nextDate(thrice, "2026-08-01", "2026-08-01", 0)).toBe("2026-08-02");
    expect(nextDate(thrice, "2026-08-02", "2026-08-02", 1)).toBe("2026-08-03");
    expect(
      planNextTaskOccurrence(
        rule(thrice),
        series(2),
        "2026-08-03",
        "2026-08-03",
      ),
    ).toBeNull();
  });

  it("`ends after 1` means this occurrence and no successor at all", () => {
    expect(
      planNextTaskOccurrence(
        rule({ frequency: "day", endsAfterCount: 1 }),
        series(0),
        "2026-08-01",
        "2026-08-01",
      ),
    ).toBeNull();
  });
});

describe("ends on a date", () => {
  const untilSeptember = {
    frequency: "week" as const,
    weekdays: [1],
    endsOnDate: "2026-09-28",
  };

  it("CREATES the occurrence that falls exactly ON the end date", () => {
    expect(nextDate(untilSeptember, "2026-09-21")).toBe("2026-09-28");
  });

  it("does NOT create the first occurrence after the end date", () => {
    expect(
      planNextTaskOccurrence(
        rule(untilSeptember),
        series(0),
        "2026-09-28",
        "2026-09-28",
      ),
    ).toBeNull();
  });

  it("compares the date the occurrence ACTUALLY falls on, after the weekend rule", () => {
    /*
     * The grid date is Saturday 3 October, which is past the end; the weekend rule
     * would move it back to Friday 2 October, which is not. The end condition
     * reads the moved date, because that is the date the owner sees.
     */
    const step = planNextTaskOccurrence(
      rule({
        frequency: "week",
        weekdays: [6],
        weekendRule: "before",
        endsOnDate: "2026-10-02",
      }),
      series(0),
      "2026-09-26",
      "2026-09-26",
    );
    expect(step?.date).toBe("2026-10-02");
  });
});

/* -------------------------------------------------------------------------- */
/* The weekend rule                                                           */
/* -------------------------------------------------------------------------- */

describe("weekend handling", () => {
  it("`allow` leaves an occurrence on the weekend where it falls", () => {
    // 1 November 2026 is a Sunday.
    expect(nextDate({ frequency: "month", anchorDay: 1 }, "2026-10-01")).toBe(
      "2026-11-01",
    );
  });

  it("`before` moves SATURDAY back to the Friday, and SUNDAY back two days", () => {
    // 1 August 2026 is a Saturday -> Friday 31 July.
    const saturday = nextTaskOccurrenceStep(
      rule({ frequency: "month", anchorDay: 1, weekendRule: "before" }),
      "2026-07-01",
      "2026-07-01",
    );
    expect(saturday).toEqual({ date: "2026-07-31", gridDate: "2026-08-01" });
    // 1 November 2026 is a Sunday -> Friday 30 October.
    const sunday = nextTaskOccurrenceStep(
      rule({ frequency: "month", anchorDay: 1, weekendRule: "before" }),
      "2026-10-01",
      "2026-10-01",
    );
    expect(sunday).toEqual({ date: "2026-10-30", gridDate: "2026-11-01" });
  });

  it("`after` moves SATURDAY forward two days and SUNDAY forward one", () => {
    expect(
      nextTaskOccurrenceStep(
        rule({ frequency: "month", anchorDay: 1, weekendRule: "after" }),
        "2026-07-01",
        "2026-07-01",
      ),
    ).toEqual({ date: "2026-08-03", gridDate: "2026-08-01" });
    expect(
      nextTaskOccurrenceStep(
        rule({ frequency: "month", anchorDay: 1, weekendRule: "after" }),
        "2026-10-01",
        "2026-10-01",
      ),
    ).toEqual({ date: "2026-11-02", gridDate: "2026-11-01" });
  });

  it("REMEMBERS the grid, so a moved occurrence never re-anchors the routine", () => {
    /*
     * The whole point of `gridDate`. The August occurrence moved to 31 July; the
     * step AFTER it is computed from 1 August (the grid), so September is the 1st
     * — not the 31st of August, which is where a re-anchored series would drift.
     */
    const august = nextTaskOccurrenceStep(
      rule({ frequency: "month", anchorDay: 1, weekendRule: "before" }),
      "2026-07-01",
      "2026-07-01",
    );
    const september = nextTaskOccurrenceStep(
      rule({ frequency: "month", anchorDay: 1, weekendRule: "before" }),
      august.gridDate!,
      august.date,
    );
    expect(september.date).toBe("2026-09-01");
    expect(september.gridDate).toBeNull();
  });

  it("`skip` means the occurrence does not exist, and the schedule advances", () => {
    /*
     * A weekly rule on Saturday AND Wednesday, skipping weekends: the Saturday
     * occurrences simply do not happen, so every step lands on a Wednesday.
     */
    const step = nextTaskOccurrenceStep(
      rule({ frequency: "week", weekdays: [3, 6], weekendRule: "skip" }),
      "2026-08-19",
      "2026-08-19",
    );
    expect(step).toEqual({ date: "2026-08-26", gridDate: null });
  });

  it("crosses a YEAR boundary under the weekend rule", () => {
    // 1 January 2028 is a Saturday; `after` moves it to Monday 3 January.
    const step = nextTaskOccurrenceStep(
      rule({
        frequency: "year",
        anchorDay: 1,
        anchorMonth: 1,
        weekendRule: "after",
      }),
      "2027-01-01",
      "2027-01-01",
    );
    expect(step).toEqual({ date: "2028-01-03", gridDate: "2028-01-01" });
  });
});

/* -------------------------------------------------------------------------- */
/* DST, and why it cannot reach this arithmetic                               */
/* -------------------------------------------------------------------------- */

describe("daylight saving cannot move an occurrence", () => {
  /*
   * The owner's timezone is Australia/Sydney (ADR-022), where in 2026 DST ENDS
   * on 5 April (clocks back one hour) and STARTS on 4 October (clocks forward).
   * Those are the two days a naive "add 7 × 86,400,000 milliseconds to a local
   * Date" lands on the wrong calendar day.
   *
   * It cannot happen here, and these assert that rather than assuming it: every
   * function in this module is CALENDAR-ONLY, stepping UTC-midnight dates, and
   * the owner's day arrives as a `YYYY-MM-DD` string that the ONE timezone
   * authority (`ownerCalendarIso`) resolved. There is no local `Date` in the
   * path, so there is no hour to gain or lose.
   */
  it("steps a weekly rule exactly seven days across BOTH Sydney transitions", () => {
    // DST ends Sunday 5 April 2026: the Sunday before is 29 March.
    expect(nextDate({ frequency: "week", weekdays: [0] }, "2026-03-29")).toBe(
      "2026-04-05",
    );
    expect(nextDate({ frequency: "week", weekdays: [0] }, "2026-04-05")).toBe(
      "2026-04-12",
    );
    // DST starts Sunday 4 October 2026.
    expect(nextDate({ frequency: "week", weekdays: [0] }, "2026-09-27")).toBe(
      "2026-10-04",
    );
    expect(nextDate({ frequency: "week", weekdays: [0] }, "2026-10-04")).toBe(
      "2026-10-11",
    );
  });

  it("steps a daily rule exactly one day ACROSS each transition", () => {
    expect(nextDate({ frequency: "day" }, "2026-04-04")).toBe("2026-04-05");
    expect(nextDate({ frequency: "day" }, "2026-04-05")).toBe("2026-04-06");
    expect(nextDate({ frequency: "day" }, "2026-10-03")).toBe("2026-10-04");
    expect(nextDate({ frequency: "day" }, "2026-10-04")).toBe("2026-10-05");
  });

  it("lands an nth-weekday rule on the transition day itself, unmoved", () => {
    // 5 April 2026 is the FIRST Sunday of April; 4 October is the first Sunday
    // of October. Both are transition days, and both are ordinary dates here.
    expect(
      nextDate(
        { frequency: "month", ordinal: "first", weekdays: [0] },
        "2026-03-01",
      ),
    ).toBe("2026-04-05");
    expect(
      nextDate(
        { frequency: "month", ordinal: "first", weekdays: [0] },
        "2026-09-06",
      ),
    ).toBe("2026-10-04");
  });

  it("moves a transition-day occurrence by the weekend rule, not by an hour", () => {
    // Both transitions fall on a Sunday, which is exactly when the weekend rule
    // applies — and it moves the date by WHOLE DAYS in both directions.
    expect(
      nextTaskOccurrenceStep(
        rule({
          frequency: "month",
          ordinal: "first",
          weekdays: [0],
          weekendRule: "after",
          anchorDay: 5,
        }),
        "2026-03-01",
        "2026-03-01",
      ),
    ).toEqual({ date: "2026-04-06", gridDate: "2026-04-05" });
    expect(
      nextTaskOccurrenceStep(
        rule({
          frequency: "month",
          ordinal: "first",
          weekdays: [0],
          weekendRule: "before",
          anchorDay: 5,
        }),
        "2026-09-06",
        "2026-09-06",
      ),
    ).toEqual({ date: "2026-10-02", gridDate: "2026-10-04" });
  });
});

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

describe("advanced rule validation", () => {
  it("refuses an ordinal outside a monthly fixed schedule", () => {
    expect(() =>
      validateTaskRecurrenceRule(
        rule({ frequency: "week", ordinal: "last", weekdays: [5] }),
      ),
    ).toThrow("monthly");
    expect(() =>
      validateTaskRecurrenceRule(
        rule({ mode: "after_completion", ordinal: "last", weekdays: [5] }),
      ),
    ).toThrow("after-completion");
  });

  it("requires EXACTLY one weekday for an ordinal rule", () => {
    expect(() =>
      validateTaskRecurrenceRule(rule({ ordinal: "last", weekdays: [] })),
    ).toThrow("exactly one weekday");
    expect(() =>
      validateTaskRecurrenceRule(rule({ ordinal: "last", weekdays: [1, 5] })),
    ).toThrow("exactly one weekday");
  });

  it("refuses a weekend rule on a daily or every-weekday repeat", () => {
    expect(() =>
      validateTaskRecurrenceRule(
        rule({ frequency: "day", weekendRule: "before", anchorDay: null }),
      ),
    ).toThrow("weekly, monthly and yearly");
    expect(() =>
      validateTaskRecurrenceRule(
        rule({ frequency: "weekday", weekendRule: "skip", anchorDay: null }),
      ),
    ).toThrow("weekly, monthly and yearly");
  });

  it("refuses a weekend-only weekly rule that skips weekends", () => {
    expect(() =>
      validateTaskRecurrenceRule(
        rule({
          frequency: "week",
          weekdays: [0, 6],
          weekendRule: "skip",
          anchorDay: null,
        }),
      ),
    ).toThrow("no occurrences");
  });

  it("refuses BOTH end conditions at once", () => {
    expect(() =>
      validateTaskRecurrenceRule(
        rule({ endsAfterCount: 5, endsOnDate: "2026-12-01" }),
      ),
    ).toThrow("not both");
  });

  it("bounds the occurrence count and validates the end date", () => {
    expect(() =>
      validateTaskRecurrenceRule(rule({ endsAfterCount: 0 })),
    ).toThrow("1 to 999");
    expect(() =>
      validateTaskRecurrenceRule(rule({ endsAfterCount: 1000 })),
    ).toThrow("1 to 999");
    expect(() =>
      validateTaskRecurrenceRule(rule({ endsOnDate: "2026-02-30" })),
    ).toThrow("real calendar date");
  });

  it("leaves every rule written before TASKS-12 meaning exactly what it meant", () => {
    // The absent values ARE the old semantics: no ordinal, weekends allowed, no
    // end. A rule that omits all four validates to exactly that.
    const legacy = validateTaskRecurrenceRule({
      frequency: "week",
      interval: 2,
      dateKind: "scheduled",
      weekdays: [1],
    });
    expect(legacy.ordinal).toBeNull();
    expect(legacy.weekendRule).toBe("allow");
    expect(legacy.endsAfterCount).toBeNull();
    expect(legacy.endsOnDate).toBeNull();
    // And it steps exactly as it always did.
    expect(
      nextDate({ frequency: "week", weekdays: [1], interval: 2 }, "2026-08-17"),
    ).toBe("2026-08-31");
  });
});
