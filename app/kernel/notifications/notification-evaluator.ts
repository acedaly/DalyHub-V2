/**
 * NOTIFY-01 — the evaluator. Pure: no clock, no storage, no channel.
 *
 * Every fifteen minutes the Worker's cron trigger asks this module two questions:
 *
 *   1. has the owner's local clock reached their digest time on a day DalyHub has
 *      not already produced a digest for?
 *   2. has an asset obligation crossed a lead-time rung the ledger has not
 *      already recorded?
 *
 * ── Why the schedule is a frequent TICK rather than an encoded send time ────
 * A cron expression is timezone-ignorant, and DalyHub stores the owner's zone as
 * a preference they can change. Encoding "07:00 Sydney" as `0 21 * * *` would be
 * correct for half the year and an hour wrong for the other half, and would need
 * a redeploy to follow the owner moving. So the cron says nothing about when the
 * digest is due; it merely offers this module 96 opportunities a day to decide,
 * and DST becomes an ordinary, testable property of a pure function rather than
 * a twice-yearly operational surprise.
 *
 * ── Why "already sent" is asked twice ───────────────────────────────────────
 * The decision below takes `alreadyRecorded`, which the caller reads from the
 * ledger. That read is an OPTIMISATION — it stops the digest being rendered (a
 * handful of workspace reads) ninety times a day once it has been sent. It is
 * NOT the guarantee. The guarantee is the UNIQUE index on the dedupe key: the
 * insert commits before any send is attempted, so two ticks racing produce one
 * row and one send, whatever this function returned.
 */

import { digestDedupeKey } from "./notification";

/* -------------------------------------------------------------------------- */
/* The owner's wall clock                                                      */
/* -------------------------------------------------------------------------- */

/**
 * One reading of the owner's local clock: which calendar date it is for them,
 * and how far through that day they are.
 *
 * Supplied by the caller rather than computed here, because DalyHub has exactly
 * one zone-conversion implementation (`wallClockInTimeZone` in
 * `~/shared/datetime`) and the kernel does not reach into the shared layer. Both
 * halves must come from ONE reading: taking the date from one call and the time
 * from another can straddle a minute boundary and, twice a year, a DST transition.
 */
export interface LocalWallClock {
  /** The owner's calendar date, `YYYY-MM-DD`. */
  readonly date: string;
  /** Minutes since local midnight, 0–1439. */
  readonly minutesSinceMidnight: number;
}

/* -------------------------------------------------------------------------- */
/* Digest gating                                                               */
/* -------------------------------------------------------------------------- */

/** Minutes since midnight for an `HH:MM` send time, or null when malformed. */
export function sendTimeMinutes(sendTime: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(sendTime);
  if (match === null) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export type DigestDecisionReason =
  /** The owner's clock has reached the send time and today has no digest yet. */
  | "due"
  /** Notifications are off, or the digest source is off. */
  | "disabled"
  /** The send time is not a time. Refused rather than guessed at. */
  | "invalid_send_time"
  /** Not yet — the owner's local clock has not reached the send time. */
  | "before_send_time"
  /** A digest already exists for this owner-calendar date. */
  | "already_recorded";

export interface DigestDecision {
  readonly send: boolean;
  /** The owner-calendar date the decision was made for. */
  readonly localDate: string;
  /** The ledger key this digest would claim. */
  readonly dedupeKey: string;
  readonly reason: DigestDecisionReason;
}

/**
 * Should this tick produce a digest?
 *
 * The rule is "at or past the send time, on a local date with no digest", and
 * every word of it matters:
 *
 *   - **at or past**, not "at": ticks are fifteen minutes apart and a send time
 *     of 07:05 falls between two of them. A digest that only fires on an exact
 *     match would silently never fire for most of the minutes in an hour.
 *   - **local date**, not "24 hours since the last one": the owner asked for a
 *     digest each morning, not every 1,440 minutes. Anchoring on their calendar
 *     date is what makes both DST directions behave. On a spring-forward day the
 *     local clock jumps over an hour — if the send time is inside the skipped
 *     hour, the first tick after it is still "at or past", so the digest lands
 *     late rather than never. On a fall-back day the hour repeats — the second
 *     pass is still the same local date, so the ledger key is the same and the
 *     second digest is refused.
 *   - **no digest**, from the ledger, never from a timestamp this code keeps.
 */
export function evaluateDigestDue(input: {
  readonly enabled: boolean;
  readonly digestEnabled: boolean;
  readonly sendTime: string;
  readonly localNow: LocalWallClock;
  readonly alreadyRecorded: boolean;
}): DigestDecision {
  const localDate = input.localNow.date;
  const dedupeKey = digestDedupeKey(localDate);
  const refuse = (reason: DigestDecisionReason): DigestDecision => ({
    send: false,
    localDate,
    dedupeKey,
    reason,
  });

  if (!input.enabled || !input.digestEnabled) return refuse("disabled");
  const due = sendTimeMinutes(input.sendTime);
  if (due === null) return refuse("invalid_send_time");
  if (input.localNow.minutesSinceMidnight < due) {
    return refuse("before_send_time");
  }
  if (input.alreadyRecorded) return refuse("already_recorded");
  return { send: true, localDate, dedupeKey, reason: "due" };
}

/* -------------------------------------------------------------------------- */
/* Asset obligation rungs                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The lead-time rungs, largest first. Fixed, and deliberately not configurable.
 *
 * Three rungs is enough to be useful — a month to arrange it, a week to do it, a
 * day to not forget it — and a configurable ladder is a preference the owner has
 * to reason about before they have any evidence about what they actually want.
 * Revisit on evidence, not on the suspicion that someone might want four.
 */
export const OBLIGATION_RUNG_DAYS = [30, 7, 1] as const;
export type ObligationRung = (typeof OBLIGATION_RUNG_DAYS)[number];

/**
 * Which rung an obligation currently sits in, or null when it is further out
 * than the widest rung.
 *
 * The rung is the SMALLEST one the obligation is inside, so an obligation twelve
 * days out is in the 30-day rung and one five days out is in the 7-day rung. An
 * obligation that is already overdue stays in the 1-day rung forever — and, being
 * deduped forever, says so exactly once.
 *
 * This banding is what stops a burst on first use. Add an obligation due in three
 * days and one notification fires (the 7-day rung); the 30-day rung is skipped
 * rather than fired retrospectively, because "your registration expires in 30
 * days" is not a true thing to say about a date three days away.
 */
export function rungForDaysUntilDue(
  daysUntilDue: number | null,
): ObligationRung | null {
  if (daysUntilDue === null) return null;
  let rung: ObligationRung | null = null;
  for (const candidate of OBLIGATION_RUNG_DAYS) {
    if (daysUntilDue <= candidate) rung = candidate;
  }
  return rung;
}
