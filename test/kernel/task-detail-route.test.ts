import { beforeEach, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";

import type { AuthenticatedSession } from "~/kernel/auth";
import { setAuthenticatedSession } from "~/platform/request";
import { action, loader } from "~/modules/tasks/routes/task-detail";
import { loader as linkTargetsLoader } from "~/modules/tasks/routes/task-link-targets";

import {
  FakeClock,
  countActivitiesOfType,
  makeContext,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

/**
 * TODAY-02 — the ACTUAL `/today/task/:taskId` route loader + action in the real
 * Workers runtime over real D1 (the deployed path). Proves the endpoint resolves
 * the trusted workspace, persists edits + completion + links atomically with
 * Activity, keeps workspace isolation, and returns the calm 404 for an
 * inaccessible task.
 */

const CONFIGURED_WORKSPACE = "test-default-workspace";
const OTHER = "ws_task_route_other";

const nextEntityId = sequentialIds("rent");
const nextActivityId = sequentialIds("ract");

function sessionFor(subject = "owner-subject"): AuthenticatedSession {
  return {
    user: { subject, email: "owner@example.com" },
    issuedAt: new Date(0),
    expiresAt: new Date(Date.parse("2999-01-01")),
  };
}

function authedContext(): RouterContextProvider {
  const context = new RouterContextProvider();
  setAuthenticatedSession(context, sessionFor());
  return context;
}

function spine(ws: string) {
  return makeSpineRepository(makeContext(ws), {
    clock: new FakeClock().now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

async function runLoader(taskId: string): Promise<Response> {
  return loader({
    request: new Request(`https://app.test/today/task/${taskId}`),
    context: authedContext(),
    params: { taskId },
  } as unknown as Parameters<typeof loader>[0]) as Promise<Response>;
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
  for (const [key, value] of Object.entries(entries)) {
    form.set(key, value);
  }
  return form;
}

/** Seed an Area + Task in the given workspace; return the task id. */
async function seedTask(ws: string): Promise<{ area: string; task: string }> {
  const s = spine(ws);
  const area = await s.createArea({ title: "Career" });
  const task = await s.createTask({
    title: "Write the ADR",
    parent: { kind: "area", id: area.id },
  });
  return { area: area.id, task: task.id };
}

beforeEach(async () => {
  // resetTables recreates both workspaces so the configured workspace resolves.
  await resetTables([CONFIGURED_WORKSPACE, OTHER]);
});

describe("GET loader", () => {
  it("returns the task and its (empty) related links", async () => {
    const { task, area } = await seedTask(CONFIGURED_WORKSPACE);
    const response = await runLoader(task);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      task: { id: string; title: string; area: { title: string } | null };
      links: unknown[];
    };
    expect(body.task.id).toBe(task);
    expect(body.task.title).toBe("Write the ADR");
    expect(body.task.area?.title).toBe("Career");
    expect(area).toBeTruthy();
    expect(body.links).toEqual([]);
  });

  it("returns a calm 404 for a missing task", async () => {
    const response = await runLoader("does-not-exist");
    expect(response.status).toBe(404);
  });

  it("never reveals a task from another workspace", async () => {
    const { task } = await seedTask(OTHER);
    // The loader resolves the CONFIGURED workspace only; an OTHER-workspace id
    // is indistinguishable from missing.
    const response = await runLoader(task);
    expect(response.status).toBe(404);
  });
});

describe("POST action — update", () => {
  it("persists edits and appends exactly one entity.updated", async () => {
    const { task } = await seedTask(CONFIGURED_WORKSPACE);
    const response = await runAction(
      task,
      formData({
        intent: "update",
        title: "Write the persistence ADR",
        status: "in_progress",
        priority: "high",
        dueDate: "2026-08-01",
        scheduledDate: "",
        description: "## Plan",
      }),
    );
    const body = (await response.json()) as {
      kind: string;
      status: string;
      task: { title: string; status: string; priority: string };
    };
    expect(body.kind).toBe("update");
    expect(body.status).toBe("success");
    expect(body.task.title).toBe("Write the persistence ADR");

    // Persisted through the repository.
    const reread = await makeTaskRepository(
      makeContext(CONFIGURED_WORKSPACE),
    ).getTask(task);
    expect(reread?.status).toBe("in_progress");
    expect(reread?.priority).toBe("high");
    expect(reread?.dueDate).toBe("2026-08-01");
    expect(await countActivitiesOfType("entity.updated")).toBe(1);
  });

  it("returns a server field error for invalid input", async () => {
    const { task } = await seedTask(CONFIGURED_WORKSPACE);
    const response = await runAction(
      task,
      formData({ intent: "update", title: "Ok", dueDate: "2026-13-40" }),
    );
    const body = (await response.json()) as {
      status: string;
      fieldErrors?: Record<string, string>;
    };
    expect(body.status).toBe("error");
    expect(body.fieldErrors?.dueDate).toBeTruthy();
  });
});

describe("POST action — completion", () => {
  it("completes and reopens through the spine, recording activity", async () => {
    const { task } = await seedTask(CONFIGURED_WORKSPACE);

    const completed = (await (
      await runAction(task, formData({ intent: "complete" }))
    ).json()) as {
      kind: string;
      ok: boolean;
      task: { completedAt: string | null };
    };
    expect(completed.ok).toBe(true);
    expect(completed.task.completedAt).not.toBeNull();
    expect(await countActivitiesOfType("task.completed")).toBe(1);

    const reopened = (await (
      await runAction(task, formData({ intent: "reopen" }))
    ).json()) as { ok: boolean; task: { completedAt: string | null } };
    expect(reopened.ok).toBe(true);
    expect(reopened.task.completedAt).toBeNull();
    expect(await countActivitiesOfType("task.reopened")).toBe(1);
  });
});

describe("POST action — links", () => {
  it("creates and removes a relates_to link, respecting workspace isolation", async () => {
    const { task } = await seedTask(CONFIGURED_WORKSPACE);
    // A second record in the SAME workspace to relate to.
    const s = spine(CONFIGURED_WORKSPACE);
    const other = await s.createArea({ title: "Health" });

    const linked = (await (
      await runAction(
        task,
        formData({
          intent: "link",
          targetId: other.id,
          linkType: "task.relates_to",
          direction: "outgoing",
        }),
      )
    ).json()) as { kind: string; ok: boolean };
    expect(linked.kind).toBe("link");
    expect(linked.ok).toBe(true);
    expect(await countActivitiesOfType("entity_link.created")).toBeGreaterThan(
      0,
    );

    // The link now shows in the loader payload.
    const detail = (await (await runLoader(task)).json()) as {
      links: { linkId: string; target: { id: string } }[];
    };
    expect(detail.links).toHaveLength(1);
    expect(detail.links[0]?.target.id).toBe(other.id);

    // Unlink it again.
    const unlinked = (await (
      await runAction(
        task,
        formData({ intent: "unlink", linkId: detail.links[0]!.linkId }),
      )
    ).json()) as { kind: string; ok: boolean };
    expect(unlinked.ok).toBe(true);

    const after = (await (await runLoader(task)).json()) as {
      links: unknown[];
    };
    expect(after.links).toHaveLength(0);
  });

  it("refuses to link to a record in another workspace", async () => {
    const { task } = await seedTask(CONFIGURED_WORKSPACE);
    const { task: foreign } = await seedTask(OTHER);
    const result = (await (
      await runAction(
        task,
        formData({
          intent: "link",
          targetId: foreign,
          linkType: "task.relates_to",
          direction: "outgoing",
        }),
      )
    ).json()) as { kind: string; ok: boolean };
    expect(result.ok).toBe(false);
  });
});

async function runLinkTargetsLoader(taskId: string): Promise<Response> {
  return linkTargetsLoader({
    request: new Request(
      `https://app.test/today/task/${taskId}/link-targets?q=`,
    ),
    context: authedContext(),
    params: { taskId },
  } as unknown as Parameters<typeof linkTargetsLoader>[0]) as Promise<Response>;
}

describe("GET link-targets", () => {
  it("returns target options for a valid task anchor", async () => {
    const { task } = await seedTask(CONFIGURED_WORKSPACE);
    // A second record to be a candidate target.
    await spine(CONFIGURED_WORKSPACE).createArea({ title: "Health" });
    const response = await runLinkTargetsLoader(task);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { options: unknown[] };
    expect(Array.isArray(body.options)).toBe(true);
  });

  it("refuses a non-task anchor before searching", async () => {
    const s = spine(CONFIGURED_WORKSPACE);
    const area = await s.createArea({ title: "Career" });
    const project = await s.createProject({
      title: "Ship",
      parent: { kind: "area", id: area.id },
    });
    const response = await runLinkTargetsLoader(project.id);
    expect(response.status).toBe(404);
  });
});

describe("non-task guard", () => {
  it("refuses to complete a non-task record via the task endpoint (nothing mutates)", async () => {
    const s = spine(CONFIGURED_WORKSPACE);
    const area = await s.createArea({ title: "Career" });
    const project = await s.createProject({
      title: "Ship V2",
      parent: { kind: "area", id: area.id },
    });
    // A project id reaching the task endpoint with intent=complete must be
    // rejected BEFORE `spine.complete` (which can complete Projects) is dispatched.
    const response = await runAction(
      project.id,
      formData({ intent: "complete" }),
    );
    expect(response.status).toBe(404);
    // The project was NOT completed.
    const reread = await s.getById(project.id);
    expect(reread?.completedAt).toBeNull();
  });

  it("refuses to attach a relates_to link to a non-task anchor", async () => {
    const s = spine(CONFIGURED_WORKSPACE);
    const area = await s.createArea({ title: "Home" });
    const project = await s.createProject({
      title: "P",
      parent: { kind: "area", id: area.id },
    });
    const target = await s.createArea({ title: "Target" });
    const response = await runAction(
      project.id,
      formData({
        intent: "link",
        targetId: target.id,
        linkType: "task.relates_to",
        direction: "outgoing",
      }),
    );
    expect(response.status).toBe(404);
  });
});

describe("method guard", () => {
  it("rejects a non-POST action with 405", async () => {
    const { task } = await seedTask(CONFIGURED_WORKSPACE);
    await expect(
      action({
        request: new Request(`https://app.test/today/task/${task}`, {
          method: "GET",
        }),
        context: authedContext(),
        params: { taskId: task },
      } as unknown as Parameters<typeof action>[0]),
    ).rejects.toBeInstanceOf(Response);
  });
});
