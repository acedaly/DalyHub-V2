/**
 * AREA-05 — Area archive / restore / permanent-deletion lifecycle, proven against
 * the REAL Workers/D1 runtime (never a mock). Covers the AreaSettingsRepository
 * archival transitions, the AreaRepository dependency summary + archived-collection
 * exclusion, and the SpineRepository's guarded, atomic, FK-ordered permanent
 * deletion — including workspace isolation, atomic Activity, the mutation-time
 * dependency re-check, and the absence of orphaned rows.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import {
  AREA_ARCHIVED,
  AREA_DELETED,
  AREA_RESTORED,
} from "~/kernel/area-settings";
import { SpineHasDependentsError, SpineWrongKindError } from "~/kernel/spine";

import {
  FakeClock,
  countActivitiesOfType,
  ensureWorkspace,
  makeAreaRepository,
  makeAreaSettingsRepository,
  makeAssetRepository,
  makeContext,
  makeLinkRepository,
  makeRepository,
  makeSpineRepository,
  resetTables,
  seedEntity,
  sequentialIds,
} from "./support";

const WS = "ws_area_lifecycle";
const OTHER = "ws_area_lifecycle_other";

function repos(workspaceId = WS, options?: { deleteFault?: "after-entities" }) {
  const context = makeContext(workspaceId);
  const clock = new FakeClock().now;
  const idGenerator = sequentialIds(`e_${workspaceId}`);
  const activityIdGenerator = sequentialIds(`a_${workspaceId}`);
  const spine = makeSpineRepository(context, {
    clock,
    idGenerator,
    activityIdGenerator,
    deleteFault: options?.deleteFault,
  });
  const settings = makeAreaSettingsRepository(context, {
    clock,
    idGenerator: sequentialIds(`s_${workspaceId}`),
  });
  const areas = makeAreaRepository(context);
  const links = makeLinkRepository(context, { clock });
  return { spine, settings, areas, links };
}

async function areaRowCounts(areaId: string): Promise<{
  entities: number;
  spineRecords: number;
  areaDetails: number;
  subjects: number;
}> {
  const one = async (sql: string) =>
    (await env.DB.prepare(sql).bind(areaId).first<{ n: number }>())?.n ?? 0;
  return {
    entities: await one("SELECT COUNT(*) AS n FROM entities WHERE id = ?"),
    spineRecords: await one(
      "SELECT COUNT(*) AS n FROM spine_records WHERE entity_id = ?",
    ),
    areaDetails: await one(
      "SELECT COUNT(*) AS n FROM area_details WHERE entity_id = ?",
    ),
    subjects: await one(
      "SELECT COUNT(*) AS n FROM activity_subjects WHERE entity_id = ?",
    ),
  };
}

async function linkRowsReferencing(areaId: string): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM entity_links WHERE source_entity_id = ? OR target_entity_id = ?",
  )
    .bind(areaId, areaId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
  await ensureWorkspace(WS);
  await ensureWorkspace(OTHER);
});

describe("Area archive / restore", () => {
  it("archives an active Area, appends area.archived, and is idempotent", async () => {
    const { spine, settings } = repos();
    const area = await spine.createArea({ title: "Career" });

    const first = await settings.archive(area.id);
    expect(first.changed).toBe(true);
    expect(first.settings.archivedAt).toBeInstanceOf(Date);
    expect(await countActivitiesOfType(AREA_ARCHIVED)).toBe(1);

    const again = await settings.archive(area.id);
    expect(again.changed).toBe(false);
    expect(await countActivitiesOfType(AREA_ARCHIVED)).toBe(1);
  });

  it("restores an archived Area, appends area.restored, and is idempotent", async () => {
    const { spine, settings } = repos();
    const area = await spine.createArea({ title: "Career" });
    await settings.archive(area.id);

    const restored = await settings.restore(area.id);
    expect(restored.changed).toBe(true);
    expect(restored.settings.archivedAt).toBeNull();
    expect(await countActivitiesOfType(AREA_RESTORED)).toBe(1);

    const again = await settings.restore(area.id);
    expect(again.changed).toBe(false);
    expect(await countActivitiesOfType(AREA_RESTORED)).toBe(1);
  });

  it("excludes archived Areas from the active collection but keeps them readable by id", async () => {
    const { spine, settings, areas } = repos();
    const keep = await spine.createArea({ title: "Health" });
    const hide = await spine.createArea({ title: "Career" });

    await settings.archive(hide.id);

    const page = await areas.listAreas();
    const ids = page.items.map((a) => a.id);
    expect(ids).toContain(keep.id);
    expect(ids).not.toContain(hide.id);

    // Directly readable by canonical id, labelled archived.
    const overview = await areas.getAreaOverview(hide.id);
    expect(overview).not.toBeNull();
    expect(overview?.archivedAt).toBeInstanceOf(Date);

    // Restoring returns it to the active collection.
    await settings.restore(hide.id);
    const after = await areas.listAreas();
    expect(after.items.map((a) => a.id)).toContain(hide.id);
  });

  /*
   * DS-14 / ADR-068 decision 5 — the identity accent must survive archiving.
   *
   * The decision ranks Areas over EVERY `area` row regardless of lifecycle
   * state precisely so that archiving and soft-deleting are colour-neutral, and
   * only a permanent delete (already a typed-confirmation destructive act)
   * shifts anything. The first implementation used the index into the ACTIVE
   * collection, which silently violated that; the defect was invisible to every
   * existing test because nothing asserted a rank at all.
   *
   * This is that assertion. It is deliberately about the RANK rather than about
   * the rendered colour: `areaAccentForRank` is a pure function of the rank, so
   * pinning the rank pins the colour without coupling a repository test to a
   * six-entry palette.
   */
  it("keeps every other Area's colour rank stable when one is archived", async () => {
    const { spine, settings, areas } = repos();
    const first = await spine.createArea({ title: "Health" });
    const second = await spine.createArea({ title: "Career" });
    const third = await spine.createArea({ title: "Home" });

    const before = await areas.listAreas();
    expect(before.items.map((a) => [a.id, a.colourRank] as const)).toEqual([
      [first.id, 0],
      [second.id, 1],
      [third.id, 2],
    ]);

    // Archive the EARLIEST Area — the worst case, because every other Area
    // sits after it in the ordering.
    await settings.archive(first.id);

    const after = await areas.listAreas();
    expect(after.items.map((a) => a.id)).toEqual([second.id, third.id]);
    // The ranks are UNCHANGED. Under an active-set index these would collapse
    // to 0 and 1, and both Areas would change colour.
    expect(after.items.map((a) => a.colourRank)).toEqual([1, 2]);

    // Restoring is symmetric — nothing moved in either direction.
    await settings.restore(first.id);
    const restored = await areas.listAreas();
    expect(restored.items.map((a) => [a.id, a.colourRank] as const)).toEqual([
      [first.id, 0],
      [second.id, 1],
      [third.id, 2],
    ]);
  });

  it("excludes archived Areas from the creation-picker candidate filter", async () => {
    const { spine, settings, areas } = repos();
    const active = await spine.createArea({ title: "Health" });
    const archived = await spine.createArea({ title: "Career" });
    await settings.archive(archived.id);

    const flagged = await areas.listArchivedAreaIds([active.id, archived.id]);
    expect(flagged).toEqual([archived.id]);
  });

  it("keeps archive workspace-scoped and never touches another workspace", async () => {
    const a = repos(WS);
    const b = repos(OTHER);
    const areaA = await a.spine.createArea({ title: "Career" });
    const areaB = await b.spine.createArea({ title: "Career" });

    await a.settings.archive(areaA.id);

    // The other workspace's identically-titled Area is untouched and still active.
    expect((await b.settings.get(areaB.id))?.archivedAt ?? null).toBeNull();
    const bPage = await b.areas.listAreas();
    expect(bPage.items.map((x) => x.id)).toContain(areaB.id);
    // A cross-workspace id is indistinguishable from not-found.
    expect(await b.settings.get(areaA.id)).toBeNull();
  });
});

