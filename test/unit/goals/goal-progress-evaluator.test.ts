/**
 * GOAL-02 — the pure Goal progress evaluator.
 *
 * This is the file the whole feature rests on: every percentage, every
 * "remaining", every status word and every pace on every surface comes from
 * `evaluateGoalProgress`. So it is tested directly, with hand-built facts, and
 * the cases that matter most are the ones where the honest answer is "I don't
 * know" — a missing target, an equal baseline and target, one lone reading, a
 * projection that would be nonsense. A number invented in any of those places
 * would be a lie the UI has no way to detect.
 *
 * The roadmap's own acceptance scenario (85 kg → 70 kg, currently 79.0) is
 * asserted end-to-end here as well.
 */

import { describe, expect, it } from "vitest";

import {
  evaluateGoalProgress,
  normalizeGoalMeasurementConfig,
  UNMEASURED_GOAL,
  type GoalMeasurementConfig,
  type GoalMeasurementPoint,
} from "~/kernel/goals";

const TODAY = "2026-08-09";

function config(over: Partial<GoalMeasurementConfig> = {}) {
  return normalizeGoalMeasurementConfig({
    type: "target_value",
    unit: "kg",
    baselineValue: 85,
    targetValue: 70,
    ...over,
  });
}

function evaluate(
  measurements: readonly GoalMeasurementPoint[],
  over: Partial<GoalMeasurementConfig> = {},
  facts: {
    readonly targetDate?: string | null;
    readonly startedOn?: string | null;
    readonly todayIso?: string;
    readonly milestones?: {
      total: number;
      completed: number;
      totalWeight: number;
      completedWeight: number;
    };
    readonly completed?: boolean;
  } = {},
) {
  return evaluateGoalProgress(
    {
      config: config(over),
      targetDate: facts.targetDate ?? null,
      measurements,
      milestones: facts.milestones,
      startedOn: facts.startedOn ?? null,
      completed: facts.completed,
    },
    { todayIso: facts.todayIso ?? TODAY },
  );
}

function point(measuredOn: string, value: number): GoalMeasurementPoint {
  return { measuredOn, value };
}

describe("a decreasing target-value Goal", () => {
  it("computes the roadmap's acceptance scenario exactly", () => {
    const result = evaluate(
      [
        point("2026-07-05", 81.6),
        point("2026-07-31", 79.3),
        point("2026-08-09", 79.0),
      ],
      {},
      { targetDate: "2026-12-31", startedOn: "2026-06-10" },
    );

    expect(result.current).toBe(79.0);
    expect(result.baseline).toBe(85);
    expect(result.target).toBe(70);
    expect(result.totalChange).toBeCloseTo(-6.0, 5);
    expect(result.remaining).toBeCloseTo(9.0, 5);
    expect(result.progressPercent).toBe(40);
    expect(result.direction).toBe("decrease");
    expect(result.achieved).toBe(false);
  });

  it("uses the same formula for an increasing Goal, with no mirrored branch", () => {
    const result = evaluate(
      [point("2026-07-01", 5000), point("2026-08-01", 11000)],
      { unit: "$", baselineValue: 5000, targetValue: 20000 },
      { targetDate: "2027-02-01" },
    );
    expect(result.direction).toBe("increase");
    expect(result.progressPercent).toBe(40);
    expect(result.remaining).toBe(9000);
    expect(result.totalChange).toBe(6000);
  });

  it("infers direction from baseline and target, never from the owner", () => {
    expect(evaluate([point(TODAY, 80)]).direction).toBe("decrease");
    expect(
      evaluate([point(TODAY, 80)], { baselineValue: 60, targetValue: 90 })
        .direction,
    ).toBe("increase");
  });
});

