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
/**
 * UIX-01 — the same due states as GROUP HEADINGS.
 *
 * A filter option and a group heading are read in different places and want
 * different words. An option in a list of sixteen dimensions has to disambiguate
 * itself ("Due later this week" against "Due later"); a heading sits directly
 * above the rows it describes, in small caps, with the count beside it, and the
 * word "Due" on all five of them is five copies of a fact the column already
 * states. So a heading says the WHEN and nothing else.
 *
 * The semantics are identical — same keys, same buckets, same server dimension.
 * Only the wording is shorter, and the filter chip that put the rows there still
 * reads in the fuller vocabulary.
 */
export const DUE_STATE_GROUP_HEADINGS: Record<string, string> = {
  overdue: "Overdue",
  due_past: "Was due earlier",
  due_today: "Today",
  due_this_week: "This week",
  due_later: "Later",
  no_due_date: "No date",
};

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
 * The label used in a chip or a group heading. Identical to the filter's labels.
 *
 * CONTROL-01 — the SERVER no longer produces an `untriaged` priority bucket: the
 * grouping query coalesces `null` to `p4`, because `null` IS Priority 4. The key
 * is kept mapped so a cursor issued before that change still renders a heading
 * rather than a raw bucket key, and it reads "Priority 4" — the one name the
 * state has.
 */
export const PRIORITY_SHORT_LABELS: Record<string, string> = {
  ...PRIORITY_FILTER_LABELS,
  untriaged: PRIORITY_FILTER_LABELS.p4 ?? "Priority 4",
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
      return DUE_STATE_GROUP_HEADINGS[key] ?? DUE_STATE_LABELS[key] ?? key;
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
      /*
       * CONTROL-01 — four buckets in practice: the grouping query coalesces
       * `null` into `p4`, because `null` IS Priority 4, so `untriaged` is never
       * occupied and an unoccupied bucket is not rendered.
       *
       * It stays in the ORDER anyway. A bucket the server sends that this list
       * does not name is DROPPED, not shown unordered — so removing the key
       * would turn a cursor issued before the coalesce from "a section labelled
       * Priority 4" into "those tasks are gone", which is the worse of the two
       * failures by a wide margin.
       */
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
