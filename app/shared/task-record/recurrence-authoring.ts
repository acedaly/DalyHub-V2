/**
 * TASKS-07 — the recurrence AUTHORING model (pure, React-free, testable).
 *
 * The recurrence kernel has been more capable than its UI since TASKS-04: it accepts
 * any interval 1–99 over five frequencies, weekday-pinned weekly rules and (new in
 * V2.2) two scheduling modes, while the only authoring surface was a seven-item
 * `Repeat` select. A rule outside that list was displayed truthfully but could not be
 * created or edited except by typing a magic phrase into quick capture — recorded as
 * DEBT-66. This module closes that gap.
 *
 * It is the translation layer between the OWNER's vocabulary and the kernel's typed
 * rule, and it lives outside React so the translation is unit-tested directly rather
 * than through a rendered form.
 *
 * Two rules it exists to enforce:
 *
 *   1. **The owner never sees implementation vocabulary.** No `frequency` enum, no
 *      `interval` integer, no `anchor_day`, no `dateKind`. They choose a unit in
 *      plain words ("weeks"), a number, weekdays by name, and one of two plainly-worded
 *      scheduling modes. `taskRecurrenceLabel` then states the result as a sentence
 *      BEFORE it is saved, so nothing has to be mentally decoded.
 *   2. **A preset and a custom rule are the same data.** Choosing "Weekly" and building
 *      "every 1 week" produce an identical rule, so switching between the two views
 *      never rewrites what the task already has. `presetOf` is the inverse of
 *      `ruleForPreset`, and that round trip is asserted by test.
 */

import {
  DEFAULT_TASK_RECURRENCE_MODE,
  DEFAULT_TASK_RECURRENCE_WEEKEND_RULE,
  MAX_TASK_RECURRENCE_COUNT,
  WEEKEND_RULE_FREQUENCIES,
  type TaskRecurrenceDateKind,
  type TaskRecurrenceFrequency,
  type TaskRecurrenceInput,
  type TaskRecurrenceMode,
  type TaskRecurrenceOrdinal,
  type TaskRecurrenceRule,
  type TaskRecurrenceWeekendRule,
} from "~/kernel/tasks";

/**
 * The ordinary repeat choices, in menu order. Deliberately short: these are the rules
 * people actually pick, and everything else is one step away behind **Custom…**.
 */
export const RECURRENCE_PRESETS = [
  "none",
  "daily",
  "weekdays",
  "weekly",
  "monthly",
  "yearly",
  "custom",
] as const;
export type RecurrencePreset = (typeof RECURRENCE_PRESETS)[number];

export const RECURRENCE_PRESET_LABELS: Record<RecurrencePreset, string> = {
  none: "Does not repeat",
  daily: "Daily",
  weekdays: "Every weekday",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
  custom: "Custom…",
};

/** The units a custom repeat is measured in, in the owner's words. */
export const RECURRENCE_UNITS = ["day", "week", "month", "year"] as const;
export type RecurrenceUnit = (typeof RECURRENCE_UNITS)[number];

/** Singular / plural unit wording, chosen by the interval. */
export function recurrenceUnitLabel(
  unit: RecurrenceUnit,
  interval: number,
): string {
  const plural = interval === 1 ? "" : "s";
  return `${unit}${plural}`;
}

/**
 * TASKS-12 — the two MONTHLY shapes, in the owner's words.
 *
 * "Day 15" or "Last Friday" — the choice a monthly rule actually presents, and
 * the only place the ordinal vocabulary appears. A weekly, daily or yearly rule
 * never sees this control, because there is no choice to make.
 */
export const MONTHLY_SHAPES = ["day", "ordinal"] as const;
export type MonthlyShape = (typeof MONTHLY_SHAPES)[number];

/** The ordinal labels, in the owner's words. */
export const RECURRENCE_ORDINAL_LABELS: Record<TaskRecurrenceOrdinal, string> = {
  first: "First",
  second: "Second",
  third: "Third",
  fourth: "Fourth",
  last: "Last",
};

/**
 * TASKS-12 — the weekend rule, worded as the BEHAVIOUR rather than as a flag.
 *
 * There is no "Skip weekends" checkbox anywhere in this product, deliberately:
 * the phrase names three different behaviours in three different products, and a
 * checkbox cannot say which one it means. Each option below is a complete
 * sentence about what will happen, so the owner chooses the outcome rather than
 * a label.
 */
export const RECURRENCE_WEEKEND_LABELS: Record<
  TaskRecurrenceWeekendRule,
  string
