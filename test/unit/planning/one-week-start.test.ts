/**
 * DEBT-152 / DEBT-154 — the product has ONE answer to "which week is this?".
 *
 * `firstDayOfWeek` has been a real, validated, settings-surfaced preference
 * since REVIEWS-01. A weekly Review's period, Weekly Planning's week and a
 * Habit's week all resolved it through the shared `planningWeekStart`; Today's
 * Schedule strip carried a private copy that hard-coded Monday
 * (`(day + 3) mod 7`). A Sunday-start owner therefore saw three surfaces begin
 * their week on Sunday and the most-visited screen in the product begin it on
 * Monday — three surfaces, two answers.
 *
 * The assertion below is written the way the entry's closing condition is: not
 * "the strip has a preference parameter", which a caller could simply not pass,
 * but **the four surfaces agree, for BOTH preference values, across a month and
 * a year boundary**. The Monday case is asserted too, because it is the default
 * and the whole point is that a Monday-start owner's strip did not move.
 *
 * The rolling `today … today + 6` window is deliberately NOT here. It is a
 * different question — a preference-free window so a shared `/tasks` link means
 * the same thing to any viewer — and folding it in is exactly the confusion
 * `planning-week.ts` was written to end.
 */

import { describe, expect, it } from "vitest";

import { habitWeek } from "~/kernel/habits";
import { planningWeek } from "~/kernel/planning";
import type { FirstDayOfWeek } from "~/kernel/preferences";
import { weeklyPeriod } from "~/kernel/reviews";
import { weekDatesFor, weekStartIso } from "~/modules/today/day/week-strip";

/** Every surface that answers "which week contains this day?", by name. */
function everyWeekStart(dateIso: string, firstDayOfWeek: FirstDayOfWeek) {
  return {
    today: weekStartIso(dateIso, firstDayOfWeek),
    plan: planningWeek({ todayIso: dateIso, firstDayOfWeek }).startIso,
    habits: habitWeek(dateIso, firstDayOfWeek).startIso,
    review: weeklyPeriod(dateIso, firstDayOfWeek).start,
  };
}

const CASES: readonly { readonly label: string; readonly dateIso: string }[] = [
  { label: "an ordinary Saturday", dateIso: "2026-08-08" },
  { label: "a Sunday", dateIso: "2026-08-09" },
  { label: "a Monday", dateIso: "2026-08-03" },
  { label: "a week across a month boundary", dateIso: "2026-09-02" },
  { label: "a week across a year boundary", dateIso: "2026-12-31" },
];

describe("one week start across Today, Plan, Habits and a weekly Review", () => {
  for (const firstDayOfWeek of ["monday", "sunday"] as const) {
    for (const { label, dateIso } of CASES) {
      it(`agrees on ${label} for a ${firstDayOfWeek}-start owner`, () => {
        const starts = everyWeekStart(dateIso, firstDayOfWeek);
        expect(
          new Set(Object.values(starts)).size,
          JSON.stringify(starts),
        ).toBe(1);
      });
    }
  }

  it("the DEFAULT owner's Today strip is byte-identical to the one it drew", () => {
    // `monday` is the default preference, so this convergence changed nothing
    // for the owner it was not about.
    expect(weekDatesFor("2026-08-08", "monday")).toEqual([
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
      "2026-08-08",
      "2026-08-09",
    ]);
  });

  it("a Sunday-start owner's Today strip actually MOVES", () => {
    /*
     * The failing case, stated as data. Against the previous implementation the
     * expectation below is `2026-08-03 … 2026-08-09` — the Monday week — for a
     * preference that says Sunday. That is the defect, and this is the line
     * that catches it coming back.
     */
    expect(weekDatesFor("2026-08-08", "sunday")).toEqual([
      "2026-08-02",
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
      "2026-08-08",
    ]);
    expect(weekStartIso("2026-08-09", "sunday")).toBe("2026-08-09");
  });
});