describe("Area dependency summary", () => {
  it("reports zero and deletable for a genuinely empty Area", async () => {
    const { spine, areas } = repos();
    const area = await spine.createArea({ title: "Empty" });
    const summary = await areas.getAreaDependencySummary(area.id);
    expect(summary.total).toBe(0);
    expect(summary.deletable).toBe(true);
  });

  it("counts Goals, Projects, Tasks and linked records that block deletion", async () => {
    const { spine, areas, links } = repos();
    const area = await spine.createArea({ title: "Busy" });
    await spine.createGoal({ title: "G", areaId: area.id });
    await spine.createProject({
      title: "P",
      parent: { kind: "area", id: area.id },
    });
    await spine.createTask({
      title: "T",
      parent: { kind: "area", id: area.id },
    });
    const noteId = await seedEntity(WS, "note_1", { type: "note", title: "N" });
    await links.create({
      sourceEntityId: noteId,
      targetEntityId: area.id,
      type: "note.mentions",
    });

    const summary = await areas.getAreaDependencySummary(area.id);
    expect(summary.goals).toBe(1);
    expect(summary.projects).toBe(1);
    expect(summary.tasks).toBe(1);
    expect(summary.notes).toBe(1);
    expect(summary.total).toBe(4);
    expect(summary.deletable).toBe(false);
  });
});

