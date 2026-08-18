/**
 * TODAY-DAY — the day model behind the Today screen (pure, React-free, testable).
 *
 * Today is a place to DO the day, not a report about it. This module owns every
 * derivation the surface renders: which tasks are on today, which have slipped,
 * what the day's progress is, which chips qualify, and how a slipped date reads in
 * words. Nothing here touches React, storage, the DOM or the wall clock — the
 * owner's calendar day arrives as `todayIso` and the owner-local hour as a number,
 * so the same functions run on the server and in a unit test.
 *
 * ── THE ONE RULE THAT MATTERS: what "on today" means ─────────────────────────
 * A DalyHub task carries TWO date-only fields, and they mean different things
 * (`app/kernel/tasks/task.ts`): `dueDate` is when it is DUE, `scheduledDate` is
 * the owner's "I intend to work on this that day" commitment (ADR-030). Neither
 * ever carries a time — a task is a date, a meeting is an instant — which is why
 * this surface has no Morning/Afternoon grouping and never prints a time beside a
 * task.
 *
 * The old Today read `scheduledDate` alone, so a task DUE today but never planned
 * was filed under "Anytime" and a task overdue by its due date reported "0
 * overdue". That is the screen lying about the day. The rule here is the union,
 * and it is deliberately the SAME rule the canonical `/tasks` system views use:
 *
 *   overdue   open · (dueDate < today OR scheduledDate < today)   → `?system=overdue`
 *   on today  open · not overdue · (dueDate = today OR scheduledDate = today)
 *
 * Matching the system view matters because the timeline's "+n more overdue" row
 * links to it: a cap that sends the owner to a list of a different size would be
 * worse than no cap at all.
 *
 * ── TODAY-10: the union is still ONE set, drawn as THREE BANDS ────────────────
 * TODAY-09 made that union truthful and TODAY-10 made it legible. The set is
 * unchanged — Focus still holds exactly the canonical `today` work plus what has
 * slipped — but a row no longer has to be opened to learn WHY it is there:
 *
 *   Overdue        slipped — `dueDate < today` OR `scheduledDate < today`
 *   Due today      a deadline that lands today — `dueDate = today`
 *   Planned today  an intention the owner set — `scheduledDate = today`, not due today
 *
 * A deadline outranks an intention, so a task that is BOTH due and planned today
 * is a "Due today" task and appears exactly once — the same precedence
 * {@link overdueReference} already applies when both dates have passed. The
 * bands are computed by ONE classifier ({@link focusBand}) for open and
 * completed work alike, which is what stops a row moving between bands when it
 * is ticked.
 */

import type {
  TaskChecklistProgress,
  TaskListItem,
  TaskPriority,
} from "~/kernel/tasks";
import { serializeTaskListItem } from "~/shared/task-record/task-view";
import type { SerializedTaskListItem } from "~/shared/task-record/task-view";

/* -------------------------------------------------------------------------- */
/* Shapes                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * One task as the day renders it. Display data only — no `Date`s.
 *
 * ── TODAY-TASK-01 — it is the CANONICAL list item, plus the day's two facts ──
 * It used to be a seven-field subset (id, title, parent, the two dates, priority,
 * completion), chosen for the private row Today drew. That subset is precisely
 * what stopped Today adopting the shared `TaskRow` (DEBT-143): the shared row
 * draws a display STATE, a recurrence signal and a waiting flag, and none of the
 * three could be derived from a projection that had already thrown away `status`,
 * `commitmentState`, `timeSector`, `waiting` and `recurrence`.
 *
 * So the day carries the whole serialised item — the same shape `/tasks` renders
 * — and adds the two derivations the DAY needs on top of it:
 *
 *   - `completed`, because every bucketing function here asks the question and
 *     the optimistic overlay ANSWERS it before the server has;
 *   - `completedDate`, the OWNER-calendar date of the completion instant, which
 *     is what "finished today" means and is not a function of `completedAt`
 *     alone (the timezone is the owner's, resolved on the server — ADR-022).
 *
 * The planning read already returns every one of these fields, so the widening
 * costs no query and no column.
 */
