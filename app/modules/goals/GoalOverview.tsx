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

import { useId, useState } from "react";
import type { ReactNode } from "react";

import {
  AlignmentIndicator,
  GoalAlignmentPanel,
  alignmentReasonText,
  type GoalAlignment,
  type SerializedGoalAlignmentEvidence,
} from "~/shared/alignment";
import {
  EntityIcon,
  EntityIdentityPicker,
  identityAttribute,
  resolveIdentity,
} from "~/shared/entity";
import { TITLE_MAX_LENGTH } from "~/kernel/entities";
import type { EntityIconKey } from "~/kernel/entities/entity-icon-keys";
import {
  identityForRank,
  isIdentityColourSlot,
  type IdentityColourSlot,
} from "~/kernel/entities/identity-colour-slots";
import { GOAL_DEFINITION_OF_DONE_MAX_LENGTH } from "~/kernel/goals";
import {
  InlineDateField,
  InlineTextField,
  type InlineSaveOutcome,
} from "~/shared/inline-edit";
import {
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
  type SerializedGoalArea,
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
  /** AUDIT-14 — the owner timezone `todayIso` was resolved in, so the alignment
   * evidence labels read the same calendar the alignment state did. */
  readonly timeZone: string;
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
  /**
   * IDENTITY-01 — choose or clear the Goal's OWN icon and colour. Reject to
   * fail; the previous identity stays, because the loader value is the truth
   * and it has not changed.
   */
  readonly onSetIdentity?: (identity: {
    readonly iconKey: EntityIconKey | null;
    readonly colourSlot: IdentityColourSlot | null;
  }) => Promise<void>;
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
  /**
   * GOAL-02 / UIX-03 — the measurable-progress workspace, rendered as the
   * record's own top-level region above the summary's prose.
   *
   * A slot rather than a set of measurement props: this component composes the
   * record and must not learn what a baseline is, and the route already owns the
   * fetches and the sheets the section needs. It leads the record because "am I
   * getting there?" is the question a measurable Goal exists to answer — the
   * definition of done and the Project contribution explain HOW, and follow it.
   */
  readonly progressSlot?: ReactNode;
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
  timeZone,
  alignment,
  alignmentEvidence,
  alignmentEvidenceHasMore,
  completionPending,
  onToggleComplete,
  onRename,
  onSetTargetDate,
  onSetIdentity,
  onSetDefinitionOfDone,
  onDelete,
  deletePending = false,
  onOpenProject,
  onOpenTask,
  activityTab,
  linkedTab,
  progressSlot,
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
    : /*
       * RECORD-01 — completing a Goal is a LIFECYCLE action, not the next thing
       * the owner came here to do, so it takes the low-emphasis treatment the
       * Project's "Complete project" now takes. The record's actual work is the
       * definition of done and the Projects advancing it; the filled primary
       * button at the top right was the control that ENDS the Goal.
       */
      {
        id: "complete",
        label: "Complete",
        variant: "secondary",
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

  /*
   * IDENTITY-01 — the record's resolved identity, stamped ONCE on the whole
   * screen.
   *
   * The progress meter and the trend chart already read `--dh-identity`; without
   * this nothing on the Goal RECORD set it, so both fell back to the
   * application's action colour while the Goal's own card, row and Today tile
   * wore its hue. One record must not be two colours depending on which screen
   * you opened it from.
   *
   * A Goal's own choice first, its Area's otherwise — the same ladder every
   * other surface walks, through the same resolver.
   */
  const identity = resolveIdentity({
    colourSlot: details.colourSlot,
    iconKey: details.iconKey,
    colourRank: null,
    inherited: {
      colourSlot: overview.area.colourSlot,
      colourRank: overview.area.colourRank,
      iconKey: overview.area.iconKey,
    },
  });

  return (
    <div {...identityAttribute(identity.slot)}>
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
        /*
         * UIX-03 — the progress workspace is a TOP-LEVEL region, not the
         * summary's description.
         *
         * It used to be passed as `summaryBar.description`, which put the
         * current value, the pace facts, the trend chart and the measurement
         * history inside a summary card inside the record — three containers of
         * descending purpose around the one thing the page exists to show. The
         * shared layout's `feature` slot exists for exactly this shape, and the
         * band goes back to what RECORD-01 designed it for: derived state in a
         * sentence.
         */
        feature={progressSlot}
        featureLabel="Progress"
        summaryBar={{
          /*
           * RECORD-01 — ONE summary region carrying the Goal's prose AND its
           * derived state.
           *
           * The definition of done is genuine prose, so the band takes the card
           * surface (the DS-02 "a container is earned" rule). The contribution
           * meter and the alignment state sit on one row, and alignment's
           * reasons are the band's signal line.
           *
           * UIX-03 moved the measurable-progress section OUT of here (see
           * `feature` above). What is left is the band's proper subject: how the
           * WORK under this Goal is going, which is a different question from
           * whether the outcome is being reached — and keeping the two apart is
           * the distinction §27 of the brief calls critical.
           */
          progress: {
            label: "Project contribution",
            percent: progress.percent,
            summary: progress.summary,
            available: progress.has,
          },
          state: <AlignmentIndicator alignment={alignment} />,
          signals: alignment.reasons.map((reason) => ({
            id: reason.code,
            text: alignmentReasonText(reason),
            tone: reason.tone,
          })),
          // The administrative timestamps, as the band's quiet trailing line.
          facts: detailItems,
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
              {/*
                IDENTITY-01 — the Goal's OWN identity.
                
                A Goal has no Settings tab (see the note above the timestamps for
                why one was not added), so its one appearance control lives here,
                beside the other Goal-owned field the record edits in place. The
                Automatic option names the Area's resolved colour, so an owner
                can see what inheriting currently means before choosing not to.
              */}
              {onSetIdentity ? (
                <div className="dh-goal-overview__appearance">
                  <GoalIdentityField
                    details={details}
                    area={overview.area}
                    onSetIdentity={onSetIdentity}
                  />
                </div>
              ) : null}
              {/*
                RECORD-01 — the contribution EVIDENCE, and only when there is
                any. The alignment state and its reasons are the summary band's
                chip and signal line; this is the part they cannot carry — the
                actual recent Tasks, which are links the owner follows. A
                heading over an empty panel is chrome describing nothing.
              */}
              {alignmentEvidence.length > 0 ? (
                <div className="dh-goal-overview__alignment">
                  <h2
                    id={alignmentHeadingId}
                    className="dh-goal-overview__alignment-heading"
                  >
                    Recent contribution
                  </h2>
                  <GoalAlignmentPanel
                    alignment={alignment}
                    evidence={alignmentEvidence}
                    evidenceHasMore={alignmentEvidenceHasMore}
                    todayIso={todayIso}
                    timeZone={timeZone}
                    headingId={alignmentHeadingId}
                    onOpenTask={onOpenTask}
                  />
                </div>
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
    </div>
  );
}

/**
 * The Goal's OWN identity, as one field.
 *
 * A Goal inherits its Area's icon and colour and may now override either. The
 * two halves are independent: a Goal that picks a heart but no colour keeps the
 * heart and takes its Area's hue, which is the combination the reference draws.
 *
 * `derivedSlot` is the AREA's RESOLVED colour — its own choice where it made
 * one, otherwise the colour its rank derives — so the picker's Automatic option
 * can name what inheriting currently means rather than asking the owner to
 * trust it. Resolving it here rather than in the picker keeps the picker
 * ignorant of what a Goal inherits FROM.
 *
 * A failure is reported inline and the previous identity stays, because the
 * loader value is the truth and it has not changed.
 */
function GoalIdentityField({
  details,
  area,
  onSetIdentity,
}: {
  readonly details: SerializedGoalDetails;
  readonly area: SerializedGoalArea;
  readonly onSetIdentity: (identity: {
    readonly iconKey: EntityIconKey | null;
    readonly colourSlot: IdentityColourSlot | null;
  }) => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const derivedSlot = isIdentityColourSlot(area.colourSlot)
    ? area.colourSlot
    : area.colourRank === null
      ? null
      : identityForRank(area.colourRank);

  return (
    <EntityIdentityPicker
      entityType="goal"
      label="Appearance"
      value={{ iconKey: details.iconKey, colourSlot: details.colourSlot }}
      derivedSlot={derivedSlot}
      error={error}
      help={`Optional. A Goal that chooses neither uses ${area.title}’s icon and colour.`}
      onChange={(next) => {
        setError(null);
        void onSetIdentity(next).catch((cause: unknown) => {
          setError(
            cause instanceof Error
              ? cause.message
              : "That couldn’t be saved. Please try again.",
          );
        });
      }}
    />
  );
}
