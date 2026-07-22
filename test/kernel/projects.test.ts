import { beforeEach, describe, expect, it } from "vitest";

import { InvalidSpineCursorError } from "~/kernel/spine";

import {
  FakeClock,
  makeContext,
  makeProjectRepository,
  makeProjectSettingsRepository,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

/**
 * PROJ-01 — the project read projection (`ProjectRepository`) and the task
 * contract's `listProjectTasks`, over real D1 in the Workers runtime. Proves the
 * bounded, N+1-free reads resolve Area/Goal context, task counts and child tasks
 * correctly; honour the completion filters; stay workspace-isolated; and never
 * disclose cross-workspace or wrong-kind ids.
 */

const WS = "test-default-workspace";
const OTHER = "ws_projects_other";

function ids(prefix: string) {
  return sequentialIds(prefix);
}

function spine(ws: string, prefix = "e") {
  return makeSpineRepository(makeContext(ws), {
    clock: new FakeClock().now,
    idGenerator: ids(prefix),
    activityIdGenerator: ids(`${prefix}a`),
  });
}

function tasks(ws: string) {
  return makeTaskRepository(makeContext(ws), {
    clock: new FakeClock().now,
    activityIdGenerator: ids("ta"),
  });
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("ProjectRepository.listProjects", () => {
  it("lists a project directly under an Area with its Area context", async () => {
    const s = spine(WS);
    const area = await s.createArea({ title: "Career" });
    const project = await s.createProject({
      title: "DalyHub V2",
      parent: { kind: "area", id: area.id },
    });

    const page = await makeProjectRepository(makeContext(WS)).listProjects();
    expect(page.items).toHaveLength(1);
    const item = page.items[0]!;
    expect(item.id).toBe(project.id);
    expect(item.title).toBe("DalyHub V2");
    expect(item.area).toEqual({ kind: "area", id: area.id, title: "Career" });
    expect(item.goal).toBeNull();
    expect(item.completedAt).toBeNull();
    expect(item.taskTotal).toBe(0);
    expect(item.taskCompleted).toBe(0);
  });

  it("resolves a goal-advancing project's Area through its Goal", async () => {
    const s = spine(WS);
    const area = await s.createArea({ title: "Health" });
    const goal = await s.createGoal({ title: "Run a half", areaId: area.id });
    const project = await s.createProject({
      title: "12-week plan",
      parent: { kind: "goal", id: goal.id },
    });

    const page = await makeProjectRepository(makeContext(WS)).listProjects();
    const item = page.items.find((p) => p.id === project.id)!;
    expect(item.goal).toEqual({
      kind: "goal",
      id: goal.id,
      title: "Run a half",
    });
    // The Area is resolved through the Goal — not copied, not missing.
    expect(item.area).toEqual({ kind: "area", id: area.id, title: "Health" });
  });

  it("counts active direct child tasks (total + completed), matching the rollup", async () => {
    const s = spine(WS);
    const area = await s.createArea({ title: "Career" });
    const project = await s.createProject({
      title: "DalyHub V2",
      parent: { kind: "area", id: area.id },
    });
    const a = await s.createTask({
      title: "A",
      parent: { kind: "project", id: project.id },
    });
    await s.createTask({
      title: "B",
      parent: { kind: "project", id: project.id },
    });
    await s.complete(a.id);

    const repo = makeProjectRepository(makeContext(WS));
    const item = (await repo.listProjects()).items[0]!;
    expect(item.taskTotal).toBe(2);
    expect(item.taskCompleted).toBe(1);

    // The projection count matches the authoritative spine rollup definition.
    const rollup = await s.getRollup(project.id);
    expect(rollup.kind).toBe("project");
    if (rollup.kind === "project") {
      expect(item.taskTotal).toBe(rollup.tasks.total);
      expect(item.taskCompleted).toBe(rollup.tasks.completed);
    }
  });

  it("filters by state (open / completed / all)", async () => {
    const s = spine(WS);
    const area = await s.createArea({ title: "Career" });
    const open = await s.createProject({
      title: "Open project",
      parent: { kind: "area", id: area.id },
    });
    const done = await s.createProject({
      title: "Done project",
      parent: { kind: "area", id: area.id },
    });
    await s.complete(done.id);

    const repo = makeProjectRepository(makeContext(WS));
    const all = await repo.listProjects({ state: "all" });
    expect(all.items.map((p) => p.id).sort()).toEqual(
      [open.id, done.id].sort(),
    );
    const openOnly = await repo.listProjects({ state: "open" });
    expect(openOnly.items.map((p) => p.id)).toEqual([open.id]);
    const completedOnly = await repo.listProjects({ state: "completed" });
    expect(completedOnly.items.map((p) => p.id)).toEqual([done.id]);
  });

  it("'archived' returns archived projects only, regardless of completion", async () => {
    const s = spine(WS);
    const settings = makeProjectSettingsRepository(makeContext(WS));
    const area = await s.createArea({ title: "Career" });
    const open = await s.createProject({
      title: "Open",
      parent: { kind: "area", id: area.id },
    });
    const archived = await s.createProject({
      title: "Archived",
      parent: { kind: "area", id: area.id },
    });
    const completedThenArchived = await s.createProject({
      title: "Completed then archived",
      parent: { kind: "area", id: area.id },
    });
    await s.complete(completedThenArchived.id);
    await settings.archive(archived.id);
    await settings.archive(completedThenArchived.id);

    const repo = makeProjectRepository(makeContext(WS));
    const archivedPage = await repo.listProjects({ state: "archived" });
    expect(archivedPage.items.map((p) => p.id).sort()).toEqual(
      [archived.id, completedThenArchived.id].sort(),
    );

    // "all", "open" and "completed" never leak an archived project (PROJ-05 §7):
    // they mean "every/open/completed NON-ARCHIVED project" — archived work is
    // reached only through the dedicated "archived" state.
    const all = await repo.listProjects({ state: "all" });
    expect(all.items.map((p) => p.id)).toEqual([open.id]);
    const openOnly = await repo.listProjects({ state: "open" });
    expect(openOnly.items.map((p) => p.id)).toEqual([open.id]);
    const completedOnly = await repo.listProjects({ state: "completed" });
    expect(completedOnly.items).toHaveLength(0);
  });

  it("an additional workflowStatus filter restricts to an exact status (Today's active-only query)", async () => {
    const s = spine(WS);
    const settings = makeProjectSettingsRepository(makeContext(WS));
    const area = await s.createArea({ title: "Career" });
    const planned = await s.createProject({
      title: "Planned",
      parent: { kind: "area", id: area.id },
    });
    const active = await s.createProject({
      title: "Active",
      parent: { kind: "area", id: area.id },
    });
    await settings.setStatus(active.id, "active");
    const onHold = await s.createProject({
      title: "On hold",
      parent: { kind: "area", id: area.id },
    });
    await settings.setStatus(onHold.id, "on_hold");

    const repo = makeProjectRepository(makeContext(WS));
    const activeOnly = await repo.listProjects({
      state: "open",
      workflowStatus: "active",
    });
    expect(activeOnly.items.map((p) => p.id)).toEqual([active.id]);

    const plannedOnly = await repo.listProjects({
      state: "open",
      workflowStatus: "planned",
    });
    expect(plannedOnly.items.map((p) => p.id)).toEqual([planned.id]);
  });

  it("a settings-only transition (status/archive/restore) affects the 'recent' order and the effective updatedAt (ADR-037 §37.2)", async () => {
    const clock = new FakeClock();
    const s = makeSpineRepository(makeContext(WS), {
      clock: clock.now,
      idGenerator: ids("r"),
    });
    const area = await s.createArea({ title: "Career" });
    const p1 = await s.createProject({
      title: "First",
      parent: { kind: "area", id: area.id },
    });
    clock.advance(1000);
    const p2 = await s.createProject({
      title: "Second",
      parent: { kind: "area", id: area.id },
    });
    // p2 is more recently created/updated than p1 at this point.
    clock.advance(1000);
    const settings = makeProjectSettingsRepository(makeContext(WS), {
      clock: clock.now,
    });
    // A status change on p1 (whose entities.updated_at is OLDER than p2's) must
    // still bump it to the front of "recent" — proving the ordering uses the
    // effective (MAX of entity + settings) timestamp, not entities.updated_at alone.
    await settings.setStatus(p1.id, "active");

    const repo = makeProjectRepository(makeContext(WS));
    const recent = await repo.listProjects({ orderBy: "recent" });
    expect(recent.items.map((p) => p.id)).toEqual([p1.id, p2.id]);
    expect(recent.items[0]?.updatedAt.getTime()).toBeGreaterThan(
      recent.items[1]!.updatedAt.getTime(),
    );
  });

  it("is workspace-isolated and orders deterministically", async () => {
    const s = spine(WS);
    const area = await s.createArea({ title: "Career" });
    const p1 = await s.createProject({
      title: "First",
      parent: { kind: "area", id: area.id },
    });
    const p2 = await s.createProject({
      title: "Second",
      parent: { kind: "area", id: area.id },
    });

    // A project in another workspace never leaks in.
    const other = spine(OTHER, "o");
    const otherArea = await other.createArea({ title: "Other" });
    await other.createProject({
      title: "Hidden",
      parent: { kind: "area", id: otherArea.id },
    });

    const page = await makeProjectRepository(makeContext(WS)).listProjects();
    expect(page.items.map((p) => p.id)).toEqual([p1.id, p2.id]);
  });

  it("orders by most-recently-updated at the database with `orderBy: recent`", async () => {
    // An ADVANCING clock so rename gives p1 a strictly later `updated_at`.
    const clock = new FakeClock();
    const s = makeSpineRepository(makeContext(WS), {
      clock: clock.now,
      idGenerator: ids("re"),
      activityIdGenerator: ids("rea"),
    });
    const area = await s.createArea({ title: "Career" });
    const p1 = await s.createProject({
      title: "First",
      parent: { kind: "area", id: area.id },
    });
    clock.advance(1000);
    const p2 = await s.createProject({
      title: "Second",
      parent: { kind: "area", id: area.id },
    });
    clock.advance(1000);
    // Renaming p1 moves its `updated_at` ahead of p2's, without changing created order.
    await s.rename(p1.id, "First (updated)");

    const repo = makeProjectRepository(makeContext(WS));
    // Creation order is unchanged; recency order puts the freshly-updated p1 first.
    expect(
      (await repo.listProjects({ orderBy: "created" })).items.map((p) => p.id),
    ).toEqual([p1.id, p2.id]);
    // A limit of 1 under `recent` selects p1 globally — not p1 by creation order.
    const recent = await repo.listProjects({ orderBy: "recent", limit: 1 });
    expect(recent.items.map((p) => p.id)).toEqual([p1.id]);
  });

  it("clamps the limit to a bounded page (never unbounded)", async () => {
    const s = spine(WS);
    const area = await s.createArea({ title: "Career" });
    await s.createProject({
      title: "Only",
      parent: { kind: "area", id: area.id },
    });
    // An absurd requested limit is clamped; the call still succeeds and is bounded.
    const page = await makeProjectRepository(makeContext(WS)).listProjects({
      limit: 100_000,
    });
    expect(page.items.length).toBeLessThanOrEqual(1);
  });
});

describe("ProjectRepository.getProjectOverview", () => {
  it("returns the overview for an area-parented project", async () => {
    const s = spine(WS);
    const area = await s.createArea({ title: "Career" });
    const project = await s.createProject({
      title: "DalyHub V2",
      parent: { kind: "area", id: area.id },
    });
    const overview = await makeProjectRepository(
      makeContext(WS),
    ).getProjectOverview(project.id);
    expect(overview?.title).toBe("DalyHub V2");
    expect(overview?.area).toEqual({
      kind: "area",
      id: area.id,
      title: "Career",
    });
    expect(overview?.goal).toBeNull();
  });

  it("resolves a goal-parented project's Goal and Area", async () => {
    const s = spine(WS);
    const area = await s.createArea({ title: "Health" });
    const goal = await s.createGoal({ title: "Run a half", areaId: area.id });
    const project = await s.createProject({
      title: "12-week plan",
      parent: { kind: "goal", id: goal.id },
    });
    const overview = await makeProjectRepository(
      makeContext(WS),
    ).getProjectOverview(project.id);
    expect(overview?.goal?.id).toBe(goal.id);
    expect(overview?.area).toEqual({
      kind: "area",
      id: area.id,
      title: "Health",
    });
  });

  it("returns null for missing, wrong-kind, soft-deleted and cross-workspace ids", async () => {
    const s = spine(WS);
    const area = await s.createArea({ title: "Career" });
    const project = await s.createProject({
      title: "Live",
      parent: { kind: "area", id: area.id },
    });
    const repo = makeProjectRepository(makeContext(WS));

    expect(await repo.getProjectOverview("does-not-exist")).toBeNull();
    // An Area id is the wrong kind — not a project.
    expect(await repo.getProjectOverview(area.id)).toBeNull();

    // Cross-workspace: the same id is invisible from another workspace.
    expect(
      await makeProjectRepository(makeContext(OTHER)).getProjectOverview(
        project.id,
      ),
    ).toBeNull();

    // Soft-deleted → not found.
    await s.softDelete(project.id);
    expect(await repo.getProjectOverview(project.id)).toBeNull();
  });
});

describe("TaskRepository.listProjectTasks", () => {
  it("lists a project's child tasks with waiting representation and honours state", async () => {
    const s = spine(WS);
    const t = tasks(WS);
    const area = await s.createArea({ title: "Career" });
    const project = await s.createProject({
      title: "DalyHub V2",
      parent: { kind: "area", id: area.id },
    });
    const open = await s.createTask({
      title: "Open task",
      parent: { kind: "project", id: project.id },
    });
    const done = await s.createTask({
      title: "Done task",
      parent: { kind: "project", id: project.id },
    });
    const waiting = await s.createTask({
      title: "Waiting task",
      parent: { kind: "project", id: project.id },
    });
    await t.completeTask(done.id);
    await t.setWaiting(waiting.id, {
      target: { kind: "text", note: "finance sign-off" },
    });

    // Default (open): excludes the completed task, includes the waiting one.
    const openPage = await t.listProjectTasks(project.id);
    expect(openPage.items.map((i) => i.id).sort()).toEqual(
      [open.id, waiting.id].sort(),
    );
    const waitingItem = openPage.items.find((i) => i.id === waiting.id)!;
    expect(waitingItem.waiting?.subject).toEqual({
      kind: "text",
      note: "finance sign-off",
    });
    expect(waitingItem.parent).toEqual({
      kind: "project",
      id: project.id,
      title: "DalyHub V2",
    });

    // completed / all filters.
    const completedPage = await t.listProjectTasks(project.id, {
      state: "completed",
    });
    expect(completedPage.items.map((i) => i.id)).toEqual([done.id]);
    const allPage = await t.listProjectTasks(project.id, { state: "all" });
    expect(allPage.items).toHaveLength(3);
    // The paginated list orders deterministically by `(createdAt, id)` — a stable
    // keyset — so the sequence is exactly creation order (open, done, waiting).
    expect(allPage.items.map((i) => i.id)).toEqual([
      open.id,
      done.id,
      waiting.id,
    ]);
  });

  it("returns no tasks for a wrong-kind, missing or cross-workspace project id", async () => {
    const s = spine(WS);
    const t = tasks(WS);
    const area = await s.createArea({ title: "Career" });
    const project = await s.createProject({
      title: "Live",
      parent: { kind: "area", id: area.id },
    });
    await s.createTask({
      title: "A",
      parent: { kind: "project", id: project.id },
    });

    // Wrong kind (an Area id) and a missing id both yield nothing.
    expect((await t.listProjectTasks(area.id)).items).toHaveLength(0);
    expect((await t.listProjectTasks("nope")).items).toHaveLength(0);

    // Cross-workspace: another workspace sees none of this project's tasks.
    expect(
      (await tasks(OTHER).listProjectTasks(project.id)).items,
    ).toHaveLength(0);
  });

  it("reflects roll-up changes as tasks are created, completed and reopened", async () => {
    const s = spine(WS);
    const t = tasks(WS);
    const area = await s.createArea({ title: "Career" });
    const project = await s.createProject({
      title: "DalyHub V2",
      parent: { kind: "area", id: area.id },
    });
    const repo = makeProjectRepository(makeContext(WS));

    const first = await s.createTask({
      title: "First",
      parent: { kind: "project", id: project.id },
    });
    let item = (await repo.listProjects()).items[0]!;
    expect([item.taskTotal, item.taskCompleted]).toEqual([1, 0]);

    await t.completeTask(first.id);
    item = (await repo.listProjects()).items[0]!;
    expect([item.taskTotal, item.taskCompleted]).toEqual([1, 1]);

    await s.reopen(first.id);
    item = (await repo.listProjects()).items[0]!;
    expect([item.taskTotal, item.taskCompleted]).toEqual([1, 0]);
  });
});

describe("ProjectRepository.listProjects — keyset pagination", () => {
  it("reaches EVERY project across pages with no gap and no duplicate", async () => {
    const s = spine(WS);
    const area = await s.createArea({ title: "Career" });
    const created: string[] = [];
    // More than a single page (and more than the default page size) so the cursor
    // is genuinely exercised across several boundaries.
    for (let i = 0; i < 55; i += 1) {
      const p = await s.createProject({
        title: `Project ${i}`,
        parent: { kind: "area", id: area.id },
      });
      created.push(p.id);
    }

    const repo = makeProjectRepository(makeContext(WS));

    // The unpaginated (bounded) order is the ground truth the paged walk must match.
    const groundTruth = (await repo.listProjects({ limit: 100 })).items.map(
      (p) => p.id,
    );
    expect(groundTruth).toHaveLength(55);
    expect(new Set(groundTruth)).toEqual(new Set(created));

    const walked: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await repo.listProjects({ limit: 20, cursor });
      expect(page.items.length).toBeLessThanOrEqual(20);
      walked.push(...page.items.map((p) => p.id));
      cursor = page.nextCursor ?? undefined;
      pages += 1;
      expect(pages).toBeLessThan(10); // termination guard
    } while (cursor);

    // Same set, same length, no duplicates, and the SAME order as the ground truth.
    expect(walked).toHaveLength(55);
    expect(new Set(walked).size).toBe(55);
    expect(walked).toEqual(groundTruth);
  });

  it("emits a null nextCursor exactly when the last page is reached", async () => {
    const s = spine(WS);
    const area = await s.createArea({ title: "Career" });
    for (let i = 0; i < 3; i += 1) {
      await s.createProject({
        title: `P${i}`,
        parent: { kind: "area", id: area.id },
      });
    }
    const repo = makeProjectRepository(makeContext(WS));
    // A full-but-final page (exactly the limit) still reports no further pages.
    const exact = await repo.listProjects({ limit: 3 });
    expect(exact.items).toHaveLength(3);
    expect(exact.nextCursor).toBeNull();

    const partial = await repo.listProjects({ limit: 2 });
    expect(partial.nextCursor).not.toBeNull();
    const second = await repo.listProjects({
      limit: 2,
      cursor: partial.nextCursor!,
    });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
  });

  it("rejects a cursor issued for a different state filter", async () => {
    const s = spine(WS);
    const area = await s.createArea({ title: "Career" });
    for (let i = 0; i < 4; i += 1) {
      await s.createProject({
        title: `P${i}`,
        parent: { kind: "area", id: area.id },
      });
    }
    const repo = makeProjectRepository(makeContext(WS));
    const page = await repo.listProjects({ state: "all", limit: 2 });
    // A cursor bound to `all` must not be honoured under `open` (different rows).
    await expect(
      repo.listProjects({ state: "open", cursor: page.nextCursor! }),
    ).rejects.toBeInstanceOf(InvalidSpineCursorError);
  });

  it("rejects a cursor issued for a different ordering", async () => {
    const s = spine(WS);
    const area = await s.createArea({ title: "Career" });
    for (let i = 0; i < 4; i += 1) {
      await s.createProject({
        title: `P${i}`,
        parent: { kind: "area", id: area.id },
      });
    }
    const repo = makeProjectRepository(makeContext(WS));
    const page = await repo.listProjects({ orderBy: "created", limit: 2 });
    await expect(
      repo.listProjects({ orderBy: "recent", cursor: page.nextCursor! }),
    ).rejects.toBeInstanceOf(InvalidSpineCursorError);
  });

  it("rejects a cursor issued for a different workspace", async () => {
    const s = spine(WS);
    const area = await s.createArea({ title: "Career" });
    for (let i = 0; i < 4; i += 1) {
      await s.createProject({
        title: `P${i}`,
        parent: { kind: "area", id: area.id },
      });
    }
    const page = await makeProjectRepository(makeContext(WS)).listProjects({
      limit: 2,
    });
    // The other workspace must not accept this workspace's cursor.
    await expect(
      makeProjectRepository(makeContext(OTHER)).listProjects({
        cursor: page.nextCursor!,
      }),
    ).rejects.toBeInstanceOf(InvalidSpineCursorError);
  });

  it("rejects a malformed cursor", async () => {
    const repo = makeProjectRepository(makeContext(WS));
    await expect(
      repo.listProjects({ cursor: "not-a-real-cursor" }),
    ).rejects.toBeInstanceOf(InvalidSpineCursorError);
  });
});

describe("TaskRepository.listProjectTasks — keyset pagination", () => {
  it("reaches EVERY task across pages with no gap and no duplicate", async () => {
    const s = spine(WS);
    const t = tasks(WS);
    const area = await s.createArea({ title: "Career" });
    const project = await s.createProject({
      title: "Big project",
      parent: { kind: "area", id: area.id },
    });
    const created: string[] = [];
    for (let i = 0; i < 55; i += 1) {
      const task = await s.createTask({
        title: `Task ${i}`,
        parent: { kind: "project", id: project.id },
      });
      created.push(task.id);
    }

    const groundTruth = (
      await t.listProjectTasks(project.id, { state: "all", limit: 100 })
    ).items.map((i) => i.id);
    expect(groundTruth).toHaveLength(55);

    const walked: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await t.listProjectTasks(project.id, {
        state: "all",
        limit: 20,
        cursor,
      });
      expect(page.items.length).toBeLessThanOrEqual(20);
      walked.push(...page.items.map((i) => i.id));
      cursor = page.nextCursor ?? undefined;
      pages += 1;
      expect(pages).toBeLessThan(10);
    } while (cursor);

    expect(walked).toHaveLength(55);
    expect(new Set(walked).size).toBe(55);
    expect(walked).toEqual(groundTruth);
    expect(new Set(walked)).toEqual(new Set(created));
  });

  it("rejects a cursor issued for a different project", async () => {
    const s = spine(WS);
    const t = tasks(WS);
    const area = await s.createArea({ title: "Career" });
    const a = await s.createProject({
      title: "A",
      parent: { kind: "area", id: area.id },
    });
    const b = await s.createProject({
      title: "B",
      parent: { kind: "area", id: area.id },
    });
    for (let i = 0; i < 4; i += 1) {
      await s.createTask({
        title: `A${i}`,
        parent: { kind: "project", id: a.id },
      });
    }
    const page = await t.listProjectTasks(a.id, { state: "all", limit: 2 });
    await expect(
      t.listProjectTasks(b.id, { state: "all", cursor: page.nextCursor! }),
    ).rejects.toBeInstanceOf(InvalidSpineCursorError);
  });

  it("rejects a cursor issued for a different state filter", async () => {
    const s = spine(WS);
    const t = tasks(WS);
    const area = await s.createArea({ title: "Career" });
    const project = await s.createProject({
      title: "P",
      parent: { kind: "area", id: area.id },
    });
    for (let i = 0; i < 4; i += 1) {
      await s.createTask({
        title: `T${i}`,
        parent: { kind: "project", id: project.id },
      });
    }
    const page = await t.listProjectTasks(project.id, {
      state: "all",
      limit: 2,
    });
    await expect(
      t.listProjectTasks(project.id, {
        state: "open",
        cursor: page.nextCursor!,
      }),
    ).rejects.toBeInstanceOf(InvalidSpineCursorError);
  });

  it("rejects a cursor issued for a different workspace", async () => {
    const s = spine(WS);
    const t = tasks(WS);
    const area = await s.createArea({ title: "Career" });
    const project = await s.createProject({
      title: "P",
      parent: { kind: "area", id: area.id },
    });
    for (let i = 0; i < 4; i += 1) {
      await s.createTask({
        title: `T${i}`,
        parent: { kind: "project", id: project.id },
      });
    }
    const page = await t.listProjectTasks(project.id, {
      state: "all",
      limit: 2,
    });
    await expect(
      tasks(OTHER).listProjectTasks(project.id, {
        state: "all",
        cursor: page.nextCursor!,
      }),
    ).rejects.toBeInstanceOf(InvalidSpineCursorError);
  });
});
