/**
 * HABITS-01 — the ONE serialised Habit shape, and the ONE set of words for it.
 *
 * Pure, React-free and storage-free. A loader turns a kernel `Habit` plus its
 * completions into this JSON-safe shape once, server-side; Today, the `/habits`
 * collection, the Habit record, a Goal's supporting section and an Area's all
 * render the SAME value. That is what makes "checking a habit from Today and
 * from /habits stays consistent" a property of the code rather than a promise:
 * there is one projection and one vocabulary, not one per surface.
 *
 * ── The words are here, deliberately ────────────────────────────────────────
 * Progress copy is computed here rather than in each component because the
 * product's calm-over-urgent rule (AGENTS.md §2) is a rule about WORDS, and a
 * rule about words that lives in four components is four rules. Every string
 * this module can produce is a factual count or a plain state:
 *
 *     "Done today"          "Not yet today"       "Not scheduled today"
 *     "2 of 3 this week"    "Done this week"      "Any day this week"
 *     "9 of 12 recently"
 *
 * There is no streak, no percentage, no "you missed", no "don't break the
 * chain", and no sentence that describes an unscheduled day as a failure or a
 * future day as incomplete.
 */

import {
  buildHabitHistory,
  evaluateHabitConsistency,
  evaluateHabitToday,
  evaluateHabitWeek,
  habitScheduleLabel,
  habitScheduleShortLabel,
  habitWeekdayName,
  type Habit,
  type HabitCalendarContext,
  type HabitFacts,
  type HabitHistoryDayState,
  type HabitTodayKind,
} from "~/kernel/habits";

/* -------------------------------------------------------------------------- */
/* Shapes                                                                     */
/* -------------------------------------------------------------------------- */

/** The Area or Goal a Habit sits in, as the row draws it. */
export interface SerializedHabitContext {
  readonly id: string;
  readonly title: string;
  readonly colourRank: number | null;
  readonly iconKey: string | null;
  readonly colourSlot: string | null;
}

/** Today's state for one Habit, already worded. */
export interface SerializedHabitToday {
  readonly kind: HabitTodayKind;
  readonly done: boolean;
  readonly checkable: boolean;
  readonly label: string;
}

/** This week's reading for one Habit, already worded. */
export interface SerializedHabitWeek {
  readonly startIso: string;
  readonly endIso: string;
  readonly expected: number;
  readonly completed: number;
  readonly met: boolean;
  /** "2 of 3 this week", "Done this week", or null when nothing was expected. */
  readonly label: string | null;
}

/** One day of the record's history strip. */
export interface SerializedHabitHistoryDay {
  readonly dateIso: string;
  readonly state: HabitHistoryDayState;
  readonly weekday: number;
  /** The accessible sentence for this square — never a glyph on its own. */
  readonly label: string;
}

/** The bounded recent reading the record prints. */
export interface SerializedHabitConsistency {
  readonly fromIso: string;
  readonly toIso: string;
  readonly expected: number;
  readonly completed: number;
  /** "9 of 12 expected check-ins", or null when nothing was expected yet. */
  readonly label: string | null;
}

/** Everything a Habit surface renders. JSON-safe: no `Date`s, no functions. */
export interface SerializedHabit {
  readonly id: string;
  readonly title: string;
  readonly notes: string | null;
  readonly archived: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;

  /** The current cadence, in the owner's own terms. */
  readonly scheduleKind: "daily" | "weekdays" | "weekly_count";
  /** "Every day", "Mon, Wed & Fri", "3x a week" — the full sentence. */
  readonly scheduleLabel: string;
  /** "Every day", "Weekdays", "3x weekly" — the compact row form. */
  readonly scheduleShortLabel: string;
  /** The selected weekdays (Sunday = 0), for the editor. Null for other kinds. */
  readonly weekdays: readonly number[] | null;
  /** The weekly target, for the editor. Null for other kinds. */
  readonly timesPerWeek: number | null;

  readonly goal: SerializedHabitContext | null;
  readonly area: SerializedHabitContext | null;

  readonly today: SerializedHabitToday;
  readonly week: SerializedHabitWeek;
}

/** The Habit record's fuller payload: the Habit plus its bounded history. */
export interface SerializedHabitRecord extends SerializedHabit {
  readonly history: readonly SerializedHabitHistoryDay[];
  readonly consistency: SerializedHabitConsistency;
  /** Every past cadence, newest first, so the record can say what changed when. */
  readonly scheduleHistory: readonly {
    readonly id: string;
    readonly label: string;
    readonly fromIso: string;
    readonly toIso: string | null;
  }[];
}

/* -------------------------------------------------------------------------- */
/* Words                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The week's line.
 *
 * `null` when the week expected nothing — a Habit created on Friday did not
 * fail Monday to Thursday, and printing "0 of 0" would invent a measurement
 * nobody made.
 */
