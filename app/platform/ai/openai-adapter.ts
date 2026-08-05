/**
 * AI-01 platform — the OpenAI adapter.
 *
 * Structured output uses the Responses API's `text.format` with
 * `{type:"json_schema", strict:true}`. Verified against the OpenAI structured
 * outputs guide on 2026-08-05: the endpoint is `POST
 * https://api.openai.com/v1/responses`; a strict schema must mark every property
 * `required` and set `additionalProperties: false` (which `ai-schemas.ts` does);
 * the answer arrives in `output[]` as an `output_text` item, or as a `refusal`;
 * and usage is reported as `input_tokens` / `output_tokens`.
 *
 * Like the Anthropic adapter this uses a direct `fetch` rather than the provider
 * SDK — same reasoning, and it keeps both adapters on the same transport, the
 * same deadline semantics and the same redaction rules.
 */

import {
  AiError,
  type AiProviderAdapter,
  type StructuredRequest,
  type StructuredResponse,
} from "~/kernel/ai";

import {
  gatewayHeaders,
  providerEndpoint,
  type AiRoutingMode,
  type GatewayIdentifiers,
} from "./provider-endpoints";
import { fetchJson } from "./provider-transport";

/** Everything the adapter is constructed with. The key never leaves this object. */
export interface OpenAiAdapterConfig {
  readonly apiKey: string;
  readonly mode: AiRoutingMode;
  readonly gateway: GatewayIdentifiers | null;
  readonly gatewayToken: string | null;
  readonly featureId: string;
  readonly fetchImpl?: typeof fetch;
}

/** Build the OpenAI adapter. */
export function createOpenAiAdapter(
  config: OpenAiAdapterConfig,
): AiProviderAdapter {
  return {
    provider: "openai",
    async complete(request: StructuredRequest): Promise<StructuredResponse> {
      const url = providerEndpoint("openai", config.mode, config.gateway);
      const body = {
        model: request.model.providerModelId,
        instructions: request.system,
        input: request.userMessage,
        max_output_tokens: request.maxOutputTokens,
        text: {
          format: {
            type: "json_schema",
            name: request.schemaName,
            schema: request.schema,
            strict: true,
          },
        },
      };

      const payload = await fetchJson({
        url,
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.apiKey}`,
          ...gatewayHeaders({
            mode: config.mode,
            token: config.gatewayToken,
            featureId: config.featureId,
            modelId: request.model.id,
          }),
        },
        body,
        timeoutMs: request.timeoutMs,
        signal: request.signal,
        fetchImpl: config.fetchImpl,
      });

      return readOpenAiResponse(payload, request.model.id);
    },
  };
}

/**
 * Extract the structured value and usage from a Responses API payload.
 *
 * `incomplete` (the Responses API's truncation state) is treated exactly like
 * Anthropic's `max_tokens`: a partial structured answer is refused rather than
 * validated into a half-proposal.
 */
export function readOpenAiResponse(
  payload: unknown,
  modelId: string,
): StructuredResponse {
  if (typeof payload !== "object" || payload === null) {
    throw new AiError("provider_response_invalid", undefined, "not_object");
  }
  const source = payload as Record<string, unknown>;

  if (source.status === "incomplete") {
    throw new AiError("provider_response_invalid", undefined, "truncated");
  }
  if (source.status === "failed") {
    throw new AiError("provider_rejected_request", undefined, "failed");
  }

  const output = Array.isArray(source.output) ? source.output : [];
  let text: string | null = null;
  for (const item of output) {
    if (typeof item !== "object" || item === null) continue;
    const entry = item as Record<string, unknown>;
    const content = Array.isArray(entry.content) ? entry.content : [];
    for (const block of content) {
      if (typeof block !== "object" || block === null) continue;
      const part = block as Record<string, unknown>;
      if (part.type === "refusal") {
        throw new AiError("provider_rejected_request", undefined, "refusal");
      }
      if (part.type === "output_text" && typeof part.text === "string") {
        text = part.text;
        break;
      }
    }
    if (text !== null) break;
  }

  // `output_text` is the SDK's convenience aggregate; the raw API sometimes
  // includes it too, so it is accepted as a fallback rather than required.
  if (text === null && typeof source.output_text === "string") {
    text = source.output_text;
  }
  if (text === null) {
    throw new AiError("provider_response_invalid", undefined, "no_output_text");
  }

  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new AiError("provider_response_invalid", undefined, "malformed_json");
  }

  const usage =
    typeof source.usage === "object" && source.usage !== null
      ? (source.usage as Record<string, unknown>)
      : {};

  return {
    value,
    usage: {
      inputTokens: numberOrNull(usage.input_tokens),
      outputTokens: numberOrNull(usage.output_tokens),
    },
    providerResponseId: typeof source.id === "string" ? source.id : null,
    provider: "openai",
    modelId,
  };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null;
}
