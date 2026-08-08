/**
 * REVIEW-03 — the ONE bounded projection behind the Review evidence surface.
 *
 * Both places that show evidence — the guided weekly Review's first step and
 * the Review record's Progress tab — call this, and nothing else reads a
 * repository for it. No component queries anything; the loader calls this once
 * and hands the browser a small JSON-safe result.
 *
 * The rules it holds itself to, mirroring `review-guide-context.ts`:
 *
 *   - **Bounded, always.** Every read carries an explicit limit from
 *     `REVIEW_INSIGHT_LIMITS`. Nothing here says "load them all", and the
 *     historical trend has a hard period cap so a decade of Reviews never
 *     becomes a decade of rows.
 *   - **No N+1.** Whole pages of Projects and Goals are gathered through the
 *     existing grouped projections (PROJ-02's `listProjectHealthFacts`,
 *     AREA-03's `listGoalAlignmentFacts`, AREA-02's
 *     `listGoalProjectContributions`), and the period aggregates are grouped
 *     statements in the database.
 *   - **A fixed query budget**, declared in `REVIEW_INSIGHTS_QUERY_BUDGET` and
 *     asserted against real D1, flat with respect to workspace size.
 *   - **Derived, except where it truthfully cannot be.** Health is PROJ-02's,
 *     alignment is AREA-03's, movement is the Activity stream's. The single
 *     persisted snapshot exists only because state-at-a-past-moment has no
 *     other honest source (see `review-insight-snapshot.ts`).
 *   - **Failure is said, not zeroed.** A read that fails marks its measures
 *     unavailable; the surface then says so instead of reporting nought.
 */

import {
  composeGoalAlignmentFacts,
  evaluateGoalAlignment,
} from "~/kernel/alignment";
import { formatPreferenceDate } from "~/kernel/preferences";
import { evaluateProjectHealth } from "~/kernel/project-health";
import type { Review } from "~/kernel/reviews";
import {
  MAX_TREND_PERIODS,
  buildReviewInsightSnapshot,
  classifyGoalContribution,
  evaluateReviewInsights,
  exactMeasure,
  UNAVAILABLE_MEASURE,
  type CarryOverTaskFact,
  type PeriodCompletionPoint,
  type PeriodContributionRow,
  type PeriodCountRequest,
  type ReviewAreaStateFact,
  type ReviewGoalStateFact,
  type ReviewInsightFacts,
  type ReviewInsights,
  type ReviewPeriodWindow,
  type ReviewProjectStateFact,
} from "~/kernel/review-insights";
import { InvalidSpineCursorError } from "~/kernel/spine";
import type { WorkspaceScope } from "~/platform/workspaces";
import { createOwnerAlignmentContext } from "~/shared/alignment";
import { ownerCalendarIso, ownerLocalToUtc } from "~/shared/datetime";
import { createOwnerHealthContext } from "~/shared/project-health";

/* -------------------------------------------------------------------------- */
/* Bounds                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The server-side bounds of every insight read. Generous enough that a
 * realistic mature workspace is described completely, small enough that the
 * payload never grows with the workspace.
 */
export const REVIEW_INSIGHT_LIMITS = {
  /** Projects examined for health, change and stagnation. */
  projects: 20,
  /** Goals examined for contribution (alignment-ranked, so the ones worth a look lead). */
  goals: 12,
  /** Areas examined for where completed work landed. */
  areas: 20,
  /** Rows in the "where did the completed work land" breakdown. */
  contributions: 60,
  /** Carrying-over commitments named. The COUNT beside them is always exact. */
  carryOverTasks: 25,
  /**
   * How many earlier Review periods the trend reaches back over, in ADDITION to
   * the one being reviewed. Bounded deliberately: a trend is a recent shape,
   * and loading a whole history to draw six bars is the thing this prevents.
   */
  trendPeriods: 5,
  /** Completed Reviews scanned to find the recent ones for the trend. */
  priorReviewScan: 12,
} as const;

