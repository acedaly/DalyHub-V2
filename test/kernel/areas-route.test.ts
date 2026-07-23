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
  makeSpineRepository,
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
});
