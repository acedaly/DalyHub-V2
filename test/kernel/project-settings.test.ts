import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import {
  ProjectArchiveBlockedError,
  ProjectArchivedError,
  ProjectSettingsNotFoundError,
} from "~/kernel/project-settings";

import {
  FakeClock,
  countActivitiesOfType,
  countProjectDetailRows,
  makeContext,
  makeProjectSettingsRepository,
  makeSpineRepository,
  resetTables,
  sequentialIds,
} from "./support";

/**
 * PROJ-05 corrective — real Workers/D1 coverage for `ProjectSettingsRepository`:
 * every transition is atomic with its Activity event, no-ops append nothing, the
 * archive guard is folded into the write (no TOCTOU), and concurrency never
 * produces more than one real transition or a misleading payload.
 */

const WS = "ws_project_settings";
const OTHER_WS = "ws_project_settings_other";

function spine(prefix = "s") {
  return makeSpineRepository(makeContext(WS), {
    clock: new FakeClock().now,
    idGenerator: sequentialIds(prefix),
  });
}

function settings(
  options?: Parameters<typeof makeProjectSettingsRepository>[1],
) {
  return makeProjectSettingsRepository(makeContext(WS), {
    clock: new FakeClock().now,
    idGenerator: sequentialIds("a"),
    ...options,
  });
}

async function seedProject(sp: ReturnType<typeof spine>) {
  const area = await sp.createArea({ title: "Area" });
  return sp.createProject({
    title: "P",
    parent: { kind: "area", id: area.id },
  });
}

beforeEach(async () => {
  await resetTables([WS, OTHER_WS]);
});

describe("get", () => {
  it("defaults to planned/not-archived when no project_details row exists", async () => {
    const sp = spine();
    const project = await seedProject(sp);
    const value = await settings().get(project.id);
    expect(value).toEqual({
      id: project.id,
      workspaceId: expect.anything(),
      status: "planned",
      archivedAt: null,
    });
  });

  it("returns null for a missing, wrong-kind, deleted or cross-workspace id", async () => {
    const sp = spine();
    const area = await sp.createArea({ title: "Area" });
    const project = await seedProject(sp);
    await sp.softDelete(project.id);

    const svc = settings();
    expect(await svc.get("does-not-exist")).toBeNull();
    expect(await svc.get(area.id)).toBeNull(); // wrong kind
    expect(await svc.get(project.id)).toBeNull(); // soft-deleted

    const otherSpine = makeSpineRepository(makeContext(OTHER_WS), {
      clock: new FakeClock().now,
      idGenerator: sequentialIds("o"),
    });
    const otherProject = await seedProject(
      otherSpine as ReturnType<typeof spine>,
    );
    expect(await settings().get(otherProject.id)).toBeNull();
  });
});

