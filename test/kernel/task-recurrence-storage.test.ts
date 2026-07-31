/**
 * TASKS-04 / ADR-062 — real Workers/D1 integration tests for the PERSISTED
 * recurrence lifecycle: validation at the mutation boundary, storage and read-back,
 * update and removal, exactly-one successor on completion (including under a retry
 * and a concurrent completion), the documented field-copy contract, and the SAFE undo
 * of a recurring completion.
 *
 * These are the tests that stop recurrence being a rule the product parses but never
 * keeps: every assertion goes through the real repository against real D1.
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  TASK_RECURRENCE_OCCURRENCE_CREATED,
  TASK_RECURRENCE_OCCURRENCE_WITHDRAWN,
  TaskNotFoundError,
  TaskProjectArchivedError,
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

const WS = "ws_task_recurrence";
const OTHER = "ws_task_recurrence_other";

const nextEntityId = sequentialIds("rec");
const nextActivityId = sequentialIds("ract");

function spineRepo(ws: string) {
  return makeSpineRepository(makeContext(ws), {
    clock: new FakeClock("2026-07-20T09:00:00.000Z").now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

function taskRepo(ws: string, at = "2026-07-20T09:00:00.000Z") {
  return makeTaskRepository(makeContext(ws), {
    clock: new FakeClock(at).now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

/** An Area + a scheduled Task under it — the ordinary shape a recurrence attaches to. */
async function seedScheduledTask(
  ws: string,
  overrides: {
    readonly scheduledDate?: string | null;
    readonly dueDate?: string | null;
    readonly title?: string;
  } = {},
) {
  const spine = spineRepo(ws);
  const area = await spine.createArea({ title: "Home" });
  const tasks = taskRepo(ws);
  const task = await tasks.createTask({
    title: overrides.title ?? "Water the garden",
    parent: { kind: "area", id: area.id },
    priority: "p2",
    timeSector: "this_week",
    ...(overrides.scheduledDate === undefined
      ? { scheduledDate: "2026-07-20" }
      : overrides.scheduledDate === null
        ? {}
        : { scheduledDate: overrides.scheduledDate }),
    ...(overrides.dueDate ? { dueDate: overrides.dueDate } : {}),
  });
  return { area, task };
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("recurrence validation at the mutation boundary", () => {
  it("refuses a scheduled-date rule when the task has no scheduled date", async () => {
    const { task } = await seedScheduledTask(WS, { scheduledDate: null });
    const tasks = taskRepo(WS);
    await expect(
      tasks.setTaskRecurrence(task.id, {
        frequency: "week",
        dateKind: "scheduled",
      }),
    ).rejects.toBeInstanceOf(TaskValidationError);
    const after = await tasks.getTask(task.id);
    expect(after?.recurrence ?? null).toBeNull();
  });

  it("refuses a due-date rule when the task has no due date", async () => {
    const { task } = await seedScheduledTask(WS);
    const tasks = taskRepo(WS);
    await expect(
      tasks.setTaskRecurrence(task.id, {
        frequency: "month",
        dateKind: "due",
      }),
    ).rejects.toBeInstanceOf(TaskValidationError);
  });

  it("derives the monthly day-of-month from the anchor date and keeps it", async () => {
    const { task } = await seedScheduledTask(WS, {
      scheduledDate: "2026-01-31",
    });
    const tasks = taskRepo(WS);
    const { task: saved } = await tasks.setTaskRecurrence(task.id, {
      frequency: "month",
      dateKind: "scheduled",
    });
    expect(saved.recurrence).toMatchObject({
      frequency: "month",
      interval: 1,
      dateKind: "scheduled",
      anchorDay: 31,
    });
  });

  it("derives the yearly month and day from the anchor date", async () => {
    const { task } = await seedScheduledTask(WS, {
      scheduledDate: "2028-02-29",
    });
    const tasks = taskRepo(WS);
    const { task: saved } = await tasks.setTaskRecurrence(task.id, {
      frequency: "year",
      dateKind: "scheduled",
    });
    expect(saved.recurrence).toMatchObject({ anchorMonth: 2, anchorDay: 29 });
  });

  it("rejects selected weekdays on a non-weekly rule", async () => {
    const { task } = await seedScheduledTask(WS);
    const tasks = taskRepo(WS);
    await expect(
      tasks.setTaskRecurrence(task.id, {
        frequency: "day",
        dateKind: "scheduled",
        weekdays: [1, 3],
      }),
    ).rejects.toBeInstanceOf(TaskValidationError);
  });

  it("is not found for a cross-workspace task", async () => {
    const { task } = await seedScheduledTask(WS);
    const other = taskRepo(OTHER);
    await expect(
      other.setTaskRecurrence(task.id, {
        frequency: "week",
        dateKind: "scheduled",
      }),
    ).rejects.toBeInstanceOf(TaskNotFoundError);
  });
});

describe("recurrence persistence, update and removal", () => {
  it("persists a rule, reads it back on every task view, and starts a series", async () => {
    const { task } = await seedScheduledTask(WS);
    const tasks = taskRepo(WS);
    await tasks.setTaskRecurrence(task.id, {
      frequency: "week",
      dateKind: "scheduled",
      weekdays: [1],
    });

    const view = await tasks.getTask(task.id);
    expect(view?.recurrence).toMatchObject({
      frequency: "week",
      interval: 1,
      dateKind: "scheduled",
      weekdays: [1],
    });
    expect(view?.recurrenceSeries).toEqual({
      seriesId: task.id,
      sequence: 0,
    });

    // The collection projection carries it too, so a list row can show "Repeats".
    const page = await tasks.listWorkspaceTasks({
      limit: 25,
      todayIso: "2026-07-20",
    });
    const row = page.items.find((item) => item.id === task.id);
    expect(row?.recurrence).toMatchObject({ frequency: "week" });
  });

  it("updates a rule in place, keeping the series identity", async () => {
    const { task } = await seedScheduledTask(WS);
    const tasks = taskRepo(WS);
    await tasks.setTaskRecurrence(task.id, {
      frequency: "week",
      dateKind: "scheduled",
    });
    const { changed, task: updated } = await tasks.setTaskRecurrence(task.id, {
      frequency: "week",
      dateKind: "scheduled",
      interval: 2,
    });
    expect(changed).toBe(true);
    expect(updated.recurrence).toMatchObject({ interval: 2 });
    expect(updated.recurrenceSeries).toEqual({
      seriesId: task.id,
      sequence: 0,
    });
  });

  it("is an idempotent no-op when the rule is unchanged", async () => {
    const { task } = await seedScheduledTask(WS);
    const tasks = taskRepo(WS);
    await tasks.setTaskRecurrence(task.id, {
      frequency: "day",
      dateKind: "scheduled",
    });
    const again = await tasks.setTaskRecurrence(task.id, {
      frequency: "day",
      dateKind: "scheduled",
      interval: 1,
    });
    expect(again.changed).toBe(false);
  });

  it("removes a rule with null and leaves every other field untouched", async () => {
    const { task } = await seedScheduledTask(WS, { dueDate: "2026-07-24" });
    const tasks = taskRepo(WS);
    await tasks.setTaskRecurrence(task.id, {
      frequency: "week",
      dateKind: "scheduled",
    });
    const { changed, task: cleared } = await tasks.setTaskRecurrence(
      task.id,
      null,
    );
    expect(changed).toBe(true);
    expect(cleared.recurrence ?? null).toBeNull();
    expect(cleared.recurrenceSeries ?? null).toBeNull();
    expect(cleared.scheduledDate).toBe("2026-07-20");
    expect(cleared.dueDate).toBe("2026-07-24");
    expect(cleared.priority).toBe("p2");
    expect(cleared.timeSector).toBe("this_week");
    expect(cleared.area?.id).toBeTruthy();
  });

  it("keeps the rule when the task is moved between parents", async () => {
    const { task } = await seedScheduledTask(WS);
    const spine = spineRepo(WS);
    const area = await spine.createArea({ title: "Garden" });
    const project = await spine.createProject({
      title: "Spring planting",
      parent: { kind: "area", id: area.id },
    });
    const tasks = taskRepo(WS);
    await tasks.setTaskRecurrence(task.id, {
      frequency: "week",
      dateKind: "scheduled",
    });
    const moved = await tasks.setTaskParent(task.id, {
      kind: "project",
      id: project.id,
    });
    expect(moved.task.recurrence).toMatchObject({ frequency: "week" });
    expect(moved.task.project?.id).toBe(project.id);

    const inbox = await tasks.setTaskParent(task.id, null);
    expect(inbox.task.recurrence).toMatchObject({ frequency: "week" });
  });

  it("writes the rule in the SAME batch as the create", async () => {
    const spine = spineRepo(WS);
    const area = await spine.createArea({ title: "Admin" });
    const tasks = taskRepo(WS);
    const created = await tasks.createTask({
      title: "File the BAS",
      parent: { kind: "area", id: area.id },
      dueDate: "2026-07-28",
      recurrence: { frequency: "month", dateKind: "due" },
    });
    expect(created.recurrence).toMatchObject({
      frequency: "month",
      dateKind: "due",
      anchorDay: 28,
    });
    expect(created.recurrenceSeries).toEqual({
      seriesId: created.id,
      sequence: 0,
    });
  });

  it("refuses to create a recurring task with no anchor date, writing nothing", async () => {
    const spine = spineRepo(WS);
    const area = await spine.createArea({ title: "Admin" });
    const tasks = taskRepo(WS);
    await expect(
      tasks.createTask({
        title: "Impossible repeat",
        parent: { kind: "area", id: area.id },
        recurrence: { frequency: "week", dateKind: "scheduled" },
      }),
    ).rejects.toBeInstanceOf(TaskValidationError);
    const page = await tasks.listWorkspaceTasks({
      limit: 25,
      todayIso: "2026-07-20",
    });
    expect(page.items.some((item) => item.title === "Impossible repeat")).toBe(
      false,
    );
  });
});

describe("completion creates exactly one successor", () => {
  it("creates one successor, advances only the anchor date, and copies the agreed fields", async () => {
    const { area, task } = await seedScheduledTask(WS);
    const tasks = taskRepo(WS);
    await tasks.updateTask(task.id, { description: "Deep water the beds" });
    await tasks.setTaskRecurrence(task.id, {
      frequency: "week",
      dateKind: "scheduled",
    });

    const result = await tasks.completeTask(task.id, {
      ownerTodayIso: "2026-07-20",
    });
    expect(result.changed).toBe(true);
    const successor = result.successor;
    expect(successor).not.toBeNull();
    expect(successor!.id).not.toBe(task.id);

    // Copied: title, description, parent, priority, sector, commitment, rule, series.
    expect(successor!.title).toBe("Water the garden");
    expect(successor!.description).toBe("Deep water the beds");
    expect(successor!.area?.id).toBe(area.id);
    expect(successor!.priority).toBe("p2");
    expect(successor!.timeSector).toBe("this_week");
    expect(successor!.commitmentState).toBe("active");
    expect(successor!.recurrence).toMatchObject({
      frequency: "week",
      dateKind: "scheduled",
    });
    expect(successor!.recurrenceSeries).toEqual({
      seriesId: task.id,
      sequence: 1,
    });

    // NOT copied: completion. The anchor advanced by exactly one week.
    expect(successor!.completedAt).toBeNull();
    expect(successor!.status).toBe("todo");
    expect(successor!.scheduledDate).toBe("2026-07-27");
    expect(successor!.dueDate).toBeNull();

    // The completed occurrence remains as history, with its rule intact.
    const completed = await tasks.getTask(task.id);
    expect(completed?.completedAt).not.toBeNull();
    expect(completed?.recurrence).toMatchObject({ frequency: "week" });

    // One legible series event.
    expect(
      await countActivitiesOfType(TASK_RECURRENCE_OCCURRENCE_CREATED),
    ).toBe(1);
  });

  it("preserves the gap between the scheduled and due dates", async () => {
    const { task } = await seedScheduledTask(WS, {
      scheduledDate: "2026-07-20",
      dueDate: "2026-07-24",
    });
    const tasks = taskRepo(WS);
    await tasks.setTaskRecurrence(task.id, {
      frequency: "week",
      dateKind: "scheduled",
    });
    const { successor } = await tasks.completeTask(task.id, {
      ownerTodayIso: "2026-07-20",
    });
    expect(successor!.scheduledDate).toBe("2026-07-27");
    expect(successor!.dueDate).toBe("2026-07-31");
  });

  it("clears waiting and does not copy it to the successor", async () => {
    const { task } = await seedScheduledTask(WS);
    const tasks = taskRepo(WS);
    await tasks.setWaiting(task.id, {
      target: { kind: "text", note: "the council" },
    });
    await tasks.setTaskRecurrence(task.id, {
      frequency: "day",
      dateKind: "scheduled",
    });
    const result = await tasks.completeTask(task.id, {
      ownerTodayIso: "2026-07-20",
    });
    expect(result.task.waiting).toBeNull();
    expect(result.successor!.waiting).toBeNull();
  });

  it("does not copy delegation to the successor", async () => {
    const { task } = await seedScheduledTask(WS);
    const tasks = taskRepo(WS);
    await tasks.updateTask(task.id, {
      delegation: { to: "Sam", delegatedOn: "2026-07-19" },
    });
    await tasks.setTaskRecurrence(task.id, {
      frequency: "day",
      dateKind: "scheduled",
    });
    const { successor } = await tasks.completeTask(task.id, {
      ownerTodayIso: "2026-07-20",
    });
    expect(successor!.delegation).toBeNull();
  });

  it("schedules after the OWNER's completion day, skipping missed intervals", async () => {
    const { task } = await seedScheduledTask(WS, {
      scheduledDate: "2026-07-01",
    });
    const tasks = taskRepo(WS);
    await tasks.setTaskRecurrence(task.id, {
      frequency: "day",
      dateKind: "scheduled",
    });
    // Completed three weeks late: the next occurrence is tomorrow, not a replay of
    // every missed day.
    const { successor } = await tasks.completeTask(task.id, {
      ownerTodayIso: "2026-07-22",
    });
    expect(successor!.scheduledDate).toBe("2026-07-23");
  });

  it("creates no successor for a one-off task", async () => {
    const { task } = await seedScheduledTask(WS);
    const tasks = taskRepo(WS);
    const result = await tasks.completeTask(task.id);
    expect(result.successor ?? null).toBeNull();
  });

  it("creates no second successor when completion is repeated (retry-safe)", async () => {
    const { task } = await seedScheduledTask(WS);
    const tasks = taskRepo(WS);
    await tasks.setTaskRecurrence(task.id, {
      frequency: "week",
      dateKind: "scheduled",
    });
    const first = await tasks.completeTask(task.id, {
      ownerTodayIso: "2026-07-20",
    });
    const second = await tasks.completeTask(task.id, {
      ownerTodayIso: "2026-07-20",
    });
    expect(second.changed).toBe(false);
    expect(second.successor ?? null).toBeNull();

    const page = await tasks.listWorkspaceTasks({
      limit: 50,
      todayIso: "2026-07-20",
      filters: { completedVisibility: "include" },
    });
    const occurrences = page.items.filter(
      (item) => item.title === "Water the garden",
    );
    expect(occurrences).toHaveLength(2);
    expect(first.successor!.id).toBeTruthy();
  });

  it("creates exactly one successor when two completions race", async () => {
    const { task } = await seedScheduledTask(WS);
    const tasks = taskRepo(WS);
    await tasks.setTaskRecurrence(task.id, {
      frequency: "week",
      dateKind: "scheduled",
    });
    // Two repositories, each having read the OPEN task, both completing.
    const a = taskRepo(WS, "2026-07-20T09:00:00.000Z");
    const b = taskRepo(WS, "2026-07-20T09:00:01.000Z");
    const [first, second] = await Promise.all([
      a.completeTask(task.id, { ownerTodayIso: "2026-07-20" }),
      b.completeTask(task.id, { ownerTodayIso: "2026-07-20" }),
    ]);
    const winners = [first, second].filter((result) => result.changed);
    expect(winners).toHaveLength(1);
    expect(
      await countActivitiesOfType(TASK_RECURRENCE_OCCURRENCE_CREATED),
    ).toBe(1);
    // The loser still reports the ONE successor that exists.
    const loser = [first, second].find((result) => !result.changed)!;
    expect(loser.successor?.id).toBe(winners[0]!.successor?.id);
  });

  it("keeps the successor in the same Project as its predecessor", async () => {
    const spine = spineRepo(WS);
    const area = await spine.createArea({ title: "Work" });
    const project = await spine.createProject({
      title: "Quarterly reporting",
      parent: { kind: "area", id: area.id },
    });
    const tasks = taskRepo(WS);
    const task = await tasks.createTask({
      title: "Send the board pack",
      parent: { kind: "project", id: project.id },
      dueDate: "2026-07-31",
      recurrence: { frequency: "month", dateKind: "due" },
    });
    const { successor } = await tasks.completeTask(task.id, {
      ownerTodayIso: "2026-07-31",
    });
    expect(successor!.project?.id).toBe(project.id);
    expect(successor!.dueDate).toBe("2026-08-31");
  });

  it("keeps an Unassigned recurring task Unassigned", async () => {
    const tasks = taskRepo(WS);
    const task = await tasks.createTask({
      title: "Weekly review",
      scheduledDate: "2026-07-20",
      recurrence: { frequency: "week", dateKind: "scheduled" },
    });
    const { successor } = await tasks.completeTask(task.id, {
      ownerTodayIso: "2026-07-20",
    });
    expect(successor!.project).toBeNull();
    expect(successor!.area).toBeNull();
    expect(successor!.scheduledDate).toBe("2026-07-27");
  });

  it("creates the successor for a BULK completion too", async () => {
    const { task } = await seedScheduledTask(WS);
    const tasks = taskRepo(WS);
    await tasks.setTaskRecurrence(task.id, {
      frequency: "week",
      dateKind: "scheduled",
    });
    const result = await tasks.completeTasks([task.id], {
      ownerTodayIso: "2026-07-20",
    });
    expect(result.changed).toBe(1);
    const page = await tasks.listWorkspaceTasks({
      limit: 50,
      todayIso: "2026-07-20",
    });
    const occurrences = page.items.filter(
      (item) => item.title === "Water the garden",
    );
    const open = occurrences.filter((item) => item.completedAt === null);
    expect(open).toHaveLength(1);
    expect(open[0]!.scheduledDate).toBe("2026-07-27");
  });

  it("clamps a monthly rule in a short month but returns to the requested day", async () => {
    const tasks = taskRepo(WS);
    const task = await tasks.createTask({
      title: "Pay the levy",
      scheduledDate: "2026-01-31",
      recurrence: { frequency: "month", dateKind: "scheduled" },
    });
    const first = await tasks.completeTask(task.id, {
      ownerTodayIso: "2026-01-31",
    });
    expect(first.successor!.scheduledDate).toBe("2026-02-28");
    const second = await tasks.completeTask(first.successor!.id, {
      ownerTodayIso: "2026-02-28",
    });
    // The ORIGINAL requested day survives the clamp.
    expect(second.successor!.scheduledDate).toBe("2026-03-31");
  });
});

describe("safe undo of a recurring completion", () => {
  it("withdraws an untouched successor when the completion is undone", async () => {
    const { task } = await seedScheduledTask(WS);
    const tasks = taskRepo(WS);
    await tasks.setTaskRecurrence(task.id, {
      frequency: "week",
      dateKind: "scheduled",
    });
    const { successor } = await tasks.completeTask(task.id, {
      ownerTodayIso: "2026-07-20",
    });

    const undo = await tasks.reopenTask(task.id);
    expect(undo.changed).toBe(true);
    expect(undo.successorOutcome).toBe("removed");
    expect(undo.task.completedAt).toBeNull();
    expect(await tasks.getTask(successor!.id)).toBeNull();
    expect(
      await countActivitiesOfType(TASK_RECURRENCE_OCCURRENCE_WITHDRAWN),
    ).toBe(1);
  });

  it("RETAINS a successor the owner has already edited", async () => {
    const { task } = await seedScheduledTask(WS);
    const tasks = taskRepo(WS);
    await tasks.setTaskRecurrence(task.id, {
      frequency: "week",
      dateKind: "scheduled",
    });
    const { successor } = await tasks.completeTask(task.id, {
      ownerTodayIso: "2026-07-20",
    });
    // Real work on the successor.
    const later = taskRepo(WS, "2026-07-21T09:00:00.000Z");
    await later.updateTask(successor!.id, { title: "Water the new beds" });

    const undo = later.reopenTask(task.id);
    const outcome = await undo;
    expect(outcome.successorOutcome).toBe("retained");
    expect(outcome.task.completedAt).toBeNull();
    const kept = await tasks.getTask(successor!.id);
    expect(kept?.title).toBe("Water the new beds");
    expect(
      await countActivitiesOfType(TASK_RECURRENCE_OCCURRENCE_WITHDRAWN),
    ).toBe(0);
  });

  it("RETAINS a successor that has already been completed", async () => {
    const { task } = await seedScheduledTask(WS);
    const tasks = taskRepo(WS);
    await tasks.setTaskRecurrence(task.id, {
      frequency: "day",
      dateKind: "scheduled",
    });
    const { successor } = await tasks.completeTask(task.id, {
      ownerTodayIso: "2026-07-20",
    });
    const later = taskRepo(WS, "2026-07-21T09:00:00.000Z");
    await later.completeTask(successor!.id, { ownerTodayIso: "2026-07-21" });

    const undo = await later.reopenTask(task.id);
    expect(undo.successorOutcome).toBe("retained");
    expect(await tasks.getTask(successor!.id)).not.toBeNull();
  });

  it("RETAINS a successor that has been planned from a list row", async () => {
    const { task } = await seedScheduledTask(WS);
    const tasks = taskRepo(WS);
    await tasks.setTaskRecurrence(task.id, {
      frequency: "week",
      dateKind: "scheduled",
    });
    const { successor } = await tasks.completeTask(task.id, {
      ownerTodayIso: "2026-07-20",
    });
    const later = taskRepo(WS, "2026-07-21T09:00:00.000Z");
    await later.planTask(successor!.id, { scheduledDate: "2026-07-30" });

    const undo = await later.reopenTask(task.id);
    expect(undo.successorOutcome).toBe("retained");
    expect((await tasks.getTask(successor!.id))?.scheduledDate).toBe(
      "2026-07-30",
    );
  });

  it("reports `none` and reopens normally for a one-off task", async () => {
    const { task } = await seedScheduledTask(WS);
    const tasks = taskRepo(WS);
    await tasks.completeTask(task.id);
    const undo = await tasks.reopenTask(task.id);
    expect(undo.successorOutcome).toBe("none");
    expect(undo.task.completedAt).toBeNull();
  });

  it("is an idempotent no-op on an already-open task", async () => {
    const { task } = await seedScheduledTask(WS);
    const tasks = taskRepo(WS);
    const undo = await tasks.reopenTask(task.id);
    expect(undo.changed).toBe(false);
    expect(undo.successorOutcome).toBe("none");
  });

  it("never restores a cleared waiting state", async () => {
    const { task } = await seedScheduledTask(WS);
    const tasks = taskRepo(WS);
    await tasks.setWaiting(task.id, {
      target: { kind: "text", note: "the council" },
    });
    await tasks.completeTask(task.id);
    const undo = await tasks.reopenTask(task.id);
    expect(undo.task.waiting).toBeNull();
  });

  it("is not found for a cross-workspace task", async () => {
    const { task } = await seedScheduledTask(WS);
    const tasks = taskRepo(WS);
    await tasks.completeTask(task.id);
    await expect(taskRepo(OTHER).reopenTask(task.id)).rejects.toBeInstanceOf(
      TaskNotFoundError,
    );
  });
  it("refuses to reopen a Task inside an ARCHIVED Project, withdrawing nothing", async () => {
    const spine = spineRepo(WS);
    const area = await spine.createArea({ title: "Work" });
    const project = await spine.createProject({
      title: "Wrapped up",
      parent: { kind: "area", id: area.id },
    });
    const tasks = taskRepo(WS);
    const task = await tasks.createTask({
      title: "Last report",
      parent: { kind: "project", id: project.id },
      scheduledDate: "2026-07-20",
      recurrence: { frequency: "week", dateKind: "scheduled" },
    });
    const { successor } = await tasks.completeTask(task.id, {
      ownerTodayIso: "2026-07-20",
    });

    // A Project cannot be archived while it holds unfinished work, and a repeating
    // Task always leaves one open occurrence — so ENDING the series is how a repeating
    // Task in a Project is finished: remove the rule, then complete the last one.
    await tasks.setTaskRecurrence(successor!.id, null);
    await tasks.completeTask(successor!.id, { ownerTodayIso: "2026-07-27" });
    const settings = makeProjectSettingsRepository(makeContext(WS));
    await settings.archive(project.id);

    await expect(tasks.reopenTask(task.id)).rejects.toBeInstanceOf(
      TaskProjectArchivedError,
    );
    // Nothing was written: the occurrence is still complete and its successor stands.
    expect((await tasks.getTask(task.id))?.completedAt).not.toBeNull();
    expect(await tasks.getTask(successor!.id)).not.toBeNull();
  });
});
