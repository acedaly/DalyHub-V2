/**
 * PLAN-01 / SMART-01 — real Workers/D1 integration tests for the query additions
 * the programme makes to the canonical Tasks read model:
 *
 *   - the `open` system view (still committed, not yet finished — the one scope
 *     that KEEPS the parked states, which is what a planning week needs);
 *   - the explicit `plannedFrom`/`plannedTo` and `dueFrom`/`dueTo` windows, and
 *     that the two pairs are strictly independent;
 *   - the multi-value `priorities` set;
 *   - the `recurring` filter, in both directions;
 *   - that a cursor issued under one of these filters is REJECTED under another.
 *
 * These run against a local D1 with the committed migrations applied, so an
 * assertion about a filter is an assertion about real SQL.
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

const WS = "ws_plan01";
const OTHER = "ws_plan01_other";
/** The owner's calendar day every calendar-relative assertion resolves against. */
const TODAY = "2026-08-19";
/** The planning week containing TODAY, Monday-start. */
const WEEK_START = "2026-08-17";
const WEEK_END = "2026-08-23";

const nextEntityId = sequentialIds("ep01");
const nextActivityId = sequentialIds("ap01");

function spineRepo(ws: string, options: D1SpineRepositoryOptions = {}) {
  return makeSpineRepository(makeContext(ws), {
    clock: new FakeClock("2026-08-10T00:00:00.000Z").now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
    ...options,
  });
}

function taskRepo(ws: string, options: D1TaskRepositoryOptions = {}) {
  return makeTaskRepository(makeContext(ws), {
    clock: new FakeClock("2026-08-10T00:00:00.000Z").now,
    activityIdGenerator: nextActivityId,
    ...options,
  });
}

async function titles(
  repo: TaskRepository,
  filters: WorkspaceTaskFilters,
  extra: {
    readonly view?: Parameters<TaskRepository["listWorkspaceTasks"]>[0]["view"];
    readonly sort?: Parameters<TaskRepository["listWorkspaceTasks"]>[0]["sort"];
    readonly limit?: number;
  } = {},
): Promise<string[]> {
  const page = await repo.listWorkspaceTasks({
    view: extra.view ?? "all",
    ...(extra.sort ? { sort: extra.sort } : {}),
    ...(extra.limit ? { limit: extra.limit } : {}),
    filters,
    todayIso: TODAY,
    timezone: "UTC",
  });
  return page.items.map((item) => item.title);
}

/**
 * A workspace shaped like a real planning week: work planned on specific days
 * inside it, work planned before and after it, deadlines inside and outside it,
 * every priority, one blocked Task, one paused Task, one parked Task, one
 * cancelled Task, one completed Task and one repeating Task.
 */
async function seed(ws: string) {
  const spine = spineRepo(ws);
  const area = await spine.createArea({ title: "Work" });
  const repo = taskRepo(ws);

  const make = async (
    title: string,
    patch: Parameters<TaskRepository["updateTask"]>[1] = {},
  ) => {
    const task = await repo.createTask({
      title,
      parent: { kind: "area", id: area.id },
    });
    if (Object.keys(patch).length > 0) await repo.updateTask(task.id, patch);
    return task;
  };

  const monday = await make("Planned Monday", {
    scheduledDate: WEEK_START,
    priority: "p1",
    // A deadline WELL OUTSIDE the week, on purpose: the planned/due independence
    // assertions below depend on this Task being in the planned window and out of
    // the due window at the same time.
    dueDate: "2026-10-01",
  });
  const wednesday = await make("Planned Wednesday", {
    scheduledDate: "2026-08-19",
    priority: "p2",
  });
  const sunday = await make("Planned Sunday", {
    scheduledDate: WEEK_END,
    priority: "p3",
  });
  const beforeWeek = await make("Planned before the week", {
    scheduledDate: "2026-08-14",
    priority: "p2",
  });
  const afterWeek = await make("Planned after the week", {
    scheduledDate: "2026-08-25",
    priority: "p4",
  });
  const unplanned = await make("Unplanned, due in the week", {
    dueDate: "2026-08-21",
    priority: "p1",
  });
  const untriaged = await make("Untriaged and unplanned", {});
  const blocked = await make("Blocked but planned", {
    scheduledDate: "2026-08-20",
    priority: "p3",
  });
  await repo.setWaiting(blocked.id, {
    target: { kind: "text", note: "the supplier" },
  });
  const paused = await make("Paused but planned", {
    // A DISTINCT day from the blocked task. Two tasks sharing a scheduled date
    // fall through to the query's `(created_at, id)` tiebreak, and the fake clock
    // gives them the same instant — so the order would be decided by an id
    // sequence that is not stable across runs. That is a defect in the FIXTURE,
    // not in the query, and the fix is to make the fixture unambiguous.
    scheduledDate: "2026-08-22",
    status: "on_hold",
    priority: "p3",
  });
  const parked = await make("Parked and planned", {
    scheduledDate: "2026-08-20",
    commitmentState: "someday",
  });
  const cancelled = await make("Cancelled but planned", {
    scheduledDate: "2026-08-20",
    status: "cancelled",
  });
  const finished = await make("Finished and planned", {
    scheduledDate: "2026-08-18",
  });
  await repo.completeTask(finished.id);
  const routine = await make("Repeats weekly", {
    scheduledDate: "2026-08-21",
    priority: "p3",
  });
  await repo.setTaskRecurrence(routine.id, {
    frequency: "week",
    interval: 1,
    dateKind: "scheduled",
  });

  return {
    repo,
    ids: {
      area: area.id,
      monday: monday.id,
      wednesday: wednesday.id,
      sunday: sunday.id,
      beforeWeek: beforeWeek.id,
      afterWeek: afterWeek.id,
      unplanned: unplanned.id,
      untriaged: untriaged.id,
      blocked: blocked.id,
      paused: paused.id,
      parked: parked.id,
      cancelled: cancelled.id,
      finished: finished.id,
      routine: routine.id,
    },
  };
}

