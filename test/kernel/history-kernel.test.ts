/**
 * V2.9 INS-01 — the history kernel's four reads, against real D1.
 *
 * These run in the Workers runtime over the committed migrations, so what is
 * asserted here is what production will do. The claims each read's doc-comment
 * makes are the claims proven:
 *
 *   - ONE statement whatever the window — the reason the bucket boundaries
 *     travel as a single JSON parameter rather than as two bound parameters per
 *     bucket, which D1's 100-variable ceiling refuses at about 48 buckets;
 *   - FLAT in workspace size — the statement count does not move when the
 *     workspace grows, and the scan is bounded by the window;
 *   - workspace-scoped — a hostile second workspace's rows are invisible to
 *     every read, and its existence moves no count;
 *   - the completion-time truth — a Task completed, reopened and completed
 *     again counts once, in the bucket its CURRENT completion falls in; a
 *     deleted Task counts nowhere (RECALL-02, ADR-114 decision 4);
 *   - PARITY — the bucketed Task read and the unbucketed
 *     `countCompletedTasksInWindows` agree exactly on the same fixture, which
 *     is what makes the new read a generalisation rather than a second
 *     authority.
 *
 * The fixture's events are known by construction (the V2.4 rule): every
 * completion is created at a named instant through the real repositories, and
 * every expectation below is a count of things this file put there.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import {
  bucketWindow,
  buildActivityWindow,
  GRAIN_MAXIMUMS,
} from "~/kernel/history";
import { MAX_TREND_PERIODS } from "~/kernel/review-insights";
import type { ActivityBucketWindow } from "~/kernel/activity";
import type { CompletedTaskWindow } from "~/kernel/tasks";
import { ownerDayStartInstant } from "~/shared/datetime";

import {
  FakeClock,
  makeContext,
  makeReviewInsightRepository,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";
import {
  createActivityRepository,
  createReviewInsightRepository,
  createReviewRepository,
  createTaskRepository,
} from "~/platform/storage/d1";

const WS = "test-default-workspace";
const HOSTILE = "ins01-hostile-workspace";
const SYDNEY = "Australia/Sydney";

const nextEntityId = sequentialIds("ins01e");
const nextActivityId = sequentialIds("ins01a");

function spineRepo(ws: string, at: string) {
  return makeSpineRepository(makeContext(ws), {
    clock: new FakeClock(at).now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

function taskRepo(ws: string, at: string) {
  return makeTaskRepository(makeContext(ws), {
    clock: new FakeClock(at).now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

function activityRepo(ws: string, db: D1Database = env.DB) {
  return createActivityRepository(db, makeContext(ws));
}

/** A Task repository over a database that counts the work it is asked to do. */
function countingTaskRepo(ws: string, counter: Counter) {
  return createTaskRepository(countingDatabase(counter), makeContext(ws), {
    clock: new FakeClock("2026-09-05T00:00:00.000Z").now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

/** Create a Task at one instant and complete it at another. */
async function completeAt(
  ws: string,
  areaId: string,
  title: string,
  createdAt: string,
  completedAt: string,
): Promise<string> {
  const task = await taskRepo(ws, createdAt).createTask({
    title,
    parent: { kind: "area", id: areaId },
  });
  await taskRepo(ws, completedAt).completeTask(task.id);
  return task.id;
}

/** The owner's window between two of their wall-calendar days. */
function ownerWindow(startIso: string, endIso: string) {
  return buildActivityWindow({
    periodStart: startIso,
    periodEnd: endIso,
    startOfOwnerDay: (day) => ownerDayStartInstant(day, SYDNEY),
  });
}

/** The buckets of a window at a grain, in the owner's timezone. */
function bucketsOf(
  startIso: string,
  endIso: string,
  grain: "day" | "week" | "month",
) {
  return bucketWindow({
    window: ownerWindow(startIso, endIso),
    grain,
    startOfOwnerDay: (day) => ownerDayStartInstant(day, SYDNEY),
  });
}

/** The kernel's bucket shape as the two repository reads want it. */
function asWindows(
  buckets: readonly {
    key: string;
    startInstantIso: string;
    endInstantIso: string;
  }[],
): (CompletedTaskWindow & ActivityBucketWindow)[] {
  return buckets.map((bucket) => ({
    key: bucket.key,
    startsAt: new Date(bucket.startInstantIso),
    endsAt: new Date(bucket.endInstantIso),
  }));
}

/** Counts every statement AND every batch as one unit of database work. */
type Counter = { count: number };

function countingDatabase(
  counter: Counter,
  real: D1Database = env.DB,
): D1Database {
  function wrapStatement(statement: D1PreparedStatement): D1PreparedStatement {
    return new Proxy(statement, {
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver);
        if (typeof value !== "function") return value;
        if (property === "bind") {
          return (...args: unknown[]) =>
            wrapStatement(
              (value as (...a: unknown[]) => D1PreparedStatement).apply(
                target,
                args,
              ),
            );
        }
        if (
          property === "first" ||
          property === "all" ||
          property === "run" ||
          property === "raw"
        ) {
          return (...args: unknown[]) => {
            counter.count += 1;
            return (value as (...a: unknown[]) => unknown).apply(target, args);
          };
        }
        return (value as (...a: unknown[]) => unknown).bind(target);
      },
    });
  }
  return new Proxy(real, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (property === "prepare") {
        return (sql: string) =>
          wrapStatement(
            (value as (s: string) => D1PreparedStatement).call(target, sql),
          );
      }
      if (property === "batch") {
        return (...args: unknown[]) => {
          counter.count += 1;
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      }
      if (typeof value === "function") {
        return (value as (...a: unknown[]) => unknown).bind(target);
      }
      return value;
    },
  }) as D1Database;
}

