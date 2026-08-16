/**
 * GOAL-02 — the Goal record's progress section.
 *
 * The part of a Goal that answers *am I actually getting there?* It is the
 * page's centre of gravity, and it is built from four honest pieces in a fixed
 * order:
 *
 *   1. the CURRENT VALUE, large, against its target, with the bar, what remains
 *      and the status in words;
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
 */

import { useCallback, useId, useMemo, useState } from "react";

import {
  GOAL_MILESTONE_TITLE_MAX_LENGTH,
  type GoalProgressEvaluation,
} from "~/kernel/goals";
import { TrendLine } from "~/shared/charts";
import { EmptyState } from "~/shared/empty-state";
import { useFeedback } from "~/shared/feedback";
import { GoalIcon, TrashIcon } from "~/shared/icons";
import {
  formatMeasurementChange,
  formatMeasurementValue,
  formatPacePerWeek,
  goalCheckInLabel,
  goalJourneyLabel,
  goalOverTargetLabel,
  goalPaceLabel,
  goalProgressStatusLabel,
  goalProgressStatusTone,
  goalProgressSummaryText,
  goalRemainingLabel,
  goalTrendSummaryText,
  type SerializedGoalMeasurement,
  type SerializedGoalMilestone,
} from "~/shared/goal-progress";
import { GoalStatTrio, type GoalStat } from "~/shared/goal-progress";
import { StatusPill } from "~/shared/pill";
import { ProgressTrack } from "~/shared/progress";
import { ConfirmationDialog } from "~/shared/settings";
import { formatCalendarDate } from "~/shared/task-record/task-view";

/**
 * How many readings the history list shows before "Show all".
 *
 * Five: enough to see the recent shape of the data beside the chart, few enough
 * that a Goal with a year of daily weigh-ins does not turn its own record into a
 * list. The rest are one press away and nothing is hidden.
 */
const HISTORY_VISIBLE = 5;

export interface GoalMeasurementPanelProps {
  readonly goalTitle: string;
  readonly progress: GoalProgressEvaluation;
  /** Chronologically ascending. */
  readonly measurements: readonly SerializedGoalMeasurement[];
  readonly milestones: readonly SerializedGoalMilestone[];
  readonly todayIso: string;
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
}

