import { describe, expect, it } from "vitest";

import {
  ANALYTICS_RANGES,
  MAX_DISTRIBUTION_ROWS,
  analyticsRange,
  deltaSentence,
  evaluateAnalytics,
  parseAnalyticsRange,
  previousSpan,
  rangeBuckets,
  rangeSpan,
  type AnalyticsFacts,
} from "~/kernel/analytics";

/** `MAX_TREND_PERIODS` — the aggregate's per-call window cap. The page asks for
 * its buckets in one call and its two totals in another, so each must fit. */
const MAX_WINDOWS_PER_READ = 8;

function facts(over: Partial<AnalyticsFacts> = {}): AnalyticsFacts {
  const span = rangeSpan("week", "2026-08-10");
  return {
    range: "week",
    buckets: rangeBuckets("week", span),
    current: { tasksCompleted: 24, projectsCompleted: 3, goalsCompleted: 0 },
    previous: { tasksCompleted: 18, projectsCompleted: 4, goalsCompleted: 0 },
    series: rangeBuckets("week", span).map((bucket, index) => ({
      key: bucket.key,
      tasksCompleted: index,
      projectsCompleted: 0,
      goalsCompleted: 0,
    })),
    areas: [],
    areasBounded: false,
    areasAvailable: true,
    goals: { onTrack: 5, total: 9, bounded: false },
    overdueSeries: rangeBuckets("week", span).map((bucket, index) => ({
      key: bucket.key,
      overdue: 10 + index,
    })),
    overduePrevious: 12,
    overdueAvailable: true,
    ...over,
  };
}

const BUCKET_KEYS = rangeBuckets("week", rangeSpan("week", "2026-08-10")).map(
  (bucket) => bucket.key,
);

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

describe("analytics ranges", () => {
  it("defaults an unknown range to the week", () => {
    expect(parseAnalyticsRange(null)).toBe("week");
    expect(parseAnalyticsRange("decade")).toBe("week");
    expect(parseAnalyticsRange("quarter")).toBe("quarter");
  });

  it("spans end on today, so no figure counts a day that has not happened", () => {
    expect(rangeSpan("week", "2026-08-10")).toEqual({
      startIso: "2026-08-04",
      endIso: "2026-08-10",
    });
  });

  it("compares against an equally long span with no gap and no overlap", () => {
    const span = rangeSpan("week", "2026-08-10");
    expect(previousSpan(span)).toEqual({
      startIso: "2026-07-28",
      endIso: "2026-08-03",
    });
  });

  // The series is one grouped statement, and that statement is capped.
  it("keeps every range inside the aggregate's window cap", () => {
    for (const range of ANALYTICS_RANGES) {
      const span = rangeSpan(range.id, "2026-08-10");
      const buckets = rangeBuckets(range.id, span);
      expect(buckets.length).toBeGreaterThanOrEqual(2);
      expect(buckets.length).toBeLessThanOrEqual(MAX_WINDOWS_PER_READ);
    }
  });

  // Every day of the span is covered exactly once, with no gap and no overlap.
  it("tiles the span with no gap and no overlap", () => {
    for (const range of ANALYTICS_RANGES) {
      const span = rangeSpan(range.id, "2026-08-10");
      const buckets = rangeBuckets(range.id, span);
      expect(buckets[0].startIso).toBe(span.startIso);
      expect(buckets[buckets.length - 1].endIso).toBe(span.endIso);
      for (let index = 1; index < buckets.length; index += 1) {
        const previousEnd = new Date(
          `${buckets[index - 1].endIso}T00:00:00Z`,
        ).getTime();
        const start = new Date(
          `${buckets[index].startIso}T00:00:00Z`,
        ).getTime();
        expect(Math.round((start - previousEnd) / 86_400_000)).toBe(1);
      }
    }
  });

  it("lays buckets out backward, so the most recent one is always whole", () => {
    const span = rangeSpan("quarter", "2026-08-10");
    const buckets = rangeBuckets("quarter", span);
    const { bucketDays } = analyticsRange("quarter");
    const last = buckets[buckets.length - 1];
    expect(last.endIso).toBe("2026-08-10");
    // The most recent bucket covers its full width…
    const lastStart = new Date(`${last.startIso}T00:00:00Z`).getTime();
    const lastEnd = new Date(`${last.endIso}T00:00:00Z`).getTime();
    expect(Math.round((lastEnd - lastStart) / 86_400_000) + 1).toBe(bucketDays);
    // …and the whole span is covered, oldest bucket first.
    expect(buckets[0].startIso).toBe(span.startIso);
  });

  it("clamps the oldest bucket to the span rather than counting outside it", () => {
    // 10 days into 4-day buckets: three whole and one two-day remainder.
    const span = { startIso: "2026-08-01", endIso: "2026-08-10" };
    const buckets = rangeBuckets("week", span);
    expect(buckets[0].startIso).toBe("2026-08-01");
    expect(buckets[buckets.length - 1].endIso).toBe("2026-08-10");
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

  it("marks Goals on track as a state, with no comparison at all", () => {
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
      facts({ goals: { onTrack: 12, total: 40, bounded: true } }),
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
   * The read SILENTLY slices at `MAX_TREND_PERIODS`, so a range whose buckets
   * plus the previous-period close exceed the cap would quietly lose its oldest
   * reading and draw a shorter line with no indication that it had. The loader
   * asks for `buckets.length + 1` moments in one call, so every range has to fit
   * with one to spare — this is the assertion that makes adding a fourth range a
   * deliberate act rather than a silent truncation.
   */
  it("leaves room for the previous-period reading in every range", () => {
    for (const range of ANALYTICS_RANGES) {
      const span = rangeSpan(range.id, "2026-08-10");
      const buckets = rangeBuckets(range.id, span);
      expect(buckets.length + 1).toBeLessThanOrEqual(MAX_WINDOWS_PER_READ);
    }
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
