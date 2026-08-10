/**
 * GOAL-02 — Today's Goal Progress and workload-trend reads.
 *
 * Both answer questions Today already exists to answer, so both are held to the
 * surface's own rules: every figure is real, a zero never paints, and a section
 * with nothing to say does not render.
 *
 * ── What Today shows, and why those Goals ───────────────────────────────────
 * Not every Goal. Today asks *which Goals deserve my attention today?*, and the
 * ranking is four rules an owner could recite:
 *
 *   1. a Goal the product would call **Needs attention** or **Overdue** first —
 *      it is behind its own schedule or past its own date;
 *   2. then a Goal whose **target date is close** (inside a month);
 *   3. then a Goal that has not been **checked in** for a week;
 *   4. then the most **recently measured**, because momentum is worth seeing.
 *
 * A Goal that has just reached its target appears once — it is the most useful
 * thing the section can say that day — and never again after it is completed.
 * There is no hidden scoring function and no weighting to tune.
 *
 * ── What it costs ──────────────────────────────────────────────────────────
 * A bounded page of Goals, then THREE grouped reads over that page's ids
 * (configuration, measurement summaries, milestone weights). No history is
 * loaded, and there is no query per Goal (AGENTS.md §16).
 */

import { addDaysToIsoDate } from "~/kernel/alignment";
import { UNMEASURED_GOAL, type GoalProgressEvaluation } from "~/kernel/goals";
import type { TaskActivityDayCount } from "~/kernel/tasks";
import type { WorkspaceScope } from "~/platform/workspaces";
import { ownerCalendarIso, ownerLocalToUtc } from "~/shared/datetime";
import {
  evaluateGoalFromSummary,
  goalCheckInDue,
  goalNeedsAttention,
} from "~/shared/goal-progress";

/* -------------------------------------------------------------------------- */
/* Goal progress                                                               */
/* -------------------------------------------------------------------------- */

/**
 * How many Goals are READ before ranking. A small multiple of what is shown, so
 * the ranking has something to choose from without the read growing with the
 * workspace.
 */
const GOAL_SCAN_LIMIT = 12;

/** How many make it onto the surface. Four is the most a rail can hold without
 * becoming a second collection. */
export const TODAY_GOAL_LIMIT = 4;

/** The window the card's "this month" figure compares against. */
const COMPARISON_WINDOW_DAYS = 30;

/** "Approaching" — a target date inside a month is close enough to act on. */
const TARGET_SOON_DAYS = 30;

/** One Goal on Today. JSON-safe. */
export interface TodayGoal {
  readonly id: string;
  readonly title: string;
  readonly areaTitle: string;
  /**
   * UIX-03 — the Area's identity, so Today draws a Goal with the SAME mark and
   * accent the Goals gallery draws it with.
   *
   * Today used to derive a tone from a hash of the Goal's id, on the stated
   * ground that "a Goal carries no persisted icon or colour of its own". That
   * premise is no longer true: a Goal inherits its Area's identity, which every
   * Goal read now resolves. A deterministic-but-arbitrary colour was stable, and
   * stable is not the same as MEANINGFUL — the same Goal was green on Today and
   * grey in the gallery, and neither colour said anything.
   */
  readonly areaColourRank: number | null;
  readonly areaIconKey: string | null;
  readonly progress: GoalProgressEvaluation;
  /** The change since the comparison reading, e.g. `-0.3`. `null` when there is
   * no earlier reading to compare with — never a fabricated zero. */
  readonly changeInWindow: number | null;
  readonly windowDays: number;
}

/** The display rank. Lower sorts first. Deliberately four explicable buckets. */
export function todayGoalRank(
  goal: TodayGoal,
  todayIso: string,
): 0 | 1 | 2 | 3 {
  if (goalNeedsAttention(goal.progress.status)) return 0;
  if (goal.progress.targetDate !== null) {
    const days = daysUntil(todayIso, goal.progress.targetDate);
    if (days !== null && days >= 0 && days <= TARGET_SOON_DAYS) return 1;
  }
  if (goalCheckInDue(goal.progress)) return 2;
  return 3;
}

function daysUntil(fromIso: string, toIso: string): number | null {
  const parse = (iso: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    return match
      ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
      : null;
  };
  const a = parse(fromIso);
  const b = parse(toIso);
  return a === null || b === null ? null : Math.round((b - a) / 86_400_000);
}

