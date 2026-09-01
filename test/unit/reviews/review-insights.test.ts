/**
 * REVIEW-03 — the insight RULES, tested without a database, a browser or the
 * wall clock.
 *
 * Every case here describes a week and asserts what DalyHub concludes from it.
 * Tests assert on structured fields (`state`, `kind`, `direction`, `id`) and on
 * the sentences the owner actually reads, because an unexplained label is the
 * failure mode this feature exists to avoid — a reason that goes missing is a
 * regression even if the classification is still right.
 */

import { describe, expect, it } from "vitest";

import {
  MIN_TREND_POINTS,
  classifyGoalContribution,
  classifyProjectHealthChange,
  evaluateReviewInsights,
  trendDirection,
  type TrendPoint,
} from "~/kernel/review-insights";

import {
  areaFact,
  buildInsights,
  carryOverFact,
  goalFact,
  insightFacts,
  previousSnapshot,
  projectFact,
} from "../../support/review-insights";

/* -------------------------------------------------------------------------- */
/* Goal contribution                                                           */
/* -------------------------------------------------------------------------- */

describe("Goal contribution", () => {
  it("is Moving when completed work in the period rolled up to the Goal", () => {
    expect(
      classifyGoalContribution(
        goalFact({
          tasksCompletedInPeriod: 3,
          contributingProjectsWithWork: 2,
        }),
      ),
    ).toBe("moving");
  });

  it("is Limited movement when nothing completed but the Goal is still recently active", () => {
    expect(
      classifyGoalContribution(
        goalFact({ tasksCompletedInPeriod: 0, alignmentState: "active" }),
      ),
    ).toBe("limited");
  });

  it("is No recent movement when nothing completed and nothing recent either", () => {
    expect(
      classifyGoalContribution(
        goalFact({ tasksCompletedInPeriod: 0, alignmentState: "neglected" }),
      ),
    ).toBe("none");
  });

  it("distinguishes a missing contribution PATH from a stalled Goal", () => {
    // A Goal no Project advances has not been neglected — it has never been
    // wired up. Calling that "no movement" would blame the owner for a
    // structure they never built.
    expect(
      classifyGoalContribution(
        goalFact({ contributingProjects: 0, alignmentState: "no_structure" }),
      ),
    ).toBe("no_structure");
  });

  it("lets completion win over everything else", () => {
    expect(
      classifyGoalContribution(
        goalFact({
          completedInPeriod: true,
          contributingProjects: 0,
          alignmentState: "neglected",
        }),
      ),
    ).toBe("completed");
  });

  it("always states why, with the counts that produced the label", () => {
    const insights = buildInsights({
      tasksCompleted: 3,
      goals: [
        goalFact({
          tasksCompletedInPeriod: 3,
          contributingProjectsWithWork: 2,
          contributingProjects: 2,
        }),
      ],
    });
    const goal = insights.goalContribution[0];
    expect(goal.label).toBe("Moving");
    expect(goal.reason).toBe(
      "3 Tasks completed this period, across 2 contributing Projects.",
    );
  });

  it("leads with the Goals worth a look, not the ones doing well", () => {
    const insights = buildInsights({
      goals: [
        goalFact({ id: "g-moving", tasksCompletedInPeriod: 2 }),
        goalFact({ id: "g-none", alignmentState: "neglected" }),
        goalFact({ id: "g-limited", alignmentState: "active" }),
      ],
      tasksCompleted: 2,
    });
    expect(insights.goalContribution.map((goal) => goal.goalId)).toEqual([
      "g-none",
      "g-limited",
      "g-moving",
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* Project health change                                                       */
/* -------------------------------------------------------------------------- */

describe("Project health change", () => {
  it("reads a reduction in concern as improved and an increase as deteriorated", () => {
    expect(classifyProjectHealthChange("at_risk", "on_track")).toBe("improved");
    expect(classifyProjectHealthChange("on_track", "at_risk")).toBe(
      "deteriorated",
    );
    expect(classifyProjectHealthChange("on_track", "stale")).toBe(
      "deteriorated",
    );
    expect(classifyProjectHealthChange("stale", "on_track")).toBe("improved");
  });

  it("treats an unchanged state as unchanged and an unseen Project as new", () => {
    expect(classifyProjectHealthChange("stale", "stale")).toBe("unchanged");
    // V2.7 RECALL-04 — "not in the previous snapshot" is `undefined`; `null` now
    // means the previous Review recorded that it had NO reading, which is a
    // different fact and gets a different answer (below).
    expect(classifyProjectHealthChange(undefined, "at_risk")).toBe("new");
  });

  /*
   * V2.7 RECALL-04 (DEBT-234) — a missing READING is not a state, and two
   * absences are not a transition.
   *
   * Restoring the old `health?.state ?? "on_track"` default in
   * `review-insights-context.ts` puts a real state on both sides of these
   * comparisons, and every assertion below flips to `unchanged`, `improved` or
   * `deteriorated` — which is exactly the false story the default could tell.
   */
  it("says nothing at all when either side has no health reading", () => {
    expect(classifyProjectHealthChange(null, null)).toBe("unknown");
    expect(classifyProjectHealthChange(null, "at_risk")).toBe("unknown");
    expect(classifyProjectHealthChange("at_risk", null)).toBe("unknown");
    expect(classifyProjectHealthChange("on_track", null)).toBe("unknown");
  });

  it("shows the transition in words, both states named", () => {
    const insights = buildInsights({
      previousReviewId: "review-previous",
      previousSnapshot: previousSnapshot({
        projects: [
          { id: "project-1", health: "at_risk", openTasks: 4, overdueTasks: 2 },
        ],
      }),
      projects: [projectFact({ healthState: "on_track", openTasks: 4 })],
    });
    const change = insights.projectChanges[0];
    expect(change.kind).toBe("improved");
    expect(change.label).toBe("At risk → On track");
    expect(change.reason).toContain("improved since your last Review");
  });

  it("never calls a Project improved merely because more Tasks were completed", () => {
    // Completion is movement. Health is a different signal, and this is the
    // conflation REVIEW-03 was explicitly told not to make.
    const insights = buildInsights({
      previousReviewId: "review-previous",
      previousSnapshot: previousSnapshot({
        projects: [
          { id: "project-1", health: "at_risk", openTasks: 9, overdueTasks: 3 },
        ],
      }),
      tasksCompleted: 6,
      projects: [
        projectFact({
          healthState: "at_risk",
          overdueTasks: 3,
          tasksCompletedInPeriod: 6,
        }),
      ],
    });
    expect(insights.projectChanges).toEqual([]);
    expect(insights.movement.map((insight) => insight.id)).toContain(
      "movement.tasks",
    );
  });

  it("reports a completed Project as movement, not as a health improvement", () => {
    const insights = buildInsights({
      previousReviewId: "review-previous",
      previousSnapshot: previousSnapshot({
        projects: [
          { id: "project-1", health: "at_risk", openTasks: 1, overdueTasks: 1 },
        ],
      }),
      projectsCompleted: 1,
      projects: [
        projectFact({ healthState: "completed", completedInPeriod: true }),
      ],
    });
    expect(insights.projectChanges).toEqual([]);
    expect(insights.movement.map((insight) => insight.id)).toContain(
      "movement.projects",
    );
  });

  it("notices a previously stalled Project that moved again", () => {
    const insights = buildInsights({
      previousReviewId: "review-previous",
      previousSnapshot: previousSnapshot({
        projects: [
          { id: "project-1", health: "stale", openTasks: 3, overdueTasks: 0 },
        ],
      }),
      tasksCompleted: 2,
      projects: [
        projectFact({ healthState: "on_track", tasksCompletedInPeriod: 2 }),
      ],
    });
    const restarted = insights.movement.find(
      (insight) => insight.id === "movement.restarted",
    );
    expect(restarted?.label).toBe("1 stalled Project moved again");
    expect(restarted?.entityIds).toEqual(["project-1"]);
  });
});

/* -------------------------------------------------------------------------- */
/* Carry-over and attention                                                    */
/* -------------------------------------------------------------------------- */

describe("carry-over", () => {
  it("names the overdue commitments and links to each one", () => {
    const insights = buildInsights({
      overdueCarryOver: 2,
      carryOver: [
        carryOverFact({ id: "task-1", title: "Renew the insurance" }),
        carryOverFact({ id: "task-2", title: "Book the dentist" }),
      ],
    });
    const item = insights.attention.find(
      (insight) => insight.id === "attention.carry_over.overdue",
    );
    expect(item?.label).toBe("2 overdue commitments carried into this period");
    expect(item?.links.map((link) => link.to)).toContain("/tasks?task=task-1");
    expect(item?.entityIds).toEqual(["task-1", "task-2"]);
  });

  it("says which of them were ALSO carrying over at the last Review", () => {
    const insights = buildInsights({
      previousReviewId: "review-previous",
      previousSnapshot: previousSnapshot({ carryOverTaskIds: ["task-1"] }),
      overdueCarryOver: 2,
      carryOver: [
        carryOverFact({ id: "task-1" }),
        carryOverFact({ id: "task-2", title: "Book the dentist" }),
      ],
    });
    const item = insights.attention.find(
      (insight) => insight.id === "attention.carry_over.overdue",
    );
    expect(item?.reason).toBe(
      "1 of them was already carrying over at your last Review.",
    );
  });

  it("reports an unreadable count as unavailable rather than as zero", () => {
    const facts = insightFacts({});
    const broken = {
      ...facts,
      state: {
        ...facts.state,
        carryOverOverdue: { value: 0, exactness: "unavailable" as const },
      },
    };
    const insights = evaluateReviewInsights({
      periodLabel: "27 July – 2 August 2026",
      facts: broken,
      previous: null,
      series: [],
      seriesLabels: {},
      currentSeriesKey: "current",
    });
    expect(insights.attention.map((insight) => insight.id)).toContain(
      "attention.carry_over.unavailable",
    );
  });

  it("reports a Project in ONE place, not under both health change and attention", () => {
    const insights = buildInsights({
      previousReviewId: "review-previous",
      previousSnapshot: previousSnapshot({
        projects: [
          { id: "p-loft", health: "on_track", openTasks: 3, overdueTasks: 0 },
        ],
      }),
      projects: [
        projectFact({ id: "p-loft", title: "Loft", healthState: "at_risk" }),
      ],
    });
    expect(insights.projectChanges.map((c) => c.projectId)).toEqual(["p-loft"]);
    expect(
      insights.attention.find((insight) => insight.id === "attention.projects"),
    ).toBeUndefined();
  });

  it("names only a few records in a reason, and says how many more there are", () => {
    const stuck = Array.from({ length: 9 }, (_, index) =>
      projectFact({
        id: `p${index}`,
        title: `Project ${index}`,
        healthState: "stale",
      }),
    );
    const insights = buildInsights({ projects: stuck });
    const item = insights.attention.find(
      (insight) => insight.id === "attention.projects",
    );
    expect(item?.label).toBe("9 Projects need a look");
    expect(item?.reason).toContain("and 5 more");
    // Nothing is hidden: the ids are all still on the insight for drill-down.
    expect(item?.entityIds).toHaveLength(9);
  });

  it("flags Projects that are open, concerning and had nothing completed", () => {
    const insights = buildInsights({
      projects: [
        projectFact({ id: "p-stale", title: "Loft", healthState: "stale" }),
        projectFact({ id: "p-ok", title: "Garden", healthState: "on_track" }),
      ],
    });
    const item = insights.attention.find(
      (insight) => insight.id === "attention.projects",
    );
    expect(item?.label).toBe("1 Project needs a look");
    expect(item?.entityIds).toEqual(["p-stale"]);
  });
});

/* -------------------------------------------------------------------------- */
/* Where effort landed                                                         */
/* -------------------------------------------------------------------------- */

describe("distribution", () => {
  it("names the Areas that received completed work, with their counts", () => {
    const insights = buildInsights({
      tasksCompleted: 7,
      areas: [
        areaFact({ id: "a-home", title: "Home", tasksCompletedInPeriod: 5 }),
        areaFact({ id: "a-work", title: "Career", tasksCompletedInPeriod: 2 }),
      ],
    });
    const attended = insights.distribution.find(
      (insight) => insight.id === "distribution.attended",
    );
    expect(attended?.reason).toBe("Home (5), Career (2)");
  });

  it("names an Area with active work and no completions, and says what counted", () => {
    const insights = buildInsights({
      tasksCompleted: 5,
      areas: [
        areaFact({ id: "a-home", title: "Home", tasksCompletedInPeriod: 5 }),
        areaFact({
          id: "a-health",
          title: "Health & Fitness",
          activeProjects: 2,
          tasksCompletedInPeriod: 0,
        }),
      ],
    });
    const untouched = insights.distribution.find(
      (insight) => insight.id === "distribution.untouched",
    );
    expect(untouched?.label).toBe("1 Area has active work but no completions");
    expect(untouched?.reason).toContain("Health & Fitness");
    expect(untouched?.reason).toContain("Completion is what counts here");
  });

  it("says nothing about an Area with no active work at all", () => {
    const insights = buildInsights({
      tasksCompleted: 1,
      areas: [
        areaFact({ id: "a-home", title: "Home", tasksCompletedInPeriod: 1 }),
        areaFact({ id: "a-empty", title: "Someday", activeProjects: 0 }),
      ],
    });
    expect(
      insights.distribution.find(
        (insight) => insight.id === "distribution.untouched",
      ),
    ).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* Trends                                                                      */
/* -------------------------------------------------------------------------- */

function point(value: number, index: number): TrendPoint {
  return {
    key: `p${index}`,
    label: `Week ${index}`,
    shortLabel: `W${index}`,
    value,
    current: false,
  };
}

describe("trend direction", () => {
  it("needs at least two points before it claims a direction", () => {
    expect(trendDirection([point(4, 1)])).toBe("insufficient");
    expect(MIN_TREND_POINTS).toBe(2);
  });

  it("compares the ends of the series, and calls unchanged unchanged", () => {
    expect(trendDirection([point(2, 1), point(9, 2)])).toBe("up");
    expect(trendDirection([point(9, 1), point(2, 2)])).toBe("down");
    expect(trendDirection([point(5, 1), point(9, 2), point(5, 3)])).toBe(
      "flat",
    );
  });

  it("states every value in the summary, so the chart is never the only source", () => {
    const insights = buildInsights({
      tasksCompleted: 6,
      series: [
        {
          key: "review-previous",
          periodStart: "2026-07-20",
          periodEnd: "2026-07-26",
          tasksCompleted: 2,
          projectsCompleted: 0,
          goalsCompleted: 0,
        },
        {
          key: "current",
          periodStart: "2026-07-27",
          periodEnd: "2026-08-02",
          tasksCompleted: 6,
          projectsCompleted: 0,
          goalsCompleted: 0,
        },
      ],
    });
    const trend = insights.trends[0];
    expect(trend.direction).toBe("up");
    expect(trend.summary).toContain("2026-07-26: 2");
    expect(trend.summary).toContain("27 Jul – 2 Aug: 6");
    expect(trend.summary).toContain("up from 2 to 6");
  });

  it("draws no trend at all from a single period", () => {
    expect(buildInsights({ tasksCompleted: 6 }).trends).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Absence                                                                     */
/* -------------------------------------------------------------------------- */

describe("sparse and first-time history", () => {
  it("says it is the first Review instead of showing zeros", () => {
    const insights = buildInsights();
    expect(insights.comparison).toEqual({ kind: "first_review" });
    expect(insights.isEmpty).toBe(true);
    expect(insights.movement).toEqual([]);
    expect(insights.projectChanges).toEqual([]);
    expect(insights.trends).toEqual([]);
    expect(insights.notes[0]).toContain("first completed Review");
  });

  it("distinguishes 'no previous Review' from 'previous Review has no snapshot'", () => {
    const insights = buildInsights({
      previousReviewId: "review-previous",
      previousSnapshot: null,
      tasksCompleted: 3,
      projects: [projectFact({ tasksCompletedInPeriod: 3 })],
    });
    expect(insights.comparison.kind).toBe("no_snapshot");
    // No previous state means no health comparison — and it is said, not faked.
    expect(insights.projectChanges).toEqual([]);
    expect(insights.notes.join(" ")).toContain(
      "before DalyHub started recording Review evidence",
    );
  });

  it("never emits a zero-valued movement claim", () => {
    const insights = buildInsights({
      previousReviewId: "review-previous",
      previousSnapshot: previousSnapshot(),
      tasksCompleted: 0,
      projectsCompleted: 0,
      goalsCompleted: 0,
    });
    expect(insights.movement).toEqual([]);
    for (const insight of [...insights.attention, ...insights.distribution]) {
      expect(insight.measure?.value ?? 1).not.toBe(0);
    }
  });

  it("reports an unavailable history rather than reporting no movement", () => {
    const insights = buildInsights({ historyAvailable: false });
    expect(insights.movement).toHaveLength(1);
    expect(insights.movement[0].id).toBe("movement.unavailable");
    expect(insights.movement[0].label).toBe("Movement is not available");
  });

  it("is deterministic: the same facts always produce the same model", () => {
    const options = {
      previousReviewId: "review-previous",
      previousSnapshot: previousSnapshot({
        projects: [
          {
            id: "project-1",
            health: "stale" as const,
            openTasks: 2,
            overdueTasks: 0,
          },
        ],
        carryOverTaskIds: ["task-1"],
      }),
      tasksCompleted: 4,
      overdueCarryOver: 1,
      carryOver: [carryOverFact()],
      projects: [projectFact({ tasksCompletedInPeriod: 4 })],
      goals: [goalFact({ tasksCompletedInPeriod: 4 })],
      areas: [areaFact({ tasksCompletedInPeriod: 4 })],
    };
    expect(buildInsights(options)).toEqual(buildInsights(options));
  });
});

/* -------------------------------------------------------------------------- */
/* What it refuses to be                                                       */
/* -------------------------------------------------------------------------- */

describe("what the model deliberately does not contain", () => {
  it("has no score, index, grade or percentage anywhere in its shape", () => {
    const insights = buildInsights({
      tasksCompleted: 9,
      previousReviewId: "review-previous",
      previousSnapshot: previousSnapshot(),
      projects: [projectFact({ tasksCompletedInPeriod: 9 })],
      goals: [goalFact({ tasksCompletedInPeriod: 9 })],
      areas: [areaFact({ tasksCompletedInPeriod: 9 })],
      overdueCarryOver: 2,
      carryOver: [carryOverFact(), carryOverFact({ id: "task-2" })],
    });
    const serialised = JSON.stringify(insights);
    for (const forbidden of [
      "score",
      "grade",
      "productivity",
      "streak",
      "rating",
      "%",
    ]) {
      expect(serialised.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("never uses an alarming tone about the owner", () => {
    const insights = buildInsights({
      overdueCarryOver: 9,
      carryOver: [carryOverFact()],
      projects: [projectFact({ healthState: "at_risk", overdueTasks: 9 })],
    });
    const tones = [
      ...insights.movement,
      ...insights.attention,
      ...insights.distribution,
    ].map((insight) => insight.tone);
    expect(tones).not.toContain("danger");
  });

  it("gives every claim a reason and somewhere to go", () => {
    const insights = buildInsights({
      tasksCompleted: 4,
      overdueCarryOver: 1,
      carryOver: [carryOverFact()],
      projects: [
        projectFact({ tasksCompletedInPeriod: 4 }),
        projectFact({ id: "p-stale", title: "Loft", healthState: "stale" }),
      ],
      areas: [areaFact({ tasksCompletedInPeriod: 4 })],
    });
    for (const insight of [
      ...insights.movement,
      ...insights.attention,
      ...insights.distribution,
    ]) {
      expect(insight.reason.length).toBeGreaterThan(0);
      expect(insight.links.length).toBeGreaterThan(0);
    }
    for (const goal of insights.goalContribution) {
      expect(goal.reason.length).toBeGreaterThan(0);
    }
  });
});
