/**
 * PLAN-01 — the Weekly Planning loader ⇄ screen contract (pure data, JSON-safe).
 *
 * Everything the planning surface draws, resolved SERVER-side and serialised. The
 * screen performs no date arithmetic against a browser clock, derives no
 * membership rule of its own and reads no repository — which is what keeps the
 * owner's timezone, the week's boundaries and the queue's rule in exactly one
 * place (the loader and the pure kernel it calls).
 *
 * Nothing here is a stored record. A planning week has no row of its own: the
 * Task's canonical `scheduled_date` IS the plan (ADR-030), so this contract is a
 * PROJECTION of Tasks, calendar occurrences, Project health and one Review's
 * written focus — never a second copy of any of them.
 */

import type {
  PlanAccountFact,
  TaskPlanOutcome,
} from "~/kernel/activity-window";
import type { DaySchedule } from "~/kernel/calendar";
import type { HabitWeekSummaryItem } from "~/platform/habits/habit-facts.server";
import type {
  PlanningQueueBand,
  PlanningWeek,
  PlanningWeekTotals,
} from "~/kernel/planning";
import type { TaskDensity } from "~/kernel/task-views";
import type { SerializedTaskListItem } from "~/shared/task-record/task-view";
import type { TaskParentOption } from "~/shared/task-record/TaskRowFields";

/** One day of the shown week, with everything drawn against it. */
export interface PlanDay {
  readonly dateIso: string;
  readonly weekdayShort: string;
  readonly weekdayLong: string;
  readonly dayNumber: string;
  readonly fullLabel: string;
  readonly isToday: boolean;
  readonly isPast: boolean;
  readonly isWeekend: boolean;
  /** The owner's existing commitments — CONTEXT, never Tasks (PLAN-01 §B4). */
  readonly schedule: DaySchedule;
  /** The Tasks PLANNED for this day, in the canonical serialised shape. */
  readonly tasks: readonly SerializedTaskListItem[];
  /** How many of `tasks` are open and blocked (waiting), for the day's own line. */
  readonly waitingCount: number;
  /** How many of `tasks` are already complete. */
  readonly completedCount: number;
  /**
   * UX-02 — how many minutes of this day the calendar already holds.
   *
   * Timed commitments only: an all-day item is a day something is true on, not a
   * block of time, so it contributes nothing (`planningEntryMinutes`). Zero is a
   * real answer and the column says "No commitments" in words rather than "0m".
   */
  readonly commitmentMinutes: number;
}

/**
 * One entry of the "Still to place" queue: a Task and the reason it is there.
 *
 * `band` is `null` when the queue's source is one of the owner's SAVED VIEWS: the
 * reason that Task is in the queue is the view they chose, not one of the built-in
 * rule's bands, and naming a band there would state a rule that never ran.
 */
export interface PlanQueueItem {
  readonly task: SerializedTaskListItem;
  readonly band: PlanningQueueBand | null;
  /** The band's owner-facing word, resolved once server-side. Null with `band`. */
  readonly bandLabel: string | null;
}

/**
 * A Project planning gap, derived from the EXISTING PROJ-02 health semantics and
 * the week's own planned Tasks. There is no second health formula and no second
 * definition of a next action.
 */
export interface PlanProjectSignal {
  readonly projectId: string;
  readonly title: string;
  /** The PROJ-02 health state, verbatim. */
  readonly health: string;
  /** The gap, as a closed vocabulary the screen renders words for. */
  readonly gap: "no_next_action" | "nothing_planned" | "overdue_work";
  /** The Project's own next action, when it has one (never invented). */
  readonly nextAction: { readonly id: string; readonly title: string } | null;
  /** How many of the Project's open Tasks are past their date. */
  readonly overdueCount: number;
}

/**
 * A Goal with no planned supporting action this week.
 *
 * Derived ONLY from the existing relationship projection: a Task planned in the
 * week whose parent Project advances the Goal. There is no contribution score and
 * no requirement that work belong to a Goal — a Goal with no signal is simply not
 * listed (PLAN-01 §B9).
 */
export interface PlanGoalSignal {
  readonly goalId: string;
  readonly title: string;
}

/**
 * FOLLOW-01 — the account of the shown week, resolved once server-side.
 *
 * Weekly Planning states what the owner is committing to; this states what has
 * become of it. Both are projections of the SAME Tasks — there is still no
 * planning record, no plan snapshot and no adherence column ([ADR-110]) — and
 * every word here is the shared kernel's, so `/plan` and the weekly Review
 * cannot describe the same week differently.
 *
 * The screen renders these strings and derives nothing: the outcome rules, the
 * counts and the wording all arrive already decided, which is what keeps them
 * testable without a browser and identical in both consumers.
 */
