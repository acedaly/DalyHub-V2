/**
 * ASSET-02 — canonical event and obligation validation.
 *
 * The boundary is the check; HTML input attributes are only a convenience. These
 * assert that a hand-crafted POST is rejected exactly as a bad form is, that a
 * half-recorded meter reading or an unlabelled amount can never be stored, and
 * that an error names its field without ever echoing the value (which may be a
 * policy number or a price).
 */

import { describe, expect, it } from "vitest";

import {
  AssetValidationError,
  validateAssetEvent,
  validateAssetObligation,
  validateEventFilters,
  validateEventsLimit,
  validateObligationCompletion,
  validateObligationFilters,
  validateObligationsLimit,
} from "~/kernel/assets";

/* -------------------------------------------------------------------------- */
/* Events                                                                     */
/* -------------------------------------------------------------------------- */

describe("validateAssetEvent — create", () => {
  const base = {
    category: "service",
    title: "Service",
    eventDate: "2026-07-01",
  };

  it("accepts the minimum that can work: category, title and date", () => {
    const result = validateAssetEvent(base, "create");
    expect(result.category).toBe("service");
    expect(result.title).toBe("Service");
    expect(result.eventDate).toBe("2026-07-01");
    expect(result.costMinor).toBeNull();
    expect(result.meterValue).toBeNull();
  });

  it("rejects a category outside the closed vocabulary", () => {
    expect(() =>
      validateAssetEvent({ ...base, category: "explosion" }, "create"),
    ).toThrow(AssetValidationError);
  });

  it("rejects a missing or blank title, and a non-date", () => {
    expect(() =>
      validateAssetEvent({ ...base, title: "  " }, "create"),
    ).toThrow(AssetValidationError);
    expect(() =>
      validateAssetEvent({ ...base, eventDate: "2026-02-30" }, "create"),
    ).toThrow(AssetValidationError);
  });

  it("parses money into integer minor units without floats", () => {
    const result = validateAssetEvent(
      { ...base, cost: "489.50", currencyCode: "AUD" },
      "create",
    );
    expect(result.costMinor).toBe(48_950);
    expect(result.currencyCode).toBe("AUD");
  });

  it("never stores an unlabelled amount — a cost always carries a currency", () => {
    const result = validateAssetEvent({ ...base, cost: "100" }, "create");
    expect(result.costMinor).toBe(10_000);
    expect(result.currencyCode).not.toBeNull();
  });

  it("rejects a negative cost and an invalid currency", () => {
    expect(() => validateAssetEvent({ ...base, cost: "-5" }, "create")).toThrow(
      AssetValidationError,
    );
    expect(() =>
      validateAssetEvent({ ...base, currencyCode: "NOPE" }, "create"),
    ).toThrow(AssetValidationError);
  });

  it("refuses half a meter reading, in either direction", () => {
    expect(() =>
      validateAssetEvent({ ...base, meterValue: 60_000 }, "create"),
    ).toThrow(AssetValidationError);
    expect(() =>
      validateAssetEvent({ ...base, meterUnit: "km" }, "create"),
    ).toThrow(AssetValidationError);
  });

  it("accepts a complete meter reading and rejects an unknown unit", () => {
    const result = validateAssetEvent(
      { ...base, meterValue: "61,200", meterUnit: "km" },
      "create",
    );
    expect(result.meterValue).toBe(61_200);
    expect(result.meterUnit).toBe("km");
    expect(() =>
      validateAssetEvent(
        { ...base, meterValue: 100, meterUnit: "parsecs" },
        "create",
      ),
    ).toThrow(AssetValidationError);
  });

  it("refuses a next-due date before the event — that cannot be true", () => {
    expect(() =>
      validateAssetEvent({ ...base, nextDueDate: "2026-06-01" }, "create"),
    ).toThrow(AssetValidationError);
  });

  it("routes the error to the field that caused it, without echoing the value", () => {
    try {
      validateAssetEvent({ ...base, cost: "-5" }, "create");
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AssetValidationError);
      const validation = error as AssetValidationError;
      expect(validation.field).toBe("cost");
      expect(validation.message).not.toContain("-5");
    }
  });
});

