/**
 * TASKS-07 — the shared Task RECURRENCE editor.
 *
 * The one surface where a repeat is authored, from either direction:
 *
 *   - the ordinary case is a **preset** — Does not repeat · Daily · Every weekday ·
 *     Weekly · Monthly · Yearly — which is one choice and saves immediately;
 *   - anything else is **Custom…**, which opens the composition: a number, a unit, the
 *     weekdays, and the scheduling mode.
 *
 * Everything the owner touches is in their own words. There is no frequency enum, no
 * interval field labelled "interval", no `anchor_day`, and no "date kind" — the last of
 * those reads "Repeat from: the planned date / the due date" and appears only when the
 * task has both, because with one date there is no choice to make.
 *
 * The RESULT is stated as a sentence before it is saved — "Every 2 weeks on Monday and
 * Thursday", "30 days after completion" — through the same `taskRecurrenceLabel` the
 * row, the Drawer and the quick-edit panel use. The owner never has to decode the
 * controls to know what they built, and the label they read here is the label they will
 * see afterwards.
 *
 * Phone-first (TASKS-08): every control is full width and stacks, the weekday toggles
 * are a wrapping row of 44px targets, and the interval input carries
 * `inputMode="numeric"` so a phone offers the number pad. It is verified at 320, 375,
 * 390 and 430px.
 *
 * It owns no authority. Saving calls the caller's `onSave`, which posts the canonical
 * `intent=set_recurrence` mutation; the kernel validates the rule against the task's
 * own anchor date and refuses one that could never compute a successor.
 */

import { useCallback, useEffect, useId, useMemo, useState } from "react";

import { FormButton, SelectField, TextField } from "~/shared/forms";
import {
  RECURRENCE_MODE_DESCRIPTIONS,
  RECURRENCE_MODE_LABELS,
  RECURRENCE_PRESETS,
  RECURRENCE_PRESET_LABELS,
  RECURRENCE_UNITS,
  draftFromRule,
  recurrenceDraftError,
  recurrenceUnitLabel,
  ruleFromDraft,
  type RecurrenceDraft,
  type RecurrencePreset,
  type RecurrenceUnit,
} from "./recurrence-authoring";
import {
  TASK_WEEKDAY_NAMES,
  TASK_WEEKDAY_SHORT_NAMES,
  taskRecurrenceLabel,
} from "./task-view";
import {
  TASK_RECURRENCE_MODES,
  type TaskRecurrenceDateKind,
  type TaskRecurrenceInput,
  type TaskRecurrenceMode,
  type TaskRecurrenceRule,
} from "~/kernel/tasks";

/** The recurrence-bearing subset of a Task this editor reads. */
export type RecurrenceEditorTask = {
  readonly recurrence?: Pick<
    TaskRecurrenceRule,
    "frequency" | "interval" | "weekdays" | "mode" | "dateKind"
  > | null;
  readonly scheduledDate: string | null;
  readonly dueDate: string | null;
};

export interface TaskRecurrenceEditorProps {
  readonly task: RecurrenceEditorTask;
  /**
   * Persist the rule (or `null` to stop repeating). The caller posts
   * `intent=set_recurrence` to the canonical route and returns whether it was accepted;
   * a refusal keeps the draft exactly as the owner left it.
   */
  readonly onSave: (
    rule: TaskRecurrenceInput | null,
  ) => Promise<{ readonly ok: boolean; readonly message?: string }>;
  readonly disabled?: boolean;
  /** A server-side refusal to show beside the controls. */
  readonly error?: string | null;
}

/**
 * Which of the task's dates a repeat can advance. A rule needs its anchor to exist, so
 * a task with only a due date cannot carry a `scheduled` rule — the choice is offered
 * only when both dates are present, and otherwise resolved to the one that is.
 */
function anchorChoices(task: RecurrenceEditorTask): {
  readonly options: readonly TaskRecurrenceDateKind[];
  readonly resolved: TaskRecurrenceDateKind;
} {
  const hasScheduled = task.scheduledDate !== null;
  const hasDue = task.dueDate !== null;
  if (hasScheduled && hasDue) {
    return { options: ["scheduled", "due"], resolved: "scheduled" };
  }
  if (hasDue) return { options: ["due"], resolved: "due" };
  return { options: ["scheduled"], resolved: "scheduled" };
}

