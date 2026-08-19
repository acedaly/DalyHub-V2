/**
 * TASKS-04 — structured, calendar-based Task recurrence.
 *
 * Recurrence is DATA, never stored prose: a closed frequency set, a bounded
 * interval, an optional selected-weekday set and the ORIGINALLY REQUESTED
 * day-of-month / month, kept so a monthly or yearly rule that had to be clamped in
 * a short month (31 Jan → 28 Feb) returns to the requested day afterwards rather
 * than drifting. Nothing here generates a calendar of future Tasks: the rule plus
 * `nextTaskOccurrenceDate` computes exactly ONE next date on demand, which is what
 * completion uses to create exactly one successor (ADR-062).
 *
 * Every function here is PURE and calendar-only (no clocks, no time zones): the
 * caller passes the owner's calendar day (ADR-022), never a browser-local date.
 *
 * TASKS-12 WIDENED the vocabulary; it did not add a second engine. Four additions,
 * all of them structured DATA on the same rule — a monthly `ordinal` ("the last
 * Friday"), a `weekendRule`, and the two mutually-exclusive end conditions
 * (`endsAfterCount` / `endsOnDate`). There is still no cron string, no expression
 * language, no RRULE parser and no scripting, and `planNextTaskOccurrence` below is
 * still the ONE function that decides whether a series continues and where.
 */

import { TaskValidationError } from "./task-errors";
import type { TaskValidationField } from "./task-errors";

export const TASK_RECURRENCE_FREQUENCIES = [
  "day",
  "weekday",
  "week",
  "month",
  "year",
] as const;
export type TaskRecurrenceFrequency =
  (typeof TASK_RECURRENCE_FREQUENCIES)[number];

export const TASK_RECURRENCE_DATE_KINDS = ["scheduled", "due"] as const;
export type TaskRecurrenceDateKind =
  (typeof TASK_RECURRENCE_DATE_KINDS)[number];

/**
 * TASKS-07 — the two scheduling MODES a repeat can mean. They are genuinely
 * different intentions, and inferring one from the other is what makes a recurring
 * task manager annoying:
 *
 *   - **`fixed`** — a SCHEDULE. "Every Monday" means Monday, whether or not last
 *     Monday's occurrence was finished on time. The next date is computed from the
 *     series grid, so completing late does not permanently move the routine. This
 *     is exactly the behaviour every rule stored before TASKS-07 had, which is why
 *     it is the migration default (ADR-085).
 *   - **`after_completion`** — an INTERVAL that restarts when the work is actually
 *     done. "Every 14 days after completion" on a task due 1 August, completed on
 *     the 6th, next falls on the 20th, not the 15th. For cleaning, maintenance and
 *     chores, restarting the clock is the whole point.
 *
 * The mode is stored structured data, never inferred from the title.
 */
export const TASK_RECURRENCE_MODES = ["fixed", "after_completion"] as const;
export type TaskRecurrenceMode = (typeof TASK_RECURRENCE_MODES)[number];

/** The documented default mode: the semantics every pre-TASKS-07 rule already had. */
export const DEFAULT_TASK_RECURRENCE_MODE: TaskRecurrenceMode = "fixed";

/**
 * TASKS-12 — the ORDINAL of a monthly nth-weekday rule ("the last Friday").
 *
 * A deliberately CLOSED set of five, and "fifth" is not in it. A fifth Monday
 * exists in roughly four months a year, so a rule naming one would be a rule the
 * owner could not predict — and every product that offers it has to invent a
 * silent fallback ("use the fourth instead", "skip that month") that nobody
 * remembers choosing. `last` is the position people actually mean by "the fifth",
 * it exists in every month of every year, and it is the one that stays true when
 * February is 28 days long.
 */
export const TASK_RECURRENCE_ORDINALS = [
  "first",
  "second",
  "third",
  "fourth",
  "last",
] as const;
export type TaskRecurrenceOrdinal = (typeof TASK_RECURRENCE_ORDINALS)[number];