describe("target achieved and exceeded", () => {
  it("reports achieved the moment the target is reached", () => {
    const result = evaluate([point("2026-08-09", 70)]);
    expect(result.achieved).toBe(true);
    expect(result.status).toBe("achieved");
    expect(result.remaining).toBe(0);
    expect(result.progressPercent).toBe(100);
  });

  it("clamps the VISUAL percentage but keeps the true fraction when exceeded", () => {
    const result = evaluate([point("2026-08-09", 66)]);
    expect(result.achieved).toBe(true);
    // The indicator never overflows...
    expect(result.progressPercent).toBe(100);
    // ...but the real figure is still available to anything that needs it.
    expect(result.progressFraction).toBeGreaterThan(1);
    expect(result.remaining).toBe(0);
  });

  it("treats an explicitly completed Goal as achieved whatever the readings say", () => {
    const result = evaluate([point("2026-08-09", 84)], {}, { completed: true });
    expect(result.achieved).toBe(true);
    expect(result.status).toBe("achieved");
  });
});

describe("refusing to invent a number", () => {
  it("has no fraction and no remaining without a target", () => {
    const result = evaluate([point(TODAY, 79)], { targetValue: null });
    expect(result.progressFraction).toBeNull();
    expect(result.progressPercent).toBeNull();
    expect(result.remaining).toBeNull();
    // The current value and the movement are still real and still shown.
    expect(result.current).toBe(79);
    expect(result.totalChange).toBe(-6);
  });

  it("has no fraction when the baseline equals the target", () => {
    // Baseline and target both 70, currently 68 and short of it. There is no
    // distance to divide by, so a journey with no distance is not 0% and not
    // 100% — it is a Goal with a current value and no percentage.
    const result = evaluate([point(TODAY, 68)], {
      baselineValue: 70,
      targetValue: 70,
    });
    expect(result.achieved).toBe(false);
    expect(result.progressFraction).toBeNull();
    expect(result.progressPercent).toBeNull();
    expect(result.current).toBe(68);
  });

  it("still reports achieved when baseline equals target and the value is right", () => {
    const result = evaluate([point(TODAY, 70)], {
      baselineValue: 70,
      targetValue: 70,
    });
    expect(result.achieved).toBe(true);
    expect(result.progressPercent).toBe(100);
  });

  it("returns the unmeasured evaluation for a Goal with no configuration", () => {
    const result = evaluateGoalProgress(
      { config: UNMEASURED_GOAL, targetDate: null, measurements: [] },
      { todayIso: TODAY },
    );
    expect(result.measured).toBe(false);
    expect(result.status).toBe("not_measured");
    expect(result.progressPercent).toBeNull();
  });

  it("says not started when nothing has been recorded", () => {
    const result = evaluate([]);
    expect(result.status).toBe("not_started");
    expect(result.measurementCount).toBe(0);
    // The baseline is still known, so the page can say where the owner started…
    expect(result.baseline).toBe(85);
    // …but the CURRENT value is unknown, and never the baseline wearing its
    // clothes. This is what stops every surface drawing an empty 0% bar for a
    // journey that has not started.
    expect(result.current).toBeNull();
    expect(result.progressPercent).toBeNull();
    expect(result.remaining).toBeNull();
    expect(result.totalChange).toBeNull();
  });

  it("falls back to the first reading when no baseline was configured", () => {
    const result = evaluate(
      [point("2026-07-01", 88), point("2026-08-01", 84)],
      { baselineValue: null },
    );
    expect(result.baseline).toBe(88);
    expect(result.totalChange).toBe(-4);
  });
});

