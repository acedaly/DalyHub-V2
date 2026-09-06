/**
 * V2.10 LIFE-00 Obligations kernel — recurrence and the calendar arithmetic.
 *
 * DalyHub has THREE deliberate recurrence engines — Tasks, obligations and
 * Habits — each with its recorded reason, and V2.10 adds none (ADR-116
 * decision 1). This is the obligation one, moved out of the Assets kernel
 * unchanged so that a commitment with no Asset can use it. There is no
 * expression language and no cron: a rule is a (kind, interval) pair, which is
 * enough for "every six months" and "every 10,000 km" and stops well short of
 * a scheduling engine.
 *
 * Everything here is PURE and calendar-only: no clocks, no timezones, no
 * storage. The caller supplies the owner-calendar day (ADR-022 §22.7).
 */

import { calendarDaysBetween } from "~/kernel/datetime";

import { ObligationValidationError } from "./obligation-errors";

/* -------------------------------------------------------------------------- */
/* Recurrence vocabulary                                                      */
/* -------------------------------------------------------------------------- */

/**
 * How an obligation repeats. `none` is a one-off. The four date kinds advance a
 * calendar date by a bounded interval; `meter` advances a meter threshold and
 * is meaningful only where the subject carries a meter.
 */
export const OBLIGATION_RECURRENCE_KINDS = [
  "none",
  "days",
  "weeks",
  "months",
  "years",
  "meter",
] as const;

export type ObligationRecurrenceKind =
  (typeof OBLIGATION_RECURRENCE_KINDS)[number];

/** Every recurrence kind, in display order, with an owner-facing label. */
export const OBLIGATION_RECURRENCE_OPTIONS: readonly {
  readonly value: ObligationRecurrenceKind;
  readonly label: string;
}[] = [
  { value: "none", label: "Does not repeat" },
  { value: "days", label: "Every N days" },
  { value: "weeks", label: "Every N weeks" },
  { value: "months", label: "Every N months" },
  { value: "years", label: "Every N years" },
  { value: "meter", label: "Every N kilometres, hours or cycles" },
];

/** True when `value` is a supported recurrence kind. */
export function isObligationRecurrenceKind(
  value: unknown,
): value is ObligationRecurrenceKind {
  return (
    typeof value === "string" &&
    (OBLIGATION_RECURRENCE_KINDS as readonly string[]).includes(value)
  );
}

/** The largest recurrence interval accepted for a date-based rule. */
export const MAX_RECURRENCE_INTERVAL = 999;

/**
 * A plain-words description of a recurrence rule ("Every 6 months").
 *
 * A meter rule's interval is formatted by the domain that owns the meter's
 * units and passed in as `meterDescription`, so this module stays free of the
 * Asset meter vocabulary. Named for the domain rather than `describeRecurrence`
 * because Tasks has a function of that name for its own, different engine, and
 * two identically-named recurrence describers in one codebase is how two
 * engines come to be confused for one.
 */
export function describeObligationRecurrence(
  kind: ObligationRecurrenceKind,
  interval: number | null,
  meterDescription: string | null = null,
): string {
  if (kind === "none") return "Does not repeat";
  if (kind === "meter") {
    return meterDescription ? `Every ${meterDescription}` : "Repeats by meter";
  }
  const n = interval ?? 1;
  const unit =
    kind === "days"
      ? "day"
      : kind === "weeks"
        ? "week"
        : kind === "months"
          ? "month"
          : "year";
  return n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`;
}

/* -------------------------------------------------------------------------- */
/* Calendar arithmetic (pure, zone-free)                                      */
/* -------------------------------------------------------------------------- */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True when `value` is a well-formed `YYYY-MM-DD` calendar date. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map((p) => Number.parseInt(p, 10));
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

function toIso(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Add whole days to a calendar date. */
export function addObligationDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map((p) => Number.parseInt(p, 10));
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Add whole months to a calendar date, CLAMPING into short months (31 January +
 * 1 month = 28 February). The requested day-of-month is not remembered across
 * hops: an obligation advances one step at a time from its own due date, so
 * there is no multi-hop drift to correct for.
 */
export function addObligationMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map((p) => Number.parseInt(p, 10));
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return toIso(year, month, Math.min(d, daysInMonth(year, month)));
}

/**
 * Whole days from `from` to `to`; positive when `to` is later.
 *
 * DEBT-52 — the kernel's ONE calendar-day implementation, worded for
 * obligations.
 */
export function obligationDaysBetween(from: string, to: string): number {
  return calendarDaysBetween(from, to);
}

/**
 * The next due date after `from`, advancing by one recurrence step.
 *
 * ANCHORED ON THE DATE THE CALLER SUPPLIES — which on completion is the date
 * the work was ACTUALLY done, not the date it was originally due. A service
 * done two months late therefore schedules the next one a full interval after
 * the work, which is what a person means by "every six months", rather than
 * compounding the lateness forever. This is the rule V2.10 must not lose, and
 * it is falsified by anchoring on `dueDate` instead.
 *
 * Returns null for a non-recurring or meter-only rule — a meter rule advances a
 * threshold, not a date.
 */
export function nextObligationDate(
  from: string,
  kind: ObligationRecurrenceKind,
  interval: number | null,
): string | null {
  if (kind === "none" || kind === "meter") return null;
  if (!isIsoDate(from)) {
    throw new ObligationValidationError(
      "dueDate",
      "must be a real calendar date",
    );
  }
  const n = interval ?? 1;
  if (!Number.isInteger(n) || n < 1 || n > MAX_RECURRENCE_INTERVAL) {
    throw new ObligationValidationError(
      "recurrenceInterval",
      "must be between 1 and 999",
    );
  }
  switch (kind) {
    case "days":
      return addObligationDays(from, n);
    case "weeks":
      return addObligationDays(from, n * 7);
    case "months":
      return addObligationMonths(from, n);
    case "years":
      return addObligationMonths(from, n * 12);
  }
}
