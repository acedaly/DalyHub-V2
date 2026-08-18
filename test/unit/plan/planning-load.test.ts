/**
 * UX-02 — the planning board's own arithmetic.
 *
 * Two things are tested here and they are both RULES rather than formatting: how
 * long a week's commitments are, and what each of the four figures above the
 * board counts. Both are drawn twice on the screen (a card's own duration and the
 * glance bar's total; the chip row and the glance bar), so a disagreement between
 * two readings of the same fact is exactly the defect these exist to prevent.
 */

import { describe, expect, it } from "vitest";

import {
  planningDurationAccessibleLabel,
  planningDurationLabel,
  planningEntryMinutes,
  planningTotalMinutes,
  planningWeekTotals,
} from "~/kernel/planning";

/** A timed commitment from `start` for `minutes`. */
function timed(start: string, minutes: number) {
  return {
    startsAtIso: start,
    endsAtIso: new Date(Date.parse(start) + minutes * 60_000).toISOString(),
    allDay: false,
  };
}

describe("one commitment's minutes", () => {
  it("is the difference between its two instants", () => {
    expect(planningEntryMinutes(timed("2026-08-17T22:00:00.000Z", 30))).toBe(
      30,
    );
    expect(planningEntryMinutes(timed("2026-08-17T22:00:00.000Z", 90))).toBe(
      90,
    );
  });

  it("is ZERO for an all-day item, which has no duration", () => {
    // A day something is true ON is not a block of time. "24h" would be a figure
    // nobody chose, and it would dominate every week that holds a birthday.
    expect(
      planningEntryMinutes({
        startsAtIso: "2026-08-17T00:00:00.000Z",
        endsAtIso: "2026-08-18T00:00:00.000Z",
        allDay: true,
      }),
    ).toBe(0);
  });

  it("is ZERO rather than negative when the stored instants disagree", () => {
    // A stored oddity must not be able to produce time given BACK to the week.
    expect(
      planningEntryMinutes({
        startsAtIso: "2026-08-17T10:00:00.000Z",
        endsAtIso: "2026-08-17T09:00:00.000Z",
        allDay: false,
      }),
    ).toBe(0);
  });

  it("is ZERO for an unparseable instant, and never NaN", () => {
    expect(
      planningEntryMinutes({
        startsAtIso: "not a date",
        endsAtIso: "2026-08-17T09:00:00.000Z",
        allDay: false,
      }),
    ).toBe(0);
  });

  it("sums a set, counting all-day items as nothing", () => {
    expect(
      planningTotalMinutes([
        timed("2026-08-17T22:00:00.000Z", 30),
        timed("2026-08-18T01:00:00.000Z", 60),
        {
          startsAtIso: "2026-08-19T00:00:00.000Z",
          endsAtIso: "2026-08-20T00:00:00.000Z",
          allDay: true,
        },
      ]),
    ).toBe(90);
  });
});

describe("a duration in words", () => {
  it("says minutes under an hour", () => {
    expect(planningDurationLabel(45)).toBe("45m");
    expect(planningDurationLabel(5)).toBe("5m");
  });

  it("says whole hours without a trailing zero", () => {
    expect(planningDurationLabel(60)).toBe("1h");
    expect(planningDurationLabel(180)).toBe("3h");
  });

  it("says both parts when there are both", () => {
    expect(planningDurationLabel(90)).toBe("1h 30m");
    expect(planningDurationLabel(510)).toBe("8h 30m");
  });

  it("never says days, however long the week is", () => {
    // Mockup 7 prints "3d 30m" for its week; a day is not a unit anybody means
    // by "how much of this week is spoken for", so the product says hours.
    expect(planningDurationLabel(60 * 30)).toBe("30h");
    expect(planningDurationLabel(60 * 30)).not.toContain("d");
  });

  it("is NULL for nothing, so a zero is never drawn as a measurement", () => {
    expect(planningDurationLabel(0)).toBeNull();
    expect(planningDurationLabel(-5)).toBeNull();
    expect(planningDurationLabel(Number.NaN)).toBeNull();
  });

  it("spells itself out for assistive technology", () => {
    // "1h" read aloud is "one h". A screen reader is handed real words.
    expect(planningDurationAccessibleLabel(90)).toBe("1 hour 30 minutes");
    expect(planningDurationAccessibleLabel(60)).toBe("1 hour");
    expect(planningDurationAccessibleLabel(120)).toBe("2 hours");
    expect(planningDurationAccessibleLabel(1)).toBe("1 minute");
    expect(planningDurationAccessibleLabel(0)).toBeNull();
  });
});