describe("bad and awkward data", () => {
  it("never produces NaN or Infinity from zero, negative or huge values", () => {
    const cases = [
      evaluate([point(TODAY, 0)], { baselineValue: 0, targetValue: 0 }),
      evaluate([point(TODAY, -40)], { baselineValue: -10, targetValue: -50 }),
      evaluate([point(TODAY, 0)], { baselineValue: 100, targetValue: 0 }),
      evaluate([point(TODAY, 1e12)], { baselineValue: 0, targetValue: 1e12 }),
    ];
    for (const result of cases) {
      for (const value of [
        result.progressFraction,
        result.progressPercent,
        result.remaining,
        result.totalChange,
        result.requiredChangePerWeek,
        result.trend?.changePerWeek ?? null,
      ]) {
        if (value !== null) expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  it("handles a legitimately negative range (a balance moving up from debt)", () => {
    const result = evaluate([point(TODAY, -2000)], {
      unit: "$",
      baselineValue: -5000,
      targetValue: 0,
    });
    expect(result.direction).toBe("increase");
    expect(result.progressPercent).toBe(60);
    expect(result.remaining).toBe(2000);
  });

  it("sorts readings entered out of chronological order", () => {
    // The 5 July reading is added LAST but belongs FIRST.
    const result = evaluate(
      [point("2026-08-09", 79.0), point("2026-07-05", 81.6)],
      { baselineValue: null },
    );
    expect(result.baseline).toBe(81.6);
    expect(result.current).toBe(79.0);
    expect(result.latestMeasuredOn).toBe("2026-08-09");
  });

  it("keeps a total order when two readings share a day", () => {
    const result = evaluate([point(TODAY, 79.0), point(TODAY, 78.4)]);
    // The later-listed reading for the same day wins, deterministically.
    expect(result.current).toBe(78.4);
  });

  it("calls movement away from the baseline needs attention, never failing", () => {
    const result = evaluate(
      [point("2026-07-01", 85), point("2026-08-09", 87)],
      {},
      { targetDate: "2026-12-31" },
    );
    expect(result.progressFraction).toBeLessThan(0);
    expect(result.status).toBe("needs_attention");
  });
});

describe("trend and pace", () => {
  it("says nothing from a single reading", () => {
    expect(evaluate([point(TODAY, 79)]).trend).toBeNull();
  });

  it("says nothing from two readings a day apart", () => {
    // The guard that stops a one-day interval implying a yearly projection.
    const result = evaluate([point("2026-08-08", 80), point("2026-08-09", 79)]);
    expect(result.trend).toBeNull();
    expect(result.projectedCompletionDate).toBeNull();
  });

  it("states a recent weekly pace once the span is a week or more", () => {
    const result = evaluate([
      point("2026-07-26", 79.5),
      point("2026-08-09", 78.5),
    ]);
    expect(result.trend).not.toBeNull();
    expect(result.trend?.basis).toBe("recent");
    expect(result.trend?.spanDays).toBe(14);
    expect(result.trend?.changePerWeek).toBeCloseTo(-0.5, 5);
    expect(result.trend?.direction).toBe("improving");
  });

  it("labels a pace derived from the whole history as `overall`", () => {
    // Both readings are older than the 28-day window, so the window holds only
    // the latest one and cannot state a pace on its own.
    const result = evaluate([point("2026-01-01", 85), point("2026-03-01", 82)]);
    expect(result.trend?.basis).toBe("overall");
  });

  it("computes the required pace from today to the target date", () => {
    const result = evaluate(
      [point("2026-08-09", 79.0)],
      {},
      { targetDate: "2026-12-31" },
    );
    // 9 kg over 144 days is about -0.44 kg/week.
    expect(result.requiredChangePerWeek).toBeCloseTo((-9 / 144) * 7, 5);
  });

  it("has no required pace once the target date has passed", () => {
    const result = evaluate(
      [point("2026-08-09", 79.0)],
      {},
      { targetDate: "2026-07-01" },
    );
    expect(result.requiredChangePerWeek).toBeNull();
  });

  it("has no required pace once the target has been REACHED", () => {
    /*
     * The arithmetic happily continues past the target and flips the sign: a
     * reading beyond the goal produced a required pace pointing backwards
     * ("−22.75 km/week" for 1,130 km against a 1,000 km target), which reads as
     * an instruction to undo the achievement. There is no pace required to
     * reach something already reached.
     */
    const result = evaluate(
      [point("2026-08-09", 66)],
      {},
      { targetDate: "2026-12-31" },
    );
    expect(result.achieved).toBe(true);
    expect(result.requiredChangePerWeek).toBeNull();
  });

  it("projects a completion date only when the pace moves towards the target", () => {
    const towards = evaluate([
      point("2026-07-12", 81),
      point("2026-08-09", 79),
    ]);
    expect(towards.projectedCompletionDate).not.toBeNull();

    const away = evaluate([point("2026-07-12", 79), point("2026-08-09", 81)]);
    expect(away.projectedCompletionDate).toBeNull();
  });

  it("refuses a projection further out than five years", () => {
    // 0.01 kg a month never reaches 70 kg inside the horizon.
    const result = evaluate([
      point("2026-06-09", 79.02),
      point("2026-08-09", 79.0),
    ]);
    expect(result.projectedCompletionDate).toBeNull();
  });
});

describe("status", () => {
  const targetDate = "2026-12-31";
  const startedOn = "2026-01-01";

  it("is on track when progress matches the elapsed schedule", () => {
    // ~61% of the year elapsed, ~60% of the distance covered.
    const result = evaluate(
      [point("2026-08-09", 76)],
      {},
      { targetDate, startedOn },
    );
    expect(result.status).toBe("on_track");
  });

  it("is ahead when comfortably beyond the line", () => {
    const result = evaluate(
      [point("2026-08-09", 72)],
      {},
      { targetDate, startedOn },
    );
    expect(result.status).toBe("ahead");
  });

  it("needs attention when behind the line", () => {
    const result = evaluate(
      [point("2026-08-09", 83)],
      {},
      { targetDate, startedOn },
    );
    expect(result.status).toBe("needs_attention");
  });

  it("is overdue once the target date has passed without the target", () => {
    const result = evaluate(
      [point("2026-07-01", 79)],
      {},
      { targetDate: "2026-08-01", startedOn },
    );
    expect(result.status).toBe("overdue");
  });

  it("says no recent update after a month of silence, not a judgement", () => {
    const result = evaluate(
      [point("2026-06-01", 79)],
      {},
      { targetDate, startedOn },
    );
    expect(result.status).toBe("stale");
  });

  it("is simply in progress when there is no target date to compare against", () => {
    const result = evaluate([point("2026-08-09", 79)]);
    expect(result.status).toBe("in_progress");
  });
});

describe("the other measurement strategies", () => {
  it("counts an accumulation from zero", () => {
    const result = evaluate([point("2026-08-09", 11)], {
      type: "accumulation",
      unit: "books",
      targetValue: 24,
    });
    expect(result.baseline).toBe(0);
    expect(result.current).toBe(11);
    expect(result.target).toBe(24);
    expect(result.progressPercent).toBe(46);
    expect(result.direction).toBe("increase");
  });

  it("derives milestone progress from completed WEIGHT, defaulting to equal", () => {
    const equal = evaluate(
      [],
      { type: "milestone" },
      {
        milestones: {
          total: 4,
          completed: 1,
          totalWeight: 4,
          completedWeight: 1,
        },
      },
    );
    expect(equal.progressPercent).toBe(25);

    const weighted = evaluate(
      [],
      { type: "milestone" },
      {
        milestones: {
          total: 3,
          completed: 1,
          totalWeight: 10,
          completedWeight: 6,
        },
      },
    );
    expect(weighted.progressPercent).toBe(60);
  });

  it("says a milestone Goal with no stages has nothing to measure", () => {
    const result = evaluate(
      [],
      { type: "milestone" },
      {
        milestones: {
          total: 0,
          completed: 0,
          totalWeight: 0,
          completedWeight: 0,
        },
      },
    );
    expect(result.target).toBeNull();
    expect(result.progressPercent).toBeNull();
    expect(result.status).toBe("not_started");
  });

  it("treats manual progress as a plain 0-100 percentage", () => {
    const result = evaluate([point("2026-08-09", 65)], { type: "manual" });
    expect(result.baseline).toBe(0);
    expect(result.target).toBe(100);
    expect(result.unit).toBe("%");
    expect(result.progressPercent).toBe(65);
    expect(result.remaining).toBe(35);
  });

  it("normalises a manual Goal even when nonsense is configured around it", () => {
    // Switching to `manual` discards a previous type's baseline and unit rather
    // than carrying them into a percentage.
    const normalised = normalizeGoalMeasurementConfig({
      type: "manual",
      unit: "kg",
      baselineValue: 85,
      targetValue: 70,
      direction: "decrease",
    });
    expect(normalised).toEqual({
      type: "manual",
      unit: "%",
      direction: "increase",
      baselineValue: 0,
      targetValue: 100,
    });
  });
});
