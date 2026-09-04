/**
 * UIX-05 Analytics — the public kernel surface.
 *
 * Two pure modules and nothing else: the RANGE (which spans exist, and how each
 * is cut into buckets) and the EVALUATOR (what the surface renders, given one
 * range's facts). Analytics owns NO repository — every fact it works from is
 * read through contracts that already existed for the Review's evidence and for
 * AREA-03's alignment, which is what keeps this feature free of new storage,
 * new writes and new query budget.
 */

export {
  allowedGrains,
  previousSpan,
  type AnalyticsBucket,
  type AnalyticsSpan,
  DEFAULT_INSIGHT_WINDOW,
  GRAIN_LABELS,
  GRAIN_NOUNS,
  INSIGHT_GRAINS,
  INSIGHT_WINDOWS,
  insightWindow,
  insightWindowDays,
  parseInsightWindow,
  resolveInsightGrain,
  type InsightWindowId,
} from "./insight-range";

export {
  MAX_DISTRIBUTION_ROWS,
  deltaSentence,
  evaluateAnalytics,
  overdueSentence,
  type AnalyticsAreaRow,
  type AnalyticsCompletionCounts,
  type AnalyticsDelta,
  type AnalyticsDistributionRow,
  type AnalyticsFacts,
  type AnalyticsGoalSeries,
  type AnalyticsGoalTally,
  type AnalyticsMetric,
  type AnalyticsModel,
  type AnalyticsOverduePoint,
  type AnalyticsSeriesPoint,
} from "./analytics";
