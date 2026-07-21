import { describe, expect, it, vi } from "vitest";

import {
  buildFocusedTaskCommands,
  buildTodayGlobalCommands,
  type FocusedTaskCommandDeps,
  type TodayGlobalCommandDeps,
} from "~/modules/today/keyboard/today-commands";
import type { PlanningTaskItem } from "~/modules/today/task/planning-view";

/**
 * TODAY-05 — the Today keyboard command builders. They emit the SAME `AppAction`
 * identity the palette, cards and shortcuts share; availability is by omission, and
 * completed-task restrictions are represented.
 */

const TARGETS = {
  today: "2026-07-21",
  tomorrow: "2026-07-22",
  nextWeek: "2026-07-28",
};

function task(overrides: Partial<PlanningTaskItem> = {}): PlanningTaskItem {
  return {
    id: "t1",
    title: "Ship it",
    parent: null,
    scheduledDate: "2026-07-21",
    dueDate: null,
    completed: false,
    completedDate: null,
    ...overrides,
  };
}

function globalDeps(
  overrides: Partial<TodayGlobalCommandDeps> = {},
): TodayGlobalCommandDeps {
  return {
    sections: [
      {
        bucket: "overdue",
        label: "Overdue",
        count: 1,
        navTarget: "/today?today-nav=overdue",
      },
      {
        bucket: "today",
        label: "Today",
        count: 2,
        navTarget: "/today?today-nav=today",
      },
      {
        bucket: "upcoming",
        label: "Upcoming",
        count: 0,
        navTarget: "/today?today-nav=upcoming",
      },
      {
        bucket: "anytime",
        label: "Anytime",
        count: 3,
        navTarget: "/today?today-nav=anytime",
      },
    ],
    hasOpenTasks: true,
    selectionCount: 0,
    taskListTarget: "/today?today-nav=list",
    selectAll: vi.fn(),
    clearSelection: vi.fn(),
    openHelp: vi.fn(),
    ...overrides,
  };
}

function focusedDeps(
  overrides: Partial<FocusedTaskCommandDeps> = {},
): FocusedTaskCommandDeps {
  return {
    task: task(),
    done: false,
    targets: TARGETS,
    isOpen: false,
    onToggleDone: vi.fn(),
    onOpen: vi.fn(),
    onClose: vi.fn(),
    onPlan: vi.fn(),
    ...overrides,
  };
}

describe("buildTodayGlobalCommands", () => {
  it("registers focus, select and help commands with stable unique ids", () => {
    const cmds = buildTodayGlobalCommands(globalDeps());
    const ids = cmds.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length); // unique
    expect(ids).toContain("today.cmd.focus_task_list");
    expect(ids).toContain("today.cmd.focus_section.overdue");
    expect(ids).toContain("today.cmd.select_all");
    expect(ids).toContain("today.cmd.keyboard_help");
    // A section with no tasks is omitted (no placeholder command).
    expect(ids).not.toContain("today.cmd.focus_section.upcoming");
  });

  it("omits list/section/select commands when there are no open tasks", () => {
    const cmds = buildTodayGlobalCommands(
      globalDeps({
        hasOpenTasks: false,
        taskListTarget: null,
        sections: [
          {
            bucket: "overdue",
            label: "Overdue",
            count: 0,
            navTarget: "/today?today-nav=overdue",
          },
        ],
      }),
    );
    const ids = cmds.map((c) => c.id);
    expect(ids).not.toContain("today.cmd.focus_task_list");
    expect(ids).not.toContain("today.cmd.select_all");
    // Keyboard help is always available.
    expect(ids).toContain("today.cmd.keyboard_help");
  });

  it("focus/section commands are NAVIGATE commands that close the palette", () => {
    const cmds = buildTodayGlobalCommands(globalDeps());
    const list = cmds.find((c) => c.id === "today.cmd.focus_task_list")!;
    const section = cmds.find(
      (c) => c.id === "today.cmd.focus_section.anytime",
    )!;
    // They navigate (naturally closing the palette) with the bounded today-nav param.
    expect(list.kind).toBe("navigate");
    expect(section.kind).toBe("navigate");
    if (list.kind === "navigate") {
      expect(list.target).toEqual({
        kind: "route",
        to: "/today?today-nav=list",
      });
    }
    if (section.kind === "navigate") {
      expect(section.target).toEqual({
        kind: "route",
        to: "/today?today-nav=anytime",
      });
    }
  });

  it("exposes Clear selection only when something is selected", () => {
    expect(
      buildTodayGlobalCommands(globalDeps()).some(
        (c) => c.id === "today.cmd.clear_selection",
      ),
    ).toBe(false);
    const withSelection = buildTodayGlobalCommands(
      globalDeps({ selectionCount: 3 }),
    );
    expect(
      withSelection.some((c) => c.id === "today.cmd.clear_selection"),
    ).toBe(true);
  });

  it("keyboard help carries the ? shortcut and runs its callback", () => {
    const openHelp = vi.fn();
    const help = buildTodayGlobalCommands(globalDeps({ openHelp })).find(
      (c) => c.id === "today.cmd.keyboard_help",
    )!;
    expect(help.shortcut).toEqual({ key: "?", modifiers: ["shift"] });
    if (help.kind === "run") help.run();
    expect(openHelp).toHaveBeenCalledTimes(1);
  });

  it("omits the section command for an empty section (no placeholder)", () => {
    const ids = buildTodayGlobalCommands(globalDeps()).map((c) => c.id);
    // Upcoming has count 0 in the fixture → its command is not built.
    expect(ids).not.toContain("today.cmd.focus_section.upcoming");
    expect(ids).toContain("today.cmd.focus_section.overdue");
  });

  it("exposes bulk planning commands only when a selection exists", () => {
    // No selection → no bulk commands.
    expect(
      buildTodayGlobalCommands(
        globalDeps({ targets: TARGETS, bulkPlan: vi.fn() }),
      ).some((c) => c.id.startsWith("today.cmd.bulk_")),
    ).toBe(false);
    // With a selection → the four bulk commands appear.
    const bulkPlan = vi.fn();
    const cmds = buildTodayGlobalCommands(
      globalDeps({ selectionCount: 2, targets: TARGETS, bulkPlan }),
    );
    const ids = cmds.map((c) => c.id);
    expect(ids).toContain("today.cmd.bulk_plan_today");
    expect(ids).toContain("today.cmd.bulk_plan_tomorrow");
    expect(ids).toContain("today.cmd.bulk_plan_next_week");
    expect(ids).toContain("today.cmd.bulk_clear_plan");
    // They drive the one atomic bulk path with the right dates.
    const run = (id: string) => {
      const c = cmds.find((x) => x.id === id)!;
      if (c.kind === "run") c.run();
    };
    run("today.cmd.bulk_plan_today");
    run("today.cmd.bulk_clear_plan");
    expect(bulkPlan).toHaveBeenNthCalledWith(1, TARGETS.today);
    expect(bulkPlan).toHaveBeenNthCalledWith(2, null);
  });
});

