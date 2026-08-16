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
import type { EntityIconKey } from "~/kernel/entities/entity-icon-keys";
import type { IdentityColourSlot } from "~/kernel/entities/identity-colour-slots";
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
  /**
   * The AREA RECORD's own last edit — `entities.updated_at`, which ADR-014
   * reserves for identity and title. It is NOT "something happened in this
   * Area": adding a Project writes a link, and archiving writes
   * `area_details`, and neither touches this column. The card therefore says
   * "Updated <date>", which is exactly what this is, and never implies
   * activity it cannot see.
   */
  readonly updatedAt: string;
  /** ADR-068 decision 5's lifecycle-independent colour rank (0-based). */
  readonly colourRank: number;
  /** The owner's chosen icon KEY, or `null` for the Area default. */
  readonly iconKey: EntityIconKey | null;
  /** IDENTITY-01 — the owner's chosen colour SLOT, or `null` for the derived one. */
  readonly colourSlot: IdentityColourSlot | null;
  readonly rollup: SerializedAreaRollup;
  readonly activeProjectCount: number;
  readonly completedProjectCount: number;
};

export type SerializedAreaOverview = {
  readonly id: string;
  readonly title: string;
  /** The Area's stable identity colour rank — see the kernel type. */
  readonly colourRank: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** AREA-05: ISO archival timestamp, or `null` when the Area is active. */
  readonly archivedAt: string | null;
  /**
   * The owner's chosen icon, as the semantic KEY and nothing else — never a
   * component, never markup, never a catalogue object. That restraint is what
   * keeps this payload serialisable and the wire format stable: `RecordIcon`
   * resolves the key in the browser, so the drawing can change without the
   * route's data changing. `null` means "no choice", and the Area renders its
   * entity default.
   */
  readonly iconKey: string | null;
  /**
   * IDENTITY-01 — the owner's chosen colour SLOT, or `null` for "no choice —
   * derive it". A stable NAME for the same reasons the icon is a key: it
   * survives a reorder of the ramp and cannot carry a colour into a page.
   */
  readonly colourSlot: string | null;
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

/**
 * The display data for one Area entity card.
 *
 * Every count here is EXACT, not page-derived: `listAreas` computes each one as
 * a grouped aggregate over the whole workspace in the same query that returns
 * the Area, so none of them is a count of loaded rows. See
 * `docs/design/M3_POLISH_HANDOFF.md` for the exact/bounded ledger.
 */
export type AreaCardData = {
  readonly id: string;
  readonly title: string;
  /** ADR-068 decision 5's lifecycle-independent colour rank (0-based). */
  readonly colourRank: number;
  /** The owner's chosen icon KEY, or `null` for the Area default. */
  readonly iconKey: EntityIconKey | null;
  /** IDENTITY-01 — the owner's chosen colour SLOT, or `null` for the derived one. */
  readonly colourSlot: IdentityColourSlot | null;
  /** EXACT count of Projects in this Area that are neither complete nor archived. */
  readonly activeProjects: number;
  /** EXACT count of Goals in this Area that are not complete. */
  readonly openGoals: number;
  /** EXACT count of incomplete Tasks in this Area, direct and via its Projects. */
  readonly openTasks: number;
  /**
   * Whether this Area has anything in flight at all. False collapses the card
   * to ONE concise state instead of the three separate absence messages the
   * audit found ("No goals yet · No Projects yet · No tasks yet").
   */
  readonly hasActiveWork: boolean;
  /**
   * The one-line work-state summary — never three absence messages, and `null`
   * when the open-task metric beside it is already the whole story.
   */
  readonly workSummary: string | null;
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
    colourRank: item.colourRank,
    iconKey: item.iconKey,
    colourSlot: item.colourSlot,
    rollup: serializeAreaRollup(item.rollup),
    activeProjectCount: item.activeProjectCount,
    completedProjectCount: item.completedProjectCount,
  };
}

export function serializeAreaOverview(
  overview: AreaOverview,
  iconKey: string | null = null,
  colourSlot: string | null = null,
): SerializedAreaOverview {
  return {
    id: overview.id,
    title: overview.title,
    colourRank: overview.colourRank,
    createdAt: overview.createdAt.toISOString(),
    updatedAt: overview.updatedAt.toISOString(),
    archivedAt: overview.archivedAt ? overview.archivedAt.toISOString() : null,
    // Passed in rather than read from `AreaOverview`: the chosen icon and
    // colour live in the Areas module's own detail row and are the settings
    // repository's to serve (ADR-037/039), so the projection the collection
    // reads stays unchanged.
    iconKey,
    colourSlot,
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

/**
 * The card's date line. ONE word and ONE date — the audit found
 * "Updated: Updated 29 Jul 2026", where the Card's own `label` prop and this
 * string each contributed an "Updated". The entity card takes free-form meta
 * nodes and adds no label of its own, so the word appears exactly once.
 */
export function areaUpdatedLabel(iso: string): string | null {
  const dateOnly = iso.slice(0, 10);
  const formatted = formatCalendarDate(dateOnly);
  return formatted ? `Updated ${formatted}` : null;
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/**
 * The one-line work-state summary — the STRUCTURE in the Area (its Projects and
 * Goals), never its task count.
 *
 * The audit found four of nine Area rows repeating "Goals: No goals yet ·
 * Projects: No Projects yet · Tasks: No tasks yet" — three absence messages
 * saying one thing. An Area with nothing in flight now says that once, and an
 * Area with work names only the dimensions it actually has.
 *
 * Tasks are deliberately absent here. The card already states them as its
 * metric, and the first Gate D capture caught the consequence of not drawing
 * that line: an Area holding one loose task and no structure read
 * "1 open task" as its summary AND "1 open task" as its metric, one above the
 * other. `null` means "the metric already said it" — an Area with only loose
 * tasks is not idle, so it must not fall through to "No active work" either.
 */
export function areaWorkSummary(counts: {
  readonly activeProjects: number;
  readonly openGoals: number;
  readonly openTasks: number;
}): string | null {
  const parts: string[] = [];
  if (counts.activeProjects > 0) {
    parts.push(
      `${counts.activeProjects} active ${plural(counts.activeProjects, "Project", "Projects")}`,
    );
  }
  if (counts.openGoals > 0) {
    parts.push(
      `${counts.openGoals} open ${plural(counts.openGoals, "Goal", "Goals")}`,
    );
  }
  if (parts.length > 0) {
    return parts.join(" · ");
  }
  return counts.openTasks > 0 ? null : "No active work";
}

export function toAreaCardData(item: SerializedAreaListItem): AreaCardData {
  // Every one of these is a workspace-wide grouped aggregate from `listAreas`,
  // not a count of the rows on this page.
  const activeProjects = item.activeProjectCount;
  const openGoals = Math.max(
    0,
    item.rollup.goals.total - item.rollup.goals.completed,
  );
  const openTasks = Math.max(
    0,
    item.rollup.tasks.total - item.rollup.tasks.completed,
  );
  return {
    id: item.id,
    title: item.title,
    colourRank: item.colourRank,
    iconKey: item.iconKey,
    colourSlot: item.colourSlot,
    activeProjects,
    openGoals,
    openTasks,
    hasActiveWork: activeProjects > 0 || openGoals > 0 || openTasks > 0,
    workSummary: areaWorkSummary({ activeProjects, openGoals, openTasks }),
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
