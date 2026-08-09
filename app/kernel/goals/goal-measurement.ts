/**
 * GOAL-02 Goals kernel — the measurable-Goal domain.
 *
 * The product principle this file encodes: **Goals describe measurable outcomes;
 * Projects and Tasks are the work used to achieve them.** A Goal that says
 * "Reach 70 kg" should be able to answer where the owner started, where they are
 * now, what the target is, how far they have come and whether they are moving in
 * the right direction — and it should answer from RECORDED MEASUREMENTS, never
 * from a percentage somebody typed into a box.
 *
 * ── The measurement model ────────────────────────────────────────────────────
 * Four strategies, one shape. Every one of them reduces to a baseline, a current
 * value, a target and a direction, which is what lets a single pure evaluator
 * (`goal-progress-evaluator.ts`) serve all four without a branch per type:
 *
 *   `target_value`   move from a starting value towards a numeric target.
 *                    Baseline and target are both the owner's; the direction is
 *                    INFERRED from them (85 → 70 decreases; 5,000 → 20,000
 *                    increases). The owner never picks "ascending".
 *   `accumulation`   work towards a total (24 books, 12 modules). The baseline is
 *                    0 and the direction is always an increase — this is
 *                    `target_value`'s degenerate case, given its own name because
 *                    "11 / 24 books" is a different sentence from "11 kg of the
 *                    way from 85 to 70".
 *   `milestone`      progress derives from completed stages, weighted (default 1
 *                    each — equal weighting unless the owner says otherwise).
 *                    Current is the completed weight, target the total weight.
 *   `manual`         the owner states a percentage. Retained as an HONEST
 *                    fallback for outcomes that genuinely cannot be measured, and
 *                    deliberately not the recommended default. Current is the
 *                    percentage, baseline 0, target 100.
 *
 * A Goal with NO measurement type is not "0% done" — it is a Goal DalyHub has not
 * been told how to measure, and every surface says so rather than drawing an
 * empty bar. That is the same honesty rule `goalContributionProgress` already
 * applies to a Goal with no contributing Projects.
 *
 * ── Storage-independent and React-free ───────────────────────────────────────
 * Types, the controlled enums, the validators and the unit catalogue only. No
 * SQL, no components, no clock: everything here can be unit-tested with hand-built
 * values, mirroring `goal-details.ts`.
 */

import type { WorkspaceId } from "~/kernel/workspaces";

/* -------------------------------------------------------------------------- */
/* Activity                                                                    */
/* -------------------------------------------------------------------------- */

/** A measurement was recorded against a Goal. The meaningful progress event. */
export const GOAL_MEASUREMENT_LOGGED = "goal.measurement_logged";
/** An existing measurement's value, date or note was corrected. */
export const GOAL_MEASUREMENT_CORRECTED = "goal.measurement_corrected";
/** A measurement was removed. */
export const GOAL_MEASUREMENT_REMOVED = "goal.measurement_removed";
/**
 * A logged measurement reached (or passed) the Goal's target for the first time.
 *
 * Appended by the SAME atomic write as the measurement that caused it, and only
 * on the transition — a second reading past the target is still just a
 * measurement. A recalculated percentage is never an event (AGENTS.md §9.6: the
 * Activity stream records what CHANGED, and a derivation changing is not a
 * change to the record).
 */
export const GOAL_TARGET_REACHED = "goal.target_reached";
/** A defined stage of a milestone-measured Goal was completed. */
export const GOAL_MILESTONE_COMPLETED = "goal.milestone_completed";
/** A completed stage was reopened. */
export const GOAL_MILESTONE_REOPENED = "goal.milestone_reopened";

/* -------------------------------------------------------------------------- */
/* The controlled domain                                                       */
/* -------------------------------------------------------------------------- */

/** The measurement strategies a Goal can use. Order is the presentation order. */
export const GOAL_MEASUREMENT_TYPES = [
  "target_value",
  "accumulation",
  "milestone",
  "manual",
] as const;

export type GoalMeasurementType = (typeof GOAL_MEASUREMENT_TYPES)[number];

/**
 * Which way "better" points. Derived from baseline and target for
 * `target_value`, and fixed for the other three — the owner is never asked to
 * choose a mathematical direction, only to say where they started and where they
 * are going.
 */
export const GOAL_MEASUREMENT_DIRECTIONS = ["increase", "decrease"] as const;

export type GoalMeasurementDirection =
  (typeof GOAL_MEASUREMENT_DIRECTIONS)[number];

