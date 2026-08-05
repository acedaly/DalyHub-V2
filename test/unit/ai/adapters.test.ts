/**
 * AI-01 — the provider adapter CONTRACT suite.
 *
 * The same cases run against BOTH adapters, over mocked HTTP. No paid call is
 * ever made: CI needs no key, no account and no network, and the opt-in manual
 * integration script (`scripts/ai-integration-check.mjs`) is the only thing that
 * ever talks to a real provider.
 *
 * The cases that matter most are the negative ones — a provider body must never
 * reach a DalyHub response, an arbitrary endpoint must be impossible to reach,
 * and a policy failure must never be retried.
 */

import { describe, expect, it, vi } from "vitest";

import {
  AiError,
  executeWithPolicy,
  findAiModel,
  totalUsage,
  type AiProviderAdapter,
  type StructuredRequest,
} from "~/kernel/ai";
import {
  areGatewayIdentifiersValid,
  createAnthropicAdapter,
  createOpenAiAdapter,
  gatewayHeaders,
  providerEndpoint,
  resolveAiConfiguration,
  statusToAiError,
} from "~/platform/ai";

const anthropicModel = findAiModel("anthropic-economy")!;
const openaiModel = findAiModel("openai-economy")!;

const request = (model = anthropicModel): StructuredRequest => ({
  model,
  system: "policy",
  userMessage: "<evidence>id: evidence_01</evidence>",
  schema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  schemaName: "dalyhub_action_extraction",
  maxOutputTokens: 500,
  timeoutMs: 5_000,
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const anthropicOk = {
  id: "msg_123",
  stop_reason: "tool_use",
  content: [
    { type: "text", text: "" },
    {
      type: "tool_use",
      name: "dalyhub_action_extraction",
      input: { summary: "ok" },
    },
  ],
  usage: { input_tokens: 120, output_tokens: 34 },
};

const openaiOk = {
  id: "resp_123",
  status: "completed",
  output: [
    {
      content: [
        { type: "output_text", text: JSON.stringify({ summary: "ok" }) },
      ],
    },
  ],
  usage: { input_tokens: 120, output_tokens: 34 },
};

/** One row per provider, so every case below runs against both. */
const providers = [
  {
    name: "anthropic",
    model: anthropicModel,
    success: anthropicOk,
    build: (fetchImpl: typeof fetch) =>
      createAnthropicAdapter({
        apiKey: "test-key",
        mode: "direct" as const,
        gateway: null,
        gatewayToken: null,
        featureId: "meeting-action-extraction",
        fetchImpl,
      }),
  },
  {
    name: "openai",
    model: openaiModel,
    success: openaiOk,
    build: (fetchImpl: typeof fetch) =>
      createOpenAiAdapter({
        apiKey: "test-key",
        mode: "direct" as const,
        gateway: null,
        gatewayToken: null,
        featureId: "meeting-action-extraction",
        fetchImpl,
      }),
  },
];

describe.each(providers)("$name adapter", ({ model, success, build }) => {
  it("returns the structured value and the provider's token usage", async () => {
    const adapter = build(vi.fn(async () => jsonResponse(success)) as never);
    const response = await adapter.complete(request(model));
    expect(response.value).toEqual({ summary: "ok" });
    expect(response.usage).toEqual({ inputTokens: 120, outputTokens: 34 });
    expect(response.providerResponseId).not.toBeNull();
  });

  it("sends the credential in a header and never in the URL or body", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(success));
    const adapter = build(fetchImpl as never);
    await adapter.complete(request(model));
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).not.toContain("test-key");
    expect(String(init.body)).not.toContain("test-key");
    expect(JSON.stringify(init.headers)).toContain("test-key");
  });

  it("maps a 429 to `rate_limited` WITHOUT reading the body", async () => {
    const body = "rate limited: your prompt was 'secret content'";
    const adapter = build(
      vi.fn(async () => new Response(body, { status: 429 })) as never,
    );
    await expect(adapter.complete(request(model))).rejects.toMatchObject({
      code: "rate_limited",
    });
    await adapter.complete(request(model)).catch((error: AiError) => {
      expect(error.message).not.toContain("secret content");
    });
  });

  it("maps an authentication failure without telling the browser about a credential", async () => {
    const adapter = build(
      vi.fn(
        async () => new Response("invalid x-api-key", { status: 401 }),
      ) as never,
    );
    await expect(adapter.complete(request(model))).rejects.toMatchObject({
      code: "provider_rejected_request",
    });
  });

  it("maps a 5xx to `provider_unavailable`", async () => {
    const adapter = build(
      vi.fn(async () => new Response("boom", { status: 503 })) as never,
    );
    await expect(adapter.complete(request(model))).rejects.toMatchObject({
      code: "provider_unavailable",
    });
  });

  it("reports malformed JSON as an invalid response, never as a crash", async () => {
    const adapter = build(
      vi.fn(async () => new Response("{not json", { status: 200 })) as never,
    );
    await expect(adapter.complete(request(model))).rejects.toMatchObject({
      code: "provider_response_invalid",
    });
  });

  it("reports a timeout as `provider_timeout`", async () => {
    const adapter = build(
      vi.fn(
        () =>
          new Promise<Response>((_, reject) => {
            setTimeout(
              () => reject(new DOMException("timeout", "AbortError")),
              5,
            );
          }),
      ) as never,
    );
    await expect(
      adapter.complete({ ...request(model), timeoutMs: 1 }),
    ).rejects.toMatchObject({ code: "provider_timeout" });
  });

  it("reports a caller cancellation as `cancelled`, not as a provider failure", async () => {
    const controller = new AbortController();
    const adapter = build(
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          }),
      ) as never,
    );
    const pending = adapter.complete({
      ...request(model),
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "cancelled" });
  });
});

