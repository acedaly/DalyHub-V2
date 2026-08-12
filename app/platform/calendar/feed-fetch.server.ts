/**
 * CAL-01 — fetching an external calendar feed, safely.
 *
 * The Worker is being asked to issue an HTTP request to an address the owner
 * supplied. That is server-side request forgery by construction, so every
 * property that makes it *not* a generic HTTP proxy is enforced here and in
 * `~/kernel/calendar/feed-url`:
 *
 *   - **the URL policy runs on every hop**, not just at entry. Redirects are
 *     followed MANUALLY (`redirect: "manual"`) precisely so each `Location` can
 *     be revalidated — an automatic follow would let a publisher redirect
 *     DalyHub to an address the policy refuses;
 *   - **the hop count is bounded** ({@link MAX_FEED_REDIRECTS});
 *   - **the body is bounded** ({@link MAX_FEED_BYTES}), enforced while READING
 *     rather than by trusting `Content-Length`, because a hostile server can
 *     understate or omit it;
 *   - **the request is bounded in time** ({@link FEED_TIMEOUT_MS});
 *   - **nothing about the response is echoed anywhere.** The body is never
 *     logged, never stored raw, and never put in an error message. What comes
 *     back from here is a body or a CODE.
 *
 * The request itself is deliberately plain: `GET`, one `Accept` header, no
 * cookies, no credentials, no owner data of any kind. DalyHub does not tell a
 * calendar publisher who is asking.
 */

import {
  FEED_TIMEOUT_MS,
  FeedUrlError,
  MAX_FEED_BYTES,
  MAX_FEED_REDIRECTS,
  normaliseFeedUrl,
  type CalendarSyncErrorCode,
} from "~/kernel/calendar";

export class FeedFetchError extends Error {
  constructor(readonly code: CalendarSyncErrorCode) {
    super(`The calendar feed could not be fetched (${code}).`);
    this.name = "FeedFetchError";
  }
}

/** The one identity DalyHub presents. No owner data, no deployment hostname. */
const USER_AGENT = "DalyHub/2 (+calendar-subscription)";

/**
 * A fetch seam, so tests drive the whole redirect/limit path deterministically
 * without a network. The default is the runtime's own `fetch`.
 */
export type FeedFetcher = (url: string, init: RequestInit) => Promise<Response>;

/**
 * The response codes that mean something specific to the owner.
 *
 * 401/403 is "the link no longer authorises you", which for a published
 * calendar almost always means it was reset. 404/410 is "this link is gone".
 * Everything else in 4xx/5xx is a server problem the owner cannot act on, so it
 * says so and DalyHub tries again later.
 */
function codeForStatus(status: number): CalendarSyncErrorCode {
  if (status === 401 || status === 403) return "unauthorised";
  if (status === 404 || status === 410) return "not_found";
  if (status >= 500) return "server_error";
  return "unreachable";
}

/**
 * Fetch a feed body, following bounded and revalidated redirects.
 *
 * `startUrl` must already have passed {@link normaliseFeedUrl}; it is
 * revalidated here anyway, because a function that assumes its caller validated
 * is a function that stops being a control the day a new caller appears.
 */
export async function fetchFeedBody(
  startUrl: string,
  options: { readonly fetcher?: FeedFetcher } = {},
): Promise<string> {
  const fetcher = options.fetcher ?? ((url, init) => fetch(url, init));
  let url: string;
  try {
    url = normaliseFeedUrl(startUrl);
  } catch (cause) {
    throw new FeedFetchError(
      cause instanceof FeedUrlError ? "blocked_target" : "unreachable",
    );
  }

  for (let hop = 0; hop <= MAX_FEED_REDIRECTS; hop += 1) {
    let response: Response;
    try {
      response = await fetcher(url, {
        method: "GET",
        // Manual, so every hop goes back through the URL policy above.
        redirect: "manual",
        headers: {
          accept: "text/calendar, text/plain;q=0.9, */*;q=0.1",
          "user-agent": USER_AGENT,
        },
        signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
      });
    } catch (cause) {
      // `AbortSignal.timeout` rejects with a `TimeoutError`; everything else is
      // DNS, TLS or connectivity. Neither carries anything safe to report.
      const name =
        cause instanceof Error ? cause.name : String(cause ?? "unknown");
      throw new FeedFetchError(
        name === "TimeoutError" || name === "AbortError"
          ? "timeout"
          : "unreachable",
      );
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (location === null) throw new FeedFetchError("unreachable");
      if (hop === MAX_FEED_REDIRECTS) {
        throw new FeedFetchError("too_many_redirects");
      }
      let next: string;
      try {
        // Resolved against the CURRENT url, so a relative `Location` works, and
        // then revalidated in full — this is the hop an unguarded redirect
        // follower would use to reach a private address.
        next = normaliseFeedUrl(new URL(location, url).toString());
      } catch {
        throw new FeedFetchError("blocked_target");
      }
      url = next;
      continue;
    }

    if (!response.ok) {
      throw new FeedFetchError(codeForStatus(response.status));
    }

    // A declared length past the bound is refused before a byte is read.
    const declared = Number(response.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > MAX_FEED_BYTES) {
      throw new FeedFetchError("too_large");
    }
    return await readBounded(response);
  }

  throw new FeedFetchError("too_many_redirects");
}

/**
 * Read a response body, refusing it the moment it passes the bound.
 *
 * Streamed rather than `await response.text()`, because `text()` buffers the
 * whole body before anything can object — a server that streams gigabytes would
 * exhaust the isolate before the length was ever checked. The reader is
 * cancelled on refusal so the connection is not left draining.
 */
async function readBounded(response: Response): Promise<string> {
  const body = response.body;
  if (body === null) throw new FeedFetchError("not_calendar");
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const chunks: string[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_FEED_BYTES) {
        throw new FeedFetchError("too_large");
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
  } catch (cause) {
    if (cause instanceof FeedFetchError) {
      await reader.cancel().catch(() => undefined);
      throw cause;
    }
    await reader.cancel().catch(() => undefined);
    throw new FeedFetchError("unreachable");
  }
  return chunks.join("");
}