> = {
  allow: "Leave it on the weekend",
  before: "Move it to the Friday before",
  after: "Move it to the Monday after",
  skip: "Skip that occurrence",
};

/**
 * TASKS-12 — the three END conditions, in menu order.
 *
 * "Never" first because it is what almost every routine is; the other two are
 * one choice away and each reveals exactly one field.
 */
export const RECURRENCE_ENDS = ["never", "after", "on"] as const;
export type RecurrenceEnd = (typeof RECURRENCE_ENDS)[number];

export const RECURRENCE_END_LABELS: Record<RecurrenceEnd, string> = {
  never: "Never",
  after: "After a number of times",
  on: "On a date",
};

/** The two scheduling modes, in the owner's words rather than the column's. */
export const RECURRENCE_MODE_LABELS: Record<TaskRecurrenceMode, string> = {
  fixed: "Keep a fixed schedule",
  after_completion: "Repeat after completion",
};

/** What each mode actually does, so the choice is understandable before it is made. */
export const RECURRENCE_MODE_DESCRIPTIONS: Record<TaskRecurrenceMode, string> =
  {
    fixed:
      "The next date follows the schedule. Finishing late does not move the routine.",
    after_completion:
      "The next date is counted from the day you finish it. Finishing late moves it.",
  };

/** The editor's working state — one field per control, all plain values. */
export interface RecurrenceDraft {
  readonly preset: RecurrencePreset;
  readonly unit: RecurrenceUnit;
  /** 1–99. Held as a string because it comes from a numeric text input. */
  readonly interval: string;
  /** Selected weekdays, 0 = Sunday. Only meaningful for a weekly fixed schedule. */
  readonly weekdays: readonly number[];
  readonly mode: TaskRecurrenceMode;
  /** Which of the Task's dates the rule advances. */
  readonly dateKind: TaskRecurrenceDateKind;
  /** TASKS-12 — which monthly shape: a day of the month, or a named weekday. */
  readonly monthlyShape: MonthlyShape;
  /** TASKS-12 — the ordinal, for the `ordinal` monthly shape. */
  readonly ordinal: TaskRecurrenceOrdinal;
  /** TASKS-12 — what happens when an occurrence lands at a weekend. */
  readonly weekendRule: TaskRecurrenceWeekendRule;
  /** TASKS-12 — which end condition the owner chose. */
  readonly ends: RecurrenceEnd;
  /** 1–999. Held as a string because it comes from a numeric text input. */
  readonly endsAfterCount: string;
  /** An owner-calendar `YYYY-MM-DD`, or "" when no date is chosen yet. */
  readonly endsOnDate: string;
}

export const EMPTY_RECURRENCE_DRAFT: RecurrenceDraft = {
  preset: "none",
  unit: "week",
  interval: "1",
  weekdays: [],
  mode: DEFAULT_TASK_RECURRENCE_MODE,
  dateKind: "scheduled",
  // TASKS-12 — every advanced field starts at the value that reproduces the
  // pre-TASKS-12 rule exactly, so opening the editor changes nothing.
  monthlyShape: "day",
  ordinal: "first",
  weekendRule: DEFAULT_TASK_RECURRENCE_WEEKEND_RULE,
  ends: "never",
  endsAfterCount: "12",
  endsOnDate: "",
};

/**
 * The preset a stored rule corresponds to, or `custom` when none does exactly.
 *
 * "Exactly" is load-bearing. A weekday-pinned weekly rule is stored as `week`/`1` plus
 * `weekdays: [1]`, and reporting it as plain "Weekly" would let the next interaction
 * silently drop the Monday — the bug V2.0.1 found and this function's strictness
 * prevents. An after-completion rule is likewise never a preset, because every preset
 * is a schedule.
 */
/** The rule shape the authoring layer reads. Every TASKS-12 field is optional. */
export type AuthoredRule = Pick<
  TaskRecurrenceRule,
  "frequency" | "interval" | "weekdays" | "mode"
> &
  Partial<
    Pick<
      TaskRecurrenceRule,
      "ordinal" | "weekendRule" | "endsAfterCount" | "endsOnDate"
    >
  >;

