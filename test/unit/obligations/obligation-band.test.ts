/**
 * V2.10 LIFE-02 (D10) — the bands the Life Admin collection groups by.
 *
 * The band rule is the one an owner reads as a heading, and the SQL that counts
 * a whole collection has to agree with it exactly. These pin the rule itself;
 * `test/kernel/obligations.test.ts` pins the SQL against it.
 */

import { describe, expect, it } from "vitest";

import {
  OBLIGATION_BANDS,
  obligationBand,
  obligationBandBoundaries,
  obligationBandLabel,
  type ObligationBand,
} from "~/kernel/obligations";

const TODAY = "2026-09-05";

function open(
  overrides: Partial<{
    status: "open" | "completed" | "dismissed" | "on_hold";
    dueDate: string | null;
    leadDays: number;
    meterThreshold: number | null;
  }> = {},
) {
  return {
    status: "open" as const,
    dueDate: null as string | null,
    leadDays: 14,
    meterThreshold: null as number | null,
    ...overrides,
  };
}

describe("obligationBandBoundaries", () => {
  /*
   * A rolling window, not the calendar week: "this week" must say the same
   * thing on a Friday as it does on a Monday, or the heading describes the
   * calendar rather than the owner's horizon.
   */
  it("spans seven days and thirty-one, inclusive of today", () => {
    expect(obligationBandBoundaries(TODAY)).toEqual({
      weekEnd: "2026-09-11",
      monthEnd: "2026-10-05",
    });
  });

  it("crosses a month and a year end without arithmetic of its own", () => {
    expect(obligationBandBoundaries("2026-12-30").weekEnd).toBe("2027-01-05");
    expect(obligationBandBoundaries("2026-02-26").weekEnd).toBe("2026-03-04");
  });
});

describe("obligationBand", () => {
  it("puts a past due date in Overdue, on its own", () => {
    expect(obligationBand(open({ dueDate: "2026-09-04" }), TODAY, null)).toBe(
      "overdue",
    );
    // The distinction the planned grouping would have lost: an obligation
    // overdue since March is not "this week's" news.
    expect(obligationBand(open({ dueDate: "2026-03-01" }), TODAY, null)).toBe(
      "overdue",
    );
  });

  it("bands today, tomorrow and the seventh day as This week", () => {
    for (const due of ["2026-09-05", "2026-09-06", "2026-09-11"]) {
      expect(obligationBand(open({ dueDate: due }), TODAY, null), due).toBe(
        "this_week",
      );
    }
  });

  it("bands the eighth day through the thirty-first as This month", () => {
    expect(obligationBand(open({ dueDate: "2026-09-12" }), TODAY, null)).toBe(
      "this_month",
    );
    expect(obligationBand(open({ dueDate: "2026-10-05" }), TODAY, null)).toBe(
      "this_month",
    );
  });

  it("bands anything further out, and anything undated, as Later", () => {
    expect(obligationBand(open({ dueDate: "2026-10-06" }), TODAY, null)).toBe(
      "later",
    );
    expect(obligationBand(open({ dueDate: "2027-06-01" }), TODAY, null)).toBe(
      "later",
    );
    expect(obligationBand(open({ dueDate: null }), TODAY, null)).toBe("later");
  });

  it("bands a completed obligation as Done whatever its date says", () => {
    expect(
      obligationBand(
        open({ status: "completed", dueDate: "2026-03-01" }),
        TODAY,
        null,
      ),
    ).toBe("done");
  });

  /*
   * Status is a FILTER, not a group (D10). An on-hold obligation the owner has
   * chosen to see bands by its date like any other; it does not get a band of
   * its own and it is not silently pushed to the bottom.
   */
  it("bands a held obligation by its date, not by its status", () => {
    expect(
      obligationBand(
        open({ status: "on_hold", dueDate: "2026-09-08" }),
        TODAY,
        null,
      ),
    ).toBe("this_week");
  });

  /*
   * The trap in banding by date alone: a past date is trivially "before the end
   * of this week", so a held obligation three months late would be printed
   * under This week — the calmest possible way to lose the latest row on the
   * page.
   */
  it("bands a held obligation with a PAST date as Overdue, not This week", () => {
    expect(
      obligationBand(
        open({ status: "on_hold", dueDate: "2026-06-01" }),
        TODAY,
        null,
      ),
    ).toBe("overdue");
    expect(
      obligationBand(
        open({ status: "dismissed", dueDate: "2026-06-01" }),
        TODAY,
        null,
      ),
    ).toBe("overdue");
  });

  /*
   * A meter commitment with no reading cannot be placed on a calendar at all.
   * The evaluator already counts it as needing attention; burying it in Later
   * would hide the one row that needs the owner to go and read a number.
   */
  it("bands a meter obligation awaiting a reading as Overdue", () => {
    expect(obligationBand(open({ meterThreshold: 60_000 }), TODAY, null)).toBe(
      "overdue",
    );
    expect(
      obligationBand(open({ meterThreshold: 60_000 }), TODAY, {
        state: "unknown",
        remaining: null,
        text: "Needs a reading",
      }),
    ).toBe("overdue");
  });

  it("bands a reached meter as Overdue, and one still ahead by its date", () => {
    expect(
      obligationBand(open({ meterThreshold: 60_000 }), TODAY, {
        state: "reached",
        remaining: -500,
        text: "500 km over",
      }),
    ).toBe("overdue");
    expect(
      obligationBand(
        open({ meterThreshold: 60_000, dueDate: "2026-11-30" }),
        TODAY,
        { state: "ahead", remaining: 8_000, text: "8,000 km to go" },
      ),
    ).toBe("later");
  });
});

describe("obligationBandLabel", () => {
  it("gives every band a heading, and no band is left unnamed", () => {
    const labels = OBLIGATION_BANDS.map((band: ObligationBand) =>
      obligationBandLabel(band),
    );
    expect(labels).toEqual([
      "Overdue",
      "This week",
      "This month",
      "Later",
      "Done",
    ]);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