/**
 * The EXACT number of executed D1 statements one evidence load costs, asserted
 * against real D1 by `test/kernel/review-insights.test.ts`. It is a number, not
 * a claim: an edit that adds a per-record read fails the build rather than the
 * owner's Review.
 *
 * 1 prior-Review page + 1 completion series (every trend period in ONE grouped
 * statement) + 1 contribution breakdown (read once and shared by Projects,
 * Goals and Areas) + 1 previous snapshot + 2 Project pages + 3 Project health
 * facts + 1 carry-over page + 1 carry-over count + 1 Goal page + 1 Goal
 * contributions + 1 Goal alignment facts + 1 Area page = 14.
 *
 * Flat with respect to workspace size and to how many past Reviews exist, both
 * asserted separately.
 */
export const REVIEW_INSIGHTS_QUERY_BUDGET = 14;

/* -------------------------------------------------------------------------- */
/* Input                                                                       */
/* -------------------------------------------------------------------------- */

export interface ReviewInsightsContextInput {
  readonly review: Review;
  readonly now: Date;
  readonly timezone: string;
  readonly todayIso: string;
  /** Formats a wall-calendar date for display, using the owner's preference. */
  readonly formatDate: (iso: string) => string;
}

/* -------------------------------------------------------------------------- */
/* Period windows                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Turn a Review's wall-calendar period into the half-open UTC instant range the
 * Activity stream is queried with.
 *
 * The conversion happens HERE, once, using the owner's timezone — never in SQL
 * and never in the evaluator. The upper bound is the owner's local midnight
 * that STARTS the day after `periodEnd`, so a Task completed at 11pm on the
 * last day of the period is inside it and one completed a minute later is not.
 * A timezone that cannot resolve a local midnight (the hour a DST jump skips)
 * falls back to the plain UTC interpretation rather than dropping the period.
 */
export function reviewPeriodWindow(
  periodStart: string,
  periodEnd: string,
  timezone: string,
): ReviewPeriodWindow {
  const start = ownerLocalToUtc(`${periodStart}T00:00`, timezone);
  const dayAfterEnd = addCalendarDays(periodEnd, 1);
  const end = ownerLocalToUtc(`${dayAfterEnd}T00:00`, timezone);
  return {
    periodStart,
    periodEnd,
    startInstantIso: (
      start ?? new Date(`${periodStart}T00:00:00.000Z`)
    ).toISOString(),
    endInstantIso: (
      end ?? new Date(`${dayAfterEnd}T00:00:00.000Z`)
    ).toISOString(),
  };
}

/** Add whole days to a `YYYY-MM-DD` wall-calendar date. */
function addCalendarDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map((part) => Number(part));
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return `${shifted.getUTCFullYear().toString().padStart(4, "0")}-${(shifted.getUTCMonth() + 1).toString().padStart(2, "0")}-${shifted.getUTCDate().toString().padStart(2, "0")}`;
}

function inPeriod(iso: string, start: string, end: string): boolean {
  return iso >= start && iso <= end;
}

/* -------------------------------------------------------------------------- */
/* The projection                                                              */
/* -------------------------------------------------------------------------- */

/** The composed result: the evidence model, plus the facts it was built from so
 * a completion can snapshot them without reading everything a second time. */
export interface ReviewInsightsResult {
  readonly insights: ReviewInsights;
  readonly facts: ReviewInsightFacts;
}

/**
 * Load one Review's evidence. Never throws: each half degrades to an honest
 * "not available" so a Review always opens.
 */
