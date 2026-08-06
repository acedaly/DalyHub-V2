/**
 * Selectable Area and Project icons — the persistence contract, proven against
 * the REAL Workers/D1 runtime (never a mock).
 *
 * `icon_key` (migration 0032) is deliberately an UNCONSTRAINED nullable column:
 * the authoritative vocabulary lives in `entity-icon-keys.ts` and is enforced at
 * the validation boundary, not by a CHECK that would need a migration every time
 * the catalogue gains a glyph. That choice moves two obligations onto these
 * repositories, and both are asserted here:
 *
 *   1. a stored value this build does not recognise must degrade to "no choice"
 *      on READ, so a record whose icon was removed in a later release still
 *      renders its entity default instead of failing;
 *   2. choosing an icon must not disturb any other settings on the row —
 *      the archival state, and for a Project its workflow status.
 *
 * Both detail tables are SPARSE for a newly created record — neither
 * `createArea` nor `createProject` writes a detail row, and migration 0008's
 * backfill only covered the Projects that existed when it ran. So on both sides
 * choosing an icon has to CREATE the row, which is why `setIcon` is an upsert
 * rather than an update. That is asserted directly below rather than assumed:
 * an `UPDATE` would have silently done nothing and reported success.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import {
  FakeClock,
  countActivitiesOfType,
  countAreaDetailRows,
  makeAreaSettingsRepository,
  makeContext,
  makeProjectSettingsRepository,
  makeSpineRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "ws_entity_icons";
const OTHER_WS = "ws_entity_icons_other";

function spine(workspaceId = WS) {
  return makeSpineRepository(makeContext(workspaceId), {
    clock: new FakeClock().now,
    idGenerator: sequentialIds(`e_${workspaceId}`),
  });
}

function areaSettings(workspaceId = WS) {
  return makeAreaSettingsRepository(makeContext(workspaceId), {
    clock: new FakeClock().now,
    idGenerator: sequentialIds(`a_${workspaceId}`),
  });
}

function projectSettings(workspaceId = WS) {
  return makeProjectSettingsRepository(makeContext(workspaceId), {
    clock: new FakeClock().now,
    idGenerator: sequentialIds(`p_${workspaceId}`),
  });
}

/** Write a raw value straight into the column, bypassing the repository. */
async function forceStoredIcon(
  table: "area_details" | "project_details",
  workspaceId: string,
  entityId: string,
  value: string | null,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE ${table} SET icon_key = ? WHERE workspace_id = ? AND entity_id = ?`,
  )
    .bind(value, workspaceId, entityId)
    .run();
}

async function readStoredIcon(
  table: "area_details" | "project_details",
  workspaceId: string,
  entityId: string,
): Promise<string | null | undefined> {
  const row = await env.DB.prepare(
    `SELECT icon_key FROM ${table} WHERE workspace_id = ? AND entity_id = ?`,
  )
    .bind(workspaceId, entityId)
    .first<{ icon_key: string | null }>();
  return row === null ? undefined : row.icon_key;
}

beforeEach(async () => {
  await resetTables([WS, OTHER_WS]);
});

/* -------------------------------------------------------------------------- */
/* Area                                                                        */
/* -------------------------------------------------------------------------- */

describe("Area icon settings", () => {
  it("reads as no choice when the Area has no detail row at all", async () => {
    const area = await spine().createArea({ title: "Health" });
    // The sparse case: nothing has ever been written for this Area.
    expect(await countAreaDetailRows(WS)).toBe(0);
    const value = await areaSettings().get(area.id);
    expect(value?.iconKey).toBeNull();
  });

  it("creates the sparse detail row when an icon is first chosen", async () => {
    const area = await spine().createArea({ title: "Health" });
    const settings = areaSettings();

    const result = await settings.setIcon(area.id, "travel");
    expect(result.iconKey).toBe("travel");
    expect(await countAreaDetailRows(WS)).toBe(1);
    expect((await settings.get(area.id))?.iconKey).toBe("travel");
  });

  it("replaces a chosen icon, and clears it back to the default with null", async () => {
    const area = await spine().createArea({ title: "Health" });
    const settings = areaSettings();

    await settings.setIcon(area.id, "travel");
    await settings.setIcon(area.id, "property");
    expect((await settings.get(area.id))?.iconKey).toBe("property");

    // `null` is "reset to default" — a legitimate value, not a failure.
    const cleared = await settings.setIcon(area.id, null);
    expect(cleared.iconKey).toBeNull();
    expect((await settings.get(area.id))?.iconKey).toBeNull();
    // The row is NOT removed: clearing a choice is not un-writing history.
    expect(await countAreaDetailRows(WS)).toBe(1);
  });

  it("degrades an unrecognised stored key to the entity default on read", async () => {
    const area = await spine().createArea({ title: "Health" });
    const settings = areaSettings();
    await settings.setIcon(area.id, "travel");

    // A key that outlived its catalogue entry, or a hand-edited row.
    await forceStoredIcon("area_details", WS, area.id, "no-such-icon");
    expect((await settings.get(area.id))?.iconKey).toBeNull();

    // The stored value is untouched — normalising is a READ-side decision, so a
    // later build that restores the glyph still finds the owner's choice.
    expect(await readStoredIcon("area_details", WS, area.id)).toBe(
      "no-such-icon",
    );
  });

  it("preserves the archival state when the icon changes", async () => {
    const area = await spine().createArea({ title: "Health" });
    const settings = areaSettings();
    await settings.archive(area.id);
    const archivedAt = (await settings.get(area.id))?.archivedAt;
    expect(archivedAt).not.toBeNull();

    await settings.setIcon(area.id, "shield");

    const after = await settings.get(area.id);
    expect(after?.iconKey).toBe("shield");
    expect(after?.archivedAt).toEqual(archivedAt);
  });

  it("preserves the icon across archive and restore", async () => {
    const area = await spine().createArea({ title: "Health" });
    const settings = areaSettings();
    await settings.setIcon(area.id, "shield");

    const archived = await settings.archive(area.id);
    expect(archived.settings.iconKey).toBe("shield");

    const restored = await settings.restore(area.id);
    expect(restored.settings.iconKey).toBe("shield");
    expect((await settings.get(area.id))?.iconKey).toBe("shield");
  });

  it("appends no Activity — a glyph is not a lifecycle event", async () => {
    const area = await spine().createArea({ title: "Health" });
    const settings = areaSettings();
    const before = await countActivitiesOfType("area.archived");

    await settings.setIcon(area.id, "travel");
    await settings.setIcon(area.id, null);

    expect(await countActivitiesOfType("area.archived")).toBe(before);
    expect(await countActivitiesOfType("area.restored")).toBe(0);
  });

  it("refuses a missing, wrong-kind or cross-workspace id", async () => {
    const sp = spine();
    const area = await sp.createArea({ title: "Health" });
    const project = await sp.createProject({
      title: "P",
      parent: { kind: "area", id: area.id },
    });

    await expect(areaSettings().setIcon("nope", "travel")).rejects.toThrow();
    await expect(
      areaSettings().setIcon(project.id, "travel"),
    ).rejects.toThrow();
    // Another workspace's Area is not visible here, and is not written to.
    await expect(
      areaSettings(OTHER_WS).setIcon(area.id, "travel"),
    ).rejects.toThrow();
    expect(await readStoredIcon("area_details", WS, area.id)).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* Project                                                                     */
/* -------------------------------------------------------------------------- */

describe("Project icon settings", () => {
  async function seedProject(workspaceId = WS) {
    const sp = spine(workspaceId);
    const area = await sp.createArea({ title: "Area" });
    return sp.createProject({
      title: "P",
      parent: { kind: "area", id: area.id },
    });
  }

  it("reads as no choice for a Project that has never chosen one", async () => {
    const project = await seedProject();
    expect((await projectSettings().get(project.id))?.iconKey).toBeNull();
  });

  it("persists, replaces and clears the chosen icon", async () => {
    const project = await seedProject();
    const settings = projectSettings();

    expect((await settings.setIcon(project.id, "travel")).iconKey).toBe(
      "travel",
    );
    expect((await settings.get(project.id))?.iconKey).toBe("travel");

    await settings.setIcon(project.id, "equipment");
    expect((await settings.get(project.id))?.iconKey).toBe("equipment");

    await settings.setIcon(project.id, null);
    expect((await settings.get(project.id))?.iconKey).toBeNull();
  });

  it("degrades an unrecognised stored key to the entity default on read", async () => {
    const project = await seedProject();
    const settings = projectSettings();
    await settings.setIcon(project.id, "travel");

    await forceStoredIcon("project_details", WS, project.id, "<svg>");
    expect((await settings.get(project.id))?.iconKey).toBeNull();
    expect(await readStoredIcon("project_details", WS, project.id)).toBe(
      "<svg>",
    );
  });

  it("preserves the workflow status and archival state when the icon changes", async () => {
    const project = await seedProject();
    const settings = projectSettings();
    await settings.setStatus(project.id, "on_hold");

    await settings.setIcon(project.id, "equipment");

    const after = await settings.get(project.id);
    expect(after?.status).toBe("on_hold");
    expect(after?.archivedAt).toBeNull();
    expect(after?.iconKey).toBe("equipment");
  });

  it("preserves the icon across a status transition", async () => {
    const project = await seedProject();
    const settings = projectSettings();
    await settings.setIcon(project.id, "equipment");

    // The transition returns `icon_key` from the statement itself, so this is
    // the persisted value rather than one spliced back in from the pre-read.
    const result = await settings.setStatus(project.id, "active");
    expect(result.changed).toBe(true);
    expect(result.settings.status).toBe("active");
    expect(result.settings.iconKey).toBe("equipment");
  });

  it("preserves the icon across archive and restore", async () => {
    const project = await seedProject();
    const settings = projectSettings();
    await settings.setIcon(project.id, "equipment");

    const archived = await settings.archive(project.id);
    expect(archived.settings.iconKey).toBe("equipment");

    const restored = await settings.restore(project.id);
    expect(restored.settings.iconKey).toBe("equipment");
  });

  it("appends no Activity", async () => {
    const project = await seedProject();
    const settings = projectSettings();

    await settings.setIcon(project.id, "travel");
    await settings.setIcon(project.id, null);

    expect(await countActivitiesOfType("project.status_changed")).toBe(0);
    expect(await countActivitiesOfType("project.archived")).toBe(0);
  });

  it("refuses a missing, wrong-kind or cross-workspace id", async () => {
    const sp = spine();
    const area = await sp.createArea({ title: "Area" });
    const project = await sp.createProject({
      title: "P",
      parent: { kind: "area", id: area.id },
    });

    await expect(projectSettings().setIcon("nope", "travel")).rejects.toThrow();
    await expect(
      projectSettings().setIcon(area.id, "travel"),
    ).rejects.toThrow();
    await expect(
      projectSettings(OTHER_WS).setIcon(project.id, "travel"),
    ).rejects.toThrow();
    // No row at all, rather than a row with a null icon: nothing was written.
    expect(
      await readStoredIcon("project_details", WS, project.id),
    ).toBeUndefined();
  });

  it("creates the detail row when an icon is chosen first", async () => {
    // `project_details` is sparse for a NEW Project, not dense. Migration 0008
    // backfilled the projects that existed when it ran, but `createProject`
    // writes no detail row — the first settings write creates it. So the upsert
    // in `setIcon` is load-bearing here exactly as it is for an Area, not
    // merely defensive.
    const project = await seedProject();
    expect(
      await readStoredIcon("project_details", WS, project.id),
    ).toBeUndefined();

    await projectSettings().setIcon(project.id, "travel");

    expect(await readStoredIcon("project_details", WS, project.id)).toBe(
      "travel",
    );
    // ...and the status it was created with is the documented default, not a
    // value invented by the icon write.
    expect((await projectSettings().get(project.id))?.status).toBe("planned");
  });
});
