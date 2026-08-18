/**
 * TASKS-13 — Task checklists against the REAL database (Workers runtime,
 * isolated D1, committed migrations applied).
 *
 * These prove the guarantees the product rests on, and each of them is a claim
 * the schema or a transaction makes rather than one the interface promises:
 *
 *   - a checklist item is NOT a Task: it creates no entity, no spine record and
 *     no Activity, and it cannot be read as one;
 *   - workspace isolation is absolute, and an item can only be reached through
 *     the Task that owns it;
 *   - ordering is stable, dense and owner-controlled, across create, delete and
 *     reorder;
 *   - completing every ITEM does not complete the TASK, and completing the TASK
 *     does not rewrite a single item;
 *   - archive/restore of the parent Project, and soft-delete of the Task, leave
 *     the checklist exactly as it was;
 *   - a recurring Task's successor inherits the checklist STRUCTURE with its
 *     completion RESET;
 *   - progress is read for a whole page in a bounded number of statements.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { env } from "cloudflare:test";

import {
  MAX_CHECKLIST_ITEMS,
  TaskChecklistFullError,
  TaskChecklistItemNotFoundError,
  TaskNotFoundError,
  TaskValidationError,
  checklistProgress,
  type TaskChecklistItem,
} from "~/kernel/tasks";

import {
  FakeClock,
  countActivities,
  countingDb,
  makeContext,
  makeProjectSettingsRepository,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";
import { createTaskRepository } from "~/platform/storage/d1";
import type {
  D1SpineRepositoryOptions,
  D1TaskRepositoryOptions,
} from "~/platform/storage/d1";

const WS = "ws_checklist";
const OTHER = "ws_checklist_other";

const nextEntityId = sequentialIds("cl_ent");
const nextActivityId = sequentialIds("cl_act");

function spineRepo(ws: string, options: D1SpineRepositoryOptions = {}) {
  return makeSpineRepository(makeContext(ws), {
    clock: new FakeClock().now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
    ...options,
  });
}

function taskRepo(ws: string, options: D1TaskRepositoryOptions = {}) {
  return makeTaskRepository(makeContext(ws), {
    clock: new FakeClock("2026-08-18T00:00:00.000Z").now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
    ...options,
  });
}

/** A bare Task with no structural parent, which is all most of these need. */
async function seedTask(ws: string, title = "Prepare camper for trip") {
  return await taskRepo(ws).createTask({ title, parent: null });
}

/** Add several steps in order and return them. */
async function seedChecklist(
  ws: string,
  taskId: string,
  titles: readonly string[],
): Promise<readonly TaskChecklistItem[]> {
  const tasks = taskRepo(ws);
  for (const title of titles) {
    await tasks.createChecklistItem(taskId, { title });
  }
  return await tasks.listChecklist(taskId);
}

/** Count every checklist row in the database, whatever workspace it belongs to. */
async function countChecklistRows(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM task_checklist_items",
  ).first<{ n: number }>();
  return row?.n ?? 0;
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("a checklist item is not a Task", () => {
  it("creates no entity, no spine record and no Activity", async () => {
    const task = await seedTask(WS);
    const entitiesBefore = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM entities",
    ).first<{ n: number }>();
    const spineBefore = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM spine_records",
    ).first<{ n: number }>();
    const activityBefore = await countActivities();

    await taskRepo(WS).createChecklistItem(task.id, {
      title: "Check tyre pressures",
    });

    // The whole of "a checklist item is not a Task", asserted at the storage
    // layer: nothing was added to the three tables that make something a record.
    expect(
      (
        await env.DB.prepare("SELECT COUNT(*) AS n FROM entities").first<{
          n: number;
        }>()
      )?.n,
    ).toBe(entitiesBefore?.n);
    expect(
      (
        await env.DB.prepare("SELECT COUNT(*) AS n FROM spine_records").first<{
          n: number;
        }>()
      )?.n,
    ).toBe(spineBefore?.n);
    // ── The Activity decision, asserted ──────────────────────────────────────
    // Checklist mutations append NO Activity. Ten steps on one Task would
    // otherwise put ten rows into a timeline that describes commitments.
    expect(await countActivities()).toBe(activityBefore);
    expect(await countChecklistRows()).toBe(1);
  });

  it("cannot be read as a Task, and has no place in a Task listing", async () => {
    const task = await seedTask(WS);
    const tasks = taskRepo(WS);
    const item = await tasks.createChecklistItem(task.id, {
      title: "Fill water tanks",
    });

    // Not a record: its id resolves to nothing in the Task domain.
    expect(await tasks.getTask(item.id)).toBeNull();
    // Not a row: the workspace collection still holds exactly one Task.
    const page = await tasks.listWorkspaceTasks({
      view: "all",
      todayIso: "2026-08-18",
    });
    expect(page.items.map((entry) => entry.id)).toEqual([task.id]);
  });

  it("bumps the parent Task's updated_at, so a changed Task reads as changed", async () => {
    const task = await seedTask(WS);
    const before = (await taskRepo(WS).getTask(task.id))!.updatedAt.getTime();
    const later = new FakeClock("2026-08-19T00:00:00.000Z").now;
    await taskRepo(WS, { clock: later }).createChecklistItem(task.id, {
      title: "Charge batteries",
    });
    const after = (await taskRepo(WS).getTask(task.id))!.updatedAt.getTime();
    expect(after).toBeGreaterThan(before);
  });
});

