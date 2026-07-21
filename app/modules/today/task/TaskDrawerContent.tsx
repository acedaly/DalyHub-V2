/**
 * TODAY-02 / TODAY-05 — the Today task Drawer content.
 *
 * A thin Today wrapper around the shared, re-homed `TaskRecordDrawer` (the ONE task
 * record Drawer, task action route and completion path — now owned by the Tasks
 * module, ADR-033). The wrapper adds ONLY the Today-specific behaviour: registering
 * the open task's contextual keyboard commands (C / P / Shift+P / Clear waiting,
 * TODAY-05) around the shared surface. It observes the drawer's live task state and
 * mutation handlers through the shared `onApiChange` seam, so nothing about the task
 * record — its fields, forms, mutations, activity or routes — is duplicated.
 *
 * Command ownership rules are unchanged: only the INTERACTIVE TOP drawer owns its
 * task's shortcuts, so a lower task drawer (with another drawer stacked above it)
 * keeps its state but not its shortcuts, and when a task Drawer is open the dashboard
 * defers to this registration (no double registration, no stale Drawer). Availability
 * reflects task state: a completed task offers only Reopen; an unplanned task offers
 * no Clear plan; only a waiting task offers Clear waiting. Every command drives the
 * SAME trusted route the visible controls use (ADR-024 §24.14).
 */

import { useMemo, useState } from "react";

import type { AppAction } from "~/shared/commands/action";
import { useRegisterContextualActions } from "~/shared/commands/CommandContextProvider";
import { ownerCalendarIso } from "~/shared/datetime";
import {
  TaskRecordDrawer,
  type TaskRecordDrawerApi,
} from "~/shared/task-record/TaskRecordDrawer";

import { buildFocusedTaskCommands } from "../keyboard/today-commands";
import { planTargets } from "./planning-view";

interface TaskDrawerContentProps {
  readonly taskId: string;
  /**
   * Whether THIS task drawer is the interactive top drawer (from `DrawerEntry.isTop`).
   * Contextual task commands register ONLY while it is the top — otherwise those keys
   * could mutate a task hidden behind, say, the keyboard-help drawer. Defaults to true
   * so a plain single-drawer use is unaffected.
   */
  readonly isTop?: boolean;
}

export function TaskDrawerContent({
  taskId,
  isTop = true,
}: TaskDrawerContentProps) {
  const [api, setApi] = useState<TaskRecordDrawerApi | null>(null);

  const activeTask = api?.task ?? null;
  const activeCompleted = api?.completed ?? false;
  const activeWaiting = api?.waitingActive ?? false;

  const taskCommands = useMemo<readonly AppAction[]>(() => {
    // Only the INTERACTIVE TOP drawer owns its task's shortcuts.
    if (api === null || activeTask === null || !isTop) {
      return [];
    }
    const targets = planTargets(ownerCalendarIso(new Date()));
    const commands: AppAction[] = [
      ...buildFocusedTaskCommands({
        task: {
          id: activeTask.id,
          title: activeTask.title,
          parent: null,
          scheduledDate: activeTask.scheduledDate,
          dueDate: activeTask.dueDate,
          completed: activeCompleted,
          completedDate: null,
        },
        done: activeCompleted,
        targets,
        isOpen: true,
        onToggleDone: () => api.toggleCompletion(!activeCompleted),
        onOpen: () => {},
        onClose: () => api.close(),
        onPlan: (date) =>
          date === null ? void api.clearPlan() : void api.planTask(date),
      }),
    ];
    if (activeWaiting) {
      commands.push({
        id: `today.task.${activeTask.id}.clear_waiting`,
        title: "Clear waiting",
        subtitle: activeTask.title,
        keywords: ["waiting", "clear", "unblock", "resume", "no longer"],
        kind: "run",
        run: () => {
          void api.clearWaiting();
          return { ok: true };
        },
      });
    }
    return commands;
  }, [api, isTop, activeTask, activeCompleted, activeWaiting]);
  useRegisterContextualActions(taskCommands);

  return <TaskRecordDrawer taskId={taskId} onApiChange={setApi} />;
}
