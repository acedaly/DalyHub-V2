/**
 * The ONE switch (`~/shared/forms/Switch`).
 *
 * ── What a switch is FOR, and what it is not ────────────────────────────────
 * A switch turns a setting on or off and the change takes effect immediately; a
 * checkbox selects an item within a set, and a set of them is usually committed
 * by a Save or acted on by a bulk action. DalyHub's preference toggles are all
 * immediate, so they are switches; its selection, acknowledgement and
 * multi-select checkboxes are checkboxes and stay checkboxes (the August 2026
 * interaction audit, finding 8).
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
 * ── UNTITLED-18 — the TRACK is Untitled's, exactly as the input's box is ────
 *
 * The anatomy was Material Design 3's: a 52×32 track, a thumb growing from 16px
 * to 24px, and a check glyph inside the selected thumb — 203 lines of
 * `switch.css`. It was the last Material CONTROL in the product, and on the
 * rebuilt Settings page it sat two rows below an Untitled select and an Untitled
 * time field, a third larger than either and drawn from a different system.
 *
 * The geometry, the colours and the motion below are Untitled's
 * `base/toggle/toggle.tsx` — `ToggleBase`'s `size="md"` arm, verbatim: the
 * `h-6 w-11 p-0.5` track on `bg-tertiary` with its half-pixel inset ring, the
 * `size-5` white thumb with `shadow-sm`, `bg-brand-solid` when selected,
 * `translate-x-5` of travel, and `opacity-50` disabled.
 *
 * ── Why it composes those styles rather than rendering that component ──────
 *
 * Untitled's `Toggle` is a React Aria `Switch`, which owns the checked state in
 * React. DalyHub has three requirements it cannot meet as it stands:
 *
 *   1. UNCONTROLLED use. Settings' navigation rows post a real `<form>` with
 *      `defaultChecked` and no React state at all; the state lives on the DOM
 *      node and is read at submit. Every rule below is reached from `:checked`
 *      on the input via Tailwind's `peer-*` variants, so there is nothing to
 *      keep in step.
 *   2. The 44px POINTER TARGET. `Toggle` is `w-max` around a 24px-tall track.
 *      DalyHub's floor is 44px on every pointer (AGENTS.md §15, stricter than
 *      WCAG 2.2 AA's 24px), and here it is the LABEL — so the reachable area is
 *      the track plus its surrounding space and its words.
 *   3. FORCED COLOURS. Untitled's toggle distinguishes on/off by track colour
 *      and thumb position; in forced-colors mode the OS replaces the first, and
 *      a system-keyword arm is what keeps the second legible. Upstream has no
 *      opinion here. The arm is kept, retuned to this anatomy.
 *
 * The M3 check glyph inside the thumb is GONE with the rest of that anatomy.
 * The state is still never colour alone — the thumb MOVES, which is the cue
 * Untitled itself relies on and the one forced colours cannot take away.
 *
 * Controlled (`checked` + `onChange`) and uncontrolled (`defaultChecked`, for a
 * row that posts a real form) are both supported, because Settings uses the
 * second and the DS-06 `BooleanField` uses the first.
 */

import { useId, type ChangeEvent, type ReactNode } from "react";

import { cx } from "~/shared/ui/untitled/utils/cx";

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

/**
 * `ToggleBase`'s `size="md"` root, with its state arms as `peer-*` variants.
 *
 * `peer-checked:` stands in for upstream's `isSelected`, `peer-focus-visible:`
 * for `isFocusVisible` and `peer-disabled:` for `isDisabled` — the same
 * declarations, reached the way a sibling of a real input can reach them.
 */
