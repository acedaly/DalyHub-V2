/**
 * CONTROL-01 — the DalyHub month grid.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Every date in DalyHub was edited through a native `<input type="date">`. That
 * was a defensible choice and it is written down as one (`InlineDateField`,
 * `DateField`): the platform brings a calendar, a phone wheel, keyboard and
 * screen-reader support, and locale handling for nothing.
 *
 * What it also brings is a control the product does not own. On the surfaces
 * that matter most — a Task row's due date, a Task drawer's planning section —
 * the owner sees a grey `dd/mm/yyyy` skeleton in the platform's typeface, a
 * platform calendar icon, and a picker whose look changes between Chrome,
 * Safari and Firefox. Beside DalyHub's own quiet rows and its own type scale,
 * that reads as an unfinished form field rather than as part of the product;
 * it is the single most-noticed "this control is behind the surface it edits"
 * defect in the August 2026 audit.
 *
 * So the task-editing surfaces get a DalyHub calendar. This is that grid: the
 * month, and nothing else.
 *
 * ── What it deliberately is not ──────────────────────────────────────────────
 * It is not a date FIELD. It has no text entry, no popover, no clear command
 * and no opinion about where it is mounted; `InlineDateField` composes it with
 * the presets and the commands, and the shared form `DateField` keeps the
 * native input, because a long form of dates is exactly where the platform
 * control is still the right answer.
 *
 * It performs no timezone arithmetic and holds no `Date` in state. Values are
 * date-only ISO `YYYY-MM-DD` throughout and every calculation goes through
 * `addCalendarDays`, whose arithmetic is on UTC components — so this grid
 * cannot produce an off-by-one day for an owner in Australia or anywhere else,
 * which is the entire risk in replacing a native date control.
 *
 * ── Accessibility ────────────────────────────────────────────────────────────
 * The WAI-ARIA date-picker grid pattern:
 *   - `role="grid"` with a row per week and a `gridcell` per day;
 *   - ONE tab stop (roving `tabindex`), so the grid does not cost 42 tabs;
 *   - Arrows move a day/week, PageUp/PageDown a month, Home/End the week's
 *     ends, and the focused cell is announced by its full date, not "17";
 *   - the selected day carries `aria-selected`, and today carries a visible
 *     mark AND the word "today" in its accessible name, so neither is a colour;
 *   - moving focus past the month's edge moves the month, because a keyboard
 *     user must not have to find the month buttons to reach the 3rd.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import { ChevronRightIcon } from "~/shared/icons";
import { addCalendarDays } from "~/shared/task-record/plan-targets";

export interface CalendarGridProps {
  /** The selected day, ISO `YYYY-MM-DD`, or null when nothing is chosen. */
  readonly value: string | null;
  /**
   * The OWNER's calendar day, resolved server-side (ADR-022). Marks "today" and
   * decides which month opens when nothing is selected. A surface with no
   * honest today passes null and gets no today mark — a wrong "today" on a
   * calendar is worse than none.
   */
  readonly todayIso: string | null;
  readonly onSelect: (iso: string) => void;
  /** Names the grid for assistive tech — "Due date", "Scheduled date". */
  readonly label: string;
  readonly disabled?: boolean;
}

const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/** Two letters, which is what fits a 7-column grid at 320px without wrapping. */
const WEEKDAY_INITIALS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

type CalendarParts = { year: number; month: number; day: number };

function parseIso(iso: string | null): CalendarParts | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function toIso({ year, month, day }: CalendarParts): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Days in a month, from UTC component arithmetic (no local clock involved). */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Weekday index with MONDAY first (0 = Mon … 6 = Sun).
 *
 * Monday-first because the product's own week strip on Today is Monday-first,
 * and a calendar that started on Sunday beside it would be two different weeks
 * on one screen.
 */
function mondayIndex(iso: string): number {
  const parts = parseIso(iso);
  if (!parts) return 0;
  const day = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day),
  ).getUTCDay();
  return (day + 6) % 7;
}

/** Shift a `YYYY-MM` cursor by whole months, clamping the day away entirely. */
function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const zeroBased = year * 12 + (month - 1) + delta;
  return {
    year: Math.floor(zeroBased / 12),
    month: (((zeroBased % 12) + 12) % 12) + 1,
  };
}

/** The full, spoken date for a cell's accessible name. */
function longDate(iso: string): string {
  const parts = parseIso(iso);
  if (!parts) return iso;
  const weekday = WEEKDAY_NAMES[mondayIndex(iso)];
  return `${weekday} ${parts.day} ${MONTH_NAMES[parts.month - 1]} ${parts.year}`;
}

