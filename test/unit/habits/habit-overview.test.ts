/**
 * UX-02 — the figures the rebuilt `/habits` collection prints, and the week strip.
 *
 * HABITS-01's wording rules are unchanged and are asserted in
 * `habit-view.test.ts`; this file covers what UX-02 ADDED, and the assertions are
 * deliberately about the RULES rather than the arithmetic:
 *
 *   - a percentage exists, it is bounded, and a window that expected nothing has
 *     none — because [ADR-104](../../../docs/decisions/ARCHITECTURE_DECISIONS.md)
 *     permits a proportion of a stated denominator and nothing else;
 *   - "due today" means the day ASKED for it, so an unscheduled Tuesday is never
 *     counted as work outstanding;
 *   - the week strip stops at today, so a Thursday is never drawn as a Wednesday
 *     that went wrong.
 */

import { describe, expect, it } from "vitest";

import type { Habit } from "~/kernel/habits";
import {
  habitConsistencyPercent,
  habitDueToday,
  habitOpenToday,
  serializeHabit,
} from "~/shared/habits";

const MON = "2026-08-17";
const TUE = "2026-08-18";
const WED = "2026-08-19";
const THU = "2026-08-20";

/** Wednesday, in a Monday-start week. */
const CALENDAR = { todayIso: WED, firstDayOfWeek: "monday" } as const;

function habit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: "h1",
    workspaceId: "ws" as Habit["workspaceId"],
    title: "Read",
    notes: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    deletedAt: null,
    archivedAt: null,
    archivedOn: null,
    schedule: { kind: "daily" },
    versions: [
      {
        id: "v",
        schedule: { kind: "daily" },
        effectiveFrom: "2026-07-01",
        effectiveTo: null,
      },
    ],
    goal: null,
    area: null,
    ...overrides,
  };
}

/** A Habit scheduled on the given weekdays (Sunday = 0). */
function onWeekdays(weekdays: readonly number[]): Habit {
  return habit({
    schedule: { kind: "weekdays", weekdays },
    versions: [
      {
        id: "v",
        schedule: { kind: "weekdays", weekdays },
        effectiveFrom: "2026-07-01",
        effectiveTo: null,
      },
    ],
  });
}

/** A Habit asked for N times in the owner's week. */
function timesPerWeek(count: number): Habit {
  return habit({
    schedule: { kind: "weekly_count", timesPerWeek: count },
    versions: [
      {
        id: "v",
        schedule: { kind: "weekly_count", timesPerWeek: count },
        effectiveFrom: "2026-07-01",
        effectiveTo: null,
      },
    ],
  });
}

describe("the recent window as a proportion", () => {
  it("states the percentage of what was expected", () => {
    expect(habitConsistencyPercent({ expected: 12, completed: 9 })).toBe(75);
    expect(habitConsistencyPercent({ expected: 142, completed: 111 })).toBe(78);
  });

  it("is 100 for a window fully kept, and 0 for one fully missed", () => {
    expect(habitConsistencyPercent({ expected: 7, completed: 7 })).toBe(100);
    expect(habitConsistencyPercent({ expected: 7, completed: 0 })).toBe(0);
  });

  it("is NULL when the window expected nothing", () => {
    /*
     * The rule ADR-104 keeps from HABITS-01: a window with no expectation has no
     * proportion. "0%" against days nobody was asked for anything on is a
     * manufactured verdict, and the surface says so in words instead.
     */
    expect(habitConsistencyPercent({ expected: 0, completed: 0 })).toBeNull();
  });

  it("cannot exceed 100, however the counts arrive", () => {
    // A stored oddity must not be able to draw an arc past full.
    expect(habitConsistencyPercent({ expected: 3, completed: 9 })).toBe(100);
  });

  it("rounds to a whole number, because a habit is not an instrument", () => {
    expect(habitConsistencyPercent({ expected: 3, completed: 1 })).toBe(33);
    expect(habitConsistencyPercent({ expected: 3, completed: 2 })).toBe(67);
  });
});

