/**
 * GOAL-02 — the 7-day created-vs-completed counts, against real D1.
 *
 * Today's workload trend is only worth showing if the two numbers are right, so
 * this asserts them against real rows: that creation and completion are counted
 * in the DAY WINDOW the caller supplies (which is what makes the owner's
 * timezone the only calendar in play), that a reopened Task stops counting as
 * completed, that a deleted Task counts for neither, and that a quiet day comes
 * back as an explicit zero rather than being missing.
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  FakeClock,
  makeContext,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "test-default-workspace";

/** Owner-calendar days as explicit UTC windows — exactly what Today computes. */
function days(
  from: readonly [string, string, string][],
): { dateIso: string; startsAt: Date; endsAt: Date }[] {
  return from.map(([dateIso, startsAt, endsAt]) => ({
    dateIso,
    startsAt: new Date(startsAt),
    endsAt: new Date(endsAt),
  }));
}

/** Three consecutive UTC days, the simplest honest window. */
const WINDOW = days([
  ["2026-08-07", "2026-08-07T00:00:00.000Z", "2026-08-08T00:00:00.000Z"],
  ["2026-08-08", "2026-08-08T00:00:00.000Z", "2026-08-09T00:00:00.000Z"],
  ["2026-08-09", "2026-08-09T00:00:00.000Z", "2026-08-10T00:00:00.000Z"],
]);

function tasksAt(iso: string, prefix: string) {
  const clock = new FakeClock(new Date(iso));
  return {
    tasks: makeTaskRepository(makeContext(WS), {
      clock: clock.now,
      idGenerator: sequentialIds(prefix),
    }),
    spine: makeSpineRepository(makeContext(WS), {
      clock: clock.now,
      idGenerator: sequentialIds(`${prefix}s`),
      activityIdGenerator: sequentialIds(`${prefix}a`),
    }),
  };
}

beforeEach(async () => {
  await resetTables([WS]);
});

describe("countTaskActivityByDay", () => {
  it("counts creations into the day window they fall in", async () => {
    const early = tasksAt("2026-08-07T09:00:00.000Z", "e");
    await early.tasks.createTask({ title: "Monday one" });
    await early.tasks.createTask({ title: "Monday two" });
    const late = tasksAt("2026-08-09T09:00:00.000Z", "l");
    await late.tasks.createTask({ title: "Sunday one" });

    const counts = await late.tasks.countTaskActivityByDay({ days: WINDOW });
    expect(counts.map((day) => day.created)).toEqual([2, 0, 1]);
  });

  it("returns an explicit zero for a quiet day rather than omitting it", async () => {
    const { tasks } = tasksAt("2026-08-07T09:00:00.000Z", "q");
    await tasks.createTask({ title: "Only one" });
    const counts = await tasks.countTaskActivityByDay({ days: WINDOW });
    expect(counts).toHaveLength(3);
    expect(counts[1]).toEqual({
      dateIso: "2026-08-08",
      created: 0,
      completed: 0,
    });
  });

  it("counts a completion on the day it was completed, not created", async () => {
    const created = tasksAt("2026-08-07T09:00:00.000Z", "c");
    const task = await created.tasks.createTask({ title: "Spans two days" });
    const completedOn = tasksAt("2026-08-09T10:00:00.000Z", "d");
    await completedOn.tasks.completeTask(task.id);

    const counts = await completedOn.tasks.countTaskActivityByDay({
      days: WINDOW,
    });
    expect(counts.map((day) => day.created)).toEqual([1, 0, 0]);
    expect(counts.map((day) => day.completed)).toEqual([0, 0, 1]);
  });

  it("stops counting a completion once the Task is reopened", async () => {
    const day = tasksAt("2026-08-09T09:00:00.000Z", "r");
    const task = await day.tasks.createTask({ title: "Reopened" });
    await day.tasks.completeTask(task.id);
    expect(
      (await day.tasks.countTaskActivityByDay({ days: WINDOW })).at(-1)
        ?.completed,
    ).toBe(1);

    await day.tasks.reopenTask(task.id);
    expect(
      (await day.tasks.countTaskActivityByDay({ days: WINDOW })).at(-1)
        ?.completed,
    ).toBe(0);
  });

  it("ignores deleted Tasks in both counts", async () => {
    const day = tasksAt("2026-08-09T09:00:00.000Z", "x");
    const task = await day.tasks.createTask({ title: "Gone" });
    await day.tasks.completeTask(task.id);
    await day.spine.softDelete(task.id);

    const counts = await day.tasks.countTaskActivityByDay({ days: WINDOW });
    expect(counts.at(-1)).toEqual({
      dateIso: "2026-08-09",
      created: 0,
      completed: 0,
    });
  });

  it("counts only what falls inside the supplied windows", async () => {
    // A Task created BEFORE the window entirely.
    const before = tasksAt("2026-08-01T09:00:00.000Z", "b");
    await before.tasks.createTask({ title: "Old" });
    const inside = tasksAt("2026-08-08T09:00:00.000Z", "i");
    await inside.tasks.createTask({ title: "New" });

    const counts = await inside.tasks.countTaskActivityByDay({ days: WINDOW });
    expect(counts.reduce((sum, day) => sum + day.created, 0)).toBe(1);
  });

  it("returns nothing for an empty window rather than querying", async () => {
    const { tasks } = tasksAt("2026-08-09T09:00:00.000Z", "n");
    expect(await tasks.countTaskActivityByDay({ days: [] })).toEqual([]);
  });
});
