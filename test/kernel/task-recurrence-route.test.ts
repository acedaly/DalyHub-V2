/**
 * TASKS-04 — the recurrence MUTATION BOUNDARY, over the real routes and real D1.
 *
 * These prove the untrusted-form edge cases the repository tests cannot see, because
 * the repository is handed already-typed values:
 *
 *   - an EMPTY `recurrenceWeekdays` field must mean "no selected weekdays", never
 *     weekday 0 — `Number("")` is 0, and the coercion once turned "every week" into
 *     "every Sunday" and made "every day" fail validation outright;
 *   - a rule with no anchor date is refused with a field error the control can show,
 *     and nothing is written;
 *   - creating with a recurrence writes the rule in the SAME atomic create;
 *   - completing over the route creates the successor and reports it, and undoing
 *     withdraws an untouched one.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { RouterContextProvider } from "react-router";
import { env } from "cloudflare:test";

import type { AuthenticatedSession } from "~/kernel/auth";
import { setAuthenticatedSession } from "~/platform/request";
import { action as taskAction } from "~/modules/tasks/routes/task-detail";
import { action as createAction } from "~/modules/tasks/routes/new";

import {
  FakeClock,
  makeContext,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "test-default-workspace";

const nextEntityId = sequentialIds("rrent");
const nextActivityId = sequentialIds("rract");

function taskRepo() {
  return makeTaskRepository(makeContext(WS), {
    clock: new FakeClock("2026-07-30T00:00:00.000Z").now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

function authedContext(): RouterContextProvider {
  const session: AuthenticatedSession = {
    user: {
      subject: "dev@dalyhub.test",
      email: "dev@dalyhub.test",
      displayName: null,
    },
  } as AuthenticatedSession;
  const context = new RouterContextProvider();
  setAuthenticatedSession(context, session);
  return context;
}

async function runTaskAction(
  taskId: string,
  form: FormData,
): Promise<Response> {
  return taskAction({
    request: new Request(`https://app.test/tasks/${taskId}`, {
      method: "POST",
      body: form,
    }),
    context: authedContext(),
    params: { taskId },
  } as unknown as Parameters<typeof taskAction>[0]) as Promise<Response>;
}

async function runCreate(form: FormData): Promise<Response> {
  return createAction({
    request: new Request("https://app.test/tasks/new", {
      method: "POST",
      body: form,
    }),
    context: authedContext(),
    params: {},
  } as unknown as Parameters<typeof createAction>[0]) as Promise<Response>;
}

/** The stored rule for a task, straight from D1. */
async function storedRule(taskId: string) {
  return await env.DB.prepare(
    `SELECT frequency, interval, date_kind, weekdays, series_id, sequence
     FROM task_recurrence_rules WHERE workspace_id = ? AND entity_id = ?`,
  )
    .bind(WS, taskId)
    .first<{
      frequency: string;
      interval: number;
      date_kind: string;
      weekdays: string | null;
      series_id: string;
      sequence: number;
    }>();
}

beforeEach(async () => {
  await resetTables([WS]);
});