export function habitWeekLabel(week: {
  readonly expected: number;
  readonly completed: number;
  readonly met: boolean;
}): string | null {
  if (week.expected === 0) return null;
  // "Done this week" rather than "3 of 3": once the week is satisfied the count
  // has nothing left to tell the owner, and a completed thing should read as
  // completed rather than as a ratio they have to parse.
  if (week.met) return "Done this week";
  return `${week.completed} of ${week.expected} this week`;
}

/** The recent-window line. `null` when the window expected nothing. */
export function habitConsistencyLabel(consistency: {
  readonly expected: number;
  readonly completed: number;
}): string | null {
  if (consistency.expected === 0) return null;
  return `${consistency.completed} of ${consistency.expected} expected check-ins`;
}

/** The accessible sentence for one history square. Never a colour on its own. */
export function habitHistoryDayLabel(
  dateIso: string,
  state: HabitHistoryDayState,
  weekday: number,
): string {
  const day = `${habitWeekdayName(weekday)} ${dateIso}`;
  switch (state) {
    case "completed":
      return `${day}: done`;
    case "expected":
      // NOT "missed". The day was scheduled and holds no check-in; saying so is
      // the fact, and adding a verdict to it is the manufactured guilt this
      // product refuses.
      return `${day}: scheduled, no check-in`;
    case "unscheduled":
      return `${day}: not scheduled`;
    case "inactive":
      return `${day}: habit not active`;
  }
}

/* -------------------------------------------------------------------------- */
/* Serialisation                                                              */
/* -------------------------------------------------------------------------- */

/** The completions a Habit holds inside a window, as the evaluator wants them. */
export function habitFactsFor(
  habit: Habit,
  completedDates: ReadonlySet<string>,
): HabitFacts {
  return {
    versions: habit.versions,
    completedDates,
    archivedOnIso: habit.archivedOn,
  };
}

/** Serialise one Habit for a collection row, Today, or a supporting section. */
export function serializeHabit(
  habit: Habit,
  completedDates: ReadonlySet<string>,
  calendar: HabitCalendarContext,
): SerializedHabit {
  const facts = habitFactsFor(habit, completedDates);
  const week = evaluateHabitWeek(facts, calendar);
  const today = evaluateHabitToday(facts, calendar, week);
  const schedule = habit.schedule;
  return {
    id: habit.id,
    title: habit.title,
    notes: habit.notes,
    archived: habit.archivedAt !== null,
    createdAt: habit.createdAt.toISOString(),
    updatedAt: habit.updatedAt.toISOString(),
    scheduleKind: schedule.kind,
    scheduleLabel: habitScheduleLabel(schedule, calendar.firstDayOfWeek),
    scheduleShortLabel: habitScheduleShortLabel(
      schedule,
      calendar.firstDayOfWeek,
    ),
    weekdays: schedule.kind === "weekdays" ? [...schedule.weekdays] : null,
    timesPerWeek:
      schedule.kind === "weekly_count" ? schedule.timesPerWeek : null,
    goal:
      habit.goal === null
        ? null
        : {
            id: habit.goal.id,
            title: habit.goal.title,
            colourRank: habit.goal.colourRank ?? null,
            iconKey: habit.goal.iconKey ?? null,
            colourSlot: habit.goal.colourSlot ?? null,
          },
    area:
      habit.area === null
        ? null
        : {
            id: habit.area.id,
            title: habit.area.title,
            colourRank: habit.area.colourRank ?? null,
            iconKey: habit.area.iconKey ?? null,
            colourSlot: habit.area.colourSlot ?? null,
          },
    today: {
      kind: today.kind,
      done: today.done,
      checkable: today.checkable && habit.archivedAt === null,
      label: today.label,
    },
    week: {
      startIso: week.startIso,
      endIso: week.endIso,
      expected: week.expected,
      completed: week.completed,
      met: week.met,
      label: habitWeekLabel(week),
    },
  };
}

/** Serialise one Habit for its RECORD, adding the bounded history window. */
export function serializeHabitRecord(
  habit: Habit,
  completedDates: ReadonlySet<string>,
  calendar: HabitCalendarContext,
  windowFromIso: string,
): SerializedHabitRecord {
  const base = serializeHabit(habit, completedDates, calendar);
  const facts = habitFactsFor(habit, completedDates);
  const consistency = evaluateHabitConsistency(facts, calendar, windowFromIso);
  return {
    ...base,
    history: buildHabitHistory(facts, calendar, windowFromIso).map((day) => ({
      dateIso: day.dateIso,
      state: day.state,
      weekday: day.weekday,
      label: habitHistoryDayLabel(day.dateIso, day.state, day.weekday),
    })),
    consistency: {
      fromIso: consistency.fromIso,
      toIso: consistency.toIso,
      expected: consistency.expected,
      completed: consistency.completed,
      label: habitConsistencyLabel(consistency),
    },
    scheduleHistory: [...habit.versions]
      .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))
      .map((version) => ({
        id: version.id,
        label: habitScheduleLabel(version.schedule, calendar.firstDayOfWeek),
        fromIso: version.effectiveFrom,
        toIso: version.effectiveTo,
      })),
  };
}
