/**
 * HABITS-01 — the ONE place a submitted schedule becomes a domain schedule.
 *
 * Both the create endpoint and the mutate endpoint parse the SAME three fields
 * through this function, so there is one wire format and one place the closed
 * vocabulary is enforced. It does no validation of its own beyond shape: the
 * kernel's `validateHabitSchedule` is the authority, and everything here does is
 * turn a `FormData` into the object that authority reads.
 */

import type { HabitSchedule } from "~/kernel/habits";
import { validateHabitSchedule } from "~/kernel/habits";

/** The form field names the Habit schedule editor submits. */
export const HABIT_SCHEDULE_FIELDS = [
  "scheduleKind",
  "weekdays",
  "timesPerWeek",
] as const;

/**
 * Read a schedule from a submitted form.
 *
 * `weekdays` arrives as a comma-separated list of zero-based indices (Sunday =
 * 0) because that is what a checkbox group serialises to most simply; it is
 * parsed to numbers here and normalised (sorted, de-duplicated) by the kernel.
 * A value the kernel rejects throws `HabitValidationError`, which the route
 * turns into a field error rather than a 500.
 */
export function parseHabitScheduleForm(form: FormData): HabitSchedule {
  const kind = String(form.get("scheduleKind") ?? "");
  if (kind === "weekdays") {
    const raw = String(form.get("weekdays") ?? "");
    const weekdays = raw
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part !== "")
      .map((part) => Number.parseInt(part, 10));
    return validateHabitSchedule({ kind, weekdays });
  }
  if (kind === "weekly_count") {
    const raw = String(form.get("timesPerWeek") ?? "");
    return validateHabitSchedule({
      kind,
      timesPerWeek: Number.parseInt(raw, 10),
    });
  }
  return validateHabitSchedule({ kind });
}
