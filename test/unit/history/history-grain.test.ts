import { describe, expect, it } from "vitest";

import { buildActivityWindow } from "~/kernel/activity-window";
import {
  bucketPeriods,
  bucketWindow,
  buildSeries,
  GRAIN_MAXIMUMS,
  HISTORY_GRAINS,
  isGrain,
  mapSeries,
  requestedBucketCount,
  sumSeries,
  unavailableSeries,
  type Grain,
} from "~/kernel/history";
import { addCalendarMonths } from "~/kernel/datetime";

/**
 * V2.9 INS-01 — the history kernel's rules, over a fixture whose days are
 * known (the V2.4 rule).
 *
 * Everything here is pure: owner-local midnights arrive through an injected
 * resolver, so a timezone is a value these tests choose rather than an ambient
 * fact they inherit. Two resolvers are used — a fixed +10:00 (Brisbane, which
 * has no DST) and a DST-observing +10:00/+11:00 (Sydney) — because the whole
 * reason the window model exists is that an owner's day is not UTC's.
 */

/** Owner-local midnight for a fixed-offset zone, as a UTC instant. */
function fixedOffset(hours: number) {
  return (dayIso: string): Date =>
    new Date(
      `${dayIso}T00:00:00.000Z`.replace(
        "T00:00:00.000Z",
        `T00:00:00.000${hours >= 0 ? "+" : "-"}${String(Math.abs(hours)).padStart(2, "0")}:00`,
      ),
    );
}

const brisbane = fixedOffset(10);

/**
 * Sydney: +11:00 during southern summer, +10:00 otherwise, resolved for the
 * offset in force at MIDNIGHT on each day.
 *
 * The 2026 changeovers happen in the small hours — DST ends at 3am on 5 April
 * and begins at 2am on 4 October — so midnight on 5 April is still +11:00 and
 * midnight on 4 October is still +10:00. Getting that right is the point of the
 * test below: it is what makes the owner's 5 April genuinely 25 hours long.
 */
function sydney(dayIso: string): Date {
  const summer = dayIso <= "2026-04-05" || dayIso >= "2026-10-05";
  return new Date(`${dayIso}T00:00:00.000${summer ? "+11:00" : "+10:00"}`);
}

function window(startIso: string, endIso: string, startOfOwnerDay = brisbane) {
  return buildActivityWindow({
    periodStart: startIso,
    periodEnd: endIso,
    startOfOwnerDay,
  });
}

/** `[periodStart, periodEnd]` for every bucket, oldest first. */
function days(buckets: readonly { periodStart: string; periodEnd: string }[]) {
  return buckets.map((bucket) => [bucket.periodStart, bucket.periodEnd]);
}

describe("the grain vocabulary", () => {
  it("is exactly four grains, and narrows an untrusted value", () => {
    expect(HISTORY_GRAINS).toEqual(["day", "week", "month", "review_period"]);
    expect(isGrain("week")).toBe(true);
    expect(isGrain("fortnight")).toBe(false);
    expect(isGrain(null)).toBe(false);
    expect(isGrain(7)).toBe(false);
  });

  it("states a maximum for each grain rather than inheriting the Review's eight", () => {
    expect(GRAIN_MAXIMUMS).toEqual({
      day: 366,
      week: 52,
      month: 24,
      review_period: 12,
    });
  });
});