/**
 * TASKS-12 — what happens when a computed occurrence lands on a Saturday or a
 * Sunday.
 *
 * There is deliberately NO checkbox called "skip weekends", because that phrase
 * does not name a behaviour: three different products mean three different things
 * by it. Each value below is a complete, deterministic rule, and the editor states
 * it in exactly these words:
 *
 *   - **`allow`** — the occurrence falls where the schedule puts it, weekend or
 *     not. The default, and the behaviour of every rule written before TASKS-12.
 *   - **`before`** — "move it to the Friday before". Saturday and Sunday both move
 *     BACKWARDS to the preceding Friday.
 *   - **`after`** — "move it to the Monday after". Saturday and Sunday both move
 *     FORWARDS to the following Monday.
 *   - **`skip`** — that occurrence does NOT exist. The schedule advances to its
 *     next weekday date instead, so a weekly Saturday routine under `skip` has no
 *     occurrences at all (which is why the boundary refuses to store that rule).
 *
 * A moved occurrence NEVER re-anchors the series: the successor records the
 * unadjusted grid date in `TaskRecurrenceSeries.scheduleAnchorDate`, exactly as a
 * "change this occurrence" move does (TASKS-07), so a monthly rule nudged off the
 * 1st because it fell on a Sunday returns to the 1st next month rather than
 * drifting a day earlier every month.
 */
export const TASK_RECURRENCE_WEEKEND_RULES = [
  "allow",
  "before",
  "after",
  "skip",
] as const;
export type TaskRecurrenceWeekendRule =
  (typeof TASK_RECURRENCE_WEEKEND_RULES)[number];

/** The documented default: occurrences fall where the schedule puts them. */
export const DEFAULT_TASK_RECURRENCE_WEEKEND_RULE: TaskRecurrenceWeekendRule =
  "allow";

/**
 * The frequencies a weekend rule may be attached to.
 *
 * `day` is excluded because "every day, but not at weekends" is already spelled
 * `weekday`, and `before`/`after` on a daily rule would map Friday, Saturday and
 * Sunday onto the SAME date. `weekday` is excluded because it means Monday–Friday
 * by definition and cannot produce a weekend date to handle.
 */
export const WEEKEND_RULE_FREQUENCIES = ["week", "month", "year"] as const;

/**
 * TASKS-12 — the largest number of occurrences an "ends after N" rule may name.
 *
 * Chosen against what the condition IS: a bounded routine ("the twelve monthly
 * instalments", "six physiotherapy sessions"). A thousand occurrences of anything
 * is a schedule with no end, which is what "Never ends" is for.
 */
export const MAX_TASK_RECURRENCE_COUNT = 999;

/**
 * The frequencies an `after_completion` rule may use. "Every weekday" and a
 * weekday-pinned weekly rule are SCHEDULE concepts — "every weekday, 3 days after I
 * finish it" is not a thing anyone means — so they are refused at the boundary
 * rather than stored and given a surprising interpretation later.
 */
export const AFTER_COMPLETION_FREQUENCIES = [
  "day",
  "week",
  "month",
  "year",
] as const;

export type TaskRecurrenceRule = {
  readonly frequency: TaskRecurrenceFrequency;
  readonly interval: number;
  readonly dateKind: TaskRecurrenceDateKind;
  /** Fixed schedule, or an interval measured from the completion day (TASKS-07). */
  readonly mode: TaskRecurrenceMode;
  /**
   * 0 = Sunday, 6 = Saturday.
   *
   * For a WEEKLY rule this is the set of days it falls on — one recurrence with
   * three days, never three series (TASKS-12). For a MONTHLY rule carrying an
   * `ordinal` it holds EXACTLY ONE day: the weekday of "the last Friday".
   */
  readonly weekdays: readonly number[];
  /**
   * TASKS-12 — which occurrence of `weekdays[0]` inside the month a monthly rule
   * means, or `null` for an ordinary day-of-month monthly rule.
   *
   * `null` and a set ordinal are the two monthly SHAPES, and they are mutually
   * exclusive: "the 15th" reads `anchorDay: 15, ordinal: null`, "the last Friday"
   * reads `ordinal: "last", weekdays: [5]`. Only ever set for `frequency: "month"`
   * on a `fixed` schedule.
   */
  readonly ordinal: TaskRecurrenceOrdinal | null;
  /**
   * TASKS-12 — what to do with an occurrence that lands on a Saturday or Sunday.
   * See {@link TASK_RECURRENCE_WEEKEND_RULES}. Defaults to `allow`.
   */
  readonly weekendRule: TaskRecurrenceWeekendRule;
  /**
   * TASKS-12 — "ends after N occurrences", or `null` for a series with no count
   * limit.
   *
   * **The current occurrence COUNTS.** A rule that ends after 12 occurrences
   * produces the occurrence the owner is looking at plus eleven more, and the
   * twelfth creates no successor. Occurrence number is `series.sequence + 1`, so
   * the successor is created only while `series.sequence + 2 <= endsAfterCount`.
   * Mutually exclusive with `endsOnDate`.
   */
  readonly endsAfterCount: number | null;
  /**
   * TASKS-12 — "ends on <date>", or `null`. The owner's calendar date, inclusive:
   * an occurrence falling exactly ON it is created, and the first computed date
   * AFTER it is not. Compared against the date the occurrence actually falls on,
   * so a weekend rule that moves an occurrence past the end date ends the series.
   * Mutually exclusive with `endsAfterCount`.
   */
  readonly endsOnDate: string | null;
  /** Original requested day-of-month for monthly/yearly clamping. */
  readonly anchorDay: number | null;
  /** Original requested month for yearly rules, 1-12. */
  readonly anchorMonth: number | null;
};

