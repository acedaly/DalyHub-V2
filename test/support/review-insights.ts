/**
 * REVIEW-03 — shared fixtures for the Review evidence model.
 *
 * Every helper builds REAL facts and runs the REAL evaluator, so a fixture can
 * never assert behaviour production does not have. Nothing here hand-writes an
 * `Insight`: tests describe a week, and the rules decide what it means.
 */

import {
  derivePeriodPlanAccount,
  type PeriodPlanAccount,
} from "~/kernel/activity-window";
import type { HabitPeriodConsistency } from "~/kernel/habits";
import {
  evaluateReviewInsights,
  exactMeasure,
  type CarryOverTaskFact,
  type PeriodCompletionPoint,
  type ReviewAreaStateFact,
  type ReviewGoalStateFact,
  type ReviewInsightFacts,
  type ReviewInsights,
  type ReviewInsightSnapshot,
  type ReviewPeriodWindow,
  type ReviewProjectStateFact,
  type StoredReviewInsightSnapshot,
} from "~/kernel/review-insights";

export const INSIGHT_PERIOD: ReviewPeriodWindow = {
  periodStart: "2026-07-27",
  periodEnd: "2026-08-02",
  startInstantIso: "2026-07-26T14:00:00.000Z",
  endInstantIso: "2026-08-02T14:00:00.000Z",
};

export function projectFact(
  overrides: Partial<ReviewProjectStateFact> = {},
): ReviewProjectStateFact {
  return {
    id: "project-1",
    title: "Kitchen renovation",
    healthState: "on_track",
    healthLabel: "On track",
    openTasks: 4,
    overdueTasks: 0,
    waitingTasks: 0,
    tasksCompletedInPeriod: 0,
    daysSinceActivity: 1,
    completedInPeriod: false,
    ...overrides,
  };
}

export function goalFact(
  overrides: Partial<ReviewGoalStateFact> = {},
): ReviewGoalStateFact {
  return {
    id: "goal-1",
    title: "Run a half marathon",
    alignmentState: "active",
    contributingProjects: 1,
    contributingProjectsWithWork: 0,
    tasksCompletedInPeriod: 0,
    completedInPeriod: false,
    ...overrides,
  };
}

export function areaFact(
  overrides: Partial<ReviewAreaStateFact> = {},
): ReviewAreaStateFact {
  return {
    id: "area-1",
    title: "Health & Fitness",
    activeProjects: 1,
    tasksCompletedInPeriod: 0,
    ...overrides,
  };
}

export function carryOverFact(
  overrides: Partial<CarryOverTaskFact> = {},
): CarryOverTaskFact {
  return {
    id: "task-1",
    title: "Renew the insurance",
    kind: "overdue",
    projectId: null,
    projectTitle: null,
    ...overrides,
  };
}

export interface InsightFactsOverrides {
  readonly window?: ReviewPeriodWindow;
  readonly tasksCompleted?: number;
  readonly projectsCompleted?: number;
  readonly goalsCompleted?: number;
  readonly historyAvailable?: boolean;
  readonly contributions?: ReviewInsightFacts["history"]["contributions"];
  readonly contributionsBounded?: boolean;
  readonly projects?: readonly ReviewProjectStateFact[];
  readonly projectsBounded?: boolean;
  readonly goals?: readonly ReviewGoalStateFact[];
  readonly goalsBounded?: boolean;
  readonly areas?: readonly ReviewAreaStateFact[];
  readonly areasBounded?: boolean;
  readonly carryOver?: readonly CarryOverTaskFact[];
  readonly overdueCarryOver?: number;
  readonly waitingCarryOver?: number;
  readonly stateAvailable?: boolean;
  /** FOLLOW-01 — the period's plan account. Empty and AVAILABLE by default, so
   * an existing test's expectations are unchanged by its arrival. */
  readonly planAccount?: PeriodPlanAccount;
  /** DEBT-156 — the period's Habit consistency. Absent unless a test asks. */
  readonly habits?: HabitPeriodConsistency;
}