/** The owner-facing name of each strategy — one vocabulary, used everywhere. */
export const GOAL_MEASUREMENT_TYPE_LABELS: Readonly<
  Record<GoalMeasurementType, string>
> = {
  target_value: "Target value",
  accumulation: "Count",
  milestone: "Milestones",
  manual: "Manual progress",
};

/** The one-line description each choice carries in the creation flow. */
export const GOAL_MEASUREMENT_TYPE_DESCRIPTIONS: Readonly<
  Record<GoalMeasurementType, string>
> = {
  target_value: "Track movement from a starting value towards a target.",
  accumulation: "Work towards a total number.",
  milestone: "Complete defined stages.",
  manual: "Set progress yourself.",
};

/**
 * Parse a stored/submitted measurement type.
 *
 * Returns `null` for anything unrecognised rather than throwing, because this is
 * also the READ path: a value written by a future version of DalyHub must read
 * as "not measured" — an honest absence — instead of breaking the Goal record
 * (the same degradation rule 0032's icon keys established).
 */
export function parseGoalMeasurementType(
  value: unknown,
): GoalMeasurementType | null {
  return typeof value === "string" &&
    (GOAL_MEASUREMENT_TYPES as readonly string[]).includes(value)
    ? (value as GoalMeasurementType)
    : null;
}

export function parseGoalMeasurementDirection(
  value: unknown,
): GoalMeasurementDirection | null {
  return typeof value === "string" &&
    (GOAL_MEASUREMENT_DIRECTIONS as readonly string[]).includes(value)
    ? (value as GoalMeasurementDirection)
    : null;
}

/* -------------------------------------------------------------------------- */
/* Units                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The suggested units, as a starting point rather than a closed set.
 *
 * DalyHub stores and displays the unit VERBATIM and converts nothing: a Goal in
 * kg stays in kg, and there is no kg↔lb, km↔mi or currency conversion anywhere in
 * this feature. Conversion needs a rate, a source of truth for it and a policy
 * for historical values, none of which a personal goal tracker earns — so the
 * unit is a label, and the honest thing is to say so.
 *
 * A custom unit is any other short string the owner types.
 */
export const GOAL_MEASUREMENT_UNIT_SUGGESTIONS: readonly string[] = [
  "kg",
  "g",
  "km",
  "m",
  "minutes",
  "hours",
  "$",
  "%",
  "count",
  "books",
  "sessions",
  "modules",
];

/**
 * A unit is a LABEL, so it is bounded like one. Long enough for "kilometres per
 * week", short enough that it can never become prose that breaks a card.
 */
export const GOAL_MEASUREMENT_UNIT_MAX_LENGTH = 24;

/** A measurement's optional note — one line of context, not a document. */
export const GOAL_MEASUREMENT_NOTE_MAX_LENGTH = 200;

/** A milestone's title. Bounded like every other titled thing in the kernel. */
export const GOAL_MILESTONE_TITLE_MAX_LENGTH = 200;

/** The largest weight a single stage may carry. */
export const GOAL_MILESTONE_MAX_WEIGHT = 1000;

/**
 * The magnitude bound on any stored measurement, baseline or target.
 *
 * Not a domain opinion about how heavy a person may be — a guard that keeps every
 * derived figure inside the range JSON, SQLite REAL and the progress arithmetic
 * all handle exactly, so a pasted `1e308` can never produce an `Infinity` in a
 * subtraction and paint a broken bar.
 */
export const GOAL_MEASUREMENT_VALUE_LIMIT = 1_000_000_000_000;

/* -------------------------------------------------------------------------- */
/* Shapes                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A Goal's measurement CONFIGURATION — the Goal-owned detail slice that says how
 * this Goal is measured. Stored alongside `targetDate`/`definitionOfDone` on
 * `goal_details`, because it is detail state in exactly the same sense.
 *
 * `type === null` means "no measurement configured", which is the state every
 * Goal was in before GOAL-02 and remains the state of every Goal that has not
 * opted in. Every other field is meaningless in that state and is normalised to
 * `null` when the type is cleared.
 */
export type GoalMeasurementConfig = {
  readonly type: GoalMeasurementType | null;
  /** The display unit, verbatim. `null` for `manual`/`milestone`, and optional
   * for the other two — "12 / 24" is a legitimate reading. */
  readonly unit: string | null;
  /** Which way progress points. `null` only when `type` is `null`. */
  readonly direction: GoalMeasurementDirection | null;
  /** Where the owner started. `null` when unknown; `accumulation`/`manual`
   * normalise it to 0 and `milestone` ignores it. */
  readonly baselineValue: number | null;
  /** What the owner is aiming for. `null` when unset. */
  readonly targetValue: number | null;
};

