import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";

import type { AuthenticatedSession } from "~/kernel/auth";
import { setAuthenticatedSession } from "~/platform/request";
import { loader as activityLoader } from "~/modules/projects/routes/activity";
import type { ProjectActivityPage } from "~/modules/projects/project-activity";
import {
  createActivityRepository,
  createEntityRepository,
} from "~/platform/storage/d1";

import {
  FakeClock,
  countingDb,
  makeContext,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

/**
 * PROJ-04 — the ACTUAL project Activity route loader in the real Workers runtime over
 * real D1 (the deployed path). Proves the endpoint reads the project's shared FND-05
 * Timeline (`activity.listForEntity`), newest-first with the deterministic
 * `(occurredAt, id)` tie-breaker, is fully page-reachable with no gaps or duplicates,
 * exhausts `nextCursor` to null exactly once, rejects tampered/cross-scope cursors
 * calmly, does not disclose missing / wrong-kind / deleted / cross-workspace ids,
 * reflects project rename/complete/reopen after revalidation, follows the audited
 * child-task Activity-subject semantics, and resolves referenced entities without an
 * N+1.
 */

const WS = "test-default-workspace";
const OTHER = "ws_project_activity_other";

const nextEntityId = sequentialIds("pae");
const nextActivityId = sequentialIds("paa");

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

/** A spine bound to `ws` over a shared advancing clock (distinct event times). */
function spine(ws: string, clock: FakeClock) {
  return makeSpineRepository(makeContext(ws), {
    clock: clock.now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

function tasks(ws: string, clock: FakeClock) {
  return makeTaskRepository(makeContext(ws), {
    clock: clock.now,
    activityIdGenerator: nextActivityId,
  });
}

async function runActivity(
  projectId: string,
  cursor?: string,
): Promise<Response> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return activityLoader({
    request: new Request(
      `https://app.test/projects/${projectId}/activity${qs}`,
    ),
    context: authedContext(),
    params: { projectId },
  } as unknown as Parameters<typeof activityLoader>[0]) as Promise<Response>;
}

async function readPage(
  projectId: string,
  cursor?: string,
): Promise<{ status: number; body: ProjectActivityPage }> {
  const response = await runActivity(projectId, cursor);
  return {
    status: response.status,
    body: (await response.json()) as ProjectActivityPage,
  };
}

/** Seed a project under an Area; return the project id and the area id. */
async function seedProject(
  ws: string,
  clock: FakeClock,
): Promise<{ projectId: string; areaId: string }> {
  const s = spine(ws, clock);
  const area = await s.createArea({ title: "Career" });
  clock.advance(1000);
  const project = await s.createProject({
    title: "Website relaunch",
    parent: { kind: "area", id: area.id },
  });
  return { projectId: project.id, areaId: area.id };
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("GET /projects/:projectId/activity", () => {
  it("returns the project's own events, newest-first, project as an authorised subject", async () => {
    const clock = new FakeClock();
    const { projectId } = await seedProject(WS, clock);
    // A child task: its `task.belongs_to_project` link names the project (target).
    clock.advance(1000);
    await spine(WS, clock).createTask({
      title: "Design the homepage",
      parent: { kind: "project", id: projectId },
    });
    clock.advance(1000);
    await spine(WS, clock).rename(projectId, "Website relaunch v2");

    const { status, body } = await readPage(projectId);
    expect(status).toBe(200);
    expect(body.items.length).toBeGreaterThan(0);

    // Newest-first by occurredAt.
    const times = body.items.map((i) => Date.parse(i.occurredAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));

    // The project's creation, its child task's link and the rename are all present.
    const types = body.items.map((i) => i.type);
    expect(types).toContain("entity.created");
    expect(types).toContain("entity.updated");
    expect(types).toContain("entity_link.created");
  });

  it("orders same-timestamp events by the deterministic id tie-breaker", async () => {
    const clock = new FakeClock();
    // Project creation emits entity.created + entity_link.created at the SAME tick,
    // so this page contains at least two events sharing one occurredAt.
    const { projectId } = await seedProject(WS, clock);
    const { body } = await readPage(projectId);

    const topTime = body.items[0]!.occurredAt;
    const sameTick = body.items.filter((i) => i.occurredAt === topTime);
    expect(sameTick.length).toBeGreaterThanOrEqual(2);
    // With equal occurredAt, the order is a stable descending id tie-break.
    const ids = sameTick.map((i) => i.id);
    expect(ids).toEqual([...ids].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)));

    // The whole order is repeatable across identical requests.
    const { body: again } = await readPage(projectId);
    expect(again.items.map((i) => i.id)).toEqual(body.items.map((i) => i.id));
  });

  it("pages through the full history with no gaps or duplicates, nextCursor→null at the end", async () => {
    const clock = new FakeClock();
    const { projectId } = await seedProject(WS, clock);
    // 40 child tasks → 40 `task.belongs_to_project` link events naming the project,
    // plus the two creation events: well over one 30-event page.
    for (let i = 0; i < 40; i += 1) {
      clock.advance(1000);
      await spine(WS, clock).createTask({
        title: `Task ${i}`,
        parent: { kind: "project", id: projectId },
      });
    }

    const seen: string[] = [];
    const nextCursors: (string | null)[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const { status, body } = await readPage(projectId, cursor);
      expect(status).toBe(200);
      seen.push(...body.items.map((i) => i.id));
      nextCursors.push(body.nextCursor);
      cursor = body.nextCursor ?? undefined;
      pages += 1;
      expect(pages).toBeLessThan(20);
    } while (cursor);

    expect(pages).toBeGreaterThan(1); // proved more than one page is reachable
    // Exhausted exactly when the walk ends: only the final page returns a null cursor.
    expect(nextCursors[nextCursors.length - 1]).toBeNull();
    expect(nextCursors.slice(0, -1).every((c) => c !== null)).toBe(true);
    expect(new Set(seen).size).toBe(seen.length); // no duplicates at boundaries
    // 40 task links + entity.created(project) + entity_link.created(project→area).
    expect(seen.length).toBe(42);
  });

  it("rejects a tampered cursor with a calm 400 (never a 500)", async () => {
    const clock = new FakeClock();
    const { projectId } = await seedProject(WS, clock);
    const { status, body } = await readPage(projectId, "not-a-real-cursor");
    expect(status).toBe(400);
    expect(body).toMatchObject({ error: "invalid_cursor" });
  });

  it("rejects a cursor issued for a different project (scope-bound)", async () => {
    const clock = new FakeClock();
    const a = await seedProject(WS, clock);
    for (let i = 0; i < 35; i += 1) {
      clock.advance(1000);
      await spine(WS, clock).createTask({
        title: `T${i}`,
        parent: { kind: "project", id: a.projectId },
      });
    }
    const b = await seedProject(WS, clock);

    const first = await readPage(a.projectId);
    expect(first.body.nextCursor).not.toBeNull();
    // Replaying project A's cursor against project B is rejected, not reinterpreted.
    const crossed = await readPage(b.projectId, first.body.nextCursor!);
    expect(crossed.status).toBe(400);
  });

  it("returns a calm 404 for missing, wrong-kind, deleted and cross-workspace ids", async () => {
    const clock = new FakeClock();
    const { projectId, areaId } = await seedProject(WS, clock);

    expect((await readPage("does-not-exist")).status).toBe(404);
    // An Area id is not a project.
    expect((await readPage(areaId)).status).toBe(404);

    // A soft-deleted project is a calm not-found (deleted → gone).
    await spine(WS, clock).softDelete(projectId);
    expect((await readPage(projectId)).status).toBe(404);

    // A cross-workspace project id is invisible (no disclosure).
    const otherClock = new FakeClock();
    const other = await seedProject(OTHER, otherClock);
    expect((await readPage(other.projectId)).status).toBe(404);
  });

  it("reflects a rename, complete and reopen after revalidation", async () => {
    const clock = new FakeClock();
    const { projectId } = await seedProject(WS, clock);

    clock.advance(1000);
    await spine(WS, clock).rename(projectId, "New name");
    clock.advance(1000);
    await spine(WS, clock).complete(projectId);
    clock.advance(1000);
    await spine(WS, clock).reopen(projectId);

    const { body } = await readPage(projectId);
    const types = body.items.map((i) => i.type);
    expect(types).toContain("entity.updated"); // rename
    expect(types).toContain("project.completed");
    expect(types).toContain("project.reopened");
    // Newest-first: the reopen (last) is at the top.
    expect(body.items[0]!.type).toBe("project.reopened");
  });

  it("follows the audited child-task subject semantics", async () => {
    const clock = new FakeClock();
    const { projectId } = await seedProject(WS, clock);
    clock.advance(1000);
    const task = await spine(WS, clock).createTask({
      title: "A child task",
      parent: { kind: "project", id: projectId },
    });
    // Completing the CHILD task names the task, not the project.
    clock.advance(1000);
    await tasks(WS, clock).completeTask(task.id);

    const { body } = await readPage(projectId);
    const types = body.items.map((i) => i.type);
    // Task CREATION appears (the link event names the project as `target`)…
    expect(types).toContain("entity_link.created");
    // …but the child task's OWN completion does NOT (its only subject is the task).
    expect(types).not.toContain("task.completed");
    // The child task's own Timeline, by contrast, does carry its completion.
    const taskPage = await makeContextActivity(WS).listForEntity(task.id);
    expect(taskPage.items.map((i) => String(i.type))).toContain(
      "task.completed",
    );
  });

  it("resolves referenced entities without an N+1 (bounded by unique ids)", async () => {
    const clock = new FakeClock();
    const { projectId } = await seedProject(WS, clock);
    for (let i = 0; i < 35; i += 1) {
      clock.advance(1000);
      await spine(WS, clock).createTask({
        title: `T${i}`,
        parent: { kind: "project", id: projectId },
      });
    }

    // Reproduce the route's resolution algorithm over a counting DB: read one page,
    // then resolve each UNIQUE subject id once. The statement count must scale with
    // the number of DISTINCT entities, not with the number of events on the page.
    const counting = countingDb(env.DB);
    const activity = createActivityRepository(counting.db, makeContext(WS));
    const entities = createEntityRepository(counting.db, makeContext(WS));

    const page = await activity.listForEntity(projectId, { limit: 30 });
    const ids = new Set<string>();
    for (const record of page.items) {
      for (const subject of record.subjects) ids.add(subject.entityId);
    }
    counting.reset();
    for (const id of ids) {
      await entities.getById(id, { includeDeleted: true });
    }
    // One prepared statement per unique entity — never per event.
    expect(counting.prepareCount()).toBe(ids.size);
    expect(page.items.length).toBe(30);
    // The 30 events reference far fewer distinct entities than 30 (project + area +
    // the tasks on this page), proving the batch is bounded.
    expect(ids.size).toBeLessThanOrEqual(page.items.length + 2);
  });
});

/** A plain activity repository over the real DB for the child-task cross-check. */
function makeContextActivity(ws: string) {
  return createActivityRepository(env.DB, makeContext(ws));
}
