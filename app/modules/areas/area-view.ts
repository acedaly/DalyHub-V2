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
  /** AREA-05: ISO archival timestamp, or `null` when the Area is active. */
  readonly archivedAt: string | null;
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
    archivedAt: overview.archivedAt ? overview.archivedAt.toISOString() : null,
  };
}

export function isAreaOverviewArchived(
  overview: SerializedAreaOverview,
): boolean {
  return overview.archivedAt !== null;
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

export function areaStateLabel(archived = false): {
  readonly label: string;
  readonly tone: CardTone;
} {
  return archived
    ? { label: "Archived", tone: "neutral" }
    : { label: "Permanent", tone: "neutral" };
}

/**
 * AREA-05 — a plain-language description of what blocks a permanent deletion,
 * grouped by dependent kind, for the danger-zone UI. Each entry names the kind,
 * the count and (where practical) a route to the records so the user can move,
 * archive or delete them first. Never returns a zero-count entry.
 */
export type AreaDependencyBlocker = {
  readonly id: string;
  readonly label: string;
  readonly count: number;
  readonly href?: string;
};

export function areaDependencyBlockers(summary: {
  readonly areaId: string;
  readonly goals: number;
  readonly projects: number;
  readonly tasks: number;
  readonly notes: number;
  readonly diary: number;
  readonly other: number;
}): readonly AreaDependencyBlocker[] {
  const areaHref = `/areas/${encodeURIComponent(summary.areaId)}`;
  const blockers: AreaDependencyBlocker[] = [];
  const plural = (n: number, one: string, many: string) =>
    n === 1 ? one : many;
  if (summary.goals > 0) {
    blockers.push({
      id: "goals",
      label: `${summary.goals} ${plural(summary.goals, "Goal", "Goals")}`,
      count: summary.goals,
      href: `${areaHref}?tab=goals`,
    });
  }
  if (summary.projects > 0) {
    blockers.push({
      id: "projects",
      label: `${summary.projects} ${plural(summary.projects, "Project", "Projects")}`,
      count: summary.projects,
      href: `${areaHref}?tab=projects`,
    });
  }
  if (summary.tasks > 0) {
    blockers.push({
      id: "tasks",
      label: `${summary.tasks} direct ${plural(summary.tasks, "Task", "Tasks")}`,
      count: summary.tasks,
    });
  }
  if (summary.notes > 0) {
    blockers.push({
      id: "notes",
      label: `${summary.notes} linked ${plural(summary.notes, "Note", "Notes")}`,
      count: summary.notes,
    });
  }
  if (summary.diary > 0) {
    blockers.push({
      id: "diary",
      label: `${summary.diary} linked Diary ${plural(summary.diary, "entry", "entries")}`,
      count: summary.diary,
    });
  }
  if (summary.other > 0) {
    blockers.push({
      id: "other",
      label: `${summary.other} other linked ${plural(summary.other, "record", "records")}`,
      count: summary.other,
    });
  }
  return blockers;
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
