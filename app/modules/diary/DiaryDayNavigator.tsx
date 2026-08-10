/**
 * DIARY-01B / UIX-04 §18 — the Day-mode date navigator, as a WEEK STRIP.
 *
 * ── What changed, and why ────────────────────────────────────────────────────
 * This was a prev / "Today · Mon, 10 August 2026" / next trio of pills. Every
 * control worked and none of them answered the question a diary is opened with,
 * which is not "what day is selected?" but "where am I in the week, and which
 * days have I got anything for?". Moving between two days meant two clicks and a
 * page of reading in between; moving to Saturday meant four.
 *
 * The strip is the answer §18 asks for in as many words — Mon 8, Tue 9, Wed 10 —
 * with the selected day carrying the DalyHub accent. Seven days is one glance
 * and one click, and the week is the unit a person actually reflects over.
 *
 * ── What is deliberately kept ────────────────────────────────────────────────
 *   - the URL is still the state (`?date=YYYY-MM-DD`), so every day is
 *     deep-linkable, shareable and Back/Forward-correct, and "today" is still
 *     expressed by the ABSENCE of the param;
 *   - every day is a real `<Link>`, so the strip works with no JavaScript and
 *     costs no client state — the same reason the old controls were links;
 *   - a date change is a SCOPE change, so it drops the pagination `cursor`;
 *   - the native date picker survives, as the way to travel further than a week.
 *     A week strip is for the recent past; a picker is for last March. Replacing
 *     the picker with a calendar widget is exactly the "huge calendar widget"
 *     §18 rules out;
 *   - "Today" survives as the one-press way home from any week.
 *
 * ── Accessibility ────────────────────────────────────────────────────────────
 * The strip is a `<nav>` of links. The selected day carries `aria-current="date"`
 * — the ARIA value that exists precisely for a date in a picker — and its
 * accessible name is the FULL date, because "8" is not a date to anyone reading
 * the page one control at a time. Today is marked in words for the same reason.
 * Nothing is signalled by colour alone: the selected day is a filled container
 * and today carries a dot AND a "(today)" in its accessible name.
 */

import { Link, useNavigate, useSearchParams } from "react-router";

import { CalendarIcon } from "~/shared/icons";

import {
  addDaysToDayKey,
  formatDayKeyLong,
  weekStripCaption,
  weekStripDays,
} from "./occurred-time";

export interface DiaryDayNavigatorProps {
  readonly selectedDate: string;
  readonly todayKey: string;
}

export function DiaryDayNavigator({
  selectedDate,
  todayKey,
}: DiaryDayNavigatorProps) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const hrefForDate = (dayKey: string): string => {
    const next = new URLSearchParams(searchParams);
    // A date change is a scope change: the cursor is scope-bound and dropped.
    next.delete("cursor");
    // Opening a day must not also reopen whatever panel was last open.
    next.delete("inspector");
    if (dayKey === todayKey) {
      // Today is the canonical default, expressed by the absence of `date`.
      next.delete("date");
    } else {
      next.set("date", dayKey);
    }
    const query = next.toString();
    return query.length > 0 ? `?${query}` : "?";
  };

  const days = weekStripDays(selectedDate);
  const previousWeek = addDaysToDayKey(selectedDate, -7);
  const nextWeek = addDaysToDayKey(selectedDate, 7);
  const isToday = selectedDate === todayKey;

  const go = (dayKey: string) => {
    // Push (not replace) so each viewed day is its own history entry — Back
    // returns to the previously viewed day rather than skipping it or leaving the
    // Diary (the URL-backed, Back/Forward-correct date contract).
    navigate(hrefForDate(dayKey), { preventScrollReset: true });
  };

  return (
    <nav className="dh-diary-week" aria-label="Select a day">
      <div className="dh-diary-week__bar">
        {previousWeek !== null ? (
          <Link
            to={hrefForDate(previousWeek)}
            className="dh-diary-week__step"
            aria-label="Previous week"
            preventScrollReset
          >
            <span aria-hidden="true">‹</span>
          </Link>
        ) : null}

        <ol className="dh-diary-week__days">
          {days.map((day) => {
            const selected = day.dayKey === selectedDate;
            const today = day.dayKey === todayKey;
            return (
              <li key={day.dayKey}>
                <Link
                  to={hrefForDate(day.dayKey)}
                  className="dh-diary-week__day"
                  // `date` is the ARIA current value for exactly this: the day a
                  // date control is showing.
                  aria-current={selected ? "date" : undefined}
                  data-today={today || undefined}
                  aria-label={`${formatDayKeyLong(day.dayKey)}${today ? " (today)" : ""}`}
                  preventScrollReset
                >
                  <span className="dh-diary-week__weekday" aria-hidden="true">
                    {day.weekday}
                  </span>
                  <span className="dh-diary-week__number" aria-hidden="true">
                    {day.dayOfMonth}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>

        {nextWeek !== null ? (
          <Link
            to={hrefForDate(nextWeek)}
            className="dh-diary-week__step"
            aria-label="Next week"
            preventScrollReset
          >
            <span aria-hidden="true">›</span>
          </Link>
        ) : null}
      </div>

      <div className="dh-diary-week__end">
        <span className="dh-diary-week__caption">{weekStripCaption(days)}</span>
        {/*
          The picker is how you leave the week.

          A native `<input type="date">` cannot be shrunk to a glyph — the
          browser lays out its own segmented field and clips it, which is what
          "08/📅" in a 44px box was. So the input is stretched INVISIBLY over a
          44px well that draws the glyph, which is the same technique the
          navigator this replaced already used. The control the user operates is
          still the real native picker: keyboard-complete, phone-native, and
          working with no JavaScript beyond the navigation itself.

          Its accessible name states the day it currently holds, so a keyboard
          user reaching it knows where they are without reading the strip.
        */}
        <span className="dh-diary-week__pickerwell">
          <CalendarIcon aria-hidden="true" />
          <input
            type="date"
            className="dh-diary-week__picker"
            aria-label={`Go to a date — showing ${formatDayKeyLong(selectedDate)}`}
            value={selectedDate}
            onChange={(event) => {
              const value = event.target.value;
              if (value) go(value);
            }}
          />
        </span>
        <Link
          to={hrefForDate(todayKey)}
          className="dh-diary-week__today"
          aria-disabled={isToday || undefined}
          preventScrollReset
        >
          Today
        </Link>
      </div>
    </nav>
  );
}
