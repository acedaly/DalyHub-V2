/**
 * AUDIT-15 — the project-less (Inbox) Task's COMPLETE lifecycle.
 *
 * TASKS-04 made structural parentage optional for Tasks: an Inbox Task is a
 * valid spine record with no structural EntityLink. `spine.restore` predated
 * that and required an active structural parent for every non-Area kind, so a
 * Task that was legal to create became illegal to restore — the same record
 * accepted at one end of its life and refused at the other, surfacing as
 * `SpineParentUnavailableError`.
 *
 * These tests drive the whole lifecycle through the CANONICAL kernel path
 * (`TaskRepository.createTask` → `spine.softDelete` → `spine.restore`; the four
 * spine types are reserved away from the generic `EntityRepository`), and pin
 * the integrity rules that must NOT have been relaxed on the way: a Task that
 * genuinely retains a parent link, and every other spine kind, still refuse to
 * restore into a missing parent.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";

import { SpineParentUnavailableError } from "~/kernel/spine";

import {
  FakeClock,
  countActivitiesOfType,
  makeContext,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "ws_inbox_lifecycle";
const OTHER_WS = "ws_inbox_lifecycle_other";

function spineFor(workspaceId: string) {
  return makeSpineRepository(makeContext(workspaceId), {
    clock: new FakeClock().now,
    idGenerator: sequentialIds(),
  });
}

function tasksFor(workspaceId: string) {
  return makeTaskRepository(makeContext(workspaceId), {
    clock: new FakeClock().now,
    idGenerator: sequentialIds(),
  });
}

beforeEach(async () => {
  await resetTables([WS, OTHER_WS]);
});

describe("AUDIT-15 — a project-less Inbox Task survives its whole lifecycle", () => {
  it("creates, soft-deletes and restores a parentless Task, and it stays project-less", async () => {
    const tasks = tasksFor(WS);
    const spine = spineFor(WS);

    const created = await tasks.createTask({
      title: "Buy stamps",
      priority: "p2",
      dueDate: "2026-08-20",
      scheduledDate: "2026-08-19",
    });
    expect((await spine.getById(created.id))?.parent).toBeNull();

    const deleted = await spine.softDelete(created.id);
    expect(deleted.outcome).toBe("deleted");

    // The fix under test: this threw `SpineParentUnavailableError` before.
    const restored = await spine.restore(created.id);
    expect(restored.outcome).toBe("restored");
    expect(restored.changed).toBe(true);
    expect(restored.record.deletedAt).toBeNull();

    // Still project-less. Nothing was invented to satisfy the restore.
    expect(restored.record.parent).toBeNull();
    const reread = await spine.getById(created.id);
    expect(reread?.parent).toBeNull();

    // No fabricated Project/Area and no structural link was written.
    const links = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM entity_links
        WHERE workspace_id = ? AND source_entity_id = ?`,
    )
      .bind(WS, created.id)
      .first<{ n: number }>();
    expect(links?.n ?? 0).toBe(0);
    const entityTypes = await env.DB.prepare(
      `SELECT type, COUNT(*) AS n FROM entities WHERE workspace_id = ? GROUP BY type`,
    )
      .bind(WS)
      .all<{ type: string; n: number }>();
    expect(entityTypes.results).toEqual([{ type: "task", n: 1 }]);
  });

  it("preserves the Task's title and detail fields across delete and restore", async () => {
    const tasks = tasksFor(WS);
    const spine = spineFor(WS);

    const created = await tasks.createTask({
      title: "Draft the letter",
      priority: "p1",
      timeSector: "this_week",
      dueDate: "2026-09-01",
      scheduledDate: "2026-08-30",
    });

    await spine.softDelete(created.id);
    await spine.restore(created.id);

    const task = await tasks.getTask(created.id);
    expect(task).not.toBeNull();
    expect(task?.title).toBe("Draft the letter");
    expect(task?.priority).toBe("p1");
    expect(task?.timeSector).toBe("this_week");
    expect(task?.dueDate).toBe("2026-09-01");
    expect(task?.scheduledDate).toBe("2026-08-30");
    // No structural context was invented on the way back: it is still an Inbox
    // Task with no Project, no Goal and no Area.
    expect(task?.project).toBeNull();
    expect(task?.goal).toBeNull();
    expect(task?.area).toBeNull();
    expect(task?.completedAt).toBeNull();
  });

  it("records exactly one entity.restored event, and none for a repeated restore", async () => {
    const tasks = tasksFor(WS);
    const spine = spineFor(WS);

    const created = await tasks.createTask({ title: "Inbox thing" });
    await spine.softDelete(created.id);

    expect(await countActivitiesOfType("entity.deleted")).toBe(1);
    await spine.restore(created.id);
    expect(await countActivitiesOfType("entity.restored")).toBe(1);

    const again = await spine.restore(created.id);
    expect(again.outcome).toBe("already_active");
    expect(again.changed).toBe(false);
    // The idempotent repeat is not a second lifecycle event.
    expect(await countActivitiesOfType("entity.restored")).toBe(1);
  });

  it("keeps the restore workspace-scoped: another workspace cannot restore it", async () => {
    const tasks = tasksFor(WS);
    const spine = spineFor(WS);
    const otherSpine = spineFor(OTHER_WS);

    const created = await tasks.createTask({ title: "Private inbox task" });
    await spine.softDelete(created.id);

    // The id is not visible from another workspace, so it can neither be read
    // nor restored there — the parentless allowance did not widen the boundary.
    expect(
      await otherSpine.getById(created.id, { includeDeleted: true }),
    ).toBeNull();
    await expect(otherSpine.restore(created.id)).rejects.toThrow();

    const stillDeleted = await spine.getById(created.id, {
      includeDeleted: true,
    });
    expect(stillDeleted?.deletedAt).not.toBeNull();

    // And restoring it in its own workspace still works.
    expect((await spine.restore(created.id)).outcome).toBe("restored");
  });
});

describe("AUDIT-15 — structural-parent integrity is unchanged where a parent exists", () => {
  it("still refuses to restore a Task whose retained Project parent is deleted", async () => {
    const spine = spineFor(WS);
    const area = await spine.createArea({ title: "Home" });
    const project = await spine.createProject({
      title: "Kitchen",
      parent: { kind: "area", id: area.id },
    });
    const task = await spine.createTask({
      title: "Order tiles",
      parent: { kind: "project", id: project.id },
    });

    await spine.softDelete(task.id);
    await spine.softDelete(project.id);

    await expect(spine.restore(task.id)).rejects.toThrow(
      SpineParentUnavailableError,
    );

    await spine.restore(project.id);
    const restored = await spine.restore(task.id);
    expect(restored.outcome).toBe("restored");
    expect(restored.record.parent).toEqual({ kind: "project", id: project.id });
  });

  it("still refuses to restore a Project whose retained Area parent is deleted", async () => {
    const spine = spineFor(WS);
    const area = await spine.createArea({ title: "Career" });
    const project = await spine.createProject({
      title: "Certification",
      parent: { kind: "area", id: area.id },
    });

    await spine.softDelete(project.id);
    await spine.softDelete(area.id);

    await expect(spine.restore(project.id)).rejects.toThrow(
      SpineParentUnavailableError,
    );
  });

  it("still refuses to restore a Goal whose retained Area parent is deleted", async () => {
    const spine = spineFor(WS);
    const area = await spine.createArea({ title: "Health" });
    const goal = await spine.createGoal({
      title: "Half marathon",
      areaId: area.id,
    });

    await spine.softDelete(goal.id);
    await spine.softDelete(area.id);

    await expect(spine.restore(goal.id)).rejects.toThrow(
      SpineParentUnavailableError,
    );
  });

  it("restores a Task to the Inbox once its parent link has been cleared", async () => {
    // The other half of the contract: a Task that WAS parented but has since
    // been unassigned (TASKS-04's `setTaskParent(null)`) is parentless, so it
    // restores to the Inbox rather than being trapped by a link it no longer has.
    const spine = spineFor(WS);
    const tasks = tasksFor(WS);
    const area = await spine.createArea({ title: "Admin" });
    const task = await spine.createTask({
      title: "File the form",
      parent: { kind: "area", id: area.id },
    });

    await tasks.setTaskParent(task.id, null);
    expect((await spine.getById(task.id))?.parent).toBeNull();

    await spine.softDelete(task.id);
    const restored = await spine.restore(task.id);
    expect(restored.outcome).toBe("restored");
    expect(restored.record.parent).toBeNull();
  });
});
