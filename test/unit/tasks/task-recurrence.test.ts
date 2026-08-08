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

/* -------------------------------------------------------------------------- */
/* TASKS-07 — the two scheduling MODES                                         */
/* -------------------------------------------------------------------------- */

describe("recurrence modes (TASKS-07)", () => {
  it("defaults to `fixed` — the semantics every pre-TASKS-07 rule already had", () => {
    // The migration's whole safety argument rests on this: a rule with no stored mode
    // must validate as a fixed schedule, so running the migration cannot change what
    // an existing series means.
    const withoutMode = {
      frequency: "week" as const,
      dateKind: "scheduled" as const,
      interval: 3,
    };
    expect(validateTaskRecurrenceRule(withoutMode).mode).toBe("fixed");
  });

  it("refuses an after-completion rule the domain cannot mean", () => {
    // "Every weekday, three days after I finish it" is not a thing anyone means, and
    // neither is an interval pinned to particular weekdays. Both are refused at the
    // boundary rather than stored and given a surprising interpretation later.
    expect(() =>
      validateTaskRecurrenceRule(
        scheduled({ frequency: "weekday", mode: "after_completion" }),
      ),
    ).toThrow(/days, weeks, months or years/);
    expect(() =>
      validateTaskRecurrenceRule(
        scheduled({
          frequency: "week",
          weekdays: [1],
          mode: "after_completion",
        }),
      ),
    ).toThrow(/weekdays/);
  });

  describe("a FIXED schedule keeps the grid when the work is done late", () => {
    it("keeps a weekly routine on its weekday", () => {
      // Due Monday 3 August, finished Wednesday the 5th. Next Monday is the 10th —
      // the routine does not drift to Wednesdays.
      expect(
        nextTaskOccurrenceDate(
          scheduled({ frequency: "week", interval: 1 }),
          "2026-08-03",
          "2026-08-05",
        ),
      ).toBe("2026-08-10");
    });

    it("keeps a 30-day grid anchored where it started", () => {
      // Anchored 1 August, finished the 6th: the next slot is 31 August, NOT 5 Sep.
      expect(
        nextTaskOccurrenceDate(
          scheduled({ frequency: "day", interval: 30 }),
          "2026-08-01",
          "2026-08-06",
        ),
      ).toBe("2026-08-31");
    });

    it("resumes rather than replaying every missed occurrence", () => {
      // A daily task missed for a month resumes tomorrow, not a month ago.
      expect(
        nextTaskOccurrenceDate(
          scheduled({ frequency: "day", interval: 1 }),
          "2026-07-01",
          "2026-07-30",
        ),
      ).toBe("2026-07-31");
    });

    it("keeps a monthly routine on its anchor day", () => {
      expect(
        nextTaskOccurrenceDate(
          scheduled({ frequency: "month", interval: 3, anchorDay: 1 }),
          "2026-08-01",
          "2026-08-19",
        ),
      ).toBe("2026-11-01");
    });
  });

  describe("an AFTER-COMPLETION interval restarts on the day the work was done", () => {
    const after = (over: Partial<TaskRecurrenceRule>) =>
      scheduled({ mode: "after_completion", ...over });

    it("counts 30 days from the completion, not from the anchor", () => {
      // The brief's own example (§26): due 1 August, completed the 6th → 5 September.
      expect(
        nextTaskOccurrenceDate(
          after({ frequency: "day", interval: 30 }),
          "2026-08-01",
          "2026-08-06",
        ),
      ).toBe("2026-09-05");
    });

    it("counts 14 days from the completion", () => {
      // Scenario D: "Clean CPAP equipment — every 14 days after completion".
      expect(
        nextTaskOccurrenceDate(
          after({ frequency: "day", interval: 14 }),
          "2026-08-01",
          "2026-08-06",
        ),
      ).toBe("2026-08-20");
    });

    it("counts from the completion even when the work was done EARLY", () => {
      // Finished on the 1st for a task anchored on the 10th: the clock restarts on the
      // 1st, because the interval measures "since I last did it".
      expect(
        nextTaskOccurrenceDate(
          after({ frequency: "day", interval: 10 }),
          "2026-08-10",
          "2026-08-01",
        ),
      ).toBe("2026-08-11");
    });

    it("re-anchors a MONTHLY interval to the completion day-of-month", () => {
      // Three months after finishing on the 6th is 6 November — clamping back to the
      // original 1st would be the schedule's answer, not the interval's.
      expect(
        nextTaskOccurrenceDate(
          after({ frequency: "month", interval: 3, anchorDay: 1 }),
          "2026-08-01",
          "2026-08-06",
        ),
      ).toBe("2026-11-06");
    });

    it("clamps a re-anchored monthly interval into a short month", () => {
      // Finished 31 December, repeating every two months: 28 February, never 31.
      expect(
        nextTaskOccurrenceDate(
          after({ frequency: "month", interval: 2, anchorDay: 15 }),
          "2026-12-15",
          "2026-12-31",
        ),
      ).toBe("2027-02-28");
    });

    it("re-anchors a YEARLY interval to the completion date", () => {
      expect(
        nextTaskOccurrenceDate(
          after({
            frequency: "year",
            interval: 1,
            anchorMonth: 1,
            anchorDay: 5,
          }),
          "2026-01-05",
          "2026-03-20",
        ),
      ).toBe("2027-03-20");
    });

    it("counts whole weeks from the completion", () => {
      expect(
        nextTaskOccurrenceDate(
          after({ frequency: "week", interval: 2 }),
          "2026-08-03",
          "2026-08-05",
        ),
      ).toBe("2026-08-19");
    });
  });

  it("the two modes DISAGREE on a late completion — which is the whole point", () => {
    const fixed = nextTaskOccurrenceDate(
      scheduled({ frequency: "day", interval: 7 }),
      "2026-08-03",
      "2026-08-06",
    );
    const relative = nextTaskOccurrenceDate(
      scheduled({ frequency: "day", interval: 7, mode: "after_completion" }),
      "2026-08-03",
      "2026-08-06",
    );
    expect(fixed).toBe("2026-08-10");
    expect(relative).toBe("2026-08-13");
  });

  it("the two modes AGREE when the work is done exactly on time", () => {
    // A useful invariant: the mode only ever matters for a completion that is not on
    // the anchor day, so switching it cannot surprise an owner who is never late.
    for (const interval of [1, 7, 30]) {
      expect(
        nextTaskOccurrenceDate(
          scheduled({ frequency: "day", interval }),
          "2026-08-03",
          "2026-08-03",
        ),
      ).toBe(
        nextTaskOccurrenceDate(
          scheduled({ frequency: "day", interval, mode: "after_completion" }),
          "2026-08-03",
          "2026-08-03",
        ),
      );
    }
  });
});
