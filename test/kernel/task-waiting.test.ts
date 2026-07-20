/**
 * TODAY-03 Waiting — real Workers/D1 integration tests for the TaskRepository's
 * waiting workflow (ADR-029). Covers kernel/validation semantics, the atomic
 * `task.waiting_on` link + Activity writes, reads/degradation, the bounded
 * deterministic Waiting list, workspace isolation, and no-op/rejection safety.
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  TASK_WAITING_CHANGED,
  TASK_WAITING_CLEARED,
  TASK_WAITING_STARTED,
  TaskNotFoundError,
  TaskValidationError,
  WAITING_NOTE_MAX_LENGTH,
  type TaskView,
} from "~/kernel/tasks";

import {
  FakeClock,
  countActivities,
  countActivitiesOfType,
  makeContext,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  seedEntity,
  sequentialIds,
} from "./support";
import { env } from "cloudflare:test";

const WS = "ws_task_waiting";
const OTHER = "ws_task_waiting_other";

const nextEntityId = sequentialIds("ent");
const nextActivityId = sequentialIds("act");

function spineRepo(ws: string, clock = new FakeClock().now) {
  return makeSpineRepository(makeContext(ws), {
    clock,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

function taskRepo(
  ws: string,
  clock = new FakeClock("2026-07-20T00:00:00.000Z").now,
) {
  return makeTaskRepository(makeContext(ws), {
    clock,
    activityIdGenerator: nextActivityId,
  });
}

/** Seed Area → Project → Task and return the ids. */
async function seedTask(ws: string, title = "Prepare supplier agreement") {
  const spine = spineRepo(ws);
  const area = await spine.createArea({ title: "Procurement" });
  const project = await spine.createProject({
    title: "Procurement uplift",
    parent: { kind: "area", id: area.id },
  });
  const task = await spine.createTask({
    title,
    parent: { kind: "project", id: project.id },
  });
  return { area, project, task };
}

