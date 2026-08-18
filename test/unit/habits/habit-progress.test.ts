/**
 * HABITS-01 — what a Habit's history MEANS.
 *
 * The invariants asserted here are the product's promises, not implementation
 * details: an unscheduled day is never a miss, a future day is never incomplete,
 * a schedule change never rewrites the past, and there is no streak anywhere.
 */

import { describe, expect, it } from "vitest";

import {
  buildHabitHistory,
  evaluateHabitConsistency,
  evaluateHabitToday,
  evaluateHabitWeek,
  type HabitCalendarContext,
  type HabitFacts,
  type HabitScheduleVersion,
} from "~/kernel/habits";
import { habitConsistencyLabel, habitWeekLabel } from "~/shared/habits";

/** 2026-08-17 Mon … 2026-08-23 Sun. */
const MON = "2026-08-17";
const TUE = "2026-08-18";
const WED = "2026-08-19";
const THU = "2026-08-20";
const FRI = "2026-08-21";

const MONDAY_WEEK: HabitCalendarContext = {
  todayIso: WED,
  firstDayOfWeek: "monday",
};

function facts(
  versions: readonly HabitScheduleVersion[],
  completed: readonly string[] = [],
  archivedOnIso: string | null = null,
): HabitFacts {
  return { versions, completedDates: new Set(completed), archivedOnIso };
}

const DAILY: readonly HabitScheduleVersion[] = [
  {
    id: "v",
    schedule: { kind: "daily" },
    effectiveFrom: "2026-06-01",
    effectiveTo: null,
  },
];
const MWF: readonly HabitScheduleVersion[] = [
  {
    id: "v",
    schedule: { kind: "weekdays", weekdays: [1, 3, 5] },
    effectiveFrom: "2026-06-01",
    effectiveTo: null,
  },
];
const THRICE: readonly HabitScheduleVersion[] = [
  {
    id: "v",
    schedule: { kind: "weekly_count", timesPerWeek: 3 },
    effectiveFrom: "2026-06-01",
    effectiveTo: null,
  },
];

describe("the week", () => {
  it("counts every scheduled day of a DAILY week, including days still to come", () => {
    // "5 of 7 this week" is a factual count of what the week asks for. It does
    // NOT describe Thursday as incomplete; it says the week holds seven days.
    const reading = evaluateHabitWeek(
      facts(DAILY, [MON, TUE, WED]),
      MONDAY_WEEK,
    );
    expect(reading.expected).toBe(7);
    expect(reading.completed).toBe(3);
    expect(reading.met).toBe(false);
  });

  it("counts only the chosen weekdays for a weekday habit", () => {
    const reading = evaluateHabitWeek(facts(MWF, [MON]), MONDAY_WEEK);
    expect(reading.expected).toBe(3);
    expect(reading.completed).toBe(1);
  });

  it("counts the TARGET for a count-based habit, on any days", () => {
    const reading = evaluateHabitWeek(facts(THRICE, [TUE, WED]), MONDAY_WEEK);
    expect(reading.kind).toBe("weekly_count");
    expect(reading.expected).toBe(3);
    expect(reading.completed).toBe(2);
    expect(reading.met).toBe(false);
  });

  it("is MET once the target is reached, and never reports more than the target", () => {
    const reading = evaluateHabitWeek(facts(THRICE, [MON, TUE, WED, THU]), {
      todayIso: FRI,
      firstDayOfWeek: "monday",
    });
    expect(reading.met).toBe(true);
    // Capped, so a seven-session week can never hide a missed week in a summed
    // consistency figure.
    expect(reading.completed).toBe(3);
    expect(reading.recorded).toBe(4);
  });

  it("expects NOTHING of a week the habit did not exist in", () => {
    const reading = evaluateHabitWeek(facts(DAILY), MONDAY_WEEK, "2026-05-04");
    expect(reading.expected).toBe(0);
    expect(reading.met).toBe(false);
  });

  it("uses the OWNER's week boundaries", () => {
    // The same completions, read as two different weeks. `2026-08-16` is the
    // Sunday before; a Sunday-start owner counts it in THIS week.
    const completed = ["2026-08-16", MON];
    expect(
      evaluateHabitWeek(facts(THRICE, completed), {
        todayIso: WED,
        firstDayOfWeek: "monday",
      }).completed,
    ).toBe(1);
    expect(
      evaluateHabitWeek(facts(THRICE, completed), {
        todayIso: WED,
        firstDayOfWeek: "sunday",
      }).completed,
    ).toBe(2);
  });
});

