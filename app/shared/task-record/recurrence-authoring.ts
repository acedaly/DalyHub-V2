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
  type TaskRecurrenceDateKind,
  type TaskRecurrenceFrequency,
  type TaskRecurrenceInput,
  type TaskRecurrenceMode,
  type TaskRecurrenceRule,
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
}

export const EMPTY_RECURRENCE_DRAFT: RecurrenceDraft = {
  preset: "none",
  unit: "week",
  interval: "1",
  weekdays: [],
  mode: DEFAULT_TASK_RECURRENCE_MODE,
  dateKind: "scheduled",
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
export function presetOf(
  rule: Pick<
    TaskRecurrenceRule,
    "frequency" | "interval" | "weekdays" | "mode"
  > | null,
): RecurrencePreset {
  if (rule === null) return "none";
  if ((rule.mode ?? "fixed") === "after_completion") return "custom";
  if (rule.weekdays.length > 0) return "custom";
  if (rule.interval !== 1) return "custom";
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
  };
}

/** Load a stored rule into the editor's draft, so opening it shows what exists. */
export function draftFromRule(
  rule: Pick<
    TaskRecurrenceRule,
    "frequency" | "interval" | "weekdays" | "mode" | "dateKind"
  > | null,
  fallbackDateKind: TaskRecurrenceDateKind = "scheduled",
): RecurrenceDraft {
  if (rule === null) {
    return { ...EMPTY_RECURRENCE_DRAFT, dateKind: fallbackDateKind };
  }
  return {
    preset: presetOf(rule),
    // `weekday` (Mon–Fri) has no custom form, so the unit falls back to something
    // sensible for when the owner switches away from it.
    unit: rule.frequency === "weekday" ? "week" : rule.frequency,
    interval: String(rule.interval),
    weekdays: [...rule.weekdays],
    mode: rule.mode ?? DEFAULT_TASK_RECURRENCE_MODE,
    dateKind: rule.dateKind,
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
  const weekdays =
    draft.unit === "week" && draft.mode === "fixed" ? draft.weekdays : [];
  return {
    frequency: draft.unit,
    interval,
    dateKind: draft.dateKind,
    mode: draft.mode,
    weekdays: [...weekdays].sort((a, b) => a - b),
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
  };
}
