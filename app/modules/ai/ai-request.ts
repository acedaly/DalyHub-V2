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

/** Turn any thrown value into the bounded AI failure envelope. */
export function aiErrorResponse(cause: unknown): Response {
  const error = toAiError(cause);
  return aiJson(
    { ok: false, code: error.code, message: error.message },
    aiErrorStatus(error.code),
  );
}
