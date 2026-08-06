/**
 * PROJ-01 — the Projects view-model (pure, React-free, testable).
 *
 * The seam between the workspace-scoped `ProjectListItem`/`ProjectOverview`/spine
 * rollup a loader reads and the display shapes the collection Cards and the project
 * Record Layout render. It owns JSON serialisation (Dates → ISO strings, since a
 * loader returns JSON to the browser) and the small display derivations — the
 * open/completed pill, the progress presentation, the Area/Goal labels — kept out of
 * the React components so they can be unit-tested directly. Area/Goal titles come
 * from the resolved relations (never copied); progress is derived, and an empty
 * project is presented as 0% / "No tasks yet", NEVER 100%.
 */

import { normaliseProgress, type CardTone } from "~/shared/card";
import type { EntityIconKey } from "~/kernel/entities/entity-icon-keys";
import {
  projectWorkflowStatusLabel,
  type ProjectWorkflowStatus,
} from "~/kernel/project-settings";
import { isProjectHealthVisible } from "~/kernel/project-health";
import type { ProjectHealth } from "~/shared/project-health";
// Imported from the module rather than the barrel: this file is deliberately
// React-free, and `~/shared/project-health` re-exports two components.
import { healthReasonText } from "~/shared/project-health/health-view";
import type { PillTone } from "~/shared/pill";
import {
  formatCalendarDate,
  serializeTaskWaiting,
  type SerializedTaskWaiting,
} from "~/shared/task-record/task-view";
import type {
  ProjectListItem,
  ProjectOverview,
  ProjectRelation,
} from "~/kernel/projects";
import type { CompletionRollup } from "~/kernel/spine";
import type {
  CommitmentState,
  TaskListItem,
  TaskPriority,
  TaskStatus,
  TimeSector,
} from "~/kernel/tasks";

/** JSON-serialised project collection item (Dates → ISO strings). */
export interface SerializedProjectListItem {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
  /** ALWAYS present — every projected Project has an effective workflow status. */
  readonly status: ProjectWorkflowStatus;
  /** ALWAYS present (never omitted) — `null` when not archived. */
  readonly archivedAt: string | null;
  readonly area: ProjectRelation | null;
  readonly goal: ProjectRelation | null;
  /**
   * The resolved Area's stable colour rank, so the card can inherit the Area's
   * accent instead of inventing a second identity system. `null` when the
   * Project has no Area.
   */
  readonly areaColourRank: number | null;
  /** The owner's chosen icon KEY, or `null` for the Project default. */
  readonly iconKey: EntityIconKey | null;
  readonly taskTotal: number;
  readonly taskCompleted: number;
  /** The DERIVED health signal (PROJ-02) — never persisted, JSON-safe. */
  readonly health: ProjectHealth;
  /** Whether active-work health should be presented — see {@link isHealthVisible}. */
  readonly healthVisible: boolean;
}

/** JSON-serialised project overview (Dates → ISO strings). */
export interface SerializedProjectOverview {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
  /** ALWAYS present — every projected Project has an effective workflow status. */
  readonly status: ProjectWorkflowStatus;
  /** ALWAYS present (never omitted) — `null` when not archived. */
  readonly archivedAt: string | null;
  readonly area: ProjectRelation | null;
  readonly goal: ProjectRelation | null;
  /** Whether active-work health should be presented — see {@link isHealthVisible}. */
  readonly healthVisible: boolean;
  /**
   * The owner's chosen icon, as the semantic KEY and nothing else — never a
   * component, never markup, never a catalogue object. `RecordIcon` resolves it
   * in the browser, which is what keeps this payload serialisable and lets the
   * drawing change without the route's data changing. `null` means "no
   * choice", and the Project renders its entity default.
   */
  readonly iconKey: string | null;
}

/**
 * Serialise a `ProjectListItem` for a JSON loader response, carrying its derived
 * health (PROJ-02). Health is evaluated server-side from the whole-page facts and is
 * already JSON-safe, so it flows straight through pagination on the item itself.
 */
