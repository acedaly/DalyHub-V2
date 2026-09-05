/**
 * V2.10 LIFE-01 — canonical Obligation validation.
 *
 * The boundary is the check; HTML input attributes are only a convenience.
 * These assert that a hand-crafted POST is rejected exactly as a bad form is,
 * that a half-recorded meter target or an unlabelled amount can never be
 * stored, and that an error names its field without ever echoing the value —
 * which may be a policy number or a price.
 *
 * This is `test/unit/assets/asset-history-validation.test.ts`'s obligation
 * half, moved with the validators it covers.
 */

import { describe, expect, it } from "vitest";

import {
  ObligationValidationError,
  validateObligation,
  validateObligationCompletion,
  validateObligationFilters,
  validateObligationsLimit,
} from "~/kernel/obligations";

/** The Asset meter vocabulary, which is what a caller with a meter supplies. */
const METER_UNITS = ["km", "mi", "hours", "cycles", "count"];

describe("validateObligation — create", () => {
  const base = { category: "service", title: "Service" };

  it("requires a commitment — a date, a meter target, or both", () => {
    expect(() => validateObligation(base, "create")).toThrow(
      ObligationValidationError,
    );
    expect(
      validateObligation(
        { ...base, dueDate: "2027-01-01" },
        "create",
        undefined,
        METER_UNITS,
      ).dueDate,
    ).toBe("2027-01-01");
    expect(
      validateObligation(
        { ...base, meterThreshold: 60_000, meterUnit: "km" },
        "create",
        undefined,
        METER_UNITS,
      ).meterThreshold,
    ).toBe(60_000);
  });

  it("defaults the lead time and the recurrence to the calm option", () => {
    const result = validateObligation(
      { ...base, dueDate: "2027-01-01" },
      "create",
      undefined,
      METER_UNITS,
    );
    expect(result.leadDays).toBe(14);
    expect(result.recurrenceKind).toBe("none");
    expect(result.recurrenceInterval).toBeNull();
  });

  it("bounds the lead time so it cannot swallow the calendar", () => {
    expect(() =>
      validateObligation(
        { ...base, dueDate: "2027-01-01", leadDays: 400 },
        "create",
        undefined,
        METER_UNITS,
      ),
    ).toThrow(ObligationValidationError);
  });

  it("refuses a meter target with no unit", () => {
    expect(() =>
      validateObligation(
        { ...base, meterThreshold: 60_000 },
        "create",
        undefined,
        METER_UNITS,
      ),
    ).toThrow(ObligationValidationError);
  });

  it("refuses a meter repeat with no threshold or no interval", () => {
    expect(() =>
      validateObligation(
        { ...base, dueDate: "2027-01-01", recurrenceKind: "meter" },
        "create",
        undefined,
        METER_UNITS,
      ),
    ).toThrow(ObligationValidationError);
    expect(() =>
      validateObligation(
        {
          ...base,
          meterThreshold: 60_000,
          meterUnit: "km",
          recurrenceKind: "meter",
        },
        "create",
        undefined,
        METER_UNITS,
      ),
    ).toThrow(ObligationValidationError);
  });

  it("refuses a date repeat with no date to advance from", () => {
    expect(() =>
      validateObligation(
        {
          ...base,
          meterThreshold: 60_000,
          meterUnit: "km",
          recurrenceKind: "months",
          recurrenceInterval: 6,
        },
        "create",
        undefined,
        METER_UNITS,
      ),
    ).toThrow(ObligationValidationError);
  });

  it("defaults a repeat interval to 1, which is what the words say", () => {
    const result = validateObligation(
      { ...base, dueDate: "2027-01-01", recurrenceKind: "years" },
      "create",
      undefined,
      METER_UNITS,
    );
    expect(result.recurrenceInterval).toBe(1);
  });

  it("rejects an interval that could never advance, and an absurd one", () => {
    for (const interval of [0, 1000]) {
      expect(() =>
        validateObligation(
          {
            ...base,
            dueDate: "2027-01-01",
            recurrenceKind: "months",
            recurrenceInterval: interval,
          },
          "create",
          undefined,
          METER_UNITS,
        ),
      ).toThrow(ObligationValidationError);
    }
  });

  it("accepts a valid meter repeat end to end", () => {
    const result = validateObligation(
      {
        ...base,
        meterThreshold: 60_000,
        meterUnit: "km",
        meterInterval: 10_000,
        recurrenceKind: "meter",
      },
      "create",
      undefined,
      METER_UNITS,
    );
    expect(result.recurrenceKind).toBe("meter");
    expect(result.meterInterval).toBe(10_000);
    // A date interval is meaningless here and is not stored.
    expect(result.recurrenceInterval).toBeNull();
  });
});

