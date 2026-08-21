/**
 * REDESIGN-04 §2.2 — the Goals workspace's DETAIL pane.
 *
 * `mockup3.png` composes the right-hand pane in one deliberate order, and the
 * order is the argument:
 *
 *     Overview | Tasks | Notes | History          ← the tab rail
 *     ────────────────────────────────────────
 *     [tile]  Reach 70 kg
 *             Health · Target by 31 Dec 2025      ← identity
 *     Current      Target      Target date        ← the stat trio
 *     60.0 kg      70 kg       31 Dec 2025
 *     ╭─ the measurement chart, with the dotted path to the target ─╮
 *     Linked projects  [Weight Loss Journey] [Health & Fitness]  + Link project
 *
 * Identity, then the comparison, then the history, then what is advancing it.
 * The record's deeper content follows beneath.
 *
 * ── The tab rail is composed from what the record REALLY has (§5.2) ─────────
 * The reference draws `Overview / Tasks / Habits / Notes / History`. Three of
 * those five do not describe this product, and the brief is explicit that the
 * rail is built from reality rather than from the picture:
 *
 *   - **Habits** — omitted. There is no Habits module, and §5.2 forbids
 *     building one to fill a tab.
 *   - **Tasks** — omitted as a TAB, because a Goal owns no tasks. The spine's
 *     rule is that a Task belongs to a Project or floats in an Area
 *     (AGENTS.md §4); what a Goal has is CONTRIBUTING tasks, which is the
 *     alignment evidence already shown on the Overview with each task opening
 *     in the shared Task drawer. A tab called "Tasks" over a list a Goal does
 *     not own would be the product asserting a relationship its model does not
 *     have.
 *   - **Notes** — present, as **Links**. Goals do link to Notes: EntityLinks is
 *     the one relationship model, `LinkedItemsTab` is how every record surfaces
 *     it, and a Goal's linked records are not only Notes. Naming the tab after
 *     one of the types it can hold would be narrower than the truth.
 *   - **Projects** — present, and not in the reference at all. It is the Goal's
 *     own structural children (`project.advances_goal`), the thing the Overview
 *     summarises as chips, and the reference simply had no room for it.
 *   - **History** — present, as **Activity**: the one audit stream, under the
 *     name the rest of the product already uses for it.
 *
 * Recorded, with the evidence, in `REDESIGN_04_SPINE_WORKSPACES_2026_08.md` §5.
 *
 * ── It is a recomposition, not a recomputation ─────────────────────────────
 * Every figure on this pane comes from the kernel evaluator's output, loaded
 * once by `loadGoalWorkspaceDetail` — the same reads, the same evaluator and the
 * same serialisation the canonical `/goals/:goalId` record uses. This component
 * arranges; it does not calculate.
 */

import type { ReactNode } from "react";
import { Link } from "react-router";

import { AccentIcon } from "~/shared/entity";
import { AlignmentIndicator, type GoalAlignment } from "~/shared/alignment";
import { goalProgressStatusLabel } from "~/shared/goal-progress";
import { InlineDateField, type InlineSaveOutcome } from "~/shared/inline-edit";
import { formatCalendarDate } from "~/shared/task-record/task-view";

import { GoalMeasurementSection } from "./GoalMeasurementSection";
import { GoalProjectChips } from "./GoalProjectChips";
import type { GoalWorkspaceDetail } from "./goal-workspace-load";

