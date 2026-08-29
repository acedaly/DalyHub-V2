/**
 * ASSET-01 — kernel validation unit tests. Type/status vocabularies, money parsing
 * to minor units, date-only and URL safety, tag normalisation, and the create/update
 * materialisation contract.
 */

import { describe, expect, it } from "vitest";

import {
  AssetValidationError,
  validateAssetDetails,
  validateAssetFilters,
  validateAssetSort,
  validateAssetStatus,
  validateAssetType,
  validateAssetView,
  validateTags,
} from "~/kernel/assets";

describe("required vocabularies", () => {
  it("validates the asset type", () => {
    expect(validateAssetType("vehicle")).toBe("vehicle");
    expect(() => validateAssetType("")).toThrow(AssetValidationError);
    expect(() => validateAssetType("spaceship")).toThrow(AssetValidationError);
  });
  it("defaults status on create, requires a valid value otherwise", () => {
    expect(validateAssetStatus(undefined, { create: true })).toBe("active");
    expect(validateAssetStatus("loaned")).toBe("loaned");
    expect(() => validateAssetStatus("melted")).toThrow(AssetValidationError);
  });
});

describe("validateAssetDetails", () => {
  it("materialises money to minor units on create", () => {
    const v = validateAssetDetails(
      {
        assetType: "appliance",
        currencyCode: "AUD",
        purchasePrice: "50.25",
        replacementValue: "100",
      },
      "create",
    );
    expect(v.money.get("purchasePriceMinor")).toBe(5025);
    expect(v.money.get("replacementValueMinor")).toBe(10000);
    expect(v.assetType).toBe("appliance");
    expect(v.status).toBe("active");
  });

  it("only touches present fields on update", () => {
    const v = validateAssetDetails({ manufacturer: "Bosch" }, "update");
    expect(v.scalars.has("manufacturer")).toBe(true);
    expect(v.scalars.has("model")).toBe(false);
    expect(v.assetType).toBeUndefined();
    expect(v.status).toBeUndefined();
  });

  it("rejects unsafe URLs, bad dates and negative money", () => {
    expect(() =>
      validateAssetDetails({ url: "javascript:alert(1)" }, "update"),
    ).toThrow(AssetValidationError);
    expect(() =>
      validateAssetDetails({ warrantyExpiry: "2026-02-31" }, "update"),
    ).toThrow(AssetValidationError);
    expect(() =>
      validateAssetDetails(
        { purchasePrice: "-5", currencyCode: "AUD" },
        "update",
      ),
    ).toThrow(AssetValidationError);
  });

  it("normalises blank optional fields to null", () => {
    const v = validateAssetDetails({ manufacturer: "  " }, "update");
    expect(v.scalars.get("manufacturer")).toBeNull();
  });
});

describe("tags", () => {
  // V2.6 FIND-02 — the shared validator. Canonical order (by folded key), first
  // spelling wins, the owner's casing preserved. See the People suite for the
  // same three properties asserted against the same one implementation.
  it("trims, dedupes case-insensitively and returns canonical order", () => {
    expect(validateTags([" Home ", "home", "Car"])).toEqual(["Car", "Home"]);
  });
});

describe("list validation", () => {
  it("validates views and sorts, defaulting sensibly", () => {
    expect(validateAssetView(undefined)).toBe("all");
    expect(validateAssetView("expiring")).toBe("expiring");
    expect(() => validateAssetView("nope")).toThrow(AssetValidationError);
    expect(validateAssetSort(undefined)).toBe("recent");
    expect(validateAssetSort("title")).toBe("title");
  });
  it("keeps only active, valid filters", () => {
    expect(validateAssetFilters({ type: "vehicle", status: "" })).toEqual({
      type: "vehicle",
    });
    expect(() => validateAssetFilters({ type: "nope" })).toThrow(
      AssetValidationError,
    );
  });
});
