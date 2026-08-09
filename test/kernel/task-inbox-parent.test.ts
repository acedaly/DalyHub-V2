/**
 * TASKS-04 — real Workers/D1 integration tests for the TASK INBOX MODEL and the
 * canonical parent mutation.
 *
 * The vocabulary under test:
 *   - **Inbox** — active Tasks with NO structural parent (never "no Time Sector");
 *   - **Unassigned** — the parent value of an Inbox Task;
 *   - **No sector** — no Time Sector;
 *   - **Unscheduled** — no scheduled date.
 *
 * Also covers the Today/`/tasks` agreement about which states are active work — the
 * `on_hold` inconsistency DEBT-37 recorded — so the two surfaces can never disagree
 * again without a failing test.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";

import { SpineParentUnavailableError } from "~/kernel/spine";
import { TaskNotFoundError } from "~/kernel/tasks";

import {
  FakeClock,
  makeContext,
  makeProjectSettingsRepository,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "ws_tasks04_inbox";
const OTHER = "ws_tasks04_inbox_other";
const TODAY = "2026-07-30";

const nextEntityId = sequentialIds("ib");
const nextActivityId = sequentialIds("ibact");

function spineRepo(ws: string) {
  return makeSpineRepository(makeContext(ws), {
    clock: new FakeClock("2026-07-30T00:00:00.000Z").now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

function taskRepo(ws: string) {
  return makeTaskRepository(makeContext(ws), {
    clock: new FakeClock("2026-07-30T00:00:00.000Z").now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

async function seedSpine(ws: string) {
  const spine = spineRepo(ws);
  const area = await spine.createArea({ title: "Work" });
  const project = await spine.createProject({
    title: "Ship V2",
    parent: { kind: "area", id: area.id },
  });
  return { spine, area, project };
}

/** Count the ACTIVE structural parent links a task carries. */
async function activeParentLinks(ws: string, taskId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM entity_links
     WHERE workspace_id = ? AND source_entity_id = ? AND deleted_at IS NULL
       AND type IN ('task.belongs_to_area', 'task.belongs_to_project')`,
  )
    .bind(ws, taskId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Count ALL rows (active or soft-deleted) for one (task, parent, type) triple. */
async function linkRows(
  ws: string,
  taskId: string,
  parentId: string,
): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM entity_links
     WHERE workspace_id = ? AND source_entity_id = ? AND target_entity_id = ?`,
  )
    .bind(ws, taskId, parentId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

async function inboxCount(tasks: ReturnType<typeof taskRepo>): Promise<number> {
  const grouped = await tasks.listWorkspaceTaskGroups({
    dimension: "parent",
    view: "inbox",
    todayIso: TODAY,
    bucketLimit: 1,
  });
  return grouped.groups.reduce((total, group) => total + group.count, 0);
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("the Inbox query means active, unassigned Tasks", () => {
  it("includes a fully-planned unassigned Task and excludes an assigned one", async () => {
    const { project } = await seedSpine(WS);
    const tasks = taskRepo(WS);
    const unassigned = await tasks.createTask({
      title: "Unassigned but planned",
      timeSector: "this_week",
      scheduledDate: TODAY,
      dueDate: "2026-08-05",
      priority: "p1",
    });
    const assigned = await tasks.createTask({
      title: "Assigned with nothing else set",
      parent: { kind: "project", id: project.id },
    });

    const page = await tasks.listWorkspaceTasks({
      view: "inbox",
      todayIso: TODAY,
    });
    const ids = page.items.map((item) => item.id);
    expect(ids).toContain(unassigned.id);
    expect(ids).not.toContain(assigned.id);
  });

  it("excludes completed, cancelled and Someday/Maybe unassigned Tasks", async () => {
    const tasks = taskRepo(WS);
    const open = await tasks.createTask({ title: "Still to triage" });
    const completed = await tasks.createTask({ title: "Already done" });
    const cancelled = await tasks.createTask({ title: "Not proceeding" });
    const someday = await tasks.createTask({ title: "One day" });
    await tasks.completeTask(completed.id);
    await tasks.updateTask(cancelled.id, { status: "cancelled" });
    await tasks.updateTask(someday.id, { commitmentState: "someday" });

    const page = await tasks.listWorkspaceTasks({
      view: "inbox",
      todayIso: TODAY,
    });
    const ids = page.items.map((item) => item.id);
    expect(ids).toEqual([open.id]);
  });

  it("updates the authoritative Inbox count across filing, completion, reopen and delete", async () => {
    const { area } = await seedSpine(WS);
    const tasks = taskRepo(WS);
    const task = await tasks.createTask({ title: "Count me truthfully" });

    expect(await inboxCount(tasks)).toBe(1);

    await tasks.setTaskParent(task.id, { kind: "area", id: area.id });
    expect(await inboxCount(tasks)).toBe(0);

    await tasks.setTaskParent(task.id, null);
    expect(await inboxCount(tasks)).toBe(1);

    await tasks.completeTask(task.id);
    expect(await inboxCount(tasks)).toBe(0);

    await tasks.reopenTask(task.id);
    expect(await inboxCount(tasks)).toBe(1);

    await tasks.deleteTasks([task.id]);
    expect(await inboxCount(tasks)).toBe(0);

    await tasks.restoreTasks([task.id]);
    expect(await inboxCount(tasks)).toBe(1);
  });

  it("reports an Unassigned Task with a null parent in the collection projection", async () => {
    const tasks = taskRepo(WS);
    const task = await tasks.createTask({ title: "No parent yet" });
    const page = await tasks.listWorkspaceTasks({ todayIso: TODAY });
    const row = page.items.find((item) => item.id === task.id);
    expect(row?.parent).toBeNull();
  });

  it("keeps a saved-view configuration that filters by parent type working", async () => {
    const { project } = await seedSpine(WS);
    const tasks = taskRepo(WS);
    const unassigned = await tasks.createTask({ title: "Rootless" });
    const assigned = await tasks.createTask({
      title: "Rooted",
      parent: { kind: "project", id: project.id },
    });

    const none = await tasks.listWorkspaceTasks({
      filters: { parentKind: "none" },
      todayIso: TODAY,
    });
    expect(none.items.map((item) => item.id)).toEqual([unassigned.id]);

    const inProject = await tasks.listWorkspaceTasks({
      filters: { parentKind: "project" },
      todayIso: TODAY,
    });
    expect(inProject.items.map((item) => item.id)).toEqual([assigned.id]);
  });

  it("groups Unassigned Tasks under their own parent bucket with an authoritative count", async () => {
    const { project } = await seedSpine(WS);
    const tasks = taskRepo(WS);
    await tasks.createTask({ title: "Rootless one" });
    await tasks.createTask({ title: "Rootless two" });
    await tasks.createTask({
      title: "Rooted",
      parent: { kind: "project", id: project.id },
    });

    const grouped = await tasks.listWorkspaceTaskGroups({
      dimension: "parent",
      todayIso: TODAY,
    });
    const none = grouped.groups.find((group) => group.key === "__none");
    expect(none?.count).toBe(2);
  });

  it("finds an Unassigned Task through global task search", async () => {
    const tasks = taskRepo(WS);
    await tasks.createTask({ title: "Renew the passport" });
    const hits = await tasks.searchTasks({ text: "passport", limit: 5 });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.parent).toBeNull();
  });
});

describe("canonical parent mutation", () => {
  it("preserves every other field when assigning, moving and clearing", async () => {
    const { area, project } = await seedSpine(WS);
    const tasks = taskRepo(WS);
    const task = await tasks.createTask({
      title: "Carry my state",
      priority: "p1",
      timeSector: "next_week",
      scheduledDate: "2026-08-01",
      dueDate: "2026-08-04",
      recurrence: { frequency: "week", dateKind: "scheduled" },
    });
    await tasks.updateTask(task.id, {
      description: "Notes that must survive",
      status: "in_progress",
    });
    await tasks.setWaiting(task.id, {
      target: { kind: "text", note: "the printer" },
    });

    const assigned = await tasks.setTaskParent(task.id, {
      kind: "area",
      id: area.id,
    });
    expect(assigned.task.area?.id).toBe(area.id);
    expect(assigned.task.priority).toBe("p1");
    expect(assigned.task.timeSector).toBe("next_week");
    expect(assigned.task.scheduledDate).toBe("2026-08-01");
    expect(assigned.task.dueDate).toBe("2026-08-04");
    expect(assigned.task.status).toBe("in_progress");
    expect(assigned.task.description).toBe("Notes that must survive");
    expect(assigned.task.waiting).not.toBeNull();
    expect(assigned.task.recurrence).toMatchObject({ frequency: "week" });

    const moved = await tasks.setTaskParent(task.id, {
      kind: "project",
      id: project.id,
    });
    expect(moved.task.project?.id).toBe(project.id);
    expect(moved.task.waiting).not.toBeNull();
    expect(await activeParentLinks(WS, task.id)).toBe(1);

    const cleared = await tasks.setTaskParent(task.id, null);
    expect(cleared.task.project).toBeNull();
    expect(cleared.task.area).toBeNull();
    expect(cleared.task.waiting).not.toBeNull();
    expect(await activeParentLinks(WS, task.id)).toBe(0);
  });

  it("keeps a completed Task completed when its parent changes", async () => {
    const { area } = await seedSpine(WS);
    const tasks = taskRepo(WS);
    const task = await tasks.createTask({ title: "Done and filed" });
    await tasks.completeTask(task.id);
    const moved = await tasks.setTaskParent(task.id, {
      kind: "area",
      id: area.id,
    });
    expect(moved.task.completedAt).not.toBeNull();
  });

  it("is idempotent and writes no duplicate active link", async () => {
    const { area } = await seedSpine(WS);
    const tasks = taskRepo(WS);
    const task = await tasks.createTask({ title: "Assign me twice" });
    const first = await tasks.setTaskParent(task.id, {
      kind: "area",
      id: area.id,
    });
    const second = await tasks.setTaskParent(task.id, {
      kind: "area",
      id: area.id,
    });
    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(await activeParentLinks(WS, task.id)).toBe(1);
  });

  it("REUSES the previous link row when a Task returns to an earlier parent", async () => {
    const { area } = await seedSpine(WS);
    const tasks = taskRepo(WS);
    const task = await tasks.createTask({ title: "There and back" });
    await tasks.setTaskParent(task.id, { kind: "area", id: area.id });
    await tasks.setTaskParent(task.id, null);
    await tasks.setTaskParent(task.id, { kind: "area", id: area.id });
    expect(await activeParentLinks(WS, task.id)).toBe(1);
    // Restored, not duplicated: exactly one row for this (task, parent) pair.
    expect(await linkRows(WS, task.id, area.id)).toBe(1);
  });

  it("rejects a missing destination and changes nothing", async () => {
    const tasks = taskRepo(WS);
    const task = await tasks.createTask({ title: "Stay in Inbox" });
    await expect(
      tasks.setTaskParent(task.id, { kind: "area", id: "ent_missing" }),
    ).rejects.toBeInstanceOf(SpineParentUnavailableError);
    expect(await activeParentLinks(WS, task.id)).toBe(0);
  });

  it("rejects a wrong-kind destination", async () => {
    const { project } = await seedSpine(WS);
    const tasks = taskRepo(WS);
    const task = await tasks.createTask({ title: "Wrong kind" });
    await expect(
      tasks.setTaskParent(task.id, { kind: "area", id: project.id }),
    ).rejects.toBeInstanceOf(SpineParentUnavailableError);
    expect(await activeParentLinks(WS, task.id)).toBe(0);
  });

  it("rejects an ARCHIVED Project destination", async () => {
    const { project } = await seedSpine(WS);
    const settings = makeProjectSettingsRepository(makeContext(WS));
    await settings.archive(project.id);
    const tasks = taskRepo(WS);
    const task = await tasks.createTask({ title: "Not into an archive" });
    await expect(
      tasks.setTaskParent(task.id, { kind: "project", id: project.id }),
    ).rejects.toBeInstanceOf(SpineParentUnavailableError);
    expect(await activeParentLinks(WS, task.id)).toBe(0);
  });

  it("rejects a deleted destination", async () => {
    const { spine, area } = await seedSpine(WS);
    const tasks = taskRepo(WS);
    const task = await tasks.createTask({ title: "Into a hole" });
    const extra = await spine.createArea({ title: "Temporary" });
    await spine.softDelete(extra.id);
    await expect(
      tasks.setTaskParent(task.id, { kind: "area", id: extra.id }),
    ).rejects.toBeInstanceOf(SpineParentUnavailableError);
    expect(area.id).toBeTruthy();
  });

  it("rejects a CROSS-WORKSPACE destination", async () => {
    const { area } = await seedSpine(OTHER);
    const tasks = taskRepo(WS);
    const task = await tasks.createTask({ title: "Not across workspaces" });
    await expect(
      tasks.setTaskParent(task.id, { kind: "area", id: area.id }),
    ).rejects.toBeInstanceOf(SpineParentUnavailableError);
    expect(await activeParentLinks(WS, task.id)).toBe(0);
  });

  it("is not found for a cross-workspace Task", async () => {
    const tasks = taskRepo(WS);
    const task = await tasks.createTask({ title: "Mine only" });
    const { area } = await seedSpine(OTHER);
    await expect(
      taskRepo(OTHER).setTaskParent(task.id, { kind: "area", id: area.id }),
    ).rejects.toBeInstanceOf(TaskNotFoundError);
  });

  it("writes structural link Activity for the change", async () => {
    const { area } = await seedSpine(WS);
    const tasks = taskRepo(WS);
    const task = await tasks.createTask({ title: "Audit me" });
    await tasks.setTaskParent(task.id, { kind: "area", id: area.id });
    await tasks.setTaskParent(task.id, null);

    const rows = await env.DB.prepare(
      `SELECT a.type AS type
       FROM activities a
       JOIN activity_subjects s
         ON s.workspace_id = a.workspace_id AND s.activity_id = a.id
       WHERE a.workspace_id = ? AND s.entity_id = ?
       ORDER BY a.occurred_at ASC, a.id ASC`,
    )
      .bind(WS, task.id)
      .all<{ type: string }>();
    const types = (rows.results ?? []).map((row) => row.type);
    expect(types).toContain("entity_link.created");
    expect(types).toContain("entity_link.unlinked");
  });

  it("moves an assigned Task into a Project's task list and out again", async () => {
    const { project } = await seedSpine(WS);
    const tasks = taskRepo(WS);
    const task = await tasks.createTask({ title: "Project bound" });

    await tasks.setTaskParent(task.id, { kind: "project", id: project.id });
    const withTask = await tasks.listProjectTasks(project.id);
    expect(withTask.items.map((item) => item.id)).toContain(task.id);

    await tasks.setTaskParent(task.id, null);
    const without = await tasks.listProjectTasks(project.id);
    expect(without.items.map((item) => item.id)).not.toContain(task.id);
  });
});

describe("Today and /tasks agree about what is active work (DEBT-37)", () => {
  /**
   * One seeded task per state, all scheduled for the same day, so the planning query
   * and the active workspace views can be compared directly.
   */
  async function seedStates() {
    const tasks = taskRepo(WS);
    const make = async (title: string) => {
      const task = await tasks.createTask({
        title,
        scheduledDate: TODAY,
      });
      return task.id;
    };
    const active = await make("Active work");
    const inProgress = await make("In progress work");
    const waiting = await make("Waiting work");
    const onHold = await make("On hold work");
    const someday = await make("Someday work");
    const cancelled = await make("Cancelled work");
    const completed = await make("Completed work");

    await tasks.updateTask(inProgress, { status: "in_progress" });
    await tasks.setWaiting(waiting, {
      target: { kind: "text", note: "a supplier" },
    });
    await tasks.updateTask(onHold, { status: "on_hold" });
    await tasks.updateTask(someday, { commitmentState: "someday" });
    await tasks.updateTask(cancelled, { status: "cancelled" });
    await tasks.completeTask(completed);

    return {
      tasks,
      active,
      inProgress,
      waiting,
      onHold,
      someday,
      cancelled,
      completed,
    };
  }

  it("excludes on-hold, Someday/Maybe, cancelled and waiting tasks from Today's active bands", async () => {
    const seeded = await seedStates();
    const page = await seeded.tasks.listPlanningTasks({ todayIso: TODAY });
    const ids = page.items
      .filter((item) => item.completedAt === null)
      .map((item) => item.id);

    expect(ids).toContain(seeded.active);
    expect(ids).toContain(seeded.inProgress);
    expect(ids).not.toContain(seeded.onHold);
    expect(ids).not.toContain(seeded.someday);
    expect(ids).not.toContain(seeded.cancelled);
    expect(ids).not.toContain(seeded.waiting);
  });

  it("keeps completions visible to Today so 'completed today' still works", async () => {
    const seeded = await seedStates();
    const page = await seeded.tasks.listPlanningTasks({ todayIso: TODAY });
    const completed = page.items.find((item) => item.id === seeded.completed);
    expect(completed?.completedAt).not.toBeNull();
  });

  it("uses the same due-or-planned definition for Today and the Tasks Today view", async () => {
    const tasks = taskRepo(WS);
    const dueOnly = await tasks.createTask({
      title: "Due only",
      dueDate: TODAY,
    });
    const plannedOnly = await tasks.createTask({
      title: "Planned only",
      scheduledDate: TODAY,
    });
    const waitingDue = await tasks.createTask({
      title: "Waiting due",
      dueDate: TODAY,
    });
    await tasks.setWaiting(waitingDue.id, {
      target: { kind: "text", note: "a supplier" },
    });

    const planning = await tasks.listPlanningTasks({ todayIso: TODAY });
    const todayView = await tasks.listWorkspaceTasks({
      view: "today",
      todayIso: TODAY,
    });

    const planningIds = planning.items.map((item) => item.id);
    const todayIds = todayView.items.map((item) => item.id);
    expect(planningIds).toEqual(
      expect.arrayContaining([dueOnly.id, plannedOnly.id]),
    );
    expect(todayIds).toEqual(
      expect.arrayContaining([dueOnly.id, plannedOnly.id]),
    );
    expect(todayIds).not.toContain(waitingDue.id);
  });

  it("agrees with the /tasks active view on every state", async () => {
    const seeded = await seedStates();
    const planning = await seeded.tasks.listPlanningTasks({ todayIso: TODAY });
    const planningActive = new Set(
      planning.items
        .filter((item) => item.completedAt === null && item.waiting === null)
        .map((item) => item.id),
    );
    const collection = await seeded.tasks.listWorkspaceTasks({
      view: "active",
      todayIso: TODAY,
    });
    const collectionActive = new Set(collection.items.map((item) => item.id));

    for (const id of [seeded.onHold, seeded.someday, seeded.cancelled]) {
      expect(planningActive.has(id)).toBe(false);
      expect(collectionActive.has(id)).toBe(false);
    }
    for (const id of [seeded.active, seeded.inProgress]) {
      expect(planningActive.has(id)).toBe(true);
      expect(collectionActive.has(id)).toBe(true);
    }
  });

  it("shows a recurring successor on Today as ordinary active work", async () => {
    const tasks = taskRepo(WS);
    const task = await tasks.createTask({
      title: "Daily stretch",
      scheduledDate: "2026-07-29",
      recurrence: { frequency: "day", dateKind: "scheduled" },
    });
    const { successor } = await tasks.completeTask(task.id, {
      ownerTodayIso: "2026-07-29",
    });
    expect(successor?.scheduledDate).toBe(TODAY);

    const page = await tasks.listPlanningTasks({ todayIso: TODAY });
    const row = page.items.find((item) => item.id === successor?.id);
    expect(row?.scheduledDate).toBe(TODAY);
    expect(row?.completedAt).toBeNull();
  });
});
