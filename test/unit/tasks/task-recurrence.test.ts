import { describe, expect, it } from "vitest";

import {
  nextTaskOccurrenceDate,
  validateTaskRecurrenceRule,
  type TaskRecurrenceRule,
} from "~/kernel/tasks";

const scheduled = (over: Partial<TaskRecurrenceRule>): TaskRecurrenceRule => ({
  frequency: "day",
  interval: 1,
  dateKind: "scheduled",
  mode: "fixed",
  weekdays: [],
  anchorDay: null,
  anchorMonth: null,
  ...over,
});

describe("task recurrence validation", () => {
  it("accepts a small structured rule and rejects invalid intervals", () => {
    expect(
      validateTaskRecurrenceRule(scheduled({ frequency: "week", interval: 2 })),
    ).toEqual(scheduled({ frequency: "week", interval: 2 }));

    expect(() =>
      validateTaskRecurrenceRule(scheduled({ interval: 0 })),
    ).toThrow("interval");
    expect(() =>
      validateTaskRecurrenceRule(scheduled({ interval: 100 })),
    ).toThrow("interval");
  });

  it("normalises selected weekdays and rejects malformed weekdays", () => {
    expect(
      validateTaskRecurrenceRule(
        scheduled({ frequency: "week", weekdays: [5, 1, 5] }),
      ).weekdays,
    ).toEqual([1, 5]);
    expect(() =>
      validateTaskRecurrenceRule(
        scheduled({ frequency: "week", weekdays: [8] }),
      ),
    ).toThrow("weekday");
  });

  it("requires calendar anchors where the rule needs them", () => {
    expect(() =>
      validateTaskRecurrenceRule(scheduled({ frequency: "month" })),
    ).toThrow("anchor day");
    expect(() =>
      validateTaskRecurrenceRule(
        scheduled({ frequency: "year", anchorDay: 15 }),
      ),
    ).toThrow("anchor month");
  });
});

describe("nextTaskOccurrenceDate", () => {
  it("advances daily recurrence and skips missed intervals", () => {
    expect(
      nextTaskOccurrenceDate(
        scheduled({ frequency: "day", interval: 1 }),
        "2026-07-30",
        "2026-07-30",
      ),
    ).toBe("2026-07-31");
    expect(
      nextTaskOccurrenceDate(
        scheduled({ frequency: "day", interval: 3 }),
        "2026-07-01",
        "2026-07-30",
      ),
    ).toBe("2026-07-31");
  });

  it("advances weekday recurrence over weekends", () => {
    expect(
      nextTaskOccurrenceDate(
        scheduled({ frequency: "weekday" }),
        "2026-07-31",
        "2026-07-31",
      ),
    ).toBe("2026-08-03");
  });

  it("supports selected weekdays and every-N-week cadence", () => {
    expect(
      nextTaskOccurrenceDate(
        scheduled({ frequency: "week", interval: 1, weekdays: [5] }),
        "2026-07-31",
        "2026-07-31",
      ),
    ).toBe("2026-08-07");
    expect(
      nextTaskOccurrenceDate(
        scheduled({ frequency: "week", interval: 2, weekdays: [5] }),
        "2026-07-31",
        "2026-08-01",
      ),
    ).toBe("2026-08-14");
  });

  it("clamps monthly recurrence while retaining the original anchor day", () => {
    expect(
      nextTaskOccurrenceDate(
        scheduled({ frequency: "month", interval: 1, anchorDay: 31 }),
        "2026-01-31",
        "2026-01-31",
      ),
    ).toBe("2026-02-28");
    expect(
      nextTaskOccurrenceDate(
        scheduled({ frequency: "month", interval: 1, anchorDay: 31 }),
        "2026-02-28",
        "2026-02-28",
      ),
    ).toBe("2026-03-31");
  });

  it("returns 28 February for non-leap years and 29 February in leap years", () => {
    expect(
      nextTaskOccurrenceDate(
        scheduled({
          frequency: "year",
          interval: 1,
          anchorMonth: 2,
          anchorDay: 29,
        }),
        "2024-02-29",
        "2024-02-29",
      ),
    ).toBe("2025-02-28");
    expect(
      nextTaskOccurrenceDate(
        scheduled({
          frequency: "year",
          interval: 1,
          anchorMonth: 2,
          anchorDay: 29,
        }),
        "2027-02-28",
        "2027-02-28",
      ),
    ).toBe("2028-02-29");
  });
});