/** The all-null configuration — a Goal DalyHub has not been told how to measure. */
export const UNMEASURED_GOAL: GoalMeasurementConfig = {
  type: null,
  unit: null,
  direction: null,
  baselineValue: null,
  targetValue: null,
};

/** One recorded measurement. The Goal's current value is the latest of these. */
export type GoalMeasurement = {
  readonly id: string;
  readonly workspaceId: WorkspaceId;
  readonly goalId: string;
  readonly value: number;
  /** The OWNER-CALENDAR date the reading belongs to, `YYYY-MM-DD`. */
  readonly measuredOn: string;
  readonly note: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type NewGoalMeasurementInput = {
  readonly value: number;
  readonly measuredOn: string;
  readonly note?: string | null;
};

/** A partial patch: an omitted key leaves that field unchanged. */
export type UpdateGoalMeasurementInput = {
  readonly value?: number;
  readonly measuredOn?: string;
  readonly note?: string | null;
};

/** One defined stage of a milestone-measured Goal. */
export type GoalMilestone = {
  readonly id: string;
  readonly workspaceId: WorkspaceId;
  readonly goalId: string;
  readonly title: string;
  /** >= 1. Defaults to 1, which is what makes equal weighting the default. */
  readonly weight: number;
  readonly position: number;
  readonly completedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type NewGoalMilestoneInput = {
  readonly title: string;
  readonly weight?: number;
};

export type UpdateGoalMilestoneInput = {
  readonly title?: string;
  readonly weight?: number;
  readonly completed?: boolean;
  readonly position?: number;
};

/**
 * The bounded per-Goal SUMMARY every collection surface reads.
 *
 * Today and the Goals gallery need the CURRENT value and enough history to say
 * "↓ 0.3 kg this week" — they do not need every reading a Goal has ever had.
 * Loading full history for a page of Goals would be the N+1 (in bytes rather than
 * queries) this shape exists to prevent: it is produced by ONE grouped query for
 * a whole page of ids (AGENTS.md §16).
 */
export type GoalMeasurementSummary = {
  readonly goalId: string;
  /** The latest reading, or `null` when nothing has been recorded. */
  readonly latest: GoalMeasurementPoint | null;
  /** The EARLIEST reading — the observed starting point when no explicit
   * baseline was configured. */
  readonly earliest: GoalMeasurementPoint | null;
  /**
   * The latest reading at or before the recent-window boundary the caller asked
   * for, used for "change this week/month". `null` when there is no earlier
   * reading to compare against, which is the honest "not enough data" state.
   */
  readonly priorInWindow: GoalMeasurementPoint | null;
  readonly count: number;
};

/** The two facts a derived figure needs from a reading. */
export type GoalMeasurementPoint = {
  readonly value: number;
  readonly measuredOn: string;
};

/** Completed vs. total weight for a milestone-measured Goal. */
export type GoalMilestoneSummary = {
  readonly goalId: string;
  readonly total: number;
  readonly completed: number;
  readonly totalWeight: number;
  readonly completedWeight: number;
};

export const EMPTY_GOAL_MILESTONE_SUMMARY: Omit<
  GoalMilestoneSummary,
  "goalId"
> = {
  total: 0,
  completed: 0,
  totalWeight: 0,
  completedWeight: 0,
};

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

export type GoalMeasurementValidationField =
  | "id"
  | "goalId"
  | "measurementType"
  | "unit"
  | "direction"
  | "baselineValue"
  | "targetValue"
  | "value"
  | "measuredOn"
  | "note"
  | "title"
  | "weight"
  | "position";

export class GoalMeasurementValidationError extends Error {
  readonly code = "validation" as const;
  readonly field: GoalMeasurementValidationField;

  constructor(field: GoalMeasurementValidationField, message: string) {
    super(`Invalid ${field}: ${message}`);
    this.name = "GoalMeasurementValidationError";
    this.field = field;
  }
}

/** No active Goal (or no such measurement/milestone on it) in the bound
 * workspace. Missing, deleted, wrong-kind and cross-workspace ids are never
 * distinguished — the same calm, non-disclosing not-found every Goal path uses. */
export class GoalMeasurementNotFoundError extends Error {
  readonly code = "not_found" as const;
  constructor() {
    super("Goal measurement not found");
    this.name = "GoalMeasurementNotFoundError";
  }
}

export class GoalMeasurementStorageError extends Error {
  readonly code = "storage" as const;
  constructor(options?: ErrorOptions) {
    super("A goal measurement storage error occurred.", options);
    this.name = "GoalMeasurementStorageError";
  }
}

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Validate a REQUIRED owner-calendar measurement date.
 *
 * The same integer-component parser `validateGoalTargetDate` uses, and for the
 * same reason: routing a date-only value through `Date` lets a viewer's timezone
 * shift it by a day. Kept as its own function rather than sharing the target-date
 * one because that one treats an empty value as "clear it", and a measurement
 * without a date is not a measurement.
 */
export function validateGoalMeasurementDate(value: unknown): string {
  if (typeof value !== "string") {
    throw new GoalMeasurementValidationError(
      "measuredOn",
      "must be a YYYY-MM-DD date",
    );
  }
  const trimmed = value.trim();
  const match = DATE_ONLY_PATTERN.exec(trimmed);
  if (!match) {
    throw new GoalMeasurementValidationError(
      "measuredOn",
      "must be a YYYY-MM-DD date",
    );
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) {
    throw new GoalMeasurementValidationError(
      "measuredOn",
      "month must be between 01 and 12",
    );
  }
  const maxDay =
    month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1]!;
  if (day < 1 || day > maxDay) {
    throw new GoalMeasurementValidationError(
      "measuredOn",
      "day is out of range for the month",
    );
  }
  return trimmed;
}

/**
 * Validate a numeric measurement/baseline/target.
 *
 * Accepts a number or the string a form posts. NEGATIVE VALUES ARE LEGITIMATE —
 * a bank balance, a temperature, a net position — so they are not rejected;
 * `NaN`, `Infinity` and absurd magnitudes are, because those are the values that
 * produce a broken indicator rather than a wrong one.
 */
export function validateGoalMeasurementValue(
  value: unknown,
  field: GoalMeasurementValidationField = "value",
): number {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value.trim())
        : Number.NaN;
  if (!Number.isFinite(numeric)) {
    throw new GoalMeasurementValidationError(field, "must be a number");
  }
  if (Math.abs(numeric) > GOAL_MEASUREMENT_VALUE_LIMIT) {
    throw new GoalMeasurementValidationError(field, "is out of range");
  }
  return numeric;
}

