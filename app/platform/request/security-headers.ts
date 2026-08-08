/**
 * FND-09 / AUDIT-10 request platform — baseline response security headers and
 * the generic unauthenticated response.
 *
 * ONE header authority. Every response DalyHub's Worker emits — a document, a
 * data request, a resource route, a 403 CSRF rejection, a 401/503 authentication
 * failure — leaves through this module, and no route sets a security header of
 * its own. The only other place these headers are written is the service worker,
 * for the responses it SYNTHESISES while offline, and that duplication is
 * asserted against this file by `test/unit/pwa/service-worker-runtime.test.ts` so
 * it cannot rot silently.
 *
 * AUDIT-10 replaced the previous three-directive CSP (`base-uri`,
 * `frame-ancestors`, `object-src` — no `default-src`, no `script-src`) with a
 * complete, enforcing policy built per response around a fresh nonce. The policy
 * itself, and the evidence behind every source in it, lives in
 * `./content-security-policy`.
 *
 * Every authenticated response leaves the boundary with exactly `Cache-Control:
 * private, no-store` — any route-provided cache policy is OVERRIDDEN, never
 * preserved, so private application data can never be cached publicly or by an
 * intermediary. The public `/health` route keeps its own independent public-route
 * policy. No framework stack traces or private details are ever emitted.
 */

import { AuthError } from "~/kernel/auth";

import {
  buildContentSecurityPolicy,
  createCspNonce,
  type CspMode,
} from "./content-security-policy";

/** A conservative Permissions-Policy denying powerful features by default. */
const PERMISSIONS_POLICY = [
  "accelerometer=()",
  "camera=()",
  "geolocation=()",
  "gyroscope=()",
  "magnetometer=()",
  "microphone=()",
  "payment=()",
  "usb=()",
].join(", ");

/** What one response needs in order to be given its security headers. */
export type SecurityHeaderOptions = {
  /** The per-response CSP nonce minted by the request boundary. */
  readonly nonce: string;
  /** Which policy applies. Resolved once per request, fail-closed. */
  readonly mode: CspMode;
};

/**
 * Apply the baseline security headers shared by every response. Uses `set` (not
 * `append`) so a header is never duplicated with a contradictory value.
 *
 * `X-Frame-Options: DENY` is retained ALONGSIDE `frame-ancestors 'none'` rather
 * than in contradiction to it: the two say the same thing, and the legacy header
 * is the one a user agent without CSP3 framing support will honour. Where a
 * modern browser reads both, `frame-ancestors` wins and agrees.
 *
 * `Cross-Origin-Opener-Policy: same-origin` severs the window relationship with
 * any cross-origin opener or popup. DalyHub opens no cross-origin window and is
 * opened by none, so this costs nothing and closes the cross-window-scripting and
 * XS-leak class. `Cross-Origin-Embedder-Policy` is deliberately NOT set: it would
 * buy cross-origin isolation DalyHub has no use for (no `SharedArrayBuffer`, no
 * high-resolution timers) at the price of breaking any future cross-origin
 * subresource.
 *
 * `Strict-Transport-Security` is deliberately NOT set here. HSTS belongs to the
 * edge that terminates TLS for `hub.daly.id.au` — Cloudflare — and it is the one
 * header whose failure mode (a wrong `max-age`, an accidental `preload`) is
 * measured in months of unreachability. Two authorities for it would be one too
 * many. See `docs/development/DEPLOYMENT.md`.
 */
export function applyBaseSecurityHeaders(
  headers: Headers,
  options: SecurityHeaderOptions,
): void {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", PERMISSIONS_POLICY);
  headers.set("Content-Security-Policy", buildContentSecurityPolicy(options));
  headers.set("X-Frame-Options", "DENY");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
}

/** The single cache policy every authenticated response leaves the boundary with. */
export const AUTHENTICATED_CACHE_CONTROL = "private, no-store";

/**
 * Force the private, non-cacheable policy on an authenticated response. This
 * OVERRIDES any route-provided `Cache-Control` (public, s-maxage, max-age,
 * no-cache, a narrower private policy, …) with exactly `private, no-store`. A
 * protected response must never carry a route's own cache policy: authenticated
 * data may not be cached by the browser, a shared/CDN cache or any intermediary.
 * Uses `set` so any inherited value is replaced, not appended.
 */
export function applyAuthenticatedCachePolicy(headers: Headers): void {
  headers.set("Cache-Control", AUTHENTICATED_CACHE_CONTROL);
}

/**
 * Re-emit a response with the baseline security headers applied. For an
 * authenticated response the cache policy is forced to `private, no-store`,
 * overriding whatever the route set. Rebuilding the response keeps the (possibly
 * streaming) body intact while guaranteeing our headers win.
 */
export function withSecurityHeaders(
  response: Response,
  options: SecurityHeaderOptions & { readonly authenticated: boolean },
): Response {
  const headers = new Headers(response.headers);
  applyBaseSecurityHeaders(headers, options);
  if (options.authenticated) {
    applyAuthenticatedCachePolicy(headers);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Build the generic response for a mutation that failed the provenance check
 * (AUDIT-FIX-04). Deliberately indistinguishable from one rejection reason to
 * the next: it echoes NO `Origin`, names no route, carries no token or claim, no
 * SQL, no framework detail and no `Access-Control-Allow-*` header of any kind —
 * this is CSRF protection, not an invitation to cross-origin API access. It is a
 * plain `403` with the baseline security headers and the private, non-cacheable
 * policy; it is never a redirect, because redirecting a rejected mutation would
 * hand the caller a second attempt.
 *
 * A REJECTION carries the full policy too (AUDIT-10). A rejected or failed
 * response is not a lesser response: it is still a document the browser parses,
 * and a policy that only covers the happy path is not a policy.
 */
export function buildCrossOriginRejectionResponse(
  options: SecurityHeaderOptions,
): Response {
  const headers = new Headers({
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": AUTHENTICATED_CACHE_CONTROL,
  });
  applyBaseSecurityHeaders(headers, options);
  return new Response("Request rejected.", { status: 403, headers });
}

/** Map an authentication failure to a generic HTTP status. */
function statusForAuthError(error: AuthError): number {
  if (error.configuration) {
    // Misconfiguration or infrastructure fault: a server-side problem.
    return 503;
  }
  switch (error.code) {
    case "missing_credentials":
      return 401;
    default:
      // invalid / expired / identity-claim / owner-mismatch: forbidden, and the
      // response never reveals which check failed.
      return 403;
  }
}

/**
 * Build the generic response for a failed authentication. Carries no token, no
 * claim, no team/AUD value and no stack trace — only a short generic message and
 * the baseline security headers. Not publicly cacheable.
 */
export function buildUnauthenticatedResponse(
  error: unknown,
  options: SecurityHeaderOptions,
): Response {
  const status = error instanceof AuthError ? statusForAuthError(error) : 403;
  const headers = new Headers({
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": AUTHENTICATED_CACHE_CONTROL,
  });
  applyBaseSecurityHeaders(headers, options);
  const message =
    status === 503 ? "Service unavailable." : "Authentication required.";
  return new Response(message, { status, headers });
}

/**
 * Mint the security-header options for one request. Exported so the boundary — and
 * only the boundary — decides a request's nonce exactly once, and every response
 * built for that request (accepted, rejected or failed) carries the same one.
 */
export function createSecurityHeaderOptions(
  mode: CspMode,
): SecurityHeaderOptions {
  return { nonce: createCspNonce(), mode };
}
