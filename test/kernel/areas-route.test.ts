import { beforeEach, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";

import type { AuthenticatedSession } from "~/kernel/auth";
import { setAuthenticatedSession } from "~/platform/request";
import { loader as indexLoader } from "~/modules/areas/routes/index";
import { loader as detailLoader } from "~/modules/areas/routes/detail";
import { action as newAction } from "~/modules/areas/routes/new";
import { action as mutateAction } from "~/modules/areas/routes/mutate";
import { loader as activityLoader } from "~/modules/areas/routes/activity";
import type { CreateAreaResult } from "~/modules/areas/routes/new";
import type { AreaMutationResult } from "~/modules/areas/routes/mutate";

import {
  FakeClock,
  makeActivityRepository,
  makeContext,
  makeProjectSettingsRepository,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "test-default-workspace";
const OTHER = "ws_areas_route_other";
const nextEntityId = sequentialIds("areaent");
const nextActivityId = sequentialIds("areaact");

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
  for (const [key, value] of Object.entries(entries)) form.set(key, value);
  return form;
}

async function runNew(form: FormData, method = "POST"): Promise<Response> {
  return newAction({
    request: new Request("https://app.test/areas/new", {
      method,
      body: method === "POST" ? form : undefined,
    }),
    context: authedContext(),
    params: {},
  } as unknown as Parameters<typeof newAction>[0]) as Promise<Response>;
}

async function runMutate(
  areaId: string,
  form: FormData,
  method = "POST",
): Promise<Response> {
  return mutateAction({
    request: new Request(
      `https://app.test/areas/${areaId}/mutate`,
      method === "POST" ? { method, body: form } : { method },
    ),
    context: authedContext(),
    params: { areaId },
  } as unknown as Parameters<typeof mutateAction>[0]) as Promise<Response>;
}

function runIndex(cursor?: string) {
  return indexLoader({
    request: new Request(
      `https://app.test/areas${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    ),
    context: authedContext(),
    params: {},
  } as unknown as Parameters<typeof indexLoader>[0]);
}

function runDetail(areaId: string) {
  return detailLoader({
    request: new Request(`https://app.test/areas/${areaId}`),
    context: authedContext(),
    params: { areaId },
  } as unknown as Parameters<typeof detailLoader>[0]);
}

async function runActivity(areaId: string): Promise<Response> {
  return activityLoader({
    request: new Request(`https://app.test/areas/${areaId}/activity`),
    context: authedContext(),
    params: { areaId },
  } as unknown as Parameters<typeof activityLoader>[0]) as Promise<Response>;
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("Area routes", () => {
  it("creates an Area, redirects consumer data to the canonical record and lists it", async () => {
    const response = await runNew(formData({ title: "Career" }));
    const body = (await response.json()) as CreateAreaResult;
    expect(body.ok).toBe(true);
    if (!body.ok) return;

    const detail = await runDetail(body.areaId);
    expect("overview" in detail && detail.overview.title).toBe("Career");
    const index = await runIndex();
    expect(index.failed).toBe(false);
    expect(index.areas.map((area) => area.id)).toContain(body.areaId);
  });

  it("validates required title and does not write on failure", async () => {
    const response = await runNew(formData({ title: "   " }));
    const body = (await response.json()) as CreateAreaResult;
    expect(body.ok).toBe(false);
    const index = await runIndex();
    expect(index.areas).toHaveLength(0);
  });

  it("renames only Areas and records mutation Activity", async () => {
    const s = spine(WS);
    const area = await s.createArea({ title: "Career" });
    const project = await s.createProject({
      title: "Wrong kind",
      parent: { kind: "area", id: area.id },
    });

    const response = await runMutate(
      area.id,
      formData({ intent: "rename", title: "Career and craft" }),
    );
    const body = (await response.json()) as AreaMutationResult;
    expect(body).toEqual({ kind: "rename", ok: true });
    const detail = await runDetail(area.id);
    expect("overview" in detail && detail.overview.title).toBe(
      "Career and craft",
    );

    await expect(
      runMutate(project.id, formData({ intent: "rename", title: "X" })),
    ).rejects.toMatchObject({ status: 404 });

    const activity = await makeActivityRepository(
      makeContext(WS),
    ).listForEntity(area.id);
    expect(activity.items.some((item) => item.type === "entity.updated")).toBe(
      true,
    );
  });

  it("fails closed for cross-workspace and missing Area records", async () => {
    const otherArea = await spine(OTHER).createArea({ title: "Other" });
    await expect(runDetail(otherArea.id)).rejects.toMatchObject({
      status: 404,
    });
    const activity = await runActivity(otherArea.id);
    expect(activity.status).toBe(404);
  });

  it("returns bounded Activity pages through the shared Activity route", async () => {
    const response = await runNew(formData({ title: "Health" }));
    const body = (await response.json()) as CreateAreaResult;
    expect(body.ok).toBe(true);
    if (!body.ok) return;

    const activity = await runActivity(body.areaId);
    expect(activity.status).toBe(200);
    const page = (await activity.json()) as { items: readonly unknown[] };
    expect(page.items.length).toBeGreaterThan(0);
  });

  it("Area momentum reports an at-risk Project seeded past the first bounded card page (55 Projects)", async () => {
    const s = spine(WS);
    const settings = makeProjectSettingsRepository(makeContext(WS));
    const tasks = makeTaskRepository(makeContext(WS));
    const area = await s.createArea({ title: "Big Area" });

    // 55 direct Projects, all created on the SAME clock instant (this file's
    // `spine()` helper always starts a fresh FakeClock at a fixed instant), so the
    // deterministic `(created_at, id)` keyset orders them purely by their
    // sequentially-generated id — never by wall-clock timing.
    const projectIds: string[] = [];
    for (let i = 0; i < 55; i++) {
      const project = await s.createProject({
        title: `Project ${i}`,
        parent: { kind: "area", id: area.id },
      });
      projectIds.push(project.id);
    }
    // The LAST-created Project has the highest id, so it sorts onto the SECOND
    // (undisplayed) page under the 50-item bounded card page.
    const beyondPageOneId = projectIds[projectIds.length - 1]!;
    await settings.setStatus(beyondPageOneId, "active");
    const overdueTask = await s.createTask({
      title: "Overdue",
      parent: { kind: "project", id: beyondPageOneId },
    });
    await tasks.updateTask(overdueTask.id, { dueDate: "2000-01-01" });

    const detail = await runDetail(area.id);
    expect("overview" in detail).toBe(true);
    if (!("overview" in detail)) return;

    // The DISPLAYED card page stays bounded and does NOT include the Project.
    expect(detail.projects.length).toBeLessThanOrEqual(50);
    expect(detail.projects.some((p) => p.id === beyondPageOneId)).toBe(false);
    expect(detail.projectsNextCursor).toBeTruthy();

    // The COMPLETE momentum aggregate still reports the warning.
    expect(detail.momentum.state).toBe("needs_attention");
    expect(detail.momentum.reasons.map((r) => r.code)).toContain(
      "at_risk_projects",
    );
  });

  it("Area momentum ignores a completed/archived Project's health facts and reflects exact direct-task counts", async () => {
    const s = spine(WS);
    const settings = makeProjectSettingsRepository(makeContext(WS));
    const area = await s.createArea({ title: "Context Area" });

    const doneProject = await s.createProject({
      title: "Done",
      parent: { kind: "area", id: area.id },
    });
    await settings.setStatus(doneProject.id, "active");
    await s.complete(doneProject.id);

    const archivedProject = await s.createProject({
      title: "Archived",
      parent: { kind: "area", id: area.id },
    });
    await settings.setStatus(archivedProject.id, "active");
    await settings.archive(archivedProject.id);

    const directOpen = await s.createTask({
      title: "Direct open",
      parent: { kind: "area", id: area.id },
    });
    const directDone = await s.createTask({
      title: "Direct done",
      parent: { kind: "area", id: area.id },
    });
    await s.complete(directDone.id);
    expect(directOpen.id).toBeTruthy();

    const detail = await runDetail(area.id);
    expect("overview" in detail).toBe(true);
    if (!("overview" in detail)) return;

    // A completed/archived Project never drives an active warning, and the one
    // unfinished direct Area Task correctly wins as "steady" — never a zero-count
    // reason, and never conflated with the completed direct Task.
    expect(detail.momentum.state).toBe("steady");
    const codes = detail.momentum.reasons.map((r) => r.code);
    expect(codes).toContain("unfinished_direct_tasks");
    expect(codes).toContain("completed_projects_ignored");
    expect(codes).toContain("archived_projects_ignored");
    for (const reason of detail.momentum.reasons) {
      if (reason.count !== undefined) {
        expect(reason.count).toBeGreaterThan(0);
      }
    }
  });
});