export type TaskRecurrenceInput = Partial<TaskRecurrenceRule> & {
  readonly frequency: TaskRecurrenceFrequency;
  readonly dateKind: TaskRecurrenceDateKind;
};

/**
 * The persisted identity of one recurrence SERIES and this Task's position in it.
 * Every occurrence of the same repeating Task shares the `seriesId`; `sequence`
 * increases by exactly one per successor. The pair is UNIQUE per workspace in
 * storage, which is what makes successor creation idempotent under a retry or a
 * concurrent completion.
 */
export type TaskRecurrenceSeries = {
  readonly seriesId: string;
  readonly sequence: number;
  /**
   * TASKS-07 — the date the SERIES grid is stepped from, when it is deliberately
   * different from THIS occurrence's own anchor date.
   *
   * `null` (every rule written before TASKS-07, and every ordinary occurrence) means
   * the occurrence's own anchor date IS the grid — the original behaviour. It is set
   * only by the "change this occurrence" series-edit scope, which moves one
   * occurrence without re-anchoring the routine; the successor returns to the grid
   * and stores `null` again. An `after_completion` rule never reads it, because that
   * mode's grid is the completion day.
   */
  readonly scheduleAnchorDate: string | null;
};

/** Maximum length of a recurrence series id (matches the storage CHECK). */
export const TASK_RECURRENCE_SERIES_ID_MAX_LENGTH = 128;

/**
 * Which Task date a rule advances. A `scheduled` rule needs a scheduled date; a
 * `due` rule needs a due date. The field name is the one the Task view uses, so a
 * validation error points at the control the user must fill.
 */
export function recurrenceAnchorField(
  rule: Pick<TaskRecurrenceRule, "dateKind">,
): "scheduledDate" | "dueDate" {
  return rule.dateKind === "due" ? "dueDate" : "scheduledDate";
}

function assertIsoDate(value: string, field: TaskValidationField): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new TaskValidationError(
      field,
      "must be a date-only YYYY-MM-DD value",
    );
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new TaskValidationError(field, "must be a real calendar date");
  }
  return value;
}

function isoParts(iso: string): {
  readonly year: number;
  readonly month: number;
  readonly day: number;
} {
  assertIsoDate(iso, "scheduledDate");
  return {
    year: Number(iso.slice(0, 4)),
    month: Number(iso.slice(5, 7)),
    day: Number(iso.slice(8, 10)),
  };
}