describe("buckets are generated backward from the window's end", () => {
  it("cuts a week of days into seven whole buckets, oldest first", () => {
    const cut = bucketWindow({
      window: window("2026-08-29", "2026-09-04"),
      grain: "day",
      startOfOwnerDay: brisbane,
    });
    expect(cut.buckets).toHaveLength(7);
    expect(cut.buckets[0]).toMatchObject({
      key: "b0",
      periodStart: "2026-08-29",
      periodEnd: "2026-08-29",
    });
    expect(cut.buckets[6]).toMatchObject({
      key: "b6",
      periodStart: "2026-09-04",
      periodEnd: "2026-09-04",
    });
    expect(cut.bounded).toBe(false);
    expect(cut.bound).toBeNull();
  });

  it("makes the MOST RECENT week whole and leaves the remainder at the oldest end", () => {
    // 2026-06-15 → 2026-09-04 is 82 days: eleven whole weeks (77) plus five.
    const cut = bucketWindow({
      window: window("2026-06-15", "2026-09-04"),
      grain: "week",
      startOfOwnerDay: brisbane,
    });
    expect(cut.buckets).toHaveLength(12);
    // The recent end is whole — the rule that stops a chart drawing the current
    // period as a dip every time it is opened mid-week.
    expect(days(cut.buckets).at(-1)).toEqual(["2026-08-29", "2026-09-04"]);
    // The remainder is the OLDEST bucket, clamped to the window: five days, not
    // seven, and visibly so.
    expect(days(cut.buckets)[0]).toEqual(["2026-06-15", "2026-06-19"]);
    expect(days(cut.buckets)[1]).toEqual(["2026-06-20", "2026-06-26"]);
  });

  it("tiles the window with no gap and no overlap, whatever the grain", () => {
    for (const grain of ["day", "week", "month"] as const) {
      const cut = bucketWindow({
        window: window("2025-11-03", "2026-09-04"),
        grain,
        startOfOwnerDay: brisbane,
      });
      for (let index = 1; index < cut.buckets.length; index += 1) {
        const previousEnd = cut.buckets[index - 1].periodEnd;
        const thisStart = cut.buckets[index].periodStart;
        // Contiguous: this bucket starts the day after the last one ended.
        expect(new Date(`${thisStart}T00:00:00Z`).getTime()).toBe(
          new Date(`${previousEnd}T00:00:00Z`).getTime() + 86_400_000,
        );
      }
      expect(cut.buckets.at(-1)!.periodEnd).toBe("2026-09-04");
    }
  });

  it("coincides with calendar weeks exactly when the window ends on a week end — the case a caller who wants Monday-to-Sunday uses", () => {
    // 2026-08-30 is a Sunday. A caller wanting the owner's calendar weeks ends
    // the window there, and gets them; there is no weekStart parameter because
    // aligning to Monday when the window ends mid-week would make the most
    // recent bucket partial, which is the defect the backward rule prevents.
    const cut = bucketWindow({
      window: window("2026-08-03", "2026-08-30"),
      grain: "week",
      startOfOwnerDay: brisbane,
    });
    expect(days(cut.buckets)).toEqual([
      ["2026-08-03", "2026-08-09"],
      ["2026-08-10", "2026-08-16"],
      ["2026-08-17", "2026-08-23"],
      ["2026-08-24", "2026-08-30"],
    ]);
  });

  it("steps months back by calendar month, clamping the day, and stays monotonic over a month end", () => {
    // Ending on a month end gives clean calendar months.
    const clean = bucketWindow({
      window: window("2026-01-01", "2026-03-31"),
      grain: "month",
      startOfOwnerDay: brisbane,
    });
    expect(days(clean.buckets)).toEqual([
      ["2026-01-01", "2026-01-31"],
      ["2026-02-01", "2026-02-28"],
      ["2026-03-01", "2026-03-31"],
    ]);
    // Ending mid-month gives month-long buckets that still tile without gaps.
    const mid = bucketWindow({
      window: window("2026-06-05", "2026-09-04"),
      grain: "month",
      startOfOwnerDay: brisbane,
    });
    expect(days(mid.buckets)).toEqual([
      ["2026-06-05", "2026-07-04"],
      ["2026-07-05", "2026-08-04"],
      ["2026-08-05", "2026-09-04"],
    ]);
  });

  it("handles the leap day: February 2028 is 29 days and 31 March clamps to it", () => {
    expect(addCalendarMonths("2028-03-31", -1)).toBe("2028-02-29");
    expect(addCalendarMonths("2027-03-31", -1)).toBe("2027-02-28");
    expect(addCalendarMonths("2026-01-31", -1)).toBe("2025-12-31");
    expect(addCalendarMonths("2026-01-15", -14)).toBe("2024-11-15");
    const cut = bucketWindow({
      window: window("2028-01-01", "2028-03-31"),
      grain: "month",
      startOfOwnerDay: brisbane,
    });
    expect(days(cut.buckets)).toEqual([
      ["2028-01-01", "2028-01-31"],
      ["2028-02-01", "2028-02-29"],
      ["2028-03-01", "2028-03-31"],
    ]);
  });

  it("gives a one-day window exactly one bucket at every calendar grain", () => {
    for (const grain of ["day", "week", "month"] as const) {
      const cut = bucketWindow({
        window: window("2026-09-04", "2026-09-04"),
        grain,
        startOfOwnerDay: brisbane,
      });
      expect(cut.buckets).toHaveLength(1);
      expect(days(cut.buckets)).toEqual([["2026-09-04", "2026-09-04"]]);
    }
  });
});

