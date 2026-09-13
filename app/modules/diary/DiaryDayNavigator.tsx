/**
 * DIARY-01B / UIX-04 §18 — the Day-mode date navigator, as a WEEK STRIP.
 *
 * ── What it answers ──────────────────────────────────────────────────────────
 * Not "what day is selected?" but "where am I in the week, and which days have I
 * got anything for?". Seven days is one glance and one click, and the week is
 * the unit a person actually reflects over. Moving between two days used to mean
 * two clicks and a page of reading in between; moving to Saturday meant four.
 *
 * ── What is deliberately kept ────────────────────────────────────────────────
 *   - the URL is still the state (`?date=YYYY-MM-DD`), so every day is
 *     deep-linkable, shareable and Back/Forward-correct, and "today" is still
 *     expressed by the ABSENCE of the param;
 *   - every day is a real `<Link>`, so the strip works with no JavaScript and
 *     costs no client state — the same reason the old controls were links;
 *   - a date change is a SCOPE change, so it drops the pagination `cursor`;
 *   - a picker survives, as the way to travel further than a week. A week strip
 *     is for the recent past; a picker is for last March;
 *   - "Today" survives as the one-press way home from any week.
 *
 * ── UNTITLED-12: the picker is Untitled's CALENDAR, and the paint is Untitled's
 *
 * The picker was a native `<input type="date">` stretched INVISIBLY at
 * `opacity: 0` across a 44px well that drew a glyph, with the focus ring moved
 * onto the well because the control the user operates could not be seen. The
 * comment defending it was honest about why — a native date input cannot be
 * shrunk to a glyph, because the browser lays out its own segmented field and
 * clips it — and the conclusion was wrong: DalyHub owns a licensed calendar and
 * was not using it. `application/date-picker`'s `Calendar` was vendored into
 * this repository with NO consumer at all.
 *
 * So the well is gone and the trigger is an ordinary `IconButton` opening
 * React Aria's `Popover` over the genuine `Calendar` — its month header, its
 * previous/next buttons, its `CalendarGrid`, its cells, its selected and
 * today treatments, its keyboard model (arrows by day, PageUp/PageDown by
 * month, Home/End, Escape) and its focus management, none of which the native
 * input's opacity trick could offer a keyboard user who could not see it.
 * Choosing a date navigates immediately, which is what this control did before;
 * the upstream `DatePicker` wrapper's Apply/Cancel pair is deliberately not
 * adopted, because a navigation does not need to be confirmed and Back already
 * undoes it.
 *
 * The strip's own paint moves with it: the step controls and the day cells take
 * Untitled's surface, hover and ACTIVE roles rather than `--dh-color-bg-sunken`
 * and `--dh-color-accent`, and `.dh-diary-week*` keeps only what the strip's
 * LAYOUT needs.
 *
 * ── Accessibility ────────────────────────────────────────────────────────────
 * The strip is a `<nav>` of links. The selected day carries `aria-current="date"`
 * — the ARIA value that exists precisely for a date in a picker — and its
 * accessible name is the FULL date, because "8" is not a date to anyone reading
 * the page one control at a time. Today is marked in words for the same reason.
 * Nothing is signalled by colour alone: the selected day is a filled container
 * and today carries a dot AND a "(today)" in its accessible name.
 */

import { parseDate, type DateValue } from "@internationalized/date";
import { useState } from "react";
import {
  Calendar as CalendarGlyph,
  ChevronLeft,
  ChevronRight,
} from "@untitledui/icons";
import {
  Button as AriaButton,
  Dialog as AriaDialog,
  DialogTrigger as AriaDialogTrigger,
  Popover as AriaPopover,
} from "react-aria-components";
import { Link, useNavigate, useSearchParams } from "react-router";

import { buttonClassName, iconButtonClassName } from "~/shared/ui";
import { Calendar } from "~/shared/ui/untitled/application/date-picker/calendar";
import { cx } from "~/shared/ui/untitled/utils/cx";

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

/**
 * One day cell. Untitled's quiet ground, its hover, and the brand SOLID surface
 * for the day being viewed — a real container change, never a hue alone.
 */