export function serializeProjectListItem(
  item: ProjectListItem,
  health: ProjectHealth,
): SerializedProjectListItem {
  return {
    id: item.id,
    title: item.title,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    completedAt: item.completedAt ? item.completedAt.toISOString() : null,
    status: item.status,
    archivedAt: item.archivedAt ? item.archivedAt.toISOString() : null,
    area: item.area,
    goal: item.goal,
    areaColourRank: item.areaColourRank,
    iconKey: item.iconKey,
    taskTotal: item.taskTotal,
    taskCompleted: item.taskCompleted,
    health,
    healthVisible: isHealthVisible(item),
  };
}

/** Serialise a `ProjectOverview` for a JSON loader response. */
export function serializeProjectOverview(
  overview: ProjectOverview,
  iconKey: string | null = null,
): SerializedProjectOverview {
  return {
    // Passed in rather than read from `ProjectOverview`: the icon lives in the
    // Projects module's own detail row and is the settings repository's to
    // serve (ADR-037), so the projection the collection reads is unchanged.
    iconKey,
    id: overview.id,
    title: overview.title,
    createdAt: overview.createdAt.toISOString(),
    updatedAt: overview.updatedAt.toISOString(),
    completedAt: overview.completedAt
      ? overview.completedAt.toISOString()
      : null,
    status: overview.status,
    archivedAt: overview.archivedAt ? overview.archivedAt.toISOString() : null,
    area: overview.area,
    goal: overview.goal,
    healthVisible: isHealthVisible(overview),
  };
}

/**
 * The ONE health-visibility rule (Phase 8 / ADR-037): active-work health (the
 * PROJ-02 stale/blocked/at-risk signal) is presented only for a Project that is
 * genuinely open, incomplete, non-archived, active work — i.e. workflow status
 * `"active"`. A Planned Project hasn't started (no "stalled" warning is honest);
 * an On-hold Project is deliberately paused (no "act now" prompt); a Completed or
 * Archived Project shows no active-work warning. Every consumer (Project cards,
 * the Project overview and Today) calls this SAME function rather than inventing
 * its own condition.
 */
export function isHealthVisible(project: {
  readonly status: ProjectWorkflowStatus;
  readonly completedAt: unknown;
  readonly archivedAt: unknown;
}): boolean {
  return isProjectHealthVisible(project);
}

/** Is the project completed? Completion is the spine's `completedAt`. */
export function isProjectComplete(project: {
  readonly completedAt: string | null;
}): boolean {
  return project.completedAt !== null;
}

/**
 * Is the project archived (PROJ-05)? Archival is reversible and NOT spine
 * soft-deletion (ADR-037 §37.1) — an archived project remains structurally
 * present and readable, merely read-only until restored. Every UI surface that
 * decides whether to hide a mutating control (Rename, Complete/Reopen, Add
 * task, Key links add/remove, the Area/Goal and workflow-status settings, a
 * second Archive) calls this SAME function rather than inventing its own check.
 */
export function isProjectArchived(project: {
  readonly archivedAt: string | null;
}): boolean {
  return project.archivedAt !== null;
}

/**
 * The open/completed display pill. PROJ-01 models ONLY open vs completed (no health,
 * no custom status — those are PROJ-02/PROJ-05). Meaning is in the label, never
 * colour alone.
 */
export function projectStateLabel(project: {
  readonly completedAt: string | null;
  readonly archivedAt?: string | null;
  readonly status?: ProjectWorkflowStatus;
}): { readonly label: string; readonly tone: CardTone } {
  if (project.archivedAt) return { label: "Archived", tone: "neutral" };
  if (isProjectComplete(project))
    return { label: "Completed", tone: "success" };
  return {
    label: projectWorkflowStatusLabel(project.status ?? "planned"),
    tone: "neutral",
  };
}

/**
 * The progress presentation for a project's task roll-up. An empty project (no
 * active direct tasks) is `has: false` — presented as "No tasks yet", NEVER 100%.
 * `percent`/`fraction`/`text` reuse the shared `normaliseProgress` so the collection
 * Card bar and the record summary agree.
 */
export interface ProjectProgress {
  readonly has: boolean;
  readonly total: number;
  readonly completed: number;
  readonly percent: number;
  readonly fraction: number;
  /** e.g. "3 of 8 tasks", or "No tasks yet" when empty. */
  readonly summary: string;
}