describe("instants are the owner's, not UTC's", () => {
  it("puts each bucket's boundary at the owner's local midnight", () => {
    const cut = bucketWindow({
      window: window("2026-09-03", "2026-09-04"),
      grain: "day",
      startOfOwnerDay: brisbane,
    });
    // Brisbane is +10:00, so the owner's 4 September starts at 3 September
    // 14:00 UTC — and a completion at 23:59 on the 4th is inside it, which a
    // naive UTC comparison would put in the following day.
    expect(cut.buckets[1].startInstantIso).toBe("2026-09-03T14:00:00.000Z");
    expect(cut.buckets[1].endInstantIso).toBe("2026-09-04T14:00:00.000Z");
  });

  it("follows a DST transition: buckets either side of the changeover carry different offsets", () => {
    // Sydney goes +11 → +10 on 5 April 2026. The buckets around it must use
    // the offset in force on each day, or an hour of history lands in the
    // wrong bucket once a year.
    const cut = bucketWindow({
      window: window("2026-04-03", "2026-04-06", sydney),
      grain: "day",
      startOfOwnerDay: sydney,
    });
    expect(cut.buckets[0].startInstantIso).toBe("2026-04-02T13:00:00.000Z");
    expect(cut.buckets[2].startInstantIso).toBe("2026-04-04T13:00:00.000Z");
    // Contiguity survives the transition: no gap, no overlap, and the 5th is
    // 25 hours long in instants because the owner's day genuinely was.
    expect(cut.buckets[1].endInstantIso).toBe(cut.buckets[2].startInstantIso);
    const fifth = cut.buckets[2];
    expect(
      new Date(fifth.endInstantIso).getTime() -
        new Date(fifth.startInstantIso).getTime(),
    ).toBe(25 * 3_600_000);
  });

  it("falls back to the UTC reading when a resolver cannot produce an instant", () => {
    // The hour a spring-forward skips. Losing an hour of precision once a year
    // is a far smaller error than dropping the period — `buildActivityWindow`'s
    // recorded choice, inherited here rather than re-decided.
    const cut = bucketWindow({
      window: window("2026-10-03", "2026-10-04"),
      grain: "day",
      startOfOwnerDay: (day) => (day === "2026-10-04" ? null : brisbane(day)),
    });
    expect(cut.buckets[1].startInstantIso).toBe("2026-10-04T00:00:00.000Z");
  });
});

describe("a bound is stated, never silently applied", () => {
  it("keeps the most recent buckets and says what bound it, rather than truncating quietly", () => {
    // Three years of months against a 24-month maximum.
    const cut = bucketWindow({
      window: window("2023-09-05", "2026-09-04"),
      grain: "month",
      startOfOwnerDay: brisbane,
    });
    expect(cut.buckets).toHaveLength(24);
    expect(cut.bounded).toBe(true);
    expect(cut.bound).toBe(24);
    expect(cut.boundReason).toBe("grain_maximum");
    // 36, not 37: the oldest month bucket runs 5 Sep → 4 Oct 2023, so three
    // years less a day is exactly thirty-six month steps.
    expect(cut.requested).toBe(36);
    // The MOST RECENT buckets are the ones kept — a trend is a recent shape.
    expect(cut.buckets.at(-1)!.periodEnd).toBe("2026-09-04");
    // And the window it reports is the one it actually covers, not the one it
    // was asked for: a surface that prints `series.window` cannot overstate.
    expect(cut.window.periodEnd).toBe("2026-09-04");
    expect(cut.window.periodStart).toBe(cut.buckets[0].periodStart);
    expect(cut.window.periodStart).not.toBe("2023-09-05");
  });

  it("bounds days at 366 and weeks at 52", () => {
    const daily = bucketWindow({
      window: window("2024-01-01", "2026-09-04"),
      grain: "day",
      startOfOwnerDay: brisbane,
    });
    expect(daily.buckets).toHaveLength(366);
    expect(daily.bounded).toBe(true);
    expect(daily.bound).toBe(366);

    const weekly = bucketWindow({
      window: window("2024-01-01", "2026-09-04"),
      grain: "week",
      startOfOwnerDay: brisbane,
    });
    expect(weekly.buckets).toHaveLength(52);
    expect(weekly.bounded).toBe(true);
  });

  it("counts what was asked for BEFORE any bucket is built, so a surface can refuse", () => {
    expect(
      requestedBucketCount(window("2026-08-29", "2026-09-04"), "day"),
    ).toBe(7);
    expect(
      requestedBucketCount(window("2026-06-15", "2026-09-04"), "week"),
    ).toBe(12);
    expect(
      requestedBucketCount(window("2026-01-01", "2026-03-31"), "month"),
    ).toBe(3);
    // Over the maximum, reported honestly rather than clamped.
    expect(
      requestedBucketCount(window("2024-01-01", "2026-09-04"), "week"),
    ).toBe(140);
    expect(
      requestedBucketCount(window("2024-01-01", "2026-09-04"), "week"),
    ).toBeGreaterThan(GRAIN_MAXIMUMS.week);
  });

  it("refuses the review_period grain, which no calendar rule can derive", () => {
    expect(() =>
      bucketWindow({
        window: window("2026-06-15", "2026-09-04"),
        grain: "review_period" as Grain,
        startOfOwnerDay: brisbane,
      }),
    ).toThrow(/bucketPeriods/);
  });

  it("refuses a window that is not two wall-calendar days", () => {
    expect(() =>
      bucketWindow({
        window: {
          periodStart: "not-a-day",
          periodEnd: "2026-09-04",
          startInstantIso: "",
          endInstantIso: "",
        },
        grain: "day",
        startOfOwnerDay: brisbane,
      }),
    ).toThrow(TypeError);
  });
});