export interface DayTask extends SerializedTaskListItem {
  /**
   * TODAY-10 — the canonical P1–P4 priority, or null for untriaged work.
   *
   * Restated here (it is also on the item) because Focus ORDERS by it — see
   * {@link byExecution} — and a reader of this file should not have to follow the
   * inheritance to learn that the sort key is part of the day's contract.
   */
  readonly priority: TaskPriority | null;
  readonly completed: boolean;
  /** The OWNER-calendar date of completion, or null. */
  readonly completedDate: string | null;
}

/**
 * Build a day task from the kernel's planning row.
 *
 * ONE constructor, so the four surfaces that read `listPlanningTasks` (Today,
 * Tomorrow, Next 7 days and the plan route) cannot disagree about what a day task
 * is — which is exactly what happened while each mapped its own seven fields by
 * hand and Today's set quietly grew.
 *
 * `completedDate` is supplied rather than derived: only the caller knows the
 * owner's timezone, and inventing one here from the runtime clock is the ADR-022
 * mistake this codebase has paid for before.
 */
export function toDayTask(
  item: TaskListItem,
  completedDate: string | null,
  /**
   * TASKS-13 — this Task's checklist progress, when the caller read it.
   *
   * Supplied rather than fetched, for the same reason `completedDate` is: the
   * constructor must not be able to make a query, because it is called once per
   * row and that is the definition of an N+1. The caller reads progress ONCE for
   * the whole page and hands each row its entry.
   */
  progress?: TaskChecklistProgress,
): DayTask {
  return {
    ...serializeTaskListItem(item, progress),
    completed: item.completedAt !== null,
    completedDate,
  };
}

/**
 * The day's work, split into the bands the Focus panel renders.
 *
 * Each band is ordered open-first, with anything already finished today dimmed
 * at ITS end — see `DAY_COMPLETED_PLACEMENT`.
 */
export interface DayBuckets {
  /** Work whose date has passed. Rendered with the coral leading rule. */
  readonly overdue: readonly DayTask[];
  /** Work whose DEADLINE is today (`dueDate = today`). */
  readonly dueToday: readonly DayTask[];
  /** Work the owner PLANNED for today and that is not also due today. */
  readonly plannedToday: readonly DayTask[];
  /**
   * The day's own work — `dueToday` followed by `plannedToday`.
   *
   * The two bands as one list, because that is what the progress figure measures
   * and what the display bound is applied to. Overdue work is deliberately NOT
   * in it (see {@link dayProgress}).
   */
  readonly today: readonly DayTask[];
  /** The subset of `today` that is already complete, for the progress figure. */
  readonly completedToday: readonly DayTask[];
}

/**
 * Where a task completed earlier today is drawn.
 *
 * The contract offers two honest options — dimmed at the end of the day's list,
 * or omitted entirely. DalyHub keeps them, because the progress indicator's
 * denominator COUNTS them ("3 of 8 done today"), and a denominator you cannot see
 * the parts of is a number the owner has to take on trust. Dimming also makes
 * ticking a task a continuous motion — the row stays where it is and changes
 * state — rather than a disappearance.
 *
 * **TODAY-10 made that claim true.** It was not: a completed task was appended to
 * the day's ONE list wherever it came from, so ticking an overdue row made it
 * vanish from the overdue band and reappear fifteen rows further down, under a
 * heading ("For today") that was not true of it — and the overdue cap pulled a
 * previously-hidden row up into the gap. Completion now changes only how a row is
 * DRAWN; {@link focusBand} decides where it sits from its dates alone, so the row
 * stays in the band it was already in.
 */
export const DAY_COMPLETED_PLACEMENT = "dimmed-at-end-of-its-band" as const;

/* -------------------------------------------------------------------------- */
/* Date helpers (date-only strings; lexicographic == chronological)            */
/* -------------------------------------------------------------------------- */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole calendar days between two `YYYY-MM-DD` dates (`to - from`). */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) /
      DAY_MS,
  );
}

