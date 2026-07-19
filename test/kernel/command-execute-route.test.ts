import { beforeEach, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";

import type { AuthenticatedSession } from "~/kernel/auth";
import { parseWorkspaceId } from "~/kernel/workspaces";
import { setAuthenticatedSession } from "~/platform/request";
import { action } from "~/routes/command-execute";
import type { CommandExecutionOutcome } from "~/shared/commands/model";

import { makeWorkspaceRepository, resetTables } from "./support";

/**
 * DS-09 — the authenticated command-execution route (`POST /commands/:commandId`),
 * driven in the REAL Workers runtime against the real module registry and the
 * configured workspace boundary (ADR-024 §24.9). It proves: auth is authoritative
 * (401), only POST mutates (405), the trusted workspace is resolved (never
 * client-supplied), a navigation-only command cannot be run here, unknown commands
 * are rejected, workspace-resolution failure runs no command, and no internal
 * detail leaks.
 */

const CONFIGURED_WORKSPACE = "test-default-workspace";

function sessionFor(subject = "owner-subject"): AuthenticatedSession {
  return {
    user: { subject, email: "owner@example.com" },
    issuedAt: new Date(0),
    expiresAt: new Date(Date.parse("2999-01-01")),
  };
}

function authedContext(): RouterContextProvider {
  const context = new RouterContextProvider();
  setAuthenticatedSession(context, sessionFor());
  return context;
}

function request(commandId: string, method = "POST"): Request {
  return new Request(`https://app.test/commands/${commandId}`, { method });
}

async function runAction(
  req: Request,
  context: RouterContextProvider,
  commandId: string,
): Promise<Response> {
  return action({
    request: req,
    context,
    params: { commandId },
  } as unknown as Parameters<typeof action>[0]) as Promise<Response>;
}

async function seedConfiguredWorkspace(): Promise<void> {
  await makeWorkspaceRepository().create({
    id: parseWorkspaceId(CONFIGURED_WORKSPACE),
  });
}

describe("POST /commands/:commandId route action", () => {
  beforeEach(async () => {
    await resetTables();
  });

  it("returns 401 (not an outcome) for an unauthenticated request", async () => {
    await seedConfiguredWorkspace();
    let thrown: unknown;
    try {
      await runAction(
        request("today.open"),
        new RouterContextProvider(),
        "today.open",
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(401);
  });

  it("rejects a non-POST method with 405 (no GET mutation)", async () => {
    await seedConfiguredWorkspace();
    let thrown: unknown;
    try {
      await runAction(
        request("today.open", "GET"),
        authedContext(),
        "today.open",
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(405);
  });

  it("refuses to execute a navigation-only command through the mutation endpoint", async () => {
    await seedConfiguredWorkspace();
    const response = await runAction(
      request("today.open"),
      authedContext(),
      "today.open",
    );
    expect(response.status).toBe(400);
    const outcome = (await response.json()) as CommandExecutionOutcome;
    expect(outcome.ok).toBe(false);
  });

  it("rejects an unknown command with 404", async () => {
    await seedConfiguredWorkspace();
    const response = await runAction(
      request("today.nonexistent"),
      authedContext(),
      "today.nonexistent",
    );
    expect(response.status).toBe(404);
    const outcome = (await response.json()) as CommandExecutionOutcome;
    expect(outcome.ok).toBe(false);
  });

  it("runs no command and fails calmly when the workspace does not exist", async () => {
    // No workspace seeded → resolution fails closed.
    const response = await runAction(
      request("today.open"),
      authedContext(),
      "today.open",
    );
    expect(response.status).toBe(200);
    const outcome = (await response.json()) as CommandExecutionOutcome;
    expect(outcome.ok).toBe(false);
  });

  it("does not leak internal detail on failure", async () => {
    const response = await runAction(
      request("today.open"),
      authedContext(),
      "today.open",
    );
    const body = await response.text();
    expect(body).not.toMatch(/workspace|D1|SQL|SELECT|stack|Error:/i);
  });

  it("sets a no-store cache policy", async () => {
    await seedConfiguredWorkspace();
    const response = await runAction(
      request("today.open"),
      authedContext(),
      "today.open",
    );
    expect(response.headers.get("cache-control")).toMatch(/no-store/);
  });
});
