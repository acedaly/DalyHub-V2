/**
 * TASKS-03 — the Tasks control groups (pure, React-free).
 *
 * ONE declaration of every filter, sort, grouping and view control the Tasks
 * workspace offers, expressed in the SHARED `CollectionControlGroup` model
 * (MOBILE-01). That single declaration drives, without restating itself:
 *
 *   - the shared collection sheet (the control surface at every width);
 *   - the shared removable filter chips and the Reset action;
 *   - the active-filter count on the Filter button.
 *
 * Because the model is param-based, every control is URL-backed by construction —
 * there is no second filter store to keep in step, and Back/Forward is correct for
 * free.
 *
 * The groups deliberately contain only CLOSED option sets. A filter over a searched
 * record — a specific Project or Area — stays a server-backed picker passed to the
 * sheet as a child, so the sheet never loads a collection in order to filter it.
 */

import type { CollectionControlGroup } from "~/shared/collection-layout";
import {
  TASK_COMPLETED_VISIBILITIES,
  TASK_DUE_STATES,
  TASK_PARENT_KINDS,
  TASK_PLANNED_STATES,
  TASK_PRIORITIES,
  TASK_RECENCY_WINDOWS,
  TASK_SORTS,
  TASK_STATUSES,
  TIME_SECTORS,
} from "~/kernel/tasks";
import {
  DEFAULT_TASK_VIEW_CONFIG,
  TASK_DENSITIES,
  TASK_GROUP_BYS,
  TASK_PRESENTATIONS,
} from "~/kernel/task-views";

import {
  COMPLETED_VISIBILITY_LABELS,
  DUE_STATE_LABELS,
  GROUP_BY_LABELS,
  PARENT_KIND_LABELS,
  PLANNED_STATE_LABELS,
  PRESENTATION_DESCRIPTIONS,
  PRESENTATION_LABELS,
  PRIORITY_FILTER_LABELS,
  RECENCY_LABELS,
  SECTOR_LABELS,
  SORT_LABELS,
  STATUS_LABELS,
} from "./tasks-presentation";
import { TASKS_FILTER_PARAMS, TASKS_PARAMS } from "./tasks-url-state";

/** A delegatee offered as a filter option, resolved server-side from real records. */
export interface DelegateOption {
  readonly value: string;
  readonly label: string;
}

/** A Project/Area offered as a parent filter option, resolved server-side. */
export interface ParentFilterOption {
  readonly id: string;
  readonly kind: "area" | "project";
  readonly title: string;
}

export interface TasksControlInputs {
  /**
   * The distinct delegatees present in the workspace, resolved by ONE bounded
   * query. Offering only real values keeps this a closed option set — the sheet
   * never has to search, and a filter can never name someone who does not exist.
   */
  readonly delegates: readonly DelegateOption[];
  /** The Projects and Areas offered as a parent filter, bounded and workspace-scoped. */
  readonly parents: readonly ParentFilterOption[];
}

const ANY = "";

/**
 * Build the complete Tasks control-group declaration.
 *
 * Ordering is deliberate: the controls a user reaches for most (view, status,
 * priority, dates) come first, and the shaping controls (layout, grouping, sort,
 * density) come last — the same order in the sheet as in the chip row.
 */
