/**
 * V2.7 RECALL-04 — the Review record's PERIOD CONTEXT: four lists, each one
 * about the period the Review names (DEBT-235).
 *
 * ── What this file used to do, and why it was a quiet untruth ───────────────
 * Every list here sat under a historic period's heading, and none of them was a
 * period query:
 *
 *   - **Completed tasks** read the `completed` system view at `limit: 50` with
 *     no sort, which defaults to `smart` — priority-then-due over the
 *     workspace's ENTIRE completed history — and then filtered those fifty rows
 *     in JavaScript for the period. A busy owner's Review could legitimately
 *     render an empty "Completed tasks" list under copy claiming completeness,
 *     because the fifty highest-priority completions of all time happened not to
 *     fall inside the week.
 *   - **Open tasks** read the `overdue` view, which is bound to TODAY in SQL,
 *     and drew today's overdue backlog under a heading about last March.
 *   - **Diary and Meetings** took fifty recent rows and filtered them in JS,
 *     with no bound signal, so a truncated answer and a complete one were the
 *     same list.
 *
 * All four are now **period predicates in SQL, bounded AFTER the predicate**,
 * and each list carries whether it truncated so the surface can say so. One
 * statement per list; no JS filtering of a history-wide page anywhere.
 *
 * ── The completion window is RECALL-02's, not a second one ──────────────────
 * Completed Tasks are read through the declarative `completedFrom`/`completedTo`
 * window and the `completed` sort — `spine_records.completed_at`, the one
 * completion-time authority (ADR-114 decision 4). Not `updated_at` (edit time
 * moves when a Task is retitled, which is DEBT-230's defect), not Activity
 * events (they survive a reopen and double-count), and not the `smart` order
 * (it answers "what should I do next?", which is not a question about a period
 * that has already ended).
 *
 * ── The open/overdue decision, taken and recorded ───────────────────────────
 * RECALL-04 left implementation one choice: scope this list to a period question
 * it can honestly answer, or rename it to the truth it shows. **It is renamed.**
 * DalyHub stores no plan membership — ADR-110 decision 3 keeps the period
 * account DERIVED and refuses a snapshot table for a plan — so "still open from
 * this period's plan" has no stored fact behind it, and answering it would mean
 * inventing history the product deliberately does not keep. What the query can
 * answer truthfully is the CURRENT state, so the heading says `now`, the list is
 * labelled as current, and it no longer implies anything about the period. A
 * historic Review therefore shows: what you finished then, and what is open
 * today — two clearly separated time words rather than one blurred one.
 *
 * ── Owner calendar, once ────────────────────────────────────────────────────
 * The period is a pair of owner-calendar dates. Tasks take them as dates (the
 * repository resolves the owner's day bounds itself, HARDEN-06C F-05); Diary and
 * Meetings take INSTANTS, resolved here through `ownerDayStartInstant` — the one
 * shared helper — from the owner's midnight to the start of the day after the
 * period's last, so a 23:50 entry on the final day is inside the window and a
 * 00:10 entry on the day after is not.
 */

import { addDaysToIsoDate } from "~/kernel/alignment";
import type { WorkspaceScope } from "~/platform/workspaces";
import { ownerCalendarIso, ownerDayStartInstant } from "~/shared/datetime";

/**
 * How many rows one period list returns.
 *
 * The Review's existing contract, unchanged — what changed is WHEN it is
 * applied: after the period predicate, in SQL, rather than to a history-wide
 * page that was then filtered.
 */
export const REVIEW_PERIOD_CONTEXT_LIMIT = 50;

export interface ReviewContextItem {
  readonly id: string;
  readonly title: string;
  readonly dateLabel: string;
  readonly target:
    | { readonly kind: "route"; readonly to: string }
    | { readonly kind: "drawer"; readonly drawerKey: string };
}

/**
 * One bounded list, with its bound stated.
 *
 * `bounded` is the honest saturation signal ADR-114 decision 6 requires: a list
 * that truncated says so, and one that did not makes no claim it cannot support.
 * Every list here reaches its bound the same way — the read asks for one row
 * more than it will show, so a full page and a period of exactly that size are
 * distinguishable (the `limit + 1` idiom Analytics and the Review's insight
 * context already use).
 */
export interface ReviewContextList {
  readonly items: readonly ReviewContextItem[];
  readonly bounded: boolean;
}

