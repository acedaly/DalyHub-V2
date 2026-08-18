/**
 * HABITS-01 — the ONE serialised shape, and the ONE set of words for it.
 *
 * The wording assertions are the point. AGENTS.md §2 forbids manufactured
 * urgency, and a habit tracker is the easiest place in a product to manufacture
 * it — so this file asserts, in as many words, that nothing the product can say
 * about a habit is a streak, a score or a reprimand.
 */

import { describe, expect, it } from "vitest";

import type { Habit } from "~/kernel/habits";
import {
  habitConsistencyLabel,
  habitHistoryDayLabel,
  habitWeekLabel,
  serializeHabit,
  serializeHabitRecord,
} from "~/shared/habits";

const MON = "2026-08-17";
const TUE = "2026-08-18";
const WED = "2026-08-19";

const CALENDAR = { todayIso: WED, firstDayOfWeek: "monday" } as const;

function habit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: "h1",
    workspaceId: "ws" as Habit["workspaceId"],
    title: "Strength training",
    notes: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    deletedAt: null,
    archivedAt: null,
    archivedOn: null,
    schedule: { kind: "weekly_count", timesPerWeek: 3 },
    versions: [
      {
        id: "v",
        schedule: { kind: "weekly_count", timesPerWeek: 3 },
        effectiveFrom: "2026-08-01",
        effectiveTo: null,
      },
    ],
    goal: null,
    area: {
      id: "a1",
      title: "Health",
      colourRank: 0,
      iconKey: null,
      colourSlot: null,
    },
    ...overrides,
  };
}

describe("the week's words", () => {
  it("counts what happened against what was asked for", () => {
    expect(habitWeekLabel({ expected: 3, completed: 1, met: false })).toBe(
      "1 of 3 this week",
    );
  });

  it("says DONE rather than a ratio once the week is satisfied", () => {
    expect(habitWeekLabel({ expected: 3, completed: 3, met: true })).toBe(
      "Done this week",
    );
  });

  it("says NOTHING about a week that expected nothing", () => {
    // A habit created on Friday did not fail Monday to Thursday, and "0 of 0"
    // would invent a measurement nobody made.
    expect(
      habitWeekLabel({ expected: 0, completed: 0, met: false }),
    ).toBeNull();
  });

  it("never uses streak, score or failure language", () => {
    const phrases = [
      habitWeekLabel({ expected: 3, completed: 1, met: false }),
      habitWeekLabel({ expected: 3, completed: 3, met: true }),
      habitConsistencyLabel({ expected: 12, completed: 9 }),
      habitHistoryDayLabel(MON, "expected", 1),
      habitHistoryDayLabel(TUE, "unscheduled", 2),
      habitHistoryDayLabel(TUE, "inactive", 2),
    ].filter((value): value is string => value !== null);
    for (const phrase of phrases) {
      expect(phrase).not.toMatch(
        /streak|chain|missed|failed|broken|don.t break|perfect|score|%/i,
      );
    }
  });
});

describe("the history day's words", () => {
  it("states the fact, and adds no verdict to it", () => {
    expect(habitHistoryDayLabel(MON, "completed", 1)).toBe(
      "Monday 2026-08-17: done",
    );
    expect(habitHistoryDayLabel(MON, "expected", 1)).toBe(
      "Monday 2026-08-17: scheduled, no check-in",
    );
    expect(habitHistoryDayLabel(TUE, "unscheduled", 2)).toBe(
      "Tuesday 2026-08-18: not scheduled",
    );
  });
});

describe("serialisation", () => {
  it("is JSON-safe and carries today's and the week's readings", () => {
    const serialized = serializeHabit(habit(), new Set([MON]), CALENDAR);
    expect(JSON.parse(JSON.stringify(serialized))).toEqual(serialized);
    expect(serialized.scheduleShortLabel).toBe("3× weekly");
    expect(serialized.week.label).toBe("1 of 3 this week");
    expect(serialized.today.checkable).toBe(true);
    expect(serialized.area?.title).toBe("Health");
  });

  it("never offers a check-in on an ARCHIVED habit", () => {
    const serialized = serializeHabit(
      habit({
        archivedAt: new Date("2026-08-18T00:00:00.000Z"),
        archivedOn: TUE,
      }),
      new Set(),
      CALENDAR,
    );
    expect(serialized.archived).toBe(true);
    expect(serialized.today.checkable).toBe(false);
  });

  it("adds the bounded history and the schedule chain for a record", () => {
    const record = serializeHabitRecord(
      habit(),
      new Set([MON]),
      CALENDAR,
      "2026-08-10",
    );
    expect(record.history).toHaveLength(10);
    expect(record.history.at(-1)!.dateIso).toBe(WED);
    expect(record.scheduleHistory).toHaveLength(1);
    /*
     * The window is 2026-08-10..19, and the ONE whole elapsed week inside it is
     * the 10th to the 16th — which holds no check-ins. The 17th's completion is
     * in the CURRENT week, which is still partial and therefore not counted:
     * half a week's target is a number nobody chose.
     */
    expect(record.consistency.label).toBe("0 of 3 expected check-ins");
  });
});
