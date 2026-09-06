import { describe, expect, it } from "vitest";

import {
  MIN_ACROSS_REVIEWS,
  readAcrossReviews,
  type AcrossReviewsSubject,
} from "~/kernel/review-insights";

import {
  buildInsights,
  carryOverFact,
  goalFact,
  projectFact,
  storedSnapshot,
} from "../../support/review-insights";

/**
 * V2.9 INS-02 — what several Reviews say that one cannot.
 *
 * Every snapshot below is one this file wrote, so every count asserted is a
 * count of known things (the V2.4 rule). The rules under test are the ones the
 * roadmap names: a Project appears only when its state DIFFERS across the
 * series; a missing snapshot SHRINKS the window rather than inventing a state;
 * a commitment is "repeated" only when it carried over at EVERY Review; and
 * every title is live, read through the stored id.
 */

const PROJECTS: readonly AcrossReviewsSubject[] = [
  { id: "project-1", title: "Kitchen renovation" },
  { id: "project-2", title: "Tax return" },
];
const GOALS: readonly AcrossReviewsSubject[] = [
  { id: "goal-1", title: "Run a half marathon" },
];
const TASKS: readonly AcrossReviewsSubject[] = [
  { id: "task-1", title: "Call the plumber" },
  { id: "task-2", title: "Chase the invoice" },
];

/** Four weekly Reviews whose Project states alternate — the falsification's fixture. */
function alternatingSeries() {
  return [
    storedSnapshot("review-1", {
      periodStart: "2026-08-03",
      periodEnd: "2026-08-09",
      projects: [
        { id: "project-1", health: "on_track", openTasks: 3, overdueTasks: 0 },
      ],
      carryOverTaskIds: ["task-1", "task-2"],
    }),
    storedSnapshot("review-2", {
      periodStart: "2026-08-10",
      periodEnd: "2026-08-16",
      projects: [
        { id: "project-1", health: "at_risk", openTasks: 4, overdueTasks: 2 },
      ],
      carryOverTaskIds: ["task-1"],
    }),
    storedSnapshot("review-3", {
      periodStart: "2026-08-17",
      periodEnd: "2026-08-23",
      projects: [
        { id: "project-1", health: "at_risk", openTasks: 4, overdueTasks: 3 },
      ],
      carryOverTaskIds: ["task-1", "task-2"],
    }),
    storedSnapshot("review-4", {
      periodStart: "2026-08-24",
      periodEnd: "2026-08-30",
      projects: [
        { id: "project-1", health: "at_risk", openTasks: 5, overdueTasks: 3 },
      ],
      carryOverTaskIds: ["task-1"],
    }),
  ];
}