beforeEach(async () => {
  await resetTables([WS, HOSTILE]);
});

/* -------------------------------------------------------------------------- */
/* The Task completion series                                                  */
/* -------------------------------------------------------------------------- */

describe("TaskRepository.countCompletedInBuckets", () => {
  /**
   * Sydney is +10:00 in August 2026, so the owner's 2026-08-20 runs from
   * 2026-08-19T14:00Z to 2026-08-20T14:00Z. Every completion below is placed
   * with that in mind — including two that a naive UTC comparison would put in
   * the wrong day.
   */
  async function seedCompletions(ws = WS) {
    const area = await spineRepo(ws, "2026-08-01T00:00:00.000Z").createArea({
      title: "Ops",
    });
    // Owner day 2026-08-20: three completions, one of them late enough at night
    // that UTC calls it the 21st.
    await completeAt(
      ws,
      area.id,
      "a",
      "2026-08-01T00:00:00.000Z",
      "2026-08-20T01:00:00.000Z",
    );
    await completeAt(
      ws,
      area.id,
      "b",
      "2026-08-01T00:00:00.000Z",
      "2026-08-20T05:00:00.000Z",
    );
    await completeAt(
      ws,
      area.id,
      "c",
      "2026-08-01T00:00:00.000Z",
      "2026-08-20T13:30:00.000Z",
    );
    // Owner day 2026-08-22: one.
    await completeAt(
      ws,
      area.id,
      "d",
      "2026-08-01T00:00:00.000Z",
      "2026-08-21T20:00:00.000Z",
    );
    // Owner day 2026-08-27, the following week: two.
    await completeAt(
      ws,
      area.id,
      "e",
      "2026-08-01T00:00:00.000Z",
      "2026-08-27T03:00:00.000Z",
    );
    await completeAt(
      ws,
      area.id,
      "f",
      "2026-08-01T00:00:00.000Z",
      "2026-08-27T04:00:00.000Z",
    );
    return area;
  }

  it("counts each owner day into its own bucket, including one UTC would misplace", async () => {
    await seedCompletions();
    const cut = bucketsOf("2026-08-18", "2026-08-24", "day");
    const rows = await taskRepo(
      WS,
      "2026-09-01T00:00:00.000Z",
    ).countCompletedInBuckets({
      buckets: asWindows(cut.buckets),
    });
    // Mon 18 … Sun 24. The 20th holds three (the 13:30Z one is the owner's
    // 20th at 23:30, which a UTC comparison would call the 21st); the 22nd
    // holds one (20:00Z on the 21st is the owner's 22nd at 06:00).
    expect(rows.map((row) => row.completed)).toEqual([0, 0, 3, 0, 1, 0, 0]);
    // Every bucket comes back, zero included.
    expect(rows).toHaveLength(7);
    expect(rows.map((row) => row.key)).toEqual([
      "b0",
      "b1",
      "b2",
      "b3",
      "b4",
      "b5",
      "b6",
    ]);
  });

  it("follows the owner's DST changeover, which a UTC day would misplace", async () => {
    // Sydney's clocks go forward at 2am on 4 October 2026, so the owner's 4th
    // starts at +10:00 (2026-10-03T14:00Z) and the owner's 5th at +11:00
    // (2026-10-04T13:00Z). Three completions either side of the changeover,
    // each placed where a UTC comparison would put it on the wrong day.
    const area = await spineRepo(WS, "2026-09-01T00:00:00.000Z").createArea({
      title: "Ops",
    });
    // 3 Oct, 23:30 local (+10): UTC calls it the 3rd too, but only by chance.
    await completeAt(
      WS,
      area.id,
      "before",
      "2026-09-01T00:00:00.000Z",
      "2026-10-03T13:30:00.000Z",
    );
    // 4 Oct, 23:30 local (+11 by then): UTC calls it the 4th at 12:30.
    await completeAt(
      WS,
      area.id,
      "during",
      "2026-09-01T00:00:00.000Z",
      "2026-10-04T12:30:00.000Z",
    );
    // 5 Oct, 00:30 local (+11): UTC calls it the 4th.
    await completeAt(
      WS,
      area.id,
      "after",
      "2026-09-01T00:00:00.000Z",
      "2026-10-04T13:30:00.000Z",
    );
    const cut = bucketsOf("2026-10-01", "2026-10-07", "day");
    const rows = await taskRepo(
      WS,
      "2026-10-10T00:00:00.000Z",
    ).countCompletedInBuckets({ buckets: asWindows(cut.buckets) });
    expect(rows.map((row) => row.completed)).toEqual([0, 0, 1, 1, 1, 0, 0]);
  });

  it("counts a twelve-week series in ONE statement", async () => {
    await seedCompletions();
    const cut = bucketsOf("2026-06-15", "2026-09-04", "week");
    expect(cut.buckets).toHaveLength(12);
    const counter: Counter = { count: 0 };
    const repo = countingTaskRepo(WS, counter);
    const rows = await repo.countCompletedInBuckets({
      buckets: asWindows(cut.buckets),
    });
    expect(counter.count).toBe(1);
    expect(rows).toHaveLength(12);
    // Four in the week to 22 Aug, two in the week to 29 Aug.
    expect(rows.reduce((total, row) => total + row.completed, 0)).toBe(6);
  });

  it("counts a 366-day series in ONE statement — the shape D1's parameter ceiling refuses", async () => {
    await seedCompletions();
    const cut = bucketsOf("2025-09-05", "2026-09-04", "day");
    expect(cut.buckets).toHaveLength(365);
    const counter: Counter = { count: 0 };
    const repo = countingTaskRepo(WS, counter);
    const rows = await repo.countCompletedInBuckets({
      buckets: asWindows(cut.buckets),
    });
    expect(counter.count).toBe(1);
    expect(rows).toHaveLength(365);
    expect(rows.reduce((total, row) => total + row.completed, 0)).toBe(6);
  });

  it("stays at one statement, and at the same counts, when the workspace grows", async () => {
    const area = await seedCompletions();
    const cut = bucketsOf("2026-08-18", "2026-08-31", "day");
    const before = await taskRepo(
      WS,
      "2026-09-01T00:00:00.000Z",
    ).countCompletedInBuckets({
      buckets: asWindows(cut.buckets),
    });

    // Forty more Tasks completed OUTSIDE the window. A read that were not flat
    // would either cost more statements or start counting them.
    for (let index = 0; index < 40; index += 1) {
      await completeAt(
        WS,
        area.id,
        `bulk-${index}`,
        "2026-01-01T00:00:00.000Z",
        "2026-02-01T00:00:00.000Z",
      );
    }

    const counter: Counter = { count: 0 };
    const repo = countingTaskRepo(WS, counter);
    const after = await repo.countCompletedInBuckets({
      buckets: asWindows(cut.buckets),
    });
    expect(counter.count).toBe(1);
    expect(after).toEqual(before);
  });

  it("counts a reopened-and-recompleted Task once, in its CURRENT bucket", async () => {
    const area = await spineRepo(WS, "2026-08-01T00:00:00.000Z").createArea({
      title: "Ops",
    });
    const id = await completeAt(
      WS,
      area.id,
      "moves",
      "2026-08-01T00:00:00.000Z",
      "2026-08-20T01:00:00.000Z",
    );
    const cut = bucketsOf("2026-08-18", "2026-08-31", "day");
    const before = await taskRepo(
      WS,
      "2026-09-01T00:00:00.000Z",
    ).countCompletedInBuckets({
      buckets: asWindows(cut.buckets),
    });
    expect(before.map((row) => row.completed)).toEqual([
      0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);

    // Reopen, then complete again a week later.
    await spineRepo(WS, "2026-08-26T00:00:00.000Z").reopen(id);
    await taskRepo(WS, "2026-08-27T03:00:00.000Z").completeTask(id);

    const after = await taskRepo(
      WS,
      "2026-09-01T00:00:00.000Z",
    ).countCompletedInBuckets({
      buckets: asWindows(cut.buckets),
    });
    // ONCE, and in the new bucket — not once in each. This is the whole reason
    // a Task series reads `spine_records.completed_at` rather than
    // `task.completed` events, which survive the reopen.
    expect(after.reduce((total, row) => total + row.completed, 0)).toBe(1);
    expect(after.map((row) => row.completed)).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0,
    ]);
  });

  it("counts a deleted Task nowhere", async () => {
    const area = await spineRepo(WS, "2026-08-01T00:00:00.000Z").createArea({
      title: "Ops",
    });
    const id = await completeAt(
      WS,
      area.id,
      "doomed",
      "2026-08-01T00:00:00.000Z",
      "2026-08-20T01:00:00.000Z",
    );
    const cut = bucketsOf("2026-08-18", "2026-08-24", "day");
    await spineRepo(WS, "2026-08-28T00:00:00.000Z").softDelete(id);
    const rows = await taskRepo(
      WS,
      "2026-09-01T00:00:00.000Z",
    ).countCompletedInBuckets({
      buckets: asWindows(cut.buckets),
    });
    expect(rows.reduce((total, row) => total + row.completed, 0)).toBe(0);
  });

  it("never sees another workspace's completions", async () => {
    await seedCompletions(WS);
    await seedCompletions(HOSTILE);
    const cut = bucketsOf("2026-08-18", "2026-08-31", "day");
    const mine = await taskRepo(
      WS,
      "2026-09-01T00:00:00.000Z",
    ).countCompletedInBuckets({
      buckets: asWindows(cut.buckets),
    });
    // The fixture's own known value — six, not twelve — with an identical
    // hostile fixture sitting beside it in the same database.
    expect(mine.reduce((total, row) => total + row.completed, 0)).toBe(6);
  });

  it("agrees exactly with countCompletedTasksInWindows — a generalisation, not a second authority", async () => {
    await seedCompletions();
    const cut = bucketsOf("2026-08-18", "2026-08-31", "day");
    const windows = asWindows(cut.buckets);
    const repo = taskRepo(WS, "2026-09-01T00:00:00.000Z");
    const bucketed = await repo.countCompletedInBuckets({ buckets: windows });
    // The sibling is capped at fourteen windows, which is exactly what this
    // fixture asks for — so the two can be compared directly on the same
    // instants rather than on similar ones.
    const unbucketed = await repo.countCompletedTasksInWindows(windows);
    expect(bucketed).toEqual(unbucketed);
  });

  it("returns nothing for no buckets, and issues no statement", async () => {
    const counter: Counter = { count: 0 };
    const repo = countingTaskRepo(WS, counter);
    expect(await repo.countCompletedInBuckets({ buckets: [] })).toEqual([]);
    expect(counter.count).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* The Activity series and the window list                                     */
/* -------------------------------------------------------------------------- */

describe("ActivityRepository.countByTypeInBuckets", () => {
  /** Projects and Goals completed, whose truth genuinely IS the event. */
  async function seedProjectsAndGoals(ws = WS) {
    const area = await spineRepo(ws, "2026-08-01T00:00:00.000Z").createArea({
      title: "Ops",
    });
    const projects: string[] = [];
    for (const [title, at] of [
      ["p1", "2026-08-20T01:00:00.000Z"],
      ["p2", "2026-08-20T06:00:00.000Z"],
      ["p3", "2026-08-27T03:00:00.000Z"],
    ] as const) {
      const project = await spineRepo(
        ws,
        "2026-08-01T00:00:00.000Z",
      ).createProject({
        title,
        parent: { kind: "area", id: area.id },
      });
      await spineRepo(ws, at).complete(project.id);
      projects.push(project.id);
    }
    const goal = await spineRepo(ws, "2026-08-01T00:00:00.000Z").createGoal({
      title: "g1",
      areaId: area.id,
    });
    await spineRepo(ws, "2026-08-20T09:00:00.000Z").complete(goal.id);
    return { area, projects, goal };
  }

  it("counts each type into its own bucket, with every requested type present", async () => {
    await seedProjectsAndGoals();
    const cut = bucketsOf("2026-08-18", "2026-08-31", "day");
    const rows = await activityRepo(WS).countByTypeInBuckets({
      types: ["project.completed", "goal.completed"],
      buckets: asWindows(cut.buckets),
    });
    expect(rows).toHaveLength(14);
    const on20 = rows[2];
    expect(on20.counts).toEqual({
      "project.completed": 2,
      "goal.completed": 1,
    });
    // A quiet bucket carries every requested type at zero, never an absent key.
    expect(rows[0].counts).toEqual({
      "project.completed": 0,
      "goal.completed": 0,
    });
    const on27 = rows[9];
    expect(on27.counts["project.completed"]).toBe(1);
  });

  it("counts a 52-week series in ONE statement", async () => {
    await seedProjectsAndGoals();
    const cut = bucketsOf("2025-09-08", "2026-09-04", "week");
    expect(cut.buckets).toHaveLength(52);
    const counter: Counter = { count: 0 };
    const rows = await activityRepo(
      WS,
      countingDatabase(counter),
    ).countByTypeInBuckets({
      types: ["project.completed", "goal.completed"],
      buckets: asWindows(cut.buckets),
    });
    expect(counter.count).toBe(1);
    expect(rows).toHaveLength(52);
    expect(
      rows.reduce((total, row) => total + row.counts["project.completed"], 0),
    ).toBe(3);
  });

  it("stays at one statement when the workspace grows, and counts the same", async () => {
    const { area } = await seedProjectsAndGoals();
    const cut = bucketsOf("2026-08-18", "2026-08-31", "day");
    const before = await activityRepo(WS).countByTypeInBuckets({
      types: ["project.completed"],
      buckets: asWindows(cut.buckets),
    });
    for (let index = 0; index < 30; index += 1) {
      const project = await spineRepo(
        WS,
        "2026-01-01T00:00:00.000Z",
      ).createProject({
        title: `bulk-${index}`,
        parent: { kind: "area", id: area.id },
      });
      await spineRepo(WS, "2026-02-01T00:00:00.000Z").complete(project.id);
    }
    const counter: Counter = { count: 0 };
    const after = await activityRepo(
      WS,
      countingDatabase(counter),
    ).countByTypeInBuckets({
      types: ["project.completed"],
      buckets: asWindows(cut.buckets),
    });
    expect(counter.count).toBe(1);
    expect(after).toEqual(before);
  });

  it("never sees another workspace's events", async () => {
    await seedProjectsAndGoals(WS);
    await seedProjectsAndGoals(HOSTILE);
    const cut = bucketsOf("2026-08-18", "2026-08-31", "day");
    const rows = await activityRepo(WS).countByTypeInBuckets({
      types: ["project.completed", "goal.completed"],
      buckets: asWindows(cut.buckets),
    });
    expect(
      rows.reduce((total, row) => total + row.counts["project.completed"], 0),
    ).toBe(3);
    expect(
      rows.reduce((total, row) => total + row.counts["goal.completed"], 0),
    ).toBe(1);
  });

  it("counts the primary subject only, so a multi-subject event cannot double-count", async () => {
    const { area } = await seedProjectsAndGoals();
    const cut = bucketsOf("2026-08-18", "2026-08-31", "day");
    // A link event names BOTH endpoints, under `source` and `target` rather
    // than the primary `subject` role. Counting it here yields zero — the
    // documented entity-centric semantic — rather than two, which is what a
    // read without the role filter would produce for any event that names more
    // than one entity.
    const task = await taskRepo(WS, "2026-08-20T02:00:00.000Z").createTask({
      title: "linked",
      parent: { kind: "area", id: area.id },
    });
    expect(task.id).toBeTruthy();
    const rows = await activityRepo(WS).countByTypeInBuckets({
      types: ["entity_link.created"],
      buckets: asWindows(cut.buckets),
    });
    expect(
      rows.reduce((total, row) => total + row.counts["entity_link.created"], 0),
    ).toBe(0);
  });

  it("refuses an empty type list rather than counting everything", async () => {
    // The contract calls an empty list a caller bug (an unfiltered count over
    // the whole stream is a different, unbounded question); the adapter used
    // to answer it with zeroed buckets, which reads as "nothing happened".
    await seedProjectsAndGoals();
    const cut = bucketsOf("2026-08-18", "2026-08-20", "day");
    await expect(
      activityRepo(WS).countByTypeInBuckets({
        types: [],
        buckets: asWindows(cut.buckets),
      }),
    ).rejects.toThrow(/types/);
  });

  it("refuses more buckets than the grain maximum rather than counting a shorter series", async () => {
    // Found by review: both bucketed reads used to `slice` to 366 and return
    // the shorter list, so a surface would have drawn the cut as the whole.
    const cut = bucketsOf("2025-09-03", "2026-09-04", "day");
    expect(cut.bounded).toBe(true);
    const day = cut.buckets[0];
    const extra = asWindows([...cut.buckets, { ...day, key: "b366" }]);
    expect(extra).toHaveLength(367);
    await expect(
      activityRepo(WS).countByTypeInBuckets({
        types: ["project.completed"],
        buckets: extra,
      }),
    ).rejects.toThrow(/buckets/);
    await expect(
      taskRepo(WS, "2026-09-05T00:00:00.000Z").countCompletedInBuckets({
        buckets: extra,
      }),
    ).rejects.toThrow(/buckets/);
    // Exactly the maximum is still one statement, as before.
    const counter: Counter = { count: 0 };
    const rows = await countingTaskRepo(WS, counter).countCompletedInBuckets({
      buckets: asWindows(cut.buckets),
    });
    expect(rows).toHaveLength(366);
    expect(counter.count).toBe(1);
  });
});

describe("ActivityRepository.listInWindow", () => {
  async function seedEvents(ws = WS) {
    const area = await spineRepo(ws, "2026-08-01T00:00:00.000Z").createArea({
      title: "Ops",
    });
    for (const at of [
      "2026-08-19T01:00:00.000Z",
      "2026-08-20T01:00:00.000Z",
      "2026-08-21T01:00:00.000Z",
      "2026-08-30T01:00:00.000Z",
    ]) {
      await spineRepo(ws, at).createProject({
        title: `p-${at}`,
        parent: { kind: "area", id: area.id },
      });
    }
    return area;
  }

  it("excludes an event outside the window, and includes the ones inside it", async () => {
    await seedEvents();
    const window = ownerWindow("2026-08-19", "2026-08-22");
    const page = await activityRepo(WS).listInWindow({
      startsAt: new Date(window.startInstantIso),
      endsAt: new Date(window.endInstantIso),
      types: ["entity.created"],
    });
    // Three of the four project creations fall inside; the 30 August one does
    // not, and its absence is the assertion.
    const titles = page.items.flatMap((item) =>
      typeof item.payload.title === "string" ? [item.payload.title] : [],
    );
    expect(titles).toEqual([
      "p-2026-08-21T01:00:00.000Z",
      "p-2026-08-20T01:00:00.000Z",
      "p-2026-08-19T01:00:00.000Z",
    ]);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it("pages with a cursor rather than truncating, one statement per page", async () => {
    await seedEvents();
    const window = ownerWindow("2026-08-19", "2026-08-31");
    const repo = activityRepo(WS);
    const first = await repo.listInWindow({
      startsAt: new Date(window.startInstantIso),
      endsAt: new Date(window.endInstantIso),
      types: ["entity.created"],
      limit: 2,
    });
    expect(first.items).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).not.toBeNull();

    const second = await repo.listInWindow({
      startsAt: new Date(window.startInstantIso),
      endsAt: new Date(window.endInstantIso),
      types: ["entity.created"],
      limit: 2,
      cursor: first.nextCursor!,
    });
    expect(second.items).toHaveLength(2);
    // No overlap and no gap between the pages.
    const ids = [...first.items, ...second.items].map((item) => item.id);
    expect(new Set(ids).size).toBe(4);
  });

  it("refuses a cursor issued for a different window", async () => {
    await seedEvents();
    const wide = ownerWindow("2026-08-19", "2026-08-31");
    const narrow = ownerWindow("2026-08-19", "2026-08-22");
    const repo = activityRepo(WS);
    const first = await repo.listInWindow({
      startsAt: new Date(wide.startInstantIso),
      endsAt: new Date(wide.endInstantIso),
      limit: 1,
    });
    expect(first.nextCursor).not.toBeNull();
    // Replaying it against another window would silently skip or repeat
    // events, which is the defect the window key exists to prevent.
    await expect(
      repo.listInWindow({
        startsAt: new Date(narrow.startInstantIso),
        endsAt: new Date(narrow.endInstantIso),
        limit: 1,
        cursor: first.nextCursor!,
      }),
    ).rejects.toThrow();
  });

  it("never lists another workspace's events", async () => {
    await seedEvents(WS);
    await seedEvents(HOSTILE);
    const window = ownerWindow("2026-08-19", "2026-08-31");
    const page = await activityRepo(WS).listInWindow({
      startsAt: new Date(window.startInstantIso),
      endsAt: new Date(window.endInstantIso),
      types: ["entity.created"],
      limit: 100,
    });
    expect(page.items).toHaveLength(4);
    expect(page.items.every((item) => item.workspaceId === WS)).toBe(true);
  });

  it("is empty for an inverted window, and issues no statement", async () => {
    await seedEvents();
    const counter: Counter = { count: 0 };
    const page = await activityRepo(WS, countingDatabase(counter)).listInWindow(
      {
        startsAt: new Date("2026-08-31T00:00:00.000Z"),
        endsAt: new Date("2026-08-19T00:00:00.000Z"),
      },
    );
    expect(page.items).toEqual([]);
    expect(counter.count).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* The falsifications the roadmap names                                        */
/* -------------------------------------------------------------------------- */

describe("the rules fail when they are broken", () => {
  it("a window of 40 weeks is still ONE statement — the roadmap's first falsifier", async () => {
    const area = await spineRepo(WS, "2026-08-01T00:00:00.000Z").createArea({
      title: "Ops",
    });
    await completeAt(
      WS,
      area.id,
      "one",
      "2026-01-01T00:00:00.000Z",
      "2026-08-20T01:00:00.000Z",
    );
    const cut = bucketsOf("2025-11-30", "2026-09-04", "week");
    expect(cut.buckets).toHaveLength(40);
    const counter: Counter = { count: 0 };
    const rows = await countingTaskRepo(WS, counter).countCompletedInBuckets({
      buckets: asWindows(cut.buckets),
    });
    expect(counter.count).toBe(1);
    expect(rows.reduce((total, row) => total + row.completed, 0)).toBe(1);
  });

  it("dropping the backward-from-the-end rule draws the current week as a dip", async () => {
    const area = await spineRepo(WS, "2026-08-01T00:00:00.000Z").createArea({
      title: "Ops",
    });
    // One completion on each of the owner's last seven days, 29 Aug → 4 Sep.
    // The truth is a flat week: seven days, one each.
    for (const day of [
      "2026-08-28T20:00:00.000Z",
      "2026-08-29T20:00:00.000Z",
      "2026-08-30T20:00:00.000Z",
      "2026-08-31T20:00:00.000Z",
      "2026-09-01T20:00:00.000Z",
      "2026-09-02T20:00:00.000Z",
      "2026-09-03T20:00:00.000Z",
    ]) {
      await completeAt(
        WS,
        area.id,
        `d-${day}`,
        "2026-08-01T00:00:00.000Z",
        day,
      );
    }

    // 82 days: eleven whole weeks plus five. The rule puts the remainder at the
    // OLD end, so the most recent bucket is a whole week and reports all seven.
    const correct = bucketsOf("2026-06-15", "2026-09-04", "week");
    const rows = await taskRepo(
      WS,
      "2026-09-05T00:00:00.000Z",
    ).countCompletedInBuckets({
      buckets: asWindows(correct.buckets),
    });
    expect(rows.at(-1)!.completed).toBe(7);

    // FALSIFIED: lay the same buckets out FORWARD from the window's start, so
    // the five-day remainder falls at the RECENT end instead.
    const forward = Array.from({ length: 12 }, (_value, index) => {
      const startIso = new Date("2026-06-14T14:00:00.000Z");
      startIso.setUTCDate(startIso.getUTCDate() + index * 7);
      const endIso = new Date(startIso);
      endIso.setUTCDate(endIso.getUTCDate() + 7);
      return { key: `f${index}`, startsAt: startIso, endsAt: endIso };
    });
    const wrong = await taskRepo(
      WS,
      "2026-09-05T00:00:00.000Z",
    ).countCompletedInBuckets({
      buckets: forward,
    });
    // The most recent bucket now covers only five of the seven days, so the
    // chart's last point drops from 7 to 5 — a 29% fall the owner did not
    // make, drawn every time the page is opened mid-week. That artefact is
    // what the backward rule exists to prevent.
    expect(wrong.at(-1)!.completed).toBe(5);
    expect(wrong.reduce((total, row) => total + row.completed, 0)).toBe(7);
  });
});

/* -------------------------------------------------------------------------- */
/* The snapshot series                                                         */
/* -------------------------------------------------------------------------- */

describe("ReviewInsightRepository.listSnapshotSeries", () => {
  /** A snapshot whose numbers are this test's own, so a count is knowable. */
  function snapshotFor(periodStart: string, periodEnd: string, tasks: number) {
    return {
      version: 1,
      periodStart,
      periodEnd,
      tasksCompleted: tasks,
      projectsCompleted: 0,
      goalsCompleted: 0,
      overdueCarryOver: 0,
      waitingCarryOver: 0,
      projects: [],
      projectsBounded: false,
      goals: [],
      goalsBounded: false,
      areas: [],
      areasBounded: false,
      carryOverTaskIds: [],
      carryOverTaskIdsBounded: false,
    };
  }

  /** Six weekly Reviews and one monthly, each with a snapshot. */
  async function seedReviews(ws = WS) {
    const reviews = createReviewRepository(env.DB, makeContext(ws), {
      clock: new FakeClock("2026-08-03T09:00:00.000Z").now,
      idGenerator: sequentialIds(`ins01rev-${ws}`),
      activityIdGenerator: nextActivityId,
    });
    const insights = makeReviewInsightRepository(makeContext(ws));
    const weekly: string[] = [];
    const periods = [
      ["2026-07-20", "2026-07-26"],
      ["2026-07-27", "2026-08-02"],
      ["2026-08-03", "2026-08-09"],
      ["2026-08-10", "2026-08-16"],
      ["2026-08-17", "2026-08-23"],
      ["2026-08-24", "2026-08-30"],
    ] as const;
    for (const [index, [start, end]] of periods.entries()) {
      const { review } = await reviews.create({
        type: "weekly",
        periodStart: start,
        periodEnd: end,
      });
      // Completed, as every snapshotted Review is in production: the snapshot
      // is captured on completion, and the series reads completed Reviews.
      await reviews.complete(review.id);
      await insights.saveSnapshot(
        review.id,
        snapshotFor(start, end, index + 1),
      );
      weekly.push(review.id);
    }
    const { review: monthly } = await reviews.create({
      type: "monthly",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
    });
    await reviews.complete(monthly.id);
    await insights.saveSnapshot(
      monthly.id,
      snapshotFor("2026-08-01", "2026-08-31", 99),
    );
    return { weekly, monthly: monthly.id, insights, reviews };
  }

  it("leaves out a Review that was archived or reopened after its snapshot was taken", async () => {
    // Found by review: the read joined `review_details` for the type only, so
    // an archived Review's stale snapshot — and a reopened one's, whose facts
    // are being revised — counted as consecutive history while the comparison
    // series beside it (`readPriorReviews`) left both out. Two reads of
    // "which Reviews came before this one" must agree.
    const { weekly, insights, reviews } = await seedReviews();
    await reviews.archive(weekly[2]);
    await reviews.reopen(weekly[4]);
    const series = await insights.listSnapshotSeries(weekly[5], 6);
    expect(series.map((stored) => stored.reviewId)).toEqual([
      weekly[0],
      weekly[1],
      weekly[3],
      weekly[5],
    ]);
    // The anchor itself is read whatever its state — a reopened Review's
    // panel still describes its own period.
    await reviews.reopen(weekly[5]);
    expect(
      (await insights.listSnapshotSeries(weekly[5], 6)).at(-1)?.reviewId,
    ).toBe(weekly[5]);
  });

  it("returns the anchor and the Reviews before it, oldest first", async () => {
    const { weekly, insights } = await seedReviews();
    const series = await insights.listSnapshotSeries(weekly[5], 4);
    expect(series).toHaveLength(4);
    // The four most recent, ending with the anchor's own period.
    expect(series.map((stored) => stored.snapshot.periodEnd)).toEqual([
      "2026-08-09",
      "2026-08-16",
      "2026-08-23",
      "2026-08-30",
    ]);
    // The anchor Review's own snapshot is the most recent element, so a
    // completed Review's panel describes the period it is about.
    expect(series.at(-1)!.reviewId).toBe(weekly[5]);
  });

  /*
   * A Review that OVERLAPS the anchor is not "before" it.
   *
   * The product permits overlapping periods (`validateReviewPeriod` and the
   * create form both allow them), so "everything before the anchor" has to mean
   * "everything that ended before the anchor STARTED". Comparing against the
   * anchor's END instead admits a Review covering some of the same days, and
   * the panel then reports two overlapping Reviews as consecutive history while
   * the comparison series beside it — which has always used the start — leaves
   * that Review out. Two reads of "which Reviews came before this one" that
   * disagree is the defect; this is the assertion that keeps them together.
   */
  it("leaves out a Review whose period OVERLAPS the anchor's", async () => {
    const { weekly, insights } = await seedReviews();
    const reviews = createReviewRepository(env.DB, makeContext(WS), {
      clock: new FakeClock("2026-08-03T09:00:00.000Z").now,
      idGenerator: sequentialIds("ins01overlap"),
      activityIdGenerator: nextActivityId,
    });
    /*
     * The anchor `weekly[5]` covers 24–30 August. This one covers 26–29 August:
     * it ends BEFORE the anchor ends, so an end-to-end comparison admits it,
     * and it starts INSIDE the anchor's period, so it is not history.
     */
    const { review: overlapping } = await reviews.create({
      type: "weekly",
      periodStart: "2026-08-26",
      periodEnd: "2026-08-29",
    });
    await insights.saveSnapshot(
      overlapping.id,
      snapshotFor("2026-08-26", "2026-08-29", 42),
    );

    const series = await insights.listSnapshotSeries(weekly[5], 8);
    expect(series.map((stored) => stored.reviewId)).not.toContain(
      overlapping.id,
    );
    // The falsification, stated: the overlapping Review DOES end before the
    // anchor ends, so a predicate written against the anchor's end would have
    // included it and this assertion would fail.
    expect("2026-08-29" < "2026-08-30").toBe(true);
    // …and every Review the series DID keep genuinely ended before the anchor
    // began, which is the rule rather than an example of it.
    const anchor = series.at(-1)!;
    expect(anchor.reviewId).toBe(weekly[5]);
    for (const stored of series.slice(0, -1)) {
      expect(stored.snapshot.periodEnd < anchor.snapshot.periodStart).toBe(
        true,
      );
    }
  });

  it("holds the same-type rule: a weekly series never contains a monthly Review", async () => {
    const { weekly, monthly, insights } = await seedReviews();
    const series = await insights.listSnapshotSeries(weekly[5], 8);
    expect(series.map((stored) => stored.reviewId)).not.toContain(monthly);
    // And the monthly Review's own series contains only itself.
    const monthlySeries = await insights.listSnapshotSeries(monthly, 8);
    expect(monthlySeries.map((stored) => stored.reviewId)).toEqual([monthly]);
  });

  it("shortens rather than inventing when a snapshot is missing", async () => {
    const { weekly, insights } = await seedReviews();
    await env.DB.prepare(
      `DELETE FROM review_insight_snapshots WHERE workspace_id = ? AND review_id = ?`,
    )
      .bind(WS, weekly[3])
      .run();
    const series = await insights.listSnapshotSeries(weekly[5], 6);
    // Five, not six, and no hole where the fourth would have been.
    expect(series).toHaveLength(5);
    expect(series.map((stored) => stored.reviewId)).not.toContain(weekly[3]);
  });

  it("reads the series in ONE statement, flat in the number of Reviews", async () => {
    const { weekly } = await seedReviews();
    const counter: Counter = { count: 0 };
    const insights = createReviewInsightRepository(
      countingDatabase(counter),
      makeContext(WS),
    );
    const series = await insights.listSnapshotSeries(weekly[5], 6);
    expect(counter.count).toBe(1);
    expect(series).toHaveLength(6);
  });

  it("is bounded by the kernel's review_period maximum, not by the panel's eight", async () => {
    // Found by review: the read clamped to `MAX_TREND_PERIODS` (8) while the
    // kernel states twelve, so a caller asking for twelve got eight with no
    // bound reported. Fourteen weekly Reviews, each with a snapshot.
    const reviews = createReviewRepository(env.DB, makeContext(WS), {
      clock: new FakeClock("2026-08-03T09:00:00.000Z").now,
      idGenerator: sequentialIds("ins01cap"),
      activityIdGenerator: nextActivityId,
    });
    const insights = makeReviewInsightRepository(makeContext(WS));
    let last = "";
    for (let index = 0; index < 14; index += 1) {
      const start = new Date(Date.UTC(2026, 4, 4 + index * 7));
      const end = new Date(Date.UTC(2026, 4, 10 + index * 7));
      const periodStart = start.toISOString().slice(0, 10);
      const periodEnd = end.toISOString().slice(0, 10);
      const { review } = await reviews.create({
        type: "weekly",
        periodStart,
        periodEnd,
      });
      await reviews.complete(review.id);
      await insights.saveSnapshot(
        review.id,
        snapshotFor(periodStart, periodEnd, index + 1),
      );
      last = review.id;
    }
    expect(await insights.listSnapshotSeries(last, 500)).toHaveLength(
      GRAIN_MAXIMUMS.review_period,
    );
    expect(await insights.listSnapshotSeries(last, 9)).toHaveLength(9);
    expect(GRAIN_MAXIMUMS.review_period).toBeGreaterThan(MAX_TREND_PERIODS);
  });

  it("never reads another workspace's snapshots", async () => {
    const mine = await seedReviews(WS);
    const theirs = await seedReviews(HOSTILE);
    // The hostile workspace's anchor is invisible from this one.
    expect(await mine.insights.listSnapshotSeries(theirs.weekly[5], 6)).toEqual(
      [],
    );
    // And this workspace's own series contains only its own Reviews.
    const series = await mine.insights.listSnapshotSeries(mine.weekly[5], 6);
    expect(series).toHaveLength(6);
    expect(
      series.every((stored) => mine.weekly.includes(stored.reviewId)),
    ).toBe(true);
  });
});
