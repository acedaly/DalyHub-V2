/**
 * ASSET-02 Assets kernel — canonical validation for Asset Events and Obligations.
 *
 * ONE place decides what a valid event or obligation is (AGENTS.md §17: validate at
 * the boundary, never trust the client). HTML input attributes are a convenience
 * for the owner, never the check — every value that crosses into storage passes
 * through here first, so a hand-crafted POST is rejected exactly as a bad form is.
 *
 * Error messages name the offending FIELD but never echo its value: an Asset can
 * hold a policy number, a price or a private note, and an error message is a
 * disclosure surface like any other (§5, §17).
 *
 * Everything here is pure — no clock, no storage, no timezone. The caller supplies
 * the owner-calendar day where "today" matters (ADR-022 §22.7).
 */

import {
  MoneyValidationError,
  parseMoneyToMinorUnits,
  validateCurrencyCode,
} from "~/kernel/money";

import { DEFAULT_CURRENCY } from "./asset-validation";
import {
  ASSET_EVENT_CATEGORIES,
  DEFAULT_ASSET_EVENTS_PAGE_SIZE,
  MAX_ASSET_EVENTS_PAGE_SIZE,
  type AssetEventCategory,
  type AssetEventFilters,
  type CreateAssetEventInput,
  type UpdateAssetEventInput,
} from "./asset-event";
import { AssetValidationError } from "./asset-errors";
import type { AssetHistoryValidationField } from "./asset-errors";
import {
  validateMeterUnit,
  validateMeterValue,
  type AssetMeterUnit,
} from "./asset-meter";
import { isIsoDate } from "~/kernel/obligations";

/* -------------------------------------------------------------------------- */
/* Bounds                                                                     */
/* -------------------------------------------------------------------------- */

export const EVENT_TITLE_MAX_LENGTH = 200;
export const EVENT_DESCRIPTION_MAX_LENGTH = 20_000;
export const PROVIDER_MAX_LENGTH = 200;
const ID_MAX_LENGTH = 128;

const EVENT_CATEGORY_VALUES: ReadonlySet<string> = new Set(
  ASSET_EVENT_CATEGORIES,
);

function codePointLength(value: string): number {
  return [...value].length;
}

/* -------------------------------------------------------------------------- */
/* Small shared primitives                                                    */
/* -------------------------------------------------------------------------- */

function requiredText(
  value: unknown,
  field: AssetHistoryValidationField,
  maxLength: number,
): string {
  if (typeof value !== "string") {
    throw new AssetValidationError(field, "is required");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new AssetValidationError(field, "is required");
  }
  if (codePointLength(trimmed) > maxLength) {
    throw new AssetValidationError(
      field,
      `must be at most ${maxLength} characters`,
    );
  }
  return trimmed;
}

function optionalText(
  value: unknown,
  field: AssetHistoryValidationField,
  maxLength: number,
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new AssetValidationError(field, "must be a string");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (codePointLength(trimmed) > maxLength) {
    throw new AssetValidationError(
      field,
      `must be at most ${maxLength} characters`,
    );
  }
  return trimmed;
}

/** An optional canonical id reference (Person, Task, Note, obligation). */
function optionalId(
  value: unknown,
  field: AssetHistoryValidationField,
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new AssetValidationError(field, "is not a valid reference");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > ID_MAX_LENGTH) {
    throw new AssetValidationError(field, "is not a valid reference");
  }
  return trimmed;
}

/** A required wall-calendar date. */
export function validateEventDate(
  value: unknown,
  field: AssetHistoryValidationField = "eventDate",
): string {
  const text = requiredText(value, field, 10);
  if (!isIsoDate(text)) {
    throw new AssetValidationError(field, "must be a real calendar date");
  }
  return text;
}

/** An optional wall-calendar date. */
export function validateOptionalHistoryDate(
  value: unknown,
  field: AssetHistoryValidationField,
): string | null {
  const text = optionalText(value, field, 10);
  if (text === null) return null;
  if (!isIsoDate(text)) {
    throw new AssetValidationError(field, "must be a real calendar date");
  }
  return text;
}

