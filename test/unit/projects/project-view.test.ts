import { describe, expect, it } from "vitest";

import type { ProjectListItem, ProjectOverview } from "~/kernel/projects";
import { parseWorkspaceId } from "~/kernel/workspaces";
import {
  isProjectComplete,
  projectProgress,
  projectProgressFromRollup,
  projectStateLabel,
  serializeProjectListItem,
  serializeProjectOverview,
  serializeProjectTask,
  toProjectCardData,
} from "~/modules/projects/project-view";
import type { TaskListItem } from "~/kernel/tasks";

import { stubHealth } from "../../support/project-health";

/**
 * PROJ-01 — the pure Projects view-model: presentation mapping, roll-up formatting,
 * empty-progress rules and serialisation. No React, no I/O — just derivations.
 */

const WS = parseWorkspaceId("ws-test");

function listItem(over: Partial<ProjectListItem> = {}): ProjectListItem {
  return {
    id: "p1",
    workspaceId: WS,
    title: "DalyHub V2",
    createdAt: new Date("2026-07-18T09:00:00.000Z"),
    updatedAt: new Date("2026-07-20T10:00:00.000Z"),
    completedAt: null,
    area: { kind: "area", id: "a1", title: "Career" },
    goal: null,
    taskTotal: 0,
    taskCompleted: 0,
    ...over,
  };
}

describe("progress", () => {
  it("presents an EMPTY project as 'No tasks yet' and never 100%", () => {
    const p = projectProgress(0, 0);
    expect(p.has).toBe(false);
    expect(p.percent).toBe(0);
    expect(p.summary).toBe("No tasks yet");
  });

  it("formats a partial and a complete roll-up", () => {
    const partial = projectProgress(3, 8);
    expect(partial.has).toBe(true);
    expect(partial.percent).toBe(38);
    expect(partial.summary).toBe("3 of 8 tasks");

    const done = projectProgress(4, 4);
    expect(done.percent).toBe(100);
    expect(done.summary).toBe("4 of 4 tasks");

    expect(projectProgress(1, 1).summary).toBe("1 of 1 task");
  });

  it("derives from a spine rollup (empty rollup is not 100%)", () => {
    expect(
      projectProgressFromRollup({ total: 0, completed: 0, ratio: null }).has,
    ).toBe(false);
    expect(
      projectProgressFromRollup({ total: 2, completed: 1, ratio: 0.5 }).percent,
    ).toBe(50);
  });
});

describe("state pill", () => {
  it("is Open when active and Completed when completed (label carries meaning)", () => {
    expect(projectStateLabel({ completedAt: null })).toEqual({
      label: "Open",
      tone: "neutral",
    });
    expect(projectStateLabel({ completedAt: "2026-07-20" })).toEqual({
      label: "Completed",
      tone: "success",
    });
    expect(isProjectComplete({ completedAt: null })).toBe(false);
    expect(isProjectComplete({ completedAt: "x" })).toBe(true);
  });
});

describe("serialisation", () => {
  it("serialises a list item's Dates to ISO strings", () => {
    const s = serializeProjectListItem(
      listItem({ taskTotal: 5, taskCompleted: 2 }),
      stubHealth(),
    );
    expect(s.createdAt).toBe("2026-07-18T09:00:00.000Z");
    expect(s.updatedAt).toBe("2026-07-20T10:00:00.000Z");
    expect(s.completedAt).toBeNull();
    expect(s.taskTotal).toBe(5);
  });

  it("serialises an overview and a completed date", () => {
    const overview: ProjectOverview = {
      id: "p1",
      workspaceId: WS,
      title: "P",
      createdAt: new Date("2026-07-18T09:00:00.000Z"),
      updatedAt: new Date("2026-07-20T10:00:00.000Z"),
      completedAt: new Date("2026-07-21T00:00:00.000Z"),
      area: { kind: "area", id: "a1", title: "Career" },
      goal: { kind: "goal", id: "g1", title: "Ship" },
    };
    const s = serializeProjectOverview(overview);
    expect(s.completedAt).toBe("2026-07-21T00:00:00.000Z");
    expect(s.goal?.title).toBe("Ship");
  });

  it("serialises a project task's waiting state (which the generic serializer omits)", () => {
    const task: TaskListItem = {
      id: "t1",
      workspaceId: WS,
      title: "Blocked task",
      createdAt: new Date("2026-07-18T09:00:00.000Z"),
      updatedAt: new Date("2026-07-18T09:00:00.000Z"),
      completedAt: null,
      status: "todo",
      priority: null,
      dueDate: null,
      scheduledDate: null,
      parent: { kind: "project", id: "p1", title: "P" },
      waiting: {
        since: new Date("2026-07-19T00:00:00.000Z"),
        subject: { kind: "text", note: "finance sign-off" },
      },
    };
    const s = serializeProjectTask(task);
    expect(s.waiting?.since).toBe("2026-07-19T00:00:00.000Z");
    expect(s.waiting?.subject).toEqual({
      kind: "text",
      note: "finance sign-off",
    });
  });
});

describe("card mapping", () => {
  it("maps area/goal labels, state and progress, resolving titles (not copies)", () => {
    const card = toProjectCardData(
      serializeProjectListItem(
        listItem({
          goal: { kind: "goal", id: "g1", title: "Ship v2" },
          taskTotal: 4,
          taskCompleted: 1,
        }),
        stubHealth({ taskTotal: 4, taskCompleted: 1 }),
      ),
    );
    expect(card.areaLabel).toBe("Career");
    expect(card.goalLabel).toBe("Ship v2");
    expect(card.state.label).toBe("Open");
    expect(card.progress.summary).toBe("1 of 4 tasks");
    expect(card.updatedLabel).toBe("Updated 20 Jul 2026");
  });

  it("shows no goal label and no progress bar for an empty area-only project", () => {
    const card = toProjectCardData(
      serializeProjectListItem(
        listItem(),
        stubHealth({ taskTotal: 0, taskCompleted: 0 }),
      ),
    );
    expect(card.goalLabel).toBeNull();
    expect(card.progress.has).toBe(false);
  });
});
