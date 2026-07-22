/**
 * PROJ-01 — the project overview, composed through the shared DS-02 Record Layout.
 *
 * Presentation only: the record Header (identity, title, open/completed state, Area
 * and optional Goal context, the reversible Complete/Reopen action and Rename), a
 * Summary of concise DERIVED facts (parent Area, optional Goal, state, task totals,
 * completed count, roll-up progress, created/updated), and the Tasks + Key links
 * tabs. Area/Goal titles are the resolved current titles (never copied); progress is
 * the derived roll-up (an empty project reads "No tasks yet", never 100%). The data
 * loading and mutations live in the route; this component only renders them.
 */

import type { ReactNode } from "react";

import { EntityIcon } from "~/shared/entity";
import {
  HealthIndicator,
  ProjectHealthPanel,
  type ProjectHealth,
} from "~/shared/project-health";
import {
  RecordLayout,
  type RecordAction,
  type RecordMetaItem,
} from "~/shared/record-layout";
import { formatCalendarDate } from "~/shared/task-record/task-view";

import {
  isProjectComplete,
  type ProjectProgress,
  type SerializedProjectOverview,
} from "./project-view";

interface ProjectOverviewProps {
  readonly overview: SerializedProjectOverview;
  readonly progress: ProjectProgress;
  /** The DERIVED health signal (PROJ-02). */
  readonly health: ProjectHealth;
  /** The effective completed state (optimistic override applied). */
  readonly completed: boolean;
  readonly completionPending: boolean;
  readonly onToggleComplete: (complete: boolean) => void;
  /** Opens the Rename drawer. */
  readonly onRename: () => void;
  readonly tasksTab: ReactNode;
  readonly linksTab: ReactNode;
  /** Controlled active tab (deep-linked via the Record Layout). */
  readonly activeTabId?: string;
  readonly onTabChange?: (tabId: string) => void;
}

export function ProjectOverview({
  overview,
  progress,
  health,
  completed,
  completionPending,
  onToggleComplete,
  onRename,
  tasksTab,
  linksTab,
  activeTabId,
  onTabChange,
}: ProjectOverviewProps) {
  const state = completed
    ? { label: "Completed", tone: "success" as const }
    : { label: "Open", tone: "neutral" as const };

  const headerMetadata: RecordMetaItem[] = [];
  headerMetadata.push({
    id: "health",
    label: "Health",
    value: <HealthIndicator health={health} />,
  });
  if (overview.area) {
    headerMetadata.push({
      id: "area",
      label: "Area",
      value: overview.area.title,
    });
  }
  if (overview.goal) {
    headerMetadata.push({
      id: "goal",
      label: "Goal",
      value: overview.goal.title,
    });
  }

  const created = formatCalendarDate(overview.createdAt.slice(0, 10));
  const updated = formatCalendarDate(overview.updatedAt.slice(0, 10));

  const summaryMetadata: RecordMetaItem[] = [];
  if (overview.area) {
    summaryMetadata.push({
      id: "s-area",
      label: "Area",
      value: overview.area.title,
    });
  }
  if (overview.goal) {
    summaryMetadata.push({
      id: "s-goal",
      label: "Goal",
      value: overview.goal.title,
    });
  }
  summaryMetadata.push({ id: "s-state", label: "State", value: state.label });
  summaryMetadata.push({
    id: "s-tasks",
    label: "Tasks",
    value: progress.has
      ? `${progress.completed} of ${progress.total} complete`
      : "No tasks yet",
  });
  if (created) {
    summaryMetadata.push({ id: "s-created", label: "Created", value: created });
  }
  if (updated) {
    summaryMetadata.push({ id: "s-updated", label: "Updated", value: updated });
  }

  const primaryAction: RecordAction = completed
    ? {
        id: "reopen",
        label: "Reopen project",
        variant: "secondary",
        disabled: completionPending,
        onSelect: () => onToggleComplete(false),
      }
    : {
        id: "complete",
        label: "Complete project",
        variant: "primary",
        disabled: completionPending,
        onSelect: () => onToggleComplete(true),
      };

  const renameAction: RecordAction = {
    id: "rename",
    label: "Rename",
    variant: "secondary",
    onSelect: onRename,
  };

  return (
    <RecordLayout
      title={overview.title}
      typeLabel="Project"
      icon={<EntityIcon type="project" />}
      breadcrumb={[{ id: "projects", label: "Projects", href: "/projects" }]}
      status={{ label: state.label, tone: state.tone }}
      metadata={headerMetadata}
      primaryAction={primaryAction}
      secondaryActions={[renameAction]}
      summary={{
        description: (
          <div className="dh-project-overview__summary">
            <p className="dh-project-overview__progress">
              <span className="dh-project-overview__progress-label">
                Roll-up progress:
              </span>{" "}
              {progress.has
                ? `${progress.percent}% — ${progress.summary} complete`
                : "No tasks yet."}
            </p>
            <ProjectHealthPanel health={health} />
          </div>
        ),
        metadata: summaryMetadata,
      }}
      activeTabId={activeTabId}
      onTabChange={onTabChange}
      tabs={[
        { id: "tasks", label: "Tasks", content: tasksTab },
        { id: "links", label: "Key links", content: linksTab },
      ]}
    />
  );
}

/** Whether the serialized overview is currently completed (spine `completedAt`). */
export function overviewCompleted(
  overview: SerializedProjectOverview,
): boolean {
  return isProjectComplete(overview);
}
