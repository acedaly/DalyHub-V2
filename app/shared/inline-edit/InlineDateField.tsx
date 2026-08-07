/**
 * DS-16 — inline DATE, as a compact anchored popover.
 *
 * The control inside the popover is a native `<input type="date">`, deliberately:
 * it brings the platform's own calendar (and, on a phone, the platform's own
 * wheel), it is keyboard- and screen-reader-complete without a line of ARIA, it
 * honours the user's locale and it costs nothing to ship. DalyHub's shared
 * `DateField` already made that choice for forms (DS-06); reaching for a
 * hand-built calendar here would be a second date vocabulary in the same
 * product, and the reference products it would be imitating do not have one
 * either.
 *
 * Dates are ISO `YYYY-MM-DD` strings end to end — the same wire shape the Task
 * and Project actions already accept — so this component performs no timezone
 * arithmetic and cannot introduce an off-by-one day. Clearing is a first-class
 * outcome (`null`), not an empty string, because "no due date" is a real value
 * a Task can hold.
 *
 * The popover is non-modal and follows the same rules as the DS-12 menu: Escape
 * closes and restores focus to the trigger, an outside press dismisses, Tab
 * leaves. It is a `dialog` rather than a `menu` because it contains a form
 * control and two commands, which is not a menu.
 */

import { useEffect, useId, useRef, type KeyboardEvent } from "react";

import { InlineEditShell } from "./InlineEditShell";
import { useInlineEdit } from "./use-inline-edit";
import type { InlineSaveOutcome } from "./inline-edit-model";

export interface InlineDateFieldProps {
  readonly label: string;
  /** ISO `YYYY-MM-DD`, or `null` when unset. */
  readonly value: string | null;
  readonly onSave: (next: string | null) => Promise<InlineSaveOutcome>;
  /** How the stored value is written for display, e.g. "3 Sep 2026". */
  readonly format?: (iso: string) => string;
  readonly emptyLabel?: string;
  readonly readOnly?: boolean;
  /** Whether clearing is permitted (a required date hides the Clear command). */
  readonly clearable?: boolean;
  readonly className?: string;
  readonly "data-testid"?: string;
}

export function InlineDateField({
  label,
  value,
  onSave,
  format,
  emptyLabel = "Add a date",
  readOnly = false,
  clearable = true,
  className,
  "data-testid": testId,
}: InlineDateFieldProps) {
  const field = useInlineEdit<string | null>({ value, onSave });
  const generatedId = useId();
  const popoverId = `${generatedId}-popover`;
  const inputId = `${generatedId}-input`;
  const errorId = `${generatedId}-error`;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const open = field.editing;

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        field.cancel();
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open, field]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      field.cancel();
      return;
    }
    if (event.key === "Enter" && event.target === inputRef.current) {
      // Enter is a commit shortcut for the DATE INPUT only. Scoped to it,
      // because the popover's own Save/Clear/Cancel buttons activate on Enter
      // natively — intercepting here made Cancel persist the draft and Clear
      // close without clearing, which is the exact opposite of both labels.
      event.preventDefault();
      field.submit();
    }
  };

  return (
    <div className="dh-inline-date" ref={containerRef}>
      <InlineEditShell
        label={label}
        valueText={value ? (format ? format(value) : value) : emptyLabel}
        isEmpty={value === null}
        emptyLabel={emptyLabel}
        editing={false}
        onActivate={field.begin}
        triggerRef={field.triggerRef}
        triggerProps={{
          "aria-haspopup": "dialog",
          "aria-expanded": open,
          "aria-controls": open ? popoverId : undefined,
        }}
        pending={field.pending}
        error={field.error}
        errorId={errorId}
        readOnly={readOnly}
        variant="text"
        className={className}
        data-testid={testId}
      >
        {value ? (format ? format(value) : value) : null}
      </InlineEditShell>

      {open ? (
        /* Escape-to-dismiss and Enter-to-commit belong to the popover as a
         * whole; its focusable children (the date input and the three buttons)
         * are the operable controls, and the dialog merely lets the two keys
         * reach them from wherever focus currently sits. */
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
        <div
          className="dh-inline-date__popover"
          id={popoverId}
          role="dialog"
          aria-label={label}
          onKeyDown={onKeyDown}
        >
          <label className="dh-inline-date__label" htmlFor={inputId}>
            {label}
          </label>
          <input
            id={inputId}
            ref={inputRef}
            type="date"
            className="dh-input dh-inline-date__input"
            value={field.draft ?? ""}
            disabled={field.pending}
            aria-invalid={field.error ? true : undefined}
            aria-errormessage={field.error ? errorId : undefined}
            onChange={(event) =>
              field.change(
                event.target.value === "" ? null : event.target.value,
              )
            }
          />
          <div className="dh-inline-date__actions">
            <button
              type="button"
              className="dh-btn dh-btn--primary dh-btn--sm"
              disabled={field.pending}
              onClick={() => field.submit()}
            >
              Save
            </button>
            {clearable && value !== null ? (
              <button
                type="button"
                className="dh-btn dh-btn--ghost dh-btn--sm"
                disabled={field.pending}
                onClick={() => field.submit(null)}
              >
                Clear
              </button>
            ) : null}
            <button
              type="button"
              className="dh-btn dh-btn--ghost dh-btn--sm"
              disabled={field.pending}
              onClick={field.cancel}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
