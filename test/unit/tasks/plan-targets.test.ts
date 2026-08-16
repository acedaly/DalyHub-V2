/**
 * CONTROL-01 — the product's one-press dates.
 *
 * "This weekend" joined Today / Tomorrow / Next week, and a preset that names a
 * day has to name the RIGHT one from any starting day — including the two days
 * on which "this weekend" means today. The arithmetic runs on UTC components, so
 * these also pin that a date-only value's weekday is never read through the
 * local clock (which is how a Saturday becomes a Friday west of Greenwich).
 */

import { describe, expect, it } from "vitest";

import {
  calendarWeekday,
  planTargets,
  taskDateShortcuts,
} from "~/shared/task-record/plan-targets";

describe("calendarWeekday", () => {
  it("reads the weekday of a date-only value", () => {
    // 2026-08-16 is a Sunday; 2026-08-17 a Monday.
    expect(calendarWeekday("2026-08-16")).toBe(0);
    expect(calendarWeekday("2026-08-17")).toBe(1);
    expect(calendarWeekday("2026-08-22")).toBe(6);
  });

  it("returns null rather than guessing at a non-date", () => {
    expect(calendarWeekday("not-a-date")).toBeNull();
  });
});

describe("planTargets — this weekend", () => {
  it("is the COMING Saturday on a weekday", () => {
    // Monday 17 Aug → Saturday 22 Aug.
    expect(planTargets("2026-08-17").thisWeekend).toBe("2026-08-22");
    // Friday 21 Aug → Saturday 22 Aug.
    expect(planTargets("2026-08-21").thisWeekend).toBe("2026-08-22");
  });

  it("is TODAY on a Saturday or a Sunday", () => {
    /*
     * "This weekend" said on a Saturday means today. Resolving it to next
     * week's Saturday would be the one reading nobody intends, and it is what a
     * naive "next Saturday" calculation does.
     */
    expect(planTargets("2026-08-22").thisWeekend).toBe("2026-08-22");
    expect(planTargets("2026-08-23").thisWeekend).toBe("2026-08-23");
  });

  it("keeps the other three targets unchanged", () => {
    const targets = planTargets("2026-08-17");
    expect(targets.today).toBe("2026-08-17");
    expect(targets.tomorrow).toBe("2026-08-18");
    expect(targets.nextWeek).toBe("2026-08-24");
  });
});

describe("taskDateShortcuts", () => {
  it("offers four presets on an ordinary weekday", () => {
    expect(taskDateShortcuts("2026-08-17").map((s) => s.label)).toEqual([
      "Today",
      "Tomorrow",
      "This weekend",
      "Next week",
    ]);
  });

  it("drops a preset that would commit a date another already commits", () => {
    /*
     * On a Friday, "Tomorrow" and "This weekend" are both Saturday. Two buttons
     * committing one date is a choice that is not a choice — and both would
     * light up `aria-pressed` once it was chosen.
     */
    const friday = taskDateShortcuts("2026-08-21");
    expect(friday.map((s) => s.label)).toEqual([
      "Today",
      "Tomorrow",
      "Next week",
    ]);

    // On a Saturday it is "Today" that absorbs it.
    const saturday = taskDateShortcuts("2026-08-22");
    expect(saturday.map((s) => s.label)).toEqual([
      "Today",
      "Tomorrow",
      "Next week",
    ]);
  });

  it("never offers two presets with the same value", () => {
    for (let day = 17; day <= 23; day += 1) {
      const iso = `2026-08-${String(day).padStart(2, "0")}`;
      const values = taskDateShortcuts(iso).map((s) => s.value);
      expect(new Set(values).size, iso).toBe(values.length);
    }
  });
});