export function buildTasksControlGroups(
  inputs: TasksControlInputs,
): readonly CollectionControlGroup[] {
  const groups: CollectionControlGroup[] = [
    {
      id: "status",
      label: "Status",
      param: TASKS_FILTER_PARAMS.status,
      options: [
        { value: ANY, label: "Any status" },
        ...TASK_STATUSES.map((status) => ({
          value: status,
          label: STATUS_LABELS[status] ?? status,
        })),
      ],
    },
    {
      id: "priority",
      label: "Priority",
      param: TASKS_FILTER_PARAMS.priority,
      options: [
        { value: ANY, label: "Any priority" },
        ...TASK_PRIORITIES.map((priority) => ({
          value: priority,
          label: PRIORITY_FILTER_LABELS[priority] ?? priority,
        })),
        { value: "__none", label: PRIORITY_FILTER_LABELS.__none },
      ],
    },
    {
      id: "due",
      label: "Due",
      param: TASKS_FILTER_PARAMS.dueState,
      options: [
        { value: ANY, label: "Any due date" },
        ...TASK_DUE_STATES.map((state) => ({
          value: state,
          label: DUE_STATE_LABELS[state] ?? state,
        })),
      ],
    },
    {
      id: "planned",
      label: "Planned",
      param: TASKS_FILTER_PARAMS.plannedState,
      options: [
        { value: ANY, label: "Any planned date" },
        ...TASK_PLANNED_STATES.map((state) => ({
          value: state,
          label: PLANNED_STATE_LABELS[state] ?? state,
        })),
      ],
    },
    {
      id: "sector",
      label: "Time sector",
      param: TASKS_FILTER_PARAMS.timeSector,
      options: [
        { value: ANY, label: "Any sector" },
        { value: "__none", label: SECTOR_LABELS.__none },
        ...TIME_SECTORS.map((sector) => ({
          value: sector,
          label: SECTOR_LABELS[sector] ?? sector,
        })),
      ],
    },
    {
      id: "parentType",
      label: "Parent type",
      param: TASKS_FILTER_PARAMS.parentKind,
      options: [
        { value: ANY, label: "Any parent" },
        ...TASK_PARENT_KINDS.map((kind) => ({
          value: kind,
          label: PARENT_KIND_LABELS[kind] ?? kind,
        })),
      ],
    },
  ];

  // The parent filter is a real, workspace-scoped option set resolved server-side —
  // it is offered only when the workspace HAS parents, so an empty workspace never
  // shows a control that could not narrow anything.
  const projects = inputs.parents.filter((p) => p.kind === "project");
  const areas = inputs.parents.filter((p) => p.kind === "area");
  if (projects.length > 0) {
    groups.push({
      id: "project",
      label: "Project",
      param: TASKS_FILTER_PARAMS.projectId,
      options: [
        { value: ANY, label: "Any Project" },
        ...projects.map((p) => ({ value: p.id, label: p.title })),
      ],
    });
  }
  if (areas.length > 0) {
    groups.push({
      id: "area",
      label: "Area",
      param: TASKS_FILTER_PARAMS.areaId,
      options: [
        { value: ANY, label: "Any Area" },
        ...areas.map((a) => ({ value: a.id, label: a.title })),
      ],
    });
  }
  if (inputs.delegates.length > 0) {
    groups.push({
      id: "person",
      label: "Delegated to",
      param: TASKS_FILTER_PARAMS.delegatedTo,
      options: [
        { value: ANY, label: "Anyone" },
        ...inputs.delegates.map((d) => ({ value: d.value, label: d.label })),
      ],
    });
  }

  groups.push(
    {
      id: "delegated",
      label: "Delegated",
      param: TASKS_FILTER_PARAMS.delegated,
      options: [
        { value: ANY, label: "Delegated or not" },
        { value: "1", label: "Delegated only" },
      ],
    },
    {
      id: "waiting",
      label: "Waiting",
      param: TASKS_FILTER_PARAMS.waiting,
      options: [
        { value: ANY, label: "Waiting or not" },
        { value: "1", label: "Waiting only" },
      ],
    },
    {
      id: "someday",
      label: "Someday / Maybe",
      param: TASKS_FILTER_PARAMS.someday,
      options: [
        { value: ANY, label: "Any commitment" },
        { value: "1", label: "Someday / Maybe only" },
      ],
    },
    {
      id: "created",
      label: "Created",
      param: TASKS_FILTER_PARAMS.createdWithin,
      options: [
        { value: ANY, label: "Any time" },
        ...TASK_RECENCY_WINDOWS.map((window) => ({
          value: window,
          label: RECENCY_LABELS[window] ?? window,
        })),
      ],
    },
    {
      id: "updated",
      label: "Updated",
      param: TASKS_FILTER_PARAMS.updatedWithin,
      options: [
        { value: ANY, label: "Any time" },
        ...TASK_RECENCY_WINDOWS.map((window) => ({
          value: window,
          label: RECENCY_LABELS[window] ?? window,
        })),
      ],
    },
    {
      id: "completed",
      label: "Completed tasks",
      param: TASKS_FILTER_PARAMS.completed,
      defaultValue: "default",
      options: TASK_COMPLETED_VISIBILITIES.map((visibility) => ({
        value: visibility === "default" ? ANY : visibility,
        label: COMPLETED_VISIBILITY_LABELS[visibility] ?? visibility,
      })),
    },
    // Shaping controls. `kind` keeps them OUT of the active-filter badge and the
    // chip row: changing a sort or a layout does not make a collection filtered,
    // and a badge that claimed otherwise would be useless.
    {
      id: "layout",
      label: "Layout",
      param: TASKS_PARAMS.presentation,
      kind: "group",
      defaultValue: DEFAULT_TASK_VIEW_CONFIG.presentation,
      options: TASK_PRESENTATIONS.map((presentation) => ({
        value: presentation,
        label: PRESENTATION_LABELS[presentation],
        description: PRESENTATION_DESCRIPTIONS[presentation],
      })),
    },
    {
      id: "group",
      label: "Group by",
      param: TASKS_PARAMS.groupBy,
      kind: "group",
      defaultValue: DEFAULT_TASK_VIEW_CONFIG.groupBy,
      options: TASK_GROUP_BYS.map((groupBy) => ({
        value: groupBy,
        label: GROUP_BY_LABELS[groupBy],
      })),
    },
    {
      id: "sort",
      label: "Sort",
      param: TASKS_PARAMS.sort,
      kind: "sort",
      defaultValue: DEFAULT_TASK_VIEW_CONFIG.sort,
      options: TASK_SORTS.map((sort) => ({
        value: sort,
        label: SORT_LABELS[sort],
      })),
    },
    {
      id: "direction",
      label: "Order",
      param: TASKS_PARAMS.direction,
      kind: "sort",
      defaultValue: DEFAULT_TASK_VIEW_CONFIG.direction,
      options: [
        { value: "natural", label: "Default order" },
        { value: "asc", label: "Ascending (A→Z, earliest first)" },
        { value: "desc", label: "Descending (Z→A, latest first)" },
      ],
    },
    {
      id: "density",
      label: "Density",
      param: TASKS_PARAMS.density,
      kind: "display",
      defaultValue: DEFAULT_TASK_VIEW_CONFIG.density,
      options: TASK_DENSITIES.map((density) => ({
        value: density,
        label: density === "compact" ? "Compact" : "Comfortable",
      })),
    },
  );

  return groups;
}
