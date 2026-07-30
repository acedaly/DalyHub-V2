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

export type TaskRecurrenceRule = {
  readonly frequency: TaskRecurrenceFrequency;
  readonly interval: number;
  readonly dateKind: TaskRecurrenceDateKind;
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
  const weekdays = normaliseWeekdays(input.weekdays);
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
    weekdays,
    anchorDay,
    anchorMonth,
  };
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

export function nextTaskOccurrenceDate(
  ruleInput: TaskRecurrenceRule,
  currentAnchorIso: string,
  ownerCompletionIso: string,
): string {
  const rule = validateTaskRecurrenceRule(ruleInput);
  assertIsoDate(currentAnchorIso, "scheduledDate");
  assertIsoDate(ownerCompletionIso, "scheduledDate");
  const threshold = maxIso(currentAnchorIso, ownerCompletionIso);

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
