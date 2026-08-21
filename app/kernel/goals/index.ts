/**
 * AREA-02 Goals kernel — public surface.
 */

export type {
  GoalAreaContext,
  GoalOverview,
  GoalProjectFact,
  GoalProjectContribution,
  GoalProjectItem,
  GoalChildrenInput,
  GoalProjectPage,
  GoalListItem,
  GoalListInput,
  GoalListPage,
  GoalSearchInput,
  GoalSearchHit,
  GoalAlignmentListInput,
  GoalAlignmentListPage,
} from "./goal";

export {
  evaluateGoalProjectContribution,
  EMPTY_GOAL_PROJECT_CONTRIBUTION,
} from "./goal-progress";

export type { GoalRepository } from "./goal-repository";
export type { GoalDetailsRepository } from "./goal-details-repository";
export type {
  GoalMeasurementRepository,
  GoalMeasurementSeriesInput,
  GoalMeasurementSummaryInput,
} from "./goal-measurement-repository";
export { GoalStorageError } from "./goal-errors";

/* GOAL-02 — the measurable-Goal domain. */
export {
  GOAL_MEASUREMENT_TYPES,
  GOAL_MEASUREMENT_DIRECTIONS,
  GOAL_MEASUREMENT_TYPE_LABELS,
  GOAL_MEASUREMENT_TYPE_DESCRIPTIONS,
  GOAL_MEASUREMENT_UNIT_SUGGESTIONS,
  GOAL_MEASUREMENT_UNIT_MAX_LENGTH,
  GOAL_MEASUREMENT_NOTE_MAX_LENGTH,
  GOAL_MEASUREMENT_VALUE_LIMIT,
  GOAL_MILESTONE_TITLE_MAX_LENGTH,
  GOAL_MILESTONE_ORDER_MAX_LENGTH,
  GoalMilestoneOrderStaleError,
  GOAL_MILESTONE_MAX_WEIGHT,
  GOAL_MEASUREMENT_LOGGED,
  GOAL_MEASUREMENT_CORRECTED,
  GOAL_MEASUREMENT_REMOVED,
  GOAL_TARGET_REACHED,
  GOAL_MILESTONE_COMPLETED,
  GOAL_MILESTONE_REOPENED,
  UNMEASURED_GOAL,
  EMPTY_GOAL_MILESTONE_SUMMARY,
  parseGoalMeasurementType,
  parseGoalMeasurementDirection,
  inferGoalMeasurementDirection,
  normalizeGoalMeasurementConfig,
  isGoalMeasurementConfigured,
  goalMeasurementAcceptsReadings,
  validateGoalMeasurementDate,
  validateGoalMeasurementValue,
  validateOptionalGoalMeasurementValue,
  normalizeGoalMeasurementNote,
  normalizeGoalMeasurementUnit,
  validateGoalMilestoneOrder,
  validateGoalMilestoneTitle,
  validateGoalMilestoneWeight,
  GoalMeasurementValidationError,
  GoalMeasurementNotFoundError,
  GoalMeasurementStorageError,
} from "./goal-measurement";
export type {
  GoalMeasurementType,
  GoalMeasurementDirection,
  GoalMeasurementConfig,
  GoalMeasurement,
  GoalMeasurementPoint,
  GoalMeasurementSummary,
  GoalMeasurementValidationField,
  GoalMilestone,
  GoalMilestoneSummary,
  NewGoalMeasurementInput,
  NewGoalMilestoneInput,
  UpdateGoalMeasurementInput,
  UpdateGoalMilestoneInput,
} from "./goal-measurement";

export {
  evaluateGoalProgress,
  goalDaysBetween,
  UNMEASURED_GOAL_PROGRESS,
  GOAL_TREND_WINDOW_DAYS,
  GOAL_TREND_MIN_SPAN_DAYS,
  GOAL_STALE_AFTER_DAYS,
  GOAL_SCHEDULE_MARGIN,
  GOAL_MAX_PROJECTION_DAYS,
} from "./goal-progress-evaluator";
export type {
  GoalProgressEvaluation,
  GoalProgressFacts,
  GoalProgressContext,
  GoalProgressStatus,
  GoalProgressTrend,
  GoalTrendDirection,
} from "./goal-progress-evaluator";

export {
  GOAL_DETAILS_UPDATED,
  GOAL_DEFINITION_OF_DONE_MAX_LENGTH,
  validateGoalTargetDate,
  isValidGoalTargetDate,
  normalizeGoalDefinitionOfDone,
  resolveGoalMeasurementConfig,
  readGoalMeasurementConfig,
  validateGoalMeasurementPatch,
  GoalDetailsValidationError,
  GoalDetailsNotFoundError,
  GoalDetailsStorageError,
  GoalDetailsConflictError,
} from "./goal-details";
export type {
  GoalDetails,
  GoalDetailsRecord,
  UpdateGoalDetailsInput,
  GoalDetailsChangeResult,
  GoalDetailsValidationField,
} from "./goal-details";

export {
  GOAL_CURSOR_VERSION,
  encodeGoalCursor,
  decodeGoalCursor,
  decodeGoalCursorForScope,
  goalCursorScopeMatches,
} from "./goal-cursor";
export type {
  GoalCursorPosition,
  GoalCursorScope,
  DecodedGoalCursor,
} from "./goal-cursor";

export {
  GOAL_LIST_CURSOR_VERSION,
  encodeGoalListCursor,
  decodeGoalListCursor,
  decodeGoalListCursorForScope,
  goalListCursorScopeMatches,
} from "./goal-list-cursor";
export type {
  GoalListCursorPosition,
  GoalListCursorScope,
  DecodedGoalListCursor,
} from "./goal-list-cursor";

export {
  GOAL_ALIGNMENT_CURSOR_VERSION,
  GOAL_ALIGNMENT_CURSOR_SORT,
  encodeGoalAlignmentCursor,
  decodeGoalAlignmentCursor,
  decodeGoalAlignmentCursorForScope,
  goalAlignmentCursorScopeMatches,
} from "./goal-alignment-cursor";
export type {
  GoalAlignmentCursorPosition,
  GoalAlignmentCursorScope,
  DecodedGoalAlignmentCursor,
} from "./goal-alignment-cursor";