export function insightFacts(
  overrides: InsightFactsOverrides = {},
): ReviewInsightFacts {
  const projects = overrides.projects ?? [];
  const contributions =
    overrides.contributions ??
    projects
      .filter((project) => project.tasksCompletedInPeriod > 0)
      .map((project) => ({
        projectId: project.id,
        projectTitle: project.title,
        goalId: null,
        goalTitle: null,
        areaId: null,
        areaTitle: null,
        tasksCompleted: project.tasksCompletedInPeriod,
      }));
  return {
    window: overrides.window ?? INSIGHT_PERIOD,
    history: {
      completions: {
        tasksCompleted: overrides.tasksCompleted ?? 0,
        projectsCompleted: overrides.projectsCompleted ?? 0,
        goalsCompleted: overrides.goalsCompleted ?? 0,
      },
      contributions,
      contributionsBounded: overrides.contributionsBounded ?? false,
      available: overrides.historyAvailable ?? true,
    },
    state: {
      projects,
      projectsBounded: overrides.projectsBounded ?? false,
      goals: overrides.goals ?? [],
      goalsBounded: overrides.goalsBounded ?? false,
      areas: overrides.areas ?? [],
      areasBounded: overrides.areasBounded ?? false,
      carryOver: overrides.carryOver ?? [],
      carryOverOverdue: exactMeasure(overrides.overdueCarryOver ?? 0),
      carryOverWaiting: exactMeasure(overrides.waitingCarryOver ?? 0),
      available: overrides.stateAvailable ?? true,
    },
    planAccount:
      overrides.planAccount ??
      derivePeriodPlanAccount({
        window: overrides.window ?? INSIGHT_PERIOD,
        todayIso: (overrides.window ?? INSIGHT_PERIOD).periodEnd,
        subjects: [],
        events: [],
        ownerDayOf: (instantIso) => instantIso.slice(0, 10),
      }),
    habits: overrides.habits ?? {
      fromIso: (overrides.window ?? INSIGHT_PERIOD).periodStart,
      toIso: (overrides.window ?? INSIGHT_PERIOD).periodEnd,
      expected: 0,
      completed: 0,
      habitsCounted: 0,
      bounded: false,
      available: true,
    },
  };
}

export interface InsightsOptions extends InsightFactsOverrides {
  readonly previousSnapshot?: ReviewInsightSnapshot | null;
  /** Omit to make this the first Review of its type. */
  readonly previousReviewId?: string;
  readonly series?: readonly PeriodCompletionPoint[];
  /**
   * V2.9 INS-02 — the stored snapshots of this Review and the ones before it,
   * oldest first, as `listSnapshotSeries` returns them. Omit for a Review with
   * no series, which produces no across-Reviews section at all.
   */
  readonly snapshotSeries?: readonly StoredReviewInsightSnapshot[];
}

/** Build a real `ReviewInsights` by running the real rules over built facts. */
export function buildInsights(options: InsightsOptions = {}): ReviewInsights {
  const facts = insightFacts(options);
  const series =
    options.series ??
    ([
      {
        key: "current",
        periodStart: facts.window.periodStart,
        periodEnd: facts.window.periodEnd,
        tasksCompleted: facts.history.completions.tasksCompleted,
        projectsCompleted: facts.history.completions.projectsCompleted,
        goalsCompleted: facts.history.completions.goalsCompleted,
      },
    ] as const);
  const labels: Record<string, string> = { current: "27 Jul – 2 Aug" };
  for (const point of series) {
    labels[point.key] ??= point.periodEnd;
  }
  return evaluateReviewInsights({
    periodLabel: "27 July – 2 August 2026",
    facts,
    previous:
      options.previousReviewId === undefined
        ? null
        : {
            reviewId: options.previousReviewId,
            periodLabel: "20 – 26 July 2026",
            snapshot: options.previousSnapshot ?? null,
          },
    series,
    seriesLabels: labels,
    seriesShortLabels: labels,
    currentSeriesKey: "current",
    snapshotSeries: options.snapshotSeries,
    // The evaluator formats no date itself; the across-Reviews window's words
    // arrive the same way every other label does.
    formatDay: (iso) => iso,
  });
}

/**
 * A stored snapshot at a named Review, for building a SERIES (V2.9 INS-02).
 *
 * Oldest first is the caller's job, exactly as `listSnapshotSeries` guarantees
 * it — so a test that builds them out of order is testing its own mistake.
 */
export function storedSnapshot(
  reviewId: string,
  overrides: Partial<ReviewInsightSnapshot> = {},
): StoredReviewInsightSnapshot {
  return {
    reviewId,
    capturedAt: new Date("2026-08-02T09:00:00.000Z"),
    snapshot: previousSnapshot(overrides),
  };
}

/** A minimal previous snapshot, so a test can name only what it cares about. */
export function previousSnapshot(
  overrides: Partial<ReviewInsightSnapshot> = {},
): ReviewInsightSnapshot {
  return {
    version: 1,
    periodStart: "2026-07-20",
    periodEnd: "2026-07-26",
    tasksCompleted: 5,
    projectsCompleted: 0,
    goalsCompleted: 0,
    overdueCarryOver: 0,
    waitingCarryOver: 0,
    projects: [],
    projectsBounded: false,
    goals: [],
    goalsBounded: false,
    areas: [],
    areasBounded: false,
    carryOverTaskIds: [],
    carryOverTaskIdsBounded: false,
    ...overrides,
  };
}