export async function loadReviewInsights(
  scope: WorkspaceScope,
  input: ReviewInsightsContextInput,
): Promise<ReviewInsightsResult> {
  const { review, timezone } = input;
  const window = reviewPeriodWindow(
    review.periodStart,
    review.periodEnd,
    timezone,
  );

  // The Reviews that came before this one — the trend's periods, and the
  // previous Review this one compares itself against. Completed only: an
  // unfinished Review is not a point in history. This is the one read the rest
  // depends on, so it is awaited before the fan-out rather than inside it.
  const priorReviews = await readPriorReviews(scope, input);

  /*
   * The period breakdown is read ONCE and shared. Projects, Goals and Areas all
   * need "how much completed work landed here", and asking the same grouped
   * question three times would be an N+1 in disguise.
   */
  const [series, contributions, previousSnapshot] = await Promise.all([
    readSeries(scope, input, window, priorReviews),
    readContributions(scope, window),
    readPreviousSnapshot(scope, priorReviews),
  ]);

  const currentPoint = series.find((point) => point.key === "current") ?? null;
  const history: ReviewInsightFacts["history"] = {
    completions: {
      tasksCompleted: currentPoint?.tasksCompleted ?? 0,
      projectsCompleted: currentPoint?.projectsCompleted ?? 0,
      goalsCompleted: currentPoint?.goalsCompleted ?? 0,
    },
    contributions: contributions.rows,
    contributionsBounded: contributions.bounded,
    available: currentPoint !== null && contributions.available,
  };

  const state = await readCurrentState(
    scope,
    input,
    window,
    contributions.rows,
  );

  const facts: ReviewInsightFacts = { window, history, state };
  const periodLabel = `${input.formatDate(review.periodStart)} – ${input.formatDate(review.periodEnd)}`;

  const seriesLabels: Record<string, string> = { current: periodLabel };
  // The axis under the bars gets the period's LAST day. A six-bar axis of full
  // date ranges is a wall of wrapped text, and the summary sentence beneath the
  // chart still names every period in full.
  const seriesShortLabels: Record<string, string> = {
    current: input.formatDate(review.periodEnd),
  };
  for (const prior of priorReviews) {
    seriesLabels[prior.id] =
      `${input.formatDate(prior.periodStart)} – ${input.formatDate(prior.periodEnd)}`;
    seriesShortLabels[prior.id] = input.formatDate(prior.periodEnd);
  }

  const previous = priorReviews[0] ?? null;
  const insights = evaluateReviewInsights({
    periodLabel,
    facts,
    previous:
      previous === null
        ? null
        : {
            reviewId: previous.id,
            periodLabel: seriesLabels[previous.id] ?? previous.periodEnd,
            snapshot: previousSnapshot,
          },
    // A single point is a number, not a trend — the evaluator drops it.
    series,
    seriesLabels,
    seriesShortLabels,
    currentSeriesKey: "current",
  });

  return { insights, facts };
}

/* -- Prior Reviews --------------------------------------------------------- */

interface PriorReview {
  readonly id: string;
  readonly periodStart: string;
  readonly periodEnd: string;
}

/**
 * The completed Reviews of the same TYPE whose period ended strictly before
 * this one's — newest first, bounded.
 *
 * Same type, because a month and a week are different horizons and lining them
 * up on one axis would compare unlike things. Strictly before, so a Review can
 * never compare against itself or against one that overlaps it.
 */
async function readPriorReviews(
  scope: WorkspaceScope,
  input: ReviewInsightsContextInput,
): Promise<readonly PriorReview[]> {
  try {
    const page = await scope.reviews.list({
      view: "completed",
      type: input.review.type,
      sort: "period",
      limit: REVIEW_INSIGHT_LIMITS.priorReviewScan,
    });
    return page.items
      .filter(
        (candidate) =>
          candidate.id !== input.review.id &&
          candidate.archivedAt === null &&
          candidate.periodEnd < input.review.periodStart,
      )
      .sort((a, b) => {
        const period = b.periodEnd.localeCompare(a.periodEnd);
        if (period !== 0) return period;
        return b.id.localeCompare(a.id);
      })
      .slice(0, REVIEW_INSIGHT_LIMITS.trendPeriods)
      .map((candidate) => ({
        id: candidate.id,
        periodStart: candidate.periodStart,
        periodEnd: candidate.periodEnd,
      }));
  } catch {
    return [];
  }
}

/* -- (1) Historical facts -------------------------------------------------- */

interface ContributionRead {
  readonly rows: readonly PeriodContributionRow[];
  readonly bounded: boolean;
  readonly available: boolean;
}

/** Where this period's completed Tasks landed, read once for every consumer. */
async function readContributions(
  scope: WorkspaceScope,
  window: ReviewPeriodWindow,
): Promise<ContributionRead> {
  try {
    const rows = await scope.reviewInsights.listPeriodContributions(
      window,
      REVIEW_INSIGHT_LIMITS.contributions,
    );
    return {
      rows,
      bounded: rows.length >= REVIEW_INSIGHT_LIMITS.contributions,
      available: true,
    };
  } catch {
    return { rows: [], bounded: false, available: false };
  }
}

/* -- (2) Current-state facts ----------------------------------------------- */