describe("route: recurrence on create", () => {
  it("writes the rule in the same create, with NO selected weekdays for a blank field", async () => {
    const form = new FormData();
    form.set("intent", "create");
    form.set("title", "Water the plants");
    form.set("scheduledDate", "2026-08-01");
    form.set("recurrenceFrequency", "week");
    form.set("recurrenceDateKind", "scheduled");
    form.set("recurrenceInterval", "1");
    // The empty field the capture surfaces send when the phrase named no weekday.
    form.set("recurrenceWeekdays", "");

    const res = await runCreate(form);
    const body = (await res.json()) as { ok: boolean; taskId: string };
    expect(body.ok).toBe(true);

    const rule = await storedRule(body.taskId);
    expect(rule).toMatchObject({
      frequency: "week",
      interval: 1,
      date_kind: "scheduled",
    });
    // NOT "0": an empty list is an empty list.
    expect(rule?.weekdays).toBeNull();
    expect(rule?.sequence).toBe(0);
  });

  it("accepts a daily rule with a blank weekday field", async () => {
    const form = new FormData();
    form.set("intent", "create");
    form.set("title", "Stretch");
    form.set("scheduledDate", "2026-08-01");
    form.set("recurrenceFrequency", "day");
    form.set("recurrenceDateKind", "scheduled");
    form.set("recurrenceWeekdays", "");

    const res = await runCreate(form);
    const body = (await res.json()) as { ok: boolean; taskId?: string };
    expect(body.ok).toBe(true);
    expect((await storedRule(body.taskId!))?.frequency).toBe("day");
  });

  it("keeps a selected weekday when one IS named", async () => {
    const form = new FormData();
    form.set("intent", "create");
    form.set("title", "Bin night");
    form.set("scheduledDate", "2026-08-03");
    form.set("recurrenceFrequency", "week");
    form.set("recurrenceDateKind", "scheduled");
    form.set("recurrenceWeekdays", "1");

    const res = await runCreate(form);
    const body = (await res.json()) as { ok: boolean; taskId: string };
    expect((await storedRule(body.taskId))?.weekdays).toBe("1");
  });

  it("refuses a rule with no anchor date, and creates NOTHING", async () => {
    const form = new FormData();
    form.set("intent", "create");
    form.set("title", "Impossible repeat");
    form.set("recurrenceFrequency", "week");
    form.set("recurrenceDateKind", "scheduled");

    const res = await runCreate(form);
    const body = (await res.json()) as {
      ok: boolean;
      fieldErrors?: Record<string, string>;
    };
    expect(body.ok).toBe(false);
    expect(body.fieldErrors?.recurrence).toBeTruthy();

    const page = await taskRepo().listWorkspaceTasks({
      todayIso: "2026-07-30",
    });
    expect(page.items.some((item) => item.title === "Impossible repeat")).toBe(
      false,
    );
  });
});

describe("route: set_recurrence", () => {
  it("sets, edits and removes a rule", async () => {
    const spine = makeSpineRepository(makeContext(WS), {
      clock: new FakeClock("2026-07-30T00:00:00.000Z").now,
      idGenerator: nextEntityId,
      activityIdGenerator: nextActivityId,
    });
    const area = await spine.createArea({ title: "Home" });
    const tasks = taskRepo();
    const task = await tasks.createTask({
      title: "Change the filter",
      parent: { kind: "area", id: area.id },
      scheduledDate: "2026-08-01",
    });

    const set = new FormData();
    set.set("intent", "set_recurrence");
    set.set("frequency", "month");
    set.set("dateKind", "scheduled");
    set.set("interval", "1");
    set.set("weekdays", "");
    expect(await (await runTaskAction(task.id, set)).json()).toMatchObject({
      status: "success",
    });
    expect(await storedRule(task.id)).toMatchObject({
      frequency: "month",
      date_kind: "scheduled",
    });

    const edit = new FormData();
    edit.set("intent", "set_recurrence");
    edit.set("frequency", "month");
    edit.set("dateKind", "scheduled");
    edit.set("interval", "3");
    await runTaskAction(task.id, edit);
    expect((await storedRule(task.id))?.interval).toBe(3);

    const remove = new FormData();
    remove.set("intent", "set_recurrence");
    await runTaskAction(task.id, remove);
    expect(await storedRule(task.id)).toBeNull();
    // Removing the rule leaves the task itself intact.
    expect((await tasks.getTask(task.id))?.scheduledDate).toBe("2026-08-01");
  });

  it("returns a field error for a rule with no anchor date", async () => {
    const tasks = taskRepo();
    const task = await tasks.createTask({ title: "No dates here" });
    const form = new FormData();
    form.set("intent", "set_recurrence");
    form.set("frequency", "week");
    form.set("dateKind", "scheduled");

    const body = (await (await runTaskAction(task.id, form)).json()) as {
      status: string;
      fieldErrors?: Record<string, string>;
    };
    expect(body.status).toBe("error");
    expect(body.fieldErrors?.recurrence).toBeTruthy();
    expect(await storedRule(task.id)).toBeNull();
  });

  it("rejects an unknown frequency without writing", async () => {
    const tasks = taskRepo();
    const task = await tasks.createTask({
      title: "Bad frequency",
      scheduledDate: "2026-08-01",
    });
    const form = new FormData();
    form.set("intent", "set_recurrence");
    form.set("frequency", "fortnight");
    form.set("dateKind", "scheduled");

    const body = (await (await runTaskAction(task.id, form)).json()) as {
      status: string;
    };
    expect(body.status).toBe("error");
    expect(await storedRule(task.id)).toBeNull();
  });
});

