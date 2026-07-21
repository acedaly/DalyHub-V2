/**
 * TODAY-03 / ADR-029 — real Workers/D1 integration tests for the ATOMIC
 * complete-and-clear-waiting operation (`TaskRepository.completeTask`). Proves that
 * completing a task and clearing its active waiting state is ONE transaction: on
 * success everything commits together, and on ANY injected failure the whole batch
 * rolls back — a completed-but-still-waiting task is impossible. Also covers guard
 * behaviour (missing/deleted/non-task/cross-workspace/already-completed) and that
 * reopening never restores waiting.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";

import { TASK_COMPLETED } from "~/kernel/spine";
import {
  TASK_WAITING_CLEARED,
  TaskNotFoundError,
  TaskStorageError,
} from "~/kernel/tasks";
import type { CompleteTaskFault } from "~/platform/storage/d1";

import {
  FakeClock,
  countActivitiesOfType,
  makeContext,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  seedEntity,
  sequentialIds,
} from "./support";

const WS = "ws_task_completion";
const OTHER = "ws_task_completion_other";

const nextEntityId = sequentialIds("cent");
const nextActivityId = sequentialIds("cact");

function spineRepo(ws: string) {
  return makeSpineRepository(makeContext(ws), {
    clock: new FakeClock().now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

function taskRepo(
  ws: string,
  options: { completeFault?: CompleteTaskFault } = {},
) {
  return makeTaskRepository(makeContext(ws), {
    clock: new FakeClock("2026-07-20T00:00:00.000Z").now,
    activityIdGenerator: nextActivityId,
    ...options,
  });
}

async function seedTask(ws: string) {
  const spine = spineRepo(ws);
  const area = await spine.createArea({ title: "Ops" });
  const task = await spine.createTask({
    title: "Prepare agreement",
    parent: { kind: "area", id: area.id },
  });
  return { area, task };
}

/** Read the raw stored waiting/completion state directly, bypassing the repo. */
async function readState(ws: string, taskId: string) {
  const spine = await env.DB.prepare(
    "SELECT completed_at FROM spine_records WHERE workspace_id = ? AND entity_id = ?",
  )
    .bind(ws, taskId)
    .first<{ completed_at: string | null }>();
  const details = await env.DB.prepare(
    "SELECT waiting_since, waiting_note FROM task_details WHERE workspace_id = ? AND entity_id = ?",
  )
    .bind(ws, taskId)
    .first<{ waiting_since: string | null; waiting_note: string | null }>();
  const link = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM entity_links
     WHERE workspace_id = ? AND source_entity_id = ?
       AND type = 'task.waiting_on' AND deleted_at IS NULL`,
  )
    .bind(ws, taskId)
    .first<{ n: number }>();
  return {
    completedAt: spine?.completed_at ?? null,
    waitingSince: details?.waiting_since ?? null,
    waitingNote: details?.waiting_note ?? null,
    activeLinks: link?.n ?? 0,
  };
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("atomic completion — success", () => {
  it("completes a non-waiting task with only a completion event", async () => {
    const { task } = await seedTask(WS);
    const tasks = taskRepo(WS);

    const result = await tasks.completeTask(task.id);

    expect(result.changed).toBe(true);
    expect(result.task.completedAt).not.toBeNull();
    expect(result.task.waiting).toBeNull();
    expect(await countActivitiesOfType(TASK_COMPLETED)).toBe(1);
    expect(await countActivitiesOfType(TASK_WAITING_CLEARED)).toBe(0);
  });

  it("completes a free-text waiting task, clearing waiting + one waiting-cleared event", async () => {
    const { task } = await seedTask(WS);
    const tasks = taskRepo(WS);
    await tasks.setWaiting(task.id, {
      target: { kind: "text", note: "finance" },
    });

    const result = await tasks.completeTask(task.id);

    expect(result.changed).toBe(true);
    expect(result.task.completedAt).not.toBeNull();
    expect(result.task.waiting).toBeNull();
    const state = await readState(WS, task.id);
    expect(state.completedAt).not.toBeNull();
    expect(state.waitingSince).toBeNull();
    expect(state.waitingNote).toBeNull();
    expect(await countActivitiesOfType(TASK_COMPLETED)).toBe(1);
    expect(await countActivitiesOfType(TASK_WAITING_CLEARED)).toBe(1);
  });

  it("completes an entity-waiting task, soft-deleting the link + one waiting-cleared event", async () => {
    const { task } = await seedTask(WS);
    await seedEntity(WS, "person-a", { type: "person", title: "Amy" });
    const tasks = taskRepo(WS);
    await tasks.setWaiting(task.id, {
      target: { kind: "entity", targetId: "person-a" },
    });
    expect((await readState(WS, task.id)).activeLinks).toBe(1);

    const result = await tasks.completeTask(task.id);

    expect(result.changed).toBe(true);
    expect(result.task.waiting).toBeNull();
    const state = await readState(WS, task.id);
    expect(state.completedAt).not.toBeNull();
    expect(state.waitingSince).toBeNull();
    expect(state.activeLinks).toBe(0);
    expect(await countActivitiesOfType(TASK_COMPLETED)).toBe(1);
    expect(await countActivitiesOfType(TASK_WAITING_CLEARED)).toBe(1);
  });
});

describe("atomic completion — rollback under injected failure", () => {
  const FAULTS: readonly CompleteTaskFault[] = [
    "after-completion",
    "after-completion-activity",
    "after-waiting-update",
    "after-waiting-cleared-activity",
    "after-waiting-link",
  ];

  for (const fault of FAULTS) {
    it(`rolls the WHOLE operation back when it fails ${fault}`, async () => {
      const { task } = await seedTask(WS);
      await seedEntity(WS, "person-a", { type: "person", title: "Amy" });
      const setup = taskRepo(WS);
      await setup.setWaiting(task.id, {
        target: { kind: "entity", targetId: "person-a" },
      });
      const before = await readState(WS, task.id);
      expect(before.completedAt).toBeNull();
      expect(before.waitingSince).not.toBeNull();
      expect(before.activeLinks).toBe(1);

      const faulty = taskRepo(WS, { completeFault: fault });
      await expect(faulty.completeTask(task.id)).rejects.toBeInstanceOf(
        TaskStorageError,
      );

      // Nothing committed: completion, waiting state and the link are all unchanged.
      const after = await readState(WS, task.id);
      expect(after.completedAt).toBeNull();
      expect(after.waitingSince).toBe(before.waitingSince);
      expect(after.waitingNote).toBe(before.waitingNote);
      expect(after.activeLinks).toBe(1);
      expect(await countActivitiesOfType(TASK_COMPLETED)).toBe(0);
      expect(await countActivitiesOfType(TASK_WAITING_CLEARED)).toBe(0);

      // And the task is still completable normally afterwards (no corruption).
      const ok = await taskRepo(WS).completeTask(task.id);
      expect(ok.changed).toBe(true);
      expect((await readState(WS, task.id)).completedAt).not.toBeNull();
    });
  }
});

describe("completion guards & idempotency", () => {
  it("throws not-found for a missing id", async () => {
    await expect(taskRepo(WS).completeTask("nope")).rejects.toBeInstanceOf(
      TaskNotFoundError,
    );
  });

  it("throws not-found for a soft-deleted task", async () => {
    const { task } = await seedTask(WS);
    await spineRepo(WS).softDelete(task.id);
    await expect(taskRepo(WS).completeTask(task.id)).rejects.toBeInstanceOf(
      TaskNotFoundError,
    );
  });

  it("throws not-found for a non-task entity id", async () => {
    const { area } = await seedTask(WS);
    await expect(taskRepo(WS).completeTask(area.id)).rejects.toBeInstanceOf(
      TaskNotFoundError,
    );
  });

  it("throws not-found for a cross-workspace id", async () => {
    const { task } = await seedTask(OTHER);
    await expect(taskRepo(WS).completeTask(task.id)).rejects.toBeInstanceOf(
      TaskNotFoundError,
    );
  });

  it("is an idempotent no-op for an already-completed task (no duplicate Activity)", async () => {
    const { task } = await seedTask(WS);
    const tasks = taskRepo(WS);
    await tasks.completeTask(task.id);
    expect(await countActivitiesOfType(TASK_COMPLETED)).toBe(1);

    const again = await tasks.completeTask(task.id);
    expect(again.changed).toBe(false);
    expect(again.task.completedAt).not.toBeNull();
    // No second completion event.
    expect(await countActivitiesOfType(TASK_COMPLETED)).toBe(1);
  });
});

describe("reopen never restores waiting", () => {
  it("completing clears waiting, and reopening leaves it cleared", async () => {
    const { task } = await seedTask(WS);
    await seedEntity(WS, "person-a", { type: "person", title: "Amy" });
    const tasks = taskRepo(WS);
    await tasks.setWaiting(task.id, {
      target: { kind: "entity", targetId: "person-a" },
    });
    await tasks.completeTask(task.id);

    await spineRepo(WS).reopen(task.id);

    const reread = await tasks.getTask(task.id);
    expect(reread?.completedAt).toBeNull();
    expect(reread?.waiting).toBeNull();
    expect((await readState(WS, task.id)).activeLinks).toBe(0);
  });
});
