/**
 * AI-01 shared — the AI proposal and citation surface.
 *
 * Client-safe by construction: it imports the AI KERNEL (pure contracts) and
 * nothing from `app/platform/ai/`, so no provider code, endpoint or credential
 * path can reach a browser bundle.
 */

export {
  AiCitationList,
  AiEvidenceDisclosure,
  AiFailure,
  AiProgress,
  AiRunDetails,
  AiSendNotice,
  AiUnavailable,
} from "./AiPanel";

export { AiExplainReport, type AiExplainReportProps } from "./AiExplainReport";

export {
  AiAssumptions,
  AiFactCitations,
  AiFactList,
  AiFactsWithoutExplanation,
  AiGroundedAnswer,
  type AiGroundedAnswerProps,
} from "./AiGrounded";

export {
  AiExtractionReview,
  type AiExtractionReviewProps,
} from "./AiExtractionReview";

export {
  AiExtractionSurface,
  type AiExtractionSurfaceProps,
} from "./AiExtractionSurface";

export {
  AiAssistSurface,
  type AiAssistSurfaceProps,
  type AiSurfaceAvailabilityGate,
} from "./AiAssistSurface";

export {
  AiProposalReview,
  type AiProposalReviewProps,
} from "./AiProposalReview";

export {
  applySummary,
  asCategorisation,
  asCategorisationContext,
  asFollowUp,
  asFollowUpContext,
  asReflection,
  asReflectionContext,
  categorisationItem,
  categorisationRows,
  followUpItem,
  followUpRows,
  patchRow,
  proposalOutcomeLabel,
  reflectionItem,
  reflectionRows,
  selectedRows,
  setAllSelected,
  type CategorisationContext,
  type CategorisationOptionContext,
  type CategorisationRowContext,
  type FollowUpContext,
  type ProposalOption,
  type ProposalRowDraft,
  type ProposalRowOutcome,
  type ReflectionContext,
} from "./proposal-view";

export {
  AiWeeklyReviewSurface,
  type AiWeeklyReviewSurfaceProps,
} from "./AiWeeklyReviewSurface";

export {
  NO_CANDIDATES,
  acceptancePayload,
  asActionExtraction,
  asAnswer,
  asGrounded,
  citedFacts,
  asExtraction,
  asWeeklyReview,
  dateBasisLabel,
  draftsFromExtraction,
  idempotencyKey,
  isBusy,
  noteDraftsFromExtraction,
  notePurposeLabel,
  type AiCandidates,
  type AiCitation,
  type AiDetail,
  type AiDisclosure,
  type AiSurfaceState,
  type NoteDraft,
  type TaskDraft,
} from "./ai-view";

export { useAiRequest, type AiRequestController } from "./use-ai-request";