/**
 * "yesterday" · "3 days ago" · "2 months ago" · "over a year ago".
 *
 * Never a bare date — the AGE is the point, and a date makes the reader do the
 * arithmetic. It graduates because exactness stops being information once the
 * number is large: "9716 days ago" is precise, unreadable, and says nothing more
 * than "over a year ago" — a figure past a certain size is a curiosity, not a
 * fact to act on.
 */
export function relativePastLabel(
  iso: string,
  todayIso: string,
  /**
   * MOBILE-02 §7 — the SHORT form, for a phone row.
   *
   * Same ladder, same rungs, same thresholds: only the words are abbreviated, so
   * a row cannot say one thing on a laptop and a different thing on a phone.
   * "Due over a year ago" is nineteen characters against a task title that has
   * ~130px to live in at 393 — measured on the seeded fixture, three of the
   * three overdue rows had their titles ellipsised by their own date. "Due 1y+"
   * is seven.
   *
   * The short form is never the ONLY statement: every caller renders it
   * `aria-hidden` beside the full phrase in a visually-hidden span, which is the
   * same trade the week strip's day buttons make a few hundred lines away.
   */
  compact = false,
): string {
  const days = daysBetween(iso, todayIso);
  if (days <= 0) {
    return "today";
  }
  if (days === 1) {
    return compact ? "1d" : "yesterday";
  }
  if (days <= 30) {
    return compact ? `${days}d` : `${days} days ago`;
  }
  if (days <= 365) {
    const months = Math.round(days / 30);
    if (compact) return `${months}mo`;
    return months === 1 ? "1 month ago" : `${months} months ago`;
  }
  return compact ? "1y+" : "over a year ago";
}

/**
 * The date that made a task overdue, and which field it came from.
 *
 * A DalyHub task can slip on either date, and the row has to say WHICH — "due
 * yesterday" and "planned yesterday" are different facts about the same task, and
 * printing one when the other is true would be an invented claim. When both have
 * passed the DUE date wins: a deadline outranks an intention.
 */
export function overdueReference(
  task: DayTask,
  todayIso: string,
): { readonly kind: "due" | "planned"; readonly date: string } | null {
  if (task.dueDate !== null && task.dueDate < todayIso) {
    return { kind: "due", date: task.dueDate };
  }
  if (task.scheduledDate !== null && task.scheduledDate < todayIso) {
    return { kind: "planned", date: task.scheduledDate };
  }
  return null;
}

/** The trailing label on an overdue row — "Due 3 days ago" / "Planned yesterday". */
export function overdueLabel(
  task: DayTask,
  todayIso: string,
  compact = false,
): string | null {
  const reference = overdueReference(task, todayIso);
  if (reference === null) {
    return null;
  }
  const when = relativePastLabel(reference.date, todayIso, compact);
  return reference.kind === "due" ? `Due ${when}` : `Planned ${when}`;
}

/* -------------------------------------------------------------------------- */
/* Bucketing                                                                   */
/* -------------------------------------------------------------------------- */

