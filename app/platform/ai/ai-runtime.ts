/**
 * AI-01 platform — the AI request runtime.
 *
 * ONE function owns the whole lifecycle, so there is one place the order is
 * enforced and one place to read it:
 *
 *    1. validate the feature request
 *    2. resolve the trusted workspace and actor (done by the caller's scope)
 *    3. resolve feature policy and owner policy
 *    4. retrieve bounded evidence
 *    5. apply privacy filtering
 *    6. estimate tokens and cost
 *    7. reserve budget (idempotently)
 *    8. make at most the allowed provider attempts
 *    9. validate the structured response against DalyHub's own schema
 *   10. reconcile usage against provider-reported tokens
 *   11. return a bounded result
 *   12. release or correct the unused reservation
 *
 * Nothing here writes DalyHub data. The result is a PROPOSAL or an ANSWER; the
 * apply path is separate, explicit and goes through the modules' own
 * repositories with the owner as the actor.
 */

import {
  AiError,
  budgetPeriodKeys,
  buildUserMessage,
  checkBudget,
  computeFingerprint,
  estimateCostUsd,
  estimateTokens,
  executeWithPolicy,
  findAiModel,
  isReusable,
  isSameOrCheaperTier,
  permittedCategories,
  promptForFeature,
  reconcile,
  releaseUnused,
  renderEvidenceBlock,
  resolveModel,
  resolveRequestedTier,
  schemaForFeature,
  toAiError,
  totalUsage,
  validateFeatureResult,
  aliasForTier,
  aiFeaturePolicy,
  featureAllowed,
  PRICING_VERSION,
  type AiFeatureId,
  type AiModelEntry,
  type AiPreferences,
  type AiProvider,
  type AiResult,
  type AiUsageRepository,
  type EvidenceSet,
  type ExecutionPlan,
  type ValidationContext,
} from "~/kernel/ai";

import type { ResolvedAiConfiguration } from "./ai-configuration";
import { renderCandidates, type CandidateSets } from "./evidence-retrieval";

/** What a caller hands the runtime. */
export interface RunAiRequestInput {
  readonly featureId: AiFeatureId;
  readonly ownerId: string;
  readonly preferences: AiPreferences;
  readonly configuration: ResolvedAiConfiguration;
  readonly usage: AiUsageRepository;
  /** The bounded evidence DalyHub assembled. */
  readonly evidence: EvidenceSet;
  /** The allowlists the model may reference. */
  readonly candidates: CandidateSets;
  /** Facts DalyHub calculated itself. */
  readonly derivedFacts: string;
  /** The owner's typed input, where the feature accepts one. */
  readonly ownerInput?: string;
  /** Ties this run to ONE deliberate owner action. */
  readonly idempotencyKey: string;
  /** True when the owner deliberately asked for deep analysis. */
  readonly requestDeep?: boolean;
  readonly signal?: AbortSignal;
  readonly now?: Date;
}

/** What the runtime returns. Never a provider body, never a secret. */
export interface RunAiRequestOutput {
  readonly result: AiResult;
  readonly usageId: string;
  /** Owner-facing details for the secondary disclosure. */
  readonly detail: AiRunDetail;
}

/** The cost and provenance details shown behind a disclosure control. */
export interface AiRunDetail {
  readonly provider: AiProvider;
  /** The DalyHub-internal model id, and its owner-facing label. */
  readonly modelId: string;
  readonly modelLabel: string;
  readonly tier: string;
  readonly promptVersion: string;
  readonly estimatedUsd: number;
  readonly reconciledUsd: number;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly pricingVersion: string;
  /** True when a fallback provider answered — never concealed. */
  readonly usedFallback: boolean;
  /** True when a previously validated result was returned unchanged. */
  readonly reused: boolean;
  /** When a reused result was originally generated. */
  readonly generatedAt: string | null;
  readonly evidenceCount: number;
  readonly evidenceTruncated: boolean;
}

/** The in-memory cache of validated results, keyed by usage-row id. */
export interface AiResultStore {
  readonly get: (id: string) => AiResult | null;
  readonly set: (id: string, result: AiResult) => void;
}

/**
 * A per-isolate result store.
 *
 * Generated results are NOT persisted by default: the ledger keeps metadata, and
 * `ai_usage_requests` has no column for a response body. Reuse therefore works
 * within an isolate's lifetime, which is exactly what duplicate-submit protection
 * and a quick "run it again" need. Persisting an answer is a deliberate,
 * feature-specific act (the Weekly Review summary the owner explicitly saves into
 * their own Review section) — not a default.
 */
