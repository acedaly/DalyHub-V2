/**
 * UIX-05 — the ONE bounded projection behind the Analytics surface (server-only).
 *
 * Nothing in the Analytics module reads a repository except this file, and this
 * file adds NO repository, NO write, NO migration and no new kind of query to
 * the product. Every fact it works from already existed for something else:
 *
 *   - **completions**, current, previous and per bucket, come from
 *     `ReviewInsightRepository.countPeriodCompletions` — one grouped statement
 *     over the append-only Activity stream for however many windows are asked
 *     for, capped at `MAX_TREND_PERIODS`. The ranges in `analytics-range.ts` are
 *     bucketed to fit inside that cap by construction;
 *   - **where completed work landed** comes from `listPeriodContributions`, the
 *     same read the Review's distribution section uses, with the same documented
 *     approximation (ancestry through the CURRENT spine links);
 *   - **Goals on track** is AREA-03's own alignment evaluator over one bounded
 *     page of Goals, exactly as `review-insights-context.ts` composes it.
 *
 *   - **overdue at each bucket's close** (CONVERGE-01 §8) comes from
 *     `ReviewInsightRepository.countOverdueAtPeriodEnd` — one grouped statement
 *     over the two stored columns a live overdue check already reads, at past
 *     moments instead of at today. No new table, no migration, no per-bucket
 *     query.
 *
 * The query budget is therefore FLAT with respect to workspace size and does not
 * grow with the range: one bucketed series read, one totals read, one overdue
 * read, one contribution read, one Area page, one Goal page, one
 * Goal-contribution read and one alignment-facts read — eight grouped
 * statements, every time.
 *
 * Failure is SAID, not zeroed. A read that fails leaves its half of the model
 * `null`, and the evaluator turns that into "Not available" rather than into a
 * nought that would read as "you did nothing".
 */

import {
  evaluateAnalytics,
  previousSpan,
  rangeBuckets,
  rangeSpan,
  type AnalyticsAreaRow,
  type AnalyticsCompletionCounts,
  type AnalyticsModel,
  type AnalyticsRangeId,
  type AnalyticsSeriesPoint,
  type AnalyticsSpan,
} from "~/kernel/analytics";
import {
  composeGoalAlignmentFacts,
  evaluateGoalAlignment,
} from "~/kernel/alignment";
import { formatPreferenceDate, type DateFormat } from "~/kernel/preferences";
import type {
  PeriodCountRequest,
  ReviewPeriodWindow,
} from "~/kernel/review-insights";
import { InvalidSpineCursorError } from "~/kernel/spine";
import type { WorkspaceScope } from "~/platform/workspaces";
import { createOwnerAlignmentContext } from "~/shared/alignment";
import { ownerLocalToUtc } from "~/shared/datetime";

/**
 * The server-side bounds. Generous enough that a realistic workspace is
 * described completely, small enough that the payload never grows with it.
 */
export const ANALYTICS_LIMITS = {
  /** Rows in the "where did the completed work land" breakdown. */
  contributions: 60,
  /** Areas read for the distribution's titles and identity ranks. */
  areas: 24,
  /** Goals examined for the on-track tally, alignment-ranked. */
  goals: 40,
} as const;

/** Everything the Analytics route hands the browser. Fully JSON-safe. */
export interface AnalyticsPageData {
  readonly model: AnalyticsModel;
  readonly range: AnalyticsRangeId;
  /** The span, as the owner reads it — "5 August – 11 August 2026". */
  readonly rangeLabel: string;
  /** One label per bucket, in the same order as `model.buckets`. */
  readonly bucketLabels: readonly string[];
  /**
   * The same buckets, named for an AXIS — "5 Aug" rather than "5 August 2026".
   *
   * The first Analytics capture put the full label at both ends of the plot and
   * again in the readout beneath it, so a 260px-tall chart carried three lines of
   * date caption. The axis is decorative (the summary is the authoritative
   * reading of the same numbers), so it gets the short form and the summary keeps
   * the long one.
   */
  readonly bucketShortLabels: readonly string[];
  /** The last day of each bucket, `YYYY-MM-DD`, for the trend's time axis. */
  readonly bucketDates: readonly string[];
  readonly failed: boolean;
}

