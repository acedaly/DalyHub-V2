import { describe, expect, it } from "vitest";

import {
  allowedGrains,
  DEFAULT_INSIGHT_WINDOW,
  GRAIN_NOUNS,
  INSIGHT_GRAINS,
  INSIGHT_WINDOWS,
  insightWindow,
  insightWindowDays,
  parseInsightWindow,
  resolveInsightGrain,
} from "~/kernel/analytics";

/**
 * V2.9 INS-03 — the window and grain vocabulary Insight offers.
 *
 * The rule these tests exist for: **a control refuses a grain its series cannot
 * hold, rather than truncating silently and presenting the result as exact.**
 * The offer is computed from `GRAIN_MAXIMUMS`, so it cannot drift from the
 * bound the history kernel would apply.
 */

const TODAY = "2026-09-04";

describe("the six windows", () => {
  it("offers exactly the roadmap's list, and defaults to twelve weeks", () => {
    expect(INSIGHT_WINDOWS.map((window) => window.id)).toEqual([
      "this-week",
      "4-weeks",
      "12-weeks",
      "6-months",
      "12-months",
      "24-months",
    ]);
    expect(DEFAULT_INSIGHT_WINDOW).toBe("12-weeks");
  });

  it("narrows an untrusted value, falling back rather than throwing", () => {
    expect(parseInsightWindow("6-months")).toBe("6-months");
    expect(parseInsightWindow("quarter")).toBe(DEFAULT_INSIGHT_WINDOW);
    expect(parseInsightWindow(null)).toBe(DEFAULT_INSIGHT_WINDOW);
    expect(parseInsightWindow("")).toBe(DEFAULT_INSIGHT_WINDOW);
  });

  it("ends every window on the owner's today, so no unhappened day is counted", () => {
    for (const window of INSIGHT_WINDOWS) {
      expect(insightWindowDays(window.id, TODAY).endIso).toBe(TODAY);
    }
  });

  it("counts day-spans inclusively and month-spans by calendar month", () => {
    expect(insightWindowDays("this-week", TODAY)).toEqual({
      startIso: "2026-08-29",
      endIso: "2026-09-04",
    });
    expect(insightWindowDays("12-weeks", TODAY)).toEqual({
      startIso: "2026-06-13",
      endIso: "2026-09-04",
    });
    // Six whole months, with no boundary day counted twice: 5 March → 4 Sep.
    expect(insightWindowDays("6-months", TODAY)).toEqual({
      startIso: "2026-03-05",
      endIso: "2026-09-04",
    });
    expect(insightWindowDays("24-months", TODAY)).toEqual({
      startIso: "2024-09-05",
      endIso: "2026-09-04",
    });
  });
});

describe("a grain is offered only when the series can hold it", () => {
  it("offers days and months for a year, but NOT weeks — 365 days needs 53 week buckets", () => {
    // The arithmetic that a hard-coded table would have got wrong: a year is
    // 52.14 weeks, so a weekly series over it needs 53 buckets against the
    // 52-week maximum. Computing the offer from `requestedBucketCount` means
    // the control cannot offer a grain the series would then have to bound.
    expect(allowedGrains("12-months", TODAY)).toEqual(["day", "month"]);
  });

  it("offers months ALONE for two years — the refusal, not a truncation", () => {
    // 730 days exceeds the 366-day maximum and 105 weeks exceeds the 52-week
    // one, so neither is offered. A control that offered them would have to
    // shorten the window behind the owner's back and call it "24 months".
    expect(allowedGrains("24-months", TODAY)).toEqual(["month"]);
  });

  it("offers every grain for the short windows", () => {
    expect(allowedGrains("this-week", TODAY)).toEqual(["day", "week", "month"]);
    expect(allowedGrains("12-weeks", TODAY)).toEqual(["day", "week", "month"]);
  });

  it("is never empty, whatever the window", () => {
    for (const window of INSIGHT_WINDOWS) {
      expect(allowedGrains(window.id, TODAY).length).toBeGreaterThan(0);
    }
  });

  it("only ever offers the three calendar grains — review_period is the Review's", () => {
    for (const window of INSIGHT_WINDOWS) {
      for (const grain of allowedGrains(window.id, TODAY)) {
        expect(INSIGHT_GRAINS).toContain(grain);
      }
    }
    expect(INSIGHT_GRAINS).not.toContain("review_period");
  });
});

describe("resolving the grain the owner asked for", () => {
  it("honours a grain the window can hold", () => {
    expect(resolveInsightGrain("12-weeks", "day", TODAY)).toBe("day");
    expect(resolveInsightGrain("12-weeks", "month", TODAY)).toBe("month");
  });

  it("falls back to the window's default rather than truncating an out-of-range grain", () => {
    // Asking for daily bars over two years is asking for 730 buckets against a
    // 366 maximum. The window's own default answers instead, and the surface
    // states which grain it is showing.
    expect(resolveInsightGrain("24-months", "day", TODAY)).toBe("month");
    expect(resolveInsightGrain("24-months", "week", TODAY)).toBe("month");
  });

  it("falls back for an unrecognised or absent value", () => {
    expect(resolveInsightGrain("12-weeks", "fortnight", TODAY)).toBe("week");
    expect(resolveInsightGrain("12-weeks", null, TODAY)).toBe("week");
    expect(resolveInsightGrain("this-week", null, TODAY)).toBe("day");
    expect(resolveInsightGrain("12-months", null, TODAY)).toBe("month");
  });

  it("gives every window a default its own offer contains", () => {
    for (const window of INSIGHT_WINDOWS) {
      expect(allowedGrains(window.id, TODAY)).toContain(
        insightWindow(window.id).defaultGrain,
      );
    }
  });
});

describe("the words a bucket is named with", () => {
  it("names every grain, including the Review period", () => {
    expect(GRAIN_NOUNS).toEqual({
      day: "day",
      week: "week",
      month: "month",
      review_period: "Review",
    });
  });
});