async function readCurrentState(
  scope: WorkspaceScope,
  input: ReviewInsightsContextInput,
  window: ReviewPeriodWindow,
  contributions: readonly PeriodContributionRow[],
): Promise<ReviewInsightFacts["state"]> {
  const unavailable: ReviewInsightFacts["state"] = {
    projects: [],
    projectsBounded: false,
    goals: [],
    goalsBounded: false,
    areas: [],
    areasBounded: false,
    carryOver: [],
    carryOverOverdue: UNAVAILABLE_MEASURE,
    carryOverWaiting: UNAVAILABLE_MEASURE,
    available: false,
  };
  try {
    const [projects, goalsAndAreas, carryOver] = await Promise.all([
      readProjectState(scope, input, contributions),
      readGoalAndAreaState(scope, input, contributions),
      readCarryOver(scope, window),
    ]);
    return {
      projects: projects.items,
      projectsBounded: projects.bounded,
      goals: goalsAndAreas.goals,
      goalsBounded: goalsAndAreas.goalsBounded,
      areas: goalsAndAreas.areas,
      areasBounded: goalsAndAreas.areasBounded,
      carryOver: carryOver.items,
      carryOverOverdue: carryOver.overdue,
      carryOverWaiting: carryOver.waiting,
      available: true,
    };
  } catch {
    return unavailable;
  }
}

async function readProjectState(
  scope: WorkspaceScope,
  input: ReviewInsightsContextInput,
  contributions: readonly PeriodContributionRow[],
): Promise<{
  readonly items: readonly ReviewProjectStateFact[];
  readonly bounded: boolean;
}> {
  const { review, timezone, todayIso, now } = input;
  const [openPage, completedPage] = await Promise.all([
    scope.projects.listProjects({
      state: "open",
      orderBy: "recent",
      limit: REVIEW_INSIGHT_LIMITS.projects + 1,
    }),
    scope.projects.listProjects({
      state: "completed",
      orderBy: "recent",
      limit: REVIEW_INSIGHT_LIMITS.projects,
    }),
  ]);

  const completedInThisPeriod = new Set(
    completedPage.items
      .filter(
        (project) =>
          project.completedAt !== null &&
          inPeriod(
            ownerCalendarIso(project.completedAt, timezone),
            review.periodStart,
            review.periodEnd,
          ),
      )
      .map((project) => project.id),
  );

  const bounded = openPage.items.length > REVIEW_INSIGHT_LIMITS.projects;
  const selected = [
    ...openPage.items.slice(0, REVIEW_INSIGHT_LIMITS.projects),
    ...completedPage.items.filter((project) =>
      completedInThisPeriod.has(project.id),
    ),
  ];
  const ids = selected.map((project) => project.id);

  const healthFacts = await scope.projectHealth.listProjectHealthFacts(
    ids,
    todayIso,
  );

  const completedByProject = new Map<string, number>();
  for (const row of contributions) {
    if (row.projectId === null) continue;
    completedByProject.set(
      row.projectId,
      (completedByProject.get(row.projectId) ?? 0) + row.tasksCompleted,
    );
  }

  const healthContext = createOwnerHealthContext(now, timezone);
  const items = selected.map<ReviewProjectStateFact>((project) => {
    const facts = healthFacts.get(project.id);
    const health = facts ? evaluateProjectHealth(facts, healthContext) : null;
    return {
      id: project.id,
      title: project.title,
      healthState: health?.state ?? "on_track",
      healthLabel: health?.label ?? "On track",
      openTasks: health?.summary.openTotal ?? 0,
      overdueTasks: health?.summary.overdueOpen ?? 0,
      waitingTasks: health?.summary.waitingOpen ?? 0,
      tasksCompletedInPeriod: completedByProject.get(project.id) ?? 0,
      daysSinceActivity: health?.summary.daysSinceActivity ?? null,
      completedInPeriod: completedInThisPeriod.has(project.id),
    };
  });

  return {
    items: [...items].sort((a, b) => {
      const title = a.title.localeCompare(b.title);
      return title !== 0 ? title : a.id.localeCompare(b.id);
    }),
    bounded,
  };
}

