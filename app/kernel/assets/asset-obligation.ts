/**
 * ASSET-02 Assets kernel — what is Asset-SPECIFIC about an obligation.
 *
 * V2.10 LIFE-00 moved the obligation domain to [`~/kernel/obligations`]: the
 * category vocabulary, the statuses, the recurrence kinds, the calendar
 * arithmetic and the one urgency evaluator are general, because a tax return is
 * due and recurs in exactly the way a registration renewal does (ADR-116
 * decision 1). The previous `asset-obligation.ts` was DELETED rather than
 * re-exported: an alias would have kept a second obligation vocabulary alive
 * behind a re-export, which is the mistake ADR-117 records for
 * `analytics-range.ts`.
 *
 * What remains here is the part that genuinely is about an Asset, and nothing
 * else:
 *
 *   1. THE METER. An odometer is a property of a vehicle, so its units,
 *      approach windows and readings live in `asset-meter.ts`. The shared
 *      evaluator takes an already-evaluated meter side; this module is what
 *      evaluates it, and `evaluateAssetObligation` is the composition — not a
 *      second evaluator. There is exactly one `evaluateObligation`.
 *   2. THE CANONICAL-FACT BRIDGE. Completing a registration renewal moves the
 *      Asset's `renewalDate`; completing a service moves `nextServiceDate` and
 *      `lastServiceDate`. Only an Asset has canonical dates to move.
 *   3. THE PROOF-EVENT BRIDGE. An Asset-subject completion writes an
 *      `asset_events` logbook row, and its category is derived here.
 *   4. THE ASSET-SHAPED EXTENSIONS of the shared record and inputs — the
 *      Asset's id, its meter columns, its proof-event pointer, and the cost,
 *      provider, person, reading and note a completion records against it.
 *
 * Everything here is PURE and calendar-only: no clocks, no timezones, no
 * storage. The caller supplies the owner-calendar day (ADR-022 §22.7).
 */

import {
  describeObligationRecurrence,
  evaluateObligation,
  type Obligation,
  type ObligationCategory,
  type ObligationEvaluation,
  type ObligationRecurrenceKind,
} from "~/kernel/obligations";

import {
  evaluateMeterThreshold,
  formatMeterReading,
  isAssetMeterUnit,
  nextMeterThreshold,
  type AssetMeterUnit,
  type MeterReading,
  type MeterThresholdEvaluation,
} from "./asset-meter";

/* -------------------------------------------------------------------------- */
/* The canonical-fact and proof-event bridges                                 */
/* -------------------------------------------------------------------------- */

/**
 * Which canonical Asset fact a completed obligation of this category updates.
 * This is the bridge between history and current facts: completing a
 * registration renewal moves the Asset's `renewalDate`; completing a service
 * moves `nextServiceDate` and `lastServiceDate`; a warranty obligation moves
 * `warrantyExpiry`. Categories with no canonical home — including every life
 * shape V2.10 adds — update nothing.
 */
export function canonicalFactForCategory(
  category: ObligationCategory,
): "renewalDate" | "warrantyExpiry" | "nextServiceDate" | null {
  switch (category) {
    case "registration":
    case "insurance":
    case "licence":
      return "renewalDate";
    case "warranty":
      return "warrantyExpiry";
    case "service":
    case "inspection":
    case "maintenance":
      return "nextServiceDate";
    default:
      return null;
  }
}

/**
 * The Asset Event category recorded when an obligation of this category is
 * completed against an Asset — so "renewed the rego" lands in history as a
 * `registration` event, not as an untyped note.
 */
export function completionEventCategory(category: ObligationCategory): string {
  switch (category) {
    case "registration":
      return "registration";
    case "insurance":
      return "insurance";
    case "warranty":
      return "warranty";
    case "licence":
      return "renewal";
    case "service":
    case "maintenance":
      return "service";
    case "inspection":
      return "inspection";
    case "replacement":
      return "upgrade";
    default:
      return "history";
  }
}

/* -------------------------------------------------------------------------- */
/* The meter side of an evaluation                                            */
/* -------------------------------------------------------------------------- */

/**
 * The meter side of an obligation's answer, or null when it makes no meter
 * commitment. Separated from the evaluator so the shared domain never needs to
 * know that meters, units or Assets exist.
 */
export function assetObligationMeter(
  obligation: Pick<Obligation, "meterThreshold" | "meterUnit">,
  reading: MeterReading | null,
): MeterThresholdEvaluation | null {
  if (obligation.meterThreshold === null || obligation.meterUnit === null) {
    return null;
  }
  if (!isAssetMeterUnit(obligation.meterUnit)) return null;
  return evaluateMeterThreshold(
    { threshold: obligation.meterThreshold, unit: obligation.meterUnit },
    reading,
  );
}

/**
 * Evaluate an Asset obligation: the ONE shared evaluator, given the meter side
 * this module computed. Not a second evaluator — every urgency word still comes
 * from `~/kernel/obligations`.
 */
export function evaluateAssetObligation(
  obligation: Pick<
    Obligation,
    "status" | "dueDate" | "leadDays" | "meterThreshold" | "meterUnit"
  >,
  today: string,
  reading: MeterReading | null,
): ObligationEvaluation {
  return evaluateObligation(
    obligation,
    today,
    assetObligationMeter(obligation, reading),
  );
}

/**
 * A plain-words recurrence description for an Asset obligation, formatting a
 * meter interval in the Asset's own units before handing it to the shared
 * describer.
 */
export function describeAssetObligationRecurrence(
  kind: ObligationRecurrenceKind,
  interval: number | null,
  meterInterval: number | null,
  meterUnit: AssetMeterUnit | null,
): string {
  return describeObligationRecurrence(
    kind,
    interval,
    formatMeterReading(meterInterval, meterUnit),
  );
}

export { nextMeterThreshold };
