/**
 * The Goals workspace's DETAIL pane — the selected outcome, in full.
 *
 * The order is the argument:
 *
 *     Overview | Projects | Links | History          ← the tab rail
 *     ────────────────────────────────────────
 *     [tile]  Reach 78 kg                  [Ahead]
 *             Health · Target by 31 Dec 2026        ← identity
 *     ────────────────────────────────────────
 *     Status      Condition     Next step            ← where it stands
 *     Movement this week …
 *     ────────────────────────────────────────
 *     Current | Target | Target date                 ← the measurement workspace
 *     ▓▓▓▓▓▓▓▓░░░░░  64%   [Ahead]  5 kg to go
 *     ╭─ the trend, with the dotted path to the target ─╮
 *     ────────────────────────────────────────
 *     Linked projects  [Weight Loss Journey]  + Link project
 *
 * Identity, then where it stands, then the measurement, then what is advancing
 * it. The record's deeper content follows beneath.
 *
 * ── The tab rail is composed from what the record REALLY has ────────────────
 *
 *   - **Habits** — omitted. There is no Habits tab on a Goal, and a rail is
 *     built from reality rather than from a picture.
 *   - **Tasks** — omitted as a TAB, because a Goal owns no tasks. The spine's
 *     rule is that a Task belongs to a Project or floats in an Area
 *     (AGENTS.md §4); what a Goal has is CONTRIBUTING tasks, which is the
 *     alignment evidence already shown on the record with each task opening in
 *     the shared Task drawer. A tab called "Tasks" over a list a Goal does not
 *     own would be the product asserting a relationship its model does not
 *     have.
 *   - **Links** — present. Goals do link to Notes: EntityLinks is the one
 *     relationship model, `LinkedItemsTab` is how every record surfaces it, and
 *     a Goal's linked records are not only Notes.
 *   - **Projects** — present. It is the Goal's own structural children
 *     (`project.advances_goal`), the thing the Overview summarises as chips.
 *   - **History** — the one audit stream, under the name the rest of the
 *     product already uses for it.
 *
 * ── It is a recomposition, not a recomputation ─────────────────────────────
 * Every figure on this pane comes from the kernel evaluator's output, loaded
 * once by `loadGoalWorkspaceDetail` — the same reads, the same evaluator and the
 * same serialisation the canonical `/goals/:goalId` record uses. This component
 * arranges; it does not calculate.
 *
 * ── UNTITLED-07 — the bands, and what they replaced ────────────────────────
 *
 * The pane was a column of loose regions separated by gaps: a header, then a
 * two-column grid of `label` / `strong` pairs ("Current status / Ahead",
 * "Condition / Pursuing") with a sentence and an orphaned button wedged between
 * them, then a measurement panel drawing its OWN card inside this card. Six
 * facts about one Goal, each drawn in a slightly different way, was the "reads
 * like a CRUD record" the Goals brief names.
 *
 * It is now Untitled's in-card band grammar — the `border-t border-secondary`
 * rule `application/table`'s own `TableCard.Header` declares — so the pane is a
 * sequence of bounded statements inside ONE card:
 *
 *   1. identity, with the derived state opposite it;
 *   2. the standing band: status, the owner's condition, the next step and the
 *      movement sentence, on ONE grid instead of four compositions;
 *   3. the measurement workspace, with `surface="plain"` because this pane is
 *      already a card;
 *   4. the Projects advancing it.
 *
 * The status is the genuine `base/badges` source (through `UntitledStatusBadge`),
 * which is the same badge the row beside it and the canonical record already
 * draw, so the three cannot describe the same Goal in three chips.
 */

import type { ReactNode } from "react";
import { Link } from "react-router";

import { AccentIcon } from "~/shared/entity";
import {
  identityAttribute,
  resolveIdentity,
  type IdentitySource,
} from "~/shared/entity/identity-resolution";
import {
  AlignmentIndicator,
  GoalMovementLine,
  type GoalAlignment,
  type GoalMovement,
} from "~/shared/alignment";
import {
  goalProgressStatusLabel,
  goalProgressStatusTone,
} from "~/shared/goal-progress";
import type { GoalCondition } from "~/kernel/goals";
import { InlineDateField, type InlineSaveOutcome } from "~/shared/inline-edit";
import { UntitledStatusBadge } from "~/shared/pill";
import { formatCalendarDate } from "~/shared/task-record/task-view";

import { DrawerTrigger } from "~/shared/drawer";
import { NextActionLine } from "~/shared/task-record/NextActionLine";
import { NEW_PROJECT_FOR_GOAL_KEY } from "~/shared/project-creation";

import { GoalConditionField } from "./GoalConditionField";
import { GoalMeasurementSection } from "./GoalMeasurementSection";
import { GoalProjectChips } from "./GoalProjectChips";
import type { GoalWorkspaceDetail } from "./goal-workspace-load";
import { buttonClassName } from "~/shared/ui";

/** A band inside the pane's card — Untitled's own in-card section rule. */
const BAND = "border-t border-secondary px-4 py-4 md:px-5";