export interface ReviewPeriodContext {
  /** Tasks COMPLETED inside the period, most recently completed first. */
  readonly completedTasks: ReviewContextList;
  /**
   * Tasks open and overdue **now** — a current-state list, deliberately not a
   * period one. See the module note for the recorded decision.
   */
  readonly openNowTasks: ReviewContextList;
  /** Diary entries that OCCURRED inside the period, newest first. */
  readonly diaryEntries: ReviewContextList;
  /** Meetings that STARTED inside the period, earliest first. */
  readonly meetings: ReviewContextList;
  readonly note: string;
}

/** Cut a `limit + 1` read down to its page, and say whether it truncated. */
function boundedList(
  rows: readonly ReviewContextItem[],
  limit = REVIEW_PERIOD_CONTEXT_LIMIT,
): ReviewContextList {
  return { items: rows.slice(0, limit), bounded: rows.length > limit };
}

export async function loadReviewPeriodContext(
  scope: WorkspaceScope,
  input: {
    readonly periodStart: string;
    readonly periodEnd: string;
    readonly today: string;
    readonly timezone: string;
  },
): Promise<ReviewPeriodContext> {
  const ask = REVIEW_PERIOD_CONTEXT_LIMIT + 1;
  /*
   * The period as INSTANTS, for the two reads that take instants. The upper
   * bound is the start of the day AFTER the period's last day, used exclusively
   * by Meetings and one millisecond short of it (inclusively) by Diary — the two
   * repositories' own documented conventions, applied to one window.
   */
  const periodFrom = ownerDayStartInstant(input.periodStart, input.timezone);
  const periodUntil = ownerDayStartInstant(
    addDaysToIsoDate(input.periodEnd, 1),
    input.timezone,
  );

  const [completedTasks, openNowTasks, diaryPage, meetingRows] =
    await Promise.all([
      scope.tasks.listWorkspaceTasks({
        view: "completed",
        /*
         * V2.7 RECALL-02's window and sort — the dependency RECALL-04 was
         * sequenced behind. The predicate is in SQL and the limit is applied
         * after it, so these are the period's completions rather than whatever
         * the workspace's fifty highest-priority completions happened to be.
         */
        filters: {
          completedFrom: input.periodStart,
          completedTo: input.periodEnd,
        },
        sort: "completed",
        limit: ask,
        todayIso: input.today,
        timezone: input.timezone,
      }),
      scope.tasks.listWorkspaceTasks({
        // Current state, named as such by the surface. See the module note.
        view: "overdue",
        limit: ask,
        todayIso: input.today,
        timezone: input.timezone,
      }),
      scope.diary.list({
        order: "newest",
        occurredFrom: periodFrom,
        // Inclusive upper bound: the last instant of the period's final day.
        occurredTo: new Date(periodUntil.getTime() - 1),
        limit: ask,
      }),
      scope.meetings.listStartingBetween({
        from: periodFrom,
        // Exclusive upper bound, as this read documents it.
        to: periodUntil,
        limit: ask,
      }),
    ]);

  const completed = boundedList(
    completedTasks.items.map((task) => ({
      id: task.id,
      title: task.title,
      dateLabel:
        task.completedAt === null
          ? ""
          : ownerCalendarIso(task.completedAt, input.timezone),
      target: { kind: "drawer" as const, drawerKey: `task:${task.id}` },
    })),
  );

  const openNow = boundedList(
    openNowTasks.items.map((task) => ({
      id: task.id,
      title: task.title,
      dateLabel: task.dueDate ? `Due ${task.dueDate}` : "Open",
      target: { kind: "drawer" as const, drawerKey: `task:${task.id}` },
    })),
  );

  const diaryEntries = boundedList(
    diaryPage.items.map((entry) => {
      // The canonical Diary deep link (the same shape Search and Quick Capture
      // emit): the shared Inspector param opens the entry's view panel, and the
      // explicit day-mode date puts the timeline behind it on the entry's own
      // day rather than today's.
      const day = ownerCalendarIso(entry.occurredAt, input.timezone);
      return {
        id: entry.id,
        title: entry.title,
        dateLabel: day,
        target: {
          kind: "route" as const,
          to: `/diary?mode=day&date=${encodeURIComponent(day)}&inspector=${encodeURIComponent(`view:${entry.id}`)}`,
        },
      };
    }),
  );

  const meetings = boundedList(
    meetingRows.map((meeting) => ({
      id: meeting.id,
      title: meeting.title,
      dateLabel: ownerCalendarIso(meeting.startsAt, input.timezone),
      target: {
        kind: "route" as const,
        to: `/meeting/${encodeURIComponent(meeting.id)}`,
      },
    })),
  );

  return {
    completedTasks: completed,
    openNowTasks: openNow,
    diaryEntries,
    meetings,
    note: "Live period context is read from the source modules. Review storage keeps authored reflection and links, not copied task, diary or meeting content.",
  };
}
