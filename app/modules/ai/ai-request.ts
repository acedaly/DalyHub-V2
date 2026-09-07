/**
 * AI-01 — the AI routes' response envelope.
 *
 * The ONLY things that cross this boundary are a code and its calm sentence. No
 * provider body, stack trace, endpoint, account id, token, prompt or record
 * content — which is why the raw thrown value is never inspected beyond
 * `toAiError`, and why every AI response is `private, no-store` with no CORS
 * header.
 */

import { aiErrorStatus, toAiError } from "~/kernel/ai";

/** The JSON envelope every AI route answers with. Private, never cached. */
export function aiJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store",
    },
  });
}

/**
 * Turn any thrown value into the bounded AI failure envelope.
 *
 * V2.14 — a failure MAY carry the FactBlock DalyHub had already assembled.
 * Everything else about the envelope is unchanged: still only a code, a calm
 * sentence and now DalyHub's own figures, and still never a provider body, a
 * stack trace, an endpoint, an account id, a token or a prompt.
 *
 * The figures are safe to return for the same reason they are safe to draw:
 * they were computed by DalyHub from the owner's own workspace, under the same
 * scope the request was authenticated in, and nothing was sent anywhere to
 * produce them.
 */
export function aiErrorResponse(
  cause: unknown,
  facts: unknown = null,
): Response {
  const error = toAiError(cause);
  return aiJson(
    { ok: false, code: error.code, message: error.message, facts },
    aiErrorStatus(error.code),
  );
}
