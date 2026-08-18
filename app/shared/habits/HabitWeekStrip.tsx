/**
 * UX-02 — THIS week as seven dots, under seven weekday letters.
 *
 * The compact sibling of the Habit record's four-week `HabitHistoryStrip`, and
 * it obeys every rule that grid obeys. What differs is the span: one week, so it
 * fits a collection row's own line rather than a record's panel.
 *
 *     M  T  W  T  F  S  S
 *     ●  ●  ●  ○  ·  ·  ·
 *
 * ── Four states, and only one of them is a dot that is filled ───────────────
 *   done           a check-in exists for that day
 *   scheduled      the day asked for one and holds none
 *   not scheduled  the day never asked for anything
 *   not active     before the Habit existed, or after it was archived
 *
 * ── A day that has not happened is not drawn at all ────────────────────────
 * The strip is handed only the days up to and including today (its source
 * clamps there), and every remaining column renders EMPTY GROUND with no dot and
 * no state. That is the whole reason this is not a progress bar: Thursday cannot
 * be incomplete on Wednesday, so Thursday is blank rather than hollow, and the
 * accessible cell says "not yet" rather than describing a verdict.
 *
 * ── It is a table, because it is tabular ───────────────────────────────────
 * Real column headers, and every cell carries the full sentence
 * `habitHistoryDayLabel` writes ("Wednesday 2026-08-19: done"). Nothing here is
 * conveyed by colour or position alone, so a screen reader gets the same week the
 * eye does rather than seven decorative spans.
 */

import {
  habitWeekdayName,
  habitWeekdayOrder,
  habitWeekdayShortName,
} from "~/kernel/habits";
import type { FirstDayOfWeek } from "~/kernel/preferences";

import type { SerializedHabitHistoryDay } from "./habit-view";

export interface HabitWeekStripProps {
  /** This week's days up to today, in date order. May be shorter than seven. */
  readonly days: readonly SerializedHabitHistoryDay[];
  readonly firstDayOfWeek: FirstDayOfWeek;
  /**
   * The authoritative statement of the same week in words ("2 of 3 this week"),
   * which the row already draws. Announced as the table's caption so the strip
   * is never the only place the reading exists.
   */
  readonly summary: string | null;
  /** The Habit's title, so the caption names what week this is. */
  readonly title: string;
}

export function HabitWeekStrip({
  days,
  firstDayOfWeek,
  summary,
  title,
}: HabitWeekStripProps) {
  const order = habitWeekdayOrder(firstDayOfWeek);
  return (
    <table className="dh-habit-week" data-testid="habit-week-strip">
      <caption className="dh-visually-hidden">
        {`${title}, this week, one square per day.${summary === null ? "" : ` ${summary}.`}`}
      </caption>
      <thead>
        <tr>
          {order.map((weekday) => (
            <th scope="col" key={weekday}>
              {/* The letter is decoration for the eye; the weekday's full name
                  is what assistive tech reads, exactly as the record's grid. */}
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
        <tr>
          {order.map((weekday) => {
            const day = days.find((entry) => entry.weekday === weekday) ?? null;
            return (
              <td key={weekday}>
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
              </td>
            );
          })}
        </tr>
      </tbody>
    </table>
  );
}