describe("creating items", () => {
  it("appends in order, with dense positions", async () => {
    const task = await seedTask(WS);
    const items = await seedChecklist(WS, task.id, [
      "Check tyre pressures",
      "Fill water tanks",
      "Charge batteries",
    ]);
    expect(items.map((entry) => entry.title)).toEqual([
      "Check tyre pressures",
      "Fill water tanks",
      "Charge batteries",
    ]);
    expect(items.map((entry) => entry.position)).toEqual([0, 1, 2]);
    expect(items.every((entry) => entry.completed)).toBe(false);
  });

  it("normalises the title through the kernel and refuses a blank one", async () => {
    const task = await seedTask(WS);
    const tasks = taskRepo(WS);
    const item = await tasks.createChecklistItem(task.id, {
      title: "  Pack the   fridge  ",
    });
    expect(item.title).toBe("Pack the fridge");
    await expect(
      tasks.createChecklistItem(task.id, { title: "   " }),
    ).rejects.toBeInstanceOf(TaskValidationError);
  });

  it("refuses a Task that does not exist, is deleted, or is not a Task", async () => {
    const tasks = taskRepo(WS);
    const area = await spineRepo(WS).createArea({ title: "Travel" });
    const project = await spineRepo(WS).createProject({
      title: "Trip",
      parent: { kind: "area", id: area.id },
    });
    await expect(
      tasks.createChecklistItem("nope", { title: "Step" }),
    ).rejects.toBeInstanceOf(TaskNotFoundError);
    await expect(
      tasks.createChecklistItem(project.id, { title: "Step" }),
    ).rejects.toBeInstanceOf(TaskNotFoundError);

    const task = await seedTask(WS);
    await tasks.deleteTasks([task.id]);
    await expect(
      tasks.createChecklistItem(task.id, { title: "Step" }),
    ).rejects.toBeInstanceOf(TaskNotFoundError);
    expect(await countChecklistRows()).toBe(0);
  });

  it("refuses the item past the bound, and says why", async () => {
    const task = await seedTask(WS);
    const tasks = taskRepo(WS);
    for (let index = 0; index < MAX_CHECKLIST_ITEMS; index += 1) {
      await tasks.createChecklistItem(task.id, { title: `Step ${index}` });
    }
    await expect(
      tasks.createChecklistItem(task.id, { title: "One too many" }),
    ).rejects.toBeInstanceOf(TaskChecklistFullError);
    expect((await tasks.listChecklist(task.id)).length).toBe(
      MAX_CHECKLIST_ITEMS,
    );
  });

  it("gives two rapid additions two different positions", async () => {
    // The position is resolved INSIDE the insert, so a read-then-write gap
    // cannot let both land on the same slot.
    const task = await seedTask(WS);
    const tasks = taskRepo(WS);
    await Promise.all([
      tasks.createChecklistItem(task.id, { title: "A" }),
      tasks.createChecklistItem(task.id, { title: "B" }),
    ]);
    const items = await tasks.listChecklist(task.id);
    expect(items).toHaveLength(2);
    expect(new Set(items.map((entry) => entry.position)).size).toBe(2);
  });
});

