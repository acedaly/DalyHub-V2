/**
 * GOAL-02 — Today's workload-trend read, and its Goal rail's shared summary.
 *
 * The Goal half of this module moved to `~/shared/goal-progress` in REDESIGN-04,
 * because the Projects page now shows the same compact rail and §5.3 requires it
 * to reuse the existing summary read rather than add one. Today's names are
 * preserved as aliases below, so the surface that has always called
 * `loadTodayGoals` still does.
 *
 * The workload trend stays here: nothing else asks for it.
 */

import { addDaysToIsoDate } from "~/kernel/alignment";
import type { TaskActivityDayCount } from "~/kernel/tasks";
import type { WorkspaceScope } from "~/platform/workspaces";
import { ownerLocalToUtc } from "~/shared/datetime";
import {
  GOAL_SUMMARY_LIMIT,
  goalSummaryRank,
  loadGoalSummaries,
  type GoalSummary,
} from "~/shared/goal-progress";

/** Today's own names for the shared Goal summary read. */
export const TODAY_GOAL_LIMIT = GOAL_SUMMARY_LIMIT;
export type TodayGoal = GoalSummary;
export const todayGoalRank = goalSummaryRank;
export const loadTodayGoals = loadGoalSummaries;

/* -------------------------------------------------------------------------- */
/* Workload trend                                                              */
/* -------------------------------------------------------------------------- */

/** How many days the trend covers. A week: the period a workload is felt over. */
export const TODAY_TREND_DAYS = 7;

export interface TodayActivityTrend {
  /** Oldest first, one entry per day, zeroes included. The last seven days. */
  readonly days: readonly TaskActivityDayCount[];
  readonly totalCreated: number;
  readonly totalCompleted: number;
  /**
   * Completions in the seven days BEFORE the window above, so the summary can
   * say "+8 on the previous 7" from a real reading rather than a flourish.
   *
   * Both windows are ROLLING seven-day spans ending today, not calendar weeks —
   * which is why every surface that states them says "7 days" rather than "this
   * week". A calendar week would leave the chart with a single bar on a Monday.
   *
   * `null` when the earlier week could not be read at all (a DST-collapsed
   * boundary skipped every day of it) — never a fabricated zero, because zero
   * completions and no data are different facts and only one of them should be
   * reported as a change.
   */
  readonly previousCompleted: number | null;
}

/**
 * The last seven owner-calendar days of created-vs-completed task counts.
 *
 * The day boundaries are computed HERE, in the owner's timezone, and handed to
 * the repository as UTC instant ranges — so "Monday" means the owner's Monday
 * and the SQL carries no calendar assumption (AUDIT-14).
 */
export async function loadActivityTrend(
  scope: WorkspaceScope,
  facts: { readonly timezone: string; readonly todayIso: string },
): Promise<TodayActivityTrend | null> {
  const days: {
    readonly dateIso: string;
    readonly startsAt: Date;
    readonly endsAt: Date;
  }[] = [];
  /*
   * FOURTEEN days are read, and only the last seven are charted.
   *
   * The summary strip states the last seven days' completions AND how that
   * compares with the seven before, which is the shape the reference draws and
   * the only version of the number that means anything on its own — "24
   * completed" is not a signal until you know the week before was 16. Both
   * spans are rolling rather than calendar weeks, and every label that states
   * them says so. The extra week costs the same single
   * bounded query (`countTaskActivityByDay` takes the day list), so there is no
   * second round trip and no new repository method.
   */
  for (let offset = TODAY_TREND_DAYS * 2 - 1; offset >= 0; offset -= 1) {
    const dateIso = addDaysToIsoDate(facts.todayIso, -offset);
    const nextIso = addDaysToIsoDate(dateIso, 1);
    const startsAt = ownerLocalToUtc(`${dateIso}T00:00`, facts.timezone);
    const endsAt = ownerLocalToUtc(`${nextIso}T00:00`, facts.timezone);
    // A nonexistent local midnight (a spring-forward transition) yields null.
    // Skipping the day is honest; inventing a boundary would silently shift a
    // day's counts into its neighbour.
    if (startsAt === null || endsAt === null) continue;
    days.push({ dateIso, startsAt, endsAt });
  }
  if (days.length === 0) return null;

  const counts = await scope.tasks.countTaskActivityByDay({ days });

  /*
   * Split on the DATE, not on a fixed index.
   *
   * A DST-collapsed local midnight is skipped above, so `counts` is not
   * guaranteed to be fourteen long and "the last seven entries" is not
   * guaranteed to be the last seven days. Partitioning by the cutover date is
   * correct whatever the calendar did.
   */
  const cutoverIso = addDaysToIsoDate(facts.todayIso, -(TODAY_TREND_DAYS - 1));
  const current = counts.filter((day) => day.dateIso >= cutoverIso);
  const earlier = counts.filter((day) => day.dateIso < cutoverIso);

  const totalCreated = current.reduce((sum, day) => sum + day.created, 0);
  const totalCompleted = current.reduce((sum, day) => sum + day.completed, 0);
  const previousCompleted =
    earlier.length === 0
      ? null
      : earlier.reduce((sum, day) => sum + day.completed, 0);

  // A week in which nothing at all happened has no trend to show. Rendering an
  // empty chart would be the dashboard clutter Today is explicitly told to avoid.
  if (totalCreated === 0 && totalCompleted === 0) return null;
  return { days: current, totalCreated, totalCompleted, previousCompleted };
}