async function readGoalAndAreaState(
  scope: WorkspaceScope,
  input: ReviewInsightsContextInput,
  periodContributions: readonly PeriodContributionRow[],
): Promise<{
  readonly goals: readonly ReviewGoalStateFact[];
  readonly goalsBounded: boolean;
  readonly areas: readonly ReviewAreaStateFact[];
  readonly areasBounded: boolean;
}> {
  const { evaluation, recentWindowStartIso, recentBoundaryStartIso } =
    createOwnerAlignmentContext(input.now);

  let goalPage;
  try {
    goalPage = await scope.goals.listGoalsByAlignment({
      limit: REVIEW_INSIGHT_LIMITS.goals + 1,
      activeBoundaryIso: recentBoundaryStartIso,
    });
  } catch (error) {
    if (!(error instanceof InvalidSpineCursorError)) throw error;
    goalPage = await scope.goals.listGoalsByAlignment({
      activeBoundaryIso: recentBoundaryStartIso,
    });
  }

  const goalsBounded = goalPage.items.length > REVIEW_INSIGHT_LIMITS.goals;
  const goalItems = goalPage.items.slice(0, REVIEW_INSIGHT_LIMITS.goals);
  const goalIds = goalItems.map((goal) => goal.id);

  const [contributionCounts, activityFacts, areaPage] = await Promise.all([
    scope.goals.listGoalProjectContributions(goalIds),
    scope.alignment.listGoalAlignmentFacts(goalIds, { recentWindowStartIso }),
    scope.areas.listAreas({ limit: REVIEW_INSIGHT_LIMITS.areas + 1 }),
  ]);

  const tasksByGoal = new Map<string, number>();
  const projectsByGoal = new Map<string, Set<string>>();
  const tasksByArea = new Map<string, number>();
  for (const row of periodContributions) {
    if (row.goalId !== null) {
      tasksByGoal.set(
        row.goalId,
        (tasksByGoal.get(row.goalId) ?? 0) + row.tasksCompleted,
      );
      if (row.projectId !== null && row.tasksCompleted > 0) {
        const set = projectsByGoal.get(row.goalId) ?? new Set<string>();
        set.add(row.projectId);
        projectsByGoal.set(row.goalId, set);
      }
    }
    if (row.areaId !== null) {
      tasksByArea.set(
        row.areaId,
        (tasksByArea.get(row.areaId) ?? 0) + row.tasksCompleted,
      );
    }
  }

  const goals = goalItems.map<ReviewGoalStateFact>((goal) => {
    const contribution = contributionCounts.get(goal.id) ?? {
      total: 0,
      completed: 0,
      incomplete: 0,
      active: 0,
      planned: 0,
      onHold: 0,
      archived: 0,
    };
    const alignment = evaluateGoalAlignment(
      composeGoalAlignmentFacts({
        goalId: goal.id,
        completedAt: goal.completedAt,
        contribution,
        activity: activityFacts.get(goal.id),
      }),
      evaluation,
    );
    return {
      id: goal.id,
      title: goal.title,
      alignmentState: alignment.state,
      contributingProjects: contribution.total,
      contributingProjectsWithWork: projectsByGoal.get(goal.id)?.size ?? 0,
      tasksCompletedInPeriod: tasksByGoal.get(goal.id) ?? 0,
      completedInPeriod:
        goal.completedAt !== null &&
        inPeriod(
          ownerCalendarIso(goal.completedAt, input.timezone),
          input.review.periodStart,
          input.review.periodEnd,
        ),
    };
  });

  const areasBounded = areaPage.items.length > REVIEW_INSIGHT_LIMITS.areas;
  const areas = areaPage.items
    .slice(0, REVIEW_INSIGHT_LIMITS.areas)
    .map<ReviewAreaStateFact>((area) => ({
      id: area.id,
      title: area.title,
      activeProjects: area.activeProjectCount,
      tasksCompletedInPeriod: tasksByArea.get(area.id) ?? 0,
    }));

  return { goals, goalsBounded, areas, areasBounded };
}

async function readCarryOver(
  scope: WorkspaceScope,
  window: ReviewPeriodWindow,
): Promise<{
  readonly items: readonly CarryOverTaskFact[];
  readonly overdue: ReturnType<typeof exactMeasure>;
  readonly waiting: ReturnType<typeof exactMeasure>;
}> {
  const [items, counts] = await Promise.all([
    scope.reviewInsights.listCarryOverTasks(
      window,
      REVIEW_INSIGHT_LIMITS.carryOverTasks,
    ),
    scope.reviewInsights.countCarryOverTasks(window),
  ]);
  return {
    items,
    // The COUNT is the authoritative workspace-wide aggregate; the list beside
    // it is a bounded set of names. A short list never shrinks the number.
    overdue: exactMeasure(counts.overdue),
    waiting: exactMeasure(counts.waiting),
  };
}

