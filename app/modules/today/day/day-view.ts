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
 */

import type { TaskRelation } from "~/kernel/tasks";

/* -------------------------------------------------------------------------- */
/* Shapes                                                                      */
/* -------------------------------------------------------------------------- */

/** One task as the day timeline renders it. Display data only — no `Date`s. */
export interface DayTask {
  readonly id: string;
  readonly title: string;
  /** The structural parent (Project or Area), for the quiet trailing label. */
  readonly parent: TaskRelation | null;
  /** The due date `YYYY-MM-DD`, or null. Date-only — a task never has a time. */
  readonly dueDate: string | null;
  /** The scheduled (planned) date `YYYY-MM-DD`, or null. Also date-only. */
  readonly scheduledDate: string | null;
  readonly completed: boolean;
  /** The OWNER-calendar date of completion, or null. */
  readonly completedDate: string | null;
}

/** The day's tasks, split into the three sections the timeline renders. */
export interface DayBuckets {
  /** Open work whose date has passed. Rendered on the error-tinted surface. */
  readonly overdue: readonly DayTask[];
  /**
   * Open work on today's list, plus the tasks already finished today.
   *
   * Completed tasks stay IN this bucket (dimmed, at the end) rather than being
   * omitted — see `DAY_COMPLETED_PLACEMENT`.
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
 */
export const DAY_COMPLETED_PLACEMENT = "dimmed-at-end-of-today" as const;

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
export function relativePastLabel(iso: string, todayIso: string): string {
  const days = daysBetween(iso, todayIso);
  if (days <= 0) {
    return "today";
  }
  if (days === 1) {
    return "yesterday";
  }
  if (days <= 30) {
    return `${days} days ago`;
  }
  if (days <= 365) {
    const months = Math.round(days / 30);
    return months === 1 ? "1 month ago" : `${months} months ago`;
  }
  return "over a year ago";
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
export function overdueLabel(task: DayTask, todayIso: string): string | null {
  const reference = overdueReference(task, todayIso);
  if (reference === null) {
    return null;
  }
  const when = relativePastLabel(reference.date, todayIso);
  return reference.kind === "due" ? `Due ${when}` : `Planned ${when}`;
}

/* -------------------------------------------------------------------------- */
/* Bucketing                                                                   */
/* -------------------------------------------------------------------------- */

function byString(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** True when an OPEN task's date has passed (either date — see the header). */
export function isOverdue(task: DayTask, todayIso: string): boolean {
  return !task.completed && overdueReference(task, todayIso) !== null;
}

/** True when an OPEN task is on today's list but has not slipped. */
export function isOnToday(task: DayTask, todayIso: string): boolean {
  if (task.completed || isOverdue(task, todayIso)) {
    return false;
  }
  return task.dueDate === todayIso || task.scheduledDate === todayIso;
}

/**
 * Split the day's tasks into the timeline's sections.
 *
 * Order is deterministic and stable under completion, so ticking a row never
 * reshuffles the list under the owner's cursor: overdue by how long it has
 * slipped (oldest first), today's work by title, with everything already done
 * pushed to the end.
 */
export function bucketDay(
  tasks: readonly DayTask[],
  todayIso: string,
): DayBuckets {
  const overdue: DayTask[] = [];
  const open: DayTask[] = [];
  const completedToday: DayTask[] = [];

  for (const task of tasks) {
    if (task.completed) {
      if (task.completedDate === todayIso) {
        completedToday.push(task);
      }
      continue;
    }
    if (isOverdue(task, todayIso)) {
      overdue.push(task);
    } else if (isOnToday(task, todayIso)) {
      open.push(task);
    }
  }

  overdue.sort((a, b) => {
    const aRef = overdueReference(a, todayIso)?.date ?? "";
    const bRef = overdueReference(b, todayIso)?.date ?? "";
    return aRef !== bRef ? byString(aRef, bRef) : byString(a.id, b.id);
  });
  const byTitle = (a: DayTask, b: DayTask) =>
    a.title.localeCompare(b.title) || byString(a.id, b.id);
  open.sort(byTitle);
  completedToday.sort(byTitle);

  return {
    overdue,
    today: [...open, ...completedToday],
    completedToday,
  };
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
   * The figure's name as a HEADING — "Tasks due today", not "6 tasks".
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
      heading: "Tasks due today",
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

/** The overdue rows to draw, and how many are left behind them. */
export function overdueSlice(overdue: readonly DayTask[]): {
  readonly shown: readonly DayTask[];
  readonly hidden: number;
} {
  return {
    shown: overdue.slice(0, OVERDUE_SHOWN),
    hidden: Math.max(0, overdue.length - OVERDUE_SHOWN),
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
