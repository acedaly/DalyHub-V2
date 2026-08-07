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

import { EntityLink, RecordIcon } from "~/shared/entity";
import { useCapture } from "~/shared/capture";
import type { CaptureContextContract } from "~/shared/capture/capture-context";
import {
  HealthIndicator,
  healthSignals,
  type ProjectHealth,
} from "~/shared/project-health";
import {
  RecordLayout,
  type RecordAction,
  type RecordMetaItem,
} from "~/shared/record-layout";
import { TITLE_MAX_LENGTH } from "~/kernel/entities";
import { InlineTextField, type InlineSaveOutcome } from "~/shared/inline-edit";
import { useRecordLifecycle } from "~/shared/record-lifecycle";

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
  /**
   * DS-16 — rename from the record heading. Same trusted `rename` intent, same
   * archived guard, same validation; a refusal comes back as an outcome so the
   * typed name stays in the field (see `~/shared/inline-edit`).
   */
  readonly onRename: (title: string) => Promise<InlineSaveOutcome>;
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

  /*
   * RECORD-01 — the context line: the two facts that place this Project in the
   * spine, and nothing else.
   *
   * Health used to sit here AND again inside the roll-up card; it now appears
   * once, as the summary band's state chip, beside the progress it explains.
   * Created, Updated and the raw State moved to the Settings tab's Record
   * details — demoted, never deleted.
   */
  const contextItems: RecordMetaItem[] = [];
  if (overview.area) {
    contextItems.push({
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
    contextItems.push({
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

  /*
   * PROJ-05 §5 — an archived project is read-only, and the summary band says so
   * in one line where the summary card used to spend a bordered banner on it.
   */
  const archivedNote = archived
    ? "This project is archived and read-only. Open Settings to restore it."
    : undefined;

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
      : /*
         * RECORD-01 — completing a project is a LIFECYCLE action, not the next
         * thing the owner came here to do.
         *
         * It rendered as the filled primary button at the top right of every
         * project, where M3 puts the surface's most likely next step — so the
         * loudest control on a record whose purpose is a task list was the one
         * that ends the project. It is now the header's low-emphasis secondary
         * action (still one press, still in the same place); the tasks below it
         * carry the record's real work.
         */
        {
          id: "complete",
          label: "Complete project",
          variant: "secondary",
          disabled: completionPending,
          onSelect: () => onToggleComplete(true),
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
  /*
   * RECORD-01 — the overflow creates the things this record has no local path
   * for.
   *
   * "New task" was here too, opening the global capture sheet pre-seeded with
   * this project — a second mechanism for what the Tasks tab's own "Add task"
   * already does with the project fixed and no picker to answer. Two routes to
   * one outcome is precisely the local-vs-global confusion this PR resolves, so
   * the local one (faster, and the record it belongs to is not in question)
   * stays and this one goes. Notes, Meetings and Diary entries have no local
   * path on this record, so theirs remain — this is where the project context
   * is worth carrying into the global sheet.
   */
  const contextualCreateActions = archived
    ? []
    : [
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
        titleSlot={
          <InlineTextField
            label="Project name"
            value={overview.title}
            onSave={onRename}
            readOnly={archived}
            variant="heading"
            maxLength={TITLE_MAX_LENGTH}
            data-testid="project-title-edit"
          />
        }
        // RECORD-01 — no `typeLabel`. The breadcrumb directly above the title
        // already says "Projects"; a "Project" eyebrow under it was a line of
        // header height spent repeating the line above.
        //
        // The record's OWN icon — the chosen glyph, falling back to the
        // project default when there is none or the stored key is unresolvable.
        icon={<RecordIcon entityType="project" iconKey={overview.iconKey} />}
        breadcrumb={[{ id: "projects", label: "Projects", href: "/projects" }]}
        status={{ label: state.label, tone: state.tone }}
        metadata={contextItems}
        primaryAction={primaryAction}
        overflowActions={[
          ...contextualCreateActions,
          ...lifecycle.overflowActions.map((item, index) =>
            index === 0 && contextualCreateActions.length > 0
              ? { ...item, separatorBefore: true }
              : item,
          ),
        ]}
        /*
         * RECORD-01 — the roll-up card becomes the compact summary band.
         *
         * Same three facts the card carried, said once each: the derived
         * progress (THEME-01's shared meter — an empty project has nothing to
         * measure, so it says so rather than drawing a 0% bar), the health
         * state beside it, and health's reasons as the signal line. The card's
         * key/value grid is gone because every row but one repeated a reason
         * above it; that one row (last activity) is in Settings → Record
         * details, together with Created, Updated and State.
         */
        summaryBar={{
          note: archivedNote,
          progress: {
            label: "Tasks",
            percent: progress.percent,
            summary: progress.has
              ? `${progress.summary} complete`
              : "No tasks yet.",
            available: progress.has,
          },
          // Shown ONLY for genuinely active work (PROJ-05 §8 / ADR-037) — see
          // `isHealthVisible` in `project-view.ts`, the SAME rule the collection
          // Card and Today use.
          state: overview.healthVisible ? (
            <HealthIndicator health={health} />
          ) : undefined,
          signals: overview.healthVisible ? healthSignals(health) : undefined,
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
