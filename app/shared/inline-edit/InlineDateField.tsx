/**
 * DS-16 — inline DATE, as a compact anchored popover.
 *
 * ── CONTROL-01: the native input is gone from the task-editing surfaces ──────
 * The control inside the popover WAS a native `<input type="date">`, and the
 * reasoning was sound: the platform brings a calendar, a phone wheel, keyboard
 * and screen-reader support and locale handling for nothing.
 *
 * What it also brings is a control DalyHub does not own. On a Task row and in
 * the Task drawer the owner met a grey `dd/mm/yyyy` skeleton in the platform's
 * typeface, a platform calendar glyph, and a picker that looks different in
 * every browser — sitting inside a popover the product had styled to the pixel.
 * The August 2026 audit named it as the clearest case of "the editors are
 * visibly behind the surfaces they edit".
 *
 * So this composes DalyHub's own pieces instead: the product's PRESETS (Today /
 * Tomorrow / This weekend / Next week, from `taskDateShortcuts`), the product's
 * month grid (`CalendarGrid`), and the product's Clear command. The shared form
 * `DateField` KEEPS the native input — a long form of dates is exactly where
 * the platform control is still right, and this is not a campaign against it.
 *
 * Dates stay ISO `YYYY-MM-DD` end to end and every calculation goes through
 * `addCalendarDays`, whose arithmetic is on UTC components, so replacing the
 * native control cannot introduce the off-by-one day that is the whole risk in
 * doing so.
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
import { CalendarGrid } from "~/shared/forms/CalendarGrid";
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
  /**
   * The OWNER's calendar day (ADR-022), which marks "today" in the grid and
   * decides which month opens for an unset field. A caller with no honest today
   * passes none and gets a grid with no today mark rather than one derived from
   * the browser clock.
   */
  readonly todayIso?: string | null;
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
  todayIso = null,
  className,
  "data-testid": testId,
}: InlineDateFieldProps) {
  const field = useInlineEdit<string | null>({ value, onSave });
  const generatedId = useId();
  const popoverId = `${generatedId}-popover`;
  const errorId = `${generatedId}-error`;
  const firstControlRef = useRef<HTMLDivElement | null>(null);
  const compact = useCompactViewport();

  const open = field.editing;

  useEffect(() => {
    /*
     * The sheet owns its own initial focus (DS-03), so only the desktop popover
     * reaches in. It focuses the FIRST control — a preset, or the grid's single
     * tab stop when there are none — rather than the grid unconditionally: the
     * presets are what the owner wants four times out of five, and landing on
     * the calendar would make the common case the long way round.
     */
    if (!open || compact) return;
    firstControlRef.current
      ?.querySelector<HTMLElement>("button:not([tabindex='-1'])")
      ?.focus();
  }, [open, compact]);

  const onSurfaceKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    field.cancel();
  };

  /*
   * CONTROL-01 — there is no Enter-to-commit handler any more, and there is
   * nothing left for it to do.
   *
   * It existed because the native input held a TYPED draft that had to be
   * committed explicitly. Every control in the editor is now a button — a
   * preset, a calendar day, No date, Cancel — and a button commits on Enter
   * natively. Keeping the handler would have re-introduced the bug its own note
   * recorded: a surface-level Enter that also fires while Cancel is focused,
   * so Cancel saves.
   */

  /*
   * The editor's contents, identical in the popover and in the sheet.
   *
   * One definition, because the two presentations are the same field: a phone
   * that offered different shortcuts, or no Clear, would be a second date
   * editor with the same name.
   */
  const editor = (
    <div className="dh-datepicker" ref={firstControlRef}>
      {shortcuts && shortcuts.length > 0 ? (
        /*
         * No `role="group"` and no label of its own.
         *
         * The obvious `aria-label={`${label} shortcuts`}` gave the wrapper the
         * accessible name "Due date shortcuts", which is a SECOND thing in the
         * popover whose name contains the field's. Anything resolving a control
         * by that name (assistive technology and `getByLabel` alike) then has
         * two candidates for "the due date". The popover is already named "Edit
         * due date" and each button says which day it commits.
         */
        <div className="dh-datepicker__presets">
          {shortcuts.map((shortcut) => (
            <button
              key={shortcut.label}
              type="button"
              className="dh-datepicker__preset"
              disabled={field.pending}
              aria-pressed={value === shortcut.value}
              onClick={() => field.submit(shortcut.value)}
            >
              {shortcut.label}
            </button>
          ))}
        </div>
      ) : null}

      {/*
       * The grid COMMITS on selection rather than editing a draft.
       *
       * A calendar day is an unambiguous, complete answer — unlike a typed
       * `dd/mm/yyyy`, which is a draft until it parses — so a Save button after
       * it would be a second press for a decision already made. It is the same
       * live-apply reasoning the desktop filter popover follows, for the same
       * reason: the change is visible immediately behind the surface.
       */}
      <CalendarGrid
        label={label}
        value={field.draft ?? null}
        todayIso={todayIso}
        disabled={field.pending}
        onSelect={(iso) => field.submit(iso)}
      />

      <div className="dh-datepicker__actions">
        {clearable && value !== null ? (
          <button
            type="button"
            className="dh-datepicker__command"
            disabled={field.pending}
            /*
             * DS-17 — the accessible name says which field this empties, the
             * same wording every other clear control in the product uses. The
             * visible words stay "No date" because the popover is already titled
             * "Edit <field>"; the accessible name is where a screen-reader user,
             * who may reach the button without having heard the dialog title
             * again, needs the context.
             */
            aria-label={clearControlLabel(label)}
            onClick={() => field.submit(null)}
          >
            No date
          </button>
        ) : null}
        <button
          type="button"
          className="dh-datepicker__command"
          disabled={field.pending}
          onClick={field.cancel}
        >
          Cancel
        </button>
      </div>
    </div>
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
