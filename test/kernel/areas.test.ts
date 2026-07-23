import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { createAreaRepository } from "~/platform/storage/d1";
import { InvalidSpineCursorError } from "~/kernel/spine";

import {
  countingDb,
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

  describe("getAreaMomentumFacts — the complete momentum boundary", () => {
    it("returns EVERY aligned Project, independent of listAreaProjects' bounded card page", async () => {
      const s = spine(WS);
      const area = await s.createArea({ title: "Big Area" });
      const goal = await s.createGoal({ title: "Goal", areaId: area.id });
      for (let i = 0; i < 40; i++) {
        await s.createProject({
          title: `Direct ${i}`,
          parent: { kind: "area", id: area.id },
        });
      }
      for (let i = 0; i < 15; i++) {
        await s.createProject({
          title: `Goal-backed ${i}`,
          parent: { kind: "goal", id: goal.id },
        });
      }

      const repo = makeAreaRepository(makeContext(WS));
      const page = await repo.listAreaProjects({ areaId: area.id, limit: 50 });
      expect(page.items).toHaveLength(50);
      expect(page.nextCursor).toBeTruthy();

      const momentumFacts = await repo.getAreaMomentumFacts(area.id);
      expect(momentumFacts.projects).toHaveLength(55);
    });

    it("distinguishes unfinished/completed direct Area Tasks from Project Tasks", async () => {
      const s = spine(WS);
      const area = await s.createArea({ title: "Area" });
      const directOpen = await s.createTask({
        title: "Direct open",
        parent: { kind: "area", id: area.id },
      });
      const directDone = await s.createTask({
        title: "Direct done",
        parent: { kind: "area", id: area.id },
      });
      await s.complete(directDone.id);
      const project = await s.createProject({
        title: "P",
        parent: { kind: "area", id: area.id },
      });
      const projectOpen = await s.createTask({
        title: "Project open",
        parent: { kind: "project", id: project.id },
      });
      const projectDone = await s.createTask({
        title: "Project done",
        parent: { kind: "project", id: project.id },
      });
      await s.complete(projectDone.id);
      expect(directOpen.id).toBeTruthy();
      expect(projectOpen.id).toBeTruthy();

      const facts = await makeAreaRepository(
        makeContext(WS),
      ).getAreaMomentumFacts(area.id);
      expect(facts.directTasks).toEqual({
        unfinishedTotal: 1,
        completedTotal: 1,
      });
    });

    it("excludes soft-deleted Tasks and cross-workspace/wrong-kind descendants", async () => {
      const s = spine(WS);
      const area = await s.createArea({ title: "Area" });
      const keep = await s.createTask({
        title: "Keep",
        parent: { kind: "area", id: area.id },
      });
      const drop = await s.createTask({
        title: "Drop",
        parent: { kind: "area", id: area.id },
      });
      await s.softDelete(drop.id);
      expect(keep.id).toBeTruthy();

      const other = spine(OTHER, "other");
      const otherArea = await other.createArea({ title: "Other" });
      await other.createTask({
        title: "Other workspace task",
        parent: { kind: "area", id: otherArea.id },
      });

      const facts = await makeAreaRepository(
        makeContext(WS),
      ).getAreaMomentumFacts(area.id);
      expect(facts.directTasks).toEqual({
        unfinishedTotal: 1,
        completedTotal: 0,
      });
    });

    it("reflects moved Projects and never leaks a Project archived elsewhere", async () => {
      const s = spine(WS);
      const settings = makeProjectSettingsRepository(makeContext(WS));
      const a1 = await s.createArea({ title: "A1" });
      const a2 = await s.createArea({ title: "A2" });
      const project = await s.createProject({
        title: "Movable",
        parent: { kind: "area", id: a1.id },
      });
      await settings.setStatus(project.id, "active");
      await s.move(project.id, { kind: "area", id: a2.id });

      const repo = makeAreaRepository(makeContext(WS));
      expect((await repo.getAreaMomentumFacts(a1.id)).projects).toHaveLength(0);
      const a2Facts = await repo.getAreaMomentumFacts(a2.id);
      expect(a2Facts.projects.map((p) => p.id)).toEqual([project.id]);
      expect(a2Facts.projects[0]?.status).toBe("active");
    });

    it("fails closed (empty facts, no throw) for a wrong-kind, missing or cross-workspace Area id", async () => {
      const s = spine(WS);
      const area = await s.createArea({ title: "Area" });
      const project = await s.createProject({
        title: "Not an Area",
        parent: { kind: "area", id: area.id },
      });
      const other = spine(OTHER, "other");
      const otherArea = await other.createArea({ title: "Other Area" });

      const repo = makeAreaRepository(makeContext(WS));
      for (const wrongId of [project.id, "nonexistent-id", otherArea.id]) {
        const facts = await repo.getAreaMomentumFacts(wrongId);
        expect(facts).toEqual({
          directTasks: { unfinishedTotal: 0, completedTotal: 0 },
          projects: [],
        });
      }
    });

    it("issues a fixed, small number of queries regardless of aligned Project count (no N+1)", async () => {
      const s = spine(WS);
      const area = await s.createArea({ title: "Area" });
      for (let i = 0; i < 20; i++) {
        await s.createProject({
          title: `P${i}`,
          parent: { kind: "area", id: area.id },
        });
      }
      const counting = countingDb(env.DB);
      const countingRepo = createAreaRepository(counting.db, makeContext(WS));
      counting.reset();
      const facts = await countingRepo.getAreaMomentumFacts(area.id);
      expect(facts.projects).toHaveLength(20);
      // Two workspace-scoped aggregate queries (direct-task counts, aligned
      // Project facts) — never one query per Project.
      expect(counting.prepareCount()).toBeLessThanOrEqual(2);
    });
  });
});
