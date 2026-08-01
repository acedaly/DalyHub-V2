/**
 * ASSET-02 Assets kernel — meter semantics (pure, storage-free, React-free).
 *
 * A "meter" is whatever counts up on an Asset: a vehicle's odometer, a generator's
 * running hours, a pump's duty cycles, a filter's uses. Meter-based maintenance is
 * the second half of the maintenance model (the first being calendar dates), and
 * it needs three things this module owns: a BOUNDED unit vocabulary, a rule that
 * two readings are only comparable in the SAME unit, and an honest "we do not know"
 * state for when no reading has been recorded recently.
 *
 * Two deliberate non-goals:
 *   - **No unit conversion.** Kilometres are never silently turned into miles. An
 *     obligation in km and a reading in mi are INCOMPATIBLE, and that is reported,
 *     not papered over. (Same discipline as money: ADR-049 forbids silent currency
 *     conversion; this is its odometer analogue.)
 *   - **No formulas.** A maintenance interval is a bounded integer plus a unit —
 *     never a user-supplied expression that something would have to evaluate.
 *
 * Everything here is pure: no clock, no storage, no timezone. Callers pass the
 * owner-calendar day when a date matters (ADR-022 §22.7).
 */

import { AssetValidationError } from "./asset-errors";

/* -------------------------------------------------------------------------- */
/* The bounded unit vocabulary                                                */
/* -------------------------------------------------------------------------- */

/**
 * Every meter unit DalyHub understands. Deliberately small and closed: five units
 * cover a personal life's assets (vehicles, trailers, generators, tools,
 * appliances) without becoming a fleet-telematics platform. Extending it means
 * adding a key here AND to the migration CHECK — a considered decision, not a
 * free-text field.
 */
export const ASSET_METER_UNITS = [
  "km",
  "mi",
  "hours",
  "cycles",
  "count",
] as const;

export type AssetMeterUnit = (typeof ASSET_METER_UNITS)[number];

/** Every meter unit, in display order, with an owner-facing label and short form. */
export const ASSET_METER_UNIT_OPTIONS: readonly {
  readonly value: AssetMeterUnit;
  /** The full label used in pickers ("Kilometres"). */
  readonly label: string;
  /** The compact suffix used in readings ("12,340 km"). */
  readonly short: string;
}[] = [
  { value: "km", label: "Kilometres", short: "km" },
  { value: "mi", label: "Miles", short: "mi" },
  { value: "hours", label: "Hours", short: "hrs" },
  { value: "cycles", label: "Cycles", short: "cycles" },
  { value: "count", label: "Count", short: "uses" },
];

const UNIT_SHORT = new Map<string, string>(
  ASSET_METER_UNIT_OPTIONS.map((u) => [u.value, u.short]),
);
const UNIT_LABEL = new Map<string, string>(
  ASSET_METER_UNIT_OPTIONS.map((u) => [u.value, u.label]),
);

/** True when `value` is one of the five supported meter units. */
export function isAssetMeterUnit(value: unknown): value is AssetMeterUnit {
  return (
    typeof value === "string" &&
    (ASSET_METER_UNITS as readonly string[]).includes(value)
  );
}

/** The compact suffix for a unit ("km", "hrs"), or an empty string when unknown. */
export function meterUnitShort(unit: string | null | undefined): string {
  return unit ? (UNIT_SHORT.get(unit) ?? "") : "";
}

/** The full picker label for a unit ("Kilometres"), or null when unknown. */
export function meterUnitLabel(unit: string | null | undefined): string | null {
  return unit ? (UNIT_LABEL.get(unit) ?? null) : null;
}

/**
 * The largest meter reading DalyHub accepts. Generous enough for any real asset
 * (100 million km is ~2,500 times around the equator) while keeping the value a
 * safe integer and rejecting an obviously mistyped reading before it corrupts a
 * threshold calculation.
 */
export const MAX_METER_VALUE = 100_000_000;

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Format a reading for display ("12,340 km"). Returns null when there is no
 * reading, so callers render an explicit "No reading recorded" rather than a zero
 * that would read as a real measurement.
 */
export function formatMeterReading(
  value: number | null | undefined,
  unit: string | null | undefined,
): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const short = meterUnitShort(unit);
  const number = new Intl.NumberFormat("en-AU").format(Math.trunc(value));
  return short ? `${number} ${short}` : number;
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Validate a meter unit, returning the canonical token. Throws
 * `AssetValidationError` for anything outside the closed vocabulary — an unknown
 * unit is a bug or a tampered form, never something to coerce.
 */
export function validateMeterUnit(
  value: unknown,
  field: "meterUnit" = "meterUnit",
): AssetMeterUnit {
  if (!isAssetMeterUnit(value)) {
    throw new AssetValidationError(field, "must be a supported meter unit");
  }
  return value;
}

/**
 * Validate a meter reading: a non-negative whole number within `MAX_METER_VALUE`.
 * Accepts a number or a digits string (forms submit strings), and tolerates the
 * thousands separators and spaces a person actually types ("12,340", "12 340").
 * A negative reading is rejected outright — an odometer does not run backwards.
 */
