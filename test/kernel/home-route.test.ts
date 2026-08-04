import { RouterContextProvider } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";

import type { AuthenticatedSession } from "~/kernel/auth";
import { setAuthenticatedSession } from "~/platform/request";
import { loader } from "~/routes/home";

import {
  makeAppPreferencesRepository,
  makeContext,
  resetTables,
} from "./support";

const WS = "test-default-workspace";
const OWNER = "owner";

function authedContext(): RouterContextProvider {
  const session: AuthenticatedSession = {
    user: { subject: OWNER, email: "owner@example.com", displayName: null },
    issuedAt: new Date(0),
    expiresAt: new Date(Date.parse("2999-01-01")),
  };
  const context = new RouterContextProvider();
  setAuthenticatedSession(context, session);
  return context;
}

async function runHome(): Promise<Response> {
  return loader({
    request: new Request("https://app.test/"),
    params: {},
    context: authedContext(),
  } as unknown as Parameters<typeof loader>[0]) as Promise<Response>;
}

describe("SETTINGS-01A index redirect", () => {
  beforeEach(async () => {
    await resetTables([WS]);
  });

  it("redirects / to the persisted landing page", async () => {
    await makeAppPreferencesRepository(makeContext(WS)).update(OWNER, {
      defaultLandingDestination: "tasks",
    });
    const response = await runHome();
    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    expect(response.headers.get("Location")).toBe("/tasks");
  });

  it("falls back to Today when no row exists", async () => {
    const response = await runHome();
    expect(response.headers.get("Location")).toBe("/today");
  });
});