describe("workspace isolation", () => {
  it("cannot create, read, rename, tick, delete or reorder across a workspace", async () => {
    const task = await seedTask(WS);
    const items = await seedChecklist(WS, task.id, ["Only step"]);
    const item = items[0]!;
    const intruder = taskRepo(OTHER);

    // A Task in another workspace is indistinguishable from one that does not
    // exist, and every mutation refuses on that basis.
    await expect(
      intruder.createChecklistItem(task.id, { title: "Injected" }),
    ).rejects.toBeInstanceOf(TaskNotFoundError);
    await expect(
      intruder.renameChecklistItem(task.id, item.id, "Renamed"),
    ).rejects.toBeInstanceOf(TaskNotFoundError);
    await expect(
      intruder.setChecklistItemCompleted(task.id, item.id, true),
    ).rejects.toBeInstanceOf(TaskNotFoundError);
    await expect(
      intruder.deleteChecklistItem(task.id, item.id),
    ).rejects.toBeInstanceOf(TaskNotFoundError);
    await expect(
      intruder.reorderChecklist(task.id, [item.id]),
    ).rejects.toBeInstanceOf(TaskNotFoundError);

    // Reads disclose nothing either.
    expect(await intruder.listChecklist(task.id)).toEqual([]);
    expect((await intruder.listChecklistProgress([task.id])).size).toBe(0);
    expect(await taskRepo(WS).listChecklist(task.id)).toHaveLength(1);
  });

  it("cannot reach an item through the WRONG Task in the same workspace", async () => {
    const owner = await seedTask(WS, "Prepare camper");
    const other = await seedTask(WS, "Book campsite");
    const items = await seedChecklist(WS, owner.id, ["Check tyre pressures"]);
    const item = items[0]!;
    const tasks = taskRepo(WS);

    // Every mutation is addressed by (task, item), so naming the wrong parent is
    // simply "that item is not there" — never someone else's row.
    await expect(
      tasks.renameChecklistItem(other.id, item.id, "Hijacked"),
    ).rejects.toBeInstanceOf(TaskChecklistItemNotFoundError);
    await expect(
      tasks.setChecklistItemCompleted(other.id, item.id, true),
    ).rejects.toBeInstanceOf(TaskChecklistItemNotFoundError);
    expect(await tasks.deleteChecklistItem(other.id, item.id)).toEqual({
      changed: false,
    });
    expect((await tasks.listChecklist(owner.id))[0]!.title).toBe(
      "Check tyre pressures",
    );
  });
});

describe("renaming", () => {
  it("renames ONE item and leaves its completion and position alone", async () => {
    const task = await seedTask(WS);
    const items = await seedChecklist(WS, task.id, ["A", "B", "C"]);
    const tasks = taskRepo(WS);
    await tasks.setChecklistItemCompleted(task.id, items[1]!.id, true);

    const result = await tasks.renameChecklistItem(
      task.id,
      items[1]!.id,
      "B renamed",
    );
    expect(result.changed).toBe(true);
    expect(result.item.title).toBe("B renamed");
    expect(result.item.completed).toBe(true);
    expect(result.item.position).toBe(1);

    const after = await tasks.listChecklist(task.id);
    expect(after.map((entry) => entry.title)).toEqual(["A", "B renamed", "C"]);
  });

  it("reports an unchanged title as an idempotent no-op", async () => {
    const task = await seedTask(WS);
    const items = await seedChecklist(WS, task.id, ["A"]);
    const result = await taskRepo(WS).renameChecklistItem(
      task.id,
      items[0]!.id,
      "  A  ",
    );
    expect(result.changed).toBe(false);
  });

  it("refuses an item that is not there", async () => {
    const task = await seedTask(WS);
    await expect(
      taskRepo(WS).renameChecklistItem(task.id, "ghost", "Anything"),
    ).rejects.toBeInstanceOf(TaskChecklistItemNotFoundError);
  });
});

