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
  classifyGoalContribution,
  classifyProjectHealthChange,
  trendDirection,
  seriesSummary,
  evaluateReviewInsights,
} from "./review-insights";
export type {
  InsightTone,
  InsightLink,
  Insight,
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
  MAX_TREND_PERIODS,
  MAX_CONTRIBUTION_ROWS,
  MAX_CARRY_OVER_TASKS,
} from "./review-insight-repository";
export type {
  ReviewInsightRepository,
  PeriodCountRequest,
  PeriodCountResult,
} from "./review-insight-repository";
