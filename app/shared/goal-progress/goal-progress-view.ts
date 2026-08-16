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
import type { MeterStatus } from "~/shared/progress";

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

/**
 * POLISH-01 — the METER status for each Goal status.
 *
 * Close to {@link GOAL_PROGRESS_STATUS_TONES} but not the same map, and the
 * difference is deliberate. A CHIP is a label the owner reads; a BAR is a
 * verdict the eye reads without deciding to. So the bar is allowed to be one
 * step stricter about the two states that are genuinely bad news:
 *
 *   - `overdue` — the target DATE has passed and the target has not been
 *     reached. The chip says "Overdue" in amber because the sentence carries
 *     the weight; the bar says `danger`, because a red bar under a passed
 *     deadline is the honest picture and an amber one under-reports it.
 *   - `needs_attention` — behind the line, or moving away from it. `warning` in
 *     both: it is a slope, not a wall.
 *
 * Everything in flight is `neutral`. A Goal that is not measured, not started,
 * or moving with no target date to be on track AGAINST has no status to draw,
 * and a bar that guessed "success" for it would be congratulating the owner for
 * work that has not begun (the same reasoning `goalIsOnTrack` records).
 */
export const GOAL_PROGRESS_METER_STATUSES: Readonly<
  Record<GoalProgressStatus, MeterStatus>
> = {
  not_measured: "neutral",
  not_started: "neutral",
  in_progress: "neutral",
  on_track: "success",
  ahead: "success",
  needs_attention: "warning",
  achieved: "success",
  overdue: "danger",
  stale: "neutral",
};

export function goalProgressMeterStatus(
  status: GoalProgressStatus,
): MeterStatus {
  return GOAL_PROGRESS_METER_STATUSES[status];
}

/** Statuses worth surfacing on Today. Deliberately short and explicable. */
export function goalNeedsAttention(status: GoalProgressStatus): boolean {
  return status === "needs_attention" || status === "overdue";
}

/**
 * Statuses that genuinely mean "on track", for counting.
 *
 * NOT the inverse of {@link goalNeedsAttention}. The evaluator has nine states
 * and only two of them need attention, so `!goalNeedsAttention(…)` also sweeps
 * in `not_measured` (never told how to measure), `not_started` (nothing recorded
 * yet), `in_progress` (moving, but with no target date to be on track AGAINST)
 * and `stale` (nothing recorded for a month). Counting those as on track is how
 * a figure reads "4 of 4" for a set of Goals that are mostly not being measured
 * at all — the most flattering possible reading of the data and the least true.
 *
 * The three here are the ones with a real, positive answer: level with the line,
 * ahead of it, or already there. `achieved` counts because Today excludes
 * completed Goals, so an achieved-but-still-open Goal is a Goal going well.
 */
