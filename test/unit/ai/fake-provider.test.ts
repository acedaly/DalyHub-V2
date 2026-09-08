/**
 * V2.14 GROUND-00 — the development provider, and the two keys that gate it.
 *
 * The most important assertion in this file is the negative one: a
 * production-shaped environment cannot construct it, whatever else is set. The
 * rest prove it is a provider rather than a stub — it answers the shape DalyHub
 * asked for, reads the ids DalyHub actually sent, reports token usage the budget
 * can reconcile, and fails in the same typed vocabulary the real adapters fail
 * in.
 */

import { describe, expect, it } from "vitest";

import {
  AI_MODEL_REGISTRY,
  isAiError,
  resolveModel,
  validateGroundedExplanation,
  type Fact,
  type StructuredRequest,
  type ValidationContext,
} from "~/kernel/ai";
import {
  FAKE_PROVIDER_SCENARIOS,
  createFakeAdapter,
  fakeProviderEnabled,
  isFakeProviderScenario,
  resolveAiConfiguration,
  type FakeProviderScenario,
} from "~/platform/ai";

const MODEL = resolveModel("anthropic", "standard") ?? AI_MODEL_REGISTRY[0];

const FACTS: readonly Fact[] = [
  {
    id: "F1",
    label: "Total spending in August 2026",
    value: { kind: "money", minorUnits: 241032, currencyCode: "AUD" },
    display: "A$2,410.32",
    period: null,
    reference: null,
    note: null,
  },
  {
    id: "F2",
    label: "Total spending in July 2026",
    value: { kind: "money", minorUnits: 198418, currencyCode: "AUD" },
    display: "A$1,984.18",
    period: null,
    reference: null,
    note: null,
  },
];

const CONTEXT: ValidationContext = {
  evidenceIds: new Set(),
  projectCandidateIds: new Set(),
  personCandidateIds: new Set(),
  linkCandidateIds: new Set(),
  selection: null,
  facts: FACTS,
};

/** A request carrying the fact block exactly as `renderFactBlock` writes it. */
function request(over: Partial<StructuredRequest> = {}): StructuredRequest {
  return {
    model: MODEL,
    system: "You explain supplied facts.",
    userMessage: [
      "<derived_facts>",
      "subject: Spending",
      "F1: Total spending in August 2026 = A$2,410.32",
      "F2: Total spending in July 2026 = A$1,984.18",
      "</derived_facts>",
    ].join("\n"),
    schema: {},
    schemaName: "dalyhub_report_explanation",
    maxOutputTokens: 1_200,
    timeoutMs: 45_000,
    ...over,
  };
}

async function run(
  scenario: FakeProviderScenario,
  over: Partial<StructuredRequest> = {},
) {
  const adapter = createFakeAdapter({
    provider: "anthropic",
    featureId: "report-explanation",
    scenario,
  });
  return adapter.complete(request(over));
}

/* -------------------------------------------------------------------------- */
/* The gate                                                                    */
/* -------------------------------------------------------------------------- */

