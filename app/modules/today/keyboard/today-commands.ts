/**
 * TODAY-05 — the Today keyboard command builders (pure, testable).
 *
 * These build the transient CONTEXTUAL `AppAction`s the Today surface registers with
 * the shared command system (DS-09) — the global focus/selection commands that make
 * Today navigable by keyboard, and the per-task commands for the focused or open
 * task. They are the SAME `AppAction` identity that becomes a palette command, a Card
 * action and a keyboard shortcut, so keyboard and mouse share one execution path
 * (ADR-024 §24.14). Availability is expressed by OMISSION (an unavailable command is
 * not returned) — the honest contract the palette already implements.
 *
 * Everything here is a pure function of typed inputs plus caller-supplied callbacks,
 * so the command set (ids, titles, shortcuts, ordering, availability) is unit-tested
 * without React. Nothing here mutates: the callbacks route to the same trusted
 * `/today/plan` and `/today/task/:id` paths the visible controls use.
 */

import type { AppAction } from "~/shared/commands/action";

import type { PlanTargets, PlanningTaskItem } from "../task/planning-view";

/** A Today section the keyboard can jump to. */
export interface TodaySectionTarget {
  /** The planning bucket key (`overdue` / `today` / `upcoming` / `anytime`). */
  readonly bucket: string;
  /** The human label ("Overdue"). */
  readonly label: string;
  /** How many tasks it holds (0 → the "focus section" command is omitted). */
  readonly count: number;
}

export interface TodayGlobalCommandDeps {
  /** The sections that currently exist, in visual order. */
  readonly sections: readonly TodaySectionTarget[];
  /** Whether any open (non-completed) task is visible. */
  readonly hasOpenTasks: boolean;
  /** How many tasks are currently selected. */
  readonly selectionCount: number;
  readonly focusTaskList: () => void;
  readonly focusSection: (bucket: string) => void;
  readonly selectAll: () => void;
  readonly clearSelection: () => void;
  readonly openHelp: () => void;
}

/**
 * The global Today keyboard commands: focus the task list, focus a section, select
 * all open tasks, clear selection, and open the keyboard-shortcuts reference. Only
 * commands with a real target right now are returned (no placeholders).
 */
export function buildTodayGlobalCommands(
  deps: TodayGlobalCommandDeps,
): readonly AppAction[] {
  const actions: AppAction[] = [];

  if (deps.hasOpenTasks) {
    actions.push({
      id: "today.cmd.focus_task_list",
      title: "Focus task list",
      subtitle: "Move keyboard focus to the first task",
      keywords: ["focus", "list", "tasks", "navigate", "keyboard"],
      kind: "run",
      run: () => {
        deps.focusTaskList();
        return { ok: true };
      },
    });
  }

  for (const section of deps.sections) {
    if (section.count <= 0) {
      continue;
    }
    actions.push({
      id: `today.cmd.focus_section.${section.bucket}`,
      title: `Go to ${section.label}`,
      subtitle: `Jump to the ${section.label} section`,
      keywords: ["focus", "section", "jump", section.label.toLowerCase()],
      kind: "run",
      run: () => {
        deps.focusSection(section.bucket);
        return { ok: true };
      },
    });
  }

  if (deps.hasOpenTasks) {
    actions.push({
      id: "today.cmd.select_all",
      title: "Select all open tasks",
      subtitle: "Select every visible open task for a bulk action",
      keywords: ["select", "all", "multi", "bulk"],
      kind: "run",
      run: () => {
        deps.selectAll();
        return { ok: true };
      },
    });
  }

  if (deps.selectionCount > 0) {
    actions.push({
      id: "today.cmd.clear_selection",
      title: "Clear selection",
      subtitle: `Deselect ${deps.selectionCount} selected ${
        deps.selectionCount === 1 ? "task" : "tasks"
      }`,
      keywords: ["clear", "deselect", "selection", "none"],
      kind: "run",
      run: () => {
        deps.clearSelection();
        return { ok: true };
      },
    });
  }

  actions.push({
    id: "today.cmd.keyboard_help",
    title: "Keyboard shortcuts",
    subtitle: "Show the Today keyboard reference",
    keywords: ["keyboard", "shortcuts", "help", "keys", "reference"],
    shortcut: { key: "?", modifiers: ["shift"] },
    kind: "run",
    run: () => {
      deps.openHelp();
      return { ok: true };
    },
  });

  return actions;
}

