/**
 * CAPTURE-01 — the request boundary's capture carve-out.
 *
 * `POST /api/capture` is the ONE path that reaches the application without a
 * Cloudflare Access session, because the caller is an Apple Shortcut with no
 * browser and no way to complete an Access challenge. A carve-out in the
 * boundary that authenticates everything else is exactly the kind of change that
 * has to be pinned by tests, so these assert its two halves:
 *
 *   - it is as NARROW as claimed — one exact path, one method, nothing near it;
 *   - it hands the route NO session, so a route that asked for one would still
 *     fail closed rather than run as the owner.
 *
 * That the endpoint itself refuses an unauthenticated caller is proved against
 * real D1 in `test/kernel/capture-route.test.ts`.
 */

import { RouterContextProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";

import {
  MissingCredentialsError,
  type AuthenticatedSession,
  type Authenticator,
} from "~/kernel/auth";
import { getAuthenticatedSession } from "~/platform/request/authenticated-request-context";
import {
  CAPTURE_PATH,
  handleAuthenticatedRequest,
  isCaptureRequest,
} from "~/platform/request/request-boundary";

import { TEST_HOSTILE_ORIGIN } from "../../support/requests";

const OWNER_SESSION: AuthenticatedSession = {
  user: { subject: "owner-sub", email: "owner@example.com", displayName: null },
  issuedAt: new Date(0),
  expiresAt: new Date(Date.parse("2999-01-01")),
};

const PROD_ENV = {
  AUTH_MODE: "cloudflare-access" as const,
  ENVIRONMENT: "production",
  ACCESS_TEAM_DOMAIN: "",
  ACCESS_AUD: "",
  OWNER_EMAIL: "",
};

function handler() {
  return vi.fn(
    (_request: Request, _context?: RouterContextProvider): Promise<Response> =>
      Promise.resolve(new Response("routed")),
  );
}

function throwingAuthenticator(): Authenticator {
  return { authenticate: () => Promise.reject(new MissingCredentialsError()) };
}

function captureRequest(
  init: { readonly method?: string; readonly origin?: string } = {},
): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (init.origin !== undefined) headers.set("origin", init.origin);
  return new Request(`https://hub.daly.id.au${CAPTURE_PATH}`, {
    method: init.method ?? "POST",
    headers,
    body: init.method === "GET" ? undefined : JSON.stringify({ text: "x" }),
  });
}

describe("isCaptureRequest — the carve-out is exactly one path and one method", () => {
  it("matches POST on the exact capture path", () => {
    expect(isCaptureRequest("/api/capture", "POST")).toBe(true);
    expect(isCaptureRequest("/api/capture", "post")).toBe(true);
  });

  it("matches nothing beside it", () => {
    for (const path of [
      "/api/capture/",
      "/api/capture/tasks",
      "/api/captureX",
      "/api/Capture",
      "/capture",
      "/api",
      "//api/capture",
    ]) {
      expect(isCaptureRequest(path, "POST")).toBe(false);
    }
  });

  it("matches no other method", () => {
    for (const method of ["GET", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
      expect(isCaptureRequest(CAPTURE_PATH, method)).toBe(false);
    }
  });
});

describe("the boundary and the capture endpoint", () => {
  it("routes a capture POST without ever consulting the Access authenticator", async () => {
    const route = handler();
    const factory = vi.fn(() => throwingAuthenticator());

    const response = await handleAuthenticatedRequest(
      captureRequest(),
      PROD_ENV,
      route,
      factory,
    );

    expect(response.status).toBe(200);
    expect(factory).not.toHaveBeenCalled();
    expect(route).toHaveBeenCalledTimes(1);
  });

  it("hands the route NO authenticated session", async () => {
    const route = handler();
    await handleAuthenticatedRequest(captureRequest(), PROD_ENV, route, () =>
      throwingAuthenticator(),
    );
    const context = route.mock.calls[0]?.[1];
    // A loader calling `requireAuthenticatedSession` here would throw 401 — the
    // carve-out grants reachability, never identity.
    expect(context ? getAuthenticatedSession(context) : null).toBeNull();
  });

  it("still applies the baseline security headers", async () => {
    const response = await handleAuthenticatedRequest(
      captureRequest(),
      PROD_ENV,
      handler(),
      () => throwingAuthenticator(),
    );
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("gives a capture response the private, non-cacheable policy", async () => {
    // The response carries a record the owner just created. It is not cacheable
    // by anything, and the boundary forces that rather than trusting the route.
    const response = await handleAuthenticatedRequest(
      captureRequest(),
      PROD_ENV,
      handler(),
      () => throwingAuthenticator(),
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("does not reject a capture for cross-origin provenance", async () => {
    // A Shortcut sends no Origin, and a hostile Origin is meaningless here: the
    // endpoint takes a bearer token and no ambient credential, so there is no
    // confused deputy for the provenance check to defend against.
    const response = await handleAuthenticatedRequest(
      captureRequest({ origin: TEST_HOSTILE_ORIGIN }),
      PROD_ENV,
      handler(),
      () => throwingAuthenticator(),
    );
    expect(response.status).toBe(200);
  });

  it("still authenticates every OTHER method on the capture path", async () => {
    const route = handler();
    const response = await handleAuthenticatedRequest(
      captureRequest({ method: "GET" }),
      PROD_ENV,
      route,
      () => throwingAuthenticator(),
    );
    expect(response.status).toBe(401);
    expect(route).not.toHaveBeenCalled();
  });

  it("still authenticates a path that merely looks like the capture path", async () => {
    const route = handler();
    const response = await handleAuthenticatedRequest(
      new Request("https://hub.daly.id.au/api/capture/tasks", {
        method: "POST",
        body: "{}",
      }),
      PROD_ENV,
      route,
      () => throwingAuthenticator(),
    );
    expect(response.status).toBe(401);
    expect(route).not.toHaveBeenCalled();
  });

  it("leaves every ordinary route authenticated as before", async () => {
    const route = handler();
    const factory = vi.fn(() => ({
      authenticate: () => Promise.resolve(OWNER_SESSION),
    }));
    await handleAuthenticatedRequest(
      new Request("https://hub.daly.id.au/tasks"),
      PROD_ENV,
      route,
      factory,
    );
    expect(factory).toHaveBeenCalled();
    const context = route.mock.calls[0]?.[1];
    expect(context ? getAuthenticatedSession(context) : null).toEqual(
      OWNER_SESSION,
    );
  });
});
