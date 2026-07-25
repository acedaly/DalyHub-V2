/**
 * DIARY-01B — the Day-mode date navigator.
 *
 * Previous-day, next-day, Today and a native date picker, all URL-backed via the
 * `?date=YYYY-MM-DD` param (Back/Forward correct, deep-linkable). Previous/next step
 * the local calendar day with the pure day arithmetic in `./occurred-time` — the
 * browser never re-derives the day boundary. Changing the date is a SCOPE change, so
 * every control drops the pagination `cursor`; navigating to "today" clears the
 * param (today is the canonical default). Previous/next/Today are real links (they
 * work without JavaScript); the picker navigates on change.
 *
 * Accessible: each control is a labelled button/link, the current day is announced
 * through the picker's accessible name, and the visible label pairs the weekday with
 * the date so the day is never signalled by position alone.
 */

import { useNavigate, useSearchParams } from "react-router";

import { ChevronRightIcon } from "~/shared/icons";

import { addDaysToDayKey, formatDayKeyMedium } from "./occurred-time";

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
    if (dayKey === todayKey) {
      // Today is the canonical default, expressed by the absence of `date`.
      next.delete("date");
    } else {
      next.set("date", dayKey);
    }
    const query = next.toString();
    return query.length > 0 ? `?${query}` : "?";
  };

  const previous = addDaysToDayKey(selectedDate, -1);
  const nextDay = addDaysToDayKey(selectedDate, 1);
  const isToday = selectedDate === todayKey;

  const go = (dayKey: string) => {
    // Push (not replace) so each viewed day is its own history entry — Back
    // returns to the previously viewed day rather than skipping it or leaving the
    // Diary (the URL-backed, Back/Forward-correct date contract).
    navigate(hrefForDate(dayKey), { preventScrollReset: true });
  };

  return (
    <div className="dh-diary-datenav" role="group" aria-label="Selected day">
      <button
        type="button"
        className="dh-diary-datenav__step dh-diary-datenav__step--prev"
        aria-label="Previous day"
        disabled={previous === null}
        onClick={() => previous && go(previous)}
      >
        <ChevronRightIcon aria-hidden="true" />
      </button>

      <div className="dh-diary-datenav__current">
        <span className="dh-diary-datenav__label">
          {isToday ? "Today · " : ""}
          {formatDayKeyMedium(selectedDate)}
        </span>
        <input
          type="date"
          className="dh-diary-datenav__picker"
          aria-label="Select date"
          value={selectedDate}
          onChange={(event) => {
            const value = event.target.value;
            if (value) go(value);
          }}
        />
      </div>

      <button
        type="button"
        className="dh-diary-datenav__step dh-diary-datenav__step--next"
        aria-label="Next day"
        disabled={nextDay === null}
        onClick={() => nextDay && go(nextDay)}
      >
        <ChevronRightIcon aria-hidden="true" />
      </button>

      <button
        type="button"
        className="dh-diary-datenav__today"
        onClick={() => go(todayKey)}
        disabled={isToday}
      >
        Today
      </button>
    </div>
  );
}