describe("review-period buckets come from the periods that exist", () => {
  const periods = [
    window("2026-08-24", "2026-08-30"),
    window("2026-08-10", "2026-08-16"),
    window("2026-08-17", "2026-08-23"),
    window("2026-08-03", "2026-08-09"),
  ];

  it("orders them oldest first whatever order they arrive in", () => {
    const cut = bucketPeriods(periods);
    expect(cut.grain).toBe("review_period");
    expect(days(cut.buckets)).toEqual([
      ["2026-08-03", "2026-08-09"],
      ["2026-08-10", "2026-08-16"],
      ["2026-08-17", "2026-08-23"],
      ["2026-08-24", "2026-08-30"],
    ]);
    expect(cut.bounded).toBe(false);
    expect(cut.window.periodStart).toBe("2026-08-03");
    expect(cut.window.periodEnd).toBe("2026-08-30");
  });

  it("keeps the most recent twelve and says it did", () => {
    const many = Array.from({ length: 20 }, (_value, index) =>
      window(
        `2026-0${index < 9 ? "1" : "2"}-${String((index % 28) + 1).padStart(2, "0")}`,
        `2026-0${index < 9 ? "1" : "2"}-${String((index % 28) + 1).padStart(2, "0")}`,
      ),
    );
    const cut = bucketPeriods(many);
    expect(cut.buckets).toHaveLength(12);
    expect(cut.bounded).toBe(true);
    expect(cut.bound).toBe(12);
    expect(cut.requested).toBe(20);
  });

  it("survives an empty series without inventing a window", () => {
    const cut = bucketPeriods([]);
    expect(cut.buckets).toEqual([]);
    expect(cut.bounded).toBe(false);
    expect(cut.window.periodStart).toBe("");
  });
});

describe("a series carries its bound to the surface", () => {
  const cut = bucketWindow({
    window: window("2026-08-29", "2026-09-04"),
    grain: "day",
    startOfOwnerDay: brisbane,
  });

  it("has one point per bucket, each carrying the bucket it was counted over", () => {
    const series = buildSeries(cut, (bucket) =>
      bucket.periodEnd === "2026-09-01" ? 3 : 0,
    );
    expect(series.points).toHaveLength(7);
    expect(series.points[0].bucket.periodStart).toBe("2026-08-29");
    expect(series.points.map((point) => point.value)).toEqual([
      0, 0, 0, 3, 0, 0, 0,
    ]);
    // A quiet bucket is a zero, never an absent point: an absent bucket is
    // indistinguishable from a quiet one.
    expect(
      series.points.every((point) => typeof point.value === "number"),
    ).toBe(true);
  });

  it("carries boundedness through a map, so a derived series cannot lose it", () => {
    const bounded = bucketWindow({
      window: window("2024-01-01", "2026-09-04"),
      grain: "week",
      startOfOwnerDay: brisbane,
    });
    const mapped = mapSeries(
      buildSeries(bounded, () => 1),
      (value) => `${value} completed`,
    );
    expect(mapped.bounded).toBe(true);
    expect(mapped.bound).toBe(52);
    expect(mapped.boundReason).toBe("grain_maximum");
    expect(mapped.points).toHaveLength(52);
    expect(mapped.points[0].value).toBe("1 completed");
  });

  it("says which window it cannot describe rather than drawing an empty one", () => {
    const unavailable = unavailableSeries<number>("week", cut.window);
    expect(unavailable.points).toEqual([]);
    expect(unavailable.grain).toBe("week");
    expect(unavailable.window.periodEnd).toBe("2026-09-04");
  });

  it("sums buckets when asked, and the helper is named for what it does", () => {
    // Deliberately NOT "the range total": a Task completed, reopened and
    // completed again in two buckets is counted in each, so this over-counts
    // against a single-window total. Analytics reads its total as its own
    // window for exactly that reason.
    expect(sumSeries(buildSeries(cut, () => 2))).toBe(14);
  });
});
