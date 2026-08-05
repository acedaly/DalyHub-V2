/**
 * AI-01 platform — resolving AI configuration from Worker secrets.
 *
 * This is the ONLY module that reads a provider credential, and the resolved
 * shape it hands out carries **no key**: callers receive `configured: true` and an
 * adapter factory, never the secret itself. That is what makes "a key is never
 * returned to the browser, never written to D1, never logged, never exported and
 * never placed in an error" a structural property rather than a promise.
 *
 * Bindings, and what each is for:
 *
 *   ANTHROPIC_API_KEY     enables the Anthropic provider
 *   OPENAI_API_KEY        enables the OpenAI provider
 *   AI_GATEWAY_ACCOUNT_ID Cloudflare account id  ─┐ both required to
 *   AI_GATEWAY_ID         Cloudflare gateway id  ─┘ route through the Gateway
 *   AI_GATEWAY_TOKEN      optional; sent as `cf-aig-authorization`
 *
 * Every one is OPTIONAL. DalyHub must start, run and be deployed with none of
 * them set — AI simply reports itself unconfigured, and every other surface is
 * unchanged.
 */

import {
  AiError,
  type AiFeatureId,
  type AiProvider,
  type AiProviderAdapter,
} from "~/kernel/ai";

import { createAnthropicAdapter } from "./anthropic-adapter";
import { createOpenAiAdapter } from "./openai-adapter";
import {
  areGatewayIdentifiersValid,
  type AiRoutingMode,
  type GatewayIdentifiers,
} from "./provider-endpoints";

/** The AI-related bindings, all optional. */
export interface AiConfigEnv {
  readonly ANTHROPIC_API_KEY?: string;
  readonly OPENAI_API_KEY?: string;
  readonly AI_GATEWAY_ACCOUNT_ID?: string;
  readonly AI_GATEWAY_ID?: string;
  readonly AI_GATEWAY_TOKEN?: string;
}

/**
 * What the rest of the application may know about AI configuration. Note what is
 * absent: any key, any URL, any account identifier. `gatewayConfigured` is a
 * boolean, not an id.
 */
export interface AiConfigurationSummary {
  readonly configuredProviders: readonly AiProvider[];
  readonly mode: AiRoutingMode;
  readonly gatewayConfigured: boolean;
  /**
   * Set when the configuration is internally INCONSISTENT — e.g. a gateway
   * account id with no gateway id. DalyHub reports it plainly rather than
   * silently falling back, because a half-configured Gateway means requests are
   * going somewhere the owner did not intend.
   */
  readonly inconsistency: string | null;
}

/** The resolved configuration. Holds the secrets privately. */
export interface ResolvedAiConfiguration {
  readonly summary: AiConfigurationSummary;
  /** True when at least one provider has a usable credential. */
  readonly anyProviderConfigured: boolean;
  /** True when this specific provider has a credential. */
  readonly isConfigured: (provider: AiProvider) => boolean;
  /**
   * Build an adapter for a provider. Throws `provider_unconfigured` rather than
   * returning a broken adapter, so an unconfigured provider can never produce a
   * request with an empty credential header.
   */
  readonly adapterFor: (
    provider: AiProvider,
    featureId: AiFeatureId,
  ) => AiProviderAdapter;
}

/** Trim and reject blank/placeholder credentials. */
function secret(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Resolve AI configuration from the environment.
 *
 * `fetchImpl` is injectable so the adapter contract suite can drive both
 * providers against mocked HTTP without a paid call, and so CI never needs a key.
 */
export function resolveAiConfiguration(
  env: AiConfigEnv,
  options: { readonly fetchImpl?: typeof fetch } = {},
): ResolvedAiConfiguration {
  const anthropicKey = secret(env.ANTHROPIC_API_KEY);
  const openaiKey = secret(env.OPENAI_API_KEY);
  const accountId = secret(env.AI_GATEWAY_ACCOUNT_ID);
  const gatewayId = secret(env.AI_GATEWAY_ID);
  const gatewayToken = secret(env.AI_GATEWAY_TOKEN);

  let inconsistency: string | null = null;
  let gateway: GatewayIdentifiers | null = null;

  if (accountId !== null || gatewayId !== null) {
    if (accountId === null || gatewayId === null) {
      inconsistency =
        "AI Gateway is half-configured: both an account id and a gateway id are required.";
    } else {
      const identifiers = { accountId, gatewayId };
      if (areGatewayIdentifiersValid(identifiers)) {
        gateway = identifiers;
      } else {
        inconsistency =
          "AI Gateway identifiers are not in the expected format.";
      }
    }
  } else if (gatewayToken !== null) {
    inconsistency =
      "An AI Gateway token is set without an account id and gateway id.";
  }

  const mode: AiRoutingMode = gateway !== null ? "gateway" : "direct";
  const configuredProviders: AiProvider[] = [];
  if (anthropicKey !== null) configuredProviders.push("anthropic");
  if (openaiKey !== null) configuredProviders.push("openai");

  const keys: Readonly<Record<AiProvider, string | null>> = {
    anthropic: anthropicKey,
    openai: openaiKey,
  };

  return {
    summary: {
      configuredProviders,
      mode,
      gatewayConfigured: gateway !== null,
      inconsistency,
    },
    anyProviderConfigured: configuredProviders.length > 0,
    isConfigured: (provider) => keys[provider] !== null,
    adapterFor: (provider, featureId) => {
      const apiKey = keys[provider];
      if (apiKey === null) {
        throw new AiError("provider_unconfigured");
      }
      const shared = {
        apiKey,
        mode,
        gateway,
        gatewayToken,
        featureId,
        fetchImpl: options.fetchImpl,
      };
      return provider === "anthropic"
        ? createAnthropicAdapter(shared)
        : createOpenAiAdapter(shared);
    },
  };
}

/**
 * The configuration problems a deploy should refuse on. Returns an empty array
 * when the configuration is coherent — INCLUDING the entirely-unconfigured case,
 * because deploying DalyHub without AI is a supported, ordinary deployment.
 */
export function aiConfigurationProblems(env: AiConfigEnv): readonly string[] {
  const summary = resolveAiConfiguration(env).summary;
  return summary.inconsistency === null ? [] : [summary.inconsistency];
}