/* -- The trend ------------------------------------------------------------- */

/**
 * Completion counts for this period and the recent ones before it, oldest
 * first. Read from the Activity stream, so a workspace that has never captured
 * a snapshot still gets a truthful trend the first time it opens a Review with
 * two completed Reviews behind it.
 */
async function readSeries(
  scope: WorkspaceScope,
  input: ReviewInsightsContextInput,
  window: ReviewPeriodWindow,
  priorReviews: readonly PriorReview[],
): Promise<readonly PeriodCompletionPoint[]> {
  const requests: PeriodCountRequest[] = [
    ...[...priorReviews].reverse().map((prior) => ({
      key: prior.id,
      window: reviewPeriodWindow(
        prior.periodStart,
        prior.periodEnd,
        input.timezone,
      ),
    })),
    { key: "current", window },
  ].slice(-MAX_TREND_PERIODS);

  try {
    const counted = await scope.reviewInsights.countPeriodCompletions(requests);
    const byKey = new Map(counted.map((entry) => [entry.key, entry]));
    return requests.map((request) => {
      const entry = byKey.get(request.key);
      return {
        key: request.key,
        periodStart: request.window.periodStart,
        periodEnd: request.window.periodEnd,
        tasksCompleted: entry?.tasksCompleted ?? 0,
        projectsCompleted: entry?.projectsCompleted ?? 0,
        goalsCompleted: entry?.goalsCompleted ?? 0,
      };
    });
  } catch {
    return [];
  }
}

async function readPreviousSnapshot(
  scope: WorkspaceScope,
  priorReviews: readonly PriorReview[],
) {
  const previous = priorReviews[0];
  if (!previous) return null;
  try {
    const stored = await scope.reviewInsights.getSnapshot(previous.id);
    return stored?.snapshot ?? null;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Snapshot capture                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Capture the completing Review's snapshot — the one write REVIEW-03 makes.
 *
 * BEST EFFORT, always. The Review is already complete by the time this runs;
 * failing to record derived bookkeeping must never turn a completion the owner
 * made into an error they see. A missing snapshot degrades to "no comparison
 * available at the next Review", which the surface states honestly.
 *
 * Deterministic: the same facts always build the same row, so completing after
 * a reopen simply overwrites with the state at the new completion.
 */
export async function captureReviewInsightSnapshot(
  scope: WorkspaceScope,
  input: ReviewInsightsContextInput,
): Promise<boolean> {
  try {
    const { facts } = await loadReviewInsights(scope, input);
    if (!facts.history.available || !facts.state.available) return false;
    const byGoal = new Map(
      facts.state.goals.map((goal) => [
        goal.id,
        classifyGoalContribution(goal),
      ]),
    );
    const snapshot = buildReviewInsightSnapshot(
      facts,
      (goalId) => byGoal.get(goalId) ?? "none",
    );
    return await scope.reviewInsights.saveSnapshot(input.review.id, snapshot);
  } catch {
    return false;
  }
}

/**
 * Capture the snapshot for a Review that has just been completed, resolving the
 * owner's own calendar and date format first.
 *
 * The two completion paths — the Review record's Complete action and the guided
 * flow's final step — both call this immediately AFTER their existing
 * `ReviewRepository.complete`, so completion semantics, its Activity event and
 * its concurrency behaviour are untouched. There is no second completion path
 * and no new event: this only records what was true at the moment the owner
 * declared the period closed, and it swallows its own failures for the reason
 * stated on `captureReviewInsightSnapshot`.
 */
export async function captureSnapshotForCompletedReview(
  scope: WorkspaceScope,
  ownerSubject: string,
  review: Review,
): Promise<boolean> {
  try {
    const preferences = await scope.appPreferences.get(ownerSubject);
    const now = new Date();
    return await captureReviewInsightSnapshot(scope, {
      review,
      now,
      timezone: preferences.timezone,
      todayIso: ownerCalendarIso(now, preferences.timezone),
      formatDate: (iso: string) =>
        formatPreferenceDate(iso, preferences.dateFormat),
    });
  } catch {
    return false;
  }
}
