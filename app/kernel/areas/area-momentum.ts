/**
 * AREA-01 Areas kernel — pure Area momentum evaluator.
 *
 * This is an explanatory aggregate over already-authoritative facts. It persists
 * nothing, averages no arbitrary percentages and never calls an Area "healthy"
 * simply because it is empty. Project warnings are reused from the existing
 * Project health evaluator and completed/archived projects do not create active
 * attention signals.
 *
 * COMPLETE momentum boundary (post-merge correction). The caller MUST supply
 * facts for EVERY Project aligned to the Area (direct or Goal-backed) —
 * `AreaRepository.getAreaMomentumFacts` — never only the first displayed card
 * page. `facts.goals`/`facts.directTasks` distinguish OPEN/unfinished counts from
 * completed ones, and `facts.directTasks` is read from a dedicated direct-parent
 * query — never inferred from the combined Area task roll-up, which also counts
 * Tasks under Projects.
 *
 * Revised precedence (documented in `AREAS_MODULE.md` and ADR-038's dated
 * amendment):
 *   1. Any visible at-risk active Project      -> needs_attention
 *   2. Any visible blocked active Project      -> needs_attention
 *   3. Any visible stale active Project        -> watch
 *   4. On-hold Projects with NO active Project, NO unfinished direct Area Task
 *      and NO open Goal                        -> watch (calm paused wording)
 *   5. One or more active workflow Projects    -> steady
 *   6. One or more unfinished direct Area Tasks -> steady
 *   7. One or more open Goals (no Projects/Tasks) -> watch (honest, non-active wording)
 *   8. Planned-only Projects                   -> watch (never described as active)
 *   9. Nothing above                           -> empty ("No active work")
 *  10. Completed/archived Projects are always explanatory context, never a warning.
 *  11. No reason ever reports a zero-count positive fact.
 */

import type {
  ProjectHealth,
  ProjectHealthState,
} from "~/kernel/project-health";
import type { ProjectWorkflowStatus } from "~/kernel/project-settings";

export type AreaMomentumState =
  "empty" | "steady" | "watch" | "needs_attention";

export type AreaMomentumTone =
  "neutral" | "success" | "info" | "warning" | "danger";

export type AreaMomentumReasonCode =
  | "open_goals"
  | "active_projects"
  | "planned_projects"
  | "on_hold_projects"
  | "unfinished_direct_tasks"
  | "at_risk_projects"
  | "blocked_projects"
  | "stale_projects"
  | "completed_projects_ignored"
  | "archived_projects_ignored"
  | "no_active_work";

export type AreaMomentumReason = {
  readonly code: AreaMomentumReasonCode;
  readonly summary: string;
  readonly count?: number;
};

/**
 * A Project aligned to the Area (direct or Goal-backed), classified by its
 * workflow status and completion/archival state. `health` is present only for a
 * Project the shared visibility rule (`isProjectHealthVisible`) says is a
 * genuinely active, non-completed, non-archived Project — the evaluator never
 * needs, and the caller never has to compute, health for a Planned, On-hold,
 * completed or archived Project.
 */
export type AreaMomentumProjectFacts = {
  readonly id: string;
  readonly status: ProjectWorkflowStatus;
  readonly completedAt: Date | string | null;
  readonly archivedAt: Date | string | null;
  readonly health?: Pick<ProjectHealth, "state" | "label" | "tone" | "reasons">;
};

/** Open versus completed Goal counts, directly belonging to the Area. */
export type AreaMomentumGoalFacts = {
  readonly openTotal: number;
  readonly completedTotal: number;
};

/**
 * Unfinished versus completed Task counts, parented DIRECTLY to the Area — never
 * derived from the combined Area task roll-up, which also includes Tasks under
 * Projects.
 */
export type AreaMomentumDirectTaskFacts = {
  readonly unfinishedTotal: number;
  readonly completedTotal: number;
};

export type AreaMomentumFacts = {
  readonly goals: AreaMomentumGoalFacts;
  readonly directTasks: AreaMomentumDirectTaskFacts;
  /** EVERY Project aligned to the Area — independent of any displayed card page. */
  readonly projects: readonly AreaMomentumProjectFacts[];
};

export type AreaMomentumContext = {
  /** Injected evaluation instant for deterministic tests and transparent display. */
  readonly evaluatedAtIso: string;
};

export type AreaMomentum = {
  readonly state: AreaMomentumState;
  readonly label: string;
  readonly tone: AreaMomentumTone;
  readonly summary: string;
  readonly reasons: readonly AreaMomentumReason[];
  readonly evaluatedAtIso: string;
};

type ProjectBucket =
  "active" | "planned" | "on_hold" | "completed" | "archived";

function plural(count: number, singular: string, pluralNoun = `${singular}s`) {
  return count === 1 ? `1 ${singular}` : `${count} ${pluralNoun}`;
}

/**
 * Classify a Project into exactly one bucket. Archival and completion both take
 * precedence over workflow status: a completed or archived Project is never
 * counted as active/planned/on-hold, matching the shared Project health
 * visibility rule (`isProjectHealthVisible`). Archived is checked FIRST so a
 * Project that is both completed and later archived is classified "archived" —
 * consistent with Area Project card presentation (`projectStateLabel`), which
 * also gives Archived precedence over Completed.
 */
function bucketOf(project: AreaMomentumProjectFacts): ProjectBucket {
  if (project.archivedAt !== null) return "archived";
  if (project.completedAt !== null) return "completed";
  return project.status;
}

function countByHealthState(
  activeProjects: readonly AreaMomentumProjectFacts[],
  state: ProjectHealthState,
): number {
  return activeProjects.filter((project) => project.health?.state === state)
    .length;
}

