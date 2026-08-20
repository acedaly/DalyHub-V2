import { describe, expect, it } from "vitest";

import { taskBlockedLabel } from "~/kernel/tasks";
import {
  blockedSummaryOf,
  taskDisplayState,
  taskPriorityLabel,
  taskPriorityTag,
  timeSectorLabel,
  type TaskDisplayStateInput,
} from "~/shared/task-record/task-view";

const base: TaskDisplayStateInput = {
  deletedAt: null,
  completedAt: null,
  status: "todo",
  commitmentState: "active",
  timeSector: null,
  scheduledDate: null,
  waiting: null,
};

describe("priority labels", () => {
  it("labels priority concisely — ONE vocabulary since the Matrix was removed", () => {
    expect(taskPriorityLabel("p1")).toBe("Priority 1");
    expect(taskPriorityLabel("p2")).toBe("Priority 2");
    expect(taskPriorityLabel("p3")).toBe("Priority 3");
    expect(taskPriorityLabel("p4")).toBe("Priority 4");
    expect(taskPriorityLabel(null)).toBe("Priority 4");
  });

  it("tags priority shortly, with legacy null mapped to normal P4", () => {
    expect(taskPriorityTag("p1")).toBe("P1");
    expect(taskPriorityTag(null)).toBe("P4");
  });

  it("labels sectors and treats null as No sector", () => {
    expect(timeSectorLabel("this_week")).toBe("This Week");
    expect(timeSectorLabel("routines")).toBe("Routines");
    expect(timeSectorLabel(null)).toBe("No sector");
  });
});

describe("taskDisplayState precedence (ADR-043 §6)", () => {
  it("Deleted wins over everything", () => {
    expect(
      taskDisplayState({
        ...base,
        deletedAt: "2026-07-25T00:00:00.000Z",
        completedAt: "2026-07-25T00:00:00.000Z",
        status: "cancelled",
      }).kind,
    ).toBe("deleted");
  });

  it("Completed beats cancelled/waiting/on_hold/someday", () => {
    expect(
      taskDisplayState({
        ...base,
        completedAt: "2026-07-25T00:00:00.000Z",
        status: "cancelled",
        commitmentState: "someday",
        waiting: { since: "x", subject: { kind: "text", note: "n" } },
      }).kind,
    ).toBe("completed");
  });

  it("Cancelled beats waiting", () => {
    expect(
      taskDisplayState({
        ...base,
        status: "cancelled",
        waiting: { since: "x", subject: { kind: "text", note: "n" } },
      }).kind,
    ).toBe("cancelled");
  });

  it("Waiting beats on_hold and someday", () => {
    expect(
      taskDisplayState({
        ...base,
        status: "on_hold",
        commitmentState: "someday",
        waiting: { since: "x", subject: { kind: "text", note: "n" } },
      }).kind,
    ).toBe("waiting");
  });

  it("On hold beats someday", () => {
    expect(
      taskDisplayState({
        ...base,
        status: "on_hold",
        commitmentState: "someday",
      }).kind,
    ).toBe("on_hold");
  });

  it("Someday beats in_progress and planned", () => {
    expect(
      taskDisplayState({
        ...base,
        status: "in_progress",
        commitmentState: "someday",
        timeSector: "this_week",
      }).kind,
    ).toBe("someday");
  });

  it("In progress beats planned", () => {
    expect(
      taskDisplayState({
        ...base,
        status: "in_progress",
        timeSector: "this_week",
      }).kind,
    ).toBe("in_progress");
  });

  it("Planned when a sector or scheduled date is set", () => {
    expect(taskDisplayState({ ...base, timeSector: "next_week" }).kind).toBe(
      "planned",
    );
    expect(
      taskDisplayState({ ...base, scheduledDate: "2026-08-01" }).kind,
    ).toBe("planned");
  });

  it("Unscheduled when active with no sector and no schedule", () => {
    const state = taskDisplayState(base);
    expect(state.kind).toBe("inbox");
    expect(state.label).toBe("Unscheduled");
  });
});

