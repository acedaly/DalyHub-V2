import { describe, expect, it } from "vitest";

import {
  AuthConfigurationError,
  ExpiredCredentialsError,
  InvalidCredentialsError,
  MissingCredentialsError,
  OwnerMismatchError,
} from "~/kernel/auth";
import {
  applyBaseSecurityHeaders,
  buildCrossOriginRejectionResponse,
  buildUnauthenticatedResponse,
  createSecurityHeaderOptions,
  withSecurityHeaders,
} from "~/platform/request/security-headers";

/** The fixed header options a test uses when the nonce itself is not the subject. */
const SECURITY = { nonce: "abcdefghijklmnop0123", mode: "production" } as const;

describe("baseline security headers", () => {
  it("sets the header policy every response leaves the boundary with", () => {
    const headers = new Headers();
    applyBaseSecurityHeaders(headers, SECURITY);
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
    expect(headers.get("Permissions-Policy")).toContain("camera=()");
  });

  // AUDIT-10 — the finding this replaces was "no `script-src`/`default-src`".
  // The per-directive assertions live in `content-security-policy.test.ts`;
  // these prove the ENFORCING policy is what actually reaches a response.
  it("carries an enforcing script policy, not a report-only one", () => {
    const headers = new Headers();
    applyBaseSecurityHeaders(headers, SECURITY);
    expect(headers.get("Content-Security-Policy-Report-Only")).toBeNull();
    const csp = headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain(`script-src 'self' 'nonce-${SECURITY.nonce}'`);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("worker-src 'self'");
    expect(csp).not.toContain("unsafe-eval");
  });

  // `X-Frame-Options: DENY` and `frame-ancestors 'none'` say the same thing. The
  // legacy header is kept for user agents without CSP3 framing support, and this
  // holds the two in agreement so a future edit cannot leave them contradicting.
  it("keeps the legacy framing header in agreement with the CSP", () => {
    const headers = new Headers();
    applyBaseSecurityHeaders(headers, SECURITY);
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'none'",
    );
  });

  // HSTS belongs to the edge that terminates TLS. Two authorities for a header
  // whose failure mode is months of unreachability is one too many.
  it("does not set Strict-Transport-Security (Cloudflare owns it)", () => {
    const headers = new Headers();
    applyBaseSecurityHeaders(headers, SECURITY);
    expect(headers.get("Strict-Transport-Security")).toBeNull();
  });
});

describe("createSecurityHeaderOptions", () => {
  it("mints a distinct nonce per request", () => {
    const first = createSecurityHeaderOptions("production");
    const second = createSecurityHeaderOptions("production");
    expect(first.nonce).not.toBe(second.nonce);
    expect(first.mode).toBe("production");
  });
});

describe("withSecurityHeaders", () => {
  it("marks authenticated responses private and non-cacheable", async () => {
    const response = withSecurityHeaders(new Response("hi"), {
      ...SECURITY,
      authenticated: true,
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await response.text()).toBe("hi");
  });

  // Every authenticated response leaves the boundary with exactly
  // `private, no-store`, no matter what cache policy the route tried to set. A
  // route-provided policy is OVERRIDDEN, never preserved — private application
  // data must never be cached by the browser, a shared/CDN cache or an
  // intermediary.
  it.each([
    "public, max-age=3600",
    "s-maxage=3600",
    "max-age=3600",
    "no-cache",
    "private, max-age=5",
    "private, no-store",
  ])("forces private, no-store over a route policy of %s", (routePolicy) => {
    const response = withSecurityHeaders(
      new Response("x", { headers: { "Cache-Control": routePolicy } }),
      { ...SECURITY, authenticated: true },
    );
    // Exactly `private, no-store` — the route policy is replaced, not appended.
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("does not add a private cache policy to public responses", () => {
    const response = withSecurityHeaders(
      new Response("ok", { headers: { "Cache-Control": "no-store" } }),
      { ...SECURITY, authenticated: false },
    );
    // The public /health route keeps its own independent public-route policy.
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("leaves a public response’s absent cache policy untouched", () => {
    const response = withSecurityHeaders(
      new Response("ok", {
        headers: { "Cache-Control": "public, max-age=30" },
      }),
      { ...SECURITY, authenticated: false },
    );
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=30");
  });
});

describe("buildUnauthenticatedResponse", () => {
  it("maps missing credentials to 401 and other failures to 403", () => {
    expect(
      buildUnauthenticatedResponse(new MissingCredentialsError(), SECURITY)
        .status,
    ).toBe(401);
    for (const error of [
      new InvalidCredentialsError(),
      new ExpiredCredentialsError(),
      new OwnerMismatchError(),
    ]) {
      expect(buildUnauthenticatedResponse(error, SECURITY).status).toBe(403);
    }
  });

  it("maps configuration/infrastructure faults to 503", () => {
    expect(
      buildUnauthenticatedResponse(new AuthConfigurationError(), SECURITY)
        .status,
    ).toBe(503);
  });

  it("returns a generic body with no token, no-store and security headers", async () => {
    const response = buildUnauthenticatedResponse(
      new InvalidCredentialsError({ cause: new Error("eyJ.token.sig") }),
      SECURITY,
    );
    const body = await response.text();
    expect(body).not.toContain("eyJ");
    expect(body.toLowerCase()).toContain("authentication required");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});

// AUDIT-10 — a failure response is still a response the browser parses. A policy
// that only covers the happy path is not a policy, so the rejection and
// authentication-failure paths are asserted to carry the same enforcing CSP.
describe("security headers on rejection and failure responses", () => {
  it.each([
    [
      "cross-origin mutation rejection",
      () => buildCrossOriginRejectionResponse(SECURITY),
    ],
    [
      "authentication failure",
      () =>
        buildUnauthenticatedResponse(new InvalidCredentialsError(), SECURITY),
    ],
  ])("applies the full policy to a %s", (_name, build) => {
    const csp = build().headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain(`script-src 'self' 'nonce-${SECURITY.nonce}'`);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("names no origin and grants no CORS on a rejection", async () => {
    const response = buildCrossOriginRejectionResponse(SECURITY);
    expect(response.status).toBe(403);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(await response.text()).toBe("Request rejected.");
  });
});
