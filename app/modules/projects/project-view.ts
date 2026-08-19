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
import type { IdentityColourSlot } from "~/kernel/entities/identity-colour-slots";
import {
  projectWorkflowStatusLabel,
  type ProjectWorkflowStatus,
} from "~/kernel/project-settings";
import { isProjectHealthVisible } from "~/kernel/project-health";
import type { HealthReason, HealthTone } from "~/kernel/project-health";
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
  TaskBlockedSummary,
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
   * The resolved Area's stable colour rank. Retained as the fact it is — which
   * Area this Project belongs to — after the card's identity accent moved to
   * the Project's OWN rank. `null` when the Project has no Area.
   */
  readonly areaColourRank: number | null;
  /** The Project's own stable identity colour rank (see the kernel type). */
  readonly colourRank: number;
  /** The owner's chosen icon KEY, or `null` for the Project default. */
  readonly iconKey: EntityIconKey | null;
  /** IDENTITY-01 — the owner's chosen colour SLOT, or `null` for the derived one. */
  readonly colourSlot: IdentityColourSlot | null;
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
  /** The Project's stable identity colour rank — see the kernel type. */
  readonly colourRank: number;
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
  /**
   * IDENTITY-01 — the owner's chosen colour SLOT, or `null` for "no choice —
   * derive it". A stable NAME for the same reasons the icon is a key.
   */
  readonly colourSlot: string | null;
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
    colourRank: item.colourRank,
    iconKey: item.iconKey,
    colourSlot: item.colourSlot,
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
  colourSlot: string | null = null,
): SerializedProjectOverview {
  return {
    // Passed in rather than read from `ProjectOverview`: the chosen icon and
    // colour live in the Projects module's own detail row and are the settings
    // repository's to serve (ADR-037), so the projection the collection reads
    // is unchanged.
    iconKey,
    colourSlot,
    id: overview.id,
    title: overview.title,
    colourRank: overview.colourRank,
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

/**
 * UIX-02 — the ONE attention line a Project card carries.
 *
 * The gallery card used to state its condition twice: a filled status chip
 * beside the title ("At risk", "Stale", "Blocked") and, three lines below it, a
 * supporting sentence explaining the chip ("2 tasks past their due date"). Two
 * objects, one fact, and the chip was the loudest thing on a card whose job is
 * to be recognised by its identity mark.
 *
 * So the chip is gone and the sentence is promoted. It is drawn ONCE, in words,
 * with a small state dot beside it — which means nothing on the card is carried
 * by colour alone, and a card can say "3 overdue" without needing a pill to say
 * "At risk" as well.
 *
 * The compact wording comes from the reason's own STRUCTURED count, never from
 * re-deciding anything: `overdue` with `count: 3` reads "3 overdue" here and "3
 * tasks past their due date" in the accessible detail, and both are the same
 * number the evaluator produced. Where a reason has no count the evaluator's own
 * calm sentence is used unchanged.
 */
export interface ProjectAttention {
  /** The compact line the card draws — "3 overdue", "On track", "On hold". */
  readonly text: string;
  /**
   * The state dot's tone. Decorative — `text` always carries the meaning.
   *
   * `HealthTone`, not the wider `PillTone`: an attention line is either a
   * health signal or a lifecycle state, and neither can be `accent`. Identity
   * is not status (D21), so the one tone that means "this is a decorative
   * identity colour" must not be reachable from here.
   */
  readonly tone: HealthTone;
  /**
   * The full sentence, for the accessible name and for surfaces with room. It
   * is the evaluator's own phrasing, so nothing is lost by the compact form.
   */
  readonly detail: string;
  /** True when this line is a health signal rather than a lifecycle state. */
  readonly fromHealth: boolean;
}

/** The compact phrasing for one health reason, from its structured fields. */
function compactReason(reason: HealthReason): string {
  const count = reason.count;
  switch (reason.code) {
    case "overdue":
      return typeof count === "number" ? `${count} overdue` : reason.summary;
    case "slipped":
      return typeof count === "number" ? `${count} past plan` : reason.summary;
    case "upcoming_due":
      return typeof count === "number" ? `${count} due soon` : reason.summary;
    case "upcoming_scheduled":
      return typeof count === "number"
        ? `${count} planned soon`
        : reason.summary;
    case "blocked":
      // The evaluator's own sentence is "All N open tasks are waiting on
      // something else" — the WORD is the fact here, not the number.
      return "All open work waiting";
    case "waiting":
      return typeof count === "number" ? `${count} waiting` : reason.summary;
    case "long_waiting":
      return typeof reason.days === "number"
        ? `Waiting ${reason.days} days`
        : reason.summary;
    // "No progress in 24 days" is precise and long; the card wants the fact,
    // and the exact figure survives in `detail` and on the record.
    case "stale":
      return "No recent activity";
    case "no_tasks":
      return "No tasks yet";
    case "on_track":
      return "On track";
    default:
      return reason.summary;
  }
}

/**
 * Build a Project card's attention line.
 *
 * Lifecycle wins over health, and for the same reason `projectCardStatus`
 * branches that way: an archived or completed Project is not "at risk", and a
 * Planned or On-hold Project is deliberately not being worked, so a staleness
 * warning about it would be the product inventing a problem. That is the SHARED
 * `isProjectHealthVisible` rule, applied here through the same
 * `healthVisible` flag every other surface reads.
 */
export function projectAttention(project: {
  readonly completedAt: string | null;
  readonly archivedAt: string | null;
  readonly status: ProjectWorkflowStatus;
  readonly health: ProjectHealth;
  readonly healthVisible: boolean;
}): ProjectAttention {
  if (isProjectArchived(project)) {
    return {
      text: "Archived",
      tone: "neutral",
      detail: "This Project is archived.",
      fromHealth: false,
    };
  }
  if (isProjectComplete(project)) {
    return {
      text: "Completed",
      tone: "success",
      detail: "This Project is complete.",
      fromHealth: false,
    };
  }
  if (!project.healthVisible) {
    // Planned / On hold — the workflow status IS the most useful thing to say.
    const label = projectWorkflowStatusLabel(project.status);
    return {
      text: label,
      tone: "neutral",
      detail: `This Project is ${label.toLowerCase()}.`,
      fromHealth: false,
    };
  }
  const primary = project.health.reasons[0];
  if (!primary) {
    return {
      text: project.health.label,
      tone: project.health.tone,
      detail: project.health.label,
      fromHealth: true,
    };
  }
  return {
    text: compactReason(primary),
    tone: primary.tone,
    detail: healthReasonText(primary),
    fromHealth: true,
  };
}

/**
 * REDESIGN-04 — the gallery card's META LINE: "14 tasks · 4 due this week".
 *
 * `mockup3.png` draws exactly these two facts under a Project's progress bar,
 * and §5.5 allows them only if they are cheap. They are free:
 *
 *   - `14 tasks` is `taskTotal`, the rollup the bar above it is already drawn
 *     from — the same number, stated in words rather than as a proportion.
 *   - `4 due this week` is `health.summary.upcomingDueOpen`, which the
 *     collection loader already gathers for the WHOLE page in one facts read
 *     (`listProjectHealthFacts`) in order to evaluate health at all. The window
 *     is the evaluator's own `UPCOMING_WITHIN_DAYS` (7, today inclusive), which
 *     is what makes "this week" a true description rather than a rounded one.
 *
 * Neither costs a query, and neither is invented:
 *
 *   - a Project with no tasks has no proportion and no due count, so its line
 *     is the one honest thing left to say — "No tasks yet";
 *   - a Project with tasks but nothing due says "14 tasks" and stops, rather
 *     than printing "0 due this week", which reads as a warning about zero;
 *   - the due fragment is TINTED when the same evaluator reports overdue work,
 *     which is §5.6's "attention survives as signal". The tint is decorative —
 *     the fragment states its own count, and the state dot at the head of the
 *     line carries the evaluator's full sentence for assistive tech.
 */
export interface ProjectCardMetaFact {
  readonly key: string;
  readonly text: string;
  readonly tone?: HealthTone;
}

export function projectCardMeta(project: {
  readonly taskTotal: number;
  readonly health: ProjectHealth;
  readonly healthVisible: boolean;
}): readonly ProjectCardMetaFact[] {
  if (project.taskTotal <= 0) {
    return [{ key: "tasks", text: "No tasks yet" }];
  }
  const facts: ProjectCardMetaFact[] = [
    {
      key: "tasks",
      text: `${project.taskTotal} ${project.taskTotal === 1 ? "task" : "tasks"}`,
    },
  ];
  // Read defensively for the same reason the collection loader falls back to a
  // list item's own counts: health is derived, and a caller holding a partial
  // evaluation must get an honest "nothing to add" rather than a crash.
  const due = project.health.summary?.upcomingDueOpen ?? 0;
  if (due > 0) {
    facts.push({
      key: "due",
      text: `${due} due this week`,
      // Only where health is genuinely speaking: a Planned or On-hold Project
      // is deliberately not being worked, so tinting its due count would be the
      // product inventing a problem (the shared `healthVisible` rule).
      tone:
        project.healthVisible && (project.health.summary?.overdueOpen ?? 0) > 0
          ? "danger"
          : undefined,
    });
  }
  return facts;
}

/** The display data for one project Card (pure derivation, unit-tested). */
export interface ProjectCardData {
  readonly id: string;
  readonly title: string;
  readonly areaLabel: string | null;
  readonly goalLabel: string | null;
  /**
   * The Area's stable colour rank. No longer the card's accent — see
   * `colourRank` — but kept because it still answers "which Area is this".
   * `null` when the Project has no Area.
   */
  readonly areaColourRank: number | null;
  /**
   * The Project's OWN identity colour rank, and what the card's `AccentIcon`
   * paints. Every Project therefore has an identity of its own, including one
   * with no Area, which previously fell back to the neutral container.
   */
  readonly colourRank: number;
  /** The owner's chosen icon KEY, or `null` for the Project default. */
  readonly iconKey: EntityIconKey | null;
  /** IDENTITY-01 — the owner's chosen colour SLOT, or `null` for the derived one. */
  readonly colourSlot: IdentityColourSlot | null;
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
  /** UIX-02 — the attention SIGNAL the gallery card's meta line carries. */
  readonly attention: ProjectAttention;
  /** REDESIGN-04 — the card's meta line, already worded. */
  readonly meta: readonly ProjectCardMetaFact[];
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
  /**
   * TASKS-12 — blocked state, when the loader projected it.
   *
   * A blocked Task is still an OPEN Task: it counts towards the Project exactly
   * as it did before, and Project progress stays a function of completion alone.
   * There is deliberately no dependency-weighted progress anywhere in DalyHub.
   */
  readonly blocked?: TaskBlockedSummary;
}

/** Serialise a kernel `TaskListItem` for a project's task list (Dates → ISO). */
export function serializeProjectTask(
  item: TaskListItem,
  /** TASKS-12 — this Task's entry from the page's ONE bounded aggregate. */
  blocked?: TaskBlockedSummary,
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
    ...(blocked ? { blocked } : {}),
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
    colourRank: item.colourRank,
    iconKey: item.iconKey,
    colourSlot: item.colourSlot,
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
    attention: projectAttention(item),
    meta: projectCardMeta(item),
    progress: projectProgress(item.taskCompleted, item.taskTotal),
    updatedLabel: updated ? `Updated ${updated}` : null,
    health: item.health,
    healthVisible: item.healthVisible,
  };
}