export function validateMeterValue(
  value: unknown,
  field: "meterValue" | "meterThreshold" | "meterInterval" = "meterValue",
): number {
  let numeric: number;
  if (typeof value === "number") {
    numeric = value;
  } else if (typeof value === "string") {
    const cleaned = value.replace(/[\s,_]/g, "");
    if (cleaned.length === 0 || !/^\d+$/.test(cleaned)) {
      throw new AssetValidationError(field, "must be a whole number");
    }
    numeric = Number.parseInt(cleaned, 10);
  } else {
    throw new AssetValidationError(field, "must be a whole number");
  }
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) {
    throw new AssetValidationError(field, "must be a whole number");
  }
  if (numeric < 0) {
    throw new AssetValidationError(field, "cannot be negative");
  }
  if (numeric > MAX_METER_VALUE) {
    throw new AssetValidationError(field, "is larger than we can record");
  }
  return numeric;
}

/* -------------------------------------------------------------------------- */
/* Threshold state — the honest three-way answer                              */
/* -------------------------------------------------------------------------- */

/**
 * How a meter-based obligation stands against the Asset's current reading.
 *
 *   - `reached`      — the reading is at or past the threshold. Act now.
 *   - `approaching`  — within the approach window. Plan it.
 *   - `ahead`        — comfortably before the threshold.
 *   - `unknown`      — NO current reading, so we genuinely cannot say. This is the
 *                      whole point of the state: a meter obligation is NEVER called
 *                      overdue merely because nobody has entered a reading lately
 *                      (§5). The owner is asked for a reading instead.
 *   - `incompatible` — the reading and the threshold are in different units. We do
 *                      not convert; we say so.
 */
export type MeterThresholdState =
  "reached" | "approaching" | "ahead" | "unknown" | "incompatible";

/**
 * How close to the threshold counts as "approaching", per unit. These are calm,
 * owner-scale numbers — 500 km before a service is the point at which a person
 * starts thinking about booking it, not 5,000.
 */
const APPROACH_WINDOW: Record<AssetMeterUnit, number> = {
  km: 500,
  mi: 300,
  hours: 20,
  cycles: 20,
  count: 5,
};

/** The current reading on an Asset, or the absence of one. */
export type MeterReading = {
  readonly value: number;
  readonly unit: AssetMeterUnit;
};

/** A meter commitment: reach `threshold` in `unit`. */
export type MeterCommitment = {
  readonly threshold: number;
  readonly unit: AssetMeterUnit;
};

/** The full answer for a meter obligation against a reading. */
export type MeterThresholdEvaluation = {
  readonly state: MeterThresholdState;
  /**
   * Units remaining until the threshold — positive when ahead, negative when the
   * threshold has been passed, null when unknowable (no reading, or a unit
   * mismatch). Never fabricated.
   */
  readonly remaining: number | null;
  /** Owner-facing text. Always word-bearing, never colour-dependent. */
  readonly text: string;
};

/**
 * Evaluate a meter commitment against the Asset's current reading.
 *
 * The rules, in order, are deliberate:
 *   1. No reading at all → `unknown`. We ask for a reading; we never accuse.
 *   2. Different units → `incompatible`. We never convert km ↔ mi ↔ hours.
 *   3. Otherwise compare, and describe the gap in plain words.
 */
export function evaluateMeterThreshold(
  commitment: MeterCommitment,
  reading: MeterReading | null,
): MeterThresholdEvaluation {
  const short = meterUnitShort(commitment.unit);
  if (reading === null) {
    return {
      state: "unknown",
      remaining: null,
      text: "Current meter reading needed",
    };
  }
  if (reading.unit !== commitment.unit) {
    return {
      state: "incompatible",
      remaining: null,
      text: `Recorded in ${meterUnitShort(reading.unit)}, but this is set in ${short}`,
    };
  }
  const remaining = commitment.threshold - reading.value;
  if (remaining <= 0) {
    const over = Math.abs(remaining);
    return {
      state: "reached",
      remaining,
      text:
        over === 0
          ? `Due now at ${formatMeterReading(commitment.threshold, commitment.unit)}`
          : `Overdue by ${formatMeterReading(over, commitment.unit)}`,
    };
  }
  const window = APPROACH_WINDOW[commitment.unit];
  if (remaining <= window) {
    return {
      state: "approaching",
      remaining,
      text: `Due in ${formatMeterReading(remaining, commitment.unit)}`,
    };
  }
  return {
    state: "ahead",
    remaining,
    text: `Due at ${formatMeterReading(commitment.threshold, commitment.unit)}`,
  };
}

/**
 * The next meter threshold after completing one at `completedAt`, advancing by
 * `interval`. Anchored on the reading the work was actually done at (not on the
 * old threshold), so a service done 300 km late does not permanently shift the
 * whole schedule 300 km early — the next one falls a full interval after the work.
 */
export function nextMeterThreshold(
  completedAtReading: number,
  interval: number,
): number {
  return Math.min(MAX_METER_VALUE, completedAtReading + interval);
}