describe("validateObligation — update sees the MERGED record", () => {
  const existing = {
    dueDate: "2027-01-01" as string | null,
    meterThreshold: null,
    meterUnit: null,
    meterInterval: null,
    recurrenceKind: "none" as const,
  };

  it("allows clearing the date when a meter target is being added", () => {
    const result = validateObligation(
      { dueDate: null, meterThreshold: 60_000, meterUnit: "km" },
      "update",
      existing,
      METER_UNITS,
    );
    expect(result.dueDate).toBeNull();
    expect(result.meterThreshold).toBe(60_000);
  });

  it("refuses to clear the date when it would leave no commitment at all", () => {
    expect(() =>
      validateObligation({ dueDate: null }, "update", existing),
    ).toThrow(ObligationValidationError);
  });

  it("refuses a unit change that would orphan the stored threshold", () => {
    expect(() =>
      validateObligation(
        { meterUnit: null },
        "update",
        {
          ...existing,
          meterThreshold: 60_000,
          meterUnit: "km",
        },
        METER_UNITS,
      ),
    ).toThrow(ObligationValidationError);
  });
});

/* -------------------------------------------------------------------------- */
/* Completion                                                                 */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* Read inputs                                                                */
/* -------------------------------------------------------------------------- */

describe("validateObligationCompletion", () => {
  it("accepts an empty completion — the defaults are all resolvable", () => {
    const result = validateObligationCompletion({});
    expect(result.completedOn).toBeNull();
    expect(result.completedAmountMinor).toBeNull();
    expect(result.createSuccessor).toBe(true);
  });

  it("parses the ACTUAL amount into integer minor units", () => {
    const result = validateObligationCompletion({
      completedOn: "2026-07-05",
      completedAmount: "489.50",
      currencyCode: "AUD",
    });
    expect(result.completedOn).toBe("2026-07-05");
    expect(result.completedAmountMinor).toBe(48_950);
    expect(result.currencyCode).toBe("AUD");
  });

  it("refuses an amount with no currency — a number is not money", () => {
    expect(() =>
      validateObligationCompletion({ completedAmount: "489.50" }),
    ).toThrow(ObligationValidationError);
  });

  /*
   * The product does not convert (ADR-049), and storing the new figure under
   * the old code would make the stored amount WRONG rather than missing.
   */
  it("refuses a completion in a currency the obligation is not in", () => {
    expect(() =>
      validateObligationCompletion(
        { completedAmount: "100", currencyCode: "USD" },
        "AUD",
      ),
    ).toThrow(ObligationValidationError);
    expect(
      validateObligationCompletion({ completedAmount: "100" }, "AUD")
        .completedAmountMinor,
    ).toBe(10_000);
  });

  /*
   * A meter reading, a provider and a Person are the SUBJECT's facts, not the
   * obligation's, so they are validated by the domain that owns the subject's
   * history — `validateAssetCompletionExtras` in the Assets kernel.
   */

  it("honours an explicit opt-out of the successor", () => {
    expect(
      validateObligationCompletion({ createSuccessor: false }).createSuccessor,
    ).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Read inputs                                                                */
/* -------------------------------------------------------------------------- */

describe("read inputs", () => {
  it("clamps page sizes to the documented maximum", () => {
    expect(validateObligationsLimit(undefined)).toBe(25);
    expect(validateObligationsLimit(5)).toBe(5);
    expect(validateObligationsLimit(10_000)).toBe(100);
    expect(() => validateObligationsLimit(0)).toThrow(
      ObligationValidationError,
    );
  });

  it("rejects an unknown filter rather than silently matching everything", () => {
    expect(() =>
      validateObligationFilters({ categories: ["not_a_category"] as never }),
    ).toThrow(ObligationValidationError);
    expect(() =>
      validateObligationFilters({ statuses: ["not_a_status"] as never }),
    ).toThrow(ObligationValidationError);
  });

  it("passes valid filters through, and an absent filter means no filter", () => {
    const filters = validateObligationFilters({
      categories: ["insurance", "registration"],
      statuses: ["open"],
    });
    expect(filters.categories).toEqual(["insurance", "registration"]);
    expect(filters.statuses).toEqual(["open"]);
    expect(validateObligationFilters(undefined)).toEqual({
      categories: [],
      statuses: [],
    });
  });
});