describe("TASKS-12 — blocked in the ONE precedence evaluator", () => {
  it("reads Blocked when an incomplete blocker remains", () => {
    const state = taskDisplayState({ ...base, blocked: true });
    expect(state.kind).toBe("blocked");
    expect(state.label).toBe("Blocked");
    // The WAITING tone, deliberately: blocked and waiting are the same family,
    // and a second colour for a second flavour of one fact is pill inflation.
    expect(state.tone).toBe("waiting");
  });

  it("sits BELOW Waiting — a statement the owner made outranks a derived one", () => {
    expect(
      taskDisplayState({
        ...base,
        blocked: true,
        waiting: {
          since: "2026-08-19T00:00:00.000Z",
          subject: { kind: "text", note: "Finance" },
        },
      }).kind,
    ).toBe("waiting");
  });

  it("sits ABOVE On hold, Someday and In progress", () => {
    for (const over of [
      { status: "on_hold" as const },
      { commitmentState: "someday" as const },
      { status: "in_progress" as const },
    ]) {
      expect(taskDisplayState({ ...base, ...over, blocked: true }).kind).toBe(
        "blocked",
      );
    }
  });

  it("yields to Completed and Cancelled, which are terminal", () => {
    expect(
      taskDisplayState({
        ...base,
        blocked: true,
        completedAt: "2026-08-19T00:00:00.000Z",
      }).kind,
    ).toBe("completed");
    expect(
      taskDisplayState({ ...base, blocked: true, status: "cancelled" }).kind,
    ).toBe("cancelled");
  });

  it("is ABSENT-safe: a surface that did not ask gets exactly what it always got", () => {
    // `blocked` omitted entirely — the shape every pre-TASKS-12 caller passes.
    expect(
      taskDisplayState({ ...base, scheduledDate: "2026-08-19" }).kind,
    ).toBe("planned");
    expect(taskDisplayState(base).kind).toBe("inbox");
    // And an explicit false is the same answer, never a third state.
    expect(taskDisplayState({ ...base, blocked: false }).kind).toBe("inbox");
  });
});

describe("TASKS-12 — the one blocked wording", () => {
  it("NAMES a single blocker and COUNTS several", () => {
    expect(
      taskBlockedLabel({ blockerCount: 1, firstBlockerTitle: "Get approval" }),
    ).toBe("Blocked by Get approval");
    expect(
      taskBlockedLabel({ blockerCount: 3, firstBlockerTitle: "Get approval" }),
    ).toBe("Blocked by 3 tasks");
  });

  it("says nothing at all when nothing blocks", () => {
    expect(taskBlockedLabel(null)).toBeNull();
    expect(taskBlockedLabel(undefined)).toBeNull();
    expect(
      taskBlockedLabel({ blockerCount: 0, firstBlockerTitle: "Get approval" }),
    ).toBeNull();
  });
});

describe("TASKS-12 — the record derives its own blocked state the server's way", () => {
  const done = "2026-08-19T00:00:00.000Z";

  it("counts only INCOMPLETE blockers, and names the first alphabetically", () => {
    expect(
      blockedSummaryOf({
        blockedBy: [
          { taskId: "t1", title: "Zebra", completedAt: null },
          { taskId: "t2", title: "Apple", completedAt: null },
          { taskId: "t3", title: "Alpha", completedAt: done },
        ],
        blocks: [],
      }),
    ).toEqual({ blockerCount: 2, firstBlockerTitle: "Apple" });
  });

  it("is null when every blocker is complete, and when there are none", () => {
    expect(
      blockedSummaryOf({
        blockedBy: [{ taskId: "t1", title: "Done", completedAt: done }],
        blocks: [],
      }),
    ).toBeNull();
    expect(blockedSummaryOf({ blockedBy: [], blocks: [] })).toBeNull();
    expect(blockedSummaryOf(undefined)).toBeNull();
  });
});
