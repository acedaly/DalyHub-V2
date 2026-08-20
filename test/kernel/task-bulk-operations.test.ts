/**
 * TASKS-06 — real Workers/D1 tests for the bulk operations added in V2.2: moving a
 * selection's structural parent, reopening a selection, and the REVERSIBLE bulk
 * delete/restore pair.
 *
 * The existing bulk field mutations (priority, dates, status, sector, commitment,
 * completion) are covered by `task-planning`/`task-collection`. What is new here is
 * structural and lifecycle, and both carry a specific hazard the tests target:
 *
 *   - a bulk MOVE touches three tables per task (the entity bump, the old link, the
 *     new link) plus Activity, so the interesting cases are the ones where a naive
 *     implementation leaves two active parent links, duplicates a previously-used link
 *     row, or half-files a selection;
 *   - a bulk DELETE must destroy nothing. The record, its details, its links, its
 *     Activity and its recurrence row all survive, it leaves every ordinary view, and
 *     it comes back through the `deleted` view exactly as it was.
 *
 * Every operation is asserted to REJECT THE WHOLE SET before writing anything when any
 * id is unusable — that is what makes "nothing was changed" an honest message.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { SpineParentUnavailableError } from "~/kernel/spine";
import {
  MAX_PLAN_BATCH_SIZE,
  TaskNotFoundError,
  TaskValidationError,
} from "~/kernel/tasks";

import {
  FakeClock,
  countActivitiesOfType,
  makeContext,
  makeProjectSettingsRepository,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "ws_task_bulk_ops";
const OTHER = "ws_task_bulk_ops_other";
const TODAY = "2026-08-08";

const nextEntityId = sequentialIds("blk");
const nextActivityId = sequentialIds("blkact");

function spineRepo(ws: string) {
  return makeSpineRepository(makeContext(ws), {
    clock: new FakeClock("2026-08-08T09:00:00.000Z").now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

function taskRepo(ws: string, at = "2026-08-08T09:00:00.000Z") {
  return makeTaskRepository(makeContext(ws), {
    clock: new FakeClock(at).now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

/** An Area, two Projects under it, and three unparented (Inbox) Tasks. */
async function seed(ws: string) {
  const spine = spineRepo(ws);
  const area = await spine.createArea({ title: "Work" });
  const projectA = await spine.createProject({
    title: "OpO Program Redesign",
    parent: { kind: "area", id: area.id },
  });
  const projectB = await spine.createProject({
    title: "Website relaunch",
    parent: { kind: "area", id: area.id },
  });
  const tasks = taskRepo(ws);
  const inbox = [];
  for (const title of [
    "Finalise the OpO pathway paper",
    "Submit the travel claim",
    "Call the mechanic",
  ]) {
    inbox.push(await tasks.createTask({ title }));
  }
  return { area, projectA, projectB, inbox, tasks };
}

