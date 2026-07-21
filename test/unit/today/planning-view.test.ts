/**
 * TODAY-04 — the planning view-model (pure functions), tested directly. Covers the
 * scheduled-date bucketing, the calm summary, the deterministic date arithmetic and
 * the quick-plan targets. All pure, so no DOM or router is involved.
 */

import { describe, expect, it } from "vitest";

import {
  addCalendarDays,
  bucketPlanning,
  planningSummary,
  planTargets,
  type PlanningTaskItem,
} from "~/modules/today/task/planning-view";

function task(
  id: string,
  overrides: Partial<PlanningTaskItem> = {},
): PlanningTaskItem {
  return {
    id,
    title: id,
    parent: null,
    scheduledDate: null,
    dueDate: null,
    completed: false,
    completedDate: null,
    ...overrides,
  };
}

const TODAY = "2026-07-19";

describe("addCalendarDays", () => {
  it("adds days across a month boundary", () => {
    expect(addCalendarDays("2026-07-31", 1)).toBe("2026-08-01");
  });
  it("adds a week", () => {
    expect(addCalendarDays("2026-07-19", 7)).toBe("2026-07-26");
  });
  it("handles a leap day", () => {
    expect(addCalendarDays("2028-02-28", 1)).toBe("2028-02-29");
  });
  it("returns the input unchanged for a malformed value", () => {
    expect(addCalendarDays("nope", 1)).toBe("nope");
  });
});

describe("planTargets", () => {
  it("resolves today, tomorrow and next week from the owner's day", () => {
    expect(planTargets(TODAY)).toEqual({
      today: "2026-07-19",
      tomorrow: "2026-07-20",
      nextWeek: "2026-07-26",
    });
  });
});

describe("bucketPlanning", () => {
  it("buckets open tasks by their scheduled date relative to today", () => {
    const items = [
      task("over", { scheduledDate: "2026-07-17" }),
      task("today", { scheduledDate: TODAY }),
      task("up", { scheduledDate: "2026-07-25" }),
      task("any"),
    ];
    const buckets = bucketPlanning(items, TODAY);
    expect(buckets.overdue.map((t) => t.id)).toEqual(["over"]);
    expect(buckets.today.map((t) => t.id)).toEqual(["today"]);
    expect(buckets.upcoming.map((t) => t.id)).toEqual(["up"]);
    expect(buckets.anytime.map((t) => t.id)).toEqual(["any"]);
  });

  it("shows only tasks completed TODAY under Completed today", () => {
    const items = [
      task("done-today", { completed: true, completedDate: TODAY }),
      task("done-yesterday", {
        completed: true,
        completedDate: "2026-07-18",
      }),
    ];
    const buckets = bucketPlanning(items, TODAY);
    expect(buckets.completedToday.map((t) => t.id)).toEqual(["done-today"]);
    // A task completed on a prior day appears in no planning section.
    expect(buckets.overdue).toHaveLength(0);
    expect(buckets.today).toHaveLength(0);
    expect(buckets.anytime).toHaveLength(0);
  });

  it("orders overdue oldest-first and today by due date then id", () => {
    const items = [
      task("o2", { scheduledDate: "2026-07-18" }),
      task("o1", { scheduledDate: "2026-07-16" }),
      task("t-b", { scheduledDate: TODAY, dueDate: "2026-08-05" }),
      task("t-a", { scheduledDate: TODAY, dueDate: "2026-08-01" }),
      task("t-none", { scheduledDate: TODAY }),
    ];
    const buckets = bucketPlanning(items, TODAY);
    expect(buckets.overdue.map((t) => t.id)).toEqual(["o1", "o2"]);
    // Due dates first (a before b), then the no-due task last.
    expect(buckets.today.map((t) => t.id)).toEqual(["t-a", "t-b", "t-none"]);
  });
});

describe("planningSummary", () => {
  it("counts planned (today), overdue, waiting and completed today", () => {
    const buckets = bucketPlanning(
      [
        task("o", { scheduledDate: "2026-07-10" }),
        task("t1", { scheduledDate: TODAY }),
        task("t2", { scheduledDate: TODAY }),
        task("d", { completed: true, completedDate: TODAY }),
      ],
      TODAY,
    );
    expect(planningSummary(buckets, 3)).toEqual({
      planned: 2,
      overdue: 1,
      waiting: 3,
      completedToday: 1,
    });
  });
});
