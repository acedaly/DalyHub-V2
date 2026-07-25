/**
 * TASKS-01 — real Workers/D1 integration tests for the workspace-wide Tasks read
 * model, the additive planning fields, and the bulk field mutations (ADR-043).
 * Runs against a local D1 with the committed migrations (incl. 0012) applied.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { InvalidSpineCursorError } from "~/kernel/spine";
import { TaskNotFoundError } from "~/kernel/tasks";
import type { D1TaskRepositoryOptions } from "~/platform/storage/d1";
import type { D1SpineRepositoryOptions } from "~/platform/storage/d1";

import {
  FakeClock,
  makeContext,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "ws_tasks01";
const OTHER = "ws_tasks01_other";
const TODAY = "2026-07-25";

const nextEntityId = sequentialIds("ent");
const nextActivityId = sequentialIds("act");

function spineRepo(ws: string, options: D1SpineRepositoryOptions = {}) {
  return makeSpineRepository(makeContext(ws), {
    clock: new FakeClock("2026-07-20T00:00:00.000Z").now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
    ...options,
  });
}

function taskRepo(ws: string, options: D1TaskRepositoryOptions = {}) {
  return makeTaskRepository(makeContext(ws), {
    clock: new FakeClock("2026-07-20T00:00:00.000Z").now,
    activityIdGenerator: nextActivityId,
    ...options,
  });
}

async function seedProject(ws: string) {
  const spine = spineRepo(ws);
  const area = await spine.createArea({ title: "Work" });
  const project = await spine.createProject({
    title: "Ship V2",
    parent: { kind: "area", id: area.id },
  });
  return { area, project };
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("additive planning fields (updateTask)", () => {
  it("persists time sector, commitment state and delegation", async () => {
    const { project } = await seedProject(WS);
    const spine = spineRepo(WS);
    const task = await spine.createTask({
      title: "Draft the plan",
      parent: { kind: "project", id: project.id },
    });
    const repo = taskRepo(WS);

    const updated = await repo.updateTask(task.id, {
      priority: "p1",
      status: "on_hold",
      timeSector: "this_week",
      commitmentState: "someday",
      delegation: {
        to: "Sam Rivera",
        delegatedOn: "2026-07-24",
        followUpOn: "2026-07-30",
        note: "expects the deck",
      },
    });
    expect(updated.changed).toBe(true);

    const read = await repo.getTask(task.id);
    expect(read?.priority).toBe("p1");
    expect(read?.status).toBe("on_hold");
    expect(read?.timeSector).toBe("this_week");
    expect(read?.commitmentState).toBe("someday");
    expect(read?.delegation?.to).toBe("Sam Rivera");
    expect(read?.delegation?.followUpOn).toBe("2026-07-30");
  });

  it("is an idempotent no-op when nothing changes", async () => {
    const { project } = await seedProject(WS);
    const task = await spineRepo(WS).createTask({
      title: "T",
      parent: { kind: "project", id: project.id },
    });
    const repo = taskRepo(WS);
    await repo.updateTask(task.id, { timeSector: "next_week" });
    const again = await repo.updateTask(task.id, { timeSector: "next_week" });
    expect(again.changed).toBe(false);
  });

  it("clears delegation with null", async () => {
    const { project } = await seedProject(WS);
    const task = await spineRepo(WS).createTask({
      title: "T",
      parent: { kind: "project", id: project.id },
    });
    const repo = taskRepo(WS);
    await repo.updateTask(task.id, { delegation: { to: "Kim" } });
    await repo.updateTask(task.id, { delegation: null });
    expect((await repo.getTask(task.id))?.delegation).toBeNull();
  });
});

describe("listWorkspaceTasks system views", () => {
  async function seedMany(ws: string) {
    const spine = spineRepo(ws);
    const area = await spine.createArea({ title: "A" });
    const project = await spine.createProject({
      title: "P",
      parent: { kind: "area", id: area.id },
    });
    const repo = taskRepo(ws);
    const mk = async (
      title: string,
      patch: Parameters<typeof repo.updateTask>[1],
    ) => {
      const t = await spine.createTask({
        title,
        parent: { kind: "project", id: project.id },
      });
      if (Object.keys(patch).length > 0) await repo.updateTask(t.id, patch);
      return t;
    };
    const inbox = await mk("inbox task", {});
    const thisWeek = await mk("week task", {
      timeSector: "this_week",
      priority: "p1",
    });
    const someday = await mk("someday task", { commitmentState: "someday" });
    const cancelled = await mk("cancelled task", { status: "cancelled" });
    const scheduledToday = await mk("today task", { scheduledDate: TODAY });
    return { project, inbox, thisWeek, someday, cancelled, scheduledToday };
  }

  it("excludes someday and cancelled from inbox/this_week", async () => {
    const seeded = await seedMany(WS);
    const repo = taskRepo(WS);
    const inbox = await repo.listWorkspaceTasks({
      view: "inbox",
      todayIso: TODAY,
    });
    const inboxIds = inbox.items.map((i) => i.id);
    expect(inboxIds).toContain(seeded.inbox.id);
    expect(inboxIds).not.toContain(seeded.someday.id);
    expect(inboxIds).not.toContain(seeded.cancelled.id);
    expect(inboxIds).not.toContain(seeded.thisWeek.id); // it has a sector

    const week = await repo.listWorkspaceTasks({
      view: "this_week",
      todayIso: TODAY,
    });
    expect(week.items.map((i) => i.id)).toEqual([seeded.thisWeek.id]);
  });

  it("someday, cancelled and today views select their own state", async () => {
    const seeded = await seedMany(WS);
    const repo = taskRepo(WS);
    expect(
      (
        await repo.listWorkspaceTasks({ view: "someday", todayIso: TODAY })
      ).items.map((i) => i.id),
    ).toEqual([seeded.someday.id]);
    expect(
      (
        await repo.listWorkspaceTasks({ view: "cancelled", todayIso: TODAY })
      ).items.map((i) => i.id),
    ).toEqual([seeded.cancelled.id]);
    expect(
      (
        await repo.listWorkspaceTasks({ view: "today", todayIso: TODAY })
      ).items.map((i) => i.id),
    ).toEqual([seeded.scheduledToday.id]);
  });

  it("all returns every non-deleted task", async () => {
    await seedMany(WS);
    const repo = taskRepo(WS);
    const all = await repo.listWorkspaceTasks({ view: "all", todayIso: TODAY });
    expect(all.items).toHaveLength(5);
  });

  it("active excludes completed, cancelled and someday (the Matrix/Sectors scope)", async () => {
    const seeded = await seedMany(WS);
    const repo = taskRepo(WS);
    const active = await repo.listWorkspaceTasks({
      view: "active",
      todayIso: TODAY,
    });
    const ids = active.items.map((i) => i.id);
    expect(ids).toContain(seeded.inbox.id);
    expect(ids).toContain(seeded.thisWeek.id);
    expect(ids).toContain(seeded.scheduledToday.id);
    expect(ids).not.toContain(seeded.someday.id);
    expect(ids).not.toContain(seeded.cancelled.id);
    expect(active.items).toHaveLength(3);
  });

  it("filters by priority", async () => {
    const seeded = await seedMany(WS);
    const repo = taskRepo(WS);
    const p1 = await repo.listWorkspaceTasks({
      view: "all",
      filters: { priority: "p1" },
      todayIso: TODAY,
    });
    expect(p1.items.map((i) => i.id)).toEqual([seeded.thisWeek.id]);
  });

  it("isolates workspaces", async () => {
    await seedMany(WS);
    const other = taskRepo(OTHER);
    const page = await other.listWorkspaceTasks({
      view: "all",
      todayIso: TODAY,
    });
    expect(page.items).toHaveLength(0);
  });
});

describe("listWorkspaceTasks pagination + cursor", () => {
  it("paginates deterministically with no gaps or duplicates", async () => {
    const { project } = await seedProject(WS);
    const spine = spineRepo(WS);
    for (let i = 0; i < 7; i++) {
      await spine.createTask({
        title: `task ${i}`,
        parent: { kind: "project", id: project.id },
      });
    }
    const repo = taskRepo(WS);
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 10; guard++) {
      const page = await repo.listWorkspaceTasks({
        view: "all",
        sort: "created",
        limit: 3,
        todayIso: TODAY,
        cursor,
      });
      seen.push(...page.items.map((i) => i.id));
      if (page.nextCursor === null) break;
      cursor = page.nextCursor;
    }
    expect(seen).toHaveLength(7);
    expect(new Set(seen).size).toBe(7);
  });

  it("rejects a cursor reused under a different view", async () => {
    const { project } = await seedProject(WS);
    const spine = spineRepo(WS);
    for (let i = 0; i < 4; i++) {
      await spine.createTask({
        title: `t${i}`,
        parent: { kind: "project", id: project.id },
      });
    }
    const repo = taskRepo(WS);
    const first = await repo.listWorkspaceTasks({
      view: "all",
      limit: 2,
      todayIso: TODAY,
    });
    expect(first.nextCursor).not.toBeNull();
    await expect(
      repo.listWorkspaceTasks({
        view: "inbox",
        limit: 2,
        todayIso: TODAY,
        cursor: first.nextCursor!,
      }),
    ).rejects.toBeInstanceOf(InvalidSpineCursorError);
  });
});

describe("bulk field mutations", () => {
  async function seedThree(ws: string) {
    const { project } = await seedProject(ws);
    const spine = spineRepo(ws);
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const t = await spine.createTask({
        title: `b${i}`,
        parent: { kind: "project", id: project.id },
      });
      ids.push(t.id);
    }
    return ids;
  }

  it("sets priority on many and counts no-ops honestly", async () => {
    const ids = await seedThree(WS);
    const repo = taskRepo(WS);
    await repo.updateTask(ids[0]!, { priority: "p1" });
    const result = await repo.setPriorityMany(ids, "p1");
    expect(result.changed).toBe(2);
    expect(result.unchanged).toBe(1);
    for (const id of ids) {
      expect((await repo.getTask(id))?.priority).toBe("p1");
    }
  });

  it("sets sector, commitment and status in bulk", async () => {
    const ids = await seedThree(WS);
    const repo = taskRepo(WS);
    expect((await repo.setSectorMany(ids, "next_week")).changed).toBe(3);
    expect((await repo.setCommitmentMany(ids, "someday")).changed).toBe(3);
    expect((await repo.setStatusMany(ids, "on_hold")).changed).toBe(3);
    const t = await repo.getTask(ids[0]!);
    expect(t?.timeSector).toBe("next_week");
    expect(t?.commitmentState).toBe("someday");
    expect(t?.status).toBe("on_hold");
  });

  it("rejects the whole operation for a cross-workspace id (atomic)", async () => {
    const ids = await seedThree(WS);
    const otherIds = await seedThree(OTHER);
    const repo = taskRepo(WS);
    await expect(
      repo.setPriorityMany([...ids, otherIds[0]!], "p2"),
    ).rejects.toBeInstanceOf(TaskNotFoundError);
    // Nothing applied.
    for (const id of ids) {
      expect((await repo.getTask(id))?.priority).toBeNull();
    }
  });
});