/**
 * The measurable Goals worth a look today.
 *
 * Unmeasured Goals are excluded ENTIRELY — not shown as 0%. A Goal DalyHub has
 * not been told how to measure has nothing to report here, and the section's own
 * empty state says so once rather than listing several Goals that each say
 * nothing. A completed Goal is excluded too: Today is about what is still moving.
 */
export async function loadTodayGoals(
  scope: WorkspaceScope,
  facts: {
    readonly now: Date;
    readonly timezone: string;
    readonly todayIso: string;
    readonly recentBoundaryStartIso: string;
  },
): Promise<readonly TodayGoal[]> {
  const page = await scope.goals.listGoalsByAlignment({
    activeBoundaryIso: facts.recentBoundaryStartIso,
  });
  const items = page.items
    .filter((item) => item.completedAt === null)
    .slice(0, GOAL_SCAN_LIMIT);
  const ids = items.map((item) => item.id);
  if (ids.length === 0) return [];

  const comparisonFromIso = addDaysToIsoDate(
    facts.todayIso,
    -COMPARISON_WINDOW_DAYS,
  );
  const [detailsById, summaries, milestoneSummaries] = await Promise.all([
    scope.goalDetails.listMany(ids),
    scope.goalMeasurements.listMeasurementSummaries(ids, { comparisonFromIso }),
    scope.goalMeasurements.listMilestoneSummaries(ids),
  ]);

  const goals: TodayGoal[] = [];
  for (const item of items) {
    const details = detailsById.get(item.id);
    const config = details?.measurement ?? UNMEASURED_GOAL;
    if (config.type === null) continue;
    const summary = summaries.get(item.id) ?? null;
    const progress = evaluateGoalFromSummary({
      config,
      targetDate: details?.targetDate ?? null,
      summary,
      milestones: milestoneSummaries.get(item.id),
      startedOn: ownerCalendarIso(item.createdAt, facts.timezone),
      completed: false,
      todayIso: facts.todayIso,
    });
    // Nothing recorded yet is a real state, but it is not progress — Today shows
    // Goals that are moving, and the Goals collection is where an unstarted one
    // is picked up.
    if (progress.current === null) continue;
    const prior = summary?.priorInWindow ?? null;
    goals.push({
      id: item.id,
      title: item.title,
      areaTitle: item.area.title,
      areaColourRank: item.area.colourRank ?? null,
      areaIconKey: item.area.iconKey ?? null,
      progress,
      changeInWindow:
        prior !== null && summary?.latest
          ? summary.latest.value - prior.value
          : null,
      windowDays: COMPARISON_WINDOW_DAYS,
    });
  }

  return goals
    .map((goal, index) => ({ goal, index }))
    .sort((a, b) => {
      const rank =
        todayGoalRank(a.goal, facts.todayIso) -
        todayGoalRank(b.goal, facts.todayIso);
      // The repository's alignment order is the stable tiebreak, so two Goals in
      // the same bucket keep the order the collection would show them in.
      return rank !== 0 ? rank : a.index - b.index;
    })
    .slice(0, TODAY_GOAL_LIMIT)
    .map((entry) => entry.goal);
}

/* -------------------------------------------------------------------------- */
/* Workload trend                                                              */
/* -------------------------------------------------------------------------- */

/** How many days the trend covers. A week: the period a workload is felt over. */
export const TODAY_TREND_DAYS = 7;

export interface TodayActivityTrend {
  /** Oldest first, one entry per day, zeroes included. */
  readonly days: readonly TaskActivityDayCount[];
  readonly totalCreated: number;
  readonly totalCompleted: number;
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
  for (let offset = TODAY_TREND_DAYS - 1; offset >= 0; offset -= 1) {
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
  const totalCreated = counts.reduce((sum, day) => sum + day.created, 0);
  const totalCompleted = counts.reduce((sum, day) => sum + day.completed, 0);
  // A week in which nothing at all happened has no trend to show. Rendering an
  // empty chart would be the dashboard clutter Today is explicitly told to avoid.
  if (totalCreated === 0 && totalCompleted === 0) return null;
  return { days: counts, totalCreated, totalCompleted };
}