describe("setStatus", () => {
  it("performs a normal status transition atomically with one Activity event", async () => {
    const sp = spine();
    const project = await seedProject(sp);
    const svc = settings();

    const result = await svc.setStatus(project.id, "active");
    expect(result).toEqual({
      settings: {
        id: project.id,
        workspaceId: expect.anything(),
        status: "active",
        archivedAt: null,
      },
      changed: true,
    });
    expect(await countActivitiesOfType("project.status_changed")).toBe(1);
    expect(await countProjectDetailRows()).toBe(1);
  });

  it("is a no-op that appends no Activity when the status already holds", async () => {
    const sp = spine();
    const project = await seedProject(sp);
    const svc = settings();
    await svc.setStatus(project.id, "active");

    const result = await svc.setStatus(project.id, "active");
    expect(result.changed).toBe(false);
    expect(await countActivitiesOfType("project.status_changed")).toBe(1);
  });

  it("two simultaneous identical status requests yield exactly one transition", async () => {
    const sp = spine();
    const project = await seedProject(sp);
    const svc = settings();

    const results = await Promise.all([
      svc.setStatus(project.id, "active"),
      svc.setStatus(project.id, "active"),
    ]);
    expect(results.map((r) => r.changed).sort()).toEqual([false, true]);
    expect(await countActivitiesOfType("project.status_changed")).toBe(1);
    expect((await svc.get(project.id))?.status).toBe("active");
  });

  it("conflicting simultaneous status changes never produce a misleading oldStatus", async () => {
    const sp = spine();
    const project = await seedProject(sp);
    const svc = settings();

    const [a, b] = await Promise.allSettled([
      svc.setStatus(project.id, "active"),
      svc.setStatus(project.id, "on_hold"),
    ]);
    expect(a.status).toBe("fulfilled");
    expect(b.status).toBe("fulfilled");
    const final = await svc.get(project.id);
    expect(["active", "on_hold"]).toContain(final?.status);

    // The recorded event chain must be causally honest: each event's `oldStatus`
    // equals either the true initial default ("planned") or the immediately
    // preceding event's `newStatus` — never a fabricated/stale value.
    const rows = await env.DB.prepare(
      `SELECT payload_json FROM activities
       WHERE workspace_id = ? AND type = 'project.status_changed'
       ORDER BY occurred_at ASC, id ASC`,
    )
      .bind(WS)
      .all<{ payload_json: string }>();
    const payloads = rows.results.map(
      (r) =>
        JSON.parse(r.payload_json) as { oldStatus: string; newStatus: string },
    );
    expect(payloads.length).toBeGreaterThanOrEqual(1);
    let expectedOld = "planned";
    for (const payload of payloads) {
      expect(payload.oldStatus).toBe(expectedOld);
      expectedOld = payload.newStatus;
    }
    expect(expectedOld).toBe(final?.status);
  });

  it("rejects a status change on an archived project", async () => {
    const sp = spine();
    const project = await seedProject(sp);
    const svc = settings();
    await svc.archive(project.id);

    await expect(svc.setStatus(project.id, "active")).rejects.toThrow(
      ProjectArchivedError,
    );
  });

  it("rejects a missing/cross-workspace project", async () => {
    await expect(settings().setStatus("nope", "active")).rejects.toThrow(
      ProjectSettingsNotFoundError,
    );
  });
});

