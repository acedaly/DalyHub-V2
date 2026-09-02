/**
 * CONV-00-E — run-relative calendar targets for the DalyHub date picker.
 *
 * Two journeys used to walk the month grid by a FIXED number of `PageUp` /
 * `PageDown` presses from wherever it opened and then click a day named by a
 * literal spoken date ("Wednesday 29 July 2026"). Both numbers were counted in
 * August 2026, and both journeys went red the day the owner's calendar turned
 * to September (DEBT-236). The rule they broke, now ADR-115 decision 4:
 *
 *   A fixture or E2E journey must not hard-code a future calendar date whose
 *   correctness depends on the month or day the test runs.
 *
 * For a picker that means three things, and this module is where each one is
 * done ONCE rather than privately in two specs:
 *
 *   1. the TARGET is derived from the owner's day (`ownerToday`) or from a
 *      value the test itself set — never typed;
 *   2. its accessible LABEL is generated in the same shape the grid's own
 *      `longDate` produces ("Tuesday 15 September 2026": weekday, day, month,
 *      year, English names, no comma) — never typed;
 *   3. the number of month presses is derived from the month the grid is
 *      ASSERTED to open on and the target's month — never counted by hand.
 *
 * ── Not a second date authority ──────────────────────────────────────────────
 * Nothing here decides what a date MEANS. The owner's day is `ownerToday`,
 * which resolves the seeded owner's timezone exactly as the product does
 * (ADR-022); the label shape mirrors the grid's presentation (`CalendarGrid`'s
 * `longDate`) and the abbreviated display form mirrors
 * `formatCalendarDate` (`~/shared/task-record/task-view.ts`), which prints
 * "Sep", not the `Intl` en-AU "Sept". Every function is pure UTC component
 * arithmetic over `YYYY-MM-DD` strings, the same arithmetic the grid uses, so
 * no local clock and no timezone can shift a day.
 */

import { expect, type Locator } from "@playwright/test";

import { ownerToday } from "./helpers";

type CalendarParts = {
  readonly year: number;
  readonly month: number;
  readonly day: number;
};

function parseIso(iso: string): CalendarParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new Error(`Not a calendar date: ${iso}`);
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
 * The same calendar day `months` months on (or back), clamped to the length of
 * the landing month — which is the grid's own `PageDown` rule, so a target
 * built this way is always a day the walk can reach.
 */
export function addCalendarMonths(iso: string, months: number): string {
  const parts = parseIso(iso);
  const zeroBased = parts.year * 12 + (parts.month - 1) + months;
  const year = Math.floor(zeroBased / 12);
  const month = (((zeroBased % 12) + 12) % 12) + 1;
  return toIso({
    year,
    month,
    day: Math.min(parts.day, daysInMonth(year, month)),
  });
}

/** A given day of the month `months` on from `iso`'s month. */
export function dayInMonthsAhead(
  iso: string,
  months: number,
  day: number,
): string {
  const parts = parseIso(addCalendarMonths(iso, months));
  return toIso({
    ...parts,
    day: Math.min(day, daysInMonth(parts.year, parts.month)),
  });
}

/** Whole months from `from`'s month to `to`'s month; negative when `to` is earlier. */
export function calendarMonthDelta(from: string, to: string): number {
  const a = parseIso(from);
  const b = parseIso(to);
  return b.year * 12 + (b.month - 1) - (a.year * 12 + (a.month - 1));
}