/** Turn an owner-calendar span into the half-open instant window a count needs. */
function toWindow(span: AnalyticsSpan, timezone: string): ReviewPeriodWindow {
  const start = ownerLocalToUtc(`${span.startIso}T00:00`, timezone);
  // The window is half-open and ends at the owner's local start of the day AFTER
  // the span's last day, so the last day is included in full.
  const endExclusiveIso = addOneDay(span.endIso);
  const end = ownerLocalToUtc(`${endExclusiveIso}T00:00`, timezone);
  return {
    periodStart: span.startIso,
    periodEnd: span.endIso,
    startInstantIso: (
      start ?? new Date(`${span.startIso}T00:00:00Z`)
    ).toISOString(),
    endInstantIso: (
      end ?? new Date(`${endExclusiveIso}T00:00:00Z`)
    ).toISOString(),
  };
}

function addOneDay(iso: string): string {
  const [y, m, d] = iso.split("-").map((part) => Number.parseInt(part, 10));
  return new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + 1))
    .toISOString()
    .slice(0, 10);
}

/** "5 August – 11 August 2026", in the owner's own date format. */
function spanLabel(span: AnalyticsSpan, dateFormat: DateFormat): string {
  const start = formatPreferenceDate(span.startIso, dateFormat);
  const end = formatPreferenceDate(span.endIso, dateFormat);
  return start === end ? start : `${start} – ${end}`;
}

/**
 * "5 Aug" — a bucket named for an axis rather than for a sentence.
 *
 * Deliberately NOT the owner's date-format preference: that preference governs
 * how a DATE is written where the date is the statement, and an axis tick is a
 * position rather than a statement. Every range's ticks are within a year of
 * today, so the year is the one part that can go.
 */
function axisLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map((part) => Number.parseInt(part, 10));
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)));
}

export interface AnalyticsContextInput {
  readonly scope: WorkspaceScope;
  readonly range: AnalyticsRangeId;
  readonly todayIso: string;
  readonly timezone: string;
  readonly dateFormat: DateFormat;
  readonly now: Date;
}

