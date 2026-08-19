/**
 * TASKS-12 — Task dependencies against the REAL database (Workers runtime,
 * isolated D1, committed migrations applied).
 *
 * Each of these is a claim the SCHEMA or a TRANSACTION makes, rather than one the
 * interface promises:
 *
 *   - a dependency is one directed EntityLink, stored once, with no second table
 *     and no second direction;
 *   - blocked state is DERIVED on every read, so completing the last blocker
 *     unblocks and reopening it blocks again, with nothing to reconcile;
 *   - the graph cannot contain a cycle of ANY length, and the check holds under
 *     concurrent writes;
 *   - both bounds are enforced by the WRITE, and hold under a concurrent race;
 *   - workspace isolation is absolute, and an endpoint in another workspace is
 *     indistinguishable from one that does not exist;
 *   - blocked state for a whole page costs a bounded number of statements.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { env } from "cloudflare:test";

import {
  MAX_TASK_BLOCKERS,
  MAX_TASK_BLOCKS,
  TASK_BLOCKS,
  TASK_DEPENDENCY_ADDED,
  TASK_DEPENDENCY_REMOVED,
  TaskDependencyCycleError,
  TaskDependencyLimitError,
  TaskNotFoundError,
  TaskValidationError,
} from "~/kernel/tasks";

import {
  FakeClock,
  countingDb,
  makeContext,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";
import { createTaskRepository } from "~/platform/storage/d1";
import type { D1TaskRepositoryOptions } from "~/platform/storage/d1";

const WS = "ws_dependencies";
const OTHER = "ws_dependencies_other";

const nextEntityId = sequentialIds("dep_ent");
const nextActivityId = sequentialIds("dep_act");

function taskRepo(ws = WS, options: D1TaskRepositoryOptions = {}) {
  return makeTaskRepository(makeContext(ws), {
    clock: new FakeClock("2026-08-19T00:00:00.000Z").now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
    ...options,
  });
}

async function seedTask(title: string, ws = WS): Promise<string> {
  const task = await taskRepo(ws).createTask({ title, parent: null });
  return task.id;
}

/** Every stored dependency edge, whatever workspace it belongs to. */
async function edgeRows(): Promise<
  readonly {
    readonly source_entity_id: string;
    readonly target_entity_id: string;
    readonly deleted_at: string | null;
  }[]
> {
  const result = await env.DB.prepare(
    `SELECT source_entity_id, target_entity_id, deleted_at
     FROM entity_links WHERE type = ? ORDER BY source_entity_id`,
  )
    .bind(TASK_BLOCKS)
    .all<{
      source_entity_id: string;
      target_entity_id: string;
      deleted_at: string | null;
    }>();
  return result.results ?? [];
}

