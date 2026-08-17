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
    /*
     * UIX-01 — the three everyday views open GROUPED BY DUE STATE.
     *
     * A flat list of every actionable task, ordered by a smart sort nobody can
     * see, is the arrangement that made `/tasks` read as a database table: the
     * owner's first question is always "what has slipped, and what is on
     * today?", and answering it meant reading dates down the right-hand edge.
     * Grouping is not new — the dimension, the server buckets, the counts and
     * the per-bucket bounds have all existed since TASKS-03 — it was simply
     * never the default, so the everyday path never got it.
     *
     * `today`, `overdue`, `waiting`, `someday`, `completed` and `deleted` are
     * deliberately left FLAT: each is already a single due state, a single
     * lifecycle state, or ordered by when it finished, so banding them by due
     * state produces one group with a redundant heading over it.
     *
     * A saved view stores its own grouping and is unaffected, and `?group=none`
     * still returns the flat list for anyone who prefers it.
     */
    derived("default", "All active", "Everything actionable right now.", {
      groupBy: "due_state",
    }),
    /*
     * PLAN-01 — the OPEN scope, as a built-in view.
     *
     * The kernel gained an `open` system view for the planning week (still
     * committed, not yet finished — the one scope that keeps waiting and on-hold
     * work), and a scope with no view of its own is a real hazard rather than
     * merely an omission: a URL that names one falls back to ALL ACTIVE's
     * configuration, so `?system=open` would silently become "Open, grouped by
     * due state", report itself as "Custom", and be unsaveable as the thing it
     * is. That is exactly the failure UIX-01 fixed for the other scopes.
     *
     * It is also a view an owner wants: "everything I am still committed to,
     * including what is blocked" is the honest superset of All active, and the
     * only place the two differ is the parked states — which is why the
     * description says so rather than leaving the difference to be discovered.
     *
     * Left FLAT for the reason the other single-state views are: its population
     * is a lifecycle scope, and banding it by due state would put one heading
     * over most of it.
     */
    derived(
      "open",
      "Open",
      "Everything still committed to, including blocked work.",
      { systemView: "open" },
    ),
    derived("inbox", "Inbox", "Unassigned active tasks.", {
      systemView: "inbox",
      groupBy: "due_state",
    }),
    derived("today", "Today", "Planned for today.", { systemView: "today" }),
    derived("upcoming", "Upcoming", "Planned or due after today.", {
      systemView: "upcoming",
      sort: "scheduled_date",
      groupBy: "due_state",
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
    // TASKS-06 — the durable second path back from a bulk delete. It is a real view
    // rather than a hidden route because "where did those 18 tasks go?" must have an
    // answer the owner can reach without being told about it in advance.
    derived("deleted", "Deleted", "Removed, and restorable from here.", {
      systemView: "deleted",
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
