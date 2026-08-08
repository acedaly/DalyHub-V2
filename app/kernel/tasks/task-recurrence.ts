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
  /** 0 = Sunday, 6 = Saturday. Used by selected-weekday weekly rules. */
  readonly weekdays: readonly number[];
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
  if (input.frequency !== "week" && weekdays.length > 0) {
    throw new TaskValidationError(
      "recurrence",
      "selected weekdays are only valid for weekly recurrence",
    );
  }
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
  return validateTaskRecurrenceRule({
    ...input,
    anchorDay: input.anchorDay ?? (needsDay ? parts.day : null),
    anchorMonth: input.anchorMonth ?? (needsMonth ? parts.month : null),
  });
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
      return nextMonthly(
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