const TODAY = "2026-08-19";

/** One serialised-shaped Task, as the totals need it. */
function task(input: {
  readonly dueDate?: string | null;
  readonly completedAt?: string | null;
}) {
  return {
    dueDate: input.dueDate ?? null,
    completedAt: input.completedAt ?? null,
  };
}

describe("the week's four figures", () => {
  it("counts every planned Task on the board", () => {
    const totals = planningWeekTotals({
      todayIso: TODAY,
      queue: [],
      days: [
        { tasks: [task({}), task({})], commitmentMinutes: 0 },
        { tasks: [task({})], commitmentMinutes: 0 },
        { tasks: [], commitmentMinutes: 0 },
      ],
    });
    expect(totals.plannedCount).toBe(3);
  });

  it("counts the queue's length as still to place", () => {
    const totals = planningWeekTotals({
      todayIso: TODAY,
      days: [],
      queue: [{ task: task({}) }, { task: task({}) }],
    });
    expect(totals.unplacedCount).toBe(2);
  });

  it("counts overdue work on the board AND in the queue", () => {
    const totals = planningWeekTotals({
      todayIso: TODAY,
      days: [
        { tasks: [task({ dueDate: "2026-08-10" })], commitmentMinutes: 0 },
      ],
      queue: [{ task: task({ dueDate: "2026-08-01" }) }],
    });
    expect(totals.overdueCount).toBe(2);
  });

  it("does not call TODAY overdue", () => {
    const totals = planningWeekTotals({
      todayIso: TODAY,
      days: [{ tasks: [task({ dueDate: TODAY })], commitmentMinutes: 0 }],
      queue: [],
    });
    expect(totals.overdueCount).toBe(0);
  });

  it("never calls a COMPLETED Task overdue, however old its date", () => {
    // The work is done. A count that includes it is a count of history, and on a
    // planning screen it reads as work outstanding.
    const totals = planningWeekTotals({
      todayIso: TODAY,
      days: [
        {
          tasks: [
            task({
              dueDate: "2020-01-01",
              completedAt: "2026-08-18T00:00:00Z",
            }),
          ],
          commitmentMinutes: 0,
        },
      ],
      queue: [],
    });
    expect(totals.overdueCount).toBe(0);
  });

  it("never calls a Task with NO due date overdue", () => {
    // A Task planned for Monday and never given a deadline cannot be late. This
    // is the distinction the whole surface is built on: a plan is not a promise.
    const totals = planningWeekTotals({
      todayIso: TODAY,
      days: [{ tasks: [task({ dueDate: null })], commitmentMinutes: 0 }],
      queue: [{ task: task({ dueDate: null }) }],
    });
    expect(totals.overdueCount).toBe(0);
  });

  it("sums the week's commitment minutes and states them in words", () => {
    const totals = planningWeekTotals({
      todayIso: TODAY,
      days: [
        { tasks: [], commitmentMinutes: 120 },
        { tasks: [], commitmentMinutes: 60 },
        { tasks: [], commitmentMinutes: 90 },
      ],
      queue: [],
    });
    expect(totals.commitmentMinutes).toBe(270);
    expect(totals.commitmentLabel).toBe("4h 30m");
    expect(totals.commitmentAccessibleLabel).toBe("4 hours 30 minutes");
  });

  it("says NOTHING rather than 0m for a week with no commitments", () => {
    const totals = planningWeekTotals({
      todayIso: TODAY,
      days: [{ tasks: [], commitmentMinutes: 0 }],
      queue: [],
    });
    expect(totals.commitmentMinutes).toBe(0);
    expect(totals.commitmentLabel).toBeNull();
    expect(totals.commitmentAccessibleLabel).toBeNull();
  });

  it("is all zeroes for an empty week, and that is a real answer", () => {
    expect(
      planningWeekTotals({ todayIso: TODAY, days: [], queue: [] }),
    ).toEqual({
      plannedCount: 0,
      unplacedCount: 0,
      overdueCount: 0,
      commitmentMinutes: 0,
      commitmentLabel: null,
      commitmentAccessibleLabel: null,
    });
  });
});
