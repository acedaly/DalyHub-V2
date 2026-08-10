/**
 * GOAL-02 Goals kernel — the pure Goal PROGRESS evaluator.
 *
 * One place that turns a Goal's measurement configuration and its recorded
 * readings into every derived figure the product shows: where the owner started,
 * where they are, what remains, how fast they are moving, whether that pace
 * reaches the target by the date they chose, and one word for how it is going.
 *
 * It is entirely React-free, storage-free and clock-free — the owner's calendar
 * "today" is an ARGUMENT (AUDIT-14), never `new Date()` — so it can be unit-tested
 * with hand-built facts, exactly like `evaluateGoalProjectContribution` and
 * `evaluateProjectHealth` beside it. No route, component or repository is allowed
 * to compute any of this itself; if a surface needs a new figure, it is added
 * here and tested here.
 *
 * ── The one formula ─────────────────────────────────────────────────────────
 * All four measurement strategies reduce to (baseline, current, target), so the
 * fraction is always
 *
 *     progress = (current - baseline) / (target - baseline)
 *
 * which is the roadmap's decreasing form as well as its increasing one: for
 * 85 → 79 → 70 that is (79 - 85) / (70 - 85) = 0.4, i.e. 40%. Direction never
 * appears in the arithmetic — it decides WORDING (and how "achieved" reads), not
 * maths. That is deliberate: a second, mirrored formula is a second place for a
 * sign error to live.
 *
 * ── What it refuses to fake ─────────────────────────────────────────────────
 * The evaluator returns `null` rather than a plausible number whenever the data
 * cannot support one: no target, an equal baseline and target, one lone reading,
 * a projection further out than five years, a required pace for a date already
 * past. A `null` here becomes an honest sentence on screen ("More measurements
 * needed for a trend"), which is the product's rule about fabricated precision
 * (PRODUCT_PRINCIPLES) applied to arithmetic. Nothing it returns can be `NaN` or
 * `Infinity`.
 */

import {
  goalMeasurementAcceptsReadings,
  isGoalMeasurementConfigured,
  type GoalMeasurementConfig,
  type GoalMeasurementDirection,
  type GoalMeasurementPoint,
  type GoalMeasurementType,
} from "./goal-measurement";

/* -------------------------------------------------------------------------- */
/* Tuning constants — every one of them documented, none of them magic          */
/* -------------------------------------------------------------------------- */

/**
 * The recent-pace window, in days.
 *
 * Four weeks: long enough that a single unusual reading cannot dominate the
 * gradient, short enough that "recent" still means recent. The window is measured
 * back from the LATEST reading rather than from today, so a Goal that has not
 * been updated for a fortnight reports the pace it actually had instead of a pace
 * diluted towards zero by silence — and `daysSinceLastMeasurement` is reported
 * separately so the silence is never hidden.
 */
export const GOAL_TREND_WINDOW_DAYS = 28;

/**
 * The shortest span a stated pace may be derived from.
 *
 * One week. Two readings a day apart can imply "-2.1 kg/week" and a target date
 * in a fortnight; that is the ridiculous long-term projection from a very short
 * interval the brief warns about. Below this span the evaluator says it does not
 * know yet.
 */
export const GOAL_TREND_MIN_SPAN_DAYS = 7;

/**
 * How long a measurable Goal may go without a reading before the product says so.
 *
 * A month. Shorter would nag a quarterly savings goal; much longer and "no recent
 * update" stops being information. The wording stays "No recent update" — a
 * statement, never a reprimand (AGENTS.md §2: calm over urgent).
 */
export const GOAL_STALE_AFTER_DAYS = 30;

/**
 * How far ahead of (or behind) the straight-line schedule a Goal must be before
 * the status changes. Ten percentage points of the whole journey — wide enough
 * that ordinary lumpy progress does not flip the word every check-in.
 */
export const GOAL_SCHEDULE_MARGIN = 0.1;

