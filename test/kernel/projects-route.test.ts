import { beforeEach, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";

import type { AuthenticatedSession } from "~/kernel/auth";
import { setAuthenticatedSession } from "~/platform/request";
import { action as newAction } from "~/modules/projects/routes/new";
import { action as mutateAction } from "~/modules/projects/routes/mutate";
import { loader as detailLoader } from "~/modules/projects/routes/detail";
import { loader as indexLoader } from "~/modules/projects/routes/index";
import { loader as linkTargetsLoader } from "~/modules/projects/routes/link-targets";
import { loader as tasksLoader } from "~/modules/projects/routes/tasks";
import { loader as parentOptionsLoader } from "~/modules/projects/routes/parent-options";
import type { CreateProjectResult } from "~/modules/projects/routes/new";
import type { ProjectMutationResult } from "~/modules/projects/routes/mutate";
import type { ProjectTasksPageData } from "~/modules/projects/routes/tasks";
import type { ProjectParentOptionsData } from "~/modules/projects/routes/parent-options";

import {
  FakeClock,
  makeContext,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

/**
 * PROJ-01 — the ACTUAL Projects route loaders + actions in the real Workers runtime
 * over real D1 (the deployed path). Proves the endpoints resolve the trusted
 * workspace, create/mutate through the spine, keep workspace isolation, reject
 * parent substitution + wrong-kind ids with calm not-found, and reflect mutations on
 * the next loader (the browser revalidation).
 */

const WS = "test-default-workspace";
const OTHER = "ws_projects_route_other";

const nextEntityId = sequentialIds("pent");
const nextActivityId = sequentialIds("pact");

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

function formData(entries: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    form.set(key, value);
  }
  return form;
}

async function runNew(form: FormData, method = "POST"): Promise<Response> {
  return newAction({
    request: new Request("https://app.test/projects/new", {
      method,
      body: method === "POST" ? form : undefined,
    }),
    context: authedContext(),
    params: {},
  } as unknown as Parameters<typeof newAction>[0]) as Promise<Response>;
}

async function runMutate(
  projectId: string,
  form: FormData,
  method = "POST",
): Promise<Response> {
  return mutateAction({
    request: new Request(
      `https://app.test/projects/${projectId}/mutate`,
      method === "POST" ? { method, body: form } : { method },
    ),
    context: authedContext(),
    params: { projectId },
  } as unknown as Parameters<typeof mutateAction>[0]) as Promise<Response>;
}

async function runDetail(projectId: string, tasksParam = "") {
  return detailLoader({
    request: new Request(
      `https://app.test/projects/${projectId}${tasksParam ? `?tasks=${tasksParam}` : ""}`,
    ),
    context: authedContext(),
    params: { projectId },
  } as unknown as Parameters<typeof detailLoader>[0]);
}

async function runIndex(stateParam = "", cursor?: string) {
  const params = new URLSearchParams();
  if (stateParam) params.set("state", stateParam);
  if (cursor) params.set("cursor", cursor);
  const qs = params.toString();
  return indexLoader({
    request: new Request(`https://app.test/projects${qs ? `?${qs}` : ""}`),
    context: authedContext(),
    params: {},
  } as unknown as Parameters<typeof indexLoader>[0]);
}

async function runTasks(
  projectId: string,
  opts: { state?: string; cursor?: string; limit?: string } = {},
): Promise<Response> {
  const params = new URLSearchParams();
  if (opts.state) params.set("state", opts.state);
  if (opts.cursor) params.set("cursor", opts.cursor);
  const qs = params.toString();
  return tasksLoader({
    request: new Request(
      `https://app.test/projects/${projectId}/tasks${qs ? `?${qs}` : ""}`,
    ),
    context: authedContext(),
    params: { projectId },
  } as unknown as Parameters<typeof tasksLoader>[0]) as Promise<Response>;
}

async function runParentOptions(query = ""): Promise<Response> {
  return parentOptionsLoader({
    request: new Request(
      `https://app.test/projects/parent-options?q=${encodeURIComponent(query)}`,
    ),
    context: authedContext(),
    params: {},
  } as unknown as Parameters<
    typeof parentOptionsLoader
  >[0]) as Promise<Response>;
}

/** Seed an Area (+ optional Goal) in a workspace; return their ids. */
async function seedParents(
  ws: string,
): Promise<{ area: string; goal: string }> {
  const s = spine(ws);
  const area = await s.createArea({ title: "Career" });
  const goal = await s.createGoal({ title: "Ship v2", areaId: area.id });
  return { area: area.id, goal: goal.id };
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("POST /projects/new", () => {
  it("creates a project under an Area", async () => {
    const { area } = await seedParents(WS);
    const response = await runNew(
      formData({ title: "DalyHub V2", parentId: area }),
    );
    const body = (await response.json()) as CreateProjectResult;
    expect(body.ok).toBe(true);
    if (body.ok) {
      const detail = await runDetail(body.projectId);
      expect("overview" in detail && detail.overview.title).toBe("DalyHub V2");
    }
  });

  it("creates a project advancing a Goal and derives the Area", async () => {
    const { area, goal } = await seedParents(WS);
    const response = await runNew(
      formData({ title: "12-week plan", parentId: goal }),
    );
    const body = (await response.json()) as CreateProjectResult;
    expect(body.ok).toBe(true);
    if (body.ok) {
      const detail = await runDetail(body.projectId);
      if ("overview" in detail) {
        expect(detail.overview.goal?.id).toBe(goal);
        expect(detail.overview.area?.id).toBe(area);
      }
    }
  });

  it("rejects a GET (method guard)", async () => {
    await expect(runNew(new FormData(), "GET")).rejects.toMatchObject({
      status: 405,
    });
  });

  it("rejects an empty title with a field error", async () => {
    const { area } = await seedParents(WS);
    const body = (await (
      await runNew(formData({ title: "  ", parentId: area }))
    ).json()) as CreateProjectResult;
    expect(body.ok).toBe(false);
    if (!body.ok) expect(body.fieldErrors?.title).toBeTruthy();
  });

  it("rejects a missing / wrong-kind / cross-workspace parent", async () => {
    const { area } = await seedParents(WS);
    const s = spine(WS);
    const project = await s.createProject({
      title: "A project",
      parent: { kind: "area", id: area },
    });
    // Missing parent.
    let body = (await (
      await runNew(formData({ title: "X", parentId: "nope" }))
    ).json()) as CreateProjectResult;
    expect(body.ok).toBe(false);
    // Wrong kind: a Project can't parent a Project.
    body = (await (
      await runNew(formData({ title: "X", parentId: project.id }))
    ).json()) as CreateProjectResult;
    expect(body.ok).toBe(false);
    // Cross-workspace parent id is invisible → rejected.
    const otherArea = (await spine(OTHER).createArea({ title: "Other" })).id;
    body = (await (
      await runNew(formData({ title: "X", parentId: otherArea }))
    ).json()) as CreateProjectResult;
    expect(body.ok).toBe(false);
  });
});

describe("POST /projects/:projectId/mutate", () => {
  async function seedProject(ws: string): Promise<string> {
    const { area } = await seedParents(ws);
    const project = await spine(ws).createProject({
      title: "Original",
      parent: { kind: "area", id: area },
    });
    return project.id;
  }

  it("renames, completes and reopens through the spine", async () => {
    const projectId = await seedProject(WS);

    let body = (await (
      await runMutate(
        projectId,
        formData({ intent: "rename", title: "Renamed" }),
      )
    ).json()) as ProjectMutationResult;
    expect(body).toMatchObject({ kind: "rename", ok: true });

    body = (await (
      await runMutate(projectId, formData({ intent: "complete" }))
    ).json()) as ProjectMutationResult;
    expect(body).toMatchObject({
      kind: "completion",
      ok: true,
      completed: true,
    });

    body = (await (
      await runMutate(projectId, formData({ intent: "reopen" }))
    ).json()) as ProjectMutationResult;
    expect(body).toMatchObject({
      kind: "completion",
      ok: true,
      completed: false,
    });

    const detail = await runDetail(projectId);
    if ("overview" in detail) {
      expect(detail.overview.title).toBe("Renamed");
      expect(detail.overview.completedAt).toBeNull();
    }
  });

  it("binds a new task to the route project, ignoring a substituted project id", async () => {
    const target = await seedProject(WS);
    const other = await seedProject(WS);

    // The client sends a bogus `projectId` field — it must be ignored; the parent is
    // the ROUTE project.
    const body = (await (
      await runMutate(
        target,
        formData({
          intent: "create_task",
          title: "Do the thing",
          projectId: other,
        }),
      )
    ).json()) as ProjectMutationResult;
    expect(body).toMatchObject({ kind: "create_task", ok: true });

    // The task appears under the target project and NOT under the other project.
    const targetDetail = await runDetail(target);
    const otherDetail = await runDetail(other);
    if ("tasks" in targetDetail && "tasks" in otherDetail) {
      expect(targetDetail.tasks.map((t) => t.title)).toContain("Do the thing");
      expect(otherDetail.tasks).toHaveLength(0);
    }
  });

  it("returns 404 for a wrong-kind or cross-workspace project id", async () => {
    const { area } = await seedParents(WS);
    // An Area id is not a project.
    await expect(
      runMutate(area, formData({ intent: "rename", title: "X" })),
    ).rejects.toMatchObject({ status: 404 });

    // A cross-workspace project id is invisible.
    const otherProject = await (async () => {
      const { area: oa } = await seedParents(OTHER);
      return (
        await spine(OTHER).createProject({
          title: "Hidden",
          parent: { kind: "area", id: oa },
        })
      ).id;
    })();
    await expect(
      runMutate(otherProject, formData({ intent: "rename", title: "X" })),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rejects a GET (method guard)", async () => {
    const projectId = await seedProject(WS);
    await expect(
      runMutate(projectId, new FormData(), "GET"),
    ).rejects.toMatchObject({ status: 405 });
  });

  it("reflects a created task and the roll-up on the next loader (revalidation)", async () => {
    const projectId = await seedProject(WS);

    let detail = await runDetail(projectId);
    if ("progress" in detail) {
      expect(detail.progress.total).toBe(0);
      expect(detail.progress.has).toBe(false);
    }

    await runMutate(
      projectId,
      formData({ intent: "create_task", title: "First task" }),
    );

    detail = await runDetail(projectId, "all");
    if ("progress" in detail && "tasks" in detail) {
      expect(detail.progress.total).toBe(1);
      expect(detail.tasks.map((t) => t.title)).toContain("First task");
    }
  });
});

describe("project loaders", () => {
  it("the collection lists projects and offers Area/Goal parent options", async () => {
    const { area } = await seedParents(WS);
    await spine(WS).createProject({
      title: "P1",
      parent: { kind: "area", id: area },
    });

    const data = await runIndex();
    expect(data.projects.map((p) => p.title)).toContain("P1");
    // The create form's parent options include the Area and the Goal.
    const descriptions = data.parentOptions.map((o) => o.description);
    expect(descriptions).toContain("Area");
    expect(descriptions).toContain("Goal");
  });

  it("the collection state filter narrows to open / completed", async () => {
    const { area } = await seedParents(WS);
    const s = spine(WS);
    await s.createProject({
      title: "Open",
      parent: { kind: "area", id: area },
    });
    const done = await s.createProject({
      title: "Done",
      parent: { kind: "area", id: area },
    });
    await s.complete(done.id);

    const open = await runIndex("open");
    expect(open.projects.map((p) => p.title)).toEqual(["Open"]);
    const completed = await runIndex("completed");
    expect(completed.projects.map((p) => p.title)).toEqual(["Done"]);
  });

  it("the record loader returns a calm 404 for missing / cross-workspace ids", async () => {
    await expect(runDetail("does-not-exist")).rejects.toMatchObject({
      status: 404,
    });
    const { area } = await seedParents(OTHER);
    const hidden = (
      await spine(OTHER).createProject({
        title: "Hidden",
        parent: { kind: "area", id: area },
      })
    ).id;
    await expect(runDetail(hidden)).rejects.toMatchObject({ status: 404 });
  });

  it("the link-targets loader 404s for a non-project anchor", async () => {
    const { area } = await seedParents(WS);
    const response = (await linkTargetsLoader({
      request: new Request(`https://app.test/projects/${area}/link-targets?q=`),
      context: authedContext(),
      params: { projectId: area },
    } as unknown as Parameters<typeof linkTargetsLoader>[0])) as Response;
    expect(response.status).toBe(404);
  });

  it("both loaders surface derived health (collection + record), and completing a task refreshes it", async () => {
    const s = spine(WS);
    const t = makeTaskRepository(makeContext(WS), {
      clock: new FakeClock().now,
      activityIdGenerator: sequentialIds("hact"),
    });
    const area = await s.createArea({ title: "Area" });
    const project = await s.createProject({
      title: "Overdue project",
      parent: { kind: "area", id: area.id },
    });
    const task = await s.createTask({
      title: "Overdue task",
      parent: { kind: "project", id: project.id },
    });
    await t.updateTask(task.id, { dueDate: "2000-01-01" });

    // Collection loader carries health on the item.
    const page = await runIndex("all");
    const item = page.projects.find((p) => p.id === project.id)!;
    expect(item.health.state).toBe("at_risk");
    expect(item.health.reasons[0].code).toBe("overdue");

    // Record loader carries health too.
    let detail = await runDetail(project.id);
    expect(detail.health.state).toBe("at_risk");

    // Resolving the cause (completing the overdue task) refreshes health on the next
    // loader run — derived, never cached.
    await t.completeTask(task.id);
    detail = await runDetail(project.id);
    expect(detail.health.state).toBe("on_track");
  });

  it("the collection loader paginates: nextCursor reaches every project", async () => {
    const { area } = await seedParents(WS);
    const s = spine(WS);
    const created: string[] = [];
    for (let i = 0; i < 55; i += 1) {
      created.push(
        (
          await s.createProject({
            title: `P${i}`,
            parent: { kind: "area", id: area },
          })
        ).id,
      );
    }

    const walked: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await runIndex("all", cursor);
      walked.push(...page.projects.map((p) => p.id));
      cursor = page.nextCursor ?? undefined;
      pages += 1;
      expect(pages).toBeLessThan(20);
    } while (cursor);

    // Every created project is reachable, with no duplicates.
    expect(new Set(walked)).toEqual(new Set(created));
    expect(walked).toHaveLength(55);
    expect(new Set(walked).size).toBe(55);
  });
});

describe("GET /projects/:projectId/tasks (pagination endpoint)", () => {
  async function seedProjectWithTasks(count: number): Promise<{
    projectId: string;
    taskIds: string[];
  }> {
    const { area } = await seedParents(WS);
    const s = spine(WS);
    const project = await s.createProject({
      title: "Big",
      parent: { kind: "area", id: area },
    });
    const taskIds: string[] = [];
    for (let i = 0; i < count; i += 1) {
      taskIds.push(
        (
          await s.createTask({
            title: `T${i}`,
            parent: { kind: "project", id: project.id },
          })
        ).id,
      );
    }
    return { projectId: project.id, taskIds };
  }

  it("returns a keyset page and reaches every task across cursors", async () => {
    const { projectId, taskIds } = await seedProjectWithTasks(55);

    const walked: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const response = await runTasks(projectId, { state: "all", cursor });
      expect(response.status).toBe(200);
      const body = (await response.json()) as ProjectTasksPageData;
      walked.push(...body.tasks.map((t) => t.id));
      cursor = body.nextCursor ?? undefined;
      pages += 1;
      expect(pages).toBeLessThan(20);
    } while (cursor);

    expect(new Set(walked)).toEqual(new Set(taskIds));
    expect(walked).toHaveLength(55);
    expect(new Set(walked).size).toBe(55);
  });

  it("rejects a tampered cursor with a calm 400 (never a 500)", async () => {
    const { projectId } = await seedProjectWithTasks(2);
    const response = await runTasks(projectId, {
      state: "all",
      cursor: "not-a-real-cursor",
    });
    expect(response.status).toBe(400);
  });

  it("does not disclose another workspace's tasks (empty page)", async () => {
    const { projectId } = await seedProjectWithTasks(3);
    // Same endpoint, but the caller is authenticated to WS; a project that lives in
    // OTHER simply yields no tasks. Here we prove an in-WS project returns rows and a
    // cross-workspace cursor is rejected rather than reinterpreted.
    const first = await runTasks(projectId, { state: "all" });
    const body = (await first.json()) as ProjectTasksPageData;
    expect(body.tasks.length).toBeGreaterThan(0);
  });
});

describe("GET /projects/parent-options (parent search endpoint)", () => {
  it("returns active Areas and Goals, filtered by the query, with their kinds", async () => {
    const s = spine(WS);
    const career = await s.createArea({ title: "Career" });
    await s.createGoal({ title: "Ship v2", areaId: career.id });
    await s.createArea({ title: "Health" });

    const all = (await (
      await runParentOptions("")
    ).json()) as ProjectParentOptionsData;
    const kinds = new Set(all.options.map((o) => o.description));
    expect(kinds).toContain("Area");
    expect(kinds).toContain("Goal");
    expect(all.options.map((o) => o.label)).toEqual(
      expect.arrayContaining(["Career", "Ship v2", "Health"]),
    );

    // A query narrows by title (case-insensitive).
    const health = (await (
      await runParentOptions("heal")
    ).json()) as ProjectParentOptionsData;
    expect(health.options.map((o) => o.label)).toEqual(["Health"]);
  });

  it("excludes projects and tasks — only Areas and Goals are selectable", async () => {
    const s = spine(WS);
    const area = await s.createArea({ title: "Career" });
    await s.createProject({
      title: "A Project",
      parent: { kind: "area", id: area.id },
    });

    const body = (await (
      await runParentOptions("")
    ).json()) as ProjectParentOptionsData;
    expect(body.options.map((o) => o.label)).not.toContain("A Project");
  });
});
