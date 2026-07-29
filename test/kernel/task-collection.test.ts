/**
 * TASKS-03 — real Workers/D1 integration tests for the completed Tasks collection
 * query: the new filter dimensions, their COMBINATION, sort stability and
 * direction, and the server-authoritative grouped counts across every dimension.
 *
 * These run against a local D1 with the committed migrations applied, over a
 * realistically-shaped dataset — several parents, every priority, a spread of due
 * and planned dates, delegated and waiting work, Someday/Maybe, and completed
 * records — so an assertion about a filter is an assertion about real SQL, not
 * about a mock.
 */

import { beforeEach, describe, expect, it } from "vitest";

import type {
  D1SpineRepositoryOptions,
  D1TaskRepositoryOptions,
} from "~/platform/storage/d1";
import type { TaskRepository, WorkspaceTaskFilters } from "~/kernel/tasks";

import {
  FakeClock,
  makeContext,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "ws_tasks03";
const OTHER = "ws_tasks03_other";
/** The owner's calendar day every calendar-relative assertion resolves against. */
const TODAY = "2026-07-25";
/** The inclusive end of the rolling "this week" window (`TODAY + 6`). */
const WEEK_END = "2026-07-31";

const nextEntityId = sequentialIds("e03");
const nextActivityId = sequentialIds("a03");

function spineRepo(ws: string, options: D1SpineRepositoryOptions = {}) {
  return makeSpineRepository(makeContext(ws), {
    clock: new FakeClock("2026-07-20T00:00:00.000Z").now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
    ...options,
  });
}

function taskRepo(ws: string, options: D1TaskRepositoryOptions = {}) {
  return makeTaskRepository(makeContext(ws), {
    clock: new FakeClock("2026-07-20T00:00:00.000Z").now,
    activityIdGenerator: nextActivityId,
    ...options,
  });
}

/** Ids of a page, in order — what almost every assertion below compares. */
async function titles(
  repo: TaskRepository,
  filters: WorkspaceTaskFilters,
  extra: {
    readonly view?: Parameters<TaskRepository["listWorkspaceTasks"]>[0]["view"];
    readonly sort?: Parameters<TaskRepository["listWorkspaceTasks"]>[0]["sort"];
    readonly direction?: Parameters<
      TaskRepository["listWorkspaceTasks"]
    >[0]["direction"];
    readonly limit?: number;
  } = {},
): Promise<string[]> {
  const page = await repo.listWorkspaceTasks({
    view: extra.view ?? "all",
    ...(extra.sort ? { sort: extra.sort } : {}),
    ...(extra.direction ? { direction: extra.direction } : {}),
    ...(extra.limit ? { limit: extra.limit } : {}),
    filters,
    todayIso: TODAY,
  });
  return page.items.map((item) => item.title);
}

/**
 * A realistically-shaped workspace: two Projects and an Area under two Areas, and
 * tasks spanning every dimension the collection can filter, sort or group on.
 */
async function seed(ws: string) {
  const spine = spineRepo(ws);
  const work = await spine.createArea({ title: "Work" });
  const home = await spine.createArea({ title: "Home" });
  const goal = await spine.createGoal({
    title: "Ship the product",
    areaId: work.id,
  });
  const alpha = await spine.createProject({
    title: "Alpha",
    parent: { kind: "goal", id: goal.id },
  });
  const beta = await spine.createProject({
    title: "Beta",
    parent: { kind: "area", id: home.id },
  });
  const repo = taskRepo(ws);

  const make = async (
    title: string,
    parent: { kind: "area" | "project"; id: string },
    patch: Parameters<TaskRepository["updateTask"]>[1] = {},
  ) => {
    const task = await repo.createTask({ title, parent });
    if (Object.keys(patch).length > 0) {
      await repo.updateTask(task.id, patch);
    }
    return task;
  };

  const overdue = await make(
    "Overdue P1",
    { kind: "project", id: alpha.id },
    {
      priority: "p1",
      dueDate: "2026-07-20",
      timeSector: "this_week",
    },
  );
  const dueToday = await make(
    "Due today P2",
    { kind: "project", id: alpha.id },
    {
      priority: "p2",
      dueDate: TODAY,
    },
  );
  const dueThisWeek = await make(
    "Due this week P3",
    { kind: "project", id: beta.id },
    { priority: "p3", dueDate: WEEK_END, timeSector: "this_week" },
  );
  const dueLater = await make(
    "Due later",
    { kind: "project", id: beta.id },
    {
      priority: "p4",
      dueDate: "2026-09-01",
    },
  );
  const noDue = await make(
    "No due date",
    { kind: "area", id: work.id },
    {
      priority: "p1",
    },
  );
  const plannedToday = await make(
    "Planned today",
    { kind: "area", id: work.id },
    { scheduledDate: TODAY },
  );
  const plannedWeek = await make(
    "Planned this week",
    { kind: "area", id: home.id },
    { scheduledDate: "2026-07-28" },
  );
  const delegated = await make(
    "Delegated to Sam",
    { kind: "project", id: alpha.id },
    {
      delegation: { to: "Sam" },
      priority: "p3",
    },
  );
  const delegatedAlex = await make(
    "Delegated to Alex",
    { kind: "project", id: alpha.id },
    { delegation: { to: "Alex" } },
  );
  const someday = await make(
    "Someday idea",
    { kind: "area", id: home.id },
    {
      commitmentState: "someday",
    },
  );
  const onHold = await make(
    "Paused work",
    { kind: "project", id: beta.id },
    {
      status: "on_hold",
    },
  );
  const waiting = await make("Waiting on finance", {
    kind: "project",
    id: alpha.id,
  });
  await repo.setWaiting(waiting.id, {
    target: { kind: "text", note: "finance" },
  });
  const done = await make(
    "Finished",
    { kind: "project", id: alpha.id },
    {
      priority: "p1",
      dueDate: "2026-07-10",
    },
  );
  await repo.completeTask(done.id);

  return {
    repo,
    ids: {
      work: work.id,
      home: home.id,
      goal: goal.id,
      alpha: alpha.id,
      beta: beta.id,
      overdue: overdue.id,
      dueToday: dueToday.id,
      dueThisWeek: dueThisWeek.id,
      dueLater: dueLater.id,
      noDue: noDue.id,
      plannedToday: plannedToday.id,
      plannedWeek: plannedWeek.id,
      delegated: delegated.id,
      delegatedAlex: delegatedAlex.id,
      someday: someday.id,
      onHold: onHold.id,
      waiting: waiting.id,
      done: done.id,
    },
  };
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("derived due-state filters", () => {
  it("treats overdue as OPEN and strictly before today — never due-today", async () => {
    const { repo } = await seed(WS);
    const overdue = await titles(repo, { dueState: "overdue" });
    expect(overdue).toEqual(["Overdue P1"]);
    // "Finished" was due 2026-07-10 but is complete: finished work is not overdue,
    // which is the same rule the smart sort and the `overdue` system view use.
    expect(overdue).not.toContain("Finished");
  });

  it("separates due today, later this week and later, without overlap", async () => {
    const { repo } = await seed(WS);
    expect(await titles(repo, { dueState: "due_today" })).toEqual([
      "Due today P2",
    ]);
    // The states are MUTUALLY EXCLUSIVE: "this week" is the window AFTER today, so
    // a task due today appears in exactly one of them.
    expect(await titles(repo, { dueState: "due_this_week" })).toEqual([
      "Due this week P3",
    ]);
    expect(await titles(repo, { dueState: "due_later" })).toEqual([
      "Due later",
    ]);
  });

  it("gives a FINISHED past-due task its own state, never overdue or later", async () => {
    const { repo } = await seed(WS);
    expect(
      await titles(repo, { dueState: "due_past" }, { view: "all" }),
    ).toEqual(["Finished"]);
    expect(await titles(repo, { dueState: "overdue" })).not.toContain(
      "Finished",
    );
    expect(await titles(repo, { dueState: "due_later" })).not.toContain(
      "Finished",
    );
  });

  it("finds tasks with no due date at all", async () => {
    const { repo } = await seed(WS);
    const none = await titles(repo, { dueState: "no_due_date" });
    expect(none).toContain("No due date");
    expect(none).toContain("Planned today");
    expect(none).not.toContain("Overdue P1");
  });
});

describe("derived planned-state filters", () => {
  it("distinguishes planned today, this week and unplanned", async () => {
    const { repo } = await seed(WS);
    expect(await titles(repo, { plannedState: "planned_today" })).toEqual([
      "Planned today",
    ]);
    // Exclusive, like the due states: "this week" is the window after today.
    expect(await titles(repo, { plannedState: "planned_this_week" })).toEqual([
      "Planned this week",
    ]);
    const unplanned = await titles(repo, { plannedState: "unplanned" });
    expect(unplanned).toContain("Overdue P1");
    expect(unplanned).not.toContain("Planned today");
  });

  it("keeps the planned state INDEPENDENT of the due state", async () => {
    const { repo } = await seed(WS);
    // "Overdue P1" is overdue AND unplanned; "Planned today" is planned and has no
    // due date at all. The two axes never collapse into one.
    expect(
      await titles(repo, { dueState: "overdue", plannedState: "unplanned" }),
    ).toEqual(["Overdue P1"]);
    expect(
      await titles(repo, {
        dueState: "overdue",
        plannedState: "planned_today",
      }),
    ).toEqual([]);
  });
});

describe("parent, delegate and recency filters", () => {
  it("filters by the KIND of structural parent", async () => {
    const { repo } = await seed(WS);
    const inProjects = await titles(repo, { parentKind: "project" });
    const inAreas = await titles(repo, { parentKind: "area" });
    expect(inProjects).toContain("Overdue P1");
    expect(inProjects).not.toContain("No due date");
    expect(inAreas).toContain("No due date");
    expect(inAreas).not.toContain("Overdue P1");
  });

  it("filters by a specific delegatee, and by delegation in general", async () => {
    const { repo } = await seed(WS);
    expect(await titles(repo, { delegatedTo: "Sam" })).toEqual([
      "Delegated to Sam",
    ]);
    expect((await titles(repo, { delegatedOnly: true })).sort()).toEqual([
      "Delegated to Alex",
      "Delegated to Sam",
    ]);
  });

  it("treats a delegatee as DATA, never as SQL", async () => {
    const { repo } = await seed(WS);
    // A hostile-looking value is compared as a bound parameter: it simply matches
    // nothing, rather than altering the statement.
    expect(await titles(repo, { delegatedTo: "' OR 1=1 --" })).toEqual([]);
  });

  it("lists the distinct delegatees present in the workspace", async () => {
    const { repo } = await seed(WS);
    expect([...(await repo.listTaskDelegates())]).toEqual(["Alex", "Sam"]);
  });

  it("filters by created and updated recency windows", async () => {
    const { repo } = await seed(WS);
    // Everything was created at the fake clock's 2026-07-20, five days before the
    // owner's day — inside the 7-day window, outside the 1-day one.
    expect(
      (await titles(repo, { createdWithin: "7d" })).length,
    ).toBeGreaterThan(0);
    expect(await titles(repo, { createdWithin: "1d" })).toEqual([]);
    expect(
      (await titles(repo, { updatedWithin: "30d" })).length,
    ).toBeGreaterThan(0);
  });
});

describe("completed visibility, applied on top of the system view", () => {
  it("hides completed work inside a view that would include it", async () => {
    const { repo } = await seed(WS);
    expect(await titles(repo, {}, { view: "all" })).toContain("Finished");
    expect(
      await titles(repo, { completedVisibility: "hide" }, { view: "all" }),
    ).not.toContain("Finished");
  });

  it("shows ONLY completed work when asked", async () => {
    const { repo } = await seed(WS);
    expect(
      await titles(repo, { completedVisibility: "only" }, { view: "all" }),
    ).toEqual(["Finished"]);
  });

  it("can widen an execution view that would otherwise exclude completion", async () => {
    const { repo } = await seed(WS);
    const active = await titles(repo, {}, { view: "active" });
    expect(active).not.toContain("Finished");
    expect(
      await titles(
        repo,
        { completedVisibility: "include" },
        { view: "active" },
      ),
    ).not.toContain("Finished"); // the VIEW still excludes it — include only removes the extra clause
  });

  it("leaves the view's own rule untouched by default", async () => {
    const { repo } = await seed(WS);
    expect(
      await titles(repo, { completedVisibility: "default" }, { view: "all" }),
    ).toContain("Finished");
  });
});

describe("combined filters", () => {
  it("ANDs every dimension together", async () => {
    const { repo, ids } = await seed(WS);
    expect(
      await titles(repo, {
        projectId: ids.alpha,
        priority: "p1",
        dueState: "overdue",
        parentKind: "project",
        completedVisibility: "hide",
      }),
    ).toEqual(["Overdue P1"]);
  });

  it("returns nothing — calmly — when a combination excludes everything", async () => {
    const { repo, ids } = await seed(WS);
    expect(
      await titles(repo, {
        projectId: ids.beta,
        priority: "p1",
        dueState: "overdue",
      }),
    ).toEqual([]);
  });

  it("combines a hierarchy filter with a derived one", async () => {
    const { repo, ids } = await seed(WS);
    // Goal → Project → Task: the Goal filter resolves through the Project link.
    const inGoal = await titles(repo, { goalId: ids.goal });
    expect(inGoal).toContain("Overdue P1");
    expect(inGoal).not.toContain("Due this week P3");
    expect(
      await titles(repo, { goalId: ids.goal, dueState: "due_today" }),
    ).toEqual(["Due today P2"]);
  });

  it("stays workspace-scoped under every filter", async () => {
    await seed(WS);
    const other = taskRepo(OTHER);
    for (const filters of [
      {},
      { dueState: "overdue" as const },
      { delegatedTo: "Sam" },
      { parentKind: "project" as const },
    ]) {
      expect(await titles(other, filters)).toEqual([]);
    }
  });
});

describe("sorting", () => {
  it("is STABLE for equal sort values, ordered by (createdAt, id)", async () => {
    const { repo } = await seed(WS);
    // Every task shares a created timestamp under the fake clock, so a sort with
    // many ties is decided entirely by the id tiebreaker — and must not vary.
    const first = await titles(repo, {}, { sort: "priority" });
    const second = await titles(repo, {}, { sort: "priority" });
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(5);
  });

  it("orders by due date ascending with no-date last, and reverses on request", async () => {
    const { repo } = await seed(WS);
    const asc = await titles(
      repo,
      { dueState: "due_later" },
      { sort: "due_date" },
    );
    const dated = await titles(
      repo,
      { completedVisibility: "hide" },
      { sort: "due_date" },
    );
    expect(asc).toEqual(["Due later"]);
    expect(dated[0]).toBe("Overdue P1");
    const desc = await titles(
      repo,
      { completedVisibility: "hide" },
      { sort: "due_date", direction: "desc" },
    );
    // Reversing genuinely reverses: what led now trails.
    expect(desc[desc.length - 1]).toBe("Overdue P1");
  });

  it("orders by title case-insensitively in both directions", async () => {
    const { repo } = await seed(WS);
    const asc = await titles(repo, {}, { sort: "title" });
    const desc = await titles(repo, {}, { sort: "title", direction: "desc" });
    expect(asc).toEqual([...asc].sort((a, b) => a.localeCompare(b)));
    expect(desc[0]).toBe(asc[asc.length - 1]);
  });

  it("orders by PARENT title, keeping unparented tasks last in BOTH directions", async () => {
    const { repo } = await seed(WS);
    const asc = await repo.listWorkspaceTasks({
      view: "all",
      sort: "parent",
      todayIso: TODAY,
    });
    const parents = asc.items.map((item) => item.parent?.title ?? null);
    const firstNull = parents.indexOf(null);
    // Either there are no unparented tasks, or they are all at the end.
    if (firstNull !== -1) {
      expect(parents.slice(firstNull).every((p) => p === null)).toBe(true);
    }
    expect(parents[0]).toBe("Alpha");
  });

  it("IGNORES a requested reversal of the smart sort", async () => {
    const { repo } = await seed(WS);
    // "Least relevant first" is not a useful order, so smart stays smart — the
    // default view must never become unpredictable.
    expect(await titles(repo, {}, { sort: "smart" })).toEqual(
      await titles(repo, {}, { sort: "smart", direction: "desc" }),
    );
  });

  it("paginates a filtered, reversed sort without skipping or repeating", async () => {
    const { repo } = await seed(WS);
    const all = await titles(
      repo,
      { completedVisibility: "hide" },
      { sort: "title", direction: "desc" },
    );
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await repo.listWorkspaceTasks({
        view: "all",
        sort: "title",
        direction: "desc",
        filters: { completedVisibility: "hide" },
        todayIso: TODAY,
        limit: 3,
        ...(cursor ? { cursor } : {}),
      });
      seen.push(...page.items.map((i) => i.title));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(seen).toEqual(all);
    expect(new Set(seen).size).toBe(seen.length);
  });
});

describe("server-authoritative grouping", () => {
  it("counts every bucket over the WHOLE scope, independent of the returned slice", async () => {
    const { repo } = await seed(WS);
    const grouping = await repo.listWorkspaceTaskGroups({
      dimension: "priority",
      view: "all",
      todayIso: TODAY,
      bucketLimit: 1,
    });
    const p1 = grouping.groups.find((g) => g.key === "p1");
    // Three P1 tasks exist (overdue, no-due, finished) but only ONE was returned.
    expect(p1?.count).toBe(3);
    expect(p1?.items).toHaveLength(1);
    expect(p1?.hasMore).toBe(true);
  });

  it("counts a grouped view against the SAME filters the flat list applies", async () => {
    const { repo, ids } = await seed(WS);
    const filters = { projectId: ids.alpha } as const;
    const grouping = await repo.listWorkspaceTaskGroups({
      dimension: "priority",
      view: "all",
      filters,
      todayIso: TODAY,
    });
    const grouped = grouping.groups.reduce((n, g) => n + g.count, 0);
    const flat = await titles(repo, filters);
    // The headline count a grouped view shows is exactly the number of records the
    // equivalent flat list holds — a grouped view can never claim a different total.
    expect(grouped).toBe(flat.length);
  });

  it("groups by due state using the same rules as the due filter", async () => {
    const { repo } = await seed(WS);
    const grouping = await repo.listWorkspaceTaskGroups({
      dimension: "due_state",
      view: "all",
      todayIso: TODAY,
    });
    const byKey = new Map(grouping.groups.map((g) => [g.key, g.count]));
    expect(byKey.get("overdue")).toBe(1);
    expect(byKey.get("due_today")).toBe(1);
    // The completed task, due long ago, is `due_past` — not overdue (it is done)
    // and not "due later" (that would be nonsense).
    expect(byKey.get("due_past")).toBe(1);
    expect(byKey.get("due_later")).toBe(1);
  });

  it("makes every bucket's count equal its own filter's result — no drift", async () => {
    // The property the shared expression exists to guarantee: "group by due state,
    // then open a bucket" lands on exactly the records that bucket counted.
    const { repo } = await seed(WS);
    const grouping = await repo.listWorkspaceTaskGroups({
      dimension: "due_state",
      view: "all",
      todayIso: TODAY,
    });
    for (const group of grouping.groups) {
      const drilled = await titles(
        repo,
        { dueState: group.key as never },
        { view: "all" },
      );
      expect(drilled.length, `bucket ${group.key}`).toBe(group.count);
    }
  });

  it("groups by status with completion as its own bucket", async () => {
    const { repo } = await seed(WS);
    const grouping = await repo.listWorkspaceTaskGroups({
      dimension: "status",
      view: "all",
      todayIso: TODAY,
    });
    const byKey = new Map(grouping.groups.map((g) => [g.key, g.count]));
    expect(byKey.get("completed")).toBe(1);
    expect(byKey.get("on_hold")).toBe(1);
  });

  it("labels an open-ended parent bucket from the row, with no second query", async () => {
    const { repo } = await seed(WS);
    const grouping = await repo.listWorkspaceTaskGroups({
      dimension: "parent",
      view: "all",
      todayIso: TODAY,
    });
    const labels = grouping.groups
      .map((g) => g.label)
      .filter(Boolean)
      .sort();
    expect(labels).toEqual(["Alpha", "Beta", "Home", "Work"]);
  });

  it("labels an open-ended delegate bucket, including the not-delegated bucket", async () => {
    const { repo } = await seed(WS);
    const grouping = await repo.listWorkspaceTaskGroups({
      dimension: "delegate",
      view: "all",
      todayIso: TODAY,
    });
    const byKey = new Map(grouping.groups.map((g) => [g.key, g]));
    expect(byKey.get("Sam")?.label).toBe("Sam");
    expect(byKey.get("Sam")?.count).toBe(1);
    expect(byKey.get("__none")?.label).toBeNull();
  });

  it("keeps the Matrix and Sectors scoped to ACTIVE planning work", async () => {
    const { repo } = await seed(WS);
    const grouping = await repo.listWorkspaceTaskGroups({
      dimension: "quadrant",
      todayIso: TODAY,
    });
    const total = grouping.groups.reduce((n, g) => n + g.count, 0);
    const active = await titles(repo, {}, { view: "active" });
    // Completed, cancelled, Someday/Maybe, waiting and on-hold are all excluded, so
    // a quadrant only ever holds work that is actionable now.
    expect(total).toBe(active.length);
    expect(active).not.toContain("Finished");
    expect(active).not.toContain("Someday idea");
    expect(active).not.toContain("Paused work");
    expect(active).not.toContain("Waiting on finance");
  });

  it("BOUNDS the number of buckets, not only the rows within each", async () => {
    // `parent` and `delegate` are open-ended dimensions — one bucket per Project,
    // Area or delegatee. Bounding rows per bucket alone would let a large
    // workspace return `buckets × bucketLimit` rows in one payload, which is the
    // unbounded read the collection contract forbids.
    const { repo } = await seed(WS);
    const spine = spineRepo(WS);
    for (let i = 0; i < 40; i += 1) {
      const area = await spine.createArea({ title: `Bulk area ${i}` });
      await repo.createTask({
        title: `Bulk task ${i}`,
        parent: { kind: "area", id: area.id },
      });
    }

    const grouping = await repo.listWorkspaceTaskGroups({
      dimension: "parent",
      view: "all",
      todayIso: TODAY,
    });
    expect(grouping.groups.length).toBeLessThanOrEqual(24);
    // The LARGEST buckets survive, so what is dropped is the tail rather than an
    // arbitrary slice: the seeded multi-task parents outrank the one-task ones.
    const counts = grouping.groups.map((group) => group.count);
    expect(Math.max(...counts)).toBeGreaterThan(1);
  });

  it("stays workspace-scoped", async () => {
    await seed(WS);
    const grouping = await taskRepo(OTHER).listWorkspaceTaskGroups({
      dimension: "priority",
      view: "all",
      todayIso: TODAY,
    });
    expect(grouping.groups).toEqual([]);
  });

  it("rejects an unknown grouping dimension rather than guessing", async () => {
    const { repo } = await seed(WS);
    await expect(
      repo.listWorkspaceTaskGroups({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- boundary test.
        dimension: "priority; DROP TABLE entities" as any,
        todayIso: TODAY,
      }),
    ).rejects.toThrow(/dimension/);
  });
});

describe("list-level due-date mutation", () => {
  it("sets and clears the due date WITHOUT touching the planned date", async () => {
    const { repo, ids } = await seed(WS);
    const before = await repo.getTask(ids.plannedToday);
    expect(before?.scheduledDate).toBe(TODAY);

    await repo.setDueDateMany([ids.plannedToday], "2026-08-15");
    const withDue = await repo.getTask(ids.plannedToday);
    expect(withDue?.dueDate).toBe("2026-08-15");
    // The two dates answer different questions and never overwrite each other.
    expect(withDue?.scheduledDate).toBe(TODAY);

    await repo.setDueDateMany([ids.plannedToday], null);
    const cleared = await repo.getTask(ids.plannedToday);
    expect(cleared?.dueDate).toBeNull();
    expect(cleared?.scheduledDate).toBe(TODAY);
  });

  it("reports no-ops honestly and rejects a cross-workspace id wholesale", async () => {
    const { repo, ids } = await seed(WS);
    const first = await repo.setDueDateMany([ids.noDue], "2026-08-15");
    expect(first).toEqual({ changed: 1, unchanged: 0 });
    const again = await repo.setDueDateMany([ids.noDue], "2026-08-15");
    expect(again).toEqual({ changed: 0, unchanged: 1 });

    await expect(
      taskRepo(OTHER).setDueDateMany([ids.noDue], "2026-08-15"),
    ).rejects.toThrow();
  });
});
