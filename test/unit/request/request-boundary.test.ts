import { RouterContextProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";

import {
  MissingCredentialsError,
  type AuthenticatedSession,
  type Authenticator,
} from "~/kernel/auth";
import { getAuthenticatedSession } from "~/platform/request/authenticated-request-context";
import { handleAuthenticatedRequest } from "~/platform/request/request-boundary";

import {
  TEST_HOSTILE_ORIGIN,
  TEST_SIBLING_ORIGIN,
  browserRequest,
  sameOriginMutation,
} from "../../support/requests";

const OWNER_SESSION: AuthenticatedSession = {
  user: { subject: "owner-sub", email: "owner@example.com", displayName: null },
  issuedAt: new Date(0),
  expiresAt: new Date(Date.parse("2999-01-01")),
};

function fixedAuthenticator(session: AuthenticatedSession): Authenticator {
  return { authenticate: () => Promise.resolve(session) };
}

function throwingAuthenticator(error: unknown): Authenticator {
  return { authenticate: () => Promise.reject(error) };
}

function spyHandler() {
  return vi.fn(
    (_request: Request, _context?: RouterContextProvider): Promise<Response> =>
      Promise.resolve(new Response("ok")),
  );
}

/** The session the handler received via its context argument, or null. */
function sessionReceivedBy(
  handler: ReturnType<typeof spyHandler>,
): AuthenticatedSession | null {
  const context = handler.mock.calls[0]?.[1];
  return context ? getAuthenticatedSession(context) : null;
}

const PROD_ENV = {
  AUTH_MODE: "cloudflare-access" as const,
  ENVIRONMENT: "production",
  ACCESS_TEAM_DOMAIN: "",
  ACCESS_AUD: "",
  OWNER_EMAIL: "",
};

describe("authenticated request boundary", () => {
  it("serves /health without authentication and never authenticates it", async () => {
    const handler = vi.fn((_request: Request): Promise<Response> =>
      Promise.resolve(new Response("health")),
    );
    const factory = vi.fn(() => fixedAuthenticator(OWNER_SESSION));

    const response = await handleAuthenticatedRequest(
      new Request("https://app.example/health"),
      PROD_ENV,
      handler,
      factory,
    );

    expect(await response.text()).toBe("health");
    expect(factory).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("rejects an unauthenticated protected request BEFORE the handler runs", async () => {
    const handler = spyHandler();

    const response = await handleAuthenticatedRequest(
      new Request("https://app.example/areas"),
      PROD_ENV,
      handler,
      () => throwingAuthenticator(new MissingCredentialsError()),
    );

    expect(response.status).toBe(401);
    // The protected loader/action never executed.
    expect(handler).not.toHaveBeenCalled();
  });

  it("passes the validated session to the handler via trusted context", async () => {
    const handler = spyHandler();

    const response = await handleAuthenticatedRequest(
      new Request("https://app.example/"),
      PROD_ENV,
      handler,
      () => fixedAuthenticator(OWNER_SESSION),
    );

    expect(handler).toHaveBeenCalledTimes(1);
    expect(sessionReceivedBy(handler)).toEqual(OWNER_SESSION);
    // Authenticated responses are private and not publicly cacheable.
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("ignores client identity headers — the session comes only from the authenticator", async () => {
    const handler = spyHandler();
    const spoofed = new Request("https://app.example/", {
      headers: {
        "Cf-Access-Jwt-Assertion": "attacker.controlled.token",
        "X-DalyHub-Email": "intruder@example.com",
        "X-Forwarded-Email": "intruder@example.com",
      },
    });

    await handleAuthenticatedRequest(
      spoofed,
      PROD_ENV,
      handler,
      // Authenticator ignores the request entirely and returns the fixed owner.
      () => fixedAuthenticator(OWNER_SESSION),
    );

    expect(sessionReceivedBy(handler)?.user.email).toBe("owner@example.com");
  });

  it("only activates development auth under an explicit development environment", async () => {
    const devVars = {
      AUTH_MODE: "development",
      DEV_AUTH_SUBJECT: "local-user",
      DEV_AUTH_EMAIL: "dev@example.invalid",
    };

    // Development mode requested under a production environment: fail closed,
    // handler never runs. Uses the REAL authenticator factory.
    const blockedHandler = spyHandler();
    const blocked = await handleAuthenticatedRequest(
      new Request("https://app.example/"),
      { ...devVars, ENVIRONMENT: "production" },
      blockedHandler,
    );
    expect(blocked.status).toBe(503);
    expect(blockedHandler).not.toHaveBeenCalled();

    // Under an explicit development environment, the fixed identity is accepted.
    const devHandler = spyHandler();
    await handleAuthenticatedRequest(
      new Request("https://app.example/"),
      { ...devVars, ENVIRONMENT: "development" },
      devHandler,
    );
    expect(devHandler).toHaveBeenCalledTimes(1);
    expect(sessionReceivedBy(devHandler)?.user.email).toBe(
      "dev@example.invalid",
    );
  });
});

/**
 * AUDIT-FIX-04 — mutation provenance at the boundary.
 *
 * The unit above proves the POLICY. These prove the BOUNDARY: that a rejected
 * mutation is stopped where it must be — after authentication, before identity
 * provisioning, and before React Router ever sees it.
 */
describe("authenticated request boundary — mutation provenance", () => {
  const APP = "https://hub.daly.id.au";
  const MUTATION = `${APP}/tasks/t-1/mutate`;

  /** The boundary with a succeeding authenticator and spied collaborators. */
  function boundary(request: Request) {
    const handler = spyHandler();
    const provisioner = vi.fn(() => Promise.resolve());
    return {
      handler,
      provisioner,
      run: () =>
        handleAuthenticatedRequest(
          request,
          PROD_ENV,
          handler,
          () => fixedAuthenticator(OWNER_SESSION),
          provisioner,
        ),
    };
  }

  /** Every assertion a rejected mutation must satisfy, in one place. */
  async function expectRejected(request: Request) {
    const { handler, provisioner, run } = boundary(request);
    const response = await run();

    expect(response.status).toBe(403);
    // Nothing ran. No loader, no action, no repository, no Activity, no write.
    expect(handler).not.toHaveBeenCalled();
    // Not even the best-effort identity write: a rejected attack request must
    // leave no trace of the attacker's attempt in the workspace.
    expect(provisioner).not.toHaveBeenCalled();

    // The baseline security headers still apply to the rejection.
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'none'",
    );
    // Private and never cacheable — not by the browser, not by an intermediary.
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");

    // No CORS surface is opened, and no Origin is reflected anywhere.
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    const body = await response.text();
    const exposed = [...response.headers.values()].join(" ") + " " + body;
    for (const secret of [
      TEST_HOSTILE_ORIGIN,
      TEST_SIBLING_ORIGIN,
      "evil.example",
      "other.daly.id.au",
    ]) {
      expect(exposed).not.toContain(secret);
    }
    // Generic: no reason code, no route, no framework or storage detail.
    expect(body).toBe("Request rejected.");
    return response;
  }

  it("Test 1 — rejects an AUTHENTICATED cross-origin mutation with a generic 403", async () => {
    await expectRejected(
      browserRequest(MUTATION, {
        method: "POST",
        origin: TEST_HOSTILE_ORIGIN,
        fetchSite: "cross-site",
      }),
    );
  });

  it("Test 2 — runs a genuine same-origin mutation exactly once, unchanged", async () => {
    const { handler, provisioner, run } = boundary(
      sameOriginMutation(MUTATION),
    );
    const response = await run();

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    // The trusted session still reaches the action via typed context.
    expect(sessionReceivedBy(handler)).toEqual(OWNER_SESSION);
    // Provisioning keeps its existing once-per-request contract.
    expect(provisioner).toHaveBeenCalledTimes(1);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.text()).toBe("ok");
  });

  it("Test 3 — leaves an UNAUTHENTICATED mutation's existing answer alone", async () => {
    // The CSRF guard must not convert an authentication outcome into something
    // else, and must not run before authentication has had its say.
    const missing = spyHandler();
    const unauthenticated = await handleAuthenticatedRequest(
      browserRequest(MUTATION, {
        method: "POST",
        origin: TEST_HOSTILE_ORIGIN,
        fetchSite: "cross-site",
      }),
      PROD_ENV,
      missing,
      () => throwingAuthenticator(new MissingCredentialsError()),
    );
    expect(unauthenticated.status).toBe(401);
    expect(missing).not.toHaveBeenCalled();

    // A misconfiguration still answers 503, not 403.
    const misconfigured = spyHandler();
    const unavailable = await handleAuthenticatedRequest(
      sameOriginMutation(MUTATION),
      { AUTH_MODE: "development", ENVIRONMENT: "production" },
      misconfigured,
    );
    expect(unavailable.status).toBe(503);
    expect(misconfigured).not.toHaveBeenCalled();
  });

  it("Test 4 — leaves protected READS untouched: no provenance required", async () => {
    for (const method of ["GET", "HEAD"]) {
      const { handler, provisioner, run } = boundary(
        browserRequest(`${APP}/today`, { method }),
      );
      const response = await run();
      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(provisioner).toHaveBeenCalledTimes(1);
    }
  });

  it("Test 5 — rejects a SIBLING same-site mutation, the gap SameSite cookies leave open", async () => {
    // A compromised other.daly.id.au is same-site with hub.daly.id.au: the
    // Access cookie is still attached and Sec-Fetch-Site still reads same-site.
    // Only an exact-origin check refuses this.
    await expectRejected(
      browserRequest(MUTATION, {
        method: "POST",
        origin: TEST_SIBLING_ORIGIN,
        fetchSite: "same-site",
      }),
    );
  });

  it("Test 6 — fails closed on missing provenance", async () => {
    // Neither signal: a request no browser makes, refused rather than trusted.
    await expectRejected(browserRequest(MUTATION, { method: "POST" }));
    // Sec-Fetch-Site alone is not a substitute for Origin.
    await expectRejected(
      browserRequest(MUTATION, { method: "POST", fetchSite: "same-origin" }),
    );
  });

  it("Test 7 — rejects inconsistent provenance signals", async () => {
    // An exact Origin contradicted by the fetch-site value…
    await expectRejected(
      browserRequest(MUTATION, {
        method: "POST",
        origin: APP,
        fetchSite: "cross-site",
      }),
    );
    // …and a hostile Origin wearing a reassuring fetch-site label.
    await expectRejected(
      browserRequest(MUTATION, {
        method: "POST",
        origin: TEST_HOSTILE_ORIGIN,
        fetchSite: "same-origin",
      }),
    );
  });

  it("Test 8 — the public /health bypass covers safe methods only", async () => {
    // The legitimate health check is untouched, and is never authenticated.
    const factory = vi.fn(() => fixedAuthenticator(OWNER_SESSION));
    const healthy = vi.fn((_request: Request): Promise<Response> =>
      Promise.resolve(new Response("health")),
    );
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      const response = await handleAuthenticatedRequest(
        browserRequest(`${APP}/health`, { method }),
        PROD_ENV,
        healthy,
        factory,
      );
      expect(response.status).toBe(200);
    }
    expect(healthy).toHaveBeenCalledTimes(3);
    expect(factory).not.toHaveBeenCalled();

    // An UNSAFE method cannot ride the public path past the guards: it takes the
    // protected route, where a cross-origin attempt is rejected outright…
    await expectRejected(
      browserRequest(`${APP}/health`, {
        method: "POST",
        origin: TEST_HOSTILE_ORIGIN,
        fetchSite: "cross-site",
      }),
    );

    // …and even an unauthenticated one is challenged rather than served.
    const unauthenticated = spyHandler();
    const response = await handleAuthenticatedRequest(
      browserRequest(`${APP}/health`, { method: "POST" }),
      PROD_ENV,
      unauthenticated,
      () => throwingAuthenticator(new MissingCredentialsError()),
    );
    expect(response.status).toBe(401);
    expect(unauthenticated).not.toHaveBeenCalled();
  });

  it("rejects every unsafe method the same way, including ones DalyHub does not use", async () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "PROPFIND"]) {
      await expectRejected(
        browserRequest(MUTATION, { method, origin: TEST_HOSTILE_ORIGIN }),
      );
    }
  });

  it("accepts a same-origin mutation from a browser that sends no Sec-Fetch-Site", async () => {
    const { handler, run } = boundary(
      browserRequest(MUTATION, { method: "POST", origin: APP }),
    );
    expect((await run()).status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
