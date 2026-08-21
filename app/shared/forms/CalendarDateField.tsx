/**
 * CONTROL-01 — the FORM date control, on DalyHub's own calendar.
 *
 * `DateField` is a native `<input type="date">`. That is correct for a
 * datetime instant, where the browser's control is the only one that edits a
 * wall clock honestly, and wrong for a calendar date on a product that has its
 * own: the native control renders the operating system's format skeleton
 * (`mm/dd/yyyy` on a US-locale machine editing an Australian workspace), draws
 * a picker nothing else in the product looks like, and cannot show a preset.
 *
 * This is the same interaction the inline editors use — `CalendarGrid` in an
 * anchored surface, committing on selection — wearing the shared `Field`
 * chrome, so a long form keeps its label, help text, required cue, error
 * summary target and `aria-errormessage` wiring unchanged. The value is the ISO
 * `YYYY-MM-DD` string, in and out, never routed through a `Date`.
 *
 * Keyboard, in full: the trigger is an ordinary tab stop that opens on
 * Enter/Space; the grid owns arrows, Home/End and PageUp/PageDown; Escape
 * closes and returns focus to the trigger, as does choosing a day. Nothing here
 * traps focus, because a form field must not.
 *
 * `kind="datetime"` is deliberately NOT handled — it stays on `DateField`.
 */

import { useRef, useState } from "react";

import { Popover } from "~/shared/floating";

import type { BaseControlProps } from "./control-props";
import { DateChoice } from "./DateChoice";
import { Field } from "./Field";

export interface CalendarDateFieldProps extends BaseControlProps<string> {
  /**
   * The owner's calendar day (ADR-022), for the "today" mark and for which
   * month opens when nothing is chosen. A form with no honest today passes
   * null and gets no mark — a wrong "today" is worse than none.
   */
  readonly todayIso?: string | null;
  /** Words for the empty state. Defaults to "No date". */
  readonly placeholder?: string;
}

/** "2026-07-30" → "30 Jul 2026", read from the ISO parts, never from a `Date`. */
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatDateOnly(iso: string): string {
  const [year, month, day] = iso.split("-");
  const name = MONTHS[Number(month) - 1];
  if (!year || !name || !day) return iso;
  return `${Number(day)} ${name} ${year}`;
}

export function CalendarDateField({
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
  showOptionalCue,
  controlRef,
  className,
  todayIso = null,
  placeholder = "No date",
}: CalendarDateFieldProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  return (
    <Field
      id={id}
      label={label}
      required={required}
      help={help}
      error={error}
      disabled={disabled}
      readOnly={readOnly}
      showOptionalCue={showOptionalCue}
      className={className}
    >
      {(control) => (
        <>
          <button
            type="button"
            id={control.id}
            ref={(node) => {
              triggerRef.current = node;
              controlRef?.(node);
            }}
            className="dh-input dh-datefield__trigger"
            disabled={control.disabled}
            aria-haspopup="dialog"
            aria-expanded={open}
            /*
             * The error reaches the button through `aria-describedby`, not
             * `aria-invalid`/`aria-errormessage`: those are not supported on
             * `role="button"`, which this control implicitly is. The message is
             * still announced with the control, and `data-invalid` carries the
             * visual state that `aria-invalid` styles elsewhere.
             */
            data-invalid={control.invalid ? "true" : undefined}
            aria-describedby={
              [control.describedBy, control.errorId]
                .filter(Boolean)
                .join(" ") || undefined
            }
            data-empty={value === "" ? "true" : undefined}
            onClick={() => {
              if (!control.readOnly) setOpen((current) => !current);
            }}
            onBlur={() => onBlur?.()}
          >
            {value === "" ? placeholder : formatDateOnly(value)}
          </button>

          {open ? (
            /*
             * DHDS-09 — the shared {@link Popover} and the shared
             * {@link DateChoice}.
             *
             * This surface used to be a bare `AnchoredSurface` carrying only
             * `.dh-datepicker`, which supplies a column and a minimum width and
             * NO surface at all — no background, no border, no elevation. A form
             * date picker was therefore drawn transparently over whatever
             * happened to be behind it. Composing the popover fixes that by
             * construction rather than by adding a fourth private panel style,
             * and brings the Escape contract, the focus return and the phone
             * sheet with it.
             */
            <Popover
              anchorRef={triggerRef}
              label={`Choose ${label.toLocaleLowerCase()}`}
              onClose={() => close()}
              className="dh-inline-date__popover"
            >
              <DateChoice
                label={label}
                value={value === "" ? null : value}
                todayIso={todayIso}
                onSelect={(iso) => {
                  onChange(iso);
                  close();
                }}
                /* A required date has nothing to clear TO, so the command is
                   absent rather than present and rejecting the press. */
                onClear={
                  value !== "" && !required
                    ? () => {
                        onChange("");
                        close();
                      }
                    : undefined
                }
                onCancel={() => close()}
              />
            </Popover>
          ) : null}
        </>
      )}
    </Field>
  );
}
