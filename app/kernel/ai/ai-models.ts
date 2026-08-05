/**
 * AI-01 kernel — the server-owned provider and model registry.
 *
 * ONE place declares which models DalyHub is allowed to call, what they cost and
 * what each is eligible for. A browser NEVER names a provider model: it names a
 * DalyHub-internal alias (`economy` / `standard` / `deep`) or nothing at all, and
 * the server resolves that against this table (AGENTS.md §17 — validate at the
 * boundary).
 *
 * **Pricing is verified, dated and versioned, not remembered.** `PRICING_VERSION`
 * changes whenever a price or a model id in this file changes, and every usage
 * row records the version its estimate was computed under, so an old row is never
 * silently re-interpreted at a new price. A model with no verified price is
 * `costUnavailable` and is REFUSED for budgeted production use rather than
 * guessed at — an unpriced model must not bypass the budget system.
 *
 * Verification: see `docs/development/AI_PLATFORM.md` → "Model and pricing
 * verification" for the sources and the date each figure was read from them.
 */

/** The AI providers DalyHub can speak to. Neither is assumed to be configured. */
export const AI_PROVIDERS = ["anthropic", "openai"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

/** True when `value` names a supported provider. */
export function isAiProvider(value: unknown): value is AiProvider {
  return (
    typeof value === "string" &&
    (AI_PROVIDERS as readonly string[]).includes(value)
  );
}

/**
 * The three policy tiers. A tier is a POLICY statement ("how much may this cost,
 * and may it run without a second deliberate action?"), not a quality claim.
 */
export const AI_MODEL_TIERS = ["economy", "standard", "deep"] as const;
export type AiModelTier = (typeof AI_MODEL_TIERS)[number];

/** True when `value` names a policy tier. */
export function isAiModelTier(value: unknown): value is AiModelTier {
  return (
    typeof value === "string" &&
    (AI_MODEL_TIERS as readonly string[]).includes(value)
  );
}

/** Ordering used when a fallback must stay in the same tier OR cheaper. */
const TIER_RANK: Record<AiModelTier, number> = {
  economy: 0,
  standard: 1,
  deep: 2,
};

/** True when `candidate` is in the same tier as `required`, or cheaper. */
export function isSameOrCheaperTier(
  candidate: AiModelTier,
  required: AiModelTier,
): boolean {
  return TIER_RANK[candidate] <= TIER_RANK[required];
}

/**
 * How a provider is asked for a schema-shaped answer. DalyHub validates the
 * result against its OWN schema either way — this only selects the request shape.
 *
 * - `anthropic_tool`  — a single `tools` entry with `input_schema` plus
 *   `tool_choice: {type:"tool"}`, so the model answers by calling that one tool
 *   (Messages API, `anthropic-version: 2023-06-01`).
 * - `openai_json_schema` — `text.format = {type:"json_schema", strict:true}` on
 *   the Responses API.
 */
export const STRUCTURED_OUTPUT_METHODS = [
  "anthropic_tool",
  "openai_json_schema",
] as const;
export type StructuredOutputMethod = (typeof STRUCTURED_OUTPUT_METHODS)[number];

/** Availability of a registry entry. Only `available` models may be called. */
export const MODEL_AVAILABILITY = [
  "available",
  "retired",
  "unverified",
] as const;
export type ModelAvailability = (typeof MODEL_AVAILABILITY)[number];

/**
 * One approved model. `id` is the DalyHub-stable internal identifier and is the
 * ONLY model name that may ever appear in a stored row, a URL or a response body;
 * `providerModelId` is the provider's own string and stays server-side.
 */
export interface AiModelEntry {
  /** Stable internal id (never a provider string; safe to persist and render). */
  readonly id: string;
  readonly provider: AiProvider;
  /** The provider's own model identifier. Server-side only. */
  readonly providerModelId: string;
  readonly tier: AiModelTier;
  readonly structuredOutput: StructuredOutputMethod;
  /** Maximum input tokens DalyHub will assemble for this model (our cap, not the model's). */
  readonly maxInputTokens: number;
  /** Maximum output tokens DalyHub will request from this model. */
  readonly maxOutputTokens: number;
  /** USD per 1,000,000 input tokens, or `null` when not verified. */
  readonly inputUsdPerMillion: number | null;
  /** USD per 1,000,000 output tokens, or `null` when not verified. */
  readonly outputUsdPerMillion: number | null;
  readonly availability: ModelAvailability;
  /** Human-facing label for Settings. Never used as an identifier. */
  readonly label: string;
}

/**
 * The pricing/registry version. **Bump this whenever any price, model id or
 * availability below changes.** Stored on every usage row.
 */
export const PRICING_VERSION = "2026-08-05";

/**
 * The date the prices and model identifiers below were read from the providers'
 * own published pricing pages. Surfaced in Settings and in the docs so an owner
 * can see how fresh the cost estimates are.
 */
export const PRICING_VERIFIED_AT = "2026-08-05";

/**
 * The approved models. Small on purpose: three tiers × two providers. Adding a
 * model is a deliberate, reviewed, test-covered edit — DalyHub never adopts a
 * newly released model automatically.
 */
export const AI_MODEL_REGISTRY: readonly AiModelEntry[] = [
  // ── Anthropic ──────────────────────────────────────────────────────────────
  {
    id: "anthropic-economy",
    provider: "anthropic",
    providerModelId: "claude-haiku-4-5",
    tier: "economy",
    structuredOutput: "anthropic_tool",
    maxInputTokens: 60_000,
    maxOutputTokens: 4_000,
    inputUsdPerMillion: 1,
    outputUsdPerMillion: 5,
    availability: "available",
    label: "Claude Haiku 4.5",
  },
  {
    id: "anthropic-standard",
    provider: "anthropic",
    providerModelId: "claude-sonnet-5",
    tier: "standard",
    structuredOutput: "anthropic_tool",
    maxInputTokens: 90_000,
    maxOutputTokens: 6_000,
    // The standard rate is used for estimates, NOT the introductory rate that
    // runs to 2026-08-31: an estimate that assumes a promotion is an estimate
    // that under-reserves the budget the day the promotion ends.
    inputUsdPerMillion: 3,
    outputUsdPerMillion: 15,
    availability: "available",
    label: "Claude Sonnet 5",
  },
  {
    id: "anthropic-deep",
    provider: "anthropic",
    providerModelId: "claude-opus-5",
    tier: "deep",
    structuredOutput: "anthropic_tool",
    maxInputTokens: 120_000,
    maxOutputTokens: 8_000,
    inputUsdPerMillion: 5,
    outputUsdPerMillion: 25,
    availability: "available",
    label: "Claude Opus 5",
  },
  // ── OpenAI ─────────────────────────────────────────────────────────────────
  {
    id: "openai-economy",
    provider: "openai",
    providerModelId: "gpt-5-mini",
    tier: "economy",
    structuredOutput: "openai_json_schema",
    maxInputTokens: 60_000,
    maxOutputTokens: 4_000,
    inputUsdPerMillion: 0.25,
    outputUsdPerMillion: 2,
    availability: "available",
    label: "GPT-5 mini",
  },
  {
    id: "openai-standard",
    provider: "openai",
    providerModelId: "gpt-5.4",
    tier: "standard",
    structuredOutput: "openai_json_schema",
    maxInputTokens: 90_000,
    maxOutputTokens: 6_000,
    inputUsdPerMillion: 2.5,
    outputUsdPerMillion: 15,
    availability: "available",
    label: "GPT-5.4",
  },
  {
    id: "openai-deep",
    provider: "openai",
    providerModelId: "gpt-5.5",
    tier: "deep",
    structuredOutput: "openai_json_schema",
    maxInputTokens: 120_000,
    maxOutputTokens: 8_000,
    inputUsdPerMillion: 5,
    outputUsdPerMillion: 30,
    availability: "available",
    label: "GPT-5.5",
  },
];

/** Look one model up by its stable internal id. `null` when unknown. */
export function findAiModel(id: string): AiModelEntry | null {
  return AI_MODEL_REGISTRY.find((entry) => entry.id === id) ?? null;
}

/**
 * True when a model may be used for BUDGETED production work: it is `available`
 * and both of its prices are verified. An unpriced model is refused here rather
 * than allowed to run outside the budget system.
 */
export function isBudgetable(entry: AiModelEntry): boolean {
  return (
    entry.availability === "available" &&
    entry.inputUsdPerMillion !== null &&
    entry.outputUsdPerMillion !== null
  );
}

/** True when this entry has no verified cost and must be labelled as such. */
export function costUnavailable(entry: AiModelEntry): boolean {
  return (
    entry.inputUsdPerMillion === null || entry.outputUsdPerMillion === null
  );
}

/**
 * Resolve the budgetable model for a (provider, tier) pair. Returns `null` when
 * the provider has no usable model at that tier — the caller then reports
 * `model_unavailable` rather than quietly substituting a different tier.
 */
export function resolveModel(
  provider: AiProvider,
  tier: AiModelTier,
): AiModelEntry | null {
  return (
    AI_MODEL_REGISTRY.find(
      (entry) =>
        entry.provider === provider &&
        entry.tier === tier &&
        isBudgetable(entry),
    ) ?? null
  );
}

/** Every budgetable model a provider offers, in registry order. */
export function modelsForProvider(
  provider: AiProvider,
): readonly AiModelEntry[] {
  return AI_MODEL_REGISTRY.filter(
    (entry) => entry.provider === provider && isBudgetable(entry),
  );
}

/**
 * The estimated USD cost of a request at this model's verified prices. Throws
 * nothing: an unpriced model returns `null`, which callers must treat as "cost
 * unavailable — refuse", never as zero.
 */
export function estimateCostUsd(
  entry: AiModelEntry,
  inputTokens: number,
  outputTokens: number,
): number | null {
  if (entry.inputUsdPerMillion === null || entry.outputUsdPerMillion === null) {
    return null;
  }
  const input = Math.max(0, inputTokens);
  const output = Math.max(0, outputTokens);
  const usd =
    (input * entry.inputUsdPerMillion + output * entry.outputUsdPerMillion) /
    1_000_000;
  // Six decimal places: a single economy extraction can legitimately cost less
  // than a tenth of a cent, and rounding it to cents would round it to nothing.
  return Math.round(usd * 1_000_000) / 1_000_000;
}

/**
 * A deliberately conservative token estimate for text DalyHub is about to send.
 *
 * DalyHub does NOT call a provider's token-counting endpoint to size a request:
 * that would be a paid network round trip before the request it is sizing, and
 * the estimate exists precisely so the budget can be reserved BEFORE any call.
 * The ratio errs high (≈3.2 characters per token against a ~4 chars/token rule of
 * thumb) so a reservation is never smaller than the eventual charge. The truth is
 * always the provider's reported usage, which reconciles the reservation
 * afterwards (`ai-budget.ts`).
 */
export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  return Math.ceil(text.length / 3.2);
}
