/**
 * ASSET-01 — the Assets view-model (pure, React-free, server-safe).
 *
 * Converts a kernel `Asset` into JSON-safe display data for the collection card
 * and the canonical record, and owns the small pure derivations the UI needs
 * (vocabulary labels, money formatting). Dates are already wall-calendar
 * `YYYY-MM-DD` strings on the kernel record, so no timezone conversion happens
 * here — due-date STATUS is derived by the canonical `asset-dates` evaluator with
 * the owner-calendar "today" supplied at render.
 *
 * The COLLECTION card projection (`SerializedAssetListItem`) deliberately OMITS
 * every sensitive field — serial/reference numbers, prices and private notes never
 * cross into a card, a search snippet or telemetry (AGENTS.md §5, §17). The record
 * projection (`SerializedAsset`) carries the full slice because the record is the
 * one place those values are shown, to their owner, on request.
 */

import {
  ASSET_STATUSES,
  ASSET_TYPES,
  DEFAULT_CURRENCY,
  type Asset,
  type AssetStatus,
  type AssetType,
} from "~/kernel/assets";
import { formatMinorUnits, minorUnitsToDecimalString } from "~/kernel/money";

const ASSET_TYPE_LABELS = new Map<string, string>(
  ASSET_TYPES.map((t) => [t.value, t.label]),
);
const ASSET_STATUS_LABELS = new Map<string, string>(
  ASSET_STATUSES.map((s) => [s.value, s.label]),
);

/** The human label for an Asset type, or null. */
export function assetTypeLabel(value: string | null): string | null {
  return value ? (ASSET_TYPE_LABELS.get(value) ?? null) : null;
}

/** The human label for an Asset status, or null. */
export function assetStatusLabel(value: string | null): string | null {
  return value ? (ASSET_STATUS_LABELS.get(value) ?? null) : null;
}

/** A calm status tone (paired ALWAYS with the label text — never colour alone). */
export function assetStatusTone(
  status: AssetStatus,
): "neutral" | "accent" | "warning" | "danger" | "success" {
  switch (status) {
    case "active":
      return "success";
    case "under_repair":
      return "warning";
    case "disposed":
    case "retired":
      return "danger";
    case "loaned":
    case "stored":
      return "accent";
    default:
      return "neutral";
  }
}

/** Format an optional minor-unit amount for DISPLAY, or null when unset. */
export function formatAssetMoney(
  minor: number | null,
  currencyCode: string | null,
): string | null {
  if (minor === null) return null;
  return formatMinorUnits(minor, currencyCode ?? DEFAULT_CURRENCY);
}

/** Format an optional minor-unit amount as a plain decimal for a FORM field. */
export function moneyInputValue(
  minor: number | null,
  currencyCode: string | null,
): string {
  if (minor === null) return "";
  return minorUnitsToDecimalString(minor, currencyCode ?? DEFAULT_CURRENCY);
}

/**
 * One Asset on the `/assets` collection (card-sized, NON-SENSITIVE projection).
 * Carries only what a card may show — never a serial/reference number, price or
 * private note. The three date fields are not sensitive and drive the card's
 * "next meaningful date" via the canonical date evaluator.
 */
export type SerializedAssetListItem = {
  readonly id: string;
  readonly title: string;
  readonly assetType: AssetType;
  readonly assetTypeLabel: string;
  readonly status: AssetStatus;
  readonly statusLabel: string;
  readonly manufacturer: string | null;
  readonly model: string | null;
  readonly location: string | null;
  readonly tags: readonly string[];
  readonly warrantyExpiry: string | null;
  readonly renewalDate: string | null;
  readonly nextServiceDate: string | null;
  readonly archived: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
};

