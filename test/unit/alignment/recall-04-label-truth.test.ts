/**
 * V2.7 RECALL-04 — every label names the question it answers (DEBT-234).
 *
 * DalyHub asks two different questions about a Goal and, before this item, gave
 * them one set of words:
 *
 *   - **measurement status** (GOAL-02) — *"is this Goal's measured outcome on
 *     track?"* Answered from a target, a schedule and readings.
 *   - **alignment** (ADR-040) — *"has this Goal had contributing work recorded
 *     recently?"* Answered from Projects and Activity. It consults no target,
 *     no schedule and no reading.
 *
 * Analytics counted the SECOND and labelled it "Goals on track", which is the
 * first question's phrase; `/views` drew the identical state as "Moving". So one
 * label spanned two predicates and two surfaces could honestly disagree about
 * one workspace (ADR-114 decision 6: no word may span two predicates).
 *
 * These are SOURCE-LEVEL assertions on purpose. The rule is about the words a
 * surface is allowed to use for a predicate, and a rendering test proves the
 * words only for the props it happens to pass; reading the vocabulary itself
 * proves them for every state. ADR-111 decisions 6 and 7 remain binding
 * throughout: the two questions stay two answers, and nothing here merges them
 * into a score.
 */

import { describe, expect, it } from "vitest";

import { GOAL_ALIGNMENT_STATES } from "~/kernel/alignment";
import { evaluateAnalytics } from "~/kernel/analytics";
import { GOAL_MEASUREMENT_ON_TRACK_STATUSES } from "~/kernel/goals";
import { viewsControlGroups } from "~/modules/views/views-controls";
import { GOAL_PROGRESS_STATUS_LABELS } from "~/shared/goal-progress";

/**
 * The words that belong to the MEASUREMENT question and to nothing else.
 *
 * "On track" is GOAL-02's own label for its `on_track` status, and it is taken
 * from that vocabulary rather than typed here so a rename moves both together.
 */
const MEASUREMENT_WORDS = [
  GOAL_PROGRESS_STATUS_LABELS.on_track,
  GOAL_PROGRESS_STATUS_LABELS.ahead,
  GOAL_PROGRESS_STATUS_LABELS.achieved,
];

function usesMeasurementWording(text: string): boolean {
  return MEASUREMENT_WORDS.some((word) =>
    text.toLowerCase().includes(word.toLowerCase()),
  );
}

/** The minimum Analytics facts an evaluation needs, with a Goal tally in them. */
function analyticsFacts(goals: {
  moving: number;
  total: number;
  bounded: boolean;
}) {
  const span = {
    key: "current",
    startIso: "2026-08-24",
    endIso: "2026-08-30",
  };
  return {
    range: "week" as const,
    span,
    buckets: [span],
    current: { tasksCompleted: 4, projectsCompleted: 1, goalsCompleted: 0 },
    previous: { tasksCompleted: 2, projectsCompleted: 0, goalsCompleted: 0 },
    series: [
      {
        key: "current",
        tasksCompleted: 4,
        projectsCompleted: 1,
        goalsCompleted: 0,
      },
    ],
    areas: [],
    areasBounded: false,
    areasAvailable: true,
    goals,
    overdueSeries: [{ key: "current", overdue: 0 }],
    overduePrevious: null,
    overdueAvailable: true,
  };
}

describe("the alignment fact wears alignment words", () => {
  it("labels Analytics' Goal tile with the movement question, never the measurement one", () => {
    const model = evaluateAnalytics(
      analyticsFacts({ moving: 3, total: 9, bounded: false }),
    );
    const tile = model.metrics.find((metric) => metric.id === "goals");

    expect(tile?.label).toBe("Goals moving");
    /*
     * The falsification the roadmap names: restore "Goals on track" — the label
     * this tile carried while counting alignment — and this assertion fails.
     */
    expect(usesMeasurementWording(tile?.label ?? "")).toBe(false);
    expect(usesMeasurementWording(tile?.supporting ?? "")).toBe(false);
  });

  it("says out loud which of the two Goal questions the tile answers", () => {
    const model = evaluateAnalytics(
      analyticsFacts({ moving: 3, total: 9, bounded: false }),
    );
    const note = model.notes.find((line) => line.includes("Goals moving"));
    expect(note).toBeDefined();
    expect(note).toContain("work recorded recently");
    // It names the OTHER question in order to disclaim it, which is the one
    // legitimate use of the measurement words on this surface.
    expect(note).toContain("not a measurement reading");
  });

  it("states the bound as well as the question when the read is capped", () => {
    const model = evaluateAnalytics(
      analyticsFacts({ moving: 12, total: 40, bounded: true }),
    );
    const tile = model.metrics.find((metric) => metric.id === "goals");
    expect(tile?.supporting).toBe("of the 40 Goals read, right now");
    expect(
      model.notes.some((note) => note.includes("not every Goal in the")),
    ).toBe(true);
  });

  it("keeps every /views alignment option in alignment words", () => {
    const groups = viewsControlGroups({
      scopes: ["goal"],
      shared: {},
      modules: {},
    } as never);
    const alignment = groups.find((group) => group.id === "goal-alignment");
    expect(alignment).toBeDefined();
    for (const option of alignment?.options ?? []) {
      expect(usesMeasurementWording(option.label)).toBe(false);
    }
    // The state Analytics counts is drawn here as "Moving" — one word, one
    // predicate, on both surfaces.
    expect(
      alignment?.options.find((option) => option.value === "active")?.label,
    ).toBe("Moving");
    // Every alignment state is offered, so no state can quietly borrow another
    // vocabulary by being absent from this one.
    for (const state of GOAL_ALIGNMENT_STATES) {
      expect(alignment?.options.some((option) => option.value === state)).toBe(
        true,
      );
    }
  });

  it("leaves the measurement vocabulary owning its own words", () => {
    // The other half of the rule: alignment must not take the measurement
    // words, and measurement must not be renamed to alignment's. A genuine
    // measurement surface still says "On track".
    expect(GOAL_PROGRESS_STATUS_LABELS.on_track).toBe("On track");
    expect([...GOAL_MEASUREMENT_ON_TRACK_STATUSES]).toContain("on_track");
    for (const status of GOAL_MEASUREMENT_ON_TRACK_STATUSES) {
      expect(GOAL_PROGRESS_STATUS_LABELS[status]).not.toBe("Moving");
    }
  });
});
