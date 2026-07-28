import { describe, expect, it } from "vitest";

import {
  priorityQuadrant,
  quadrantActionLabel,
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

describe("priorityQuadrant / labels", () => {
  it("maps P1–P4 to Do/Defer/Delegate/Delete", () => {
    expect(priorityQuadrant("p1")).toBe("do");
    expect(priorityQuadrant("p2")).toBe("defer");
    expect(priorityQuadrant("p3")).toBe("delegate");
    expect(priorityQuadrant("p4")).toBe("delete");
    expect(priorityQuadrant(null)).toBeNull();
  });

  it("labels priority concisely outside methodology-specific views", () => {
    expect(taskPriorityLabel("p1")).toBe("P1 · Urgent");
    expect(taskPriorityLabel("p2")).toBe("P2 · High");
    expect(taskPriorityLabel("p3")).toBe("P3 · Normal");
    expect(taskPriorityLabel("p4")).toBe("P4 · Low");
    expect(taskPriorityLabel(null)).toBe("No priority");
  });

  it("tags and quadrant action words", () => {
    expect(taskPriorityTag("p1")).toBe("P1");
    expect(taskPriorityTag(null)).toBe("—");
    expect(quadrantActionLabel("delete")).toBe("Delete / Review");
  });

  it("labels sectors and treats null as Inbox", () => {
    expect(timeSectorLabel("this_week")).toBe("This Week");
    expect(timeSectorLabel("routines")).toBe("Routines");
    expect(timeSectorLabel(null)).toBe("Inbox");
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

  it("Inbox when active with no sector and no schedule", () => {
    const state = taskDisplayState(base);
    expect(state.kind).toBe("inbox");
    expect(state.label).toBe("Inbox");
  });
});
