/**
 * UIX-03 — the outcome vocabulary and the collection views.
 *
 * These are the sentences and the partitions the redesigned Goal card and Goal
 * record are built from. They are tested here, against hand-built evaluations,
 * because a wrong sentence is a wrong statement about somebody's own life — and
 * because the alternative is discovering "0 kg to go" in a screenshot.
 *
 * The evaluations themselves come from the kernel evaluator rather than from
 * literals wherever the case allows it, so a change to the progress arithmetic
 * fails here too rather than silently producing well-worded nonsense.
 */

import { describe, expect, it } from "vitest";

import {
  UNMEASURED_GOAL,
  UNMEASURED_GOAL_PROGRESS,
  evaluateGoalProgress,
  normalizeGoalMeasurementConfig,
  type GoalMeasurementConfig,
  type GoalProgressEvaluation,
} from "~/kernel/goals";
import {
  GOAL_COLLECTION_VIEWS,
  goalAbsenceNote,
  goalJourneyLabel,
  goalMatchesCollectionView,
  goalOverTargetLabel,
  goalRemainingLabel,
  parseGoalCollectionView,
} from "~/shared/goal-progress";

const TODAY = "2026-08-10";

function evaluate(
  config: Partial<GoalMeasurementConfig>,
  measurements: readonly { value: number; measuredOn: string }[] = [],
  targetDate: string | null = null,
): GoalProgressEvaluation {
  return evaluateGoalProgress(
    {
      config: normalizeGoalMeasurementConfig(config),
      targetDate,
      measurements,
      startedOn: "2026-06-10",
    },
    { todayIso: TODAY },
  );
}

/** The brief's own acceptance Goal: 85 kg down to 70 kg, currently 79.3. */
function weight(current = 79.3): GoalProgressEvaluation {
  return evaluate(
    { type: "target_value", unit: "kg", baselineValue: 85, targetValue: 70 },
    [
      { value: 85, measuredOn: "2026-06-10" },
      { value: current, measuredOn: "2026-08-08" },
    ],
  );
}

describe("the journey line", () => {
  it("states where the owner started as well as where they are going", () => {
    // The one fact neither the reading nor the target carries, and the fact
    // that makes the percentage checkable by eye.
    expect(goalJourneyLabel(weight())).toBe("from 85 kg → 70 kg");
  });

  it("reads a count as 'of N', because counting up from nothing has no start", () => {
    const books = evaluate(
      { type: "accumulation", unit: "books", targetValue: 12 },
      [{ value: 5, measuredOn: "2026-08-01" }],
    );
    expect(goalJourneyLabel(books)).toBe("of 12 books");
  });

  it("names no journey for a manual Goal, whose target is the scale", () => {
    const manual = evaluate({ type: "manual" }, [
      { value: 35, measuredOn: "2026-08-01" },
    ]);
    // Normalisation gives it baseline 0 / target 100 so the arithmetic works.
    // Neither number is one the owner chose, so neither is stated.
    expect(manual.target).toBe(100);
    expect(goalJourneyLabel(manual)).toBeNull();
  });

  it("names no journey for a milestone Goal, whose reading is already a pair", () => {
    const stages = evaluate({ type: "milestone" });
    expect(goalJourneyLabel(stages)).toBeNull();
  });

  it("refuses a journey when no target has been set", () => {
    const open = evaluate(
      { type: "target_value", unit: "kg", baselineValue: 85 },
      [{ value: 82, measuredOn: "2026-08-01" }],
    );
    expect(goalJourneyLabel(open)).toBeNull();
  });
});

describe("what remains", () => {
  it("states the distance still to cover", () => {
    expect(goalRemainingLabel(weight())).toBe("9.3 kg to go");
  });

  it("says nothing once the target is reached", () => {
    // "0 kg to go" is true and useless; the status already says "Target
    // achieved", and the over-target reading is what is actually news.
    const done = weight(69.5);
    expect(done.achieved).toBe(true);
    expect(goalRemainingLabel(done)).toBeNull();
  });

  it("says nothing for a Goal with no reading at all", () => {
    const unstarted = evaluate({
      type: "target_value",
      unit: "kg",
      baselineValue: 85,
      targetValue: 70,
    });
    expect(unstarted.current).toBeNull();
    expect(goalRemainingLabel(unstarted)).toBeNull();
  });
});

