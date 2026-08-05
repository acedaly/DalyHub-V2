/**
 * AI-01 platform — the Anthropic adapter.
 *
 * Structured output uses the Messages API's **tool-use** contract: one tool whose
 * `input_schema` is DalyHub's schema, plus `tool_choice: {type:"tool", name}`, so
 * the model must answer by "calling" that single tool and the answer arrives as a
 * JSON object rather than prose to parse. Verified against the Messages API
 * reference on 2026-08-05 (`anthropic-version: 2023-06-01`).
 *
 * No SDK. A direct `fetch` is smaller, has no transitive dependencies to audit
 * under the AGENTS.md §11 provenance rules, keeps the Worker bundle lean, and is
 * exactly as capable for one endpoint. AI provider SDKs are not added to the
 * project, and nothing in this file can reach a browser bundle: it is imported
 * only by the server-side runtime.
 *
 * **Nothing this file receives from the network is ever re-thrown.** Every status,
 * body and abort is mapped to a typed `AiError`, so no provider message, account
 * id, header or request echo can cross the route boundary.
 */

import {
  AiError,
  type AiProviderAdapter,
  type StructuredRequest,
  type StructuredResponse,
} from "~/kernel/ai";

import {
  ANTHROPIC_VERSION,
  gatewayHeaders,
  providerEndpoint,
  type AiRoutingMode,
  type GatewayIdentifiers,
} from "./provider-endpoints";
import { fetchJson } from "./provider-transport";

/** Everything the adapter is constructed with. The key never leaves this object. */
export interface AnthropicAdapterConfig {
  readonly apiKey: string;
  readonly mode: AiRoutingMode;
  readonly gateway: GatewayIdentifiers | null;
  readonly gatewayToken: string | null;
  /** Feature id, for Gateway analytics attribution only. */
  readonly featureId: string;
  /** Injected for tests. Defaults to the global `fetch`. */
  readonly fetchImpl?: typeof fetch;
}

/** Build the Anthropic adapter. */
export function createAnthropicAdapter(
  config: AnthropicAdapterConfig,
): AiProviderAdapter {
  return {
    provider: "anthropic",
    async complete(request: StructuredRequest): Promise<StructuredResponse> {
      const url = providerEndpoint("anthropic", config.mode, config.gateway);
      const body = {
        model: request.model.providerModelId,
        max_tokens: request.maxOutputTokens,
        system: request.system,
        messages: [{ role: "user", content: request.userMessage }],
        tools: [
          {
            name: request.schemaName,
            description:
              "Return the structured DalyHub result. This is the only permitted output.",
            input_schema: request.schema,
          },
        ],
        // Forces the single tool: the model cannot answer in prose, and cannot
        // choose a different tool because there is no other tool.
        tool_choice: { type: "tool", name: request.schemaName },
      };

      const payload = await fetchJson({
        url,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "anthropic-version": ANTHROPIC_VERSION,
          "x-api-key": config.apiKey,
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

      return readAnthropicResponse(
        payload,
        request.schemaName,
        request.model.id,
      );
    },
  };
}

/**
 * Extract the structured value and usage from a Messages API response.
 *
 * A `stop_reason` of `max_tokens` is reported as `provider_response_invalid`
 * rather than silently returning a truncated object: half a proposal is worse
 * than none, and the schema validator would reject it anyway with a less
 * explanatory reason.
 */
export function readAnthropicResponse(
  payload: unknown,
  toolName: string,
  modelId: string,
): StructuredResponse {
  if (typeof payload !== "object" || payload === null) {
    throw new AiError("provider_response_invalid", undefined, "not_object");
  }
  const source = payload as Record<string, unknown>;

  const stopReason =
    typeof source.stop_reason === "string" ? source.stop_reason : null;
  if (stopReason === "max_tokens") {
    throw new AiError("provider_response_invalid", undefined, "truncated");
  }
  if (stopReason === "refusal") {
    throw new AiError("provider_rejected_request", undefined, "refusal");
  }

  const content = Array.isArray(source.content) ? source.content : [];
  let value: unknown = null;
  for (const block of content) {
    if (typeof block !== "object" || block === null) continue;
    const entry = block as Record<string, unknown>;
    if (entry.type === "tool_use" && entry.name === toolName) {
      value = entry.input;
      break;
    }
  }
  if (value === null || value === undefined) {
    throw new AiError("provider_response_invalid", undefined, "no_tool_use");
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
    provider: "anthropic",
    modelId,
  };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null;
}
