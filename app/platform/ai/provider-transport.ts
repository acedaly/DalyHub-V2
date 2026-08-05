/**
 * AI-01 platform — the one HTTP path to a provider.
 *
 * Both adapters go through this function, so the deadline, the cancellation
 * wiring, the size ceiling and — above all — the error redaction are implemented
 * ONCE. A provider's response body is read only far enough to parse JSON; on any
 * non-2xx status the body is **not** read into an error at all, because an
 * upstream error string may quote the request that produced it.
 */

import { AiError } from "~/kernel/ai";

/** Refuse to buffer a pathological response. 4 MiB is far above any real answer. */
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

/** One provider call. */
export interface FetchJsonInput {
  readonly url: string;
  readonly method: "POST";
  readonly headers: Record<string, string>;
  readonly body: unknown;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
  readonly fetchImpl?: typeof fetch;
}

/**
 * Perform one JSON request and return the parsed body.
 *
 * The deadline and the caller's cancellation are linked into a single
 * `AbortController`, so a cancelled owner action stops the socket rather than
 * merely abandoning the promise — and the two are told apart on the way out, so
 * DalyHub never claims the provider cancelled when only the browser did.
 *
 * Rejects with an `AiError` and nothing else.
 */
export async function fetchJson(input: FetchJsonInput): Promise<unknown> {
  const doFetch = input.fetchImpl ?? fetch;
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(
    () => {
      timedOut = true;
      controller.abort();
    },
    Math.max(1, input.timeoutMs),
  );

  const forwardAbort = () => controller.abort();
  if (input.signal !== undefined) {
    if (input.signal.aborted) controller.abort();
    else input.signal.addEventListener("abort", forwardAbort, { once: true });
  }

  let response: Response;
  try {
    response = await doFetch(input.url, {
      method: input.method,
      headers: input.headers,
      body: JSON.stringify(input.body),
      signal: controller.signal,
    });
  } catch {
    // Deliberately does not inspect the thrown value: a fetch rejection can
    // carry the request URL, which carries the account and gateway ids.
    if (timedOut) throw new AiError("provider_timeout");
    if (input.signal?.aborted === true) throw new AiError("cancelled");
    throw new AiError("provider_unavailable", undefined, "transport");
  } finally {
    clearTimeout(timer);
    if (input.signal !== undefined) {
      input.signal.removeEventListener("abort", forwardAbort);
    }
  }

  if (!response.ok) {
    // The body is NOT read. Status alone decides the category.
    throw statusToAiError(response.status);
  }

  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    throw new AiError("provider_response_invalid", undefined, "too_large");
  }

  let text: string;
  try {
    text = await response.text();
  } catch {
    if (input.signal?.aborted === true) throw new AiError("cancelled");
    throw new AiError("provider_unavailable", undefined, "body");
  }
  if (text.length > MAX_RESPONSE_BYTES) {
    throw new AiError("provider_response_invalid", undefined, "too_large");
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AiError("provider_response_invalid", undefined, "malformed_json");
  }
}

/**
 * Map a provider HTTP status to a DalyHub error category. Both providers use the
 * same conventional statuses for these cases, so one table serves both.
 *
 * `401`/`403` become `provider_rejected_request`, NOT an authentication error the
 * owner can act on: DalyHub does not tell a browser that a server-side credential
 * is wrong. A misconfigured key surfaces in the deploy preflight and the server
 * log, where it belongs.
 */
export function statusToAiError(status: number): AiError {
  if (status === 400 || status === 422) {
    return new AiError(
      "provider_rejected_request",
      undefined,
      `http_${status}`,
    );
  }
  if (status === 401 || status === 403) {
    return new AiError("provider_rejected_request", undefined, "auth");
  }
  if (status === 404) {
    return new AiError("model_unavailable", undefined, "http_404");
  }
  if (status === 408 || status === 504) {
    return new AiError("provider_timeout", undefined, `http_${status}`);
  }
  if (status === 413) {
    return new AiError("evidence_too_large", undefined, "http_413");
  }
  if (status === 429) {
    return new AiError("rate_limited", undefined, "http_429");
  }
  if (status >= 500) {
    return new AiError("provider_unavailable", undefined, `http_${status}`);
  }
  return new AiError("provider_unavailable", undefined, `http_${status}`);
}