/** Count active `task.waiting_on` links for a given source task. */
async function countActiveWaitingLinks(
  ws: string,
  taskId: string,
): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM entity_links
     WHERE workspace_id = ? AND source_entity_id = ?
       AND type = 'task.waiting_on' AND deleted_at IS NULL`,
  )
    .bind(ws, taskId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

async function countWaitingLinkRows(
  ws: string,
  taskId: string,
): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM entity_links
     WHERE workspace_id = ? AND source_entity_id = ? AND type = 'task.waiting_on'`,
  )
    .bind(ws, taskId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("waiting activation", () => {
  it("activates waiting on an entity target and records one started event + one link", async () => {
    const { task } = await seedTask(WS);
    await seedEntity(WS, "person-sarah", {
      type: "person",
      title: "Sarah Chen",
    });
    const tasks = taskRepo(WS);

    const before = await countActivities();
    const result = await tasks.setWaiting(task.id, {
      target: { kind: "entity", targetId: "person-sarah" },
    });

    expect(result.changed).toBe(true);
    expect(result.task.waiting).not.toBeNull();
    expect(result.task.waiting?.subject).toEqual({
      kind: "entity",
      id: "person-sarah",
      type: "person",
      title: "Sarah Chen",
    });
    expect(result.task.waiting?.since).toBeInstanceOf(Date);
    expect(await countActivitiesOfType(TASK_WAITING_STARTED)).toBe(1);
    expect(await countActivities()).toBe(before + 1);
    expect(await countActiveWaitingLinks(WS, task.id)).toBe(1);
  });

  it("activates waiting on a free-text subject with no link", async () => {
    const { task } = await seedTask(WS);
    const tasks = taskRepo(WS);

    const result = await tasks.setWaiting(task.id, {
      target: { kind: "text", note: "finance confirmation" },
    });

    expect(result.task.waiting?.subject).toEqual({
      kind: "text",
      note: "finance confirmation",
    });
    expect(await countActiveWaitingLinks(WS, task.id)).toBe(0);
    expect(await countActivitiesOfType(TASK_WAITING_STARTED)).toBe(1);
  });

  it("records the waiting-since instant from the clock", async () => {
    const { task } = await seedTask(WS);
    const clock = new FakeClock("2026-07-18T02:30:00.000Z").now;
    const tasks = taskRepo(WS, clock);
    const result = await tasks.setWaiting(task.id, {
      target: { kind: "text", note: "parts" },
    });
    expect(result.task.waiting?.since.toISOString()).toBe(
      "2026-07-18T02:30:00.000Z",
    );
  });
});

describe("waiting validation & rejection (no data, no Activity)", () => {
  it("rejects a missing/empty free-text subject", async () => {
    const { task } = await seedTask(WS);
    const tasks = taskRepo(WS);
    const before = await countActivities();
    await expect(
      tasks.setWaiting(task.id, { target: { kind: "text", note: "   " } }),
    ).rejects.toBeInstanceOf(TaskValidationError);
    expect(await countActivities()).toBe(before);
  });

  it("rejects an unknown subject kind", async () => {
    const { task } = await seedTask(WS);
    const tasks = taskRepo(WS);
    await expect(
      // @ts-expect-error deliberately malformed subject
      tasks.setWaiting(task.id, { target: { kind: "nope" } }),
    ).rejects.toBeInstanceOf(TaskValidationError);
  });

  it("rejects a task waiting on itself", async () => {
    const { task } = await seedTask(WS);
    const tasks = taskRepo(WS);
    await expect(
      tasks.setWaiting(task.id, {
        target: { kind: "entity", targetId: task.id },
      }),
    ).rejects.toBeInstanceOf(TaskValidationError);
    expect(await countActiveWaitingLinks(WS, task.id)).toBe(0);
  });

  it("rejects an invalid target type (e.g. a note)", async () => {
    const { task } = await seedTask(WS);
    await seedEntity(WS, "note-1", { type: "note", title: "Some note" });
    const tasks = taskRepo(WS);
    await expect(
      tasks.setWaiting(task.id, {
        target: { kind: "entity", targetId: "note-1" },
      }),
    ).rejects.toBeInstanceOf(TaskValidationError);
  });

  it("rejects a cross-workspace target (indistinguishable from missing)", async () => {
    const { task } = await seedTask(WS);
    await seedEntity(OTHER, "person-x", { type: "person", title: "Elsewhere" });
    const tasks = taskRepo(WS);
    await expect(
      tasks.setWaiting(task.id, {
        target: { kind: "entity", targetId: "person-x" },
      }),
    ).rejects.toBeInstanceOf(TaskValidationError);
  });

  it("rejects a missing task", async () => {
    const tasks = taskRepo(WS);
    await expect(
      tasks.setWaiting("does-not-exist", {
        target: { kind: "text", note: "x" },
      }),
    ).rejects.toBeInstanceOf(TaskNotFoundError);
  });

  it("rejects a soft-deleted task", async () => {
    const { task } = await seedTask(WS);
    await spineRepo(WS).softDelete(task.id);
    const tasks = taskRepo(WS);
    await expect(
      tasks.setWaiting(task.id, { target: { kind: "text", note: "x" } }),
    ).rejects.toBeInstanceOf(TaskNotFoundError);
  });

  it("rejects a non-task anchor (a project id)", async () => {
    const { project } = await seedTask(WS);
    const tasks = taskRepo(WS);
    await expect(
      tasks.setWaiting(project.id, { target: { kind: "text", note: "x" } }),
    ).rejects.toBeInstanceOf(TaskNotFoundError);
  });

  it("trims free text and enforces the maximum length", async () => {
    const { task } = await seedTask(WS);
    const tasks = taskRepo(WS);
    const result = await tasks.setWaiting(task.id, {
      target: { kind: "text", note: "   finance sign-off   " },
    });
    expect(result.task.waiting?.subject).toEqual({
      kind: "text",
      note: "finance sign-off",
    });
    await expect(
      tasks.setWaiting(task.id, {
        target: { kind: "text", note: "x".repeat(WAITING_NOTE_MAX_LENGTH + 1) },
      }),
    ).rejects.toBeInstanceOf(TaskValidationError);
  });
});

describe("changing & clearing", () => {
  it("no-op set-waiting to the same subject appends no duplicate Activity", async () => {
    const { task } = await seedTask(WS);
    const tasks = taskRepo(WS);
    await tasks.setWaiting(task.id, {
      target: { kind: "text", note: "parts" },
    });
    const after = await countActivities();
    const again = await tasks.setWaiting(task.id, {
      target: { kind: "text", note: "parts" },
    });
    expect(again.changed).toBe(false);
    expect(await countActivities()).toBe(after);
    expect(await countActivitiesOfType(TASK_WAITING_STARTED)).toBe(1);
    expect(await countActivitiesOfType(TASK_WAITING_CHANGED)).toBe(0);
  });

  it("changing the target records exactly one changed event and preserves since", async () => {
    const { task } = await seedTask(WS);
    await seedEntity(WS, "person-a", { type: "person", title: "Amy" });
    const clock = new FakeClock("2026-07-18T00:00:00.000Z");
    const tasks = taskRepo(WS, clock.now);

    const start = await tasks.setWaiting(task.id, {
      target: { kind: "entity", targetId: "person-a" },
    });
    const sinceAtStart = start.task.waiting!.since.toISOString();

    clock.advance(3 * 86_400_000); // three days later
    const changed = await tasks.setWaiting(task.id, {
      target: { kind: "text", note: "legal review" },
    });

    expect(changed.changed).toBe(true);
    // Changing only the subject keeps the original since (same episode).
    expect(changed.task.waiting!.since.toISOString()).toBe(sinceAtStart);
    expect(changed.task.waiting!.subject).toEqual({
      kind: "text",
      note: "legal review",
    });
    expect(await countActivitiesOfType(TASK_WAITING_STARTED)).toBe(1);
    expect(await countActivitiesOfType(TASK_WAITING_CHANGED)).toBe(1);
    // The entity link is soft-deleted when switching to free text.
    expect(await countActiveWaitingLinks(WS, task.id)).toBe(0);
  });

  it("replaces the active link with no duplicate active waiting links", async () => {
    const { task } = await seedTask(WS);
    await seedEntity(WS, "person-a", { type: "person", title: "Amy" });
    await seedEntity(WS, "person-b", { type: "person", title: "Bo" });
    const tasks = taskRepo(WS);

    await tasks.setWaiting(task.id, {
      target: { kind: "entity", targetId: "person-a" },
    });
    await tasks.setWaiting(task.id, {
      target: { kind: "entity", targetId: "person-b" },
    });
    // Waiting on A again restores the earlier link rather than minting a new row.
    await tasks.setWaiting(task.id, {
      target: { kind: "entity", targetId: "person-a" },
    });

    expect(await countActiveWaitingLinks(WS, task.id)).toBe(1);
    // Only two distinct relationships ever existed (A and B), each stored once.
    expect(await countWaitingLinkRows(WS, task.id)).toBe(2);
  });

  it("clears waiting, records one cleared event, and unlinks", async () => {
    const { task } = await seedTask(WS);
    await seedEntity(WS, "person-a", { type: "person", title: "Amy" });
    const tasks = taskRepo(WS);
    await tasks.setWaiting(task.id, {
      target: { kind: "entity", targetId: "person-a" },
    });

    const cleared = await tasks.clearWaiting(task.id);
    expect(cleared.changed).toBe(true);
    expect(cleared.task.waiting).toBeNull();
    expect(await countActivitiesOfType(TASK_WAITING_CLEARED)).toBe(1);
    expect(await countActiveWaitingLinks(WS, task.id)).toBe(0);
  });

  it("clearing a task that is not waiting is an idempotent no-op", async () => {
    const { task } = await seedTask(WS);
    const tasks = taskRepo(WS);
    const before = await countActivities();
    const result = await tasks.clearWaiting(task.id);
    expect(result.changed).toBe(false);
    expect(await countActivities()).toBe(before);
    expect(await countActivitiesOfType(TASK_WAITING_CLEARED)).toBe(0);
  });
});

describe("reads & field preservation", () => {
  it("persists waiting across a fresh read", async () => {
    const { task } = await seedTask(WS);
    await seedEntity(WS, "proj-alpha", {
      type: "project",
      title: "Project Alpha",
    });
    await taskRepo(WS).setWaiting(task.id, {
      target: { kind: "entity", targetId: "proj-alpha" },
    });
    const reread = (await taskRepo(WS).getTask(task.id)) as TaskView;
    expect(reread.waiting?.subject).toEqual({
      kind: "entity",
      id: "proj-alpha",
      type: "project",
      title: "Project Alpha",
    });
  });

  it("resolves the entity target's CURRENT title (a rename is reflected)", async () => {
    const { task } = await seedTask(WS);
    await seedEntity(WS, "proj-alpha", {
      type: "project",
      title: "Project Alpha",
    });
    await taskRepo(WS).setWaiting(task.id, {
      target: { kind: "entity", targetId: "proj-alpha" },
    });
    await env.DB.prepare(
      "UPDATE entities SET title = ? WHERE workspace_id = ? AND id = ?",
    )
      .bind("Project Alpha (renamed)", WS, "proj-alpha")
      .run();
    const reread = (await taskRepo(WS).getTask(task.id)) as TaskView;
    expect(
      reread.waiting?.subject.kind === "entity" && reread.waiting.subject.title,
    ).toBe("Project Alpha (renamed)");
  });

  it("degrades gracefully when the entity target is soft-deleted", async () => {
    const { task } = await seedTask(WS);
    await seedEntity(WS, "person-a", { type: "person", title: "Amy" });
    await taskRepo(WS).setWaiting(task.id, {
      target: { kind: "entity", targetId: "person-a" },
    });
    await env.DB.prepare(
      "UPDATE entities SET deleted_at = ? WHERE workspace_id = ? AND id = ?",
    )
      .bind("2026-07-21T00:00:00.000Z", WS, "person-a")
      .run();
    const reread = (await taskRepo(WS).getTask(task.id)) as TaskView;
    // Still waiting, but the subject is an unresolved entity (null fields).
    expect(reread.waiting).not.toBeNull();
    expect(reread.waiting?.subject).toEqual({
      kind: "entity",
      id: null,
      type: null,
      title: null,
    });
  });

  it("preserves independently-updated task fields when setting waiting", async () => {
    const { task } = await seedTask(WS);
    const tasks = taskRepo(WS);
    await tasks.updateTask(task.id, {
      priority: "high",
      dueDate: "2026-08-01",
    });
    await tasks.setWaiting(task.id, {
      target: { kind: "text", note: "parts" },
    });
    const reread = (await tasks.getTask(task.id)) as TaskView;
    expect(reread.priority).toBe("high");
    expect(reread.dueDate).toBe("2026-08-01");
    expect(reread.waiting?.subject).toEqual({ kind: "text", note: "parts" });
  });

  it("updating a different field preserves the waiting state", async () => {
    const { task } = await seedTask(WS);
    const tasks = taskRepo(WS);
    await tasks.setWaiting(task.id, {
      target: { kind: "text", note: "parts" },
    });
    await tasks.updateTask(task.id, { priority: "low" });
    const reread = (await tasks.getTask(task.id)) as TaskView;
    expect(reread.priority).toBe("low");
    expect(reread.waiting?.subject).toEqual({ kind: "text", note: "parts" });
  });
});

describe("the Waiting list", () => {
  it("returns only active, non-completed waiting tasks, deterministically ordered", async () => {
    const spine = spineRepo(WS);
    const area = await spine.createArea({ title: "Ops" });
    const mk = async (title: string) =>
      spine.createTask({ title, parent: { kind: "area", id: area.id } });
    const a = await mk("A overdue early-wait");
    const b = await mk("B overdue late-wait");
    const c = await mk("C not-overdue earliest-wait");
    const d = await mk("D not-overdue latest-wait");

    const clock = new FakeClock("2026-07-01T00:00:00.000Z");
    const tasks = taskRepo(WS, clock.now);
    // Give due dates: A and B overdue relative to 2026-07-20; D future; C none.
    await tasks.updateTask(a.id, { dueDate: "2026-07-15" });
    await tasks.updateTask(b.id, { dueDate: "2026-07-10" });
    await tasks.updateTask(d.id, { dueDate: "2026-07-25" });

    // Waiting-since order: C first (earliest), then A, then B, then D.
    await tasks.setWaiting(c.id, { target: { kind: "text", note: "c" } });
    clock.advance(86_400_000);
    await tasks.setWaiting(a.id, { target: { kind: "text", note: "a" } });
    clock.advance(86_400_000);
    await tasks.setWaiting(b.id, { target: { kind: "text", note: "b" } });
    clock.advance(86_400_000);
    await tasks.setWaiting(d.id, { target: { kind: "text", note: "d" } });

    const page = await tasks.listWaitingTasks({ todayIso: "2026-07-20" });
    // Overdue first (A then B by waiting-since), then non-overdue by waiting-since
    // (C then D).
    expect(page.items.map((i) => i.id)).toEqual([a.id, b.id, c.id, d.id]);
    expect(page.items.every((i) => i.waiting !== null)).toBe(true);
  });

  it("excludes completed tasks and returns them to normal reads", async () => {
    const { task } = await seedTask(WS);
    const tasks = taskRepo(WS);
    await tasks.setWaiting(task.id, { target: { kind: "text", note: "x" } });
    expect((await tasks.listWaitingTasks()).items).toHaveLength(1);

    // Completing removes it from the Waiting list (the route also clears waiting).
    await spineRepo(WS).complete(task.id);
    expect((await tasks.listWaitingTasks()).items).toHaveLength(0);
  });

  it("excludeWaiting hides waiting tasks from the normal task list", async () => {
    const { task } = await seedTask(WS);
    const tasks = taskRepo(WS);
    expect(
      (await tasks.listTasks({ excludeWaiting: true })).items,
    ).toHaveLength(1);
    await tasks.setWaiting(task.id, { target: { kind: "text", note: "x" } });
    expect(
      (await tasks.listTasks({ excludeWaiting: true })).items,
    ).toHaveLength(0);
    // Without the flag it still appears.
    expect((await tasks.listTasks()).items).toHaveLength(1);
  });
});

describe("workspace isolation", () => {
  it("does not surface another workspace's waiting tasks and rejects its ids", async () => {
    const { task } = await seedTask(WS);
    await taskRepo(WS).setWaiting(task.id, {
      target: { kind: "text", note: "x" },
    });
    // The OTHER workspace sees nothing and cannot mutate WS's task.
    expect((await taskRepo(OTHER).listWaitingTasks()).items).toHaveLength(0);
    await expect(
      taskRepo(OTHER).setWaiting(task.id, {
        target: { kind: "text", note: "y" },
      }),
    ).rejects.toBeInstanceOf(TaskNotFoundError);
    await expect(taskRepo(OTHER).clearWaiting(task.id)).rejects.toBeInstanceOf(
      TaskNotFoundError,
    );
  });
});