describe("anthropic response reading", () => {
  it("forces the single structured tool", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(anthropicOk));
    await createAnthropicAdapter({
      apiKey: "k",
      mode: "direct",
      gateway: null,
      gatewayToken: null,
      featureId: "meeting-action-extraction",
      fetchImpl: fetchImpl as never,
    }).complete(request());
    const body = JSON.parse(
      String(
        (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body,
      ),
    ) as Record<string, unknown>;
    expect(body.tool_choice).toEqual({
      type: "tool",
      name: "dalyhub_action_extraction",
    });
    expect(
      (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].headers,
    ).toMatchObject({ "anthropic-version": "2023-06-01" });
  });

  it("refuses a truncated answer rather than validating half a proposal", async () => {
    const adapter = createAnthropicAdapter({
      apiKey: "k",
      mode: "direct",
      gateway: null,
      gatewayToken: null,
      featureId: "meeting-action-extraction",
      fetchImpl: vi.fn(async () =>
        jsonResponse({ ...anthropicOk, stop_reason: "max_tokens" }),
      ) as never,
    });
    await expect(adapter.complete(request())).rejects.toMatchObject({
      code: "provider_response_invalid",
    });
  });

  it("reports a refusal as a provider rejection", async () => {
    const adapter = createAnthropicAdapter({
      apiKey: "k",
      mode: "direct",
      gateway: null,
      gatewayToken: null,
      featureId: "meeting-action-extraction",
      fetchImpl: vi.fn(async () =>
        jsonResponse({ ...anthropicOk, stop_reason: "refusal" }),
      ) as never,
    });
    await expect(adapter.complete(request())).rejects.toMatchObject({
      code: "provider_rejected_request",
    });
  });
});

describe("openai response reading", () => {
  it("asks for a strict json_schema on the Responses API", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(openaiOk));
    await createOpenAiAdapter({
      apiKey: "k",
      mode: "direct",
      gateway: null,
      gatewayToken: null,
      featureId: "meeting-action-extraction",
      fetchImpl: fetchImpl as never,
    }).complete(request(openaiModel));
    const body = JSON.parse(
      String(
        (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body,
      ),
    ) as { text: { format: Record<string, unknown> } };
    expect(body.text.format.type).toBe("json_schema");
    expect(body.text.format.strict).toBe(true);
  });

  it("treats an incomplete response as invalid", async () => {
    const adapter = createOpenAiAdapter({
      apiKey: "k",
      mode: "direct",
      gateway: null,
      gatewayToken: null,
      featureId: "meeting-action-extraction",
      fetchImpl: vi.fn(async () =>
        jsonResponse({ ...openaiOk, status: "incomplete" }),
      ) as never,
    });
    await expect(adapter.complete(request(openaiModel))).rejects.toMatchObject({
      code: "provider_response_invalid",
    });
  });

  it("surfaces a refusal block as a provider rejection", async () => {
    const adapter = createOpenAiAdapter({
      apiKey: "k",
      mode: "direct",
      gateway: null,
      gatewayToken: null,
      featureId: "meeting-action-extraction",
      fetchImpl: vi.fn(async () =>
        jsonResponse({
          ...openaiOk,
          output: [{ content: [{ type: "refusal", refusal: "no" }] }],
        }),
      ) as never,
    });
    await expect(adapter.complete(request(openaiModel))).rejects.toMatchObject({
      code: "provider_rejected_request",
    });
  });
});

