/**
 * PLAN-01 — the PLANNING WEEK (pure, React-free, clock-free, storage-free).
 *
 * Weekly Planning answers a different question from Today ("what do I do now?")
 * and from a Review ("what happened?"): *what am I committing to this week, and on
 * which days?* Answering it needs exactly one thing this module owns — a week with
 * explicit, owner-local boundaries — and nothing else.
 *
 * ── One definition of "the planning week" ───────────────────────────────────
 * DalyHub had two week conventions before this item, and they were not in
 * conflict because they answer different questions:
 *
 *   1. **The owner's calendar week.** `firstDayOfWeek` (`monday` | `sunday`,
 *      default `monday`) is a real, shipped preference, and `weeklyPeriod` in
 *      `~/kernel/reviews` already resolves a weekly Review's period from it.
 *   2. **The rolling seven-day window.** `weekWindowEnd` in `~/kernel/tasks`
 *      (`today … today + 6`) backs the `due_this_week` / `planned_this_week`
 *      derived states. It is deliberately preference-free: "due this week" there
 *      means "within the next week", not "before Sunday".
 *
 * Planning uses **(1)**, the owner's calendar week, for one reason: it is the
 * period a weekly Review covers, and PLAN-01's whole premise is REVIEW → PLAN.
 * A planner whose "next week" started on a different day from the Review that
 * handed it over would be lying to the owner. The rolling window is untouched —
 * it is not a competing definition of this week, it is a different question, and
 * the two are now stated together here so the next reader does not have to
 * rediscover it. See `docs/design/PLAN_01_SMART_01_WEEKLY_PLANNING_2026_08.md`.
 *
 * ── Dates are dates ─────────────────────────────────────────────────────────
 * Every value is a wall-calendar `YYYY-MM-DD`, stepped as an integer number of
 * days and formatted from a NOON UTC instant, so no label can shift by a
 * timezone and DST cannot move a day (ADR-022 §22.7). The owner's calendar day
 * is always an ARGUMENT — this module never reads a clock.
 */

import type { FirstDayOfWeek } from "~/kernel/preferences";

/** Seven days, because a week is seven days. */
export const PLANNING_WEEK_DAYS = 7;

/**
 * How far the shown week sits from the owner's current week, in weeks.
 *
 * Bounded on purpose. Planning is an operational surface for *this* week and
 * *next*; it is not a calendar application (CAL-01 §21, §45), and an unbounded
 * offset would turn the week header into an infinite scroller with no reason to
 * stop. One week back is enough to finish placing work that slipped.
 */
export const PLANNING_WEEK_MIN_OFFSET = -1;
export const PLANNING_WEEK_MAX_OFFSET = 1;

/** Parse `YYYY-MM-DD` to a UTC day number, or null when it is not a date. */
function epochDay(iso: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (match === null) return null;
  const utc = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  if (Number.isNaN(utc)) return null;
  // Reject a value whose components do not round-trip (2026-02-31), so a
  // hand-typed URL cannot silently become a different day.
  const round = new Date(utc).toISOString().slice(0, 10);
  return round === iso ? Math.round(utc / 86_400_000) : null;
}

/** Add whole days to a date-only value. Returns the input when it is not a date. */
export function addPlanningDays(iso: string, days: number): string {
  const day = epochDay(iso);
  if (day === null) return iso;
  return new Date((day + days) * 86_400_000).toISOString().slice(0, 10);
}

/** True when `iso` is a real wall-calendar date. */
export function isPlanningDate(iso: unknown): iso is string {
  return typeof iso === "string" && epochDay(iso) !== null;
}

/**
 * The first day of the owner's calendar week containing `dateIso`.
 *
 * Epoch day 0 (1970-01-01) was a Thursday, so `(day + 4) mod 7` is the
 * zero-based weekday with Sunday as 0. Integer arithmetic on a day number,
 * never a `Date` mutated through `setDate`.
 */
export function planningWeekStart(
  dateIso: string,
  firstDayOfWeek: FirstDayOfWeek,
): string {
  const day = epochDay(dateIso);
  if (day === null) return dateIso;
  const weekday = (((day + 4) % 7) + 7) % 7;
  const startIndex = firstDayOfWeek === "sunday" ? 0 : 1;
  const delta = (weekday - startIndex + 7) % 7;
  return addPlanningDays(dateIso, -delta);
}

/** One day of the planning week. JSON-safe: a loader hands these to the screen. */
export interface PlanningDay {
  readonly dateIso: string;
  /** "Mon" — the day rail's own row. */
  readonly weekdayShort: string;
  /** "Monday" — the column/section heading. */
  readonly weekdayLong: string;
  /** "12" — the date, as the rail prints it. */
  readonly dayNumber: string;
  /** "Monday 12 May" — the accessible name of any control naming this day. */
  readonly fullLabel: string;
  /** True for the owner's actual today, never for a merely selected day. */
  readonly isToday: boolean;
  /** True for a date already past — a day the owner can no longer plan into. */
  readonly isPast: boolean;
  /** True for Saturday/Sunday, so the week can breathe without colour alone. */
  readonly isWeekend: boolean;
}

/** A planning week: its boundaries, its label and its seven days. */
export interface PlanningWeek {
  /** The first day, `YYYY-MM-DD` (inclusive). */
  readonly startIso: string;
  /** The last day, `YYYY-MM-DD` (inclusive). */
  readonly endIso: string;
  /** How many weeks from the owner's current week (-1, 0 or 1). */
  readonly offset: number;
  /** "This week" / "Next week" / "Last week" — what the owner calls it. */
  readonly relativeLabel: string;
  /** "12–18 May 2026" — the explicit range, never only a relative word. */
  readonly rangeLabel: string;
  readonly days: readonly PlanningDay[];
  /** The previous/next offsets, or null at the bounded edges. */
  readonly previousOffset: number | null;
  readonly nextOffset: number | null;
}

