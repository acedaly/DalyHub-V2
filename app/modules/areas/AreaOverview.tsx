/**
 * AREA-01 — canonical Area record, composed through the shared DS-02 Record Layout.
 */

import type { ReactNode } from "react";

import {
  Card,
  CardCollection,
  type CardMetaItem,
  type CardProps,
} from "~/shared/card";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon } from "~/shared/entity";
import { HealthIndicator } from "~/shared/project-health";
import {
  RecordLayout,
  type RecordAction,
  type RecordMetaItem,
} from "~/shared/record-layout";
import { formatCalendarDate } from "~/shared/task-record/task-view";
import type { AreaMomentum } from "~/kernel/areas";

import {
  areaStateLabel,
  goalStateLabel,
  projectStateLabel,
  rollupProgress,
  type SerializedAreaGoalItem,
  type SerializedAreaOverview,
  type SerializedAreaProjectItem,
  type SerializedAreaRollup,
} from "./area-view";

interface AreaOverviewViewProps {
  readonly overview: SerializedAreaOverview;
  readonly rollup: SerializedAreaRollup;
  readonly momentum: AreaMomentum;
  readonly goals: readonly SerializedAreaGoalItem[];
  readonly goalsNextCursor: string | null;
  readonly projects: readonly SerializedAreaProjectItem[];
  readonly projectsNextCursor: string | null;
  readonly onRename: () => void;
  readonly onOpenProject: (projectId: string) => void;
  readonly activityTab: ReactNode;
  readonly activeTabId?: string;
  readonly onTabChange?: (tabId: string) => void;
}

function dateLabel(iso: string): string | null {
  return formatCalendarDate(iso.slice(0, 10));
}

function MomentumPanel({ momentum }: { readonly momentum: AreaMomentum }) {
  return (
    <section className="dh-area-momentum" data-state={momentum.state}>
      <div className="dh-area-momentum__header">
        <span className="dh-health__pill" data-tone={momentum.tone}>
          <span className="dh-health__dot" aria-hidden="true" />
          {momentum.label}
        </span>
        <p>{momentum.summary}</p>
      </div>
      <ul className="dh-area-momentum__reasons">
        {momentum.reasons.map((reason) => (
          <li key={`${reason.code}-${reason.count ?? "none"}`}>
            {reason.summary}
          </li>
        ))}
      </ul>
    </section>
  );
}

function goalCard(goal: SerializedAreaGoalItem): CardProps {
  const projects = rollupProgress(
    {
      total: goal.projectTotal,
      completed: goal.projectCompleted,
      ratio:
        goal.projectTotal === 0
          ? null
          : goal.projectCompleted / goal.projectTotal,
    },
    "project",
  );
  const tasks = rollupProgress(
    {
      total: goal.taskTotal,
      completed: goal.taskCompleted,
      ratio: goal.taskTotal === 0 ? null : goal.taskCompleted / goal.taskTotal,
    },
    "task",
  );
  const metadata: CardMetaItem[] = [
    {
      id: "projects",
      label: "Projects",
      value: projects.has ? projects.summary : "No projects yet",
    },
  ];
  if (!tasks.has) {
    metadata.push({ id: "tasks", label: "Tasks", value: "No tasks yet" });
  }

  return {
    id: goal.id,
    title: goal.title,
    typeLabel: "Goal",
    icon: <EntityIcon type="goal" />,
    headingLevel: 3,
    status: goalStateLabel(goal),
    metadata,
    progress: tasks.has
      ? {
          value: tasks.completed,
          max: tasks.total,
          label: `Task roll-up: ${tasks.summary}`,
        }
      : undefined,
    density: "comfortable",
    presentation: "list",
  };
}

function projectCard(
  project: SerializedAreaProjectItem,
  onOpenProject: (projectId: string) => void,
): CardProps {
  const tasks = rollupProgress(
    {
      total: project.taskTotal,
      completed: project.taskCompleted,
      ratio:
        project.taskTotal === 0
          ? null
          : project.taskCompleted / project.taskTotal,
    },
    "task",
  );
  const metadata: CardMetaItem[] = [];
  if (project.healthVisible) {
    metadata.push({
      id: "health",
      label: "Health",
      value: <HealthIndicator health={project.health} showReason />,
    });
  }
  if (!tasks.has) {
    metadata.push({ id: "tasks", label: "Tasks", value: "No tasks yet" });
  }
  const parentLabel =
    project.parent.kind === "goal"
      ? `Goal: ${project.parent.goal.title}`
      : "Directly in this Area";

  return {
    id: project.id,
    title: project.title,
    typeLabel: "Project",
    icon: <EntityIcon type="project" />,
    headingLevel: 3,
    status: projectStateLabel(project),
    context: { label: parentLabel },
    metadata,
    progress: tasks.has
      ? {
          value: tasks.completed,
          max: tasks.total,
          label: `Task roll-up: ${tasks.summary}`,
        }
      : undefined,
    density: "comfortable",
    presentation: "list",
    href: `/projects/${encodeURIComponent(project.id)}`,
    onOpen: () => onOpenProject(project.id),
    openAriaLabel: `Open ${project.title}`,
  };
}

