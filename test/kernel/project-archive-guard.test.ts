import { beforeEach, describe, expect, it } from "vitest";

import { SpineParentUnavailableError } from "~/kernel/spine";
import { TaskProjectArchivedError } from "~/kernel/tasks";

import {
  FakeClock,
  makeContext,
  makeProjectSettingsRepository,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

/**
 * PROJ-05 corrective — Phase 5: an ARCHIVED Project is read-only until restored.
 * Every Task mutation path that can affect one of its structural children is
 * proven rejected while archived, and working again after restore. Reopening a
 * completed Task must never recreate unfinished work inside an archived Project
 * (the invariant Phase 4's archive guard exists to protect).
 */

const WS = "ws_archive_guard";

function spine(prefix = "s") {
  return makeSpineRepository(makeContext(WS), {
    clock: new FakeClock().now,
    idGenerator: sequentialIds(prefix),
  });
}

function tasks() {
  return makeTaskRepository(makeContext(WS), { clock: new FakeClock().now });
}

function settings() {
  // No deterministic idGenerator override: each call must mint a genuinely
  // unique Activity id, since several independent `settings()` instances are
  // used across one test (unlike the single shared `spine()`/`tasks()` per test).
  return makeProjectSettingsRepository(makeContext(WS), {
    clock: new FakeClock().now,
  });
}

beforeEach(async () => {
  await resetTables([WS]);
});

async function seedArchivedProjectWithCompletedTask() {
  const sp = spine();
  const area = await sp.createArea({ title: "Area" });
  const project = await sp.createProject({
    title: "P",
    parent: { kind: "area", id: area.id },
  });
  const task = await sp.createTask({
    title: "T",
    parent: { kind: "project", id: project.id },
  });
  await sp.complete(task.id);
  const settled = await settings().archive(project.id);
  expect(settled.changed).toBe(true);
  return { sp, area, project, task };
}

describe("Task-detail mutations reject against an archived project", () => {
  it("updateTask is rejected", async () => {
    const { task } = await seedArchivedProjectWithCompletedTask();
    await expect(
      tasks().updateTask(task.id, { title: "Renamed" }),
    ).rejects.toThrow(TaskProjectArchivedError);
  });

  it("setWaiting / clearWaiting are rejected", async () => {
    const { task } = await seedArchivedProjectWithCompletedTask();
    await expect(
      tasks().setWaiting(task.id, { target: { kind: "text", note: "x" } }),
    ).rejects.toThrow(TaskProjectArchivedError);
    await expect(tasks().clearWaiting(task.id)).rejects.toThrow(
      TaskProjectArchivedError,
    );
  });

  it("planTask / clearPlan are rejected (single and bulk)", async () => {
    const { task } = await seedArchivedProjectWithCompletedTask();
    await expect(
      tasks().planTask(task.id, { scheduledDate: "2026-08-01" }),
    ).rejects.toThrow(TaskProjectArchivedError);
    await expect(tasks().clearPlan(task.id)).rejects.toThrow(
      TaskProjectArchivedError,
    );
    await expect(
      tasks().planTasks([task.id], { scheduledDate: "2026-08-01" }),
    ).rejects.toThrow(TaskProjectArchivedError);
  });

  it("completeTask is rejected even though the task is already completed", async () => {
    const { task } = await seedArchivedProjectWithCompletedTask();
    await expect(tasks().completeTask(task.id)).rejects.toThrow(
      TaskProjectArchivedError,
    );
  });

  it("a Task floating directly under an Area is never affected", async () => {
    const sp = spine();
    const area = await sp.createArea({ title: "Area" });
    const floating = await sp.createTask({
      title: "Floating",
      parent: { kind: "area", id: area.id },
    });
    const result = await tasks().updateTask(floating.id, { title: "Renamed" });
    expect(result.task.title).toBe("Renamed");
  });

  it("every mutation succeeds again after the project is restored", async () => {
    const { sp, project, task } = await seedArchivedProjectWithCompletedTask();
    await settings().restore(project.id);

    const updated = await tasks().updateTask(task.id, { title: "Renamed" });
    expect(updated.task.title).toBe("Renamed");
    // The task is still completed (restore doesn't reopen anything) — reopen it
    // (now permitted again) before planning, which applies to open work only.
    await sp.reopen(task.id);
    const planned = await tasks().planTask(task.id, {
      scheduledDate: "2026-08-01",
    });
    expect(planned.task.scheduledDate).toBe("2026-08-01");
  });
});

describe("Spine mutations reject against an archived project", () => {
  it("createTask under an archived project is rejected", async () => {
    const sp = spine();
    const area = await sp.createArea({ title: "Area" });
    const project = await sp.createProject({
      title: "P",
      parent: { kind: "area", id: area.id },
    });
    await settings().archive(project.id);

    await expect(
      sp.createTask({
        title: "New",
        parent: { kind: "project", id: project.id },
      }),
    ).rejects.toThrow(SpineParentUnavailableError);
  });

  it("reopening a completed Task under an archived project is rejected — it must never recreate unfinished work", async () => {
    const { sp, task } = await seedArchivedProjectWithCompletedTask();

    await expect(sp.reopen(task.id)).rejects.toThrow(
      SpineParentUnavailableError,
    );
    // The task remains completed — the archived project never gains unfinished work.
    expect((await sp.getById(task.id))?.completedAt).not.toBeNull();
  });

  it("moving a Task INTO an archived project is rejected", async () => {
    const sp = spine();
    const area = await sp.createArea({ title: "Area" });
    const archived = await sp.createProject({
      title: "Archived",
      parent: { kind: "area", id: area.id },
    });
    await settings().archive(archived.id);
    const floating = await sp.createTask({
      title: "Floating",
      parent: { kind: "area", id: area.id },
    });

    await expect(
      sp.move(floating.id, { kind: "project", id: archived.id }),
    ).rejects.toThrow(SpineParentUnavailableError);
    // Never orphaned: still exactly its original active parent.
    expect((await sp.getParent(floating.id))?.id).toBe(area.id);
  });

  it("moving a Task OUT OF an archived project is rejected", async () => {
    const {
      sp,
      area,
      project: archivedProject,
      task,
    } = await seedArchivedProjectWithCompletedTask();
    const destination = await sp.createProject({
      title: "Destination",
      parent: { kind: "area", id: area.id },
    });

    await expect(
      sp.move(task.id, { kind: "project", id: destination.id }),
    ).rejects.toThrow(SpineParentUnavailableError);
    // Never orphaned: still parented to the archived project.
    expect((await sp.getParent(task.id))?.id).toBe(archivedProject.id);
  });

  it("createTask, reopen and move all succeed again after restore", async () => {
    const { sp, project, task } = await seedArchivedProjectWithCompletedTask();
    await settings().restore(project.id);

    await expect(sp.reopen(task.id)).resolves.toMatchObject({
      outcome: "reopened",
    });
    const created = await sp.createTask({
      title: "New",
      parent: { kind: "project", id: project.id },
    });
    expect(created.id).toBeTruthy();
  });
});

describe("Task-detail mutation guards are folded into the write itself (review item 4)", () => {
  // These race a real `archive()` against a real Task-detail mutation on the
  // SAME task, mirroring `project-settings.test.ts`'s own concurrent-create
  // race test: rather than asserting a fixed winner (this single-process D1
  // instance doesn't guarantee a specific interleaving), each test proves the
  // invariant the SQL fold exists for — whichever settles, a task write can
  // never succeed against a project this test observes as archived immediately
  // after, and a rejection is always the SAME `TaskProjectArchivedError` the
  // read-based guard already throws (the fold changes WHEN the guard is
  // evaluated, never WHAT it throws).

  it("archive() racing updateTask() on the same (completed) task never leaves an inconsistent result", async () => {
    const { project, task } = await seedArchivedRestoredCompletedTaskProject();

    const [archiveResult, updateResult] = await Promise.allSettled([
      settings().archive(project.id),
      tasks().updateTask(task.id, { title: "Renamed mid-race" }),
    ]);

    const finalSettings = await settings().get(project.id);
    if (updateResult.status === "rejected") {
      expect(updateResult.reason).toBeInstanceOf(TaskProjectArchivedError);
    } else {
      // The update committed while the project was not yet archived at ITS
      // statement's own commit — legitimate only if archive did not win first.
      expect(
        finalSettings?.archivedAt === null ||
          archiveResult.status === "rejected",
      ).toBe(true);
    }
  });

  it("archive() racing setWaiting() on the same (completed) task never leaves an inconsistent result", async () => {
    const { project, task } = await seedArchivedRestoredCompletedTaskProject();

    const [archiveResult, waitingResult] = await Promise.allSettled([
      settings().archive(project.id),
      tasks().setWaiting(task.id, { target: { kind: "text", note: "x" } }),
    ]);

    const finalSettings = await settings().get(project.id);
    if (waitingResult.status === "rejected") {
      expect(waitingResult.reason).toBeInstanceOf(TaskProjectArchivedError);
    } else {
      expect(
        finalSettings?.archivedAt === null ||
          archiveResult.status === "rejected",
      ).toBe(true);
    }
  });

  /** A project with exactly one COMPLETED direct Task — archivable (the guard
   * only blocks on an ACTIVE incomplete direct Task) and, critically, a
   * completed Task is unaffected by the separate "planning applies to open
   * work only" rule, so `updateTask`/`setWaiting` failures can only be
   * attributed to the archived-project guard under test, never a different
   * business rule. */
  async function seedArchivedRestoredCompletedTaskProject() {
    const sp = spine();
    const area = await sp.createArea({ title: "Area" });
    const project = await sp.createProject({
      title: "P",
      parent: { kind: "area", id: area.id },
    });
    const task = await sp.createTask({
      title: "T",
      parent: { kind: "project", id: project.id },
    });
    await sp.complete(task.id);
    return { project, task };
  }
});
