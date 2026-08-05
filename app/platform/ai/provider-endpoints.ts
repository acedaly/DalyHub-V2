/**
 * AI-01 platform — endpoint construction, and the reason it is a pure function.
 *
 * A model, a module, a route and a browser can all name a FEATURE. None of them
 * can name a URL. Every endpoint DalyHub will ever contact is derived here from
 * (provider, mode) plus configuration that came from Worker secrets — so there is
 * no request shape, no setting and no model output that can point DalyHub at an
 * arbitrary host. That is the server-side-request-forgery boundary, and it is one
 * pure function so it can be tested exhaustively.
 *
 * Two modes, both documented:
 *
 *   direct   DalyHub → provider
 *   gateway  DalyHub → Cloudflare AI Gateway → provider  (bring-your-own-keys)
 *
 * AI Gateway is the RECOMMENDED request-control layer, not a requirement: local
 * development, the test suites and a workspace with AI disabled all work without
 * it, and a missing Gateway can never stop DalyHub starting.
 *
 * Sources, read 2026-08-05:
 *   - Anthropic Messages API — POST /v1/messages, header `anthropic-version:
 *     2023-06-01` (platform.claude.com/docs/en/api/messages).
 *   - OpenAI Responses API — POST https://api.openai.com/v1/responses
 *     (developers.openai.com/api/docs/guides/structured-outputs).
 *   - Cloudflare AI Gateway provider base URL
 *     `https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/{provider}`,
 *     with provider slugs `anthropic` and `openai`, the provider key still sent
 *     on the request, and an optional `cf-aig-authorization: Bearer <token>`
 *     (developers.cloudflare.com/ai-gateway/usage/providers/{anthropic,openai}/).
 */

import type { AiProvider } from "~/kernel/ai";

/** How provider requests are routed. */
export const AI_ROUTING_MODES = ["direct", "gateway"] as const;
export type AiRoutingMode = (typeof AI_ROUTING_MODES)[number];

/** The Anthropic API version pinned by DalyHub. Verified 2026-08-05. */
export const ANTHROPIC_VERSION = "2023-06-01";

/** Direct provider origins. Constants, never configuration. */
const DIRECT_ORIGINS: Readonly<Record<AiProvider, string>> = {
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com",
};

/** The Cloudflare AI Gateway origin. A constant, never configuration. */
const GATEWAY_ORIGIN = "https://gateway.ai.cloudflare.com";

/** The path each provider's structured-completion endpoint lives at. */
const PROVIDER_PATHS: Readonly<Record<AiProvider, string>> = {
  anthropic: "/v1/messages",
  openai: "/v1/responses",
};

/**
 * The Gateway's provider slug. Identical to our own provider names today, but
 * kept as an explicit mapping so a future rename on either side is a one-line
 * change rather than a silent mismatch.
 */
const GATEWAY_SLUGS: Readonly<Record<AiProvider, string>> = {
  anthropic: "anthropic",
  openai: "openai",
};

/**
 * The Gateway rewrites `{gatewayBase}/{path}` onto the provider, so the provider
 * path is appended WITHOUT its leading `/v1` for OpenAI (the Gateway documents
 * `/responses`) and WITH the full path for Anthropic (`/v1/messages`).
 */
const GATEWAY_PATHS: Readonly<Record<AiProvider, string>> = {
  anthropic: "/v1/messages",
  openai: "/responses",
};

/** Cloudflare account and gateway identifiers. Non-secret, but never committed. */
export interface GatewayIdentifiers {
  readonly accountId: string;
  readonly gatewayId: string;
}

/**
 * Cloudflare identifiers are opaque hex/slug values. Validating their SHAPE here
 * means a misconfigured value produces a clear configuration error rather than a
 * strange URL — and it is the second half of the SSRF guarantee: even a
 * mis-supplied secret cannot introduce a path segment, a host or a scheme.
 */
const ACCOUNT_ID_PATTERN = /^[a-z0-9]{8,64}$/i;
const GATEWAY_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/i;

/** True when both identifiers are shaped like real Cloudflare identifiers. */
export function areGatewayIdentifiersValid(
  identifiers: GatewayIdentifiers,
): boolean {
  return (
    ACCOUNT_ID_PATTERN.test(identifiers.accountId) &&
    GATEWAY_ID_PATTERN.test(identifiers.gatewayId)
  );
}

/**
 * Build the endpoint URL for a provider under a routing mode.
 *
 * Throws a plain `Error` for an invalid gateway identifier — this is a
 * CONFIGURATION fault, surfaced at startup or in the preflight, never a request
 * outcome, so it deliberately does not become an `AiError`.
 */
export function providerEndpoint(
  provider: AiProvider,
  mode: AiRoutingMode,
  gateway: GatewayIdentifiers | null,
): string {
  if (mode === "direct" || gateway === null) {
    return `${DIRECT_ORIGINS[provider]}${PROVIDER_PATHS[provider]}`;
  }
  if (!areGatewayIdentifiersValid(gateway)) {
    throw new Error("AI Gateway identifiers are not valid.");
  }
  const slug = GATEWAY_SLUGS[provider];
  return `${GATEWAY_ORIGIN}/v1/${gateway.accountId}/${gateway.gatewayId}/${slug}${GATEWAY_PATHS[provider]}`;
}

/**
 * The extra headers a Gateway request carries.
 *
 * `cf-aig-authorization` is sent only when an authenticated Gateway is
 * configured. `cf-aig-metadata` tags the request with the DalyHub feature and
 * internal model id so Gateway analytics can attribute spend per capability —
 * it carries NO workspace id, no owner identity, no record id and no content.
 */
export function gatewayHeaders(input: {
  readonly mode: AiRoutingMode;
  readonly token: string | null;
  readonly featureId: string;
  readonly modelId: string;
}): Record<string, string> {
  if (input.mode !== "gateway") return {};
  const headers: Record<string, string> = {
    "cf-aig-metadata": JSON.stringify({
      feature: input.featureId,
      model: input.modelId,
      app: "dalyhub",
    }),
  };
  if (input.token !== null && input.token.length > 0) {
    headers["cf-aig-authorization"] = `Bearer ${input.token}`;
  }
  return headers;
}
