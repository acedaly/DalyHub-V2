/**
 * AI-01 platform — the server-side AI boundary.
 *
 * SERVER ONLY. Nothing in this directory may be imported by a component that
 * renders in the browser: it reads Worker secrets, constructs provider requests
 * and holds the only code that knows a provider endpoint exists. The module-level
 * import-boundary test enforces that.
 */

export {
  readAiAvailability,
  resolveAiContext,
  serializeCitations,
  type AiAvailability,
  type AiRequestContext,
  type SerializedCitation,
} from "./ai-availability";

export {
  aiConfigurationProblems,
  resolveAiConfiguration,
  type AiConfigEnv,
  type AiConfigurationSummary,
  type ResolvedAiConfiguration,
} from "./ai-configuration";

export {
  AI_ROUTING_MODES,
  ANTHROPIC_VERSION,
  areGatewayIdentifiersValid,
  gatewayHeaders,
  providerEndpoint,
  type AiRoutingMode,
  type GatewayIdentifiers,
} from "./provider-endpoints";

export {
  createAnthropicAdapter,
  readAnthropicResponse,
  type AnthropicAdapterConfig,
} from "./anthropic-adapter";

export {
  createOpenAiAdapter,
  readOpenAiResponse,
  type OpenAiAdapterConfig,
} from "./openai-adapter";

export {
  fetchJson,
  statusToAiError,
  type FetchJsonInput,
} from "./provider-transport";

export {
  EMPTY_CANDIDATES,
  hrefForEntity,
  renderCandidates,
  retrieveAnswerEvidence,
  retrieveMeetingEvidence,
  retrieveNoteEvidence,
  searchTerms,
  type CandidateSets,
  type RetrievalResult,
} from "./evidence-retrieval";

export {
  DETERMINISTIC_INTENTS,
  answerDeterministically,
  classifyDeterministicIntent,
  type DeterministicAnswer,
  type DeterministicIntent,
} from "./deterministic-answers";

export {
  aiResultStore,
  buildPlan,
  createResultStore,
  runAiRequest,
  schemaNameFor,
  selectModel,
  validationContext,
  type AiResultStore,
  type AiRunDetail,
  type RunAiRequestInput,
  type RunAiRequestOutput,
} from "./ai-runtime";

export {
  retrieveWeeklyReviewEvidence,
  type WeeklyReviewFacts,
} from "./weekly-review-evidence";