/** The furthest out a projected completion date will be stated. Beyond five
 * years the projection is arithmetic, not information. */
export const GOAL_MAX_PROJECTION_DAYS = 365 * 5;

/* -------------------------------------------------------------------------- */
/* Shapes                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The complete, storage-independent fact set for one Goal.
 *
 * Assembled by the caller from the Goal-owned configuration, its measurement
 * summary/history and (for milestone Goals) its stage weights. Everything the
 * evaluator needs is here; it reads nothing else.
 */
export type GoalProgressFacts = {
  readonly config: GoalMeasurementConfig;
  /** The Goal's owner-calendar target date (`goal_details.target_date`). */
  readonly targetDate: string | null;
  /**
   * Recorded readings. Order is not trusted — the evaluator sorts, because
   * historical readings are routinely entered out of chronological order.
   */
  readonly measurements: readonly GoalMeasurementPoint[];
  /** Milestone weights, for `milestone` Goals. Ignored by every other type. */
  readonly milestones?: {
    readonly total: number;
    readonly completed: number;
    readonly totalWeight: number;
    readonly completedWeight: number;
  };
  /**
   * When the owner started, as an owner-calendar date — the Goal's creation day.
   * Used ONLY as the schedule's origin when there is no earlier reading, so
   * "on track" compares against a real elapsed fraction rather than an assumed one.
   */
  readonly startedOn?: string | null;
  /** The Goal's explicit completion, which always outranks a derived figure. */
  readonly completed?: boolean;
};

export type GoalProgressContext = {
  /** The owner's calendar date, `YYYY-MM-DD`, resolved server-side. */
  readonly todayIso: string;
};

/**
 * The human states a measurable Goal can be in.
 *
 * Every one is either a fact ("Target achieved", "Overdue") or a defensible
 * comparison against the owner's own schedule. There is no "Failing" and no
 * red-flag vocabulary: "Needs attention" is the strongest thing the product says
 * about a person's own life.
 */
export type GoalProgressStatus =
  /** No measurement configured — this Goal has not been told how to measure. */
  | "not_measured"
  /** Configured, but nothing recorded yet. */
  | "not_started"
  /** Moving, with no target date to compare against. */
  | "in_progress"
  /** Broadly level with the straight line to the target date. */
  | "on_track"
  /** Comfortably ahead of that line. */
  | "ahead"
  /** Behind the line, or moving away from the target. */
  | "needs_attention"
  /** The target value has been reached or passed. */
  | "achieved"
  /** The target date has passed and the target has not been reached. */
  | "overdue"
  /** Nothing recorded for a month — the trend is stale, not bad. */
  | "stale";

/** Which way the most recent stretch of readings moved, relative to the target. */
export type GoalTrendDirection = "improving" | "steady" | "regressing";

/** The stated pace, and exactly what it was derived from. */
export type GoalProgressTrend = {
  /**
   * `recent` — first and last reading inside {@link GOAL_TREND_WINDOW_DAYS}.
   * `overall` — the window held too little to state a pace, so the whole history
   * was used instead. Surfaces word these differently ("Recent pace" vs "Average
   * pace") so a figure never claims to be more current than it is.
   */
  readonly basis: "recent" | "overall";
  /** Change per week, signed in the measurement's own unit. */
  readonly changePerWeek: number;
  /** The change across the span the pace was measured over. */
  readonly change: number;
  readonly spanDays: number;
  readonly measurementsUsed: number;
  readonly fromDate: string;
  readonly toDate: string;
  readonly direction: GoalTrendDirection;
};