describe("Area permanent deletion", () => {
  it("permanently deletes an empty Area and appends a subject-less area.deleted event", async () => {
    const { spine, areas } = repos();
    const area = await spine.createArea({ title: "Disposable" });
    // Also exercise the archived → delete path: archiving leaves an area_details row.
    const { settings } = repos();
    await settings.archive(area.id);
    await settings.restore(area.id);

    const before = await areaRowCounts(area.id);
    expect(before.entities).toBe(1);
    expect(before.areaDetails).toBe(1);

    const result = await spine.permanentlyDeleteArea(area.id);
    expect(result.outcome).toBe("deleted");
    expect(result.changed).toBe(true);
    expect(result.title).toBe("Disposable");

    // No orphaned rows anywhere for this Area.
    const after = await areaRowCounts(area.id);
    expect(after.entities).toBe(0);
    expect(after.spineRecords).toBe(0);
    expect(after.areaDetails).toBe(0);
    expect(after.subjects).toBe(0);
    expect(await linkRowsReferencing(area.id)).toBe(0);

    // The Area is gone from reads, and the audit tombstone survives without a subject.
    expect(await areas.getAreaOverview(area.id)).toBeNull();
    expect(await countActivitiesOfType(AREA_DELETED)).toBe(1);
    const tombstoneSubjects = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM activity_subjects WHERE entity_id = ?",
    )
      .bind(area.id)
      .first<{ n: number }>();
    expect(tombstoneSubjects?.n ?? 0).toBe(0);
  });

  it("blocks deletion while an Asset records the Area as its home (V2.0.1)", async () => {
    // Assets reference an Area through `asset_details.area_id` — a plain column
    // with no foreign key and no EntityLink — so the link-only guard used to
    // treat an Area full of Assets as empty and purge it, leaving every
    // `area_id` dangling.
    const { spine } = repos();
    const area = await spine.createArea({ title: "Garage" });
    const assetRepo = makeAssetRepository(makeContext(WS), {
      idGenerator: sequentialIds("asset"),
    });
    const asset = await assetRepo.create({
      title: "Ride-on mower",
      assetType: "equipment",
      areaId: area.id,
    });

    await expect(spine.permanentlyDeleteArea(area.id)).rejects.toBeInstanceOf(
      SpineHasDependentsError,
    );
    let after = await areaRowCounts(area.id);
    expect(after.entities).toBe(1);
    expect(after.spineRecords).toBe(1);

    // A SOFT-deleted Asset still blocks: its detail row (and the reference)
    // survives, and restoring it must never resurface a record pointing at a
    // purged Area — the same rule a soft-deleted spine child's preserved link
    // already enforces.
    await makeRepository(makeContext(WS)).softDelete(asset.id);
    await expect(spine.permanentlyDeleteArea(area.id)).rejects.toBeInstanceOf(
      SpineHasDependentsError,
    );
    after = await areaRowCounts(area.id);
    expect(after.entities).toBe(1);

    // Once the Asset is permanently deleted, the Area is genuinely empty.
    const purged = await assetRepo.permanentlyDelete(asset.id);
    expect(purged.deleted).toBe(true);
    const result = await spine.permanentlyDeleteArea(area.id);
    expect(result.outcome).toBe("deleted");
    expect((await areaRowCounts(area.id)).entities).toBe(0);
  });

  it("blocks deletion when a Goal exists and purges nothing", async () => {
    const { spine } = repos();
    const area = await spine.createArea({ title: "HasGoal" });
    await spine.createGoal({ title: "G", areaId: area.id });

    await expect(spine.permanentlyDeleteArea(area.id)).rejects.toBeInstanceOf(
      SpineHasDependentsError,
    );
    const after = await areaRowCounts(area.id);
    expect(after.entities).toBe(1);
    expect(after.spineRecords).toBe(1);
    expect(await countActivitiesOfType(AREA_DELETED)).toBe(0);
  });

  it("blocks deletion when a direct Project exists", async () => {
    const { spine } = repos();
    const area = await spine.createArea({ title: "HasProject" });
    await spine.createProject({
      title: "P",
      parent: { kind: "area", id: area.id },
    });
    await expect(spine.permanentlyDeleteArea(area.id)).rejects.toBeInstanceOf(
      SpineHasDependentsError,
    );
  });

  it("blocks deletion when a direct Task exists", async () => {
    const { spine } = repos();
    const area = await spine.createArea({ title: "HasTask" });
    await spine.createTask({
      title: "T",
      parent: { kind: "area", id: area.id },
    });
    await expect(spine.permanentlyDeleteArea(area.id)).rejects.toBeInstanceOf(
      SpineHasDependentsError,
    );
  });

  it("blocks deletion when a non-structural link would become invalid", async () => {
    const { spine, links } = repos();
    const area = await spine.createArea({ title: "Linked" });
    const noteId = await seedEntity(WS, "note_link", {
      type: "note",
      title: "N",
    });
    await links.create({
      sourceEntityId: noteId,
      targetEntityId: area.id,
      type: "note.mentions",
    });
    await expect(spine.permanentlyDeleteArea(area.id)).rejects.toBeInstanceOf(
      SpineHasDependentsError,
    );
  });

  it("re-checks dependencies at commit: a soft-deleted (moved-away) child link does NOT block, and is purged", async () => {
    const { spine, areas } = repos();
    const areaA = await spine.createArea({ title: "From" });
    const areaB = await spine.createArea({ title: "To" });
    const goal = await spine.createGoal({ title: "G", areaId: areaA.id });
    // Move the Goal to Area B: A now holds only a SOFT-DELETED belongs_to_area link.
    await spine.move(goal.id, { kind: "area", id: areaB.id });

    // A historical (soft-deleted) link referencing A exists, but A is deletable.
    expect(await linkRowsReferencing(areaA.id)).toBeGreaterThan(0);
    expect((await areas.getAreaDependencySummary(areaA.id)).deletable).toBe(
      true,
    );

    const result = await spine.permanentlyDeleteArea(areaA.id);
    expect(result.outcome).toBe("deleted");
    // The historical link row is purged; Area B and its Goal are untouched.
    expect(await linkRowsReferencing(areaA.id)).toBe(0);
    expect(await areas.getAreaOverview(areaB.id)).not.toBeNull();
    expect((await spine.getById(goal.id))?.title).toBe("G");
  });

  it("rolls the whole purge back atomically when a later batch stage fails", async () => {
    const faulted = repos(WS, { deleteFault: "after-entities" });
    const area = await faulted.spine.createArea({ title: "Rollback" });

    await expect(
      faulted.spine.permanentlyDeleteArea(area.id),
    ).rejects.toThrow();

    // Nothing was removed — the Area and its rows are fully intact.
    const after = await areaRowCounts(area.id);
    expect(after.entities).toBe(1);
    expect(after.spineRecords).toBe(1);
    expect(await countActivitiesOfType(AREA_DELETED)).toBe(0);
  });

  it("refuses a second deletion of the same Area (its rows are gone)", async () => {
    const { spine } = repos();
    const area = await spine.createArea({ title: "Twice" });
    const first = await spine.permanentlyDeleteArea(area.id);
    expect(first.outcome).toBe("deleted");
    // The entity no longer exists, so a repeat is a calm not-found.
    await expect(spine.permanentlyDeleteArea(area.id)).rejects.toThrow();
  });

  it("refuses a non-Area id with a wrong-kind error", async () => {
    const { spine } = repos();
    const area = await spine.createArea({ title: "Parent" });
    const goal = await spine.createGoal({ title: "G", areaId: area.id });
    await expect(spine.permanentlyDeleteArea(goal.id)).rejects.toBeInstanceOf(
      SpineWrongKindError,
    );
  });

  it("keeps deletion workspace-scoped and leaves unrelated workspace data untouched", async () => {
    const a = repos(WS);
    const b = repos(OTHER);
    const areaA = await a.spine.createArea({ title: "Career" });
    const areaB = await b.spine.createArea({ title: "Career" });

    await a.spine.permanentlyDeleteArea(areaA.id);

    // The other workspace's Area is entirely untouched.
    expect(await b.areas.getAreaOverview(areaB.id)).not.toBeNull();
    const areaBRows = await areaRowCounts(areaB.id);
    expect(areaBRows.entities).toBe(1);
    expect(areaBRows.spineRecords).toBe(1);
  });
});
