/**
 * TODAY-04 Planning — real Workers/D1 integration tests for the TaskRepository's
 * planning workflow and the planning routes (ADR-030). Planning is the deliberate
 * use of a task's EXISTING scheduled date as the owner's commitment. These cover:
 * the atomic single + bulk mutations and their guarded Activity, the no-op paths,
 * the regressions that planning NEVER changes the due date, waiting state or
 * completion, bulk atomicity + cross-workspace rejection, and the `/today/plan` and
 * `/today/task/:id` planning routes over real D1.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";
import { env } from "cloudflare:test";

import type { AuthenticatedSession } from "~/kernel/auth";
import { setAuthenticatedSession } from "~/platform/request";
import { action as taskAction } from "~/modules/today/routes/task-detail";
import { action as planAction } from "~/modules/today/routes/plan";
import {
  TASK_PLANNED,
  TASK_PLAN_CLEARED,
  TASK_RESCHEDULED,
  TASK_WAITING_STARTED,
  TaskNotFoundError,
  TaskValidationError,
} from "~/kernel/tasks";

import {
  FakeClock,
  countActivitiesOfType,
  makeContext,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "test-default-workspace";
const OTHER = "ws_planning_other";

const nextEntityId = sequentialIds("pent");
const nextActivityId = sequentialIds("pact");

function spineRepo(ws: string) {
  return makeSpineRepository(makeContext(ws), {
    clock: new FakeClock().now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

function taskRepo(
  ws: string,
  clock = new FakeClock("2026-07-20T00:00:00.000Z"),
) {
  return makeTaskRepository(makeContext(ws), {
    clock: clock.now,
    activityIdGenerator: nextActivityId,
  });
}

/** Seed Area → Task and return the task id. */
async function seedTask(
  ws: string,
  title = "Draft the proposal",
): Promise<string> {
  const spine = spineRepo(ws);
  const area = await spine.createArea({ title: "Ops" });
  const task = await spine.createTask({
    title,
    parent: { kind: "area", id: area.id },
  });
  return task.id;
}

