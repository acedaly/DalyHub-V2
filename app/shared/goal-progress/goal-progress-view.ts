/**
 * GOAL-02 — the shared Goal-progress view model (pure, React-free).
 *
 * Every surface that shows a measurable Goal — the Goal record, the Goals
 * gallery, Today — must say the same thing about it. The evaluation itself is
 * kernel-owned (`evaluateGoalProgress`); this module owns the WORDS: how a value
 * and its unit are written, what "On track" is called, how a pace reads in a
 * sentence, and what the honest empty states say.
 *
 * It lives in `app/shared` rather than in `~/modules/goals` for the reason
 * `NewGoalForm` and `~/shared/alignment` already do: Today is a different module
 * and the cross-module-import rule forbids it reaching into the Goals module's
 * internals (`docs/development/MODULES.md`). One vocabulary in one place is what
 * stops Today calling a Goal "Behind" while its record calls it "Needs
 * attention".
 *
 * Nothing here computes progress. If a number is missing, it is missing because
 * the evaluator refused to invent it, and the copy says so.
 */

import type {
  GoalMeasurement,
  GoalMeasurementConfig,
  GoalMeasurementPoint,
  GoalMeasurementSummary,
  GoalMeasurementType,
  GoalMilestone,
  GoalMilestoneSummary,
  GoalProgressEvaluation,
  GoalProgressStatus,
} from "~/kernel/goals";
import {
  GOAL_TREND_WINDOW_DAYS,
  evaluateGoalProgress,
  goalDaysBetween,
} from "~/kernel/goals";
import type { PillTone } from "~/shared/pill";

/* -------------------------------------------------------------------------- */
/* JSON-safe shapes                                                            */
/* -------------------------------------------------------------------------- */

export type SerializedGoalMeasurementConfig = GoalMeasurementConfig;

/** One recorded reading, as a loader hands it to the client. */
export type SerializedGoalMeasurement = {
  readonly id: string;
  readonly value: number;
  readonly measuredOn: string;
  readonly note: string | null;
  readonly createdAt: string;
};

export type SerializedGoalMilestone = {
  readonly id: string;
  readonly title: string;
  readonly weight: number;
  readonly position: number;
  readonly completed: boolean;
};

export function serializeGoalMeasurement(
  measurement: GoalMeasurement,
): SerializedGoalMeasurement {
  return {
    id: measurement.id,
    value: measurement.value,
    measuredOn: measurement.measuredOn,
    note: measurement.note,
    createdAt: measurement.createdAt.toISOString(),
  };
}

export function serializeGoalMilestone(
  milestone: GoalMilestone,
): SerializedGoalMilestone {
  return {
    id: milestone.id,
    title: milestone.title,
    weight: milestone.weight,
    position: milestone.position,
    completed: milestone.completedAt !== null,
  };
}

/* -------------------------------------------------------------------------- */
/* Composition                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Evaluate a Goal from its FULL measurement series — the Goal record's read.
 *
 * `startedOn` is the Goal's creation day in the owner's calendar. It is only
 * used as the schedule origin when the Goal has no earlier reading, so "on
 * track" is measured against a real elapsed fraction.
 */
export function evaluateGoalFromSeries(input: {
  readonly config: GoalMeasurementConfig;
  readonly targetDate: string | null;
  readonly measurements: readonly {
    readonly value: number;
    readonly measuredOn: string;
  }[];
  readonly milestones?: GoalMilestoneSummary;
  readonly startedOn?: string | null;
  readonly completed?: boolean;
  readonly todayIso: string;
}): GoalProgressEvaluation {
  return evaluateGoalProgress(
    {
      config: input.config,
      targetDate: input.targetDate,
      measurements: input.measurements,
      milestones: input.milestones,
      startedOn: input.startedOn ?? null,
      completed: input.completed,
    },
    { todayIso: input.todayIso },
  );
}

