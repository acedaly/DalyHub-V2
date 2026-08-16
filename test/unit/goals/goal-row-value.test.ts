/**
 * REDESIGN-04 — the honest value at the end of a Goal ROW (§2.2).
 *
 * `mockup3.png` ends each row of its Goals list with the Goal's own arithmetic,
 * in the Goal's own terms: `60.0 / 70 kg`, `12 / 24`, `75% complete`. Three
 * different strings, because those are three genuinely different kinds of Goal.
 * These tests hold the choice — and the refusals, which matter more.
 */

import { describe, expect, it } from "vitest";

import {
  evaluateGoalProgress,
  normalizeGoalMeasurementConfig,
  UNMEASURED_GOAL_PROGRESS,
} from "~/kernel/goals";
import { goalRowValue } from "~/shared/goal-progress";

const TODAY = "2026-08-16";

function numeric(readings: readonly number[], unit = "kg") {
  return evaluateGoalProgress(
    {
      config: normalizeGoalMeasurementConfig({
        type: "target_value",
        unit,
        baselineValue: 92,
        targetValue: 70,
      }),
      targetDate: "2026-12-31",
      measurements: readings.map((value, index) => ({
        value,
        measuredOn: `2026-0${index + 1}-01`,
      })),
      startedOn: "2026-01-01",
    },
    { todayIso: TODAY },
  );
}

describe("goalRowValue", () => {
  it("reads a numeric Goal as value / target, with the unit stated once", () => {
    expect(goalRowValue(numeric([92, 60]))).toBe("60 / 70 kg");
  });

  it("reads a counted Goal as its own fraction", () => {
    const milestone = evaluateGoalProgress(
      {
        config: normalizeGoalMeasurementConfig({ type: "milestone" }),
        targetDate: null,
        measurements: [],
        milestones: {
          total: 24,
          completed: 12,
          totalWeight: 24,
          completedWeight: 12,
        },
        startedOn: "2026-01-01",
      },
      { todayIso: TODAY },
    );
    expect(goalRowValue(milestone)).toBe("12 / 24");
  });

  it("reads a manual Goal as a percentage, inventing no target", () => {
    /*
     * A manual Goal's stored target of 100 is the SCALE, not a decision anybody
     * made — so the row states the percentage rather than dressing an
     * arithmetic constant up as the owner's plan.
     */
    const manual = evaluateGoalProgress(
      {
        config: normalizeGoalMeasurementConfig({ type: "manual" }),
        targetDate: null,
        measurements: [{ value: 75, measuredOn: "2026-08-01" }],
        startedOn: "2026-01-01",
      },
      { todayIso: TODAY },
    );
    expect(goalRowValue(manual)).toBe("75 / 100%");
  });

  it("returns null for a Goal with no measurement configured", () => {
    // Not "0%". The row draws no bar and no figure, and the surface says why
    // once — an absence is an absence, never a zero.
    expect(goalRowValue(UNMEASURED_GOAL_PROGRESS)).toBeNull();
  });

  it("returns null for a configured Goal with no reading yet", () => {
    // Configured is not measured: nothing has been recorded, so there is no
    // value to state.
    expect(goalRowValue(numeric([]))).toBeNull();
  });
});