describe("endpoint construction — the SSRF boundary", () => {
  it("builds the direct provider endpoints", () => {
    expect(providerEndpoint("anthropic", "direct", null)).toBe(
      "https://api.anthropic.com/v1/messages",
    );
    expect(providerEndpoint("openai", "direct", null)).toBe(
      "https://api.openai.com/v1/responses",
    );
  });

  it("builds the Cloudflare AI Gateway endpoints", () => {
    const gateway = { accountId: "abcdef0123456789", gatewayId: "dalyhub" };
    expect(providerEndpoint("anthropic", "gateway", gateway)).toBe(
      "https://gateway.ai.cloudflare.com/v1/abcdef0123456789/dalyhub/anthropic/v1/messages",
    );
    expect(providerEndpoint("openai", "gateway", gateway)).toBe(
      "https://gateway.ai.cloudflare.com/v1/abcdef0123456789/dalyhub/openai/responses",
    );
  });

  it("falls back to DIRECT when no gateway is configured — never to nothing", () => {
    expect(providerEndpoint("anthropic", "gateway", null)).toBe(
      "https://api.anthropic.com/v1/messages",
    );
  });

  it("refuses an identifier that could smuggle a host or a path", () => {
    for (const bad of [
      { accountId: "../../evil.example", gatewayId: "g" },
      { accountId: "acct", gatewayId: "a/b" },
      { accountId: "acct", gatewayId: "https://evil.example" },
      { accountId: "a", gatewayId: "g" },
    ]) {
      expect(areGatewayIdentifiersValid(bad)).toBe(false);
      expect(() => providerEndpoint("openai", "gateway", bad)).toThrow();
    }
  });

  it("tags Gateway analytics with the feature and model only — no workspace or content", () => {
    const headers = gatewayHeaders({
      mode: "gateway",
      token: "cf-token",
      featureId: "meeting-action-extraction",
      modelId: "anthropic-economy",
    });
    expect(headers["cf-aig-authorization"]).toBe("Bearer cf-token");
    const metadata = JSON.parse(headers["cf-aig-metadata"] ?? "{}") as Record<
      string,
      unknown
    >;
    expect(metadata).toEqual({
      feature: "meeting-action-extraction",
      model: "anthropic-economy",
      app: "dalyhub",
    });
  });

  it("sends no gateway headers in direct mode", () => {
    expect(
      gatewayHeaders({
        mode: "direct",
        token: "cf-token",
        featureId: "x",
        modelId: "y",
      }),
    ).toEqual({});
  });
});

describe("configuration", () => {
  it("reports nothing configured, and refuses to build an adapter", () => {
    const configuration = resolveAiConfiguration({});
    expect(configuration.anyProviderConfigured).toBe(false);
    expect(configuration.summary.configuredProviders).toEqual([]);
    expect(() =>
      configuration.adapterFor("anthropic", "meeting-action-extraction"),
    ).toThrow(AiError);
  });

  it("supports Anthropic only, OpenAI only and both", () => {
    expect(
      resolveAiConfiguration({ ANTHROPIC_API_KEY: "k" }).summary
        .configuredProviders,
    ).toEqual(["anthropic"]);
    expect(
      resolveAiConfiguration({ OPENAI_API_KEY: "k" }).summary
        .configuredProviders,
    ).toEqual(["openai"]);
    expect(
      resolveAiConfiguration({ ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "b" })
        .summary.configuredProviders,
    ).toEqual(["anthropic", "openai"]);
  });

  it("never exposes a key or a gateway id through the summary", () => {
    const summary = resolveAiConfiguration({
      ANTHROPIC_API_KEY: "sk-secret",
      AI_GATEWAY_ACCOUNT_ID: "abcdef0123456789",
      AI_GATEWAY_ID: "dalyhub",
      AI_GATEWAY_TOKEN: "cf-secret",
    }).summary;
    const serialised = JSON.stringify(summary);
    expect(serialised).not.toContain("sk-secret");
    expect(serialised).not.toContain("cf-secret");
    expect(serialised).not.toContain("abcdef0123456789");
    expect(summary.gatewayConfigured).toBe(true);
    expect(summary.mode).toBe("gateway");
  });

  it("reports a half-configured Gateway rather than silently going direct", () => {
    expect(
      resolveAiConfiguration({ AI_GATEWAY_ACCOUNT_ID: "abcdef0123456789" })
        .summary.inconsistency,
    ).not.toBeNull();
    expect(
      resolveAiConfiguration({ AI_GATEWAY_TOKEN: "t" }).summary.inconsistency,
    ).not.toBeNull();
  });
});

