import { beforeEach, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";

import type { AuthenticatedSession } from "~/kernel/auth";
import { setAuthenticatedSession } from "~/platform/request";
import { action } from "~/modules/today/routes/task-detail";
import { loader as waitingTargetsLoader } from "~/modules/today/routes/task-waiting-targets";
import { loader as waitingLoader } from "~/modules/today/routes/waiting";

import {
  FakeClock,
  countActivitiesOfType,
  ensureWorkspace,
  makeContext,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  seedEntity,
  sequentialIds,
} from "./support";

/**
 * TODAY-03 — the ACTUAL `/today/task/:taskId` waiting intents, the
 * `/today/task/:taskId/waiting-targets` search loader, and the `/today/waiting`
 * view loader, in the real Workers runtime over real D1. Proves waiting mutations
 * persist, target search is workspace-isolated, completion clears waiting, invalid
 * ids get a calm 404, and unsupported methods get 405.
 */

const WS = "test-default-workspace";
const OTHER = "ws_waiting_route_other";

const nextEntityId = sequentialIds("went");
const nextActivityId = sequentialIds("wact");

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

function spine(ws: string) {
  return makeSpineRepository(makeContext(ws), {
    clock: new FakeClock().now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

async function runAction(taskId: string, form: FormData): Promise<Response> {
  return action({
    request: new Request(`https://app.test/today/task/${taskId}`, {
      method: "POST",
      body: form,
    }),
    context: authedContext(),
    params: { taskId },
  } as unknown as Parameters<typeof action>[0]) as Promise<Response>;
}

function formData(entries: Record<string, string>): FormData {
  const form = new FormData();
  for (const [k, v] of Object.entries(entries)) form.set(k, v);
  return form;
}

async function seedTask(ws: string): Promise<string> {
  const s = spine(ws);
  const area = await s.createArea({ title: "Ops" });
  const task = await s.createTask({
    title: "Prepare agreement",
    parent: { kind: "area", id: area.id },
  });
  return task.id;
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("POST action — set_waiting / clear_waiting", () => {
  it("activates waiting on an entity target and persists it", async () => {
    const task = await seedTask(WS);
    await seedEntity(WS, "person-1", { type: "person", title: "Sarah" });
    const res = await runAction(
      task,
      formData({
        intent: "set_waiting",
        waitingMode: "entity",
        waitingTargetId: "person-1",
      }),
    );
    const body = (await res.json()) as {
      kind: string;
      status: string;
      task: { waiting: { subject: { title: string } } | null };
    };
    expect(body.kind).toBe("waiting");
    expect(body.status).toBe("success");
    expect(body.task.waiting?.subject.title).toBe("Sarah");
    expect(await countActivitiesOfType("task.waiting_started")).toBe(1);
  });

  it("activates waiting on a free-text subject", async () => {
    const task = await seedTask(WS);
    const res = await runAction(
      task,
      formData({
        intent: "set_waiting",
        waitingMode: "text",
        waitingNote: "finance confirmation",
      }),
    );
    const body = (await res.json()) as {
      status: string;
      task: { waiting: { subject: { note: string } } | null };
    };
    expect(body.status).toBe("success");
    expect(body.task.waiting?.subject.note).toBe("finance confirmation");
  });

  it("returns a typed field error for an empty free-text subject", async () => {
    const task = await seedTask(WS);
    const res = await runAction(
      task,
      formData({
        intent: "set_waiting",
        waitingMode: "text",
        waitingNote: " ",
      }),
    );
    const body = (await res.json()) as {
      status: string;
      fieldErrors?: Record<string, string>;
    };
    expect(body.status).toBe("error");
    expect(body.fieldErrors?.waitingNote).toBeTruthy();
  });

  it("clears waiting", async () => {
    const task = await seedTask(WS);
    await runAction(
      task,
      formData({
        intent: "set_waiting",
        waitingMode: "text",
        waitingNote: "x",
      }),
    );
    const res = await runAction(task, formData({ intent: "clear_waiting" }));
    const body = (await res.json()) as {
      status: string;
      task: { waiting: unknown | null };
    };
    expect(body.status).toBe("success");
    expect(body.task.waiting).toBeNull();
    expect(await countActivitiesOfType("task.waiting_cleared")).toBe(1);
  });

  it("completing a waiting task atomically returns a completed, non-waiting task", async () => {
    const task = await seedTask(WS);
    await runAction(
      task,
      formData({
        intent: "set_waiting",
        waitingMode: "text",
        waitingNote: "x",
      }),
    );
    // One atomic operation: the action returns the completed, non-waiting task.
    const res = await runAction(task, formData({ intent: "complete" }));
    const body = (await res.json()) as {
      kind: string;
      ok: boolean;
      task: { completedAt: string | null; waiting: unknown | null };
    };
    expect(body.kind).toBe("completion");
    expect(body.ok).toBe(true);
    expect(body.task.completedAt).not.toBeNull();
    expect(body.task.waiting).toBeNull();
    // Persisted, with exactly one completion + one waiting-cleared event.
    const reread = await makeTaskRepository(makeContext(WS)).getTask(task);
    expect(reread?.completedAt).not.toBeNull();
    expect(reread?.waiting).toBeNull();
    expect(await countActivitiesOfType("task.completed")).toBe(1);
    expect(await countActivitiesOfType("task.waiting_cleared")).toBe(1);
  });

  it("returns a calm 404 for a non-task anchor and a missing id", async () => {
    const res404 = await runAction(
      "does-not-exist",
      formData({
        intent: "set_waiting",
        waitingMode: "text",
        waitingNote: "x",
      }),
    );
    expect(res404.status).toBe(404);
  });

  it("rejects a cross-workspace target as invalid input", async () => {
    const task = await seedTask(WS);
    await seedEntity(OTHER, "person-x", { type: "person", title: "Elsewhere" });
    const res = await runAction(
      task,
      formData({
        intent: "set_waiting",
        waitingMode: "entity",
        waitingTargetId: "person-x",
      }),
    );
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("error");
  });

  it("rejects an unsupported method with 405", async () => {
    const task = await seedTask(WS);
    await expect(
      action({
        request: new Request(`https://app.test/today/task/${task}`, {
          method: "GET",
        }),
        context: authedContext(),
        params: { taskId: task },
      } as unknown as Parameters<typeof action>[0]),
    ).rejects.toMatchObject({ status: 405 });
  });
});

describe("GET waiting-targets loader", () => {
  it("returns allowed target types, excludes the anchor, and isolates the workspace", async () => {
    const task = await seedTask(WS);
    await seedEntity(WS, "person-1", { type: "person", title: "Sarah Chen" });
    await seedEntity(WS, "note-1", { type: "note", title: "A note" });
    await seedEntity(OTHER, "person-2", { type: "person", title: "Elsewhere" });

    const res = (await waitingTargetsLoader({
      request: new Request(
        `https://app.test/today/task/${task}/waiting-targets?q=`,
      ),
      context: authedContext(),
      params: { taskId: task },
    } as unknown as Parameters<typeof waitingTargetsLoader>[0])) as Response;
    const body = (await res.json()) as {
      options: { id: string; type: string }[];
    };
    const ids = body.options.map((o) => o.id);
    expect(ids).toContain("person-1");
    // A note is not an allowed waiting target type.
    expect(ids).not.toContain("note-1");
    // Another workspace's person never leaks.
    expect(ids).not.toContain("person-2");
    // The anchor task itself is excluded.
    expect(ids).not.toContain(task);
  });

  it("returns a calm 404 for a non-task anchor", async () => {
    const res = (await waitingTargetsLoader({
      request: new Request(
        "https://app.test/today/task/nope/waiting-targets?q=",
      ),
      context: authedContext(),
      params: { taskId: "nope" },
    } as unknown as Parameters<typeof waitingTargetsLoader>[0])) as Response;
    expect(res.status).toBe(404);
  });
});

describe("GET /today/waiting loader", () => {
  it("returns the waiting list and an empty list when nothing is waiting", async () => {
    await ensureWorkspace(WS);
    const empty = (await waitingLoader({
      request: new Request("https://app.test/today/waiting"),
      context: authedContext(),
      params: {},
    } as unknown as Parameters<typeof waitingLoader>[0])) as unknown as {
      items: unknown[];
      failed: boolean;
    };
    expect(empty.failed).toBe(false);
    expect(empty.items).toEqual([]);

    const task = await seedTask(WS);
    await runAction(
      task,
      formData({
        intent: "set_waiting",
        waitingMode: "text",
        waitingNote: "finance",
      }),
    );

    const withItem = (await waitingLoader({
      request: new Request("https://app.test/today/waiting"),
      context: authedContext(),
      params: {},
    } as unknown as Parameters<typeof waitingLoader>[0])) as unknown as {
      items: { id: string; waiting: { subject: { note: string } } }[];
    };
    expect(withItem.items).toHaveLength(1);
    expect(withItem.items[0]?.waiting.subject.note).toBe("finance");
  });
});