/** Build the progress presentation from a completed/total pair. */
export function projectProgress(
  completed: number,
  total: number,
): ProjectProgress {
  if (total <= 0) {
    return {
      has: false,
      total: 0,
      completed: 0,
      percent: 0,
      fraction: 0,
      summary: "No tasks yet",
    };
  }
  const { percent, fraction } = normaliseProgress({
    value: completed,
    max: total,
  });
  const noun = total === 1 ? "task" : "tasks";
  return {
    has: true,
    total,
    completed,
    percent,
    fraction,
    summary: `${completed} of ${total} ${noun}`,
  };
}

/** Build the progress presentation from a spine `CompletionRollup`. */
export function projectProgressFromRollup(
  rollup: CompletionRollup,
): ProjectProgress {
  return projectProgress(rollup.completed, rollup.total);
}

/**
 * The ONE status treatment on a Project entity card.
 *
 * The audit found "two competing status systems (state chip right, health chip
 * inline)" on every Project row: a lifecycle pill and a health pill saying
 * overlapping things at the same weight. A card now carries exactly one chip,
 * chosen as the single most decision-relevant fact about the Project:
 *
 *   archived                       -> "Archived"
 *   completed                      -> "Completed"
 *   not actively worked            -> "Planned" / "On hold"
 *   active, and health is speaking -> the health state ("Stale", "At risk", …)
 *   active, and nothing is wrong   -> "Active"
 *
 * Health only ever REPLACES the workflow chip, never sits beside it, and only
 * for a Project whose status is `active` — which is the same
 * `isProjectHealthVisible` rule every other surface already applies. The
 * health REASON ("no progress in 18 days") is supporting text elsewhere on the
 * card: it explains the chip rather than restating it.
 */
export interface ProjectCardStatus {
  readonly label: string;
  /**
   * A `PillTone`, not the wider `CardTone`: the chip is a `StatusPill`, and
   * `HealthTone` is already a strict subset of `PillTone`, so a health state
   * drops in with no mapping and no tone this pill cannot render.
   */
  readonly tone: PillTone;
  /** True when the chip is carrying a health state rather than a lifecycle one. */
  readonly fromHealth: boolean;
}

export function projectCardStatus(project: {
  readonly completedAt: string | null;
  readonly archivedAt: string | null;
  readonly status: ProjectWorkflowStatus;
  readonly health: ProjectHealth;
  readonly healthVisible: boolean;
}): ProjectCardStatus {
  // The SHARED lifecycle predicates, not a second copy of the same comparison
  // — every surface that decides "is this archived?" asks the same function.
  if (isProjectArchived(project)) {
    return { label: "Archived", tone: "neutral", fromHealth: false };
  }
  if (isProjectComplete(project)) {
    return { label: "Completed", tone: "success", fromHealth: false };
  }
  // `on_track` is the absence of a signal, so promoting it would replace a
  // useful word ("Active") with a vaguer one and gain nothing.
  if (project.healthVisible && project.health.state !== "on_track") {
    return {
      label: project.health.label,
      tone: project.health.tone,
      fromHealth: true,
    };
  }
  return {
    label: projectWorkflowStatusLabel(project.status),
    tone: "neutral",
    fromHealth: false,
  };
}

/** The display data for one project Card (pure derivation, unit-tested). */
export interface ProjectCardData {
  readonly id: string;
  readonly title: string;
  readonly areaLabel: string | null;
  readonly goalLabel: string | null;
  /**
   * The Area's stable colour rank, so the Project card wears its Area's accent.
   * `null` when the Project has no Area and the card falls back to the neutral
   * entity container.
   */
  readonly areaColourRank: number | null;
  /** The owner's chosen icon KEY, or `null` for the Project default. */
  readonly iconKey: EntityIconKey | null;
  /** The parent context line — "DalyHub V2 · Launch the site" — or null. */
  readonly parentLabel: string | null;
  /** The ONE status chip. */
  readonly status: ProjectCardStatus;
  /**
   * Whether the Project is archived, as a fact rather than as an English word.
   *
   * The card's quieter treatment reads THIS, not `status.label === "Archived"`.
   * Comparing against display text makes a lifecycle rule depend on copy: it
   * breaks the moment the chip is reworded, and it would break silently — the
   * card would simply stop looking archived, with no type error and no failing
   * assertion about the label itself. The rule lives once, in
   * `isProjectArchived`, and both the chip and the styling read it from here.
   */
  readonly isArchived: boolean;
  /** Whether the Project is complete — same reasoning as {@link isArchived}. */
  readonly isComplete: boolean;
  /**
   * The health REASON, only when the chip is a health chip AND the reason says
   * something the label does not. Never a second copy of the state.
   */
  readonly statusDetail: string | null;
  readonly progress: ProjectProgress;
  /** e.g. "Updated 21 Jul 2026", or null when it doesn't genuinely help. */
  readonly updatedLabel: string | null;
  /** The DERIVED health signal (PROJ-02). */
  readonly health: ProjectHealth;
  /** Whether active-work health should be presented — see {@link isHealthVisible}. */
  readonly healthVisible: boolean;
}

