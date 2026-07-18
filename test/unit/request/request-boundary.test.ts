import { RouterContextProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";

import {
  MissingCredentialsError,
  type AuthenticatedSession,
  type Authenticator,
} from "~/kernel/auth";
import { getAuthenticatedSession } from "~/platform/request/authenticated-request-context";
import { handleAuthenticatedRequest } from "~/platform/request/request-boundary";

const OWNER_SESSION: AuthenticatedSession = {
  user: { subject: "owner-sub", email: "owner@example.com" },
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
