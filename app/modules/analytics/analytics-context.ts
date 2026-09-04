/**
 * UIX-05 — the ONE bounded projection behind the Analytics surface (server-only).
 *
 * Nothing in the Analytics module reads a repository except this file, and this
 * file adds NO repository, NO write, NO migration and no new kind of query to
 * the product. Every fact it works from already existed for something else:
 *
 *   - **Tasks completed**, current, previous and per bucket, come from
 *     `TaskRepository.countCompletedTasksInWindows` — one statement over
 *     `spine_records.completed_at`, the one completion-time authority (ADR-114
 *     decision 4), under exactly the predicate the Completed collection
 *     applies. V2.7 RECALL-02 moved it here from the Activity stream so the
 *     figure's LINK is its evidence: the card says N and the list it opens
 *     holds N, through a reopen and through a deletion alike;
 *   - **Projects and Goals completed**, current and previous, come from
 *     `ReviewInsightRepository.countPeriodCompletions` — one grouped statement
 *     over the append-only Activity stream, deliberately immutable for past
 *     periods (HARDEN-06C F-07). Neither has a bucketed line to draw, so
 *     neither is asked for per bucket;
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
 * grow with the range: one completed-window read, one totals read, one overdue
 * read, one contribution read, one Area page, one Goal page, one
 * Goal-contribution read and one alignment-facts read — eight grouped
 * statements, every time. RECALL-02 changed WHICH authority the first of those
 * reads, never how many there are.
 *
 * Failure is SAID, not zeroed. A read that fails leaves its half of the model
 * `null`, and the evaluator turns that into "Not available" rather than into a
 * nought that would read as "you did nothing".
 */

import {
  allowedGrains,
  evaluateAnalytics,
  insightWindowDays,
  previousSpan,
  type AnalyticsAreaRow,
  type AnalyticsBucket,
  type AnalyticsCompletionCounts,
  type AnalyticsGoalSeries,
  type AnalyticsModel,
  type AnalyticsSeriesPoint,
  type AnalyticsSpan,
  type InsightWindowId,
} from "~/kernel/analytics";
import {
  bucketWindow,
  buildActivityWindow,
  type Grain,
} from "~/kernel/history";
import {
  MAX_OVERDUE_MOMENTS,
  MAX_TREND_PERIODS,
  readAcrossReviews,
} from "~/kernel/review-insights";
import { GOAL_COMPLETED, PROJECT_COMPLETED } from "~/kernel/spine";
import {
  composeGoalAlignmentFacts,
  evaluateGoalAlignment,
} from "~/kernel/alignment";
import { formatPreferenceDate, type DateFormat } from "~/kernel/preferences";
import type {
  GoalContributionAcrossReviews,
  PeriodCountRequest,
  ReviewPeriodWindow,
} from "~/kernel/review-insights";
import type { CompletedTaskWindow } from "~/kernel/tasks";
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
  /**
   * V2.9 INS-03 — readings per Goal in the compact series.
   *
   * A display bound as much as a query bound: a card-sized sparkline resolves
   * nothing beyond a couple of dozen points, and the bound is stated on the
   * page rather than applied in silence.
   */
  goalSeriesPoints: 24,
} as const;

/**
 * V2.9 INS-03 — what one Insight page load costs, in D1 statements.
 *
 * Declared here and asserted against the real database in
 * `test/kernel/ins-03-insight-range.test.ts`, so a read added to this loader
 * has to move a number a reviewer can see rather than arriving unnoticed. The
 * same discipline `REVIEW_INSIGHTS_QUERY_BUDGET` keeps for the Review.
 *
 * The property that matters is not the number but its FLATNESS: 24 months at
 * month grain costs exactly what 7 days at day grain costs, because every
 * windowed read on this page is one grouped statement whose shape is
 * independent of the window (DEBT-239). A budget that grew with the window
 * would mean a bucketed read had gone back to a column per bucket.
 */
export const ANALYTICS_QUERY_BUDGET = 8;