export function CalendarGrid({
  value,
  todayIso,
  onSelect,
  label,
  disabled = false,
}: CalendarGridProps) {
  const headingId = useId();

  /** The day the grid's single tab stop sits on. */
  const [focusIso, setFocusIso] = useState<string>(
    () => value ?? todayIso ?? "1970-01-01",
  );
  /** True only after a key or a month button moved it — never on first paint. */
  const shouldFocusRef = useRef(false);
  const gridRef = useRef<HTMLDivElement | null>(null);

  /*
   * Follow the committed value. Choosing "Next week" from the presets above the
   * grid has to move the grid, or the calendar would be showing one month while
   * the field holds a date in another.
   */
  useEffect(() => {
    if (value) setFocusIso(value);
  }, [value]);

  const cursor = parseIso(focusIso) ?? { year: 1970, month: 1, day: 1 };

  const weeks = useMemo(() => {
    const first = toIso({ year: cursor.year, month: cursor.month, day: 1 });
    const lead = mondayIndex(first);
    const total = daysInMonth(cursor.year, cursor.month);
    const cells: (string | null)[] = [
      ...Array.from({ length: lead }, () => null),
      ...Array.from({ length: total }, (_, index) =>
        toIso({ year: cursor.year, month: cursor.month, day: index + 1 }),
      ),
    ];
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: (string | null)[][] = [];
    for (let index = 0; index < cells.length; index += 7) {
      rows.push(cells.slice(index, index + 7));
    }
    return rows;
  }, [cursor.year, cursor.month]);

  /*
   * Move the DOM focus only when a key or a month button asked for it. Focusing
   * on every render would steal focus from the presets above the grid the moment
   * a `value` prop arrived.
   */
  useEffect(() => {
    if (!shouldFocusRef.current) return;
    shouldFocusRef.current = false;
    const cell = gridRef.current?.querySelector<HTMLButtonElement>(
      `[data-iso="${focusIso}"]`,
    );
    cell?.focus();
  }, [focusIso]);

  const moveFocus = (nextIso: string) => {
    shouldFocusRef.current = true;
    setFocusIso(nextIso);
  };

  const goMonth = (delta: number) => {
    const next = shiftMonth(cursor.year, cursor.month, delta);
    const day = Math.min(cursor.day, daysInMonth(next.year, next.month));
    moveFocus(toIso({ ...next, day }));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const handlers: Record<string, () => void> = {
      ArrowLeft: () => moveFocus(addCalendarDays(focusIso, -1)),
      ArrowRight: () => moveFocus(addCalendarDays(focusIso, 1)),
      ArrowUp: () => moveFocus(addCalendarDays(focusIso, -7)),
      ArrowDown: () => moveFocus(addCalendarDays(focusIso, 7)),
      // The week's ends, Monday-first like the grid itself.
      Home: () => moveFocus(addCalendarDays(focusIso, -mondayIndex(focusIso))),
      End: () =>
        moveFocus(addCalendarDays(focusIso, 6 - mondayIndex(focusIso))),
      PageUp: () => goMonth(-1),
      PageDown: () => goMonth(1),
    };
    const handler = handlers[event.key];
    if (!handler) return;
    event.preventDefault();
    // Contained: the popover around the grid uses Escape and Tab, and a
    // Drawer behind it uses Escape too. Arrows must not reach either.
    event.stopPropagation();
    handler();
  };

  return (
    <div className="dh-calendar">
      <div className="dh-calendar__head">
        <button
          type="button"
          className="dh-calendar__month-step"
          onClick={() => goMonth(-1)}
          disabled={disabled}
          aria-label="Previous month"
        >
          <ChevronRightIcon className="dh-calendar__month-step-icon" />
        </button>
        {/*
         * `aria-live`: the month changes under the owner's arrow keys without
         * any control being pressed, and a screen-reader user moving from the
         * 31st to the 1st needs to hear which month they landed in.
         */}
        <p className="dh-calendar__month" id={headingId} aria-live="polite">
          {MONTH_NAMES[cursor.month - 1]} {cursor.year}
        </p>
        <button
          type="button"
          className="dh-calendar__month-step"
          onClick={() => goMonth(1)}
          disabled={disabled}
          aria-label="Next month"
        >
          <ChevronRightIcon className="dh-calendar__month-step-icon" />
        </button>
      </div>

      <div
        ref={gridRef}
        role="grid"
        aria-label={label}
        aria-describedby={headingId}
        className="dh-calendar__grid"
        /*
         * Programmatically focusable, never in the tab order. The grid's own
         * tab stop is the roving cell inside it (that is the whole point of the
         * pattern); this satisfies `jsx-a11y/interactive-supports-focus`, which
         * is right that an element with an interactive role must be reachable
         * and does not know that a descendant is doing the reaching.
         */
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div role="row" className="dh-calendar__row dh-calendar__row--head">
          {WEEKDAY_INITIALS.map((initial, index) => (
            <span
              key={initial}
              role="columnheader"
              className="dh-calendar__weekday"
              // The two-letter head is for the eye; the full weekday is what a
              // screen reader announces for the column.
              aria-label={WEEKDAY_NAMES[index]}
            >
              {initial}
            </span>
          ))}
        </div>

        {weeks.map((week) => (
          <div
            key={week.find(Boolean) ?? week.length}
            role="row"
            className="dh-calendar__row"
          >
            {week.map((iso, index) => {
              if (iso === null) {
                return (
                  <span
                    key={`pad-${index}`}
                    role="gridcell"
                    className="dh-calendar__pad"
                  />
                );
              }
              const selected = iso === value;
              const isToday = todayIso !== null && iso === todayIso;
              return (
                <span key={iso} role="gridcell" aria-selected={selected}>
                  <button
                    type="button"
                    data-iso={iso}
                    className="dh-calendar__day"
                    data-selected={selected ? "true" : undefined}
                    data-today={isToday ? "true" : undefined}
                    // ONE tab stop for the whole grid.
                    tabIndex={iso === focusIso ? 0 : -1}
                    disabled={disabled}
                    // The full date, so "17" is never the whole announcement,
                    // plus "today" in words — the ring around it is a mark, and
                    // a mark is not a name.
                    aria-label={`${longDate(iso)}${isToday ? ", today" : ""}`}
                    onClick={() => {
                      shouldFocusRef.current = false;
                      setFocusIso(iso);
                      onSelect(iso);
                    }}
                  >
                    {parseIso(iso)?.day}
                  </button>
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
