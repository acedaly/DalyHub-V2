/**
 * DEBT-52 — the kernel has ONE calendar-day arithmetic, and this holds it there.
 *
 * Two halves, and the second is the one the debt entry was actually about:
 *
 *   1. The primitive behaves the way every copy it replaced behaved — including
 *      the two deliberately different parse contracts (throwing vs. nullable
 *      round-tripping), which is why a single "just validate it" implementation
 *      could not have replaced them.
 *   2. A RATCHET over `app/kernel`'s own source: the day-millisecond constant
 *      may appear in exactly one module. That is the closing condition stated as
 *      a test rather than as a `grep` a future reader has to remember to run —
 *      writing a ninth private `epochDay` now fails CI at the moment it is
 *      written, which is the only thing that stops the count climbing again.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  addCalendarDays,
  calendarDateFromEpochDay,
  calendarDateFromParts,
  calendarDaysBetween,
  calendarEpochDay,
  calendarWeekday,
  daysInCalendarMonth,
  isCalendarDate,
  tryCalendarEpochDay,
} from "~/kernel/datetime";

describe("the kernel's calendar-day arithmetic", () => {
  it("moves a date along the calendar without touching a timezone", () => {
    expect(addCalendarDays("2026-08-24", 1)).toBe("2026-08-25");
    expect(addCalendarDays("2026-08-24", -1)).toBe("2026-08-23");
    expect(addCalendarDays("2026-08-24", 0)).toBe("2026-08-24");
    // Month, year and leap-day boundaries — the cases a local-time `Date`
    // mutated through `setDate` gets wrong for half the planet.
    expect(addCalendarDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addCalendarDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addCalendarDays("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("is DST-free: a spring-forward day is still exactly one day", () => {
    /*
     * The whole reason this is integer arithmetic at a UTC anchor. In
     * Australia/Sydney the clocks move on 2026-10-04 and in America/New_York on
     * 2026-03-08; a local-time implementation returns the same day or skips one.
     */
    expect(addCalendarDays("2026-10-03", 1)).toBe("2026-10-04");
    expect(addCalendarDays("2026-10-04", 1)).toBe("2026-10-05");
    expect(calendarDaysBetween("2026-10-03", "2026-10-05")).toBe(2);
    expect(calendarDaysBetween("2026-03-07", "2026-03-09")).toBe(2);
  });

  it("counts days in both directions, and zero on the same day", () => {
    expect(calendarDaysBetween("2026-08-24", "2026-08-31")).toBe(7);
    expect(calendarDaysBetween("2026-08-31", "2026-08-24")).toBe(-7);
    expect(calendarDaysBetween("2026-08-24", "2026-08-24")).toBe(0);
    expect(calendarDaysBetween("2026-12-31", "2027-01-01")).toBe(1);
  });

  it("names the weekday with Sunday as zero", () => {
    // 1970-01-01 was a Thursday; the arithmetic is anchored on that.
    expect(calendarWeekday("1970-01-01")).toBe(4);
    expect(calendarWeekday("2026-08-23")).toBe(0); // Sunday
    expect(calendarWeekday("2026-08-24")).toBe(1); // Monday
    expect(calendarWeekday("2026-08-29")).toBe(6); // Saturday
  });

  it("publishes BOTH parse contracts, because the kernel genuinely needs two", () => {
    /*
     * The throwing one is for values the kernel itself produced — a malformed
     * one is a programming error and must be loud. It checks the SHAPE only,
     * which is what every evaluator's private copy did.
     */
    expect(calendarEpochDay("1970-01-01")).toBe(0);
    expect(() => calendarEpochDay("24/08/2026")).toThrow(RangeError);
    expect(() => calendarEpochDay("2026-08-24T00:00:00Z")).toThrow(RangeError);
    expect(calendarEpochDay("2026-02-31")).toBe(calendarEpochDay("2026-03-03"));

    /*
     * The nullable one additionally ROUND-TRIPS, which is what the surfaces
     * reading a URL need: `2026-02-31` must be refused rather than silently
     * becoming 3 March.
     */
    expect(tryCalendarEpochDay("2026-08-24")).toBe(
      calendarEpochDay("2026-08-24"),
    );
    expect(tryCalendarEpochDay("2026-02-31")).toBeNull();
    expect(tryCalendarEpochDay("2026-13-01")).toBeNull();
    expect(tryCalendarEpochDay("nonsense")).toBeNull();

    expect(isCalendarDate("2026-08-24")).toBe(true);
    expect(isCalendarDate("2026-02-31")).toBe(false);
    expect(isCalendarDate(20260824)).toBe(false);
    expect(isCalendarDate(null)).toBe(false);
  });

  it("round-trips an epoch day and builds a date from parts", () => {
    expect(calendarDateFromEpochDay(0)).toBe("1970-01-01");
    expect(calendarDateFromEpochDay(calendarEpochDay("2026-08-24"))).toBe(
      "2026-08-24",
    );
    expect(calendarDateFromParts(2026, 8, 24)).toBe("2026-08-24");
    expect(daysInCalendarMonth(2026, 2)).toBe(28);
    expect(daysInCalendarMonth(2028, 2)).toBe(29);
    expect(daysInCalendarMonth(2026, 8)).toBe(31);
  });
});

/* -------------------------------------------------------------------------- */
/* The ratchet                                                                 */
/* -------------------------------------------------------------------------- */

const KERNEL_ROOT = join(process.cwd(), "app", "kernel");

/** The one module allowed to do day arithmetic, relative to `app/kernel/`. */
const AUTHORITY = "datetime/calendar-day.ts";

/** Strip line and block comments so prose about the constant does not count. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("the kernel does not grow a ninth copy of day arithmetic", () => {
  it("computes days from milliseconds in exactly one module", () => {
    const files = readdirSync(KERNEL_ROOT, { recursive: true })
      .map((entry) => String(entry).split("\\").join("/"))
      .filter((file) => file.endsWith(".ts"))
      .sort();
    expect(files.length).toBeGreaterThan(50);

    const offenders = files.filter((file) =>
      /86_?400_?000/.test(
        stripComments(readFileSync(join(KERNEL_ROOT, file), "utf8")),
      ),
    );

    expect(
      offenders,
      `Day arithmetic belongs to \`~/kernel/datetime\` and nowhere else ` +
        `(DEBT-52). Import \`addCalendarDays\` / \`calendarDaysBetween\` / ` +
        `\`calendarWeekday\` instead of re-deriving them:\n${offenders.join("\n")}`,
    ).toEqual([AUTHORITY]);
  });
});
