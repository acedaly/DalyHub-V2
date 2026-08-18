/**
 * HABITS-01 — the ONE validation boundary.
 *
 * Every value that crosses into the Habits domain passes through here, so these
 * rules are what stops an invalid schedule reaching SQL and what makes a
 * future-dated check-in impossible rather than merely discouraged.
 */

import { describe, expect, it } from "vitest";

import {
  HABIT_NOTES_MAX_LENGTH,
  HabitValidationError,
  habitSchedulesEqual,
  normaliseHabitQuery,
  validateHabitCheckInDate,
  validateHabitDateWindow,
  validateHabitId,
  validateHabitLimit,
  validateHabitNotes,
  validateHabitSchedule,
  validateHabitStatus,
  validateHabitTitle,
} from "~/kernel/habits";

describe("the schedule vocabulary", () => {
  it("accepts the three kinds and nothing else", () => {
    expect(validateHabitSchedule({ kind: "daily" })).toEqual({ kind: "daily" });
    expect(() => validateHabitSchedule({ kind: "monthly" })).toThrow(
      HabitValidationError,
    );
    expect(() =>
      validateHabitSchedule({ kind: "cron", expr: "* * * * *" }),
    ).toThrow(HabitValidationError);
  });

  it("NORMALISES a weekday list, so one cadence is one stored value", () => {
    expect(
      validateHabitSchedule({ kind: "weekdays", weekdays: [5, 1, 1, 3] }),
    ).toEqual({ kind: "weekdays", weekdays: [1, 3, 5] });
  });

  it("refuses an empty or out-of-range weekday list", () => {
    expect(() =>
      validateHabitSchedule({ kind: "weekdays", weekdays: [] }),
    ).toThrow(/at least one day/);
    expect(() =>
      validateHabitSchedule({ kind: "weekdays", weekdays: [7] }),
    ).toThrow(/0 \(Sunday\) to 6/);
  });

  it("bounds a weekly target at seven — a week has seven days", () => {
    expect(
      validateHabitSchedule({ kind: "weekly_count", timesPerWeek: 7 }),
    ).toEqual({ kind: "weekly_count", timesPerWeek: 7 });
    expect(() =>
      validateHabitSchedule({ kind: "weekly_count", timesPerWeek: 8 }),
    ).toThrow(/between 1 and 7/);
    expect(() =>
      validateHabitSchedule({ kind: "weekly_count", timesPerWeek: 0 }),
    ).toThrow(HabitValidationError);
  });

  it("compares two normalised schedules by meaning", () => {
    expect(
      habitSchedulesEqual(
        { kind: "weekdays", weekdays: [1, 3] },
        { kind: "weekdays", weekdays: [1, 3] },
      ),
    ).toBe(true);
    expect(
      habitSchedulesEqual(
        { kind: "daily" },
        { kind: "weekly_count", timesPerWeek: 7 },
      ),
    ).toBe(false);
  });
});

describe("check-in dates", () => {
  const TODAY = "2026-08-19";

  it("accepts today and any earlier day", () => {
    expect(validateHabitCheckInDate(TODAY, TODAY)).toBe(TODAY);
    expect(validateHabitCheckInDate("2026-08-01", TODAY)).toBe("2026-08-01");
  });

  it("REFUSES a future date", () => {
    // Not a UI rule. A habit cannot be practised in advance, and letting a
    // client claim otherwise would corrupt every consistency figure derived
    // from the history.
    expect(() => validateHabitCheckInDate("2026-08-20", TODAY)).toThrow(
      /cannot be in the future/,
    );
  });

  it("refuses a value that is not a calendar date", () => {
    expect(() => validateHabitCheckInDate("2026-02-31", TODAY)).toThrow(
      HabitValidationError,
    );
    expect(() => validateHabitCheckInDate("yesterday", TODAY)).toThrow(
      HabitValidationError,
    );
  });
});

describe("the record's own fields", () => {
  it("requires a trimmed, non-empty title", () => {
    expect(validateHabitTitle("  Strength training  ")).toBe(
      "Strength training",
    );
    expect(() => validateHabitTitle("   ")).toThrow(/must not be empty/);
  });

  it("treats empty notes as absent and bounds their length", () => {
    expect(validateHabitNotes("   ")).toBeNull();
    expect(validateHabitNotes(undefined)).toBeNull();
    expect(() =>
      validateHabitNotes("x".repeat(HABIT_NOTES_MAX_LENGTH + 1)),
    ).toThrow(HabitValidationError);
  });

  it("validates ids, statuses, limits, queries and windows", () => {
    expect(validateHabitId(" abc ")).toBe("abc");
    expect(() => validateHabitId("")).toThrow(HabitValidationError);
    expect(validateHabitStatus(undefined)).toBe("active");
    expect(validateHabitStatus("archived")).toBe("archived");
    expect(() => validateHabitStatus("deleted")).toThrow(HabitValidationError);
    expect(validateHabitLimit(undefined)).toBeGreaterThan(0);
    expect(validateHabitLimit(1000)).toBeLessThanOrEqual(100);
    expect(normaliseHabitQuery("  Reading ")).toBe("reading");
    expect(normaliseHabitQuery("   ")).toBeNull();
    expect(validateHabitDateWindow("2026-08-01", "2026-08-07")).toEqual({
      fromIso: "2026-08-01",
      toIso: "2026-08-07",
    });
    expect(() => validateHabitDateWindow("2026-08-07", "2026-08-01")).toThrow(
      /on or after/,
    );
  });
});