export function GoalMeasurementPanel(props: GoalMeasurementPanelProps) {
  const { progress } = props;
  const headingId = useId();

  if (!progress.measured) {
    return <UnmeasuredState onConfigure={props.onConfigure} />;
  }

  return (
    <section
      className="dh-goal-measure"
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
 * REDESIGN-04 — the metric strip becomes the reference's TRIO.
 *
 * `mockup3.png` draws three equal figures under quiet labels — Current, Target,
 * Target date — where UIX-03 drew a quartet with the current value set larger
 * than its neighbours. Two things change and one does not:
 *
 *   - **Nothing is deleted.** START is on the chart, drawn as the baseline
 *     reference rule and labelled where it is drawn, which is what a reference
 *     line is for. REMAINING is arithmetic over two figures that are both still
 *     on screen, and it keeps its place in words on the status line beneath
 *     ("1.9 km to go") — where it reads as progress rather than as a fourth
 *     measurement. TARGET DATE takes the freed column, and it is the fact the
 *     strip was missing: the chart's dotted path now runs to it, so the page
 *     names the date it is drawing towards.
 *   - **No figure leads.** REDESIGN-03 brought the current value down from
 *     Material's 36px `display-small` to the 24px `--dh-text-metric` role so
 *     that it stopped being a banner with captions beneath it; the reference
 *     finishes that by drawing all three at one size. The question a measurable
 *     Goal answers is a comparison, and a comparison needs its terms drawn the
 *     same.
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
              // both terms of the comparison in one reading, exactly as
              // `mockup3.png` writes a counted Goal's row value.
              `${progress.current} of ${progress.target ?? 0}`
            : formatMeasurementValue(progress.current, progress.unit),
      absentLabel: "No reading recorded yet",
    },
  ];

  /*
   * A column is OMITTED when the concept does not apply to this kind of Goal,
   * and shows a dash when it applies but is unset. The distinction matters and
   * UIX-03 got it right first: a manual Goal's stored target of 100 is the
   * SCALE, so "Target —" would report the absence of a decision nobody was ever
   * asked to make. A target-value Goal with no target date, by contrast, has a
   * real empty slot, and the dash says so.
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
    <header className="dh-goal-measure__head">
      <div className="dh-goal-measure__headline">
        <MetricStrip goalTitle={goalTitle} progress={progress} />
        {/*
          The bar and the state, on one line beneath the figures.

          It is the shared `ProgressTrack`, so the announced sentence is the same
          one every other surface announces for this Goal, and the percentage is
          printed beside it rather than left to the bar's length.
        */}
        {progress.progressPercent !== null ? (
          <div className="dh-goal-measure__bar">
            <ProgressTrack
              className="dh-goal-measure__track"
              label={`${goalTitle} progress`}
              percent={progress.progressPercent}
              valueText={summary}
              complete={progress.achieved}
            />
            <span className="dh-goal-measure__percent">
              {progress.progressPercent}%
            </span>
          </div>
        ) : null}
        <p className="dh-goal-measure__state">
          <StatusPill tone={goalProgressStatusTone(progress.status)}>
            {goalProgressStatusLabel(progress.status)}
          </StatusPill>
          {/*
           * REDESIGN-04 — what is LEFT, in words, on the state line.
           *
           * It moved off the metric strip when that became the reference's
           * trio: "1.9 km to go" is a statement about progress, not a fourth
           * measurement, and beside the status word is where it reads as one.
           * Over-target replaces it once there is no distance to cover, because
           * "113% of target" is the news at that point and "0 kg remaining" is
           * not.
           */}
          {distance ? (
            <span className="dh-goal-measure__distance">{distance}</span>
          ) : null}
          {journey ? (
            <span className="dh-goal-measure__journey">{journey}</span>
          ) : null}
        </p>
      </div>
      <div className="dh-goal-measure__actions">
        {progress.type === "milestone" ? null : (
          <button
            type="button"
            className="dh-btn dh-btn--primary"
            data-testid="goal-record-measurement"
            onClick={(event) => onRecord(event.currentTarget)}
          >
            {label}
          </button>
        )}
        <button
          type="button"
          className="dh-btn dh-btn--ghost"
          data-testid="goal-configure-measurement"
          onClick={(event) => onConfigure(event.currentTarget)}
        >
          Edit measurement
        </button>
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
   * target" it is meant to be compared with — was the stat duplication this
   * pass is removing, and it made the two dates read as a pair of equals when
   * one is a commitment and the other an extrapolation.
   */
  if (facts.length === 0) return null;

  return (
    <dl className="dh-goal-measure__pace" data-testid="goal-pace">
      {facts.map((fact) => (
        <div key={fact.key} className="dh-goal-measure__pace-item">
          <dt>{fact.label}</dt>
          <dd>{fact.value}</dd>
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
      <div className="dh-goal-measure__empty">
        <EmptyState
          icon={<GoalIcon />}
          title="No progress logged yet"
          description="Add your first measurement to start tracking this Goal."
          primaryAction={
            <button
              type="button"
              className="dh-btn dh-btn--primary"
              data-testid="goal-record-first"
              onClick={(event) => onRecord(event.currentTarget)}
            >
              {goalCheckInLabel(progress.type, progress.unit)}
            </button>
          }
        />
      </div>
    );
  }

  if (measurements.length < 2) {
    // One reading is a value, not a trend. Drawing a flat line from it would
    // claim a direction the data cannot support.
    return (
      <p className="dh-goal-measure__thin" data-testid="goal-trend-thin">
        More measurements needed for a trend. Current value{" "}
        {formatMeasurementValue(progress.current, progress.unit)}.
      </p>
    );
  }

  const values = measurements.map((measurement) => measurement.value);
  const first = measurements[0]!;
  const last = measurements[measurements.length - 1]!;

  /*
   * UIX-03 — the axis range now describes the PLOTTED domain, not merely the
   * readings.
   *
   * The chart scales to include the target (see `TrendLine`), so labelling the
   * axis "79.3 kg – 85 kg" while the plot actually spans down to 70 kg would
   * make the one piece of text on the chart contradict the drawing beside it.
   */
  const domain = [...values];
  if (progress.target !== null) domain.push(progress.target);
  if (progress.baseline !== null) domain.push(progress.baseline);

  /*
   * REDESIGN-04 §6.2 — the dotted path to the target, drawn ONLY when it is
   * true.
   *
   * Three facts have to exist for it: a target VALUE, a target DATE, and a
   * target date still ahead of the last reading. All three come from the
   * evaluator; none is inferred. When any is missing the chart draws no dotted
   * line at all, which is the brief's rule — an absent projection, never an
   * invented one. What the line shows is the REQUIRED path (the same fact the
   * pace band prints as "required pace"), not an extrapolation of recent pace:
   * a forecast would put a confident line through a future the product cannot
   * know.
   */
  const projection =
    progress.target !== null &&
    progress.targetDate !== null &&
    progress.targetDate > last.measuredOn
      ? {
          date: progress.targetDate,
          value: progress.target,
          label: `Target ${formatMeasurementValue(progress.target, progress.unit)} by ${
            formatCalendarDate(progress.targetDate) ?? progress.targetDate
          }.`,
        }
      : null;

  return (
    <div className="dh-goal-measure__chart">
      <TrendLine
        data-testid="goal-trend-chart"
        points={points}
        summary={goalTrendSummaryText(
          progress,
          measurements.map((measurement) => ({
            value: measurement.value,
            measuredOn: measurement.measuredOn,
          })),
          (iso) => formatCalendarDate(iso) ?? iso,
        )}
        target={
          progress.target === null
            ? null
            : {
                value: progress.target,
                label: `Target ${formatMeasurementValue(progress.target, progress.unit)}.`,
                // Pinned to the rule itself, so the dashed line is named where
                // it is drawn rather than in a sentence three lines below.
                tag: `Target ${formatMeasurementValue(progress.target, progress.unit)}`,
              }
        }
        /*
         * Where the owner started, as the chart's second reference.
         *
         * Only when it is a value the owner actually configured. When the
         * baseline is merely the earliest READING it is already the line's own
         * first point, and drawing a rule through it would be a reference line
         * that says nothing the data has not already said.
         */
        baseline={
          progress.baseline === null ||
          progress.baseline === measurements[0]?.value
            ? null
            : {
                value: progress.baseline,
                label: `Started at ${formatMeasurementValue(progress.baseline, progress.unit)}.`,
                tag: `Start ${formatMeasurementValue(progress.baseline, progress.unit)}`,
              }
        }
        describePoint={(point) =>
          `${formatMeasurementValue(point.value, progress.unit)} on ${
            formatCalendarDate(point.date) ?? point.date
          }`
        }
        projection={projection}
        startLabel={formatCalendarDate(first.measuredOn) ?? first.measuredOn}
        /*
         * The axis's end is where the PLOT ends. With a projection drawn, that
         * is the target date rather than the last reading — labelling it
         * otherwise would make the one piece of text on the axis contradict the
         * line above it.
         */
        endLabel={
          projection
            ? (formatCalendarDate(projection.date) ?? projection.date)
            : (formatCalendarDate(last.measuredOn) ?? last.measuredOn)
        }
        lowLabel={formatMeasurementValue(Math.min(...domain), progress.unit)}
        highLabel={formatMeasurementValue(Math.max(...domain), progress.unit)}
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

  return (
    <div className="dh-goal-measure__history">
      <h3 className="dh-goal-measure__history-heading">Progress history</h3>
      <ul className="dh-goal-measure__history-list" data-testid="goal-history">
        {visible.map(({ measurement, change }) => {
          const changeText = formatMeasurementChange(change, progress.unit);
          return (
            <li key={measurement.id} className="dh-goal-measure__history-row">
              {/*
                The three facts are ONE group so the controls can sit beside them
                in a single column at every width. Splitting them into three grid
                cells made a phone row two lines tall with the buttons stranded
                on the second, which turned six readings into a screen and a half.
              */}
              <span className="dh-goal-measure__history-facts">
                <span className="dh-goal-measure__history-date">
                  {formatCalendarDate(measurement.measuredOn) ??
                    measurement.measuredOn}
                </span>
                <span className="dh-goal-measure__history-value">
                  {formatMeasurementValue(measurement.value, progress.unit)}
                </span>
                <span className="dh-goal-measure__history-change">
                  {changeText ?? "First measurement"}
                </span>
                {measurement.note ? (
                  <span className="dh-goal-measure__history-note">
                    {measurement.note}
                  </span>
                ) : null}
              </span>
              <span className="dh-goal-measure__history-actions">
                <button
                  type="button"
                  className="dh-btn dh-btn--ghost dh-btn--sm"
                  onClick={(event) =>
                    onRecord(event.currentTarget, measurement)
                  }
                >
                  Edit
                  <span className="dh-visually-hidden">
                    {` measurement from ${measurement.measuredOn}`}
                  </span>
                </button>
                {/* Removal takes the shared destructive-action confirmation —
                    the same dialog every other irreversible act in DalyHub
                    uses. A measurement has no soft-delete, so it is confirmed
                    rather than undone.

                    A LABELLED button beside "Edit", not an icon-only one: the
                    two controls sit together and a bin glyph alone would be the
                    only unlabelled control on the record. The icon is
                    decorative; the word carries the meaning. */}
                <button
                  type="button"
                  className="dh-btn dh-btn--ghost dh-btn--sm dh-goal-measure__remove"
                  onClick={(event) => {
                    setOpener(event.currentTarget);
                    setConfirming(measurement);
                  }}
                >
                  <TrashIcon />
                  Remove
                  <span className="dh-visually-hidden">
                    {` measurement from ${measurement.measuredOn}`}
                  </span>
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      {rows.length > HISTORY_VISIBLE && !expanded ? (
        <button
          type="button"
          className="dh-btn dh-btn--ghost dh-btn--sm"
          onClick={() => setExpanded(true)}
        >
          Show all {rows.length} measurements
        </button>
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
}: GoalMeasurementPanelProps) {
  const { notifyError } = useFeedback();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

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
    <div className="dh-goal-measure__milestones" data-testid="goal-milestones">
      <h3 className="dh-goal-measure__history-heading">Stages</h3>
      {milestones.length === 0 ? (
        <p className="dh-goal-measure__thin">
          No stages yet. Add the steps this Goal is made of — progress comes
          from the ones you complete.
        </p>
      ) : (
        <ul className="dh-goal-measure__milestone-list">
          {milestones.map((milestone) => (
            <li key={milestone.id} className="dh-goal-measure__milestone">
              <label className="dh-goal-measure__milestone-label">
                <input
                  type="checkbox"
                  checked={milestone.completed}
                  onChange={(event) =>
                    void onToggleMilestone(
                      milestone.id,
                      event.currentTarget.checked,
                    )
                  }
                />
                <span>{milestone.title}</span>
              </label>
              {/* The weight is stated only when it is NOT the default, so an
                  equally-weighted list stays a plain checklist. */}
              {milestone.weight !== 1 ? (
                <span className="dh-goal-measure__milestone-weight">
                  Weight {milestone.weight}
                </span>
              ) : null}
              <button
                type="button"
                className="dh-btn dh-btn--ghost dh-btn--sm dh-goal-measure__remove"
                onClick={() => void onDeleteMilestone(milestone.id)}
              >
                <TrashIcon />
                Remove
                <span className="dh-visually-hidden">
                  {` stage ${milestone.title}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="dh-goal-measure__milestone-add"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <label className="dh-visually-hidden" htmlFor="goal-milestone-new">
          New stage
        </label>
        <input
          id="goal-milestone-new"
          className="dh-input"
          value={draft}
          maxLength={GOAL_MILESTONE_TITLE_MAX_LENGTH}
          placeholder="Add a stage"
          onChange={(event) => setDraft(event.currentTarget.value)}
        />
        <button
          type="submit"
          className="dh-btn dh-btn--secondary"
          disabled={busy || draft.trim().length === 0}
        >
          Add
        </button>
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
      className="dh-goal-measure dh-goal-measure--bare"
      aria-label="Progress"
      data-testid="goal-progress"
    >
      <EmptyState
        icon={<GoalIcon />}
        title="Not measured yet"
        description="Say how success is measured — a target value, a count, or defined stages — and DalyHub can track your progress towards it."
        primaryAction={
          <button
            type="button"
            className="dh-btn dh-btn--primary"
            data-testid="goal-configure-measurement"
            onClick={(event) => onConfigure(event.currentTarget)}
          >
            Add a measurement
          </button>
        }
      />
    </section>
  );
}
