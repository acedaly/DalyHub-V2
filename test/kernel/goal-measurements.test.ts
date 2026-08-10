/**
 * GOAL-02 — the Goal measurement + milestone repository, against real D1.
 *
 * These run in the Workers runtime over the COMMITTED migrations (0038
 * included), so what is asserted here is what production will do: the
 * workspace-scoped writes, the atomic Activity appends, the chronology that
 * decides "the current value", and the fail-closed behaviour for ids that belong
 * to another Goal, another workspace, or nothing at all.
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  GOAL_MEASUREMENT_CORRECTED,
  GOAL_MEASUREMENT_LOGGED,
  GOAL_MEASUREMENT_REMOVED,
  GOAL_MILESTONE_COMPLETED,
  GOAL_MILESTONE_REOPENED,
  GOAL_TARGET_REACHED,
  GoalMeasurementNotFoundError,
  GoalMeasurementValidationError,
} from "~/kernel/goals";

import {
  countActivitiesOfType,
  countGoalMeasurementRows,
  FakeClock,
  makeContext,
  makeGoalDetailsRepository,
  makeGoalMeasurementRepository,
  makeSpineRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "test-default-workspace";
const OTHER = "ws_goal_measurement_other";

function spine(ws = WS, prefix = "gm") {
  return makeSpineRepository(makeContext(ws), {
    clock: new FakeClock().now,
    idGenerator: sequentialIds(prefix),
    activityIdGenerator: sequentialIds(`${prefix}act`),
  });
}

function measurements(ws = WS, prefix = "meas") {
  return makeGoalMeasurementRepository(makeContext(ws), {
    clock: new FakeClock().now,
    idGenerator: sequentialIds(prefix),
  });
}

function details(ws = WS) {
  return makeGoalDetailsRepository(makeContext(ws), {
    clock: new FakeClock().now,
  });
}

async function seedGoal(s = spine()) {
  const area = await s.createArea({ title: "Health & Fitness" });
  return s.createGoal({ title: "Reach 70 kg", areaId: area.id });
}

/** The roadmap's acceptance Goal: 85 kg down to 70 kg. */
async function seedMeasurableGoal() {
  const goal = await seedGoal();
  await details().update(goal.id, {
    targetDate: "2026-12-31",
    measurement: {
      type: "target_value",
      unit: "kg",
      baselineValue: 85,
      targetValue: 70,
    },
  });
  return goal;
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("recording measurements", () => {
  it("stores a reading and appends exactly one goal.measurement_logged", async () => {
    const goal = await seedMeasurableGoal();
    const repo = measurements();

    const measurement = await repo.createMeasurement(goal.id, {
      value: 81.6,
      measuredOn: "2026-07-05",
      note: "After the long run",
    });

    expect(measurement.value).toBe(81.6);
    expect(measurement.measuredOn).toBe("2026-07-05");
    expect(measurement.note).toBe("After the long run");
    expect(await countGoalMeasurementRows()).toBe(1);
    expect(await countActivitiesOfType(GOAL_MEASUREMENT_LOGGED)).toBe(1);
  });

  it("keeps HISTORY rather than overwriting a current value", async () => {
    const goal = await seedMeasurableGoal();
    const repo = measurements();
    for (const [measuredOn, value] of [
      ["2026-07-05", 81.6],
      ["2026-07-31", 79.3],
      ["2026-08-09", 79.0],
    ] as const) {
      await repo.createMeasurement(goal.id, { value, measuredOn });
    }

    const series = await repo.listMeasurements(goal.id);
    expect(series.map((m) => m.value)).toEqual([81.6, 79.3, 79.0]);
    expect(await countGoalMeasurementRows()).toBe(3);
  });

  it("returns the series chronologically even when entered out of order", async () => {
    const goal = await seedMeasurableGoal();
    const repo = measurements();
    await repo.createMeasurement(goal.id, {
      value: 79.0,
      measuredOn: "2026-08-09",
    });
    // A back-dated reading, entered afterwards.
    await repo.createMeasurement(goal.id, {
      value: 81.6,
      measuredOn: "2026-07-05",
    });

    const series = await repo.listMeasurements(goal.id);
    expect(series.map((m) => m.measuredOn)).toEqual([
      "2026-07-05",
      "2026-08-09",
    ]);
  });

  it("appends goal.target_reached ONCE, on the crossing reading only", async () => {
    const goal = await seedMeasurableGoal();
    const repo = measurements();

    await repo.createMeasurement(goal.id, {
      value: 72,
      measuredOn: "2026-08-01",
    });
    expect(await countActivitiesOfType(GOAL_TARGET_REACHED)).toBe(0);

    await repo.createMeasurement(goal.id, {
      value: 69.8,
      measuredOn: "2026-08-09",
    });
    expect(await countActivitiesOfType(GOAL_TARGET_REACHED)).toBe(1);

    // A second reading past the target is not a second achievement.
    await repo.createMeasurement(goal.id, {
      value: 69.2,
      measuredOn: "2026-08-10",
    });
    expect(await countActivitiesOfType(GOAL_TARGET_REACHED)).toBe(1);
  });

  it("never appends goal.target_reached for a Goal with no target", async () => {
    const goal = await seedGoal();
    await details().update(goal.id, {
      measurement: { type: "target_value", unit: "kg", baselineValue: 85 },
    });
    await measurements().createMeasurement(goal.id, {
      value: 10,
      measuredOn: "2026-08-09",
    });
    expect(await countActivitiesOfType(GOAL_TARGET_REACHED)).toBe(0);
  });

  it("refuses a malformed value or date, and writes nothing", async () => {
    const goal = await seedMeasurableGoal();
    const repo = measurements();

    await expect(
      repo.createMeasurement(goal.id, {
        value: Number.NaN,
        measuredOn: "2026-08-09",
      }),
    ).rejects.toBeInstanceOf(GoalMeasurementValidationError);
    await expect(
      repo.createMeasurement(goal.id, { value: 79, measuredOn: "not-a-date" }),
    ).rejects.toBeInstanceOf(GoalMeasurementValidationError);
    await expect(
      repo.createMeasurement(goal.id, { value: 79, measuredOn: "2026-02-30" }),
    ).rejects.toBeInstanceOf(GoalMeasurementValidationError);

    expect(await countGoalMeasurementRows()).toBe(0);
    expect(await countActivitiesOfType(GOAL_MEASUREMENT_LOGGED)).toBe(0);
  });

  it("fails closed for a missing, deleted, wrong-kind or cross-workspace Goal", async () => {
    const s = spine();
    const goal = await seedGoal(s);
    const area = await s.createArea({ title: "Career" });
    const project = await s.createProject({
      title: "Not a goal",
      parent: { kind: "area", id: area.id },
    });
    await s.softDelete(goal.id);

    const other = spine(OTHER, "other");
    const otherArea = await other.createArea({ title: "Other" });
    const otherGoal = await other.createGoal({
      title: "Other",
      areaId: otherArea.id,
    });

    const repo = measurements();
    for (const id of ["nonexistent", goal.id, project.id, otherGoal.id]) {
      await expect(
        repo.createMeasurement(id, { value: 1, measuredOn: "2026-08-09" }),
      ).rejects.toBeInstanceOf(GoalMeasurementNotFoundError);
    }
    expect(await countGoalMeasurementRows()).toBe(0);
  });
});

describe("correcting and removing measurements", () => {
  it("updates a reading and appends goal.measurement_corrected", async () => {
    const goal = await seedMeasurableGoal();
    const repo = measurements();
    const created = await repo.createMeasurement(goal.id, {
      value: 89.0,
      measuredOn: "2026-08-09",
    });

    const corrected = await repo.updateMeasurement(created.id, { value: 79.0 });
    expect(corrected.value).toBe(79.0);
    // The date and note are untouched by a value-only patch.
    expect(corrected.measuredOn).toBe("2026-08-09");
    expect(await countActivitiesOfType(GOAL_MEASUREMENT_CORRECTED)).toBe(1);
  });

  it("treats a patch that changes nothing as an idempotent no-op", async () => {
    const goal = await seedMeasurableGoal();
    const repo = measurements();
    const created = await repo.createMeasurement(goal.id, {
      value: 79.0,
      measuredOn: "2026-08-09",
      note: "steady",
    });

    const same = await repo.updateMeasurement(created.id, {
      value: 79.0,
      measuredOn: "2026-08-09",
      note: "steady",
    });
    expect(same.value).toBe(79.0);
    expect(await countActivitiesOfType(GOAL_MEASUREMENT_CORRECTED)).toBe(0);
  });

  it("removes a reading and appends goal.measurement_removed", async () => {
    const goal = await seedMeasurableGoal();
    const repo = measurements();
    const created = await repo.createMeasurement(goal.id, {
      value: 79.0,
      measuredOn: "2026-08-09",
    });

    await repo.deleteMeasurement(created.id);
    expect(await countGoalMeasurementRows()).toBe(0);
    expect(await countActivitiesOfType(GOAL_MEASUREMENT_REMOVED)).toBe(1);
    await expect(repo.deleteMeasurement(created.id)).rejects.toBeInstanceOf(
      GoalMeasurementNotFoundError,
    );
  });

  it("refuses a measurement id from another workspace", async () => {
    const otherSpine = spine(OTHER, "other");
    const otherArea = await otherSpine.createArea({ title: "Other" });
    const otherGoal = await otherSpine.createGoal({
      title: "Other goal",
      areaId: otherArea.id,
    });
    const theirs = await measurements(OTHER, "othermeas").createMeasurement(
      otherGoal.id,
      { value: 5, measuredOn: "2026-08-09" },
    );

    await expect(
      measurements().updateMeasurement(theirs.id, { value: 6 }),
    ).rejects.toBeInstanceOf(GoalMeasurementNotFoundError);
    await expect(
      measurements().deleteMeasurement(theirs.id),
    ).rejects.toBeInstanceOf(GoalMeasurementNotFoundError);
  });
});

describe("the batched summary read", () => {
  it("returns the latest, earliest and comparison readings per Goal", async () => {
    const s = spine();
    const area = await s.createArea({ title: "Health" });
    const a = await s.createGoal({ title: "Reach 70 kg", areaId: area.id });
    const b = await s.createGoal({ title: "Save $20,000", areaId: area.id });
    const repo = measurements();

    for (const [measuredOn, value] of [
      ["2026-06-10", 85.0],
      ["2026-07-05", 81.6],
      ["2026-08-09", 79.0],
    ] as const) {
      await repo.createMeasurement(a.id, { value, measuredOn });
    }
    await repo.createMeasurement(b.id, {
      value: 6850,
      measuredOn: "2026-08-01",
    });

    const summaries = await repo.listMeasurementSummaries([a.id, b.id], {
      comparisonFromIso: "2026-08-01",
    });

    const first = summaries.get(a.id)!;
    expect(first.latest).toEqual({ value: 79.0, measuredOn: "2026-08-09" });
    expect(first.earliest).toEqual({ value: 85.0, measuredOn: "2026-06-10" });
    // The last reading strictly BEFORE the window — not merely the second newest.
    expect(first.priorInWindow).toEqual({
      value: 81.6,
      measuredOn: "2026-07-05",
    });
    expect(first.count).toBe(3);

    const second = summaries.get(b.id)!;
    expect(second.latest?.value).toBe(6850);
    expect(second.priorInWindow).toBeNull();
  });

  /*
   * UIX-03 — the batched SPARKLINE series.
   *
   * A different question from the summary above: the summary picks three
   * readings for arithmetic, this one returns the recent RUN so a card can draw
   * a shape. Both are batched over a page of ids and both are bounded; the tests
   * that matter are that the per-Goal cap is applied by SQL rather than after
   * the fact, and that the order is the one a line is drawn in.
   */
  it("returns each Goal's recent readings, oldest first, capped per Goal", async () => {
    const s = spine();
    const area = await s.createArea({ title: "Health" });
    const a = await s.createGoal({ title: "Reach 70 kg", areaId: area.id });
    const b = await s.createGoal({ title: "Read 12 books", areaId: area.id });
    const repo = measurements();

    for (const [value, measuredOn] of [
      [85.0, "2026-06-10"],
      [83.4, "2026-06-24"],
      [81.2, "2026-07-08"],
      [80.1, "2026-07-22"],
      [79.3, "2026-08-08"],
    ] as const) {
      await repo.createMeasurement(a.id, { value, measuredOn });
    }
    await repo.createMeasurement(b.id, { value: 5, measuredOn: "2026-08-01" });

    const series = await repo.listMeasurementSeries([a.id, b.id], {
      perGoalLimit: 3,
    });

    /*
     * The cap keeps the NEWEST readings — those are what a "which way is this
     * going?" glance is asking about — and returns them ascending, because that
     * is the order a line is drawn in and leaving the reversal to each caller is
     * how two surfaces end up drawing one Goal backwards from each other.
     */
    expect(series.get(a.id)).toEqual([
      { value: 81.2, measuredOn: "2026-07-08" },
      { value: 80.1, measuredOn: "2026-07-22" },
      { value: 79.3, measuredOn: "2026-08-08" },
    ]);
    // The cap is PER GOAL, not per query: a busy Goal never starves a quiet one.
    expect(series.get(b.id)).toEqual([{ value: 5, measuredOn: "2026-08-01" }]);
  });

  it("keeps same-day readings in creation order, so the endpoint is the newest", async () => {
    /*
     * `measured_on` is a DATE, and the repository permits two readings on one.
     * The window ranks by `measured_on DESC, created_at DESC` to CHOOSE rows,
     * so the ascending result has to carry the same tie-break or SQLite is free
     * to return the pair either way round — which puts an arbitrary one of them
     * at the series' end, and the sparkline's end marker and direction would
     * then disagree with the card's metric (which comes from the summary's
     * genuinely-newest reading).
     */
    const s = spine();
    const area = await s.createArea({ title: "Health" });
    const goal = await s.createGoal({ title: "Reach 70 kg", areaId: area.id });
    const repo = measurements();

    await repo.createMeasurement(goal.id, {
      value: 80,
      measuredOn: "2026-08-01",
    });
    // Three on ONE day, written in a known order.
    await repo.createMeasurement(goal.id, {
      value: 79.5,
      measuredOn: "2026-08-08",
    });
    await repo.createMeasurement(goal.id, {
      value: 79.2,
      measuredOn: "2026-08-08",
    });
    await repo.createMeasurement(goal.id, {
      value: 78.9,
      measuredOn: "2026-08-08",
    });

    const series = (
      await repo.listMeasurementSeries([goal.id], {
        perGoalLimit: 12,
      })
    ).get(goal.id);

    expect(series?.map((point) => point.value)).toEqual([80, 79.5, 79.2, 78.9]);
    // The one that matters: the LAST point is the last one written.
    expect(series?.[series.length - 1]?.value).toBe(78.9);
  });

  it("caps to the newest readings even when the cap falls inside one day", async () => {
    const s = spine();
    const area = await s.createArea({ title: "Health" });
    const goal = await s.createGoal({ title: "Weigh in", areaId: area.id });
    const repo = measurements();
    for (const value of [90, 89, 88, 87]) {
      await repo.createMeasurement(goal.id, {
        value,
        measuredOn: "2026-08-08",
      });
    }

    const series = (
      await repo.listMeasurementSeries([goal.id], {
        perGoalLimit: 2,
      })
    ).get(goal.id);

    // The two NEWEST of four same-day readings, still oldest-first.
    expect(series?.map((point) => point.value)).toEqual([88, 87]);
  });

  it("omits a Goal with no readings rather than inventing an empty series", async () => {
    const goal = await seedGoal();
    const series = await measurements().listMeasurementSeries([goal.id], {
      perGoalLimit: 12,
    });
    // The caller draws no sparkline either way, so an absent key and an empty
    // array are the same answer — and the absent one costs no row.
    expect(series.get(goal.id)).toBeUndefined();
  });

  it("never reaches across a workspace boundary", async () => {
    // Its OWN id prefix: the generators are deterministic, so reusing the one
    // the summary's boundary test uses would collide on the very first insert.
    const theirs = spine(OTHER, "gmseries");
    const otherArea = await theirs.createArea({ title: "Theirs" });
    const otherGoal = await theirs.createGoal({
      title: "Other",
      areaId: otherArea.id,
    });
    await measurements(OTHER, "seriesmeas").createMeasurement(otherGoal.id, {
      value: 42,
      measuredOn: "2026-08-09",
    });

    const series = await measurements().listMeasurementSeries([otherGoal.id], {
      perGoalLimit: 12,
    });
    expect(series.size).toBe(0);
  });

  it("includes every requested id, with the all-null shape for an empty Goal", async () => {
    const goal = await seedGoal();
    const summaries = await measurements().listMeasurementSummaries([goal.id], {
      comparisonFromIso: "2026-08-01",
    });
    expect(summaries.get(goal.id)).toEqual({
      goalId: goal.id,
      latest: null,
      earliest: null,
      priorInWindow: null,
      count: 0,
    });
  });

  it("never leaks another workspace's readings", async () => {
    const otherSpine = spine(OTHER, "other");
    const otherArea = await otherSpine.createArea({ title: "Other" });
    const otherGoal = await otherSpine.createGoal({
      title: "Other",
      areaId: otherArea.id,
    });
    await measurements(OTHER, "othermeas").createMeasurement(otherGoal.id, {
      value: 42,
      measuredOn: "2026-08-09",
    });

    const summaries = await measurements().listMeasurementSummaries(
      [otherGoal.id],
      { comparisonFromIso: "2026-08-01" },
    );
    expect(summaries.get(otherGoal.id)?.latest).toBeNull();
  });
});

describe("milestones", () => {
  it("adds stages in order and defaults every weight to 1", async () => {
    const goal = await seedGoal();
    const repo = measurements();
    await repo.createMilestone(goal.id, { title: "Book the course" });
    await repo.createMilestone(goal.id, { title: "Sit the exam" });

    const stages = await repo.listMilestones(goal.id);
    expect(stages.map((stage) => stage.title)).toEqual([
      "Book the course",
      "Sit the exam",
    ]);
    expect(stages.map((stage) => stage.weight)).toEqual([1, 1]);
    expect(stages[0]!.position).toBeLessThan(stages[1]!.position);
  });

  it("records completion and reopening, but NOT a rename", async () => {
    const goal = await seedGoal();
    const repo = measurements();
    const stage = await repo.createMilestone(goal.id, { title: "Book it" });

    await repo.updateMilestone(stage.id, { completed: true });
    expect(await countActivitiesOfType(GOAL_MILESTONE_COMPLETED)).toBe(1);

    await repo.updateMilestone(stage.id, { completed: false });
    expect(await countActivitiesOfType(GOAL_MILESTONE_REOPENED)).toBe(1);

    // Editing the DEFINITION is configuration, not progress — and an Activity
    // feed full of renames is exactly the flooding this feature avoids.
    const renamed = await repo.updateMilestone(stage.id, {
      title: "Book the course",
      weight: 3,
    });
    expect(renamed.title).toBe("Book the course");
    expect(renamed.weight).toBe(3);
    expect(await countActivitiesOfType(GOAL_MILESTONE_COMPLETED)).toBe(1);
    expect(await countActivitiesOfType(GOAL_MILESTONE_REOPENED)).toBe(1);
  });

  it("summarises completed weight, not merely completed count", async () => {
    const goal = await seedGoal();
    const repo = measurements();
    const heavy = await repo.createMilestone(goal.id, {
      title: "Write the thesis",
      weight: 6,
    });
    await repo.createMilestone(goal.id, { title: "Submit it", weight: 4 });
    await repo.updateMilestone(heavy.id, { completed: true });

    const summary = (await repo.listMilestoneSummaries([goal.id])).get(
      goal.id,
    )!;
    expect(summary).toEqual({
      goalId: goal.id,
      total: 2,
      completed: 1,
      totalWeight: 10,
      completedWeight: 6,
    });
  });

  it("rejects a weight outside the permitted range", async () => {
    const goal = await seedGoal();
    await expect(
      measurements().createMilestone(goal.id, { title: "x", weight: 0 }),
    ).rejects.toBeInstanceOf(GoalMeasurementValidationError);
  });
});

describe("the measurement configuration on goal_details", () => {
  it("round-trips a target-value configuration with its inferred direction", async () => {
    const goal = await seedGoal();
    const repo = details();
    await repo.update(goal.id, {
      measurement: {
        type: "target_value",
        unit: "kg",
        baselineValue: 85,
        targetValue: 70,
      },
    });

    const stored = await repo.get(goal.id);
    expect(stored?.measurement).toEqual({
      type: "target_value",
      unit: "kg",
      // Never chosen by the owner — derived from 85 → 70.
      direction: "decrease",
      baselineValue: 85,
      targetValue: 70,
    });
  });

  it("leaves every existing Goal unmeasured, with no row written", async () => {
    const goal = await seedGoal();
    const stored = await details().get(goal.id);
    expect(stored?.measurement.type).toBeNull();
    expect(stored?.targetDate).toBeNull();
  });

  it("changes one measurement field without clearing its neighbours", async () => {
    const goal = await seedGoal();
    const repo = details();
    await repo.update(goal.id, {
      measurement: {
        type: "target_value",
        unit: "kg",
        baselineValue: 85,
        targetValue: 70,
      },
    });
    await repo.update(goal.id, { measurement: { targetValue: 68 } });

    const stored = await repo.get(goal.id);
    expect(stored?.measurement).toMatchObject({
      unit: "kg",
      baselineValue: 85,
      targetValue: 68,
    });
  });

  it("clears the whole configuration when the type is cleared", async () => {
    const goal = await seedGoal();
    const repo = details();
    await repo.update(goal.id, {
      measurement: { type: "accumulation", unit: "books", targetValue: 24 },
    });
    await repo.update(goal.id, { measurement: { type: null } });

    const stored = await repo.get(goal.id);
    expect(stored?.measurement).toEqual({
      type: null,
      unit: null,
      direction: null,
      baselineValue: null,
      targetValue: null,
    });
  });

  it("does not disturb the target date or definition of done", async () => {
    const goal = await seedGoal();
    const repo = details();
    await repo.update(goal.id, {
      targetDate: "2026-12-31",
      definitionOfDone: "Weigh 70 kg for a fortnight.",
    });
    await repo.update(goal.id, {
      measurement: { type: "manual" },
    });

    const stored = await repo.get(goal.id);
    expect(stored?.targetDate).toBe("2026-12-31");
    expect(stored?.definitionOfDone).toBe("Weigh 70 kg for a fortnight.");
    expect(stored?.measurement.type).toBe("manual");
  });

  it("reads a whole page of configurations in one batched call", async () => {
    const s = spine();
    const area = await s.createArea({ title: "Health" });
    const a = await s.createGoal({ title: "A", areaId: area.id });
    const b = await s.createGoal({ title: "B", areaId: area.id });
    const repo = details();
    await repo.update(a.id, {
      measurement: { type: "accumulation", unit: "books", targetValue: 24 },
    });

    const many = await repo.listMany([a.id, b.id, "nonexistent"]);
    expect(many.get(a.id)?.measurement.targetValue).toBe(24);
    // A Goal with no details row still appears, unmeasured.
    expect(many.get(b.id)?.measurement.type).toBeNull();
    expect(many.has("nonexistent")).toBe(false);
  });
});
