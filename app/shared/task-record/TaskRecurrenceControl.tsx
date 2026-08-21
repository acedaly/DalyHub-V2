/**
 * DHDS-10 — a Task's REPEAT, as a contextual choice, with the editor one row
 * away.
 *
 * ── The rule this embodies ──────────────────────────────────────────────────
 * *Common choice inline. Complex configuration deeper* (DHDS-10 §14). A repeat
 * is the clearest case in the product of a property whose ordinary answers are
 * a six-item list and whose real vocabulary is a composition — a frequency, an
 * interval, a set of weekdays, an ordinal, a weekend rule, an end condition and
 * a scheduling MODE, all of which have to agree with the Task's anchor date.
 *
 * Before this, DalyHub had only the second half. `taskRecurrenceLabel` printed
 * "Every Mon, Thu" on the row and on the record, and the only way to change it
 * was the full `TaskRecurrenceEditor`. So "make this weekly" — a decision with
 * one obviously correct answer — cost the same interaction as authoring "the
 * last Friday of every month, ending after twelve".
 *
 * This is the first half, and it deliberately adds NOTHING to the domain. The
 * options are `RECURRENCE_PRESETS` exactly as TASKS-12 defined them, the rule
 * each one means is `ruleForPreset`, and reading a stored rule back to a preset
 * is `presetOf` — the same inverse pair the editor itself uses, which is what
 * makes a rule authored in the editor still read correctly here and a preset
 * chosen here still open correctly in the editor.
 *
 * ── An advanced rule is never a preset ──────────────────────────────────────
 * `presetOf` answers `custom` for anything with an interval, a weekday pin, an
 * ordinal, a weekend rule or an end condition, and this control shows that
 * rule's real words ("Every 3 months", "14 days after completion") as its READ
 * state rather than flattening it to "Monthly". Choosing a preset over such a
 * rule CLEARS the advanced part, because `ruleForPreset` states every advanced
 * field at its absent value — which is the behaviour the editor already has and
 * the reason it states them rather than omitting them.
 *
 * ── Custom… is a command, not a value ───────────────────────────────────────
 * It is the shared field's `escapeAction`: a `menuitem` among `menuitemradio`s,
 * so a screen reader is never told the field is "set to Custom…". It closes the
 * menu and opens the host's editor; nothing is written, so cancelling there
 * leaves the rule exactly as it was.
 *
 * ── It owns no mutation ─────────────────────────────────────────────────────
 * `onSave` is the host's, and every host posts the one canonical
 * `intent=set_recurrence` through `recurrenceFormFields`. The kernel still
 * validates the rule against the Task's anchor date and still refuses one that
 * could never compute a successor.
 */

import { useCallback, useMemo } from "react";

import { InlineSelectField } from "~/shared/inline-edit";
import type { InlineSaveOutcome } from "~/shared/inline-edit";
import type {
  TaskRecurrenceDateKind,
  TaskRecurrenceInput,
  TaskRecurrenceRule,
} from "~/kernel/tasks";

import {
  RECURRENCE_PRESET_LABELS,
  RECURRENCE_PRESETS,
  presetOf,
  ruleForPreset,
  type RecurrencePreset,
} from "./recurrence-authoring";
import { taskRecurrenceLabel } from "./task-view";

/**
 * The presets offered as VALUES.
 *
 * `custom` is excluded because it is the escape hatch rather than a rule, and
 * `none` is included because "Does not repeat" is a real state of the field —
 * not an absence — so it belongs in the list rather than behind a Clear command
 * that would be a second way to say the same thing.
 */
const PRESET_VALUES: readonly RecurrencePreset[] = RECURRENCE_PRESETS.filter(
  (preset) => preset !== "custom",
);

const PRESET_OPTIONS = PRESET_VALUES.map((preset) => ({
  value: preset,
  label: RECURRENCE_PRESET_LABELS[preset],
}));

export interface TaskRecurrenceControlProps {
  /** The stored rule, or `null` when the Task does not repeat. */
  readonly value: TaskRecurrenceRule | null;
  /**
   * Which date the rule advances, for a Task that does not yet have a rule.
   * Ignored when one exists — a preset never silently re-anchors an existing
   * repeat from the scheduled date to the due date or back.
   */
  readonly dateKind?: TaskRecurrenceDateKind;
  /** Persist. MUST post the canonical `intent=set_recurrence`. */
  readonly onSave: (
    rule: TaskRecurrenceInput | null,
  ) => Promise<InlineSaveOutcome>;
  /** Open the full recurrence editor. Omit and "Custom…" is not offered. */
  readonly onOpenEditor?: () => void;
  readonly readOnly?: boolean;
  /** DHDS-10 — how loud the field is at rest. See `~/shared/inline-edit`. */
  readonly presentation?: "default" | "meta";
  readonly "data-testid"?: string;
}

export function TaskRecurrenceControl({
  value,
  dateKind = "scheduled",
  onSave,
  onOpenEditor,
  readOnly = false,
  presentation = "default",
  "data-testid": testId = "task-recurrence-choice",
}: TaskRecurrenceControlProps) {
  const preset = presetOf(value);

  /*
   * An ADVANCED rule keeps its own words, and joins the list as a checked
   * option so the menu can say which state the field is in.
   *
   * Without this the field would open with nothing checked — a menu that
   * silently disagrees with the value beside it — and the owner would have no
   * way to tell that pressing "Monthly" is about to discard an ordinal.
   */
  const options = useMemo(() => {
    if (preset !== "custom") return PRESET_OPTIONS;
    return [
      ...PRESET_OPTIONS,
      {
        value: "custom",
        label: taskRecurrenceLabel(value) ?? RECURRENCE_PRESET_LABELS.custom,
        description: "A rule you built in the repeat editor.",
      },
    ];
  }, [preset, value]);

  const save = useCallback(
    async (next: string): Promise<InlineSaveOutcome> => {
      // The advanced pseudo-option is the CURRENT value, so choosing it is a
      // no-op rather than an attempt to write the word "custom" as a rule.
      if (next === "custom") return { ok: true };
      const rule = ruleForPreset(
        next as RecurrencePreset,
        // An existing rule keeps the date it advances; only a Task with no rule
        // takes the caller's default.
        value?.dateKind ?? dateKind,
      );
      // `undefined` is `ruleForPreset`'s "open the editor" answer, which cannot
      // reach here — `custom` is handled above and is not one of the values.
      return onSave(rule === undefined ? null : rule);
    },
    [dateKind, onSave, value],
  );

  return (
    <InlineSelectField
      label="Repeats"
      value={preset}
      options={options}
      onSave={save}
      readOnly={readOnly}
      presentation={presentation}
      {...(onOpenEditor && !readOnly
        ? {
            escapeAction: {
              label: RECURRENCE_PRESET_LABELS.custom,
              description: "Intervals, weekdays, and when the series ends.",
              onSelect: onOpenEditor,
            },
          }
        : {})}
      data-testid={testId}
    />
  );
}
