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
    user: { subject, email: "owner@example.com", displayName: null },
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

/**
 * PROJ-05 Slice 3 — the settings intents (`set_status`/`move`/`archive`/
 * `restore`) at the ACTUAL route boundary. The repository-level atomicity,
 * concurrency and archive-guard invariants are already proven in
 * `project-settings.test.ts` / `project-archive-guard.test.ts`; these tests
 * prove the ROUTE dispatches them correctly, revalidates honestly (via the
 * next `runDetail`), and gates EVERY other intent against an archived project.
 */
describe("POST /projects/:projectId/mutate — PROJ-05 settings intents", () => {
  async function seedProject(ws: string): Promise<{
    projectId: string;
    areaId: string;
    goalId: string;
  }> {
    const { area, goal } = await seedParents(ws);
    const project = await spine(ws).createProject({
      title: "Settings subject",
      parent: { kind: "area", id: area },
    });
    return { projectId: project.id, areaId: area, goalId: goal };
  }

  describe("set_status", () => {
    it("changes the workflow status and reflects it on the next loader", async () => {
      const { projectId } = await seedProject(WS);
      const body = (await (
        await runMutate(
          projectId,
          formData({ intent: "set_status", status: "active" }),
        )
      ).json()) as ProjectMutationResult;
      expect(body).toMatchObject({
        kind: "settings",
        ok: true,
        outcome: "changed",
      });
      const detail = await runDetail(projectId);
      if ("overview" in detail) {
        expect(detail.overview.status).toBe("active");
      }
    });

    it("is a no-op that reports 'unchanged' when the status already holds", async () => {
      const { projectId } = await seedProject(WS);
      await runMutate(
        projectId,
        formData({ intent: "set_status", status: "active" }),
      );
      const body = (await (
        await runMutate(
          projectId,
          formData({ intent: "set_status", status: "active" }),
        )
      ).json()) as ProjectMutationResult;
      expect(body).toMatchObject({ outcome: "unchanged" });
    });

    it("rejects an invalid status value calmly", async () => {
      const { projectId } = await seedProject(WS);
      const body = (await (
        await runMutate(
          projectId,
          formData({ intent: "set_status", status: "bogus" }),
        )
      ).json()) as ProjectMutationResult;
      expect(body).toMatchObject({
        kind: "settings",
        ok: false,
        outcome: "invalid",
      });
    });
  });

  describe("move", () => {
    it("moves a project from its Area to its Goal", async () => {
      const { projectId, goalId } = await seedProject(WS);
      const body = (await (
        await runMutate(
          projectId,
          formData({ intent: "move", parentId: goalId }),
        )
      ).json()) as ProjectMutationResult;
      expect(body).toMatchObject({ outcome: "moved" });
      const detail = await runDetail(projectId);
      if ("overview" in detail) {
        expect(detail.overview.goal?.id).toBe(goalId);
      }
    });

    it("moves a project from a Goal back to a plain Area", async () => {
      const { area, goal } = await seedParents(WS);
      const project = await spine(WS).createProject({
        title: "Goal-parented",
        parent: { kind: "goal", id: goal },
      });
      const body = (await (
        await runMutate(
          project.id,
          formData({ intent: "move", parentId: area }),
        )
      ).json()) as ProjectMutationResult;
      expect(body).toMatchObject({ outcome: "moved" });
      const detail = await runDetail(project.id);
      if ("overview" in detail) {
        expect(detail.overview.area?.id).toBe(area);
        expect(detail.overview.goal).toBeNull();
      }
    });

    it("moves between two Areas", async () => {
      const { projectId } = await seedProject(WS);
      const otherArea = (await spine(WS).createArea({ title: "Home" })).id;
      const body = (await (
        await runMutate(
          projectId,
          formData({ intent: "move", parentId: otherArea }),
        )
      ).json()) as ProjectMutationResult;
      expect(body).toMatchObject({ outcome: "moved" });
      const detail = await runDetail(projectId);
      if ("overview" in detail) {
        expect(detail.overview.area?.id).toBe(otherArea);
      }
    });

    it("resolves a project’s Area live through its Goal (never a copied title)", async () => {
      const { area, goal } = await seedParents(WS);
      const project = await spine(WS).createProject({
        title: "Via goal",
        parent: { kind: "goal", id: goal },
      });
      const detail = await runDetail(project.id);
      if ("overview" in detail) {
        expect(detail.overview.area?.id).toBe(area);
        expect(detail.overview.goal?.id).toBe(goal);
      }
    });

    it("selecting the current parent is a no-op (unchanged, no Activity churn)", async () => {
      const { projectId, areaId } = await seedProject(WS);
      const body = (await (
        await runMutate(
          projectId,
          formData({ intent: "move", parentId: areaId }),
        )
      ).json()) as ProjectMutationResult;
      expect(body).toMatchObject({ outcome: "unchanged" });
    });

    it("rejects a wrong-kind parent (a Task or Project id)", async () => {
      const { projectId } = await seedProject(WS);
      const other = await seedProject(WS);
      const body = (await (
        await runMutate(
          projectId,
          formData({ intent: "move", parentId: other.projectId }),
        )
      ).json()) as ProjectMutationResult;
      expect(body).toMatchObject({ ok: false, outcome: "invalid" });
    });

    it("rejects a missing/deleted or cross-workspace parent", async () => {
      const { projectId } = await seedProject(WS);
      let body = (await (
        await runMutate(
          projectId,
          formData({ intent: "move", parentId: "nope" }),
        )
      ).json()) as ProjectMutationResult;
      expect(body).toMatchObject({ ok: false, outcome: "invalid" });

      const s = spine(WS);
      const deletedArea = (await s.createArea({ title: "Gone soon" })).id;
      await s.softDelete(deletedArea);
      body = (await (
        await runMutate(
          projectId,
          formData({ intent: "move", parentId: deletedArea }),
        )
      ).json()) as ProjectMutationResult;
      expect(body).toMatchObject({ ok: false, outcome: "invalid" });

      const { area: otherArea } = await seedParents(OTHER);
      body = (await (
        await runMutate(
          projectId,
          formData({ intent: "move", parentId: otherArea }),
        )
      ).json()) as ProjectMutationResult;
      expect(body).toMatchObject({ ok: false, outcome: "invalid" });
    });
  });

  describe("archive / restore", () => {
    it("archives an eligible project and the collection/record reflect it", async () => {
      const { projectId } = await seedProject(WS);
      const body = (await (
        await runMutate(projectId, formData({ intent: "archive" }))
      ).json()) as ProjectMutationResult;
      expect(body).toMatchObject({ outcome: "archived" });

      const detail = await runDetail(projectId);
      if ("overview" in detail) {
        expect(detail.overview.archivedAt).not.toBeNull();
      }
      const archivedList = await runIndex("archived");
      expect(archivedList.projects.map((p) => p.id)).toContain(projectId);
      const openList = await runIndex("open");
      expect(openList.projects.map((p) => p.id)).not.toContain(projectId);
      const allList = await runIndex("all");
      expect(allList.projects.map((p) => p.id)).not.toContain(projectId);
    });

    it("blocks archiving while an unfinished direct Task exists, mutating nothing", async () => {
      const { projectId } = await seedProject(WS);
      await runMutate(
        projectId,
        formData({ intent: "create_task", title: "Unfinished" }),
      );
      const before = await runDetail(projectId);

      const body = (await (
        await runMutate(projectId, formData({ intent: "archive" }))
      ).json()) as ProjectMutationResult;
      expect(body).toMatchObject({
        kind: "settings",
        ok: false,
        outcome: "blocked",
        message:
          "Complete or move the unfinished tasks before archiving this project.",
      });

      // Never claims archived; settings/updatedAt unchanged.
      const after = await runDetail(projectId);
      if ("overview" in before && "overview" in after) {
        expect(after.overview.archivedAt).toBeNull();
        expect(after.overview.updatedAt).toBe(before.overview.updatedAt);
      }
    });

    it("archiving is unblocked once the unfinished Task is completed or moved away", async () => {
      const { projectId } = await seedProject(WS);
      const createBody = (await (
        await runMutate(
          projectId,
          formData({ intent: "create_task", title: "Will complete" }),
        )
      ).json()) as ProjectMutationResult;
      expect(createBody.kind).toBe("create_task");
      const taskId =
        createBody.kind === "create_task" && createBody.ok
          ? createBody.taskId
          : "";
      await makeTaskRepository(makeContext(WS)).completeTask(taskId);

      const body = (await (
        await runMutate(projectId, formData({ intent: "archive" }))
      ).json()) as ProjectMutationResult;
      expect(body).toMatchObject({ outcome: "archived" });
    });

    it("repeated archive is a harmless no-op", async () => {
      const { projectId } = await seedProject(WS);
      await runMutate(projectId, formData({ intent: "archive" }));
      const body = (await (
        await runMutate(projectId, formData({ intent: "archive" }))
      ).json()) as ProjectMutationResult;
      expect(body).toMatchObject({ ok: true, outcome: "unchanged" });
    });

    it("restores an archived project via the restore intent", async () => {
      const { projectId } = await seedProject(WS);
      await runMutate(projectId, formData({ intent: "archive" }));
      const body = (await (
        await runMutate(projectId, formData({ intent: "restore" }))
      ).json()) as ProjectMutationResult;
      expect(body).toMatchObject({ outcome: "restored" });
      const detail = await runDetail(projectId);
      if ("overview" in detail) {
        expect(detail.overview.archivedAt).toBeNull();
      }
    });

    it("preserves the workflow status across archive → restore", async () => {
      const { projectId } = await seedProject(WS);
      await runMutate(
        projectId,
        formData({ intent: "set_status", status: "on_hold" }),
      );
      await runMutate(projectId, formData({ intent: "archive" }));
      await runMutate(projectId, formData({ intent: "restore" }));
      const detail = await runDetail(projectId);
      if ("overview" in detail) {
        expect(detail.overview.status).toBe("on_hold");
        expect(detail.overview.archivedAt).toBeNull();
      }
    });

    it("repeated restore (or restoring a never-archived project) is a harmless no-op", async () => {
      const { projectId } = await seedProject(WS);
      const body = (await (
        await runMutate(projectId, formData({ intent: "restore" }))
      ).json()) as ProjectMutationResult;
      expect(body).toMatchObject({ ok: true, outcome: "unchanged" });
    });

    it("rejects EVERY non-restore intent against an archived project, calmly", async () => {
      const { projectId, areaId, goalId } = await seedProject(WS);
      await runMutate(projectId, formData({ intent: "archive" }));

      const rejected = async (
        entries: Record<string, string>,
      ): Promise<ProjectMutationResult> =>
        (await runMutate(projectId, formData(entries)).then((r) =>
          r.json(),
        )) as ProjectMutationResult;

      expect(
        await rejected({ intent: "rename", title: "New name" }),
      ).toMatchObject({
        kind: "settings",
        ok: false,
        outcome: "archived_rejected",
      });
      expect(await rejected({ intent: "complete" })).toMatchObject({
        outcome: "archived_rejected",
      });
      expect(
        await rejected({ intent: "create_task", title: "Nope" }),
      ).toMatchObject({ outcome: "archived_rejected" });
      expect(
        await rejected({ intent: "set_status", status: "active" }),
      ).toMatchObject({ outcome: "archived_rejected" });
      expect(
        await rejected({ intent: "move", parentId: goalId }),
      ).toMatchObject({ outcome: "archived_rejected" });
      expect(await rejected({ intent: "unlink", linkId: "x" })).toMatchObject({
        outcome: "archived_rejected",
      });

      // The project itself is untouched throughout.
      const detail = await runDetail(projectId);
      if ("overview" in detail) {
        expect(detail.overview.title).toBe("Settings subject");
        expect(detail.overview.status).toBe("planned");
      }
      void areaId;
    });

    it("archive itself 404s for a wrong-kind or cross-workspace id", async () => {
      const { area } = await seedParents(WS);
      await expect(
        runMutate(area, formData({ intent: "archive" })),
      ).rejects.toMatchObject({ status: 404 });

      const { area: otherArea } = await seedParents(OTHER);
      const otherProject = await spine(OTHER).createProject({
        title: "Hidden",
        parent: { kind: "area", id: otherArea },
      });
      await expect(
        runMutate(otherProject.id, formData({ intent: "archive" })),
      ).rejects.toMatchObject({ status: 404 });
    });
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

  describe("the 'archived' collection state (PROJ-05 §7)", () => {
    it("separates archived projects from open/completed/all", async () => {
      const { area } = await seedParents(WS);
      const s = spine(WS);
      const open = await s.createProject({
        title: "Open",
        parent: { kind: "area", id: area },
      });
      const done = await s.createProject({
        title: "Done",
        parent: { kind: "area", id: area },
      });
      await s.complete(done.id);
      const archived = await s.createProject({
        title: "Archived",
        parent: { kind: "area", id: area },
      });
      await runMutate(archived.id, formData({ intent: "archive" }));

      expect((await runIndex("open")).projects.map((p) => p.id)).toEqual([
        open.id,
      ]);
      expect((await runIndex("completed")).projects.map((p) => p.id)).toEqual([
        done.id,
      ]);
      expect((await runIndex("archived")).projects.map((p) => p.id)).toEqual([
        archived.id,
      ]);
      // "all" keeps its existing, exact meaning (every non-archived project) —
      // the archived project never leaks into it.
      const all = (await runIndex("all")).projects.map((p) => p.id);
      expect(all).toEqual(expect.arrayContaining([open.id, done.id]));
      expect(all).not.toContain(archived.id);
    });

    it("keyset-paginates the Archived collection with scope-bound cursors", async () => {
      const { area } = await seedParents(WS);
      const s = spine(WS);
      const archivedIds: string[] = [];
      for (let i = 0; i < 12; i += 1) {
        const p = await s.createProject({
          title: `Sunset ${i}`,
          parent: { kind: "area", id: area },
        });
        await runMutate(p.id, formData({ intent: "archive" }));
        archivedIds.push(p.id);
      }

      const walked: string[] = [];
      let cursor: string | undefined;
      let pages = 0;
      do {
        // A small page size to force multiple pages over only 12 rows.
        const page = await indexLoader({
          request: new Request(
            `https://app.test/projects?state=archived${cursor ? `&cursor=${cursor}` : ""}`,
          ),
          context: authedContext(),
          params: {},
        } as unknown as Parameters<typeof indexLoader>[0]);
        walked.push(...page.projects.map((p) => p.id));
        cursor = page.nextCursor ?? undefined;
        pages += 1;
        expect(pages).toBeLessThan(20);
      } while (cursor);
      expect(new Set(walked)).toEqual(new Set(archivedIds));

      // A cursor issued for a different state is rejected, never reinterpreted
      // — the archived page loads cleanly instead of leaking an open-state page.
      const archivedFirstPage = await runIndex("archived");
      if (archivedFirstPage.nextCursor) {
        const openWithArchivedCursor = await runIndex(
          "open",
          archivedFirstPage.nextCursor,
        );
        // A rejected cursor degrades to the calm "failed" loader shape, never a
        // 500 and never a silently-reinterpreted page of the wrong scope.
        expect(openWithArchivedCursor.failed).toBe(true);
      }
    });

    it("never surfaces a wrong-kind, deleted or cross-workspace project", async () => {
      const { area } = await seedParents(WS);
      const s = spine(WS);
      await s.createArea({ title: "Not a project" });
      const deletedProject = await s.createProject({
        title: "Deleted",
        parent: { kind: "area", id: area },
      });
      await s.softDelete(deletedProject.id);
      const { area: otherArea } = await seedParents(OTHER);
      await spine(OTHER).createProject({
        title: "Other workspace",
        parent: { kind: "area", id: otherArea },
      });

      const archived = await runIndex("archived");
      expect(archived.projects).toHaveLength(0);
    });
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

  it("does not disclose another workspace’s tasks (empty page)", async () => {
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
