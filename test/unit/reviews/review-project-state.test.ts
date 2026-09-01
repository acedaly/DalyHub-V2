/**
 * V2.7 RECALL-04 — a Project with no health evidence is UNAVAILABLE, never
 * optimistic (DEBT-234, ADR-114 decision 6).
 *
 * `review-insights-context.ts` mapped a missing health reading to
 * `health?.state ?? "on_track"`: the best of the five states, chosen because
 * there was nothing to choose from. It was then written into the Review's
 * snapshot as though it had been measured, and compared at the next Review as a
 * real reading — so a Project that merely became readable could be announced as
 * having "deteriorated", and one that stopped being readable as having
 * "improved". Neither is a story the data supports.
 *
 * The rule is asserted at the pure boundary because that is where the untruth
 * lived, and because a rule about what to say when a read came back empty must
 * be testable without arranging for a read to come back empty. The storage
 * half — the absence surviving a round trip through real D1 — is
 * `test/kernel/recall-04-day-week-truth.test.ts`.
 *
 * **Falsification.** Restore the `?? "on_track"` / `?? "On track"` pair and
 * every assertion in the first block fails.
 */

import { describe, expect, it } from "vitest";

import {
  PROJECT_HEALTH_UNAVAILABLE_LABEL,
  type ProjectHealth,
} from "~/kernel/project-health";
import {
  buildReviewInsightSnapshot,
  classifyProjectHealthChange,
  parseReviewInsightSnapshot,
  serializeReviewInsightSnapshot,
} from "~/kernel/review-insights";
import { projectStateFact } from "~/modules/reviews/insights/review-insights-context";

import {
  buildInsights,
  insightFacts,
  previousSnapshot,
  projectFact,
} from "../../support/review-insights";

/** A real PROJ-02 evaluation, for the contrast case. */
function health(): ProjectHealth {
  return {
    state: "at_risk",
    label: "At risk",
    tone: "warning",
    reasons: [{ code: "overdue", tone: "warning", summary: "2 Tasks overdue" }],
    summary: {
      openTotal: 5,
      overdueOpen: 2,
      waitingOpen: 0,
      daysSinceActivity: 3,
    },
    evaluatedAtIso: "2026-09-07T00:00:00.000Z",
  } as unknown as ProjectHealth;
}

describe("a missing health reading is reported as missing", () => {
  it("resolves to no state and the product's absence wording", () => {
    const fact = projectStateFact({
      id: "project-1",
      title: "Kitchen renovation",
      health: null,
      tasksCompletedInPeriod: 0,
      completedInPeriod: false,
    });

    expect(fact.healthState).toBeNull();
    expect(fact.healthLabel).toBe(PROJECT_HEALTH_UNAVAILABLE_LABEL);
    expect(fact.healthState).not.toBe("on_track");
    expect(fact.healthLabel).not.toBe("On track");
  });

  it("still carries a real reading verbatim, label and all", () => {
    const fact = projectStateFact({
      id: "project-1",
      title: "Kitchen renovation",
      health: health(),
      tasksCompletedInPeriod: 2,
      completedInPeriod: false,
    });

    expect(fact.healthState).toBe("at_risk");
    expect(fact.healthLabel).toBe("At risk");
    expect(fact.openTasks).toBe(5);
    expect(fact.overdueTasks).toBe(2);
    expect(fact.daysSinceActivity).toBe(3);
  });
});