/**
 * V2.3-GATE-01 — the partial first week of an X-times-per-week Habit.
 *
 * The rule, stated once: **a count-based week is held to its target only if the
 * Habit was active for every day of it.** A week the Habit was created inside
 * expects nothing, exactly as a week it did not exist in at all expects nothing,
 * and exactly as a day-based Habit created on Friday is not held to Monday.
 *
 * It is not pro-rated. Half a week's target is a number nobody chose, which is
 * the reason `evaluateHabitConsistency` already gives for excluding an
 * unfinished week rather than scaling it.
 */
describe("a count-based habit started partway through a week", () => {
  /** Created on the SUNDAY — the last day of a Monday-start week. */
  const STARTED_SUNDAY: readonly HabitScheduleVersion[] = [
    {
      id: "v",
      schedule: { kind: "weekly_count", timesPerWeek: 3 },
      effectiveFrom: "2026-08-23",
      effectiveTo: null,
    },
  ];
  const SUNDAY = "2026-08-23";
  const SUNDAY_CONTEXT: HabitCalendarContext = {
    todayIso: SUNDAY,
    firstDayOfWeek: "monday",
  };

  it("expects NOTHING in the week it was created in", () => {
    // Three sessions cannot be reached in the one day the Habit has existed for,
    // and printing "0 of 3 this week" would be an obligation nobody agreed to.
    const reading = evaluateHabitWeek(facts(STARTED_SUNDAY), SUNDAY_CONTEXT);
    expect(reading.expected).toBe(0);
    expect(reading.completed).toBe(0);
    expect(reading.met).toBe(false);
    // …and with nothing expected, the surface says nothing rather than "0 of 0".
    expect(habitWeekLabel(reading)).toBeNull();
  });

  it("still RECORDS a check-in made in that week", () => {
    // Nothing is lost: the day happened, and the history strip says so. Only the
    // manufactured target is absent.
    const reading = evaluateHabitWeek(
      facts(STARTED_SUNDAY, [SUNDAY]),
      SUNDAY_CONTEXT,
    );
    expect(reading.recorded).toBe(1);
    expect(reading.expected).toBe(0);
  });

  it("expects the FULL target from the first whole week onward", () => {
    // The following Monday–Sunday is the first week the Habit existed for all of.
    const nextWeek = evaluateHabitWeek(facts(STARTED_SUNDAY), {
      todayIso: "2026-08-26",
      firstDayOfWeek: "monday",
    });
    expect(nextWeek.expected).toBe(3);
  });

  it("never turns days before it existed into missed opportunities", () => {
    // The days of the creation week that came BEFORE the Habit are `inactive` —
    // not `expected`, and so not misses — in the strip the record draws.
    const history = buildHabitHistory(
      facts(STARTED_SUNDAY),
      SUNDAY_CONTEXT,
      "2026-08-17",
    );
    const before = history.filter((day) => day.dateIso < SUNDAY);
    expect(before).toHaveLength(6);
    expect(before.every((day) => day.state === "inactive")).toBe(true);
  });

  it("carries no expectation for the partial week into the recent window", () => {
    /*
     * The load-bearing case, because this figure is PERMANENT. Read a fortnight
     * later, the creation week is whole and elapsed — so the old rule summed its
     * full target into "expected" and left the owner permanently short in a week
     * they never had a chance in.
     */
    const later: HabitCalendarContext = {
      todayIso: "2026-09-06",
      firstDayOfWeek: "monday",
    };
    const consistency = evaluateHabitConsistency(
      // Every session of both whole weeks done, and one on the creation Sunday.
      facts(STARTED_SUNDAY, [
        SUNDAY,
        "2026-08-24",
        "2026-08-25",
        "2026-08-26",
        "2026-08-31",
        "2026-09-01",
        "2026-09-02",
      ]),
      later,
      "2026-08-17",
    );
    // Two whole weeks at three each — the creation week contributes nothing.
    expect(consistency.expected).toBe(6);
    expect(consistency.completed).toBe(6);
    expect(habitConsistencyLabel(consistency)).toBe(
      "6 of 6 expected check-ins",
    );
  });

  it("applies the same rule at the OTHER end: archiving leaves no debt", () => {
    // Symmetric by construction — a week the Habit was put away inside is a week
    // it was not active for all of, so it is not held to the target either.
    const archived = facts(THRICE, [MON], TUE);
    expect(evaluateHabitWeek(archived, MONDAY_WEEK).expected).toBe(0);
  });
});

