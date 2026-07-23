/**
 * AREA-01 Areas kernel — pure Area momentum evaluator.
 *
 * This is an explanatory aggregate over already-authoritative facts. It persists
 * nothing, averages no arbitrary percentages and never calls an Area "healthy"
 * simply because it is empty. Project warnings are reused from the existing
 * Project health evaluator and completed/archived projects do not create active
 * attention signals.
 */

import type {
  ProjectHealth,
  ProjectHealthState,
} from "~/kernel/project-health";
import type { ProjectWorkflowStatus } from "~/kernel/project-settings";
import type { AreaRollup } from "~/kernel/spine";

export type AreaMomentumState =
  "empty" | "steady" | "watch" | "needs_attention";

export type AreaMomentumTone =
  "neutral" | "success" | "info" | "warning" | "danger";

export type AreaMomentumReasonCode =
  | "no_active_work"
  | "active_work_present"
  | "direct_tasks"
  | "at_risk_projects"
  | "blocked_projects"
  | "stale_projects"
  | "on_hold_projects"
  | "completed_projects_ignored"
  | "archived_projects_ignored";

export type AreaMomentumReason = {
  readonly code: AreaMomentumReasonCode;
  readonly summary: string;
  readonly count?: number;
};

export type AreaMomentumProjectFacts = {
  readonly id: string;
  readonly completedAt: Date | string | null;
  readonly archivedAt: Date | string | null;
  readonly status: ProjectWorkflowStatus;
  readonly health: Pick<ProjectHealth, "state" | "label" | "tone" | "reasons">;
};

export type AreaMomentumFacts = {
  readonly rollup: AreaRollup;
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

function plural(count: number, singular: string, pluralNoun = `${singular}s`) {
  return count === 1 ? `1 ${singular}` : `${count} ${pluralNoun}`;
}

function activeProject(project: AreaMomentumProjectFacts): boolean {
  return (
    project.completedAt === null &&
    project.archivedAt === null &&
    project.status === "active"
  );
}

function countByHealth(
  projects: readonly AreaMomentumProjectFacts[],
  state: ProjectHealthState,
): number {
  return projects.filter(
    (project) => activeProject(project) && project.health.state === state,
  ).length;
}

export function evaluateAreaMomentum(
  facts: AreaMomentumFacts,
  context: AreaMomentumContext,
): AreaMomentum {
  const activeProjects = facts.projects.filter(
    (project) => project.completedAt === null && project.archivedAt === null,
  );
  const completedProjects = facts.projects.filter(
    (project) => project.completedAt !== null,
  );
  const archivedProjects = facts.projects.filter(
    (project) => project.archivedAt !== null,
  );
  const onHoldProjects = activeProjects.filter(
    (project) => project.status === "on_hold",
  );
  const atRisk = countByHealth(facts.projects, "at_risk");
  const blocked = countByHealth(facts.projects, "blocked");
  const stale = countByHealth(facts.projects, "stale");
  const hasDirectOrProjectWork =
    activeProjects.length > 0 || facts.rollup.tasks.total > 0;

  const reasons: AreaMomentumReason[] = [];
  if (completedProjects.length > 0) {
    reasons.push({
      code: "completed_projects_ignored",
      count: completedProjects.length,
      summary: `${plural(completedProjects.length, "completed project")} kept out of active attention.`,
    });
  }
  if (archivedProjects.length > 0) {
    reasons.push({
      code: "archived_projects_ignored",
      count: archivedProjects.length,
      summary: `${plural(archivedProjects.length, "archived project")} kept out of active attention.`,
    });
  }

  if (!hasDirectOrProjectWork && facts.rollup.goals.total === 0) {
    return {
      state: "empty",
      label: "No active work",
      tone: "neutral",
      summary: "This Area has no active goals, projects or tasks yet.",
      reasons: [
        {
          code: "no_active_work",
          summary: "No active descendants are contributing momentum.",
        },
        ...reasons,
      ],
      evaluatedAtIso: context.evaluatedAtIso,
    };
  }

  if (atRisk > 0) {
    return {
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
        ...reasons,
      ],
      evaluatedAtIso: context.evaluatedAtIso,
    };
  }

  if (blocked > 0) {
    return {
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
        ...reasons,
      ],
      evaluatedAtIso: context.evaluatedAtIso,
    };
  }

  if (stale > 0) {
    return {
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
        ...reasons,
      ],
      evaluatedAtIso: context.evaluatedAtIso,
    };
  }

  if (
    onHoldProjects.length > 0 &&
    activeProjects.length === onHoldProjects.length
  ) {
    return {
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
        ...reasons,
      ],
      evaluatedAtIso: context.evaluatedAtIso,
    };
  }

  const activeReason =
    activeProjects.length > 0
      ? {
          code: "active_work_present" as const,
          count: activeProjects.length,
          summary: `${plural(activeProjects.length, "active project")} contributing momentum.`,
        }
      : {
          code: "direct_tasks" as const,
          count: facts.rollup.tasks.total,
          summary: `${plural(facts.rollup.tasks.total, "task")} sits directly in this Area.`,
        };

  return {
    state: "steady",
    label: "Momentum visible",
    tone: "success",
    summary: "Active work is present without a derived warning.",
    reasons: [activeReason, ...reasons],
    evaluatedAtIso: context.evaluatedAtIso,
  };
}
