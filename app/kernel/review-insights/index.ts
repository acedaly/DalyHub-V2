/**
 * REVIEW-03 Review insights kernel — public surface.
 *
 * Modules and the composition boundary import the derived insight model, its
 * facts, its one persisted snapshot shape and the read/write contract from
 * here. Like the other kernel barrels it exposes only storage-independent
 * shapes and pure functions; the D1 adapter is constructed from
 * `app/platform/storage/d1`.
 */

export {
  MAX_ACROSS_REVIEWS_GOALS,
  MAX_ACROSS_REVIEWS_PROJECTS,
  MAX_REPEATED_CARRY_OVER,
  MIN_ACROSS_REVIEWS,
  goalContributionAcrossReviewsLine,
  readAcrossReviews,
  type AcrossReviewsFacts,
  type AcrossReviewsSubject,
  type GoalContributionAcrossReviews,
  type ProjectHealthAcrossReviews,
  type RepeatedCarryOver,
} from "./across-reviews";

export {
  INSIGHT_EXACTNESS,
  exactMeasure,
  boundedMeasure,
  measureLabel,
  UNAVAILABLE_MEASURE,
} from "./review-insight-facts";
export type {
  InsightExactness,
  InsightMeasure,
  ReviewPeriodWindow,
  PeriodCompletionCounts,
  PeriodCompletionPoint,
  PeriodContributionRow,
  ReviewPeriodHistory,
  ReviewProjectStateFact,
  ReviewGoalStateFact,
  ReviewAreaStateFact,
  CarryOverTaskFact,
  ReviewCurrentState,
  ReviewInsightFacts,
} from "./review-insight-facts";

export {
  REVIEW_INSIGHT_SNAPSHOT_VERSION,
  SNAPSHOT_LIMITS,
  SNAPSHOT_GOAL_CONTRIBUTIONS,
  buildReviewInsightSnapshot,
  parseReviewInsightSnapshot,
  serializeReviewInsightSnapshot,
} from "./review-insight-snapshot";
export type {
  ReviewInsightSnapshot,
  StoredReviewInsightSnapshot,
  SnapshotProjectState,
  SnapshotGoalState,
  SnapshotAreaState,
  SnapshotGoalContribution,
} from "./review-insight-snapshot";

export {
  GOAL_CONTRIBUTION_DISPLAY_RANK,
  MIN_TREND_POINTS,
  MAX_DISTRIBUTION_AREAS,
  MAX_PROJECT_CHANGES,
  MAX_GOAL_CONTRIBUTIONS,
  MAX_NAMED_CARRY_OVER,
  MAX_NAMED_IN_REASON,
  MAX_NAMED_PER_PLAN_FACT,
  classifyGoalContribution,
  classifyProjectHealthChange,
  trendDirection,
  seriesHeadline,
  seriesSummary,
  evaluateReviewInsights,
  REVIEW_INSIGHT_VIEW_QUERIES,
} from "./review-insights";
export type {
  InsightTone,
  InsightLink,
  Insight,
  PeriodPlanInsight,
  PlanAccountInsightEntry,
  GoalContributionState,
  GoalContributionInsight,
  ProjectHealthChangeKind,
  ProjectChangeInsight,
  TrendDirection,
  TrendPoint,
  InsightTrend,
  InsightComparison,
  ReviewInsights,
  ReviewInsightsInput,
} from "./review-insights";

export {
  MAX_OVERDUE_MOMENTS,
  MAX_TREND_PERIODS,
  MAX_CONTRIBUTION_ROWS,
  MAX_CARRY_OVER_TASKS,
} from "./review-insight-repository";
export type {
  ReviewInsightRepository,
  PeriodCountRequest,
  PeriodCountResult,
  PeriodOverdueResult,
} from "./review-insight-repository";
