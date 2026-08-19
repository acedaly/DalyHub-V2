/**
 * UX-02 — how much a week already ASKS OF the owner, in minutes and in words.
 *
 * Pure arithmetic over two instants and one integer, with no clock, no timezone
 * and no storage. It lives in the kernel rather than in the planning loader or in
 * the planning screen because BOTH need it and they must not disagree: the loader
 * sums the week's commitments for the "Week at a glance" bar, and the board draws
 * each commitment's own duration on its card. One function, one set of words.
 *
 * ── A duration is not a date, which is why the screen may compute one ────────
 * `plan-contract.ts` states that the planning screen performs no date arithmetic
 * against a browser clock, and that rule is intact. A duration is the DIFFERENCE
 * between two instants the server already resolved and serialised; it does not
 * consult "now", it does not depend on the owner's timezone, and a browser in
 * another zone computes the same number. What the rule forbids is deciding which
 * calendar day something belongs to, and nothing here does that.
 *
 * ── An all-day item has no duration ─────────────────────────────────────────
 * It returns `0`, and the words return `null`. "24h" is not what an all-day
 * commitment costs the owner — it is a day something is true on, not a block of
 * time — so it contributes nothing to a total that is read as "how much of this
 * week is already spoken for".
 */

/** Milliseconds in a minute, named so the arithmetic below reads as intent. */
const MS_PER_MINUTE = 60_000;

/** Minutes in an hour, likewise. */
const MINUTES_PER_HOUR = 60;

/** What the duration helpers need from a schedule entry. Structurally a subset. */
export interface PlanningDurationFacts {
  readonly startsAtIso: string;
  readonly endsAtIso: string;
  readonly allDay: boolean;
}

/**
 * How many whole minutes one commitment occupies.
 *
 * `0` for an all-day item (see above), for a zero-length one, and for anything
 * whose stored instants do not parse or end before they start — a stored oddity
 * must not be able to produce a negative total that reads as time given back.
 */
export function planningEntryMinutes(entry: PlanningDurationFacts): number {
  if (entry.allDay) return 0;
  const start = Date.parse(entry.startsAtIso);
  const end = Date.parse(entry.endsAtIso);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  const minutes = Math.round((end - start) / MS_PER_MINUTE);
  return minutes > 0 ? minutes : 0;
}

/** The sum over a set of commitments. All-day items contribute nothing. */
export function planningTotalMinutes(
  entries: readonly PlanningDurationFacts[],
): number {
  return entries.reduce((sum, entry) => sum + planningEntryMinutes(entry), 0);
}

/**
 * A duration in the owner's own words: "45m", "1h", "1h 30m", "6h 30m".
 *
 * `null` for zero, because a commitment with no duration must draw no duration
 * rather than "0m" — and a week with no timed commitments says so in words
 * ("Nothing scheduled") rather than printing a zero that looks like a measurement.
 *
 * Hours and minutes, never days. A calendar week cannot hold "3d" of meetings in
 * any sense the owner means by a day, and stating one would be the kind of figure
 * that looks precise and says nothing.
 */
export function planningDurationLabel(minutes: number): string | null {
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  const whole = Math.round(minutes);
  const hours = Math.floor(whole / MINUTES_PER_HOUR);
  const rest = whole % MINUTES_PER_HOUR;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

/**
 * The same duration spelled out, for assistive technology.
 *
 * "1 hour 30 minutes" rather than "1h 30m": a screen reader handed "1h" says
 * "one h", which is not a duration. `null` under the same rule as above.
 */
export function planningDurationAccessibleLabel(
  minutes: number,
): string | null {
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  const whole = Math.round(minutes);
  const hours = Math.floor(whole / MINUTES_PER_HOUR);
  const rest = whole % MINUTES_PER_HOUR;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  if (rest > 0) parts.push(`${rest} ${rest === 1 ? "minute" : "minutes"}`);
  return parts.join(" ");
}

/* -------------------------------------------------------------------------- */
/* The week's four figures                                                    */
/* -------------------------------------------------------------------------- */

/** What the totals need from one Task. Structurally a subset of the serialised shape. */
export interface PlanningTotalsTask {
  readonly dueDate: string | null;
  readonly completedAt: string | null;
}

/** What the totals need from one day of the shown week. */
export interface PlanningTotalsDay {
  readonly tasks: readonly PlanningTotalsTask[];
  readonly commitmentMinutes: number;
}

/** The four figures, and the words for the one that is a duration. */
export interface PlanningWeekTotals {
  readonly plannedCount: number;
  readonly unplacedCount: number;
  readonly overdueCount: number;
  readonly commitmentMinutes: number;
  readonly commitmentLabel: string | null;
  readonly commitmentAccessibleLabel: string | null;
}

/**
 * UX-02 — the week in four figures, computed from what a caller already holds.
 *
 * Pure, so the rule for each figure is testable on its own rather than only
 * observable through a loaded page. Each rule is exactly what its label says:
 *
 *   planned      Tasks with a plan inside the shown week (the board's own rows).
 *   unplaced     how long the "Still to place" queue is, whatever its source.
 *   overdue      OPEN Tasks the screen is showing — on the board or in the queue
 *                — whose DUE date is before the owner's today.
 *   commitment   minutes the calendar already holds across the week.
 *
 * Two decisions inside `overdue` are the product's, not arithmetic:
 *
 *   - a COMPLETED Task is never overdue, however old its date. The work is done;
 *     a count that includes it is a count of history.
 *   - a PLANNED date in the past is not overdue AT ALL. Only the DUE date can be
 *     late. A plan that lapsed is a plan the owner has moved on from, which the
 *     queue's own "plan lapsed" band is what reports.
 *
 * The two sets are disjoint by construction — the queue holds work with no plan
 * in the week and the board holds work with one — so nothing is counted twice.
 */
export function planningWeekTotals(input: {
  readonly days: readonly PlanningTotalsDay[];
  readonly queue: readonly { readonly task: PlanningTotalsTask }[];
  readonly todayIso: string;
}): PlanningWeekTotals {
  const overdue = (task: PlanningTotalsTask): boolean =>
    task.completedAt === null &&
    task.dueDate !== null &&
    task.dueDate < input.todayIso;

  const planned = input.days.flatMap((day) => day.tasks);
  const commitmentMinutes = input.days.reduce(
    (sum, day) => sum + day.commitmentMinutes,
    0,
  );

  return {
    plannedCount: planned.length,
    unplacedCount: input.queue.length,
    overdueCount:
      planned.filter(overdue).length +
      input.queue.filter((entry) => overdue(entry.task)).length,
    commitmentMinutes,
    commitmentLabel: planningDurationLabel(commitmentMinutes),
    commitmentAccessibleLabel:
      planningDurationAccessibleLabel(commitmentMinutes),
  };
}
