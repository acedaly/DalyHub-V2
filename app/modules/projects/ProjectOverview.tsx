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

import { AccentIcon, EntityLink } from "~/shared/entity";
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
import {
  PROJECT_WORKFLOW_STATUSES,
  projectWorkflowStatusLabel,
  type ProjectWorkflowStatus,
} from "~/kernel/project-settings";
import {
  InlineSelectField,
  InlineTextField,
  type InlineSaveOutcome,
} from "~/shared/inline-edit";
import { useRecordLifecycle } from "~/shared/record-lifecycle";

import {
  isProjectArchived,
  isProjectComplete,
  projectStateLabel,
  type ProjectProgress,
  type SerializedProjectOverview,
} from "./project-view";
import { meterStatusFromTone } from "~/shared/progress";

/**
 * The workflow statuses, from the ONE module that owns the vocabulary.
 *
 * Built here rather than restated: `PROJECT_WORKFLOW_STATUSES` is the kernel's
 * order and `projectWorkflowStatusLabel` its wording, so this control and the
 * Settings row can never offer different words for the same three values.
 */
const PROJECT_STATUS_OPTIONS = PROJECT_WORKFLOW_STATUSES.map((status) => ({
  value: status,
  label: projectWorkflowStatusLabel(status),
}));

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
  /**
   * DHDS-10 — set the workflow status from the record's context line
   * (`set_status`). The SAME intent, the same endpoint and the same archived
   * guard the Settings tab's row posts through; a refusal comes back as an
   * outcome so the field can keep the previous value and state the reason.
   *
   * Optional so a host that has no status authority (a preview, a template)
   * simply renders the fact.
   */
  readonly onSetStatus?: (
    status: ProjectWorkflowStatus,
  ) => Promise<InlineSaveOutcome>;
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
  /**
   * PROJECT-02 — capture this Project's shape as a reusable template.
   *
   * In the header OVERFLOW rather than as a visible action: it is a deliberate,
   * infrequent thing an owner does to a Project that has proved itself, not
   * part of running one. Absent for an archived Project, which is read-only.
   */
  readonly onSaveAsTemplate?: () => void;
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
  onSetStatus,
  tasksTab,
  linksTab,
  knowledgeTab,
  activityTab,
  settingsTab,
  onArchive,
  onRestore,
  onSaveAsTemplate,
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
   *
   * ── DHDS-10 — the WORKFLOW STATUS joins them, as a control ──────────────────
   * Changing a Project from Planned to Active was: open the record, find the
   * Settings tab, find the row, choose. Four interactions and a tab change for
   * a three-value enumeration — the friction §16 names for Projects, and the
   * one property an owner changes most often while the Project is open in
   * front of them.
   *
   * It is shown only while the workflow status is the LIVE fact. An archived or
   * completed Project's state is decided by its lifecycle, and the header's
   * state pill already says so with the right precedence; offering "Planned /
   * Active / On hold" there would be a control whose value the record is not
   * actually in.
   *
   * The Area and the Goal stay LINKS here, deliberately, and §35's rule is why:
   * consistency follows context. On a Task row the parent is metadata being
   * scanned; on a record header it is the way UP the hierarchy, and a record
   * that cannot reach its own parent in one press is worse than one whose
   * parent takes an extra step to change. Changing it stays one gesture from
   * the collection table's Area cell and from Settings → Organisation.
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
  if (!archived && !completed && onSetStatus) {
    contextItems.push({
      id: "status",
      label: "Status",
      value: (
        <InlineSelectField
          label="Status"
          value={overview.status}
          options={PROJECT_STATUS_OPTIONS}
          onSave={(next) => onSetStatus(next as ProjectWorkflowStatus)}
          // A record's context line is a RUN of facts being read, so the caret
          // waits to be looked for exactly as it does on a collection row.
          presentation="meta"
          data-testid="project-status-edit"
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

  /*
   * PROJECT-02 — "Save as template", between the create actions and the
   * lifecycle ones, with its own separator so it reads as its own kind of
   * thing. Hidden on an archived Project for the same reason every other
   * mutation is: an archived Project is read-only until restored.
   */
  const templateActions =
    archived || !onSaveAsTemplate
      ? []
      : [
          {
            id: "save-as-template",
            label: "Save as template",
            description:
              "Reuse this project\u2019s tasks and checklists. Dates, progress and history are not copied.",
            separatorBefore: contextualCreateActions.length > 0,
            onSelect: onSaveAsTemplate,
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
        /*
         * UIX-02 — the record's own icon on the record's own ACCENT, at the
         * same geometry the gallery draws. It was a bare monochrome glyph, so
         * the one screen dedicated to a single Project was the one screen where
         * that Project had no identity: an owner arriving from a grid of
         * coloured marks landed on a grey outline of the same shape.
         * `AccentIcon` is the component the gallery card uses, resolving the
         * same stored key and the same stable rank — recognition survives the
         * navigation.
         */
        icon={
          <AccentIcon
            entityType="project"
            iconKey={overview.iconKey}
            colourSlot={overview.colourSlot}
            colourRank={overview.colourRank}
            size="md"
          />
        }
        breadcrumb={[{ id: "projects", label: "Projects", href: "/projects" }]}
        status={{ label: state.label, tone: state.tone }}
        metadata={contextItems}
        primaryAction={primaryAction}
        overflowActions={[
          ...contextualCreateActions,
          ...templateActions,
          ...lifecycle.overflowActions.map((item, index) =>
            index === 0 &&
            contextualCreateActions.length + templateActions.length > 0
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
            // POLISH-01 — the bar states the same health the indicator beside
            // it names, so a Project reading "At risk" cannot draw a calm bar.
            // Health that is not being presented leaves the bar neutral rather
            // than asserting something the surface is deliberately not saying.
            status: overview.healthVisible
              ? meterStatusFromTone(health.tone)
              : "neutral",
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
