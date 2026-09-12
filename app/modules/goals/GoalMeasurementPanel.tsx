/**
 * The Goal record's progress section — the part of a Goal that answers *am I
 * actually getting there?*
 *
 * It is the page's centre of gravity, and it is built from four honest pieces in
 * a fixed order:
 *
 *   1. the OUTCOME BAND — the comparison (Current / Target / Target date), the
 *      bar, the state in words, and the two acts (record a reading, change how
 *      it is measured);
 *   2. the PACE — recent, required, and where the recent one lands — but only
 *      the parts the data supports;
 *   3. the TREND, as a line, with the target as a quiet reference;
 *   4. the HISTORY, editable, because a mistyped weigh-in is a normal event.
 *
 * Every one of them disappears rather than degrade: a Goal with one reading has
 * no chart and says why, a Goal with no target date has no required pace, and a
 * Goal with no measurement configuration shows an invitation to add one instead
 * of a 0% bar for a denominator it has not got.
 *
 * Presentation only. Every figure comes from the kernel evaluator through the
 * route; this component computes nothing, and every mutation is a callback the
 * route posts to its own trusted endpoint.
 *
 * ── UNTITLED-07 — what this pass changed, and the argument for it ───────────
 *
 * What was here before was structurally right and visually a data dump: three
 * bare figures, a bar, a pill, two sentences and two buttons all competing on
 * one crowded row; a pace `<dl>` with no boundary; a chart floating on the
 * canvas with its axis labels loose beneath it; and a reading HISTORY drawn as
 * a hand-written `<ul>` with a labelled "Edit" and a red "Remove" on every row
 * — twelve destructive controls at full weight on a record whose subject is an
 * outcome. Every pixel of it came from `goals.css`'s `.dh-goal-measure*` block.
 *
 * It is now composed in Untitled's grammar, from source already vendored here:
 *
 * | Piece | Untitled source | What it draws |
 * | --- | --- | --- |
 * | The workspace surface | `application/table` (`TableCard.Root`'s bounded `rounded-xl bg-primary shadow-xs ring-1 ring-secondary`) | One card on the record; `surface="plain"` inside the `/goals` pane, which is already a card |
 * | Section headers | `application/section-headers` (`SectionLabel.Root`) | "Progress history", "Stages", "Trend" |
 * | The comparison | `GoalStatTrio`, a divided Untitled band | Current / Target / Target date |
 * | The bar | `base/progress-indicators` via `ProgressTrack` | The one linear indicator in the product |
 * | The state | `base/badges` via `UntitledStatusBadge` | "Ahead", "Needs attention" |
 * | The acts | `base/buttons` via the shared `Button` | "Log weight", "Edit measurement" |
 * | The chart | `application/charts-base` over Recharts, via `~/shared/charts` | The measured series, the target on the same scale, and the required path |
| The history | `application/table`'s cell, head and row classes | Date · Value · Change · Note, with a row menu |
 * | Row actions | `base/dropdown` via the shared `Menu` | Correct this reading / Remove, one control instead of two |
 * | Stages | `base/checkbox`, `base/badges`, `base/input` | The checklist, its weights and its add row |
 * | Empty states | `application/empty-state` | "Not measured yet", "No progress logged yet" |
 *
 * Three things are deliberately NOT Untitled and each has a reason:
 *
 *   - ~~**The chart is DalyHub's `TrendLine`.**~~ REVERSED by UNTITLED-08. That
 *     decision traded a visibly homemade chart for a dependency saved, and the
 *     product owner has reversed the trade. The plot is now `MeasurementTrend`,
 *     composed from Untitled's own `application/charts-base` over Recharts. The
 *     accessibility this note worried about was not traded: Recharts'
 *     `accessibilityLayer` supplies the single tab stop and the arrow-key
 *     stepping natively, the readout is `ChartFrame`'s live region, the dash
 *     patterns are unchanged, and the required-path projection is still drawn
 *     only when all three of its facts exist. The bundle cost is real and is
 *     recorded in `UNTITLED_UI_MIGRATION.md`; the plot is client-only, so the
 *     Worker never evaluates it.
 *   - **The milestone list keeps `SortableList`.** Untitled has no sortable
 *     list; the drag, the keyboard move and the whole-order write are DalyHub's
 *     domain behaviour. The row's CONTROLS inside it are Untitled's.
 *   - **The check-in and setup sheets stay in the shared `Sheet`**, whose focus
 *     restoration and phone behaviour the product's overlays all share.
 */

import { useCallback, useId, useMemo, useRef, useState } from "react";