const TRACK = cx(
  "flex h-6 w-11 shrink-0 items-center rounded-full bg-tertiary p-0.5",
  "ring-[0.5px] ring-secondary outline-focus-ring transition duration-150 ease-linear ring-inset",
  "peer-checked:bg-brand-solid",
  // Upstream draws `isSelected && isHovered` as one state. Two `peer-*`
  // variants cannot be stacked (each emits its own sibling combinator), so it
  // is one arbitrary variant expressing one selector.
  "peer-[:checked:hover]:bg-brand-solid_hover",
  "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2",
  "peer-disabled:opacity-50",
  // The THUMB's travel is declared here rather than on the thumb, for the same
  // sibling-combinator reason: the thumb is the track's child, not the input's
  // sibling, so the selector has to start from the element that is.
  "peer-checked:[&>span]:translate-x-5",
  // The selected thumb takes the system's "on highlight" colour so it stays
  // visible against the highlighted track. Declared here for the same reason
  // the travel is.
  "peer-checked:[&>span]:forced-colors:bg-[HighlightText]",
  /*
   * FORCED COLOURS. The OS replaces every authored colour, so on/off would
   * differ by thumb POSITION alone — legible, but the track would also lose the
   * boundary that makes the position readable. System keywords restore both.
   * Upstream has no forced-colours arm; this is DalyHub's, retuned from the
   * Material anatomy it replaces.
   */
  "forced-colors:bg-[Canvas] forced-colors:ring-[CanvasText]",
  "peer-checked:forced-colors:bg-[Highlight] peer-checked:forced-colors:ring-[Highlight]",
  "peer-focus-visible:forced-colors:outline-[Highlight]",
  "peer-disabled:forced-colors:ring-[GrayText]",
);

/** `ToggleBase`'s `size="md"` switch. Its travel is declared on the track. */
const THUMB = cx(
  "size-5 rounded-full bg-fg-white shadow-sm",
  // `transition`, not `transition-transform`: Tailwind v4's `translate-x-*`
  // sets the `translate` PROPERTY rather than a transform, so a
  // transform-only transition animates nothing.
  "transition duration-150 ease-in-out",
  "forced-colors:bg-[CanvasText]",
);

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

  return (
    <span
      className={cx("dh-switch inline-flex min-w-0", className)}
      data-testid={testId}
    >
      {/*
       * The label is the target. It carries the 44px minimum and the pointer
       * cursor, so the reachable area is the track PLUS its surrounding space
       * (and the words, when there are any) rather than a 44×24 rounded
       * rectangle.
       *
       * The input is INSIDE it, which is what lets the track read the input's
       * `:checked` as a `peer`: Tailwind's peer variants emit a sibling
       * combinator, so the two have to share a parent.
       */}
      <label
        className={cx(
          "relative inline-flex min-h-(--app-touch-target-min) min-w-(--app-touch-target-min) cursor-pointer items-center gap-3",
          "text-md text-primary has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50",
        )}
        htmlFor={inputId}
      >
        <input
          id={inputId}
          /*
           * The real control, visually hidden but never `display: none` and
           * never `visibility: hidden` — both would take it out of the
           * accessibility tree and off the Tab order, which is the whole thing
           * being preserved here. Everything below is painted from `:checked`,
           * `:disabled` and `:focus-visible` on THIS element.
           */
          className="peer absolute size-px opacity-0"
          type="checkbox"
          /* Announced as a switch; still a checkbox to the DOM, the form and
           * the keyboard. */
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
         * `dh-switch__track` and `dh-switch__thumb` carry NO rules in any
         * stylesheet — `switch.css` is deleted. They are locator hooks, kept
         * because the graphic is `aria-hidden` and therefore has no semantic
         * name for a test to address, and because the browser measurement that
         * proves the state is not colour alone has to find the thumb to
         * measure its travel (`e2e/interaction-consistency.spec.ts`).
         */}
        <span className={cx("dh-switch__track", TRACK)} aria-hidden="true">
          <span className={cx("dh-switch__thumb", THUMB)} />
        </span>
        {label !== undefined ? <span className="min-w-0">{label}</span> : null}
      </label>
    </span>
  );
}
