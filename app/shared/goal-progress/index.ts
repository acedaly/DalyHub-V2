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
  goalCurrentAgainstTarget,
  goalDaysToTarget,
  goalLastUpdatedText,
  goalNeedsAttention,
  goalPaceLabel,
  goalProgressStatusLabel,
  goalProgressStatusTone,
  goalProgressSummaryText,
  goalTrendSummaryText,
  serializeGoalMeasurement,
  serializeGoalMilestone,
} from "./goal-progress-view";
export type {
  SerializedGoalMeasurement,
  SerializedGoalMeasurementConfig,
  SerializedGoalMilestone,
} from "./goal-progress-view";

export {
  GoalProgressReadout,
  type GoalProgressReadoutProps,
} from "./GoalProgressReadout";
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