export function createResultStore(limit = 40): AiResultStore {
  const entries = new Map<string, AiResult>();
  return {
    get: (id) => entries.get(id) ?? null,
    set: (id, result) => {
      if (entries.size >= limit) {
        const oldest = entries.keys().next().value;
        if (oldest !== undefined) entries.delete(oldest);
      }
      entries.set(id, result);
    },
  };
}

/** The process-wide store. One per isolate, bounded, never persisted. */
export const aiResultStore = createResultStore();

/**
 * Choose the model for a request: the owner's approved alias when it resolves and
 * still matches the tier, otherwise the registry default. An alias that no longer
 * resolves degrades to the default rather than failing the request.
 */
export function selectModel(
  preferences: AiPreferences,
  provider: AiProvider,
  tier: AiModelEntry["tier"],
): AiModelEntry | null {
  const alias = aliasForTier(preferences, tier);
  if (alias !== null) {
    const entry = findAiModel(alias);
    if (entry !== null && entry.provider === provider && entry.tier === tier) {
      return entry;
    }
  }
  return resolveModel(provider, tier);
}

/** Run one bounded AI request end to end. */
export async function runAiRequest(
  input: RunAiRequestInput,
): Promise<RunAiRequestOutput> {
  const now = input.now ?? new Date();
  const policy = aiFeaturePolicy(input.featureId);

  // 3 ─ Policy. Every refusal here happens before a provider exists.
  if (!input.preferences.enabled) throw new AiError("ai_disabled");
  if (!featureAllowed(input.preferences, input.featureId)) {
    throw new AiError("feature_not_allowed");
  }
  if (!input.configuration.anyProviderConfigured) {
    throw new AiError("provider_unconfigured");
  }

  const ownerInput = (input.ownerInput ?? "").trim();
  if (ownerInput.length > policy.maxOwnerInputCharacters) {
    throw new AiError("evidence_too_large", undefined, "owner_input");
  }

  // 5 ─ Privacy. Evidence was already filtered by the retriever using these same
  // categories; this re-derives them so the fingerprint records what was allowed.
  const allowed = permittedCategories(
    input.preferences,
    policy.defaultAllowedCategories,
  );
  if (
    input.evidence.excludedCategories.length > 0 &&
    input.evidence.items.length === 0
  ) {
    throw new AiError("consent_required");
  }
  if (input.evidence.items.length === 0) {
    throw new AiError("evidence_unavailable");
  }
  if (input.evidence.totalCharacters > policy.maxTotalEvidenceCharacters) {
    throw new AiError("evidence_too_large");
  }

  // The FEATURE's declared tier is the ceiling, and `resolveRequestedTier` owns
  // that rule. Asking for deep is not enough on its own: a request is promoted
  // only when the feature itself permits deep, so a crafted `deep=1` on a
  // form submission cannot escalate an economy capability into the premium
  // budget. The owner's `premiumAllowed` is a second, independent gate — it can
  // withhold deep, never grant it to a feature that does not allow it.
  const requestedTier = resolveRequestedTier(
    policy,
    input.requestDeep === true,
  );
  const tier =
    requestedTier === "deep" && !input.preferences.premiumAllowed
      ? policy.tier
      : requestedTier;

  const provider = pickProvider(input.preferences, input.configuration);
  const model = selectModel(input.preferences, provider, tier);
  if (model === null) throw new AiError("model_unavailable");

  // 4/6 ─ Assemble, then estimate. The estimate is computed from the exact bytes
  // that will be sent, not from a guess about them.
  const prompt = promptForFeature(input.featureId);
  const evidenceBlock = renderEvidenceBlock(input.evidence);
  const candidateBlock = renderCandidates(input.candidates);
  const userMessage = buildUserMessage({
    ownerRequest: ownerInput,
    derivedFacts: input.derivedFacts,
    candidates: candidateBlock,
    evidence: evidenceBlock,
  });

  const inputTokenEstimate =
    estimateTokens(prompt.system) + estimateTokens(userMessage);
  if (inputTokenEstimate > model.maxInputTokens) {
    throw new AiError("evidence_too_large");
  }
  const maxOutputTokens = Math.min(
    policy.maxOutputTokens,
    model.maxOutputTokens,
  );
  const estimateUsd = estimateCostUsd(
    model,
    inputTokenEstimate,
    maxOutputTokens,
  );
  if (estimateUsd === null) {
    // An unpriced model cannot be budgeted, so it is refused rather than run
    // outside the budget system.
    throw new AiError("model_unavailable", undefined, "unpriced");
  }

  const fingerprint = await computeFingerprint({
    featureId: input.featureId,
    promptVersion: prompt.promptVersion,
    provider,
    modelId: model.id,
    ownerInput,
    derivedFacts: input.derivedFacts,
    evidence: input.evidence,
    allowedCategories: [...allowed],
  });

  // Reuse, before any spend. A validated earlier answer for an identical request
  // whose sources have not moved is returned unchanged, labelled as reused.
  const reuseWindowStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const prior = await input.usage.findReusable({
    ownerId: input.ownerId,
    featureId: input.featureId,
    sourceFingerprint: fingerprint,
    notBefore: reuseWindowStart,
  });
  if (prior !== null) {
    const cached = aiResultStore.get(prior.id);
    if (
      cached !== null &&
      isReusable({
        storedFingerprint: prior.sourceFingerprint,
        currentFingerprint: fingerprint,
        generatedAt: prior.requestedAt,
        now,
        retention: input.preferences.resultRetention,
      })
    ) {
      return {
        result: cached,
        usageId: prior.id,
        detail: {
          provider: prior.provider,
          modelId: prior.modelId,
          modelLabel: findAiModel(prior.modelId)?.label ?? prior.modelId,
          tier: prior.tier,
          promptVersion: prior.promptVersion,
          estimatedUsd: 0,
          reconciledUsd: 0,
          inputTokens: prior.inputTokens,
          outputTokens: prior.outputTokens,
          pricingVersion: prior.pricingVersion,
          usedFallback: false,
          reused: true,
          generatedAt: prior.requestedAt.toISOString(),
          evidenceCount: input.evidence.items.length,
          evidenceTruncated: input.evidence.truncated,
        },
      };
    }
  }

  // 7 ─ Reserve. The budget check and the reservation happen together, and the
  // idempotency key means a refresh returns the same row rather than buying a
  // second request.
  const keys = budgetPeriodKeys(now);
  const totals = await input.usage.totals({
    day: keys.day,
    month: keys.month,
    featureId: input.featureId,
  });
  const decision = checkBudget({
    preferences: input.preferences,
    totals,
    estimateUsd,
    tier,
    featureDailyLimit: policy.dailyRequestLimit,
  });
  if (!decision.ok) throw decision.error;

  const sourceIds = input.evidence.items
    .map((item) => item.entityId)
    .filter((id): id is string => id !== null);

  const { record, created } = await input.usage.reserve({
    ownerId: input.ownerId,
    featureId: input.featureId,
    promptVersion: prompt.promptVersion,
    provider,
    modelId: model.id,
    tier,
    attempt: "primary",
    idempotencyKey: input.idempotencyKey,
    reservedUsd: decision.reserveUsd,
    pricingVersion: PRICING_VERSION,
    sourceFingerprint: fingerprint,
    sourceEntityIds: sourceIds,
  });

  if (!created) {
    // This exact owner action already ran. Return its result if we still hold it;
    // otherwise report honestly rather than paying again.
    const cached = aiResultStore.get(record.id);
    if (cached !== null) {
      return {
        result: cached,
        usageId: record.id,
        detail: detailFor(
          record.provider,
          record.modelId,
          record.tier,
          record.promptVersion,
          {
            estimatedUsd: record.estimatedUsd,
            reconciledUsd: record.estimatedUsd,
            inputTokens: record.inputTokens,
            outputTokens: record.outputTokens,
            pricingVersion: record.pricingVersion,
            usedFallback: false,
            reused: true,
            generatedAt: record.requestedAt.toISOString(),
            evidence: input.evidence,
          },
        ),
      };
    }
    if (record.state === "budget_reserved" || record.state === "running") {
      throw new AiError("concurrency_limited");
    }
    // TERMINAL state (succeeded / failed / cancelled / reused) and the result is
    // no longer held. This MUST refuse rather than fall through.
    //
    // Falling through would run a real, billed provider call against a
    // reservation that is already closed: `markRunning` only advances a
    // `budget_reserved` row and `complete` only settles `budget_reserved` or
    // `running`, so both would be silent no-ops and the spend would be neither
    // budgeted nor recorded. That is precisely the guarantee this platform
    // exists to make, and it is reachable in ordinary use — the surfaces build
    // repeatable keys, so a reload after an isolate recycled (or after the
    // bounded in-memory result store evicted the entry) replays the same key.
    //
    // The honest answer is that this exact owner action already ran and DalyHub
    // no longer has its result: ask again as a NEW action.
    throw new AiError("duplicate_request");
  }

  await input.usage.markRunning(record.id);

  // 8 ─ Attempt(s), under the documented retry and fallback policy.
  const plan = buildPlan({
    preferences: input.preferences,
    configuration: input.configuration,
    featureId: input.featureId,
    provider,
    model,
    allowFallback: policy.allowsProviderFallback,
    remainingUsd: Math.max(
      0,
      Math.min(
        input.preferences.dailyBudgetUsd - totals.dayUsd,
        input.preferences.monthlyBudgetUsd - totals.monthUsd,
      ),
    ),
  });

  /**
   * Provider-reported usage for a call that ACTUALLY reached the provider, held
   * outside the `try` so the failure path can see it.
   *
   * Without this, a response that arrives and then fails DalyHub's own schema
   * validation — an invented citation, a missing field — releases the entire
   * reservation and records zero tokens for work the provider will still bill.
   * Repeated invalid responses would then be free in DalyHub's budget and
   * expensive in the owner's account, which is the one thing this budget must
   * never get wrong.
   *
   * A failure BEFORE any response (timeout, transport, refusal) still releases
   * in full, because nothing was performed.
   */
  let charged: {
    readonly modelId: string;
    readonly inputTokens: number | null;
    readonly outputTokens: number | null;
  } | null = null;

  try {
    const execution = await executeWithPolicy(
      {
        model,
        system: prompt.system,
        userMessage,
        schema: schemaForFeature(input.featureId),
        schemaName: schemaNameFor(input.featureId),
        maxOutputTokens,
        timeoutMs: policy.timeoutMs,
        signal: input.signal,
      },
      plan,
    );

    // The provider answered. From this line on, a failure is DalyHub rejecting
    // the CONTENT — not the provider failing to perform work — so the tokens are
    // owed either way and must be reconciled rather than released.
    charged = {
      modelId: execution.response.modelId,
      ...totalUsage(execution.attempts),
    };

    // 9 ─ Validate against DalyHub's own schema. Model output is data until this
    // succeeds, and a citation of evidence we did not supply fails here.
    const context = validationContext(input.evidence, input.candidates);
    const result = validateFeatureResult(
      input.featureId,
      execution.response.value,
      context,
    );

    // A cancellation that lands after the provider answered must NOT be applied:
    // the owner said stop, so the result is discarded and the spend is recorded
    // honestly rather than pretending nothing happened.
    if (input.signal?.aborted === true) {
      const usage = totalUsage(execution.attempts);
      const actual = actualCost(execution.response.modelId, usage);
      await input.usage.complete(record.id, {
        state: "cancelled",
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        estimatedUsd: actual ?? decision.reserveUsd,
        failureCode: "cancelled",
      });
      throw new AiError("cancelled");
    }

    // 10 ─ Reconcile against provider-reported tokens.
    const usage = totalUsage(execution.attempts);
    const actual = actualCost(execution.response.modelId, usage);
    const reconciled = reconcile(decision.reserveUsd, actual);

    await input.usage.complete(record.id, {
      state: "succeeded",
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      estimatedUsd: reconciled.actualUsd,
    });
    aiResultStore.set(record.id, result);

    const usedFallback = execution.attempts.some(
      (attempt) => attempt.kind === "fallback" && attempt.failureCode === null,
    );

    return {
      result,
      usageId: record.id,
      detail: detailFor(
        execution.response.provider,
        execution.response.modelId,
        tier,
        prompt.promptVersion,
        {
          estimatedUsd: decision.reserveUsd,
          reconciledUsd: reconciled.actualUsd,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          pricingVersion: PRICING_VERSION,
          usedFallback,
          reused: false,
          generatedAt: null,
          evidence: input.evidence,
        },
      ),
    };
  } catch (cause) {
    // 12 ─ Release. A request that produced nothing returns its whole
    // reservation; a request the provider partially performed keeps what the
    // provider says it used.
    const error = toAiError(cause);
    const actual =
      charged === null ? null : actualCost(charged.modelId, charged);
    await input.usage.complete(record.id, {
      state: error.code === "cancelled" ? "cancelled" : "failed",
      inputTokens: charged?.inputTokens ?? null,
      outputTokens: charged?.outputTokens ?? null,
      // Nothing performed → release the whole reservation. Performed but
      // rejected → keep what the provider says it used, falling back to the
      // reservation when the model's price is unknown, because guessing zero
      // would be the one wrong answer.
      estimatedUsd:
        charged === null ? releaseUnused(0) : (actual ?? decision.reserveUsd),
      failureCode: error.code,
    });
    throw error;
  }
}

