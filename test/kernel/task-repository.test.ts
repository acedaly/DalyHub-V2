import { beforeEach, describe, expect, it } from "vitest";

import {
  TaskNotFoundError,
  TaskValidationError,
  type TaskView,
} from "~/kernel/tasks";

import {
  FakeClock,
  countActivities,
  countActivitiesOfType,
  countTaskDetailRows,
  makeContext,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";
import type {
  D1SpineRepositoryOptions,
  D1TaskRepositoryOptions,
} from "~/platform/storage/d1";

const WS = "ws_task_repo";
const OTHER = "ws_task_repo_other";

// Shared, monotonic id generators across ALL repo instances in this file, so
// entity and Activity ids are globally unique even when a test constructs several
// repositories (a fresh generator per repo would reset and collide on ids).
const nextEntityId = sequentialIds("ent");
const nextActivityId = sequentialIds("act");

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
    clock: new FakeClock("2026-07-20T00:00:00.000Z").now,
    activityIdGenerator: nextActivityId,
    ...options,
  });
}

/** Seed Area → Goal → Project → Task and return the ids. */
async function seedHierarchy(ws: string) {
  const spine = spineRepo(ws);
  const area = await spine.createArea({ title: "Career" });
  const goal = await spine.createGoal({ title: "Promotion", areaId: area.id });
  const project = await spine.createProject({
    title: "Ship V2",
    parent: { kind: "goal", id: goal.id },
  });
  const task = await spine.createTask({
    title: "Write the ADR",
    parent: { kind: "project", id: project.id },
  });
  return { area, goal, project, task };
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("task reads", () => {
  it("returns a full view with documented defaults for an unedited task", async () => {
    const { task } = await seedHierarchy(WS);
    const view = await taskRepo(WS).getTask(task.id);

    expect(view).not.toBeNull();
    const v = view as TaskView;
    expect(v.title).toBe("Write the ADR");
    expect(v.completedAt).toBeNull();
    expect(v.status).toBe("todo");
    expect(v.priority).toBeNull();
    expect(v.dueDate).toBeNull();
    expect(v.scheduledDate).toBeNull();
    expect(v.description).toBeNull();
    // No details row is written until the task is first edited.
    expect(await countTaskDetailRows()).toBe(0);
  });

  it("resolves real project, goal and area relationships from the hierarchy", async () => {
    const { area, goal, project, task } = await seedHierarchy(WS);
    const v = (await taskRepo(WS).getTask(task.id)) as TaskView;

    expect(v.project).toEqual({
      kind: "project",
      id: project.id,
      title: "Ship V2",
    });
    expect(v.goal).toEqual({ kind: "goal", id: goal.id, title: "Promotion" });
    expect(v.area).toEqual({ kind: "area", id: area.id, title: "Career" });
  });

  it("resolves only an area for a task that floats directly under an area", async () => {
    const spine = spineRepo(WS);
    const area = await spine.createArea({ title: "Home" });
    const task = await spine.createTask({
      title: "Fix the sink",
      parent: { kind: "area", id: area.id },
    });
    const v = (await taskRepo(WS).getTask(task.id)) as TaskView;
    expect(v.project).toBeNull();
    expect(v.goal).toBeNull();
    expect(v.area).toEqual({ kind: "area", id: area.id, title: "Home" });
  });

  it("returns null for a non-existent id and for a non-task entity", async () => {
    const { project } = await seedHierarchy(WS);
    const tasks = taskRepo(WS);
    expect(await tasks.getTask("does-not-exist")).toBeNull();
    // A project id is a real entity but not a task.
    expect(await tasks.getTask(project.id)).toBeNull();
  });

  it("reflects spine completion in the view without owning it", async () => {
    const { task } = await seedHierarchy(WS);
    await spineRepo(WS).complete(task.id);
    const v = (await taskRepo(WS).getTask(task.id)) as TaskView;
    expect(v.completedAt).not.toBeNull();
    // Completion did not write a task_details row.
    expect(await countTaskDetailRows()).toBe(0);
  });
});

describe("task updates", () => {
  it("persists title and every detail field and appends one entity.updated", async () => {
    const { task } = await seedHierarchy(WS);
    const tasks = taskRepo(WS);
    const activitiesBefore = await countActivities();

    const result = await tasks.updateTask(task.id, {
      title: "Write the persistence ADR",
      status: "in_progress",
      priority: "high",
      dueDate: "2026-08-01",
      scheduledDate: "2026-07-25",
      description: "## Plan\n\nDo the thing.",
    });

    expect(result.changed).toBe(true);
    expect(result.task.title).toBe("Write the persistence ADR");
    expect(result.task.status).toBe("in_progress");
    expect(result.task.priority).toBe("high");
    expect(result.task.dueDate).toBe("2026-08-01");
    expect(result.task.scheduledDate).toBe("2026-07-25");
    expect(result.task.description).toBe("## Plan\n\nDo the thing.");
    // Relationships survive an edit.
    expect(result.task.project?.title).toBe("Ship V2");

    // Persisted: a fresh read returns the same values.
    const reread = (await tasks.getTask(task.id)) as TaskView;
    expect(reread.title).toBe("Write the persistence ADR");
    expect(reread.status).toBe("in_progress");
    expect(reread.description).toBe("## Plan\n\nDo the thing.");
    expect(await countTaskDetailRows()).toBe(1);

    // Exactly one new entity.updated event.
    expect(await countActivities()).toBe(activitiesBefore + 1);
    expect(await countActivitiesOfType("entity.updated")).toBe(1);
  });

  it("is a no-op with no activity when nothing changes", async () => {
    const { task } = await seedHierarchy(WS);
    const tasks = taskRepo(WS);
    await tasks.updateTask(task.id, { status: "in_progress" });
    const activitiesBefore = await countActivities();

    const result = await tasks.updateTask(task.id, {
      title: "Write the ADR",
      status: "in_progress",
    });
    expect(result.changed).toBe(false);
    expect(await countActivities()).toBe(activitiesBefore);
    expect(await countActivitiesOfType("entity.updated")).toBe(1);
  });

  it("clears a nullable field with an explicit null and leaves omitted fields alone", async () => {
    const { task } = await seedHierarchy(WS);
    const tasks = taskRepo(WS);
    await tasks.updateTask(task.id, {
      priority: "high",
      dueDate: "2026-08-01",
    });

    const result = await tasks.updateTask(task.id, { priority: null });
    expect(result.task.priority).toBeNull();
    // dueDate was omitted, so it is unchanged.
    expect(result.task.dueDate).toBe("2026-08-01");
  });

  it("rejects invalid input at the boundary before any write", async () => {
    const { task } = await seedHierarchy(WS);
    const tasks = taskRepo(WS);
    await expect(
      tasks.updateTask(task.id, { dueDate: "2026-13-40" }),
    ).rejects.toBeInstanceOf(TaskValidationError);
    await expect(
      tasks.updateTask(task.id, { title: "   " }),
    ).rejects.toBeInstanceOf(TaskValidationError);
    await expect(
      tasks.updateTask(task.id, {
        status: "done" as unknown as "todo",
      }),
    ).rejects.toBeInstanceOf(TaskValidationError);
    // No details row written by a rejected update.
    expect(await countTaskDetailRows()).toBe(0);
  });

  it("writes only changed fields — a title-only update creates no details row", async () => {
    const { task } = await seedHierarchy(WS);
    const tasks = taskRepo(WS);
    const result = await tasks.updateTask(task.id, { title: "Renamed" });
    expect(result.changed).toBe(true);
    expect(result.task.title).toBe("Renamed");
    // No detail field changed, so no `task_details` row is written at all — an
    // omitted/unchanged column is never touched (concurrent-edit safety).
    expect(await countTaskDetailRows()).toBe(0);
  });

  it("a partial detail update leaves the other detail columns untouched", async () => {
    const { task } = await seedHierarchy(WS);
    const tasks = taskRepo(WS);
    await tasks.updateTask(task.id, {
      priority: "high",
      description: "keep me",
    });
    // Change only the priority; the description column must be left alone.
    const result = await tasks.updateTask(task.id, { priority: "low" });
    expect(result.task.priority).toBe("low");
    expect(result.task.description).toBe("keep me");
    const reread = (await tasks.getTask(task.id)) as TaskView;
    expect(reread.description).toBe("keep me");
  });

  it("throws not-found when updating a soft-deleted task", async () => {
    const { task } = await seedHierarchy(WS);
    await spineRepo(WS).softDelete(task.id);
    await expect(
      taskRepo(WS).updateTask(task.id, { status: "in_progress" }),
    ).rejects.toBeInstanceOf(TaskNotFoundError);
  });
});

describe("task listing", () => {
  it("lists open tasks first, ordered by due date, and includes parent context", async () => {
    const spine = spineRepo(WS);
    const area = await spine.createArea({ title: "Home" });
    const a = await spine.createTask({
      title: "A",
      parent: { kind: "area", id: area.id },
    });
    const b = await spine.createTask({
      title: "B",
      parent: { kind: "area", id: area.id },
    });
    const tasks = taskRepo(WS);
    await tasks.updateTask(a.id, { dueDate: "2026-08-10" });
    await tasks.updateTask(b.id, { dueDate: "2026-08-01" });

    const page = await tasks.listTasks();
    expect(page.items.map((t) => t.title)).toEqual(["B", "A"]);
    expect(page.items[0]?.parent).toEqual({
      kind: "area",
      id: area.id,
      title: "Home",
    });
  });

  it("excludes completed tasks by default and includes them on request", async () => {
    const { task } = await seedHierarchy(WS);
    await spineRepo(WS).complete(task.id);
    const tasks = taskRepo(WS);
    expect((await tasks.listTasks()).items).toHaveLength(0);
    expect(
      (await tasks.listTasks({ includeCompleted: true })).items,
    ).toHaveLength(1);
  });
});

describe("workspace isolation", () => {
  it("never reads or mutates a task in another workspace", async () => {
    const { task } = await seedHierarchy(WS);
    const otherTasks = taskRepo(OTHER);

    // A task from WS is invisible and unmutable from OTHER's scope.
    expect(await otherTasks.getTask(task.id)).toBeNull();
    await expect(
      otherTasks.updateTask(task.id, { status: "in_progress" }),
    ).rejects.toBeInstanceOf(TaskNotFoundError);
    // No details row leaked into the other workspace.
    expect(await countTaskDetailRows()).toBe(0);
  });
});
