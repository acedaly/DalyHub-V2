/**
 * FOLLOW-01 — the BOUNDED ACTIVITY WINDOW: one named owner-local period,
 * expressed both as the wall-calendar days the owner reads and as the half-open
 * UTC instant range the append-only Activity stream is queried with.
 *
 * ── Why this is a kernel type rather than a Review type ─────────────────────
 * REVIEW-03 already had exactly this shape, privately, as `ReviewPeriodWindow`.
 * V2.4 gives it two more consumers — Weekly Planning's account of the week it is
 * showing (FOLLOW-01) and Goal movement inside a named window (FOLLOW-02) — and
 * three surfaces that each carry their own idea of "the period" is three
 * surfaces that can disagree about which Saturday night a completion belongs to.
 * So the type moves here and `ReviewPeriodWindow` becomes an alias of it: one
 * definition, three consumers, no conversion.
 *
 * ── The boundary convention, stated once ────────────────────────────────────
 * A window is **inclusive of both wall-calendar days** and **half-open in
 * instants**: `[startInstantIso, endInstantIso)`. The lower bound is the owner's
 * local midnight that STARTS `periodStart`; the upper bound is the owner's local
 * midnight that starts the day AFTER `periodEnd`. So a Task completed at 23:59
 * on the period's last day is inside it and one completed a minute later is not,
 * in the owner's own calendar rather than in UTC — which is the whole point, and
 * the reason a Sydney owner's Sunday-evening completion does not land in the
 * following week the way a naive UTC comparison would put it.
 *
 * Nothing here reads a clock or a timezone database: resolving an owner-local
 * midnight to an instant is the platform's job (`~/shared/datetime`), and this
 * module takes the answer as an argument. That is what keeps every rule below
 * testable without a timezone, a browser or a wall clock.
 */

import { addCalendarDays, isCalendarDate } from "~/kernel/datetime";

/**
 * One named period, in both of the two vocabularies that describe it.
 *
 * Every derived figure in V2.4 states the window it covers ([ADR-110] decision
 * 5), and this is the value that gets stated.
 */
export interface ActivityWindow {
  /** Owner wall-calendar `YYYY-MM-DD`, INCLUSIVE. */
  readonly periodStart: string;
  /** Owner wall-calendar `YYYY-MM-DD`, INCLUSIVE. */
  readonly periodEnd: string;
  /** UTC instant at the owner's local start of `periodStart`. INCLUSIVE. */
  readonly startInstantIso: string;
  /**
   * UTC instant at the owner's local start of the day AFTER `periodEnd`.
   * EXCLUSIVE.
   */
  readonly endInstantIso: string;
}

/**
 * Where the owner's today sits relative to a window.
 *
 * This exists so that ADR-110's fifth decision — *"a period that has not
 * happened is never counted"* — is a value the surfaces branch on rather than a
 * rule each of them remembers. A running week is never described as having
 * failed work it has not reached, and a future week is described as a plan
 * rather than as an outcome.
 */
export type ActivityWindowPhase = "future" | "running" | "closed";

/** Which phase `todayIso` (an owner-calendar day) puts `window` in. */
export function activityWindowPhase(
  window: ActivityWindow,
  todayIso: string,
): ActivityWindowPhase {
  if (todayIso < window.periodStart) return "future";
  if (todayIso > window.periodEnd) return "closed";
  return "running";
}

/** True when a wall-calendar date falls inside the window's days. */
export function isInActivityWindow(
  window: ActivityWindow,
  dateIso: string | null,
): boolean {
  return (
    dateIso !== null &&
    dateIso >= window.periodStart &&
    dateIso <= window.periodEnd
  );
}

/**
 * Build a window from its two wall-calendar days and a resolver that turns an
 * owner-local midnight into a UTC instant.
 *
 * The resolver is passed in rather than imported so this stays free of the
 * timezone database: `~/shared/datetime`'s `ownerDayStartInstant` is what every
 * caller in the application hands it, and a unit test hands it arithmetic.
 *
 * A resolver that cannot produce an instant (the hour a DST jump skips) falls
 * back to the plain UTC reading of the same local midnight, which is what
 * REVIEW-03 has always done — losing an hour of precision once a year is a far
 * smaller error than dropping the period.
 */
export function buildActivityWindow(input: {
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly startOfOwnerDay: (dayIso: string) => Date | null;
}): ActivityWindow {
  const { periodStart, periodEnd } = input;
  if (!isCalendarDate(periodStart) || !isCalendarDate(periodEnd)) {
    throw new TypeError(
      "an activity window needs two wall-calendar YYYY-MM-DD days",
    );
  }
  const dayAfterEnd = addCalendarDays(periodEnd, 1);
  const start = input.startOfOwnerDay(periodStart);
  const end = input.startOfOwnerDay(dayAfterEnd);
  return {
    periodStart,
    periodEnd,
    startInstantIso: (
      start ?? new Date(`${periodStart}T00:00:00.000Z`)
    ).toISOString(),
    endInstantIso: (
      end ?? new Date(`${dayAfterEnd}T00:00:00.000Z`)
    ).toISOString(),
  };
}