function BoundedNote({
  kind,
  nextCursor,
}: {
  readonly kind: "Goals" | "Projects";
  readonly nextCursor: string | null;
}) {
  if (!nextCursor) {
    return null;
  }
  return (
    <p className="dh-area-bounded-note" role="note">
      More {kind.toLowerCase()} exist for this Area. This record shows the first
      bounded page.
    </p>
  );
}

export function AreaOverviewView({
  overview,
  rollup,
  momentum,
  goals,
  goalsNextCursor,
  projects,
  projectsNextCursor,
  onRename,
  onOpenProject,
  activityTab,
  activeTabId,
  onTabChange,
}: AreaOverviewViewProps) {
  const state = areaStateLabel();
  const goalsProgress = rollupProgress(rollup.goals, "goal");
  const projectsProgress = rollupProgress(rollup.projects, "project");
  const tasksProgress = rollupProgress(rollup.tasks, "task");
  const created = dateLabel(overview.createdAt);
  const updated = dateLabel(overview.updatedAt);
  const headerMetadata: RecordMetaItem[] = [
    {
      id: "goals",
      label: "Goals",
      value: goalsProgress.has ? goalsProgress.summary : "No goals yet",
    },
    {
      id: "projects",
      label: "Projects",
      value: projectsProgress.has
        ? projectsProgress.summary
        : "No projects yet",
    },
  ];
  if (tasksProgress.has) {
    headerMetadata.push({
      id: "tasks",
      label: "Tasks",
      value: tasksProgress.summary,
    });
  }
  const summaryMetadata: RecordMetaItem[] = [];
  if (created) {
    summaryMetadata.push({ id: "created", label: "Created", value: created });
  }
  if (updated) {
    summaryMetadata.push({ id: "updated", label: "Updated", value: updated });
  }
  summaryMetadata.push({
    id: "state",
    label: "State",
    value: state.label,
  });

  const renameAction: RecordAction = {
    id: "rename",
    label: "Rename",
    variant: "secondary",
    onSelect: onRename,
  };

  return (
    <RecordLayout
      title={overview.title}
      typeLabel="Area"
      icon={<EntityIcon type="area" />}
      breadcrumb={[{ id: "areas", label: "Areas", href: "/areas" }]}
      status={{ label: state.label, tone: state.tone }}
      metadata={headerMetadata}
      secondaryActions={[renameAction]}
      summary={{
        description: (
          <div className="dh-area-overview__summary">
            <p className="dh-area-overview__progress">
              <span className="dh-area-overview__progress-label">
                Roll-up progress:
              </span>{" "}
              {tasksProgress.has
                ? `${tasksProgress.percent}% — ${tasksProgress.summary} complete`
                : "No active tasks yet."}
            </p>
            <MomentumPanel momentum={momentum} />
          </div>
        ),
        metadata: summaryMetadata,
      }}
      activeTabId={activeTabId}
      onTabChange={onTabChange}
      tabs={[
        {
          id: "goals",
          label: "Goals",
          badge: goals.length,
          content:
            goals.length === 0 ? (
              <EmptyState
                icon={<EntityIcon type="goal" />}
                title="No Goals in this Area"
                description="Goals for this Area will appear here once AREA-02 adds Goal records."
              />
            ) : (
              <>
                <h2 className="dh-visually-hidden">Goals</h2>
                <CardCollection
                  items={goals}
                  getItemId={(goal) => goal.id}
                  ariaLabel="Area Goals"
                  presentation="list"
                  density="comfortable"
                  renderCard={(goal) => <Card {...goalCard(goal)} />}
                />
                <BoundedNote kind="Goals" nextCursor={goalsNextCursor} />
              </>
            ),
        },
        {
          id: "projects",
          label: "Projects",
          badge: projects.length,
          content:
            projects.length === 0 ? (
              <EmptyState
                icon={<EntityIcon type="project" />}
                title="No Projects in this Area"
                description="Direct Projects and Projects advancing this Area's Goals will appear here."
              />
            ) : (
              <>
                <h2 className="dh-visually-hidden">Projects</h2>
                <CardCollection
                  items={projects}
                  getItemId={(project) => project.id}
                  ariaLabel="Area Projects"
                  presentation="list"
                  density="comfortable"
                  renderCard={(project) => (
                    <Card {...projectCard(project, onOpenProject)} />
                  )}
                />
                <BoundedNote kind="Projects" nextCursor={projectsNextCursor} />
              </>
            ),
        },
        { id: "activity", label: "Activity", content: activityTab },
      ]}
    />
  );
}
