/**
 * AI-01 — the provider-independent policy suite.
 *
 * These are the rules that make the AI platform safe to point at a paid API:
 * the model allowlist, tier selection, budgets, reservation and reconciliation,
 * the request state machine, retry and fallback, the source fingerprint and the
 * typed error mapping. All of it is pure, so none of it needs a database, a
 * network or a key.
 */

import { describe, expect, it } from "vitest";

import {
  AI_MODEL_REGISTRY,
  AI_MODEL_TIERS,
  AI_PROVIDERS,
  AiError,
  DEFAULT_AI_PREFERENCES,
  EMPTY_BUDGET_TOTALS,
  MAX_MONTHLY_BUDGET_USD,
  aiErrorMessage,
  aiErrorStatus,
  aiFeaturePolicy,
  allAiFeaturePolicies,
  resolveRequestedTier,
  budgetPeriodKeys,
  budgetRemaining,
  budgetSnapshot,
  canTransition,
  checkBudget,
  costUnavailable,
  estimateCostUsd,
  estimateTokens,
  findAiModel,
  formatUsd,
  isBudgetable,
  isPolicyError,
  isSameOrCheaperTier,
  isTerminalRequestState,
  isAiErrorCode,
  isTransientError,
  normaliseAiPreferences,
  parseBudgetUsd,
  permittedCategories,
  reconcile,
  releaseUnused,
  resolveModel,
  toAiError,
  transition,
  type AiPreferences,
} from "~/kernel/ai";

const prefs = (patch: Partial<AiPreferences> = {}): AiPreferences =>
  normaliseAiPreferences({
    ...DEFAULT_AI_PREFERENCES,
    enabled: true,
    ...patch,
  });

describe("provider and model registry", () => {
  it("declares every model with a stable internal id that is never a provider string", () => {
    for (const entry of AI_MODEL_REGISTRY) {
      expect(entry.id).not.toBe(entry.providerModelId);
      expect(entry.id).toMatch(/^(anthropic|openai)-(economy|standard|deep)$/);
    }
  });

  it("has exactly one budgetable model per provider and tier", () => {
    for (const provider of AI_PROVIDERS) {
      for (const tier of AI_MODEL_TIERS) {
        const matches = AI_MODEL_REGISTRY.filter(
          (entry) =>
            entry.provider === provider &&
            entry.tier === tier &&
            isBudgetable(entry),
        );
        expect(matches).toHaveLength(1);
      }
    }
  });

  it("resolves a model only through the allowlist", () => {
    expect(resolveModel("anthropic", "economy")?.id).toBe("anthropic-economy");
    expect(findAiModel("not-a-model")).toBeNull();
  });

  it("prices every shipped model, so none can bypass the budget", () => {
    for (const entry of AI_MODEL_REGISTRY) {
      expect(costUnavailable(entry)).toBe(false);
    }
  });

  it("refuses to estimate a cost for an unpriced model rather than guessing zero", () => {
    const unpriced = {
      ...AI_MODEL_REGISTRY[0],
      inputUsdPerMillion: null,
      outputUsdPerMillion: null,
    };
    expect(estimateCostUsd(unpriced, 1000, 1000)).toBeNull();
    expect(isBudgetable(unpriced)).toBe(false);
  });

  it("estimates cost from the registry price", () => {
    const model = resolveModel("anthropic", "economy");
    expect(model).not.toBeNull();
    // 1M input at $1 + 1M output at $5.
    expect(estimateCostUsd(model!, 1_000_000, 1_000_000)).toBeCloseTo(6, 6);
  });

  it("errs HIGH when estimating tokens, so a reservation is never too small", () => {
    // ~4 chars/token is the common rule of thumb; DalyHub uses 3.2 deliberately.
    const text = "a".repeat(3200);
    expect(estimateTokens(text)).toBe(1000);
    expect(estimateTokens(text)).toBeGreaterThan(3200 / 4);
  });

  it("only allows a fallback in the same tier or cheaper", () => {
    expect(isSameOrCheaperTier("economy", "standard")).toBe(true);
    expect(isSameOrCheaperTier("standard", "standard")).toBe(true);
    expect(isSameOrCheaperTier("deep", "standard")).toBe(false);
  });
});