/** The USD cost of provider-reported usage at the registry price. */
function actualCost(
  modelId: string,
  usage: { inputTokens: number | null; outputTokens: number | null },
): number | null {
  const entry = findAiModel(modelId);
  if (entry === null) return null;
  if (usage.inputTokens === null && usage.outputTokens === null) return null;
  return estimateCostUsd(
    entry,
    usage.inputTokens ?? 0,
    usage.outputTokens ?? 0,
  );
}

/** Assemble the owner-facing detail block. */
function detailFor(
  provider: AiProvider,
  modelId: string,
  tier: string,
  promptVersion: string,
  extra: {
    estimatedUsd: number;
    reconciledUsd: number;
    inputTokens: number | null;
    outputTokens: number | null;
    pricingVersion: string;
    usedFallback: boolean;
    reused: boolean;
    generatedAt: string | null;
    evidence: EvidenceSet;
  },
): AiRunDetail {
  return {
    provider,
    modelId,
    modelLabel: findAiModel(modelId)?.label ?? modelId,
    tier,
    promptVersion,
    estimatedUsd: extra.estimatedUsd,
    reconciledUsd: extra.reconciledUsd,
    inputTokens: extra.inputTokens,
    outputTokens: extra.outputTokens,
    pricingVersion: extra.pricingVersion,
    usedFallback: extra.usedFallback,
    reused: extra.reused,
    generatedAt: extra.generatedAt,
    evidenceCount: extra.evidence.items.length,
    evidenceTruncated: extra.evidence.truncated,
  };
}

