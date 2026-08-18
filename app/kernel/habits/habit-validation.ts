/**
 * HABITS-01 Habits kernel — the ONE validation boundary.
 *
 * Every value that crosses into the Habits domain from a form, a URL or an
 * untrusted client passes through here first. Validation is pure and
 * storage-free; the D1 adapter calls it before building any statement, so an
 * invalid value never reaches SQL and never leaves a partial write behind.
 *
 * Messages describe the RULE, never the value: an error may say a weekday list
 * is out of range, and never quote what was sent.
 */

import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  TITLE_MAX_LENGTH,
} from "~/kernel/entities";

import { HabitValidationError } from "./habit-errors";
import {
  HABIT_MAX_TIMES_PER_WEEK,
  isHabitDate,
  type HabitSchedule,
} from "./habit-schedule";
import type { HabitListStatus } from "./habit";

/** The longest a Habit's notes may be. Long-form writing belongs in a Note. */
export const HABIT_NOTES_MAX_LENGTH = 2000;

/** Count code POINTS, so an emoji is one character rather than two. */
function codePointLength(value: string): number {
  return [...value].length;
}

/** Validate a Habit id: a non-empty, bounded identifier. */
export function validateHabitId(
  value: unknown,
  field: "id" | "goalId" | "areaId" = "id",
): string {
  if (typeof value !== "string") {
    throw new HabitValidationError(field, "must be a string");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new HabitValidationError(field, "must not be empty");
  }
  if (trimmed.length > 64) {
    throw new HabitValidationError(field, "must be at most 64 characters");
  }
  return trimmed;
}

/** Validate a Habit title against the shared entity-header title rules. */
export function validateHabitTitle(value: unknown): string {
  if (typeof value !== "string") {
    throw new HabitValidationError("title", "must be a string");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new HabitValidationError("title", "must not be empty");
  }
  if (codePointLength(trimmed) > TITLE_MAX_LENGTH) {
    throw new HabitValidationError(
      "title",
      `must be at most ${TITLE_MAX_LENGTH} characters`,
    );
  }
  return trimmed;
}

/** Normalise optional notes: trimmed, bounded, empty becomes `null`. */
export function validateHabitNotes(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new HabitValidationError("notes", "must be a string");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (codePointLength(trimmed) > HABIT_NOTES_MAX_LENGTH) {
    throw new HabitValidationError(
      "notes",
      `must be at most ${HABIT_NOTES_MAX_LENGTH} characters`,
    );
  }
  return trimmed;
}

/**
 * Validate and NORMALISE a schedule.
 *
 * Normalisation is part of the contract, not a convenience: weekdays are sorted
 * and de-duplicated here so `[3,1,1]` and `[1,3]` are one stored value, and two
 * Habits with the same cadence can never compare unequal because of the order
 * the owner happened to tick the boxes in.
 */
export function validateHabitSchedule(value: unknown): HabitSchedule {
  if (typeof value !== "object" || value === null) {
    throw new HabitValidationError("schedule", "must be a schedule");
  }
  const kind = (value as { kind?: unknown }).kind;
  if (kind === "daily") return { kind: "daily" };

  if (kind === "weekdays") {
    const raw = (value as { weekdays?: unknown }).weekdays;
    if (!Array.isArray(raw)) {
      throw new HabitValidationError("weekdays", "must be a list of weekdays");
    }
    const days = [...new Set(raw)].map((day) => {
      if (
        typeof day !== "number" ||
        !Number.isInteger(day) ||
        day < 0 ||
        day > 6
      ) {
        throw new HabitValidationError(
          "weekdays",
          "must be whole numbers from 0 (Sunday) to 6 (Saturday)",
        );
      }
      return day;
    });
    if (days.length === 0) {
      throw new HabitValidationError("weekdays", "must name at least one day");
    }
    return { kind: "weekdays", weekdays: days.sort((a, b) => a - b) };
  }

  if (kind === "weekly_count") {
    const raw = (value as { timesPerWeek?: unknown }).timesPerWeek;
    if (typeof raw !== "number" || !Number.isInteger(raw)) {
      throw new HabitValidationError("timesPerWeek", "must be a whole number");
    }
    if (raw < 1 || raw > HABIT_MAX_TIMES_PER_WEEK) {
      throw new HabitValidationError(
        "timesPerWeek",
        `must be between 1 and ${HABIT_MAX_TIMES_PER_WEEK}`,
      );
    }
    return { kind: "weekly_count", timesPerWeek: raw };
  }

  throw new HabitValidationError(
    "schedule",
    "must be every day, selected weekdays, or a number of times a week",
  );
}

/** True when two schedules mean exactly the same thing (both normalised). */
export function habitSchedulesEqual(
  a: HabitSchedule,
  b: HabitSchedule,
): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "weekdays" && b.kind === "weekdays") {
    return (
      a.weekdays.length === b.weekdays.length &&
      a.weekdays.every((day, index) => day === b.weekdays[index])
    );
  }
  if (a.kind === "weekly_count" && b.kind === "weekly_count") {
    return a.timesPerWeek === b.timesPerWeek;
  }
  return true;
}

/**
 * Validate a check-in date: a real wall-calendar date, not in the future.
 *
 * "Not in the future" is decided against the OWNER's calendar day, supplied by
 * the caller from the one scope-level authority (`ownerTodayIso`) — never
 * against a browser clock and never against the Worker's UTC day, either of
 * which would let a check-in land on tomorrow for an owner in Sydney.
 */
export function validateHabitCheckInDate(
  value: unknown,
  todayIso: string,
): string {
  if (!isHabitDate(value)) {
    throw new HabitValidationError("date", "must be a date (YYYY-MM-DD)");
  }
  if (value > todayIso) {
    throw new HabitValidationError("date", "cannot be in the future");
  }
  return value;
}

/** Validate a lifecycle filter; the default is `active`. */
export function validateHabitStatus(value: unknown): HabitListStatus {
  if (value === undefined || value === null) return "active";
  if (value === "active" || value === "archived" || value === "all") {
    return value;
  }
  throw new HabitValidationError("status", "must be active, archived or all");
}

/** Validate and clamp a page limit into the shared `[1, MAX_PAGE_SIZE]` bounds. */
export function validateHabitLimit(value: unknown): number {
  if (value === undefined || value === null) return DEFAULT_PAGE_SIZE;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new HabitValidationError("limit", "must be a positive whole number");
  }
  return Math.min(value, MAX_PAGE_SIZE);
}

/** Normalise a search query: trimmed, lower-cased, bounded; empty becomes null. */
export function normaliseHabitQuery(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new HabitValidationError("query", "must be a string");
  }
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0) return null;
  if (trimmed.length > 200) {
    throw new HabitValidationError("query", "must be at most 200 characters");
  }
  return trimmed;
}

/** Validate a bounded date window for a completions read. */
export function validateHabitDateWindow(
  fromIso: unknown,
  toIso: unknown,
): { readonly fromIso: string; readonly toIso: string } {
  if (!isHabitDate(fromIso) || !isHabitDate(toIso)) {
    throw new HabitValidationError("range", "must be two dates (YYYY-MM-DD)");
  }
  if (toIso < fromIso) {
    throw new HabitValidationError("range", "must end on or after it starts");
  }
  return { fromIso, toIso };
}