const DAY = cx(
  "dh-diary-week__day relative flex flex-col items-center justify-center gap-px rounded-md px-2 py-1 no-underline",
  "min-h-[var(--app-touch-target-min)] min-w-[var(--app-touch-target-min)]",
  "text-tertiary outline-focus-ring transition duration-100 ease-linear",
  "hover:bg-secondary hover:text-secondary",
  "focus-visible:outline-2 focus-visible:outline-offset-2",
  "aria-[current=date]:bg-brand-solid aria-[current=date]:text-white",
  "aria-[current=date]:hover:bg-brand-solid_hover aria-[current=date]:hover:text-white",
  // TODAY, when it is not the day being viewed: a dot under the number. Never
  // colour alone — the day's accessible name says "(today)" — and never the
  // selected treatment, because "today" and "the day I am looking at" are two
  // different facts and a diary is used to look at days that are not today.
  "data-[today]:after:mt-px data-[today]:after:size-1 data-[today]:after:rounded-full",
  "data-[today]:after:bg-fg-brand-primary data-[today]:after:content-['']",
  "data-[today]:aria-[current=date]:after:bg-white",
  // A background is not drawn in forced colours, so the selected day needs a
  // treatment that is.
  "forced-colors:aria-[current=date]:outline forced-colors:aria-[current=date]:outline-2",
);

