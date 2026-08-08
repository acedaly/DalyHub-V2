/**
 * The per-task keyboard commands (pure, testable).
 *
 * These build the transient CONTEXTUAL `AppAction`s an OPEN task record registers
 * with the shared command system (DS-09). They are the SAME `AppAction` identity
 * that becomes a palette command and a keyboard shortcut, so the keyboard and the
 * mouse share one execution path (ADR-024 §24.14). Availability is expressed by
 * OMISSION — an unavailable command is not returned.
 *
 * The Today-surface GLOBAL commands that used to live beside these (focus the task
 * list, jump to a planning section, select all, bulk-plan the selection) went with
 * the roving multi-select collection the Today redesign replaced. Their execution
 * paths are untouched: bulk planning still lives in the Tasks module, and the
 * per-task planning commands below still post to the trusted `/tasks/:id` action.
 *
 * Everything here is a pure function of typed inputs plus caller-supplied
 * callbacks, so the command set (ids, titles, shortcuts, ordering, availability)
 * is unit-tested without React. Nothing here mutates.
 */

import type { AppAction } from "~/shared/commands/action";

import type { PlanTargets } from "~/shared/task-record/plan-targets";

/**
 * The minimum a task must expose for its commands to be built: an identity, a
 * name for the subtitle, and whether it currently carries a plan (which decides
 * whether "Clear plan" is offered at all).
 */
export interface CommandTaskFacts {
  readonly id: string;
  readonly title: string;
  readonly scheduledDate: string | null;
}

export interface FocusedTaskCommandDeps {
  /** The primary task (focused in the list, or open in the Drawer). */
  readonly task: CommandTaskFacts;
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
 * The per-task keyboard commands for the open task. Availability reflects task
 * state: a completed task exposes only Open/Close and Reopen — never a planning
 * command (planning is open-work only, ADR-030); an unplanned task does not expose
 * Clear plan. The direct shortcuts `C` (complete/reopen), `P` (plan today) and
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