describe("completing and uncompleting", () => {
  it("ticks and unticks one item, idempotently", async () => {
    const task = await seedTask(WS);
    const items = await seedChecklist(WS, task.id, ["A", "B"]);
    const tasks = taskRepo(WS);

    const first = await tasks.setChecklistItemCompleted(
      task.id,
      items[0]!.id,
      true,
    );
    expect(first.changed).toBe(true);
    expect(first.item.completed).toBe(true);

    // Repeating the SAME intent writes nothing and reports so — which is what
    // makes a replayed offline tick safe to repeat.
    const again = await tasks.setChecklistItemCompleted(
      task.id,
      items[0]!.id,
      true,
    );
    expect(again.changed).toBe(false);
    expect(again.item.completed).toBe(true);

    const undone = await tasks.setChecklistItemCompleted(
      task.id,
      items[0]!.id,
      false,
    );
    expect(undone.changed).toBe(true);
    expect(undone.item.completed).toBe(false);
    // The neighbour never moved.
    expect((await tasks.listChecklist(task.id))[1]!.completed).toBe(false);
  });

  it("stays consistent when two ticks race", async () => {
    const task = await seedTask(WS);
    const items = await seedChecklist(WS, task.id, ["A"]);
    const tasks = taskRepo(WS);
    const results = await Promise.all([
      tasks.setChecklistItemCompleted(task.id, items[0]!.id, true),
      tasks.setChecklistItemCompleted(task.id, items[0]!.id, true),
    ]);
    // Both report the same terminal state; the guarded UPDATE means at most one
    // of them wrote anything.
    expect(results.every((result) => result.item.completed)).toBe(true);
    expect(
      results.filter((result) => result.changed).length,
    ).toBeLessThanOrEqual(1);
    expect((await tasks.listChecklist(task.id))[0]!.completed).toBe(true);
  });

  it("does NOT complete the parent Task when every item is done", async () => {
    // The decision TASKS-13 records: a checklist describes the steps, the Task
    // is the commitment, and the owner decides when the commitment is met.
    const task = await seedTask(WS);
    const items = await seedChecklist(WS, task.id, ["A", "B", "C"]);
    const tasks = taskRepo(WS);
    for (const item of items) {
      await tasks.setChecklistItemCompleted(task.id, item.id, true);
    }
    const view = await tasks.getTask(task.id);
    expect(view!.completedAt).toBeNull();
    expect(checklistProgress(await tasks.listChecklist(task.id))).toEqual({
      total: 3,
      completed: 3,
    });
  });
});

describe("deleting", () => {
  it("removes the item and CLOSES the gap", async () => {
    const task = await seedTask(WS);
    const items = await seedChecklist(WS, task.id, ["A", "B", "C", "D"]);
    const tasks = taskRepo(WS);

    expect(await tasks.deleteChecklistItem(task.id, items[1]!.id)).toEqual({
      changed: true,
    });
    const after = await tasks.listChecklist(task.id);
    expect(after.map((entry) => entry.title)).toEqual(["A", "C", "D"]);
    // Dense, so the next item added cannot collide with the vacated slot.
    expect(after.map((entry) => entry.position)).toEqual([0, 1, 2]);

    const added = await tasks.createChecklistItem(task.id, { title: "E" });
    expect(added.position).toBe(3);
  });

  it("treats deleting what is already gone as the outcome that was asked for", async () => {
    const task = await seedTask(WS);
    expect(await taskRepo(WS).deleteChecklistItem(task.id, "ghost")).toEqual({
      changed: false,
    });
  });

  it("still orders correctly after a delete followed by a reorder", async () => {
    const task = await seedTask(WS);
    const items = await seedChecklist(WS, task.id, ["A", "B", "C"]);
    const tasks = taskRepo(WS);
    await tasks.deleteChecklistItem(task.id, items[0]!.id);
    const remaining = await tasks.listChecklist(task.id);
    await tasks.reorderChecklist(task.id, [remaining[1]!.id, remaining[0]!.id]);
    expect(
      (await tasks.listChecklist(task.id)).map((entry) => entry.title),
    ).toEqual(["C", "B"]);
  });
});

