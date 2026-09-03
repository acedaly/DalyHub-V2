import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";

import { createTaskRepository } from "~/platform/storage/d1";
import { loadTaskParentOptions } from "~/shared/task-record/task-parent-options.server";

import {
  FakeClock,
  countingDb,
  makeContext,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

/**
 * V2.8 CONV-02 — `/today/waiting`'s STATEMENT BUDGET, pinned before and after
 * the surface adopted the shared row.
 *
 * Adopting `TaskRow` gave the Waiting list every fact the old Card path did
 * not draw — the recurrence signal, the time sector, the delegation group, the
 * parent identity — and one control it did not have: the inline Project
 * editor, which needs the workspace's bounded parent candidates. The rule is
 * that none of that may cost a read per row: the page is ONE statement that
 * already joined every column the shared item carries (the old private
 * mapper simply dropped them), and the parent candidates are ONE bounded read
 * per SURFACE load — never per row, never per "Load more" page. Measured
 * against real D1 by counting `prepare` calls on the very reads the route runs.
 *
 *   before CONV-02: 1 statement per page
 *   after  CONV-02: 1 per page, + 1 for the parent candidates on a surface load
 *
 * …and both are FLAT with the number of waiting Tasks, which is the property
 * that matters: a page of thirty costs what a page of three costs. RECALL-03's
 * own proofs (`recall-03-commitments-due.test.ts`) pin the count statement
 * and the filter's binds; nothing here changes them.
 */

const WS = "test-default-workspace";
const TODAY = "2026-08-31";

function ids(prefix: string) {
  return sequentialIds(prefix);
}

beforeEach(async () => {
  await resetTables([WS]);
});

async function seedWaiting(taskCount: number) {
  const spine = makeSpineRepository(makeContext(WS), {
    clock: new FakeClock().now,
    idGenerator: ids("e"),
    activityIdGenerator: ids("ea"),
  });
  const clock = new FakeClock("2026-08-01T00:00:00.000Z");
  const tasks = makeTaskRepository(makeContext(WS), {
    clock: clock.now,
    activityIdGenerator: ids("ta"),
  });
  const area = await spine.createArea({ title: "Ops" });
  const project = await spine.createProject({
    title: "Kitchen fit-out",
    parent: { kind: "area", id: area.id },
  });
  const created: string[] = [];
  for (let index = 0; index < taskCount; index += 1) {
    const task = await tasks.createTask({
      title: `Chase ${index + 1}`,
      parent: { kind: "project", id: project.id },
      scheduledDate: "2026-08-19",
    });
    await tasks.updateTask(task.id, {
      delegation: { to: "Sam", delegatedOn: "2026-08-01", followUpOn: TODAY },
    });
    await tasks.setWaiting(task.id, {
      target: { kind: "text", note: `with Sam ${index + 1}` },
    });
    created.push(task.id);
    clock.advance(60_000);
  }
  // Give the page every fact the shared row draws, so the count is measured
  // over a page that actually exercises every join: a repeating occurrence
  // beside the delegation group and the parent identity.
  await tasks.setTaskRecurrence(created[0]!, {
    frequency: "week",
    interval: 1,
    dateKind: "scheduled",
    weekdays: null,
  } as never);
  return { projectId: project.id, taskIds: created };
}

function countedRepository() {
  const counting = countingDb(env.DB);
  const repository = createTaskRepository(counting.db, makeContext(WS), {
    clock: new FakeClock().now,
    activityIdGenerator: ids("ca"),
  });
  return { repository, counting };
}

describe("CONV-02 — the Waiting surface's read is bounded and flat", () => {
  it("costs ONE statement for a page, whatever the page holds", async () => {
    await seedWaiting(3);
    const { repository, counting } = countedRepository();
    const small = await repository.listWaitingTasks({
      limit: 50,
      todayIso: TODAY,
    });
    expect(small.items).toHaveLength(3);
    const smallCount = counting.prepareCount();

    await resetTables([WS]);
    await seedWaiting(30);
    const { repository: again, counting: countAgain } = countedRepository();
    const large = await again.listWaitingTasks({ limit: 50, todayIso: TODAY });
    expect(large.items).toHaveLength(30);

    // The page — never a read per row for a parent, a Project, a Person, a
    // recurrence rule or a delegation group.
    expect(smallCount).toBe(1);
    expect(countAgain.prepareCount()).toBe(smallCount);
  });

  it("carries every fact the shared row draws on the shared shape, from that one statement", async () => {
    const { projectId, taskIds } = await seedWaiting(3);
    const { repository, counting } = countedRepository();
    const page = await repository.listWaitingTasks({
      limit: 50,
      todayIso: TODAY,
    });
    expect(counting.prepareCount()).toBe(1);
    const byId = new Map(page.items.map((item) => [item.id, item]));
    const first = byId.get(taskIds[0]!)!;
    // The facts the old Waiting-private item dropped.
    expect(first.recurrence?.frequency).toBe("week");
    expect(first.parent?.kind).toBe("project");
    expect(first.parent?.id).toBe(projectId);
    expect(first.delegation?.to).toBe("Sam");
    expect(first.completedAt).toBeNull();
    expect(first.timeSector).toBeNull();
    // …and the two the surface already stated, unchanged.
    expect(first.waiting.subject).toEqual({
      kind: "text",
      note: "with Sam 1",
    });
    expect(first.followUpOn).toBe(TODAY);
    expect(first.followUpOn).toBe(first.delegation?.followUpOn);
  });

  it("reads the parent candidates ONCE per surface load, bounded, never per row or per page", async () => {
    await seedWaiting(30);
    const { repository, counting } = countedRepository();
    const [page, parents] = await Promise.all([
      repository.listWaitingTasks({ limit: 20, todayIso: TODAY }),
      loadTaskParentOptions(repository),
    ]);
    expect(page.items).toHaveLength(20);
    expect(page.nextCursor).not.toBeNull();
    // The surface's whole first load: 1 for the page + 1 for the candidates.
    expect(counting.prepareCount()).toBe(2);
    expect(parents.map((parent) => parent.title)).toEqual([
      "Kitchen fit-out",
      "Ops",
    ]);

    // A "Load more" page is the page alone.
    counting.reset();
    const next = await repository.listWaitingTasks({
      limit: 20,
      todayIso: TODAY,
      cursor: page.nextCursor!,
    });
    expect(next.items).toHaveLength(10);
    expect(counting.prepareCount()).toBe(1);
  });
});
