/**
 * REVIEW-03 — the one persisted artefact: its shape, its determinism, and what
 * it refuses to carry.
 *
 * The rules being defended here are the ones that stop a snapshot becoming a
 * second, stale copy of the owner's records: derived facts only, bounded lists,
 * a version that fails closed, and byte-identical output for identical facts.
 */

import { describe, expect, it } from "vitest";

import {
  REVIEW_INSIGHT_SNAPSHOT_VERSION,
  SNAPSHOT_LIMITS,
  buildReviewInsightSnapshot,
  classifyGoalContribution,
  parseReviewInsightSnapshot,
  serializeReviewInsightSnapshot,
} from "~/kernel/review-insights";

import {
  areaFact,
  carryOverFact,
  goalFact,
  insightFacts,
  projectFact,
} from "../../support/review-insights";

function build(facts = insightFacts()) {
  const byGoal = new Map(
    facts.state.goals.map((goal) => [goal.id, classifyGoalContribution(goal)]),
  );
  return buildReviewInsightSnapshot(
    facts,
    (goalId) => byGoal.get(goalId) ?? "none",
  );
}

describe("building a Review insight snapshot", () => {
  it("records the period it describes and the current shape version", () => {
    const snapshot = build();
    expect(snapshot.version).toBe(REVIEW_INSIGHT_SNAPSHOT_VERSION);
    expect(snapshot.periodStart).toBe("2026-07-27");
    expect(snapshot.periodEnd).toBe("2026-08-02");
  });

  it("stores derived facts only — no titles and no record bodies", () => {
    const snapshot = build(
      insightFacts({
        tasksCompleted: 4,
        projects: [
          projectFact({
            id: "p1",
            title: "Kitchen renovation",
            healthState: "at_risk",
            tasksCompletedInPeriod: 4,
          }),
        ],
        goals: [
          goalFact({
            id: "g1",
            title: "Run a half marathon",
            tasksCompletedInPeriod: 4,
          }),
        ],
        areas: [
          areaFact({
            id: "a1",
            title: "Health & Fitness",
            tasksCompletedInPeriod: 4,
          }),
        ],
        carryOver: [carryOverFact({ id: "t1", title: "Renew the insurance" })],
        overdueCarryOver: 1,
      }),
    );
    const serialised = serializeReviewInsightSnapshot(snapshot);
    // A renamed Project must still render under its NEW title, so no title can
    // ever be frozen here.
    expect(serialised).not.toContain("Kitchen renovation");
    expect(serialised).not.toContain("Run a half marathon");
    expect(serialised).not.toContain("Health & Fitness");
    expect(serialised).not.toContain("Renew the insurance");
    expect(snapshot.projects).toEqual([
      { id: "p1", health: "at_risk", openTasks: 4, overdueTasks: 0 },
    ]);
    expect(snapshot.goals[0].contribution).toBe("moving");
    expect(snapshot.carryOverTaskIds).toEqual(["t1"]);
  });

  it("is deterministic and order-independent", () => {
    const facts = insightFacts({
      projects: [
        projectFact({ id: "p2", title: "B" }),
        projectFact({ id: "p1", title: "A" }),
      ],
      carryOver: [carryOverFact({ id: "t2" }), carryOverFact({ id: "t1" })],
      overdueCarryOver: 2,
    });
    const reversed = insightFacts({
      projects: [
        projectFact({ id: "p1", title: "A" }),
        projectFact({ id: "p2", title: "B" }),
      ],
      carryOver: [carryOverFact({ id: "t1" }), carryOverFact({ id: "t2" })],
      overdueCarryOver: 2,
    });
    expect(serializeReviewInsightSnapshot(build(facts))).toBe(
      serializeReviewInsightSnapshot(build(reversed)),
    );
  });

  it("caps every list and says so, so one row cannot grow with the workspace", () => {
    const many = Array.from({ length: SNAPSHOT_LIMITS.projects + 5 }, (_, i) =>
      projectFact({ id: `p${String(i).padStart(3, "0")}`, title: `P${i}` }),
    );
    const snapshot = build(insightFacts({ projects: many }));
    expect(snapshot.projects).toHaveLength(SNAPSHOT_LIMITS.projects);
    expect(snapshot.projectsBounded).toBe(true);
  });
});

describe("reading a stored snapshot", () => {
  it("round-trips exactly", () => {
    const snapshot = build(
      insightFacts({
        tasksCompleted: 3,
        projects: [projectFact({ id: "p1", healthState: "stale" })],
        goals: [goalFact({ id: "g1", alignmentState: "neglected" })],
        areas: [areaFact({ id: "a1", tasksCompletedInPeriod: 3 })],
        carryOver: [carryOverFact({ id: "t1" })],
        overdueCarryOver: 1,
      }),
    );
    expect(
      parseReviewInsightSnapshot(serializeReviewInsightSnapshot(snapshot)),
    ).toEqual(snapshot);
  });

  it("fails CLOSED: an unknown version reads as no snapshot, never as zeros", () => {
    const snapshot = build();
    const bumped = JSON.stringify({
      ...snapshot,
      version: REVIEW_INSIGHT_SNAPSHOT_VERSION + 1,
    });
    expect(parseReviewInsightSnapshot(bumped)).toBeNull();
  });

  it("returns null for malformed JSON and for a missing period", () => {
    expect(parseReviewInsightSnapshot("{oh no")).toBeNull();
    expect(parseReviewInsightSnapshot("[]")).toBeNull();
    expect(
      parseReviewInsightSnapshot(
        JSON.stringify({ version: REVIEW_INSIGHT_SNAPSHOT_VERSION }),
      ),
    ).toBeNull();
  });

  it("drops rows carrying a state this build does not know, keeping the rest", () => {
    const parsed = parseReviewInsightSnapshot(
      JSON.stringify({
        version: REVIEW_INSIGHT_SNAPSHOT_VERSION,
        periodStart: "2026-07-20",
        periodEnd: "2026-07-26",
        projects: [
          { id: "p1", health: "on_track", openTasks: 1, overdueTasks: 0 },
          { id: "p2", health: "on_fire", openTasks: 1, overdueTasks: 0 },
        ],
      }),
    );
    expect(parsed?.projects.map((project) => project.id)).toEqual(["p1"]);
  });
});
