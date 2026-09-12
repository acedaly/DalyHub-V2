/**
 * THIS week as seven dots — a table CELL, with its weekday letters in the
 * column HEADING above it.
 *
 *     Header   M  T  W  T  F  S  S      <- {@link HabitWeekStripHeading}, once
 *     Row      ●  ●  ●  ○  ·  ·  ·      <- {@link HabitWeekStrip}, per Habit
 *     Row      ●  ○  ●  ●  ·  ·  ·
 *
 * ── UNTITLED-09 — why this stopped being a table of its own ────────────────
 *
 * It used to render a complete `<table>` per row, with its own `<thead>` of
 * seven weekday letters. Nested inside a collection table that is exactly what
 * it looks like: eight rows of "M T W T F S S" down the page, one per Habit,
 * stating the same seven column names eight times. The letters belong to the
 * COLUMN, so they are drawn once by the column's own `<th>` and the cell is only
 * the seven dots — which is also what makes them line up.
 *
 * ── Four states, and only one of them is a dot that is filled ──────────────
 *   done           a check-in exists for that day
 *   scheduled      the day asked for one and holds none
 *   not scheduled  the day never asked for anything
 *   not active     before the Habit existed, or after it was archived
 *
 * ── A day that has not happened is not drawn at all ────────────────────────
 * The strip is handed only the days up to and including today (its source clamps
 * there), and every remaining column renders EMPTY GROUND with no dot and no
 * state. That is the whole reason this is not a progress bar: Thursday cannot be
 * incomplete on Wednesday, so Thursday is blank rather than hollow, and its
 * accessible text says "not yet" rather than describing a verdict.
 *
 * ── Every dot still has words ──────────────────────────────────────────────
 * Each carries the full sentence `habitHistoryDayLabel` writes ("Wednesday
 * 2026-08-19: done"), and the list itself is named with the week's own summary.
 * Nothing here is conveyed by colour or position alone, so a screen reader gets
 * the same week the eye does rather than seven decorative spans.
 */

import {
  habitWeekdayName,
  habitWeekdayOrder,
  habitWeekdayShortName,
} from "~/kernel/habits";
import type { FirstDayOfWeek } from "~/kernel/preferences";

import type { SerializedHabitHistoryDay } from "./habit-view";

/** The seven tracks, declared identically by the heading and by every cell. */
const GRID = "grid grid-cols-7 items-center gap-1";

export interface HabitWeekStripProps {
  /** This week's days up to today, in date order. May be shorter than seven. */
  readonly days: readonly SerializedHabitHistoryDay[];
  readonly firstDayOfWeek: FirstDayOfWeek;
  /**
   * The authoritative statement of the same week in words ("2 of 3 this week"),
   * which the row already draws. Used to name the list, so the strip is never
   * the only place the reading exists.
   */
  readonly summary: string | null;
  /** The Habit's title, so the name says which week this is. */
  readonly title: string;
}

/**
 * The weekday letters, for a column heading.
 *
 * Decoration for the eye: `aria-hidden`, because the column's real accessible
 * name is the heading's own text and each dot below already names its own day in
 * full. Announcing seven letters as a heading would make a screen reader read
 * every row's weekday twice.
 */
export function HabitWeekStripHeading({
  firstDayOfWeek,
}: {
  readonly firstDayOfWeek: FirstDayOfWeek;
}) {
  return (
    <span className={`${GRID} mt-0.5 font-normal`} aria-hidden="true">
      {habitWeekdayOrder(firstDayOfWeek).map((weekday) => (
        <span className="text-center" key={weekday}>
          {habitWeekdayShortName(weekday).slice(0, 1)}
        </span>
      ))}
    </span>
  );
}

export function HabitWeekStrip({
  days,
  firstDayOfWeek,
  summary,
  title,
}: HabitWeekStripProps) {
  const order = habitWeekdayOrder(firstDayOfWeek);
  return (
    <ul
      className={GRID}
      aria-label={`${title}, this week.${summary === null ? "" : ` ${summary}.`}`}
      data-testid="habit-week-strip"
    >
      {order.map((weekday) => {
        const day = days.find((entry) => entry.weekday === weekday) ?? null;
        return (
          <li className="flex justify-center" key={weekday}>
            {day === null ? (
              /*
               * A day this week has not reached. No dot, and the words say
               * "not yet" rather than anything that could be read as a miss.
               */
              <span className="dh-habit-week__future">
                <span className="dh-visually-hidden">
                  {`${habitWeekdayName(weekday)}: not yet`}
                </span>
              </span>
            ) : (
              <span
                className="dh-habit-week__day"
                data-state={day.state}
                data-testid="habit-week-day"
              >
                <span className="dh-visually-hidden">{day.label}</span>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