describe("the snapshot records the absence, and no transition comes from it", () => {
  it("stores null rather than a state nothing measured", () => {
    const snapshot = buildReviewInsightSnapshot(
      insightFacts({
        projects: [projectFact({ healthState: null, healthLabel: "x" })],
      }),
      () => "none",
    );
    expect(snapshot.projects).toEqual([
      { id: "project-1", health: null, openTasks: 4, overdueTasks: 0 },
    ]);
  });

  it("keeps the absence through serialise → parse, rather than dropping the row", () => {
    /*
     * Dropping it would be its own untruth: a Project absent from a snapshot
     * reads as "did not exist at that Review", which `classifyProjectHealthChange`
     * answers with `new`. Absent evidence and an absent Project are different
     * facts.
     */
    const snapshot = buildReviewInsightSnapshot(
      insightFacts({
        projects: [projectFact({ healthState: null, healthLabel: "x" })],
      }),
      () => "none",
    );
    const parsed = parseReviewInsightSnapshot(
      serializeReviewInsightSnapshot(snapshot),
    );
    expect(parsed?.projects).toEqual([
      { id: "project-1", health: null, openTasks: 4, overdueTasks: 0 },
    ]);
  });

  it("still refuses a row whose health is malformed rather than absent", () => {
    const parsed = parseReviewInsightSnapshot(
      JSON.stringify({
        version: 1,
        periodStart: "2026-07-20",
        periodEnd: "2026-07-26",
        projects: [
          { id: "p1", health: "flourishing", openTasks: 1, overdueTasks: 0 },
          { id: "p2", health: 3, openTasks: 1, overdueTasks: 0 },
          { id: "p3", health: null, openTasks: 1, overdueTasks: 0 },
        ],
      }),
    );
    expect(parsed?.projects.map((project) => project.id)).toEqual(["p3"]);
  });

  it("produces no transition in either direction across an absent reading", () => {
    expect(classifyProjectHealthChange(null, null)).toBe("unknown");
    expect(classifyProjectHealthChange(null, "on_track")).toBe("unknown");
    expect(classifyProjectHealthChange("on_track", null)).toBe("unknown");
    expect(classifyProjectHealthChange("at_risk", null)).toBe("unknown");
    // The one absence that IS a finding: the Project was not there before.
    expect(classifyProjectHealthChange(undefined, "on_track")).toBe("new");
  });
});

describe("an absent PREVIOUS reading is not a previous position", () => {
  /**
   * Codex review, PR #246 — the defect this item's own change introduced.
   *
   * The attention insight asked `previous.health !== "on_track"` to decide
   * whether a concerning Project "was in the same position at your last
   * Review". That was written when a snapshot's health was always one of the
   * five states; the moment RECALL-04 let it record an ABSENCE, `null !==
   * "on_track"` became true and a Project the last Review could not read was
   * reported as having been in the same concerning position it is in now —
   * exactly the class of untruth this item exists to remove.
   *
   * Both halves of the sentence now ask one question, through the kernel's
   * `projectHealthNeedsLook`.
   */
  function stuckProjectReason(previousHealth: "at_risk" | "on_track" | null) {
    const insights = buildInsights({
      previousReviewId: "review-previous",
      previousSnapshot: previousSnapshot({
        projects: [
          {
            id: "project-1",
            health: previousHealth,
            openTasks: 4,
            overdueTasks: 2,
          },
        ],
      }),
      projects: [
        projectFact({ healthState: "at_risk", tasksCompletedInPeriod: 0 }),
      ],
    });
    return insights.attention.find(
      (insight) => insight.id === "attention.projects",
    )?.reason;
  }

  it("says nothing about last time when last time had no reading", () => {
    const reason = stuckProjectReason(null);
    expect(reason).toContain("open, with nothing completed this period");
    expect(reason).not.toContain("same position at your last Review");
  });

  it("still says so when the last Review DID read a concerning state", () => {
    expect(stuckProjectReason("at_risk")).toContain(
      "was in the same position at your last Review",
    );
  });

  it("does not reach the attention insight at all when the health MOVED", () => {
    /*
     * On track → at risk is a health CHANGE, so the Project is reported there
     * and deliberately not again here: a Project belongs in one place, or a
     * two-Project week reads like a four-Project one. Asserted so the null case
     * above cannot pass merely because this branch swallowed everything.
     */
    expect(stuckProjectReason("on_track")).toBeUndefined();
  });
});