export type GoalProgressEvaluation = {
  /** False when the Goal has no measurement configuration at all. */
  readonly measured: boolean;
  readonly type: GoalMeasurementType | null;
  readonly unit: string | null;
  readonly direction: GoalMeasurementDirection | null;
  /** Where the owner started: the configured baseline, else the first reading. */
  readonly baseline: number | null;
  /** Where they are now: the latest reading (or completed milestone weight). */
  readonly current: number | null;
  readonly target: number | null;
  readonly targetDate: string | null;
  /** True fraction — NOT clamped. `1.2` genuinely means the target was passed. */
  readonly progressFraction: number | null;
  /** The same figure as a 0–100 integer, clamped, for indicators and copy. */
  readonly progressPercent: number | null;
  /** How much is left, as a non-negative magnitude. `0` once achieved. */
  readonly remaining: number | null;
  /** Signed movement from the baseline (negative when the value came down). */
  readonly totalChange: number | null;
  readonly achieved: boolean;
  readonly status: GoalProgressStatus;
  readonly trend: GoalProgressTrend | null;
  /** Change per week needed from today to hit the target by the target date. */
  readonly requiredChangePerWeek: number | null;
  /** Where the recent pace lands, when that is a meaningful thing to say. */
  readonly projectedCompletionDate: string | null;
  readonly measurementCount: number;
  readonly latestMeasuredOn: string | null;
  readonly daysSinceLastMeasurement: number | null;
};

/** The exact evaluation for a Goal DalyHub has not been told how to measure. */
export const UNMEASURED_GOAL_PROGRESS: GoalProgressEvaluation = {
  measured: false,
  type: null,
  unit: null,
  direction: null,
  baseline: null,
  current: null,
  target: null,
  targetDate: null,
  progressFraction: null,
  progressPercent: null,
  remaining: null,
  totalChange: null,
  achieved: false,
  status: "not_measured",
  trend: null,
  requiredChangePerWeek: null,
  projectedCompletionDate: null,
  measurementCount: 0,
  latestMeasuredOn: null,
  daysSinceLastMeasurement: null,
};

/* -------------------------------------------------------------------------- */
/* Date-only arithmetic                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Owner-calendar dates as integers, so day arithmetic never touches a timezone.
 *
 * `Date.UTC` here is component arithmetic on a `YYYY-MM-DD`, not a reading of an
 * instant — the same dependency-free approach `goal-details.ts` takes to avoid
 * importing the UI date package into the kernel.
 */
const MS_PER_DAY = 86_400_000;

function dayNumber(iso: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isFinite(ms) ? Math.round(ms / MS_PER_DAY) : null;
}