/** The validation context: everything the model is permitted to reference. */
export function validationContext(
  evidence: EvidenceSet,
  candidates: CandidateSets,
): ValidationContext {
  return {
    evidenceIds: new Set(evidence.items.map((item) => item.id)),
    projectCandidateIds: new Set(candidates.projects.map((entry) => entry.id)),
    personCandidateIds: new Set(candidates.people.map((entry) => entry.id)),
    linkCandidateIds: new Set(candidates.links.map((entry) => entry.id)),
  };
}

/** A short, stable schema name both provider APIs accept. */
export function schemaNameFor(feature: AiFeatureId): string {
  switch (feature) {
    case "meeting-action-extraction":
    case "note-action-extraction":
      return "dalyhub_action_extraction";
    case "weekly-review-assistant":
      return "dalyhub_weekly_review";
    case "workspace-question-answer":
      return "dalyhub_workspace_answer";
  }
}

/**
 * Choose the provider: the owner's default when it is configured, otherwise the
 * only configured one. Never a request value.
 */
function pickProvider(
  preferences: AiPreferences,
  configuration: ResolvedAiConfiguration,
): AiProvider {
  if (configuration.isConfigured(preferences.defaultProvider)) {
    return preferences.defaultProvider;
  }
  const first = configuration.summary.configuredProviders[0];
  if (first === undefined) throw new AiError("provider_unconfigured");
  return first;
}

