/**
 * PLAN-01 — the "Still to place" queue rule.
 *
 * The queue is the surface's one editorial judgement, so every part of it that
 * could be arbitrary is asserted here: the band order, the one-band-per-task
 * rule, the "already placed" exclusion, the bound, and that truncation is
 * REPORTED rather than silent.
 */

import { describe, expect, it } from "vitest";

import {
  PLANNING_QUEUE_BANDS,
  PLANNING_QUEUE_BAND_LABELS,
  PLANNING_QUEUE_BAND_NOTES,
  buildPlanningQueue,
  type PlanningQueueBandResult,
} from "~/kernel/planning";

interface Task {
  readonly id: string;
}

function band(
  name: (typeof PLANNING_QUEUE_BANDS)[number],
  ids: readonly string[],
  truncated = false,
): PlanningQueueBandResult<Task> {
  return { band: name, items: ids.map((id) => ({ id })), truncated };
}

describe("the band vocabulary", () => {
  it("names and explains every band", () => {
    for (const name of PLANNING_QUEUE_BANDS) {
      expect(PLANNING_QUEUE_BAND_LABELS[name].length).toBeGreaterThan(0);
      expect(PLANNING_QUEUE_BAND_NOTES[name].length).toBeGreaterThan(0);
    }
  });

  it("declares the priority order the queue is built in", () => {
    expect([...PLANNING_QUEUE_BANDS]).toEqual([
      "overdue",
      "slipped",
      "due_this_week",
      "priority",
      "inbox",
    ]);
  });
});

describe("buildPlanningQueue", () => {
  it("orders entries by BAND, not by the caller's argument order", () => {
    const queue = buildPlanningQueue({
      // Deliberately shuffled: a loader resolving its reads concurrently must not
      // be able to change the queue's order.
      bands: [
        band("inbox", ["i1"]),
        band("overdue", ["o1"]),
        band("priority", ["p1"]),
        band("due_this_week", ["d1"]),
        band("slipped", ["s1"]),
      ],
      placedIds: new Set(),
      limit: 10,
    });
    expect(queue.entries.map((entry) => entry.task.id)).toEqual([
      "o1",
      "s1",
      "d1",
      "p1",
      "i1",
    ]);
    expect(queue.bands).toEqual([
      "overdue",
      "slipped",
      "due_this_week",
      "priority",
      "inbox",
    ]);
  });

  it("preserves each band's own query order inside the band", () => {
    const queue = buildPlanningQueue({
      bands: [band("overdue", ["c", "a", "b"])],
      placedIds: new Set(),
      limit: 10,
    });
    expect(queue.entries.map((entry) => entry.task.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("gives a task ONE band — its highest-priority one — and never two rows", () => {
    const queue = buildPlanningQueue({
      // The same task is overdue AND high priority AND unfiled.
      bands: [
        band("overdue", ["t1"]),
        band("priority", ["t1"]),
        band("inbox", ["t1"]),
      ],
      placedIds: new Set(),
      limit: 10,
    });
    expect(queue.entries).toHaveLength(1);
    expect(queue.entries[0]?.band).toBe("overdue");
    expect(queue.bands).toEqual(["overdue"]);
  });

  it("never queues a task already PLACED in the week", () => {
    const queue = buildPlanningQueue({
      bands: [band("overdue", ["placed", "unplaced"])],
      placedIds: new Set(["placed"]),
      limit: 10,
    });
    expect(queue.entries.map((entry) => entry.task.id)).toEqual(["unplaced"]);
  });

  it("bounds the queue and REPORTS that it did", () => {
    const queue = buildPlanningQueue({
      bands: [band("overdue", ["a", "b", "c", "d"])],
      placedIds: new Set(),
      limit: 2,
    });
    expect(queue.entries).toHaveLength(2);
    expect(queue.truncated).toBe(true);
  });

  it("reports a band's own truncation even when the merge did not truncate", () => {
    const queue = buildPlanningQueue({
      bands: [band("overdue", ["a"], true)],
      placedIds: new Set(),
      limit: 10,
    });
    expect(queue.entries).toHaveLength(1);
    expect(queue.truncated).toBe(true);
  });

  it("is not truncated when everything fits", () => {
    const queue = buildPlanningQueue({
      bands: [band("overdue", ["a"]), band("inbox", ["b"])],
      placedIds: new Set(),
      limit: 10,
    });
    expect(queue.truncated).toBe(false);
  });

  it("omits a band that contributed nothing, rather than showing it empty", () => {
    const queue = buildPlanningQueue({
      bands: [band("overdue", []), band("inbox", ["b"])],
      placedIds: new Set(),
      limit: 10,
    });
    expect(queue.bands).toEqual(["inbox"]);
  });

  it("is empty and honest when a bound of zero is asked for", () => {
    const queue = buildPlanningQueue({
      bands: [band("overdue", ["a"])],
      placedIds: new Set(),
      limit: 0,
    });
    expect(queue.entries).toHaveLength(0);
    expect(queue.truncated).toBe(true);
  });
});
