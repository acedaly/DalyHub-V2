/**
 * ASSET-01 — the shared list of Asset detail form-field keys.
 *
 * The single source of truth for which form fields the create/update actions read
 * off a posted `FormData`, so a partial form (e.g. the Details tab or the Dates tab)
 * touches ONLY the fields it names — an omitted field is left unchanged; a submitted
 * empty string clears that field (the kernel normalises blank → null). Money fields
 * are the decimal STRING inputs (`purchasePrice`, `replacementValue`); the kernel
 * parses them to integer minor units. `title` is handled separately (it is the
 * entity title, not a detail-slice field).
 */

/** Every detail-slice string field a form may submit (never `title` or `tags`). */
export const ASSET_FORM_STRING_KEYS = [
  "assetType",
  "status",
  "description",
  "manufacturer",
  "model",
  "serialNumber",
  "referenceCode",
  "ownerPersonId",
  "responsiblePersonId",
  "location",
  "areaId",
  "acquisitionDate",
  "purchasePrice",
  "currencyCode",
  "supplier",
  "replacementValue",
  "disposalDate",
  "disposalNotes",
  "warrantyExpiry",
  "serviceInterval",
  "lastServiceDate",
  "nextServiceDate",
  "serviceProvider",
  "maintenanceNotes",
  "issuer",
  "referenceNumber",
  "issueDate",
  "renewalDate",
  "url",
  "documentNotes",
] as const;

/** Parse a JSON tags field defensively into a string array. */
export function parseTagsField(raw: string): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((t): t is string => typeof t === "string")
      : [];
  } catch {
    return [];
  }
}