/** An optional precise instant (ISO-8601). */
function optionalInstant(
  value: unknown,
  field: AssetHistoryValidationField,
): Date | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new AssetValidationError(field, "must be a time");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new AssetValidationError(field, "must be a valid time");
  }
  return parsed;
}

function optionalCurrency(
  value: unknown,
  field: AssetHistoryValidationField = "currencyCode",
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new AssetValidationError(field, "must be a string");
  }
  if (value.trim().length === 0) return null;
  try {
    return validateCurrencyCode(value, "currencyCode");
  } catch (cause) {
    if (cause instanceof MoneyValidationError) {
      throw new AssetValidationError(field, "must be a valid currency code");
    }
    throw cause;
  }
}

function optionalMoney(
  value: unknown,
  field: "cost" | "value",
  currencyCode: string,
): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new AssetValidationError(field, "must be an amount");
  }
  if (value.trim().length === 0) return null;
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

/* -------------------------------------------------------------------------- */
/* Vocabularies                                                               */
/* -------------------------------------------------------------------------- */

/** Validate an Asset Event category against the closed vocabulary. */
export function validateEventCategory(value: unknown): AssetEventCategory {
  if (typeof value !== "string" || !EVENT_CATEGORY_VALUES.has(value)) {
    throw new AssetValidationError(
      "category",
      "must be a supported event category",
    );
  }
  return value as AssetEventCategory;
}

/* -------------------------------------------------------------------------- */
/* Asset Event                                                                */
/* -------------------------------------------------------------------------- */

/** A fully validated event, ready for the storage adapter to bind. */
export type ValidatedAssetEvent = {
  readonly category: AssetEventCategory | undefined;
  readonly title: string | undefined;
  readonly eventDate: string | undefined;
  readonly completedAt: Date | null | undefined;
  readonly description: string | null | undefined;
  readonly provider: string | null | undefined;
  readonly personId: string | null | undefined;
  readonly costMinor: number | null | undefined;
  readonly valueMinor: number | null | undefined;
  readonly currencyCode: string | null | undefined;
  readonly meterValue: number | null | undefined;
  readonly meterUnit: AssetMeterUnit | null | undefined;
  readonly warrantyExpiry: string | null | undefined;
  readonly nextDueDate: string | null | undefined;
  readonly taskId: string | null | undefined;
  readonly noteId: string | null | undefined;
};

/** Whether we are validating a full create or a partial patch. */
export type ValidationMode = "create" | "update";

/**
 * Validate an Asset Event.
 *
 * The cross-field rules that matter:
 *   - A meter reading and its unit travel together. One without the other is
 *     meaningless and is rejected rather than half-stored.
 *   - Any amount requires an explicit currency (defaulted on create, never guessed
 *     on update), so a number is never stored unlabelled (§15).
 *   - `nextDueDate` must not fall before the event itself: "serviced today, next
 *     service last month" is not a thing that can be true (§20).
 */
