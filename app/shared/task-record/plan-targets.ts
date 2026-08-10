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

/**
 * Add `days` to a date-only `YYYY-MM-DD` value, returning `YYYY-MM-DD`. Uses UTC
 * arithmetic on the calendar components only, so it is deterministic and never
 * shifts by a timezone. Returns the input unchanged if it is not a valid date.
 */
export function addCalendarDays(iso: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) {
    return iso;
  }
  const dt = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  dt.setUTCDate(dt.getUTCDate() + days);
  const year = dt.getUTCFullYear();
  const month = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const day = String(dt.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** The dates the quick-plan actions commit to, derived from the owner's today. */
export interface PlanTargets {
  readonly today: string;
  readonly tomorrow: string;
  /** One week ahead — the calm "later this week / next week" quick action. */
  readonly nextWeek: string;
}

/** Resolve the quick-plan target dates from the owner's calendar day. */
export function planTargets(todayIso: string): PlanTargets {
  return {
    today: todayIso,
    tomorrow: addCalendarDays(todayIso, 1),
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
  return [
    { label: "Today", value: targets.today },
    { label: "Tomorrow", value: targets.tomorrow },
    { label: "Next week", value: targets.nextWeek },
  ];
}