export function goalIsOnTrack(status: GoalProgressStatus): boolean {
  return status === "on_track" || status === "ahead" || status === "achieved";
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

/**
 * VIS-01 — the TARGET alone, for a surface that has already printed the current
 * value immediately above it.
 *
 * Labelling `79.3 kg` with `79.3 kg → 70 kg` says the current value twice and
 * makes the label the longer of the two strings — exactly the metadata density
 * the convergence pass reduced. Today uses this; the gallery card uses
 * `goalJourneyLabel` instead, which states the START rather than repeating the
 * reading (UIX-03).
 *
 * `null` for a milestone Goal (whose reading is already `2 / 4`) and for a
 * manual one (whose target is the number 100, which is not a target anyone set).
 */
export function goalTargetLabel(
  progress: GoalProgressEvaluation,
): string | null {
  if (!progress.measured) return null;
  if (progress.type === "milestone" || progress.type === "manual") return null;
  if (progress.target === null) return null;
  return `Target ${formatMeasurementValue(progress.target, progress.unit)}`;
}

/**
 * UIX-03 — the JOURNEY, as one line: "from 85 kg → 70 kg".
 *
 * The single most useful sentence a Goal card can carry, and the one the old
 * card had nowhere to put. A percentage is only checkable if the reader knows
 * where the journey started: "38%" beside "79.3 kg" is a claim, and "38%"
 * beside "79.3 kg, from 85 kg → 70 kg" is arithmetic anyone can verify.
 *
 * Three shapes, because three kinds of Goal read differently in English:
 *   - `target_value` — "from 85 kg → 70 kg", the full journey;
 *   - `accumulation` — "of 12 books", because counting up from nothing has no
 *     interesting start and "from 0 books → 12 books" is a worse sentence;
 *   - `milestone`/`manual` — `null`. A milestone Goal's reading is already
 *     "2 of 5", and a manual one's target is the number 100, which nobody set.
 *
 * `null` whenever the target is unknown: a Goal that has been told HOW it is
 * measured but not WHAT success is has no journey to state yet.
 */
export function goalJourneyLabel(
  progress: GoalProgressEvaluation,
): string | null {
  if (!progress.measured || progress.target === null) return null;
  if (progress.type === "milestone" || progress.type === "manual") return null;
  const target = formatMeasurementValue(progress.target, progress.unit);
  if (progress.type === "accumulation") return `of ${target}`;
  if (progress.baseline === null) return `Target ${target}`;
  return `from ${formatMeasurementValue(progress.baseline, progress.unit)} → ${target}`;
}

/**
 * What is left, as a phrase for a card's state line: "9.3 kg to go".
 *
 * `null` once the target is reached, because "0 kg to go" is a worse sentence
 * than the "Target achieved" the status already says — and null whenever the
 * distance is unknown, rather than a zero standing in for an absence.
 */
/**
 * REDESIGN-04 — the honest value at the end of a Goal ROW.
 *
 * `mockup3.png` ends each row of its Goals list with the Goal's own arithmetic,
 * in the Goal's own terms: `60.0 / 70 kg`, `12 / 24`, `75% complete`. Three
 * different strings, because those are three genuinely different kinds of Goal,
 * and flattening them all to a percentage would throw away the only number the
 * owner actually thinks in.
 *
 * The rules, in the order they apply:
 *
 *   - a **numeric** Goal with a current reading and a target reads
 *     `60.0 / 70 kg` — value, target, unit, once;
 *   - a **milestone** Goal reads `12 / 24`, its own count of stages;
 *   - anything else that has a percentage reads `75% complete`;
 *   - a Goal with a configuration but no reading yet, and a Goal with no
 *     measurement configuration at all, return `null`. Neither has a value, and
 *     `0%` would be a claim about progress rather than a statement of absence —
 *     the row draws no bar and no figure, and the surface says why once.
 *
 * Every number here comes from the kernel evaluator that produced `progress`;
 * this function only chooses which of them to show and formats it with the same
 * `formatMeasurementValue` every other Goal surface uses.
 */
export function goalRowValue(progress: GoalProgressEvaluation): string | null {
  if (!progress.measured) return null;
  if (progress.current === null) return null;
  if (progress.type === "milestone") {
    const total = progress.target ?? 0;
    return total > 0 ? `${progress.current} / ${total}` : null;
  }
  if (progress.target !== null) {
    // The unit is stated once, on the target, exactly as the reference draws
    // it — "60.0 / 70 kg", never "60.0 kg / 70 kg".
    const current = formatMeasurementNumber(progress.current);
    const target = formatMeasurementValue(progress.target, progress.unit);
    return `${current} / ${target}`;
  }
  if (progress.progressPercent !== null) {
    return `${progress.progressPercent}% complete`;
  }
  return formatMeasurementValue(progress.current, progress.unit);
}

export function goalRemainingLabel(
  progress: GoalProgressEvaluation,
): string | null {
  if (!progress.measured || progress.achieved) return null;
  if (progress.remaining === null || progress.remaining <= 0) return null;
  if (progress.type === "milestone") {
    const left = (progress.target ?? 0) - (progress.current ?? 0);
    return left > 0 ? `${left} to go` : null;
  }
  return `${formatMeasurementValue(progress.remaining, progress.unit)} to go`;
}

/**
 * "113% of target" — stated ONLY when the target was genuinely passed.
 *
 * The progress bar caps at 100% because a bar cannot honestly draw more, so
 * this is where the extra goes. It reads from the UNCLAMPED fraction, which is
 * the reason the evaluator keeps one.
 */
export function goalOverTargetLabel(
  progress: GoalProgressEvaluation,
): string | null {
  if (!progress.measured || progress.progressFraction === null) return null;
  if (progress.progressFraction <= 1.005) return null;
  return `${Math.round(progress.progressFraction * 100)}% of target`;
}

/**
 * The honest sentence for a Goal with no reading to show, and the reason.
 *
 * Three distinct absences, deliberately worded as three different states rather
 * than collapsed into one "no data": a Goal nobody has told DalyHub how to
 * measure is not the same as one configured this morning with nothing logged
 * yet, and neither is a failure.
 */
export function goalAbsenceNote(
  progress: GoalProgressEvaluation,
): string | null {
  if (!progress.measured) return "Not measured";
  if (progress.type === "milestone" && (progress.target ?? 0) <= 0) {
    return "No stages yet";
  }
  if (progress.current === null) return "No measurement recorded yet";
  return null;
}

/* -------------------------------------------------------------------------- */
/* Collection views                                                            */
/* -------------------------------------------------------------------------- */

/**
 * UIX-03 — the Goals collection's status VIEWS.
 *
 * Every one is a partition of statuses the evaluator already produces, so the
 * filter can never disagree with the word printed on the card, and no status
 * was invented to populate a tab. "Attention" deliberately pairs
 * `needs_attention` with `overdue`: both mean the Goal is behind something the
 * owner themselves set, which is one question, not two.
 *
 * `completed` is the SPINE's explicit completion, never the derived "target
 * achieved" — a Goal whose reading has passed its target is not finished until
 * the owner says so, and conflating the two is exactly the semantics §30 warns
 * against. It is therefore resolved by the caller from `completedAt`, not here.
 */
export const GOAL_COLLECTION_VIEWS = [
  "all",
  "on_track",
  "attention",
  "completed",
] as const;

export type GoalCollectionView = (typeof GOAL_COLLECTION_VIEWS)[number];

export const GOAL_COLLECTION_VIEW_LABELS: Readonly<
  Record<GoalCollectionView, string>
> = {
  all: "All",
  on_track: "On track",
  attention: "Needs attention",
  completed: "Completed",
};

export function parseGoalCollectionView(
  value: string | null,
): GoalCollectionView {
  return value !== null &&
    (GOAL_COLLECTION_VIEWS as readonly string[]).includes(value)
    ? (value as GoalCollectionView)
    : "all";
}

/**
 * Does this Goal belong in the given view?
 *
 * `completed` is asked FIRST and answered from explicit completion alone, so a
 * finished Goal appears once — in "Completed" — rather than also under whatever
 * its last reading implied.
 */
export function goalMatchesCollectionView(
  view: GoalCollectionView,
  goal: {
    readonly completed: boolean;
    readonly status: GoalProgressStatus;
  },
): boolean {
  if (view === "completed") return goal.completed;
  if (goal.completed) return view === "all";
  switch (view) {
    case "on_track":
      return goal.status === "on_track" || goal.status === "ahead";
    case "attention":
      return goal.status === "needs_attention" || goal.status === "overdue";
    default:
      return true;
  }
}

/**
 * The chart's required text equivalent, stating direction and span in words.
 *
 * UIX-03 takes an optional date formatter. This sentence is rendered VISIBLY
 * beneath the chart as well as being its accessible label, and it was the one
 * place on the Goal record printing raw `2026-06-10` ISO dates beside a page
 * that says "10 Jun 2026" everywhere else. The formatter is injected rather than
 * imported so this module stays free of the date package (and of a dependency on
 * the Tasks view-model), which is the same reason `evaluateGoalProgress` takes
 * the owner's today as an argument.
 */
export function goalTrendSummaryText(
  progress: GoalProgressEvaluation,
  points: readonly { readonly value: number; readonly measuredOn: string }[],
  formatDate: (iso: string) => string = (iso) => iso,
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
  )} on ${formatDate(first.measuredOn)} to ${formatMeasurementValue(
    last.value,
    progress.unit,
  )} on ${formatDate(last.measuredOn)} — ${movement}.`;
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