function toIso(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addCalendarDays(iso: string, days: number): string {
  const { year, month, day } = isoParts(iso);
  const base = Date.UTC(year, month - 1, day);
  return new Date(base + days * 86_400_000).toISOString().slice(0, 10);
}

export function weekdayOfDate(iso: string): number {
  const { year, month, day } = isoParts(iso);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * Whole calendar days from `fromIso` to `toIsoValue` (negative when earlier).
 * Exported so a successor can preserve the GAP between its two dates without a
 * second copy of calendar arithmetic (DEBT-52).
 */
export function calendarDaysBetween(
  fromIso: string,
  toIsoValue: string,
): number {
  return daysBetween(fromIso, toIsoValue);
}

function daysBetween(fromIso: string, toIsoValue: string): number {
  const from = isoParts(fromIso);
  const to = isoParts(toIsoValue);
  const fromMs = Date.UTC(from.year, from.month - 1, from.day);
  const toMs = Date.UTC(to.year, to.month - 1, to.day);
  return Math.floor((toMs - fromMs) / 86_400_000);
}

function maxIso(a: string, b: string): string {
  return a >= b ? a : b;
}

function normaliseWeekdays(value: readonly number[] | undefined): number[] {
  const raw = value ?? [];
  const unique = [...new Set(raw)].sort((a, b) => a - b);
  for (const weekday of unique) {
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      throw new TaskValidationError("recurrence", "weekday must be 0-6");
    }
  }
  return unique;
}

export function validateTaskRecurrenceRule(
  input: TaskRecurrenceInput,
): TaskRecurrenceRule {
  if (
    !(TASK_RECURRENCE_FREQUENCIES as readonly string[]).includes(
      input.frequency,
    )
  ) {
    throw new TaskValidationError("recurrence", "frequency is invalid");
  }
  if (
    !(TASK_RECURRENCE_DATE_KINDS as readonly string[]).includes(input.dateKind)
  ) {
    throw new TaskValidationError("recurrence", "date kind is invalid");
  }
  const interval = input.interval ?? 1;
  if (!Number.isInteger(interval) || interval < 1 || interval > 99) {
    throw new TaskValidationError("recurrence", "interval must be 1-99");
  }
  const mode = input.mode ?? DEFAULT_TASK_RECURRENCE_MODE;
  if (!(TASK_RECURRENCE_MODES as readonly string[]).includes(mode)) {
    throw new TaskValidationError("recurrence", "repeat mode is invalid");
  }
  if (
    mode === "after_completion" &&
    !(AFTER_COMPLETION_FREQUENCIES as readonly string[]).includes(
      input.frequency,
    )
  ) {
    throw new TaskValidationError(
      "recurrence",
      "an after-completion repeat must be measured in days, weeks, months or years",
    );
  }
  const weekdays = normaliseWeekdays(input.weekdays);
  /*
   * TASKS-12 — the monthly nth-weekday shape, validated FIRST because it changes
   * what the weekday set means. Everywhere else a weekday set is "which days of
   * the week"; here it is the single weekday of "the last Friday".
   */
  const ordinal = input.ordinal ?? null;
  if (
    ordinal !== null &&
    !(TASK_RECURRENCE_ORDINALS as readonly string[]).includes(ordinal)
  ) {
    throw new TaskValidationError("recurrence", "the ordinal is invalid");
  }
  if (ordinal !== null) {
    if (input.frequency !== "month") {
      throw new TaskValidationError(
        "recurrence",
        "first/second/third/fourth/last is only valid for a monthly repeat",
      );
    }
    if (mode !== "fixed") {
      throw new TaskValidationError(
        "recurrence",
        "an after-completion repeat cannot fall on a named weekday of the month",
      );
    }
    if (weekdays.length !== 1) {
      throw new TaskValidationError(
        "recurrence",
        "choose exactly one weekday for a monthly repeat on a named weekday",
      );
    }
  }
  if (mode === "after_completion" && weekdays.length > 0) {
    throw new TaskValidationError(
      "recurrence",
      "an after-completion repeat cannot be pinned to particular weekdays",
    );
  }
  if (input.frequency === "weekday" && weekdays.length > 0) {
    throw new TaskValidationError(
      "recurrence",
      "weekday recurrence uses Monday-Friday automatically",
    );
  }
  if (input.frequency !== "week" && ordinal === null && weekdays.length > 0) {
    throw new TaskValidationError(
      "recurrence",
      "selected weekdays are only valid for weekly recurrence",
    );
  }
  const weekendRule = input.weekendRule ?? DEFAULT_TASK_RECURRENCE_WEEKEND_RULE;
  if (
    !(TASK_RECURRENCE_WEEKEND_RULES as readonly string[]).includes(weekendRule)
  ) {
    throw new TaskValidationError("recurrence", "the weekend rule is invalid");
  }
  if (
    weekendRule !== "allow" &&
    !(WEEKEND_RULE_FREQUENCIES as readonly string[]).includes(input.frequency)
  ) {
    throw new TaskValidationError(
      "recurrence",
      "weekend handling applies to weekly, monthly and yearly repeats",
    );
  }
  /*
   * A weekly rule that falls ONLY at weekends and is told to skip weekends has no
   * occurrences at all. Refused here, at the boundary, rather than stored and
   * discovered as a completion that cannot compute a successor.
   */
  if (
    weekendRule === "skip" &&
    input.frequency === "week" &&
    weekdays.length > 0 &&
    weekdays.every((day) => day === 0 || day === 6)
  ) {
    throw new TaskValidationError(
      "recurrence",
      "this repeat only falls at weekends, so skipping weekends would leave no occurrences",
    );
  }
  /*
   * TASKS-12 — the END condition. Exactly one of the two, or neither ("never
   * ends", the default and the only behaviour before TASKS-12). Storing both would
   * make the series' end depend on which check ran first.
   */
  const endsAfterCount = input.endsAfterCount ?? null;
  const endsOnDate = input.endsOnDate ?? null;
  if (endsAfterCount !== null && endsOnDate !== null) {
    throw new TaskValidationError(
      "recurrence",
      "a repeat ends after a number of times or on a date, not both",
    );
  }
  if (
    endsAfterCount !== null &&
    (!Number.isInteger(endsAfterCount) ||
      endsAfterCount < 1 ||
      endsAfterCount > MAX_TASK_RECURRENCE_COUNT)
  ) {
    throw new TaskValidationError(
      "recurrence",
      `the number of times must be 1 to ${MAX_TASK_RECURRENCE_COUNT}`,
    );
  }
  if (endsOnDate !== null) assertIsoDate(endsOnDate, "recurrence");
  const anchorDay = input.anchorDay ?? null;
  if (
    anchorDay !== null &&
    (!Number.isInteger(anchorDay) || anchorDay < 1 || anchorDay > 31)
  ) {
    throw new TaskValidationError("recurrence", "anchor day is invalid");
  }
  const anchorMonth = input.anchorMonth ?? null;
  if (
    anchorMonth !== null &&
    (!Number.isInteger(anchorMonth) || anchorMonth < 1 || anchorMonth > 12)
  ) {
    throw new TaskValidationError("recurrence", "anchor month is invalid");
  }
  if (input.frequency === "month" && anchorDay === null) {
    throw new TaskValidationError(
      "recurrence",
      "monthly recurrence requires an anchor day",
    );
  }
  if (
    input.frequency === "year" &&
    (anchorDay === null || anchorMonth === null)
  ) {
    throw new TaskValidationError(
      "recurrence",
      "yearly recurrence requires an anchor month and day",
    );
  }
  return {
    frequency: input.frequency,
    interval,
    dateKind: input.dateKind,
    mode,
    weekdays,
    ordinal,
    weekendRule,
    endsAfterCount,
    endsOnDate,
    anchorDay,
    anchorMonth,
  };
}

/**
 * Validate a rule AGAINST the Task's anchor date, which is the shape every mutation
 * boundary needs:
 *
 *   - a `scheduled` rule requires the Task to have a scheduled date, a `due` rule a
 *     due date — a rule with no anchor could never compute a successor, so it is
 *     rejected at the boundary rather than stored and discovered later;
 *   - a monthly rule with no explicit `anchorDay` (and a yearly rule with no
 *     `anchorMonth`) takes them FROM that anchor date, so "every month" on the 31st
 *     keeps returning to the 31st.
 *
 * `anchorIso` is the owner's calendar date already stored on the Task.
 */
export function resolveTaskRecurrenceRule(
  input: TaskRecurrenceInput,
  anchorIso: string | null,
): TaskRecurrenceRule {
  if (
    !(TASK_RECURRENCE_DATE_KINDS as readonly string[]).includes(input.dateKind)
  ) {
    throw new TaskValidationError("recurrence", "date kind is invalid");
  }
  if (anchorIso === null) {
    throw new TaskValidationError(
      "recurrence",
      input.dateKind === "due"
        ? "due-date recurrence needs a due date on the task"
        : "scheduled-date recurrence needs a scheduled date on the task",
    );
  }
  assertIsoDate(anchorIso, recurrenceAnchorField(input));
  const parts = isoParts(anchorIso);
  const needsDay = input.frequency === "month" || input.frequency === "year";
  const needsMonth = input.frequency === "year";
  /*
   * TASKS-12 — a monthly nth-weekday rule takes its WEEKDAY from the anchor date
   * when the caller did not name one, exactly as an ordinary monthly rule takes
   * its day-of-month: "repeat on the last <this task's weekday> of the month".
   * `anchorDay` is still filled for such a rule — it is ignored by the arithmetic
   * (the ordinal decides the day), and storage has required a monthly anchor day
   * since migration 0024.
   */
  const needsOrdinalWeekday =
    (input.ordinal ?? null) !== null && (input.weekdays ?? []).length === 0;
  const resolved = validateTaskRecurrenceRule({
    ...input,
    ...(needsOrdinalWeekday ? { weekdays: [weekdayOfDate(anchorIso)] } : {}),
    anchorDay: input.anchorDay ?? (needsDay ? parts.day : null),
    anchorMonth: input.anchorMonth ?? (needsMonth ? parts.month : null),
  });
  /*
   * The one weekend refusal that needs the anchor date: a weekly rule with NO
   * selected weekdays repeats on the anchor's own weekday, so "every Saturday,
   * skip weekends" is only visible here. Refused at the boundary rather than
   * stored as a series that can never produce another occurrence.
   */
  if (
    resolved.weekendRule === "skip" &&
    resolved.frequency === "week" &&
    resolved.weekdays.length === 0 &&
    isWeekend(weekdayOfDate(anchorIso))
  ) {
    throw new TaskValidationError(
      "recurrence",
      "this repeat only falls at weekends, so skipping weekends would leave no occurrences",
    );
  }
  return resolved;
}

/** Saturday (6) and Sunday (0) — the one definition of "weekend" in the kernel. */
function isWeekend(weekday: number): boolean {
  return weekday === 0 || weekday === 6;
}

/**
 * The date of the `ordinal`-th `weekday` of one month — "the last Friday of
 * February 2027".
 *
 * `last` is computed BACKWARDS from the final day of the month, which is what
 * makes it correct in a 28-day February, a 29-day leap February and a 31-day
 * January without a special case for any of them. The four counted ordinals are
 * computed forwards from the first matching weekday; `fourth` always exists
 * (every month has at least 28 days), which is why there is no `fifth`.
 */
export function ordinalWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  ordinal: TaskRecurrenceOrdinal,
): string {
  const total = daysInMonth(year, month);
  if (ordinal === "last") {
    const lastWeekday = new Date(Date.UTC(year, month - 1, total)).getUTCDay();
    return toIso(year, month, total - ((lastWeekday - weekday + 7) % 7));
  }
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const firstMatch = 1 + ((weekday - firstWeekday + 7) % 7);
  const index = TASK_RECURRENCE_ORDINALS.indexOf(ordinal);
  return toIso(year, month, firstMatch + index * 7);
}

