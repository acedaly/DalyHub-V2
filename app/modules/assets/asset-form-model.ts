/**
 * ASSET-01 — the progressive New-Asset field model (pure, React-free, testable).
 *
 * The New Asset flow starts with title + type, then progressively reveals only the
 * fields RELEVANT to the chosen type, so the form is never an intimidating wall of
 * every possible field. Which fields show is a pure function of the Asset type —
 * unit-tested directly — and switching type re-selects the visible set WITHOUT
 * losing already-entered common values (the form keeps all values in state; only
 * the rendered set changes). The full field set is always editable later on the
 * record's Details tab.
 */

import type { AssetType } from "~/kernel/assets";

/** A revealed create-form field descriptor. `name` matches the FormData key. */
export type AssetFormField = {
  readonly name: string;
  readonly label: string;
  /** Control kind; defaults to a text input when omitted. */
  readonly kind?: "text" | "date";
  /** A gentle hint about what belongs here. */
  readonly help?: string;
};

const MANUFACTURER: AssetFormField = {
  name: "manufacturer",
  label: "Manufacturer",
};
const MODEL: AssetFormField = { name: "model", label: "Model" };
const SERIAL: AssetFormField = {
  name: "serialNumber",
  label: "Serial number",
  help: "Kept private — never shown on cards or in search.",
};
const LOCATION: AssetFormField = {
  name: "location",
  label: "Location",
  help: "Where it lives, in plain words.",
};
const WARRANTY: AssetFormField = {
  name: "warrantyExpiry",
  label: "Warranty expires",
  kind: "date",
};
const ISSUER: AssetFormField = {
  name: "issuer",
  label: "Issuer or provider",
};
const REFERENCE_NUMBER: AssetFormField = {
  name: "referenceNumber",
  label: "Reference number",
  help: "Kept private — never shown on cards or in search.",
};
const ISSUE_DATE: AssetFormField = {
  name: "issueDate",
  label: "Issue date",
  kind: "date",
};
const RENEWAL: AssetFormField = {
  name: "renewalDate",
  label: "Renewal or expiry date",
  kind: "date",
};
const URL_FIELD: AssetFormField = {
  name: "url",
  label: "Link",
  help: "An https link to the policy, licence or account.",
};

// Groups of types that share a relevant field set.
const PHYSICAL: ReadonlySet<AssetType> = new Set([
  "vehicle",
  "trailer",
  "equipment",
  "appliance",
  "electronics",
  "tool",
  "property_item",
]);
const DOCUMENTARY: ReadonlySet<AssetType> = new Set([
  "document",
  "licence",
  "insurance",
]);
const SUBSCRIPTIONLIKE: ReadonlySet<AssetType> = new Set([
  "subscription",
  "software",
]);

/**
 * The fields to reveal in the New Asset form for a given type. A pure selection —
 * unit-tested — over a small, calm set; the full slice is edited on the record.
 */
export function newAssetFieldsForType(
  assetType: AssetType | "",
): readonly AssetFormField[] {
  if (assetType === "") return [];
  if (PHYSICAL.has(assetType)) {
    return [MANUFACTURER, MODEL, SERIAL, LOCATION, WARRANTY];
  }
  if (DOCUMENTARY.has(assetType)) {
    return [ISSUER, REFERENCE_NUMBER, ISSUE_DATE, RENEWAL, URL_FIELD];
  }
  if (SUBSCRIPTIONLIKE.has(assetType)) {
    return [ISSUER, REFERENCE_NUMBER, RENEWAL, URL_FIELD];
  }
  // "other" and any future type: the calm common set.
  return [MANUFACTURER, MODEL, LOCATION];
}
