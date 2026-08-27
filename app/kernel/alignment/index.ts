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
  GOAL_ALIGNMENT_DISPLAY_RANK,
  goalAlignmentDisplayRank,
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

/**
 * FOLLOW-02 — Goal MOVEMENT: did this Goal move inside a named window?
 *
 * A third derived answer beside alignment and GOAL-02's measurement status, and
 * deliberately not a replacement for either ([ADR-110] decision 6, DEBT-78).
 */
export {
  GOAL_MOVEMENT_KEYS,
  GOAL_MOVEMENT_KINDS,
  emptyGoalMovementFacts,
  evaluateGoalMovement,
  unavailableGoalMovement,
} from "./goal-movement";
export type {
  GoalMovement,
  GoalMovementContext,
  GoalMovementEvidence,
  GoalMovementFacts,
  GoalMovementKey,
  GoalMovementKind,
} from "./goal-movement";

export {
  goalMovementEvidenceText,
  goalMovementEvidenceTexts,
  goalMovementRecap,
  goalMovementStatement,
  goalMovementWindowLabel,
} from "./goal-movement-words";
export type {
  GoalMovementStatement,
  GoalMovementWordsOptions,
} from "./goal-movement-words";

export { AlignmentStorageError } from "./alignment-errors";
export type {
  AlignmentRepository,
  AlignmentWindow,
  GoalAlignmentEvidencePage,
} from "./alignment-repository";
