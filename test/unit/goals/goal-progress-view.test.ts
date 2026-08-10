/**
 * GOAL-02 — the shared Goal-progress vocabulary.
 *
 * The words every surface uses. These matter as much as the arithmetic: if the
 * record says "On track" and Today says "Behind", the product is lying to itself
 * — so the labels, the summary sentence, the pace wording and the check-in verb
 * are all derived here, once, and asserted here.
 *
 * The summary sentence is also the ACCESSIBLE text equivalent of every progress
 * bar (AGENTS.md §15), so its content is a requirement, not cosmetics.
 */

import { describe, expect, it } from "vitest";

import {
  evaluateGoalProgress,
  normalizeGoalMeasurementConfig,
  UNMEASURED_GOAL,
  type GoalProgressEvaluation,
} from "~/kernel/goals";
import {
  evaluateGoalFromSummary,
  formatMeasurementChange,
  formatMeasurementValue,
  formatPacePerWeek,
  goalCheckInDue,
  goalCheckInLabel,
  goalNeedsAttention,
  goalPaceLabel,
  goalProgressStatusLabel,
  goalProgressStatusTone,
  goalProgressSummaryText,
  goalTrendSummaryText,
} from "~/shared/goal-progress";

const TODAY = "2026-08-09";

function weightGoal(
  measurements: readonly { value: number; measuredOn: string }[],
  targetDate: string | null = "2026-12-31",
): GoalProgressEvaluation {
  return evaluateGoalProgress(
    {
      config: normalizeGoalMeasurementConfig({
        type: "target_value",
        unit: "kg",
        baselineValue: 85,
        targetValue: 70,
      }),
      targetDate,
      measurements,
      startedOn: "2026-06-10",
    },
    { todayIso: TODAY },
  );
}

describe("writing numbers", () => {
  it("puts the unit where English puts it", () => {
    expect(formatMeasurementValue(79, "kg")).toBe("79 kg");
    expect(formatMeasurementValue(20000, "$")).toBe("$20,000");
    expect(formatMeasurementValue(65, "%")).toBe("65%");
    expect(formatMeasurementValue(11, null)).toBe("11");
  });

  it("rounds to one decimal and never shows a trailing .0", () => {
    expect(formatMeasurementValue(79.0, "kg")).toBe("79 kg");
    expect(formatMeasurementValue(79.049, "kg")).toBe("79 kg");
    expect(formatMeasurementValue(79.35, "kg")).toBe("79.4 kg");
  });

  it("states a change with a direction arrow AND its magnitude", () => {
    expect(formatMeasurementChange(-0.3, "kg")).toBe("↓ 0.3 kg");
    expect(formatMeasurementChange(450, "$")).toBe("↑ $450");
    expect(formatMeasurementChange(0, "kg")).toBe("No change");
    expect(formatMeasurementChange(null, "kg")).toBeNull();
  });

  it("states a pace per week, signed", () => {
    expect(formatPacePerWeek(-0.55, "kg")).toBe("−0.55 kg/week");
    expect(formatPacePerWeek(0.39, "kg")).toBe("+0.39 kg/week");
    expect(formatPacePerWeek(null, "kg")).toBeNull();
  });
});

describe("the summary sentence — every bar's text equivalent", () => {
  it("states the value, the percentage and what remains", () => {
    const progress = weightGoal([{ value: 79, measuredOn: TODAY }]);
    expect(goalProgressSummaryText(progress)).toBe(
      "79 kg · 40% complete · 9 kg remaining",
    );
  });

  it("says the target was reached instead of a remaining amount", () => {
    const progress = weightGoal([{ value: 69, measuredOn: TODAY }]);
    expect(goalProgressSummaryText(progress)).toContain("target reached");
    expect(goalProgressSummaryText(progress)).not.toContain("remaining");
  });

  it("says so plainly when there is no measurement configuration", () => {
    const progress = evaluateGoalProgress(
      { config: UNMEASURED_GOAL, targetDate: null, measurements: [] },
      { todayIso: TODAY },
    );
    expect(goalProgressSummaryText(progress)).toBe("No measurement configured");
  });
});

describe("status words", () => {
  it("never uses alarmist language", () => {
    const labels = [
      "not_measured",
      "not_started",
      "in_progress",
      "on_track",
      "ahead",
      "needs_attention",
      "achieved",
      "overdue",
      "stale",
    ] as const;
    const rendered = labels.map(goalProgressStatusLabel);
    expect(rendered).toEqual([
      "No measurement",
      "Not started",
      "In progress",
      "On track",
      "Ahead",
      "Needs attention",
      "Target achieved",
      "Overdue",
      "No recent update",
    ]);
    for (const word of ["Failing", "Failed", "Behind", "Bad", "At risk"]) {
      expect(rendered).not.toContain(word);
    }
  });

  it("tints only the two states an owner can act on", () => {
    expect(goalProgressStatusTone("needs_attention")).toBe("warning");
    expect(goalProgressStatusTone("overdue")).toBe("warning");
    // A Goal in flight is the normal state of a Goal and needs no colour.
    expect(goalProgressStatusTone("in_progress")).toBe("neutral");
    expect(goalProgressStatusTone("not_started")).toBe("neutral");
    expect(goalProgressStatusTone("stale")).toBe("neutral");
  });

  it("flags exactly the two statuses Today ranks first", () => {
    expect(goalNeedsAttention("needs_attention")).toBe(true);
    expect(goalNeedsAttention("overdue")).toBe(true);
    expect(goalNeedsAttention("stale")).toBe(false);
    expect(goalNeedsAttention("on_track")).toBe(false);
  });
});