export function DiaryDayNavigator({
  selectedDate,
  todayKey,
}: DiaryDayNavigatorProps) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [pickerOpen, setPickerOpen] = useState(false);

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

  /**
   * The calendar's value, as React Aria's own date type.
   *
   * `parseDate` throws on anything that is not `YYYY-MM-DD`; the day key always
   * is one (it comes from `toLocalDayKey`), but a hand-edited URL reaches here
   * too, and a navigator that crashes on a typo is worse than one that opens on
   * the current month.
   */
  const pickerValue: DateValue | null = (() => {
    try {
      return parseDate(selectedDate);
    } catch {
      return null;
    }
  })();

  return (
    <nav
      className="dh-diary-week flex w-full min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2"
      aria-label="Select a day"
    >
      <div className="dh-diary-week__bar flex min-w-0 items-center gap-1">
        {/*
          The week steps are LINKS, not buttons.
          
          They navigate — to `?date=` seven days either side — so they are
          middle-clickable, open in a new tab, show their target in the status
          bar and work with no JavaScript, exactly as the seven day cells beside
          them do. A first draft of this migration made them `IconButton`s
          calling `navigate()`, which is the "a link navigates, a button acts"
          rule broken by a control that looked the same either way; the paint
          comes from `iconButtonClassName` instead, which is what that export is
          for.
        */}
        {previousWeek !== null ? (
          <Link
            to={hrefForDate(previousWeek)}
            className={iconButtonClassName({
              size: "sm",
              className: "dh-diary-week__step",
            })}
            aria-label="Previous week"
            preventScrollReset
          >
            <ChevronLeft aria-hidden="true" />
          </Link>
        ) : null}

        <ol className="dh-diary-week__days m-0 flex min-w-0 list-none items-stretch gap-1 overflow-x-auto p-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {days.map((day) => {
            const selected = day.dayKey === selectedDate;
            const today = day.dayKey === todayKey;
            return (
              <li key={day.dayKey}>
                <Link
                  to={hrefForDate(day.dayKey)}
                  className={DAY}
                  // `date` is the ARIA current value for exactly this: the day a
                  // date control is showing.
                  aria-current={selected ? "date" : undefined}
                  data-today={today || undefined}
                  aria-label={`${formatDayKeyLong(day.dayKey)}${today ? " (today)" : ""}`}
                  preventScrollReset
                >
                  <span
                    className="dh-diary-week__weekday text-xs font-medium tracking-wide uppercase"
                    aria-hidden="true"
                  >
                    {day.weekday}
                  </span>
                  <span
                    className="dh-diary-week__number text-lg leading-tight font-semibold tabular-nums"
                    aria-hidden="true"
                  >
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
            className={iconButtonClassName({
              size: "sm",
              className: "dh-diary-week__step",
            })}
            aria-label="Next week"
            preventScrollReset
          >
            <ChevronRight aria-hidden="true" />
          </Link>
        ) : null}
      </div>

      <div className="dh-diary-week__end flex shrink-0 items-center gap-2">
        <span className="dh-diary-week__caption text-xs font-medium whitespace-nowrap text-tertiary">
          {weekStripCaption(days)}
        </span>

        {/*
          The picker is how you leave the week — the genuine Untitled calendar,
          in React Aria's popover, opened by an ordinary icon button.
        */}
        <AriaDialogTrigger isOpen={pickerOpen} onOpenChange={setPickerOpen}>
          {/*
            React Aria's `Button`, not the shared `IconButton`.

            `DialogTrigger` hands its press behaviour to its first child through
            React Aria's `PressResponder` CONTEXT, and a plain `<button>` does
            not consume it — so a first draft of this using `IconButton` looked
            identical, reported no error, and never opened the popover at all
            (verified in the browser, not only in a test: zero `role="dialog"`
            nodes after a click). The paint still comes from the one source, via
            `iconButtonClassName`, which is precisely the case that export
            exists for: an element that cannot BE the component.
          */}
          <AriaButton
            // The name states the day it currently holds, so a keyboard user
            // reaching it knows where they are without reading the strip.
            aria-label={`Go to a date — showing ${formatDayKeyLong(selectedDate)}`}
            className={iconButtonClassName({
              size: "sm",
              className: "dh-diary-week__picker",
            })}
          >
            <CalendarGlyph aria-hidden="true" />
          </AriaButton>
          <AriaPopover
            offset={8}
            placement="bottom end"
            className={({ isEntering, isExiting }) =>
              cx(
                "origin-(--trigger-anchor-point) will-change-transform",
                isEntering &&
                  "duration-150 ease-out animate-in fade-in placement-top:slide-in-from-bottom-0.5 placement-bottom:slide-in-from-top-0.5",
                isExiting &&
                  "duration-100 ease-in animate-out fade-out placement-top:slide-out-to-bottom-0.5 placement-bottom:slide-out-to-top-0.5",
              )
            }
          >
            <AriaDialog
              aria-label="Go to a date"
              className="rounded-2xl bg-primary p-4 shadow-xl ring ring-secondary_alt outline-hidden"
            >
              <Calendar
                value={pickerValue}
                onChange={(value) => {
                  if (!value) return;
                  setPickerOpen(false);
                  // The calendar speaks `CalendarDate`; the URL speaks the
                  // owner's day key, and `toString()` on a `CalendarDate` is
                  // exactly `YYYY-MM-DD`.
                  go(value.toString());
                }}
              >
                {/*
                  Upstream's default body puts a date INPUT and a Today button
                  between the header and the grid. Both are a second copy of a
                  control this navigator already has — the strip's own "Today"
                  link sits eight pixels away — so the calendar is given an empty
                  child, which is the documented way to replace that block, and
                  the grid follows the header directly.
                */}
                <></>
              </Calendar>
            </AriaDialog>
          </AriaPopover>
        </AriaDialogTrigger>

        {/*
          "Today" stays a router `Link` painted with `buttonClassName` rather
          than becoming `ButtonLink`: it needs `preventScrollReset` and client
          navigation, and `ButtonLink` is a plain `<a href>` by design. The paint
          comes from the same source either way, which is the point of the
          class-list export.

          When today IS the day being viewed the control is inert rather than
          absent — a control that disappears when you reach its destination
          moves everything beside it — so it is `aria-disabled` and its pointer
          events are off, which is what the legacy rule did.
        */}
        <Link
          to={hrefForDate(todayKey)}
          className={buttonClassName({
            variant: "subtle",
            size: "sm",
            className: cx(
              "dh-diary-week__today",
              isToday && "pointer-events-none opacity-50",
            ),
          })}
          aria-disabled={isToday || undefined}
          preventScrollReset
        >
          Today
        </Link>
      </div>
    </nav>
  );
}
