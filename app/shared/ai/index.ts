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

export {
  AiExtractionReview,
  type AiExtractionReviewProps,
} from "./AiExtractionReview";

export {
  AiExtractionSurface,
  type AiExtractionSurfaceProps,
} from "./AiExtractionSurface";

export {
  AiWeeklyReviewSurface,
  type AiWeeklyReviewSurfaceProps,
} from "./AiWeeklyReviewSurface";

export {
  NO_CANDIDATES,
  acceptancePayload,
  asAnswer,
  asExtraction,
  asWeeklyReview,
  dateBasisLabel,
  draftsFromExtraction,
  idempotencyKey,
  isBusy,
  type AiCandidates,
  type AiCitation,
  type AiDetail,
  type AiDisclosure,
  type AiSurfaceState,
  type TaskDraft,
} from "./ai-view";

export { useAiRequest, type AiRequestController } from "./use-ai-request";
