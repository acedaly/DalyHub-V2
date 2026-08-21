/**
 * DHDS-09 — DalyHub's DATE CHOICE, as one presentational panel.
 *
 * The contents of every date surface in the product: the one-press dates, the
 * month grid, and the two commands. It holds no state, performs no arithmetic
 * and knows nothing about saving — a host supplies the shortcuts (from the ONE
 * derivation, `taskDateShortcuts`), the current value and the callbacks, and
 * gets the same date interaction wherever it puts it.
 *
 * ── Why the presets come first ──────────────────────────────────────────────
 * "Today", "Tomorrow", "This weekend" and "Next week" are four presses out of
 * five. Making the owner open a month grid and count squares to say "tomorrow"
 * is the friction DHDS-09 exists to remove, so the grid is what you reach for
 * when the answer is NOT one of the four — not the way in.
 *
 * ── The grid COMMITS rather than editing a draft ────────────────────────────
 * A calendar day is an unambiguous, complete answer — unlike a typed
 * `dd/mm/yyyy`, which is a draft until it parses — so a Save button after it
 * would be a second press for a decision already made.
 *
 * ── Dates are ISO strings, end to end ───────────────────────────────────────
 * `YYYY-MM-DD` in and out. This component performs no timezone arithmetic and
 * therefore cannot introduce the off-by-one day that is the whole risk in
 * replacing a native `<input type="date">`. "Today" is the OWNER's calendar day
 * (ADR-022), always passed in, never derived from the browser clock: a wrong
 * "Today" on a date field is worse than no Today.
 */

import { CalendarGrid } from "./CalendarGrid";
import { clearControlLabel } from "./clear-label";

/** A one-press date, named in the product's own words. */
export interface DateShortcut {
  /** "Today", "Tomorrow", "Next week" — never a raw date. */
  readonly label: string;
  /** The ISO `YYYY-MM-DD` it commits. */
  readonly value: string;
}

export interface DateChoiceProps {
  /** The field being chosen for — "Due date". Names the grid and the commands. */
  readonly label: string;
  /** The current ISO value, or `null` when unset. */
  readonly value: string | null;
  /** Commit a date. */
  readonly onSelect: (iso: string) => void;
  /** Commit "no date". Absent when the field is required. */
  readonly onClear?: (() => void) | undefined;
  /** Abandon without changing anything. */
  readonly onCancel: () => void;
  /**
   * One-press dates. Supplied by the caller so the wording and the arithmetic
   * stay the product's; a caller with no honest "today" passes none and gets
   * the grid and the commands alone.
   */
  readonly shortcuts?: readonly DateShortcut[];
  /** The OWNER's calendar day, which marks "today" in the grid. */
  readonly todayIso?: string | null;
  /** Block every control while a save is in flight. */
  readonly disabled?: boolean;
}

export function DateChoice({
  label,
  value,
  onSelect,
  onClear,
  onCancel,
  shortcuts,
  todayIso = null,
  disabled = false,
}: DateChoiceProps) {
  return (
    <div className="dh-datepicker">
      {shortcuts && shortcuts.length > 0 ? (
        /*
         * No `role="group"` and no label of its own.
         *
         * The obvious `aria-label={`${label} shortcuts`}` gave the wrapper the
         * accessible name "Due date shortcuts", which is a SECOND thing in the
         * surface whose name contains the field's. Anything resolving a control
         * by that name (assistive technology and `getByLabel` alike) then has
         * two candidates for "the due date". The surface is already named "Edit
         * due date" and each button says which day it commits.
         */
        <div className="dh-datepicker__presets">
          {shortcuts.map((shortcut) => (
            <button
              key={shortcut.label}
              type="button"
              className="dh-datepicker__preset"
              disabled={disabled}
              aria-pressed={value === shortcut.value}
              onClick={() => onSelect(shortcut.value)}
            >
              {shortcut.label}
            </button>
          ))}
        </div>
      ) : null}

      <CalendarGrid
        label={label}
        value={value}
        todayIso={todayIso}
        disabled={disabled}
        onSelect={onSelect}
      />

      <div className="dh-datepicker__actions">
        {onClear ? (
          <button
            type="button"
            className="dh-datepicker__command"
            disabled={disabled}
            /*
             * DS-17 — the accessible name says which field this empties, the
             * same wording every other clear control in the product uses. The
             * visible words stay "No date" because the surface is already
             * titled "Edit <field>"; the accessible name is where a
             * screen-reader user, who may reach the button without having heard
             * the dialog title again, needs the context.
             */
            aria-label={clearControlLabel(label)}
            onClick={onClear}
          >
            No date
          </button>
        ) : null}
        <button
          type="button"
          className="dh-datepicker__command"
          disabled={disabled}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
