/**
 * ASSET-01 — view-model unit tests. Proves vocabulary labels, status tones, money
 * formatting, and — crucially — that the COLLECTION card projection never carries a
 * sensitive value (serial/reference number, price, private notes) (§17).
 */

import { describe, expect, it } from "vitest";

import type { Asset } from "~/kernel/assets";
import { parseWorkspaceId } from "~/kernel/workspaces";
import {
  assetStatusLabel,
  assetStatusTone,
  assetTypeLabel,
  formatAssetMoney,
  moneyInputValue,
  serializeAsset,
  serializeAssetListItem,
} from "~/modules/assets/asset-view";

function asset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: "a1",
    workspaceId: parseWorkspaceId("ws"),
    title: "Camera",
    assetType: "electronics",
    status: "active",
    description: null,
    manufacturer: "Canon",
    model: "R6",
    serialNumber: "SECRET-SERIAL-123",
    referenceCode: "REF-XYZ",
    tags: ["home"],
    ownerPersonId: null,
    responsiblePersonId: null,
    location: "Study",
    areaId: null,
    acquisitionDate: null,
    purchasePriceMinor: 199999,
    currencyCode: "AUD",
    supplier: null,
    replacementValueMinor: null,
    disposalDate: null,
    disposalNotes: "private disposal note",
    warrantyExpiry: "2027-01-01",
    serviceInterval: null,
    lastServiceDate: null,
    nextServiceDate: null,
    serviceProvider: null,
    maintenanceNotes: "confidential fault notes",
    issuer: null,
    referenceNumber: "POLICY-999",
    issueDate: null,
    renewalDate: null,
    url: null,
    documentNotes: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-02T00:00:00.000Z"),
    deletedAt: null,
    archivedAt: null,
    ...overrides,
  };
}

describe("labels + tones", () => {
  it("maps type and status vocabularies to human labels", () => {
    expect(assetTypeLabel("vehicle")).toBe("Vehicle");
    expect(assetTypeLabel("trailer")).toBe("Trailer or camper");
    expect(assetTypeLabel("nope")).toBeNull();
    expect(assetStatusLabel("under_repair")).toBe("Under repair");
    expect(assetStatusLabel(null)).toBeNull();
  });

  it("pairs a status with a tone (always alongside its text)", () => {
    expect(assetStatusTone("active")).toBe("success");
    expect(assetStatusTone("disposed")).toBe("danger");
    expect(assetStatusTone("under_repair")).toBe("warning");
  });
});

describe("money formatting", () => {
  it("formats and de-formats minor units", () => {
    expect(formatAssetMoney(199999, "AUD")).toContain("1,999.99");
    expect(formatAssetMoney(null, "AUD")).toBeNull();
    expect(moneyInputValue(199999, "AUD")).toBe("1999.99");
    expect(moneyInputValue(null, null)).toBe("");
  });
});

describe("collection card projection is non-sensitive", () => {
  it("omits every sensitive field from the list item", () => {
    const item = serializeAssetListItem(asset());
    const json = JSON.stringify(item);
    expect(json).not.toContain("SECRET-SERIAL");
    expect(json).not.toContain("REF-XYZ");
    expect(json).not.toContain("POLICY-999");
    expect(json).not.toContain("199999");
    expect(json).not.toContain("1999.99");
    expect(json).not.toContain("confidential");
    expect(json).not.toContain("private disposal");
    // But it keeps the useful, non-sensitive facts.
    expect(item.manufacturer).toBe("Canon");
    expect(item.location).toBe("Study");
    expect(item.warrantyExpiry).toBe("2027-01-01");
    expect(item.assetTypeLabel).toBe("Electronics");
  });
});

describe("record projection", () => {
  it("exposes the full slice with derived display fields", () => {
    const view = serializeAsset(asset());
    expect(view.serialNumber).toBe("SECRET-SERIAL-123");
    expect(view.purchasePriceDisplay).toContain("1,999.99");
    expect(view.purchasePriceInput).toBe("1999.99");
    expect(view.statusLabel).toBe("Active");
    expect(view.createdAt).toBe("2026-07-01T00:00:00.000Z");
  });
});
