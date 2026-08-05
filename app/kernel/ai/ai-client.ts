/**
 * AI-01 kernel — the provider-independent AI client contract.
 *
 * ONE contract, two adapters. A module never sees Anthropic or OpenAI: it sees
 * `StructuredRequest` in and `StructuredResponse` out. Everything provider-shaped
 * — endpoints, headers, request bodies, structured-output mechanisms, error
 * vocabularies — lives in `app/platform/ai/`, behind this interface.
 *
 * The contract deliberately carries no secret and no URL. An adapter is
 * CONSTRUCTED with its credentials by the platform layer; a caller can never
 * supply a key, a base URL or an arbitrary endpoint, so there is no request shape
 * that turns this into a server-side request forgery primitive.
 */

import { AiError, isTransientError } from "./ai-errors";
import type { AiModelEntry, AiProvider } from "./ai-models";
import type { JsonSchema } from "./ai-schemas";

/** One bounded, structured request. Provider-independent by construction. */
export interface StructuredRequest {
  /** The approved registry entry. The adapter reads `providerModelId` from it. */
  readonly model: AiModelEntry;
  /** System instructions from the prompt registry. */
  readonly system: string;
  /** The assembled user message (owner request + facts + candidates + evidence). */
  readonly userMessage: string;
  /** The DalyHub-owned response schema. */
  readonly schema: JsonSchema;
  /** A short, stable name for the schema, used by both providers' APIs. */
  readonly schemaName: string;
  /** Maximum output tokens. Never exceeds the model entry's own ceiling. */
  readonly maxOutputTokens: number;
  /** Provider deadline in milliseconds. */
  readonly timeoutMs: number;
  /** Cancellation from the caller. Aborts the in-flight fetch. */
  readonly signal?: AbortSignal;
}

/** Provider-reported token usage. `null` when the provider reported none. */
export interface ProviderUsage {
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
}

/** One successful structured response. */
export interface StructuredResponse {
  /** The parsed JSON value. STILL UNTRUSTED — the schema validator runs next. */
  readonly value: unknown;
  readonly usage: ProviderUsage;
  /**
   * The provider's own response identifier where one exists and is safe to keep
   * (an opaque correlation id, never a token). Useful for a support
   * conversation; never rendered to the owner by default.
   */
  readonly providerResponseId: string | null;
  readonly provider: AiProvider;
  /** The DalyHub-internal model id that produced this. */
  readonly modelId: string;
}

/**
 * A provider adapter. Exactly one method: adapters have no lifecycle, no shared
 * state and no configuration surface beyond construction.
 *
 * It must reject only with an `AiError` — every provider status, network failure,
 * malformed body and abort is mapped inside the adapter, so no provider text ever
 * escapes.
 */
export interface AiProviderAdapter {
  readonly provider: AiProvider;
  readonly complete: (
    request: StructuredRequest,
  ) => Promise<StructuredResponse>;
}

/** How an attempt was made, for the usage ledger. */
export type AttemptKind = "primary" | "retry" | "fallback";

/** One attempt's outcome, recorded whether it succeeded or not. */
export interface AttemptRecord {
  readonly kind: AttemptKind;
  readonly provider: AiProvider;
  readonly modelId: string;
  readonly usage: ProviderUsage;
  readonly failureCode: string | null;
}

/** The result of running the retry/fallback policy. */
export interface ExecutionResult {
  readonly response: StructuredResponse;
  /** Every attempt made, in order — a fallback is never concealed. */
  readonly attempts: readonly AttemptRecord[];
}

/** What the policy needs to run a request across at most two providers. */
export interface ExecutionPlan {
  readonly primary: {
    readonly adapter: AiProviderAdapter;
    readonly model: AiModelEntry;
  };
  /**
   * The fallback, when the feature allows it, both providers are configured, the
   * owner permits it, the tier is the same or cheaper and the budget still fits.
   * `null` disables fallback entirely.
   */
  readonly fallback: {
    readonly adapter: AiProviderAdapter;
    readonly model: AiModelEntry;
  } | null;
  /** True when ONE transport retry against the primary is permitted. */
  readonly allowRetry: boolean;
}

