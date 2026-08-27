/**
 * GOAL-02 — Today's Goal ranking.
 *
 * Pure, and it encodes a product judgement worth pinning down: WHICH Goals earn
 * a place on Today. The ranking is six explicable buckets, not a hidden score,
 * so the test reads as the rule itself. FOLLOW-02 added the two that describe an
 * UNMEASURED Goal — the only surface on which one could previously appear at
 * all was none.
 *
 * REDESIGN-03 removed this file's other half. It covered `trend-view.ts`, whose
 * only consumer was Today's workload chart — a chart that restated the two
 * figures the summary above it already printed. Both the chart and the module
 * went; see `TodayScreen.tsx` for why.
 */

import { describe, expect, it } from "vitest";

import { buildActivityWindow } from "~/kernel/activity-window";
import { evaluateGoalMovement, type GoalMovement } from "~/kernel/alignment";
import {
  UNMEASURED_GOAL_PROGRESS,
  evaluateGoalProgress,
  normalizeGoalMeasurementConfig,
} from "~/kernel/goals";
import {
  todayGoalRank,
  type TodayGoal,
} from "~/modules/today/day/goal-progress";

const TODAY = "2026-08-09";

/** The owner's week around {@link TODAY}, and a Goal that moved inside it. */
const WEEK = buildActivityWindow({
  periodStart: "2026-08-03",
  periodEnd: "2026-08-09",
  startOfOwnerDay: (dayIso) => new Date(`${dayIso}T00:00:00.000Z`),
});

const MOVED_MOVEMENT: GoalMovement = evaluateGoalMovement(
  {
    goalId: "g1",
    contributingProjectCount: 1,
    movedProjectCount: 1,
    counts: { task_completed: 1 },
    latestMovementAt: new Date("2026-08-05T09:00:00.000Z"),
  },
  {
    window: WEEK,
    todayIso: TODAY,
    calendarIsoOf: (instant) => instant.toISOString().slice(0, 10),
  },
);

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
    areaColourSlot: null,
    iconKey: null,
    colourSlot: null,
    progress,
    movement: null,
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

  /*
   * FOLLOW-02 renumbered the buckets BELOW the two above without reordering
   * them: bucket 2 is now "an unmeasured Goal that moved", so "check-in due"
   * became 3 and "everything else measured" became 4. The measured Goals keep
   * exactly the order they had — which is what the last assertion in this file
   * proves, comparatively rather than by number.
   */
  it("then a Goal that has not been checked in for a week", () => {
    const quiet = goal({
      measurements: [{ value: 79, measuredOn: "2026-07-25" }],
    });
    expect(todayGoalRank(quiet, TODAY)).toBe(3);
  });

  it("and a freshly-measured Goal with a distant date sorts last of the measured", () => {
    const fresh = goal({
      measurements: [{ value: 79, measuredOn: TODAY }],
      targetDate: "2027-12-31",
    });
    expect(todayGoalRank(fresh, TODAY)).toBe(4);
  });

  it("puts an unmeasured Goal that MOVED above a measured one that is merely quiet", () => {
    /*
     * FOLLOW-02's one ordering change, stated as the comparison it actually is:
     * a Goal with no number that produced an outcome this week is more useful on
     * a daily surface than a measured Goal whose only fact is that it has not
     * been read for a week.
     */
    const quiet = goal({
      measurements: [{ value: 79, measuredOn: "2026-07-25" }],
    });
    const moved: TodayGoal = {
      ...goal({ measurements: [] }),
      progress: UNMEASURED_GOAL_PROGRESS,
      movement: MOVED_MOVEMENT,
    };
    expect(todayGoalRank(moved, TODAY)).toBeLessThan(
      todayGoalRank(quiet, TODAY),
    );
  });

  it("puts an unmeasured Goal with NO movement below every measured Goal", () => {
    const fresh = goal({
      measurements: [{ value: 79, measuredOn: TODAY }],
      targetDate: "2027-12-31",
    });
    const still: TodayGoal = {
      ...goal({ measurements: [] }),
      progress: UNMEASURED_GOAL_PROGRESS,
      movement: { ...MOVED_MOVEMENT, key: "no_movement_yet", moved: false },
    };
    expect(todayGoalRank(still, TODAY)).toBeGreaterThan(
      todayGoalRank(fresh, TODAY),
    );
  });
});