function nextMonthly(
  anchorIso: string,
  thresholdIso: string,
  interval: number,
  anchorDay: number,
): string {
  const anchor = isoParts(anchorIso);
  let months = 0;
  for (let guard = 0; guard < 1200; guard++) {
    months += interval;
    const monthIndex = anchor.month - 1 + months;
    const year = anchor.year + Math.floor(monthIndex / 12);
    const month = (monthIndex % 12) + 1;
    const day = Math.min(anchorDay, daysInMonth(year, month));
    const candidate = toIso(year, month, day);
    if (candidate > thresholdIso) return candidate;
  }
  throw new TaskValidationError("recurrence", "could not advance recurrence");
}

/**
 * TASKS-12 — the monthly grid for an nth-weekday rule ("the last Friday of every
 * second month").
 *
 * The month grid is stepped exactly as {@link nextMonthly} steps it — from the
 * anchor's MONTH, in `interval` steps — and the day inside each month is computed
 * from the ordinal rather than clamped from a requested day-of-month. Starting
 * from month 0 rather than `interval` matters: an occurrence moved earlier in its
 * own month (or a `last Friday` that lands before a mid-month completion) must be
 * able to produce the same month's date when it is still after the threshold.
 */
function nextMonthlyOrdinal(
  anchorIso: string,
  thresholdIso: string,
  interval: number,
  weekday: number,
  ordinal: TaskRecurrenceOrdinal,
): string {
  const anchor = isoParts(anchorIso);
  for (let step = 0; step <= 1200; step += 1) {
    const monthIndex = anchor.month - 1 + step * interval;
    const year = anchor.year + Math.floor(monthIndex / 12);
    const month = (monthIndex % 12) + 1;
    const candidate = ordinalWeekdayOfMonth(year, month, weekday, ordinal);
    if (candidate > thresholdIso) return candidate;
  }
  throw new TaskValidationError("recurrence", "could not advance recurrence");
}

