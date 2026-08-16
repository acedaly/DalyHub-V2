/**
 * TASKS-01 — real Workers/D1 integration tests for the workspace-wide Tasks read
 * model, the additive planning fields, and the bulk field mutations (ADR-043).
 * Runs against a local D1 with the committed migrations (incl. 0012) applied.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";

import {
  InvalidSpineCursorError,
  SpineParentUnavailableError,
} from "~/kernel/spine";
import { TaskNotFoundError, TaskStorageError } from "~/kernel/tasks";
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
    const inbox = await repo.createTask({ title: "inbox task" });
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
    expect(inboxIds).not.toContain(seeded.thisWeek.id); // it is assigned

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

/* -------------------------------------------------------------------------- */
/* Atomic create — identity + planning slice in ONE batch (ADR-043 §13)         */
/* -------------------------------------------------------------------------- */

describe("createTask (atomic identity + planning)", () => {
  async function countTasks(ws: string): Promise<number> {
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM entities WHERE workspace_id = ? AND type = 'task'",
    )
      .bind(ws)
      .first<{ n: number }>();
    return row?.n ?? 0;
  }

  it("creates a task and its planning fields in one operation", async () => {
    const { project } = await seedProject(WS);
    const repo = taskRepo(WS);
    const task = await repo.createTask({
      title: "Draft the brief",
      parent: { kind: "project", id: project.id },
      priority: "p1",
      timeSector: "this_week",
      dueDate: "2026-08-01",
    });
    expect(task.title).toBe("Draft the brief");
    expect(task.priority).toBe("p1");
    expect(task.timeSector).toBe("this_week");
    expect(task.dueDate).toBe("2026-08-01");
    expect(task.project?.id).toBe(project.id);
    // Read back independently to prove it committed.
    const read = await repo.getTask(task.id);
    expect(read?.priority).toBe("p1");
  });

  it("creates a bare task with no task_details row when no planning is given", async () => {
    const { project } = await seedProject(WS);
    const repo = taskRepo(WS);
    const task = await repo.createTask({
      title: "Bare task",
      parent: { kind: "project", id: project.id },
    });
    expect(task.priority).toBeNull();
    expect(task.commitmentState).toBe("active");
    const details = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM task_details WHERE workspace_id = ? AND entity_id = ?",
    )
      .bind(WS, task.id)
      .first<{ n: number }>();
    expect(details?.n).toBe(0);
  });

  it("creates an intentional unassigned task with no structural parent", async () => {
    const repo = taskRepo(WS);
    const task = await repo.createTask({ title: "Inbox capture" });

    expect(task.title).toBe("Inbox capture");
    expect(task.project).toBeNull();
    expect(task.area).toBeNull();

    const links = await env.DB.prepare(
      `SELECT COUNT(*) AS n
       FROM entity_links
       WHERE workspace_id = ?
         AND source_entity_id = ?
         AND deleted_at IS NULL
         AND type IN ('task.belongs_to_area', 'task.belongs_to_project')`,
    )
      .bind(WS, task.id)
      .first<{ n: number }>();
    expect(links?.n).toBe(0);
  });

  it("treats Inbox as active unassigned tasks, independent of planning fields", async () => {
    const { project } = await seedProject(WS);
    const repo = taskRepo(WS);
    const inbox = await repo.createTask({
      title: "Scheduled unassigned",
      priority: "p1",
      timeSector: "this_week",
      scheduledDate: "2026-08-01",
      dueDate: "2026-08-03",
    });
    await repo.createTask({
      title: "Assigned no-sector",
      parent: { kind: "project", id: project.id },
    });

    const page = await repo.listWorkspaceTasks({
      view: "inbox",
      todayIso: "2026-07-30",
    });

    expect(page.items.map((item) => item.id)).toContain(inbox.id);
    expect(page.items.some((item) => item.title === "Assigned no-sector")).toBe(
      false,
    );
  });

  it("assigns, changes and clears a task parent through the TaskRepository", async () => {
    const { area, project } = await seedProject(WS);
    const repo = taskRepo(WS);
    const task = await repo.createTask({
      title: "Move me",
      priority: "p2",
      scheduledDate: "2026-08-02",
    });

    const assigned = await repo.setTaskParent(task.id, {
      kind: "area",
      id: area.id,
    });
    expect(assigned.changed).toBe(true);
    expect(assigned.task.area?.id).toBe(area.id);
    expect(assigned.task.priority).toBe("p2");
    expect(assigned.task.scheduledDate).toBe("2026-08-02");

    const moved = await repo.setTaskParent(task.id, {
      kind: "project",
      id: project.id,
    });
    expect(moved.task.project?.id).toBe(project.id);
    expect(moved.task.area?.id).toBe(area.id);

    const cleared = await repo.setTaskParent(task.id, null);
    expect(cleared.task.project).toBeNull();
    expect(cleared.task.area).toBeNull();

    const again = await repo.setTaskParent(task.id, null);
    expect(again.changed).toBe(false);
  });

  it("rejects a missing parent and creates nothing", async () => {
    const before = await countTasks(WS);
    await expect(
      taskRepo(WS).createTask({
        title: "Orphan",
        parent: { kind: "project", id: "does-not-exist" },
      }),
    ).rejects.toBeInstanceOf(SpineParentUnavailableError);
    expect(await countTasks(WS)).toBe(before);
  });

  it("rejects a cross-workspace parent and creates nothing", async () => {
    const { project } = await seedProject(OTHER);
    const before = await countTasks(WS);
    await expect(
      taskRepo(WS).createTask({
        title: "Cross",
        parent: { kind: "project", id: project.id },
      }),
    ).rejects.toBeInstanceOf(SpineParentUnavailableError);
    expect(await countTasks(WS)).toBe(before);
  });

  it("rolls the WHOLE create back on a mid-batch fault — no entity/details/Activity", async () => {
    const { project } = await seedProject(WS);
    const before = await countTasks(WS);
    const activitiesBefore = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM activities WHERE workspace_id = ? AND type = 'entity.created'",
    )
      .bind(WS)
      .first<{ n: number }>();
    await expect(
      taskRepo(WS, { createTaskFault: true }).createTask({
        title: "Doomed",
        parent: { kind: "project", id: project.id },
        priority: "p1",
      }),
    ).rejects.toBeInstanceOf(TaskStorageError);
    // Nothing committed: no new task entity, no task_details, no create Activity.
    expect(await countTasks(WS)).toBe(before);
    const activitiesAfter = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM activities WHERE workspace_id = ? AND type = 'entity.created'",
    )
      .bind(WS)
      .first<{ n: number }>();
    expect(activitiesAfter?.n).toBe(activitiesBefore?.n ?? 0);
    const details = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM task_details WHERE workspace_id = ?",
    )
      .bind(WS)
      .first<{ n: number }>();
    expect(details?.n).toBe(0);

    // And a normal create still works afterwards (no corruption).
    const ok = await taskRepo(WS).createTask({
      title: "Recovered",
      parent: { kind: "project", id: project.id },
    });
    expect(ok.title).toBe("Recovered");
  });
});

