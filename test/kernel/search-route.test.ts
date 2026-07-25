import { beforeEach, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";

import type { AuthenticatedSession } from "~/kernel/auth";
import { parseWorkspaceId } from "~/kernel/workspaces";
import { setAuthenticatedSession } from "~/platform/request";
import { loader } from "~/routes/search";
import type { SearchOutcome } from "~/shared/search/model";

import {
  makeContext,
  makeSpineRepository,
  makeWorkspaceRepository,
  resetTables,
} from "./support";

/**
 * DS-08 — the ACTUAL `/search` route loader in the real Workers runtime, over real
 * D1. This covers the DEPLOYED path (not a parallel composition), proving the route
 * resolves the trusted workspace through `resolveAuthenticatedWorkspaceScope`,
 * fails closed when it cannot, ignores forged input, and keeps a missing session a
 * 401.
 */

// Matches vitest.workers.config.ts DEFAULT_WORKSPACE_ID.
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

function request(query: string): Request {
  return new Request(`https://app.test/search?q=${encodeURIComponent(query)}`);
}

async function runLoader(
  req: Request,
  context: RouterContextProvider,
): Promise<Response> {
  return loader({
    request: req,
    context,
    params: {},
  } as unknown as Parameters<typeof loader>[0]) as Promise<Response>;
}

async function seedConfiguredWorkspace(): Promise<void> {
  await makeWorkspaceRepository().create({
    id: parseWorkspaceId(CONFIGURED_WORKSPACE),
  });
  // TASKS-01: seed a REAL task so the repository-backed Tasks search provider (which
  // replaced Today's fixture task search) can resolve it through the trusted scope.
  const spine = makeSpineRepository(makeContext(CONFIGURED_WORKSPACE));
  const area = await spine.createArea({ title: "Product" });
  const project = await spine.createProject({
    title: "Ship",
    parent: { kind: "area", id: area.id },
  });
  await spine.createTask({
    title: "Finish PX-02",
    parent: { kind: "project", id: project.id },
  });
}

describe("GET /search route loader", () => {
  beforeEach(async () => {
    await resetTables();
  });

  it("resolves the configured workspace and returns bounded grouped results", async () => {
    await seedConfiguredWorkspace();
    const response = await runLoader(request("PX-02"), authedContext());
    expect(response.status).toBe(200);
    const outcome = (await response.json()) as SearchOutcome;
    expect(outcome.status).toBe("ok");
    // The registry-discovered, repository-backed Tasks provider ran under the
    // verified workspace and resolved the REAL seeded task.
    const results = outcome.groups.flatMap((g) => g.results);
    const finish = results.find((r) => r.title.includes("PX-02"));
    expect(finish).toBeDefined();
    expect(finish?.entityType).toBe("task");
    expect(finish?.target.kind).toBe("drawer");
    if (finish?.target.kind === "drawer") {
      expect(finish.target.drawerKey).toMatch(/^task:/);
      expect(finish.target.canonicalPath).toBe("/tasks");
    }
  });

  it("ignores a forged workspace query parameter", async () => {
    await seedConfiguredWorkspace();
    const response = await runLoader(
      new Request("https://app.test/search?q=PX-02&workspace=evil"),
      authedContext(),
    );
    const outcome = (await response.json()) as SearchOutcome;
    // Still resolves the trusted workspace; the forged param has no effect.
    expect(outcome.status).toBe("ok");
    expect(outcome.groups.flatMap((g) => g.results).length).toBeGreaterThan(0);
  });

  it("fails closed (calm error, no results) when the configured workspace does not exist", async () => {
    // No workspace seeded → resolution rejects → safe retryable failure, and no
    // provider results are assembled.
    const response = await runLoader(request("PX-02"), authedContext());
    expect(response.status).toBe(200);
    const outcome = (await response.json()) as SearchOutcome;
    expect(outcome.status).toBe("error");
    expect(outcome.totalCount).toBe(0);
    expect(outcome.groups).toEqual([]);
  });

  it("returns 401 (not a Search result) for an unauthenticated request", async () => {
    await seedConfiguredWorkspace();
    let thrown: unknown;
    try {
      await runLoader(request("PX-02"), new RouterContextProvider());
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(401);
  });

  it("does not leak internal detail on failure", async () => {
    const response = await runLoader(request("PX-02"), authedContext());
    const body = await response.text();
    expect(body).not.toMatch(/workspace|D1|SQL|SELECT|stack/i);
  });
});
