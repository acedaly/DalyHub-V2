/**
 * TASKS-03 — the Tasks collection PRESENTATION vocabulary (pure, React-free).
 *
 * One place owns every label the Tasks workspace shows for a filter dimension, a
 * sort, a grouping bucket or a view — so the desktop chip row, the phone sheet, the
 * group headings and the saved-view descriptions can never drift apart. Kept out of
 * React so the wording is unit-testable directly.
 *
 * Two deliberate vocabulary decisions are encoded here:
 *
 *   - **There is ONE priority vocabulary.** P1–P4, labelled by urgency. Until V2.2
 *     the same stored field also carried the Eisenhower action words
 *     (Do/Defer/Delegate/Delete) so the Matrix and the list could each read it their
 *     own way; with the Matrix removed (TASKS-05) the second vocabulary had no
 *     surface left, and keeping it would have meant maintaining two names for one
 *     field to serve nothing.
 *   - **Every state carries a WORD.** No option, chip or heading relies on colour,
 *     an icon or a position to be understood (AGENTS.md §15).
 */

import type { TaskGroupBy, TaskPresentation } from "~/kernel/task-views";
import {
  TASK_DUE_STATES,
  TASK_PLANNED_STATES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TIME_SECTORS,
  type TaskSort,
} from "~/kernel/tasks";
import {
  taskPriorityLabel,
  taskStatusLabel,
  timeSectorLabel,
} from "~/shared/task-record/task-view";

/** The primary presentations, in switcher order. */
export const PRESENTATION_LABELS: Record<TaskPresentation, string> = {
  list: "List",
  board: "Board",
  sectors: "Sectors",
};

/**
 * A one-line description of each presentation, shown in the phone sheet so the
 * choice is understandable before it is made.
 */
export const PRESENTATION_DESCRIPTIONS: Record<TaskPresentation, string> = {
  list: "One calm, ordered list.",
  board: "Grouped columns you can scan side by side.",
  sectors: "Time Sectors, for planning windows.",
};

export const SORT_LABELS: Record<TaskSort, string> = {
  smart: "Smart",
  due_date: "Due date",
  scheduled_date: "Planned date",
  priority: "Priority",
  created: "Created",
  updated: "Updated",
  title: "Title",
  parent: "Parent",
};

export const GROUP_BY_LABELS: Record<TaskGroupBy, string> = {
  none: "No grouping",
  priority: "Priority",
  due_state: "Due state",
  planned: "Planned date",
  status: "Status",
  parent: "Parent",
  delegate: "Delegated to",
  sector: "Time sector",
};

/**
 * The due-state vocabulary, shared by the filter, the chips and the headings.
 *
 * The wording is exact because the states are mutually exclusive: "Due later this
 * week" is the window AFTER today, and a finished task with a past due date reads
 * "Was due earlier" rather than being called overdue.
 */
export const DUE_STATE_LABELS: Record<string, string> = {
  overdue: "Overdue",
  due_past: "Was due earlier",
  due_today: "Due today",
  due_this_week: "Due later this week",
  due_later: "Due later",
  no_due_date: "No due date",
};

/** The planned-state vocabulary, over the SCHEDULED date (not the due date). */
export const PLANNED_STATE_LABELS: Record<string, string> = {
  planned_today: "Planned today",
  planned_this_week: "Planned later this week",
  planned_earlier: "Planned earlier",
  planned_later: "Planned later",
  unplanned: "Unplanned",
};

export const PARENT_KIND_LABELS: Record<string, string> = {
  project: "In a Project",
  area: "In an Area",
  none: "Unassigned",
};

export const RECENCY_LABELS: Record<string, string> = {
  "1d": "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

export const COMPLETED_VISIBILITY_LABELS: Record<string, string> = {
  default: "As the view defines",
  hide: "Hide completed",
  include: "Show completed",
  only: "Completed only",
};

export const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  TASK_STATUSES.map((status) => [status, taskStatusLabel(status)]),
);

/**
 * The priority filter's labels: the ONE everyday urgency vocabulary (UX-01). Before
 * V2.2 each option also carried the Matrix's action word; with the Matrix gone the
 * filter and the chips say the same thing the row does.
 */
export const PRIORITY_FILTER_LABELS: Record<string, string> = {
  ...Object.fromEntries(
    TASK_PRIORITIES.map((priority) => [priority, taskPriorityLabel(priority)]),
  ),
  __none: "No priority",
};

/**
 * The label used in a chip or a group heading. Identical to the filter's labels plus
 * the SERVER's `untriaged` bucket key, so a filter option and the heading it produces
 * can never read differently.
 */
export const PRIORITY_SHORT_LABELS: Record<string, string> = {
  ...PRIORITY_FILTER_LABELS,
  untriaged: "No priority",
};

export const SECTOR_LABELS: Record<string, string> = {
  ...Object.fromEntries(
    TIME_SECTORS.map((sector) => [sector, timeSectorLabel(sector)]),
  ),
  __none: "No sector",
};

/**
 * The human label for a server bucket key, given the grouping dimension. Open-ended
 * dimensions (parent, delegate) carry their label on the group itself, resolved by
 * the repository from the row — never by a second query.
 */
export function groupBucketLabel(
  dimension: string,
  key: string,
  labelFromServer: string | null,
): string {
  switch (dimension) {
    case "priority":
      return PRIORITY_SHORT_LABELS[key] ?? key;
    case "sector":
      return SECTOR_LABELS[key] ?? key;
    case "status":
      return key === "completed" ? "Completed" : (STATUS_LABELS[key] ?? key);
    case "due_state":
      return DUE_STATE_LABELS[key] ?? key;
    case "planned":
      return PLANNED_STATE_LABELS[key] ?? key;
    case "parent":
      return key === "__none" ? "Unassigned" : (labelFromServer ?? "Parent");
    case "delegate":
      return key === "__none"
        ? "Not delegated"
        : (labelFromServer ?? "Delegated");
    default:
      return key;
  }
}

/**
 * The DECLARED bucket order for a closed dimension, or null for an open-ended one
 * (parent, delegate), which is ordered by size at render time.
 *
 * A closed dimension's order is meaningful — priority runs P1→P4, due state runs
 * most-urgent→least — so it is declared here rather than left to whatever order the
 * database returned.
 */
export function declaredBucketOrder(
  dimension: string,
): readonly string[] | null {
  switch (dimension) {
    case "priority":
      return [...TASK_PRIORITIES, "untriaged"];
    case "sector":
      return ["__none", ...TIME_SECTORS];
    case "status":
      return [...TASK_STATUSES, "completed"];
    case "due_state":
      return [...TASK_DUE_STATES];
    case "planned":
      return [...TASK_PLANNED_STATES];
    default:
      return null;
  }
}

/**
 * Whether EMPTY buckets of a dimension must still be rendered.
 *
 * Only the Time Sectors planning view needs them: a board with a missing window
 * hides the fact that nothing is planned for it. Everywhere else an empty group is
 * noise, so it is hidden.
 */
export function showsEmptyBuckets(dimension: string): boolean {
  return dimension === "sector";
}