export async function loadAnalytics(
  input: AnalyticsContextInput,
): Promise<AnalyticsPageData> {
  const span = rangeSpan(input.range, input.todayIso);
  const buckets = rangeBuckets(input.range, span);
  const previous = previousSpan(span);

  /*
   * TWO grouped statements, and deliberately not one.
   *
   * Both the buckets and the two totals are just windows, so the obvious move is
   * to ask for all of them together — and it is wrong twice over. The aggregate
   * caps one call at `MAX_TREND_PERIODS` (8) windows, and seven daily buckets
   * plus two totals is nine. More importantly, the range total must NOT be the
   * sum of its buckets: the count is `DISTINCT` per record per window, so a Task
   * completed, reopened and completed again in two different buckets would be
   * counted twice by a sum and once by the whole-range window. The headline
   * figure is the one an owner reads, so it is asked for as its own window and
   * the buckets are only ever the SHAPE.
   *
   * Two statements, each one grouped scan, both flat with respect to workspace
   * size and to the length of the range.
   */
  const bucketRequests: PeriodCountRequest[] = buckets.map((bucket) => ({
    key: bucket.key,
    window: toWindow(bucket, input.timezone),
  }));
  const totalRequests: PeriodCountRequest[] = [
    { key: "current", window: toWindow(span, input.timezone) },
    { key: "previous", window: toWindow(previous, input.timezone) },
  ];

  /*
   * CONVERGE-01 §8 — the overdue series, as ONE more grouped statement.
   *
   * Every bucket's close, plus the close of the previous span, which is the
   * moment the metric card's comparison is against. That is `buckets.length + 1`
   * moments, and it fits inside `MAX_TREND_PERIODS` for every range in
   * `ANALYTICS_RANGES` by construction — 7+1, 4+1 and 6+1 against a cap of 8.
   * `test/unit/analytics/overdue-series.test.ts` asserts that rather than
   * leaving it as a coincidence, because the read SILENTLY slices at the cap and
   * a range added later without checking would quietly lose its oldest bucket.
   *
   * The previous-span close is asked for in the same call rather than as a
   * second statement, unlike the completion totals: overdue is a LEVEL read at a
   * moment, so there is no double-counting hazard to keep the totals away from
   * the buckets, and no reason to spend a second scan.
   */
  const PREVIOUS_OVERDUE_KEY = "previous";
  const overdueRequests: PeriodCountRequest[] = [
    ...buckets.map((bucket) => ({
      key: bucket.key,
      window: toWindow(bucket, input.timezone),
    })),
    {
      key: PREVIOUS_OVERDUE_KEY,
      window: toWindow(previous, input.timezone),
    },
  ];

  let series: AnalyticsSeriesPoint[] = [];
  let current: AnalyticsCompletionCounts | null = null;
  let previousCounts: AnalyticsCompletionCounts | null = null;
  let failed = false;
  try {
    const [bucketRows, totalRows] = await Promise.all([
      input.scope.reviewInsights.countPeriodCompletions(bucketRequests),
      input.scope.reviewInsights.countPeriodCompletions(totalRequests),
    ]);
    const byKey = new Map(
      [...bucketRows, ...totalRows].map((row) => [row.key, row]),
    );
    series = buckets.map((bucket) => {
      const row = byKey.get(bucket.key);
      return {
        key: bucket.key,
        tasksCompleted: row?.tasksCompleted ?? 0,
        projectsCompleted: row?.projectsCompleted ?? 0,
        goalsCompleted: row?.goalsCompleted ?? 0,
      };
    });
    const currentRow = byKey.get("current");
    const previousRow = byKey.get("previous");
    current = currentRow
      ? {
          tasksCompleted: currentRow.tasksCompleted,
          projectsCompleted: currentRow.projectsCompleted,
          goalsCompleted: currentRow.goalsCompleted,
        }
      : null;
    previousCounts = previousRow
      ? {
          tasksCompleted: previousRow.tasksCompleted,
          projectsCompleted: previousRow.projectsCompleted,
          goalsCompleted: previousRow.goalsCompleted,
        }
      : null;
  } catch {
    failed = true;
  }

  const [areas, goals, overdue] = await Promise.all([
    readDistribution(input, span),
    readGoalTally(input),
    readOverdue(input, overdueRequests, PREVIOUS_OVERDUE_KEY),
  ]);

  const model = evaluateAnalytics({
    range: input.range,
    // V2.7 RECALL-02 — the window the range TOTAL was counted over, carried
    // through so the "Tasks completed" metric links to exactly those days.
    span,
    buckets,
    current,
    previous: previousCounts,
    series,
    areas: areas.rows,
    areasBounded: areas.bounded,
    areasAvailable: areas.available,
    goals,
    overdueSeries: buckets.map((bucket) => ({
      key: bucket.key,
      overdue: overdue.byKey.get(bucket.key) ?? 0,
    })),
    overduePrevious: overdue.previous,
    overdueAvailable: overdue.available,
  });

  return {
    model,
    range: input.range,
    rangeLabel: spanLabel(span, input.dateFormat),
    bucketLabels: buckets.map((bucket) => spanLabel(bucket, input.dateFormat)),
    bucketShortLabels: buckets.map((bucket) => axisLabel(bucket.endIso)),
    bucketDates: buckets.map((bucket) => bucket.endIso),
    failed,
  };
}

/**
 * CONVERGE-01 §8 — the backlog at each requested moment.
 *
 * One grouped statement over the same tasks a live overdue check reads; no new
 * table, no migration and no per-bucket query. A failure leaves `available`
 * false, so the surface says "not available" rather than drawing a flat line at
 * zero and telling the owner their backlog is clear.
 */
async function readOverdue(
  input: AnalyticsContextInput,
  requests: readonly PeriodCountRequest[],
  previousKey: string,
): Promise<{
  byKey: Map<string, number>;
  previous: number | null;
  available: boolean;
}> {
  try {
    const rows =
      await input.scope.reviewInsights.countOverdueAtPeriodEnd(requests);
    const byKey = new Map(rows.map((row) => [row.key, row.overdue]));
    return {
      byKey,
      previous: byKey.get(previousKey) ?? null,
      available: true,
    };
  } catch {
    return { byKey: new Map(), previous: null, available: false };
  }
}

/**
 * Where the range's completed Tasks landed, joined to the Areas' own identity
 * ranks so the distribution bars take each Area's colour — the same rank a
 * Project's mark and an Area's row already use (ADR-068 §5), never a second
 * colour decision.
 *
 * An Area the contribution read names but the bounded Area page does not reach
 * keeps its title from the contribution row and gets the neutral bar, which is
 * the honest outcome: the count is real, the colour would be a guess.
 */
