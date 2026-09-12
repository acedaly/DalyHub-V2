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
 *
 * ── UNTITLED-09 — where its paint comes from now ────────────────────────────
 *
 * The option was drawn by `.dh-toggle-group*` in **`habits.css`** — a MODULE
 * stylesheet painting a control that is explicitly shared, so the next module to
 * use it would have had to import Habits' stylesheet to get a weekday picker.
 * Those rules are deleted and the paint is Untitled semantic roles through
 * Tailwind utilities, so the control follows the appearance switch and the
 * generated Branded Plum ramp with nothing to keep in step.
 *
 * It is deliberately NOT Untitled's `base/button-group` `ToggleButtonGroup`.
 * That is a React Aria group of toggle BUTTONS carrying `aria-pressed`, laid out
 * as a segmented, non-wrapping strip; this control is a set of real CHECKBOXES
 * that wrap onto a second row and hold the touch floor, which is what makes
 * seven weekdays usable at 320px. The geometry is Untitled's; the semantics are
 * the ones the choice actually has.
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

  /*
   * One option, in Untitled's control geometry: the pill radius, the secondary
   * hairline, the primary surface, and the brand solid when selected. The
   * minimum block size is DalyHub's touch floor rather than Untitled's desktop
   * height — density never costs hit area (AGENTS.md §15).
   */
  const optionClassName = (checked: boolean) =>
    [
      "relative inline-flex min-h-[var(--app-touch-target-min)] min-w-12 cursor-pointer",
      "items-center justify-center rounded-full px-3 text-sm ring-1 select-none",
      "transition duration-100 ease-linear",
      "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring",
      checked
        ? "bg-brand-solid font-semibold text-white ring-transparent forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]"
        : "bg-primary text-secondary ring-primary hover:ring-brand",
      disabled || readOnly ? "cursor-not-allowed opacity-50" : "",
    ]
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
        <div className="dh-toggle-group flex flex-wrap gap-2">
          {options.map((option, index) => {
            const checked = value.includes(option.value);
            return (
              <label
                key={option.value}
                className={`dh-toggle-group__option ${optionClassName(checked)}`}
                data-checked={checked || undefined}
              >
                {/* The real control, covering its own label: the whole pill is
                    the target, and the state a screen reader reads is native. */}
                <input
                  type="checkbox"
                  className="absolute inset-0 m-0 size-full cursor-pointer opacity-0 outline-none"
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
                <span className="pointer-events-none" aria-hidden="true">
                  {/* Selection is never the fill alone: a tick appears with it,
                      so forced colours and a colour-blind reader both still see
                      which days are on. */}
                  {checked ? "✓ " : null}
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