async function activityTypes(): Promise<readonly string[]> {
  const result = await env.DB.prepare(
    `SELECT type FROM activities WHERE type LIKE 'task.dependency%' ORDER BY id`,
  ).all<{ type: string }>();
  return (result.results ?? []).map((row) => row.type);
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

/* -------------------------------------------------------------------------- */
/* One directed relationship, stored once                                     */
/* -------------------------------------------------------------------------- */

describe("a dependency is one directed EntityLink", () => {
  it("stores ONE row, from blocker to blocked, and derives the other direction", async () => {
    const tasks = taskRepo();
    const draft = await seedTask("Prepare draft");
    const publish = await seedTask("Publish report");

    expect(await tasks.addTaskDependency(publish, draft)).toEqual({
      changed: true,
    });

    const rows = await edgeRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source_entity_id: draft,
      target_entity_id: publish,
      deleted_at: null,
    });

    // "Blocked by" and "blocks" are the SAME row, read from its two ends.
    const fromBlocked = await tasks.listTaskDependencies(publish);
    expect(fromBlocked.blockedBy.map((b) => b.taskId)).toEqual([draft]);
    expect(fromBlocked.blocks).toEqual([]);
    const fromBlocker = await tasks.listTaskDependencies(draft);
    expect(fromBlocker.blocks.map((b) => b.taskId)).toEqual([publish]);
    expect(fromBlocker.blockedBy).toEqual([]);
  });

  it("creates NO new entity and NO spine record", async () => {
    const tasks = taskRepo();
    const a = await seedTask("A");
    const b = await seedTask("B");
    const before = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM entities",
    ).first<{ n: number }>();
    await tasks.addTaskDependency(b, a);
    const after = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM entities",
    ).first<{ n: number }>();
    expect(after?.n).toBe(before?.n);
  });

  it("records ONE Activity event per real change, naming both Tasks", async () => {
    const tasks = taskRepo();
    const a = await seedTask("A");
    const b = await seedTask("B");
    await tasks.addTaskDependency(b, a);
    expect(await activityTypes()).toEqual([TASK_DEPENDENCY_ADDED]);

    // An idempotent re-add writes nothing at all.
    await tasks.addTaskDependency(b, a);
    expect(await activityTypes()).toEqual([TASK_DEPENDENCY_ADDED]);

    await tasks.removeTaskDependency(b, a);
    expect(await activityTypes()).toEqual([
      TASK_DEPENDENCY_ADDED,
      TASK_DEPENDENCY_REMOVED,
    ]);

    const subjects = await env.DB.prepare(
      `SELECT entity_id, role FROM activity_subjects s
       JOIN activities a ON a.id = s.activity_id
       WHERE a.type = ? ORDER BY s.role`,
    )
      .bind(TASK_DEPENDENCY_ADDED)
      .all<{ entity_id: string; role: string }>();
    expect(subjects.results).toEqual([
      { entity_id: a, role: "blocker" },
      { entity_id: b, role: "subject" },
    ]);
  });

  it("is idempotent to add and to remove", async () => {
    const tasks = taskRepo();
    const a = await seedTask("A");
    const b = await seedTask("B");
    expect((await tasks.addTaskDependency(b, a)).changed).toBe(true);
    expect((await tasks.addTaskDependency(b, a)).changed).toBe(false);
    expect((await tasks.removeTaskDependency(b, a)).changed).toBe(true);
    expect((await tasks.removeTaskDependency(b, a)).changed).toBe(false);
  });

  it("RESTORES the same relationship row when a removed dependency is re-added", async () => {
    const tasks = taskRepo();
    const a = await seedTask("A");
    const b = await seedTask("B");
    await tasks.addTaskDependency(b, a);
    const first = await env.DB.prepare(
      "SELECT id FROM entity_links WHERE type = ?",
    )
      .bind(TASK_BLOCKS)
      .first<{ id: string }>();
    await tasks.removeTaskDependency(b, a);
    await tasks.addTaskDependency(b, a);
    const rows = await edgeRows();
    // ONE row, still, and it kept its identity.
    expect(rows).toHaveLength(1);
    expect(rows[0]?.deleted_at).toBeNull();
    const second = await env.DB.prepare(
      "SELECT id FROM entity_links WHERE type = ?",
    )
      .bind(TASK_BLOCKS)
      .first<{ id: string }>();
    expect(second?.id).toBe(first?.id);
  });
});

/* -------------------------------------------------------------------------- */
/* Blocked state is derived                                                   */
/* -------------------------------------------------------------------------- */

