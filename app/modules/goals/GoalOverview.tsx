/**
 * AREA-02 — the canonical Goal record, composed through the shared DS-02
 * Record Layout.
 *
 * Presentation only: the header (identity, explicit Open/Completed state, Area
 * breadcrumb, target date, Complete/Reopen + Rename + Edit details), the
 * Summary (definition of done, target date, exact Project-contribution
 * progress — always kept visually distinct from explicit completion), the
 * Projects tab (Projects directly advancing this Goal) and the Activity tab.
 * Data loading and mutations live in the route; this component only renders
 * them.
 */

import { useId } from "react";
import type { ReactNode } from "react";

import {
  GoalAlignmentPanel,
  type GoalAlignment,
  type SerializedGoalAlignmentEvidence,
} from "~/shared/alignment";
import {
  Card,
  CardCollection,
  type CardMetaItem,
  type CardProps,
} from "~/shared/card";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon } from "~/shared/entity";
import {
  RecordLayout,
  type RecordAction,
  type RecordMetaItem,
} from "~/shared/record-layout";
import { formatCalendarDate } from "~/shared/task-record/task-view";

import {
  goalContributionProgress,
  goalProjectStateLabel,
  goalStateLabel,
  isGoalComplete,
  NO_DEFINITION_OF_DONE_TEXT,
  targetDatePresentation,
  type SerializedGoalDetails,
  type SerializedGoalOverview,
  type SerializedGoalProjectContribution,
  type SerializedGoalProjectItem,
} from "./goal-view";

interface GoalOverviewProps {
  readonly overview: SerializedGoalOverview;
  readonly details: SerializedGoalDetails;
  readonly contribution: SerializedGoalProjectContribution;
  readonly projects: readonly SerializedGoalProjectItem[];
  readonly projectsNextCursor: string | null;
  readonly todayIso: string;
  /** AREA-03: the derived Goal alignment (ADR-040) — whether recent Task
   * activity has contributed to this Goal, with explained reasons. */
  readonly alignment: GoalAlignment;
  readonly alignmentEvidence: readonly SerializedGoalAlignmentEvidence[];
  readonly alignmentEvidenceHasMore: boolean;
  readonly completionPending: boolean;
  readonly onToggleComplete: (complete: boolean) => void;
  readonly onRename: () => void;
  readonly onEditDetails: () => void;
  readonly onOpenProject: (projectId: string) => void;
  readonly onOpenTask: (taskId: string) => void;
  readonly activityTab: ReactNode;
  readonly activeTabId?: string;
  readonly onTabChange?: (tabId: string) => void;
}

function dateLabel(iso: string): string | null {
  return formatCalendarDate(iso.slice(0, 10));
}

function projectCard(
  project: SerializedGoalProjectItem,
  onOpenProject: (projectId: string) => void,
): CardProps {
  const hasTasks = project.taskTotal > 0;
  const metadata: CardMetaItem[] = [];
  if (hasTasks) {
    metadata.push({
      id: "tasks",
      label: "Tasks",
      value: `${project.taskCompleted} of ${project.taskTotal} tasks`,
    });
  } else {
    metadata.push({ id: "tasks", label: "Tasks", value: "No tasks yet" });
  }
  return {
    id: project.id,
    title: project.title,
    typeLabel: "Project",
    icon: <EntityIcon type="project" />,
    headingLevel: 3,
    status: goalProjectStateLabel(project),
    metadata,
    progress: hasTasks
      ? {
          value: project.taskCompleted,
          max: project.taskTotal,
          label: `Task roll-up: ${project.taskCompleted} of ${project.taskTotal} tasks`,
        }
      : undefined,
    density: "comfortable",
    presentation: "list",
    href: `/projects/${encodeURIComponent(project.id)}`,
    onOpen: () => onOpenProject(project.id),
    openAriaLabel: `Open ${project.title}`,
  };
}

function BoundedNote({ nextCursor }: { readonly nextCursor: string | null }) {
  if (!nextCursor) {
    return null;
  }
  return (
    <p className="dh-goal-bounded-note" role="note">
      More Projects advance this Goal. This record shows the first bounded page.
    </p>
  );
}

