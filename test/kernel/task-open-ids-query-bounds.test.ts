/**
 * DEBT-59 — "which of these Tasks are open?" is ONE read, and it has no cap.
 *
 * The Asset record loads up to 50 obligations and resolved each linked Task's
 * OPEN state with its own `getTask`, capped at 50 lookups per load. Two things
 * were wrong with that, and only the second is visible to an owner:
 *
 *   - it is N reads for N obligations, the shape AGENTS.md §16 exists to
 *     prevent, held below the surface only by the page's own bound;
 *   - past the cap, a Task that WAS open read as "not open", so the record
 *     showed its "record what actually happened" prompt for a commitment that
 *     was still live. The failure was conservative in direction and still a
 *     false statement about the owner's own data.
 *
 * `listOpenTaskIds` is the kernel's ONE definition of an open Task — the same
 * predicate the Assets attention query already expresses in SQL — asked once
 * for a whole list. These assert both halves: the count does not grow with the
 * list, and the ANSWER is right past the old cap.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { createTaskRepository } from "~/platform/storage/d1";

import {
  FakeClock,
  countingDb,
  makeContext,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "ws_open_task_ids";
const OTHER = "ws_open_task_ids_other";

const nextEntityId = sequentialIds("oti_ent");
const nextActivityId = sequentialIds("oti_act");

function tasks(ws: string, db: D1Database = env.DB) {
  return createTaskRepository(db, makeContext(ws), {
    clock: new FakeClock("2026-08-25T00:00:00.000Z").now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

async function seedTasks(ws: string, count: number): Promise<string[]> {
  const repo = makeTaskRepository(makeContext(ws), {
    clock: new FakeClock("2026-08-25T00:00:00.000Z").now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const task = await repo.createTask({
      title: `Obligation task ${index}`,
      parent: null,
    });
    ids.push(task.id);
  }
  return ids;
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("DEBT-59 — the open-state of many Tasks is a bounded read", () => {
  it("costs the same number of statements for 60 ids as for one", async () => {
    const ids = await seedTasks(WS, 60);
    const counting = countingDb(env.DB);
    const repo = tasks(WS, counting.db);

    counting.reset();
    await repo.listOpenTaskIds(ids.slice(0, 1));
    const one = counting.prepareCount();

    counting.reset();
    await repo.listOpenTaskIds(ids);
    const sixty = counting.prepareCount();

    /*
     * The entry, in one line. Against the previous shape sixty ids cost sixty
     * reads — and the sixtieth answered wrongly, because the cap stopped at 50.
     */
    expect(one).toBe(1);
    expect(sixty).toBe(one);
  });

  it("answers correctly PAST the old 50-lookup cap", async () => {
    /*
     * The owner-visible half. Task 55 is open; under the cap it read as closed,
     * and the Asset record asked the owner to record what happened to a
     * commitment that had not happened yet.
     */
    const ids = await seedTasks(WS, 60);
    const beyondCap = ids[55]!;
    const open = await tasks(WS).listOpenTaskIds(ids);
    expect(open.has(beyondCap)).toBe(true);
    expect(open.size).toBe(60);
  });

  it("uses the kernel's own definition of OPEN, not a second one", async () => {
    // Exists, not soft-deleted, not completed on the spine, not cancelled —
    // the same predicate `OPEN_TASK_EXISTS` expresses for the attention query.
    const [live, completed, cancelled, deleted] = await seedTasks(WS, 4);
    const repo = tasks(WS);
    await repo.completeTask(completed!);
    await repo.updateTask(cancelled!, { status: "cancelled" });
    await repo.deleteTasks([deleted!]);

    const open = await repo.listOpenTaskIds([
      live!,
      completed!,
      cancelled!,
      deleted!,
    ]);
    expect([...open]).toEqual([live!]);
  });

  it("reads an unresolvable id as NOT open rather than raising", async () => {
    // A conservative direction, deliberately: the Asset record shows the
    // obligation and asks the owner to act, rather than hiding it.
    const open = await tasks(WS).listOpenTaskIds([
      "does-not-exist",
      "",
      "also-missing",
    ]);
    expect(open.size).toBe(0);
  });

  it("never sees another workspace's Task", async () => {
    const [mine] = await seedTasks(WS, 1);
    const [theirs] = await seedTasks(OTHER, 1);
    const open = await tasks(WS).listOpenTaskIds([mine!, theirs!]);
    expect([...open]).toEqual([mine!]);
  });

  it("issues NO statement at all for an empty list", async () => {
    const counting = countingDb(env.DB);
    counting.reset();
    const open = await tasks(WS, counting.db).listOpenTaskIds([]);
    expect(open.size).toBe(0);
    expect(counting.prepareCount()).toBe(0);
  });

  it("de-duplicates, so a repeated id cannot inflate the read", async () => {
    const [only] = await seedTasks(WS, 1);
    const counting = countingDb(env.DB);
    counting.reset();
    const open = await tasks(WS, counting.db).listOpenTaskIds([
      only!,
      only!,
      only!,
    ]);
    expect([...open]).toEqual([only!]);
    expect(counting.prepareCount()).toBe(1);
  });
});