/**
 * A JSON-serialised task summary for a project's task list (includes the waiting
 * state, which the generic `serializeTaskListItem` omits, so a project shows its
 * blocked work with the TODAY-03 waiting representation).
 */
export interface SerializedProjectTask {
  readonly id: string;
  readonly title: string;
  readonly completedAt: string | null;
  readonly status: TaskStatus;
  readonly priority: TaskPriority | null;
  readonly dueDate: string | null;
  readonly scheduledDate: string | null;
  /** Planning window — carried so the ONE `taskDisplayState` evaluator applies. */
  readonly timeSector: TimeSector | null;
  /** Commitment state — carried so Someday/Maybe resolves via `taskDisplayState`. */
  readonly commitmentState: CommitmentState;
  readonly waiting: SerializedTaskWaiting | null;
}

/** Serialise a kernel `TaskListItem` for a project's task list (Dates → ISO). */
export function serializeProjectTask(
  item: TaskListItem,
): SerializedProjectTask {
  return {
    id: item.id,
    title: item.title,
    completedAt: item.completedAt ? item.completedAt.toISOString() : null,
    status: item.status,
    priority: item.priority,
    dueDate: item.dueDate,
    scheduledDate: item.scheduledDate,
    timeSector: item.timeSector,
    commitmentState: item.commitmentState,
    waiting: item.waiting ? serializeTaskWaiting(item.waiting) : null,
  };
}

/**
 * The parent context line.
 *
 * A Project belongs to an Area either directly or through a Goal, and the
 * repository resolves BOTH live (never a copied label). The card shows the
 * Area first because it is the stable coordinate an owner navigates by, then
 * the Goal where one exists — so an Area stays discoverable from every Project
 * card without a second line.
 */
export function projectParentLabel(project: {
  readonly areaLabel: string | null;
  readonly goalLabel: string | null;
}): string | null {
  const parts = [project.areaLabel, project.goalLabel].filter(
    (part): part is string => part !== null && part.length > 0,
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Map a serialised project list item into its Card display data. */
export function toProjectCardData(
  item: SerializedProjectListItem,
): ProjectCardData {
  const updated = formatCalendarDate(item.updatedAt.slice(0, 10));
  const areaLabel = item.area?.title ?? null;
  const goalLabel = item.goal?.title ?? null;
  const status = projectCardStatus(item);
  const primaryReason = item.health.reasons[0];
  const reasonText = primaryReason ? healthReasonText(primaryReason) : null;
  return {
    id: item.id,
    title: item.title,
    areaLabel,
    goalLabel,
    areaColourRank: item.areaColourRank,
    iconKey: item.iconKey,
    parentLabel: projectParentLabel({ areaLabel, goalLabel }),
    status,
    // The SAME predicates `projectCardStatus` branches on, so the chip and the
    // styling can never disagree about what this Project is.
    isArchived: isProjectArchived(item),
    isComplete: isProjectComplete(item),
    // Only when the chip is a health chip, and only when the reason adds
    // something the chip's own word does not.
    statusDetail:
      status.fromHealth && reasonText !== null && reasonText !== status.label
        ? reasonText
        : null,
    progress: projectProgress(item.taskCompleted, item.taskTotal),
    updatedLabel: updated ? `Updated ${updated}` : null,
    health: item.health,
    healthVisible: item.healthVisible,
  };
}