describe("today", () => {
  it("is DONE when the day carries a completion", () => {
    const state = evaluateHabitToday(facts(DAILY, [WED]), MONDAY_WEEK);
    expect(state.done).toBe(true);
    expect(state.checkable).toBe(true);
    expect(state.label).toBe("Done today");
  });

  it("is NOT YET on a scheduled day with no completion", () => {
    const state = evaluateHabitToday(facts(MWF), MONDAY_WEEK);
    expect(state.kind).toBe("scheduled");
    expect(state.label).toBe("Not yet today");
  });

  it("is NOT SCHEDULED — never a miss — on a day the habit never asked for", () => {
    /*
     * The sentence this product must be unable to say. A Monday/Wednesday/Friday
     * habit is not failing on a Tuesday: the day was never asked for, the row
     * says so, and it offers no control.
     */
    const state = evaluateHabitToday(facts(MWF), {
      todayIso: TUE,
      firstDayOfWeek: "monday",
    });
    expect(state.kind).toBe("not_scheduled");
    expect(state.label).toBe("Not scheduled today");
    expect(state.checkable).toBe(false);
    expect(state.label).not.toMatch(/miss|fail|overdue|behind/i);
  });

  it("keeps an unscheduled day CHECKABLE once it holds a completion, so it can be undone", () => {
    const state = evaluateHabitToday(facts(MWF, [TUE]), {
      todayIso: TUE,
      firstDayOfWeek: "monday",
    });
    expect(state.checkable).toBe(true);
  });

  it("offers a count-based habit any day, until its week is met", () => {
    expect(
      evaluateHabitToday(facts(THRICE, [MON]), MONDAY_WEEK).checkable,
    ).toBe(true);
    expect(evaluateHabitToday(facts(THRICE, [MON]), MONDAY_WEEK).label).toBe(
      "Any day this week",
    );
    // Met, and today is not itself done: no control, because there is nothing
    // left the week is asking for.
    expect(
      evaluateHabitToday(facts(THRICE, [MON, TUE, THU]), MONDAY_WEEK).checkable,
    ).toBe(false);
  });

  it("is INACTIVE for an archived habit", () => {
    const state = evaluateHabitToday(facts(DAILY, [], TUE), MONDAY_WEEK);
    expect(state.kind).toBe("inactive");
    expect(state.checkable).toBe(false);
  });
});

