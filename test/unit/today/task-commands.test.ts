import { describe, expect, it, vi } from "vitest";

import {
  buildFocusedTaskCommands,
  type CommandTaskFacts,
  type FocusedTaskCommandDeps,
} from "~/modules/today/task/task-commands";

/**
 * The per-task keyboard command builder. It emits the SAME `AppAction` identity
 * the palette and the shortcuts share; availability is by omission, and a
 * completed task's restrictions are represented rather than assumed.
 */

const TARGETS = {
  today: "2026-07-21",
  tomorrow: "2026-07-22",
  nextWeek: "2026-07-28",
};

function task(overrides: Partial<CommandTaskFacts> = {}): CommandTaskFacts {
  return {
    id: "t1",
    title: "Ship it",
    scheduledDate: "2026-07-21",
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
    const cmds = buildFocusedTaskCommands(focusedDeps({ done: true }));
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
