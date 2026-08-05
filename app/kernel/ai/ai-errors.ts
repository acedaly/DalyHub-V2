/**
 * AI-01 kernel — the typed application error family for the AI platform.
 *
 * Every failure the AI platform can produce is one of these. The route boundary
 * maps a code to calm owner-facing copy and NEVER passes a provider body, stack
 * trace, endpoint, account id, token, prompt or record content across it
 * (AGENTS.md §17). A provider's own message is deliberately not carried: an
 * upstream error string is untrusted, may quote the request, and has no place in
 * a DalyHub response.
 *
 * Nothing here imports React, D1, Cloudflare or a provider SDK.
 */

/**
 * The bounded vocabulary of AI failures. It is a CLOSED set: an unrecognised
 * condition maps to `provider_unavailable` (transport) or `internal` (ours)
 * rather than inventing a code, so the owner-facing surface can never be asked
 * to render a category it does not know.
 */
export const AI_ERROR_CODES = [
  "ai_disabled",
  "provider_unconfigured",
  "model_unavailable",
  "feature_not_allowed",
  "evidence_unavailable",
  "evidence_too_large",
  "consent_required",
  "daily_budget_reached",
  "monthly_budget_reached",
  "premium_budget_reached",
  "rate_limited",
  "concurrency_limited",
  "provider_timeout",
  "provider_rejected_request",
  "provider_response_invalid",
  "provider_unavailable",
  "result_stale",
  "cancelled",
  "internal",
] as const;

export type AiErrorCode = (typeof AI_ERROR_CODES)[number];

/** True when `value` is a member of the closed error vocabulary. */
export function isAiErrorCode(value: unknown): value is AiErrorCode {
  return (
    typeof value === "string" &&
    (AI_ERROR_CODES as readonly string[]).includes(value)
  );
}

/**
 * Codes that describe a POLICY refusal rather than a fault. A policy refusal is
 * never retried, never falls back to another provider, and never consumes
 * budget — the request stops before a provider is contacted.
 */
const POLICY_CODES: ReadonlySet<AiErrorCode> = new Set([
  "ai_disabled",
  "provider_unconfigured",
  "model_unavailable",
  "feature_not_allowed",
  "evidence_unavailable",
  "evidence_too_large",
  "consent_required",
  "daily_budget_reached",
  "monthly_budget_reached",
  "premium_budget_reached",
  "concurrency_limited",
  "result_stale",
  "cancelled",
]);

/**
 * Codes describing a TRANSIENT transport condition. Exactly these are eligible
 * for the single bounded retry and for provider fallback (`ai-client.ts`).
 * `provider_response_invalid` is deliberately absent: a response that arrived
 * and failed schema validation is not a transport fault, and repeating the
 * request would spend the budget again for the same reason.
 */
const TRANSIENT_CODES: ReadonlySet<AiErrorCode> = new Set([
  "provider_timeout",
  "provider_unavailable",
  "rate_limited",
]);

/** True when the code is a policy refusal (never retried, never billed). */
export function isPolicyError(code: AiErrorCode): boolean {
  return POLICY_CODES.has(code);
}

/** True when the code is a transient transport condition (retry-eligible). */
export function isTransientError(code: AiErrorCode): boolean {
  return TRANSIENT_CODES.has(code);
}

/**
 * The one AI error type. `code` is the machine-readable category; `message` is
 * already owner-facing copy — there is no second, private message, because a
 * second message is how private detail leaks.
 */
export class AiError extends Error {
  readonly code: AiErrorCode;
  /**
   * A bounded, non-identifying hint safe to record in the usage ledger and in
   * server logs — never a provider body, never record content. Optional.
   */
  readonly detail: string | null;

  constructor(code: AiErrorCode, message?: string, detail?: string | null) {
    super(message ?? aiErrorMessage(code));
    this.name = "AiError";
    this.code = code;
    this.detail = detail ?? null;
  }

  /** True when this failure may be retried once by the transport policy. */
  get transient(): boolean {
    return isTransientError(this.code);
  }