describe("historical truth across a schedule change", () => {
  /*
   * The invariant the whole versioned-schedule design exists for: changing a
   * cadence today must not change what DalyHub says an earlier week asked for.
   */
  const changed: readonly HabitScheduleVersion[] = [
    {
      id: "old",
      schedule: { kind: "weekdays", weekdays: [1, 3, 5] },
      effectiveFrom: "2026-08-01",
      effectiveTo: "2026-08-16",
    },
    {
      id: "new",
      schedule: { kind: "weekdays", weekdays: [2, 4] },
      effectiveFrom: "2026-08-17",
      effectiveTo: null,
    },
  ];

  it("reads an earlier week under the schedule that was actually in force", () => {
    // The week of 2026-08-10 (Mon) ran entirely under Mon/Wed/Fri.
    const reading = evaluateHabitWeek(
      facts(changed, ["2026-08-10", "2026-08-12"]),
      MONDAY_WEEK,
      "2026-08-10",
    );
    expect(reading.expected).toBe(3);
    expect(reading.completed).toBe(2);
  });

  it("reads the current week under the NEW schedule", () => {
    const reading = evaluateHabitWeek(facts(changed, [TUE]), MONDAY_WEEK);
    expect(reading.expected).toBe(2);
    expect(reading.completed).toBe(1);
  });

  it("reads a week that STRADDLES the change day by day", () => {
    /*
     * The week of 2026-08-10..16 is entirely old; the change lands on Monday the
     * 17th, so no week straddles it here. Construct one that does: a change
     * effective mid-week.
     */
    const midweek: readonly HabitScheduleVersion[] = [
      {
        id: "old",
        schedule: { kind: "weekdays", weekdays: [1, 2, 3] },
        effectiveFrom: "2026-08-01",
        effectiveTo: TUE,
      },
      {
        id: "new",
        schedule: { kind: "weekdays", weekdays: [4, 5] },
        effectiveFrom: WED,
        effectiveTo: null,
      },
    ];
    // Mon + Tue under the old rule (2 days), Thu + Fri under the new one (2).
    // Wednesday is asked for by NEITHER: the old rule stopped on Tuesday and the
    // new one does not name Wednesday.
    const reading = evaluateHabitWeek(facts(midweek), MONDAY_WEEK);
    expect(reading.expected).toBe(4);
  });
});

describe("recent consistency", () => {
  it("counts what the window ASKED FOR against what happened", () => {
    const reading = evaluateHabitConsistency(
      facts(MWF, [MON, WED]),
      MONDAY_WEEK,
      "2026-08-10",
    );
    // 10th (Mon), 12th (Wed), 14th (Fri), 17th (Mon), 19th (Wed) — five expected
    // days at or before today; two of them done.
    expect(reading.expected).toBe(5);
    expect(reading.completed).toBe(2);
  });

  it("never counts a day in the future as expected", () => {
    const reading = evaluateHabitConsistency(
      facts(DAILY),
      MONDAY_WEEK,
      MON,
      "2026-12-31",
    );
    expect(reading.toIso).toBe(WED);
    expect(reading.expected).toBe(3);
  });

  it("counts a count-based habit by WHOLE elapsed weeks", () => {
    const reading = evaluateHabitConsistency(
      facts(THRICE, ["2026-08-10", "2026-08-11", "2026-08-12", MON]),
      MONDAY_WEEK,
      "2026-08-10",
    );
    // Only the week of the 10th is both inside the window and finished; the
    // current week is partial, and half a week's target is a number nobody chose.
    expect(reading.expected).toBe(3);
    expect(reading.completed).toBe(3);
  });

  it("expects nothing after a habit is archived", () => {
    const reading = evaluateHabitConsistency(
      facts(DAILY, [MON], MON),
      MONDAY_WEEK,
      MON,
    );
    expect(reading.expected).toBe(1);
    expect(reading.completed).toBe(1);
  });
});

describe("the history strip", () => {
  it("labels each day with one of four states, and two of them are not failures", () => {
    const days = buildHabitHistory(facts(MWF, [MON]), MONDAY_WEEK, MON);
    expect(days.map((day) => day.state)).toEqual([
      "completed", // Mon, scheduled and done
      "unscheduled", // Tue, never asked for
      "expected", // Wed, asked for and not yet done
    ]);
  });

  it("marks days before the habit existed as inactive, never as missed", () => {
    const days = buildHabitHistory(
      facts(
        [
          {
            id: "v",
            schedule: { kind: "daily" },
            effectiveFrom: TUE,
            effectiveTo: null,
          },
        ],
        [],
      ),
      MONDAY_WEEK,
      MON,
    );
    expect(days[0]!.state).toBe("inactive");
    expect(days[1]!.state).toBe("expected");
  });

  it("never reaches beyond the owner's today", () => {
    const days = buildHabitHistory(
      facts(DAILY),
      MONDAY_WEEK,
      MON,
      "2026-09-30",
    );
    expect(days.at(-1)!.dateIso).toBe(WED);
  });
});
