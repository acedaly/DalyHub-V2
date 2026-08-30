/**
 * ASSET-01 Assets kernel — boundary validation.
 *
 * Pure, storage-independent validation of everything crossing the Asset boundary.
 * Every repository entry point validates here BEFORE touching storage, so invalid
 * input can never write data (AGENTS.md §17). Validators return the normalised
 * value or throw `AssetValidationError`.
 *
 * The display title (`title`) reuses the shared entity title rules; every other
 * field is optional and normalises a blank value to `null`. `assetType` and
 * `status` are required closed vocabularies. Dates are wall-calendar `YYYY-MM-DD`
 * strings, validated/compared as integers (never routed through `Date`), so they
 * cannot shift by a timezone (ADR-022 §22.7). Money is parsed to integer minor
 * units against the record's currency, never a float (ADR-049). `url` accepts only
 * http(s).
 */

import {
  TagValidationError,
  tagLabels,
  validateEntityTags,
  type WorkspaceTag,
} from "~/kernel/tags";
import { ID_MAX_LENGTH } from "~/kernel/entities";
import { validateTitle } from "~/kernel/entities/entity-validation";
import {
  MoneyValidationError,
  parseMoneyToMinorUnits,
  validateCurrencyCode,
} from "~/kernel/money";

import {
  ASSET_STATUSES,
  ASSET_TYPES,
  DEFAULT_ASSET_STATUS,
  type AssetStatus,
  type AssetType,
  type AssetDetailsInput,
  type AssetFilters,
  type AssetSort,
  type AssetView,
} from "./asset";
import {
  AssetValidationError,
  type AssetValidationField,
} from "./asset-errors";

/* -------------------------------------------------------------------------- */
/* Limits                                                                     */
/* -------------------------------------------------------------------------- */

export const DEFAULT_ASSETS_PAGE_SIZE = 30;
export const MAX_ASSETS_PAGE_SIZE = 100;

export const NAME_MAX_LENGTH = 200;
export const REFERENCE_MAX_LENGTH = 200;
export const LOCATION_MAX_LENGTH = 300;
export const URL_MAX_LENGTH = 4096;
export const NOTES_MAX_LENGTH = 20000;
export const DESCRIPTION_MAX_LENGTH = 2000;
export const INTERVAL_MAX_LENGTH = 200;
export const TAG_MAX_LENGTH = 64;
export const MAX_TAGS = 50;
export const QUERY_MAX_LENGTH = 200;

/** The currency assumed for money parsing when the input omits one (owner default). */
export const DEFAULT_CURRENCY = "AUD";

/** The closed vocabularies as fast lookup sets. */
const ASSET_TYPE_VALUES: ReadonlySet<string> = new Set(
  ASSET_TYPES.map((t) => t.value),
);
const ASSET_STATUS_VALUES: ReadonlySet<string> = new Set(
  ASSET_STATUSES.map((s) => s.value),
);

/** Count Unicode code points, so validation matches user-perceived length. */
function codePointLength(value: string): number {
  return [...value].length;
}

/* -------------------------------------------------------------------------- */
/* Primitive validators                                                       */
/* -------------------------------------------------------------------------- */

/** Validate and normalise the display title via the shared entity title rules. */
export function validateAssetTitle(value: unknown): string {
  try {
    return validateTitle(value);
  } catch {
    throw new AssetValidationError("title", "must be a non-empty title");
  }
}

/** Validate a non-empty identifier used verbatim as a lookup key. */
export function validateAssetId(value: unknown): string {
  if (typeof value !== "string") {
    throw new AssetValidationError("id", "must be a string");
  }
  if (value.length === 0) {
    throw new AssetValidationError("id", "must not be empty");
  }
  if (value.length > ID_MAX_LENGTH) {
    throw new AssetValidationError(
      "id",
      `must be at most ${ID_MAX_LENGTH} characters`,
    );
  }
  return value;
}

/** Validate the required Asset type against the closed vocabulary. */
export function validateAssetType(value: unknown): AssetType {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AssetValidationError("assetType", "is required");
  }
  const trimmed = value.trim();
  if (!ASSET_TYPE_VALUES.has(trimmed)) {
    throw new AssetValidationError("assetType", "is not a recognised type");
  }
  return trimmed as AssetType;
}

