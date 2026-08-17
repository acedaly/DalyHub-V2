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

import type { DaySchedule } from "~/kernel/calendar";
import type { PlanningQueueBand, PlanningWeek } from "~/kernel/planning";
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

export interface PlanPageData {
  readonly week: PlanningWeek;
  readonly days: readonly PlanDay[];
  /** The owner's calendar day (ADR-022) — every relative label is resolved from it. */
  readonly todayIso: string;
  /** The day a phone's rail selects and the desktop scrolls to. */
  readonly selectedDayIso: string;
  readonly queue: readonly PlanQueueItem[];
  /** True when a queue band or the merged queue hit its bound. Stated in words. */
  readonly queueTruncated: boolean;
  /** Every queue source on offer, "Suggested" first. */
  readonly queueSources: readonly PlanQueueSource[];
  readonly activeQueueSourceId: string;
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