  /** True when this failure is a policy refusal, so no provider was contacted. */
  get policy(): boolean {
    return isPolicyError(this.code);
  }
}

/** Narrow an unknown thrown value to an {@link AiError}. */
export function isAiError(value: unknown): value is AiError {
  return value instanceof AiError;
}

/**
 * Coerce ANY thrown value into a typed `AiError`. This is the funnel every
 * adapter and route uses, so a raw `TypeError`, a provider SDK error or a
 * `DOMException` can never escape as itself. The original value is dropped
 * entirely — not stringified into the message — because an upstream string may
 * quote the request body.
 */
export function toAiError(value: unknown): AiError {
  if (isAiError(value)) return value;
  if (value instanceof DOMException && value.name === "AbortError") {
    return new AiError("cancelled");
  }
  if (value instanceof Error && value.name === "AbortError") {
    return new AiError("cancelled");
  }
  return new AiError("internal", undefined, "unexpected");
}

/**
 * The calm owner-facing sentence for each code. Deliberately plain: it says what
 * happened and what the owner can do, never why the provider is unhappy.
 */
export function aiErrorMessage(code: AiErrorCode): string {
  switch (code) {
    case "ai_disabled":
      return "AI assistance is turned off. You can turn it on in Settings.";
    case "provider_unconfigured":
      return "No AI provider is configured yet. Ask DalyHub can’t run until one is.";
    case "model_unavailable":
      return "That model isn’t available for this feature.";
    case "feature_not_allowed":
      return "This AI feature is turned off for your workspace.";
    case "evidence_unavailable":
      return "DalyHub couldn’t gather anything to work from. Try a narrower request.";
    case "evidence_too_large":
      return "There’s more here than one request can carry. Narrow the range and try again.";
    case "consent_required":
      return "Some of this content is in a category you asked DalyHub to check first.";
    case "daily_budget_reached":
      return "Today’s AI budget is used up. It resets tomorrow, or you can raise it in Settings.";
    case "monthly_budget_reached":
      return "This month’s AI budget is used up. You can raise it deliberately in Settings.";
    case "premium_budget_reached":
      return "The deep-analysis allowance for this month is used up.";
    case "rate_limited":
      return "The AI provider is busy. Wait a moment and try again.";
    case "concurrency_limited":
      return "Another AI request is already running. Wait for it to finish.";
    case "provider_timeout":
      return "The AI provider took too long to answer. Nothing was changed.";
    case "provider_rejected_request":
      return "The AI provider refused this request. Nothing was changed.";
    case "provider_response_invalid":
      return "The AI answer didn’t match what DalyHub expects, so it was discarded.";
    case "provider_unavailable":
      return "The AI provider couldn’t be reached. Nothing was changed.";
    case "result_stale":
      return "One of the records changed since this was generated. Run it again.";
    case "cancelled":
      return "That request was cancelled. Nothing was changed.";
    case "internal":
      return "That didn’t work. Nothing was changed.";
  }
}

/**
 * The HTTP status a code answers with at the route boundary. Budget, consent and
 * policy refusals are `409` (a legitimate state, not a malformed request); an
 * unavailable provider is `503`; a cancelled request is `499`-like but expressed
 * as `409` because DalyHub never returns non-standard statuses.
 */
export function aiErrorStatus(code: AiErrorCode): number {
  switch (code) {
    case "ai_disabled":
    case "provider_unconfigured":
    case "feature_not_allowed":
    case "model_unavailable":
      return 409;
    case "evidence_unavailable":
      return 404;
    case "evidence_too_large":
      return 413;
    case "consent_required":
    case "daily_budget_reached":
    case "monthly_budget_reached":
    case "premium_budget_reached":
    case "concurrency_limited":
    case "result_stale":
    case "cancelled":
      return 409;
    case "rate_limited":
      return 429;
    case "provider_timeout":
    case "provider_unavailable":
      return 503;
    case "provider_rejected_request":
    case "provider_response_invalid":
      return 502;
    case "internal":
      return 500;
  }
}