const NAMES = new Intl.DateTimeFormat("en-AU", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function nameParts(iso: string): Record<string, string> {
  const { year, month, day } = parseIso(iso);
  const parts = NAMES.formatToParts(new Date(Date.UTC(year, month - 1, day)));
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

/**
 * The grid cell's accessible name: "Tuesday 15 September 2026". Assembled from
 * parts rather than taken from `format()`, because a locale may punctuate the
 * long form ("Tuesday, 15 …") and the grid does not.
 */
export function calendarDayLabel(iso: string): string {
  const parts = nameParts(iso);
  return `${parts.weekday} ${parts.day} ${parts.month} ${parts.year}`;
}

/** The grid's month heading: "September 2026". */
export function calendarMonthLabel(iso: string): string {
  const parts = nameParts(iso);
  return `${parts.month} ${parts.year}`;
}

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * The product's own display form of a calendar date — "15 Sep 2026", as
 * `formatCalendarDate` prints it on a row, a chip and a record field. Mirrored
 * here because that formatter's table says "Sep" where `Intl`'s en-AU says
 * "Sept"; a spec asserting the rendered form has to spell it the product's way.
 */
export function shortCalendarDate(iso: string): string {
  const { year, month, day } = parseIso(iso);
  return `${day} ${SHORT_MONTHS[month - 1]} ${year}`;
}

/** The abbreviated month the product prints for `iso`'s month: "Sep". */
export function shortCalendarMonth(iso: string): string {
  return SHORT_MONTHS[parseIso(iso).month - 1];
}

/** The owner's current calendar day (ADR-022) — the day an unset grid opens on. */
export function ownerTodayIso(): string {
  return ownerToday();
}

/** `days` calendar days from the owner's day, as `YYYY-MM-DD`. */
export function ownerDayPlus(days: number): string {
  const { year, month, day } = parseIso(ownerToday());
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

/**
 * An instant `days` days AHEAD of now, for a seeded `created_at` that must sort
 * above every record a journey creates live — a fixed "far ahead" instant stops
 * being ahead on the day the calendar reaches it. `offsetSeconds` spaces rows
 * that need a stable order between themselves.
 */
export function futureInstant(days: number, offsetSeconds = 0): string {
  return new Date(
    Date.now() + days * 86_400_000 + offsetSeconds * 1_000,
  ).toISOString();
}

/**
 * Assert which month the grid is showing, by its live heading. A journey
 * ASSERTS the opening month (the owner's month when the value is unset; the
 * value's month otherwise) rather than assuming it, so a wrong assumption
 * fails here, in words, instead of as a timeout on a day that is not in the
 * grid.
 */
export async function expectCalendarMonth(
  scope: Locator,
  iso: string,
): Promise<void> {
  await expect(scope.locator(".dh-calendar__month")).toHaveText(
    calendarMonthLabel(iso),
  );
}

/**
 * Walk the grid with the KEYBOARD from the month it shows to `targetIso`'s
 * month — `PageDown` forwards, `PageUp` back, the count derived from the two
 * months — and confirm the landing month. This is the keyboard contract the
 * grid publishes, which is what the two motivating journeys were exercising;
 * `pickCalendarDate` in `helpers.ts` is the pointer path through the month
 * buttons for journeys that only need a date chosen.
 */
export async function walkCalendarToMonth(
  scope: Locator,
  grid: Locator,
  openedOnIso: string,
  targetIso: string,
): Promise<void> {
  await expectCalendarMonth(scope, openedOnIso);
  const delta = calendarMonthDelta(openedOnIso, targetIso);
  const key = delta < 0 ? "PageUp" : "PageDown";
  for (let step = 0; step < Math.abs(delta); step += 1) {
    await grid.press(key);
  }
  await expectCalendarMonth(scope, targetIso);
}

/**
 * Choose `targetIso` by walking the month with the keyboard and pressing the
 * day by its GENERATED accessible name. The grid commits on selection.
 */
export async function pickCalendarDayByKeyboard(
  scope: Locator,
  grid: Locator,
  openedOnIso: string,
  targetIso: string,
): Promise<void> {
  await walkCalendarToMonth(scope, grid, openedOnIso, targetIso);
  // Anchored, because "1 September 2026" is a substring of the 11th, the 21st
  // and the 31st under Playwright's default matching; the optional suffix is
  // the grid's own ", today" mark.
  await grid
    .getByRole("button", {
      name: new RegExp(
        `^${escapeRegExp(calendarDayLabel(targetIso))}(, today)?$`,
      ),
    })
    .click();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