/** Read a task's stored scheduled date directly. */
async function storedScheduled(
  ws: string,
  taskId: string,
): Promise<string | null> {
  const row = await env.DB.prepare(
    `SELECT scheduled_date FROM task_details WHERE workspace_id = ? AND entity_id = ?`,
  )
    .bind(ws, taskId)
    .first<{ scheduled_date: string | null }>();
  return row?.scheduled_date ?? null;
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

/* -------------------------------------------------------------------------- */
/* Repository — single-task planning                                           */
/* -------------------------------------------------------------------------- */

describe("planTask / clearPlan", () => {
  it("plans an unplanned task and records exactly one task.planned event", async () => {
    const id = await seedTask(WS);
    const tasks = taskRepo(WS);

    const before = await countActivitiesOfType(TASK_PLANNED);
    const result = await tasks.planTask(id, { scheduledDate: "2026-07-21" });

    expect(result.changed).toBe(true);
    expect(result.task.scheduledDate).toBe("2026-07-21");
    expect(await storedScheduled(WS, id)).toBe("2026-07-21");
    expect(await countActivitiesOfType(TASK_PLANNED)).toBe(before + 1);
  });

  it("is an idempotent no-op when the date is unchanged (no Activity)", async () => {
    const id = await seedTask(WS);
    const tasks = taskRepo(WS);
    await tasks.planTask(id, { scheduledDate: "2026-07-21" });

    const before = await countActivitiesOfType(TASK_PLANNED);
    const result = await tasks.planTask(id, { scheduledDate: "2026-07-21" });

    expect(result.changed).toBe(false);
    expect(await countActivitiesOfType(TASK_PLANNED)).toBe(before);
  });

  it("records task.rescheduled when the plan moves to a different date", async () => {
    const id = await seedTask(WS);
    const tasks = taskRepo(WS);
    await tasks.planTask(id, { scheduledDate: "2026-07-21" });

    const before = await countActivitiesOfType(TASK_RESCHEDULED);
    const result = await tasks.planTask(id, { scheduledDate: "2026-07-28" });

    expect(result.changed).toBe(true);
    expect(result.task.scheduledDate).toBe("2026-07-28");
    expect(await countActivitiesOfType(TASK_RESCHEDULED)).toBe(before + 1);
  });

  it("clears a plan and records task.plan_cleared; clearing again is a no-op", async () => {
    const id = await seedTask(WS);
    const tasks = taskRepo(WS);
    await tasks.planTask(id, { scheduledDate: "2026-07-21" });

    const cleared = await tasks.clearPlan(id);
    expect(cleared.changed).toBe(true);
    expect(cleared.task.scheduledDate).toBeNull();
    expect(await storedScheduled(WS, id)).toBeNull();
    expect(await countActivitiesOfType(TASK_PLAN_CLEARED)).toBe(1);

    const again = await tasks.clearPlan(id);
    expect(again.changed).toBe(false);
    expect(await countActivitiesOfType(TASK_PLAN_CLEARED)).toBe(1);
  });

  it("rejects an invalid/absent plan date", async () => {
    const id = await seedTask(WS);
    const tasks = taskRepo(WS);
    await expect(
      tasks.planTask(id, { scheduledDate: "not-a-date" }),
    ).rejects.toBeInstanceOf(TaskValidationError);
    await expect(
      tasks.planTask(id, { scheduledDate: "" }),
    ).rejects.toBeInstanceOf(TaskValidationError);
  });

  it("does not disclose a cross-workspace task (not found)", async () => {
    const otherId = await seedTask(OTHER);
    const tasks = taskRepo(WS);
    await expect(
      tasks.planTask(otherId, { scheduledDate: "2026-07-21" }),
    ).rejects.toBeInstanceOf(TaskNotFoundError);
  });
});

/* -------------------------------------------------------------------------- */
/* Regression — planning never changes due, waiting or completion              */
/* -------------------------------------------------------------------------- */

describe("planning independence (regressions)", () => {
  it("never changes the due date", async () => {
    const id = await seedTask(WS);
    const tasks = taskRepo(WS);
    await tasks.updateTask(id, { dueDate: "2026-08-01" });

    await tasks.planTask(id, { scheduledDate: "2026-07-21" });
    let view = await tasks.getTask(id);
    expect(view?.dueDate).toBe("2026-08-01");

    await tasks.clearPlan(id);
    view = await tasks.getTask(id);
    expect(view?.dueDate).toBe("2026-08-01");
  });

  it("never changes the waiting state (and appends no waiting Activity)", async () => {
    const id = await seedTask(WS);
    const tasks = taskRepo(WS);
    await tasks.setWaiting(id, {
      target: { kind: "text", note: "finance sign-off" },
    });
    const waitingEvents = await countActivitiesOfType(TASK_WAITING_STARTED);

    await tasks.planTask(id, { scheduledDate: "2026-07-21" });
    let view = await tasks.getTask(id);
    expect(view?.waiting?.subject).toEqual({
      kind: "text",
      note: "finance sign-off",
    });

    await tasks.clearPlan(id);
    view = await tasks.getTask(id);
    expect(view?.waiting?.subject).toEqual({
      kind: "text",
      note: "finance sign-off",
    });
    // No new waiting Activity was produced by planning.
    expect(await countActivitiesOfType(TASK_WAITING_STARTED)).toBe(
      waitingEvents,
    );
  });

  it("never changes completion", async () => {
    const id = await seedTask(WS);
    const tasks = taskRepo(WS);
    await tasks.planTask(id, { scheduledDate: "2026-07-21" });
    const view = await tasks.getTask(id);
    expect(view?.completedAt).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Repository — planning applies to OPEN work only (server-side invariant)       */
/* -------------------------------------------------------------------------- */

/** Count all three planning Activity types (planned / rescheduled / plan_cleared). */
async function countPlanningActivity(): Promise<number> {
  return (
    (await countActivitiesOfType(TASK_PLANNED)) +
    (await countActivitiesOfType(TASK_RESCHEDULED)) +
    (await countActivitiesOfType(TASK_PLAN_CLEARED))
  );
}

describe("planning rejects completed work", () => {
  it("cannot plan a completed task (no scheduled date, no Activity)", async () => {
    const id = await seedTask(WS);
    const tasks = taskRepo(WS);
    await tasks.completeTask(id);

    const planningBefore = await countPlanningActivity();
    await expect(
      tasks.planTask(id, { scheduledDate: "2026-07-21" }),
    ).rejects.toBeInstanceOf(TaskValidationError);

    expect(await storedScheduled(WS, id)).toBeNull();
    expect(await countPlanningActivity()).toBe(planningBefore);
  });

  it("cannot reschedule a completed task; its scheduled date is untouched", async () => {
    const id = await seedTask(WS);
    const tasks = taskRepo(WS);
    await tasks.planTask(id, { scheduledDate: "2026-07-21" });
    await tasks.completeTask(id); // completion keeps the scheduled date (independent)

    const planningBefore = await countPlanningActivity();
    await expect(
      tasks.planTask(id, { scheduledDate: "2026-07-28" }),
    ).rejects.toBeInstanceOf(TaskValidationError);

    expect(await storedScheduled(WS, id)).toBe("2026-07-21");
    expect(await countPlanningActivity()).toBe(planningBefore);
  });

  it("cannot clear the plan of a completed task", async () => {
    const id = await seedTask(WS);
    const tasks = taskRepo(WS);
    await tasks.planTask(id, { scheduledDate: "2026-07-21" });
    await tasks.completeTask(id);

    const planCleared = await countActivitiesOfType(TASK_PLAN_CLEARED);
    await expect(tasks.clearPlan(id)).rejects.toBeInstanceOf(
      TaskValidationError,
    );

    expect(await storedScheduled(WS, id)).toBe("2026-07-21");
    expect(await countActivitiesOfType(TASK_PLAN_CLEARED)).toBe(planCleared);
  });

  it("bulk plan rejects the WHOLE batch when any task is completed", async () => {
    const open = await seedTask(WS, "Open");
    const doneId = await seedTask(WS, "Done");
    const tasks = taskRepo(WS);
    await tasks.completeTask(doneId);

    const planningBefore = await countPlanningActivity();
    await expect(
      tasks.planTasks([open, doneId], { scheduledDate: "2026-07-21" }),
    ).rejects.toBeInstanceOf(TaskValidationError);

    // Nothing changed — not even the open task in the selection.
    expect(await storedScheduled(WS, open)).toBeNull();
    expect(await countPlanningActivity()).toBe(planningBefore);
  });

  it("rejects a plan when the task is completed BETWEEN the read and the write", async () => {
    const id = await seedTask(WS);
    // A planner whose write races a completion injected right before the batch.
    const planner = makeTaskRepository(makeContext(WS), {
      clock: new FakeClock("2026-07-20T00:00:00.000Z").now,
      activityIdGenerator: nextActivityId,
      planRaceHook: async () => {
        await taskRepo(WS).completeTask(id);
      },
    });

    const planningBefore = await countPlanningActivity();
    await expect(
      planner.planTask(id, { scheduledDate: "2026-07-21" }),
    ).rejects.toBeInstanceOf(TaskValidationError);

    // The in-write guard rejected the race: completion stands, no plan, no Activity.
    const view = await taskRepo(WS).getTask(id);
    expect(view?.completedAt).not.toBeNull();
    expect(view?.scheduledDate).toBeNull();
    expect(await storedScheduled(WS, id)).toBeNull();
    expect(await countPlanningActivity()).toBe(planningBefore);
  });

  it("rejects clearing a plan when completion races the write (plan preserved)", async () => {
    const id = await seedTask(WS);
    await taskRepo(WS).planTask(id, { scheduledDate: "2026-07-21" });
    const planner = makeTaskRepository(makeContext(WS), {
      clock: new FakeClock("2026-07-20T00:00:00.000Z").now,
      activityIdGenerator: nextActivityId,
      planRaceHook: async () => {
        await taskRepo(WS).completeTask(id);
      },
    });

    const planCleared = await countActivitiesOfType(TASK_PLAN_CLEARED);
    await expect(planner.clearPlan(id)).rejects.toBeInstanceOf(
      TaskValidationError,
    );

    // The scheduled date survives (clear no-oped) and completion stands.
    const view = await taskRepo(WS).getTask(id);
    expect(view?.completedAt).not.toBeNull();
    expect(await storedScheduled(WS, id)).toBe("2026-07-21");
    expect(await countActivitiesOfType(TASK_PLAN_CLEARED)).toBe(planCleared);
  });
});

/* -------------------------------------------------------------------------- */
/* Repository — the planning query never loses commitments to the backlog       */
/* -------------------------------------------------------------------------- */

describe("listPlanningTasks", () => {
  it("keeps planned + completed-today work when the unscheduled backlog is large", async () => {
    const spine = spineRepo(WS);
    const area = await spine.createArea({ title: "Ops" });
    const tasks = taskRepo(WS);

    // A large unscheduled backlog, all with an EARLY due date — exactly the shape
    // that a single due-date-ordered, capped list would surface ahead of (and thus
    // hide) the owner's real commitments.
    for (let i = 0; i < 120; i++) {
      const t = await spine.createTask({
        title: `Backlog ${i}`,
        parent: { kind: "area", id: area.id },
      });
      await tasks.updateTask(t.id, { dueDate: "2026-01-01" });
    }

    // A task scheduled for today, and one completed today — neither has an early
    // due date, so both would fall outside a 100-item due-date-ordered page.
    const planned = await spine.createTask({
      title: "Planned for today",
      parent: { kind: "area", id: area.id },
    });
    await tasks.planTask(planned.id, { scheduledDate: "2026-07-20" });
    const done = await spine.createTask({
      title: "Finished today",
      parent: { kind: "area", id: area.id },
    });
    await tasks.completeTask(done.id);

    const page = await tasks.listPlanningTasks({ todayIso: "2026-07-20" });
    const byId = new Map(page.items.map((item) => [item.id, item]));

    // The planned task and the completed task both survive the large backlog.
    expect(byId.get(planned.id)?.scheduledDate).toBe("2026-07-20");
    expect(byId.get(done.id)?.completedAt).not.toBeNull();
  });

  it("excludes waiting tasks from the planning bands", async () => {
    const id = await seedTask(WS, "Blocked");
    const tasks = taskRepo(WS);
    await tasks.planTask(id, { scheduledDate: "2026-07-21" });
    await tasks.setWaiting(id, { target: { kind: "text", note: "vendor" } });

    const page = await tasks.listPlanningTasks({ todayIso: "2026-07-20" });
    expect(page.items.some((item) => item.id === id)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Repository — bulk planning (atomic)                                         */
/* -------------------------------------------------------------------------- */

describe("planTasks / clearPlans (bulk, atomic)", () => {
  it("plans many tasks in one operation, counting changed vs unchanged", async () => {
    const a = await seedTask(WS, "A");
    const b = await seedTask(WS, "B");
    const c = await seedTask(WS, "C");
    const tasks = taskRepo(WS);
    // C is already planned for the target date, so it is unchanged.
    await tasks.planTask(c, { scheduledDate: "2026-07-21" });

    const result = await tasks.planTasks([a, b, c], {
      scheduledDate: "2026-07-21",
    });
    expect(result.changed).toBe(2);
    expect(result.unchanged).toBe(1);
    expect(await storedScheduled(WS, a)).toBe("2026-07-21");
    expect(await storedScheduled(WS, b)).toBe("2026-07-21");
    // Each of the two changed tasks recorded exactly one planned event.
    expect(await countActivitiesOfType(TASK_PLANNED)).toBe(3);
  });

  it("deduplicates repeated ids so each task changes at most once", async () => {
    const a = await seedTask(WS, "A");
    const tasks = taskRepo(WS);
    const result = await tasks.planTasks([a, a, a], {
      scheduledDate: "2026-07-21",
    });
    expect(result.changed).toBe(1);
    expect(await countActivitiesOfType(TASK_PLANNED)).toBe(1);
  });

  it("is atomic across a cross-workspace id: rejects and changes NOTHING", async () => {
    const a = await seedTask(WS, "A");
    const otherId = await seedTask(OTHER, "Other");
    const tasks = taskRepo(WS);

    await expect(
      tasks.planTasks([a, otherId], { scheduledDate: "2026-07-21" }),
    ).rejects.toBeInstanceOf(TaskNotFoundError);

    // Nothing was partially applied — A is still unplanned, no Activity.
    expect(await storedScheduled(WS, a)).toBeNull();
    expect(await countActivitiesOfType(TASK_PLANNED)).toBe(0);
  });

  it("clears the plan on many tasks in one operation", async () => {
    const a = await seedTask(WS, "A");
    const b = await seedTask(WS, "B");
    const tasks = taskRepo(WS);
    await tasks.planTasks([a, b], { scheduledDate: "2026-07-21" });

    const result = await tasks.clearPlans([a, b]);
    expect(result.changed).toBe(2);
    expect(await storedScheduled(WS, a)).toBeNull();
    expect(await storedScheduled(WS, b)).toBeNull();
    expect(await countActivitiesOfType(TASK_PLAN_CLEARED)).toBe(2);
  });

  it("rejects an empty selection", async () => {
    const tasks = taskRepo(WS);
    await expect(
      tasks.planTasks([], { scheduledDate: "2026-07-21" }),
    ).rejects.toBeInstanceOf(TaskValidationError);
  });
});

/* -------------------------------------------------------------------------- */
/* Routes — /today/plan and /today/task/:id planning intents                    */
/* -------------------------------------------------------------------------- */

function authedContext(): RouterContextProvider {
  const session: AuthenticatedSession = {
    user: { subject: "owner", email: "owner@example.com" },
    issuedAt: new Date(0),
    expiresAt: new Date(Date.parse("2999-01-01")),
  };
  const context = new RouterContextProvider();
  setAuthenticatedSession(context, session);
  return context;
}

async function runPlan(form: FormData): Promise<Response> {
  return planAction({
    request: new Request("https://app.test/today/plan", {
      method: "POST",
      body: form,
    }),
    context: authedContext(),
    params: {},
  } as unknown as Parameters<typeof planAction>[0]) as Promise<Response>;
}

async function runTaskAction(
  taskId: string,
  form: FormData,
): Promise<Response> {
  return taskAction({
    request: new Request(`https://app.test/today/task/${taskId}`, {
      method: "POST",
      body: form,
    }),
    context: authedContext(),
    params: { taskId },
  } as unknown as Parameters<typeof taskAction>[0]) as Promise<Response>;
}

describe("route: /today/plan", () => {
  it("bulk-plans the submitted ids and persists them", async () => {
    const a = await seedTask(WS, "A");
    const b = await seedTask(WS, "B");
    const form = new FormData();
    form.set("intent", "plan");
    form.append("id", a);
    form.append("id", b);
    form.set("scheduledDate", "2026-07-21");

    const res = await runPlan(form);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; changed: number };
    expect(body.status).toBe("success");
    expect(body.changed).toBe(2);
    expect(await storedScheduled(WS, a)).toBe("2026-07-21");
  });

  it("rejects a cross-workspace id and changes nothing (atomic)", async () => {
    const a = await seedTask(WS, "A");
    const otherId = await seedTask(OTHER, "Other");
    const form = new FormData();
    form.set("intent", "plan");
    form.append("id", a);
    form.append("id", otherId);
    form.set("scheduledDate", "2026-07-21");

    const res = await runPlan(form);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("error");
    expect(await storedScheduled(WS, a)).toBeNull();
  });

  it("clears the plan on the submitted ids", async () => {
    const a = await seedTask(WS, "A");
    await taskRepo(WS).planTask(a, { scheduledDate: "2026-07-21" });
    const form = new FormData();
    form.set("intent", "clear_plan");
    form.append("id", a);

    const res = await runPlan(form);
    const body = (await res.json()) as { status: string; changed: number };
    expect(body.status).toBe("success");
    expect(body.changed).toBe(1);
    expect(await storedScheduled(WS, a)).toBeNull();
  });

  it("rejects a non-POST method with 405", async () => {
    const res = await planAction({
      request: new Request("https://app.test/today/plan", { method: "GET" }),
      context: authedContext(),
      params: {},
    } as unknown as Parameters<typeof planAction>[0]).catch(
      (r: unknown) => r as Response,
    );
    expect((res as Response).status).toBe(405);
  });
});

describe("route: /today/task/:id planning intents", () => {
  it("plans a single task and persists it", async () => {
    const id = await seedTask(WS, "One");
    const form = new FormData();
    form.set("intent", "plan");
    form.set("scheduledDate", "2026-07-21");

    const res = await runTaskAction(id, form);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { kind: string; status: string };
    expect(body.kind).toBe("planning");
    expect(body.status).toBe("success");
    expect(await storedScheduled(WS, id)).toBe("2026-07-21");
  });

  it("clears a single task's plan", async () => {
    const id = await seedTask(WS, "One");
    await taskRepo(WS).planTask(id, { scheduledDate: "2026-07-21" });
    const form = new FormData();
    form.set("intent", "clear_plan");

    const res = await runTaskAction(id, form);
    const body = (await res.json()) as { kind: string; status: string };
    expect(body.status).toBe("success");
    expect(await storedScheduled(WS, id)).toBeNull();
  });
});