/**
 * Validate the real-world status. On `create` an omitted status defaults to
 * `active`; on `update` a present status must be a recognised value.
 */
export function validateAssetStatus(
  value: unknown,
  { create = false }: { create?: boolean } = {},
): AssetStatus {
  if (value === undefined || value === null || value === "") {
    if (create) return DEFAULT_ASSET_STATUS;
    throw new AssetValidationError("status", "is required");
  }
  if (typeof value !== "string") {
    throw new AssetValidationError("status", "must be a string");
  }
  const trimmed = value.trim();
  if (!ASSET_STATUS_VALUES.has(trimmed)) {
    throw new AssetValidationError("status", "is not a recognised status");
  }
  return trimmed as AssetStatus;
}

/** Normalise an optional free-text field: blank → null; else trimmed + bounded. */
function validateOptionalText(
  value: unknown,
  field: AssetValidationField,
  maxLength: number,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new AssetValidationError(field, "must be a string");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (codePointLength(trimmed) > maxLength) {
    throw new AssetValidationError(
      field,
      `must be at most ${maxLength} characters`,
    );
  }
  return trimmed;
}

/** Validate an optional canonical entity-id reference (owner/responsible/area). */
function validateOptionalId(
  value: unknown,
  field: AssetValidationField,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new AssetValidationError(field, "must be a string");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > ID_MAX_LENGTH) {
    throw new AssetValidationError(field, "is not a valid reference");
  }
  return trimmed;
}

/** Validate an optional http(s) URL. */
function validateOptionalUrl(
  value: unknown,
  field: AssetValidationField,
): string | null {
  const text = validateOptionalText(value, field, URL_MAX_LENGTH);
  if (text === null) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new AssetValidationError(field, "must be a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AssetValidationError(field, "must be an http(s) URL");
  }
  return text;
}

/** Validate an optional wall-calendar date string (`YYYY-MM-DD`). */
function validateOptionalDate(
  value: unknown,
  field: AssetValidationField,
): string | null {
  const text = validateOptionalText(value, field, 10);
  if (text === null) {
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new AssetValidationError(field, "must be a date (YYYY-MM-DD)");
  }
  const [y, m, d] = text.split("-").map((part) => Number.parseInt(part, 10));
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    throw new AssetValidationError(field, "must be a real calendar date");
  }
  return text;
}

/** Validate an optional currency code; blank → null. */
function validateOptionalCurrency(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new AssetValidationError("currencyCode", "must be a string");
  }
  if (value.trim().length === 0) {
    return null;
  }
  try {
    return validateCurrencyCode(value, "currencyCode");
  } catch (cause) {
    if (cause instanceof MoneyValidationError) {
      throw new AssetValidationError(
        "currencyCode",
        "must be a valid currency code",
      );
    }
    throw cause;
  }
}

/** Validate an optional money decimal string into integer minor units, or null. */
function validateOptionalMoney(
  value: unknown,
  field: "purchasePrice" | "replacementValue",
  currencyCode: string,
): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new AssetValidationError(field, "must be an amount");
  }
  let minor: number | null;
  try {
    minor = parseMoneyToMinorUnits(value, currencyCode, field);
  } catch (cause) {
    if (cause instanceof MoneyValidationError) {
      throw new AssetValidationError(
        field,
        cause.message.replace(/^.*?: /, ""),
      );
    }
    throw cause;
  }
  if (minor !== null && minor < 0) {
    throw new AssetValidationError(field, "must not be negative");
  }
  return minor;
}

/**
 * Validate an optional tags array.
 *
 * **V2.6 FIND-02 — this delegates to the ONE tag validator.** The Asset-specific
 * part that remains is the ERROR TYPE, so a caller catching `AssetValidationError`
 * keeps catching one. Returns the display labels, in canonical order.
 */
export function validateTags(value: unknown): readonly string[] {
  return tagLabels(validateAssetTagSet(value));
}