describe("reordering", () => {
  it("applies the whole submitted order, densely", async () => {
    const task = await seedTask(WS);
    const items = await seedChecklist(WS, task.id, ["A", "B", "C", "D"]);
    const tasks = taskRepo(WS);
    const result = await tasks.reorderChecklist(task.id, [
      items[3]!.id,
      items[0]!.id,
      items[2]!.id,
      items[1]!.id,
    ]);
    expect(result.changed).toBe(true);
    const after = await tasks.listChecklist(task.id);
    expect(after.map((entry) => entry.title)).toEqual(["D", "A", "C", "B"]);
    expect(after.map((entry) => entry.position)).toEqual([0, 1, 2, 3]);
  });

  it("survives a reload — the order is PERSISTED, not remembered", async () => {
    const task = await seedTask(WS);
    const items = await seedChecklist(WS, task.id, ["A", "B", "C"]);
    await taskRepo(WS).reorderChecklist(task.id, [
      items[2]!.id,
      items[1]!.id,
      items[0]!.id,
    ]);
    // A brand-new repository instance: nothing in memory carries over.
    const fresh = createTaskRepository(env.DB, makeContext(WS));
    expect((await fresh.listChecklist(task.id)).map((e) => e.title)).toEqual([
      "C",
      "B",
      "A",
    ]);
  });

  it("reports an unchanged order as an idempotent no-op", async () => {
    const task = await seedTask(WS);
    const items = await seedChecklist(WS, task.id, ["A", "B"]);
    expect(
      await taskRepo(WS).reorderChecklist(task.id, [
        items[0]!.id,
        items[1]!.id,
      ]),
    ).toEqual({ changed: false });
  });

  it("refuses a STALE order and writes nothing", async () => {
    const task = await seedTask(WS);
    const items = await seedChecklist(WS, task.id, ["A", "B", "C"]);
    const tasks = taskRepo(WS);
    // Another device added a step; this device's list is one short.
    await tasks.createChecklistItem(task.id, { title: "D" });
    await expect(
      tasks.reorderChecklist(task.id, [
        items[2]!.id,
        items[1]!.id,
        items[0]!.id,
      ]),
    ).rejects.toBeInstanceOf(TaskChecklistItemNotFoundError);
    // Nothing moved: a partial reorder would invent an order nobody chose.
    expect((await tasks.listChecklist(task.id)).map((e) => e.title)).toEqual([
      "A",
      "B",
      "C",
      "D",
    ]);
  });

  it("refuses an order naming an item that belongs to another Task", async () => {
    const owner = await seedTask(WS, "Owner");
    const other = await seedTask(WS, "Other");
    const mine = await seedChecklist(WS, owner.id, ["A"]);
    const theirs = await seedChecklist(WS, other.id, ["B"]);
    await expect(
      taskRepo(WS).reorderChecklist(owner.id, [mine[0]!.id, theirs[0]!.id]),
    ).rejects.toBeInstanceOf(TaskChecklistItemNotFoundError);
  });
});

