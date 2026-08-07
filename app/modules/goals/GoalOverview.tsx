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

import { ProgressMeter } from "~/shared/progress";
import {
  GoalAlignmentPanel,
  type GoalAlignment,
  type SerializedGoalAlignmentEvidence,
} from "~/shared/alignment";
import { EntityIcon } from "~/shared/entity";
import {
  RecordLayout,
  type RecordAction,
  type RecordMetaItem,
} from "~/shared/record-layout";
import { useRecordLifecycle } from "~/shared/record-lifecycle";
import { formatCalendarDate } from "~/shared/task-record/task-view";

import { GoalProjectsTab } from "./GoalProjectsTab";
import {
  goalContributionProgress,
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
  /** PX-04: reversible removal (soft-delete + Undo), from the header overflow. */
  readonly onDelete?: () => Promise<void>;
  readonly deletePending?: boolean;
  readonly onOpenProject: (projectId: string) => void;
  readonly onOpenTask: (taskId: string) => void;
  readonly activityTab: ReactNode;
  /** The shared Universal Relationship System Linked Items section. */
  readonly linkedTab: ReactNode;
  readonly activeTabId?: string;
  readonly onTabChange?: (tabId: string) => void;
}

function dateLabel(iso: string): string | null {
  return formatCalendarDate(iso.slice(0, 10));
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
  onDelete,
  deletePending = false,
  onOpenProject,
  onOpenTask,
  activityTab,
  linkedTab,
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

  // PX-04: a Goal had NO removal path at all, despite the spine supporting
  // soft-delete since FND-07. It now uses the same reversible removal as Notes —
  // one click, an Undo toast, and a durable "Deleted" collection view — housed in
  // the same shared overflow slot as every other record.
  const lifecycle = useRecordLifecycle({
    entityType: "goal",
    title: overview.title,
    deleteMode: "reversible",
    pending: deletePending,
    onDelete,
  });

  return (
    <>
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
        /*
         * M3-INT — declared in PRIORITY order, because the shared header shows
         * the first one and folds the rest into the overflow.
         *
         * "Edit details" edits what the Goal actually IS — its definition of
         * done and its target — and is the thing an owner returns to. Rename is
         * a low-frequency management action, and the interaction review named it
         * as an example of something that does not deserve permanent header
         * width. It is still one press away, in the overflow every record
         * already has.
         */
        secondaryActions={
          completed
            ? [primaryAction, editDetailsAction, renameAction]
            : [editDetailsAction, renameAction]
        }
        overflowActions={lifecycle.overflowActions}
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
              {/* THEME-01 — the same derived number, now shown as the shared
               * meter. `available` is false when no Project contributes yet, so
               * the Goal reads "no Projects yet" rather than an empty 0% bar. */}
              <ProgressMeter
                label="Project contribution"
                percent={progress.percent}
                summary={progress.summary}
                available={progress.has}
              />
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
            // The badge is the EXACT, complete contribution total
            // (`getGoalProjectContribution`) — never the loaded page's length — so a
            // Goal with more Projects than one page still reports the true total.
            badge: contribution.total,
            content: (
              <GoalProjectsTab
                goalId={overview.id}
                projects={projects}
                nextCursor={projectsNextCursor}
                onOpenProject={onOpenProject}
              />
            ),
          },
          { id: "linked", label: "Linked", content: linkedTab },
          { id: "activity", label: "Activity", content: activityTab },
        ]}
      />
      {lifecycle.dialogs}
    </>
  );
}