beforeEach(async () => {
  // The workspace rows have to exist: every entity's workspace foreign key is
  // `ON DELETE RESTRICT`, so `resetTables` clears and re-seeds the ones it is
  // named (the same call `task-collection.test.ts` makes).
  await resetTables([WS, OTHER]);
});

describe("the `open` system view", () => {
  it("KEEPS the parked states, which is what makes it a planning scope", async () => {
    const { repo } = await seed(WS);
    const open = await titles(repo, {}, { view: "open", limit: 100 });
    // Blocked and paused work is still work the owner committed to.
    expect(open).toContain("Blocked but planned");
    expect(open).toContain("Paused but planned");
    // …and the three states that are NOT commitments are excluded.
    expect(open).not.toContain("Parked and planned");
    expect(open).not.toContain("Cancelled but planned");
    expect(open).not.toContain("Finished and planned");
  });

  it("differs from `active` in exactly the parked states", async () => {
    const { repo } = await seed(WS);
    const open = new Set(await titles(repo, {}, { view: "open", limit: 100 }));
    const active = new Set(
      await titles(repo, {}, { view: "active", limit: 100 }),
    );
    const onlyInOpen = [...open].filter((title) => !active.has(title)).sort();
    expect(onlyInOpen).toEqual(["Blocked but planned", "Paused but planned"]);
    // `active` never contains something `open` does not.
    expect([...active].filter((title) => !open.has(title))).toEqual([]);
  });
});

describe("the PLANNED date window", () => {
  it("returns exactly the work planned inside the week", async () => {
    const { repo } = await seed(WS);
    const inWeek = await titles(
      repo,
      { plannedFrom: WEEK_START, plannedTo: WEEK_END },
      { view: "open", sort: "scheduled_date", limit: 100 },
    );
    // Ordered by scheduled date. Every fixture date in the window is distinct, so
    // this asserts the ORDERING rather than a tiebreak.
    expect(inWeek).toEqual([
      "Planned Monday",
      "Planned Wednesday",
      "Blocked but planned",
      "Repeats weekly",
      "Paused but planned",
      "Planned Sunday",
    ]);
  });

  it("EXCLUDES work planned before or after the window", async () => {
    const { repo } = await seed(WS);
    const inWeek = await titles(
      repo,
      { plannedFrom: WEEK_START, plannedTo: WEEK_END },
      { view: "open", limit: 100 },
    );
    expect(inWeek).not.toContain("Planned before the week");
    expect(inWeek).not.toContain("Planned after the week");
  });

  it("never matches a task with NO planned date", async () => {
    const { repo } = await seed(WS);
    // A missing date is not inside any window. Treating it as one is how "planned
    // next week" comes to include the whole unplanned backlog.
    const inWeek = await titles(
      repo,
      { plannedFrom: WEEK_START, plannedTo: WEEK_END },
      { view: "open", limit: 100 },
    );
    expect(inWeek).not.toContain("Unplanned, due in the week");
    expect(inWeek).not.toContain("Untriaged and unplanned");
  });

  it("supports an OPEN-ENDED bound in either direction", async () => {
    const { repo } = await seed(WS);
    const before = await titles(
      repo,
      { plannedTo: "2026-08-16" },
      { view: "open", limit: 100 },
    );
    expect(before).toEqual(["Planned before the week"]);
    const after = await titles(
      repo,
      { plannedFrom: "2026-08-24" },
      { view: "open", limit: 100 },
    );
    expect(after).toEqual(["Planned after the week"]);
  });
});