import {
  GOAL_MILESTONE_TITLE_MAX_LENGTH,
  type GoalProgressEvaluation,
} from "~/kernel/goals";
import { MeasurementTrend } from "~/shared/charts";
import { EmptyState } from "~/shared/empty-state";
import { useFeedback } from "~/shared/feedback";
import { GoalIcon } from "~/shared/icons";
import { moveByStep, SortableHandle, SortableList } from "~/shared/drag";
import {
  formatMeasurementChange,
  formatMeasurementValue,
  formatPacePerWeek,
  goalCheckInLabel,
  goalJourneyLabel,
  goalOverTargetLabel,
  goalPaceLabel,
  goalProgressStatusLabel,
  goalProgressMeterStatus,
  goalProgressStatusTone,
  goalProgressSummaryText,
  goalRemainingLabel,
  goalTrendSummaryText,
  type SerializedGoalMeasurement,
  type SerializedGoalMilestone,
} from "~/shared/goal-progress";
import { GoalStatTrio, type GoalStat } from "~/shared/goal-progress";
import { UntitledStatusBadge } from "~/shared/pill";
import { ProgressTrack } from "~/shared/progress";
import { ConfirmationDialog } from "~/shared/settings";
import { Button, Checkbox, Menu } from "~/shared/ui";
import { InputBase } from "~/shared/ui/untitled/base/input/input";
import { SectionLabel } from "~/shared/ui/untitled/application/section-headers/section-label";
import { formatCalendarDate } from "~/shared/task-record/task-view";

/**
 * How many readings the history list shows before "Show all".
 *
 * Five: enough to see the recent shape of the data beside the chart, few enough
 * that a Goal with a year of daily weigh-ins does not turn its own record into a
 * list. The rest are one press away and nothing is hidden.
 */
const HISTORY_VISIBLE = 5;

/**
 * Untitled's bounded card boundary — `TableCard.Root`'s own declaration, and
 * the same one `AreaCard`, `ProjectCard` and the Goals workspace's two panes
 * carry. Named once here because the workspace draws it or does not, depending
 * on whether the surface around it is already a card.
 */
const CARD = "rounded-xl bg-primary shadow-xs ring-1 ring-secondary";

/** A band inside the workspace card — Untitled's own in-card section rule. */
const BAND = "border-t border-secondary px-4 py-4 md:px-5";

export interface GoalMeasurementPanelProps {
  readonly goalTitle: string;
  readonly progress: GoalProgressEvaluation;
  /** Chronologically ascending. */
  readonly measurements: readonly SerializedGoalMeasurement[];
  readonly milestones: readonly SerializedGoalMilestone[];
  readonly todayIso: string;
  /**
   * Whether the workspace draws its own bounded card.
   *
   * `card` on the Goal record, whose `feature` region is deliberately unstyled.
   * `plain` inside the `/goals` detail pane, which IS a card already — a second
   * ring there would be the frame-inside-a-frame this migration keeps removing.
   */
  readonly surface?: "card" | "plain";
  /** Open the check-in sheet (owned by the route, which posts the result). */
  readonly onRecord: (
    trigger: HTMLElement | null,
    measurement?: SerializedGoalMeasurement,
  ) => void;
  /** Open the measurement-configuration sheet. */
  readonly onConfigure: (trigger: HTMLElement | null) => void;
  readonly onDeleteMeasurement: (measurementId: string) => Promise<boolean>;
  readonly onToggleMilestone: (
    milestoneId: string,
    completed: boolean,
  ) => Promise<boolean>;
  readonly onAddMilestone: (title: string) => Promise<boolean>;
  readonly onDeleteMilestone: (milestoneId: string) => Promise<boolean>;
  /**
   * DHDS-11 — write a complete new stage order.
   *
   * ONE callback for both paths: the drag and the item menu's Move up / Move
   * down submit the same list to the same `reorder_milestones` intent, so the
   * two can never mean different things.
   */
  readonly onReorderMilestones: (
    orderedMilestoneIds: readonly string[],
  ) => Promise<boolean>;
}

