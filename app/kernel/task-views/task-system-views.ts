/**
 * TASKS-03 — the built-in Tasks views, DERIVED rather than stored.
 *
 * Each system view is a name plus a {@link TaskViewConfig} expressed in exactly the
 * same vocabulary a user-created view uses. Deriving them has three consequences
 * that all matter:
 *
 *   - they cost no storage and no migration, and a new workspace has them on day
 *     one without a seeding step that could half-fail;
 *   - they cannot be deleted or silently mutated, because there is no row to
 *     delete or update — the DEFINITION is code, reviewed like code;
 *   - selecting one produces an ordinary URL, so it is shareable, bookmarkable and
 *     Back/Forward-correct exactly like any other configuration.
 *
 * "Today" here is a SCOPE over the canonical planning fields (the `today` kernel
 * system view: open, non-terminal, scheduled for the owner's calendar day). It is
 * not a second definition of Today — the Today dashboard keeps its own canonical
 * rules and this reuses the kernel view rather than restating it.
 */

import {
  DEFAULT_TASK_VIEW_CONFIG,
  type TaskViewConfig,
} from "./task-view-config";

/** A built-in view: a stable id, a display name, a one-line purpose and a config. */
export interface TaskSystemViewDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly config: TaskViewConfig;
}

function derived(
  id: string,
  name: string,
  description: string,
  config: Partial<TaskViewConfig>,
): TaskSystemViewDefinition {
  return {
    id,
    name,
    description,
    config: { ...DEFAULT_TASK_VIEW_CONFIG, ...config },
  };
}

/**
 * The built-in views, in the order they are offered. `default` is the standard
 * unfiltered workspace — the always-available way back to normal.
 */
export const TASK_SYSTEM_VIEW_DEFINITIONS: readonly TaskSystemViewDefinition[] =
  [
    derived("default", "All active", "Everything actionable right now.", {}),
    derived("inbox", "Inbox", "Unassigned active tasks.", {
      systemView: "inbox",
    }),
    derived("today", "Today", "Planned for today.", { systemView: "today" }),
    derived("upcoming", "Upcoming", "Planned or due after today.", {
      systemView: "upcoming",
      sort: "scheduled_date",
    }),
    derived("overdue", "Overdue", "Past its date and still open.", {
      systemView: "overdue",
      sort: "due_date",
    }),
    derived("waiting", "Waiting", "Blocked on someone or something else.", {
      systemView: "waiting",
    }),
    derived("delegated", "Delegated", "Handed to someone else.", {
      systemView: "all",
      filters: { delegated: true, completed: "hide" },
    }),
    derived("someday", "Someday / Maybe", "Parked, not committed to.", {
      systemView: "someday",
    }),
    derived("completed", "Completed", "Finished work, most recent first.", {
      systemView: "completed",
      sort: "updated",
    }),
  ];

/** Look up a built-in view by id. */
export function findTaskSystemView(
  id: string | null | undefined,
): TaskSystemViewDefinition | undefined {
  if (id === null || id === undefined) return undefined;
  return TASK_SYSTEM_VIEW_DEFINITIONS.find((view) => view.id === id);
}

/** True when `id` names a built-in view (which can never be deleted or edited). */
export function isTaskSystemViewId(id: string | null | undefined): boolean {
  return findTaskSystemView(id) !== undefined;
}