describe("the parent Task's lifecycle", () => {
  it("completing the Task does not rewrite a single item", async () => {
    const task = await seedTask(WS);
    const items = await seedChecklist(WS, task.id, ["A", "B", "C"]);
    const tasks = taskRepo(WS);
    await tasks.setChecklistItemCompleted(task.id, items[0]!.id, true);

    // Completing a Task with UNFINISHED steps is allowed, and nothing is
    // silently ticked to make the record look tidy.
    await tasks.completeTask(task.id, { ownerTodayIso: "2026-08-18" });
    const after = await tasks.listChecklist(task.id);
    expect(after.map((entry) => entry.completed)).toEqual([true, false, false]);
    expect(after.map((entry) => entry.title)).toEqual(["A", "B", "C"]);
  });

  it("reopening the Task restores it without touching the checklist", async () => {
    const task = await seedTask(WS);
    const items = await seedChecklist(WS, task.id, ["A", "B"]);
    const tasks = taskRepo(WS);
    await tasks.setChecklistItemCompleted(task.id, items[1]!.id, true);
    await tasks.completeTask(task.id, { ownerTodayIso: "2026-08-18" });
    await tasks.reopenTask(task.id);
    expect(
      (await tasks.listChecklist(task.id)).map((entry) => entry.completed),
    ).toEqual([false, true]);
  });

  it("soft-deleting and restoring the Task preserves the checklist", async () => {
    const task = await seedTask(WS);
    const items = await seedChecklist(WS, task.id, ["A", "B", "C"]);
    const tasks = taskRepo(WS);
    await tasks.setChecklistItemCompleted(task.id, items[0]!.id, true);

    await tasks.deleteTasks([task.id]);
    // The rows are intact behind the soft delete — nothing is destroyed.
    expect(await countChecklistRows()).toBe(3);

    await tasks.restoreTasks([task.id]);
    const after = await tasks.listChecklist(task.id);
    expect(after.map((entry) => entry.title)).toEqual(["A", "B", "C"]);
    expect(after.map((entry) => entry.completed)).toEqual([true, false, false]);
    expect(after.map((entry) => entry.position)).toEqual([0, 1, 2]);
  });

  it("refuses a checklist mutation inside an ARCHIVED Project, and keeps the items", async () => {
    const spine = spineRepo(WS);
    const area = await spine.createArea({ title: "Travel" });
    const project = await spine.createProject({
      title: "Trip",
      parent: { kind: "area", id: area.id },
    });
    const task = await taskRepo(WS).createTask({
      title: "Prepare camper",
      parent: { kind: "project", id: project.id },
    });
    const items = await seedChecklist(WS, task.id, ["A"]);
    const tasks = taskRepo(WS);
    // A Project refuses to archive while it still holds unfinished Tasks, so the
    // Task is completed first — which is also the more interesting shape: the
    // checklist must survive BOTH.
    await tasks.completeTask(task.id, { ownerTodayIso: "2026-08-18" });
    const archived = await makeProjectSettingsRepository(makeContext(WS), {
      clock: new FakeClock("2026-08-18T00:00:00.000Z").now,
    }).archive(project.id);
    expect(archived.changed).toBe(true);

    await expect(
      tasks.createChecklistItem(task.id, { title: "B" }),
    ).rejects.toThrow();
    await expect(
      tasks.setChecklistItemCompleted(task.id, items[0]!.id, true),
    ).rejects.toThrow();
    // The checklist is still readable and still exactly as it was.
    expect((await tasks.listChecklist(task.id)).map((e) => e.title)).toEqual([
      "A",
    ]);
  });

  it("permanently deleting the parent is REFUSED while items exist, so nothing is orphaned", async () => {
    const task = await seedTask(WS);
    await seedChecklist(WS, task.id, ["A"]);
    // The schema's ON DELETE RESTRICT is the guarantee. DalyHub soft-deletes
    // Tasks, so this is not a path the product takes — it is the reason a future
    // purge would be FORCED to clear the checklist first rather than allowed to
    // leave rows behind.
    await expect(
      env.DB.prepare("DELETE FROM entities WHERE workspace_id = ? AND id = ?")
        .bind(WS, task.id)
        .run(),
    ).rejects.toThrow();
    expect(await countChecklistRows()).toBe(1);
  });
});