/** The nullable form: `null`/`undefined`/blank clear the value. */
export function validateOptionalGoalMeasurementValue(
  value: unknown,
  field: GoalMeasurementValidationField,
): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim().length === 0) return null;
  return validateGoalMeasurementValue(value, field);
}

/** Normalise a measurement's optional note. Whitespace-only becomes `null`. */
export function normalizeGoalMeasurementNote(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new GoalMeasurementValidationError(
      "note",
      "must be a string or null",
    );
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if ([...trimmed].length > GOAL_MEASUREMENT_NOTE_MAX_LENGTH) {
    throw new GoalMeasurementValidationError(
      "note",
      `must be at most ${GOAL_MEASUREMENT_NOTE_MAX_LENGTH} characters`,
    );
  }
  return trimmed;
}

/** Normalise a unit label. Whitespace-only becomes `null` ("no unit"). */
export function normalizeGoalMeasurementUnit(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new GoalMeasurementValidationError(
      "unit",
      "must be a string or null",
    );
  }
  // A unit is a label on a number: collapse internal whitespace so "  kg " and
  // "kg" are the same unit rather than two that render identically.
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0) return null;
  if ([...trimmed].length > GOAL_MEASUREMENT_UNIT_MAX_LENGTH) {
    throw new GoalMeasurementValidationError(
      "unit",
      `must be at most ${GOAL_MEASUREMENT_UNIT_MAX_LENGTH} characters`,
    );
  }
  return trimmed;
}

export function validateGoalMilestoneTitle(value: unknown): string {
  if (typeof value !== "string") {
    throw new GoalMeasurementValidationError("title", "must be a string");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new GoalMeasurementValidationError("title", "is required");
  }
  if ([...trimmed].length > GOAL_MILESTONE_TITLE_MAX_LENGTH) {
    throw new GoalMeasurementValidationError(
      "title",
      `must be at most ${GOAL_MILESTONE_TITLE_MAX_LENGTH} characters`,
    );
  }
  return trimmed;
}

