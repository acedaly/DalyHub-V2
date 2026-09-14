/**
 * UNTITLED-18 — the DalyHub file picker.
 *
 * A file input the owner can see is a control. The native one is the last
 * genuinely browser-default widget in the product: it draws the platform's own
 * "Choose File" button at the platform's own size, in the platform's own
 * typeface, and it looks different on every operating system — which is exactly
 * the thing §51 asks about ("Is anything browser-default?").
 *
 * ── Why a LABEL and not a button ────────────────────────────────────────────
 *
 * A `<button>` that calls `input.click()` is the common answer and it is worse:
 * the real control leaves the accessibility tree or the tab order, and the
 * button then has to re-describe a state it does not own. A `<label for>`
 * around a visually-hidden-but-focusable input keeps the NATIVE control — its
 * focus, its keyboard activation, its `required`, its `accept` filter, its form
 * participation and the platform's own file dialog — and only moves where the
 * pixels are.
 *
 * The input is visually hidden, NOT `display: none` and not `visibility:
 * hidden`: either would take it off the Tab order, which is the whole point of
 * the arrangement.
 *
 * ── The focus ring has to move with it ──────────────────────────────────────
 *
 * A visually-hidden input still takes focus, so the LABEL wearing the button
 * treatment has to show it or a keyboard user sees nothing at all.
 * `has-[:focus-visible]` on the wrapper draws Untitled's own ring on the label,
 * which is the same ring every other control in the product draws.
 *
 * This was `RestoreFromBackup`'s pattern, written in `settings.css` for one
 * caller. Finance's CSV import — the only other file input in the product
 * outside the shared attachment picker — drew the browser's own instead. One
 * component, two callers, and the CSS goes with it.
 */

import { useId, type ChangeEvent, type ReactNode, type Ref } from "react";

import { cx } from "~/shared/ui/untitled/utils/cx";

import { buttonClassName, type ButtonVariant } from "./Button";

export interface FilePickerProps {
  /** The control's visible text, on the label that acts as the button. */
  readonly children: ReactNode;
  /** `accept`, passed straight to the native input. */
  readonly accept?: string;
  readonly disabled?: boolean;
  readonly onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  /** The button family. `secondary` by default — choosing a file is not THE action. */
  readonly variant?: ButtonVariant;
  /** DOM id for the input. Generated when omitted. */
  readonly id?: string;
  readonly name?: string;
  readonly required?: boolean;
  /**
   * The chosen file's name, shown beside the control.
   *
   * The native input prints "no file selected" itself; a hidden one cannot, so
   * a caller that has the name passes it and a caller that does not says
   * nothing rather than leaving the owner to guess.
   */
  readonly selectedName?: string | null;
  readonly inputRef?: Ref<HTMLInputElement>;
  readonly "data-testid"?: string;
  readonly "aria-describedby"?: string;
  readonly className?: string;
}

export function FilePicker({
  children,
  accept,
  disabled = false,
  onChange,
  variant = "secondary",
  id,
  name,
  required,
  selectedName,
  inputRef,
  "data-testid": testId,
  "aria-describedby": describedBy,
  className,
}: FilePickerProps) {
  const generated = useId();
  const inputId = id ?? `dh-file-${generated}`;

  return (
    <span
      className={cx(
        "dh-file-picker inline-flex min-w-0 flex-wrap items-center gap-3",
        // The ring the hidden input's focus would otherwise take with it.
        "has-[:focus-visible]:[&>label]:outline-2 has-[:focus-visible]:[&>label]:outline-offset-2",
        className,
      )}
    >
      <label className={buttonClassName({ variant })} htmlFor={inputId}>
        {children}
      </label>
      <input
        ref={inputRef}
        id={inputId}
        name={name}
        type="file"
        accept={accept}
        required={required}
        disabled={disabled}
        aria-describedby={describedBy}
        data-testid={testId}
        onChange={onChange}
        /*
         * Visually hidden, focusable, announced. `sr-only`'s own recipe, stated
         * here rather than reached for so the `peer`-free arrangement above is
         * readable in one place.
         */
        className="absolute size-px overflow-hidden [clip-path:inset(50%)] whitespace-nowrap"
      />
      {selectedName ? (
        <span className="min-w-0 truncate text-sm text-tertiary">
          {selectedName}
        </span>
      ) : null}
    </span>
  );
}