function nextYearly(
  anchorIso: string,
  thresholdIso: string,
  interval: number,
  anchorMonth: number,
  anchorDay: number,
): string {
  const anchor = isoParts(anchorIso);
  for (let years = interval; years <= interval * 1000; years += interval) {
    const year = anchor.year + years;
    const day = Math.min(anchorDay, daysInMonth(year, anchorMonth));
    const candidate = toIso(year, anchorMonth, day);
    if (candidate > thresholdIso) return candidate;
  }
  throw new TaskValidationError("recurrence", "could not advance recurrence");
}

/**
 * The next occurrence's anchor date, for a rule, the current occurrence's anchor and
 * the OWNER's completion day (ADR-022 — never a browser or UTC date).
 *
 * The two scheduling modes differ in exactly one thing: what the interval is measured
 * from.
 *
 *   - **`fixed`** keeps the SERIES GRID. The next date is the first date on the
 *     rule's own grid (stepped from `currentAnchorIso`) that falls strictly after the
 *     later of the current anchor and the completion day — so a routine completed
 *     three days late lands back on schedule, and a long-missed daily task resumes
 *     tomorrow rather than replaying every skipped day.
 *   - **`after_completion`** RE-ANCHORS to the completion day: the same arithmetic is
 *     applied with the completion day as both the anchor and the threshold, and a
 *     monthly/yearly rule takes its day (and month) from that day rather than from
 *     the original request — "three months after I did it" is the whole point, so
 *     clamping back to a date the owner has moved on from would be wrong.
 *
 * Pure and calendar-only. `fixed` behaviour is byte-for-byte what this function did
 * before TASKS-07, which is what lets the migration default reproduce every existing
 * series exactly.
 */
