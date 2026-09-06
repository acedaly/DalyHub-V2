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

import type { ObligationState } from "./obligation";

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

/**
 * The owner-facing word for each derived state. Always rendered AS TEXT beside
 * any tone, never colour alone (§24).
 *
 * It lived in the Assets kernel until V2.10 LIFE-02, which is where the state
 * itself used to live. It describes an obligation, not an Asset, and a
 * subject-less obligation needs the same words.
 */
export const OBLIGATION_STATE_LABELS: Record<ObligationState, string> = {
  overdue: "Overdue",
  due: "Due soon",
  upcoming: "Upcoming",
  unknown: "Reading needed",
  completed: "Completed",
  dismissed: "Dismissed",
  on_hold: "On hold",
};