describe("recurrence", () => {
  it("clones the checklist STRUCTURE onto the successor with completion RESET", async () => {
    const task = await seedTask(WS, "Monthly camper check");
    const tasks = taskRepo(WS);
    await tasks.updateTask(task.id, { scheduledDate: "2026-08-18" });
    await tasks.setTaskRecurrence(task.id, {
      frequency: "month",
      interval: 1,
      dateKind: "scheduled",
      weekdays: [],
      mode: "fixed",
      anchorDay: null,
      anchorMonth: null,
    });
    const items = await seedChecklist(WS, task.id, [
      "Check tyre pressures",
      "Check gas bottle",
      "Check batteries",
    ]);
    for (const item of items) {
      await tasks.setChecklistItemCompleted(task.id, item.id, true);
    }

    const result = await tasks.completeTask(task.id, {
      ownerTodayIso: "2026-08-18",
    });
    expect(result.successor).not.toBeNull();
    const successorId = result.successor!.id;

    const cloned = await tasks.listChecklist(successorId);
    // The STRUCTURE carries: same titles, same order.
    expect(cloned.map((entry) => entry.title)).toEqual([
      "Check tyre pressures",
      "Check gas bottle",
      "Check batteries",
    ]);
    expect(cloned.map((entry) => entry.position)).toEqual([0, 1, 2]);
    // The TICKS do not. Last month's work is not this month's.
    expect(cloned.map((entry) => entry.completed)).toEqual([
      false,
      false,
      false,
    ]);
    // Fresh rows, never shared ones: editing the successor cannot rewrite
    // history.
    expect(cloned.map((entry) => entry.id)).not.toEqual(
      items.map((entry) => entry.id),
    );
    expect(cloned.every((entry) => entry.taskId === successorId)).toBe(true);

    // The completed occurrence keeps ITS checklist exactly as it was.
    expect(
      (await tasks.listChecklist(task.id)).map((entry) => entry.completed),
    ).toEqual([true, true, true]);
  });

  it("gives a recurring Task with NO checklist a successor with none", async () => {
    const task = await seedTask(WS, "Weekly bins");
    const tasks = taskRepo(WS);
    await tasks.updateTask(task.id, { scheduledDate: "2026-08-18" });
    await tasks.setTaskRecurrence(task.id, {
      frequency: "week",
      interval: 1,
      dateKind: "scheduled",
      weekdays: [],
      mode: "fixed",
      anchorDay: null,
      anchorMonth: null,
    });
    const result = await tasks.completeTask(task.id, {
      ownerTodayIso: "2026-08-18",
    });
    expect(await tasks.listChecklist(result.successor!.id)).toEqual([]);
    expect(await countChecklistRows()).toBe(0);
  });

  it("withdraws the cloned checklist with the successor when the completion is undone", async () => {
    const task = await seedTask(WS, "Monthly camper check");
    const tasks = taskRepo(WS);
    await tasks.updateTask(task.id, { scheduledDate: "2026-08-18" });
    await tasks.setTaskRecurrence(task.id, {
      frequency: "month",
      interval: 1,
      dateKind: "scheduled",
      weekdays: [],
      mode: "fixed",
      anchorDay: null,
      anchorMonth: null,
    });
    await seedChecklist(WS, task.id, ["A", "B"]);

    const completion = await tasks.completeTask(task.id, {
      ownerTodayIso: "2026-08-18",
    });
    const successorId = completion.successor!.id;
    const undo = await tasks.reopenTask(task.id);
    expect(undo.successorOutcome).toBe("removed");

    // The successor is soft-deleted, so its checklist is no longer reachable
    // through the Task domain — and the ORIGINAL occurrence's is untouched.
    expect(await tasks.getTask(successorId)).toBeNull();
    expect((await tasks.listChecklist(task.id)).map((e) => e.title)).toEqual([
      "A",
      "B",
    ]);
  });
});

describe("progress projection", () => {
  it("reports total and completed for many Tasks at once", async () => {
    const withNone = await seedTask(WS, "No steps");
    const partial = await seedTask(WS, "Some steps");
    const done = await seedTask(WS, "All steps");
    const tasks = taskRepo(WS);
    const partialItems = await seedChecklist(WS, partial.id, ["A", "B", "C"]);
    await tasks.setChecklistItemCompleted(
      partial.id,
      partialItems[0]!.id,
      true,
    );
    const doneItems = await seedChecklist(WS, done.id, ["A", "B"]);
    for (const item of doneItems) {
      await tasks.setChecklistItemCompleted(done.id, item.id, true);
    }

    const progress = await tasks.listChecklistProgress([
      withNone.id,
      partial.id,
      done.id,
    ]);
    // A Task with no checklist contributes NO ROW: "no checklist" costs nothing,
    // and the caller reads a missing key as 0 of 0.
    expect(progress.has(withNone.id)).toBe(false);
    expect(progress.get(partial.id)).toEqual({ total: 3, completed: 1 });
    expect(progress.get(done.id)).toEqual({ total: 2, completed: 2 });
  });

  it("issues NO statement for an empty page", async () => {
    const counting = countingDb(env.DB);
    const repo = createTaskRepository(counting.db, makeContext(WS));
    counting.reset();
    expect((await repo.listChecklistProgress([])).size).toBe(0);
    expect(counting.prepareCount()).toBe(0);
  });

  it("costs ONE statement for a page, whatever the page holds", async () => {
    // The no-N+1 property, asserted as a number: fifty Tasks with checklists
    // cost the same ONE aggregate that one Task does.
    const ids: string[] = [];
    for (let index = 0; index < 50; index += 1) {
      const task = await seedTask(WS, `Task ${index}`);
      ids.push(task.id);
      await seedChecklist(WS, task.id, ["A", "B"]);
    }
    const counting = countingDb(env.DB);
    const repo = createTaskRepository(counting.db, makeContext(WS));

    counting.reset();
    await repo.listChecklistProgress(ids.slice(0, 1));
    const forOne = counting.prepareCount();

    counting.reset();
    const all = await repo.listChecklistProgress(ids);
    const forFifty = counting.prepareCount();

    expect(forOne).toBe(1);
    expect(forFifty).toBe(1);
    expect(all.size).toBe(50);
  });

  it("reads a page LARGER than one bound-parameter list, correctly", async () => {
    /*
     * The regression test for a real defect. D1 accepts at most 100 bound
     * parameters per query and the workspace id is one of them, so a chunk of
     * 100 was a hundred-and-one and the statement failed — silently, on a
     * surface that degrades a failed read, as a day reporting "Nothing planned
     * today" while thirty-seven Tasks were planned.
     *
     * 120 ids is more than one chunk holds, so this exercises the seam.
     */
    const ids: string[] = [];
    for (let index = 0; index < 120; index += 1) {
      const task = await seedTask(WS, `Bulk ${index}`);
      ids.push(task.id);
      await taskRepo(WS).createChecklistItem(task.id, { title: "Only step" });
    }
    const progress = await taskRepo(WS).listChecklistProgress(ids);
    expect(progress.size).toBe(120);
    expect(progress.get(ids[119]!)).toEqual({ total: 1, completed: 0 });
  });

  it("refuses an unbounded id list rather than turning one aggregate into many", async () => {
    await expect(
      taskRepo(WS).listChecklistProgress(
        Array.from({ length: 1_501 }, (_, index) => `id-${index}`),
      ),
    ).rejects.toBeInstanceOf(TaskValidationError);
  });
});