export function GoalMeasurementPanel(props: GoalMeasurementPanelProps) {
  const { progress, surface = "card" } = props;
  const headingId = useId();

  if (!progress.measured) {
    return <UnmeasuredState onConfigure={props.onConfigure} />;
  }

  return (
    <section
      className={[
        "dh-goal-measure",
        "flex min-w-0 flex-col overflow-hidden",
        surface === "card" ? CARD : null,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-labelledby={headingId}
      data-testid="goal-progress"
    >
      {/*
        A real heading, not an `aria-label`.

        The section's own sub-headings ("Progress history", "Stages") are h3s, and
        an h3 with no h2 above it is a broken heading order — the exact axe
        failure this replaced. It is visually hidden because the large current
        value directly beneath it already announces what this region is to a
        sighted reader; a screen-reader user gets the landmark and the outline.
      */}
      <h2 id={headingId} className="dh-visually-hidden">
        Progress
      </h2>
      <ProgressHeader {...props} />
      {progress.type === "milestone" ? (
        <MilestoneList {...props} />
      ) : (
        <>
          <PaceFacts progress={progress} />
          <TrendSection
            progress={progress}
            measurements={props.measurements}
            onRecord={props.onRecord}
          />
          <HistoryList {...props} />
        </>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Header                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The metric strip — the reference's TRIO.
 *
 * Three equal figures under quiet labels: Current, Target, Target date. Two
 * things hold and one does not change:
 *
 *   - **Nothing is deleted.** START is on the chart, drawn as the baseline
 *     reference rule and labelled where it is drawn, which is what a reference
 *     line is for. REMAINING is arithmetic over two figures that are both still
 *     on screen, and it keeps its place in words on the status line beneath
 *     ("1.9 km to go") — where it reads as progress rather than as a fourth
 *     measurement. TARGET DATE takes the freed column, and it is the fact the
 *     strip was missing: the chart's dotted path now runs to it, so the page
 *     names the date it is drawing towards.
 *   - **No figure leads.** The question a measurable Goal answers is a
 *     comparison, and a comparison needs its terms drawn the same.
 *   - **Absence is still absence.** A Goal with no reading, or no target date,
 *     shows the label and a dash with a real word behind it for assistive tech
 *     — never a zero, and never a silently missing column that would re-rank
 *     the two figures beside it.
 */
function MetricStrip({
  goalTitle,
  progress,
}: {
  readonly goalTitle: string;
  readonly progress: GoalProgressEvaluation;
}) {
  const milestone = progress.type === "milestone";
  /*
   * A MANUAL Goal has no owner-chosen target.
   *
   * The kernel normalises it to baseline 0 / target 100 because a manual
   * percentage IS a 0–100 increase — that is the SCALE, not a decision anybody
   * made. Printing "Target 100%" beside the reading would dress an arithmetic
   * constant up as the owner's own plan, which is the same reason
   * `goalTargetLabel` refuses to name a manual Goal's target.
   */
  const scaleOnly = progress.type === "manual";
  // A milestone Goal states both terms in ONE figure ("1 of 2"), so a separate
  // Target column would print the same total twice.

  const stats: GoalStat[] = [
    {
      key: "current",
      label: milestone ? "Stages complete" : "Current",
      value:
        progress.current === null
          ? null
          : milestone
            ? // A milestone Goal's figure IS the fraction — "1 of 2" — which is
              // both terms of the comparison in one reading.
              `${progress.current} of ${progress.target ?? 0}`
            : formatMeasurementValue(progress.current, progress.unit),
      absentLabel: "No reading recorded yet",
    },
  ];

  /*
   * A column is OMITTED when the concept does not apply to this kind of Goal,
   * and shows a dash when it applies but is unset. The distinction matters: a
   * manual Goal's stored target of 100 is the SCALE, so "Target —" would report
   * the absence of a decision nobody was ever asked to make. A target-value
   * Goal with no target date, by contrast, has a real empty slot, and the dash
   * says so.
   */
  if (!scaleOnly && !milestone) {
    stats.push({
      key: "target",
      label: "Target",
      value:
        progress.target === null
          ? null
          : formatMeasurementValue(progress.target, progress.unit),
      absentLabel: "No target set",
    });
  }

  stats.push({
    key: "target-date",
    label: "Target date",
    value:
      progress.targetDate === null
        ? null
        : (formatCalendarDate(progress.targetDate) ?? progress.targetDate),
    absentLabel: "No target date set",
  });

  return (
    <GoalStatTrio
      stats={stats}
      label={`${goalTitle} progress`}
      data-testid="goal-metrics"
    />
  );
}

/**
 * The outcome band: the comparison, then the measure, then the two acts.
 *
 * The order is the argument, and it is the one Untitled's own plan card
 * (`settings-02/13`) uses: the figures, then a full-width bar with its reading,
 * then a divided footer holding the actions. Before this pass the bar, the
 * percentage, the status chip, the remaining distance, the journey and BOTH
 * buttons shared one wrapping flex line, so at 1280 the primary action sat
 * level with a sentence about kilograms and at 390 the row became five.
 */
function ProgressHeader({
  goalTitle,
  progress,
  onRecord,
  onConfigure,
}: GoalMeasurementPanelProps) {
  const label = goalCheckInLabel(progress.type, progress.unit);
  const summary = goalProgressSummaryText(progress);
  const journey = goalJourneyLabel(progress);
  const distance =
    goalOverTargetLabel(progress) ?? goalRemainingLabel(progress);

  return (
    <header className="dh-goal-measure__head flex min-w-0 flex-col">
      <MetricStrip goalTitle={goalTitle} progress={progress} />

      <div className="dh-goal-measure__headline flex min-w-0 flex-col gap-3 border-t border-secondary px-4 py-4 md:px-5">
        {/*
          The bar and its figure, on their own line.

          It is the shared `ProgressTrack`, so the announced sentence is the same
          one every other surface announces for this Goal, and the percentage is
          printed beside it rather than left to the bar's length.
        */}
        {progress.progressPercent !== null ? (
          <div className="dh-goal-measure__bar flex min-w-0 items-center gap-3">
            <ProgressTrack
              className="dh-goal-measure__track"
              label={`${goalTitle} progress`}
              percent={progress.progressPercent}
              valueText={summary}
              complete={progress.achieved}
              // POLISH-01 — the bar states the same thing the badge below it
              // states, in the same ramp.
              status={goalProgressMeterStatus(progress.status)}
            />
            <span className="dh-goal-measure__percent shrink-0 text-sm font-medium text-secondary tabular-nums">
              {progress.progressPercent}%
            </span>
          </div>
        ) : null}
        <p className="dh-goal-measure__state m-0 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
          <UntitledStatusBadge tone={goalProgressStatusTone(progress.status)}>
            {goalProgressStatusLabel(progress.status)}
          </UntitledStatusBadge>
          {/*
           * What is LEFT, in words, on the state line.
           *
           * It moved off the metric strip when that became the trio: "1.9 km to
           * go" is a statement about progress, not a fourth measurement, and
           * beside the status word is where it reads as one. Over-target
           * replaces it once there is no distance to cover, because "113% of
           * target" is the news at that point and "0 kg remaining" is not.
           */}
          {distance ? (
            <span className="dh-goal-measure__distance text-sm font-medium text-secondary">
              {distance}
            </span>
          ) : null}
          {journey ? (
            <span className="dh-goal-measure__journey text-sm text-tertiary">
              {journey}
            </span>
          ) : null}
        </p>
      </div>

      {/*
       * The acts, in their own divided footer.
       *
       * Untitled's plan card puts its one action in a bottom band rather than
       * beside the figures, and the reason applies here exactly: "Log weight" is
       * what the owner came to do, and a control the eye has to find between two
       * sentences is a control that reads as metadata.
       */}
      <div className="dh-goal-measure__actions flex flex-wrap items-center gap-2 border-t border-secondary px-4 py-3 md:px-5">
        {progress.type === "milestone" ? null : (
          <Button
            variant="primary"
            data-testid="goal-record-measurement"
            onClick={(event) => onRecord(event.currentTarget)}
          >
            {label}
          </Button>
        )}
        <Button
          variant="secondary"
          data-testid="goal-configure-measurement"
          onClick={(event) => onConfigure(event.currentTarget)}
        >
          Edit measurement
        </Button>
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/* Pace                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Pace, required pace and projection — each rendered only when the evaluator
 * produced one.
 *
 * Nothing here is estimated by this component. If a figure is missing it is
 * because two readings a week apart do not exist yet, or because the target date
 * has passed, and the honest answer is to show one fewer fact rather than a
 * number with an invisible asterisk.
 */
function PaceFacts({
  progress,
}: {
  readonly progress: GoalProgressEvaluation;
}) {
  const recent = formatPacePerWeek(
    progress.trend?.changePerWeek ?? null,
    progress.unit,
  );
  const required = formatPacePerWeek(
    progress.requiredChangePerWeek,
    progress.unit,
  );
  const projected = progress.projectedCompletionDate
    ? formatCalendarDate(progress.projectedCompletionDate)
    : null;
  const paceLabel = goalPaceLabel(progress);

  const facts: { key: string; label: string; value: string }[] = [];
  if (recent && paceLabel) {
    facts.push({ key: "recent", label: paceLabel, value: recent });
  }
  if (required) {
    facts.push({ key: "required", label: "Required pace", value: required });
  }
  if (projected) {
    facts.push({
      key: "projected",
      label: "Projected target",
      value: projected,
    });
  }
  /*
   * UIX-03 — the target DATE is not repeated here.
   *
   * The record header already states it, as the one editable control for it
   * (RECORD-01 put it in the context line precisely so it would be stated
   * once). Printing it a third time — after the header and beside a "Projected
   * target" it is meant to be compared with — was the stat duplication that
   * pass removed, and it made the two dates read as a pair of equals when one
   * is a commitment and the other an extrapolation.
   */
  if (facts.length === 0) return null;

  return (
    <dl
      className="dh-goal-measure__pace m-0 flex flex-wrap gap-x-8 gap-y-3 border-t border-secondary bg-secondary_subtle px-4 py-3 md:px-5"
      data-testid="goal-pace"
    >
      {facts.map((fact) => (
        <div
          key={fact.key}
          className="dh-goal-measure__pace-item flex min-w-0 flex-col gap-0.5"
        >
          <dt className="text-sm text-tertiary">{fact.label}</dt>
          <dd className="m-0 text-sm font-medium text-primary tabular-nums">
            {fact.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* -------------------------------------------------------------------------- */
/* Trend                                                                       */
/* -------------------------------------------------------------------------- */

function TrendSection({
  progress,
  measurements,
  onRecord,
}: {
  readonly progress: GoalProgressEvaluation;
  readonly measurements: readonly SerializedGoalMeasurement[];
  readonly onRecord: (trigger: HTMLElement | null) => void;
}) {
  const points = useMemo(
    () =>
      measurements.map((measurement) => ({
        key: measurement.id,
        date: measurement.measuredOn,
        value: measurement.value,
      })),
    [measurements],
  );

  if (measurements.length === 0) {
    return (
      <div className="dh-goal-measure__empty border-t border-secondary px-4 py-4 md:px-5">
        <EmptyState
          icon={<GoalIcon />}
          title="No progress logged yet"
          description="Add your first measurement to start tracking this Goal."
          primaryAction={
            <Button
              variant="primary"
              data-testid="goal-record-first"
              onClick={(event) => onRecord(event.currentTarget)}
            >
              {goalCheckInLabel(progress.type, progress.unit)}
            </Button>
          }
        />
      </div>
    );
  }

  if (measurements.length < 2) {
    // One reading is a value, not a trend. Drawing a flat line from it would
    // claim a direction the data cannot support.
    return (
      <p
        className={`dh-goal-measure__thin m-0 text-sm text-tertiary ${BAND}`}
        data-testid="goal-trend-thin"
      >
        More measurements needed for a trend. Current value{" "}
        {formatMeasurementValue(progress.current, progress.unit)}.
      </p>
    );
  }

  const first = measurements[0]!;
  const last = measurements[measurements.length - 1]!;

  /*
   * The series in words, and the plot's accessible name.
   *
   * UIX-03's rule survives the chart's replacement and is now enforced by the
   * chart itself rather than by a label beside it: the vertical scale includes
   * the target, so the axis a reader sees and the sentence they read cannot
   * disagree about how far there is to go.
   */
  const summary = goalTrendSummaryText(
    progress,
    measurements.map((measurement) => ({
      value: measurement.value,
      measuredOn: measurement.measuredOn,
    })),
    (iso) => formatCalendarDate(iso) ?? iso,
  );

  /*
   * The dotted path to the target, drawn ONLY when it is true.
   *
   * Three facts have to exist for it: a target VALUE, a target DATE, and a
   * target date still ahead of the last reading. All three come from the
   * evaluator; none is inferred. When any is missing the chart draws no dotted
   * line at all — an absent projection, never an invented one. What the line
   * shows is the REQUIRED path (the same fact the pace band prints as "required
   * pace"), not an extrapolation of recent pace: a forecast would put a
   * confident line through a future the product cannot know.
   */
  const projection =
    progress.target !== null &&
    progress.targetDate !== null &&
    progress.targetDate > last.measuredOn
      ? {
          date: progress.targetDate,
          value: progress.target,
          label: `Required to reach ${formatMeasurementValue(
            progress.target,
            progress.unit,
          )} by ${formatCalendarDate(progress.targetDate) ?? progress.targetDate}`,
        }
      : null;

  return (
    <div
      className={`dh-goal-measure__chart flex min-w-0 flex-col gap-3 ${BAND}`}
    >
      {/*
       * The chart earns a heading now.
       *
       * It used to be a plot with no name, immediately after a band of figures
       * — so "what am I looking at?" was answered only by the axis labels
       * beneath it. `SectionLabel.Root` is Untitled's own section heading and it
       * is what the other two sub-sections of this workspace already use, so
       * the three read as three sections rather than as a chart with two lists
       * stuck to it.
       */}
      <SectionLabel.Root
        title="Trend"
        description="Every reading, with the target on the same scale."
      />
      {/*
       * UNTITLED-08 — Untitled UI's own chart, over Recharts.
       *
       * Every semantic the bespoke `TrendLine` carried survives the move: the
       * readings, the target ON THE SAME SCALE (so the distance still to cover
       * is visible rather than cropped out), the required path drawn only when
       * all three of its facts exist, the unit on every value, and the sentence
       * that states the whole series in words. What changes is that a real value
       * axis, a real grid, an in-plot target label and Untitled's tooltip
       * replace a stretched 100×100 SVG with its axis printed underneath it.
       */}
      <MeasurementTrend
        data-testid="goal-trend-chart"
        points={points}
        summary={summary}
        /*
         * The visible caption is the SHORT form. The full sentence — which
         * names the first and last readings, the count and the direction — is
         * the plot's accessible name and stays in the document, visually
         * hidden, so nothing is taken from anyone.
         */
        caption={`${measurements.length} readings between ${
          formatCalendarDate(first.measuredOn) ?? first.measuredOn
        } and ${formatCalendarDate(last.measuredOn) ?? last.measuredOn}.`}
        target={
          progress.target === null
            ? null
            : {
                value: progress.target,
                // Named ON the rule, so the dashed line is identified where it
                // is drawn rather than in a sentence three lines below it.
                tag: `Target ${formatMeasurementValue(progress.target, progress.unit)}`,
              }
        }
        /*
         * Where the owner started, as the chart's second reference.
         *
         * Only when it is a value the owner actually configured. When the
         * baseline is merely the earliest READING it is already the line's own
         * first point, and drawing a rule through it would be a reference that
         * says nothing the data has not already said.
         */
        baseline={
          progress.baseline === null ||
          progress.baseline === measurements[0]?.value
            ? null
            : {
                value: progress.baseline,
                tag: `Start ${formatMeasurementValue(progress.baseline, progress.unit)}`,
              }
        }
        projection={projection}
        formatValue={(value) => formatMeasurementValue(value, progress.unit)}
        formatDate={(iso) => formatCalendarDate(iso) ?? iso}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* History                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The recorded readings, newest first, each with its change from the one before.
 *
 * The delta is computed against the CHRONOLOGICALLY previous reading, not the
 * row beneath it, so a reading entered out of order still reports the change it
 * actually represents.
 *
 * ── UNTITLED-07 — a table, and ONE control per row ──────────────────────────
 *
 * This was a `<ul>` of rows each carrying a labelled "Edit" button and a red
 * "Remove" button, so a Goal with a year of weigh-ins put two controls — one of
 * them destructive, at full weight — on every line of its own record. Readings
 * are columnar data (a date, a value, a delta, a note), which is what a table
 * is for, and a row whose actions are a correction and a deletion is exactly
 * the row Untitled's `application/table` draws with a trailing menu.
 *
 * It is DalyHub's shared `Menu` inside the cell rather than Untitled's
 * `TableRowActionsDropdown`: upstream's is a fixed Edit/Copy/Delete demo, and
 * the shared menu is the same `base/dropdown` source with the product's own
 * items, tones and focus restoration. Removal still takes the shared
 * destructive-action confirmation — a measurement has no soft-delete, so it is
 * confirmed rather than undone.
 *
 * A semantic `<table>`, not React Aria's `Table`: this one is not sortable, not
 * selectable and not focusable by row, and React Aria's grid semantics would put
 * a full keyboard grid between the owner and five dates. Untitled's own cell,
 * head and row CLASSES are what draw it, which is where the value of the
 * library is on a surface like this.
 *
 * ── Four columns when there is room, two when there is not ────────────────
 *
 * The CHANGE and NOTE columns drop below `@md` and `@lg` and the change moves
 * under the value instead, so a narrow table reads "9 Sep 2026 | 83 kg ↓1.1 kg
 * | ⋯" on one line. Nothing is dropped — a narrow screen is not a smaller
 * desktop, and the product's rule is that no page scrolls horizontally at 320.
 *
 * They are CONTAINER queries, not viewport ones, and the difference is a real
 * defect rather than a preference: this workspace is also the right-hand pane of
 * the `/goals` master–detail, which at a 1024 viewport is about 350px wide. A
 * viewport `sm:` showed all four columns there — in a pane less than half the
 * width the breakpoint was reasoning about — and the table then needed a
 * sideways scroller inside a page that must not have one. The table's column
 * budget follows the space it is actually in.
 */
function HistoryList({
  measurements,
  progress,
  onRecord,
  onDeleteMeasurement,
}: GoalMeasurementPanelProps) {
  const { notifyError, notifySuccess } = useFeedback();
  const [confirming, setConfirming] =
    useState<SerializedGoalMeasurement | null>(null);
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  /*
   * The row menus, by measurement id.
   *
   * `OverflowMenuItem.onSelect` takes no arguments by design — it is a plain
   * data model that knows nothing about the DOM — but both of this row's items
   * open an overlay, and the shared `Sheet` and `ConfirmationDialog` both
   * restore focus to the element that opened them. Holding the menu's own cell
   * is how the row hands them that element without the menu contract growing a
   * DOM parameter for one caller.
   */
  const triggers = useRef(new Map<string, HTMLElement | null>());
  const triggerFor = useCallback(
    (id: string) =>
      triggers.current.get(id)?.querySelector<HTMLElement>("button") ?? null,
    [],
  );

  const rows = useMemo(() => {
    const ascending = [...measurements];
    return ascending
      .map((measurement, index) => ({
        measurement,
        change:
          index === 0 ? null : measurement.value - ascending[index - 1]!.value,
      }))
      .reverse();
  }, [measurements]);

  const confirmDelete = useCallback(async () => {
    if (!confirming) return;
    const ok = await onDeleteMeasurement(confirming.id);
    if (!ok) {
      notifyError("That measurement couldn’t be removed. Please try again.");
      throw new Error("delete failed");
    }
    notifySuccess("Measurement removed.");
    setConfirming(null);
  }, [confirming, onDeleteMeasurement, notifyError, notifySuccess]);

  if (rows.length === 0) return null;
  const visible = expanded ? rows : rows.slice(0, HISTORY_VISIBLE);
  const anyNote = visible.some(({ measurement }) => measurement.note);

  return (
    <div className="dh-goal-measure__history @container flex min-w-0 flex-col border-t border-secondary">
      <div className="px-4 pt-4 pb-3 md:px-5">
        <SectionLabel.Root
          title="Progress history"
          description="Every reading, newest first. Correcting a mistyped one is an ordinary edit."
          className="dh-goal-measure__history-heading"
        />
      </div>
      {/*
       * The scroller is the last resort, not the plan: the columns drop by
       * container width above, so a note long enough to still need it is the
       * only case that reaches this — and the product's rule is that only a
       * table may have its own horizontal scroller.
       */}
      <div className="w-full overflow-x-auto">
        <table
          className="dh-goal-measure__history-list w-full"
          data-testid="goal-history"
        >
          <caption className="dh-visually-hidden">
            {`Recorded measurements for this Goal, newest first${
              expanded ? "" : `, showing the most recent ${visible.length}`
            }.`}
          </caption>
          <thead>
            {/* Untitled's table head: `bg-secondary`, an xs semibold label and
                the hairline beneath the row. */}
            <tr className="border-y border-secondary bg-secondary">
              <th
                scope="col"
                className="px-4 py-2 text-left text-xs font-semibold whitespace-nowrap text-quaternary md:px-5"
              >
                Date
              </th>
              <th
                scope="col"
                className="px-4 py-2 text-left text-xs font-semibold whitespace-nowrap text-quaternary"
              >
                Value
              </th>
              <th
                scope="col"
                className="hidden px-4 py-2 text-left text-xs font-semibold whitespace-nowrap text-quaternary @md:table-cell"
              >
                Change
              </th>
              {anyNote ? (
                <th
                  scope="col"
                  className="hidden px-4 py-2 text-left text-xs font-semibold text-quaternary @lg:table-cell"
                >
                  Note
                </th>
              ) : null}
              <th scope="col" className="px-4 py-2 md:px-5">
                <span className="dh-visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-secondary">
            {visible.map(({ measurement, change }) => {
              const changeText = formatMeasurementChange(change, progress.unit);
              const day =
                formatCalendarDate(measurement.measuredOn) ??
                measurement.measuredOn;
              return (
                <tr
                  key={measurement.id}
                  className="dh-goal-measure__history-row"
                >
                  <td className="dh-goal-measure__history-date px-4 py-3 text-sm whitespace-nowrap text-tertiary tabular-nums md:px-5">
                    {day}
                  </td>
                  <td className="dh-goal-measure__history-value px-4 py-3 text-sm font-medium text-primary tabular-nums">
                    <span className="whitespace-nowrap">
                      {formatMeasurementValue(measurement.value, progress.unit)}
                    </span>
                    {/* The change, where the column for it does not fit. */}
                    <span className="block text-sm font-normal text-tertiary tabular-nums @md:hidden">
                      {changeText ?? "First measurement"}
                    </span>
                    {measurement.note ? (
                      <span className="block text-sm font-normal text-tertiary @lg:hidden">
                        {measurement.note}
                      </span>
                    ) : null}
                  </td>
                  <td className="dh-goal-measure__history-change hidden px-4 py-3 text-sm whitespace-nowrap text-tertiary tabular-nums @md:table-cell">
                    {changeText ?? "First measurement"}
                  </td>
                  {anyNote ? (
                    <td className="dh-goal-measure__history-note hidden px-4 py-3 text-sm text-tertiary @lg:table-cell">
                      {measurement.note}
                    </td>
                  ) : null}
                  <td
                    className="px-4 py-3 text-right md:px-5"
                    ref={(node) => {
                      triggers.current.set(measurement.id, node);
                    }}
                  >
                    {/*
                     * ONE control per row, and its items say what they do to
                     * THIS reading — so the menu's accessible name carries the
                     * date and neither item needs a visually-hidden suffix.
                     */}
                    <Menu
                      label={`Actions for the measurement from ${day}`}
                      items={[
                        {
                          id: "edit",
                          label: "Correct this reading",
                          onSelect: () =>
                            onRecord(triggerFor(measurement.id), measurement),
                        },
                        {
                          id: "remove",
                          label: "Remove reading",
                          tone: "danger",
                          separatorBefore: true,
                          onSelect: () => {
                            setOpener(triggerFor(measurement.id));
                            setConfirming(measurement);
                          },
                        },
                      ]}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > HISTORY_VISIBLE && !expanded ? (
        <div className="border-t border-secondary px-4 py-3 md:px-5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setExpanded(true)}
          >
            Show all {rows.length} measurements
          </Button>
        </div>
      ) : null}
      <ConfirmationDialog
        open={confirming !== null}
        opener={opener}
        onClose={() => setConfirming(null)}
        onConfirm={confirmDelete}
        title="Remove this measurement?"
        confirmLabel="Remove"
        busyLabel="Removing…"
      >
        {confirming ? (
          <p>
            {formatMeasurementValue(confirming.value, progress.unit)} on{" "}
            {formatCalendarDate(confirming.measuredOn) ?? confirming.measuredOn}{" "}
            will be deleted, and this Goal’s progress and trend will be
            recalculated without it.
          </p>
        ) : null}
      </ConfirmationDialog>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Milestones                                                                  */
/* -------------------------------------------------------------------------- */

function MilestoneList({
  milestones,
  onAddMilestone,
  onToggleMilestone,
  onDeleteMilestone,
  onReorderMilestones,
}: GoalMeasurementPanelProps) {
  const { notifyError } = useFeedback();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const fieldId = useId();

  const add = useCallback(async () => {
    const title = draft.trim();
    if (title.length === 0) return;
    setBusy(true);
    const ok = await onAddMilestone(title);
    setBusy(false);
    if (ok) {
      setDraft("");
    } else {
      notifyError("That stage couldn’t be added. Please try again.");
    }
  }, [draft, onAddMilestone, notifyError]);

  return (
    <div
      className="dh-goal-measure__milestones flex min-w-0 flex-col border-t border-secondary"
      data-testid="goal-milestones"
    >
      <div className="px-4 pt-4 pb-3 md:px-5">
        <SectionLabel.Root
          title="Stages"
          description="Progress comes from the ones you complete. Drag to reorder."
          className="dh-goal-measure__history-heading"
        />
      </div>
      {milestones.length === 0 ? (
        <p className="dh-goal-measure__thin m-0 px-4 pb-4 text-sm text-tertiary md:px-5">
          No stages yet. Add the steps this Goal is made of — progress comes
          from the ones you complete.
        </p>
      ) : (
        /*
         * DHDS-11 — the stages are the one part of a Goal whose order is the
         * OWNER'S.
         *
         * `goal_milestones.position` has been stored and read back in since
         * GOAL-02, and until then nothing could change it: the order was
         * whatever the stages happened to be added in. The measurement itself
         * is untouched by this — reordering writes no completion, appends no
         * Activity and moves no progress. A stage's place in the list is the
         * plan; whether it is done is the fact.
         */
        <SortableList
          id="goal-milestones"
          kind="goal-milestone"
          ariaLabel="Stages"
          className="dh-goal-measure__milestone-list divide-y divide-secondary border-t border-secondary"
          items={milestones}
          getItemId={(milestone) => milestone.id}
          getItemLabel={(milestone) => milestone.title}
          onReorder={(nextIds) => {
            void onReorderMilestones(nextIds);
          }}
          renderPreview={(milestone) => (
            <span className="dh-goal-measure__milestone-preview rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary shadow-lg ring-1 ring-secondary">
              {milestone.title}
            </span>
          )}
          renderItem={(milestone, api) => (
            <div
              className="dh-goal-measure__milestone flex min-w-0 items-center gap-3 px-4 py-2.5 transition duration-100 ease-linear hover:bg-primary_hover md:px-5"
              data-dh-action-context="true"
            >
              <SortableHandle
                {...api.handleProps}
                className="dh-action-reveal dh-goal-measure__milestone-handle"
              />
              {/*
               * The shared `Checkbox` on its UNTITLED path (`onCheckedChange`),
               * which is what `~/shared/ui/Checkbox` documents as the route for
               * new product work — rather than the bare `<input>` with a hand-
               * written label this row used to carry, and rather than importing
               * the vendored file past the shared layer. The stage's title IS
               * the control's label, which is what gives the whole row one
               * accessible name and a real hit target.
               */}
              <Checkbox
                className="dh-goal-measure__milestone-label min-w-0 flex-1"
                label={milestone.title}
                checked={milestone.completed}
                onCheckedChange={(isSelected) =>
                  void onToggleMilestone(milestone.id, isSelected)
                }
              />
              {/* The weight is stated only when it is NOT the default, so an
                  equally-weighted list stays a plain checklist. */}
              {milestone.weight !== 1 ? (
                <span className="dh-goal-measure__milestone-weight shrink-0 text-sm text-tertiary tabular-nums">
                  Weight {milestone.weight}
                </span>
              ) : null}
              {/*
               * DHDS-11 — the NON-DRAG path. This row carried a bare "Remove"
               * button and no way to move a stage at all; it now carries the
               * same overflow the Task checklist row does — Move up, Move down,
               * then the destructive act — so the two ordered lists in the
               * product are operated identically, by pointer, keyboard and
               * thumb alike.
               */}
              <Menu
                label={`More actions for ${milestone.title}`}
                triggerClassName="dh-goal-measure__milestone-overflow"
                items={[
                  {
                    id: "up",
                    label: "Move up",
                    disabled: api.position === 1,
                    onSelect: () => {
                      void onReorderMilestones(
                        moveByStep(
                          milestones.map((entry) => entry.id),
                          milestone.id,
                          -1,
                        ),
                      );
                    },
                  },
                  {
                    id: "down",
                    label: "Move down",
                    disabled: api.position === api.size,
                    onSelect: () => {
                      void onReorderMilestones(
                        moveByStep(
                          milestones.map((entry) => entry.id),
                          milestone.id,
                          1,
                        ),
                      );
                    },
                  },
                  {
                    id: "remove",
                    label: "Remove stage",
                    tone: "danger",
                    separatorBefore: true,
                    onSelect: () => {
                      void onDeleteMilestone(milestone.id);
                    },
                  },
                ]}
              />
            </div>
          )}
        />
      )}
      <form
        className="dh-goal-measure__milestone-add flex flex-wrap items-center gap-2 border-t border-secondary px-4 py-3 md:px-5"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <label className="dh-visually-hidden" htmlFor={fieldId}>
          New stage
        </label>
        {/*
         * The genuine Untitled `base/input` control, not the legacy `.dh-input`
         * class this row used to carry: `ui.css` is unlayered, so that class
         * repainted the control's height, radius, border and focus ring
         * whatever an Untitled utility said.
         */}
        <InputBase
          id={fieldId}
          size="sm"
          wrapperClassName="min-w-0 flex-1"
          value={draft}
          maxLength={GOAL_MILESTONE_TITLE_MAX_LENGTH}
          placeholder="Add a stage"
          onChange={(event) => setDraft(event.currentTarget.value)}
        />
        <Button
          type="submit"
          variant="secondary"
          disabled={busy || draft.trim().length === 0}
        >
          Add
        </Button>
      </form>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Empty                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * A Goal DalyHub has not been told how to measure.
 *
 * Deliberately NOT a 0% bar. A Goal without a measurement is not a Goal that is
 * nought per cent done — it is one whose success has not been defined yet, and
 * the empty state teaches the next action (AGENTS.md §6 — no dead ends).
 */
function UnmeasuredState({
  onConfigure,
}: {
  readonly onConfigure: (trigger: HTMLElement | null) => void;
}) {
  return (
    <section
      /*
       * No workspace SURFACE for this state.
       *
       * The measured panel earns a card because it holds a metric strip, a bar,
       * pace facts, a chart and a history. This state holds one `EmptyState`,
       * which brings its own container — so painting the card underneath it
       * would be a bordered box inside a bordered box, which is precisely the
       * nesting UIX-03 moved this whole region out of the summary band to
       * remove.
       */
      className="dh-goal-measure dh-goal-measure--bare min-w-0"
      aria-label="Progress"
      data-testid="goal-progress"
    >
      <EmptyState
        icon={<GoalIcon />}
        title="Not measured yet"
        description="Say how success is measured — a target value, a count, or defined stages — and DalyHub can track your progress towards it."
        primaryAction={
          <Button
            variant="primary"
            data-testid="goal-configure-measurement"
            onClick={(event) => onConfigure(event.currentTarget)}
          >
            Add a measurement
          </Button>
        }
      />
    </section>
  );
}
