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
  buildUnauthenticatedResponse,
  withSecurityHeaders,
} from "~/platform/request/security-headers";

describe("baseline security headers", () => {
  it("sets the conservative header policy without a script-src CSP", () => {
    const headers = new Headers();
    applyBaseSecurityHeaders(headers);
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    const csp = headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain("script-src");
    expect(headers.get("Permissions-Policy")).toContain("camera=()");
  });
});

describe("withSecurityHeaders", () => {
  it("marks authenticated responses private and non-cacheable", async () => {
    const response = withSecurityHeaders(new Response("hi"), {
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
      { authenticated: true },
    );
    // Exactly `private, no-store` — the route policy is replaced, not appended.
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("does not add a private cache policy to public responses", () => {
    const response = withSecurityHeaders(
      new Response("ok", { headers: { "Cache-Control": "no-store" } }),
      { authenticated: false },
    );
    // The public /health route keeps its own independent public-route policy.
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("leaves a public response's absent cache policy untouched", () => {
    const response = withSecurityHeaders(
      new Response("ok", {
        headers: { "Cache-Control": "public, max-age=30" },
      }),
      { authenticated: false },
    );
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=30");
  });
});

describe("buildUnauthenticatedResponse", () => {
  it("maps missing credentials to 401 and other failures to 403", () => {
    expect(
      buildUnauthenticatedResponse(new MissingCredentialsError()).status,
    ).toBe(401);
    for (const error of [
      new InvalidCredentialsError(),
      new ExpiredCredentialsError(),
      new OwnerMismatchError(),
    ]) {
      expect(buildUnauthenticatedResponse(error).status).toBe(403);
    }
  });

  it("maps configuration/infrastructure faults to 503", () => {
    expect(
      buildUnauthenticatedResponse(new AuthConfigurationError()).status,
    ).toBe(503);
  });

  it("returns a generic body with no token, no-store and security headers", async () => {
    const response = buildUnauthenticatedResponse(
      new InvalidCredentialsError({ cause: new Error("eyJ.token.sig") }),
    );
    const body = await response.text();
    expect(body).not.toContain("eyJ");
    expect(body.toLowerCase()).toContain("authentication required");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});