describe("feature policy", () => {
  it("bounds every feature", () => {
    for (const policy of allAiFeaturePolicies()) {
      expect(policy.maxEvidenceRecords).toBeGreaterThan(0);
      expect(policy.maxTotalEvidenceCharacters).toBeGreaterThan(0);
      expect(policy.maxOutputTokens).toBeGreaterThan(0);
      expect(policy.timeoutMs).toBeGreaterThan(0);
      expect(policy.dailyRequestLimit).toBeGreaterThan(0);
    }
  });

  it("keeps the three visible capabilities out of the deep tier", () => {
    expect(aiFeaturePolicy("meeting-action-extraction").tier).toBe("economy");
    expect(aiFeaturePolicy("note-action-extraction").tier).toBe("economy");
    expect(aiFeaturePolicy("weekly-review-assistant").tier).toBe("standard");
    expect(aiFeaturePolicy("workspace-question-answer").tier).toBe("standard");
  });

  it("accepts owner input ONLY where the feature declares it", () => {
    expect(
      aiFeaturePolicy("meeting-action-extraction").maxOwnerInputCharacters,
    ).toBe(0);
    expect(
      aiFeaturePolicy("workspace-question-answer").maxOwnerInputCharacters,
    ).toBeGreaterThan(0);
  });

  it("never lets Ask DalyHub produce a proposal that writes records", () => {
    expect(aiFeaturePolicy("workspace-question-answer").producesProposals).toBe(
      false,
    );
  });
});

describe("preferences", () => {
  it("defaults to AI OFF, so DalyHub is unchanged until the owner decides", () => {
    expect(DEFAULT_AI_PREFERENCES.enabled).toBe(false);
    expect(DEFAULT_AI_PREFERENCES.premiumAllowed).toBe(false);
    expect(DEFAULT_AI_PREFERENCES.loggingMode).toBe("metadata_only");
    expect(DEFAULT_AI_PREFERENCES.allowedCategories).toEqual(["general"]);
  });

  it("defaults to a conservative $10 monthly budget", () => {
    expect(DEFAULT_AI_PREFERENCES.monthlyBudgetUsd).toBe(10);
  });

  it("clamps a stored budget above the ceiling rather than honouring it", () => {
    const normalised = normaliseAiPreferences({ monthlyBudgetUsd: 999_999 });
    expect(normalised.monthlyBudgetUsd).toBe(MAX_MONTHLY_BUDGET_USD);
  });

  it("drops an unknown stored feature and an unknown category", () => {
    const normalised = normaliseAiPreferences({
      allowedFeatures: ["meeting-action-extraction", "nonsense"] as never,
      allowedCategories: ["health", "nonsense"] as never,
    });
    expect(normalised.allowedFeatures).toEqual(["meeting-action-extraction"]);
    expect(normalised.allowedCategories).toEqual(["general", "health"]);
  });

  it("always keeps `general` allowed, so consent never blocks ordinary Tasks", () => {
    expect(
      normaliseAiPreferences({ allowedCategories: [] }).allowedCategories,
    ).toContain("general");
  });

  it("refuses a negative or non-numeric budget", () => {
    expect(() => parseBudgetUsd("-1", "monthlyBudgetUsd", 100)).toThrow();
    expect(() => parseBudgetUsd("lots", "monthlyBudgetUsd", 100)).toThrow();
    expect(() => parseBudgetUsd("1000", "monthlyBudgetUsd", 100)).toThrow();
    expect(parseBudgetUsd("12.34", "monthlyBudgetUsd", 100)).toBe(12.34);
  });

  it("permits a sensitive category only when the owner has allowed it", () => {
    const policy = aiFeaturePolicy("meeting-action-extraction");
    expect(
      permittedCategories(prefs(), policy.defaultAllowedCategories).has(
        "health",
      ),
    ).toBe(false);
    expect(
      permittedCategories(
        prefs({ allowedCategories: ["general", "health"] }),
        policy.defaultAllowedCategories,
      ).has("health"),
    ).toBe(true);
  });
});