export function nextTaskOccurrenceDate(
  ruleInput: TaskRecurrenceInput,
  currentAnchorIso: string,
  ownerCompletionIso: string,
): string {
  return nextTaskOccurrenceStep(ruleInput, currentAnchorIso, ownerCompletionIso)
    .date;
}

/**
 * TASKS-12 — one step of the series, as the pair the storage layer needs.
 *
 *   - `date` is where the occurrence actually falls, AFTER the weekend rule;
 *   - `gridDate` is the unadjusted schedule date when the weekend rule moved the
 *     occurrence off it, and `null` when it did not.
 *
 * The pair exists so a moved occurrence never re-anchors the routine. The
 * successor stores `gridDate` in `TaskRecurrenceSeries.scheduleAnchorDate` — the
 * SAME field TASKS-07 added for "change this occurrence" — and the step after it
 * is computed from the grid, so "the 1st of every month, moved to the Friday
 * before when it falls at a weekend" returns to the 1st rather than walking
 * backwards a day or two every month.
 */
export type TaskOccurrenceStep = {
  readonly date: string;
  readonly gridDate: string | null;
};

export function nextTaskOccurrenceStep(
  ruleInput: TaskRecurrenceInput,
  currentAnchorIso: string,
  ownerCompletionIso: string,
): TaskOccurrenceStep {
  const validated = validateTaskRecurrenceRule(ruleInput);
  const grid = nextGridDate(validated, currentAnchorIso, ownerCompletionIso);
  return applyWeekendRule(
    validated,
    grid,
    currentAnchorIso,
    ownerCompletionIso,
  );
}

/**
 * TASKS-12 — apply the rule's weekend handling to one computed grid date.
 *
 * `skip` re-enters the grid (the occurrence does not exist, so the schedule
 * advances); `before`/`after` move the DATE and remember the grid; `allow` is the
 * identity. Bounded in every branch — `skip` steps at most 400 grid dates, which
 * is far beyond any real rule and still a hard stop rather than a loop.
 */
function applyWeekendRule(
  rule: TaskRecurrenceRule,
  gridIso: string,
  currentAnchorIso: string,
  ownerCompletionIso: string,
): TaskOccurrenceStep {
  if (rule.weekendRule === "allow" || !isWeekend(weekdayOfDate(gridIso))) {
    return { date: gridIso, gridDate: null };
  }
  if (rule.weekendRule === "skip") {
    let candidate = gridIso;
    for (let guard = 0; guard < 400; guard += 1) {
      if (!isWeekend(weekdayOfDate(candidate))) {
        return { date: candidate, gridDate: null };
      }
      candidate = nextGridDate(
        rule,
        currentAnchorIso,
        maxIso(candidate, ownerCompletionIso),
      );
    }
    throw new TaskValidationError("recurrence", "could not advance recurrence");
  }
  // Saturday (6) is one day from Friday and two from Monday; Sunday (0) is two
  // from Friday and one from Monday. Stated as arithmetic on the weekday rather
  // than as four branches, so the two directions cannot drift apart.
  const weekday = weekdayOfDate(gridIso);
  const date =
    rule.weekendRule === "before"
      ? addCalendarDays(gridIso, weekday === 6 ? -1 : -2)
      : addCalendarDays(gridIso, weekday === 6 ? 2 : 1);
  return { date, gridDate: gridIso };
}

/** The rule's own grid step, before any weekend handling. */
function nextGridDate(
  ruleInput: TaskRecurrenceInput,
  currentAnchorIso: string,
  ownerCompletionIso: string,
): string {
  const validated = validateTaskRecurrenceRule(ruleInput);
  assertIsoDate(currentAnchorIso, "scheduledDate");
  assertIsoDate(ownerCompletionIso, "scheduledDate");
  if (validated.mode === "after_completion") {
    const completion = isoParts(ownerCompletionIso);
    const needsDay =
      validated.frequency === "month" || validated.frequency === "year";
    const needsMonth = validated.frequency === "year";
    return nextFixedOccurrenceDate(
      {
        ...validated,
        anchorDay: needsDay ? completion.day : validated.anchorDay,
        anchorMonth: needsMonth ? completion.month : validated.anchorMonth,
      },
      ownerCompletionIso,
      ownerCompletionIso,
    );
  }
  return nextFixedOccurrenceDate(
    validated,
    currentAnchorIso,
    maxIso(currentAnchorIso, ownerCompletionIso),
  );
}