export function validateGoalMilestoneWeight(value: unknown): number {
  if (value === null || value === undefined) return 1;
  if (typeof value === "string" && value.trim().length === 0) return 1;
  const numeric = typeof value === "number" ? value : Number(String(value));
  if (!Number.isInteger(numeric)) {
    throw new GoalMeasurementValidationError(
      "weight",
      "must be a whole number",
    );
  }
  if (numeric < 1 || numeric > GOAL_MILESTONE_MAX_WEIGHT) {
    throw new GoalMeasurementValidationError(
      "weight",
      `must be between 1 and ${GOAL_MILESTONE_MAX_WEIGHT}`,
    );
  }
  return numeric;
}

/* -------------------------------------------------------------------------- */
/* Configuration normalisation                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Infer which way progress points from a baseline and a target.
 *
 * This is the rule that means an owner never has to understand "ascending":
 * 85 → 70 decreases, 5,000 → 20,000 increases. When the two are equal or either
 * is unknown the inference is an INCREASE, which is the reading every other
 * measurement type takes and the one that keeps an unfinished configuration from
 * silently claiming the opposite of what the owner will type next.
 */
export function inferGoalMeasurementDirection(
  baselineValue: number | null,
  targetValue: number | null,
): GoalMeasurementDirection {
  if (
    baselineValue === null ||
    targetValue === null ||
    !Number.isFinite(baselineValue) ||
    !Number.isFinite(targetValue)
  ) {
    return "increase";
  }
  return targetValue < baselineValue ? "decrease" : "increase";
}

/**
 * Normalise a whole configuration so every stored combination is coherent.
 *
 * The rules, in one place so no route, form or repository can invent its own:
 *   - no type at all → every field null (a Goal with a stray unit and no way to
 *     be measured is not a state the product should be able to reach);
 *   - `accumulation` → baseline 0 and direction `increase` (counting up from
 *     nothing is the whole strategy);
 *   - `manual` → baseline 0, target 100, unit `%`, direction `increase`, because
 *     a manual percentage IS a 0–100 increase and storing anything else would let
 *     two Goals disagree about what "65" means;
 *   - `milestone` → baseline/target/unit null, direction `increase`; the numbers
 *     come from the stages, so storing them here would be a second, drifting copy;
 *   - `target_value` → the owner's baseline and target, with the direction
 *     inferred unless one was explicitly supplied (an override the UI offers only
 *     when the inference is genuinely ambiguous).
 */
export function normalizeGoalMeasurementConfig(
  input: Partial<GoalMeasurementConfig>,
): GoalMeasurementConfig {
  const type = input.type ?? null;
  if (type === null) return UNMEASURED_GOAL;

  if (type === "manual") {
    return {
      type,
      unit: "%",
      direction: "increase",
      baselineValue: 0,
      targetValue: 100,
    };
  }

  if (type === "milestone") {
    return {
      type,
      unit: null,
      direction: "increase",
      baselineValue: null,
      targetValue: null,
    };
  }

  if (type === "accumulation") {
    return {
      type,
      unit: input.unit ?? null,
      direction: "increase",
      baselineValue: 0,
      targetValue: input.targetValue ?? null,
    };
  }

  const baselineValue = input.baselineValue ?? null;
  const targetValue = input.targetValue ?? null;
  return {
    type,
    unit: input.unit ?? null,
    direction:
      input.direction ??
      inferGoalMeasurementDirection(baselineValue, targetValue),
    baselineValue,
    targetValue,
  };
}

/**
 * Is this configuration complete enough to compute objective progress?
 *
 * A `target_value` Goal with no target is a Goal that has been told HOW it will
 * be measured but not WHAT success is; it still shows its current value and its
 * history — it just cannot claim a percentage. Saying so is better than inventing
 * a denominator.
 */
export function isGoalMeasurementConfigured(
  config: GoalMeasurementConfig,
): boolean {
  if (config.type === null) return false;
  if (config.type === "milestone" || config.type === "manual") return true;
  return config.targetValue !== null;
}

/**
 * Does this measurement type record values through check-ins?
 *
 * `milestone` derives its value from stages, so it has no reading to log. Every
 * other type does — including `manual`, whose "measurement" is the percentage the
 * owner sets, recorded with a date so a manual Goal still has a history rather
 * than a single overwritten number.
 */
export function goalMeasurementAcceptsReadings(
  type: GoalMeasurementType | null,
): boolean {
  return type !== null && type !== "milestone";
}
