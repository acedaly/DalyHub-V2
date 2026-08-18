/**
 * HABITS-01 — the Habit's recent history, drawn as a small week grid.
 *
 * ── Restrained on purpose ───────────────────────────────────────────────────
 * Four weeks, laid out as four rows of seven, with weekday headings. It is NOT a
 * GitHub contribution heatmap: there is no year of squares, no intensity ramp
 * and no total to beat. Four weeks is long enough to see a pattern and short
 * enough to fit a 320px phone without scrolling sideways.
 *
 * ── Four states, and two of them are not failures ───────────────────────────
 *   done          a check-in exists for that day
 *   scheduled     the day asked for one and holds none
 *   not scheduled the day never asked for anything
 *   not active    before the habit existed, or after it was archived
 *
 * The last two are drawn as almost nothing, because they mean almost nothing. A
 * Monday/Wednesday/Friday habit is not failing on a Tuesday, and the grid must
 * not be readable as a wall of misses.
 *
 * ── Every square has words ──────────────────────────────────────────────────
 * The grid is a `<table>` with real row and column headers, and each cell
 * carries the full sentence from `habitHistoryDayLabel` — "Wednesday 2026-08-12:
 * done". Nothing here is conveyed by colour alone, and a screen reader gets the
 * same four weeks the eye does rather than a decorative div.
 */

import {
  habitWeekdayName,
  habitWeekdayShortName,
  habitWeekdayOrder,
} from "~/kernel/habits";
import type { FirstDayOfWeek } from "~/kernel/preferences";
import type { SerializedHabitHistoryDay } from "~/shared/habits";

export interface HabitHistoryStripProps {
  readonly days: readonly SerializedHabitHistoryDay[];
  readonly firstDayOfWeek: FirstDayOfWeek;
  /** "9 of 12 expected check-ins", or null when nothing was expected yet. */
  readonly summary: string | null;
}

export function HabitHistoryStrip({
  days,
  firstDayOfWeek,
  summary,
}: HabitHistoryStripProps) {
  const order = habitWeekdayOrder(firstDayOfWeek);
  // The window always starts on the owner's week start, so the rows are whole
  // weeks and the columns line up under their headings by construction.
  const weeks: (SerializedHabitHistoryDay | null)[][] = [];
  for (let index = 0; index < days.length; index += 7) {
    const slice = days.slice(index, index + 7);
    weeks.push(
      order.map(
        (weekday) => slice.find((day) => day.weekday === weekday) ?? null,
      ),
    );
  }

  if (weeks.length === 0) {
    return (
      <p className="dh-habit-history__empty">
        Nothing recorded yet. Today is a fine place to start.
      </p>
    );
  }

  return (
    <div className="dh-habit-history">
      <table className="dh-habit-history__grid">
        <caption className="dh-visually-hidden">
          {summary === null
            ? "The last four weeks, one square per day."
            : `The last four weeks, one square per day. ${summary}.`}
        </caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="dh-visually-hidden">Week beginning</span>
            </th>
            {order.map((weekday) => (
              <th scope="col" key={weekday}>
                <span aria-hidden="true">
                  {habitWeekdayShortName(weekday).slice(0, 1)}
                </span>
                <span className="dh-visually-hidden">
                  {habitWeekdayName(weekday)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, index) => {
            const first = week.find((day) => day !== null) ?? null;
            return (
              <tr key={first?.dateIso ?? index}>
                <th scope="row" className="dh-habit-history__week">
                  {first === null ? "" : first.dateIso.slice(5)}
                </th>
                {week.map((day, column) => (
                  <td key={day?.dateIso ?? `${index}-${column}`}>
                    {day === null ? (
                      <span
                        className="dh-habit-history__gap"
                        aria-hidden="true"
                      />
                    ) : (
                      <span
                        className="dh-habit-history__day"
                        data-state={day.state}
                      >
                        <span className="dh-visually-hidden">{day.label}</span>
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <ul className="dh-habit-history__key">
        <li>
          <span
            className="dh-habit-history__day"
            data-state="completed"
            aria-hidden="true"
          />
          Done
        </li>
        <li>
          <span
            className="dh-habit-history__day"
            data-state="expected"
            aria-hidden="true"
          />
          Scheduled
        </li>
        <li>
          <span
            className="dh-habit-history__day"
            data-state="unscheduled"
            aria-hidden="true"
          />
          Not scheduled
        </li>
      </ul>
    </div>
  );
}