/** The same validation, returning the canonical key/label pairs a write needs. */
export function validateAssetTagSet(value: unknown): readonly WorkspaceTag[] {
  try {
    return validateEntityTags(value, "tags");
  } catch (cause) {
    if (cause instanceof TagValidationError) {
      throw new AssetValidationError(
        "tags",
        cause.message.replace(/^tags /, ""),
      );
    }
    throw cause;
  }
}

/* -------------------------------------------------------------------------- */
/* Detail-slice validation                                                    */
/* -------------------------------------------------------------------------- */

/** The scalar TEXT/date/enum detail fields (excluding type, status, money, tags). */
export const ASSET_SCALAR_FIELDS = [
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
  "currencyCode",
  "supplier",
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

export type AssetScalarField = (typeof ASSET_SCALAR_FIELDS)[number];

/** The two money fields, keyed by their stored minor-unit column names. */
export type AssetMoneyField = "purchasePriceMinor" | "replacementValueMinor";

/** Validate one scalar detail field, returning its normalised value. */
function validateScalarField(
  field: AssetScalarField,
  value: unknown,
): string | null {
  switch (field) {
    case "description":
      return validateOptionalText(value, field, DESCRIPTION_MAX_LENGTH);
    case "manufacturer":
    case "model":
    case "supplier":
    case "serviceProvider":
    case "issuer":
      return validateOptionalText(value, field, NAME_MAX_LENGTH);
    case "serialNumber":
    case "referenceCode":
    case "referenceNumber":
      return validateOptionalText(value, field, REFERENCE_MAX_LENGTH);
    case "location":
      return validateOptionalText(value, field, LOCATION_MAX_LENGTH);
    case "serviceInterval":
      return validateOptionalText(value, field, INTERVAL_MAX_LENGTH);
    case "ownerPersonId":
    case "responsiblePersonId":
    case "areaId":
      return validateOptionalId(value, field);
    case "acquisitionDate":
    case "disposalDate":
    case "warrantyExpiry":
    case "lastServiceDate":
    case "nextServiceDate":
    case "issueDate":
    case "renewalDate":
      return validateOptionalDate(value, field);
    case "currencyCode":
      return validateOptionalCurrency(value);
    case "url":
      return validateOptionalUrl(value, field);
    case "disposalNotes":
    case "maintenanceNotes":
    case "documentNotes":
      return validateOptionalText(value, field, NOTES_MAX_LENGTH);
  }
}

/**
 * A validated detail slice: the scalar fields PRESENT in the input, the required
 * type/status when present, the money minor-unit amounts when present, and the
 * normalised tag set when present. On `create` every field is present (defaulted
 * as needed) so the repository writes a complete row.
 */
export type ValidatedAssetDetails = {
  readonly scalars: ReadonlyMap<AssetScalarField, string | null>;
  readonly assetType?: AssetType;
  readonly status?: AssetStatus;
  readonly money: ReadonlyMap<AssetMoneyField, number | null>;
  readonly tagsProvided: boolean;
  /** The canonical key/label pairs FIND-02's storage layer writes. */
  readonly tags: readonly WorkspaceTag[];
};

/**
 * Validate a detail-slice input. In `create` mode every field is materialised
 * (omitted → null / default / empty tags) so the repository writes a complete
 * row. In `update` mode only fields actually present are included, so a partial
 * edit touches only the columns it names. Money amounts are parsed against the
 * input's `currencyCode` (or the owner default) into integer minor units.
 */
export function validateAssetDetails(
  input: AssetDetailsInput,
  mode: "create" | "update",
): ValidatedAssetDetails {
  const has = (key: string): boolean =>
    Object.prototype.hasOwnProperty.call(input, key);
  const record = input as Record<string, unknown>;

  const scalars = new Map<AssetScalarField, string | null>();
  for (const field of ASSET_SCALAR_FIELDS) {
    if (mode === "create" || has(field)) {
      scalars.set(field, validateScalarField(field, record[field]));
    }
  }

  // Required vocabularies.
  let assetType: AssetType | undefined;
  if (mode === "create" || has("assetType")) {
    assetType = validateAssetType(record.assetType);
  }
  let status: AssetStatus | undefined;
  if (mode === "create" || has("status")) {
    status = validateAssetStatus(record.status, { create: mode === "create" });
  }

  // Money: parse the decimal input fields against the effective currency. The
  // currency used for parsing is the one supplied in THIS input (a create always
  // carries both, and an edit that changes the amount should also set the code);
  // when absent we fall back to the owner default — the minor-digit count is what
  // matters, and no conversion is performed (ADR-049).
  const parseCurrency =
    validateOptionalCurrency(record.currencyCode) ?? DEFAULT_CURRENCY;
  const money = new Map<AssetMoneyField, number | null>();
  if (mode === "create" || has("purchasePrice")) {
    money.set(
      "purchasePriceMinor",
      validateOptionalMoney(
        record.purchasePrice,
        "purchasePrice",
        parseCurrency,
      ),
    );
  }
  if (mode === "create" || has("replacementValue")) {
    money.set(
      "replacementValueMinor",
      validateOptionalMoney(
        record.replacementValue,
        "replacementValue",
        parseCurrency,
      ),
    );
  }

  const tagsProvided = mode === "create" || has("tags");
  const tags = tagsProvided ? validateAssetTagSet(input.tags) : [];

  return { scalars, assetType, status, money, tagsProvided, tags };
}

/* -------------------------------------------------------------------------- */
/* List / read validation                                                     */
/* -------------------------------------------------------------------------- */

/** Validate and clamp a requested page limit to `[1, MAX_ASSETS_PAGE_SIZE]`. */
export function validateAssetsLimit(value: unknown): number {
  if (value === undefined) {
    return DEFAULT_ASSETS_PAGE_SIZE;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new AssetValidationError("limit", "must be an integer");
  }
  if (value < 1) {
    throw new AssetValidationError("limit", "must be at least 1");
  }
  return Math.min(value, MAX_ASSETS_PAGE_SIZE);
}

const VIEW_VALUES: ReadonlySet<string> = new Set([
  "all",
  "recent",
  "expiring",
  "service_due",
  "archived",
]);

/** Validate the collection view (defaults to `all`). */
export function validateAssetView(value: unknown): AssetView {
  if (value === undefined || value === null || value === "") {
    return "all";
  }
  if (typeof value === "string" && VIEW_VALUES.has(value)) {
    return value as AssetView;
  }
  throw new AssetValidationError("view", "is not a recognised view");
}

const SORT_VALUES: ReadonlySet<string> = new Set([
  "recent",
  "title",
  "type",
  "next_date",
]);

/** Validate the sort order (defaults to `recent`). */
export function validateAssetSort(value: unknown): AssetSort {
  if (value === undefined || value === null || value === "") {
    return "recent";
  }
  if (typeof value === "string" && SORT_VALUES.has(value)) {
    return value as AssetSort;
  }
  throw new AssetValidationError("sort", "is not a recognised sort");
}

/** Validate the structured filters, returning only the active (present) ones. */
export function validateAssetFilters(
  input: AssetFilters | undefined,
): AssetFilters {
  if (!input) return {};
  const out: {
    type?: string;
    status?: string;
    areaId?: string;
    personId?: string;
    tag?: string;
  } = {};
  if (input.type !== undefined && input.type !== "") {
    out.type = validateAssetType(input.type);
  }
  if (input.status !== undefined && input.status !== "") {
    out.status = validateAssetStatus(input.status);
  }
  const area = validateOptionalId(input.areaId, "areaId");
  if (area !== null) out.areaId = area;
  const person = validateOptionalId(input.personId, "ownerPersonId");
  if (person !== null) out.personId = person;
  const tag = validateOptionalText(input.tag, "tags", TAG_MAX_LENGTH);
  if (tag !== null) out.tag = tag;
  return out;
}

/** Normalise an optional search query: trimmed and bounded; empty → null. */
export function normaliseQuery(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new AssetValidationError("query", "must be a string");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed.slice(0, QUERY_MAX_LENGTH);
}

/** Validate an optional owner-calendar "today" (`YYYY-MM-DD`), or null. */
export function validateToday(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  return value;
}