/**
 * Evaluate a Goal from its bounded SUMMARY — the collection and Today read.
 *
 * The summary carries three readings (first, comparison, latest) rather than the
 * whole series, which is what keeps a page of Goals cheap. Handing those three
 * to the same evaluator means the collection's percentage is computed by the
 * same code as the record's, so the two can never disagree — and the trend it
 * derives is stated as the honest "since <date>" pace those three points support,
 * never dressed up as a recent gradient the summary cannot see.
 */
export function evaluateGoalFromSummary(input: {
  readonly config: GoalMeasurementConfig;
  readonly targetDate: string | null;
  readonly summary: GoalMeasurementSummary | null;
  readonly milestones?: GoalMilestoneSummary;
  readonly startedOn?: string | null;
  readonly completed?: boolean;
  readonly todayIso: string;
}): GoalProgressEvaluation {
  const points: GoalMeasurementPoint[] = [];
  const push = (point: GoalMeasurementPoint | null | undefined) => {
    if (!point) return;
    if (points.some((existing) => existing.measuredOn === point.measuredOn)) {
      return;
    }
    points.push(point);
  };
  push(input.summary?.earliest);
  push(input.summary?.priorInWindow);
  push(input.summary?.latest);

  const evaluation = evaluateGoalProgress(
    {
      config: input.config,
      targetDate: input.targetDate,
      measurements: points,
      milestones: input.milestones,
      startedOn: input.startedOn ?? null,
      completed: input.completed,
    },
    { todayIso: input.todayIso },
  );
  // The count comes from the summary, not from the three points sampled: a Goal
  // with 40 readings must not report "3" anywhere.
  return input.summary
    ? { ...evaluation, measurementCount: input.summary.count }
    : evaluation;
}

/* -------------------------------------------------------------------------- */
/* Numbers as words                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Round a measurement for display without lying about it.
 *
 * At most one decimal place, and no trailing ".0": 79 kg reads "79", 79.05 reads
 * "79.1", 20000 reads "20,000". Money-like values keep their grouping because a
 * savings goal of "$20000" is harder to read than the number it represents, and
 * a personal goal tracker has no business showing four decimal places of a
 * weight.
 */
export function formatMeasurementNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  return rounded.toLocaleString("en-AU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
}

/**
 * A value with its unit, in the order the unit is written.
 *
 * "$" and "%" are the two units English attaches without a space and (for "$")
 * on the wrong side, so they get the one special case rather than every Goal
 * reading "20,000 $".
 */
export function formatMeasurementValue(
  value: number | null,
  unit: string | null,
): string {
  if (value === null) return "—";
  const number = formatMeasurementNumber(value);
  if (unit === null || unit.length === 0) return number;
  if (unit === "$") return `$${number}`;
  if (unit === "%") return `${number}%`;
  return `${number} ${unit}`;
}

/** A signed change, with an arrow the summary sentence also states in words. */
export function formatMeasurementChange(
  change: number | null,
  unit: string | null,
): string | null {
  if (change === null || !Number.isFinite(change)) return null;
  const rounded = Math.round(change * 10) / 10;
  if (rounded === 0) return `No change`;
  const arrow = rounded < 0 ? "↓" : "↑";
  return `${arrow} ${formatMeasurementValue(Math.abs(rounded), unit)}`;
}

