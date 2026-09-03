import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";

import { createTaskRepository } from "~/platform/storage/d1";
import {
  loadProjectTaskParents,
  loadProjectTasksPage,
} from "~/modules/projects/project-tasks-load.server";

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
 * V2.8 CONV-01 — the Project Tasks tab's STATEMENT BUDGET, pinned before and
 * after the tab adopted the shared row.
 *
 * Adopting `TaskRow` gave the tab two facts the old Card path did not draw —
 * the parent mark and the recurrence signal — and one control it did not have
 * — the inline Project editor, which needs the workspace's bounded parent
 * candidates. The rule is that none of that may cost a read per row: the page
 * is ONE statement that already joins the parent identity and the recurrence,
 * the blocked and checklist figures are one bounded aggregate each, and the
 * parent candidates are one bounded read per record load. Measured against
 * real D1 by counting `prepare` calls on the very function the routes run.
 *
 *   before CONV-01: 3 statements per page (page · blocked · checklist)
 *   after  CONV-01: 3 per page, + 1 for the parent candidates per record load
 *
 * …and both are FLAT with the number of tasks on the page, which is the
 * property that matters: a page of thirty costs what a page of three costs.
 */

const WS = "test-default-workspace";

function ids(prefix: string) {
  return sequentialIds(prefix);
}

beforeEach(async () => {
  await resetTables([WS]);
});

async function seedProject(taskCount: number) {
  const spine = makeSpineRepository(makeContext(WS), {
    clock: new FakeClock().now,
    idGenerator: ids("e"),
    activityIdGenerator: ids("ea"),
  });
  const tasks = makeTaskRepository(makeContext(WS), {
    clock: new FakeClock().now,
    activityIdGenerator: ids("ta"),
  });
  const area = await spine.createArea({ title: "Home" });
  const project = await spine.createProject({
    title: "Kitchen fit-out",
    parent: { kind: "area", id: area.id },
  });
  const created: string[] = [];
  for (let index = 0; index < taskCount; index += 1) {
    const task = await tasks.createTask({
      title: `Step ${index + 1}`,
      parent: { kind: "project", id: project.id },
      // A scheduled date, so the first Task can carry a recurrence rule.
      scheduledDate: "2026-08-19",
    });
    created.push(task.id);
  }
  // Give the page every fact the shared row draws, so the count is measured
  // over a page that actually exercises every join: a repeat, a checklist and
  // a dependency.
  await tasks.setTaskRecurrence(created[0]!, {
    frequency: "week",
    interval: 1,
    dateKind: "scheduled",
    weekdays: null,
  } as never);
  await tasks.createChecklistItem(created[1]!, { title: "Measure twice" });
  await tasks.addTaskDependency(created[2]!, created[1]!);
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

describe("CONV-01 — the Project Tasks tab's read is bounded and flat", () => {
  it("costs three statements for a page, whatever the page holds", async () => {
    const small = await seedProject(3);
    const { repository, counting } = countedRepository();
    const page = await loadProjectTasksPage(repository, small.projectId, {
      state: "all",
    });
    expect(page.tasks).toHaveLength(3);
    const smallCount = counting.prepareCount();

    await resetTables([WS]);
    const large = await seedProject(30);
    const { repository: again, counting: countAgain } = countedRepository();
    const largePage = await loadProjectTasksPage(again, large.projectId, {
      state: "all",
    });
    expect(largePage.tasks).toHaveLength(30);

    // page · blocked · checklist — never a read per row.
    expect(smallCount).toBe(3);
    expect(countAgain.prepareCount()).toBe(smallCount);
  });

  it("carries the parent, the recurrence, the checklist figure and the blocked state on the shared shape", async () => {
    const { projectId, taskIds } = await seedProject(3);
    const { repository } = countedRepository();
    const page = await loadProjectTasksPage(repository, projectId, {
      state: "all",
    });
    const byId = new Map(page.tasks.map((task) => [task.id, task]));
    // The facts the old Card path did not carry.
    expect(byId.get(taskIds[0]!)?.recurrence?.frequency).toBe("week");
    expect(byId.get(taskIds[0]!)?.parent?.kind).toBe("project");
    expect(byId.get(taskIds[0]!)?.parent?.id).toBe(projectId);
    // …and the two the tab already drew, still from their bounded aggregates.
    expect(byId.get(taskIds[1]!)?.checklist).toEqual({
      total: 1,
      completed: 0,
    });
    expect(byId.get(taskIds[2]!)?.blocked?.blockerCount).toBe(1);
  });

  it("reads the parent candidates ONCE per record load, bounded, never per row", async () => {
    const { projectId } = await seedProject(30);
    const { repository, counting } = countedRepository();
    const [page, parents] = await Promise.all([
      loadProjectTasksPage(repository, projectId, { state: "all" }),
      loadProjectTaskParents(repository),
    ]);
    expect(page.tasks).toHaveLength(30);
    // The record's whole Tasks-tab read: 3 for the page + 1 for the candidates.
    expect(counting.prepareCount()).toBe(4);
    expect(parents.map((parent) => parent.title)).toEqual([
      "Kitchen fit-out",
      "Home",
    ]);
  });
});
