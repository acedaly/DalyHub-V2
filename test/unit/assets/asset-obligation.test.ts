/**
 * ASSET-02 — the pure obligation, meter and recurrence domain rules.
 *
 * These cover the decisions the whole feature rests on, in isolation from storage
 * and React: what "overdue" means, why a meter obligation with no reading is
 * never called overdue, that two units are never silently converted, how a
 * recurrence advances from the day the work was ACTUALLY done, and how a
 * date-and-meter obligation resolves "whichever comes first".
 */

import { describe, expect, it } from "vitest";

import {
  addDays,
  addMonths,
  daysBetween,
  describeRecurrence,
  evaluateMeterThreshold,
  evaluateObligation,
  formatMeterReading,
  isAssetMeterUnit,
  isIsoDate,
  nextMeterThreshold,
  nextObligationDate,
  validateMeterUnit,
  validateMeterValue,
  AssetValidationError,
  canonicalFactForCategory,
  completionEventCategory,
  costGroupForCategory,
  type AssetObligation,
} from "~/kernel/assets";

const TODAY = "2026-07-01";

/** A minimal open obligation for the evaluator. */
function obligation(
  overrides: Partial<
    Pick<
      AssetObligation,
      "status" | "dueDate" | "leadDays" | "meterThreshold" | "meterUnit"
    >
  > = {},
) {
  return {
    status: "open" as const,
    dueDate: null,
    leadDays: 14,
    meterThreshold: null,
    meterUnit: null,
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* Calendar arithmetic                                                        */
/* -------------------------------------------------------------------------- */

describe("calendar arithmetic", () => {
  it("validates real calendar dates and rejects impossible ones", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("not-a-date")).toBe(false);
  });

  it("adds days and months, clamping into short months", () => {
    expect(addDays("2026-07-01", 30)).toBe("2026-07-31");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    // 31 January + 1 month is 28 February, not 3 March.
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-07-15", 6)).toBe("2027-01-15");
    expect(addMonths("2026-07-15", 12)).toBe("2027-07-15");
  });

  it("counts whole days between calendar dates, signed", () => {
    expect(daysBetween("2026-07-01", "2026-07-15")).toBe(14);
    expect(daysBetween("2026-07-15", "2026-07-01")).toBe(-14);
    expect(daysBetween("2026-07-01", "2026-07-01")).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Recurrence                                                                 */
/* -------------------------------------------------------------------------- */

describe("nextObligationDate", () => {
  it("advances by days, weeks, months and years", () => {
    expect(nextObligationDate("2026-07-01", "days", 10)).toBe("2026-07-11");
    expect(nextObligationDate("2026-07-01", "weeks", 2)).toBe("2026-07-15");
    expect(nextObligationDate("2026-07-01", "months", 6)).toBe("2027-01-01");
    expect(nextObligationDate("2026-07-01", "years", 1)).toBe("2027-07-01");
  });

  it("returns null for a one-off or a meter-only rule", () => {
    expect(nextObligationDate("2026-07-01", "none", null)).toBeNull();
    expect(nextObligationDate("2026-07-01", "meter", null)).toBeNull();
  });

  it("rejects an interval that could never advance, or is absurd", () => {
    expect(() => nextObligationDate("2026-07-01", "months", 0)).toThrow(
      AssetValidationError,
    );
    expect(() => nextObligationDate("2026-07-01", "months", 1000)).toThrow(
      AssetValidationError,
    );
    expect(() => nextObligationDate("2026-07-01", "days", -1)).toThrow(
      AssetValidationError,
    );
  });

  it("rejects an anchor that is not a real date", () => {
    expect(() => nextObligationDate("2026-02-30", "months", 1)).toThrow(
      AssetValidationError,
    );
  });

  it("describes a rule in plain words", () => {
    expect(describeRecurrence("none", null, null, null)).toBe(
      "Does not repeat",
    );
    expect(describeRecurrence("months", 6, null, null)).toBe("Every 6 months");
    expect(describeRecurrence("years", 1, null, null)).toBe("Every year");
    expect(describeRecurrence("meter", null, 10_000, "km")).toBe(
      "Every 10,000 km",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Meters                                                                     */
/* -------------------------------------------------------------------------- */

describe("meter validation", () => {
  it("accepts the five units and rejects anything else", () => {
    for (const unit of ["km", "mi", "hours", "cycles", "count"]) {
      expect(isAssetMeterUnit(unit)).toBe(true);
      expect(validateMeterUnit(unit)).toBe(unit);
    }
    expect(isAssetMeterUnit("furlongs")).toBe(false);
    expect(() => validateMeterUnit("furlongs")).toThrow(AssetValidationError);
  });

  it("accepts the separators a person actually types", () => {
    expect(validateMeterValue("12,340")).toBe(12_340);
    expect(validateMeterValue("12 340")).toBe(12_340);
    expect(validateMeterValue(60_000)).toBe(60_000);
  });

  it("rejects a negative reading — an odometer does not run backwards", () => {
    expect(() => validateMeterValue(-1)).toThrow(AssetValidationError);
    expect(() => validateMeterValue("-1")).toThrow(AssetValidationError);
  });

  it("rejects a non-integer, a non-number and an absurd reading", () => {
    expect(() => validateMeterValue(1.5)).toThrow(AssetValidationError);
    expect(() => validateMeterValue("abc")).toThrow(AssetValidationError);
    expect(() => validateMeterValue(999_999_999)).toThrow(AssetValidationError);
  });

  it("formats a reading, and reports the absence of one honestly", () => {
    expect(formatMeterReading(12_340, "km")).toBe("12,340 km");
    expect(formatMeterReading(200, "hours")).toBe("200 hrs");
    // Null, not "0 km" — a missing reading is not a measurement of zero.
    expect(formatMeterReading(null, "km")).toBeNull();
  });
});

describe("evaluateMeterThreshold", () => {
  it("says 'reading needed' rather than overdue when there is no reading", () => {
    const result = evaluateMeterThreshold(
      { threshold: 60_000, unit: "km" },
      null,
    );
    expect(result.state).toBe("unknown");
    expect(result.remaining).toBeNull();
    expect(result.text).toBe("Current meter reading needed");
  });

  it("refuses to compare incompatible units rather than converting", () => {
    const result = evaluateMeterThreshold(
      { threshold: 60_000, unit: "km" },
      { value: 40_000, unit: "mi" },
    );
    expect(result.state).toBe("incompatible");
    expect(result.remaining).toBeNull();
  });

  it("reports reached, approaching and ahead with the distance in words", () => {
    const reached = evaluateMeterThreshold(
      { threshold: 60_000, unit: "km" },
      { value: 60_500, unit: "km" },
    );
    expect(reached.state).toBe("reached");
    expect(reached.remaining).toBe(-500);
    expect(reached.text).toBe("Overdue by 500 km");

    const approaching = evaluateMeterThreshold(
      { threshold: 60_000, unit: "km" },
      { value: 59_800, unit: "km" },
    );
    expect(approaching.state).toBe("approaching");
    expect(approaching.text).toBe("Due in 200 km");

    const ahead = evaluateMeterThreshold(
      { threshold: 60_000, unit: "km" },
      { value: 40_000, unit: "km" },
    );
    expect(ahead.state).toBe("ahead");
    expect(ahead.remaining).toBe(20_000);
  });

  it("treats exactly reaching the threshold as due, not overdue-by-zero", () => {
    const result = evaluateMeterThreshold(
      { threshold: 60_000, unit: "km" },
      { value: 60_000, unit: "km" },
    );
    expect(result.state).toBe("reached");
    expect(result.text).toBe("Due now at 60,000 km");
  });

  it("advances the next threshold from the reading the work was done at", () => {
    // 400 km late does not permanently pull the schedule 400 km early.
    expect(nextMeterThreshold(60_400, 10_000)).toBe(70_400);
  });
});

/* -------------------------------------------------------------------------- */
/* Obligation state                                                           */
/* -------------------------------------------------------------------------- */

describe("evaluateObligation — date-based", () => {
  it("is upcoming outside the lead window", () => {
    const result = evaluateObligation(
      obligation({ dueDate: "2026-09-30", leadDays: 14 }),
      TODAY,
      null,
    );
    expect(result.state).toBe("upcoming");
    expect(result.needsAttention).toBe(false);
    expect(result.text).toBe("Due 30 September");
  });

  it("becomes due inside the lead window", () => {
    const result = evaluateObligation(
      obligation({ dueDate: "2026-07-10", leadDays: 14 }),
      TODAY,
      null,
    );
    expect(result.state).toBe("due");
    expect(result.needsAttention).toBe(true);
    expect(result.text).toBe("Due in 9 days");
  });

  it("honours a custom lead time in both directions", () => {
    const short = evaluateObligation(
      obligation({ dueDate: "2026-07-20", leadDays: 3 }),
      TODAY,
      null,
    );
    expect(short.state).toBe("upcoming");
    const long = evaluateObligation(
      obligation({ dueDate: "2026-07-20", leadDays: 60 }),
      TODAY,
      null,
    );
    expect(long.state).toBe("due");
  });

  it("reads today and tomorrow in words, not as day counts", () => {
    expect(
      evaluateObligation(obligation({ dueDate: TODAY }), TODAY, null).text,
    ).toBe("Due today");
    expect(
      evaluateObligation(obligation({ dueDate: "2026-07-02" }), TODAY, null)
        .text,
    ).toBe("Due tomorrow");
  });

  it("is overdue in the past, and says by how much", () => {
    const oneDay = evaluateObligation(
      obligation({ dueDate: "2026-06-30" }),
      TODAY,
      null,
    );
    expect(oneDay.state).toBe("overdue");
    expect(oneDay.text).toBe("Overdue by 1 day");

    const longer = evaluateObligation(
      obligation({ dueDate: "2026-06-01" }),
      TODAY,
      null,
    );
    expect(longer.text).toBe("Overdue by 30 days");
  });
});

describe("evaluateObligation — meter-based", () => {
  it("is unknown, and needs attention, with no reading", () => {
    const result = evaluateObligation(
      obligation({ meterThreshold: 60_000, meterUnit: "km" }),
      TODAY,
      null,
    );
    expect(result.state).toBe("unknown");
    // Worth a quiet nudge for a reading — but never called overdue (§5).
    expect(result.needsAttention).toBe(true);
  });

  it("is overdue once the reading passes the threshold", () => {
    const result = evaluateObligation(
      obligation({ meterThreshold: 60_000, meterUnit: "km" }),
      TODAY,
      { value: 60_500, unit: "km" },
    );
    expect(result.state).toBe("overdue");
    expect(result.meterRemaining).toBe(-500);
  });
});

describe("evaluateObligation — both date and meter ('whichever comes first')", () => {
  it("takes the more urgent side", () => {
    // The date is comfortable; the meter has been passed.
    const meterWins = evaluateObligation(
      obligation({
        dueDate: "2027-01-01",
        meterThreshold: 60_000,
        meterUnit: "km",
      }),
      TODAY,
      { value: 61_000, unit: "km" },
    );
    expect(meterWins.state).toBe("overdue");
    expect(meterWins.text).toBe("Overdue by 1,000 km");

    // The meter is comfortable; the date has passed.
    const dateWins = evaluateObligation(
      obligation({
        dueDate: "2026-06-01",
        meterThreshold: 60_000,
        meterUnit: "km",
      }),
      TODAY,
      { value: 40_000, unit: "km" },
    );
    expect(dateWins.state).toBe("overdue");
    expect(dateWins.text).toBe("Overdue by 30 days");
  });

  it("never lets an unknown meter silence a known date", () => {
    const result = evaluateObligation(
      obligation({
        dueDate: "2026-06-01",
        meterThreshold: 60_000,
        meterUnit: "km",
      }),
      TODAY,
      null,
    );
    expect(result.state).toBe("overdue");
    expect(result.text).toContain("Overdue by 30 days");
    // …but it still asks for the reading.
    expect(result.text).toContain("Current meter reading needed");
  });
});

describe("evaluateObligation — the stored lifecycle showing through", () => {
  it("reports completed, dismissed and on hold, and never needs attention", () => {
    for (const [status, label] of [
      ["completed", "Completed"],
      ["dismissed", "Dismissed"],
      ["on_hold", "On hold"],
    ] as const) {
      const result = evaluateObligation(
        obligation({ status, dueDate: "2026-01-01" }),
        TODAY,
        null,
      );
      expect(result.text).toBe(label);
      expect(result.needsAttention).toBe(false);
    }
  });

  it("never reports a completed obligation as overdue, however old", () => {
    const result = evaluateObligation(
      obligation({ status: "completed", dueDate: "2020-01-01" }),
      TODAY,
      null,
    );
    expect(result.state).toBe("completed");
  });
});

/* -------------------------------------------------------------------------- */
/* Category mappings                                                          */
/* -------------------------------------------------------------------------- */

describe("category mappings", () => {
  it("maps each obligation category to the canonical fact it advances", () => {
    expect(canonicalFactForCategory("registration")).toBe("renewalDate");
    expect(canonicalFactForCategory("insurance")).toBe("renewalDate");
    expect(canonicalFactForCategory("warranty")).toBe("warrantyExpiry");
    expect(canonicalFactForCategory("service")).toBe("nextServiceDate");
    // A custom reminder has no canonical home, and updates nothing.
    expect(canonicalFactForCategory("reminder")).toBeNull();
    expect(canonicalFactForCategory("replacement")).toBeNull();
  });

  it("files a completion in the right history category", () => {
    expect(completionEventCategory("registration")).toBe("registration");
    expect(completionEventCategory("service")).toBe("service");
    expect(completionEventCategory("inspection")).toBe("inspection");
    expect(completionEventCategory("reminder")).toBe("history");
  });

  it("groups ongoing costs, and excludes the purchase price from them", () => {
    expect(costGroupForCategory("service")).toBe("service");
    expect(costGroupForCategory("repair")).toBe("repair");
    expect(costGroupForCategory("registration")).toBe("renewal");
    expect(costGroupForCategory("modification")).toBe("upgrade");
    // The purchase price is a canonical ownership fact, not a running cost (§15).
    expect(costGroupForCategory("purchase")).toBeNull();
    expect(costGroupForCategory("valuation")).toBeNull();
  });
});