describe("buildFocusedTaskCommands", () => {
  it("an open, planned task exposes open/complete/plan commands with shortcuts", () => {
    const cmds = buildFocusedTaskCommands(focusedDeps());
    const byId = (suffix: string) =>
      cmds.find((c) => c.id === `today.task.t1.${suffix}`);
    expect(byId("open")).toBeDefined();
    expect(byId("close")).toBeUndefined();
    expect(byId("toggle")?.title).toBe("Complete task");
    expect(byId("toggle")?.shortcut).toEqual({ key: "c" });
    expect(byId("plan_today")?.shortcut).toEqual({ key: "p" });
    expect(byId("plan_tomorrow")?.shortcut).toEqual({
      key: "p",
      modifiers: ["shift"],
    });
    expect(byId("plan_next_week")).toBeDefined();
    expect(byId("clear_plan")).toBeDefined(); // it is planned
  });

  it("shows Close instead of Open when the Drawer is open", () => {
    const cmds = buildFocusedTaskCommands(focusedDeps({ isOpen: true }));
    expect(cmds.some((c) => c.id === "today.task.t1.close")).toBe(true);
    expect(cmds.some((c) => c.id === "today.task.t1.open")).toBe(false);
  });

  it("an unplanned task offers no Clear plan (not executable)", () => {
    const cmds = buildFocusedTaskCommands(
      focusedDeps({ task: task({ scheduledDate: null }) }),
    );
    expect(cmds.some((c) => c.id === "today.task.t1.clear_plan")).toBe(false);
    expect(cmds.some((c) => c.id === "today.task.t1.plan_today")).toBe(true);
  });

  it("a completed task exposes only Reopen — never a planning command", () => {
    const cmds = buildFocusedTaskCommands(
      focusedDeps({ done: true, task: task({ completed: true }) }),
    );
    const toggle = cmds.find((c) => c.id === "today.task.t1.toggle");
    expect(toggle?.title).toBe("Reopen task");
    expect(cmds.some((c) => c.id.startsWith("today.task.t1.plan_"))).toBe(
      false,
    );
    expect(cmds.some((c) => c.id === "today.task.t1.clear_plan")).toBe(false);
  });

  it("routes complete and plan to the supplied callbacks", () => {
    const onToggleDone = vi.fn();
    const onPlan = vi.fn();
    const cmds = buildFocusedTaskCommands(
      focusedDeps({ onToggleDone, onPlan }),
    );
    const run = (suffix: string) => {
      const cmd = cmds.find((c) => c.id === `today.task.t1.${suffix}`)!;
      if (cmd.kind === "run") cmd.run();
    };
    run("toggle");
    run("plan_today");
    run("clear_plan");
    expect(onToggleDone).toHaveBeenCalledTimes(1);
    expect(onPlan).toHaveBeenNthCalledWith(1, TARGETS.today);
    expect(onPlan).toHaveBeenNthCalledWith(2, null);
  });

  it("omits planning entirely when targets are unavailable", () => {
    const cmds = buildFocusedTaskCommands(focusedDeps({ targets: undefined }));
    expect(cmds.some((c) => c.id.startsWith("today.task.t1.plan_"))).toBe(
      false,
    );
    // Open and complete still work without planning targets.
    expect(cmds.some((c) => c.id === "today.task.t1.toggle")).toBe(true);
  });
});