describe("retry and fallback policy", () => {
  const ok = {
    value: { summary: "ok" },
    usage: { inputTokens: 10, outputTokens: 5 },
    providerResponseId: null,
    provider: "anthropic" as const,
    modelId: "anthropic-economy",
  };

  const adapter = (
    provider: "anthropic" | "openai",
    impl: AiProviderAdapter["complete"],
  ): AiProviderAdapter => ({ provider, complete: impl });

  it("retries a transient failure exactly ONCE", async () => {
    const complete = vi
      .fn()
      .mockRejectedValueOnce(new AiError("provider_timeout"))
      .mockResolvedValueOnce(ok);
    const result = await executeWithPolicy(request(), {
      primary: {
        adapter: adapter("anthropic", complete),
        model: anthropicModel,
      },
      fallback: null,
      allowRetry: true,
    });
    expect(complete).toHaveBeenCalledTimes(2);
    expect(result.attempts.map((a) => a.kind)).toEqual(["primary", "retry"]);
  });

  it("NEVER retries a policy failure", async () => {
    const complete = vi
      .fn()
      .mockRejectedValue(new AiError("feature_not_allowed"));
    await expect(
      executeWithPolicy(request(), {
        primary: {
          adapter: adapter("anthropic", complete),
          model: anthropicModel,
        },
        fallback: null,
        allowRetry: true,
      }),
    ).rejects.toMatchObject({ code: "feature_not_allowed" });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("NEVER retries a schema failure — paying twice for the same shape is not a fix", async () => {
    const complete = vi
      .fn()
      .mockRejectedValue(new AiError("provider_response_invalid"));
    await expect(
      executeWithPolicy(request(), {
        primary: {
          adapter: adapter("anthropic", complete),
          model: anthropicModel,
        },
        fallback: null,
        allowRetry: true,
      }),
    ).rejects.toMatchObject({ code: "provider_response_invalid" });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("falls back to the other provider and RECORDS that it did", async () => {
    const primary = vi
      .fn()
      .mockRejectedValue(new AiError("provider_unavailable"));
    const secondary = vi.fn().mockResolvedValue({
      ...ok,
      provider: "openai",
      modelId: "openai-economy",
    });
    const result = await executeWithPolicy(request(), {
      primary: {
        adapter: adapter("anthropic", primary),
        model: anthropicModel,
      },
      fallback: { adapter: adapter("openai", secondary), model: openaiModel },
      allowRetry: true,
    });
    expect(result.attempts.map((a) => a.kind)).toEqual([
      "primary",
      "retry",
      "fallback",
    ]);
    expect(result.response.provider).toBe("openai");
  });

  it("does not fall back when the plan forbids it", async () => {
    const primary = vi
      .fn()
      .mockRejectedValue(new AiError("provider_unavailable"));
    await expect(
      executeWithPolicy(request(), {
        primary: {
          adapter: adapter("anthropic", primary),
          model: anthropicModel,
        },
        fallback: null,
        allowRetry: false,
      }),
    ).rejects.toMatchObject({ code: "provider_unavailable" });
    expect(primary).toHaveBeenCalledTimes(1);
  });

  it("sums usage across every attempt, so a fallback is billed honestly", () => {
    expect(
      totalUsage([
        {
          kind: "primary",
          provider: "anthropic",
          modelId: "anthropic-economy",
          usage: { inputTokens: 10, outputTokens: 2 },
          failureCode: "provider_timeout",
        },
        {
          kind: "fallback",
          provider: "openai",
          modelId: "openai-economy",
          usage: { inputTokens: 20, outputTokens: 4 },
          failureCode: null,
        },
      ]),
    ).toEqual({ inputTokens: 30, outputTokens: 6 });
  });
});

describe("status mapping", () => {
  it("classifies each provider status without reading a body", () => {
    expect(statusToAiError(400).code).toBe("provider_rejected_request");
    expect(statusToAiError(404).code).toBe("model_unavailable");
    expect(statusToAiError(413).code).toBe("evidence_too_large");
    expect(statusToAiError(429).code).toBe("rate_limited");
    expect(statusToAiError(500).code).toBe("provider_unavailable");
    expect(statusToAiError(504).code).toBe("provider_timeout");
  });
});
