/**
 * CONTROL-01 — DalyHub's date-only calendar surface.
 *
 * DateChoice owns DalyHub scheduling semantics: owner-day shortcuts, clear/no-
 * date, ISO values and commit-on-selection. This component owns only calendar
 * interaction and delegates focus, keyboard navigation and grid semantics to
 * React Aria's Calendar primitives, following the vendored Untitled UI
 * calendar implementation.
 */

import {
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  isSameMonth,
  parseDate,
  type CalendarDate,
  type DateValue,
} from "@internationalized/date";
import {
  Calendar as AriaCalendar,
  CalendarGrid as AriaCalendarGrid,
  CalendarGridBody as AriaCalendarGridBody,
  CalendarGridHeader as AriaCalendarGridHeader,
  CalendarHeaderCell as AriaCalendarHeaderCell,
  CalendarStateContext,
  I18nProvider,
} from "react-aria-components";
import { mergeProps, useCalendarCell, useFocusRing } from "react-aria";

import { ChevronRightIcon } from "~/shared/icons";
import { Button as UntitledButton } from "~/shared/ui/untitled/base/buttons/button";
import { addCalendarDays } from "~/shared/task-record/plan-targets";

export interface CalendarGridProps {
  readonly value: string | null;
  readonly todayIso: string | null;
  readonly onSelect: (iso: string) => void;
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

function dateValue(iso: string | null): CalendarDate | undefined {
  return iso ? parseDate(iso) : undefined;
}

function isCalendarDate(value: DateValue): value is CalendarDate {
  return value.calendar.identifier === "gregory";
}

function spokenDate(
  date: CalendarDate,
  isToday: boolean,
  isSelected: boolean,
): string {
  const weekday = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    timeZone: "UTC",
  }).format(date.toDate("UTC"));
  return `${weekday} ${date.day} ${MONTH_NAMES[date.month - 1]} ${date.year}${isToday ? ", today" : ""}${isSelected ? ", selected" : ""}`;
}

function CalendarMonthHeading({
  fallback,
  id,
}: {
  readonly fallback: CalendarDate | undefined;
  readonly id: string;
}) {
  const state = useContext(CalendarStateContext)!;
  const month = state.visibleRange.start ?? fallback;
  if (!month) return null;

  const parts = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
  }).formatToParts(month.toDate("UTC"));

  return (
    <span id={id} className="dh-calendar__month">
      <span>{parts.find((part) => part.type === "month")?.value}</span>
      <span>{parts.find((part) => part.type === "year")?.value}</span>
    </span>
  );
}

// Adapted from React Aria's CalendarCell (react-aria-components 1.21.1,
// https://github.com/adobe/react-spectrum/tree/react-aria-components%401.21.1,
// Apache-2.0, retrieved 2026-09-10). Changes: render a native button for
// DalyHub's established one-tab-stop contract while retaining React Aria state.
function DalyHubCalendarCell({
  date,
  iso,
  isSelected,
  isToday,
}: {
  readonly date: CalendarDate;
  readonly iso: string;
  readonly isSelected: boolean;
  readonly isToday: boolean;
}) {
  const state = useContext(CalendarStateContext)!;
  const cellRef = useRef<HTMLTableCellElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const { focusProps, isFocusVisible } = useFocusRing();

  const {
    cellProps,
    buttonProps,
    isDisabled,
    isSelected: stateSelected,
  } = useCalendarCell(
    { date, isOutsideMonth: !isSameMonth(state.visibleRange.start, date) },
    state,
    buttonRef,
  );

  return (
    <td {...cellProps} ref={cellRef}>
      <button
        {...mergeProps(buttonProps, focusProps)}
        ref={buttonRef}
        type="button"
        className="dh-calendar__day"
        data-iso={iso}
        data-selected={isSelected || stateSelected ? "true" : undefined}
        data-today={isToday ? "true" : undefined}
        data-focus-visible={isFocusVisible ? "true" : undefined}
        disabled={isDisabled}
        tabIndex={date.toString() === state.focusedDate?.toString() ? 0 : -1}
        aria-label={spokenDate(date, isToday, false)}
      >
        {date.day}
      </button>
    </td>
  );
}