function result(
  context: AreaMomentumContext,
  fields: Omit<AreaMomentum, "evaluatedAtIso">,
): AreaMomentum {
  return { ...fields, evaluatedAtIso: context.evaluatedAtIso };
}

export function evaluateAreaMomentum(
  facts: AreaMomentumFacts,
  context: AreaMomentumContext,
): AreaMomentum {
  const buckets = new Map<ProjectBucket, AreaMomentumProjectFacts[]>();
  for (const bucket of [
    "active",
    "planned",
    "on_hold",
    "completed",
    "archived",
  ] as const) {
    buckets.set(bucket, []);
  }
  for (const project of facts.projects) {
    buckets.get(bucketOf(project))!.push(project);
  }
  const activeProjects = buckets.get("active")!;
  const plannedProjects = buckets.get("planned")!;
  const onHoldProjects = buckets.get("on_hold")!;
  const completedProjects = buckets.get("completed")!;
  const archivedProjects = buckets.get("archived")!;

  const atRisk = countByHealthState(activeProjects, "at_risk");
  const blocked = countByHealthState(activeProjects, "blocked");
  const stale = countByHealthState(activeProjects, "stale");

  const openGoals = facts.goals.openTotal;
  const unfinishedDirectTasks = facts.directTasks.unfinishedTotal;

  // Completed/archived Projects are always explanatory context (never a warning),
  // appended after every primary reason.
  const contextReasons: AreaMomentumReason[] = [];
  if (completedProjects.length > 0) {
    contextReasons.push({
      code: "completed_projects_ignored",
      count: completedProjects.length,
      summary: `${plural(completedProjects.length, "completed project")} kept out of active attention.`,
    });
  }
  if (archivedProjects.length > 0) {
    contextReasons.push({
      code: "archived_projects_ignored",
      count: archivedProjects.length,
      summary: `${plural(archivedProjects.length, "archived project")} kept out of active attention.`,
    });
  }

  if (atRisk > 0) {
    return result(context, {
      state: "needs_attention",
      label: "Needs attention",
      tone: "danger",
      summary: `${plural(atRisk, "active project")} has overdue or slipped work.`,
      reasons: [
        {
          code: "at_risk_projects",
          count: atRisk,
          summary: `${plural(atRisk, "active project")} is at risk.`,
        },
        ...contextReasons,
      ],
    });
  }

  if (blocked > 0) {
    return result(context, {
      state: "needs_attention",
      label: "Blocked work",
      tone: "warning",
      summary: `${plural(blocked, "active project")} is blocked by waiting work.`,
      reasons: [
        {
          code: "blocked_projects",
          count: blocked,
          summary: `${plural(blocked, "active project")} is blocked.`,
        },
        ...contextReasons,
      ],
    });
  }

  if (stale > 0) {
    return result(context, {
      state: "watch",
      label: "Worth a look",
      tone: "info",
      summary: `${plural(stale, "active project")} has not moved recently.`,
      reasons: [
        {
          code: "stale_projects",
          count: stale,
          summary: `${plural(stale, "active project")} is stale.`,
        },
        ...contextReasons,
      ],
    });
  }

  if (
    activeProjects.length === 0 &&
    unfinishedDirectTasks === 0 &&
    openGoals === 0 &&
    onHoldProjects.length > 0
  ) {
    return result(context, {
      state: "watch",
      label: "Mostly paused",
      tone: "neutral",
      summary: "The current projects in this Area are on hold.",
      reasons: [
        {
          code: "on_hold_projects",
          count: onHoldProjects.length,
          summary: `${plural(onHoldProjects.length, "project")} is on hold.`,
        },
        ...contextReasons,
      ],
    });
  }

  if (activeProjects.length > 0) {
    return result(context, {
      state: "steady",
      label: "Momentum visible",
      tone: "success",
      summary: "Active work is present without a derived warning.",
      reasons: [
        {
          code: "active_projects",
          count: activeProjects.length,
          summary: `${plural(activeProjects.length, "active project")} contributing momentum.`,
        },
        ...contextReasons,
      ],
    });
  }

  if (unfinishedDirectTasks > 0) {
    return result(context, {
      state: "steady",
      label: "Momentum visible",
      tone: "success",
      summary: "Active work is present without a derived warning.",
      reasons: [
        {
          code: "unfinished_direct_tasks",
          count: unfinishedDirectTasks,
          summary: `${plural(unfinishedDirectTasks, "direct Area Task")} unfinished.`,
        },
        ...contextReasons,
      ],
    });
  }

  if (openGoals > 0) {
    return result(context, {
      state: "watch",
      label: "Direction set",
      tone: "neutral",
      summary: "This Area has open goals but no active projects or tasks yet.",
      reasons: [
        {
          code: "open_goals",
          count: openGoals,
          summary: `${plural(openGoals, "open goal")} without active projects or tasks yet.`,
        },
        ...contextReasons,
      ],
    });
  }

  if (plannedProjects.length > 0) {
    return result(context, {
      state: "watch",
      label: "Work planned",
      tone: "neutral",
      summary: "Projects are planned here but none are active yet.",
      reasons: [
        {
          code: "planned_projects",
          count: plannedProjects.length,
          summary: `${plural(plannedProjects.length, "planned project")} not yet active.`,
        },
        ...contextReasons,
      ],
    });
  }

  return result(context, {
    state: "empty",
    label: "No active work",
    tone: "neutral",
    summary: "This Area has no active goals, projects or tasks yet.",
    reasons: [
      {
        code: "no_active_work",
        summary: "No active descendants are contributing momentum.",
      },
      ...contextReasons,
    ],
  });
}