async function readDistribution(
  input: AnalyticsContextInput,
  span: AnalyticsSpan,
): Promise<{
  rows: AnalyticsAreaRow[];
  bounded: boolean;
  available: boolean;
}> {
  try {
    const [contributions, areaPage] = await Promise.all([
      input.scope.reviewInsights.listPeriodContributions(
        toWindow(span, input.timezone),
        ANALYTICS_LIMITS.contributions,
      ),
      input.scope.areas.listAreas({ limit: ANALYTICS_LIMITS.areas }),
    ]);
    const ranks = new Map(
      areaPage.items.map((area) => [area.id, area.colourRank]),
    );
    const totals = new Map<string, { title: string; tasks: number }>();
    for (const row of contributions) {
      if (row.areaId === null) continue;
      const existing = totals.get(row.areaId);
      totals.set(row.areaId, {
        title: existing?.title ?? row.areaTitle ?? "Untitled Area",
        tasks: (existing?.tasks ?? 0) + row.tasksCompleted,
      });
    }
    return {
      rows: [...totals].map(([areaId, entry]) => ({
        areaId,
        title: entry.title,
        tasksCompleted: entry.tasks,
        colourRank: ranks.get(areaId) ?? null,
      })),
      bounded: contributions.length >= ANALYTICS_LIMITS.contributions,
      available: true,
    };
  } catch {
    /*
     * The distribution is one panel; losing it must not lose the page — but it
     * must not look like an ANSWER either. An empty array is what a period with
     * no attributed work looks like, and the panel's copy for that case is a
     * claim ("none of this period's completed work rolled up to an Area"). The
     * flag is what lets the panel say "not available" instead.
     */
    return { rows: [], bounded: false, available: false };
  }
}

/**
 * The Goal tally, from AREA-03's evaluator over one bounded, alignment-ranked
 * page of Goals — never a second Goal-health model, and never a count invented
 * in SQL.
 *
 * "On track" is the alignment evaluator's `active` state: a Goal with
 * contributing work recorded inside the recent window. `completed` Goals are
 * excluded from BOTH halves of the fraction, because "4 of 12 on track" reading
 * as an indictment when eight of the twelve are finished would be the surface
 * lying by omission.
 */
async function readGoalTally(
  input: AnalyticsContextInput,
): Promise<{ onTrack: number; total: number; bounded: boolean } | null> {
  try {
    const { evaluation, recentWindowStartIso, recentBoundaryStartIso } =
      createOwnerAlignmentContext(input.now, input.timezone);

    let goalPage;
    try {
      /*
       * `limit + 1`, so the read can TELL whether it hit its bound.
       *
       * Asking for exactly the limit makes a full page and a workspace of
       * exactly that many Goals indistinguishable, and the difference matters:
       * the alignment ordering decides which Goals enter a bounded page, so on a
       * larger workspace both the numerator and the denominator would describe a
       * subset while the tile read as a workspace total. One extra row is the
       * cheapest possible way to know. (`review-insights-context.ts` does the
       * same thing for the same reason.)
       */
      goalPage = await input.scope.goals.listGoalsByAlignment({
        limit: ANALYTICS_LIMITS.goals + 1,
        activeBoundaryIso: recentBoundaryStartIso,
      });
    } catch (error) {
      if (!(error instanceof InvalidSpineCursorError)) throw error;
      goalPage = await input.scope.goals.listGoalsByAlignment({
        activeBoundaryIso: recentBoundaryStartIso,
      });
    }

    const bounded = goalPage.items.length > ANALYTICS_LIMITS.goals;
    const goalItems = goalPage.items.slice(0, ANALYTICS_LIMITS.goals);
    const goalIds = goalItems.map((goal) => goal.id);
    const [contributions, activity] = await Promise.all([
      input.scope.goals.listGoalProjectContributions(goalIds),
      input.scope.alignment.listGoalAlignmentFacts(goalIds, {
        recentWindowStartIso,
      }),
    ]);

    let onTrack = 0;
    let total = 0;
    for (const goal of goalItems) {
      const alignment = evaluateGoalAlignment(
        composeGoalAlignmentFacts({
          goalId: goal.id,
          completedAt: goal.completedAt,
          contribution: contributions.get(goal.id) ?? {
            total: 0,
            completed: 0,
            incomplete: 0,
            active: 0,
            planned: 0,
            onHold: 0,
            archived: 0,
          },
          activity: activity.get(goal.id),
        }),
        evaluation,
      );
      if (alignment.state === "completed") continue;
      total += 1;
      if (alignment.state === "active") onTrack += 1;
    }
    return { onTrack, total, bounded };
  } catch {
    return null;
  }
}