/** A label formatted from the DATE at noon UTC, so no timezone can move it. */
function formatDate(
  dateIso: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat("en-AU", {
    ...options,
    timeZone: "UTC",
  }).format(new Date(`${dateIso}T12:00:00Z`));
}

const MONTH_LONG = [
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
];

/**
 * "12–18 May 2026", "28 April – 4 May 2026", "28 December 2026 – 3 January 2027".
 *
 * The month and the year are printed once when the week does not cross them and
 * twice when it does, because a week that crosses a boundary genuinely has two
 * months in it and printing only the first mislabels the days underneath.
 */
export function planningWeekRangeLabel(
  startIso: string,
  endIso: string,
): string {
  const [sy, sm, sd] = startIso.split("-").map(Number);
  const [ey, em, ed] = endIso.split("-").map(Number);
  if (sy !== ey) {
    return `${sd} ${MONTH_LONG[sm - 1]} ${sy} – ${ed} ${MONTH_LONG[em - 1]} ${ey}`;
  }
  if (sm !== em) {
    return `${sd} ${MONTH_LONG[sm - 1]} – ${ed} ${MONTH_LONG[em - 1]} ${ey}`;
  }
  return `${sd}–${ed} ${MONTH_LONG[sm - 1]} ${ey}`;
}

/** Clamp an untrusted week offset into the bounded planning range. */
export function clampPlanningOffset(value: unknown): number {
  const raw =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^-?\d+$/.test(value.trim())
        ? Number(value.trim())
        : 0;
  if (!Number.isFinite(raw)) return 0;
  return Math.min(
    PLANNING_WEEK_MAX_OFFSET,
    Math.max(PLANNING_WEEK_MIN_OFFSET, Math.trunc(raw)),
  );
}

/**
 * Resolve an untrusted `?week=` value into a bounded offset.
 *
 * The two words the product uses in links — `this` and `next` — are accepted
 * alongside the numeric form, because "Plan next week" is a link a Review draws
 * and `?week=next` is what that link should say.
 */
export function parsePlanningWeekParam(value: string | null): number {
  if (value === null) return 0;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "this" || trimmed === "current") return 0;
  if (trimmed === "next") return 1;
  if (trimmed === "last" || trimmed === "previous") return -1;
  return clampPlanningOffset(trimmed);
}

/**
 * Build the planning week.
 *
 * `todayIso` is the OWNER's calendar day, resolved server-side from their
 * timezone preference (ADR-022) — never a browser clock and never a Worker UTC
 * day. `offset` is clamped, so a hand-typed `?week=99` lands on next week rather
 * than a year away.
 */
export function planningWeek(input: {
  readonly todayIso: string;
  readonly firstDayOfWeek: FirstDayOfWeek;
  readonly offset?: number;
}): PlanningWeek {
  const offset = clampPlanningOffset(input.offset ?? 0);
  const currentStart = planningWeekStart(input.todayIso, input.firstDayOfWeek);
  const startIso = addPlanningDays(currentStart, offset * PLANNING_WEEK_DAYS);
  const endIso = addPlanningDays(startIso, PLANNING_WEEK_DAYS - 1);

  const days: PlanningDay[] = [];
  for (let index = 0; index < PLANNING_WEEK_DAYS; index += 1) {
    const dateIso = addPlanningDays(startIso, index);
    const weekdayShort = formatDate(dateIso, { weekday: "short" });
    days.push({
      dateIso,
      weekdayShort,
      weekdayLong: formatDate(dateIso, { weekday: "long" }),
      dayNumber: formatDate(dateIso, { day: "numeric" }),
      fullLabel: formatDate(dateIso, {
        weekday: "long",
        day: "numeric",
        month: "long",
      }),
      isToday: dateIso === input.todayIso,
      isPast: dateIso < input.todayIso,
      isWeekend: weekdayShort === "Sat" || weekdayShort === "Sun",
    });
  }

  return {
    startIso,
    endIso,
    offset,
    relativeLabel:
      offset === 0 ? "This week" : offset === 1 ? "Next week" : "Last week",
    rangeLabel: planningWeekRangeLabel(startIso, endIso),
    days,
    previousOffset: offset > PLANNING_WEEK_MIN_OFFSET ? offset - 1 : null,
    nextOffset: offset < PLANNING_WEEK_MAX_OFFSET ? offset + 1 : null,
  };
}

/**
 * The day the planner OPENS on inside the shown week — the day a phone's day
 * rail selects and a desktop scrolls to.
 *
 * Today when today is inside the week (the owner is planning around where they
 * already are), otherwise the week's first day. Never a day outside the week,
 * because every day control in the surface addresses a day the loader fetched.
 */
export function defaultPlanningDay(
  week: PlanningWeek,
  todayIso: string,
): string {
  return todayIso >= week.startIso && todayIso <= week.endIso
    ? todayIso
    : week.startIso;
}

/** Narrow an untrusted `?day=` value to a day INSIDE the shown week. */
export function resolvePlanningDay(
  week: PlanningWeek,
  todayIso: string,
  requested: string | null,
): string {
  if (
    requested !== null &&
    isPlanningDate(requested) &&
    requested >= week.startIso &&
    requested <= week.endIso
  ) {
    return requested;
  }
  return defaultPlanningDay(week, todayIso);
}
