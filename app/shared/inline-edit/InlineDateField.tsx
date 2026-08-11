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
 *
 * ── EDIT-03 — the popover is in the OVERLAY LAYER ────────────────────────────
 * It was `position: absolute` inside the field, which a Task row clips to 45px
 * (see {@link AnchoredSurface} for why the row's clipping is load-bearing and
 * cannot simply be opened up). The whole editor — the shortcuts, the input and
 * the commands — was therefore invisible on the one surface it matters most on.
 * Placement now comes from the shared anchored layer, and below the `md`
 * breakpoint the same content is presented in the shared phone {@link Sheet}.
 *
 * ── EDIT-03 — the SHORTCUTS are the product's, not this component's ──────────
 * A date editor that offers only a spinner asks the owner to do arithmetic for
 * the two answers they give most often. The Task record's planning section has
 * always offered Today / Tomorrow / Next week beside its dates; `shortcuts`
 * lets a caller bring exactly those, from the ONE place that derives them
 * (`taskDateShortcuts`), rather than this primitive inventing a second calendar
 * vocabulary or reaching into a module for one. A caller with no honest "today"
 * — the owner's day is a server fact (ADR-022), never the browser clock —
 * passes none, and gets the input and the commands alone.
 */

import { useEffect, useId, useRef, type KeyboardEvent } from "react";

import { AnchoredSurface } from "~/shared/anchored";
import { clearControlLabel } from "~/shared/forms/clear-label";
import { Sheet } from "~/shared/sheet";
import { useCompactViewport } from "~/shared/viewport";

import { InlineEditShell } from "./InlineEditShell";
import { useInlineEdit } from "./use-inline-edit";
import type { InlineSaveOutcome } from "./inline-edit-model";

/** A one-press date, named in the product's own words. */
export interface InlineDateShortcut {
  /** "Today", "Tomorrow", "Next week" — never a raw date. */
  readonly label: string;
  /** The ISO `YYYY-MM-DD` it commits. */
  readonly value: string;
}

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
  /**
   * One-press dates offered above the input. Supplied by the caller so the
   * wording and the arithmetic stay the product's; see the note above.
   */
  readonly shortcuts?: readonly InlineDateShortcut[];
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
  shortcuts,
  className,
  "data-testid": testId,
}: InlineDateFieldProps) {
  const field = useInlineEdit<string | null>({ value, onSave });
  const generatedId = useId();
  const popoverId = `${generatedId}-popover`;
  const inputId = `${generatedId}-input`;
  const errorId = `${generatedId}-error`;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const compact = useCompactViewport();

  const open = field.editing;

  useEffect(() => {
    // The sheet owns its own initial focus (DS-03), so only the desktop popover
    // reaches for the input.
    if (open && !compact) inputRef.current?.focus();
  }, [open, compact]);

  const onSurfaceKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    field.cancel();
  };

  // Enter is a commit shortcut for the DATE INPUT only, and it is bound to the
  // input rather than to the surface. The popover's own Save/Clear/Cancel
  // buttons activate on Enter natively; a surface-level handler intercepted
  // those too, which made Cancel persist the draft and Clear close without
  // clearing — the exact opposite of both labels. Binding it here also means
  // the phone sheet, which has no surface handler of its own, behaves the same.
  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    field.submit();
  };

  /*
   * The editor's contents, identical in the popover and in the sheet.
   *
   * One definition, because the two presentations are the same field: a phone
   * that offered different shortcuts, or no Clear, would be a second date
   * editor with the same name.
   */
  const editor = (
    <>
      {shortcuts && shortcuts.length > 0 ? (
        /*
         * No `role="group"` and no label of its own.
         *
         * The obvious `aria-label={`${label} shortcuts`}` gave the wrapper the
         * accessible name "Due date shortcuts", which is a SECOND thing in the
         * popover whose name contains the field's — and the field's own input is
         * the first. Anything resolving a control by that name (assistive
         * technology and `getByLabel` alike) then has two candidates for "the
         * due date". The popover is already named "Edit due date" and each
         * button says which day it commits, so the grouping bought nothing that
         * the naming collision did not cost.
         */
        <div className="dh-inline-date__shortcuts">
          {shortcuts.map((shortcut) => (
            <button
              key={shortcut.label}
              type="button"
              className="dh-btn dh-btn--secondary dh-btn--sm"
              disabled={field.pending}
              aria-pressed={value === shortcut.value}
              onClick={() => field.submit(shortcut.value)}
            >
              {shortcut.label}
            </button>
          ))}
        </div>
      ) : null}
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
          field.change(event.target.value === "" ? null : event.target.value)
        }
        onKeyDown={onInputKeyDown}
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
            /*
             * DS-17 — the accessible name says which field this empties, the
             * same wording every other clear control in the product uses. The
             * visible word stays "Clear" because the popover it lives in is
             * already titled "Edit <field>", so repeating the field in the
             * button's own text would be noise; the accessible name is where a
             * screen-reader user, who may reach the button without having heard
             * the dialog title again, needs the context. WCAG 2.5.3 holds — the
             * visible label is a prefix of the accessible name.
             */
            aria-label={clearControlLabel(label)}
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
    </>
  );

  return (
    <div className="dh-inline-date">
      <InlineEditShell
        label={label}
        valueText={value ? (format ? format(value) : value) : emptyLabel}
        isEmpty={value === null}
        emptyLabel={emptyLabel}
        editing={false}
        onActivate={open ? field.cancel : field.begin}
        triggerRef={field.triggerRef}
        triggerProps={{
          "aria-haspopup": "dialog",
          "aria-expanded": open,
          // Only the anchored popover carries `popoverId`; the phone `Sheet`
          // generates its own. See the same note in `InlineSelectField`.
          "aria-controls": open && !compact ? popoverId : undefined,
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

      {open && compact ? (
        <Sheet
          title={`Edit ${label.toLocaleLowerCase()}`}
          opener={field.triggerRef.current}
          onClose={field.cancel}
          className="dh-inline-date-sheet"
          data-testid={testId ? `${testId}-sheet` : undefined}
        >
          {editor}
        </Sheet>
      ) : null}

      {open && !compact ? (
        /* Escape-to-dismiss and Enter-to-commit belong to the popover as a
         * whole; its focusable children (the date input and the three buttons)
         * are the operable controls, and the dialog merely lets the two keys
         * reach them from wherever focus currently sits. */
        <AnchoredSurface
          anchorRef={field.triggerRef}
          onDismiss={field.cancel}
          className="dh-inline-date__popover"
          id={popoverId}
          role="dialog"
          // "Edit due date", not "Due date": the dialog and the date input
          // inside it are two different things, and giving them the same
          // accessible name made "the due date" ambiguous to anything
          // navigating by name — including the tests that drove this out.
          aria-label={`Edit ${label.toLocaleLowerCase()}`}
          onKeyDown={onSurfaceKeyDown}
        >
          {editor}
        </AnchoredSurface>
      ) : null}
    </div>
  );
}
