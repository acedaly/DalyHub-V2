/**
 * M3-INT — the ONE Material Design 3 switch.
 *
 * ── What a switch is FOR, and what it is not ────────────────────────────────
 * M3 distinguishes a switch from a checkbox by MEANING, not by looks: a switch
 * turns a setting on or off and the change takes effect immediately; a checkbox
 * selects an item within a set, and a set of them is usually committed by a Save
 * or acted on by a bulk action. DalyHub's preference toggles are all immediate,
 * so they are switches; its selection, acknowledgement and multi-select
 * checkboxes are checkboxes and stay checkboxes (the August 2026 interaction
 * audit, finding 8).
 *
 * ── Native semantics, not re-implemented ones ───────────────────────────────
 * The control IS an `<input type="checkbox">`. It is not a `div` with
 * `role="switch"` and an `aria-checked` attribute the component has to remember
 * to keep in step — that pattern re-implements, badly, everything the browser
 * already gives away: the checked state, Space to toggle, the label
 * association, form participation (`name`/`value`), `:disabled`, and the whole
 * of Windows High Contrast. `role="switch"` is added ON TOP so the control is
 * ANNOUNCED as a switch ("on"/"off" rather than "ticked"), which is the one
 * thing the native element cannot say for itself.
 *
 * ── The guarantees ─────────────────────────────────────────────────────────
 *   - a visible label, either the component's own (`label`) or a row's, named
 *     by `labelledBy` — the same two naming patterns `SettingsRow` documents;
 *   - a ≥44px pointer target on every pointer, which is the label, not the
 *     32px track (AGENTS.md §15, stricter than WCAG 2.2 AA's 24px);
 *   - a visible `:focus-visible` ring on the track, drawn by the product's own
 *     focus indicator;
 *   - state that is never colour alone: the thumb MOVES, and the selected thumb
 *     carries M3's check glyph, so the control reads correctly to a colour-blind
 *     owner and under forced colours;
 *   - reduced motion, via the global `prefers-reduced-motion` rule.
 *
 * Controlled (`checked` + `onChange`) and uncontrolled (`defaultChecked`, for a
 * row that posts a real form) are both supported, because Settings uses the
 * second and the DS-06 `BooleanField` uses the first.
 */

import { useId, type ChangeEvent, type ReactNode } from "react";

export interface SwitchProps {
  /** DOM id for the input. Generated when omitted. */
  readonly id?: string;
  /**
   * The switch's own visible label. Omit it only when something else on screen
   * already names the setting — then pass `labelledBy`.
   */
  readonly label?: ReactNode;
  /**
   * The id of a visible label that already names this setting from outside (a
   * `SettingsRow`'s label). Renders no second label; never a way to hide one.
   */
  readonly labelledBy?: string;
  /** Extra `aria-describedby` ids (a row's description and status line). */
  readonly describedBy?: string;
  /** Controlled state. Pair with `onChange`. */
  readonly checked?: boolean;
  /** Uncontrolled initial state, for a switch inside a real posted form. */
  readonly defaultChecked?: boolean;
  /** Fired on every toggle, with the new state and the original event. */
  readonly onChange?: (
    checked: boolean,
    event: ChangeEvent<HTMLInputElement>,
  ) => void;
  /** Fired when the control loses focus (drives blur validation). */
  readonly onBlur?: () => void;
  readonly disabled?: boolean;
  /** Marks the control invalid and points `aria-errormessage` at `errorId`. */
  readonly invalid?: boolean;
  /** Id of the element carrying the validation message. */
  readonly errorId?: string;
  /** Ref callback to the real input (for first-invalid focus). */
  readonly controlRef?: (node: HTMLInputElement | null) => void;
  /** Form field name, for a switch that posts with its form. */
  readonly name?: string;
  /** Submitted value when checked. Defaults to the browser's `"on"`. */
  readonly value?: string;
  readonly className?: string;
  readonly "data-testid"?: string;
}

export function Switch({
  id,
  label,
  labelledBy,
  describedBy,
  checked,
  defaultChecked,
  onChange,
  onBlur,
  disabled = false,
  invalid = false,
  errorId,
  controlRef,
  name,
  value,
  className,
  "data-testid": testId,
}: SwitchProps) {
  const generatedId = useId();
  const inputId = id ?? `dh-switch-${generatedId}`;
  const classes = ["dh-switch", className].filter(Boolean).join(" ");

  return (
    <span className={classes} data-testid={testId}>
      <input
        id={inputId}
        className="dh-switch__input"
        type="checkbox"
        /* Announced as a switch; still a checkbox to the DOM, the form and the
         * keyboard. */
        role="switch"
        name={name}
        value={value}
        checked={checked}
        defaultChecked={defaultChecked}
        disabled={disabled}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        aria-errormessage={invalid ? errorId : undefined}
        ref={(node) => controlRef?.(node)}
        onChange={(event) => onChange?.(event.target.checked, event)}
        onBlur={() => onBlur?.()}
      />
      {/*
       * The label is the target. It carries the 44px minimum and the pointer
       * cursor, so the reachable area is the track PLUS its surrounding space
       * (and the words, when there are any) rather than a 52×32 rounded
       * rectangle.
       */}
      <label className="dh-switch__label" htmlFor={inputId}>
        <span className="dh-switch__track" aria-hidden="true">
          <span className="dh-switch__thumb">
            {/* M3's selected thumb carries a check. It is what makes the state
             * a SHAPE as well as a colour and a position. */}
            <svg
              className="dh-switch__check"
              viewBox="0 -960 960 960"
              focusable="false"
              aria-hidden="true"
            >
              <path
                d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"
                fill="currentColor"
              />
            </svg>
          </span>
        </span>
        {label !== undefined ? (
          <span className="dh-switch__text">{label}</span>
        ) : null}
      </label>
    </span>
  );
}