describe("what today asks for", () => {
  it("is due when the cadence names today", () => {
    // Wednesday is weekday 3.
    const due = serializeHabit(onWeekdays([1, 3, 5]), new Set(), CALENDAR);
    expect(habitDueToday(due)).toBe(true);
    expect(habitOpenToday(due)).toBe(true);
  });

  it("is NOT due on a day the cadence never names", () => {
    /*
     * The rule this exists to protect: an unscheduled Tuesday is not a failure
     * and must never be counted as work outstanding. A Mon/Wed/Fri habit asks
     * nothing of a Thursday, so the figure the owner reads does not include it.
     */
    const rest = serializeHabit(onWeekdays([1, 5]), new Set(), CALENDAR);
    expect(habitDueToday(rest)).toBe(false);
    expect(habitOpenToday(rest)).toBe(false);
  });

  it("is due but not OPEN once today is checked in", () => {
    const done = serializeHabit(
      onWeekdays([1, 3, 5]),
      new Set([WED]),
      CALENDAR,
    );
    expect(habitDueToday(done)).toBe(true);
    expect(habitOpenToday(done)).toBe(false);
  });

  it("is due while a count-based week is not yet satisfied", () => {
    const partial = serializeHabit(timesPerWeek(3), new Set([MON]), CALENDAR);
    expect(habitDueToday(partial)).toBe(true);
    expect(habitOpenToday(partial)).toBe(true);
  });

  it("is NOT due once a count-based week is satisfied", () => {
    // Three of three already done: today asks for nothing more, and a figure
    // that still counted it would be asking for a fourth.
    const met = serializeHabit(timesPerWeek(2), new Set([MON, TUE]), CALENDAR);
    expect(met.week.met).toBe(true);
    expect(habitDueToday(met)).toBe(false);
  });

  it("is due when a satisfied count-based week was satisfied TODAY", () => {
    // The check-in that met the target happened today, so today did ask for it —
    // and the row must stay checkable so the owner can undo it.
    const metToday = serializeHabit(
      timesPerWeek(2),
      new Set([MON, WED]),
      CALENDAR,
    );
    expect(metToday.week.met).toBe(true);
    expect(habitDueToday(metToday)).toBe(true);
    expect(habitOpenToday(metToday)).toBe(false);
  });

  it("is never due for an ARCHIVED Habit", () => {
    const archived = serializeHabit(
      habit({
        archivedAt: new Date("2026-08-10T00:00:00.000Z"),
        archivedOn: "2026-08-10",
      }),
      new Set(),
      CALENDAR,
    );
    expect(archived.archived).toBe(true);
    expect(habitDueToday(archived)).toBe(false);
  });
});

describe("this week, as the collection's strip", () => {
  it("is absent unless the surface asked for it", () => {
    /*
     * The `TaskRowData.checklist` precedent: absent means "not projected", which
     * is deliberately different from an empty array. Today and a Goal's
     * supporting section pay nothing for a strip they do not draw.
     */
    expect(serializeHabit(habit(), new Set(), CALENDAR).weekHistory).toBe(
      undefined,
    );
  });

  it("stops at TODAY — a future day of this week is not in it at all", () => {
    const view = serializeHabit(habit(), new Set([MON, TUE]), CALENDAR, {
      weekHistory: true,
    });
    expect(view.weekHistory?.map((day) => day.dateIso)).toEqual([
      MON,
      TUE,
      WED,
    ]);
    expect(view.weekHistory?.some((day) => day.dateIso === THU)).toBe(false);
  });

  it("marks what happened and what was asked for, and nothing else", () => {
    const view = serializeHabit(habit(), new Set([MON]), CALENDAR, {
      weekHistory: true,
    });
    expect(view.weekHistory?.map((day) => day.state)).toEqual([
      "completed",
      "expected",
      "expected",
    ]);
  });

  it("calls an unscheduled day UNSCHEDULED, never missed", () => {
    // Monday/Wednesday only: Tuesday asked for nothing, and the word for it is
    // not a verdict.
    const view = serializeHabit(onWeekdays([1, 3]), new Set([MON]), CALENDAR, {
      weekHistory: true,
    });
    const tuesday = view.weekHistory?.find((day) => day.dateIso === TUE);
    expect(tuesday?.state).toBe("unscheduled");
    expect(tuesday?.label).toContain("not scheduled");
  });

  it("gives every day a sentence, so nothing is colour alone", () => {
    const view = serializeHabit(habit(), new Set([MON]), CALENDAR, {
      weekHistory: true,
    });
    for (const day of view.weekHistory ?? []) {
      expect(day.label.length).toBeGreaterThan(0);
      expect(day.label).toContain(day.dateIso);
    }
  });

  it("says nothing about a day before the Habit existed", () => {
    const late = habit({
      versions: [
        {
          id: "v",
          schedule: { kind: "daily" },
          effectiveFrom: TUE,
          effectiveTo: null,
        },
      ],
    });
    const view = serializeHabit(late, new Set(), CALENDAR, {
      weekHistory: true,
    });
    const monday = view.weekHistory?.find((day) => day.dateIso === MON);
    expect(monday?.state).toBe("inactive");
    expect(monday?.label).toContain("not active");
  });
});
