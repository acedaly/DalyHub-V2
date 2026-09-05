/**
 * V2.10 LIFE-00 Obligations kernel — the stored lifecycle status.
 *
 * `status` stores ONLY the owner-controlled lifecycle. The urgency words the
 * owner actually reads — `upcoming`, `due`, `overdue` — are DERIVED at read
 * time by `evaluateObligation`, never stored, because a stored "overdue" flag
 * is wrong the moment the clock ticks past it and would need a background
 * scheduler DalyHub deliberately does not have.
 *
 * Task status values are NOT reused. A Task is done or not; an obligation can
 * be on hold, dismissed as no-longer-relevant, or waiting on a meter reading
 * nobody has taken. One vocabulary forced onto the other loses meaning.
 */

/** The owner-controlled lifecycle. */
export const OBLIGATION_STATUSES = [
  "open",
  "completed",
  "dismissed",
  "on_hold",
] as const;

export type ObligationStatus = (typeof OBLIGATION_STATUSES)[number];

/** True when `value` is a supported stored obligation status. */
export function isObligationStatus(value: unknown): value is ObligationStatus {
  return (
    typeof value === "string" &&
    (OBLIGATION_STATUSES as readonly string[]).includes(value)
  );
}
