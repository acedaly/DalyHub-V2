import { beforeEach, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";

import type { AuthenticatedSession } from "~/kernel/auth";
import { parseWorkspaceId } from "~/kernel/workspaces";
import { setAuthenticatedSession } from "~/platform/request";
import { loader } from "~/routes/search";
import type { SearchOutcome } from "~/shared/search/model";

import {
  makeContext,
  makeAssetRepository,
  makeDiaryRepository,
  makeMeetingRepository,
  makeNoteDetailsRepository,
  makePersonRepository,
  makeRepository,
  makeReviewRepository,
  makeSpineRepository,
  makeTaskRepository,
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
    user: { subject, email: "owner@example.com", displayName: null },
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

async function seedEverySearchableRecord(): Promise<void> {
  await makeWorkspaceRepository().create({
    id: parseWorkspaceId(CONFIGURED_WORKSPACE),
  });
  const context = makeContext(CONFIGURED_WORKSPACE);
  const spine = makeSpineRepository(context);
  const area = await spine.createArea({ title: "GlobalSearch Area" });
  const goal = await spine.createGoal({
    title: "GlobalSearch Goal",
    areaId: area.id,
  });
  const project = await spine.createProject({
    title: "GlobalSearch Project",
    parent: { kind: "goal", id: goal.id },
  });
  const task = await spine.createTask({
    title: "GlobalSearch Task",
    parent: { kind: "project", id: project.id },
  });
  await makeTaskRepository(context).updateTask(task.id, {
    priority: "p1",
    dueDate: "2026-07-29",
  });

  const entityRepo = makeRepository(context);
  const note = await entityRepo.create({
    type: "note",
    title: "Repository Note",
  });
  await makeNoteDetailsRepository(context).update(
    note.id,
    "# GlobalSearch Note Heading\n\nBody that should be safe syntax-free.",
  );

  await makeDiaryRepository(context).create({
    entryType: "reflection",
    title: "GlobalSearch Diary",
    body: "Private diary prose that must not appear in Search.",
  });
  await makePersonRepository(context).create({
    title: "GlobalSearch Person",
    email: "private-person@example.test",
    mobile: "+61 400 000 000",
  });
  await makeMeetingRepository(context).create({
    title: "GlobalSearch Meeting",
    startsAt: "2026-07-29T09:00:00.000Z",
    timezone: "UTC",
  });
  await makeAssetRepository(context).create({
    title: "GlobalSearch Asset",
    assetType: "tool",
    serialNumber: "SECRET-SERIAL-123",
    referenceNumber: "SECRET-POLICY-456",
  });
  await makeReviewRepository(context).create({
    type: "custom",
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    title: "GlobalSearch Review",
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

  it("returns real repository-backed results from every shipped record provider", async () => {
    await seedEverySearchableRecord();
    const response = await runLoader(request("GlobalSearch"), authedContext());
    expect(response.status).toBe(200);
    const outcome = (await response.json()) as SearchOutcome;
    expect(outcome.status).toBe("ok");
    expect(outcome.providers.map((provider) => provider.providerId)).toEqual([
      "areas.search",
      "goals.search",
      "projects.search",
      "tasks.search",
      "notes.search",
      "diary.search",
      "meetings.search",
      "people.search",
      "assets.search",
      "reviews.search",
    ]);

    const results = outcome.groups.flatMap((group) => group.results);
    expect(new Set(results.map((result) => result.entityType))).toEqual(
      new Set([
        "area",
        "goal",
        "project",
        "task",
        "note",
        "diary",
        "meeting",
        "person",
        "asset",
        "review",
      ]),
    );
    const task = results.find((result) => result.entityType === "task");
    expect(task?.target).toMatchObject({
      kind: "drawer",
      canonicalPath: "/tasks",
    });
    expect(task?.signals?.map((signal) => signal.kind)).toEqual([
      "priority",
      "urgency",
    ]);

    const payload = JSON.stringify(outcome);
    expect(payload).not.toContain("Private diary prose");
    expect(payload).not.toContain("private-person@example.test");
    expect(payload).not.toContain("+61 400 000 000");
    expect(payload).not.toContain("SECRET-SERIAL-123");
    expect(payload).not.toContain("SECRET-POLICY-456");
    expect(payload).not.toContain("today.search");
  });

  it("excludes archived People from global Search", async () => {
    await makeWorkspaceRepository().create({
      id: parseWorkspaceId(CONFIGURED_WORKSPACE),
    });
    const personRepo = makePersonRepository(makeContext(CONFIGURED_WORKSPACE));
    const person = await personRepo.create({
      title: "ArchivedSearch Person",
      email: "archived-person@example.test",
    });
    await personRepo.archive(person.id);

    const response = await runLoader(
      request("ArchivedSearch Person"),
      authedContext(),
    );
    expect(response.status).toBe(200);
    const outcome = (await response.json()) as SearchOutcome;
    expect(outcome.status).toBe("ok");
    const results = outcome.groups.flatMap((group) => group.results);
    expect(results.some((result) => result.id === `person:${person.id}`)).toBe(
      false,
    );
    expect(JSON.stringify(outcome)).not.toContain(
      "archived-person@example.test",
    );
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
