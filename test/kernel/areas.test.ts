import { beforeEach, describe, expect, it } from "vitest";

import { InvalidSpineCursorError } from "~/kernel/spine";

import {
  FakeClock,
  makeAreaRepository,
  makeContext,
  makeProjectSettingsRepository,
  makeSpineRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "test-default-workspace";
const OTHER = "ws_areas_other";

function spine(ws: string, prefix = "ar") {
  return makeSpineRepository(makeContext(ws), {
    clock: new FakeClock().now,
    idGenerator: sequentialIds(prefix),
    activityIdGenerator: sequentialIds(`${prefix}act`),
  });
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("AreaRepository", () => {
  it("lists active Areas with live hierarchy roll-ups", async () => {
    const s = spine(WS);
    const area = await s.createArea({ title: "Career" });
    const goal = await s.createGoal({ title: "Ship v2", areaId: area.id });
    const directProject = await s.createProject({
      title: "Direct work",
      parent: { kind: "area", id: area.id },
    });
    const goalProject = await s.createProject({
      title: "Goal work",
      parent: { kind: "goal", id: goal.id },
    });
    const directTask = await s.createTask({
      title: "Direct task",
      parent: { kind: "area", id: area.id },
    });
    const projectTask = await s.createTask({
      title: "Project task",
      parent: { kind: "project", id: directProject.id },
    });
    await s.createTask({
      title: "Goal project task",
      parent: { kind: "project", id: goalProject.id },
    });
    await s.complete(goal.id);
    await s.complete(directProject.id);
    await s.complete(projectTask.id);

    const page = await makeAreaRepository(makeContext(WS)).listAreas();
    expect(page.items).toHaveLength(1);
    const item = page.items[0]!;
    expect(item.id).toBe(area.id);
    expect(item.rollup.goals).toMatchObject({ total: 1, completed: 1 });
    expect(item.rollup.projects).toMatchObject({ total: 2, completed: 1 });
    expect(item.rollup.tasks).toMatchObject({ total: 3, completed: 1 });
    expect(item.activeProjectCount).toBe(1);
    expect(directTask.id).toBeTruthy();
  });

  it("separates Goals and direct versus Goal-backed Projects", async () => {
    const s = spine(WS);
    const area = await s.createArea({ title: "Home" });
    const goal = await s.createGoal({ title: "Renovate", areaId: area.id });
    const direct = await s.createProject({
      title: "Clean garage",
      parent: { kind: "area", id: area.id },
    });
    const backed = await s.createProject({
      title: "Paint rooms",
      parent: { kind: "goal", id: goal.id },
    });
    await s.createTask({
      title: "Buy paint",
      parent: { kind: "project", id: backed.id },
    });

    const repo = makeAreaRepository(makeContext(WS));
    const goals = await repo.listAreaGoals({ areaId: area.id });
    expect(goals.items.map((item) => item.id)).toEqual([goal.id]);
    expect(goals.items[0]).toMatchObject({
      projectTotal: 1,
      taskTotal: 1,
    });

    const projects = await repo.listAreaProjects({ areaId: area.id });
    expect(projects.items.map((item) => item.id).sort()).toEqual(
      [direct.id, backed.id].sort(),
    );
    expect(
      projects.items.find((item) => item.id === direct.id)?.parent,
    ).toEqual({ kind: "area" });
    expect(
      projects.items.find((item) => item.id === backed.id)?.parent,
    ).toEqual({ kind: "goal", goal: { id: goal.id, title: "Renovate" } });
  });

  it("excludes soft-deleted descendants and reflects moved descendants", async () => {
    const s = spine(WS);
    const a1 = await s.createArea({ title: "A1" });
    const a2 = await s.createArea({ title: "A2" });
    const project = await s.createProject({
      title: "Move me",
      parent: { kind: "area", id: a1.id },
    });
    const task = await s.createTask({
      title: "Remove me",
      parent: { kind: "project", id: project.id },
    });
    await s.softDelete(task.id);
    await s.move(project.id, { kind: "area", id: a2.id });

    const repo = makeAreaRepository(makeContext(WS));
    expect((await repo.listAreaProjects({ areaId: a1.id })).items).toHaveLength(
      0,
    );
    const a2Projects = await repo.listAreaProjects({ areaId: a2.id });
    expect(a2Projects.items.map((item) => item.id)).toEqual([project.id]);
    expect(a2Projects.items[0]?.taskTotal).toBe(0);
  });

  it("is workspace isolated and fails closed for wrong-kind ids", async () => {
    const own = spine(WS);
    const other = spine(OTHER, "other");
    const ownArea = await own.createArea({ title: "Career" });
    const project = await own.createProject({
      title: "Not an Area",
      parent: { kind: "area", id: ownArea.id },
    });
    const otherArea = await other.createArea({ title: "Other Area" });

    const repo = makeAreaRepository(makeContext(WS));
    expect(await repo.getAreaOverview(otherArea.id)).toBeNull();
    expect(await repo.getAreaOverview(project.id)).toBeNull();
  });

  it("uses scope-bound deterministic cursors", async () => {
    const s = spine(WS);
    const a = await s.createArea({ title: "A" });
    await s.createArea({ title: "B" });
    const repo = makeAreaRepository(makeContext(WS));
    const first = await repo.listAreas({ limit: 1 });
    expect(first.items.map((item) => item.title)).toEqual(["A"]);
    expect(first.nextCursor).toBeTruthy();
    const second = await repo.listAreas({
      limit: 1,
      cursor: first.nextCursor!,
    });
    expect(second.items.map((item) => item.title)).toEqual(["B"]);
    await expect(
      repo.listAreaGoals({ areaId: a.id, cursor: first.nextCursor! }),
    ).rejects.toBeInstanceOf(InvalidSpineCursorError);
  });

  it("includes archived Projects in roll-up but not active project count", async () => {
    const s = spine(WS);
    const settings = makeProjectSettingsRepository(makeContext(WS));
    const area = await s.createArea({ title: "Archive Area" });
    const project = await s.createProject({
      title: "Archived",
      parent: { kind: "area", id: area.id },
    });
    await settings.archive(project.id);

    const item = (await makeAreaRepository(makeContext(WS)).listAreas())
      .items[0]!;
    expect(item.rollup.projects.total).toBe(1);
    expect(item.activeProjectCount).toBe(0);
  });
});