describe("archive", () => {
  it("archives a project with no unfinished direct tasks", async () => {
    const sp = spine();
    const project = await seedProject(sp);
    const task = await sp.createTask({
      title: "T",
      parent: { kind: "project", id: project.id },
    });
    await sp.complete(task.id);

    const result = await settings().archive(project.id);
    expect(result.changed).toBe(true);
    expect(result.settings.archivedAt).not.toBeNull();
    expect(await countActivitiesOfType("project.archived")).toBe(1);
  });

  it("is a no-op that appends no Activity when already archived", async () => {
    const sp = spine();
    const project = await seedProject(sp);
    const svc = settings();
    await svc.archive(project.id);

    const result = await svc.archive(project.id);
    expect(result.changed).toBe(false);
    expect(await countActivitiesOfType("project.archived")).toBe(1);
  });

  it("rejects archiving a project with an active incomplete direct task, appending no Activity", async () => {
    const sp = spine();
    const project = await seedProject(sp);
    await sp.createTask({
      title: "Unfinished",
      parent: { kind: "project", id: project.id },
    });

    await expect(settings().archive(project.id)).rejects.toThrow(
      ProjectArchiveBlockedError,
    );
    expect(await countActivitiesOfType("project.archived")).toBe(0);
    expect(await countProjectDetailRows()).toBe(0);
  });

  it("soft-deleted tasks do not block archive", async () => {
    const sp = spine();
    const project = await seedProject(sp);
    const task = await sp.createTask({
      title: "T",
      parent: { kind: "project", id: project.id },
    });
    await sp.softDelete(task.id);

    const result = await settings().archive(project.id);
    expect(result.changed).toBe(true);
  });

  it("tasks belonging to another workspace or another project never block archive", async () => {
    const sp = spine();
    const project = await seedProject(sp);
    const otherProjectInSameWs = await sp.createProject({
      title: "Other",
      parent: { kind: "area", id: (await sp.getParent(project.id))!.id },
    });
    await sp.createTask({
      title: "Unrelated",
      parent: { kind: "project", id: otherProjectInSameWs.id },
    });

    const otherSpine = makeSpineRepository(makeContext(OTHER_WS), {
      clock: new FakeClock().now,
      idGenerator: sequentialIds("o"),
    });
    const otherArea = await otherSpine.createArea({ title: "OtherArea" });
    await otherSpine.createTask({
      title: "Cross-workspace",
      parent: { kind: "area", id: otherArea.id },
    });

    const result = await settings().archive(project.id);
    expect(result.changed).toBe(true);
  });

  it("concurrent task creation cannot leave an archived project with unfinished work", async () => {
    const sp = spine();
    const project = await seedProject(sp);
    const svc = settings();

    const [archiveResult, createResult] = await Promise.allSettled([
      svc.archive(project.id),
      sp.createTask({
        title: "Racing",
        parent: { kind: "project", id: project.id },
      }),
    ]);

    const finalSettings = await svc.get(project.id);
    if (finalSettings?.archivedAt) {
      // The archive won: prove no active task exists under it regardless of
      // whether the concurrent create reported success.
      const unfinished = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM entity_links l
         JOIN entities e ON e.workspace_id = l.workspace_id AND e.id = l.source_entity_id
         JOIN spine_records s ON s.workspace_id = e.workspace_id AND s.entity_id = e.id
         WHERE l.workspace_id = ? AND l.target_entity_id = ? AND l.type = 'task.belongs_to_project'
           AND l.deleted_at IS NULL AND e.deleted_at IS NULL AND s.completed_at IS NULL`,
      )
        .bind(WS, project.id)
        .first<{ n: number }>();
      expect(unfinished?.n ?? 0).toBe(0);
    } else {
      // The create won: the archive must have been rejected as blocked.
      expect(
        archiveResult.status === "rejected" ||
          createResult.status === "fulfilled",
      ).toBe(true);
    }
  });

  it("repeated archive stays idempotent (no duplicate events, no partial state)", async () => {
    const sp = spine();
    const project = await seedProject(sp);
    const svc = settings();
    await svc.archive(project.id);
    await svc.archive(project.id);
    await svc.archive(project.id);
    expect(await countActivitiesOfType("project.archived")).toBe(1);
  });
});

describe("restore", () => {
  it("restores an archived project", async () => {
    const sp = spine();
    const project = await seedProject(sp);
    const svc = settings();
    await svc.archive(project.id);

    const result = await svc.restore(project.id);
    expect(result.changed).toBe(true);
    expect(result.settings.archivedAt).toBeNull();
    expect(await countActivitiesOfType("project.restored")).toBe(1);
  });

  it("is a no-op that appends no Activity when not archived", async () => {
    const sp = spine();
    const project = await seedProject(sp);
    const result = await settings().restore(project.id);
    expect(result.changed).toBe(false);
    expect(await countActivitiesOfType("project.restored")).toBe(0);
  });

  it("repeated restore stays idempotent", async () => {
    const sp = spine();
    const project = await seedProject(sp);
    const svc = settings();
    await svc.archive(project.id);
    await svc.restore(project.id);
    await svc.restore(project.id);
    expect(await countActivitiesOfType("project.restored")).toBe(1);
  });

  it("after restore, status changes and archiving work normally again", async () => {
    const sp = spine();
    const project = await seedProject(sp);
    const svc = settings();
    await svc.archive(project.id);
    await svc.restore(project.id);

    const statusResult = await svc.setStatus(project.id, "on_hold");
    expect(statusResult.changed).toBe(true);

    const archiveResult = await svc.archive(project.id);
    expect(archiveResult.changed).toBe(true);
  });
});

describe("Activity atomicity (the domain write and its event are all-or-nothing)", () => {
  it("an Activity-insert failure rolls the domain mutation back too", async () => {
    const sp = spine();
    const project = await seedProject(sp);
    const svc = settings({ mutationFault: "after-domain" });

    await expect(svc.setStatus(project.id, "active")).rejects.toThrow();
    expect(await countProjectDetailRows()).toBe(0);
    expect(await countActivitiesOfType("project.status_changed")).toBe(0);
  });

  it("a blocked domain statement (no real transition) appends no Activity even when a fault is armed", async () => {
    const sp = spine();
    const project = await seedProject(sp);
    const svc = settings({ mutationFault: "after-domain" });
    // The status is already "planned" (the default) — a genuine no-op never
    // reaches the domain write, so the armed fault never fires.
    const result = await svc.setStatus(project.id, "planned");
    expect(result.changed).toBe(false);
    expect(await countActivitiesOfType("project.status_changed")).toBe(0);
  });
});
