/**
 * FOLLOW-01 — the workspace-bound read contract behind the bounded Activity
 * window.
 *
 * Storage-independent and WORKSPACE-BOUND like every other kernel repository
 * (ADR-010): no method takes a `workspaceId`, so module code cannot select or
 * override the scope.
 *
 * It owns exactly one thing — **bounded reads over data that already exists**.
 * There is no write method here and there never will be: [ADR-110] makes
 * follow-through derived rather than stored, so this repository has nothing of
 * its own to persist, no table, no column and no migration behind it. What it
 * reads is the append-only Activity stream (ADR-005/ADR-012) and the Task's own
 * canonical `scheduled_date` (ADR-030).
 *
 * ── Why this is a repository of its own ─────────────────────────────────────
 * FOLLOW-02 is already specified to answer a different question over the SAME
 * window — did a Goal move? — from the same stream. Putting the window read
 * inside a Review component or a planning loader would mean it either gets
 * copied or gets reverse-engineered from a surface. It is product machinery, so
 * it lives where the kernel's other read contracts live.
 */

import type { ActivityWindow } from "./activity-window";
import type { TaskPlanEvent, TaskPlanSubject } from "./task-plan-history";

/**
 * The most Tasks one window read will describe.
 *
 * A hundred is far more than a week of one person's plan holds, and it is a
 * CEILING rather than an expectation: past it the account says so
 * (`bounded: true`) instead of quietly presenting a partial week as a whole one.
 * It also keeps the second statement's work proportional to the first's.
 */
export const MAX_WINDOW_TASKS = 100;

/**
 * The most plan-history events one window read will return.
 *
 * Six per Task at the ceiling above, which is a great many reschedules. The
 * bound exists so a pathological history cannot turn a page load into a scan;
 * hitting it reports `bounded` for the same reason.
 */
export const MAX_WINDOW_EVENTS = 600;

/** What one window read returns: the Tasks, their history, and the bound. */
export interface TaskPlanWindowRead {
  readonly subjects: readonly TaskPlanSubject[];
  readonly events: readonly TaskPlanEvent[];
  /** True when either bound was reached — the account then says so. */
  readonly bounded: boolean;
}

export interface ActivityWindowRepository {
  /**
   * Everything needed to reconstruct what became of the work a named period's
   * plan held — in a FIXED number of statements, whatever the period holds.
   *
   * The Task set is the union of three arms, each of which is an indexed scan
   * and each of which is necessary:
   *
   *   1. Tasks whose plan points at a day inside the period NOW. This is the
   *      ordinary case, and it is the one that covers a Task planned into the
   *      period before it began and never touched since — including one created
   *      with a planned day, which emits no planning event at all.
   *   2. Tasks with a planning or completion event INSIDE the period. This is
   *      what catches work placed, moved, cleared or finished while the period
   *      was live, and it is bounded by the period itself.
   *   3. Tasks whose FIRST planning event after the period moved the plan OFF a
   *      day inside it. Without this arm a Task the owner committed to on
   *      Wednesday and re-planned the following Monday vanishes from the week it
   *      was committed to — which is precisely the disappearance this feature
   *      exists to end. For a period that has not closed yet the arm is empty by
   *      construction.
   *
   * Ancestry (`parent`) is resolved from the CURRENT spine links, the same
   * documented approximation REVIEW-03's contribution read makes and states.
   */
  readTaskPlanWindow(
    window: ActivityWindow,
    limits?: {
      readonly tasks?: number;
      readonly events?: number;
    },
  ): Promise<TaskPlanWindowRead>;
}
