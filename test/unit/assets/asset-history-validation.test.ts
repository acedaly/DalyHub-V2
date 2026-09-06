/**
 * ASSET-02 — canonical Asset EVENT validation.
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
  validateEventFilters,
  validateEventsLimit,
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
/* Read inputs                                                                */
/* -------------------------------------------------------------------------- */

/*
 * The obligation half of this file moved to
 * `test/unit/obligations/obligation-validation.test.ts` with the validators it
 * covers (V2.10 LIFE-01).
 */
describe("read inputs", () => {
  it("clamps page sizes to the documented maximum", () => {
    expect(validateEventsLimit(undefined)).toBe(20);
    expect(validateEventsLimit(5)).toBe(5);
    expect(validateEventsLimit(10_000)).toBe(100);
    expect(() => validateEventsLimit(0)).toThrow(AssetValidationError);
  });

  it("rejects an unknown filter rather than silently matching everything", () => {
    expect(() =>
      validateEventFilters({ categories: ["not_a_category"] }),
    ).toThrow(AssetValidationError);
  });

  it("passes through valid filters and defaults archived to excluded", () => {
    const events = validateEventFilters({ categories: ["service", "repair"] });
    expect(events.categories).toEqual(["service", "repair"]);
    expect(events.includeArchived).toBe(false);
  });
});