describe("reading a series of snapshots", () => {
  it("counts the state a Project held most often, over the Reviews that recorded one", () => {
    const facts = readAcrossReviews({
      series: alternatingSeries(),
      projects: PROJECTS,
      goals: GOALS,
      tasks: TASKS,
    });
    expect(facts.reviews).toBe(4);
    expect(facts.sinceIso).toBe("2026-08-03");
    expect(facts.projects).toHaveLength(1);
    expect(facts.projects[0]).toMatchObject({
      projectId: "project-1",
      title: "Kitchen renovation",
      state: "at_risk",
      count: 3,
      of: 4,
    });
  });

  it("says nothing about a Project whose state never changed — absence renders less", () => {
    const steady = alternatingSeries().map((stored) => ({
      ...stored,
      snapshot: {
        ...stored.snapshot,
        projects: [
          {
            id: "project-1" as const,
            health: "on_track" as const,
            openTasks: 3,
            overdueTasks: 0,
          },
        ],
      },
    }));
    const facts = readAcrossReviews({
      series: steady,
      projects: PROJECTS,
      goals: GOALS,
      tasks: TASKS,
    });
    expect(facts.projects).toEqual([]);
  });

  it("skips a Review that recorded NO reading rather than counting it as a state", () => {
    // RECALL-04 / DEBT-234: `health: null` means there was no evidence, which
    // is not the same as "on track". It shrinks the denominator.
    const withGap = alternatingSeries();
    const series = withGap.map((stored, index) =>
      index === 1
        ? {
            ...stored,
            snapshot: {
              ...stored.snapshot,
              projects: [
                {
                  id: "project-1" as const,
                  health: null,
                  openTasks: 4,
                  overdueTasks: 2,
                },
              ],
            },
          }
        : stored,
    );
    const facts = readAcrossReviews({
      series,
      projects: PROJECTS,
      goals: GOALS,
      tasks: TASKS,
    });
    expect(facts.projects[0]).toMatchObject({
      count: 2,
      of: 3,
      reviews: 4,
      // Since the oldest Review that RECORDED it — the first — not the window.
      sinceIso: "2026-08-03",
    });

    // And the evidence sentence says which is which. Found by review: it read
    // "at 2 of the last 3 Reviews" over a series of four, so "the last 3"
    // quietly included the Review that had recorded nothing.
    const insights = buildInsights({
      snapshotSeries: series,
      projects: [projectFact({ healthState: "at_risk", overdueTasks: 3 })],
    });
    const project = insights.acrossReviews.find((insight) =>
      insight.id.startsWith("across.project."),
    );
    expect(project?.label).toBe(
      "Kitchen renovation: At risk at 2 of the 3 Reviews that recorded it, of your last 4",
    );
    expect(project?.reason).toContain("over the 3 Reviews that recorded it");
    expect(project?.reason).toContain(
      "1 Review in the series recorded no reading for it",
    );
    expect(project?.reason).not.toContain("over your last 3 Reviews");
  });

  it("dates a subject from the oldest Review that recorded it, not from the window", () => {
    // project-2 first appears at the third Review.
    const series = alternatingSeries().map((stored, index) =>
      index >= 2
        ? {
            ...stored,
            snapshot: {
              ...stored.snapshot,
              projects: [
                ...stored.snapshot.projects,
                {
                  id: "project-2" as const,
                  health:
                    index === 2 ? ("stale" as const) : ("on_track" as const),
                  openTasks: 1,
                  overdueTasks: 0,
                },
              ],
            },
          }
        : stored,
    );
    const facts = readAcrossReviews({
      series,
      projects: PROJECTS,
      goals: GOALS,
      tasks: TASKS,
    });
    const tax = facts.projects.find(
      (project) => project.projectId === "project-2",
    );
    expect(tax).toMatchObject({ of: 2, reviews: 4, sinceIso: "2026-08-17" });
  });

  it("names a Goal's contribution across the series, and marks the every-Review case", () => {
    const series = alternatingSeries().map((stored) => ({
      ...stored,
      snapshot: {
        ...stored.snapshot,
        goals: [
          {
            id: "goal-1" as const,
            alignment: "active" as const,
            contributingProjects: 0,
            contribution: "no_structure" as const,
          },
        ],
      },
    }));
    const facts = readAcrossReviews({
      series,
      projects: PROJECTS,
      goals: GOALS,
      tasks: TASKS,
    });
    expect(facts.goals[0]).toMatchObject({
      goalId: "goal-1",
      state: "no_structure",
      count: 4,
      of: 4,
      everyReview: true,
    });
  });

  it("counts a commitment as repeated only when it carried over at EVERY Review", () => {
    const facts = readAcrossReviews({
      series: alternatingSeries(),
      projects: PROJECTS,
      goals: GOALS,
      tasks: TASKS,
    });
    // task-1 is in all four; task-2 is in two of them and is not "repeated".
    expect(facts.repeatedCarryOver.map((task) => task.taskId)).toEqual([
      "task-1",
    ]);
    expect(facts.repeatedCarryOver[0]).toMatchObject({
      title: "Call the plumber",
      reviews: 4,
    });
    expect(facts.repeatedCarryOverBounded).toBe(false);
  });

  it("says the count is a floor when a repeated id could not be named live", () => {
    // task-1 repeats at every Review but is absent from the caller's (bounded)
    // live carry-over set: past its page, or since deleted. Found by review:
    // the measure was reported EXACT over the named subset, so "1 commitment"
    // could stand where two had repeated.
    const series = alternatingSeries().map((stored) => ({
      ...stored,
      snapshot: {
        ...stored.snapshot,
        carryOverTaskIds: ["task-1", "task-2"],
      },
    }));
    const facts = readAcrossReviews({
      series,
      projects: PROJECTS,
      goals: GOALS,
      tasks: [{ id: "task-2", title: "Chase the invoice" }],
    });
    expect(facts.repeatedCarryOver.map((task) => task.taskId)).toEqual([
      "task-2",
    ]);
    expect(facts.repeatedCarryOverBounded).toBe(true);
  });

  it("reads every title live through the id, so a deleted record drops out", () => {
    const facts = readAcrossReviews({
      series: alternatingSeries(),
      projects: [],
      goals: [],
      tasks: [],
    });
    // The snapshots still hold the ids; nothing live matches them, so nothing
    // is named — never a stored title (ADR-079 decision 3).
    expect(facts.projects).toEqual([]);
    expect(facts.goals).toEqual([]);
    expect(facts.repeatedCarryOver).toEqual([]);
  });

  it("produces nothing at all from fewer than two Reviews", () => {
    expect(MIN_ACROSS_REVIEWS).toBe(2);
    const facts = readAcrossReviews({
      series: alternatingSeries().slice(0, 1),
      projects: PROJECTS,
      goals: GOALS,
      tasks: TASKS,
    });
    expect(facts.projects).toEqual([]);
    expect(facts.goals).toEqual([]);
    expect(facts.repeatedCarryOver).toEqual([]);
  });
});

