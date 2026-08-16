/**
 * GOAL-02 — Today's Goal ranking.
 *
 * Pure, and it encodes a product judgement worth pinning down: WHICH Goals earn
 * a place on Today. The ranking is four explicable buckets, not a hidden score,
 * so the test reads as the rule itself.
 *
 * REDESIGN-03 removed this file's other half. It covered `trend-view.ts`, whose
 * only consumer was Today's workload chart — a chart that restated the two
 * figures the summary above it already printed. Both the chart and the module
 * went; see `TodayScreen.tsx` for why.
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
