/**
 * DS-06 Shared Forms — the shared control prop contract.
 *
 * Every field control accepts the same anatomy + binding props, so a control is
 * both usable standalone (pass `value`/`onChange` yourself) and bindable to a
 * form host (`<TextField {...form.field("title")} />` spreads `id`, `value`,
 * `error`, `onChange`, `onBlur`, `controlRef`). Control-specific props extend this
 * base. Keeping this in a tiny, React-free module keeps the controls uniform.
 */

import type { FocusableControl } from "./use-form";

/** Props shared by every DS-06 field control. `TValue` is the control's value. */
export interface BaseControlProps<TValue> {
  /** Explicit base id (a form host supplies this; otherwise generated). */
  readonly id?: string;
  /** The visible, human-language label. */
  readonly label: string;
  /** The controlled value. */
  readonly value: TValue;
  /** Called with the next value on edit. */
  readonly onChange: (value: TValue) => void;
  /**
   * Called when the control loses focus (drives blur validation). A composite
   * control that commits a value ON blur (e.g. the tags control) may pass the
   * exact committed value so validation runs against it rather than the
   * pre-render state.
   */
  readonly onBlur?: (committedValue?: TValue) => void;
  /** The current validation message, or null. */
  readonly error?: string | null;
  /** Optional help text. */
  readonly help?: string;
  /** Whether a value is required (drives the cue + host validation). */
  readonly required?: boolean;
  /** Whether the control is disabled. */
  readonly disabled?: boolean;
  /** Whether the control is read-only. */
  readonly readOnly?: boolean;
  /** Whether to show the "Optional" cue on non-required fields. */
  readonly showOptionalCue?: boolean;
  /** Ref callback to the focusable element (for first-invalid focus). */
  readonly controlRef?: (node: FocusableControl | null) => void;
  /** Extra class appended to the field root. */
  readonly className?: string;
}

export type { FocusableControl };