export function CalendarGrid({
  value,
  todayIso,
  onSelect,
  label,
  disabled = false,
}: CalendarGridProps) {
  const headingId = useId();
  const gridRef = useRef<HTMLTableElement | null>(null);
  const selected = dateValue(value);
  const ownerToday = dateValue(todayIso);
  const [focusedValue, setFocusedValue] = useState<CalendarDate | undefined>(
    () => selected ?? ownerToday ?? parseDate("1970-01-01"),
  );

  useEffect(() => {
    const next = dateValue(value);
    if (next) setFocusedValue(next);
  }, [value]);

  useLayoutEffect(() => {
    if (!gridRef.current) return;
    gridRef.current.setAttribute("aria-label", label);
    gridRef.current.removeAttribute("aria-labelledby");
  }, [focusedValue, label, value]);

  const handleChange = (next: DateValue | null) => {
    if (!next || !isCalendarDate(next)) return;
    setFocusedValue(next);
    onSelect(next.toString());
  };

  const handleGridKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTableElement>) => {
      if (event.target !== event.currentTarget || !focusedValue) return;
      const offsets: Record<string, number> = {
        ArrowLeft: -1,
        ArrowRight: 1,
        ArrowUp: -7,
        ArrowDown: 7,
      };
      if (event.key in offsets) {
        event.preventDefault();
        event.stopPropagation();
        setFocusedValue(
          parseDate(
            addCalendarDays(focusedValue.toString(), offsets[event.key]),
          ),
        );
        return;
      }
      if (event.key === "PageUp" || event.key === "PageDown") {
        event.preventDefault();
        event.stopPropagation();
        setFocusedValue(
          focusedValue.add({ months: event.key === "PageUp" ? -1 : 1 }),
        );
        return;
      }
      if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        event.stopPropagation();
        const mondayIndex = (focusedValue.toDate("UTC").getUTCDay() + 6) % 7;
        setFocusedValue(
          parseDate(
            addCalendarDays(
              focusedValue.toString(),
              event.key === "Home" ? -mondayIndex : 6 - mondayIndex,
            ),
          ),
        );
      }
    },
    [focusedValue],
  );

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const handleNativeKeyDown = (event: KeyboardEvent) => {
      if (event.target !== grid) return;
      handleGridKeyDown(
        event as unknown as React.KeyboardEvent<HTMLTableElement>,
      );
    };
    grid.addEventListener("keydown", handleNativeKeyDown);
    return () => grid.removeEventListener("keydown", handleNativeKeyDown);
  }, [focusedValue, handleGridKeyDown]);

  return (
    <I18nProvider locale="en-GB">
      <AriaCalendar
        aria-label={label}
        aria-describedby={headingId}
        className="dh-calendar"
        value={selected ?? null}
        focusedValue={focusedValue}
        onFocusChange={(next) => setFocusedValue(next as CalendarDate)}
        onChange={handleChange}
        isDisabled={disabled}
      >
        {() => (
          <>
            <div className="dh-calendar__head">
              <UntitledButton
                type="button"
                slot="previous"
                className="dh-calendar__month-step"
                aria-label="Previous month"
                iconLeading={ChevronRightIcon}
              />
              <CalendarMonthHeading fallback={focusedValue} id={headingId} />
              <UntitledButton
                type="button"
                slot="next"
                className="dh-calendar__month-step"
                aria-label="Next month"
                iconLeading={ChevronRightIcon}
              />
            </div>

            <AriaCalendarGrid
              ref={gridRef}
              aria-label={label}
              weekdayStyle="short"
              className="dh-calendar__grid"
            >
              <AriaCalendarGridHeader className="dh-calendar__row dh-calendar__row--head">
                {(day) => {
                  const index = WEEKDAY_NAMES.findIndex((name) =>
                    name.startsWith(day.slice(0, 2)),
                  );
                  return (
                    <AriaCalendarHeaderCell
                      key={day}
                      className="dh-calendar__weekday"
                      aria-label={WEEKDAY_NAMES[index]}
                    >
                      {day.slice(0, 2)}
                    </AriaCalendarHeaderCell>
                  );
                }}
              </AriaCalendarGridHeader>
              <AriaCalendarGridBody className="dh-calendar__rows">
                {(date) => {
                  const iso = date.toString();
                  const isSelected = iso === value;
                  const isToday = iso === todayIso;
                  return (
                    <DalyHubCalendarCell
                      date={date}
                      iso={iso}
                      isSelected={isSelected}
                      isToday={isToday}
                    />
                  );
                }}
              </AriaCalendarGridBody>
            </AriaCalendarGrid>
          </>
        )}
      </AriaCalendar>
    </I18nProvider>
  );
}
