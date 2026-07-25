/**
 * TASKS-01 — the `/tasks` workspace view-model (pure, React-free, testable).
 *
 * The seam between the workspace-scoped read model (`SerializedTaskListItem[]`) the
 * loader returns and the display shapes the Tasks module renders. It owns the URL
 * state parsing (view · sort · filters · sector), the Eisenhower Matrix quadrant
 * grouping, the Time Sector grouping and the small card presentation derivations —
 * all kept out of React so they can be unit tested directly (ADR-043 §8). It never
 * fetches or mutates.
 */

import type { SerializedTaskListItem } from "~/shared/task-record/task-view";
import {
  priorityQuadrant,
  taskDisplayState,
  taskPriorityTag,
  timeSectorLabel,
  type EisenhowerQuadrant,
} from "~/shared/task-record/task-view";
import {
  TASK_SORTS,
  TASK_SYSTEM_VIEWS,
  TIME_SECTORS,
  type TaskSort,
  type TaskSystemView,
  type TimeSector,
} from "~/kernel/tasks";

/** The primary `/tasks` presentation modes (the top-level view switcher). */
export const TASKS_PRIMARY_VIEWS = [
  "focus",
  "matrix",
  "sectors",
  "all",
] as const;
export type TasksPrimaryView = (typeof TASKS_PRIMARY_VIEWS)[number];

/** True when `value` is a valid primary view. */
export function isPrimaryView(value: string | null): value is TasksPrimaryView {
  return (
    value !== null && (TASKS_PRIMARY_VIEWS as readonly string[]).includes(value)
  );
}

/** The default landing view — a useful execution/planning surface, not a dump. */
export const DEFAULT_PRIMARY_VIEW: TasksPrimaryView = "focus";

/** Resolve the `?view=` param to a primary view, defaulting safely. */
export function resolvePrimaryView(value: string | null): TasksPrimaryView {
  return isPrimaryView(value) ? value : DEFAULT_PRIMARY_VIEW;
}

/** Resolve the `?system=` param to a kernel system view, or null. */
export function resolveSystemView(value: string | null): TaskSystemView | null {
  if (value === null) return null;
  return (TASK_SYSTEM_VIEWS as readonly string[]).includes(value)
    ? (value as TaskSystemView)
    : null;
}

/** Resolve the `?sort=` param, defaulting to smart. */
export function resolveSort(value: string | null): TaskSort {
  if (value !== null && (TASK_SORTS as readonly string[]).includes(value)) {
    return value as TaskSort;
  }
  return "smart";
}

/**
 * The kernel system view a primary view queries. Focus defaults to This Week (the
 * useful default per ADR-043 §10 / §11.A); the Matrix and Sectors default to all
 * ACTIVE work (their own grouping does the rest); All Tasks is the complete
 * bounded collection. An explicit `?system=` overrides for the system-view chips.
 */
export function systemViewFor(
  primary: TasksPrimaryView,
  explicit: TaskSystemView | null,
): TaskSystemView {
  if (explicit !== null) return explicit;
  switch (primary) {
    case "focus":
      return "this_week";
    case "matrix":
    case "sectors":
    case "all":
    default:
      return "all";
  }
}

/** A card-ready presentation of a task (pure). */
export interface TaskCardData {
  readonly id: string;
  readonly title: string;
  readonly priorityTag: string;
  readonly quadrant: EisenhowerQuadrant | null;
  readonly sector: TimeSector | null;
  readonly sectorLabel: string;
  readonly stateLabel: string;
  readonly stateTone: string;
  readonly dueDate: string | null;
  readonly scheduledDate: string | null;
  readonly parentLabel: string | null;
  readonly delegatedTo: string | null;
  readonly completed: boolean;
  readonly waiting: boolean;
}

/** Map a serialized list item into card-ready display data (pure). */
export function toTaskCardData(item: SerializedTaskListItem): TaskCardData {
  const state = taskDisplayState({
    deletedAt: null,
    completedAt: item.completedAt,
    status: item.status,
    commitmentState: item.commitmentState,
    timeSector: item.timeSector,
    scheduledDate: item.scheduledDate,
    waiting: item.waiting,
  });
  return {
    id: item.id,
    title: item.title,
    priorityTag: taskPriorityTag(item.priority),
    quadrant: priorityQuadrant(item.priority),
    sector: item.timeSector,
    sectorLabel: timeSectorLabel(item.timeSector),
    stateLabel: state.label,
    stateTone: state.tone,
    dueDate: item.dueDate,
    scheduledDate: item.scheduledDate,
    parentLabel: item.parent?.title ?? null,
    delegatedTo: item.delegation?.to ?? null,
    completed: item.completedAt !== null,
    waiting: item.waiting !== null && item.completedAt === null,
  };
}

/** The four Matrix quadrants, in reading order, with their labels. */
export const MATRIX_QUADRANTS: ReadonlyArray<{
  readonly quadrant: EisenhowerQuadrant;
  readonly priority: "p1" | "p2" | "p3" | "p4";
  readonly title: string;
  readonly action: string;
}> = [
  {
    quadrant: "do",
    priority: "p1",
    title: "P1 · Do",
    action: "Urgent & important",
  },
  {
    quadrant: "defer",
    priority: "p2",
    title: "P2 · Defer",
    action: "Important, not urgent",
  },
  {
    quadrant: "delegate",
    priority: "p3",
    title: "P3 · Delegate",
    action: "Urgent, delegate",
  },
  {
    quadrant: "delete",
    priority: "p4",
    title: "P4 · Delete / Review",
    action: "Neither — review",
  },
];

/** Group card data into the four Matrix quadrants plus an untriaged bucket. */
export function groupByQuadrant(items: readonly TaskCardData[]): {
  readonly do: TaskCardData[];
  readonly defer: TaskCardData[];
  readonly delegate: TaskCardData[];
  readonly delete: TaskCardData[];
  readonly untriaged: TaskCardData[];
} {
  const buckets = {
    do: [] as TaskCardData[],
    defer: [] as TaskCardData[],
    delegate: [] as TaskCardData[],
    delete: [] as TaskCardData[],
    untriaged: [] as TaskCardData[],
  };
  for (const item of items) {
    if (item.quadrant === null) {
      buckets.untriaged.push(item);
    } else {
      buckets[item.quadrant].push(item);
    }
  }
  return buckets;
}

/** The Time Sector sections, in planning order, including the derived Inbox. */
export const SECTOR_SECTIONS: ReadonlyArray<{
  readonly key: TimeSector | "inbox";
  readonly label: string;
}> = [
  { key: "inbox", label: "Inbox" },
  ...TIME_SECTORS.map((s) => ({ key: s, label: timeSectorLabel(s) })),
];

/** Group card data into Time Sector sections (null sector → Inbox). */
export function groupBySector(
  items: readonly TaskCardData[],
): Record<string, TaskCardData[]> {
  const groups: Record<string, TaskCardData[]> = { inbox: [] };
  for (const sector of TIME_SECTORS) {
    groups[sector] = [];
  }
  for (const item of items) {
    const key = item.sector ?? "inbox";
    (groups[key] ??= []).push(item);
  }
  return groups;
}
