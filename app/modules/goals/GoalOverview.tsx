/**
 * AREA-02 — the canonical Goal record, composed through the shared DS-02
 * Record Layout.
 *
 * Presentation only: the header (identity, explicit Open/Completed state, Area
 * breadcrumb, target date, Complete/Reopen), the Summary (definition of done,
 * target date, exact Project-contribution progress — always kept visually
 * distinct from explicit completion), the Projects tab (Projects directly
 * advancing this Goal) and the Activity tab. Data loading and mutations live in
 * the route; this component only renders them.
 *
 * ── EDIT-02: three values, edited where they are shown ───────────────────────
 * A Goal had the product's two remaining "open a panel to change one value"
 * actions: **Rename** (a Drawer form for a single line of text) and **Edit
 * details** (a Drawer form for a date and a paragraph). Both are gone. The
 * title uses the shared heading field, the target date the shared inline date
 * popover, and the definition of done the shared multiline text field — the
 * same three interactions an owner already knows from Areas, Projects and
 * Tasks, each posting its OWN focused intent so changing one can never
 * overwrite another.
 *
 * A COMPLETED Goal is not frozen — completion is an explicit, reversible state,
 * not an archive — so the fields stay editable. Only an archived record renders
 * its values as plain read-only text (Areas, Projects), and a Goal has no
 * archived state.
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
import { TITLE_MAX_LENGTH } from "~/kernel/entities";
import { GOAL_DEFINITION_OF_DONE_MAX_LENGTH } from "~/kernel/goals";
import {
  InlineDateField,
  InlineTextField,
  type InlineSaveOutcome,
} from "~/shared/inline-edit";
import {
  RecordDetails,
  RecordLayout,
  recordTimestampItems,
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
  /** DS-16 — rename from the heading (`rename`). */
  readonly onRename: (title: string) => Promise<InlineSaveOutcome>;
  /** DS-16 — set or clear the target date (`set_target_date`). */
  readonly onSetTargetDate: (
    targetDate: string | null,
  ) => Promise<InlineSaveOutcome>;
  /** DS-16 — set or clear the definition of done (`set_definition_of_done`). */
  readonly onSetDefinitionOfDone: (
    definitionOfDone: string,
  ) => Promise<InlineSaveOutcome>;
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
  onSetTargetDate,
  onSetDefinitionOfDone,
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
  const target = targetDatePresentation(details.targetDate, todayIso);
  const progress = goalContributionProgress(contribution);
  const alignmentHeadingId = useId();

  /*
   * RECORD-01 — the target date is stated ONCE, in the context line, and it is
   * the EDITABLE control rather than a read-only echo of it.
   *
   * It used to appear twice: as read-only text in the header metadata AND as
   * the inline date field in the summary's key/value list. Two renderings of
   * one fact, only one of which could be changed, is the metadata duplication
   * this convergence removes — and a Goal's target date is precisely the kind
   * of current-state fact the context line exists for.
   *
   * DS-16 — the value IS the control. An unset target renders the shell's quiet
   * invitation rather than the sentence "No target date set", because a
   * sentence cannot also be the thing you press to set one. Overdue stays a
   * WORD beside the date, never a colour alone (AGENTS.md §15).
   */
  const contextItems: RecordMetaItem[] = [
    {
      id: "target",
      label: "Target date",
      value: (
        <span className="dh-goal-overview__target">
          <InlineDateField
            label="Target date"
            value={details.targetDate}
            onSave={onSetTargetDate}
            format={(iso) => formatCalendarDate(iso) ?? iso}
            emptyLabel="Add a target date"
            data-testid="goal-target-date-edit"
          />
          {target.state === "overdue" ? (
            <span className="dh-goal-overview__target-note">— overdue</span>
          ) : null}
        </span>
      ),
    },
  ];

  /*
   * RECORD-01 deviation — a Goal has no Settings tab, so its administrative
   * timestamps are demoted to the FOOT of the summary rather than into one.
   *
   * The contract's home for Created/Updated is Settings → Record details, which
   * is where every record that has a Settings tab now puts them. Giving Goals a
   * Settings tab purely to host two dates would add a tab to a module's
   * information architecture, which this PR is explicitly scoped out of. "Later
   * in the record" is the contract's other permitted answer, and this is it.
   *
   * "Explicit completion" is gone rather than demoted: it restated the header's
   * status pill in different words, and a duplicate is removed, not relocated.
   */
  const detailItems = recordTimestampItems(
    overview.createdAt,
    overview.updatedAt,
  );

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
        titleSlot={
          <InlineTextField
            label="Goal name"
            value={overview.title}
            onSave={onRename}
            variant="heading"
            maxLength={TITLE_MAX_LENGTH}
            data-testid="goal-title-edit"
          />
        }
        // RECORD-01 — no `typeLabel`: the breadcrumb already walks Areas → this
        // Goal's Area, so "Goal" was a third line saying what two above it said.
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
        metadata={contextItems}
        primaryAction={completed ? undefined : primaryAction}
        /*
         * EDIT-02 — the header now carries LIFECYCLE only.
         *
         * "Edit details" and "Rename" both existed to open a panel around a
         * field that is right there on the record; with the title, the target
         * date and the definition of done all editable in place, keeping either
         * would be a second route to an interaction the value already offers
         * (§7 — remove the duplicate once the direct manipulation lands).
         * Reopening a completed Goal is a real lifecycle action, so it stays.
         */
        secondaryActions={completed ? [primaryAction] : []}
        overflowActions={lifecycle.overflowActions}
        summary={{
          description: (
            <div className="dh-goal-overview__summary">
              <div className="dh-goal-overview__definition">
                <h2 className="dh-goal-overview__definition-heading">
                  Definition of done
                </h2>
                {/*
                 * The stored value is PLAIN text whose line breaks are
                 * significant — not Markdown — so this is the multiline text
                 * field rather than the writing surface. Offering a formatting
                 * toolbar for syntax the column does not store would be a
                 * control that silently does nothing (EDIT-02 §9).
                 */}
                <InlineTextField
                  label="Definition of done"
                  value={details.definitionOfDone ?? ""}
                  onSave={onSetDefinitionOfDone}
                  emptyLabel={NO_DEFINITION_OF_DONE_TEXT}
                  placeholder="What does “done” look like for this Goal?"
                  multiline
                  rows={5}
                  maxLength={GOAL_DEFINITION_OF_DONE_MAX_LENGTH}
                  className="dh-goal-overview__definition-field"
                  data-testid="goal-definition-edit"
                />
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
              {detailItems.length > 0 ? (
                <RecordDetails
                  items={detailItems}
                  label="Goal record details"
                />
              ) : null}
            </div>
          ),
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
