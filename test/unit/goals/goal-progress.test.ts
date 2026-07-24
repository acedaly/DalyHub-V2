/**
 * AREA-02 — the pure Goal-project-contribution evaluator matrix.
 *
 * Every case asserts on STRUCTURED counts, never a rendered string. Progress
 * from linked Projects is DERIVED and must never imply explicit Goal
 * completion (that is asserted separately in `goal-view.test.ts`).
 */

import { describe, expect, it } from "vitest";

import {
  EMPTY_GOAL_PROJECT_CONTRIBUTION,
  evaluateGoalProjectContribution,
  type GoalProjectFact,
} from "~/kernel/goals";

function fact(overrides: Partial<GoalProjectFact> = {}): GoalProjectFact {
  return {
    id: "p1",
    status: "active",
    completedAt: null,
    archivedAt: null,
    ...overrides,
  };
}

describe("evaluateGoalProjectContribution", () => {
  it("returns the exact all-zero shape for no linked Projects", () => {
    expect(evaluateGoalProjectContribution([])).toEqual(
      EMPTY_GOAL_PROJECT_CONTRIBUTION,
    );
  });

  it("counts one incomplete Project under its workflow bucket", () => {
    const result = evaluateGoalProjectContribution([
      fact({ id: "p1", status: "active" }),
    ]);
    expect(result).toEqual({
      total: 1,
      completed: 0,
      incomplete: 1,
      active: 1,
      planned: 0,
      onHold: 0,
      archived: 0,
    });
  });

  it("counts one completed Project as completed, not under any workflow bucket", () => {
    const result = evaluateGoalProjectContribution([
      fact({ id: "p1", status: "active", completedAt: new Date("2026-07-01") }),
    ]);
    expect(result).toEqual({
      total: 1,
      completed: 1,
      incomplete: 0,
      active: 0,
      planned: 0,
      onHold: 0,
      archived: 0,
    });
  });

  it("classifies Planned, Active and On-hold Projects independently", () => {
    const result = evaluateGoalProjectContribution([
      fact({ id: "p1", status: "planned" }),
      fact({ id: "p2", status: "active" }),
      fact({ id: "p3", status: "on_hold" }),
    ]);
    expect(result).toEqual({
      total: 3,
      completed: 0,
      incomplete: 3,
      active: 1,
      planned: 1,
      onHold: 1,
      archived: 0,
    });
  });

  it("mixes completed and incomplete Projects with exact counts", () => {
    const result = evaluateGoalProjectContribution([
      fact({ id: "p1", status: "active" }),
      fact({ id: "p2", status: "planned" }),
      fact({ id: "p3", completedAt: new Date("2026-07-01") }),
      fact({ id: "p4", completedAt: new Date("2026-07-02") }),
    ]);
    expect(result.total).toBe(4);
    expect(result.completed).toBe(2);
    expect(result.incomplete).toBe(2);
    expect(result.active).toBe(1);
    expect(result.planned).toBe(1);
  });

  it("counts an archived Project under `archived`, counting toward total/completed but never a workflow bucket", () => {
    const result = evaluateGoalProjectContribution([
      fact({ id: "p1", status: "active", archivedAt: new Date("2026-07-10") }),
    ]);
    expect(result.archived).toBe(1);
    expect(result.active).toBe(0);
    expect(result.total).toBe(1);
    expect(result.completed).toBe(0);
  });

  it("Archived precedes Completed: a Project that is both counts once, under archived", () => {
    const result = evaluateGoalProjectContribution([
      fact({
        id: "p1",
        status: "active",
        completedAt: new Date("2026-07-01"),
        archivedAt: new Date("2026-07-10"),
      }),
    ]);
    expect(result).toEqual({
      total: 1,
      completed: 1, // completed/total mirror the spine rollup regardless of archived
      incomplete: 0,
      active: 0,
      planned: 0,
      onHold: 0,
      archived: 1,
    });
  });

  it("never double-counts a corrupt or repeated structural link (dedup by Project id)", () => {
    const result = evaluateGoalProjectContribution([
      fact({ id: "p1", status: "active" }),
      fact({ id: "p1", status: "active" }),
    ]);
    expect(result.total).toBe(1);
    expect(result.active).toBe(1);
  });

  it("when all linked Projects are complete, reports the derived total without a completion verdict", () => {
    const result = evaluateGoalProjectContribution([
      fact({ id: "p1", completedAt: new Date("2026-07-01") }),
      fact({ id: "p2", completedAt: new Date("2026-07-02") }),
    ]);
    expect(result.total).toBe(2);
    expect(result.completed).toBe(2);
    expect(result.incomplete).toBe(0);
    // The evaluator has no notion of Goal completion at all — it is a plain
    // counts object, proving derived progress can never itself declare a Goal
    // complete.
    expect(result).not.toHaveProperty("goalCompleted");
  });
});