export function GoalWorkspacePane({
  detail,
  todayIso,
  alignment,
  areaColourRank,
  areaIconKey,
  tabs,
  onSetTargetDate,
}: {
  readonly detail: NonNullable<GoalWorkspaceDetail>;
  readonly todayIso: string;
  readonly alignment: GoalAlignment;
  /** The Area's identity, so the pane's mark matches the row that opened it. */
  readonly areaColourRank: number | null;
  readonly areaIconKey: string | null;
  /** The tab rail, composed by the caller from what this record really has. */
  readonly tabs?: ReactNode;
  /**
   * DHDS-10 — set or clear the target date (`set_target_date`), the SAME
   * focused intent the canonical record posts. Omit and the date renders as the
   * plain sentence it was.
   */
  readonly onSetTargetDate?: (
    targetDate: string | null,
  ) => Promise<InlineSaveOutcome>;
}) {
  const { overview, details, progress } = detail;
  const targetDate = details.targetDate
    ? (formatCalendarDate(details.targetDate) ?? details.targetDate)
    : null;
  const nextStage = [...detail.milestones]
    .sort((left, right) => left.position - right.position)
    .find((milestone) => !milestone.completed);

  /*
   * The context line — "Health · Target by 31 Dec 2025".
   *
   * The Area first, because it is the coordinate an owner navigates by, then
   * the target date where one exists. A Goal with no target date says only its
   * Area; it does not print "No target date", which would make an ordinary
   * absence look like a problem.
   *
   * ── DHDS-10 — the target date is the SAME control the record carries ────────
   * It was a printed string here, so "move this to the end of March" — a
   * one-value decision an owner makes while reading the Goal's chart — meant
   * leaving the workspace for the canonical record and coming back. It is now
   * the shared `InlineDateField` posting the SAME focused `set_target_date`
   * intent to the SAME endpoint, so the two surfaces cannot drift.
   *
   * It does NOT make the pane an editor. The Goal's title, its completion and
   * its removal stay on the record — the pane's own note above says why — and
   * "Current status" stays derived: it is computed from the measurements, and
   * DHDS-10 §15 is explicit that calculated progress is never directly editable.
   */
  const context = overview.area?.title ?? null;

  return (
    <article className="dh-goalpane" data-testid="goal-workspace-pane">
      {/*
       * §7 — on a phone the pane IS the screen, so it carries the way back to
       * the list. At desktop widths both panes are on screen at once and the
       * control is hidden, because it would point at something already visible.
       */}
      <Link className="dh-goalpane__back" to="/goals" data-testid="goal-back">
        ← All Goals
      </Link>
      {tabs ? <div className="dh-goalpane__tabs">{tabs}</div> : null}

      <header className="dh-goalpane__identity">
        <span className="dh-goalpane__mark" aria-hidden="true">
          <AccentIcon
            entityType="goal"
            iconKey={areaIconKey}
            colourRank={areaColourRank}
          />
        </span>
        <div className="dh-goalpane__titles">
          <h2 className="dh-goalpane__title">
            {/*
             * The canonical record is one click away and is where a Goal is
             * renamed, completed and deleted. The workspace is a place to READ
             * and to record a measurement; it deliberately does not duplicate
             * the record's destructive controls.
             */}
            <Link
              className="dh-goalpane__open"
              to={`/goals/${encodeURIComponent(overview.id)}`}
            >
              {overview.title}
            </Link>
          </h2>
          <p className="dh-goalpane__context" data-dh-action-context="true">
            {context !== null ? <span>{context}</span> : null}
            {onSetTargetDate ? (
              <span className="dh-goalpane__target">
                {/*
                 * The words "Target by" belong to a DATE, so they appear only
                 * when there is one. An empty field under a permanent label
                 * read "DalyHub V2 · Target by" with nothing after it — the
                 * label saying more than the value, which is exactly the
                 * dangling placeholder §25 rules out.
                 *
                 * The empty state is also the one place on this line that does
                 * NOT hold its invitation back. A detail pane carries one or two
                 * facts, not fifty rows of them, so "Add a target date" is a
                 * useful thing to see rather than a column of absences — the
                 * judgement §25 asks for, made per surface.
                 */}
                {details.targetDate !== null ? (
                  <span className="dh-goalpane__target-label">Target by</span>
                ) : null}
                <InlineDateField
                  label="Target date"
                  value={details.targetDate}
                  onSave={onSetTargetDate}
                  format={(iso) => formatCalendarDate(iso) ?? iso}
                  emptyLabel="Add a target date"
                  todayIso={todayIso}
                  presentation={
                    details.targetDate === null ? "default" : "meta"
                  }
                  data-testid="goal-pane-target-date"
                />
              </span>
            ) : targetDate ? (
              <span>Target by {targetDate}</span>
            ) : null}
          </p>
        </div>
        {/*
         * §6.2 — alignment survives as a QUIET state on the pane, not as a
         * loud badge. It is the one thing the Goals collection knew that the
         * reference's composition has no column for, and losing it would lose
         * ADR-040's whole point.
         */}
        <AlignmentIndicator alignment={alignment} />
      </header>

      <section className="dh-goalpane__focus" aria-label="Goal focus">
        <p className="dh-goalpane__focus-state">
          <span>Current status</span>
          <strong>{goalProgressStatusLabel(progress.status)}</strong>
        </p>
        {nextStage ? (
          <p className="dh-goalpane__focus-next">
            <span>Next stage</span>
            <strong>{nextStage.title}</strong>
          </p>
        ) : null}
      </section>

      {/*
       * The trio, the chart with its dotted path to the target, the pace band
       * and the reading history — the measurement workspace, shared verbatim
       * with the canonical record so the two can never drift.
       */}
      <GoalMeasurementSection
        goalId={overview.id}
        goalTitle={overview.title}
        details={details}
        progress={progress}
        measurements={detail.measurements}
        milestones={detail.milestones}
        todayIso={todayIso}
      />

      <GoalProjectChips
        goalId={overview.id}
        goalTitle={overview.title}
        projects={detail.projects}
        total={detail.contribution.total}
      />
    </article>
  );
}
