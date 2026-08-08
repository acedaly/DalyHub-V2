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

import { ASSET_TYPES, type AssetType } from "~/kernel/assets";
import type { SelectOption } from "~/shared/forms/model";

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

/* -------------------------------------------------------------------------- */
/* ASSET-03 — the type vocabulary, grouped for a phone                         */
/* -------------------------------------------------------------------------- */

/**
 * The group headings the create form shows above the Asset types.
 *
 * PRESENTATION ONLY. There is no subtype concept in the Asset model and this
 * does not invent one: nothing here is stored, submitted, validated or queried,
 * and the type keys and labels are the kernel's own, untouched. The groups exist
 * so thirteen types can be SCANNED — "is this a thing, a document, or a
 * subscription?" is a faster first question than reading thirteen labels — and
 * they are derived from the same sets that decide which fields a type reveals,
 * so what you choose under "Documents and cover" is exactly what then asks for
 * an issuer and a renewal date.
 */
export const ASSET_TYPE_GROUP_PHYSICAL = "Physical";
export const ASSET_TYPE_GROUP_DOCUMENTARY = "Documents and cover";
export const ASSET_TYPE_GROUP_RECURRING = "Digital and recurring";
export const ASSET_TYPE_GROUP_OTHER = "Anything else";

/** The presentation group for an Asset type. Total: a new type falls to "other". */
export function assetTypeGroup(assetType: AssetType): string {
  if (PHYSICAL.has(assetType)) return ASSET_TYPE_GROUP_PHYSICAL;
  if (DOCUMENTARY.has(assetType)) return ASSET_TYPE_GROUP_DOCUMENTARY;
  if (SUBSCRIPTIONLIKE.has(assetType)) return ASSET_TYPE_GROUP_RECURRING;
  return ASSET_TYPE_GROUP_OTHER;
}

/**
 * The New-Asset type options: the kernel vocabulary in the kernel's own order,
 * each carrying its presentation group. Derived from `ASSET_TYPES`, so a type
 * added to the kernel appears here automatically rather than being forgotten.
 */
export function assetTypeOptions(): readonly SelectOption[] {
  const groups = [
    ASSET_TYPE_GROUP_PHYSICAL,
    ASSET_TYPE_GROUP_DOCUMENTARY,
    ASSET_TYPE_GROUP_RECURRING,
    ASSET_TYPE_GROUP_OTHER,
  ];
  return groups.flatMap((group) =>
    ASSET_TYPES.filter((type) => assetTypeGroup(type.value) === group).map(
      (type) => ({ value: type.value, label: type.label, group }),
    ),
  );
}
