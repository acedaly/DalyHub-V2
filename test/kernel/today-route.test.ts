import { beforeEach, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";

import type { AuthenticatedSession } from "~/kernel/auth";
import { setAuthenticatedSession } from "~/platform/request";
import { loader as todayLoader } from "~/modules/today/routes/index";

import {
  FakeClock,
  makeContext,
  makeProjectSettingsRepository,
  makeSpineRepository,
  resetTables,
  sequentialIds,
} from "./support";

/**
 * PROJ-05 Slice 4 — the ACTUAL `/today` route loader in the real Workers runtime
 * over real D1, proving "Continue working" is genuinely Active-only: `state: "open"`
 * plus `workflowStatus: "active"` together exclude Planned, On hold, Completed and
 * Archived projects (including a Completed or Archived project whose PRESERVED
 * workflow status is "active" — the state/completion/archival guards are
 * independent of workflow status), workspace isolation holds, the bound and
 * "recent" ordering are the existing repository contract, and every documented
 * status transition (via the real `ProjectSettingsRepository`) is reflected on the
 * next loader read. This does NOT re-prove the `workflowStatus` predicate itself —
 * that is `test/kernel/projects.test.ts` — only that the Today loader actually
 * passes it and consumes the trusted authenticated scope.
 */

const WS = "test-default-workspace";
const OTHER = "ws_today_route_other";

const nextEntityId = sequentialIds("tdent");
const nextActivityId = sequentialIds("tdact");
const otherEntityId = sequentialIds("tdoent");
const otherActivityId = sequentialIds("tdoact");

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

function spine(clock: FakeClock = new FakeClock()) {
  return makeSpineRepository(makeContext(WS), {
    clock: clock.now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

function settings() {
  return makeProjectSettingsRepository(makeContext(WS));
}

async function runToday() {
  return todayLoader({
    request: new Request("https://app.test/today"),
    context: authedContext(),
    params: {},
  } as unknown as Parameters<typeof todayLoader>[0]);
}

async function activeProject(
  s: ReturnType<typeof spine>,
  title: string,
): Promise<string> {
  const area = await s.createArea({ title: `${title} area` });
  const project = await s.createProject({
    title,
    parent: { kind: "area", id: area.id },
  });
  await settings().setStatus(project.id, "active");
  return project.id;
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("GET /today — 'Continue working' is Active-only (PROJ-05 Slice 4)", () => {
  it("includes an Active, incomplete, non-archived project", async () => {
    const s = spine();
    const id = await activeProject(s, "Ship the launch");

    const data = await runToday();
    expect(data.recentProjects.map((p) => p.id)).toEqual([id]);
    expect(data.recentProjects[0]?.title).toBe("Ship the launch");
  });

  it("excludes a Planned project", async () => {
    const s = spine();
    const area = await s.createArea({ title: "Career" });
    await s.createProject({
      title: "Not yet started",
      parent: { kind: "area", id: area.id },
    });

    const data = await runToday();
    expect(data.recentProjects).toEqual([]);
  });

  it("excludes an On hold project", async () => {
    const s = spine();
    const area = await s.createArea({ title: "Career" });
    const project = await s.createProject({
      title: "Paused work",
      parent: { kind: "area", id: area.id },
    });
    await settings().setStatus(project.id, "on_hold");

    const data = await runToday();
    expect(data.recentProjects).toEqual([]);
  });

  it("excludes a Completed project even when its workflow status is Active", async () => {
    const s = spine();
    const id = await activeProject(s, "Finished work");
    await s.complete(id);

    const data = await runToday();
    expect(data.recentProjects).toEqual([]);
  });

  it("excludes an Archived project even when its preserved workflow status is Active", async () => {
    const s = spine();
    const id = await activeProject(s, "Archived work");
    await settings().archive(id);

    const data = await runToday();
    expect(data.recentProjects).toEqual([]);
  });

  it("preserves workspace isolation", async () => {
    const otherSpine = makeSpineRepository(makeContext(OTHER), {
      clock: new FakeClock().now,
      idGenerator: otherEntityId,
      activityIdGenerator: otherActivityId,
    });
    const otherSettings = makeProjectSettingsRepository(makeContext(OTHER));
    const area = await otherSpine.createArea({ title: "Other workspace area" });
    const project = await otherSpine.createProject({
      title: "Other workspace project",
      parent: { kind: "area", id: area.id },
    });
    await otherSettings.setStatus(project.id, "active");

    const data = await runToday();
    expect(data.recentProjects).toEqual([]);
  });

  it("remains bounded by RECENT_PROJECTS_COUNT", async () => {
    const s = spine();
    for (let i = 0; i < 8; i += 1) {
      await activeProject(s, `Active project ${i}`);
    }

    const data = await runToday();
    expect(data.recentProjects.length).toBe(6);
  });

  it("orders by the existing recent/effective-updated timestamp", async () => {
    const clock = new FakeClock();
    const s = spine(clock);
    const firstId = await activeProject(s, "First");
    clock.advance(1000);
    const secondId = await activeProject(s, "Second");

    // A settings-only transition (no title change) bumps `first`'s effective
    // `updatedAt` (ADR-037 §37.2), so it returns to the front of "recent".
    clock.advance(1000);
    await settings().setStatus(firstId, "on_hold");
    await settings().setStatus(firstId, "active");

    const data = await runToday();
    expect(data.recentProjects.map((p) => p.id)).toEqual([firstId, secondId]);
  });

  it("reflects a settings-only transition to Active", async () => {
    const s = spine();
    const area = await s.createArea({ title: "Career" });
    const project = await s.createProject({
      title: "Newly activated",
      parent: { kind: "area", id: area.id },
    });

    expect((await runToday()).recentProjects).toEqual([]);

    await settings().setStatus(project.id, "active");
    const data = await runToday();
    expect(data.recentProjects.map((p) => p.id)).toEqual([project.id]);
  });

  it("removes a project after Active → On hold", async () => {
    const s = spine();
    const id = await activeProject(s, "Active then paused");
    expect((await runToday()).recentProjects.map((p) => p.id)).toEqual([id]);

    await settings().setStatus(id, "on_hold");
    expect((await runToday()).recentProjects).toEqual([]);
  });

  it("removes a project after Active → Planned", async () => {
    const s = spine();
    const id = await activeProject(s, "Active then planned");
    expect((await runToday()).recentProjects.map((p) => p.id)).toEqual([id]);

    await settings().setStatus(id, "planned");
    expect((await runToday()).recentProjects).toEqual([]);
  });

  it("removes a project after archive", async () => {
    const s = spine();
    const id = await activeProject(s, "Active then archived");
    expect((await runToday()).recentProjects.map((p) => p.id)).toEqual([id]);

    await settings().archive(id);
    expect((await runToday()).recentProjects).toEqual([]);
  });

  it("includes an Active project again after restore", async () => {
    const s = spine();
    const id = await activeProject(s, "Restored active");
    await settings().archive(id);
    expect((await runToday()).recentProjects).toEqual([]);

    await settings().restore(id);
    const data = await runToday();
    expect(data.recentProjects.map((p) => p.id)).toEqual([id]);
  });

  it("does not include a restored Planned project", async () => {
    const s = spine();
    const area = await s.createArea({ title: "Career" });
    const planned = await s.createProject({
      title: "Restored planned",
      parent: { kind: "area", id: area.id },
    });
    await settings().archive(planned.id);
    await settings().restore(planned.id);

    const data = await runToday();
    expect(data.recentProjects).toEqual([]);
  });

  it("does not include a restored On hold project", async () => {
    const s = spine();
    const area = await s.createArea({ title: "Career" });
    const onHold = await s.createProject({
      title: "Restored on hold",
      parent: { kind: "area", id: area.id },
    });
    await settings().setStatus(onHold.id, "on_hold");
    await settings().archive(onHold.id);
    await settings().restore(onHold.id);

    const data = await runToday();
    expect(data.recentProjects).toEqual([]);
  });

  it("returns the calm empty shape when no Active project exists", async () => {
    const data = await runToday();
    expect(data.recentProjects).toEqual([]);
  });
});