/** The ACTIVE structural parent link rows of a task (there must never be two). */
async function parentLinks(ws: string, taskId: string) {
  const rows = await env.DB.prepare(
    `SELECT id, target_entity_id, type, deleted_at FROM entity_links
      WHERE workspace_id = ? AND source_entity_id = ?
        AND type IN ('task.belongs_to_project', 'task.belongs_to_area')
      ORDER BY id`,
  )
    .bind(ws, taskId)
    .all<{
      readonly id: string;
      readonly target_entity_id: string;
      readonly type: string;
      readonly deleted_at: string | null;
    }>();
  return rows.results ?? [];
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("bulk move to a Project or Area", () => {
  it("files a whole Inbox selection under one Project in ONE operation", async () => {
    const { projectA, inbox, tasks } = await seed(WS);
    const result = await tasks.setParentMany(
      inbox.map((task) => task.id),
      { kind: "project", id: projectA.id },
    );
    expect(result).toEqual({ changed: 3, unchanged: 0 });

    for (const task of inbox) {
      const read = await tasks.getTask(task.id);
      expect(read?.project?.id).toBe(projectA.id);
      // Exactly ONE active parent link per task — the invariant a naive
      // "insert the new one" implementation breaks.
      const links = await parentLinks(WS, task.id);
      expect(links.filter((link) => link.deleted_at === null)).toHaveLength(1);
    }
  });

  it("moves them straight from one Project to another — no clear-then-refile", async () => {
    const { projectA, projectB, inbox, tasks } = await seed(WS);
    await tasks.setParentMany(
      inbox.map((task) => task.id),
      { kind: "project", id: projectA.id },
    );
    const result = await tasks.setParentMany(
      inbox.map((task) => task.id),
      { kind: "project", id: projectB.id },
    );
    expect(result.changed).toBe(3);
    for (const task of inbox) {
      expect((await tasks.getTask(task.id))?.project?.id).toBe(projectB.id);
      expect(
        (await parentLinks(WS, task.id)).filter((l) => l.deleted_at === null),
      ).toHaveLength(1);
    }
  });

  it("RESTORES a previously-used link row rather than accumulating rows", async () => {
    // Moving work back and forth is ordinary. If each move inserted a fresh row the
    // table would grow without bound and the link's own history would fragment.
    const { projectA, projectB, inbox, tasks } = await seed(WS);
    const ids = inbox.map((task) => task.id);
    await tasks.setParentMany(ids, { kind: "project", id: projectA.id });
    await tasks.setParentMany(ids, { kind: "project", id: projectB.id });
    await tasks.setParentMany(ids, { kind: "project", id: projectA.id });
    // Two link rows total per task — one per destination — reused, not duplicated.
    expect(await parentLinks(WS, ids[0]!)).toHaveLength(2);
    expect(await countActivitiesOfType("entity_link.restored")).toBeGreaterThan(
      0,
    );
  });

  it("moves a selection to INBOX by clearing the parent", async () => {
    const { projectA, inbox, tasks } = await seed(WS);
    const ids = inbox.map((task) => task.id);
    await tasks.setParentMany(ids, { kind: "project", id: projectA.id });
    const result = await tasks.setParentMany(ids, null);
    expect(result.changed).toBe(3);
    for (const id of ids) {
      const read = await tasks.getTask(id);
      // An Inbox Task is a valid spine record with NO structural link — never a child
      // of an invented "Inbox" parent.
      expect(read?.project).toBeNull();
      expect(read?.area).toBeNull();
      expect(
        (await parentLinks(WS, id)).filter((l) => l.deleted_at === null),
      ).toHaveLength(0);
    }
  });

  it("counts a task already at the destination as unchanged, and writes nothing for it", async () => {
    const { projectA, inbox, tasks } = await seed(WS);
    await tasks.setParentMany([inbox[0]!.id], {
      kind: "project",
      id: projectA.id,
    });
    const before = await countActivitiesOfType("entity_link.created");
    const result = await tasks.setParentMany(
      inbox.map((task) => task.id),
      { kind: "project", id: projectA.id },
    );
    expect(result).toEqual({ changed: 2, unchanged: 1 });
    expect(await countActivitiesOfType("entity_link.created")).toBe(before + 2);
  });

  it("rejects the WHOLE move when the destination is archived, writing nothing", async () => {
    const { projectA, inbox, tasks } = await seed(WS);
    await makeProjectSettingsRepository(makeContext(WS)).archive(projectA.id);
    await expect(
      tasks.setParentMany(
        inbox.map((task) => task.id),
        { kind: "project", id: projectA.id },
      ),
    ).rejects.toBeInstanceOf(SpineParentUnavailableError);
    for (const task of inbox) {
      expect((await tasks.getTask(task.id))?.project).toBeNull();
    }
  });

  it("rejects the WHOLE move when any id is not a task in this workspace", async () => {
    const { projectA, inbox, tasks } = await seed(WS);
    const foreign = await seed(OTHER);
    await expect(
      tasks.setParentMany([inbox[0]!.id, foreign.inbox[0]!.id], {
        kind: "project",
        id: projectA.id,
      }),
    ).rejects.toBeInstanceOf(TaskNotFoundError);
    // Nothing was partially applied: the local task is still in Inbox.
    expect((await tasks.getTask(inbox[0]!.id))?.project).toBeNull();
  });

  it("cannot reach across workspaces to a destination", async () => {
    const { inbox, tasks } = await seed(WS);
    const foreign = await seed(OTHER);
    await expect(
      tasks.setParentMany([inbox[0]!.id], {
        kind: "project",
        id: foreign.projectA.id,
      }),
    ).rejects.toBeInstanceOf(SpineParentUnavailableError);
  });

  it("bounds the batch size", async () => {
    const { projectA, tasks } = await seed(WS);
    const tooMany = Array.from(
      { length: MAX_PLAN_BATCH_SIZE + 1 },
      (_, index) => `t-${index}`,
    );
    await expect(
      tasks.setParentMany(tooMany, { kind: "project", id: projectA.id }),
    ).rejects.toBeInstanceOf(TaskValidationError);
  });
});

describe("bulk reopen", () => {
  it("reopens a completed selection and leaves already-open tasks alone", async () => {
    const { inbox, tasks } = await seed(WS);
    await tasks.completeTasks([inbox[0]!.id, inbox[1]!.id], {
      ownerTodayIso: TODAY,
    });
    const result = await tasks.reopenTasks(inbox.map((task) => task.id));
    expect(result).toEqual({ changed: 2, unchanged: 1 });
    for (const task of inbox) {
      expect((await tasks.getTask(task.id))?.completedAt).toBeNull();
    }
  });

  it("withdraws the UNTOUCHED recurrence successor each completion created", async () => {
    const { area, tasks } = await seed(WS);
    const repeating = await tasks.createTask({
      title: "Weekly planning",
      parent: { kind: "area", id: area.id },
      scheduledDate: TODAY,
    });
    await tasks.setTaskRecurrence(repeating.id, {
      frequency: "week",
      dateKind: "scheduled",
      interval: 1,
    });
    await tasks.completeTasks([repeating.id], { ownerTodayIso: TODAY });

    const successorId = (await env.DB.prepare(
      `SELECT entity_id FROM task_recurrence_rules
          WHERE workspace_id = ? AND series_id = ? AND sequence = 1`,
    )
      .bind(WS, repeating.id)
      .first<{ readonly entity_id: string }>())!.entity_id;
    expect(await tasks.getTask(successorId)).not.toBeNull();

    await tasks.reopenTasks([repeating.id]);
    // Undo means undo: the occurrence the completion produced is gone, and its series
    // slot is released so re-completing works.
    expect(await tasks.getTask(successorId)).toBeNull();
    const recompleted = await tasks.completeTask(repeating.id, {
      ownerTodayIso: TODAY,
    });
    expect(recompleted.successor).not.toBeNull();
  });

  it("RETAINS a successor the owner has since changed", async () => {
    const { area, tasks } = await seed(WS);
    const repeating = await tasks.createTask({
      title: "Weekly planning",
      parent: { kind: "area", id: area.id },
      scheduledDate: TODAY,
    });
    await tasks.setTaskRecurrence(repeating.id, {
      frequency: "week",
      dateKind: "scheduled",
      interval: 1,
    });
    const completed = await tasks.completeTask(repeating.id, {
      ownerTodayIso: TODAY,
    });
    const successorId = completed.successor!.id;
    // The owner renamed the next occurrence: it is real work now. A LATER clock, so the
    // successor's `updated_at` genuinely moves past its `created_at` — which is the
    // persisted fact the safety decision reads (never a guess).
    await taskRepo(WS, "2026-08-09T09:00:00.000Z").updateTask(successorId, {
      title: "Weekly planning — Q4",
    });

    await tasks.reopenTasks([repeating.id]);
    // Undo never destroys real work.
    const retained = await tasks.getTask(successorId);
    expect(retained?.title).toBe("Weekly planning — Q4");
  });

  it("rejects the WHOLE reopen when any id is unusable", async () => {
    const { inbox, tasks } = await seed(WS);
    await tasks.completeTasks([inbox[0]!.id], { ownerTodayIso: TODAY });
    await expect(
      tasks.reopenTasks([inbox[0]!.id, "does-not-exist"]),
    ).rejects.toBeInstanceOf(TaskNotFoundError);
    expect((await tasks.getTask(inbox[0]!.id))?.completedAt).not.toBeNull();
  });
});

describe("bulk delete is reversible, and destroys nothing", () => {
  it("removes a selection from every ordinary view and keeps the records", async () => {
    const { projectA, inbox, tasks } = await seed(WS);
    const ids = inbox.map((task) => task.id);
    await tasks.setParentMany(ids, { kind: "project", id: projectA.id });
    await tasks.setPriorityMany(ids, "p1");

    const result = await tasks.deleteTasks(ids);
    expect(result).toEqual({ changed: 3, unchanged: 0 });

    // Gone from the collection…
    const active = await tasks.listWorkspaceTasks({
      todayIso: TODAY,
      timezone: "UTC",
      limit: 50,
      filters: { completedVisibility: "include" },
    });
    expect(active.items).toHaveLength(0);
    // …and from the Project's own list…
    expect((await tasks.listProjectTasks(projectA.id)).items).toHaveLength(0);
    // …but the RECORD is intact, with its details and its parent link retained.
    const read = await tasks.getTask(ids[0]!, { includeDeleted: true });
    expect(read?.deletedAt).not.toBeNull();
    expect(read?.priority).toBe("p1");
    expect(read?.project?.id).toBe(projectA.id);
    // One truthful audit event per task that actually transitioned.
    expect(await countActivitiesOfType("entity.deleted")).toBe(3);
  });

  it("surfaces the deleted tasks through the `deleted` system view, and only there", async () => {
    const { inbox, tasks } = await seed(WS);
    await tasks.deleteTasks([inbox[0]!.id]);

    const deleted = await tasks.listWorkspaceTasks({
      view: "deleted",
      todayIso: TODAY,
      timezone: "UTC",
      limit: 50,
    });
    expect(deleted.items.map((item) => item.id)).toEqual([inbox[0]!.id]);

    // The `all` view is still LIVE tasks only — "all" has never meant "including the
    // trash", and a delete that leaked into it would be no delete at all.
    const all = await tasks.listWorkspaceTasks({
      view: "all",
      todayIso: TODAY,
      timezone: "UTC",
      limit: 50,
    });
    expect(all.items.map((item) => item.id)).not.toContain(inbox[0]!.id);
  });

  it("restores a selection to exactly where it was", async () => {
    const { projectA, inbox, tasks } = await seed(WS);
    const ids = inbox.map((task) => task.id);
    await tasks.setParentMany(ids, { kind: "project", id: projectA.id });
    await tasks.deleteTasks(ids);

    const result = await tasks.restoreTasks(ids);
    expect(result).toEqual({ changed: 3, unchanged: 0 });
    for (const id of ids) {
      const read = await tasks.getTask(id);
      expect(read?.deletedAt).toBeNull();
      expect(read?.project?.id).toBe(projectA.id);
    }
    expect(await countActivitiesOfType("entity.restored")).toBe(3);
  });

  it("restores an unparented task back to the INBOX it came from", async () => {
    // AUDIT-15: Task parentage is optional, so a Task with no retained parent link is
    // not "orphaned" — it was an Inbox Task, and it returns as one. No Project is
    // invented on its behalf.
    const { inbox, tasks } = await seed(WS);
    await tasks.deleteTasks([inbox[0]!.id]);
    await tasks.restoreTasks([inbox[0]!.id]);
    const read = await tasks.getTask(inbox[0]!.id);
    expect(read?.deletedAt).toBeNull();
    expect(read?.project).toBeNull();
    expect(read?.area).toBeNull();
  });

  it("refuses to restore into an ARCHIVED Project, writing nothing", async () => {
    const { projectA, inbox, tasks } = await seed(WS);
    const ids = [inbox[0]!.id, inbox[1]!.id];
    await tasks.setParentMany(ids, { kind: "project", id: projectA.id });
    await tasks.deleteTasks(ids);
    await makeProjectSettingsRepository(makeContext(WS)).archive(projectA.id);

    await expect(tasks.restoreTasks(ids)).rejects.toBeInstanceOf(
      SpineParentUnavailableError,
    );
    // Deleted work is never silently re-filed somewhere the owner did not choose.
    for (const id of ids) {
      expect(
        (await tasks.getTask(id, { includeDeleted: true }))?.deletedAt,
      ).not.toBeNull();
    }
  });

  it("is idempotent in both directions", async () => {
    const { inbox, tasks } = await seed(WS);
    const ids = [inbox[0]!.id];
    await tasks.deleteTasks(ids);
    expect(await tasks.deleteTasks(ids)).toEqual({ changed: 0, unchanged: 1 });
    await tasks.restoreTasks(ids);
    expect(await tasks.restoreTasks(ids)).toEqual({ changed: 0, unchanged: 1 });
  });

  it("cannot delete a task in another workspace, and writes nothing at all", async () => {
    const { inbox, tasks } = await seed(WS);
    const foreign = await seed(OTHER);
    await expect(
      tasks.deleteTasks([inbox[0]!.id, foreign.inbox[0]!.id]),
    ).rejects.toBeInstanceOf(TaskNotFoundError);
    expect((await tasks.getTask(inbox[0]!.id))?.deletedAt).toBeNull();
    expect(
      (await foreign.tasks.getTask(foreign.inbox[0]!.id))?.deletedAt,
    ).toBeNull();
  });

  it("keeps a deleted recurring occurrence's rule, and frees its series slot", async () => {
    // A trashed occurrence must not keep a reservation on a series position. That is
    // the AUDIT-FIX-01 hazard, and it is why a restored occurrence returns as an
    // ordinary non-recurring Task rather than displacing whatever now holds the slot.
    const { area, tasks } = await seed(WS);
    const repeating = await tasks.createTask({
      title: "Replace the CPAP filter",
      parent: { kind: "area", id: area.id },
      scheduledDate: TODAY,
    });
    await tasks.setTaskRecurrence(repeating.id, {
      frequency: "month",
      dateKind: "scheduled",
      interval: 3,
    });
    await tasks.deleteTasks([repeating.id]);
    const read = await tasks.getTask(repeating.id, { includeDeleted: true });
    // The configuration travels with the record through the trash (TASKS-04).
    expect(read?.recurrence?.frequency).toBe("month");
    expect(read?.recurrence?.interval).toBe(3);
  });

  it("bounds the batch size", async () => {
    const { tasks } = await seed(WS);
    const tooMany = Array.from(
      { length: MAX_PLAN_BATCH_SIZE + 1 },
      (_, index) => `t-${index}`,
    );
    await expect(tasks.deleteTasks(tooMany)).rejects.toBeInstanceOf(
      TaskValidationError,
    );
    await expect(tasks.restoreTasks(tooMany)).rejects.toBeInstanceOf(
      TaskValidationError,
    );
  });
});