/* -------------------------------------------------------------------------- */
/* Fix 1 — the ACTIVE planning scope (Matrix/Sectors)                          */
/* -------------------------------------------------------------------------- */

describe("active planning scope excludes parked/blocked work", () => {
  it("excludes waiting and on_hold as well as completed/cancelled/someday", async () => {
    const { project } = await seedProject(WS);
    const spine = spineRepo(WS);
    const repo = taskRepo(WS);
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
    const plain = await mk("plain active", { priority: "p1" });
    const onHold = await mk("on hold", { status: "on_hold", priority: "p1" });
    const someday = await mk("someday", { commitmentState: "someday" });
    const cancelled = await mk("cancelled", { status: "cancelled" });
    const waiting = await mk("waiting", { priority: "p2" });
    await repo.setWaiting(waiting.id, {
      target: { kind: "text", note: "finance" },
    });
    const completed = await mk("done", { priority: "p1" });
    await repo.completeTask(completed.id);

    const active = await repo.listWorkspaceTasks({
      view: "active",
      todayIso: TODAY,
    });
    const ids = active.items.map((i) => i.id);
    expect(ids).toEqual([plain.id]);
    expect(ids).not.toContain(onHold.id);
    expect(ids).not.toContain(waiting.id);
    expect(ids).not.toContain(someday.id);
    expect(ids).not.toContain(cancelled.id);
    expect(ids).not.toContain(completed.id);
  });
});

