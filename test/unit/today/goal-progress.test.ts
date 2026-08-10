/**
 * GOAL-02 — Today's Goal ranking and its workload-trend words.
 *
 * Both are pure, and both encode a product judgement worth pinning down: WHICH
 * Goals earn a place on Today, and WHAT the week's totals are allowed to claim.
 * The ranking is four explicable buckets, not a hidden score, so the test reads
 * as the rule itself.
 */

import { describe, expect, it } from "vitest";

import {
  evaluateGoalProgress,
  normalizeGoalMeasurementConfig,
} from "~/kernel/goals";
import {
  todayGoalRank,
  type TodayGoal,
} from "~/modules/today/day/goal-progress";
import {
  activityTrendSummary,
  weekdayLabel,
} from "~/modules/today/day/trend-view";

const TODAY = "2026-08-09";

function goal(over: {
  readonly measurements?: readonly { value: number; measuredOn: string }[];
  readonly targetDate?: string | null;
  readonly baselineValue?: number;
  readonly targetValue?: number;
}): TodayGoal {
  const progress = evaluateGoalProgress(
    {
      config: normalizeGoalMeasurementConfig({
        type: "target_value",
        unit: "kg",
        baselineValue: over.baselineValue ?? 85,
        targetValue: over.targetValue ?? 70,
      }),
      targetDate: over.targetDate ?? null,
      measurements: over.measurements ?? [{ value: 79, measuredOn: TODAY }],
      startedOn: "2026-01-01",
    },
    { todayIso: TODAY },
  );
  return {
    id: "g1",
    title: "Reach 70 kg",
    areaTitle: "Health & Fitness",
    areaColourRank: 0,
    areaIconKey: null,
    progress,
    changeInWindow: null,
    windowDays: 30,
  };
}

describe("which Goals Today shows first", () => {
  it("ranks a Goal that needs attention above everything else", () => {
    // Behind its own straight line to a target date it still has time to meet.
    const behind = goal({
      measurements: [{ value: 84, measuredOn: TODAY }],
      targetDate: "2026-12-31",
    });
    expect(behind.progress.status).toBe("needs_attention");
    expect(todayGoalRank(behind, TODAY)).toBe(0);
  });

  it("ranks an overdue Goal alongside it, not below it", () => {
    const overdue = goal({
      measurements: [{ value: 79, measuredOn: "2026-08-01" }],
      targetDate: "2026-08-05",
    });
    expect(overdue.progress.status).toBe("overdue");
    expect(todayGoalRank(overdue, TODAY)).toBe(0);
  });

  it("then a Goal whose target date is inside a month", () => {
    const soon = goal({
      measurements: [{ value: 72, measuredOn: TODAY }],
      targetDate: "2026-08-25",
    });
    expect(todayGoalRank(soon, TODAY)).toBe(1);
  });

  it("then a Goal that has not been checked in for a week", () => {
    const quiet = goal({
      measurements: [{ value: 79, measuredOn: "2026-07-25" }],
    });
    expect(todayGoalRank(quiet, TODAY)).toBe(2);
  });

  it("and a freshly-measured Goal with a distant date sorts last", () => {
    const fresh = goal({
      measurements: [{ value: 79, measuredOn: TODAY }],
      targetDate: "2027-12-31",
    });
    expect(todayGoalRank(fresh, TODAY)).toBe(3);
  });
});

describe("the week's workload sentence", () => {
  const days = (pairs: readonly (readonly [number, number])[]) =>
    pairs.map(([completed, created], index) => ({
      dateIso: `2026-08-0${index + 3}`,
      completed,
      created,
    }));

  it("states both totals and the net change when they differ", () => {
    const summary = activityTrendSummary({
      days: days([
        [5, 3],
        [4, 6],
        [7, 2],
        [4, 4],
        [6, 5],
        [2, 1],
        [3, 2],
      ]),
      totalCompleted: 31,
      totalCreated: 23,
    });
    expect(summary.visible).toBe(
      "31 completed · 23 created · 8 tasks fewer in your active workload",
    );
  });

  it("says the workload GREW when more was created than finished", () => {
    const summary = activityTrendSummary({
      days: days([
        [1, 4],
        [0, 3],
      ]),
      totalCompleted: 1,
      totalCreated: 7,
    });
    expect(summary.visible).toContain("6 tasks more in your active workload");
  });

  it("makes no workload claim at all when the week finished level", () => {
    const summary = activityTrendSummary({
      days: days([
        [2, 2],
        [3, 3],
      ]),
      totalCompleted: 5,
      totalCreated: 5,
    });
    expect(summary.visible).toBe("5 completed · 5 created");
    expect(summary.visible).not.toContain("workload");
  });

  it("uses the singular for one task", () => {
    const summary = activityTrendSummary({
      days: days([[1, 0]]),
      totalCompleted: 1,
      totalCreated: 0,
    });
    expect(summary.visible).toContain("1 task fewer");
  });

  it("gives the chart a text equivalent naming every day", () => {
    const summary = activityTrendSummary({
      days: days([
        [5, 3],
        [4, 6],
      ]),
      totalCompleted: 9,
      totalCreated: 9,
    });
    expect(summary.accessible).toContain("Mon 5 completed, 3 created");
    expect(summary.accessible).toContain("Tue 4 completed, 6 created");
  });

  it("labels a day from its own components, never a timezone reading", () => {
    expect(weekdayLabel("2026-08-09")).toBe("Sun");
    expect(weekdayLabel("2026-08-03")).toBe("Mon");
    expect(weekdayLabel("nonsense")).toBe("nonsense");
  });
});
