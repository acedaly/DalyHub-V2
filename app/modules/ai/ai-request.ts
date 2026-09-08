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
 * V2.14 — a failure MAY carry the FactBlock DalyHub had already assembled, and
 * carries the key ONLY when there is one. A failure that happened before any
 * facts existed — AI turned off, an unknown feature, a request that never
 * reached a builder — answers with exactly the three keys AI-01 shipped, which
 * `e2e/ai-assistance.spec.ts` asserts by enumerating them. A `facts: null` that
 * appeared on every refusal would widen that envelope for nothing.
 *
 * Everything else is unchanged: a code, a calm sentence, and now DalyHub's own
 * figures where it has them — never a provider body, a stack trace, an
 * endpoint, an account id, a token or a prompt.
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
  const envelope = { ok: false, code: error.code, message: error.message };
  return aiJson(
    facts === null || facts === undefined ? envelope : { ...envelope, facts },
    aiErrorStatus(error.code),
  );
}
