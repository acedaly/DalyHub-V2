/**
 * AREA-03 Alignment — shared presentation public surface (ADR-040).
 *
 * Re-exports the kernel alignment model (so consumers import alignment from
 * one place) plus the React-free view-model and the two shared presentation
 * components used by the Goals collection and the Goal record.
 */

export {
  RECENT_ACTION_WINDOW_DAYS,
  evaluateGoalAlignment,
  composeGoalAlignmentFacts,
} from "~/kernel/alignment";
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
} from "~/kernel/alignment";

export {
  createOwnerAlignmentContext,
  alignmentToneToCardTone,
  alignmentReasonText,
  alignmentAccessibleSummary,
  alignmentNeedsAttention,
  compareAlignmentForDisplay,
  serializeGoalAlignmentEvidence,
  evidenceDateLabel,
} from "./alignment-view";
export type { SerializedGoalAlignmentEvidence } from "./alignment-view";

export { ownerZonedMidnightUtcIso, recentBoundaryStartIso } from "./window";

/**
 * FOLLOW-02 — Goal MOVEMENT, re-exported here because [ADR-110] decision 6 and
 * [DEBT-78] both name this barrel as its home: *"the derivation belongs in
 * `~/shared/alignment` beside the existing evaluator, so Today and the Goal
 * record cannot disagree."* The rules live in `~/kernel/alignment`; this is the
 * one import path every consumer uses, alongside the one component that draws
 * the answer.
 */
export {
  GOAL_MOVEMENT_KEYS,
  GOAL_MOVEMENT_KINDS,
  emptyGoalMovementFacts,
  evaluateGoalMovement,
  goalMovementEvidenceText,
  goalMovementEvidenceTexts,
  goalMovementRecap,
  goalMovementStatement,
  goalMovementWindowLabel,
  unavailableGoalMovement,
} from "~/kernel/alignment";
export type {
  GoalMovement,
  GoalMovementContext,
  GoalMovementEvidence,
  GoalMovementFacts,
  GoalMovementKey,
  GoalMovementKind,
  GoalMovementStatement,
  GoalMovementWordsOptions,
} from "~/kernel/alignment";

export { AlignmentIndicator } from "./AlignmentIndicator";
export { GoalAlignmentPanel } from "./GoalAlignmentPanel";
export {
  GoalMovementLine,
  type GoalMovementLineProps,
} from "./GoalMovementLine";
