/**
 * AREA-02 — the Goals view-model (pure, React-free).
 *
 * Converts the storage-independent Goal projection, Goal-owned details and
 * derived Project contribution into JSON-safe display data for the canonical
 * record and the Area Goals tab. Keeps semantics honest: an empty contribution
 * is "No Projects contributing yet", never a misleading 0% bar; explicit
 * completion is always presented separately from derived Project progress; a
 * target date is presented with an honest unset/overdue/upcoming state, never
 * used to imply completion.
 */

import { compareDateOnly } from "~/shared/forms/dates";
import {
  projectWorkflowStatusLabel,
  type ProjectWorkflowStatus,
} from "~/kernel/project-settings";
import type {
  GoalListItem,
  GoalOverview,
  GoalProjectContribution,
  GoalProjectItem,
} from "~/kernel/goals";
import type { GoalDetailsRecord } from "~/kernel/goals";
import { normaliseProgress, type CardTone } from "~/shared/card";
import { formatCalendarDate } from "~/shared/task-record/task-view";

export type SerializedGoalOverview = {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
  readonly area: { readonly id: string; readonly title: string };
};

export type SerializedGoalDetails = {
  readonly targetDate: string | null;
  readonly definitionOfDone: string | null;
};

export type SerializedGoalProjectContribution = {
  readonly total: number;
  readonly completed: number;
  readonly incomplete: number;
  readonly active: number;
  readonly planned: number;
  readonly onHold: number;
  readonly archived: number;
};

export type SerializedGoalProjectItem = {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
  readonly status: ProjectWorkflowStatus;
  readonly archivedAt: string | null;
  readonly taskTotal: number;
  readonly taskCompleted: number;
};

export type SerializedGoalListItem = {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
  readonly area: { readonly id: string; readonly title: string };
};

/** AREA-03: one Goal on the workspace-wide Alignment collection. */
export function serializeGoalListItem(
  item: GoalListItem,
): SerializedGoalListItem {
  return {
    id: item.id,
    title: item.title,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    completedAt: item.completedAt ? item.completedAt.toISOString() : null,
    area: item.area,
  };
}

export function serializeGoalOverview(
  overview: GoalOverview,
): SerializedGoalOverview {
  return {
    id: overview.id,
    title: overview.title,
    createdAt: overview.createdAt.toISOString(),
    updatedAt: overview.updatedAt.toISOString(),
    completedAt: overview.completedAt
      ? overview.completedAt.toISOString()
      : null,
    area: overview.area,
  };
}

export function serializeGoalDetails(
  details: GoalDetailsRecord | null,
): SerializedGoalDetails {
  return {
    targetDate: details?.targetDate ?? null,
    definitionOfDone: details?.definitionOfDone ?? null,
  };
}

export function serializeGoalProjectContribution(
  contribution: GoalProjectContribution,
): SerializedGoalProjectContribution {
  return { ...contribution };
}

export function serializeGoalProjectItem(
  item: GoalProjectItem,
): SerializedGoalProjectItem {
  return {
    id: item.id,
    title: item.title,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    completedAt: item.completedAt ? item.completedAt.toISOString() : null,
    status: item.status,
    archivedAt: item.archivedAt ? item.archivedAt.toISOString() : null,
    taskTotal: item.taskTotal,
    taskCompleted: item.taskCompleted,
  };
}

/** Is the Goal explicitly complete? Explicit completion is ALWAYS the spine's
 * `completedAt` — never derived from 100% Project contribution progress. */
export function isGoalComplete(goal: {
  readonly completedAt: string | null;
}): boolean {
  return goal.completedAt !== null;
}

export function goalStateLabel(goal: { readonly completedAt: string | null }): {
  readonly label: string;
  readonly tone: CardTone;
} {
  return isGoalComplete(goal)
    ? { label: "Completed", tone: "success" }
    : { label: "Open", tone: "neutral" };
}

/** The reversed workflow-status label + the Archived/Completed precedence used
 * across the spine's Project presentation (mirrors `~/modules/projects`'
 * `projectStateLabel` and `~/modules/areas`' equivalent — kept as its own small,
 * duplicated pure function per the established cross-module-import rule). */
export function goalProjectStateLabel(project: {
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
  return { label: projectWorkflowStatusLabel(project.status), tone: "neutral" };
}

export type GoalContributionPresentation = {
  /** False when there are no linked Projects at all — show the honest empty
   * state, never a 0%-but-implies-a-denominator bar. */
  readonly has: boolean;
  readonly total: number;
  readonly completed: number;
  readonly percent: number;
  /** e.g. "3 of 8 Projects complete", or the honest empty-state text. */
  readonly summary: string;
};

/**
 * Present the exact Project-contribution progress. An empty contribution
 * (`total === 0`) is `has: false` — "No Projects contributing yet" — never a
 * misleading 0%-of-nothing bar. All linked Projects complete still only
 * reports the derived percentage; it never implies the Goal itself is
 * complete (that stays `isGoalComplete`, entirely separate).
 */
export function goalContributionProgress(
  contribution: SerializedGoalProjectContribution,
): GoalContributionPresentation {
  if (contribution.total <= 0) {
    return {
      has: false,
      total: 0,
      completed: 0,
      percent: 0,
      summary: "No Projects contributing yet",
    };
  }
  const { percent } = normaliseProgress({
    value: contribution.completed,
    max: contribution.total,
  });
  const noun = contribution.total === 1 ? "Project" : "Projects";
  return {
    has: true,
    total: contribution.total,
    completed: contribution.completed,
    percent,
    summary: `${contribution.completed} of ${contribution.total} ${noun} complete`,
  };
}

export type TargetDateState = "unset" | "overdue" | "upcoming";

export type TargetDatePresentation = {
  readonly state: TargetDateState;
  /** null only when `state === "unset"`. */
  readonly formatted: string | null;
  readonly raw: string | null;
};

/**
 * Present the target date's honest state relative to the given owner-calendar
 * "today" (`YYYY-MM-DD`, computed server-side — never `new Date()` in this pure
 * function). Never used as a completion signal — see the module doc comment.
 */
export function targetDatePresentation(
  targetDate: string | null,
  todayIso: string,
): TargetDatePresentation {
  if (targetDate === null) {
    return { state: "unset", formatted: null, raw: null };
  }
  const formatted = formatCalendarDate(targetDate);
  const state: TargetDateState =
    compareDateOnly(targetDate, todayIso) < 0 ? "overdue" : "upcoming";
  return { state, formatted, raw: targetDate };
}

/** The honest empty-state text for an unset definition of done. */
export const NO_DEFINITION_OF_DONE_TEXT = "No definition of done recorded yet.";
