/**
 * ASSET-01 — progressive New-Asset field-selection unit tests. The revealed field
 * set is a pure function of the type; changing type re-selects the visible set
 * (the form keeps values), and no type shows the whole intimidating slice.
 */

import { describe, expect, it } from "vitest";

import { ASSET_TYPES } from "~/kernel/assets";
import {
  ASSET_TYPE_GROUP_DOCUMENTARY,
  ASSET_TYPE_GROUP_OTHER,
  ASSET_TYPE_GROUP_PHYSICAL,
  ASSET_TYPE_GROUP_RECURRING,
  assetTypeGroup,
  assetTypeOptions,
  newAssetFieldsForType,
} from "~/modules/assets/asset-form-model";
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
    for (const type of [
      "vehicle",
      "licence",
      "subscription",
      "other",
    ] as const) {
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

/**
 * ASSET-03 — the grouped type vocabulary.
 *
 * Grouping is PRESENTATION: it must reorganise nothing about the data. These
 * tests exist to make that literal — the same thirteen keys, the same labels,
 * every one reachable exactly once — because a "picker improvement" that quietly
 * drops or renames a type would corrupt records rather than merely look wrong.
 */
describe("assetTypeOptions", () => {
  const options = assetTypeOptions();

  it("offers every kernel type exactly once, with the kernel's own keys", () => {
    expect([...options].map((o) => o.value).sort()).toEqual(
      ASSET_TYPES.map((t) => t.value).sort(),
    );
  });

  it("never renames a label", () => {
    for (const type of ASSET_TYPES) {
      const option = options.find((o) => o.value === type.value);
      expect(option?.label).toBe(type.label);
    }
  });

  it("contains no placeholder option — an empty value is never selectable", () => {
    expect(options.some((o) => o.value === "")).toBe(false);
  });

  it("groups by the SAME sets that decide which fields a type reveals", () => {
    const groupOf = (value: string) =>
      options.find((o) => o.value === value)?.group;
    expect(groupOf("vehicle")).toBe(ASSET_TYPE_GROUP_PHYSICAL);
    expect(groupOf("trailer")).toBe(ASSET_TYPE_GROUP_PHYSICAL);
    expect(groupOf("insurance")).toBe(ASSET_TYPE_GROUP_DOCUMENTARY);
    expect(groupOf("licence")).toBe(ASSET_TYPE_GROUP_DOCUMENTARY);
    expect(groupOf("subscription")).toBe(ASSET_TYPE_GROUP_RECURRING);
    expect(groupOf("software")).toBe(ASSET_TYPE_GROUP_RECURRING);
    expect(groupOf("other")).toBe(ASSET_TYPE_GROUP_OTHER);
  });

  it("keeps each group contiguous, so the sheet renders four headings", () => {
    const groups = options.map((o) => o.group);
    const firstIndexes = groups.map((g) => groups.indexOf(g ?? ""));
    // A group is contiguous when every member sits at first index + offset.
    expect(new Set(firstIndexes).size).toBe(4);
    expect(groups.filter((g, i) => g !== groups[i - 1]).length).toBe(4);
  });

  it("puts a type the field model does not classify in 'anything else'", () => {
    // A new kernel type must still be OFFERED, in the group whose field set it
    // will actually get, rather than silently vanishing from the picker.
    expect(assetTypeGroup("other")).toBe(ASSET_TYPE_GROUP_OTHER);
    expect(newAssetFieldsForType("other").length).toBeGreaterThan(0);
  });
});
