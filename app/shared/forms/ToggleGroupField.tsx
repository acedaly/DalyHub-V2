/**
 * DS-06 Shared Forms — the TOGGLE GROUP: a small closed set, several of which
 * may be on at once.
 *
 * The control DalyHub was missing. `SelectField multiple` is the right answer
 * when the set is long or unfamiliar (it filters, it scrolls, it sheets on a
 * phone); it is the wrong answer when the set is SEVEN ITEMS EVERY HUMAN ALREADY
 * KNOWS, because putting the days of the week behind a combobox costs a tap, a
 * scroll and a mental model for a choice that should be one glance and two taps.
 *
 * Introduced by HABITS-01 for the weekday schedule and built as a SHARED control
 * because it is not a Habits idea: TASKS-12's multi-weekday recurrence is the
 * next consumer, and a Habits-only weekday picker would be the thing it had to
 * copy (AGENTS.md §9.8).
 *
 * ── What makes it correct rather than seven coloured circles ────────────────
 *   - each option is a REAL `<input type="checkbox">` inside a real `<label>`,
 *     so it is keyboard-operable, announced with its state, and toggled by
 *     clicking its text as well as its box;
 *   - the group is a `role="group"` labelled by the field's own label, so a
 *     screen reader hears "Days, group" before the seven options;
 *   - every target is at least the WCAG 2.2 touch floor (`--app-touch-target-min`)
 *     on a coarse pointer, and the options WRAP rather than shrink, so a 320px
 *     phone gets two comfortable rows instead of seven 28px discs;
 *   - selection is never carried by colour alone: a selected option is drawn
 *     with a filled ground AND a tick, and its `aria-checked` state is the
 *     native one.
 */

import { composeDescribedBy, deriveFieldIds } from "./field-ids";
import type { BaseControlProps } from "./control-props";

export interface ToggleGroupOption {
  readonly value: string;
  /** The visible text. Keep it short — this control is for known vocabularies. */
  readonly label: string;
  /**
   * The accessible name, when the visible text is an abbreviation. "Mon" is
   * announced as "Monday" rather than as three letters.
   */
  readonly accessibleLabel?: string;
}

export interface ToggleGroupFieldProps extends BaseControlProps<
  readonly string[]
> {
  readonly options: readonly ToggleGroupOption[];
}

export function ToggleGroupField({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  help,
  required,
  disabled,
  readOnly,
  showOptionalCue = true,
  controlRef,
  className,
  options,
}: ToggleGroupFieldProps) {
  const baseId = id ?? `dh-toggles-${label.replace(/\s+/g, "-").toLowerCase()}`;
  const { helpId, errorId } = deriveFieldIds(baseId);
  const labelId = `${baseId}-label`;
  const invalid = Boolean(error);
  const describedBy = composeDescribedBy({
    helpId: help ? helpId : null,
    errorId: invalid ? errorId : null,
  });

  const toggle = (optionValue: string, on: boolean) => {
    if (readOnly || disabled) return;
    const next = on
      ? [...value, optionValue]
      : value.filter((current) => current !== optionValue);
    // The ORDER of the options is the order of the result, so a caller never
    // has to sort and two identical selections are never two different arrays.
    onChange(
      options
        .map((option) => option.value)
        .filter((optionValue) => next.includes(optionValue)),
    );
  };

  const rootClassName = ["dh-field", "dh-field--toggles", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={rootClassName}
      role="group"
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      data-invalid={invalid || undefined}
      data-disabled={disabled || undefined}
      data-readonly={readOnly || undefined}
    >
      <div className="dh-field__label-row">
        <span id={labelId} className="dh-field__label-text">
          {label}
        </span>
        {required ? (
          <span className="dh-field__required">
            <span aria-hidden="true">*</span>
            <span className="dh-visually-hidden"> (required)</span>
          </span>
        ) : showOptionalCue ? (
          <span className="dh-field__optional">Optional</span>
        ) : null}
      </div>

      <div className="dh-field__control">
        <div className="dh-toggle-group">
          {options.map((option, index) => {
            const checked = value.includes(option.value);
            return (
              <label
                key={option.value}
                className="dh-toggle-group__option"
                data-checked={checked || undefined}
              >
                <input
                  type="checkbox"
                  className="dh-toggle-group__input"
                  id={index === 0 ? baseId : `${baseId}-${option.value}`}
                  checked={checked}
                  disabled={disabled || readOnly}
                  aria-invalid={invalid || undefined}
                  aria-errormessage={invalid ? errorId : undefined}
                  ref={index === 0 ? (node) => controlRef?.(node) : undefined}
                  onChange={(event) =>
                    toggle(option.value, event.currentTarget.checked)
                  }
                  onBlur={() => onBlur?.(value)}
                />
                <span className="dh-toggle-group__face" aria-hidden="true">
                  {option.label}
                </span>
                <span className="dh-visually-hidden">
                  {option.accessibleLabel ?? option.label}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {help ? (
        <p className="dh-field__help" id={helpId}>
          {help}
        </p>
      ) : null}
      {invalid ? (
        <p className="dh-field__error" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