export function validateAssetEvent(
  input: CreateAssetEventInput | UpdateAssetEventInput,
  mode: ValidationMode,
): ValidatedAssetEvent {
  const has = (key: string): boolean =>
    Object.prototype.hasOwnProperty.call(input, key) &&
    (input as Record<string, unknown>)[key] !== undefined;

  const category =
    mode === "create" || has("category")
      ? validateEventCategory((input as CreateAssetEventInput).category)
      : undefined;

  const title =
    mode === "create" || has("title")
      ? requiredText(input.title, "title", EVENT_TITLE_MAX_LENGTH)
      : undefined;

  const eventDate =
    mode === "create" || has("eventDate")
      ? validateEventDate((input as CreateAssetEventInput).eventDate)
      : undefined;

  const completedAt = has("completedAt")
    ? optionalInstant(input.completedAt, "completedAt")
    : mode === "create"
      ? null
      : undefined;

  const description = has("description")
    ? optionalText(
        input.description,
        "description",
        EVENT_DESCRIPTION_MAX_LENGTH,
      )
    : mode === "create"
      ? null
      : undefined;

  const provider = has("provider")
    ? optionalText(input.provider, "provider", PROVIDER_MAX_LENGTH)
    : mode === "create"
      ? null
      : undefined;

  const personId = has("personId")
    ? optionalId(input.personId, "personId")
    : mode === "create"
      ? null
      : undefined;

  const taskId = has("taskId")
    ? optionalId(input.taskId, "taskId")
    : mode === "create"
      ? null
      : undefined;

  const noteId = has("noteId")
    ? optionalId(input.noteId, "noteId")
    : mode === "create"
      ? null
      : undefined;

  // Currency first: an amount is parsed against it, never the other way round.
  const explicitCurrency = has("currencyCode")
    ? optionalCurrency(input.currencyCode)
    : null;
  const parseCurrency = explicitCurrency ?? DEFAULT_CURRENCY;

  const costMinor = has("cost")
    ? optionalMoney(input.cost, "cost", parseCurrency)
    : mode === "create"
      ? null
      : undefined;

  const valueMinor = has("value")
    ? optionalMoney(input.value, "value", parseCurrency)
    : mode === "create"
      ? null
      : undefined;

  // An amount without a currency is an unlabelled number: attach the currency it
  // was parsed against rather than storing a bare integer (mirrors the schema CHECK).
  let currencyCode: string | null | undefined = has("currencyCode")
    ? explicitCurrency
    : mode === "create"
      ? null
      : undefined;
  if (
    (typeof costMinor === "number" || typeof valueMinor === "number") &&
    (currencyCode === null || currencyCode === undefined)
  ) {
    currencyCode = parseCurrency;
  }

  const meterUnitProvided = has("meterUnit");
  const meterValueProvided = has("meterValue");
  let meterValue: number | null | undefined =
    mode === "create" ? null : undefined;
  let meterUnit: AssetMeterUnit | null | undefined =
    mode === "create" ? null : undefined;

  if (meterValueProvided || meterUnitProvided) {
    const rawValue = input.meterValue;
    const rawUnit = input.meterUnit;
    const clearingValue =
      rawValue === null ||
      (typeof rawValue === "string" && rawValue.trim() === "");
    const clearingUnit =
      rawUnit === null ||
      (typeof rawUnit === "string" && rawUnit.trim() === "");

    if (clearingValue && clearingUnit) {
      meterValue = null;
      meterUnit = null;
    } else if (clearingValue || clearingUnit) {
      // Half a reading is not a reading.
      throw new AssetValidationError(
        clearingUnit ? "meterUnit" : "meterValue",
        "is required when recording a meter reading",
      );
    } else {
      meterValue = validateMeterValue(rawValue, "meterValue");
      meterUnit = validateMeterUnit(rawUnit);
    }
  }

  const warrantyExpiry = has("warrantyExpiry")
    ? validateOptionalHistoryDate(input.warrantyExpiry, "warrantyExpiry")
    : mode === "create"
      ? null
      : undefined;

  const nextDueDate = has("nextDueDate")
    ? validateOptionalHistoryDate(input.nextDueDate, "nextDueDate")
    : mode === "create"
      ? null
      : undefined;

  // "Serviced today, next service due last month" cannot be true.
  if (
    typeof nextDueDate === "string" &&
    typeof eventDate === "string" &&
    nextDueDate < eventDate
  ) {
    throw new AssetValidationError(
      "nextDueDate",
      "cannot be before the event date",
    );
  }

  return {
    category,
    title,
    eventDate,
    completedAt,
    description,
    provider,
    personId,
    costMinor,
    valueMinor,
    currencyCode,
    meterValue,
    meterUnit,
    warrantyExpiry,
    nextDueDate,
    taskId,
    noteId,
  };
}

/* -------------------------------------------------------------------------- */
/* An obligation completion's ASSET-SPECIFIC extras                           */
/* -------------------------------------------------------------------------- */

