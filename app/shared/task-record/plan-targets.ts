/**
 * Task planning target dates (pure, React-free, testable).
 *
 * The quick-plan actions on the Task record surface (Today / Tomorrow / Next week)
 * commit a task to a calendar day. This small, deterministic date arithmetic was
 * introduced by TODAY-04 (in `today/task/planning-view.ts`) and re-homed to the
 * Tasks module in PROJ-01 so the re-homed Task record Drawer owns it without
 * depending on the Today module. Today's planning view-model re-exports these so its
 * existing importers are unchanged.
 *
 * Dates are date-only `YYYY-MM-DD`; the only `Date` use is deterministic UTC
 * arithmetic on the calendar components, never a timezone shift.
 */

import {
  addCalendarDays as addKernelCalendarDays,
  isCalendarDate,
} from "~/kernel/datetime";

/**
 * Add `days` to a date-only `YYYY-MM-DD` value, returning `YYYY-MM-DD`. Uses UTC
 * arithmetic on the calendar components only, so it is deterministic and never
 * shifts by a timezone. Returns the input unchanged if it is not a valid date.
 */
export function addCalendarDays(iso: string, days: number): string {
  // DEBT-52 — the kernel's ONE calendar-day implementation. The lenient
  // "return the input unchanged" contract is preserved: this is a UI helper
  // whose caller may hold a half-typed value, and throwing would be wrong here.
  return isCalendarDate(iso) ? addKernelCalendarDays(iso, days) : iso;
}

/**
 * The weekday of a date-only `YYYY-MM-DD`, 0 = Sunday … 6 = Saturday.
 *
 * UTC component arithmetic, like everything else here: a date-only value has no
 * time and no zone, and reading its weekday through the local clock is how a
 * Saturday becomes a Friday for anyone west of Greenwich. Returns `null` for a
 * value that is not a date, so a caller degrades rather than guesses.
 */
export function calendarWeekday(iso: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  return new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  ).getUTCDay();
}

/** The dates the quick-plan actions commit to, derived from the owner's today. */
export interface PlanTargets {
  readonly today: string;
  readonly tomorrow: string;
  /**
   * CONTROL-01 — the coming Saturday, or today when today IS the weekend.
   *
   * "This weekend" is the preset every mature task product offers and the one
   * an owner reaches for most after Today and Tomorrow, because it is the
   * answer to "not during the week". Saturday rather than Sunday: it is the
   * start of the window, so a task planned for it is still in the weekend if
   * it slips a day.
   *
   * On a Saturday or a Sunday it resolves to today rather than to next week's
   * Saturday — "this weekend" said on a Saturday means today, and jumping six
   * days forward would be the one reading nobody intends.
   */
  readonly thisWeekend: string;
  /** One week ahead — the calm "later this week / next week" quick action. */
  readonly nextWeek: string;
}

/** Resolve the quick-plan target dates from the owner's calendar day. */
export function planTargets(todayIso: string): PlanTargets {
  const weekday = calendarWeekday(todayIso);
  const daysToSaturday =
    weekday === null ? 0 : weekday === 0 || weekday === 6 ? 0 : 6 - weekday;
  return {
    today: todayIso,
    tomorrow: addCalendarDays(todayIso, 1),
    thisWeekend: addCalendarDays(todayIso, daysToSaturday),
    nextWeek: addCalendarDays(todayIso, 7),
  };
}

/**
 * EDIT-03 — the same three dates, as the one-press shortcuts a DATE EDITOR
 * offers above its input.
 *
 * The Task record's planning section has always drawn Today / Tomorrow / Next
 * week as buttons beside its dates; the shared `InlineDateField` now offers the
 * same row inside the popover and the phone sheet, so a date is one press
 * wherever it is edited instead of only on the record. Deriving them HERE keeps
 * one definition of what the product's shortcut dates are — the shared field is
 * given the list, and never invents a calendar vocabulary of its own.
 *
 * `todayIso` is the OWNER's calendar day, resolved server-side (ADR-022). A
 * surface that cannot name one offers no shortcuts rather than guessing from
 * the browser clock: a wrong "Today" on a date field is worse than no Today.
 */
export function taskDateShortcuts(
  todayIso: string,
): readonly { readonly label: string; readonly value: string }[] {
  const targets = planTargets(todayIso);
  const shortcuts = [
    { label: "Today", value: targets.today },
    { label: "Tomorrow", value: targets.tomorrow },
    { label: "This weekend", value: targets.thisWeekend },
    { label: "Next week", value: targets.nextWeek },
  ];
  /*
   * CONTROL-01 — a preset that duplicates another is DROPPED, not drawn twice.
   *
   * On a Friday "Tomorrow" and "This weekend" are both Saturday; on a Saturday
   * "Today" and "This weekend" are both today. Two buttons committing the same
   * date is a choice that is not a choice, and the second one would light up
   * `aria-pressed` alongside the first.
   */
  const seen = new Set<string>();
  return shortcuts.filter((shortcut) => {
    if (seen.has(shortcut.value)) return false;
    seen.add(shortcut.value);
    return true;
  });
}