/* -------------------------------------------------------------------------- */
/* Fix 2 — smart sort is overdue-first against the owner's calendar day        */
/* -------------------------------------------------------------------------- */

describe("smart sort — overdue-first", () => {
  const YESTERDAY = "2026-07-24";
  const TOMORROW = "2026-07-26";

  async function mk(
    ws: string,
    project: string,
    title: string,
    patch: Parameters<ReturnType<typeof taskRepo>["updateTask"]>[1],
  ) {
    const t = await spineRepo(ws).createTask({
      title,
      parent: { kind: "project", id: project },
    });
    if (Object.keys(patch).length > 0)
      await taskRepo(ws).updateTask(t.id, patch);
    return t;
  }

  it("ranks an overdue P4 ahead of a non-overdue P1", async () => {
    const { project } = await seedProject(WS);
    const overdueP4 = await mk(WS, project.id, "overdue p4", {
      priority: "p4",
      dueDate: YESTERDAY,
    });
    const futureP1 = await mk(WS, project.id, "future p1", {
      priority: "p1",
      dueDate: TOMORROW,
    });
    const page = await taskRepo(WS).listWorkspaceTasks({
      view: "all",
      sort: "smart",
      todayIso: TODAY,
    });
    expect(page.items.map((i) => i.id)).toEqual([overdueP4.id, futureP1.id]);
  });

  it("orders multiple overdue tasks by priority then due date, before non-overdue", async () => {
    const { project } = await seedProject(WS);
    const overdueP2 = await mk(WS, project.id, "overdue p2", {
      priority: "p2",
      dueDate: YESTERDAY,
    });
    const overdueP1Older = await mk(WS, project.id, "overdue p1 older", {
      priority: "p1",
      dueDate: "2026-07-20",
    });
    const dueTodayP1 = await mk(WS, project.id, "due today p1", {
      priority: "p1",
      dueDate: TODAY,
    });
    const noDueP1 = await mk(WS, project.id, "no due p1", { priority: "p1" });
    const order = (
      await taskRepo(WS).listWorkspaceTasks({
        view: "all",
        sort: "smart",
        todayIso: TODAY,
      })
    ).items.map((i) => i.id);
    // Overdue band first (P1 older before P2), then the non-overdue band by
    // priority then due date (due-today P1 is NOT overdue; no-due P1 sorts last).
    expect(order).toEqual([
      overdueP1Older.id,
      overdueP2.id,
      dueTodayP1.id,
      noDueP1.id,
    ]);
  });

  it("paginates with no gaps/duplicates across the overdue/non-overdue boundary", async () => {
    const { project } = await seedProject(WS);
    // 3 overdue + 3 non-overdue, mixed priorities.
    for (const [i, due] of [
      YESTERDAY,
      "2026-07-23",
      "2026-07-22",
      TOMORROW,
      "2026-07-27",
      null,
    ].entries()) {
      await mk(WS, project.id, `t${i}`, {
        priority: i % 2 === 0 ? "p1" : "p3",
        ...(due ? { dueDate: due } : {}),
      });
    }
    const repo = taskRepo(WS);
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 10; guard++) {
      const page = await repo.listWorkspaceTasks({
        view: "all",
        sort: "smart",
        limit: 2,
        todayIso: TODAY,
        cursor,
      });
      seen.push(...page.items.map((i) => i.id));
      if (page.nextCursor === null) break;
      cursor = page.nextCursor;
    }
    expect(seen).toHaveLength(6);
    expect(new Set(seen).size).toBe(6);
  });

  it("rejects a smart-sort cursor when the owner day changes", async () => {
    const { project } = await seedProject(WS);
    for (let i = 0; i < 4; i++) {
      await mk(WS, project.id, `d${i}`, {
        priority: "p2",
        dueDate: YESTERDAY,
      });
    }
    const repo = taskRepo(WS);
    const first = await repo.listWorkspaceTasks({
      view: "all",
      sort: "smart",
      limit: 2,
      todayIso: TODAY,
    });
    expect(first.nextCursor).not.toBeNull();
    await expect(
      repo.listWorkspaceTasks({
        view: "all",
        sort: "smart",
        limit: 2,
        todayIso: TOMORROW,
        cursor: first.nextCursor!,
      }),
    ).rejects.toBeInstanceOf(InvalidSpineCursorError);
  });
});