describe("the DUE date window", () => {
  it("is INDEPENDENT of the planned window", async () => {
    const { repo } = await seed(WS);
    // "Planned Monday" is planned inside the week and due in October. It must be
    // in the planned window and OUT of the due window — the whole point of
    // keeping a deadline and an intention apart.
    const plannedInWeek = await titles(
      repo,
      { plannedFrom: WEEK_START, plannedTo: WEEK_END },
      { view: "open", limit: 100 },
    );
    const dueInWeek = await titles(
      repo,
      { dueFrom: WEEK_START, dueTo: WEEK_END },
      { view: "open", limit: 100 },
    );
    expect(plannedInWeek).toContain("Planned Monday");
    expect(dueInWeek).not.toContain("Planned Monday");
    expect(dueInWeek).toEqual(["Unplanned, due in the week"]);
  });

  it("COMBINES with the planned window as an AND", async () => {
    const { repo } = await seed(WS);
    const both = await titles(
      repo,
      {
        plannedFrom: WEEK_START,
        plannedTo: WEEK_END,
        dueFrom: WEEK_START,
        dueTo: WEEK_END,
      },
      { view: "open", limit: 100 },
    );
    // Nothing in the fixture is both planned inside the week and due inside it.
    expect(both).toEqual([]);
  });

  it("drops a malformed bound rather than erroring the query", async () => {
    const { repo } = await seed(WS);
    const all = await titles(repo, {}, { view: "open", limit: 100 });
    const bogus = await titles(
      repo,
      // A stored saved view or a hand-typed URL can hold anything; the documented
      // contract is that an unrecognised value degrades to "no filter".
      { plannedFrom: "yesterday", dueTo: "2026-02-31" } as WorkspaceTaskFilters,
      { view: "open", limit: 100 },
    );
    expect(bogus.sort()).toEqual(all.sort());
  });
});

describe("the PRIORITIES set", () => {
  it("returns the union of the priorities named", async () => {
    const { repo } = await seed(WS);
    const p1p2 = await titles(
      repo,
      { priorities: ["p1", "p2"] },
      { view: "open", sort: "title", limit: 100 },
    );
    // Exactly the P1 and P2 rows, and nothing else: the P3 rows (blocked, paused,
    // Sunday, the routine) and the P4/untriaged rows are all excluded. Title order
    // is the query's own, which is case-insensitive.
    expect(p1p2).toEqual([
      "Planned before the week",
      "Planned Monday",
      "Planned Wednesday",
      "Unplanned, due in the week",
    ]);
  });

  it("treats P4 as INCLUDING a stored null, matching the scalar filter", async () => {
    const { repo } = await seed(WS);
    const p4 = await titles(
      repo,
      { priorities: ["p4"] },
      { view: "open", sort: "title", limit: 100 },
    );
    // "Untriaged and unplanned" has a stored `null` priority, and the product's
    // contract is that a stored null IS Priority 4.
    expect(p4).toContain("Untriaged and unplanned");
    expect(p4).toContain("Planned after the week");
  });

  it("is a filter, not a no-op: an empty set does not narrow", async () => {
    const { repo } = await seed(WS);
    const all = await titles(repo, {}, { view: "open", limit: 100 });
    const empty = await titles(
      repo,
      { priorities: [] },
      { view: "open", limit: 100 },
    );
    expect(empty.sort()).toEqual(all.sort());
  });
});

describe("the RECURRING filter", () => {
  it("narrows to repeating tasks", async () => {
    const { repo } = await seed(WS);
    expect(
      await titles(repo, { recurring: true }, { view: "open", limit: 100 }),
    ).toEqual(["Repeats weekly"]);
  });

  it("narrows to one-off tasks in the other direction", async () => {
    const { repo } = await seed(WS);
    const oneOff = await titles(
      repo,
      { recurring: false },
      { view: "open", limit: 100 },
    );
    expect(oneOff).not.toContain("Repeats weekly");
    expect(oneOff).toContain("Planned Monday");
  });
});

describe("workspace isolation and cursor safety", () => {
  it("never returns another workspace's tasks", async () => {
    await seed(WS);
    const other = taskRepo(OTHER);
    expect(
      await titles(
        other,
        { plannedFrom: WEEK_START, plannedTo: WEEK_END },
        { view: "open", limit: 100 },
      ),
    ).toEqual([]);
  });

  it("REJECTS a cursor issued under a different date window", async () => {
    const { repo } = await seed(WS);
    const page = await repo.listWorkspaceTasks({
      view: "open",
      filters: { plannedFrom: WEEK_START, plannedTo: WEEK_END },
      sort: "scheduled_date",
      limit: 2,
      todayIso: TODAY,
      timezone: "UTC",
    });
    expect(page.nextCursor).not.toBeNull();
    await expect(
      repo.listWorkspaceTasks({
        view: "open",
        // A DIFFERENT window: page two of a query that no longer exists must be
        // refused, never reinterpreted.
        filters: { plannedFrom: "2026-08-24", plannedTo: "2026-08-30" },
        sort: "scheduled_date",
        limit: 2,
        cursor: page.nextCursor!,
        todayIso: TODAY,
        timezone: "UTC",
      }),
    ).rejects.toThrow();
  });

  it("REJECTS a cursor issued under a different priority set", async () => {
    const { repo } = await seed(WS);
    const page = await repo.listWorkspaceTasks({
      view: "open",
      filters: { priorities: ["p1", "p2"] },
      sort: "title",
      limit: 2,
      todayIso: TODAY,
      timezone: "UTC",
    });
    expect(page.nextCursor).not.toBeNull();
    await expect(
      repo.listWorkspaceTasks({
        view: "open",
        filters: { priorities: ["p1"] },
        sort: "title",
        limit: 2,
        cursor: page.nextCursor!,
        todayIso: TODAY,
        timezone: "UTC",
      }),
    ).rejects.toThrow();
  });
});
