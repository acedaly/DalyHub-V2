/**
 * TODAY-04 — the planning view-model (pure, React-free, testable).
 *
 * Planning is the deliberate use of a task's EXISTING scheduled date as the owner's
 * commitment ("I intend to work on this today"). This module owns the small,
 * deterministic derivations that turn the workspace-scoped task list into the
 * planning sections the Today surface renders — bucketing by the scheduled date
 * relative to the owner's calendar day, the lightweight planning summary, and the
 * date arithmetic behind the quick actions (Today / Tomorrow / Next week).
 *
 * Everything here is a pure function of typed data plus the owner's calendar date
 * (`todayIso`, `YYYY-MM-DD`), so it can be unit-tested directly and renders the same
 * on the server and the client. Dates are date-only and compared as strings
 * (lexicographic order == chronological order for `YYYY-MM-DD`); the only `Date`
 * use is deterministic UTC arithmetic on a date-only value, never a timezone shift.
 */

import type { TaskRelation } from "~/kernel/tasks";

// PROJ-01: the quick-plan date arithmetic was re-homed to the Tasks module so the
// re-homed Task record Drawer owns it without depending on Today. Re-exported here so
// Today's existing `planTargets`/`PlanTargets`/`addCalendarDays` importers are unchanged.
import type { PlanTargets } from "~/shared/task-record/plan-targets";
export {
  addCalendarDays,
  planTargets,
} from "~/shared/task-record/plan-targets";
export type { PlanTargets };

/** A task as shown in a planning section (display data only, no `Date`s). */
export interface PlanningTaskItem {
  readonly id: string;
  readonly title: string;
  /** The structural parent (Project/Area) context line, or null. */
  readonly parent: TaskRelation | null;
  /** The scheduled (planned) date `YYYY-MM-DD`, or null when unplanned. */
  readonly scheduledDate: string | null;
  /** The due date `YYYY-MM-DD`, or null. Planning never changes this. */
  readonly dueDate: string | null;
  /** Whether the task is complete (the spine's completion truth). */
  readonly completed: boolean;
  /**
   * The owner-calendar date of completion (`YYYY-MM-DD`), or null when not
   * completed. Resolved in the owner's timezone by the loader (completion is a UTC
   * instant), so "completed today" matches the owner's day, not the UTC runtime's.
   */
  readonly completedDate: string | null;
}

/** The planning sections, each a bounded, deterministically-ordered list. */
export interface PlanningBuckets {
  /** Open tasks planned for a past day (a slipped commitment to re-plan). */
  readonly overdue: readonly PlanningTaskItem[];
  /** Open tasks planned for today — the day's commitment. */
  readonly today: readonly PlanningTaskItem[];
  /** Open tasks planned for a future day. */
  readonly upcoming: readonly PlanningTaskItem[];
  /** Open tasks with no committed day yet (the backlog to plan from). */
  readonly anytime: readonly PlanningTaskItem[];
  /** Tasks completed today (shown collapsed; completion is never planning). */
  readonly completedToday: readonly PlanningTaskItem[];
}

/** A lightweight, calm planning summary — operational awareness, not analytics. */
export interface PlanningSummary {
  /** Tasks planned for today (the day's commitment). */
  readonly planned: number;
  /** Open tasks planned for a past day. */
  readonly overdue: number;
  /** Tasks waiting on someone/something (independent of planning). */
  readonly waiting: number;
  /** Tasks completed today. */
  readonly completedToday: number;
}

/** Stable string comparison (lexicographic == chronological for `YYYY-MM-DD`). */
function byString(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Compare two nullable dates, nulls LAST, then by id for a total order. */
function byDateThenId(
  aDate: string | null,
  bDate: string | null,
  aId: string,
  bId: string,
): number {
  if (aDate !== bDate) {
    if (aDate === null) return 1;
    if (bDate === null) return -1;
    return byString(aDate, bDate);
  }
  return byString(aId, bId);
}

/**
 * Bucket open + completed-today tasks into the planning sections by their scheduled
 * date relative to the owner's calendar day (`todayIso`). Waiting tasks are assumed
 * already excluded by the caller (blocked work is not planned work, ADR-029) — a
 * defensive `waiting` flag is not part of this shape. Completed tasks appear ONLY in
 * `completedToday` (completion is never planning); a task completed on a prior day
 * is omitted entirely. Each bucket is deterministically ordered.
 */
export function bucketPlanning(
  items: readonly PlanningTaskItem[],
  todayIso: string,
): PlanningBuckets {
  const overdue: PlanningTaskItem[] = [];
  const today: PlanningTaskItem[] = [];
  const upcoming: PlanningTaskItem[] = [];
  const anytime: PlanningTaskItem[] = [];
  const completedToday: PlanningTaskItem[] = [];

  for (const item of items) {
    if (item.completed) {
      if (item.completedDate === todayIso) {
        completedToday.push(item);
      }
      continue;
    }
    const scheduled = item.scheduledDate;
    if (scheduled === null) {
      anytime.push(item);
    } else if (scheduled < todayIso) {
      overdue.push(item);
    } else if (scheduled === todayIso) {
      today.push(item);
    } else {
      upcoming.push(item);
    }
  }

  // Overdue: oldest slipped plan first. Today/Anytime: soonest due first, nulls
  // last. Upcoming: soonest planned first. Completed: newest completion first.
  overdue.sort((a, b) =>
    byDateThenId(a.scheduledDate, b.scheduledDate, a.id, b.id),
  );
  upcoming.sort((a, b) =>
    byDateThenId(a.scheduledDate, b.scheduledDate, a.id, b.id),
  );
  today.sort((a, b) => byDateThenId(a.dueDate, b.dueDate, a.id, b.id));
  anytime.sort((a, b) => byDateThenId(a.dueDate, b.dueDate, a.id, b.id));
  completedToday.sort((a, b) => byString(a.id, b.id));

  return { overdue, today, upcoming, anytime, completedToday };
}

/** Derive the calm planning summary from the buckets and the waiting count. */
export function planningSummary(
  buckets: PlanningBuckets,
  waitingCount: number,
): PlanningSummary {
  return {
    planned: buckets.today.length,
    overdue: buckets.overdue.length,
    waiting: waitingCount,
    completedToday: buckets.completedToday.length,
  };
}

/**
 * The complete planning payload the Today surface renders: the buckets, the calm
 * summary and the quick-plan target dates. JSON-safe (no `Date`s), so it crosses a
 * loader boundary unchanged. Defined here (not in the route) so the pure view-model
 * and the dashboard share one shape with no circular import.
 */
export interface PlanningData {
  readonly summary: PlanningSummary;
  readonly targets: PlanTargets;
  readonly overdue: readonly PlanningTaskItem[];
  readonly today: readonly PlanningTaskItem[];
  readonly upcoming: readonly PlanningTaskItem[];
  readonly anytime: readonly PlanningTaskItem[];
  readonly completedToday: readonly PlanningTaskItem[];
}