/** The full Asset detail projection for the canonical record. */
export type SerializedAsset = {
  readonly id: string;
  readonly title: string;
  readonly assetType: AssetType;
  readonly assetTypeLabel: string;
  readonly status: AssetStatus;
  readonly statusLabel: string;
  readonly description: string | null;
  readonly manufacturer: string | null;
  readonly model: string | null;
  readonly serialNumber: string | null;
  readonly referenceCode: string | null;
  readonly tags: readonly string[];
  readonly ownerPersonId: string | null;
  readonly responsiblePersonId: string | null;
  readonly location: string | null;
  readonly areaId: string | null;
  readonly acquisitionDate: string | null;
  readonly purchasePriceMinor: number | null;
  readonly purchasePriceDisplay: string | null;
  readonly purchasePriceInput: string;
  readonly currencyCode: string | null;
  readonly supplier: string | null;
  readonly replacementValueMinor: number | null;
  readonly replacementValueDisplay: string | null;
  readonly replacementValueInput: string;
  readonly disposalDate: string | null;
  readonly disposalNotes: string | null;
  readonly warrantyExpiry: string | null;
  readonly serviceInterval: string | null;
  readonly lastServiceDate: string | null;
  readonly nextServiceDate: string | null;
  readonly serviceProvider: string | null;
  readonly maintenanceNotes: string | null;
  readonly issuer: string | null;
  readonly referenceNumber: string | null;
  readonly issueDate: string | null;
  readonly renewalDate: string | null;
  readonly url: string | null;
  readonly documentNotes: string | null;
  /* ASSET-02 — the canonical current meter reading (never sensitive). */
  readonly currentMeterValue: number | null;
  readonly currentMeterUnit: string | null;
  readonly currentMeterDate: string | null;
  readonly archived: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
};

/** Project an Asset to the NON-SENSITIVE collection card view-model. */
export function serializeAssetListItem(asset: Asset): SerializedAssetListItem {
  return {
    id: asset.id,
    title: asset.title,
    assetType: asset.assetType,
    assetTypeLabel: assetTypeLabel(asset.assetType) ?? "Asset",
    status: asset.status,
    statusLabel: assetStatusLabel(asset.status) ?? "Active",
    manufacturer: asset.manufacturer,
    model: asset.model,
    location: asset.location,
    tags: asset.tags,
    warrantyExpiry: asset.warrantyExpiry,
    renewalDate: asset.renewalDate,
    nextServiceDate: asset.nextServiceDate,
    archived: asset.archivedAt !== null,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  };
}

/** Project an Asset to the full record view-model. */
export function serializeAsset(asset: Asset): SerializedAsset {
  return {
    id: asset.id,
    title: asset.title,
    assetType: asset.assetType,
    assetTypeLabel: assetTypeLabel(asset.assetType) ?? "Asset",
    status: asset.status,
    statusLabel: assetStatusLabel(asset.status) ?? "Active",
    description: asset.description,
    manufacturer: asset.manufacturer,
    model: asset.model,
    serialNumber: asset.serialNumber,
    referenceCode: asset.referenceCode,
    tags: asset.tags,
    ownerPersonId: asset.ownerPersonId,
    responsiblePersonId: asset.responsiblePersonId,
    location: asset.location,
    areaId: asset.areaId,
    acquisitionDate: asset.acquisitionDate,
    purchasePriceMinor: asset.purchasePriceMinor,
    purchasePriceDisplay: formatAssetMoney(
      asset.purchasePriceMinor,
      asset.currencyCode,
    ),
    purchasePriceInput: moneyInputValue(
      asset.purchasePriceMinor,
      asset.currencyCode,
    ),
    currencyCode: asset.currencyCode,
    supplier: asset.supplier,
    replacementValueMinor: asset.replacementValueMinor,
    replacementValueDisplay: formatAssetMoney(
      asset.replacementValueMinor,
      asset.currencyCode,
    ),
    replacementValueInput: moneyInputValue(
      asset.replacementValueMinor,
      asset.currencyCode,
    ),
    disposalDate: asset.disposalDate,
    disposalNotes: asset.disposalNotes,
    warrantyExpiry: asset.warrantyExpiry,
    serviceInterval: asset.serviceInterval,
    lastServiceDate: asset.lastServiceDate,
    nextServiceDate: asset.nextServiceDate,
    serviceProvider: asset.serviceProvider,
    maintenanceNotes: asset.maintenanceNotes,
    issuer: asset.issuer,
    referenceNumber: asset.referenceNumber,
    issueDate: asset.issueDate,
    renewalDate: asset.renewalDate,
    url: asset.url,
    documentNotes: asset.documentNotes,
    currentMeterValue: asset.currentMeterValue,
    currentMeterUnit: asset.currentMeterUnit,
    currentMeterDate: asset.currentMeterDate,
    archived: asset.archivedAt !== null,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  };
}