/**
 * Run a structured request under the retry and fallback policy.
 *
 * The policy, stated once and enforced here:
 *
 *   - **No retry** for validation, authentication, budget or policy errors. Those
 *     will fail identically, and repeating them spends the budget for nothing.
 *   - **At most ONE retry** for a transient transport failure (timeout, provider
 *     unavailable, rate limited). Never a loop, never exponential escalation.
 *   - **No retry after a response arrived and failed schema validation.** A
 *     malformed answer is a content problem, not a transport one; DalyHub reports
 *     it rather than paying again for the same shape.
 *   - **No automatic escalation** from economy to deep. A tier change is always
 *     an explicit owner action.
 *   - **Fallback only within the plan**, which the caller has already gated on
 *     feature policy, owner policy, tier and remaining budget.
 *
 * Every attempt is returned in `attempts`, including the ones that failed, so the
 * usage ledger records what actually happened and the owner's usage detail can
 * show that a fallback occurred.
 */
export async function executeWithPolicy(
  request: StructuredRequest,
  plan: ExecutionPlan,
): Promise<ExecutionResult> {
  const attempts: AttemptRecord[] = [];

  const runOnce = async (
    kind: AttemptKind,
    adapter: AiProviderAdapter,
    model: AiModelEntry,
  ): Promise<StructuredResponse> => {
    const response = await adapter.complete({
      ...request,
      model,
      maxOutputTokens: Math.min(request.maxOutputTokens, model.maxOutputTokens),
    });
    attempts.push({
      kind,
      provider: adapter.provider,
      modelId: model.id,
      usage: response.usage,
      failureCode: null,
    });
    return response;
  };

  const recordFailure = (
    kind: AttemptKind,
    adapter: AiProviderAdapter,
    model: AiModelEntry,
    error: AiError,
  ): void => {
    attempts.push({
      kind,
      provider: adapter.provider,
      modelId: model.id,
      usage: { inputTokens: null, outputTokens: null },
      failureCode: error.code,
    });
  };

  let lastError: AiError;
  try {
    const response = await runOnce(
      "primary",
      plan.primary.adapter,
      plan.primary.model,
    );
    return { response, attempts };
  } catch (cause) {
    const error = cause instanceof AiError ? cause : new AiError("internal");
    recordFailure("primary", plan.primary.adapter, plan.primary.model, error);
    if (!isTransientError(error.code)) throw error;
    lastError = error;
  }

  if (plan.allowRetry) {
    try {
      const response = await runOnce(
        "retry",
        plan.primary.adapter,
        plan.primary.model,
      );
      return { response, attempts };
    } catch (cause) {
      const error = cause instanceof AiError ? cause : new AiError("internal");
      recordFailure("retry", plan.primary.adapter, plan.primary.model, error);
      if (!isTransientError(error.code)) throw error;
      lastError = error;
    }
  }

  if (plan.fallback !== null) {
    try {
      const response = await runOnce(
        "fallback",
        plan.fallback.adapter,
        plan.fallback.model,
      );
      return { response, attempts };
    } catch (cause) {
      const error = cause instanceof AiError ? cause : new AiError("internal");
      recordFailure(
        "fallback",
        plan.fallback.adapter,
        plan.fallback.model,
        error,
      );
      throw error;
    }
  }

  throw lastError;
}

/**
 * Sum the token usage across every attempt. A failed attempt that still consumed
 * tokens (a provider that answered and then timed out on our side) is counted —
 * DalyHub reconciles what the provider says it used, not what DalyHub used.
 */
export function totalUsage(attempts: readonly AttemptRecord[]): ProviderUsage {
  let input = 0;
  let output = 0;
  let seen = false;
  for (const attempt of attempts) {
    if (attempt.usage.inputTokens !== null) {
      input += attempt.usage.inputTokens;
      seen = true;
    }
    if (attempt.usage.outputTokens !== null) {
      output += attempt.usage.outputTokens;
      seen = true;
    }
  }
  return seen
    ? { inputTokens: input, outputTokens: output }
    : { inputTokens: null, outputTokens: null };
}