function isoFromDayNumber(day: number): string {
  const date = new Date(day * MS_PER_DAY);
  return date.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function goalDaysBetween(from: string, to: string): number | null {
  const a = dayNumber(from);
  const b = dayNumber(to);
  if (a === null || b === null) return null;
  return b - a;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Guard every returned figure: a non-finite number never leaves this module. */
function finite(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

/** Chronological order, with a stable tiebreak so equal dates never reorder. */
function sortedAscending(
  points: readonly GoalMeasurementPoint[],
): readonly GoalMeasurementPoint[] {
  return [...points]
    .filter(
      (point) =>
        Number.isFinite(point.value) && dayNumber(point.measuredOn) !== null,
    )
    .map((point, index) => ({ point, index }))
    .sort((a, b) =>
      a.point.measuredOn === b.point.measuredOn
        ? a.index - b.index
        : a.point.measuredOn < b.point.measuredOn
          ? -1
          : 1,
    )
    .map((entry) => entry.point);
}

/**
 * Has the target been reached?
 *
 * Compared in the measurement's own direction rather than through the fraction,
 * so a Goal whose baseline equals its target (nothing to traverse) still reports
 * "achieved" the moment the value is right — the fraction is undefined there, and
 * an undefined fraction must not be able to hide a finished Goal.
 */
function isAchieved(
  current: number | null,
  target: number | null,
  direction: GoalMeasurementDirection,
): boolean {
  if (current === null || target === null) return false;
  return direction === "decrease" ? current <= target : current >= target;
}

/* -------------------------------------------------------------------------- */
/* The evaluator                                                               */
/* -------------------------------------------------------------------------- */

export function evaluateGoalProgress(
  facts: GoalProgressFacts,
  context: GoalProgressContext,
): GoalProgressEvaluation {
  const { config } = facts;
  if (config.type === null) {
    return { ...UNMEASURED_GOAL_PROGRESS, targetDate: facts.targetDate };
  }

  const direction: GoalMeasurementDirection = config.direction ?? "increase";
  const points = goalMeasurementAcceptsReadings(config.type)
    ? sortedAscending(facts.measurements)
    : [];
  const latest = points.length > 0 ? points[points.length - 1]! : null;
  const earliest = points.length > 0 ? points[0]! : null;

  /*
   * A milestone Goal's numbers come from its stages, never from a stored copy of
   * them: `current` is the completed weight and `target` the total weight, so
   * ticking a stage moves the bar with no second write to keep in step. Equal
   * weighting is simply every weight being 1, which is why there is no separate
   * "weighted" mode to choose.
   */
  const milestoneBased = config.type === "milestone";
  const milestones = facts.milestones;

  const baseline = milestoneBased
    ? 0
    : (config.baselineValue ?? earliest?.value ?? null);

  const target = milestoneBased
    ? (milestones?.totalWeight ?? 0) > 0
      ? milestones!.totalWeight
      : null
    : config.targetValue;

  /*
   * "Where am I now?" is answered by the latest READING, and by nothing else.
   *
   * It deliberately does NOT fall back to the baseline. A Goal configured from
   * 85 kg with nothing logged is not "currently 85 kg and 0% of the way" — it is
   * a Goal whose current value nobody has recorded, and saying so is what stops
   * every surface drawing an empty 0% bar for a journey that has not started.
   * The baseline is still reported separately, so the page can say where the
   * owner began.
   */
  const current = milestoneBased
    ? (milestones?.completedWeight ?? 0)
    : (latest?.value ?? null);

  const achieved =
    facts.completed === true || isAchieved(current, target, direction);

  /*
   * The fraction. A zero denominator (baseline === target) is not 0% and not
   * 100% — it is a journey with no distance, so the honest answer is "there is no
   * fraction here", and `achieved` above already covers the case where the value
   * is nonetheless correct.
   */
  let progressFraction: number | null = null;
  if (baseline !== null && current !== null && target !== null) {
    const span = target - baseline;
    progressFraction = span === 0 ? null : finite((current - baseline) / span);
  }

  const progressPercent =
    progressFraction === null
      ? achieved
        ? 100
        : null
      : Math.round(Math.min(1, Math.max(0, progressFraction)) * 100);

  /*
   * "9.0 kg remaining" is a distance, so it is a MAGNITUDE and it is zero once
   * the target is passed — an owner who is 1 kg under target has nothing
   * remaining, not "-1 kg remaining". The signed movement lives in `totalChange`.
   */
  const remaining =
    current === null || target === null
      ? null
      : achieved
        ? 0
        : finite(Math.abs(target - current));

  const totalChange =
    baseline === null || current === null ? null : finite(current - baseline);

  const daysSinceLastMeasurement =
    latest === null
      ? null
      : goalDaysBetween(latest.measuredOn, context.todayIso);

  const trend = evaluateTrend(points, direction);
  const requiredChangePerWeek = evaluateRequiredPace(
    current,
    target,
    facts.targetDate,
    context.todayIso,
    achieved,
  );
  const projectedCompletionDate = evaluateProjection(
    trend,
    current,
    target,
    achieved,
    context.todayIso,
  );

  const status = evaluateStatus({
    config,
    achieved,
    hasReading: milestoneBased
      ? (milestones?.completed ?? 0) > 0
      : latest !== null,
    progressFraction,
    targetDate: facts.targetDate,
    todayIso: context.todayIso,
    startedOn: facts.startedOn ?? earliest?.measuredOn ?? null,
    daysSinceLastMeasurement,
    acceptsReadings: goalMeasurementAcceptsReadings(config.type),
  });

  return {
    measured: true,
    type: config.type,
    unit: config.unit,
    direction,
    baseline,
    current,
    target,
    targetDate: facts.targetDate,
    progressFraction,
    progressPercent,
    remaining,
    totalChange,
    achieved,
    status,
    trend,
    requiredChangePerWeek,
    projectedCompletionDate,
    measurementCount: milestoneBased ? (milestones?.total ?? 0) : points.length,
    latestMeasuredOn: latest?.measuredOn ?? null,
    daysSinceLastMeasurement,
  };
}

/* -------------------------------------------------------------------------- */
/* Trend                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The recent pace, or an honest `null`.
 *
 * The calculation is deliberately the simplest defensible one — the gradient
 * between the first and last reading of a window — rather than a regression. Two
 * points and a span is something an owner can check by hand; a fitted line is
 * something they have to trust. The brief asks for understandable calculations
 * over sophisticated prediction, and this is that choice made explicit.
 */
function evaluateTrend(
  points: readonly GoalMeasurementPoint[],
  direction: GoalMeasurementDirection,
): GoalProgressTrend | null {
  if (points.length < 2) return null;
  const latest = points[points.length - 1]!;
  const latestDay = dayNumber(latest.measuredOn);
  if (latestDay === null) return null;

  const windowStart = latestDay - GOAL_TREND_WINDOW_DAYS;
  const inWindow = points.filter((point) => {
    const day = dayNumber(point.measuredOn);
    return day !== null && day >= windowStart;
  });

  const build = (
    subset: readonly GoalMeasurementPoint[],
    basis: "recent" | "overall",
  ): GoalProgressTrend | null => {
    if (subset.length < 2) return null;
    const from = subset[0]!;
    const to = subset[subset.length - 1]!;
    const spanDays = goalDaysBetween(from.measuredOn, to.measuredOn);
    if (spanDays === null || spanDays < GOAL_TREND_MIN_SPAN_DAYS) return null;
    const change = finite(to.value - from.value);
    if (change === null) return null;
    const changePerWeek = finite((change / spanDays) * 7);
    if (changePerWeek === null) return null;
    // "Improving" means moving TOWARDS the target, which is downwards for a
    // decreasing Goal. The word is never derived from the sign alone.
    const towardsTarget = direction === "decrease" ? -change : change;
    return {
      basis,
      changePerWeek,
      change,
      spanDays,
      measurementsUsed: subset.length,
      fromDate: from.measuredOn,
      toDate: to.measuredOn,
      direction:
        towardsTarget > 0
          ? "improving"
          : towardsTarget < 0
            ? "regressing"
            : "steady",
    };
  };

  // The window first; the whole history only when the window cannot support a
  // pace, and labelled as such so the surface can say "Average" instead of
  // "Recent".
  return build(inWindow, "recent") ?? build(points, "overall");
}

/**
 * The pace the owner would have to hold from TODAY to reach the target on time.
 *
 * Signed in the measurement's own unit, so a weight goal reads "-0.39 kg/week".
 * `null` when there is no target date, no target, no current value, or the date
 * has already passed — a required pace for a deadline in the past is not a plan.
 *
 * UIX-03 — and `null` once the target has been REACHED. The arithmetic happily
 * continues past the target and produces a figure with the sign reversed: a
 * 1,130 km reading against a 1,000 km target reported "Required pace
 * −22.75 km/week", which reads as an instruction to walk backwards. There is no
 * pace required to reach something already reached, and the evaluator's rule is
 * to return nothing rather than something plausible.
 */
function evaluateRequiredPace(
  current: number | null,
  target: number | null,
  targetDate: string | null,
  todayIso: string,
  achieved: boolean,
): number | null {
  if (achieved) return null;
  if (current === null || target === null || targetDate === null) return null;
  const daysRemaining = goalDaysBetween(todayIso, targetDate);
  if (daysRemaining === null || daysRemaining <= 0) return null;
  return finite(((target - current) / daysRemaining) * 7);
}

/**
 * Where the recent pace lands, when saying so is meaningful.
 *
 * Refused whenever it would be theatre: already achieved, no pace, a pace of
 * zero, a pace pointing away from the target, or an answer further out than
 * {@link GOAL_MAX_PROJECTION_DAYS}. "We don't know yet" is a better answer than
 * "November 2031".
 */
function evaluateProjection(
  trend: GoalProgressTrend | null,
  current: number | null,
  target: number | null,
  achieved: boolean,
  todayIso: string,
): string | null {
  if (achieved || trend === null || current === null || target === null) {
    return null;
  }
  const perDay = trend.changePerWeek / 7;
  const needed = target - current;
  if (perDay === 0 || needed === 0) return null;
  if (Math.sign(perDay) !== Math.sign(needed)) return null;
  const days = needed / perDay;
  if (!Number.isFinite(days) || days <= 0 || days > GOAL_MAX_PROJECTION_DAYS) {
    return null;
  }
  const today = dayNumber(todayIso);
  if (today === null) return null;
  return isoFromDayNumber(today + Math.ceil(days));
}

/* -------------------------------------------------------------------------- */
/* Status                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * One word for how it is going, from defensible rules in a fixed precedence.
 *
 * The order is the argument. A finished Goal is finished whatever its dates say;
 * a Goal with nothing recorded has not started, whatever its target date says; a
 * missed target date is a fact and outranks any pace comparison; and a Goal
 * nobody has measured for a month gets "No recent update" rather than a judgement
 * derived from data that stopped.
 *
 * "On track" compares the fraction achieved against the fraction of the SCHEDULE
 * elapsed — the straight line from the first reading (or the Goal's creation) to
 * the target date. That is the simplest rule an owner can verify, and the margin
 * is wide (`GOAL_SCHEDULE_MARGIN`) so ordinary lumpy progress does not flip the
 * word on every check-in.
 */
function evaluateStatus(input: {
  readonly config: GoalMeasurementConfig;
  readonly achieved: boolean;
  readonly hasReading: boolean;
  readonly progressFraction: number | null;
  readonly targetDate: string | null;
  readonly todayIso: string;
  readonly startedOn: string | null;
  readonly daysSinceLastMeasurement: number | null;
  readonly acceptsReadings: boolean;
}): GoalProgressStatus {
  if (input.achieved) return "achieved";
  if (!input.hasReading) return "not_started";

  const overdue =
    input.targetDate !== null &&
    (goalDaysBetween(input.todayIso, input.targetDate) ?? 0) < 0;
  if (overdue) return "overdue";

  if (
    input.acceptsReadings &&
    input.daysSinceLastMeasurement !== null &&
    input.daysSinceLastMeasurement > GOAL_STALE_AFTER_DAYS
  ) {
    return "stale";
  }

  // Moving away from where they started, in the direction that matters.
  if (input.progressFraction !== null && input.progressFraction < 0) {
    return "needs_attention";
  }

  if (
    input.targetDate === null ||
    input.startedOn === null ||
    input.progressFraction === null ||
    !isGoalMeasurementConfigured(input.config)
  ) {
    return "in_progress";
  }

  const totalDays = goalDaysBetween(input.startedOn, input.targetDate);
  const elapsedDays = goalDaysBetween(input.startedOn, input.todayIso);
  if (totalDays === null || elapsedDays === null || totalDays <= 0) {
    return "in_progress";
  }
  const expected = Math.min(1, Math.max(0, elapsedDays / totalDays));
  if (input.progressFraction >= expected + GOAL_SCHEDULE_MARGIN) return "ahead";
  if (input.progressFraction >= expected - GOAL_SCHEDULE_MARGIN) {
    return "on_track";
  }
  return "needs_attention";
}