export function GoalWorkspacePane({
  detail,
  todayIso,
  alignment,
  movement = null,
  identity,
  tabs,
  onSetTargetDate,
  onSetCondition,
}: {
  readonly detail: NonNullable<GoalWorkspaceDetail>;
  readonly todayIso: string;
  readonly alignment: GoalAlignment;
  /**
   * FOLLOW-02 — whether this Goal moved inside the named window.
   *
   * The SAME value the row beside it carries, looked up rather than re-derived,
   * and rendered through the SAME component Today and the canonical record use.
   */
  readonly movement?: GoalMovement | null;
  /**
   * STEER-01 (DEBT-208) — the Goal's RESOLVED identity source, from the one
   * shared projection (`goalIdentitySource`), so the pane's mark is literally
   * the row's mark rather than a second resolution that happens to agree.
   *
   * The pane used to resolve only the AREA's identity, so a Goal that had
   * chosen its own glyph showed one mark in the list and a different one in the
   * pane describing the same record, side by side.
   */
  readonly identity: IdentitySource;
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
  /**
   * STEER-02 — set or clear the owner's condition (`set_condition`), the SAME
   * focused intent the canonical record posts, through the SAME shared control.
   * Omit and the condition is not offered here (the Deleted scope, a failed
   * detail read); the derived facts are unaffected either way.
   */
  readonly onSetCondition?: (
    condition: GoalCondition | null,
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
   * The context line — "Health · Target by 31 Dec 2026".
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

  /*
   * UNTITLED-07 — the pane carries the Goal's resolved IDENTITY, as the record
   * does.
   *
   * `charts.css` keys the trend line's stroke on a `[data-identity]` ancestor,
   * and this pane had none — so the SAME Goal drew a green line on
   * `/goals/:id` (inside the record's identity wrapper) and the brand purple on
   * `/goals`, two clicks apart. It is the same resolver and the same source the
   * pane's own mark already uses, so nothing new is computed; the attribute
   * simply reaches the chart now.
   */
  const paneIdentity = resolveIdentity(identity);

  return (
    <article
      className="dh-goalpane flex min-w-0 flex-col"
      data-testid="goal-workspace-pane"
      {...identityAttribute(paneIdentity.slot)}
    >
      {/*
       * §7 — on a phone the pane IS the screen, so it carries the way back to
       * the list. At desktop widths both panes are on screen at once and the
       * control is hidden, because it would point at something already visible.
       */}
      <Link
        className="dh-goalpane__back items-center gap-1 self-start px-4 pt-3 text-sm font-medium text-brand-secondary hover:text-brand-secondary_hover md:px-5"
        to="/goals"
        data-testid="goal-back"
      >
        ← All Goals
      </Link>
      {tabs ? (
        <div className="dh-goalpane__tabs px-4 pt-3 md:px-5">{tabs}</div>
      ) : null}

      {/*
       * The identity row WRAPS, and the derived state is what moves.
       *
       * At 320 the alignment badge ("No contribution path") is nearly the whole
       * viewport, and holding it on the title's line left the name about forty
       * pixels — which broke "Reach 78 kg" into four lines of two characters.
       * The badge takes the full width below the name instead; the mark and the
       * title keep the row, which is the order that matters.
       */}
      <header className="dh-goalpane__identity flex min-w-0 flex-wrap items-start gap-x-3 gap-y-2 px-4 py-4 md:flex-nowrap md:px-5">
        <span className="dh-goalpane__mark shrink-0" aria-hidden="true">
          <AccentIcon entityType="goal" {...identity} />
        </span>
        <div className="dh-goalpane__titles min-w-0 flex-1 basis-0">
          <h2 className="dh-goalpane__title m-0 text-lg font-semibold [overflow-wrap:anywhere] text-primary">
            {/*
             * The canonical record is one click away and is where a Goal is
             * renamed, completed and deleted. The workspace is a place to READ
             * and to record a measurement; it deliberately does not duplicate
             * the record's destructive controls.
             */}
            <Link
              className="dh-goalpane__open rounded-sm text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              to={`/goals/${encodeURIComponent(overview.id)}`}
            >
              {overview.title}
            </Link>
          </h2>
          {/*
           * A DIV, not a paragraph.
           *
           * The context line contains an inline FIELD, and every field in
           * `~/shared/inline-edit` roots itself in a `div`. A `div` inside a
           * `<p>` is not merely invalid: the HTML parser CLOSES the paragraph
           * when it meets one, so the server's markup and the client's tree
           * disagree and React discards the whole subtree with a hydration
           * error. It is still one line of context — the heading above it is
           * what makes it a caption, not the element name.
           */}
          <div
            className="dh-goalpane__context mt-1 flex min-w-0 flex-wrap items-center gap-2 text-sm text-tertiary"
            data-dh-action-context="true"
          >
            {context !== null ? <span>{context}</span> : null}
            {onSetTargetDate ? (
              <span className="dh-goalpane__target inline-flex min-w-0 items-center gap-1">
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
          </div>
        </div>
        {/*
         * §6.2 — alignment survives as a QUIET state on the pane, not as a
         * loud badge. It is the one thing the Goals collection knew that the
         * reference's composition has no column for, and losing it would lose
         * ADR-040's whole point.
         */}
        <span className="order-last w-full md:order-none md:w-auto md:shrink-0">
          <AlignmentIndicator alignment={alignment} />
        </span>
      </header>

      {/*
       * WHERE IT STANDS — one band, one grid.
       *
       * Three short answers side by side (the derived status, the owner's
       * condition, the next concrete stage), then the two SENTENCES beneath
       * them at the band's full width. The split is by SHAPE, not by
       * importance: a one-word answer and a sentence read badly in the same
       * column, which is what the old two-column grid of loose pairs was doing.
       */}
      <section
        className={`dh-goalpane__focus flex min-w-0 flex-col gap-3 ${BAND}`}
        aria-label="Goal focus"
      >
        <dl className="m-0 grid min-w-0 grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <div className="dh-goalpane__focus-state flex min-w-0 flex-col items-start gap-1.5">
            <dt className="text-sm text-tertiary">Current status</dt>
            <dd className="m-0">
              {/*
               * The derived status, in the SAME badge the row beside it and the
               * canonical record draw. It was a bold word here and a chip
               * there, describing one Goal in two registers.
               */}
              <UntitledStatusBadge
                tone={goalProgressStatusTone(progress.status)}
              >
                {goalProgressStatusLabel(progress.status)}
              </UntitledStatusBadge>
            </dd>
          </div>
          {onSetCondition ? (
            /*
             * STEER-02 — the OWNER's condition, beside the machine's three
             * answers and never over them.
             *
             * Its placement is the argument: it sits in the same band as the
             * derived status and the movement line because it answers a
             * different question from either ("am I pursuing this?" rather than
             * "how is it going?" or "did it move?"). Nothing above it changes
             * when it changes — asserted, by rendering the same Goal under each
             * value and comparing the derived strings.
             */
            <div className="dh-goalpane__focus-condition flex min-w-0 flex-col items-start gap-1.5">
              <dt className="text-sm text-tertiary">Condition</dt>
              <dd className="m-0 min-w-0 text-sm font-medium text-primary">
                <GoalConditionField
                  condition={detail.details.condition}
                  onSave={onSetCondition}
                  data-testid="goal-pane-condition"
                />
              </dd>
            </div>
          ) : null}
          {nextStage ? (
            <div className="dh-goalpane__focus-next flex min-w-0 flex-col items-start gap-1.5">
              <dt className="text-sm text-tertiary">Next stage</dt>
              <dd className="m-0 min-w-0 [overflow-wrap:anywhere] text-sm font-medium text-primary">
                {nextStage.title}
              </dd>
            </div>
          ) : null}
        </dl>
        {/*
         * FOLLOW-02 — movement sits BESIDE the measurement status, never over
         * it. "Is it on track?" and "did it move?" are different questions with
         * different windows, and the pane states both rather than reconciling
         * them into one word: a Goal can be on track and unmoved this week, and
         * the surface must not imply that is impossible.
         */}
        {movement ? (
          <GoalMovementLine
            movement={movement}
            size="record"
            label="Movement"
            formatDay={(iso) => formatCalendarDate(iso) ?? iso}
            className="dh-goalpane__movement min-w-0"
          />
        ) : null}
        {/*
         * STEER-04 (DEBT-210) — the Goal's next STEP, from the product's one
         * next-action rule, on the same band as its derived answers.
         *
         * The pane states the absence in REVIEW-02's words rather than hiding
         * it, exactly as the canonical record does: this is a detail surface an
         * owner selected a Goal to read, not a dense list where a row of
         * absences would cost more than it says.
         */}
        <div
          className="dh-goalpane__next flex min-w-0 flex-wrap items-center gap-2"
          data-testid="goal-pane-next-step"
        >
          <NextActionLine
            task={detail.nextAction}
            absence="state"
            label="Next step"
          />
          {detail.contribution.total === 0 ? (
            <DrawerTrigger
              drawerKey={NEW_PROJECT_FOR_GOAL_KEY}
              className={buttonClassName({ variant: "secondary", size: "sm" })}
              data-testid="goal-pane-new-project"
            >
              New Project for this Goal
            </DrawerTrigger>
          ) : null}
        </div>
      </section>

      {/*
       * The trio, the chart with its dotted path to the target, the pace band
       * and the reading history — the measurement workspace, shared verbatim
       * with the canonical record so the two can never drift.
       *
       * `surface="plain"`: this pane is already inside the workspace's card, and
       * the workspace's own bounded card here would be a frame inside a frame.
       */}
      <GoalMeasurementSection
        goalId={overview.id}
        goalTitle={overview.title}
        details={details}
        progress={progress}
        measurements={detail.measurements}
        milestones={detail.milestones}
        todayIso={todayIso}
        surface="plain"
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
