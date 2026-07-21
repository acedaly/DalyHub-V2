import { beforeEach, describe, expect, it } from "vitest";

import {
  FakeClock,
  makeContext,
  makeProjectRepository,
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
    idGenerator: ids("t"),
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
    expect(item.goal).toEqual({ kind: "goal", id: goal.id, title: "Run a half" });
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
    expect(all.items.map((p) => p.id).sort()).toEqual([open.id, done.id].sort());
    const openOnly = await repo.listProjects({ state: "open" });
    expect(openOnly.items.map((p) => p.id)).toEqual([open.id]);
    const completedOnly = await repo.listProjects({ state: "completed" });
    expect(completedOnly.items.map((p) => p.id)).toEqual([done.id]);
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
    expect(overview?.area).toEqual({ kind: "area", id: area.id, title: "Career" });
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
    expect(overview?.area).toEqual({ kind: "area", id: area.id, title: "Health" });
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
    // Open tasks sort before completed ones.
    expect(allPage.items[allPage.items.length - 1]!.id).toBe(done.id);
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
