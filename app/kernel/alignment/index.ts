/**
 * AREA-03 Alignment kernel — public surface (ADR-040).
 *
 * Modules and the composition boundary import the derived alignment model and
 * its read-only facts contract from here. Like the other kernel barrels it
 * exposes only storage-independent shapes and pure functions; the D1 facts
 * adapter is constructed from `app/platform/storage/d1`.
 */

export {
  RECENT_ACTION_WINDOW_DAYS,
  GOAL_ALIGNMENT_STATES,
  GOAL_ALIGNMENT_REASON_CODES,
  evaluateGoalAlignment,
  composeGoalAlignmentFacts,
  deduplicateGoalIds,
  daysBetweenIsoDates,
  addDaysToIsoDate,
  recentWindowStartIso,
} from "./goal-alignment";
export type {
  AlignmentTone,
  GoalAlignmentState,
  GoalAlignmentReasonCode,
  GoalAlignmentReason,
  GoalAlignmentActivityFacts,
  GoalAlignmentFacts,
  GoalAlignmentEvidence,
  GoalAlignment,
  AlignmentEvaluationContext,
} from "./goal-alignment";

export { AlignmentStorageError } from "./alignment-errors";
export type {
  AlignmentRepository,
  AlignmentWindow,
  GoalAlignmentEvidencePage,
} from "./alignment-repository";
