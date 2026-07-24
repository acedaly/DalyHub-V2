/**
 * AREA-01 — Areas view-model (pure, React-free).
 *
 * Converts the storage-independent Area projection and spine rollups into
 * JSON-safe display data for the collection and record. It keeps completion
 * semantics honest: empty rollups are "No … yet", never 100%, and Areas are
 * labelled permanent rather than completable.
 */

import {
  isProjectHealthVisible,
  type ProjectHealth,
} from "~/kernel/project-health";
import {
  projectWorkflowStatusLabel,
  type ProjectWorkflowStatus,
} from "~/kernel/project-settings";
import type {
  AreaGoalItem,
  AreaListItem,
  AreaOverview,
  AreaProjectItem,
} from "~/kernel/areas";
import type { AreaRollup, CompletionRollup } from "~/kernel/spine";
import { normaliseProgress, type CardTone } from "~/shared/card";
import { formatCalendarDate } from "~/shared/task-record/task-view";

export type SerializedRollup = {
  readonly total: number;
  readonly completed: number;
  readonly ratio: number | null;
};

export type SerializedAreaRollup = {
  readonly kind: "area";
  readonly goals: SerializedRollup;
  readonly projects: SerializedRollup;
  readonly tasks: SerializedRollup;
};

export type SerializedAreaListItem = {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly rollup: SerializedAreaRollup;
  readonly activeProjectCount: number;
  readonly completedProjectCount: number;
};

export type SerializedAreaOverview = {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type SerializedAreaGoalItem = {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
  readonly projectTotal: number;
  readonly projectCompleted: number;
  readonly taskTotal: number;
  readonly taskCompleted: number;
  /** AREA-02: the Goal-owned target date (`YYYY-MM-DD`), or `null` when unset.
   * Momentum never depends on this field. */
  readonly targetDate: string | null;
};

export type SerializedAreaProjectItem = {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
  readonly status: ProjectWorkflowStatus;
  readonly archivedAt: string | null;
  readonly parent:
    | { readonly kind: "area" }
    | {
        readonly kind: "goal";
        readonly goal: { readonly id: string; readonly title: string };
      };
  readonly taskTotal: number;
  readonly taskCompleted: number;
  readonly health: ProjectHealth;
  readonly healthVisible: boolean;
};

export type RollupProgress = {
  readonly has: boolean;
  readonly total: number;
  readonly completed: number;
  readonly percent: number;
  readonly summary: string;
};

export type AreaCardData = {
  readonly id: string;
  readonly title: string;
  readonly state: { readonly label: string; readonly tone: CardTone };
  readonly goals: RollupProgress;
  readonly projects: RollupProgress;
  readonly tasks: RollupProgress;
  readonly updatedLabel: string | null;
};

export function serializeRollup(rollup: CompletionRollup): SerializedRollup {
  return {
    total: rollup.total,
    completed: rollup.completed,
    ratio: rollup.ratio,
  };
}

export function serializeAreaRollup(rollup: AreaRollup): SerializedAreaRollup {
  return {
    kind: "area",
    goals: serializeRollup(rollup.goals),
    projects: serializeRollup(rollup.projects),
    tasks: serializeRollup(rollup.tasks),
  };
}

export function serializeAreaListItem(
  item: AreaListItem,
): SerializedAreaListItem {
  return {
    id: item.id,
    title: item.title,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    rollup: serializeAreaRollup(item.rollup),
    activeProjectCount: item.activeProjectCount,
    completedProjectCount: item.completedProjectCount,
  };
}

export function serializeAreaOverview(
  overview: AreaOverview,
): SerializedAreaOverview {
  return {
    id: overview.id,
    title: overview.title,
    createdAt: overview.createdAt.toISOString(),
    updatedAt: overview.updatedAt.toISOString(),
  };
}

export function serializeAreaGoalItem(
  item: AreaGoalItem,
): SerializedAreaGoalItem {
  return {
    id: item.id,
    title: item.title,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    completedAt: item.completedAt ? item.completedAt.toISOString() : null,
    projectTotal: item.projectTotal,
    projectCompleted: item.projectCompleted,
    taskTotal: item.taskTotal,
    taskCompleted: item.taskCompleted,
    targetDate: item.targetDate,
  };
}

export function serializeAreaProjectItem(
  item: AreaProjectItem,
  health: ProjectHealth,
): SerializedAreaProjectItem {
  return {
    id: item.id,
    title: item.title,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    completedAt: item.completedAt ? item.completedAt.toISOString() : null,
    status: item.status,
    archivedAt: item.archivedAt ? item.archivedAt.toISOString() : null,
    parent: item.parent,
    taskTotal: item.taskTotal,
    taskCompleted: item.taskCompleted,
    health,
    healthVisible: isProjectHealthVisible(item),
  };
}

export function rollupProgress(
  rollup: SerializedRollup,
  noun: string,
): RollupProgress {
  if (rollup.total <= 0) {
    return {
      has: false,
      total: 0,
      completed: 0,
      percent: 0,
      summary: `No ${noun}s yet`,
    };
  }
  const { percent } = normaliseProgress({
    value: rollup.completed,
    max: rollup.total,
  });
  return {
    has: true,
    total: rollup.total,
    completed: rollup.completed,
    percent,
    summary: `${rollup.completed} of ${rollup.total} ${rollup.total === 1 ? noun : `${noun}s`}`,
  };
}

export function areaStateLabel(): {
  readonly label: string;
  readonly tone: CardTone;
} {
  return { label: "Permanent", tone: "neutral" };
}

export function areaUpdatedLabel(iso: string): string | null {
  const dateOnly = iso.slice(0, 10);
  const formatted = formatCalendarDate(dateOnly);
  return formatted ? `Updated ${formatted}` : null;
}

export function toAreaCardData(item: SerializedAreaListItem): AreaCardData {
  return {
    id: item.id,
    title: item.title,
    state: areaStateLabel(),
    goals: rollupProgress(item.rollup.goals, "goal"),
    projects: rollupProgress(item.rollup.projects, "project"),
    tasks: rollupProgress(item.rollup.tasks, "task"),
    updatedLabel: areaUpdatedLabel(item.updatedAt),
  };
}

export function goalStateLabel(goal: { readonly completedAt: string | null }): {
  readonly label: string;
  readonly tone: CardTone;
} {
  return goal.completedAt === null
    ? { label: "Open", tone: "neutral" }
    : { label: "Completed", tone: "success" };
}

export function projectStateLabel(project: {
  readonly completedAt: string | null;
  readonly archivedAt: string | null;
  readonly status: ProjectWorkflowStatus;
}): { readonly label: string; readonly tone: CardTone } {
  if (project.archivedAt !== null) {
    return { label: "Archived", tone: "neutral" };
  }
  if (project.completedAt !== null) {
    return { label: "Completed", tone: "success" };
  }
  return {
    label: projectWorkflowStatusLabel(project.status),
    tone: "neutral",
  };
}
