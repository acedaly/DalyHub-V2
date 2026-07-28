/**
 * PEOPLE-03 — the owner-calendar clock seam for the relationship evaluator.
 *
 * The kernel evaluator takes its clock as an argument and never reads the ambient
 * wall clock, so the rule matrix is deterministic. This is the ONE place production
 * builds that argument, from the owner's persisted timezone (SET-01) — Cloudflare
 * Workers run in UTC, so "days since we last spoke" computed naïvely would be a day
 * out through the whole Australian morning.
 *
 * Mirrors `~/shared/project-health`'s `createOwnerHealthContext`.
 */

import type { FollowUpFrequency } from "~/kernel/people";
import type { RelationshipEvaluationContext } from "~/kernel/relationships";
import { ownerCalendarIso } from "~/shared/datetime";

/** The two Person-owned inputs the stay-in-touch signal is allowed to consider. */
export interface RelationshipContextInput {
  /** The cadence the owner chose for this Person, or null when they chose none. */
  readonly followUpFrequency: FollowUpFrequency | null;
  /** The explicit next-follow-up date `YYYY-MM-DD` the owner set, or null. */
  readonly nextFollowUpIso: string | null;
}

/**
 * Build the evaluation context for `evaluatePersonRelationship` from the current
 * instant, the owner's timezone and the Person's own follow-up settings.
 */
export function createOwnerRelationshipContext(
  now: Date,
  timeZone: string | undefined,
  input: RelationshipContextInput,
): RelationshipEvaluationContext {
  return {
    now,
    todayIso: ownerCalendarIso(now, timeZone),
    calendarIsoOf: (instant) => ownerCalendarIso(instant, timeZone),
    followUpFrequency: input.followUpFrequency,
    nextFollowUpIso: input.nextFollowUpIso,
  };
}
