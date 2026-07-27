/**
 * ASSET-01 Assets kernel — the typed error family.
 *
 * The `AssetRepository` fails only through these typed errors, so callers branch
 * on `instanceof` / `.code` / `.field` and never parse a message string. Messages
 * NEVER echo caller-supplied content — an Asset can hold sensitive values (serial
 * and policy numbers, prices), so an error may say a field is invalid but never
 * quote its value (AGENTS.md §5, §17). `AssetNotFoundError` deliberately conflates
 * missing / soft-deleted / wrong-type / cross-workspace so it never discloses
 * cross-workspace existence (fails closed).
 */

/** The closed set of Asset error codes. */
export type AssetErrorCode =
  "validation" | "not_found" | "conflict" | "storage";

/** The base class for every Assets error; sets `name` to the concrete class. */
export abstract class AssetError extends Error {
  abstract readonly code: AssetErrorCode;
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** The validatable Asset fields (used to route field-level form errors). */
export type AssetValidationField =
  | "id"
  | "title"
  | "assetType"
  | "status"
  | "description"
  | "manufacturer"
  | "model"
  | "serialNumber"
  | "referenceCode"
  | "tags"
  | "ownerPersonId"
  | "responsiblePersonId"
  | "location"
  | "areaId"
  | "acquisitionDate"
  | "purchasePrice"
  | "currencyCode"
  | "supplier"
  | "replacementValue"
  | "disposalDate"
  | "disposalNotes"
  | "warrantyExpiry"
  | "serviceInterval"
  | "lastServiceDate"
  | "nextServiceDate"
  | "serviceProvider"
  | "maintenanceNotes"
  | "issuer"
  | "referenceNumber"
  | "issueDate"
  | "renewalDate"
  | "url"
  | "documentNotes"
  | "limit"
  | "cursor"
  | "query"
  | "view"
  | "sort";

/** Invalid input that crossed the Asset boundary. No data is written. */
export class AssetValidationError extends AssetError {
  readonly code = "validation" as const;
  readonly field: AssetValidationField;
  constructor(field: AssetValidationField, message: string) {
    super(`Invalid ${field}: ${message}`);
    this.field = field;
  }
}

/** No matching Asset in the bound workspace (missing / deleted / wrong-type /
 * cross-workspace — indistinguishable, by design). */
export class AssetNotFoundError extends AssetError {
  readonly code = "not_found" as const;
  constructor() {
    super("Asset not found");
  }
}

/** A concurrent write changed the record under this one. */
export class AssetConflictError extends AssetError {
  readonly code = "conflict" as const;
  constructor() {
    super("That change couldn't be completed. Please try again.");
  }
}

/** A storage-layer failure. Wraps the underlying cause without leaking it. */
export class AssetStorageError extends AssetError {
  readonly code = "storage" as const;
  constructor(options?: ErrorOptions) {
    super("An asset storage error occurred.", options);
  }
}

/** A cursor that is not valid for the query it was presented to. */
export class InvalidAssetCursorError extends AssetValidationError {
  constructor() {
    super("cursor", "is not a valid cursor for this query");
  }
}
