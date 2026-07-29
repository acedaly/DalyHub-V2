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

import { EntityIcon, EntityLink } from "~/shared/entity";
import { useCapture } from "~/shared/capture";
import type { CaptureContextContract } from "~/shared/capture/capture-context";
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
import { useRecordLifecycle } from "~/shared/record-lifecycle";
import { formatCalendarDate } from "~/shared/task-record/task-view";

import {
  isProjectArchived,
  isProjectComplete,
  projectStateLabel,
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
  readonly knowledgeTab: ReactNode;
  /** The PROJ-04 Activity tab — the shared DS-05 Timeline. */
  readonly activityTab: ReactNode;
  /** The PROJ-05 Settings tab (DS-10b) — always the FINAL tab. */
  readonly settingsTab: ReactNode;
  /** PX-04: the shared lifecycle actions, surfaced in the header overflow too.
   * A Project archives rather than deletes (PROJ-05), so no delete is offered. */
  readonly onArchive?: () => Promise<void>;
  readonly onRestore?: () => Promise<void>;
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
  knowledgeTab,
  activityTab,
  settingsTab,
  onArchive,
  onRestore,
  activeTabId,
  onTabChange,
}: ProjectOverviewProps) {
  // An archived project is read-only until restored (PROJ-05 §5): the
  // Complete/Reopen and Rename actions are HIDDEN (not merely disabled) — the
  // repository already rejects these mutations against an archived project, so
  // this is a calm UI reflection of an invariant enforced elsewhere, not the
  // only thing standing between the user and a failed request.
  const archived = isProjectArchived(overview);
  const capture = useCapture();
  const captureContext: CaptureContextContract = {
    sourceEntityId: overview.id,
    sourceEntityType: "project",
    sourceEntityTitle: overview.title,
    sourceModule: "projects",
    originatingRoute: `/projects/${overview.id}`,
    mode: "removable",
    relationshipMeaning: "related",
    returnTo: `/projects/${overview.id}`,
  };
  // Archived → Completed → the specific workflow status (Planned/Active/On
  // hold) — the SAME precedence and label the collection Card uses, driven by
  // the optimistic `completed` override so the pill updates immediately on
  // Complete/Reopen, before revalidation refreshes `overview` itself.
  const state = projectStateLabel({
    completedAt: completed ? (overview.completedAt ?? "pending") : null,
    archivedAt: overview.archivedAt,
    status: overview.status,
  });

  const headerMetadata: RecordMetaItem[] = [];
  // Shown ONLY for genuinely active work (PROJ-05 §8 / ADR-037) — see
  // `isHealthVisible` in `project-view.ts`, the SAME rule the collection Card
  // and Today use.
  if (overview.healthVisible) {
    headerMetadata.push({
      id: "health",
      label: "Health",
      value: <HealthIndicator health={health} />,
    });
  }
  if (overview.area) {
    headerMetadata.push({
      id: "area",
      label: "Area",
      value: (
        <EntityLink
          type={overview.area.kind}
          id={overview.area.id}
          title={overview.area.title}
        />
      ),
    });
  }
  if (overview.goal) {
    headerMetadata.push({
      id: "goal",
      label: "Goal",
      value: (
        <EntityLink
          type={overview.goal.kind}
          id={overview.goal.id}
          title={overview.goal.title}
        />
      ),
    });
  }

  const created = formatCalendarDate(overview.createdAt.slice(0, 10));
  const updated = formatCalendarDate(overview.updatedAt.slice(0, 10));

  const summaryMetadata: RecordMetaItem[] = [];
  if (overview.area) {
    summaryMetadata.push({
      id: "s-area",
      label: "Area",
      value: (
        <EntityLink
          type={overview.area.kind}
          id={overview.area.id}
          title={overview.area.title}
        />
      ),
    });
  }
  if (overview.goal) {
    summaryMetadata.push({
      id: "s-goal",
      label: "Goal",
      value: (
        <EntityLink
          type={overview.goal.kind}
          id={overview.goal.id}
          title={overview.goal.title}
        />
      ),
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

  const primaryAction: RecordAction | undefined = archived
    ? undefined
    : completed
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

  // PX-04: Archive/Restore was reachable ONLY through the Settings sub-tab — the
  // commonest removal in the product was the hardest to find (UXA-06). It now
  // also sits in the shared header overflow, in the same slot as every other
  // record's lifecycle actions. Settings keeps the full explanation.
  const lifecycle = useRecordLifecycle({
    entityType: "project",
    title: overview.title,
    archived,
    onArchive,
    onRestore,
  });
  const contextualCreateActions = archived
    ? []
    : [
        {
          id: "capture-task",
          label: "New task",
          description: "Create a Task in this Project.",
          onSelect: () =>
            capture?.openCapture("task", null, {
              ...captureContext,
              relationshipMeaning: "parent",
            }),
        },
        {
          id: "capture-note",
          label: "New note",
          description: "Create a Note in Project Knowledge.",
          onSelect: () => capture?.openCapture("note", null, captureContext),
        },
        {
          id: "capture-meeting",
          label: "New meeting",
          description: "Create a Meeting linked to this Project.",
          onSelect: () => capture?.openCapture("meeting", null, captureContext),
        },
        {
          id: "capture-diary",
          label: "New diary entry",
          description: "Create a Diary entry linked to this Project.",
          onSelect: () => capture?.openCapture("diary", null, captureContext),
        },
      ];

  return (
    <>
      <RecordLayout
        title={overview.title}
        typeLabel="Project"
        icon={<EntityIcon type="project" />}
        breadcrumb={[{ id: "projects", label: "Projects", href: "/projects" }]}
        status={{ label: state.label, tone: state.tone }}
        metadata={headerMetadata}
        primaryAction={primaryAction}
        secondaryActions={archived ? [] : [renameAction]}
        overflowActions={[
          ...contextualCreateActions,
          ...lifecycle.overflowActions.map((item, index) =>
            index === 0 && contextualCreateActions.length > 0
              ? { ...item, separatorBefore: true }
              : item,
          ),
        ]}
        summary={{
          description: (
            <div className="dh-project-overview__summary">
              {archived ? (
                <p
                  className="dh-project-overview__archived-banner"
                  role="status"
                >
                  This project is archived and read-only. Open{" "}
                  <strong>Settings</strong> to restore it.
                </p>
              ) : null}
              <p className="dh-project-overview__progress">
                <span className="dh-project-overview__progress-label">
                  Roll-up progress:
                </span>{" "}
                {progress.has
                  ? `${progress.percent}% — ${progress.summary} complete`
                  : "No tasks yet."}
              </p>
              {overview.healthVisible ? (
                <ProjectHealthPanel health={health} />
              ) : null}
            </div>
          ),
          metadata: summaryMetadata,
        }}
        activeTabId={activeTabId}
        onTabChange={onTabChange}
        tabs={[
          { id: "tasks", label: "Tasks", content: tasksTab },
          { id: "knowledge", label: "Knowledge", content: knowledgeTab },
          { id: "linked", label: "Linked", content: linksTab },
          { id: "activity", label: "Activity", content: activityTab },
          // Settings is the FINAL tab, per the shared tab vocabulary
          // (DESIGN_SYSTEM.md → Tabs: Activity and Settings always sit last, in
          // that order).
          { id: "settings", label: "Settings", content: settingsTab },
        ]}
      />
      {lifecycle.dialogs}
    </>
  );
}

/** Whether the serialized overview is currently completed (spine `completedAt`). */
export function overviewCompleted(
  overview: SerializedProjectOverview,
): boolean {
  return isProjectComplete(overview);
}
