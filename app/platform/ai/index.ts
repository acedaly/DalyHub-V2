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
  readAiAvailabilityForFeatures,
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
  FAKE_PROVIDER_SCENARIOS,
  createFakeAdapter,
  fakeProviderEnabled,
  isFakeProviderScenario,
  type FakeAdapterConfig,
  type FakeProviderEnv,
  type FakeProviderScenario,
} from "./fake-provider";

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
  ASK_PARAMETER_BOUNDS,
  GROUNDED_ASK_EXAMPLES,
  GROUNDED_ASK_INTENTS,
  horizonPeriod,
  isGroundedAskIntent,
  lookbackPeriod,
  monthPeriod,
  periodsIn,
  resolveGroundedAskIntent,
  type AskPeriod,
  type GroundedAskIntent,
  type GroundedAskRequest,
} from "./ask-intents";

export {
  buildGroundedFacts,
  type GroundedFactsInput,
} from "./grounded-facts.server";

export { reportFactBlock, type ReportFactBlockInput } from "./report-facts";

export {
  MAX_CATEGORISATION_BATCH,
  MAX_CATEGORISATION_OPTIONS,
  buildFinanceCategorisationFacts,
  buildObligationFollowUpFacts,
  type CategorisationOption,
  type CategorisationRow,
  type FinanceCategorisationFacts,
  type ObligationFollowUpFacts,
} from "./assist-facts.server";