/** A pace, always per week — one period, so two paces are comparable at a glance. */
export function formatPacePerWeek(
  changePerWeek: number | null,
  unit: string | null,
): string | null {
  if (changePerWeek === null || !Number.isFinite(changePerWeek)) return null;
  /*
   * A pace keeps TWO decimals, unlike a measurement's one.
   *
   * "-0.55 kg/week" and "-0.39 kg/week" are different plans; rounded to one
   * decimal they are the same number, and the whole point of showing the recent
   * pace beside the required one is that they can be compared. So this formats
   * the magnitude itself rather than routing it through
   * `formatMeasurementValue`, and only the unit placement is shared.
   */
  const rounded = Math.round(changePerWeek * 100) / 100;
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  const magnitude = Math.abs(rounded).toLocaleString("en-AU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  const withUnit =
    unit === null || unit.length === 0
      ? magnitude
      : unit === "$"
        ? `$${magnitude}`
        : unit === "%"
          ? `${magnitude}%`
          : `${magnitude} ${unit}`;
  return `${sign}${withUnit}/week`;
}

/* -------------------------------------------------------------------------- */
/* Status                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The owner-facing word for each status.
 *
 * Calm, factual and never alarmist (AGENTS.md §2). "Needs attention", not
 * "Failing"; "No recent update", not "Abandoned". Two of them state an absence
 * rather than a judgement, because a Goal DalyHub has not been told how to
 * measure is not a Goal that is going badly.
 */
export const GOAL_PROGRESS_STATUS_LABELS: Readonly<
  Record<GoalProgressStatus, string>
> = {
  not_measured: "No measurement",
  not_started: "Not started",
  in_progress: "In progress",
  on_track: "On track",
  ahead: "Ahead",
  needs_attention: "Needs attention",
  achieved: "Target achieved",
  overdue: "Overdue",
  stale: "No recent update",
};

/**
 * The pill tone for each status.
 *
 * Only two states are ever tinted for attention, and both are FACTS the owner
 * can act on (a passed date, a month of silence) rather than opinions about
 * them. Everything in flight is neutral, because a Goal in progress is the
 * normal state of a Goal and does not need a colour.
 */
export const GOAL_PROGRESS_STATUS_TONES: Readonly<
  Record<GoalProgressStatus, PillTone>
> = {
  not_measured: "neutral",
  not_started: "neutral",
  in_progress: "neutral",
  on_track: "success",
  ahead: "success",
  needs_attention: "warning",
  achieved: "success",
  overdue: "warning",
  stale: "neutral",
};

export function goalProgressStatusLabel(status: GoalProgressStatus): string {
  return GOAL_PROGRESS_STATUS_LABELS[status];
}

export function goalProgressStatusTone(status: GoalProgressStatus): PillTone {
  return GOAL_PROGRESS_STATUS_TONES[status];
}

/** Statuses worth surfacing on Today. Deliberately short and explicable. */
export function goalNeedsAttention(status: GoalProgressStatus): boolean {
  return status === "needs_attention" || status === "overdue";
}

/* -------------------------------------------------------------------------- */
/* Sentences                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The one-line statement of where a Goal stands, as TEXT.
 *
 * This is the sentence AGENTS.md §15 requires to exist beside every indicator:
 * "79 kg · 40% complete · 9 kg remaining". Every surface uses it as the progress
 * bar's `valueText`, so what a screen reader hears is exactly what the page says.
 */
export function goalProgressSummaryText(
  progress: GoalProgressEvaluation,
): string {
  if (!progress.measured) return "No measurement configured";
  const parts: string[] = [];
  if (progress.type === "milestone") {
    const done = progress.current ?? 0;
    const total = progress.target ?? 0;
    parts.push(total > 0 ? `${done} of ${total} complete` : "No stages yet");
  } else if (progress.current !== null) {
    parts.push(formatMeasurementValue(progress.current, progress.unit));
  }
  if (progress.progressPercent !== null) {
    parts.push(`${progress.progressPercent}% complete`);
  }
  if (progress.achieved) {
    parts.push("target reached");
  } else if (progress.remaining !== null && progress.remaining > 0) {
    parts.push(
      `${formatMeasurementValue(progress.remaining, progress.unit)} remaining`,
    );
  }
  return parts.length > 0 ? parts.join(" · ") : "No progress logged yet";
}

/** "11 / 24 books" and "$6,850 / $10,000" — the count-style reading. */
export function goalCurrentAgainstTarget(
  progress: GoalProgressEvaluation,
): string | null {
  if (!progress.measured) return null;
  if (progress.type === "milestone") {
    const total = progress.target ?? 0;
    if (total <= 0) return null;
    return `${progress.current ?? 0} / ${total}`;
  }
  if (progress.current === null || progress.target === null) return null;
  if (progress.type === "accumulation") {
    return `${formatMeasurementValue(progress.current, null)} / ${formatMeasurementValue(
      progress.target,
      progress.unit,
    )}`;
  }
  return `${formatMeasurementValue(progress.current, progress.unit)} → ${formatMeasurementValue(
    progress.target,
    progress.unit,
  )}`;
}

/** The chart's required text equivalent, stating direction and span in words. */
export function goalTrendSummaryText(
  progress: GoalProgressEvaluation,
  points: readonly { readonly value: number; readonly measuredOn: string }[],
): string {
  if (points.length < 2) {
    return progress.current === null
      ? "No measurements recorded yet."
      : `One measurement so far: ${formatMeasurementValue(progress.current, progress.unit)}.`;
  }
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const change = last.value - first.value;
  const movement =
    change === 0
      ? "unchanged"
      : change < 0
        ? `down ${formatMeasurementValue(Math.abs(change), progress.unit)}`
        : `up ${formatMeasurementValue(change, progress.unit)}`;
  return `${points.length} measurements from ${formatMeasurementValue(
    first.value,
    progress.unit,
  )} on ${first.measuredOn} to ${formatMeasurementValue(
    last.value,
    progress.unit,
  )} on ${last.measuredOn} — ${movement}.`;
}

/**
 * How the pace should be introduced.
 *
 * "Recent pace" when it came from the last four weeks, "Average pace" when the
 * window held too little and the whole history was used. Naming the difference
 * is what stops a figure claiming to be more current than it is.
 */
export function goalPaceLabel(progress: GoalProgressEvaluation): string | null {
  if (progress.trend === null) return null;
  return progress.trend.basis === "recent"
    ? `Recent pace (last ${GOAL_TREND_WINDOW_DAYS} days)`
    : "Average pace";
}

/**
 * The verb a check-in should use, taken from the Goal itself.
 *
 * "Log weight" reads like the thing the owner is about to do; "Update progress"
 * reads like software. The unit is the only clue the product has, so it is used
 * when it names something recognisable and the generic wording is used otherwise
 * — never a guess dressed as knowledge.
 */
export function goalCheckInLabel(
  type: GoalMeasurementType | null,
  unit: string | null,
): string {
  if (type === "manual") return "Update progress";
  if (type === "accumulation") return "Add progress";
  if (unit === "kg" || unit === "g") return "Log weight";
  if (unit === "km" || unit === "m") return "Log distance";
  if (unit === "minutes" || unit === "hours") return "Log time";
  if (unit === "$") return "Log amount";
  return "Add measurement";
}

/** How stale a reading is, in the plainest words available. */
export function goalLastUpdatedText(
  progress: GoalProgressEvaluation,
): string | null {
  if (progress.latestMeasuredOn === null) return null;
  const days = progress.daysSinceLastMeasurement;
  if (days === null) return null;
  if (days <= 0) return "Updated today";
  if (days === 1) return "Updated yesterday";
  if (days < 7) return `Updated ${days} days ago`;
  if (days < 14) return "Updated last week";
  if (days < 60) return `Updated ${Math.round(days / 7)} weeks ago`;
  return `Updated ${Math.round(days / 30)} months ago`;
}

/**
 * Whether a Goal is asking for a check-in.
 *
 * A configured, unfinished Goal that accepts readings and has not had one for a
 * week. Used only to ORDER Today's Goal list, never to nag: nothing anywhere
 * says "you are overdue for a weigh-in".
 */
export const GOAL_CHECK_IN_DUE_DAYS = 7;

export function goalCheckInDue(progress: GoalProgressEvaluation): boolean {
  if (!progress.measured || progress.achieved) return false;
  if (progress.type === "milestone") return false;
  if (progress.latestMeasuredOn === null) return true;
  return (progress.daysSinceLastMeasurement ?? 0) >= GOAL_CHECK_IN_DUE_DAYS;
}

/** Days until the target date, or `null` when there is no date. */
export function goalDaysToTarget(
  progress: GoalProgressEvaluation,
  todayIso: string,
): number | null {
  if (progress.targetDate === null) return null;
  return goalDaysBetween(todayIso, progress.targetDate);
}