describe("scale", () => {
  it("keeps fifty steps ordered, readable and reorderable", async () => {
    const task = await seedTask(WS, "A long list");
    const tasks = taskRepo(WS);
    const titles = Array.from({ length: 50 }, (_, index) => `Step ${index}`);
    for (const title of titles) {
      await tasks.createChecklistItem(task.id, { title });
    }
    const items = await tasks.listChecklist(task.id);
    expect(items.map((entry) => entry.title)).toEqual(titles);

    // Move the last to the front: one atomic renumber of fifty rows.
    const reordered = [items[49]!.id, ...items.slice(0, 49).map((e) => e.id)];
    expect(await tasks.reorderChecklist(task.id, reordered)).toEqual({
      changed: true,
    });
    const after = await tasks.listChecklist(task.id);
    expect(after[0]!.title).toBe("Step 49");
    expect(after.map((entry) => entry.position)).toEqual(
      Array.from({ length: 50 }, (_, index) => index),
    );
  });

  it("keeps duplicate titles distinguishable by identity", async () => {
    const task = await seedTask(WS);
    const items = await seedChecklist(WS, task.id, ["Check", "Check", "Check"]);
    expect(new Set(items.map((entry) => entry.id)).size).toBe(3);
    await taskRepo(WS).setChecklistItemCompleted(task.id, items[1]!.id, true);
    expect(
      (await taskRepo(WS).listChecklist(task.id)).map((e) => e.completed),
    ).toEqual([false, true, false]);
  });
});

describe("search", () => {
  it("finds the parent TASK by its checklist text, and never the item itself", async () => {
    const camper = await seedTask(WS, "Prepare camper for trip");
    await seedTask(WS, "Book the ferry");
    await seedChecklist(WS, camper.id, ["Check tyre pressures"]);
    const tasks = taskRepo(WS);

    const hits = await tasks.searchTasks({ text: "tyre pressure" });
    // The result is the TASK — a checklist item has no route, no record and no
    // search hit of its own.
    expect(hits.map((hit) => hit.id)).toEqual([camper.id]);
    expect(hits[0]!.title).toBe("Prepare camper for trip");
  });

  it("ranks a TITLE match above a checklist-only match", async () => {
    const titled = await seedTask(WS, "Tyre pressures");
    const viaChecklist = await seedTask(WS, "Prepare camper");
    await seedChecklist(WS, viaChecklist.id, ["Check tyre pressures"]);
    const hits = await taskRepo(WS).searchTasks({ text: "tyre pressures" });
    expect(hits.map((hit) => hit.id)).toEqual([titled.id, viaChecklist.id]);
  });

  it("does not leak a checklist match across a workspace", async () => {
    const mine = await seedTask(OTHER, "Prepare camper");
    await seedChecklist(OTHER, mine.id, ["Check tyre pressures"]);
    expect(await taskRepo(WS).searchTasks({ text: "tyre" })).toEqual([]);
  });
});