/** The grid step: the first date on the rule's grid strictly after `threshold`. */
function nextFixedOccurrenceDate(
  rule: TaskRecurrenceRule,
  currentAnchorIso: string,
  threshold: string,
): string {
  switch (rule.frequency) {
    case "day": {
      const missed = Math.floor(
        daysBetween(currentAnchorIso, threshold) / rule.interval,
      );
      let candidate = addCalendarDays(
        currentAnchorIso,
        (missed + 1) * rule.interval,
      );
      while (candidate <= threshold) {
        candidate = addCalendarDays(candidate, rule.interval);
      }
      return candidate;
    }
    case "weekday": {
      let candidate = addCalendarDays(threshold, 1);
      for (let guard = 0; guard < 14; guard++) {
        const weekday = weekdayOfDate(candidate);
        if (weekday >= 1 && weekday <= 5) return candidate;
        candidate = addCalendarDays(candidate, 1);
      }
      throw new TaskValidationError(
        "recurrence",
        "could not advance recurrence",
      );
    }
    case "week": {
      const selected =
        rule.weekdays.length > 0
          ? rule.weekdays
          : [weekdayOfDate(currentAnchorIso)];
      const anchorWeekStart = addCalendarDays(
        currentAnchorIso,
        -weekdayOfDate(currentAnchorIso),
      );
      let candidate = addCalendarDays(threshold, 1);
      for (let guard = 0; guard < 3710; guard++) {
        const weeksSinceAnchor = Math.floor(
          daysBetween(anchorWeekStart, candidate) / 7,
        );
        if (
          weeksSinceAnchor >= 0 &&
          weeksSinceAnchor % rule.interval === 0 &&
          selected.includes(weekdayOfDate(candidate))
        ) {
          return candidate;
        }
        candidate = addCalendarDays(candidate, 1);
      }
      throw new TaskValidationError(
        "recurrence",
        "could not advance recurrence",
      );
    }
    case "month":
      // TASKS-12 — the two monthly SHAPES. `ordinal` set means "the last Friday";
      // absent means the ordinary day-of-month rule TASKS-04 shipped, byte for
      // byte, which is why every stored rule keeps its behaviour.
      return rule.ordinal !== null && rule.weekdays.length === 1
        ? nextMonthlyOrdinal(
            currentAnchorIso,
            threshold,
            rule.interval,
            rule.weekdays[0]!,
            rule.ordinal,
          )
        : nextMonthly(
            currentAnchorIso,
            threshold,
            rule.interval,
            rule.anchorDay ?? isoParts(currentAnchorIso).day,
          );
    case "year":
      return nextYearly(
        currentAnchorIso,
        threshold,
        rule.interval,
        rule.anchorMonth ?? isoParts(currentAnchorIso).month,
        rule.anchorDay ?? isoParts(currentAnchorIso).day,
      );
  }
}

/* -------------------------------------------------------------------------- */
/* TASKS-12 — end conditions                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The ONE place that decides whether a series produces another occurrence, and
 * where that occurrence falls.
 *
 * Every caller that creates a successor goes through this function — completion
 * in the storage layer is the only one — so "does this series continue?" has a
 * single answer computed from a single rule. It returns `null` when the series has
 * ENDED, which is a legitimate, ordinary outcome: the last occurrence of a bounded
 * routine is completed like any other and simply creates nothing.
 *
 * Two end conditions, and the counting rule is stated once here so it cannot be
 * re-decided elsewhere:
 *
 *   - **`endsAfterCount`** — the CURRENT occurrence counts. `series.sequence` is
 *     0-based, so the occurrence in hand is number `sequence + 1` and the
 *     successor would be number `sequence + 2`; it is created only while that is
 *     `<= endsAfterCount`. "Ends after 1" therefore means this one and no more.
 *   - **`endsOnDate`** — INCLUSIVE, and compared against the date the occurrence
 *     actually FALLS ON (after the weekend rule), because that is the date the
 *     owner sees and the date they were choosing between when they set the end.
 *
 * Pure and calendar-only: the caller passes the owner's day (ADR-022).
 */
export function planNextTaskOccurrence(
  ruleInput: TaskRecurrenceInput,
  series: Pick<TaskRecurrenceSeries, "sequence">,
  currentGridAnchorIso: string,
  ownerCompletionIso: string,
): TaskOccurrenceStep | null {
  const rule = validateTaskRecurrenceRule(ruleInput);
  if (
    rule.endsAfterCount !== null &&
    series.sequence + 2 > rule.endsAfterCount
  ) {
    return null;
  }
  const step = nextTaskOccurrenceStep(
    rule,
    currentGridAnchorIso,
    ownerCompletionIso,
  );
  if (rule.endsOnDate !== null && step.date > rule.endsOnDate) return null;
  return step;
}
