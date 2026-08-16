/**
 * GOAL-02 Goal progress — shared presentation public surface.
 *
 * Re-exports the kernel measurement model (so consumers import it from one
 * place, mirroring `~/shared/alignment`) plus the React-free view-model and the
 * shared components the Goals module and Today both render.
 */

export {
  GOAL_MEASUREMENT_TYPES,
  GOAL_MEASUREMENT_TYPE_LABELS,
  GOAL_MEASUREMENT_TYPE_DESCRIPTIONS,
  GOAL_MEASUREMENT_UNIT_SUGGESTIONS,
  GOAL_MEASUREMENT_UNIT_MAX_LENGTH,
  GOAL_MEASUREMENT_NOTE_MAX_LENGTH,
  GOAL_MILESTONE_TITLE_MAX_LENGTH,
  GOAL_MILESTONE_MAX_WEIGHT,
  UNMEASURED_GOAL,
  evaluateGoalProgress,
  goalMeasurementAcceptsReadings,
  isGoalMeasurementConfigured,
  inferGoalMeasurementDirection,
  goalDaysBetween,
} from "~/kernel/goals";
export type {
  GoalMeasurementConfig,
  GoalMeasurementDirection,
  GoalMeasurementSummary,
  GoalMeasurementType,
  GoalMilestoneSummary,
  GoalProgressEvaluation,
  GoalProgressStatus,
  GoalProgressTrend,
} from "~/kernel/goals";

export {
  GOAL_PROGRESS_STATUS_LABELS,
  GOAL_PROGRESS_STATUS_TONES,
  GOAL_CHECK_IN_DUE_DAYS,
  evaluateGoalFromSeries,
  evaluateGoalFromSummary,
  formatMeasurementNumber,
  formatMeasurementValue,
  formatMeasurementChange,
  formatPacePerWeek,
  goalCheckInDue,
  goalCheckInLabel,
  goalTargetLabel,
  goalDaysToTarget,
  goalLastUpdatedText,
  goalIsOnTrack,
  goalNeedsAttention,
  goalPaceLabel,
  goalProgressStatusLabel,
  goalProgressStatusTone,
  goalProgressSummaryText,
  goalTrendSummaryText,
  serializeGoalMeasurement,
  serializeGoalMilestone,
  /* UIX-03 — the outcome vocabulary the redesigned card and record share. */
  GOAL_COLLECTION_VIEWS,
  GOAL_COLLECTION_VIEW_LABELS,
  goalAbsenceNote,
  goalJourneyLabel,
  goalMatchesCollectionView,
  goalOverTargetLabel,
  goalRemainingLabel,
  goalRowValue,
  parseGoalCollectionView,
} from "./goal-progress-view";
export type {
  SerializedGoalMeasurement,
  SerializedGoalMeasurementConfig,
  SerializedGoalMilestone,
  GoalCollectionView,
} from "./goal-progress-view";

export {
  GoalProgressReadout,
  type GoalProgressReadoutProps,
} from "./GoalProgressReadout";
/**
 * REDESIGN-04 — the Goal stat TRIO (`mockup3.png`): three equal figures under
 * quiet labels, replacing the UIX-03 quartet with its enlarged lead value.
 */
export { GoalStatTrio, type GoalStat } from "./GoalStatTrio";
export {
  GoalCheckInSheet,
  type GoalCheckInSheetProps,
  type GoalCheckInValues,
  type GoalCheckInOutcome,
} from "./GoalCheckInSheet";
export {
  GoalMeasurementSetupSheet,
  type GoalMeasurementSetupSheetProps,
  type GoalMeasurementSetupValues,
  type GoalMeasurementSetupOutcome,
} from "./GoalMeasurementSetupSheet";

/**
 * REDESIGN-04 — the SHARED bounded Goal summary read, promoted out of Today so
 * the Projects page's compact Goals section reuses it rather than adding a
 * second read for the same figures (§5.3).
 */
export {
  GOAL_SUMMARY_LIMIT,
  goalSummaryRank,
  loadGoalSummaries,
  type GoalSummary,
} from "./goal-summary-load";
