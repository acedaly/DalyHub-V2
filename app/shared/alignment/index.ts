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

export { AlignmentIndicator } from "./AlignmentIndicator";
export { GoalAlignmentPanel } from "./GoalAlignmentPanel";