describe("the development provider cannot be selected in production", () => {
  it("needs BOTH keys, and the second one is the deploy environment", () => {
    expect(fakeProviderEnabled({})).toBe(false);
    expect(fakeProviderEnabled({ AI_FAKE_PROVIDER: "1" })).toBe(false);
    expect(fakeProviderEnabled({ ENVIRONMENT: "development" })).toBe(false);
    expect(
      fakeProviderEnabled({
        AI_FAKE_PROVIDER: "1",
        ENVIRONMENT: "development",
      }),
    ).toBe(true);
    expect(
      fakeProviderEnabled({ AI_FAKE_PROVIDER: "true", ENVIRONMENT: "test" }),
    ).toBe(true);
  });

  it("is refused under a PRODUCTION environment however hard it is asked for", () => {
    for (const flag of ["1", "true", "TRUE", "yes"]) {
      expect(
        fakeProviderEnabled({
          AI_FAKE_PROVIDER: flag,
          ENVIRONMENT: "production",
        }),
        flag,
      ).toBe(false);
    }
    /*
     * The environment is what production pins in `wrangler.jsonc`, so this is
     * the assertion that matters: a stray variable, a leaked deploy setting or a
     * mistaken secret cannot turn a real deployment into a fake one.
     */
    const configuration = resolveAiConfiguration({
      AI_FAKE_PROVIDER: "1",
      ENVIRONMENT: "production",
    });
    expect(configuration.summary.usingDevelopmentProvider).toBe(false);
    expect(configuration.anyProviderConfigured).toBe(false);
    expect(configuration.summary.configuredProviders).toEqual([]);
  });

  it("reports itself plainly when it IS answering", () => {
    const configuration = resolveAiConfiguration({
      AI_FAKE_PROVIDER: "1",
      ENVIRONMENT: "test",
    });
    expect(configuration.summary.usingDevelopmentProvider).toBe(true);
    expect(configuration.anyProviderConfigured).toBe(true);
    // It impersonates a provider at the seam, so the ledger, the execution plan
    // and the owner-facing detail all read normally.
    expect(
      configuration.adapterFor("anthropic", "report-explanation").provider,
    ).toBe("anthropic");
  });

  it("never claims a provider it has no credential for", () => {
    const configuration = resolveAiConfiguration({
      AI_FAKE_PROVIDER: "1",
      ENVIRONMENT: "test",
    });
    expect(configuration.isConfigured("openai")).toBe(false);
    expect(() =>
      configuration.adapterFor("openai", "report-explanation"),
    ).toThrow();
  });

  it("recognises only the scenarios it declares", () => {
    for (const scenario of FAKE_PROVIDER_SCENARIOS) {
      expect(isFakeProviderScenario(scenario)).toBe(true);
    }
    expect(isFakeProviderScenario("delete_everything")).toBe(false);
    expect(isFakeProviderScenario(undefined)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* It behaves like a provider                                                  */
/* -------------------------------------------------------------------------- */

describe("the development provider answers like a provider", () => {
  it("cites the ids DalyHub actually sent, read out of the prompt", async () => {
    const response = await run("success");
    const result = validateGroundedExplanation(response.value, CONTEXT);
    expect(result.status).toBe("ok");
    const cited = result.observations.flatMap((entry) => entry.factIds);
    expect(cited.every((id) => ["F1", "F2"].includes(id))).toBe(true);
  });

  it("cannot cite anything when DalyHub sent no facts — a missing block SHOWS", async () => {
    const response = await run("success", {
      userMessage: "<evidence>\n</evidence>",
    });
    const value = response.value as { status: string; observations: unknown[] };
    expect(value.status).toBe("insufficient");
    expect(value.observations).toHaveLength(0);
  });

  it("reports token usage the budget can reconcile", async () => {
    const response = await run("success");
    expect(response.usage.inputTokens).toBeGreaterThan(0);
    expect(response.usage.outputTokens).toBeGreaterThan(0);
    expect(response.modelId).toBe(MODEL.id);
    expect(response.providerResponseId).toMatch(/^fake_/);
  });

  it("spends the whole output allowance on the expensive scenario", async () => {
    const response = await run("expensive");
    expect(response.usage.outputTokens).toBe(1_200);
  });

  it("honours cancellation exactly as the real adapters do", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      run("success", { signal: controller.signal }),
    ).rejects.toMatchObject({ code: "cancelled" });
  });
});

describe("the failure scenarios are the platform's own vocabulary", () => {
  const transport: readonly [FakeProviderScenario, string][] = [
    ["timeout", "provider_timeout"],
    ["unavailable", "provider_unavailable"],
    ["rate_limited", "rate_limited"],
    ["refusal", "provider_rejected_request"],
  ];

  for (const [scenario, code] of transport) {
    it(`maps ${scenario} to ${code}`, async () => {
      await expect(run(scenario)).rejects.toMatchObject({ code });
    });
  }

  const rejected: readonly [FakeProviderScenario, string][] = [
    ["malformed", "result:not_object"],
    ["unknown_fact", "factIds:unknown"],
    ["uncited", "observation:uncited"],
    ["fabricated_figure", "observation:ungrounded_figure"],
    ["html_injection", "observation:html_not_allowed"],
  ];

  for (const [scenario, detail] of rejected) {
    it(`produces an answer DalyHub refuses with ${detail}`, async () => {
      const response = await run(scenario);
      try {
        validateGroundedExplanation(response.value, CONTEXT);
        throw new Error(`${scenario} should have been refused`);
      } catch (error) {
        expect(isAiError(error), scenario).toBe(true);
        if (isAiError(error)) {
          expect(error.code).toBe("provider_response_invalid");
          expect(error.detail, scenario).toBe(detail);
        }
      }
    });
  }
});