describe("validateAssetEvent — update (a partial patch)", () => {
  it("leaves an omitted field untouched", () => {
    const result = validateAssetEvent({ title: "Corrected" }, "update");
    expect(result.title).toBe("Corrected");
    expect(result.category).toBeUndefined();
    expect(result.eventDate).toBeUndefined();
    expect(result.costMinor).toBeUndefined();
  });

  it("clears a field on an explicit null", () => {
    const result = validateAssetEvent({ provider: null }, "update");
    expect(result.provider).toBeNull();
  });

  it("clears a meter reading when both halves are cleared together", () => {
    const result = validateAssetEvent(
      { meterValue: null, meterUnit: null },
      "update",
    );
    expect(result.meterValue).toBeNull();
    expect(result.meterUnit).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Obligations                                                                */
/* -------------------------------------------------------------------------- */

describe("validateAssetObligation — create", () => {
  const base = { category: "service", title: "Service" };

  it("requires a commitment — a date, a meter target, or both", () => {
    expect(() => validateAssetObligation(base, "create")).toThrow(
      AssetValidationError,
    );
    expect(
      validateAssetObligation({ ...base, dueDate: "2027-01-01" }, "create")
        .dueDate,
    ).toBe("2027-01-01");
    expect(
      validateAssetObligation(
        { ...base, meterThreshold: 60_000, meterUnit: "km" },
        "create",
      ).meterThreshold,
    ).toBe(60_000);
  });

  it("defaults the lead time and the recurrence to the calm option", () => {
    const result = validateAssetObligation(
      { ...base, dueDate: "2027-01-01" },
      "create",
    );
    expect(result.leadDays).toBe(14);
    expect(result.recurrenceKind).toBe("none");
    expect(result.recurrenceInterval).toBeNull();
  });

  it("bounds the lead time so it cannot swallow the calendar", () => {
    expect(() =>
      validateAssetObligation(
        { ...base, dueDate: "2027-01-01", leadDays: 400 },
        "create",
      ),
    ).toThrow(AssetValidationError);
  });

  it("refuses a meter target with no unit", () => {
    expect(() =>
      validateAssetObligation({ ...base, meterThreshold: 60_000 }, "create"),
    ).toThrow(AssetValidationError);
  });

  it("refuses a meter repeat with no threshold or no interval", () => {
    expect(() =>
      validateAssetObligation(
        { ...base, dueDate: "2027-01-01", recurrenceKind: "meter" },
        "create",
      ),
    ).toThrow(AssetValidationError);
    expect(() =>
      validateAssetObligation(
        {
          ...base,
          meterThreshold: 60_000,
          meterUnit: "km",
          recurrenceKind: "meter",
        },
        "create",
      ),
    ).toThrow(AssetValidationError);
  });

  it("refuses a date repeat with no date to advance from", () => {
    expect(() =>
      validateAssetObligation(
        {
          ...base,
          meterThreshold: 60_000,
          meterUnit: "km",
          recurrenceKind: "months",
          recurrenceInterval: 6,
        },
        "create",
      ),
    ).toThrow(AssetValidationError);
  });

  it("defaults a repeat interval to 1, which is what the words say", () => {
    const result = validateAssetObligation(
      { ...base, dueDate: "2027-01-01", recurrenceKind: "years" },
      "create",
    );
    expect(result.recurrenceInterval).toBe(1);
  });

  it("rejects an interval that could never advance, and an absurd one", () => {
    for (const interval of [0, 1000]) {
      expect(() =>
        validateAssetObligation(
          {
            ...base,
            dueDate: "2027-01-01",
            recurrenceKind: "months",
            recurrenceInterval: interval,
          },
          "create",
        ),
      ).toThrow(AssetValidationError);
    }
  });

  it("accepts a valid meter repeat end to end", () => {
    const result = validateAssetObligation(
      {
        ...base,
        meterThreshold: 60_000,
        meterUnit: "km",
        meterInterval: 10_000,
        recurrenceKind: "meter",
      },
      "create",
    );
    expect(result.recurrenceKind).toBe("meter");
    expect(result.meterInterval).toBe(10_000);
    // A date interval is meaningless here and is not stored.
    expect(result.recurrenceInterval).toBeNull();
  });
});

describe("validateAssetObligation — update sees the MERGED record", () => {
  const existing = {
    dueDate: "2027-01-01" as string | null,
    meterThreshold: null,
    meterUnit: null,
    meterInterval: null,
    recurrenceKind: "none" as const,
  };

  it("allows clearing the date when a meter target is being added", () => {
    const result = validateAssetObligation(
      { dueDate: null, meterThreshold: 60_000, meterUnit: "km" },
      "update",
      existing,
    );
    expect(result.dueDate).toBeNull();
    expect(result.meterThreshold).toBe(60_000);
  });

  it("refuses to clear the date when it would leave no commitment at all", () => {
    expect(() =>
      validateAssetObligation({ dueDate: null }, "update", existing),
    ).toThrow(AssetValidationError);
  });

  it("refuses a unit change that would orphan the stored threshold", () => {
    expect(() =>
      validateAssetObligation({ meterUnit: null }, "update", {
        ...existing,
        meterThreshold: 60_000,
        meterUnit: "km",
      }),
    ).toThrow(AssetValidationError);
  });
});

/* -------------------------------------------------------------------------- */
/* Completion                                                                 */
/* -------------------------------------------------------------------------- */

describe("validateObligationCompletion", () => {
  it("accepts an empty completion — the defaults are all resolvable", () => {
    const result = validateObligationCompletion({});
    expect(result.completedOn).toBeNull();
    expect(result.costMinor).toBeNull();
    expect(result.createSuccessor).toBe(true);
  });

  it("parses a cost and a meter reading", () => {
    const result = validateObligationCompletion({
      completedOn: "2026-07-05",
      cost: "489.50",
      currencyCode: "AUD",
      meterValue: "61200",
      meterUnit: "km",
    });
    expect(result.completedOn).toBe("2026-07-05");
    expect(result.costMinor).toBe(48_950);
    expect(result.meterValue).toBe(61_200);
  });

  it("refuses half a meter reading", () => {
    expect(() => validateObligationCompletion({ meterValue: "61200" })).toThrow(
      AssetValidationError,
    );
  });

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
    expect(validateEventsLimit(undefined)).toBe(20);
    expect(validateEventsLimit(5)).toBe(5);
    expect(validateEventsLimit(10_000)).toBe(100);
    expect(() => validateEventsLimit(0)).toThrow(AssetValidationError);
    expect(validateObligationsLimit(undefined)).toBe(25);
    expect(validateObligationsLimit(10_000)).toBe(100);
  });

  it("rejects an unknown filter rather than silently matching everything", () => {
    expect(() =>
      validateEventFilters({ categories: ["not_a_category"] }),
    ).toThrow(AssetValidationError);
    expect(() =>
      validateObligationFilters({ statuses: ["not_a_status"] }),
    ).toThrow(AssetValidationError);
  });

  it("passes through valid filters and defaults archived to excluded", () => {
    const events = validateEventFilters({ categories: ["service", "repair"] });
    expect(events.categories).toEqual(["service", "repair"]);
    expect(events.includeArchived).toBe(false);
    const obligations = validateObligationFilters({
      categories: ["registration"],
      statuses: ["open"],
    });
    expect(obligations.categories).toEqual(["registration"]);
    expect(obligations.statuses).toEqual(["open"]);
  });
});