export function TaskRecurrenceEditor({
  task,
  onSave,
  disabled = false,
  error,
}: TaskRecurrenceEditorProps) {
  const groupId = useId();
  const anchors = anchorChoices(task);
  const stored = task.recurrence ?? null;
  const [draft, setDraft] = useState<RecurrenceDraft>(() =>
    draftFromRule(stored, anchors.resolved),
  );
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Re-seed when the TASK changes underneath (a revalidation, or the panel being
  // re-pointed at another row). Keyed on the stored rule's identity, so the owner's
  // in-progress draft is never thrown away by an unrelated re-render.
  const storedKey = useMemo(
    () =>
      stored === null
        ? "none"
        : `${stored.frequency}:${stored.interval}:${stored.dateKind}:${stored.mode ?? "fixed"}:${[...stored.weekdays].join(",")}`,
    [stored],
  );
  useEffect(() => {
    setDraft(draftFromRule(stored, anchors.resolved));
    setLocalError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the rule identity.
  }, [storedKey]);

  const isCustom = draft.preset === "custom";
  const draftError = recurrenceDraftError(draft);
  const pending = ruleFromDraft(draft);
  const summary =
    draft.preset === "none"
      ? "Does not repeat"
      : pending === undefined || pending === null
        ? null
        : taskRecurrenceLabel({
            frequency: pending.frequency,
            interval: pending.interval ?? 1,
            dateKind: pending.dateKind,
            mode: pending.mode ?? "fixed",
            weekdays: pending.weekdays ?? [],
          });

  const commit = useCallback(
    async (rule: TaskRecurrenceInput | null) => {
      setSaving(true);
      setLocalError(null);
      const result = await onSave(rule);
      setSaving(false);
      if (!result.ok) {
        setLocalError(result.message ?? "That repeat couldn’t be saved.");
      }
    },
    [onSave],
  );

  /**
   * A PRESET saves immediately — it is one decision, and asking for a second click to
   * confirm "Weekly" would make the common case slower than the rare one. Choosing
   * **Custom…** opens the composition instead and waits, because a half-built custom
   * rule is not yet a rule.
   */
  const choosePreset = useCallback(
    (value: string) => {
      const preset = value as RecurrencePreset;
      const next: RecurrenceDraft = { ...draft, preset };
      setDraft(next);
      if (preset === "custom") return;
      void commit(ruleFromDraft(next) ?? null);
    },
    [commit, draft],
  );

  const toggleWeekday = useCallback((weekday: number) => {
    setDraft((current) => {
      const has = current.weekdays.includes(weekday);
      return {
        ...current,
        weekdays: has
          ? current.weekdays.filter((day) => day !== weekday)
          : [...current.weekdays, weekday].sort((a, b) => a - b),
      };
    });
  }, []);

  const busy = disabled || saving;
  const shownError = localError ?? error ?? null;

  return (
    <div
      className="dh-recurrence-editor"
      role="group"
      aria-labelledby={`${groupId}-label`}
      data-testid="task-recurrence-editor"
    >
      <SelectField
        label="Repeat"
        id={`${groupId}-preset`}
        showOptionalCue={false}
        value={draft.preset}
        options={RECURRENCE_PRESETS.map((preset) => ({
          value: preset,
          label: RECURRENCE_PRESET_LABELS[preset],
        }))}
        disabled={busy}
        onChange={choosePreset}
      />
      <span className="dh-visually-hidden" id={`${groupId}-label`}>
        Repeat
      </span>

      {isCustom ? (
        <div className="dh-recurrence-editor__custom">
          <div className="dh-recurrence-editor__every">
            <TextField
              label="Repeat every"
              id={`${groupId}-interval`}
              value={draft.interval}
              // A phone must offer the number pad for a number (TASKS-08 §42).
              inputMode="numeric"
              maxLength={2}
              disabled={busy}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  interval: value.replace(/[^0-9]/g, ""),
                }))
              }
            />
            <SelectField
              label="Unit"
              id={`${groupId}-unit`}
              showOptionalCue={false}
              value={draft.unit}
              options={RECURRENCE_UNITS.map((unit) => ({
                value: unit,
                label: recurrenceUnitLabel(unit, Number(draft.interval) || 1),
              }))}
              disabled={busy}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  unit: value as RecurrenceUnit,
                  // Weekdays only mean something for a weekly rule; changing the unit
                  // drops them rather than carrying a set the kernel would refuse.
                  weekdays: value === "week" ? current.weekdays : [],
                }))
              }
            />
          </div>

          <fieldset
            className="dh-recurrence-editor__modes"
            disabled={busy || undefined}
          >
            <legend className="dh-recurrence-editor__legend">
              How the next date is worked out
            </legend>
            {TASK_RECURRENCE_MODES.map((mode) => (
              <label
                key={mode}
                className="dh-recurrence-editor__mode"
                data-selected={draft.mode === mode ? "true" : "false"}
              >
                <input
                  type="radio"
                  name={`${groupId}-mode`}
                  value={mode}
                  checked={draft.mode === mode}
                  disabled={busy}
                  onChange={() =>
                    setDraft((current) => ({
                      ...current,
                      mode: mode as TaskRecurrenceMode,
                      // An after-completion interval is not a schedule, so it cannot be
                      // pinned to weekdays.
                      weekdays: mode === "fixed" ? current.weekdays : [],
                    }))
                  }
                />
                <span className="dh-recurrence-editor__mode-title">
                  {RECURRENCE_MODE_LABELS[mode]}
                </span>
                <span className="dh-recurrence-editor__mode-help">
                  {RECURRENCE_MODE_DESCRIPTIONS[mode]}
                </span>
              </label>
            ))}
          </fieldset>

          {draft.unit === "week" && draft.mode === "fixed" ? (
            <fieldset
              className="dh-recurrence-editor__weekdays"
              disabled={busy || undefined}
            >
              <legend className="dh-recurrence-editor__legend">
                On these days (optional)
              </legend>
              <div className="dh-recurrence-editor__weekday-row">
                {TASK_WEEKDAY_SHORT_NAMES.map((short, weekday) => {
                  const selected = draft.weekdays.includes(weekday);
                  const name = TASK_WEEKDAY_NAMES[weekday] ?? short;
                  return (
                    <label
                      key={short}
                      className="dh-recurrence-editor__weekday"
                      data-selected={selected ? "true" : "false"}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={busy}
                        onChange={() => toggleWeekday(weekday)}
                      />
                      {/*
                       * The label's accessible text is the FULL weekday name; the
                       * visible glyph is one letter so seven 44px targets fit a 320px
                       * row. The meaning therefore never depends on reading an
                       * abbreviation, and the selected state is carried by
                       * `aria-checked` on a real checkbox rather than by colour
                       * (AGENTS.md §15).
                       */}
                      <span className="dh-visually-hidden">{name}</span>
                      <span
                        className="dh-recurrence-editor__weekday-glyph"
                        aria-hidden="true"
                      >
                        {short.slice(0, 1)}
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="dh-recurrence-editor__hint">
                Leave all unselected to repeat on the same weekday as the
                current date.
              </p>
            </fieldset>
          ) : null}

          {anchors.options.length > 1 ? (
            <SelectField
              label="Repeat from"
              id={`${groupId}-anchor`}
              showOptionalCue={false}
              value={draft.dateKind}
              options={[
                { value: "scheduled", label: "The planned date" },
                { value: "due", label: "The due date" },
              ]}
              disabled={busy}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  dateKind: value as TaskRecurrenceDateKind,
                }))
              }
            />
          ) : null}

          {/*
           * The result, in plain language, BEFORE it is saved. This is the control that
           * makes the rest of the panel safe to use: whatever combination of number,
           * unit, weekdays and mode is on screen, the owner reads the sentence and
           * knows. It is a live region so a screen-reader user hears it change too.
           */}
          <p
            className="dh-recurrence-editor__summary"
            role="status"
            aria-live="polite"
            data-testid="task-recurrence-summary"
          >
            {draftError ?? summary ?? "Choose how often this repeats."}
          </p>

          <div className="dh-recurrence-editor__actions">
            <FormButton
              type="button"
              variant="primary"
              disabled={busy || draftError !== null || pending === undefined}
              onClick={() => void commit(pending ?? null)}
            >
              Save repeat
            </FormButton>
            <FormButton
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setDraft(draftFromRule(stored, anchors.resolved));
                setLocalError(null);
              }}
            >
              Cancel
            </FormButton>
          </div>
        </div>
      ) : summary !== null && draft.preset !== "none" ? (
        <p
          className="dh-recurrence-editor__summary"
          data-testid="task-recurrence-summary"
        >
          {summary}
        </p>
      ) : null}

      {shownError ? (
        <p className="dh-recurrence-editor__error" role="alert">
          {shownError}
        </p>
      ) : null}
    </div>
  );
}
