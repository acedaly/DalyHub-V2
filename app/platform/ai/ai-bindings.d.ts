/**
 * AI-01 — the AI Worker bindings, declared here rather than in `wrangler.jsonc`.
 *
 * These are SECRETS (and, for the Gateway identifiers, private operational
 * configuration). They are supplied at deploy time with `wrangler secret` and are
 * deliberately NOT declared as `vars`: a committed — even empty — `var` of the
 * same name would OVERRIDE the deploy-time secret and clobber it. That is exactly
 * the reasoning `wrangler.jsonc` already records for the Cloudflare Access
 * values, and the same rule applies here.
 *
 * So `wrangler types` cannot know about them, and this declaration merge is where
 * the Worker `Env` learns their shape. Every one is OPTIONAL: DalyHub must build,
 * start, run and deploy with none of them set.
 */

/**
 * BOTH interfaces are merged, because `wrangler types` generates two: the global
 * `Env` a Worker handler receives, and `Cloudflare.Env`, which is what the
 * `cloudflare:workers` module's `env` export is typed as. Merging only one leaves
 * the other silently missing these bindings.
 */
interface DalyHubAiBindings {
  /** Enables the Anthropic provider. Never returned to a browser or stored in D1. */
  readonly ANTHROPIC_API_KEY?: string;
  /** Enables the OpenAI provider. Never returned to a browser or stored in D1. */
  readonly OPENAI_API_KEY?: string;
  /** Cloudflare account id — required WITH `AI_GATEWAY_ID` to use AI Gateway. */
  readonly AI_GATEWAY_ACCOUNT_ID?: string;
  /** Cloudflare AI Gateway id — required WITH `AI_GATEWAY_ACCOUNT_ID`. */
  readonly AI_GATEWAY_ID?: string;
  /** Optional authenticated-gateway token, sent as `cf-aig-authorization`. */
  readonly AI_GATEWAY_TOKEN?: string;
  /**
   * V2.14 GROUND-00 — enables the deterministic DEVELOPMENT provider.
   *
   * Not a secret and not a credential: it selects an adapter that contacts
   * nothing. It is declared here beside the others because it is the same kind
   * of deploy-time switch, and because it must be readable by
   * `resolveAiConfiguration`, which is the only module allowed to decide which
   * adapter a provider gets. It has no effect at all unless `ENVIRONMENT` is
   * `development` or `test` — see `app/platform/ai/fake-provider.ts`.
   */
  readonly AI_FAKE_PROVIDER?: string;
}

declare global {
  /* eslint-disable @typescript-eslint/no-empty-object-type -- Declaration
     merging is the whole point: each interface adds the AI bindings to the
     generated `Env` without redeclaring the bindings Wrangler already knows. */
  interface Env extends DalyHubAiBindings {}

  namespace Cloudflare {
    interface Env extends DalyHubAiBindings {}
  }
  /* eslint-enable @typescript-eslint/no-empty-object-type */
}

export {};
