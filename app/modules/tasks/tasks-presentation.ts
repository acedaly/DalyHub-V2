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
 *   - **Priority IS the Eisenhower quadrant.** P1–P4 and Do/Defer/Delegate/Delete
 *     are one axis, not two (ADR-043 §2). Offering them as two filters would imply
 *     two independent fields and let a user build a contradiction. Instead the ONE
 *     priority filter carries BOTH vocabularies in its labels, and the Matrix keeps
 *     the methodological wording where it is genuinely methodological.
 *   - **Every state carries a WORD.** No option, chip or heading relies on colour,
 *     an icon or a position to be understood (AGENTS.md §15).
 */

import {
  TASK_GROUP_BYS,
  TASK_PRESENTATIONS,
  type TaskGroupBy,
  type TaskPresentation,
} from "~/kernel/task-views";
import {
  TASK_DUE_STATES,
  TASK_PLANNED_STATES,
  TASK_PRIORITIES,
  TASK_RECENCY_WINDOWS,
  TASK_SORTS,
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
  matrix: "Matrix",
  sectors: "Sectors",
};

/**
 * A one-line description of each presentation, shown in the phone sheet so the
 * choice is understandable before it is made.
 */
export const PRESENTATION_DESCRIPTIONS: Record<TaskPresentation, string> = {
  list: "One calm, ordered list.",
  board: "Grouped columns you can scan side by side.",
  matrix: "The Eisenhower 2×2, for triage.",
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

/**
 * Whether reversing a sort is meaningful. `smart` is deliberately excluded: "least
 * relevant first" is not a useful order, and offering it would make the default
 * view unpredictable.
 */
export function sortSupportsDirection(sort: TaskSort): boolean {
  return sort !== "smart";
}

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

/** The due-state vocabulary, shared by the filter, the chips and the headings. */
export const DUE_STATE_LABELS: Record<string, string> = {
  overdue: "Overdue",
  due_today: "Due today",
  due_this_week: "Due this week",
  due_later: "Due later",
  no_due_date: "No due date",
};

/** The planned-state vocabulary, over the SCHEDULED date (not the due date). */
export const PLANNED_STATE_LABELS: Record<string, string> = {
  planned_today: "Planned today",
  planned_this_week: "Planned this week",
  planned_earlier: "Planned earlier",
  planned_later: "Planned later",
  unplanned: "Unplanned",
};

export const PARENT_KIND_LABELS: Record<string, string> = {
  project: "In a Project",
  area: "In an Area",
  none: "No parent",
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
 * Priority labels carrying BOTH vocabularies: the everyday urgency word (UX-01) and
 * the Eisenhower action the Matrix uses, so one filter serves both mental models.
 */
export const PRIORITY_FILTER_LABELS: Record<string, string> = {
  p1: "P1 · Urgent — Do",
  p2: "P2 · High — Defer",
  p3: "P3 · Normal — Delegate",
  p4: "P4 · Low — Delete / Review",
  __none: "No priority",
};

/** The short label used in a chip or a group heading (no methodology wording). */
export const PRIORITY_SHORT_LABELS: Record<string, string> = {
  ...Object.fromEntries(
    TASK_PRIORITIES.map((priority) => [priority, taskPriorityLabel(priority)]),
  ),
  __none: "No priority",
  untriaged: "No priority",
};

export const SECTOR_LABELS: Record<string, string> = {
  ...Object.fromEntries(
    TIME_SECTORS.map((sector) => [sector, timeSectorLabel(sector)]),
  ),
  __none: "Inbox (no sector)",
  inbox: "Inbox",
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
    case "quadrant":
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
      return key === "__none" ? "No parent" : (labelFromServer ?? "Parent");
    case "delegate":
      return key === "__none" ? "Not delegated" : (labelFromServer ?? "Delegated");
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
export function declaredBucketOrder(dimension: string): readonly string[] | null {
  switch (dimension) {
    case "quadrant":
    case "priority":
      return [...TASK_PRIORITIES, "untriaged"];
    case "sector":
      return ["inbox", ...TIME_SECTORS];
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
 * Only the specialist planning views need them: an Eisenhower matrix with a missing
 * quadrant is not a matrix, and a Time Sectors board with a missing window hides
 * the fact that nothing is planned for it. Everywhere else an empty group is noise,
 * so it is hidden.
 */
export function showsEmptyBuckets(dimension: string): boolean {
  return dimension === "quadrant" || dimension === "sector";
}

/** The valid presentation list, re-exported so the UI never re-declares it. */
export const PRESENTATION_OPTIONS = TASK_PRESENTATIONS;
export const GROUP_BY_OPTIONS = TASK_GROUP_BYS;
export const SORT_OPTIONS = TASK_SORTS;
export const RECENCY_OPTIONS = TASK_RECENCY_WINDOWS;