function byString(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/*
 * `isOverdue` and `isOnToday` used to live here, one calling the other, and both
 * are gone: TODAY-10's `focusBand` answers the same two questions and every
 * caller now asks it instead. Keeping them beside it would have left a SECOND
 * definition of "overdue" in the module that owns the first — the drift this
 * codebase has fixed twice already — and a helper only its own unit test still
 * calls is not coverage, it is a second answer waiting to disagree.
 */

/** Which band of the Focus panel a task belongs to. */
export type FocusBand = "overdue" | "due" | "planned";

/**
 * TODAY-10 — the ONE classifier behind the Focus panel.
 *
 * It answers "where does this task belong, and does it belong at all?" from the
 * task's DATES, for open and completed work alike. Everything the panel draws
 * flows from it, which is what makes the three properties below true by
 * construction rather than by careful rendering:
 *
 *   - **A task appears exactly once.** The bands are the branches of one `if`,
 *     so "due today AND planned today", "overdue AND high priority" and "today
 *     AND an attention signal" cannot put a row on the screen twice.
 *   - **A deadline outranks an intention.** Both when both dates have slipped
 *     (`overdueReference`) and when both land today, the DUE date decides.
 *   - **Completing a task does not move it.** Completion is not consulted here,
 *     only `completedDate` — and only to drop work finished on an earlier day.
 *
 * `null` means the task is not the day's work: it has no date on today, nothing
 * has slipped, or it was completed before today.
 */
export function focusBand(task: DayTask, todayIso: string): FocusBand | null {
  // Work finished on an earlier day is history, not today — whatever its dates.
  if (task.completed && task.completedDate !== todayIso) {
    return null;
  }
  if (overdueReference(task, todayIso) !== null) {
    return "overdue";
  }
  return dateBand(task, todayIso);
}

/**
 * CAL-02 — the DUE/PLANNED half of {@link focusBand}, for a date that is not
 * today.
 *
 * Extracted rather than reimplemented, because Tomorrow asks the same two
 * questions Today does and must not acquire a second answer to them: a deadline
 * that lands on the date is *Due*, an intention the owner set for the date and
 * that is not also due then is *Planned*, a deadline outranks an intention, and
 * work finished on another day is not this day's work.
 *
 * The OVERDUE branch is deliberately absent, and it is not an omission: "has it
 * slipped?" is a question about the present, and nothing can have slipped
 * relative to a date in the future. Today remains the product's only overdue
 * attention surface (CAL-01 §20).
 */
export function dateBand(
  task: DayTask,
  dateIso: string,
): "due" | "planned" | null {
  if (task.completed && task.completedDate !== dateIso) {
    return null;
  }
  if (task.dueDate === dateIso) {
    return "due";
  }
  if (task.scheduledDate === dateIso) {
    return "planned";
  }
  return null;
}

/**
 * CAL-02 — how many open Tasks a day carries, by the SAME union rule the
 * canonical `/tasks?system=today` view and Today's Focus panel apply
 * (`dueDate = date` OR `scheduledDate = date`).
 *
 * Next 7 Days shows this as one restrained line per day ("3 planned tasks"). It
 * counts OPEN work only, because a forward agenda is about what is still to do,
 * and a day whose work is already finished should read as a clear day.
 */
export function openTaskCountForDate(
  tasks: readonly DayTask[],
  dateIso: string,
): number {
  return tasks.filter(
    (task) => !task.completed && dateBand(task, dateIso) !== null,
  ).length;
}

/** P1 first, P4 last, untriaged after all of them. Never a computed score. */
const PRIORITY_RANK: Readonly<Record<TaskPriority, number>> = {
  p1: 0,
  p2: 1,
  p3: 2,
  p4: 3,
};

function priorityRank(priority: TaskPriority | null): number {
  return priority === null ? 4 : PRIORITY_RANK[priority];
}

/**
 * TODAY-10 — the order the day is worked in, stated in one sentence:
 * **priority, then the nearest deadline, then the title.**
 *
 * It replaces a plain alphabetical sort, which was deterministic and useless:
 * on the heavy fixture the day's only P1 sat third and a P2 sat ninth, because
 * "Book the dentist" starts with a B. Both signals are stored fields the row
 * itself shows (the `PriorityIndicator`, and the band the row is in), so the
 * order can be read off the screen — there is no hidden importance metric here,
 * and deliberately no composite score.
 *
 * `id` is the final tie-break so the sort is TOTAL: two identical tasks always
 * come out in the same order, on the server and in the browser.
 */
function byExecution(a: DayTask, b: DayTask): number {
  const priority = priorityRank(a.priority) - priorityRank(b.priority);
  if (priority !== 0) {
    return priority;
  }
  // A missing deadline sorts last, exactly as the canonical `smart` sort's
  // `COALESCE(td.due_date, '9999-99-99')` does.
  const aDue = a.dueDate ?? "9999-99-99";
  const bDue = b.dueDate ?? "9999-99-99";
  if (aDue !== bDue) {
    return byString(aDue, bDue);
  }
  return a.title.localeCompare(b.title) || byString(a.id, b.id);
}

/** Open work first, in execution order; today's completions dimmed at the end. */
function orderBand(
  band: readonly DayTask[],
  within: (a: DayTask, b: DayTask) => number,
): DayTask[] {
  const open = band.filter((task) => !task.completed).sort(within);
  const done = band.filter((task) => task.completed).sort(within);
  return [...open, ...done];
}

/**
 * Split the day's tasks into the Focus panel's bands.
 *
 * Deterministic and stable under completion: ticking a row changes its state and
 * its place WITHIN its band, never which band it is in and never which rows the
 * display bound draws.
 */
export function bucketDay(
  tasks: readonly DayTask[],
  todayIso: string,
): DayBuckets {
  const overdue: DayTask[] = [];
  const dueToday: DayTask[] = [];
  const plannedToday: DayTask[] = [];

  for (const task of tasks) {
    switch (focusBand(task, todayIso)) {
      case "overdue":
        overdue.push(task);
        break;
      case "due":
        dueToday.push(task);
        break;
      case "planned":
        plannedToday.push(task);
        break;
      default:
        break;
    }
  }

  // Overdue keeps its own order — the oldest slip first, because how long
  // something has been owed is the fact that decides what to do about it.
  const bySlip = (a: DayTask, b: DayTask) => {
    const aRef = overdueReference(a, todayIso)?.date ?? "";
    const bRef = overdueReference(b, todayIso)?.date ?? "";
    return aRef !== bRef ? byString(aRef, bRef) : byString(a.id, b.id);
  };

  const orderedDue = orderBand(dueToday, byExecution);
  const orderedPlanned = orderBand(plannedToday, byExecution);
  const today = [...orderedDue, ...orderedPlanned];

  return {
    overdue: orderBand(overdue, bySlip),
    dueToday: orderedDue,
    plannedToday: orderedPlanned,
    today,
    completedToday: today.filter((task) => task.completed),
  };
}

/**
 * TODAY-10 — how many Tasks the canonical `/tasks?system=today` view holds.
 *
 * Focus files a task that is due today but has ALSO slipped its plan under
 * Overdue, which is where the owner needs it — but that task is still one of
 * today's Tasks, and the figure above the panel links straight to the view that
 * counts it. So the count is derived from the canonical membership rule (open,
 * `dueDate = today` OR `scheduledDate = today`) over the bands the screen already
 * holds, rather than from how many rows happen to be in the "for today" run.
 * Today and `/tasks?system=today` therefore cannot disagree about the number.
 */
export function tasksForTodayCount(
  buckets: DayBuckets,
  todayIso: string,
): number {
  const qualifies = (task: DayTask) =>
    !task.completed &&
    (task.dueDate === todayIso || task.scheduledDate === todayIso);
  return (
    buckets.today.filter(qualifies).length +
    buckets.overdue.filter(qualifies).length
  );
}

/* -------------------------------------------------------------------------- */
/* Greeting                                                                    */
/* -------------------------------------------------------------------------- */

/** The part of the day, for the greeting. Derived from the owner-local hour. */
export type DayPart = "morning" | "afternoon" | "evening";

/**
 * Resolve the day part from an owner-local hour (0–23).
 *
 * Morning until 12:00, afternoon until 17:00, evening after. 17:00 rather than
 * 18:00: "Good afternoon" at ten past five reads as a product that has not
 * noticed the day is ending.
 */
export function dayPartForHour(hour: number): DayPart {
  if (hour < 12) {
    return "morning";
  }
  if (hour < 17) {
    return "afternoon";
  }
  return "evening";
}

/** "Good morning, Aidan" — or just "Good morning" when no name is known. */
export function greetingFor(part: DayPart, name: string | null): string {
  const opener =
    part === "morning"
      ? "Good morning"
      : part === "afternoon"
        ? "Good afternoon"
        : "Good evening";
  return name === null || name.trim() === "" ? opener : `${opener}, ${name}`;
}

/* -------------------------------------------------------------------------- */
/* Progress                                                                    */
/* -------------------------------------------------------------------------- */

/** The day's completion, or null when nothing has been finished yet. */
export interface DayProgress {
  readonly done: number;
  readonly total: number;
}

/**
 * The day's progress — completions over everything on today's list, INCLUDING
 * the completions themselves.
 *
 * Null until at least one task is done: a progress bar at 0/8 first thing in the
 * morning is a guilt meter, not a measure, and the anti-guilt mandate
 * (PRODUCT_PRINCIPLES) rules it out. Overdue work is excluded from the
 * denominator for the same reason it always has been — a bar that cannot reach
 * the end is not progress.
 *
 * TODAY-10 made that exclusion hold in both directions. It did not before:
 * completing an overdue task moved it into the day's list, so finishing slipped
 * work grew the denominator it was supposed to be outside of ("3 of 8" became
 * "4 of 9"). A completed overdue task now stays in the overdue band, so this
 * measures exactly what it says — today's own work, and what of it is done.
 */
export function dayProgress(buckets: DayBuckets): DayProgress | null {
  const done = buckets.completedToday.length;
  if (done < 1) {
    return null;
  }
  return { done, total: buckets.today.length };
}

/* -------------------------------------------------------------------------- */
/* Chips                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * One informational figure about the day. Never a toggle — it states or it goes.
 *
 * The name is historical: until M3X these rendered as a row of assist chips
 * above the day. They now render as the figures on Today's expressive summary,
 * which is the same three facts in the one place the eye lands first. The MODEL
 * did not change, which is why this stayed where it was rather than being
 * rebuilt beside a hero.
 *
 * `count` and `noun` are the same information as `label`, split — a summary
 * draws the number and its noun at different weights, and re-splitting a
 * formatted string at the call site is how "1 tasks" happens.
 */
export interface DayChip {
  readonly id: "tasks" | "meetings" | "overdue";
  readonly label: string;
  /** The figure alone. */
  readonly count: number;
  /** What the figure counts, already pluralised against `count`. */
  readonly noun: string;
  /**
   * The figure's name as a HEADING — "Tasks for today", not "6 tasks".
   *
   * A stat card reads label-then-figure, and a heading over a number is not the
   * same string as the number's own noun phrase: "6 tasks" above "6" says it
   * twice, and "tasks" alone above "6" does not say *which* tasks. It lives here
   * with the rest of the vocabulary so the row and the chip cannot drift.
   */
  readonly heading: string;
  /** The obvious filtered view this chip's number lives in. */
  readonly href: string;
  /** `error` is spent on slipped work ALONE; everything else is a plain fact. */
  readonly tone: "neutral" | "error";
}

/** Pluralise a count against its noun ("1 task" / "2 tasks"). */
function counted(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * The chip row. Every chip is conditional on its own count being > 0, so a quiet
 * day renders no row at all rather than a line of zeroes. The caller renders
 * nothing when this returns an empty array — and leaves no gap behind it.
 */
export function dayChips(input: {
  readonly taskCount: number;
  readonly meetingCount: number;
  readonly overdueCount: number;
}): readonly DayChip[] {
  const chips: DayChip[] = [];
  if (input.taskCount > 0) {
    const noun = input.taskCount === 1 ? "task" : "tasks";
    chips.push({
      id: "tasks",
      label: counted(input.taskCount, "task", "tasks"),
      heading: "Tasks for today",
      count: input.taskCount,
      noun,
      href: "/tasks?system=today",
      tone: "neutral",
    });
  }
  if (input.meetingCount > 0) {
    const noun = input.meetingCount === 1 ? "meeting" : "meetings";
    chips.push({
      id: "meetings",
      label: counted(input.meetingCount, "meeting", "meetings"),
      heading: "Meetings today",
      count: input.meetingCount,
      noun,
      href: "/meetings",
      tone: "neutral",
    });
  }
  if (input.overdueCount > 0) {
    chips.push({
      id: "overdue",
      label: `${input.overdueCount} overdue`,
      heading: "Overdue",
      count: input.overdueCount,
      // Not pluralised: "overdue" is an adjective standing in for "overdue
      // tasks", and "1 overdues" is the failure mode of pluralising it blindly.
      noun: "overdue",
      href: "/tasks?system=overdue",
      tone: "error",
    });
  }
  return chips;
}

/* -------------------------------------------------------------------------- */
/* Bounds                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * How many overdue rows the timeline draws before it stops and says so.
 *
 * Overdue work is the one thing on this screen that can be unbounded, and a day
 * that opens with twenty red rows is a day the owner closes the tab on. Three is
 * enough to act on now; the rest are one link away in the canonical overdue view,
 * and the "+n more overdue" row states the true remainder.
 */
export const OVERDUE_SHOWN = 3;

/**
 * TODAY-10 — a bound counts OPEN rows; a completion is never bounded away.
 *
 * The two rules a display bound on this panel has to satisfy pull in opposite
 * directions, and applying the bound to the whole band satisfies neither:
 *
 *   - **"+n more" has to be true of the view it links to.** That view holds only
 *     OPEN work, so counting today's completions towards `n` makes the panel
 *     promise a list of a size the destination does not have.
 *   - **A row the owner just ticked must not vanish.** Completing a row moves it
 *     to the end of its band ({@link DAY_COMPLETED_PLACEMENT}); if the bound
 *     covers completions too, that move can carry it straight past the slice —
 *     the row disappears, the canonical view excludes it as completed, and there
 *     is nowhere left to see it. Ticking a task must never lose it.
 *
 * So the bound is applied to the open rows alone, and every task completed today
 * is drawn after them. Completions are self-limiting — they only appear as the
 * owner works — so this cannot become the unbounded list the bound exists to
 * prevent.
 */
function boundBand(
  band: readonly DayTask[],
  limit: number,
): { readonly shown: readonly DayTask[]; readonly hidden: number } {
  const open = band.filter((task) => !task.completed);
  const shownOpen = open.slice(0, Math.max(0, limit));
  return {
    shown: [...shownOpen, ...band.filter((task) => task.completed)],
    hidden: open.length - shownOpen.length,
  };
}

/**
 * The overdue rows to draw, and how many OPEN ones are left behind them.
 *
 * `hidden` is the remainder the "+n more overdue" row states, so it counts what
 * `/tasks?system=overdue` counts: open work. A slipped task finished this
 * morning is still drawn — dimmed, at the end of the band it was already in —
 * and is deliberately not part of that figure.
 */
export function overdueSlice(overdue: readonly DayTask[]): {
  readonly shown: readonly DayTask[];
  readonly hidden: number;
} {
  return boundBand(overdue, OVERDUE_SHOWN);
}

/**
 * TODAY-10 — how many of the day's OWN rows the Focus panel draws.
 *
 * The "for today" run was the one unbounded list on the screen. On the heavy
 * fixture it drew fourteen rows, which turned a daily orientation surface into a
 * second `/tasks` page and pushed Goal progress a full phone-screen below the
 * fold — the exact failure the Today redesign existed to undo.
 *
 * Eight, because the typical day (five open plus three completed) must never be
 * truncated: a bound that fires on an ordinary Wednesday is a bound the owner
 * learns to distrust. Past it the panel says how many it is not showing and
 * links to the canonical view that holds all of them — never a silent slice, and
 * never pagination inside a dashboard.
 */
export const FOCUS_TODAY_SHOWN = 8;

/**
 * How many of those rows the "Planned today" band is guaranteed when it has
 * work and "Due today" would otherwise take the whole bound.
 *
 * Without it the bound could delete a whole BAND rather than some rows: nine
 * deadlines and one planned task would draw eight deadlines and no "Planned
 * today" heading at all, and the owner would read a day with nothing planned in
 * it. Losing rows inside a band is a bound; losing the band is a lie. Three,
 * because it is the smallest number that still reads as a list.
 */
export const FOCUS_BAND_MIN = 3;

/**
 * The day's own rows to draw, still split by band, and the true remainder.
 *
 * Deadlines take the larger share — a deadline outranks an intention here as it
 * does everywhere else on this surface — but never the whole of it while there
 * is planned work to show. Like the overdue bound, this counts OPEN rows and
 * always draws today's completions (see {@link boundBand}): the eight is eight
 * things left to do, and ticking the third of them can never make it vanish.
 */
export function focusTodaySlice(buckets: DayBuckets): {
  readonly dueToday: readonly DayTask[];
  readonly plannedToday: readonly DayTask[];
  readonly hidden: number;
} {
  const openIn = (band: readonly DayTask[]) =>
    band.filter((task) => !task.completed).length;
  const reserved = Math.min(openIn(buckets.plannedToday), FOCUS_BAND_MIN);
  const due = boundBand(buckets.dueToday, FOCUS_TODAY_SHOWN - reserved);
  const planned = boundBand(
    buckets.plannedToday,
    FOCUS_TODAY_SHOWN - openIn(buckets.dueToday) + due.hidden,
  );
  return {
    dueToday: due.shown,
    plannedToday: planned.shown,
    hidden: due.hidden + planned.hidden,
  };
}

/* -------------------------------------------------------------------------- */
/* M3X-02 — the day's NEXT thing                                               */
/* -------------------------------------------------------------------------- */

/**
 * The one thing the day is pointing at right now.
 *
 * Today's phone viewport has to answer four questions before a scroll — how much
 * is on, how much has slipped, how far through, and *what next* — and the fourth
 * had no answer anywhere on the screen: it was buried somewhere in a list of
 * three sections. This is that answer, and it is a DERIVATION of rows the screen
 * already holds, never a new read and never a new fact.
 *
 * The precedence is the order a day actually happens in:
 *
 *   1. **a meeting still ahead** — the only thing on this screen with a TIME, and
 *      the only thing that will happen whether or not the owner acts;
 *   2. **the first unfinished task due today** — the day's own work;
 *   3. **the oldest overdue task** — when nothing is due, the thing most owed.
 *
 * `null` when the day holds none of the three, in which case nothing is drawn:
 * a "next up" surface saying "nothing" is the zeros-never-paint failure with a
 * bigger radius.
 */
export type DayNext =
  | {
      readonly kind: "meeting";
      readonly id: string;
      readonly title: string;
      /** The meeting's start time, in its own timezone. */
      readonly timeLabel: string;
      /** Location or mode, when the meeting carries one. */
      readonly context: string | null;
    }
  | {
      readonly kind: "task";
      readonly id: string;
      readonly title: string;
      /** True when the task is being surfaced because it has already slipped. */
      readonly overdue: boolean;
      /** The owning Project or Area, when the task has one. */
      readonly parentTitle: string | null;
    };

/** The minimal meeting facts `nextUp` reads. */
export interface DayNextMeeting {
  readonly id: string;
  readonly title: string;
  readonly timeLabel: string;
  readonly context: string | null;
  readonly upcoming: boolean;
}

export function nextUp(input: {
  readonly meetings: readonly DayNextMeeting[];
  readonly buckets: DayBuckets;
}): DayNext | null {
  // Meetings arrive in start order, so the first one still ahead IS the next one.
  const meeting = input.meetings.find((entry) => entry.upcoming);
  if (meeting) {
    return {
      kind: "meeting",
      id: meeting.id,
      title: meeting.title,
      timeLabel: meeting.timeLabel,
      context: meeting.context,
    };
  }
  const due = input.buckets.today.find((task) => !task.completed);
  if (due) {
    return {
      kind: "task",
      id: due.id,
      title: due.title,
      overdue: false,
      parentTitle: due.parent?.title ?? null,
    };
  }
  // `bucketDay` orders overdue work oldest-first, so the head is the thing most
  // owed — the same row the timeline draws at the top of its overdue run.
  const overdue = input.buckets.overdue.find((task) => !task.completed);
  if (overdue) {
    return {
      kind: "task",
      id: overdue.id,
      title: overdue.title,
      overdue: true,
      parentTitle: overdue.parent?.title ?? null,
    };
  }
  return null;
}
