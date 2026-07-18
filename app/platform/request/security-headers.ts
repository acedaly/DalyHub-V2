/**
 * FND-09 request platform — baseline response security headers and the generic
 * unauthenticated response.
 *
 * A small, verified header policy applied to every response at the Worker
 * boundary (ADR-016 §18). It is intentionally conservative so it cannot break
 * React Router SSR/hydration: the CSP restricts only `base-uri`, `frame-ancestors`
 * and `object-src` (no `script-src`, which would block hydration). Every
 * authenticated response leaves the boundary with exactly `Cache-Control:
 * private, no-store` — any route-provided cache policy is OVERRIDDEN, never
 * preserved, so private application data can never be cached publicly or by an
 * intermediary. The public `/health` route keeps its own independent public-route
 * policy (it is served on the unauthenticated path and never passes through here).
 * No framework stack traces or private details are ever emitted.
 */

import { AuthError } from "~/kernel/auth";

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

/** A minimal CSP that does not interfere with React Router hydration. */
const CONTENT_SECURITY_POLICY = [
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join("; ");

/**
 * Apply the baseline security headers shared by every response. Uses `set` (not
 * `append`) so a header is never duplicated with a contradictory value.
 */
export function applyBaseSecurityHeaders(headers: Headers): void {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", PERMISSIONS_POLICY);
  headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  headers.set("X-Frame-Options", "DENY");
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
  options: { readonly authenticated: boolean },
): Response {
  const headers = new Headers(response.headers);
  applyBaseSecurityHeaders(headers);
  if (options.authenticated) {
    applyAuthenticatedCachePolicy(headers);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
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
export function buildUnauthenticatedResponse(error: unknown): Response {
  const status = error instanceof AuthError ? statusForAuthError(error) : 403;
  const headers = new Headers({
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": AUTHENTICATED_CACHE_CONTROL,
  });
  applyBaseSecurityHeaders(headers);
  const message =
    status === 503 ? "Service unavailable." : "Authentication required.";
  return new Response(message, { status, headers });
}
