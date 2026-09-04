import { describe, expect, it } from "vitest";

import {
  INSIGHT_WINDOWS,
  MAX_DISTRIBUTION_ROWS,
  allowedGrains,
  deltaSentence,
  evaluateAnalytics,
  insightWindowDays,
  previousSpan,
  type AnalyticsBucket,
  type AnalyticsFacts,
} from "~/kernel/analytics";
import { requestedBucketCount } from "~/kernel/history";
import { MAX_OVERDUE_MOMENTS } from "~/kernel/review-insights";

const TODAY = "2026-08-10";

/**
 * The seven daily buckets of the "7 days" window, as `bucketWindow` cuts them
 * — spelled out rather than derived, because these tests are about the
 * EVALUATOR and a fixture that recomputed the bucketer would test it twice.
 */
const WEEK_SPAN = insightWindowDays("this-week", TODAY);
const WEEK_BUCKETS: readonly AnalyticsBucket[] = Array.from(
  { length: 7 },
  (_value, index) => {
    const day = new Date(`${WEEK_SPAN.startIso}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() + index);
    const iso = day.toISOString().slice(0, 10);
    return { key: `b${index}`, startIso: iso, endIso: iso };
  },
);

function facts(over: Partial<AnalyticsFacts> = {}): AnalyticsFacts {
  return {
    window: "this-week",
    grain: "day",
    span: WEEK_SPAN,
    buckets: WEEK_BUCKETS,
    current: { tasksCompleted: 24, projectsCompleted: 3, goalsCompleted: 0 },
    previous: { tasksCompleted: 18, projectsCompleted: 4, goalsCompleted: 0 },
    series: WEEK_BUCKETS.map((bucket, index) => ({
      key: bucket.key,
      tasksCompleted: index,
      projectsCompleted: 0,
      goalsCompleted: 0,
    })),
    areas: [],
    areasBounded: false,
    areasAvailable: true,
    goals: { moving: 5, total: 9, bounded: false },
    overdueSeries: WEEK_BUCKETS.map((bucket, index) => ({
      key: bucket.key,
      overdue: 10 + index,
    })),
    overduePrevious: 12,
    overdueAvailable: true,
    measuredGoals: [],
    measuredGoalsBounded: false,
    measuredGoalsAvailable: true,
    goalContributions: [],
    seriesBounded: false,
    seriesBound: null,
    overdueMoments: 0,
    ...over,
  };
}

const BUCKET_KEYS = WEEK_BUCKETS.map((bucket) => bucket.key);

/**
 * A range in which nothing at all happened — no completions, no attributed work
 * and, unless a test says otherwise, no backlog either. Named because four tests
 * need exactly this shape and each one spelling it out again is how a fixture
 * drifts.
 */
function quietPeriod(over: Partial<AnalyticsFacts> = {}): AnalyticsFacts {
  return facts({
    current: { tasksCompleted: 0, projectsCompleted: 0, goalsCompleted: 0 },
    previous: { tasksCompleted: 0, projectsCompleted: 0, goalsCompleted: 0 },
    areas: [],
    overdueSeries: BUCKET_KEYS.map((key) => ({ key, overdue: 0 })),
    overduePrevious: 0,
    ...over,
  });
}

/*
 * V2.9 INS-03 — the BUCKET rules moved.
 *
 * "Spans end on today", "tiles the span with no gap or overlap", "lays buckets
 * out backward so the most recent is whole" and "clamps the oldest bucket" are
 * now the history kernel's, and are asserted over its own fixtures in
 * `test/unit/history/history-grain.test.ts` — where they also cover month ends,
 * a leap day, a DST changeover and the stated maximums, none of which the old
 * three-preset bucketer could express. The WINDOW vocabulary's rules (defaulting
 * an unknown value, which grains a window can hold, and the refusal of one it
 * cannot) are in `test/unit/analytics/insight-range.test.ts`.
 *
 * What stays here is what belongs to this file: the previous-period span the
 * evaluator compares against, and the bound the page must state.
 */
describe("the comparison span", () => {
  it("compares against an equally long span with no gap and no overlap", () => {
    expect(previousSpan(WEEK_SPAN)).toEqual({
      startIso: "2026-07-28",
      endIso: "2026-08-03",
    });
  });

  it("stays equally long for a window measured in months", () => {
    const span = insightWindowDays("6-months", TODAY);
    const before = previousSpan(span);
    const days = (from: string, to: string) =>
      Math.round(
        (new Date(`${to}T00:00:00Z`).getTime() -
          new Date(`${from}T00:00:00Z`).getTime()) /
          86_400_000,
      );
    expect(days(before.startIso, before.endIso)).toBe(
      days(span.startIso, span.endIso),
    );
    // No gap and no overlap: the previous span ends the day before this one.
    expect(days(before.endIso, span.startIso)).toBe(1);
  });
});

describe("a bound the page applied is a bound the page says", () => {
  it("says the grain's maximum shortened the window, and how", () => {
    const model = evaluateAnalytics(
      facts({ seriesBounded: true, seriesBound: 52, grain: "week" }),
    );
    expect(
      model.notes.some(
        (note) => note.includes("52 weeks") && note.includes("coarser grain"),
      ),
    ).toBe(true);
  });

  it("says when the overdue level was read at fewer moments than there are buckets", () => {
    const model = evaluateAnalytics(facts({ overdueMoments: 40 }));
    expect(
      model.notes.some((note) => note.includes("40") && note.includes("level")),
    ).toBe(true);
  });

  it("says nothing about a bound that did not apply", () => {
    const model = evaluateAnalytics(facts());
    expect(
      model.notes.some(
        (note) => note.includes("coarser grain") || note.includes("a level"),
      ),
    ).toBe(false);
  });
});

describe("analytics evaluator", () => {
  it("states a comparison as a checkable sentence, never a percentage", () => {
    const model = evaluateAnalytics(facts());
    const tasks = model.metrics.find((metric) => metric.id === "tasks");
    expect(tasks?.value).toBe(24);
    expect(tasks?.supporting).toBe("6 more than the previous period (18)");
  });

  it("says fewer, rather than a negative number", () => {
    const model = evaluateAnalytics(facts());
    const projects = model.metrics.find((metric) => metric.id === "projects");
    expect(projects?.supporting).toBe("1 fewer than the previous period (4)");
  });

  // "+100%" from a base of zero is arithmetic pretending to be information.
  it("refuses a comparison against an empty previous period", () => {
    const model = evaluateAnalytics(
      facts({
        previous: {
          tasksCompleted: 0,
          projectsCompleted: 0,
          goalsCompleted: 0,
        },
      }),
    );
    const tasks = model.metrics.find((metric) => metric.id === "tasks");
    expect(tasks?.delta).toEqual({ kind: "no_basis", previous: 0 });
    expect(tasks?.supporting).toBe("No Tasks in the previous period");
  });

  it("says a read failed rather than reporting nought", () => {
    const model = evaluateAnalytics(
      facts({ current: null, previous: null, goals: null }),
    );
    expect(model.degraded).toBe(true);
    expect(model.isEmpty).toBe(false);
    expect(
      model.metrics.find((metric) => metric.id === "tasks")?.value,
    ).toBeNull();
    expect(
      model.metrics.find((metric) => metric.id === "tasks")?.supporting,
    ).toBe("Comparison not available");
  });

  it("marks Goals moving as a state, with no comparison at all", () => {
    const model = evaluateAnalytics(facts());
    const goals = model.metrics.find((metric) => metric.id === "goals");
    expect(goals?.value).toBe(5);
    expect(goals?.delta).toBeNull();
    expect(goals?.supporting).toBe("of 9 Goals, right now");
  });

  it("links every figure to the records behind it", () => {
    const model = evaluateAnalytics(facts());
    for (const metric of model.metrics) {
      expect(metric.to).toBeTruthy();
    }
  });

  it("ranks the distribution by completed work and states each share", () => {
    const model = evaluateAnalytics(
      facts({
        areas: [
          { areaId: "a1", title: "Work", tasksCompleted: 6, colourRank: 0 },
          { areaId: "a2", title: "Health", tasksCompleted: 14, colourRank: 2 },
        ],
      }),
    );
    expect(model.distribution.map((row) => row.title)).toEqual([
      "Health",
      "Work",
    ]);
    expect(model.distribution[0].percent).toBe(70);
    expect(model.distributionTotal).toBe(20);
    // The attribution approximation is stated, not hidden.
    expect(model.notes.some((note) => note.includes("belongs to today"))).toBe(
      true,
    );
  });

  it("says how many Areas it stopped listing rather than truncating silently", () => {
    const many = Array.from({ length: MAX_DISTRIBUTION_ROWS + 3 }, (_, i) => ({
      areaId: `a${i}`,
      title: `Area ${i}`,
      tasksCompleted: 20 - i,
      colourRank: i % 6,
    }));
    const model = evaluateAnalytics(facts({ areas: many }));
    expect(model.distribution).toHaveLength(MAX_DISTRIBUTION_ROWS);
    expect(model.notes.some((note) => note.includes("3 more"))).toBe(true);
  });

  it("reports ONE empty state when nothing was completed at all", () => {
    const model = evaluateAnalytics(quietPeriod());
    expect(model.isEmpty).toBe(true);
    expect(model.degraded).toBe(false);
  });

  // CONVERGE-01 §8 — a backlog is not nothing. The empty state replaces the
  // WHOLE surface, so producing it for a period with no completions and an
  // overdue backlog would hide the most important thing this screen can say.
  it("is NOT empty when nothing was completed but work is overdue", () => {
    const model = evaluateAnalytics(
      quietPeriod({
        overdueSeries: BUCKET_KEYS.map((key) => ({ key, overdue: 7 })),
      }),
    );
    expect(model.isEmpty).toBe(false);
    expect(model.degraded).toBe(false);
    expect(model.metrics.find((metric) => metric.id === "overdue")?.value).toBe(
      7,
    );
  });

  // Codex review, PR #156 — a bounded Goal read must not read as a workspace
  // total: the alignment ordering decides which Goals enter the page, so both
  // halves of the fraction describe a subset the reader cannot see.
  it("says the Goal tally is bounded, in the sentence and in a note", () => {
    const model = evaluateAnalytics(
      facts({ goals: { moving: 12, total: 40, bounded: true } }),
    );
    const goals = model.metrics.find((metric) => metric.id === "goals");
    expect(goals?.supporting).toBe("of the 40 Goals read, right now");
    expect(
      model.notes.some((note) => note.includes("not every Goal in the")),
    ).toBe(true);
  });

  it("states an unbounded Goal tally plainly", () => {
    const model = evaluateAnalytics(facts());
    expect(
      model.metrics.find((metric) => metric.id === "goals")?.supporting,
    ).toBe("of 9 Goals, right now");
    expect(
      model.notes.some((note) => note.includes("not every Goal in the")),
    ).toBe(false);
  });

  // Codex review, PR #156 — a failed distribution read and an empty period are
  // the same empty array and must never be the same statement.
  it("distinguishes a failed distribution read from a period with no attributed work", () => {
    const failedRead = evaluateAnalytics(facts({ areasAvailable: false }));
    expect(failedRead.distributionAvailable).toBe(false);
    expect(failedRead.degraded).toBe(true);
    // …and it must not be able to produce the empty state, which asserts a fact.
    expect(failedRead.isEmpty).toBe(false);

    const genuinelyEmpty = evaluateAnalytics(quietPeriod());
    expect(genuinelyEmpty.distributionAvailable).toBe(true);
    expect(genuinelyEmpty.isEmpty).toBe(true);
  });

  it("never invents a productivity score", () => {
    const model = evaluateAnalytics(facts());
    expect(model.metrics.map((metric) => metric.id)).toEqual([
      "tasks",
      "projects",
      "goals",
      "overdue",
      "areas",
    ]);
  });

  it("names the unchanged case rather than showing a zero delta", () => {
    expect(
      deltaSentence({ kind: "change", previous: 7, difference: 0 }, "Tasks"),
    ).toBe("Same as the previous period (7)");
  });
});

/* -------------------------------------------------------------------------- */
/* CONVERGE-01 §8 — the overdue metric                                         */
/* -------------------------------------------------------------------------- */

describe("the overdue metric", () => {
  /*
   * V2.9 INS-03 — the overdue LEVEL read is the one bound V2.9 could not lift.
   *
   * Each moment costs its own `SUM(CASE …)` column, so `MAX_OVERDUE_MOMENTS`
   * caps how many a window can ask for, and windows now go out to 24 months.
   * The old assertion was that every range FITS; that is no longer true and
   * pretending it is would be the silent truncation it was written to prevent.
   *
   * The invariant that replaced it has two halves. Whatever the window and
   * grain, the loader's request — the moments it keeps, plus the previous
   * span's close — fits inside the cap. And where the cap bites, the count it
   * fell back to is REPORTED, so the page can say the line is the most recent
   * N readings rather than one per bucket.
   */
  it("fits the overdue read, and reports the bound wherever it bites", () => {
    let anyBound = false;
    for (const window of INSIGHT_WINDOWS) {
      const span = insightWindowDays(window.id, TODAY);
      for (const grain of allowedGrains(window.id, TODAY)) {
        const wanted = requestedBucketCount(
          {
            periodStart: span.startIso,
            periodEnd: span.endIso,
            startInstantIso: "",
            endInstantIso: "",
          },
          grain,
        );
        // What the loader actually asks for: the most recent moments, plus
        // the previous span's close, in ONE statement.
        const kept = Math.min(wanted, MAX_OVERDUE_MOMENTS - 1);
        expect(kept + 1).toBeLessThanOrEqual(MAX_OVERDUE_MOMENTS);

        // The loader's own rule for `overdueMoments`: zero when every bucket
        // got a reading, the kept count when it did not.
        const reported = kept < wanted ? kept : 0;
        if (kept < wanted) {
          anyBound = true;
          expect(reported).toBeGreaterThan(0);
          // …and stating it is what turns a bound into a fact on the page.
          const model = evaluateAnalytics(
            facts({ window: window.id, grain, overdueMoments: reported }),
          );
          expect(model.notes.join(" ")).toContain(String(reported));
        }
      }
    }
    // A guard on the guard: if no window/grain pair can reach the cap any more,
    // the loop above proves nothing and the bound wording is dead code.
    expect(anyBound).toBe(true);
  });

  it("takes its headline figure from the LAST bucket, so card and chart agree", () => {
    const model = evaluateAnalytics(
      facts({
        overdueSeries: BUCKET_KEYS.map((key, index) => ({
          key,
          overdue: index * 2,
        })),
      }),
    );
    const overdue = model.metrics.find((metric) => metric.id === "overdue");
    const lastReading =
      model.overdueSeries[model.overdueSeries.length - 1]?.overdue;
    expect(overdue?.value).toBe(lastReading);
    expect(overdue?.value).toBe((BUCKET_KEYS.length - 1) * 2);
  });

  it("states a fall in the row's own calm wording", () => {
    const model = evaluateAnalytics(
      facts({
        overdueSeries: BUCKET_KEYS.map((key) => ({ key, overdue: 8 })),
        overduePrevious: 12,
      }),
    );
    expect(
      model.metrics.find((metric) => metric.id === "overdue")?.supporting,
    ).toBe("4 fewer than the previous period (12)");
  });

  it("states a rise in the same wording, with no escalation", () => {
    const model = evaluateAnalytics(
      facts({
        overdueSeries: BUCKET_KEYS.map((key) => ({ key, overdue: 16 })),
        overduePrevious: 12,
      }),
    );
    expect(
      model.metrics.find((metric) => metric.id === "overdue")?.supporting,
    ).toBe("4 more than the previous period (12)");
  });

  /*
   * The shared `no_basis` phrasing is about a PERIOD ("No Tasks in the previous
   * period"); this reading is about a MOMENT. Saying nothing was overdue DURING
   * the previous period is a different — and false — claim.
   */
  it("words a clean previous period as a moment, not as a span", () => {
    const model = evaluateAnalytics(
      facts({
        overdueSeries: BUCKET_KEYS.map((key) => ({ key, overdue: 3 })),
        overduePrevious: 0,
      }),
    );
    expect(
      model.metrics.find((metric) => metric.id === "overdue")?.supporting,
    ).toBe("Nothing was overdue at the end of the previous period");
  });

  it("links to the product's own Overdue view rather than a second definition", () => {
    const model = evaluateAnalytics(facts());
    expect(model.metrics.find((metric) => metric.id === "overdue")?.to).toBe(
      "/tasks?system=overdue",
    );
  });

  /*
   * A failed read and a clear backlog are the same absence of rows, and "nothing
   * is overdue" is the most reassuring thing this screen can say — which is
   * exactly why it must never be said because a query fell over.
   */
  it("says a failed read rather than reporting a clear backlog", () => {
    const model = evaluateAnalytics(
      facts({
        overdueSeries: [],
        overduePrevious: null,
        overdueAvailable: false,
      }),
    );
    const overdue = model.metrics.find((metric) => metric.id === "overdue");
    expect(overdue?.value).toBeNull();
    expect(overdue?.supporting).toBe("Comparison not available");
    expect(model.degraded).toBe(true);
    expect(model.isEmpty).toBe(false);
    expect(model.overdueAvailable).toBe(false);
  });

  it("states the history's approximation once a past reading is drawn", () => {
    const model = evaluateAnalytics(facts());
    expect(
      model.notes.some((note) => note.includes("due date as it stands today")),
    ).toBe(true);
  });

  it("qualifies nothing when there is no history to qualify", () => {
    const model = evaluateAnalytics(
      facts({ overdueSeries: [{ key: "b0", overdue: 4 }] }),
    );
    expect(
      model.notes.some((note) => note.includes("due date as it stands today")),
    ).toBe(false);
  });
});