describe("the across-Reviews section of the evidence model", () => {
  function insightsWithSeries(
    series: ReturnType<typeof alternatingSeries>,
    extra: Parameters<typeof buildInsights>[0] = {},
  ) {
    return buildInsights({
      snapshotSeries: series,
      projects: [projectFact({ healthState: "at_risk", overdueTasks: 3 })],
      goals: [goalFact({ contributingProjects: 0 })],
      carryOver: [
        carryOverFact({ id: "task-1", title: "Call the plumber" }),
        carryOverFact({ id: "task-2", title: "Chase the invoice" }),
      ],
      ...extra,
    });
  }

  it("states the count, and names the window it counted over", () => {
    const insights = insightsWithSeries(alternatingSeries());
    const project = insights.acrossReviews.find((insight) =>
      insight.id.startsWith("across.project."),
    );
    expect(project?.label).toBe(
      "Kitchen renovation: At risk at 3 of the last 4 Reviews",
    );
    // The reason carries the window in words, with the N actually held.
    expect(project?.reason).toContain("over your last 4 Reviews");
    expect(project?.reason).toContain("since 2026-08-03");
  });

  it("shrinks the window rather than inventing a state when snapshots are missing", () => {
    // The falsification the roadmap names: delete two of the four snapshots and
    // the sentence must describe two Reviews, not four. The two KEPT are the
    // ones whose states differ — the last two are both "at risk", and a
    // Project that held one state is correctly not a finding at all, which the
    // test above asserts separately.
    const insights = insightsWithSeries(alternatingSeries().slice(0, 2));
    const project = insights.acrossReviews.find((insight) =>
      insight.id.startsWith("across.project."),
    );
    expect(project?.label).toBe(
      "Kitchen renovation: At risk at 1 of the last 2 Reviews",
    );
    expect(project?.reason).toContain("over your last 2 Reviews");
    expect(project?.reason).toContain("since 2026-08-03");
    // And the window it names is the one it actually held: never four.
    expect(project?.reason).not.toContain("4 Reviews");
  });

  it("gives the repeated-carry-over fact one door that works", () => {
    const insights = insightsWithSeries(alternatingSeries());
    const carryOver = insights.acrossReviews.find(
      (insight) => insight.id === "across.carry_over",
    );
    expect(carryOver?.label).toBe(
      "1 commitment carried over at every one of your last 4 Reviews",
    );
    // Named in prose, and the one link is a route that actually resolves.
    expect(carryOver?.reason).toContain("Call the plumber");
    expect(carryOver?.links).toEqual([
      { label: "Open overdue Tasks", to: "/tasks?system=overdue" },
    ]);
  });

  it("opens the waiting view when a repeated commitment is a waiting Task", () => {
    // The door goes where the named Task IS. A Task that has been waiting on
    // someone since before every Review in the series is not in the overdue
    // view, so a door there was a dead end (found by review).
    const insights = insightsWithSeries(alternatingSeries(), {
      carryOver: [
        carryOverFact({
          id: "task-1",
          title: "Call the plumber",
          kind: "waiting",
        }),
        carryOverFact({ id: "task-2", title: "Chase the invoice" }),
      ],
    });
    const carryOver = insights.acrossReviews.find(
      (insight) => insight.id === "across.carry_over",
    );
    expect(carryOver?.links).toEqual([
      { label: "Open waiting Tasks", to: "/tasks?system=waiting" },
    ]);
  });

  it("says N+ and names the floor when more repeated than could be named", () => {
    const insights = insightsWithSeries(alternatingSeries(), {
      carryOver: [carryOverFact({ id: "task-2", title: "Chase the invoice" })],
      snapshotSeries: alternatingSeries().map((stored) => ({
        ...stored,
        snapshot: {
          ...stored.snapshot,
          carryOverTaskIds: ["task-1", "task-2"],
        },
      })),
    });
    const carryOver = insights.acrossReviews.find(
      (insight) => insight.id === "across.carry_over",
    );
    expect(carryOver?.label).toBe(
      "1+ commitments carried over at every one of your last 4 Reviews",
    );
    expect(carryOver?.measure).toEqual({ value: 1, exactness: "bounded" });
    expect(carryOver?.reason).toContain("More repeated than are named here.");
  });

  it("does not repeat a Goal that work reached at every Review — absence renders less", () => {
    // The one-step Goals section already says "moving"; saying it N more times
    // is not a finding. A Goal NOTHING reached at every Review is, and stays.
    const steady = alternatingSeries().map((stored) => ({
      ...stored,
      snapshot: {
        ...stored.snapshot,
        goals: [
          {
            id: "goal-1" as const,
            alignment: "active" as const,
            contributingProjects: 1,
            contribution: "moving" as const,
          },
        ],
      },
    }));
    expect(
      insightsWithSeries(steady).acrossReviews.some((insight) =>
        insight.id.startsWith("across.goal."),
      ),
    ).toBe(false);
    const stuck = steady.map((stored) => ({
      ...stored,
      snapshot: {
        ...stored.snapshot,
        goals: stored.snapshot.goals.map((goal) => ({
          ...goal,
          contribution: "no_structure" as const,
        })),
      },
    }));
    const goal = insightsWithSeries(stuck).acrossReviews.find((insight) =>
      insight.id.startsWith("across.goal."),
    );
    expect(goal?.label).toBe(
      "Run a half marathon: No contribution path at every one of your last 4 Reviews",
    );
  });

  it("gives every across-Reviews claim a reason and somewhere to go", () => {
    const insights = insightsWithSeries(alternatingSeries());
    expect(insights.acrossReviews.length).toBeGreaterThan(0);
    for (const insight of insights.acrossReviews) {
      expect(insight.reason.length).toBeGreaterThan(0);
      expect(insight.links.length).toBeGreaterThan(0);
    }
  });

  it("renders nothing when there is no series", () => {
    expect(buildInsights().acrossReviews).toEqual([]);
  });

  it("carries no score, grade or percentage, and never an alarming tone", () => {
    // The ADR-079 d6 sweep, extended to the new collection.
    const insights = insightsWithSeries(alternatingSeries());
    const serialised = JSON.stringify(insights.acrossReviews);
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
    expect(insights.acrossReviews.map((insight) => insight.tone)).not.toContain(
      "danger",
    );
  });
});
