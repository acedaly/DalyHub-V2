/**
 * ASSET-01 — progressive New-Asset field-selection unit tests. The revealed field
 * set is a pure function of the type; changing type re-selects the visible set
 * (the form keeps values), and no type shows the whole intimidating slice.
 */

import { describe, expect, it } from "vitest";

import { newAssetFieldsForType } from "~/modules/assets/asset-form-model";
import { assetTypeIcon } from "~/modules/assets/asset-icons";

const names = (t: Parameters<typeof newAssetFieldsForType>[0]) =>
  newAssetFieldsForType(t).map((f) => f.name);

describe("newAssetFieldsForType", () => {
  it("reveals nothing until a type is chosen", () => {
    expect(newAssetFieldsForType("")).toEqual([]);
  });

  it("reveals physical fields for a vehicle", () => {
    expect(names("vehicle")).toEqual([
      "manufacturer",
      "model",
      "serialNumber",
      "location",
      "warrantyExpiry",
    ]);
  });

  it("reveals documentary fields for a licence", () => {
    expect(names("licence")).toEqual([
      "issuer",
      "referenceNumber",
      "issueDate",
      "renewalDate",
      "url",
    ]);
  });

  it("reveals a leaner set for a subscription", () => {
    expect(names("subscription")).toEqual([
      "issuer",
      "referenceNumber",
      "renewalDate",
      "url",
    ]);
  });

  it("keeps the calm common set for 'other'", () => {
    expect(names("other")).toEqual(["manufacturer", "model", "location"]);
  });

  it("never shows the whole slice at once", () => {
    for (const type of ["vehicle", "licence", "subscription", "other"] as const) {
      expect(newAssetFieldsForType(type).length).toBeLessThanOrEqual(6);
    }
  });
});

describe("assetTypeIcon", () => {
  it("returns a stable component per type and a safe fallback", () => {
    expect(assetTypeIcon("vehicle")).toBe(assetTypeIcon("vehicle"));
    expect(typeof assetTypeIcon("unknown-type")).toBe("function");
  });
});
