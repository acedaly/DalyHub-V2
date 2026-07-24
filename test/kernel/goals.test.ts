import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { createGoalRepository } from "~/platform/storage/d1";
import { InvalidSpineCursorError } from "~/kernel/spine";

import {
  countingDb,
  FakeClock,
  makeAreaRepository,
  makeContext,
  makeGoalDetailsRepository,
  makeGoalRepository,
  makeProjectSettingsRepository,
  makeSpineRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "test-default-workspace";
const OTHER = "ws_goals_other";

function spine(ws: string, prefix = "gl") {
  return makeSpineRepository(makeContext(ws), {
    clock: new FakeClock().now,
    idGenerator: sequentialIds(prefix),
    activityIdGenerator: sequentialIds(`${prefix}act`),
  });
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("GoalRepository", () => {
  describe("getGoalOverview", () => {
    it("resolves the Goal header with its current Area title", async () => {
      const s = spine(WS);
      const area = await s.createArea({ title: "Health" });
      const goal = await s.createGoal({
        title: "Run a half-marathon",
        areaId: area.id,
      });

      const overview = await makeGoalRepository(
        makeContext(WS),
      ).getGoalOverview(goal.id);
      expect(overview).toMatchObject({
        id: goal.id,
        title: "Run a half-marathon",
        completedAt: null,
        area: { id: area.id, title: "Health" },
      });
    });

    it("reflects a rename and a completion", async () => {
      const s = spine(WS);
      const area = await s.createArea({ title: "Health" });
      const goal = await s.createGoal({ title: "Old title", areaId: area.id });
      await s.rename(goal.id, "New title");
      await s.complete(goal.id);

      const overview = await makeGoalRepository(
        makeContext(WS),
      ).getGoalOverview(goal.id);
      expect(overview?.title).toBe("New title");
      expect(overview?.completedAt).toBeInstanceOf(Date);
    });

    it("reflects a details-only edit (target date / definition of done) in the effective updatedAt, mirroring ADR-037 §37.2 for Projects", async () => {
      const clock = new FakeClock();
      const s = makeSpineRepository(makeContext(WS), {
        clock: clock.now,
        idGenerator: sequentialIds("gleff"),
        activityIdGenerator: sequentialIds("gleffact"),
      });
      const area = await s.createArea({ title: "Health" });
      const goal = await s.createGoal({
        title: "Run a half-marathon",
        areaId: area.id,
      });
      const before = await makeGoalRepository(makeContext(WS)).getGoalOverview(
        goal.id,
      );

      // The spine's own `entities.updated_at` never moves again after creation
      // here (no rename/complete/reopen) — only `goal_details.updated_at` does.
      clock.advance(1000);
      const details = makeGoalDetailsRepository(makeContext(WS), {
        clock: clock.now,
      });
      await details.update(goal.id, { targetDate: "2026-12-31" });

      const after = await makeGoalRepository(makeContext(WS)).getGoalOverview(
        goal.id,
      );
      expect(after!.updatedAt.getTime()).toBeGreaterThan(
        before!.updatedAt.getTime(),
      );
    });

    it("fails closed (null) for missing, deleted, wrong-kind and cross-workspace ids", async () => {
      const s = spine(WS);
      const area = await s.createArea({ title: "Health" });
      const goal = await s.createGoal({ title: "Deleted", areaId: area.id });
      const project = await s.createProject({
        title: "Not a goal",
        parent: { kind: "area", id: area.id },
      });
      await s.softDelete(goal.id);

      const other = spine(OTHER, "other");
      const otherArea = await other.createArea({ title: "Other" });
      const otherGoal = await other.createGoal({
        title: "Other goal",
        areaId: otherArea.id,
      });

      const repo = makeGoalRepository(makeContext(WS));
      for (const id of ["nonexistent", goal.id, project.id, otherGoal.id]) {
        expect(await repo.getGoalOverview(id)).toBeNull();
      }
    });
  });

  describe("getGoalProjectContribution — the exact, complete boundary", () => {
    it("returns the all-zero shape for a Goal with no linked Projects", async () => {
      const s = spine(WS);
      const area = await s.createArea({ title: "Area" });
      const goal = await s.createGoal({ title: "Goal", areaId: area.id });

      const contribution = await makeGoalRepository(
        makeContext(WS),
      ).getGoalProjectContribution(goal.id);
      expect(contribution).toEqual({
        total: 0,
        completed: 0,
        incomplete: 0,
        active: 0,
        planned: 0,
        onHold: 0,
        archived: 0,
      });
    });

    it("counts one incomplete and one completed Project exactly", async () => {
      const s = spine(WS);
      const settings = makeProjectSettingsRepository(makeContext(WS));
      const area = await s.createArea({ title: "Area" });
      const goal = await s.createGoal({ title: "Goal", areaId: area.id });
      const open = await s.createProject({
        title: "Open",
        parent: { kind: "goal", id: goal.id },
      });
      await settings.setStatus(open.id, "active");
      const done = await s.createProject({
        title: "Done",
        parent: { kind: "goal", id: goal.id },
      });
      await s.complete(done.id);

      const contribution = await makeGoalRepository(
        makeContext(WS),
      ).getGoalProjectContribution(goal.id);
      expect(contribution).toEqual({
        total: 2,
        completed: 1,
        incomplete: 1,
        active: 1,
        planned: 0,
        onHold: 0,
        archived: 0,
      });
    });

    it("classifies Planned, Active and On-hold Projects", async () => {
      const s = spine(WS);
      const settings = makeProjectSettingsRepository(makeContext(WS));
      const area = await s.createArea({ title: "Area" });
      const goal = await s.createGoal({ title: "Goal", areaId: area.id });
      const planned = await s.createProject({
        title: "Planned",
        parent: { kind: "goal", id: goal.id },
      });
      const active = await s.createProject({
        title: "Active",
        parent: { kind: "goal", id: goal.id },
      });
      await settings.setStatus(active.id, "active");
      const onHold = await s.createProject({
        title: "On hold",
        parent: { kind: "goal", id: goal.id },
      });
      await settings.setStatus(onHold.id, "on_hold");
      expect(planned.id).toBeTruthy();

      const contribution = await makeGoalRepository(
        makeContext(WS),
      ).getGoalProjectContribution(goal.id);
      expect(contribution.planned).toBe(1);
      expect(contribution.active).toBe(1);
      expect(contribution.onHold).toBe(1);
      expect(contribution.total).toBe(3);
    });

    it("counts an archived Project under archived, taking precedence over completed", async () => {
      const s = spine(WS);
      const settings = makeProjectSettingsRepository(makeContext(WS));
      const area = await s.createArea({ title: "Area" });
      const goal = await s.createGoal({ title: "Goal", areaId: area.id });
      const project = await s.createProject({
        title: "Archived + completed",
        parent: { kind: "goal", id: goal.id },
      });
      await s.complete(project.id);
      await settings.archive(project.id);

      const contribution = await makeGoalRepository(
        makeContext(WS),
      ).getGoalProjectContribution(goal.id);
      expect(contribution.archived).toBe(1);
      expect(contribution.completed).toBe(1);
      expect(contribution.active).toBe(0);
      expect(contribution.total).toBe(1);
    });

    it("excludes a direct Area Project — only Projects actually advancing the Goal contribute", async () => {
      const s = spine(WS);
      const area = await s.createArea({ title: "Area" });
      const goal = await s.createGoal({ title: "Goal", areaId: area.id });
      await s.createProject({
        title: "Direct",
        parent: { kind: "area", id: area.id },
      });
      const advancing = await s.createProject({
        title: "Advancing",
        parent: { kind: "goal", id: goal.id },
      });

      const contribution = await makeGoalRepository(
        makeContext(WS),
      ).getGoalProjectContribution(goal.id);
      expect(contribution.total).toBe(1);
      expect(advancing.id).toBeTruthy();
    });

    it("immediately stops counting a moved or soft-deleted Project", async () => {
      const s = spine(WS);
      const area = await s.createArea({ title: "Area" });
      const goalA = await s.createGoal({ title: "Goal A", areaId: area.id });
      const goalB = await s.createGoal({ title: "Goal B", areaId: area.id });
      const moved = await s.createProject({
        title: "Moved",
        parent: { kind: "goal", id: goalA.id },
      });
      const deleted = await s.createProject({
        title: "Deleted",
        parent: { kind: "goal", id: goalA.id },
      });
      await s.softDelete(deleted.id);
      await s.move(moved.id, { kind: "goal", id: goalB.id });

      const repo = makeGoalRepository(makeContext(WS));
      expect((await repo.getGoalProjectContribution(goalA.id)).total).toBe(0);
      expect((await repo.getGoalProjectContribution(goalB.id)).total).toBe(1);
    });

    it("excludes a cross-workspace Project (never leaks)", async () => {
      const s = spine(WS);
      const area = await s.createArea({ title: "Area" });
      const goal = await s.createGoal({ title: "Goal", areaId: area.id });

      const contribution = await makeGoalRepository(
        makeContext(WS),
      ).getGoalProjectContribution(goal.id);
      expect(contribution.total).toBe(0);
    });

    it("returns the all-zero shape for a wrong-kind, missing or cross-workspace Goal id (never throws)", async () => {
      const s = spine(WS);
      const area = await s.createArea({ title: "Area" });
      const project = await s.createProject({
        title: "Not a goal",
        parent: { kind: "area", id: area.id },
      });
      const other = spine(OTHER, "other");
      const otherArea = await other.createArea({ title: "Other" });
      const otherGoal = await other.createGoal({
        title: "Other goal",
        areaId: otherArea.id,
      });

      const repo = makeGoalRepository(makeContext(WS));
      for (const id of ["nonexistent", project.id, otherGoal.id]) {
        expect(await repo.getGoalProjectContribution(id)).toEqual({
          total: 0,
          completed: 0,
          incomplete: 0,
          active: 0,
          planned: 0,
          onHold: 0,
          archived: 0,
        });
      }
    });

    it("stays exact and complete for more than 50 Projects, independent of the displayed card page", async () => {
      const s = spine(WS);
      const area = await s.createArea({ title: "Area" });
      const goal = await s.createGoal({ title: "Big Goal", areaId: area.id });
      const settings = makeProjectSettingsRepository(makeContext(WS));
      for (let i = 0; i < 60; i++) {
        const project = await s.createProject({
          title: `P${i}`,
          parent: { kind: "goal", id: goal.id },
        });
        if (i < 20) {
          await s.complete(project.id);
        } else if (i < 30) {
          await settings.setStatus(project.id, "active");
        }
      }

      const repo = makeGoalRepository(makeContext(WS));
      const page = await repo.listGoalProjects({ goalId: goal.id, limit: 50 });
      expect(page.items).toHaveLength(50);
      expect(page.nextCursor).toBeTruthy();

      const contribution = await repo.getGoalProjectContribution(goal.id);
      expect(contribution.total).toBe(60);
      expect(contribution.completed).toBe(20);
      expect(contribution.active).toBe(10);
    });

    it("never double-counts after a Project is moved away and restored back to the SAME Goal", async () => {
      // The spine's partial unique index makes a truly duplicate ACTIVE
      // structural link unrepresentable — the real resilience case is a
      // Project that revisits a Goal: `move` restores (reuses) the
      // soft-deleted historical link rather than inserting a second one
      // (SPINE_MODEL.md "Move / reparent"), so exactly one active link, and
      // exactly one counted contribution, must remain.
      const s = spine(WS);
      const area = await s.createArea({ title: "Area" });
      const goalA = await s.createGoal({ title: "A", areaId: area.id });
      const goalB = await s.createGoal({ title: "B", areaId: area.id });
      const project = await s.createProject({
        title: "P",
        parent: { kind: "goal", id: goalA.id },
      });
      await s.move(project.id, { kind: "goal", id: goalB.id });
      await s.move(project.id, { kind: "goal", id: goalA.id });

      const linkRows = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM entity_links
         WHERE workspace_id = ? AND source_entity_id = ? AND target_entity_id = ?
               AND type = 'project.advances_goal' AND deleted_at IS NULL`,
      )
        .bind(WS, project.id, goalA.id)
        .first<{ n: number }>();
      expect(linkRows?.n).toBe(1);

      const contribution = await makeGoalRepository(
        makeContext(WS),
      ).getGoalProjectContribution(goalA.id);
      expect(contribution.total).toBe(1);
    });

    it("issues a fixed, small number of queries regardless of linked-Project count (no N+1)", async () => {
      const s = spine(WS);
      const area = await s.createArea({ title: "Area" });
      const goal = await s.createGoal({ title: "Goal", areaId: area.id });
      for (let i = 0; i < 25; i++) {
        await s.createProject({
          title: `P${i}`,
          parent: { kind: "goal", id: goal.id },
        });
      }
      const counting = countingDb(env.DB);
      const countingRepo = createGoalRepository(counting.db, makeContext(WS));
      counting.reset();
      const contribution = await countingRepo.getGoalProjectContribution(
        goal.id,
      );
      expect(contribution.total).toBe(25);
      expect(counting.prepareCount()).toBeLessThanOrEqual(2);
    });
  });

  describe("listGoalProjects", () => {
    it("returns a bounded, deterministic keyset page including task counts", async () => {
      const s = spine(WS);
      const area = await s.createArea({ title: "Area" });
      const goal = await s.createGoal({ title: "Goal", areaId: area.id });
      const project = await s.createProject({
        title: "P",
        parent: { kind: "goal", id: goal.id },
      });
      const task = await s.createTask({
        title: "T",
        parent: { kind: "project", id: project.id },
      });
      await s.complete(task.id);

      const page = await makeGoalRepository(makeContext(WS)).listGoalProjects({
        goalId: goal.id,
      });
      expect(page.items).toHaveLength(1);
      expect(page.items[0]).toMatchObject({
        id: project.id,
        taskTotal: 1,
        taskCompleted: 1,
      });
      expect(page.nextCursor).toBeNull();
    });

    it("paginates deterministically and rejects a cursor from another Goal", async () => {
      const s = spine(WS);
      const area = await s.createArea({ title: "Area" });
      const goalA = await s.createGoal({ title: "A", areaId: area.id });
      const goalB = await s.createGoal({ title: "B", areaId: area.id });
      await s.createProject({
        title: "P1",
        parent: { kind: "goal", id: goalA.id },
      });
      await s.createProject({
        title: "P2",
        parent: { kind: "goal", id: goalA.id },
      });

      const repo = makeGoalRepository(makeContext(WS));
      const first = await repo.listGoalProjects({ goalId: goalA.id, limit: 1 });
      expect(first.items).toHaveLength(1);
      expect(first.nextCursor).toBeTruthy();
      const second = await repo.listGoalProjects({
        goalId: goalA.id,
        limit: 1,
        cursor: first.nextCursor!,
      });
      expect(second.items).toHaveLength(1);
      expect(second.items[0]!.id).not.toBe(first.items[0]!.id);
      expect(second.nextCursor).toBeNull();

      await expect(
        repo.listGoalProjects({ goalId: goalB.id, cursor: first.nextCursor! }),
      ).rejects.toBeInstanceOf(InvalidSpineCursorError);
    });
  });

  it("area-project counts remain workspace isolated across a shared id namespace", async () => {
    const own = spine(WS);
    const other = spine(OTHER, "other");
    const ownArea = await own.createArea({ title: "Own" });
    const ownGoal = await own.createGoal({
      title: "Own goal",
      areaId: ownArea.id,
    });
    const otherArea = await other.createArea({ title: "Other" });
    await other.createGoal({ title: "Other goal", areaId: otherArea.id });

    const repo = makeAreaRepository(makeContext(WS));
    const goals = await repo.listAreaGoals({ areaId: ownArea.id });
    expect(goals.items.map((g) => g.id)).toEqual([ownGoal.id]);
  });
});
