import { describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";

import type { AuthenticatedSession } from "~/kernel/auth";
import { setAuthenticatedSession } from "~/platform/request";
import { loader } from "~/routes/commands";
import { decodeCommandCatalogue } from "~/shared/commands/model";

/**
 * DS-09 — the trusted command-catalogue route (`GET /commands`), driven in the
 * real Workers runtime. It proves auth is required (401), the catalogue is
 * registry-discovered (Today's navigation commands appear), it decodes cleanly,
 * and it ships NO executable handler function (ADR-024 §24.7/§24.8).
 */

function authedContext(): RouterContextProvider {
  const session: AuthenticatedSession = {
    user: { subject: "owner-subject", email: "owner@example.com" },
    issuedAt: new Date(0),
    expiresAt: new Date(Date.parse("2999-01-01")),
  };
  const context = new RouterContextProvider();
  setAuthenticatedSession(context, session);
  return context;
}

async function runLoader(context: RouterContextProvider): Promise<Response> {
  return loader({
    request: new Request("https://app.test/commands"),
    context,
    params: {},
  } as unknown as Parameters<typeof loader>[0]) as Promise<Response>;
}

describe("GET /commands catalogue route", () => {
  it("returns 401 for an unauthenticated request", async () => {
    let thrown: unknown;
    try {
      await runLoader(new RouterContextProvider());
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(401);
  });

  it("returns the registry-discovered catalogue with no handler functions", async () => {
    const response = await runLoader(authedContext());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toMatch(/no-store/);

    const raw = await response.json();
    const catalogue = decodeCommandCatalogue(raw);
    expect(catalogue).not.toBeNull();

    const ids = catalogue?.commands.map((c) => c.id) ?? [];
    expect(ids).toContain("today.open");
    expect(ids).toContain("today.focus_quick_capture");

    // No serialised entry may carry a handler.
    const serialised = JSON.stringify(raw);
    expect(serialised).not.toMatch(/"run"/);
    for (const entry of catalogue?.commands ?? []) {
      expect("run" in entry).toBe(false);
    }
  });
});