export function presetOf(rule: AuthoredRule | null): RecurrencePreset {
  if (rule === null) return "none";
  if ((rule.mode ?? "fixed") === "after_completion") return "custom";
  if (rule.weekdays.length > 0) return "custom";
  if (rule.interval !== 1) return "custom";
  /*
   * TASKS-12 — an advanced rule is NEVER a preset.
   *
   * The strictness is the same one V2.0.1's weekday bug taught: reporting "the
   * last Friday of every month" as plain "Monthly" would let the next
   * interaction silently drop the ordinal, and reporting a rule that ends after
   * twelve times as "Monthly" would let it silently become endless.
   */
  if ((rule.ordinal ?? null) !== null) return "custom";
  if ((rule.weekendRule ?? "allow") !== "allow") return "custom";
  if ((rule.endsAfterCount ?? null) !== null) return "custom";
  if ((rule.endsOnDate ?? null) !== null) return "custom";
  switch (rule.frequency) {
    case "day":
      return "daily";
    case "weekday":
      return "weekdays";
    case "week":
      return "weekly";
    case "month":
      return "monthly";
    case "year":
      return "yearly";
  }
}

/** The rule a preset means. `null` for `none`; `undefined` for `custom` (no rule). */
export function ruleForPreset(
  preset: RecurrencePreset,
  dateKind: TaskRecurrenceDateKind,
): TaskRecurrenceInput | null | undefined {
  if (preset === "none") return null;
  if (preset === "custom") return undefined;
  const frequency: TaskRecurrenceFrequency =
    preset === "daily"
      ? "day"
      : preset === "weekdays"
        ? "weekday"
        : preset === "weekly"
          ? "week"
          : preset === "monthly"
            ? "month"
            : "year";
  return {
    frequency,
    interval: 1,
    dateKind,
    mode: "fixed",
    weekdays: [],
    // TASKS-12 — a preset is the SIMPLE rule by definition, so every advanced
    // field is explicitly at its absent value. Stated rather than omitted, so
    // choosing a preset over an advanced rule CLEARS the advanced part instead
    // of silently keeping half of it.
    ordinal: null,
    weekendRule: "allow",
    endsAfterCount: null,
    endsOnDate: null,
  };
}

/** Load a stored rule into the editor's draft, so opening it shows what exists. */
export function draftFromRule(
  rule:
    | (AuthoredRule & Pick<TaskRecurrenceRule, "dateKind">)
    | null,
  fallbackDateKind: TaskRecurrenceDateKind = "scheduled",
): RecurrenceDraft {
  if (rule === null) {
    return { ...EMPTY_RECURRENCE_DRAFT, dateKind: fallbackDateKind };
  }
  const ordinal = rule.ordinal ?? null;
  const endsAfterCount = rule.endsAfterCount ?? null;
  const endsOnDate = rule.endsOnDate ?? null;
  return {
    preset: presetOf(rule),
    // `weekday` (Mon–Fri) has no custom form, so the unit falls back to something
    // sensible for when the owner switches away from it.
    unit: rule.frequency === "weekday" ? "week" : rule.frequency,
    interval: String(rule.interval),
    weekdays: [...rule.weekdays],
    mode: rule.mode ?? DEFAULT_TASK_RECURRENCE_MODE,
    dateKind: rule.dateKind,
    // TASKS-12 — each advanced control opens showing what the rule actually is.
    monthlyShape: ordinal === null ? "day" : "ordinal",
    ordinal: ordinal ?? EMPTY_RECURRENCE_DRAFT.ordinal,
    weekendRule: rule.weekendRule ?? DEFAULT_TASK_RECURRENCE_WEEKEND_RULE,
    ends:
      endsAfterCount !== null ? "after" : endsOnDate !== null ? "on" : "never",
    endsAfterCount:
      endsAfterCount === null
        ? EMPTY_RECURRENCE_DRAFT.endsAfterCount
        : String(endsAfterCount),
    endsOnDate: endsOnDate ?? "",
  };
}

/**
 * The problem with a draft, in the owner's words, or `null` when it is valid.
 *
 * Checked here rather than only at the server boundary so the editor can disable Save
 * and say why, instead of letting the owner submit something the kernel will refuse.
 * The kernel still validates — this is a courtesy, never the authority.
 */
