/**
 * AUDIT-FIX-04 — the canonical way tests build a request that looks like one a
 * real browser sent.
 *
 * Since the request boundary began checking mutation provenance, a `Request`
 * constructed by hand with no `Origin` is no longer a realistic stand-in for a
 * DalyHub form submission — it is a request no browser makes. The production
 * guard is deliberately NOT relaxed for that; instead the test request shape is
 * corrected here, in one place, so every suite agrees on what a genuine
 * same-origin mutation looks like.
 *
 * ── Why the `headers` override ───────────────────────────────────────────────
 * `Origin` and `Sec-Fetch-Site` are FORBIDDEN header names: the Fetch Standard
 * has the browser set them and forbids script from doing so. happy-dom (the
 * unit-test DOM) enforces that faithfully and silently drops both from
 * `new Request(url, { headers })` — the very headers the boundary needs to see.
 * So the headers are built on a standalone `Headers`, which carries no request
 * guard, and installed on the request. Production is untouched: in workerd a
 * real browser request arrives with these headers already set, and the kernel
 * integration suite exercises exactly that with a genuine runtime `Request`.
 */

/** The origin the unit suites treat as DalyHub's own. */
export const TEST_APP_ORIGIN = "https://hub.daly.id.au";

/** A sibling host: same-SITE, different ORIGIN — the case Access alone misses. */
export const TEST_SIBLING_ORIGIN = "https://other.daly.id.au";

/** A plainly unrelated attacker origin. */
export const TEST_HOSTILE_ORIGIN = "https://evil.example";

export interface BrowserRequestOptions {
  readonly method?: string;
  /** Omitted entirely when absent — models a browser that sends no `Origin`. */
  readonly origin?: string;
  /** Omitted entirely when absent — models an older browser. */
  readonly fetchSite?: string;
  /** Any additional, ordinary (non-forbidden) headers. */
  readonly headers?: Record<string, string>;
  readonly body?: BodyInit;
}

/**
 * Build a request with the browser-controlled provenance headers actually
 * attached, whatever the test environment's `Request` would otherwise strip.
 */
export function browserRequest(
  url: string,
  options: BrowserRequestOptions = {},
): Request {
  const { method = "GET", origin, fetchSite, headers = {}, body } = options;
  const request = new Request(url, {
    method,
    ...(body === undefined ? {} : { body }),
  });
  const merged = new Headers(request.headers);
  for (const [name, value] of Object.entries(headers)) merged.set(name, value);
  if (origin !== undefined) merged.set("Origin", origin);
  if (fetchSite !== undefined) merged.set("Sec-Fetch-Site", fetchSite);
  Object.defineProperty(request, "headers", {
    value: merged,
    configurable: true,
  });
  return request;
}

/**
 * A same-origin mutation, exactly as a browser submits one: the `Origin` matches
 * the request URL's own origin and `Sec-Fetch-Site` says `same-origin`.
 *
 * The helper stays HONEST — it derives the origin from the URL it was given, so
 * it can never accidentally bless a cross-origin request.
 */
export function sameOriginMutation(
  url: string,
  options: Omit<BrowserRequestOptions, "origin" | "fetchSite"> & {
    readonly method?: string;
  } = {},
): Request {
  return browserRequest(url, {
    method: "POST",
    ...options,
    origin: new URL(url).origin,
    fetchSite: "same-origin",
  });
}