export function GoalOverview({
  overview,
  details,
  contribution,
  projects,
  projectsNextCursor,
  todayIso,
  alignment,
  alignmentEvidence,
  alignmentEvidenceHasMore,
  completionPending,
  onToggleComplete,
  onRename,
  onEditDetails,
  onOpenProject,
  onOpenTask,
  activityTab,
  activeTabId,
  onTabChange,
}: GoalOverviewProps) {
  const completed = isGoalComplete(overview);
  const state = goalStateLabel(overview);
  const created = dateLabel(overview.createdAt);
  const updated = dateLabel(overview.updatedAt);
  const target = targetDatePresentation(details.targetDate, todayIso);
  const progress = goalContributionProgress(contribution);
  const alignmentHeadingId = useId();

  const headerMetadata: RecordMetaItem[] = [];
  if (target.state !== "unset") {
    headerMetadata.push({
      id: "target",
      label: "Target date",
      value:
        target.state === "overdue"
          ? `${target.formatted} (overdue)`
          : (target.formatted ?? ""),
    });
  }

  const summaryMetadata: RecordMetaItem[] = [];
  summaryMetadata.push({
    id: "target",
    label: "Target date",
    value:
      target.state === "unset"
        ? "No target date set"
        : target.state === "overdue"
          ? `${target.formatted} — overdue`
          : `${target.formatted}`,
  });
  if (created) {
    summaryMetadata.push({ id: "created", label: "Created", value: created });
  }
  if (updated) {
    summaryMetadata.push({ id: "updated", label: "Updated", value: updated });
  }
  summaryMetadata.push({
    id: "state",
    label: "Explicit completion",
    value: state.label,
  });

  const primaryAction: RecordAction = completed
    ? {
        id: "reopen",
        label: "Reopen",
        variant: "secondary",
        disabled: completionPending,
        onSelect: () => onToggleComplete(false),
      }
    : {
        id: "complete",
        label: "Complete",
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
  const editDetailsAction: RecordAction = {
    id: "edit-details",
    label: "Edit details",
    variant: "secondary",
    onSelect: onEditDetails,
  };

  return (
    <RecordLayout
      title={overview.title}
      typeLabel="Goal"
      icon={<EntityIcon type="goal" />}
      breadcrumb={[
        { id: "areas", label: "Areas", href: "/areas" },
        {
          id: "area",
          label: overview.area.title,
          href: `/areas/${encodeURIComponent(overview.area.id)}`,
        },
      ]}
      status={{ label: state.label, tone: state.tone }}
      metadata={headerMetadata}
      primaryAction={completed ? undefined : primaryAction}
      secondaryActions={
        completed
          ? [primaryAction, renameAction, editDetailsAction]
          : [renameAction, editDetailsAction]
      }
      summary={{
        description: (
          <div className="dh-goal-overview__summary">
            <div className="dh-goal-overview__definition">
              <h2 className="dh-goal-overview__definition-heading">
                Definition of done
              </h2>
              {details.definitionOfDone ? (
                <p className="dh-goal-overview__definition-text">
                  {details.definitionOfDone}
                </p>
              ) : (
                <p className="dh-goal-overview__definition-empty">
                  {NO_DEFINITION_OF_DONE_TEXT}
                </p>
              )}
            </div>
            <p className="dh-goal-overview__progress">
              <span className="dh-goal-overview__progress-label">
                Project contribution:
              </span>{" "}
              {progress.has
                ? `${progress.percent}% — ${progress.summary}`
                : progress.summary}
            </p>
            <div className="dh-goal-overview__alignment">
              <h2
                id={alignmentHeadingId}
                className="dh-goal-overview__alignment-heading"
              >
                Alignment
              </h2>
              <GoalAlignmentPanel
                alignment={alignment}
                evidence={alignmentEvidence}
                evidenceHasMore={alignmentEvidenceHasMore}
                todayIso={todayIso}
                headingId={alignmentHeadingId}
                onOpenTask={onOpenTask}
              />
            </div>
          </div>
        ),
        metadata: summaryMetadata,
      }}
      activeTabId={activeTabId}
      onTabChange={onTabChange}
      tabs={[
        {
          id: "projects",
          label: "Projects",
          badge: contribution.total,
          content:
            projects.length === 0 ? (
              <EmptyState
                icon={<EntityIcon type="project" />}
                title="No Projects advancing this Goal"
                description="Projects created for this Goal will appear here."
              />
            ) : (
              <>
                <h2 className="dh-visually-hidden">Projects</h2>
                <CardCollection
                  items={projects}
                  getItemId={(project) => project.id}
                  ariaLabel="Goal Projects"
                  presentation="list"
                  density="comfortable"
                  renderCard={(project) => (
                    <Card {...projectCard(project, onOpenProject)} />
                  )}
                />
                <BoundedNote nextCursor={projectsNextCursor} />
              </>
            ),
        },
        { id: "activity", label: "Activity", content: activityTab },
      ]}
    />
  );
}