export function recurrenceDraftError(draft: RecurrenceDraft): string | null {
  if (draft.preset !== "custom") return null;
  const interval = Number(draft.interval);
  if (
    draft.interval.trim().length === 0 ||
    !Number.isInteger(interval) ||
    interval < 1 ||
    interval > 99
  ) {
    return "Enter how often it repeats, from 1 to 99.";
  }
  if (
    draft.mode === "after_completion" &&
    draft.weekdays.length > 0 &&
    draft.unit === "week"
  ) {
    return "An after-completion repeat cannot be pinned to particular weekdays.";
  }
  /*
   * TASKS-12 — the four refusals the owner can reach from these controls,
   * each worded as the fix rather than as the rule that was broken. The kernel
   * checks all of them again at the boundary; this is a courtesy so Save can be
   * disabled with a reason instead of failing after a round trip.
   */
  if (
    draft.unit === "month" &&
    draft.monthlyShape === "ordinal" &&
    draft.weekdays.length !== 1
  ) {
    return "Choose one weekday for a monthly repeat on a named weekday.";
  }
  if (
    draft.unit === "week" &&
    draft.weekendRule === "skip" &&
    draft.weekdays.length > 0 &&
    draft.weekdays.every((day) => day === 0 || day === 6)
  ) {
    return "This repeat only falls at weekends, so there would be no occurrences left.";
  }
  if (draft.ends === "after") {
    const count = Number(draft.endsAfterCount);
    if (
      draft.endsAfterCount.trim().length === 0 ||
      !Number.isInteger(count) ||
      count < 1 ||
      count > MAX_TASK_RECURRENCE_COUNT
    ) {
      return `Enter how many times it repeats, from 1 to ${MAX_TASK_RECURRENCE_COUNT}.`;
    }
  }
  if (draft.ends === "on" && !/^\d{4}-\d{2}-\d{2}$/.test(draft.endsOnDate)) {
    return "Choose the date this repeat ends on.";
  }
  return null;
}

/**
 * The rule a draft describes: `null` when it does not repeat, or a validated
 * {@link TaskRecurrenceInput}. Returns `undefined` when the draft is not yet valid, so
 * a caller can never post a half-built rule.
 *
 * The weekday set is carried ONLY where the kernel accepts it — a weekly fixed
 * schedule — so switching the unit to months drops the weekdays rather than smuggling
 * them into a rule that would be refused.
 */
export function ruleFromDraft(
  draft: RecurrenceDraft,
): TaskRecurrenceInput | null | undefined {
  if (draft.preset !== "custom") {
    const preset = ruleForPreset(draft.preset, draft.dateKind);
    return preset === undefined ? undefined : preset;
  }
  if (recurrenceDraftError(draft) !== null) return undefined;
  const interval = Number(draft.interval);
  /*
   * TASKS-12 — the weekday set means two different things, and each is carried
   * ONLY where the kernel accepts it:
   *
   *   - a weekly FIXED schedule takes the whole selected set ("Mon, Wed, Fri"),
   *     which is ONE rule and one series, never three;
   *   - a monthly ORDINAL rule takes exactly one weekday (the Friday of "the last
   *     Friday").
   *
   * Everything else drops it, so switching the unit cannot smuggle a set into a
   * rule the kernel would refuse.
   */
  const ordinalRule = draft.unit === "month" && draft.monthlyShape === "ordinal";
  const weekdays = ordinalRule
    ? draft.weekdays.slice(0, 1)
    : draft.unit === "week" && draft.mode === "fixed"
      ? draft.weekdays
      : [];
  const weekendRule = (
    WEEKEND_RULE_FREQUENCIES as readonly string[]
  ).includes(draft.unit)
    ? draft.weekendRule
    : "allow";
  return {
    frequency: draft.unit,
    interval,
    dateKind: draft.dateKind,
    mode: draft.mode,
    weekdays: [...weekdays].sort((a, b) => a - b),
    ordinal: ordinalRule && draft.mode === "fixed" ? draft.ordinal : null,
    weekendRule,
    endsAfterCount:
      draft.ends === "after" ? Number(draft.endsAfterCount) : null,
    endsOnDate: draft.ends === "on" ? draft.endsOnDate : null,
  };
}

/** The form fields the canonical `intent=set_recurrence` mutation expects. */
export function recurrenceFormFields(
  rule: TaskRecurrenceInput | null,
): Record<string, string> {
  if (rule === null) return { intent: "set_recurrence" };
  return {
    intent: "set_recurrence",
    frequency: rule.frequency,
    interval: String(rule.interval ?? 1),
    dateKind: rule.dateKind,
    mode: rule.mode ?? DEFAULT_TASK_RECURRENCE_MODE,
    weekdays: (rule.weekdays ?? []).join(","),
    // TASKS-12 — every advanced field is sent as its own named field, and an
    // absent one means the documented default. Sending "" for a cleared field
    // rather than omitting it is what makes turning an end condition OFF a real
    // change rather than an unchanged key the action leaves alone.
    ordinal: rule.ordinal ?? "",
    weekendRule: rule.weekendRule ?? DEFAULT_TASK_RECURRENCE_WEEKEND_RULE,
    endsAfterCount:
      rule.endsAfterCount === null || rule.endsAfterCount === undefined
        ? ""
        : String(rule.endsAfterCount),
    endsOnDate: rule.endsOnDate ?? "",
  };
}
