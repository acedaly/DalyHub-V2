/**
 * ASSET-02 — what is Asset-SPECIFIC about an obligation.
 *
 * V2.10 LIFE-00 moved the general domain to `~/kernel/obligations`, and its
 * tests moved with it (`test/unit/obligations/obligation.test.ts`). What is
 * proven here is the part that genuinely is about an Asset: the meter — why a
 * meter obligation with no reading is never called overdue, and that two units
 * are never silently converted — how the meter side and the date side resolve
 * "whichever comes first" through the ONE shared evaluator, and the two bridges
 * that map a category to the Asset fact it advances and the history entry it
 * files under.
 */

import { describe, expect, it } from "vitest";

import {
  AssetValidationError,
  costGroupForCategory,
  canonicalFactForCategory,
  completionEventCategory,
  evaluateAssetObligation as evaluateObligation,
  evaluateMeterThreshold,
  formatMeterReading,
  isAssetMeterUnit,
  nextMeterThreshold,
  validateMeterUnit,
  validateMeterValue,
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