describe("exceeding the target", () => {
  it("reports the true percentage once the bar has capped at 100", () => {
    // 1,130 km against a 1,000 km target. The bar cannot honestly draw 113%, so
    // the figure is where the extra goes — read from the UNCLAMPED fraction,
    // which is why the evaluator keeps one.
    const walk = evaluate(
      { type: "accumulation", unit: "km", targetValue: 1000 },
      [{ value: 1130, measuredOn: "2026-08-07" }],
    );
    expect(walk.progressPercent).toBe(100);
    expect(goalOverTargetLabel(walk)).toBe("113% of target");
  });

  it("says nothing when the target has merely been met", () => {
    const exact = evaluate(
      { type: "accumulation", unit: "km", targetValue: 1000 },
      [{ value: 1000, measuredOn: "2026-08-07" }],
    );
    expect(goalOverTargetLabel(exact)).toBeNull();
  });

  it("says nothing while a Goal is still short of its target", () => {
    expect(goalOverTargetLabel(weight())).toBeNull();
  });
});

describe("honest absences", () => {
  it("distinguishes 'not measured' from 'nothing recorded yet'", () => {
    // Three different states, deliberately worded as three: a Goal nobody has
    // told DalyHub how to measure is not the same as one configured this
    // morning with nothing logged, and neither is a failure.
    expect(goalAbsenceNote(UNMEASURED_GOAL_PROGRESS)).toBe("Not measured");

    const configured = evaluate({
      type: "target_value",
      unit: "minutes",
      baselineValue: 165,
      targetValue: 90,
    });
    expect(goalAbsenceNote(configured)).toBe("No measurement recorded yet");

    const noStages = evaluate({ type: "milestone" });
    expect(goalAbsenceNote(noStages)).toBe("No stages yet");
  });

  it("has nothing to say about a Goal that does have a reading", () => {
    expect(goalAbsenceNote(weight())).toBeNull();
  });

  it("treats the all-null configuration as unmeasured", () => {
    const none = evaluate(UNMEASURED_GOAL);
    expect(none.measured).toBe(false);
    expect(goalAbsenceNote(none)).toBe("Not measured");
  });
});

describe("the collection views", () => {
  it("falls back to 'all' for an absent or unrecognised view", () => {
    expect(parseGoalCollectionView(null)).toBe("all");
    expect(parseGoalCollectionView("nonsense")).toBe("all");
    for (const view of GOAL_COLLECTION_VIEWS) {
      expect(parseGoalCollectionView(view)).toBe(view);
    }
  });

  it("puts a finished Goal in Completed only, whatever its readings implied", () => {
    /*
     * The distinction §30 of the brief calls out: a reading past the target is
     * not the same as a Goal the owner has finished. A completed Goal appears
     * once — under Completed — rather than also under whatever its last
     * measurement suggested.
     */
    const finished = { completed: true, status: "achieved" as const };
    expect(goalMatchesCollectionView("completed", finished)).toBe(true);
    expect(goalMatchesCollectionView("on_track", finished)).toBe(false);
    expect(goalMatchesCollectionView("attention", finished)).toBe(false);
    expect(goalMatchesCollectionView("all", finished)).toBe(true);
  });

  it("does not put an unfinished target-achieving Goal under Completed", () => {
    const achieved = { completed: false, status: "achieved" as const };
    expect(goalMatchesCollectionView("completed", achieved)).toBe(false);
    expect(goalMatchesCollectionView("all", achieved)).toBe(true);
  });

  it("groups ahead-of-schedule with on-track, and overdue with needs-attention", () => {
    const on = { completed: false, status: "on_track" as const };
    const ahead = { completed: false, status: "ahead" as const };
    const behind = { completed: false, status: "needs_attention" as const };
    const overdue = { completed: false, status: "overdue" as const };

    expect(goalMatchesCollectionView("on_track", on)).toBe(true);
    expect(goalMatchesCollectionView("on_track", ahead)).toBe(true);
    expect(goalMatchesCollectionView("attention", behind)).toBe(true);
    expect(goalMatchesCollectionView("attention", overdue)).toBe(true);

    // …and never both.
    expect(goalMatchesCollectionView("attention", ahead)).toBe(false);
    expect(goalMatchesCollectionView("on_track", overdue)).toBe(false);
  });

  it("leaves an unmeasured Goal out of both judgement views", () => {
    // "Not measured" is not "on track" and it is not "needs attention". It is a
    // Goal DalyHub has not been told how to measure, and neither lens claims it.
    const unmeasured = { completed: false, status: "not_measured" as const };
    expect(goalMatchesCollectionView("on_track", unmeasured)).toBe(false);
    expect(goalMatchesCollectionView("attention", unmeasured)).toBe(false);
    expect(goalMatchesCollectionView("all", unmeasured)).toBe(true);
  });

  it("shows every Goal under All", () => {
    for (const status of [
      "not_measured",
      "not_started",
      "in_progress",
      "on_track",
      "ahead",
      "needs_attention",
      "achieved",
      "overdue",
      "stale",
    ] as const) {
      expect(
        goalMatchesCollectionView("all", { completed: false, status }),
      ).toBe(true);
    }
  });
});
