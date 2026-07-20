/**
 * TODAY-02 — the task Drawer view-model (pure helpers).
 */

import { describe, expect, it } from "vitest";

import {
  formatCalendarDate,
  isTaskComplete,
  serializeTaskView,
  taskDateLabel,
  taskDisplayStatus,
  taskPriorityLabel,
  taskStatusLabel,
} from "~/modules/today/task/task-view";
import type { TaskView } from "~/kernel/tasks";
import { parseWorkspaceId } from "~/kernel/workspaces";
import { parseMarkdownSource } from "~/kernel/markdown";

function view(overrides: Partial<TaskView> = {}): TaskView {
  return {
    id: "t1",
    workspaceId: parseWorkspaceId("ws"),
    title: "Write the ADR",
    createdAt: new Date("2026-07-18T09:00:00.000Z"),
    updatedAt: new Date("2026-07-20T10:00:00.000Z"),
    deletedAt: null,
    completedAt: null,
    status: "todo",
    priority: null,
    dueDate: null,
    scheduledDate: null,
    description: null,
    project: null,
    goal: null,
    area: null,
    waiting: null,
    ...overrides,
  };
}

describe("serializeTaskView", () => {
  it("turns Dates into ISO strings and preserves the rest", () => {
    const serialized = serializeTaskView(
      view({
        completedAt: new Date("2026-07-21T00:00:00.000Z"),
        priority: "high",
        dueDate: "2026-08-01",
        description: parseMarkdownSource("# Hi"),
        project: { kind: "project", id: "p1", title: "Ship V2" },
      }),
    );
    expect(serialized.createdAt).toBe("2026-07-18T09:00:00.000Z");
    expect(serialized.completedAt).toBe("2026-07-21T00:00:00.000Z");
    expect(serialized.priority).toBe("high");
    expect(serialized.dueDate).toBe("2026-08-01");
    expect(serialized.description).toBe("# Hi");
    expect(serialized.project).toEqual({
      kind: "project",
      id: "p1",
      title: "Ship V2",
    });
  });
});

describe("display derivations", () => {
  it("derives the status pill from completion then workflow status", () => {
    expect(taskDisplayStatus(true, "todo")).toEqual({
      label: "Completed",
      tone: "success",
    });
    expect(taskDisplayStatus(false, "in_progress")).toEqual({
      label: "In progress",
      tone: "info",
    });
    expect(taskDisplayStatus(false, "todo")).toEqual({
      label: "To do",
      tone: "neutral",
    });
  });

  it("labels statuses and priorities", () => {
    expect(taskStatusLabel("in_progress")).toBe("In progress");
    expect(taskPriorityLabel("high")).toBe("High");
    expect(taskPriorityLabel(null)).toBe("None");
  });

  it("reports completion from completedAt only", () => {
    expect(isTaskComplete({ completedAt: null })).toBe(false);
    expect(isTaskComplete({ completedAt: "2026-07-21T00:00:00.000Z" })).toBe(
      true,
    );
  });
});

describe("formatCalendarDate", () => {
  it("formats a valid date-only string without timezone drift", () => {
    expect(formatCalendarDate("2026-08-01")).toBe("1 Aug 2026");
    expect(formatCalendarDate("2026-12-31")).toBe("31 Dec 2026");
  });

  it("returns null for null or malformed input", () => {
    expect(formatCalendarDate(null)).toBeNull();
    expect(formatCalendarDate("2026/08/01")).toBeNull();
    expect(formatCalendarDate("nonsense")).toBeNull();
  });
});

describe("taskDateLabel", () => {
  it("prefers the due date and flags it overdue when past and open", () => {
    expect(
      taskDateLabel(
        { completedAt: null, dueDate: "2026-07-10", scheduledDate: null },
        "2026-07-20",
      ),
    ).toEqual({ label: "Due 10 Jul 2026", tone: "danger" });
  });

  it("is not overdue when completed", () => {
    expect(
      taskDateLabel(
        {
          completedAt: "2026-07-21T00:00:00.000Z",
          dueDate: "2026-07-10",
          scheduledDate: null,
        },
        "2026-07-20",
      ),
    ).toEqual({ label: "Due 10 Jul 2026" });
  });

  it("falls back to the scheduled date, then nothing", () => {
    expect(
      taskDateLabel(
        { completedAt: null, dueDate: null, scheduledDate: "2026-08-05" },
        "2026-07-20",
      ),
    ).toEqual({ label: "Scheduled 5 Aug 2026" });
    expect(
      taskDateLabel(
        { completedAt: null, dueDate: null, scheduledDate: null },
        "2026-07-20",
      ),
    ).toBeNull();
  });
});