describe("blocked state is derived, never stored", () => {
  it("is blocked while ONE blocker of several remains incomplete", async () => {
    const tasks = taskRepo();
    const target = await seedTask("Submit audit");
    const first = await seedTask("Approve budget");
    const second = await seedTask("Sign contract");
    await tasks.addTaskDependency(target, first);
    await tasks.addTaskDependency(target, second);

    expect((await tasks.listBlockedSummaries([target])).get(target)).toEqual({
      blockerCount: 2,
      firstBlockerTitle: "Approve budget",
    });

    await tasks.completeTask(first, { ownerTodayIso: "2026-08-19" });
    expect((await tasks.listBlockedSummaries([target])).get(target)).toEqual({
      blockerCount: 1,
      firstBlockerTitle: "Sign contract",
    });

    await tasks.completeTask(second, { ownerTodayIso: "2026-08-19" });
    expect((await tasks.listBlockedSummaries([target])).has(target)).toBe(
      false,
    );
  });

  it("becomes blocked AGAIN when a completed blocker is reopened", async () => {
    const tasks = taskRepo();
    const target = await seedTask("Publish report");
    const blocker = await seedTask("Get director approval");
    await tasks.addTaskDependency(target, blocker);
    await tasks.completeTask(blocker, { ownerTodayIso: "2026-08-19" });
    expect((await tasks.listBlockedSummaries([target])).has(target)).toBe(
      false,
    );

    await tasks.reopenTask(blocker);
    expect((await tasks.listBlockedSummaries([target])).get(target)).toEqual({
      blockerCount: 1,
      firstBlockerTitle: "Get director approval",
    });
  });

  it("a SOFT-DELETED blocker no longer blocks, and no edge dangles", async () => {
    const tasks = taskRepo();
    const target = await seedTask("Publish report");
    const blocker = await seedTask("Get director approval");
    await tasks.addTaskDependency(target, blocker);

    await tasks.deleteTasks([blocker]);
    // A Task in the trash is not holding anything up.
    expect((await tasks.listBlockedSummaries([target])).has(target)).toBe(
      false,
    );
    expect((await tasks.listTaskDependencies(target)).blockedBy).toEqual([]);
    // The EDGE survives, so restoring the blocker restores the dependency
    // rather than losing a relationship the owner created.
    expect(await edgeRows()).toHaveLength(1);

    await tasks.restoreTasks([blocker]);
    expect(
      (await tasks.listBlockedSummaries([target])).get(target),
    ).toMatchObject({ blockerCount: 1 });
  });

  it("returns nothing for an empty id list, and issues no statement", async () => {
    const counter = countingDb(env.DB);
    const tasks = createTaskRepository(counter.db, makeContext(WS), {
      clock: new FakeClock().now,
      idGenerator: nextEntityId,
      activityIdGenerator: nextActivityId,
    });
    counter.reset();
    expect((await tasks.listBlockedSummaries([])).size).toBe(0);
    expect(counter.prepareCount()).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Cycles                                                                     */
/* -------------------------------------------------------------------------- */

describe("cycle prevention", () => {
  it("refuses a SELF dependency", async () => {
    const tasks = taskRepo();
    const a = await seedTask("A");
    await expect(tasks.addTaskDependency(a, a)).rejects.toBeInstanceOf(
      TaskValidationError,
    );
    expect(await edgeRows()).toHaveLength(0);
  });

  it("refuses a TWO-node cycle", async () => {
    const tasks = taskRepo();
    const a = await seedTask("A");
    const b = await seedTask("B");
    await tasks.addTaskDependency(b, a); // A blocks B
    await expect(tasks.addTaskDependency(a, b)).rejects.toBeInstanceOf(
      TaskDependencyCycleError,
    );
    expect(await edgeRows()).toHaveLength(1);
  });

  it("refuses a THREE-node cycle", async () => {
    const tasks = taskRepo();
    const a = await seedTask("A");
    const b = await seedTask("B");
    const c = await seedTask("C");
    await tasks.addTaskDependency(b, a); // A -> B
    await tasks.addTaskDependency(c, b); // B -> C
    await expect(tasks.addTaskDependency(a, c)).rejects.toBeInstanceOf(
      TaskDependencyCycleError,
    );
    expect(await edgeRows()).toHaveLength(2);
  });

  it("refuses a LONGER chain closing on itself", async () => {
    const tasks = taskRepo();
    const ids: string[] = [];
    for (let index = 0; index < 8; index += 1) {
      ids.push(await seedTask(`Step ${index}`));
    }
    for (let index = 0; index < ids.length - 1; index += 1) {
      await tasks.addTaskDependency(ids[index + 1]!, ids[index]!);
    }
    await expect(
      tasks.addTaskDependency(ids[0]!, ids[ids.length - 1]!),
    ).rejects.toBeInstanceOf(TaskDependencyCycleError);
    expect(await edgeRows()).toHaveLength(ids.length - 1);
  });

  it("ACCEPTS a diamond, which is not a cycle", async () => {
    /*
     *      A
     *     / \        A blocks B and C; both block D. Every path runs one way, so
     *    B   C       there is no cycle and every edge is legitimate.
     *     \ /
     *      D
     */
    const tasks = taskRepo();
    const a = await seedTask("A");
    const b = await seedTask("B");
    const c = await seedTask("C");
    const d = await seedTask("D");
    await tasks.addTaskDependency(b, a);
    await tasks.addTaskDependency(c, a);
    await tasks.addTaskDependency(d, b);
    await tasks.addTaskDependency(d, c);
    expect(await edgeRows()).toHaveLength(4);
    expect(
      (await tasks.listTaskDependencies(d)).blockedBy.map((x) => x.title),
    ).toEqual(["B", "C"]);
  });

  it("holds under CONCURRENT cycle-forming edges", async () => {
    /*
     * Two requests arriving together, each of which is legal on its own and which
     * together would close a two-node cycle. Because the walk is a predicate
     * INSIDE the write, the loser re-evaluates it against the winner's committed
     * row and is refused.
     */
    const tasks = taskRepo();
    const a = await seedTask("A");
    const b = await seedTask("B");
    const results = await Promise.allSettled([
      tasks.addTaskDependency(b, a),
      taskRepo().addTaskDependency(a, b),
    ]);
    const rows = await edgeRows();
    expect(rows.filter((row) => row.deleted_at === null)).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Bounds                                                                     */
/* -------------------------------------------------------------------------- */

describe("bounds", () => {
  it("refuses the blocker past the limit, and says why", async () => {
    const tasks = taskRepo();
    const target = await seedTask("Target");
    for (let index = 0; index < MAX_TASK_BLOCKERS; index += 1) {
      await tasks.addTaskDependency(target, await seedTask(`Blocker ${index}`));
    }
    const extra = await seedTask("One too many");
    await expect(tasks.addTaskDependency(target, extra)).rejects.toBeInstanceOf(
      TaskDependencyLimitError,
    );
    expect((await tasks.listTaskDependencies(target)).blockedBy).toHaveLength(
      MAX_TASK_BLOCKERS,
    );
  });

  it("refuses the Task past the BLOCKS limit too", async () => {
    const tasks = taskRepo();
    const blocker = await seedTask("Gate");
    for (let index = 0; index < MAX_TASK_BLOCKS; index += 1) {
      await tasks.addTaskDependency(await seedTask(`Held ${index}`), blocker);
    }
    const extra = await seedTask("One too many");
    await expect(
      tasks.addTaskDependency(extra, blocker),
    ).rejects.toBeInstanceOf(TaskDependencyLimitError);
  });

  it("holds the blocker bound under a CONCURRENT race at the boundary", async () => {
    const tasks = taskRepo();
    const target = await seedTask("Target");
    for (let index = 0; index < MAX_TASK_BLOCKERS - 1; index += 1) {
      await tasks.addTaskDependency(target, await seedTask(`Blocker ${index}`));
    }
    // Two requests, one free slot. The count is evaluated inside each write, so
    // exactly one can commit.
    const first = await seedTask("Racer one");
    const second = await seedTask("Racer two");
    const results = await Promise.allSettled([
      taskRepo().addTaskDependency(target, first),
      taskRepo().addTaskDependency(target, second),
    ]);
    expect((await tasks.listTaskDependencies(target)).blockedBy).toHaveLength(
      MAX_TASK_BLOCKERS,
    );
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });

  it("does NOT count the edge being restored against the bound", async () => {
    const tasks = taskRepo();
    const target = await seedTask("Target");
    const blockers: string[] = [];
    for (let index = 0; index < MAX_TASK_BLOCKERS; index += 1) {
      const blocker = await seedTask(`Blocker ${index}`);
      blockers.push(blocker);
      await tasks.addTaskDependency(target, blocker);
    }
    // Remove one and add it back: at the bound, but the edge being restored is
    // excluded from its own count, so this is not a twenty-first.
    await tasks.removeTaskDependency(target, blockers[0]!);
    await expect(
      tasks.addTaskDependency(target, blockers[0]!),
    ).resolves.toEqual({ changed: true });
  });
});

/* -------------------------------------------------------------------------- */
/* Isolation and endpoint kinds                                               */
/* -------------------------------------------------------------------------- */

describe("workspace isolation and endpoint kinds", () => {
  it("refuses a blocker in ANOTHER workspace, indistinguishably from a missing one", async () => {
    const tasks = taskRepo();
    const mine = await seedTask("Mine");
    const theirs = await seedTask("Theirs", OTHER);
    await expect(tasks.addTaskDependency(mine, theirs)).rejects.toBeInstanceOf(
      TaskNotFoundError,
    );
    await expect(
      tasks.addTaskDependency(mine, "ent_does_not_exist"),
    ).rejects.toBeInstanceOf(TaskNotFoundError);
    expect(await edgeRows()).toHaveLength(0);
  });

  it("refuses a NON-Task endpoint", async () => {
    const tasks = taskRepo();
    const task = await seedTask("Task");
    // An Area exists in this workspace; it is not a Task, so it cannot block one.
    await env.DB.prepare(
      `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at)
       VALUES ('area_not_a_task', ?, 'area', 'Home', '2026-08-19T00:00:00.000Z',
               '2026-08-19T00:00:00.000Z')`,
    )
      .bind(WS)
      .run();
    await expect(
      tasks.addTaskDependency(task, "area_not_a_task"),
    ).rejects.toBeInstanceOf(TaskNotFoundError);
    expect(await edgeRows()).toHaveLength(0);
  });

  it("does not disclose another workspace's dependencies", async () => {
    const other = taskRepo(OTHER);
    const a = await seedTask("A", OTHER);
    const b = await seedTask("B", OTHER);
    await other.addTaskDependency(b, a);
    // Read from THIS workspace: nothing, and no error that would confirm it exists.
    expect(await taskRepo().listTaskDependencies(b)).toEqual({
      blockedBy: [],
      blocks: [],
    });
    expect((await taskRepo().listBlockedSummaries([b])).size).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Query bounds                                                               */
/* -------------------------------------------------------------------------- */

describe("query bounds", () => {
  it("reads a whole page's blocked state in ONE statement per chunk", async () => {
    const tasks = taskRepo();
    const ids: string[] = [];
    for (let index = 0; index < 30; index += 1) {
      ids.push(await seedTask(`Task ${index}`));
    }
    const blocker = await seedTask("Gate");
    for (let index = 0; index < 5; index += 1) {
      await tasks.addTaskDependency(ids[index]!, blocker);
    }

    const counter = countingDb(env.DB);
    const bounded = createTaskRepository(counter.db, makeContext(WS), {
      clock: new FakeClock().now,
      idGenerator: nextEntityId,
      activityIdGenerator: nextActivityId,
    });
    counter.reset();
    const summaries = await bounded.listBlockedSummaries(ids);
    // Thirty Tasks, one chunk, ONE statement — not thirty.
    expect(counter.prepareCount()).toBe(1);
    expect(summaries.size).toBe(5);
  });

  it("reads BOTH directions of one Task's dependencies in ONE statement", async () => {
    const tasks = taskRepo();
    const middle = await seedTask("Middle");
    for (let index = 0; index < 4; index += 1) {
      await tasks.addTaskDependency(middle, await seedTask(`Before ${index}`));
      await tasks.addTaskDependency(await seedTask(`After ${index}`), middle);
    }
    const counter = countingDb(env.DB);
    const bounded = createTaskRepository(counter.db, makeContext(WS), {
      clock: new FakeClock().now,
      idGenerator: nextEntityId,
      activityIdGenerator: nextActivityId,
    });
    counter.reset();
    const dependencies = await bounded.listTaskDependencies(middle);
    expect(counter.prepareCount()).toBe(1);
    expect(dependencies.blockedBy).toHaveLength(4);
    expect(dependencies.blocks).toHaveLength(4);
  });
});

/* -------------------------------------------------------------------------- */
/* Dependencies never move dates                                              */
/* -------------------------------------------------------------------------- */

describe("a dependency blocks execution, never the plan", () => {
  it("changes no date, priority, status or completion on either Task", async () => {
    const tasks = taskRepo();
    const blocker = await tasks.createTask({
      title: "Prepare draft",
      parent: null,
      dueDate: "2026-09-30",
      scheduledDate: "2026-09-28",
      priority: "p1",
    });
    const blocked = await tasks.createTask({
      title: "Publish report",
      parent: null,
      dueDate: "2026-09-15",
      scheduledDate: "2026-09-14",
      priority: "p3",
    });

    await tasks.addTaskDependency(blocked.id, blocker.id);

    const afterBlocked = await tasks.getTask(blocked.id);
    const afterBlocker = await tasks.getTask(blocker.id);
    // The blocked Task's deadline is BEFORE its blocker's, which is exactly the
    // situation a "helpful" scheduler would silently repair. DalyHub does not.
    expect(afterBlocked?.dueDate).toBe("2026-09-15");
    expect(afterBlocked?.scheduledDate).toBe("2026-09-14");
    expect(afterBlocked?.priority).toBe("p3");
    expect(afterBlocked?.status).toBe("todo");
    expect(afterBlocked?.completedAt).toBeNull();
    expect(afterBlocker?.dueDate).toBe("2026-09-30");
    expect(afterBlocker?.scheduledDate).toBe("2026-09-28");
  });

  it("does not stop a blocked Task being completed", async () => {
    /*
     * Blocked describes what SHOULD happen first, not what the owner is permitted
     * to do. DalyHub proposes; the owner disposes.
     */
    const tasks = taskRepo();
    const target = await seedTask("Publish report");
    const blocker = await seedTask("Get director approval");
    await tasks.addTaskDependency(target, blocker);
    const result = await tasks.completeTask(target, {
      ownerTodayIso: "2026-08-19",
    });
    expect(result.changed).toBe(true);
  });
});