export interface FocusedTaskCommandDeps {
  /** The primary task (focused in the list, or open in the Drawer). */
  readonly task: PlanningTaskItem;
  /** Its resolved completion state (respecting any optimistic override). */
  readonly done: boolean;
  /** The quick-plan target dates, or undefined when planning is unavailable. */
  readonly targets: PlanTargets | undefined;
  /** Whether this task's Drawer is currently open. */
  readonly isOpen: boolean;
  readonly onToggleDone: () => void;
  readonly onOpen: () => void;
  readonly onClose: () => void;
  readonly onPlan: (scheduledDate: string | null) => void;
}

/**
 * The per-task keyboard commands for the primary (focused or open) task. Availability
 * reflects task state: a completed task exposes only Open/Close and Reopen — never a
 * planning command (planning is open-work only, ADR-030); an unplanned task does not
 * expose Clear plan. The direct shortcuts `C` (complete/reopen), `P` (plan today) and
 * `Shift+P` (move to tomorrow) ride on these commands, so the shortcut and the
 * palette command are one identity.
 */
export function buildFocusedTaskCommands(
  deps: FocusedTaskCommandDeps,
): readonly AppAction[] {
  const { task, done, targets, isOpen } = deps;
  const id = task.id;
  const subtitle = task.title;
  const actions: AppAction[] = [];

  if (!isOpen) {
    actions.push({
      id: `today.task.${id}.open`,
      title: "Open task",
      subtitle,
      keywords: ["open", "task", "drawer", "details"],
      kind: "run",
      run: () => {
        deps.onOpen();
        return { ok: true };
      },
    });
  } else {
    actions.push({
      id: `today.task.${id}.close`,
      title: "Close task",
      subtitle,
      keywords: ["close", "task", "drawer", "dismiss"],
      kind: "run",
      run: () => {
        deps.onClose();
        return { ok: true };
      },
    });
  }

  actions.push({
    id: `today.task.${id}.toggle`,
    title: done ? "Reopen task" : "Complete task",
    subtitle,
    keywords: ["complete", "done", "reopen", "task", "tick"],
    shortcut: { key: "c" },
    kind: "run",
    run: () => {
      deps.onToggleDone();
      return { ok: true };
    },
  });

  // Planning is open-work only: a completed task never exposes a plan command.
  if (!done && targets !== undefined) {
    const plan = (
      verb: string,
      title: string,
      date: string,
      shortcut?: AppAction["shortcut"],
    ): AppAction => ({
      id: `today.task.${id}.${verb}`,
      title,
      subtitle,
      keywords: ["plan", "schedule", verb.replace("plan_", "")],
      ...(shortcut ? { shortcut } : {}),
      kind: "run",
      run: () => {
        deps.onPlan(date);
        return { ok: true };
      },
    });
    actions.push(
      plan("plan_today", "Plan for Today", targets.today, { key: "p" }),
      plan("plan_tomorrow", "Move to Tomorrow", targets.tomorrow, {
        key: "p",
        modifiers: ["shift"],
      }),
      plan("plan_next_week", "Plan for Next Week", targets.nextWeek),
    );

    // Clear plan is executable only when the task is actually planned.
    if (task.scheduledDate !== null) {
      actions.push({
        id: `today.task.${id}.clear_plan`,
        title: "Clear plan",
        subtitle,
        keywords: ["clear", "unschedule", "remove", "plan"],
        kind: "run",
        run: () => {
          deps.onPlan(null);
          return { ok: true };
        },
      });
    }
  }

  return actions;
}
