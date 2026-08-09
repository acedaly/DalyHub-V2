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
  GoalProgressReadout,
  formatMeasurementChange,
  formatMeasurementValue,
  formatPacePerWeek,
  goalCheckInLabel,
  goalPaceLabel,
  goalTrendSummaryText,
  type SerializedGoalMeasurement,
  type SerializedGoalMilestone,
} from "~/shared/goal-progress";
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

function ProgressHeader({
  goalTitle,
  progress,
  onRecord,
  onConfigure,
}: GoalMeasurementPanelProps) {
  const label = goalCheckInLabel(progress.type, progress.unit);
  const change = formatMeasurementChange(progress.totalChange, progress.unit);
  return (
    <header className="dh-goal-measure__head">
      <GoalProgressReadout
        progress={progress}
        label={`${goalTitle} progress`}
        size="hero"
        trailing={change ? `${change} from baseline` : null}
      />
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
  if (progress.targetDate) {
    facts.push({
      key: "target-date",
      label: "Target date",
      value: formatCalendarDate(progress.targetDate) ?? progress.targetDate,
    });
  }
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
        )}
        target={
          progress.target === null
            ? null
            : {
                value: progress.target,
                label: `Target ${formatMeasurementValue(progress.target, progress.unit)}.`,
              }
        }
        startLabel={formatCalendarDate(first.measuredOn) ?? first.measuredOn}
        endLabel={formatCalendarDate(last.measuredOn) ?? last.measuredOn}
        lowLabel={formatMeasurementValue(Math.min(...values), progress.unit)}
        highLabel={formatMeasurementValue(Math.max(...values), progress.unit)}
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
      className="dh-goal-measure"
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