/**
 * Build the execution plan.
 *
 * A fallback exists only when EVERY condition holds: the feature allows it, the
 * owner allows it, the other provider is configured, its model is in the same or
 * a cheaper tier, and the remaining budget still covers it. Any one missing and
 * `fallback` is `null` — there is no partial fallback.
 */
export function buildPlan(input: {
  readonly preferences: AiPreferences;
  readonly configuration: ResolvedAiConfiguration;
  readonly featureId: AiFeatureId;
  readonly provider: AiProvider;
  readonly model: AiModelEntry;
  readonly allowFallback: boolean;
  readonly remainingUsd: number;
}): ExecutionPlan {
  const primary = {
    adapter: input.configuration.adapterFor(input.provider, input.featureId),
    model: input.model,
  };

  const other: AiProvider =
    input.provider === "anthropic" ? "openai" : "anthropic";
  let fallback: ExecutionPlan["fallback"] = null;

  if (
    input.allowFallback &&
    input.preferences.providerFallbackAllowed &&
    input.configuration.isConfigured(other)
  ) {
    const candidate = selectModel(input.preferences, other, input.model.tier);
    if (
      candidate !== null &&
      isSameOrCheaperTier(candidate.tier, input.model.tier)
    ) {
      const cost = estimateCostUsd(
        candidate,
        candidate.maxInputTokens / 4,
        candidate.maxOutputTokens,
      );
      if (cost !== null && cost <= input.remainingUsd) {
        fallback = {
          adapter: input.configuration.adapterFor(other, input.featureId),
          model: candidate,
        };
      }
    }
  }

  return { primary, fallback, allowRetry: true };
}
