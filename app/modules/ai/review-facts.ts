/**
 * AI-01 — the Weekly Review assistant's facts, calculated by DalyHub.
 *
 * Bounded and deterministic: a small number of repository reads, no per-record
 * follow-up query, and no model involvement. These numbers are what the assistant
 * is told to treat as authoritative — it restates them, it never recomputes them,
 * and it cannot contradict them without contradicting the block it was given.
 */

import type { WeeklyReviewFacts } from "~/platform/ai";
import type { WorkspaceScope } from "~/platform/workspaces";
import { ownerCalendarIso } from "~/shared/datetime";

/** How many rows any single read here may return. */
const LIMIT = 200;

/**
 * Compute the period facts for one weekly Review.
 *
 * Every read degrades to zero rather than throwing: a Review assistant that
 * cannot be generated is a small disappointment, but a Review the owner cannot
 * open is a broken product.
 */
export async function computeWeeklyReviewFacts(
  scope: WorkspaceScope,
  periodStart: string,
  periodEnd: string,
  todayIso: string,
  /**
   * HARDEN-06C (F-14) — the owner's IANA zone, so a completion is placed on the
   * day the OWNER completed it.
   *
   * `periodStart`/`periodEnd` are the Review's own owner-calendar dates while
   * `completedAt` and `startsAt` are UTC instants, and this filter used to
   * compare the two directly. For the default Sydney owner the assistant could
   * therefore report a different "tasks completed this week" from the Review it
   * was describing, at both boundaries — a number the owner cannot reconcile
   * with the record in front of them, which is worse than no number at all.
   */
  timezone: string,
): Promise<WeeklyReviewFacts> {
  const [openTasks, planning, meetings] = await Promise.all([
    safe(() => scope.tasks.listTasks({ limit: LIMIT })),
    // Completions come from the PLANNING query, not from `listTasks({
    // includeCompleted: true })`. `listTasks` orders open rows first
    // (`ORDER BY (sr.completed_at IS NOT NULL) ASC, …`), so in a workspace with
    // LIMIT-or-more open Tasks the page is entirely open work and the period's
    // completions are invisible — the assistant would report "0 completed" for
    // precisely the busy weeks where the number matters most. TODAY-04's
    // planning query fetches its completed band INDEPENDENTLY and most-recent
    // first, which is the bound this needs.
    safe(() =>
      scope.tasks.listPlanningTasks({
        todayIso,
        scheduledLimit: 1,
        backlogLimit: 1,
        completedLimit: LIMIT,
      }),
    ),
    safe(() => scope.meetings.list({ view: "recent", limit: 50 })),
  ]);

  const open = (openTasks?.items ?? []).filter(
    (task) => task.completedAt === null,
  );
  const completedInPeriod = (planning?.items ?? []).filter((task) => {
    if (task.completedAt === null) return false;
    const day = ownerCalendarIso(task.completedAt, timezone);
    return day >= periodStart && day <= periodEnd;
  });
  const meetingsInPeriod = (meetings?.items ?? []).filter((meeting) => {
    const day = ownerCalendarIso(meeting.startsAt, timezone);
    return day >= periodStart && day <= periodEnd;
  });

  const parents = new Set(
    open
      .map((task) => task.parent?.id)
      .filter((id): id is string => typeof id === "string"),
  );

  return {
    periodStart,
    periodEnd,
    tasksCompleted: completedInPeriod.length,
    tasksOverdue: open.filter(
      (task) => task.dueDate !== null && task.dueDate < todayIso,
    ).length,
    inboxRemaining: open.filter((task) => task.parent === null).length,
    activeProjects: parents.size,
    // "Stalled" and "no next action" are PROJ-02 concepts the guided Review
    // computes with its own evaluator. The assistant does not re-derive them
    // here; it reports what this bounded read can honestly support and says
    // nothing about the rest.
    stalledProjects: 0,
    projectsWithoutNextAction: 0,
    waitingTasks: open.filter((task) => task.waiting !== null).length,
    meetingsHeld: meetingsInPeriod.length,
    diaryEntries: 0,
    goalsWithActivity: 0,
    goalsWithoutActivity: 0,
  };
}

async function safe<T>(run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch {
    return null;
  }
}