/** Everything the Analytics route hands the browser. Fully JSON-safe. */
export interface AnalyticsPageData {
  readonly model: AnalyticsModel;
  /** V2.9 INS-03 — the window and grain the page is showing, for its controls. */
  readonly window: InsightWindowId;
  readonly grain: Grain;
  /** Which grains this window can be read at, so the control offers only those. */
  readonly grains: readonly Grain[];
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

/**
 * V2.7 RECALL-02 — the same half-open owner-day window, in the shape the Task
 * repository's completion count takes.
 *
 * Deliberately built from {@link toWindow} rather than beside it: the Analytics
 * period and the completed-time window MUST be the same two instants, and one
 * conversion is the only way to keep them so.
 */
function toCompletedWindow(
  key: string,
  span: AnalyticsSpan,
  timezone: string,
): CompletedTaskWindow {
  const window = toWindow(span, timezone);
  return {
    key,
    startsAt: new Date(window.startInstantIso),
    endsAt: new Date(window.endInstantIso),
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
  /** V2.9 INS-03 — the named window the owner chose. */
  readonly window: InsightWindowId;
  /** The grain to cut it at; already narrowed to one the window can hold. */
  readonly grain: Grain;
  readonly todayIso: string;
  readonly timezone: string;
  readonly dateFormat: DateFormat;
  readonly now: Date;
}

export async function loadAnalytics(
  input: AnalyticsContextInput,
): Promise<AnalyticsPageData> {
  const startOfOwnerDay = (dayIso: string) =>
    ownerLocalToUtc(`${dayIso}T00:00`, input.timezone);
  const span = insightWindowDays(input.window, input.todayIso);
  /*
   * V2.9 INS-03 — the buckets come from the HISTORY KERNEL, not from a
   * module-private bucketer. Same backward-from-the-end rule Analytics always
   * had (the most recent bucket is whole, any remainder falls at the oldest
   * end), now with a stated maximum per grain instead of the eight it inherited
   * from `MAX_TREND_PERIODS`, and with the bound reported rather than applied
   * in silence (DEBT-239).
   */
  const cut = bucketWindow({
    window: buildActivityWindow({
      periodStart: span.startIso,
      periodEnd: span.endIso,
      startOfOwnerDay,
    }),
    grain: input.grain,
    startOfOwnerDay,
  });
  // The kernel's buckets, in the day-only shape the evaluator and the labels
  // read. Their instants live on `cut.buckets` and are used directly by the
  // reads below, so the conversion happens once rather than per consumer.
  const buckets: readonly AnalyticsBucket[] = cut.buckets.map((bucket) => ({
    key: bucket.key,
    startIso: bucket.periodStart,
    endIso: bucket.periodEnd,
  }));
  const previous = previousSpan(span);

  /*
   * TWO grouped statements for the completion figures, and they read DIFFERENT
   * authorities on purpose (V2.7 RECALL-02).
   *
   * **Tasks completed — and its trend — read `spine_records.completed_at`**, the
   * one completion-time authority (ADR-114 decision 4), through
   * `TaskRepository.countCompletedTasksInWindows`: one statement, one column per
   * window, over exactly the predicate the Completed collection applies. That is
   * what makes the figure's LINK its evidence: the card says N, the list it
   * opens holds N, and reopening or deleting a Task moves both together. Reading
   * the Activity stream here instead — as this did before RECALL-02 — counted
   * completion EVENTS, which survive a reopen and survive a deletion, so a
   * reader who followed the link to check a doubted number found fewer records
   * than the number promised.
   *
   * **Projects and Goals keep `countPeriodCompletions`**, the Activity-derived
   * read HARDEN-06C (F-07) made deliberately immutable for past periods. Both
   * reads are correct; they answer different questions, and only the Task figure
   * has a live list standing behind it as evidence. Converging the Review's own
   * period facts onto the completed window is RECALL-04's, not this item's.
   *
   * **V2.9 INS-03 splits what was one call into a SERIES read and a TOTALS
   * read**, because they no longer fit one shape. The series now runs to 366
   * buckets, which `countCompletedTasksInWindows` cannot express at all — it
   * binds two parameters per window against D1's ceiling of 100 and is capped
   * at fourteen. `countCompletedInBuckets` (INS-01) carries the boundaries as
   * one JSON parameter and is one statement whatever the window; the two
   * totals stay on the unbucketed sibling, which is the read they are the
   * natural size for. Both hit the same authority under the same predicate,
   * and INS-01 asserts they agree.
   *
   * The range total is still its OWN window rather than the sum of its
   * buckets. With one stored `completed_at` per record the sum would now
   * agree, but a total that is a separate question stays a separate window: it
   * is what the owner reads, and it must not depend on how the shape happens
   * to be cut.
   *
   * **Projects and Goals gain a bucketed line** (the roadmap's three completion
   * series) through `ActivityRepository.countByTypeInBuckets` — one more
   * statement, and the same ADR-079 d2 event semantics their totals already
   * have, so the line and the card cannot disagree.
   */
  const CURRENT_KEY = "current";
  const PREVIOUS_KEY = "previous";
  const completedBuckets: CompletedTaskWindow[] = cut.buckets.map((bucket) => ({
    key: bucket.key,
    startsAt: new Date(bucket.startInstantIso),
    endsAt: new Date(bucket.endInstantIso),
  }));
  const completedTotals: CompletedTaskWindow[] = [
    toCompletedWindow(CURRENT_KEY, span, input.timezone),
    toCompletedWindow(PREVIOUS_KEY, previous, input.timezone),
  ];
  const totalRequests: PeriodCountRequest[] = [
    { key: CURRENT_KEY, window: toWindow(span, input.timezone) },
    { key: PREVIOUS_KEY, window: toWindow(previous, input.timezone) },
  ];

  /*
   * CONVERGE-01 §8 — the overdue series, as ONE more grouped statement.
   *
   * Every bucket's close, plus the close of the previous span, which is the
   * moment the metric card's comparison is against.
   *
   * **V2.9 INS-03 — this read's bound is REAL, and the page says so when it
   * bites.** Unlike the counting reads, the overdue level could not be lifted
   * by carrying boundaries as JSON: the moments do not partition anything, so
   * each needs its own `SUM(CASE …)` column over one pass, and two bound
   * parameters per column against D1's ceiling of 100 puts the limit near 48
   * (`MAX_OVERDUE_MOMENTS = 40`). A 366-day or 52-week window therefore reads
   * the most recent 40 moments rather than one per bucket — and `overdueMoments`
   * carries that number to the surface, which states it. Silently slicing at
   * the cap is exactly what this replaces.
   *
   * The previous-span close is asked for in the same call rather than as a
   * second statement, unlike the completion totals: overdue is a LEVEL read at a
   * moment, so there is no double-counting hazard to keep the totals away from
   * the buckets, and no reason to spend a second scan.
   */
  const PREVIOUS_OVERDUE_KEY = "previous";
  // Keep the MOST RECENT moments when the bound bites — a backlog's recent
  // shape is the readable half — leaving room for the previous-span close.
  const overdueBuckets = buckets.slice(-(MAX_OVERDUE_MOMENTS - 1));
  const overdueMoments =
    overdueBuckets.length < buckets.length ? overdueBuckets.length : 0;
  const overdueRequests: PeriodCountRequest[] = [
    ...overdueBuckets.map((bucket) => ({
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
    const [seriesRows, totalCompletedRows, totalRows, eventRows] =
      await Promise.all([
        input.scope.tasks.countCompletedInBuckets({
          buckets: completedBuckets,
        }),
        input.scope.tasks.countCompletedTasksInWindows(completedTotals),
        input.scope.reviewInsights.countPeriodCompletions(totalRequests),
        // The Projects and Goals LINE, in the same event semantics their
        // totals use (ADR-079 d2), so the two cannot disagree.
        input.scope.activity.countByTypeInBuckets({
          types: [PROJECT_COMPLETED, GOAL_COMPLETED],
          buckets: completedBuckets,
        }),
      ]);
    const seriesByKey = new Map(
      seriesRows.map((row) => [row.key, row.completed]),
    );
    const completedByKey = new Map(
      totalCompletedRows.map((row) => [row.key, row.completed]),
    );
    const eventsByKey = new Map(eventRows.map((row) => [row.key, row.counts]));
    const totalsByKey = new Map(totalRows.map((row) => [row.key, row]));
    series = buckets.map((bucket) => ({
      key: bucket.key,
      tasksCompleted: seriesByKey.get(bucket.key) ?? 0,
      projectsCompleted: eventsByKey.get(bucket.key)?.[PROJECT_COMPLETED] ?? 0,
      goalsCompleted: eventsByKey.get(bucket.key)?.[GOAL_COMPLETED] ?? 0,
    }));
    const currentRow = totalsByKey.get(CURRENT_KEY);
    const previousRow = totalsByKey.get(PREVIOUS_KEY);
    current = currentRow
      ? {
          tasksCompleted: completedByKey.get(CURRENT_KEY) ?? 0,
          projectsCompleted: currentRow.projectsCompleted,
          goalsCompleted: currentRow.goalsCompleted,
        }
      : null;
    previousCounts = previousRow
      ? {
          tasksCompleted: completedByKey.get(PREVIOUS_KEY) ?? 0,
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

  /*
   * V2.9 INS-03 — the two Goal reads, over the Goals the tally just read.
   *
   * Sequenced after the tally rather than beside it because both need its ids,
   * and asking for a second Goal page to parallelise would be a statement spent
   * to save a round trip. Beside EACH OTHER, because they are independent.
   */
  const [measured, contributions] = await Promise.all([
    readMeasuredGoals(input, goals?.subjects ?? []),
    readGoalContributions(input, goals?.subjects ?? []),
  ]);

  const model = evaluateAnalytics({
    window: input.window,
    grain: input.grain,
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
    // Only the moments actually read carry a point. A bucket the overdue read
    // could not reach is ABSENT rather than zero, because a zero here would
    // read as "nothing was overdue then" (ADR-079 d11).
    overdueSeries: overdueBuckets.map((bucket) => ({
      key: bucket.key,
      overdue: overdue.byKey.get(bucket.key) ?? 0,
    })),
    overduePrevious: overdue.previous,
    overdueAvailable: overdue.available,
    measuredGoals: measured.rows,
    measuredGoalsBounded: goals?.bounded ?? false,
    measuredGoalsAvailable: measured.available,
    goalContributions: contributions,
    seriesBounded: cut.bounded,
    seriesBound: cut.bound,
    overdueMoments,
  });

  return {
    model,
    window: input.window,
    grain: input.grain,
    grains: allowedGrains(input.window, input.todayIso),
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
 * The Goal ALIGNMENT tally, from AREA-03's evaluator over one bounded,
 * alignment-ranked page of Goals — never a second Goal-health model, and never a
 * count invented in SQL.
 *
 * The figure is the alignment evaluator's `active` state: a Goal with
 * contributing work recorded inside the recent window. **V2.7 RECALL-04 renamed
 * it `moving` (DEBT-234)**: this read has never consulted a measurement, a
 * target or a schedule, so calling its result "on track" gave GOAL-02's words to
 * ADR-040's answer and let two surfaces disagree in public about one workspace.
 * `completed` Goals are excluded from BOTH halves of the fraction, because
 * "4 of 12 moving" reading as an indictment when eight of the twelve are
 * finished would be the surface lying by omission.
 */
async function readGoalTally(input: AnalyticsContextInput): Promise<{
  moving: number;
  total: number;
  bounded: boolean;
  /**
   * The Goals the tally examined, so the measured-Goal series reads the same
   * page — and carries their titles, so it needs no second read for them.
   */
  subjects: readonly { readonly id: string; readonly title: string }[];
} | null> {
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

    let moving = 0;
    let total = 0;

    const subjects: { id: string; title: string }[] = [];
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
      subjects.push({ id: goal.id, title: goal.title });
      if (alignment.state === "active") moving += 1;
    }
    return { moving, total, bounded, subjects };
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Measured Goals (V2.9 INS-03)                                                */
/* -------------------------------------------------------------------------- */

/**
 * A compact series for every MEASURED Goal on the page — the caller DEBT-212
 * asked for, and the reason `listMeasurementSeries` exists.
 *
 * ONE grouped statement for the whole page of ids, bounded per Goal inside the
 * window function rather than in JavaScript. A Goal with fewer than two
 * readings draws nothing, so it is dropped here rather than rendered as a flat
 * line that would read as "no change" (the Sparkline's own rule).
 *
 * The points are the Goal's own readings, NOT a bucketed count: a measurement
 * is a level the owner recorded on a day, and bucketing levels would invent
 * readings between them. That is why this series does not run through
 * `bucketWindow` and does not carry the page's grain.
 */
async function readMeasuredGoals(
  input: AnalyticsContextInput,
  subjects: readonly { readonly id: string; readonly title: string }[],
): Promise<{
  rows: readonly AnalyticsGoalSeries[];
  available: boolean;
}> {
  if (subjects.length === 0) return { rows: [], available: true };
  try {
    const series = await input.scope.goalMeasurements.listMeasurementSeries(
      subjects.map((subject) => subject.id),
      { perGoalLimit: ANALYTICS_LIMITS.goalSeriesPoints },
    );
    const rows: AnalyticsGoalSeries[] = [];
    for (const subject of subjects) {
      const points = series.get(subject.id) ?? [];
      // Fewer than two readings is not a series. The surface shows the Goal's
      // figure on its own record instead; drawing one point as a line would be
      // a chart asserting a shape it does not have.
      if (points.length < 2) continue;
      rows.push({
        goalId: subject.id,
        title: subject.title,
        points: points.map((point) => ({
          key: point.measuredOn,
          date: point.measuredOn,
          value: point.value,
        })),
        bounded: points.length >= ANALYTICS_LIMITS.goalSeriesPoints,
        to: `/goals/${encodeURIComponent(subject.id)}`,
      });
    }
    return { rows, available: true };
  } catch {
    return { rows: [], available: false };
  }
}

/**
 * V2.9 INS-03 — the across-Reviews contribution line, for a Goal with no
 * measurement.
 *
 * A measured Goal has a shape to draw. An unmeasured one has none, and drawing
 * nothing beside its name would make the panel a list of Goals half of which
 * are blank. What it does have is the Review's own record of whether work
 * reached it — already stored, already read back by INS-02 — so the same
 * sentence appears here, under the same rules.
 *
 * TWO statements, flat: the most recent completed Review (the anchor the series
 * is same-type-filtered against), then the series itself. The classification is
 * computed by the SAME pure function the Review panel and the Goal story use
 * (`readAcrossReviews`), so a Goal cannot be "moving" here and something else
 * there.
 *
 * The window is REVIEWS, not the page's window, and the sentence says so —
 * "Moving at 3 of your last 4 Reviews". A Review period is not the span the
 * owner selected, and quietly presenting one as the other is exactly what
 * ADR-079 d11 refuses.
 */
async function readGoalContributions(
  input: AnalyticsContextInput,
  subjects: readonly { readonly id: string; readonly title: string }[],
): Promise<readonly GoalContributionAcrossReviews[]> {
  if (subjects.length === 0) return [];
  try {
    const anchors = await input.scope.reviews.list({
      view: "completed",
      sort: "period",
      limit: 1,
    });
    const anchor = anchors.items[0];
    if (anchor === undefined) return [];
    const series = await input.scope.reviewInsights.listSnapshotSeries(
      anchor.id,
      MAX_TREND_PERIODS,
    );
    return readAcrossReviews({
      series,
      // Only the Goal facts are wanted here: this panel is about Goals, and
      // asking for Project or carry-over titles it does not render would be a
      // read spent on nothing.
      projects: [],
      goals: subjects,
      tasks: [],
    }).goals;
  } catch {
    // A failed read renders NOTHING rather than an absence claim. The measured
    // Goals beside it are a separate read and are unaffected.
    return [];
  }
}