export interface PlanAccountEntry {
  readonly taskId: string;
  readonly title: string;
  /** The kernel's closed outcome vocabulary — a grouping key, not display text. */
  readonly outcome: TaskPlanOutcome;
  /** Why, in the owner's own date format: the dates the outcome was read from. */
  readonly reason: string;
  /** Never reduced to a boolean: "moved once" and "moved four times" differ. */
  readonly reschedules: number;
}

export interface PlanAccount {
  /** The one sentence the week's glance bar shows. */
  readonly headline: string;
  /** What moved, or null when nothing did. Never "0 changes". */
  readonly movement: string | null;
  /** The non-zero lines behind the headline, in the kernel's fixed order. */
  readonly facts: readonly PlanAccountFact[];
  /** Every accounted Task, so every figure is drillable to the records behind it. */
  readonly entries: readonly PlanAccountEntry[];
  /** True when this week's plan held nothing at all. One sentence, not a table. */
  readonly empty: boolean;
  /** False when the history read failed — the surface says so, never shows zero. */
  readonly available: boolean;
  /** True when the read hit its bound and the account covers less than the week. */
  readonly bounded: boolean;
}

/** The written focus a completed weekly Review handed to this period. */
export interface PlanPriorFocus {
  readonly reviewId: string;
  readonly reviewTitle: string;
  readonly periodLabel: string;
  /** The authored Markdown, exactly as the Review stored it. Read, never copied. */
  readonly body: string;
}

/** A saved Tasks view offered as the planning queue's SOURCE (SMART-01 §D5). */
export interface PlanQueueSource {
  /** `"suggested"` for the built-in rule, otherwise a saved view id. */
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  /** The query string that selects this source, without the leading `?`. */
  readonly query: string;
}

/**
 * UX-02 — the week in four figures, resolved once server-side.
 *
 * Mockup 7 draws them twice: as chips above the board, and as the "Week at a
 * glance" bar beneath it. They are ONE set of numbers used in two places rather
 * than two counts of the same thing, because a screen that states a figure twice
 * and disagrees with itself is worse than one that states it once.
 *
 * The shape and every rule behind it belong to the pure kernel
 * (`planningWeekTotals`), so the rules are unit-testable on their own and there
 * is not a second definition of "planned", "still to place" or "overdue" living
 * in a contract beside the one that computes them.
 */
export type PlanWeekTotals = PlanningWeekTotals;

export interface PlanPageData {
  readonly week: PlanningWeek;
  readonly days: readonly PlanDay[];
  /** The owner's calendar day (ADR-022) — every relative label is resolved from it. */
  readonly todayIso: string;
  /** The day a phone's rail selects and the desktop scrolls to. */
  readonly selectedDayIso: string;
  /** UX-02 — the week's four figures, for the chip row and the glance bar. */
  readonly totals: PlanWeekTotals;
  readonly queue: readonly PlanQueueItem[];
  /** True when a queue band or the merged queue hit its bound. Stated in words. */
  readonly queueTruncated: boolean;
  /** Every queue source on offer, "Suggested" first. */
  readonly queueSources: readonly PlanQueueSource[];
  readonly activeQueueSourceId: string;
  /**
   * HABITS-01 — the routines the shown week already asks for.
   *
   * READ-ONLY planning CONTEXT, and nothing more. PLAN-01 owns Task placement;
   * a Habit is not a Task, so nothing here can be placed on a day, nothing here
   * appears in the "Still to place" queue, nothing here consumes the queue's
   * bulk selection and nothing here writes a `scheduled_date`. What it answers
   * is the question a planner actually has before committing more work to a
   * week: what does this week already ask of me?
   */
  readonly routines: readonly HabitWeekSummaryItem[];
  /**
   * FOLLOW-01 — what became of this week's plan, from the shared bounded
   * Activity-window derivation the weekly Review reads too.
   */
  readonly account: PlanAccount;
  readonly projectSignals: readonly PlanProjectSignal[];
  readonly goalSignals: readonly PlanGoalSignal[];
  readonly priorFocus: PlanPriorFocus | null;
  /** The bounded parent candidates the row's inline Project editor offers. */
  readonly parents: readonly TaskParentOption[];
  /** The owner's Tasks density preference, so a row is the row they chose. */
  readonly density: TaskDensity;
  /** True when at least one calendar source is connected. */
  readonly hasCalendarSources: boolean;
  /** True when a connected calendar's last refresh failed — say so, never guess. */
  readonly calendarStale: boolean;
  /** True when a read failed and the week is showing less than it holds. */
  readonly failed: boolean;
}
