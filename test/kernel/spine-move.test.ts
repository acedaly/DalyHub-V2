import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import {
  SpineInvalidParentKindError,
  SpineNotFoundError,
  SpineParentUnavailableError,
  SpineWrongKindError,
} from "~/kernel/spine";

import {
  FakeClock,
  countActivitiesOfType,
  ensureWorkspace,
  makeActivityRepository,
  makeContext,
  makeSpineRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "ws_spine_move";
const OTHER = "ws_spine_move_other";

function repo() {
  return makeSpineRepository(makeContext(WS), {
    clock: new FakeClock().now,
    idGenerator: sequentialIds(),
  });
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("move / reparent", () => {
  it("moves a Task between Area and Project, keeping its id and recording link mutations", async () => {
    const spine = repo();
    const area = await spine.createArea({ title: "A" });
    const project = await spine.createProject({
      title: "P",
      parent: { kind: "area", id: area.id },
    });
    const task = await spine.createTask({
      title: "T",
      parent: { kind: "area", id: area.id },
    });

    const moved = await spine.move(task.id, {
      kind: "project",
      id: project.id,
    });
    expect(moved.outcome).toBe("moved");
    expect(moved.record.id).toBe(task.id); // same identity
    expect(moved.record.parent).toEqual({ kind: "project", id: project.id });
    // A fresh destination link is created; the old parent link is unlinked.
    expect(await countActivitiesOfType("entity_link.unlinked")).toBe(1);
    expect(await countActivitiesOfType("entity_link.created")).toBe(3); // 2 creates + 1 move
  });

  it("reuses (restores) a previously soft-deleted destination link on a move back", async () => {
    const spine = repo();
    const area = await spine.createArea({ title: "A" });
    const project = await spine.createProject({
      title: "P",
      parent: { kind: "area", id: area.id },
    });
    const task = await spine.createTask({
      title: "T",
      parent: { kind: "area", id: area.id },
    });

    await spine.move(task.id, { kind: "project", id: project.id });
    const back = await spine.move(task.id, { kind: "area", id: area.id });
    expect(back.outcome).toBe("moved");
    expect(back.record.parent).toEqual({ kind: "area", id: area.id });
    // The original area link is restored in place rather than a new one created.
    expect(await countActivitiesOfType("entity_link.restored")).toBe(1);
    expect(await countActivitiesOfType("entity_link.unlinked")).toBe(2);
  });

  it("moves a Project between an Area and a Goal", async () => {
    const spine = repo();
    const area = await spine.createArea({ title: "A" });
    const goal = await spine.createGoal({ title: "G", areaId: area.id });
    const project = await spine.createProject({
      title: "P",
      parent: { kind: "area", id: area.id },
    });
    const moved = await spine.move(project.id, { kind: "goal", id: goal.id });
    expect(moved.record.parent).toEqual({ kind: "goal", id: goal.id });
  });

  it("is an idempotent no-op when moving to the existing parent", async () => {
    const spine = repo();
    const area = await spine.createArea({ title: "A" });
    const task = await spine.createTask({
      title: "T",
      parent: { kind: "area", id: area.id },
    });
    const before = await countActivitiesOfType("entity_link.unlinked");
    const noop = await spine.move(task.id, { kind: "area", id: area.id });
    expect(noop.outcome).toBe("already_there");
    expect(noop.changed).toBe(false);
    expect(await countActivitiesOfType("entity_link.unlinked")).toBe(before);
  });

  it("preserves the original parent when the destination is unavailable", async () => {
    const spine = repo();
    const area = await spine.createArea({ title: "A" });
    const areaB = await spine.createArea({ title: "B" });
    const task = await spine.createTask({
      title: "T",
      parent: { kind: "area", id: area.id },
    });
    await spine.softDelete(areaB.id);

    await expect(
      spine.move(task.id, { kind: "area", id: areaB.id }),
    ).rejects.toThrow(SpineParentUnavailableError);
    // The task still belongs to its original Area — the parent was never dropped.
    expect((await spine.getById(task.id))?.parent).toEqual({
      kind: "area",
      id: area.id,
    });
  });

  it("rejects a cross-workspace destination, an illegal kind, an Area, and a deleted record", async () => {
    await ensureWorkspace(OTHER);
    const other = makeSpineRepository(makeContext(OTHER), {
      clock: new FakeClock().now,
      idGenerator: sequentialIds("o"),
    });
    const foreignArea = await other.createArea({ title: "Foreign" });

    const spine = repo();
    const area = await spine.createArea({ title: "A" });
    const goal = await spine.createGoal({ title: "G", areaId: area.id });
    const task = await spine.createTask({
      title: "T",
      parent: { kind: "area", id: area.id },
    });

    await expect(
      spine.move(task.id, { kind: "area", id: foreignArea.id }),
    ).rejects.toThrow(SpineParentUnavailableError);
    // A Task cannot sit directly under a Goal.
    await expect(
      spine.move(task.id, { kind: "goal", id: goal.id }),
    ).rejects.toThrow(SpineInvalidParentKindError);
    // An Area has no parent and cannot be moved.
    await expect(
      spine.move(area.id, { kind: "goal", id: goal.id }),
    ).rejects.toThrow(SpineWrongKindError);
    // A deleted record cannot be moved.
    await spine.softDelete(task.id);
    await expect(
      spine.move(task.id, { kind: "area", id: area.id }),
    ).rejects.toThrow(SpineNotFoundError);
  });

  it("records exact source/target/link payloads for the unlink and destination events", async () => {
    const spine = repo();
    const area = await spine.createArea({ title: "A" });
    const project = await spine.createProject({
      title: "P",
      parent: { kind: "area", id: area.id },
    });
    const task = await spine.createTask({
      title: "T",
      parent: { kind: "area", id: area.id },
    });
    await spine.move(task.id, { kind: "project", id: project.id });

    const timeline = await makeActivityRepository(
      makeContext(WS),
    ).listForEntity(task.id);

    const unlinked = timeline.items.find(
      (e) => e.type === "entity_link.unlinked",
    );
    expect(unlinked?.payload.sourceEntityId).toBe(task.id);
    expect(unlinked?.payload.targetEntityId).toBe(area.id);
    expect(unlinked?.payload.linkType).toBe("task.belongs_to_area");
    // The event's linkId is the stable id of the exact (task → area) relationship.
    const oldLink = await env.DB.prepare(
      `SELECT id FROM entity_links
       WHERE workspace_id = ? AND source_entity_id = ? AND target_entity_id = ? AND type = ?`,
    )
      .bind(WS, task.id, area.id, "task.belongs_to_area")
      .first<{ id: string }>();
    expect(unlinked?.payload.linkId).toBe(oldLink?.id);

    const created = timeline.items.find(
      (e) =>
        e.type === "entity_link.created" &&
        e.payload.targetEntityId === project.id,
    );
    expect(created?.payload.sourceEntityId).toBe(task.id);
    expect(created?.payload.linkType).toBe("task.belongs_to_project");
  });

  it("rolls back the old-parent unlink when the destination is unavailable (no partial unlink, no event)", async () => {
    const spine = repo();
    const area = await spine.createArea({ title: "A" });
    const areaB = await spine.createArea({ title: "B" });
    const task = await spine.createTask({
      title: "T",
      parent: { kind: "area", id: area.id },
    });
    await spine.softDelete(areaB.id);

    await expect(
      spine.move(task.id, { kind: "area", id: areaB.id }),
    ).rejects.toThrow(SpineParentUnavailableError);

    // The original (task → A) link is still ACTIVE — the unlink never committed.
    const link = await env.DB.prepare(
      `SELECT deleted_at FROM entity_links
       WHERE workspace_id = ? AND source_entity_id = ? AND target_entity_id = ? AND type = ?`,
    )
      .bind(WS, task.id, area.id, "task.belongs_to_area")
      .first<{ deleted_at: string | null }>();
    expect(link?.deleted_at).toBeNull();
    // And no unlink event was appended.
    expect(await countActivitiesOfType("entity_link.unlinked")).toBe(0);
  });
});

describe("rename", () => {
  it("renames through entity.updated with accurate before/after", async () => {
    const spine = repo();
    const area = await spine.createArea({ title: "Old" });
    const renamed = await spine.rename(area.id, "  New  ");
    expect(renamed.title).toBe("New");
    expect(await countActivitiesOfType("entity.updated")).toBe(1);
  });

  it("treats a same-title update (after normalisation) as a no-op", async () => {
    const spine = repo();
    const area = await spine.createArea({ title: "Same" });
    const first = await spine.getById(area.id);
    const noop = await spine.rename(area.id, "  Same  ");
    expect(noop.updatedAt.getTime()).toBe(first!.updatedAt.getTime());
    expect(await countActivitiesOfType("entity.updated")).toBe(0);
  });

  it("does not invent per-kind rename events", async () => {
    const spine = repo();
    const area = await spine.createArea({ title: "A" });
    const task = await spine.createTask({
      title: "T",
      parent: { kind: "area", id: area.id },
    });
    await spine.rename(task.id, "Renamed");
    expect(await countActivitiesOfType("task.renamed")).toBe(0);
    expect(await countActivitiesOfType("entity.updated")).toBe(1);
  });
});