describe("budget", () => {
  it("derives UTC period keys, so a period never shifts with daylight saving", () => {
    const keys = budgetPeriodKeys(new Date("2026-08-05T13:45:00.000Z"));
    expect(keys).toEqual({ day: "2026-08-05", month: "2026-08" });
  });

  it("permits a request that fits", () => {
    const decision = checkBudget({
      preferences: prefs(),
      totals: EMPTY_BUDGET_TOTALS,
      estimateUsd: 0.02,
      tier: "economy",
      featureDailyLimit: 10,
    });
    expect(decision.ok).toBe(true);
  });

  it("counts a live RESERVATION as spend, so two requests cannot share the last dollar", () => {
    const preferences = prefs({ monthlyBudgetUsd: 1, dailyBudgetUsd: 1 });
    const decision = checkBudget({
      preferences,
      totals: { ...EMPTY_BUDGET_TOTALS, dayUsd: 0.9, monthUsd: 0.9 },
      estimateUsd: 0.2,
      tier: "economy",
      featureDailyLimit: 10,
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.error.code).toBe("daily_budget_reached");
  });

  it("reports the MOST specific refusal: concurrency, then feature, then budgets", () => {
    const preferences = prefs();
    const concurrency = checkBudget({
      preferences,
      totals: { ...EMPTY_BUDGET_TOTALS, inFlight: 2 },
      estimateUsd: 0.01,
      tier: "economy",
      featureDailyLimit: 10,
    });
    expect(concurrency.ok).toBe(false);
    if (!concurrency.ok) {
      expect(concurrency.error.code).toBe("concurrency_limited");
    }

    const perFeature = checkBudget({
      preferences,
      totals: { ...EMPTY_BUDGET_TOTALS, featureRequestsToday: 10 },
      estimateUsd: 0.01,
      tier: "economy",
      featureDailyLimit: 10,
    });
    expect(perFeature.ok).toBe(false);
    if (!perFeature.ok) expect(perFeature.error.code).toBe("rate_limited");
  });

  it("refuses the deep tier unless the owner has permitted it", () => {
    const decision = checkBudget({
      preferences: prefs({ premiumAllowed: false }),
      totals: EMPTY_BUDGET_TOTALS,
      estimateUsd: 0.01,
      tier: "deep",
      featureDailyLimit: 10,
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.error.code).toBe("feature_not_allowed");
  });

  it("enforces the premium sub-budget separately from the monthly one", () => {
    const decision = checkBudget({
      preferences: prefs({ premiumAllowed: true, premiumBudgetUsd: 1 }),
      totals: { ...EMPTY_BUDGET_TOTALS, monthPremiumUsd: 0.95 },
      estimateUsd: 0.2,
      tier: "deep",
      featureDailyLimit: 10,
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok)
      expect(decision.error.code).toBe("premium_budget_reached");
  });

  it("reconciles DOWN and releases the difference", () => {
    const result = reconcile(0.05, 0.012);
    expect(result.actualUsd).toBe(0.012);
    expect(result.releasedUsd).toBeCloseTo(0.038, 6);
    expect(result.overrunUsd).toBe(0);
  });

  it("reconciles UP and records the overrun rather than hiding it", () => {
    const result = reconcile(0.01, 0.03);
    expect(result.overrunUsd).toBeCloseTo(0.02, 6);
    expect(result.releasedUsd).toBe(0);
  });

  it("keeps the reservation when the provider reported no usage at all", () => {
    expect(reconcile(0.04, null).actualUsd).toBe(0.04);
  });

  it("releases the whole reservation for a request that produced nothing", () => {
    expect(releaseUnused(0.05)).toBe(0.05);
  });

  it("never reports negative remaining headroom", () => {
    const remaining = budgetRemaining(prefs({ monthlyBudgetUsd: 1 }), {
      ...EMPTY_BUDGET_TOTALS,
      monthUsd: 5,
    });
    expect(remaining.monthUsd).toBe(0);
  });

  it("marks the snapshot exhausted when any ceiling is spent", () => {
    const snapshot = budgetSnapshot(
      prefs({ dailyBudgetUsd: 1 }),
      { ...EMPTY_BUDGET_TOTALS, dayUsd: 1 },
      budgetPeriodKeys(new Date("2026-08-05T00:00:00.000Z")),
    );
    expect(snapshot.exhausted).toBe(true);
  });

  it("shows sub-cent amounts honestly rather than as $0.00", () => {
    expect(formatUsd(0.0004)).toBe("$0.0004");
    expect(formatUsd(1.5)).toBe("$1.50");
  });
});

describe("request state machine", () => {
  it("allows only the declared transitions", () => {
    expect(canTransition("planned", "budget_reserved")).toBe(true);
    expect(canTransition("budget_reserved", "running")).toBe(true);
    expect(canTransition("running", "succeeded")).toBe(true);
    expect(canTransition("running", "budget_reserved")).toBe(false);
    expect(canTransition("succeeded", "running")).toBe(false);
  });

  it("treats every outcome as terminal", () => {
    for (const state of [
      "succeeded",
      "failed",
      "cancelled",
      "reused",
    ] as const) {
      expect(isTerminalRequestState(state)).toBe(true);
      expect(transition(state, "running")).toBeNull();
    }
  });

  it("lets a reservation be cancelled before it runs", () => {
    expect(transition("budget_reserved", "cancelled")).toBe("cancelled");
  });
});

describe("typed errors", () => {
  it("gives every code owner-facing copy and a status", () => {
    for (const code of [
      "ai_disabled",
      "provider_unconfigured",
      "monthly_budget_reached",
      "provider_timeout",
      "provider_response_invalid",
      "cancelled",
    ] as const) {
      expect(aiErrorMessage(code).length).toBeGreaterThan(0);
      expect(aiErrorStatus(code)).toBeGreaterThanOrEqual(400);
    }
  });

  it("never retries a policy refusal", () => {
    expect(isPolicyError("monthly_budget_reached")).toBe(true);
    expect(isTransientError("monthly_budget_reached")).toBe(false);
  });

  it("retries only transport conditions — never a schema failure", () => {
    expect(isTransientError("provider_timeout")).toBe(true);
    expect(isTransientError("provider_unavailable")).toBe(true);
    expect(isTransientError("rate_limited")).toBe(true);
    expect(isTransientError("provider_response_invalid")).toBe(false);
  });

  it("maps an abort to `cancelled` and anything else to `internal`", () => {
    expect(toAiError(new DOMException("stop", "AbortError")).code).toBe(
      "cancelled",
    );
    expect(toAiError(new TypeError("network boom")).code).toBe("internal");
  });

  it("drops the original message, so a provider body can never leak", () => {
    const error = toAiError(
      new Error("api key sk-live-123 rejected for prompt X"),
    );
    expect(error.message).not.toContain("sk-live");
    expect(error.message).not.toContain("prompt X");
  });

  it("keeps an AiError unchanged", () => {
    const original = new AiError("rate_limited");
    expect(toAiError(original)).toBe(original);
  });
});

describe("the deep tier is gated by the FEATURE, not by the request", () => {
  it("never promotes a feature that does not declare deep, however hard it is asked", () => {
    // The owner-facing flag is `deep=1` on a form submission — trivially
    // forgeable. It must not be sufficient on its own, or a crafted POST could
    // spend the premium allowance through an economy capability.
    for (const policy of allAiFeaturePolicies()) {
      expect(resolveRequestedTier(policy, true)).toBe(
        policy.tier === "deep" ? "deep" : policy.tier,
      );
    }
  });

  it("no shipped feature declares the deep tier, so none can reach it today", () => {
    // Stated as an assertion rather than left implicit: if a future feature
    // opts into deep, this test fails and the decision gets made deliberately.
    for (const policy of allAiFeaturePolicies()) {
      expect(policy.tier).not.toBe("deep");
      expect(resolveRequestedTier(policy, true)).not.toBe("deep");
    }
  });

  it("leaves the feature's own tier untouched when deep is not requested", () => {
    for (const policy of allAiFeaturePolicies()) {
      expect(resolveRequestedTier(policy, false)).toBe(policy.tier);
    }
  });
});

describe("a duplicate request DalyHub can no longer answer", () => {
  it("has its own code, distinct from a stale result", () => {
    // These are different facts and must not share a sentence: `result_stale`
    // means the records moved; `duplicate_request` means nothing moved and the
    // answer is simply no longer held.
    expect(isAiErrorCode("duplicate_request")).toBe(true);
    expect(aiErrorMessage("duplicate_request")).not.toBe(
      aiErrorMessage("result_stale"),
    );
    expect(aiErrorMessage("duplicate_request")).not.toMatch(/changed/i);
  });

  it("is a conflict, and is never retried automatically", () => {
    expect(aiErrorStatus("duplicate_request")).toBe(409);
    expect(isTransientError("duplicate_request")).toBe(false);
  });

  it("leaks nothing about the earlier request", () => {
    const message = aiErrorMessage("duplicate_request");
    expect(message).not.toMatch(/https?:\/\//);
    expect(message).not.toMatch(/token|key|sk-/i);
  });
});