/**
 * What completing an obligation records against an ASSET, beyond what every
 * obligation records.
 *
 * The general half — the completion date, the actual amount, the next due date,
 * whether to create a successor — moved to `~/kernel/obligations` in V2.10
 * LIFE-01 along with the domain it belongs to. What stayed is what only an
 * Asset's logbook has: who did the work, which Person, the meter reading at the
 * time, and the Note that documents it.
 */
export type ValidatedAssetCompletionExtras = {
  readonly description: string | null;
  readonly provider: string | null;
  readonly personId: string | null;
  readonly meterValue: number | null;
  readonly meterUnit: AssetMeterUnit | null;
  readonly noteId: string | null;
  /**
   * A cost supplied on the Asset side. The obligation's own recorded amount
   * wins where there is one; this is the path an Asset event takes when the
   * caller is recording a cost without an obligation amount.
   */
  readonly costMinor: number | null;
};

/** Validate the Asset-specific half of an obligation completion. */
export function validateAssetCompletionExtras(
  input: {
    readonly description?: string | null;
    readonly provider?: string | null;
    readonly personId?: string | null;
    readonly meterValue?: string | number | null;
    readonly meterUnit?: string | null;
    readonly noteId?: string | null;
    readonly cost?: string | null;
  },
  currencyCode: string,
): ValidatedAssetCompletionExtras {
  let meterValue: number | null = null;
  let meterUnit: AssetMeterUnit | null = null;
  const hasValue =
    input.meterValue !== undefined &&
    input.meterValue !== null &&
    String(input.meterValue).trim() !== "";
  const hasUnit =
    input.meterUnit !== undefined &&
    input.meterUnit !== null &&
    String(input.meterUnit).trim() !== "";
  if (hasValue !== hasUnit) {
    throw new AssetValidationError(
      hasUnit ? "meterValue" : "meterUnit",
      "is required when recording a meter reading",
    );
  }
  if (hasValue && hasUnit) {
    meterValue = validateMeterValue(input.meterValue, "meterValue");
    meterUnit = validateMeterUnit(input.meterUnit);
  }

  return {
    description: optionalText(
      input.description,
      "description",
      EVENT_DESCRIPTION_MAX_LENGTH,
    ),
    provider: optionalText(input.provider, "provider", PROVIDER_MAX_LENGTH),
    personId: optionalId(input.personId, "personId"),
    meterValue,
    meterUnit,
    noteId: optionalId(input.noteId, "noteId"),
    costMinor: optionalMoney(input.cost, "cost", currencyCode),
  };
}

/* -------------------------------------------------------------------------- */
/* Read inputs                                                                */
/* -------------------------------------------------------------------------- */

function clampLimit(value: unknown, fallback: number, max: number): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new AssetValidationError("limit", "must be a whole number");
  }
  if (value < 1) {
    throw new AssetValidationError("limit", "must be at least 1");
  }
  return Math.min(value, max);
}

/** Clamp an event page size into `[1, MAX_ASSET_EVENTS_PAGE_SIZE]`. */
export function validateEventsLimit(value: unknown): number {
  return clampLimit(
    value,
    DEFAULT_ASSET_EVENTS_PAGE_SIZE,
    MAX_ASSET_EVENTS_PAGE_SIZE,
  );
}

/** Validate the event-timeline filters, dropping unknown categories. */
export function validateEventFilters(value: AssetEventFilters | undefined): {
  readonly categories: readonly AssetEventCategory[];
  readonly includeArchived: boolean;
} {
  if (!value) return { categories: [], includeArchived: false };
  const categories: AssetEventCategory[] = [];
  for (const raw of value.categories ?? []) {
    // An unknown category in a URL is a stale bookmark, not an attack surface:
    // reject it explicitly so a filter never silently matches everything.
    categories.push(validateEventCategory(raw));
  }
  return {
    categories,
    includeArchived: value.includeArchived === true,
  };
}
