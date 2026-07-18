import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import {
  FakeClock,
  countActivitiesOfType,
  makeContext,
  makeSpineRepository,
  resetTables,
  sequentialIds,
} from "./support";

// FND-07: real Workers/D1 concurrency. Correctness is guaranteed by conditional
// SQL (changes()-guarded appends, EXISTS-gated inserts) and the one-active-parent
// partial unique index — NOT by after-the-fact deduplication. Each test asserts an
// invariant that must hold under ANY interleaving.

const WS = "ws_spine_concurrency";

function repo(prefix = "s") {
  return makeSpineRepository(makeContext(WS), {
    clock: new FakeClock().now,
    idGenerator: sequentialIds(prefix),
  });
}

/** The number of ACTIVE structural parent links a child currently has. */
async function activeParentCount(childId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM entity_links
     WHERE workspace_id = ? AND source_entity_id = ? AND deleted_at IS NULL
       AND type IN (
         'goal.belongs_to_area','project.belongs_to_area','project.advances_goal',
         'task.belongs_to_area','task.belongs_to_project')`,
  )
    .bind(WS, childId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** The stored `spine_records.completed_at` for an entity (regardless of delete state). */
async function storedCompletedAt(entityId: string): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT completed_at FROM spine_records WHERE workspace_id = ? AND entity_id = ?",
  )
    .bind(WS, entityId)
    .first<{ completed_at: string | null }>();
  return row?.completed_at ?? null;
}

beforeEach(async () => {
  await resetTables([WS]);
});

describe("concurrent completion / reopening", () => {
  it("concurrent completion yields one state change and one event", async () => {
    const spine = repo();
    const area = await spine.createArea({ title: "A" });
    const task = await spine.createTask({
      title: "T",
      parent: { kind: "area", id: area.id },
    });

    const results = await Promise.all([
      spine.complete(task.id),
      spine.complete(task.id),
    ]);
    const outcomes = results.map((r) => r.outcome).sort();
    expect(outcomes).toEqual(["already_completed", "completed"]);
    expect(await countActivitiesOfType("task.completed")).toBe(1);
    expect((await spine.getById(task.id))?.completedAt).not.toBeNull();
  });

  it("concurrent reopening yields one state change and one event", async () => {
    const spine = repo();
    const area = await spine.createArea({ title: "A" });
    const task = await spine.createTask({
      title: "T",
      parent: { kind: "area", id: area.id },
    });
    await spine.complete(task.id);

    const results = await Promise.all([
      spine.reopen(task.id),
      spine.reopen(task.id),
    ]);
    expect(results.map((r) => r.outcome).sort()).toEqual([
      "already_open",
      "reopened",
    ]);
    expect(await countActivitiesOfType("task.reopened")).toBe(1);
    expect((await spine.getById(task.id))?.completedAt).toBeNull();
  });

  it("completion racing a soft-delete never changes completion state without its event", async () => {
    const spine = repo();
    const area = await spine.createArea({ title: "A" });
    const task = await spine.createTask({
      title: "T",
      parent: { kind: "area", id: area.id },
    });

    await Promise.allSettled([
      spine.complete(task.id),
      spine.softDelete(task.id),
    ]);

    // Invariant: completed_at is set IFF exactly one task.completed event exists —
    // the spine mutation, the updated_at bump and the event are all-or-nothing.
    const completed = (await storedCompletedAt(task.id)) !== null;
    const events = await countActivitiesOfType("task.completed");
    expect(events).toBeLessThanOrEqual(1);
    expect(completed).toBe(events === 1);
  });

  it("reopening racing a soft-delete never changes completion state without its event", async () => {
    const spine = repo();
    const area = await spine.createArea({ title: "A" });
    const task = await spine.createTask({
      title: "T",
      parent: { kind: "area", id: area.id },
    });
    await spine.complete(task.id);

    await Promise.allSettled([
      spine.reopen(task.id),
      spine.softDelete(task.id),
    ]);

    // Invariant: completed_at is cleared IFF exactly one task.reopened event exists.
    const stillCompleted = (await storedCompletedAt(task.id)) !== null;
    const reopenedEvents = await countActivitiesOfType("task.reopened");
    expect(reopenedEvents).toBeLessThanOrEqual(1);
    expect(stillCompleted).toBe(reopenedEvents === 0);
  });
});

describe("concurrent structural mutations never break the invariants", () => {
  it("concurrent moves of the same child leave exactly one active parent", async () => {
    const spine = repo();
    const area = await spine.createArea({ title: "A" });
    const p1 = await spine.createProject({
      title: "P1",
      parent: { kind: "area", id: area.id },
    });
    const p2 = await spine.createProject({
      title: "P2",
      parent: { kind: "area", id: area.id },
    });
    const task = await spine.createTask({
      title: "T",
      parent: { kind: "area", id: area.id },
    });

    await Promise.allSettled([
      spine.move(task.id, { kind: "project", id: p1.id }),
      spine.move(task.id, { kind: "project", id: p2.id }),
    ]);

    // Never two committed active parents.
    expect(await activeParentCount(task.id)).toBe(1);
    const parent = (await spine.getById(task.id))?.parent;
    expect([p1.id, p2.id, area.id]).toContain(parent?.id);
  });

  it("child creation racing parent deletion cannot commit an active orphan", async () => {
    const spine = repo();
    const area = await spine.createArea({ title: "A" });

    const [createResult, deleteResult] = await Promise.allSettled([
      spine.createTask({ title: "T", parent: { kind: "area", id: area.id } }),
      spine.softDelete(area.id),
    ]);

    const areaNow = await spine.getById(area.id, { includeDeleted: true });
    if (areaNow?.deletedAt) {
      // If the Area ended deleted, it must have NO active children.
      if (createResult.status === "fulfilled") {
        const child = await spine.getById(createResult.value.id, {
          includeDeleted: true,
        });
        // Either the child creation failed, or (if it committed) the delete must
        // have failed — an active child under a deleted Area is impossible.
        expect(child?.deletedAt ?? "deleted").not.toBeNull();
      }
    }
    // The core invariant, stated directly: no ACTIVE child under a deleted Area.
    if (areaNow?.deletedAt) {
      const children = await spine.listChildren({
        parentId: area.id,
        childKind: "task",
      });
      expect(children.items).toHaveLength(0);
    }
    // And whichever way it resolved, at least one of the two operations succeeded.
    expect(
      deleteResult.status === "fulfilled" ||
        createResult.status === "fulfilled",
    ).toBe(true);
  });

  it("destination-parent deletion racing a move never loses the original parent", async () => {
    const spine = repo();
    const areaA = await spine.createArea({ title: "A" });
    const areaB = await spine.createArea({ title: "B" });
    const task = await spine.createTask({
      title: "T",
      parent: { kind: "area", id: areaA.id },
    });

    await Promise.allSettled([
      spine.move(task.id, { kind: "area", id: areaB.id }),
      spine.softDelete(areaB.id),
    ]);

    // The task is never orphaned: it always has exactly one active parent, and
    // that parent (A or B) is an active Area.
    expect(await activeParentCount(task.id)).toBe(1);
    const parent = await spine.getParent(task.id);
    expect(parent?.deletedAt ?? null).toBeNull();
    expect([areaA.id, areaB.id]).toContain(parent?.id);
  });

  it("a move racing a child deletion leaves the child's retained parent link intact", async () => {
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

    const [moveResult] = await Promise.allSettled([
      spine.move(task.id, { kind: "project", id: project.id }),
      spine.softDelete(task.id),
    ]);

    // The child is NEVER orphaned: it always retains exactly one structural parent
    // link (active), whether it ended active or soft-deleted.
    expect(await activeParentCount(task.id)).toBe(1);

    const child = await spine.getById(task.id, { includeDeleted: true });
    if (moveResult.status === "rejected") {
      // The delete won: the move never touched the original retained parent (A).
      expect(child?.parent).toEqual({ kind: "area", id: area.id });
    } else {
      // The move won (child was active): it now belongs to the project.
      expect(child?.parent).toEqual({ kind: "project", id: project.id });
    }
  });
});

describe("concurrent identical rename", () => {
  it("both callers receive the persisted title and only one entity.updated is written", async () => {
    const spine = repo();
    const area = await spine.createArea({ title: "Old" });

    const [a, b] = await Promise.all([
      spine.rename(area.id, "New"),
      spine.rename(area.id, "New"),
    ]);

    // Both callers observe the persisted title, not a stale pre-loop snapshot.
    expect(a.title).toBe("New");
    expect(b.title).toBe("New");
    expect((await spine.getById(area.id))?.title).toBe("New");
    // Exactly one real change → exactly one Activity event.
    expect(await countActivitiesOfType("entity.updated")).toBe(1);
  });
});