describe("the check-in verb", () => {
  it("names the act from the Goal's own unit", () => {
    expect(goalCheckInLabel("target_value", "kg")).toBe("Log weight");
    expect(goalCheckInLabel("target_value", "km")).toBe("Log distance");
    expect(goalCheckInLabel("target_value", "hours")).toBe("Log time");
    expect(goalCheckInLabel("target_value", "$")).toBe("Log amount");
  });

  it("falls back to plain wording rather than guessing", () => {
    expect(goalCheckInLabel("target_value", "widgets")).toBe("Add measurement");
    expect(goalCheckInLabel("target_value", null)).toBe("Add measurement");
    expect(goalCheckInLabel("manual", "%")).toBe("Update progress");
    expect(goalCheckInLabel("accumulation", "books")).toBe("Add progress");
  });
});

describe("pace wording and check-in prompting", () => {
  it("distinguishes a recent pace from an average one", () => {
    const recent = weightGoal([
      { value: 80, measuredOn: "2026-07-26" },
      { value: 79, measuredOn: "2026-08-09" },
    ]);
    expect(goalPaceLabel(recent)).toContain("Recent pace");

    const overall = weightGoal([
      { value: 85, measuredOn: "2026-01-01" },
      { value: 80, measuredOn: "2026-03-01" },
    ]);
    expect(goalPaceLabel(overall)).toBe("Average pace");
  });

  it("has no pace label at all when there is no trend", () => {
    expect(
      goalPaceLabel(weightGoal([{ value: 79, measuredOn: TODAY }])),
    ).toBeNull();
  });

  it("asks for a check-in only after a week, and never for a finished Goal", () => {
    expect(goalCheckInDue(weightGoal([{ value: 79, measuredOn: TODAY }]))).toBe(
      false,
    );
    expect(
      goalCheckInDue(weightGoal([{ value: 79, measuredOn: "2026-07-20" }])),
    ).toBe(true);
    expect(goalCheckInDue(weightGoal([{ value: 69, measuredOn: TODAY }]))).toBe(
      false,
    );
  });
});

describe("the chart's text equivalent", () => {
  it("states the whole series and its direction in words", () => {
    const points = [
      { value: 81.6, measuredOn: "2026-07-05" },
      { value: 79.0, measuredOn: "2026-08-09" },
    ];
    const summary = goalTrendSummaryText(weightGoal(points), points);
    expect(summary).toContain("2 measurements");
    expect(summary).toContain("81.6 kg");
    expect(summary).toContain("79 kg");
    expect(summary).toContain("down 2.6 kg");
  });

  it("says there is no trend rather than describing one", () => {
    const points = [{ value: 79, measuredOn: TODAY }];
    expect(goalTrendSummaryText(weightGoal(points), points)).toBe(
      "One measurement so far: 79 kg.",
    );
  });
});

describe("evaluating from the bounded collection summary", () => {
  it("agrees with the full-series evaluation about the percentage", () => {
    const series = [
      { value: 85, measuredOn: "2026-06-10" },
      { value: 81.6, measuredOn: "2026-07-05" },
      { value: 79.0, measuredOn: "2026-08-09" },
    ];
    const fromSeries = weightGoal(series);
    const fromSummary = evaluateGoalFromSummary({
      config: normalizeGoalMeasurementConfig({
        type: "target_value",
        unit: "kg",
        baselineValue: 85,
        targetValue: 70,
      }),
      targetDate: "2026-12-31",
      summary: {
        goalId: "g1",
        earliest: { value: 85, measuredOn: "2026-06-10" },
        priorInWindow: { value: 81.6, measuredOn: "2026-07-05" },
        latest: { value: 79.0, measuredOn: "2026-08-09" },
        count: 3,
      },
      startedOn: "2026-06-10",
      todayIso: TODAY,
    });

    expect(fromSummary.progressPercent).toBe(fromSeries.progressPercent);
    expect(fromSummary.current).toBe(fromSeries.current);
    expect(fromSummary.remaining).toBe(fromSeries.remaining);
    // The count comes from the summary, never from the three points sampled.
    expect(fromSummary.measurementCount).toBe(3);
  });
});