/* -------------------------------------------------------------------------- */
/* Fix 4 — server-authoritative Matrix/Sectors grouping + counts               */
/* -------------------------------------------------------------------------- */

describe("listWorkspaceTaskGroups", () => {
  async function mk(
    ws: string,
    project: string,
    title: string,
    patch: Parameters<ReturnType<typeof taskRepo>["updateTask"]>[1],
  ) {
    const t = await spineRepo(ws).createTask({
      title,
      parent: { kind: "project", id: project },
    });
    if (Object.keys(patch).length > 0)
      await taskRepo(ws).updateTask(t.id, patch);
    return t;
  }

  it("groups by priority with authoritative counts, excluding non-active work", async () => {
    const { project } = await seedProject(WS);
    const repo = taskRepo(WS);
    await mk(WS, project.id, "a1", { priority: "p1" });
    await mk(WS, project.id, "a2", { priority: "p1" });
    await mk(WS, project.id, "b1", { priority: "p2" });
    await mk(WS, project.id, "u1", {}); // stored `null` — Priority 4
    // Excluded from the active planning scope:
    const done = await mk(WS, project.id, "done p1", { priority: "p1" });
    await repo.completeTask(done.id);
    await mk(WS, project.id, "someday p1", {
      priority: "p1",
      commitmentState: "someday",
    });
    const waiting = await mk(WS, project.id, "waiting p1", { priority: "p1" });
    await repo.setWaiting(waiting.id, { target: { kind: "text", note: "x" } });

    const grouping = await repo.listWorkspaceTaskGroups({
      dimension: "priority",
      todayIso: TODAY,
    });
    expect(grouping.dimension).toBe("priority");
    const byKey = new Map(grouping.groups.map((g) => [g.key, g]));
    expect(byKey.get("p1")?.count).toBe(2);
    expect(byKey.get("p2")?.count).toBe(1);
    /*
     * CONTROL-01 — a task stored `null` groups into P4, not into a fifth
     * `untriaged` bucket.
     *
     * `null` IS Priority 4 in the product's settled priority contract, and the
     * rows have drawn a grey P4 flag on those tasks for some time. The grouping
     * disagreed: it produced a separate "No priority" section holding tasks
     * every row inside it labelled P4 — two headings for one state, and the one
     * the product has no name for was usually the larger.
     */
    expect(byKey.get("p4")?.count).toBe(1);
    expect(byKey.get("untriaged")).toBeUndefined();
    expect(byKey.get("p3")).toBeUndefined(); // empty bucket → not returned
  });

  it("reports the true count and hasMore when a bucket exceeds bucketLimit", async () => {
    const { project } = await seedProject(WS);
    const repo = taskRepo(WS);
    for (let i = 0; i < 3; i++) {
      await mk(WS, project.id, `p1-${i}`, { priority: "p1" });
    }
    const grouping = await repo.listWorkspaceTaskGroups({
      dimension: "priority",
      bucketLimit: 1,
      todayIso: TODAY,
    });
    const p1 = grouping.groups.find((g) => g.key === "p1");
    expect(p1?.count).toBe(3); // authoritative — independent of the loaded slice
    expect(p1?.items).toHaveLength(1); // bounded slice
    expect(p1?.hasMore).toBe(true);
  });

  it("groups by sector with null → no sector", async () => {
    const { project } = await seedProject(WS);
    const repo = taskRepo(WS);
    await mk(WS, project.id, "wk1", { timeSector: "this_week" });
    await mk(WS, project.id, "wk2", { timeSector: "this_week" });
    await mk(WS, project.id, "ib1", {}); // no sector
    const grouping = await repo.listWorkspaceTaskGroups({
      dimension: "sector",
      todayIso: TODAY,
    });
    const byKey = new Map(grouping.groups.map((g) => [g.key, g]));
    expect(byKey.get("this_week")?.count).toBe(2);
    expect(byKey.get("__none")?.count).toBe(1);
  });

  it("sorts within a bucket smart (overdue-first)", async () => {
    const { project } = await seedProject(WS);
    const repo = taskRepo(WS);
    const future = await mk(WS, project.id, "p1 future", {
      priority: "p1",
      dueDate: "2026-08-01",
    });
    const overdue = await mk(WS, project.id, "p1 overdue", {
      priority: "p1",
      dueDate: "2026-07-01",
    });
    const grouping = await repo.listWorkspaceTaskGroups({
      dimension: "priority",
      todayIso: TODAY,
    });
    const p1 = grouping.groups.find((g) => g.key === "p1");
    expect(p1?.items.map((i) => i.id)).toEqual([overdue.id, future.id]);
  });

  it("isolates workspaces", async () => {
    const { project } = await seedProject(WS);
    await mk(WS, project.id, "x", { priority: "p1" });
    const other = taskRepo(OTHER);
    const grouping = await other.listWorkspaceTaskGroups({
      dimension: "priority",
      todayIso: TODAY,
    });
    expect(grouping.groups).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Fix 3 — bounded, indexed task-parent search over the WHOLE collection       */
/* -------------------------------------------------------------------------- */

describe("searchTaskParents", () => {
  /** Bulk-insert `n` filler task entities with EARLIER created_at than the target. */
  async function seedFiller(ws: string, n: number) {
    await env.DB.prepare(
      `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at)
       WITH RECURSIVE seq(k) AS (
         SELECT 1 UNION ALL SELECT k + 1 FROM seq WHERE k < ?
       )
       SELECT 'filler-' || ? || '-' || k, ?, 'task', 'Filler ' || k,
              '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
       FROM seq`,
    )
      .bind(n, ws, ws)
      .run();
  }

  it("finds an Area/Project created beyond the first 500 entities", async () => {
    await seedFiller(WS, 600);
    const spine = spineRepo(WS);
    const area = await spine.createArea({ title: "Findme Area" });
    const project = await spine.createProject({
      title: "Findme Project",
      parent: { kind: "area", id: area.id },
    });
    const results = await taskRepo(WS).searchTaskParents({ query: "Findme" });
    const ids = results.map((r) => r.id);
    expect(ids).toContain(area.id);
    expect(ids).toContain(project.id);
    // Projects rank before Areas.
    expect(ids).toEqual([project.id, area.id]);
  });

  it("excludes non-parent entity types and archived projects", async () => {
    const spine = spineRepo(WS);
    const area = await spine.createArea({ title: "Zeta Area" });
    const project = await spine.createProject({
      title: "Zeta Project",
      parent: { kind: "area", id: area.id },
    });
    await spine.createTask({
      title: "Zeta Task",
      parent: { kind: "project", id: project.id },
    });
    // Archive the project directly (PROJ-05): it must drop out of parent options.
    await env.DB.prepare(
      `INSERT INTO project_details (workspace_id, entity_id, archived_at, updated_at)
       VALUES (?, ?, '2026-07-20T00:00:00.000Z', '2026-07-20T00:00:00.000Z')`,
    )
      .bind(WS, project.id)
      .run();
    const results = await taskRepo(WS).searchTaskParents({ query: "Zeta" });
    const ids = results.map((r) => r.id);
    expect(ids).toEqual([area.id]); // task excluded (type), project excluded (archived)
    expect(results[0]?.kind).toBe("area");
  });

  it("excludes cross-workspace parents", async () => {
    await spineRepo(OTHER).createArea({ title: "Secret Area" });
    const results = await taskRepo(WS).searchTaskParents({ query: "Secret" });
    expect(results).toHaveLength(0);
  });

  it("bounds results and orders deterministically (empty query → first page)", async () => {
    const spine = spineRepo(WS);
    await spine.createArea({ title: "Alpha Area" });
    await spine.createArea({ title: "Bravo Area" });
    const results = await taskRepo(WS).searchTaskParents({
      query: "",
      limit: 1,
    });
    expect(results).toHaveLength(1);
  });
});