describe("route: completing and undoing a recurring task", () => {
  /*
   * The ROUTE builds its own repository from the environment, so it reads the
   * real system clock — only `taskRepo()` above gets the `FakeClock`. That made
   * the successor's date depend on the day the suite happened to run: a weekly
   * rule anchored to Thursday 30 July lands on 6 August every day up to and
   * including the 5th, and rolls to the 13th from the 6th onward. The
   * assertion below hard-codes 6 August, so this test passed for a week and
   * then began failing on `main` with no code change — which is exactly what it
   * was doing when this branch started.
   *
   * Pinning the clock to the same instant the repository already uses makes the
   * date arithmetic deterministic without weakening what is being asserted: the
   * successor is still required to be the NEXT occurrence, exactly once, and
   * still has to be withdrawn on undo.
   */
  it("reports the successor it created, then withdraws it on undo", async () => {
    // Scoped to THIS test, not the describe block: the sibling
    // "RETAINS an edited successor" case distinguishes an edited successor from
    // an untouched one by its timestamps, and a frozen clock makes the two
    // indistinguishable. Only the date arithmetic here needs pinning.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T00:00:00.000Z"));
    try {
      await assertSuccessorCreatedThenWithdrawn();
    } finally {
      vi.useRealTimers();
    }
  });

  async function assertSuccessorCreatedThenWithdrawn() {
    const tasks = taskRepo();
    const task = await tasks.createTask({
      title: "Weekly review",
      scheduledDate: "2026-07-30",
      recurrence: { frequency: "week", dateKind: "scheduled" },
    });

    const complete = new FormData();
    complete.set("intent", "complete");
    const completed = (await (
      await runTaskAction(task.id, complete)
    ).json()) as {
      ok: boolean;
      recurrence?: { outcome: string; taskId?: string; scheduledDate?: string };
    };
    expect(completed.ok).toBe(true);
    expect(completed.recurrence?.outcome).toBe("created");
    expect(completed.recurrence?.scheduledDate).toBe("2026-08-06");
    const successorId = completed.recurrence!.taskId!;
    expect(await tasks.getTask(successorId)).not.toBeNull();

    const reopen = new FormData();
    reopen.set("intent", "reopen");
    const reopened = (await (await runTaskAction(task.id, reopen)).json()) as {
      ok: boolean;
      recurrence?: { outcome: string };
    };
    expect(reopened.ok).toBe(true);
    expect(reopened.recurrence?.outcome).toBe("removed");
    expect(await tasks.getTask(successorId)).toBeNull();
  }

  it("RETAINS an edited successor and says so", async () => {
    const tasks = taskRepo();
    const task = await tasks.createTask({
      title: "Daily walk",
      scheduledDate: "2026-07-30",
      recurrence: { frequency: "day", dateKind: "scheduled" },
    });

    const complete = new FormData();
    complete.set("intent", "complete");
    const completed = (await (
      await runTaskAction(task.id, complete)
    ).json()) as {
      recurrence?: { taskId?: string };
    };
    const successorId = completed.recurrence!.taskId!;

    const rename = new FormData();
    rename.set("intent", "rename");
    rename.set("title", "Daily walk, longer route");
    await runTaskAction(successorId, rename);

    const reopen = new FormData();
    reopen.set("intent", "reopen");
    const reopened = (await (await runTaskAction(task.id, reopen)).json()) as {
      recurrence?: { outcome: string };
    };
    expect(reopened.recurrence?.outcome).toBe("retained");
    expect((await tasks.getTask(successorId))?.title).toBe(
      "Daily walk, longer route",
    );
  });
});
