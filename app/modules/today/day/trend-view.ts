/**
 * GOAL-02 — the workload trend's words (pure, React-free).
 *
 * The chart shows seven pairs of bars. This turns the same seven pairs into the
 * two sentences that must exist beside it: the one a screen reader hears, and
 * the one printed beneath it.
 *
 * ── The claim it will and will not make ─────────────────────────────────────
 * "6 fewer tasks in your active workload" is a real statement about the week —
 * but only if it follows from what was counted. It does when completions and
 * creations are counted over the SAME seven days, which they are, so the
 * difference is the net change in open work over that window. Two honesty
 * limits are kept anyway:
 *
 *   - the claim is only made when the two totals actually differ. "0 fewer" is
 *     not an insight, it is arithmetic with nothing to say;
 *   - it is phrased as the change over "this week", never as a total open count,
 *     because the window does not know how much work was already open.
 *
 * Everything else is plain counting.
 */

import type { TaskActivityDayCount } from "~/kernel/tasks";

export interface TodayActivityTrendLike {
  readonly days: readonly TaskActivityDayCount[];
  readonly totalCreated: number;
  readonly totalCompleted: number;
}

export interface ActivityTrendSummary {
  /** The sentence printed beneath the chart. */
  readonly visible: string;
  /** The chart's text equivalent — every period, in words. */
  readonly accessible: string;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/**
 * The short weekday label for an owner-calendar date.
 *
 * Computed from the date's own components through `Date.UTC`, never from a
 * timezone reading: the string is already the owner's calendar day, so
 * re-interpreting it in any zone could shift it. Short labels are what keep
 * seven columns legible at 320px — the alternative, shrinking the type until it
 * fits, is the one this feature is told not to take.
 */
export function weekdayLabel(dateIso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso);
  if (!match) return dateIso;
  const day = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  ).getUTCDay();
  return WEEKDAYS[day] ?? dateIso;
}

export function activityTrendSummary(
  trend: TodayActivityTrendLike,
): ActivityTrendSummary {
  const { totalCompleted, totalCreated } = trend;
  const parts = [`${totalCompleted} completed`, `${totalCreated} created`];

  const net = totalCompleted - totalCreated;
  if (net > 0) {
    parts.push(
      `${net} ${net === 1 ? "task" : "tasks"} fewer in your active workload`,
    );
  } else if (net < 0) {
    const gained = Math.abs(net);
    parts.push(
      `${gained} ${gained === 1 ? "task" : "tasks"} more in your active workload`,
    );
  }
  // net === 0 says nothing: the week finished level, which the two totals
  // already state.

  return {
    visible: parts.join(" · "),
    accessible: `Tasks completed and created over the last ${trend.days.length} days: ${trend.days
      .map(
        (day) =>
          `${weekdayLabel(day.dateIso)} ${day.completed} completed, ${day.created} created`,
      )
      .join("; ")}. ${parts.join(", ")}.`,
  };
}
