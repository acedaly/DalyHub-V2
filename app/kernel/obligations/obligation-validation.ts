/**
 * V2.10 LIFE-01 Obligations kernel — canonical validation for an Obligation.
 *
 * ONE place decides what a valid obligation is (AGENTS.md §17: validate at the
 * boundary, never trust the client). HTML input attributes are a convenience
 * for the owner, never the check — every value that crosses into storage passes
 * through here first, so a hand-crafted POST is rejected exactly as a bad form
 * is.
 *
 * Error messages name the offending FIELD but never echo its value: an
 * obligation can hold a policy number, an amount or a private note, and an
 * error message is a disclosure surface like any other (§5, §17).
 *
 * This module was `app/kernel/assets/asset-history-validation.ts`'s obligation
 * half until V2.10 LIFE-01. It moved because it validates a domain that no
 * longer belongs to Assets, and it throws `ObligationValidationError` rather
 * than `AssetValidationError` for the same reason: a tax return has no Asset
 * for a refusal to be about. The Assets module keeps its own validators for
 * Asset EVENTS, and the two sets of small private text/number primitives are
 * two implementations of nothing — they validate different fields for different
 * domains and neither is an authority the other could contradict.
 *
 * The METER is validated here by shape only — a non-negative bounded integer
 * and a unit from a set the CALLER supplies — because the unit vocabulary
 * belongs to the domain that owns the meter. The Assets module passes its five
 * units in; the kernel never learns what a kilometre is.
 *
 * Everything here is pure — no clock, no storage, no timezone. The caller
 * supplies the owner-calendar day where "today" matters (ADR-022 §22.7).
 */

import {
  MoneyValidationError,
  parseMoneyToMinorUnits,
  validateCurrencyCode,
} from "~/kernel/money";

import {
  OBLIGATION_CATEGORIES,
  type ObligationCategory,
} from "./obligation-category";
import { ObligationValidationError } from "./obligation-errors";
import {
  MAX_RECURRENCE_INTERVAL,
  OBLIGATION_RECURRENCE_KINDS,
  isIsoDate,
  type ObligationRecurrenceKind,
} from "./obligation-recurrence";
import {
  OBLIGATION_STATUSES,
  type ObligationStatus,
} from "./obligation-status";
import {
  DEFAULT_OBLIGATIONS_PAGE_SIZE,
  MAX_OBLIGATIONS_PAGE_SIZE,
  type CompleteObligationInput,
  type CreateObligationInput,
  type ObligationFilters,
  type UpdateObligationInput,
} from "./obligation";

/* -------------------------------------------------------------------------- */
/* Bounds                                                                     */
/* -------------------------------------------------------------------------- */

export const OBLIGATION_TITLE_MAX_LENGTH = 200;
export const OBLIGATION_DESCRIPTION_MAX_LENGTH = 4_000;
export const MAX_LEAD_DAYS = 365;
export const DEFAULT_LEAD_DAYS = 14;
/** The largest meter value or interval the store accepts. */
export const MAX_METER_VALUE = 100_000_000;
const ID_MAX_LENGTH = 128;

const OBLIGATION_CATEGORY_VALUES: ReadonlySet<string> = new Set(
  OBLIGATION_CATEGORIES,
);
const OBLIGATION_STATUS_VALUES: ReadonlySet<string> = new Set(
  OBLIGATION_STATUSES,
);
const RECURRENCE_KIND_VALUES: ReadonlySet<string> = new Set(
  OBLIGATION_RECURRENCE_KINDS,
);

function codePointLength(value: string): number {
  return [...value].length;
}

/* -------------------------------------------------------------------------- */
/* Small private primitives                                                   */
/* -------------------------------------------------------------------------- */

function requiredText(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  if (typeof value !== "string") {
    throw new ObligationValidationError(field, "is required");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ObligationValidationError(field, "is required");
  }
  if (codePointLength(trimmed) > maxLength) {
    throw new ObligationValidationError(
      field,
      `must be at most ${maxLength} characters`,
    );
  }
  return trimmed;
}

function optionalText(
  value: unknown,
  field: string,
  maxLength: number,
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new ObligationValidationError(field, "must be a string");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (codePointLength(trimmed) > maxLength) {
    throw new ObligationValidationError(
      field,
      `must be at most ${maxLength} characters`,
    );
  }
  return trimmed;
}

/** An optional canonical id reference (a subject, a Task, a Note, a Person). */
export function validateOptionalObligationId(
  value: unknown,
  field: string,
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new ObligationValidationError(field, "is not a valid reference");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > ID_MAX_LENGTH) {
    throw new ObligationValidationError(field, "is not a valid reference");
  }
  return trimmed;
}

/** A required id reference. */
export function validateObligationId(value: unknown): string {
  const id = validateOptionalObligationId(value, "id");
  if (id === null) {
    throw new ObligationValidationError("id", "is required");
  }
  return id;
}

/** A required wall-calendar date. */
export function validateObligationDate(value: unknown, field: string): string {
  const text = requiredText(value, field, 10);
  if (!isIsoDate(text)) {
    throw new ObligationValidationError(field, "must be a real calendar date");
  }
  return text;
}

/** An optional wall-calendar date. */
export function validateOptionalObligationDate(
  value: unknown,
  field: string,
): string | null {
  const text = optionalText(value, field, 10);
  if (text === null) return null;
  if (!isIsoDate(text)) {
    throw new ObligationValidationError(field, "must be a real calendar date");
  }
  return text;
}

function optionalCurrency(
  value: unknown,
  field = "currencyCode",
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new ObligationValidationError(field, "must be a string");
  }
  if (value.trim().length === 0) return null;
  try {
    return validateCurrencyCode(value, "currencyCode");
  } catch (cause) {
    if (cause instanceof MoneyValidationError) {
      throw new ObligationValidationError(
        field,
        "must be a valid currency code",
      );
    }
    throw cause;
  }
}

function optionalMoney(
  value: unknown,
  field: string,
  currencyCode: string,
): number | null {
  if (value === undefined || value === null) return null;
  const text = typeof value === "number" ? String(value) : value;
  if (typeof text !== "string") {
    throw new ObligationValidationError(field, "must be an amount");
  }
  if (text.trim().length === 0) return null;
  let minor: number | null;
  try {
    minor = parseMoneyToMinorUnits(text, currencyCode, field);
  } catch (cause) {
    if (cause instanceof MoneyValidationError) {
      throw new ObligationValidationError(
        field,
        cause.message.replace(/^.*?: /, ""),
      );
    }
    throw cause;
  }
  if (minor !== null && minor < 0) {
    throw new ObligationValidationError(field, "must not be negative");
  }
  return minor;
}

function optionalInteger(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number | null {
  if (value === undefined || value === null) return null;
  let numeric: number;
  if (typeof value === "number") {
    numeric = value;
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    if (!/^\d+$/.test(trimmed)) {
      throw new ObligationValidationError(field, "must be a whole number");
    }
    numeric = Number.parseInt(trimmed, 10);
  } else {
    throw new ObligationValidationError(field, "must be a whole number");
  }
  if (!Number.isInteger(numeric)) {
    throw new ObligationValidationError(field, "must be a whole number");
  }
  if (numeric < min || numeric > max) {
    throw new ObligationValidationError(
      field,
      `must be between ${min} and ${max}`,
    );
  }
  return numeric;
}

/**
 * A meter reading or threshold: a bounded non-negative integer. The UNIT is
 * checked against the set the caller supplies, because the vocabulary belongs
 * to the domain that owns the meter.
 */
export function validateObligationMeterValue(
  value: unknown,
  field: string,
): number {
  const numeric = optionalInteger(value, field, 0, MAX_METER_VALUE);
  if (numeric === null) {
    throw new ObligationValidationError(field, "is required");
  }
  return numeric;
}

/** The meter units a caller will accept. Supplied by the owning domain. */
export type MeterUnitVocabulary = readonly string[];

export function validateObligationMeterUnit(
  value: unknown,
  units: MeterUnitVocabulary,
  field = "meterUnit",
): string {
  if (typeof value !== "string" || !units.includes(value)) {
    throw new ObligationValidationError(field, "must be a supported unit");
  }
  return value;
}

/* -------------------------------------------------------------------------- */
/* Vocabularies                                                               */
/* -------------------------------------------------------------------------- */

/** Validate an obligation category against the closed vocabulary. */
export function validateObligationCategory(value: unknown): ObligationCategory {
  if (typeof value !== "string" || !OBLIGATION_CATEGORY_VALUES.has(value)) {
    throw new ObligationValidationError(
      "category",
      "must be a supported obligation category",
    );
  }
  return value as ObligationCategory;
}

/** Validate a stored obligation status. */
export function validateObligationStatus(value: unknown): ObligationStatus {
  if (typeof value !== "string" || !OBLIGATION_STATUS_VALUES.has(value)) {
    throw new ObligationValidationError("status", "must be a supported status");
  }
  return value as ObligationStatus;
}

/** Validate a recurrence kind. */
export function validateRecurrenceKind(
  value: unknown,
): ObligationRecurrenceKind {
  if (typeof value !== "string" || !RECURRENCE_KIND_VALUES.has(value)) {
    throw new ObligationValidationError(
      "recurrenceKind",
      "must be a supported recurrence",
    );
  }
  return value as ObligationRecurrenceKind;
}

/** The mode a validator runs in: a create supplies defaults, an update patches. */
export type ValidationMode = "create" | "update";

/* -------------------------------------------------------------------------- */
/* The obligation                                                             */
/* -------------------------------------------------------------------------- */

/** A fully validated obligation, ready for the storage adapter to bind. */
export type ValidatedObligation = {
  readonly category: ObligationCategory | undefined;
  readonly title: string | undefined;
  readonly description: string | null | undefined;
  readonly dueDate: string | null | undefined;
  readonly leadDays: number | undefined;
  readonly recurrenceKind: ObligationRecurrenceKind | undefined;
  readonly recurrenceInterval: number | null | undefined;
  readonly meterThreshold: number | null | undefined;
  readonly meterInterval: number | null | undefined;
  readonly meterUnit: string | null | undefined;
  /** What it is EXPECTED to cost. Never a claim that anything was paid. */
  readonly expectedAmountMinor: number | null | undefined;
  readonly currencyCode: string | null | undefined;
};

/**
 * Validate an Obligation.
 *
 * The cross-field rules that matter:
 *   - Every obligation must commit to SOMETHING — a due date, a meter threshold,
 *     or both. An obligation with neither could never become due.
 *   - A meter threshold and its unit travel together, and a meter recurrence needs
 *     an interval to advance by.
 *   - A date recurrence needs an interval and a due date to advance FROM.
 *   - Intervals are bounded integers. "Every 0 months" would never advance;
 *     "every 100000 years" is a typo, not a plan.
 */
export function validateObligation(
  input: CreateObligationInput | UpdateObligationInput,
  mode: ValidationMode,
  /** The stored values, so an update's cross-field rules see the merged record. */
  existing?: {
    readonly dueDate: string | null;
    readonly meterThreshold: number | null;
    readonly meterUnit: string | null;
    readonly meterInterval: number | null;
    readonly recurrenceKind: ObligationRecurrenceKind;
    readonly currencyCode?: string | null;
    /** The stored amounts, so a currency change cannot silently relabel them. */
    readonly expectedAmountMinor?: number | null;
    readonly completedAmountMinor?: number | null;
  },
  /** The meter units this caller accepts. Empty means "no meter here". */
  meterUnits: MeterUnitVocabulary = [],
): ValidatedObligation {
  const has = (key: string): boolean =>
    Object.prototype.hasOwnProperty.call(input, key) &&
    (input as Record<string, unknown>)[key] !== undefined;

  const category =
    mode === "create" || has("category")
      ? validateObligationCategory((input as CreateObligationInput).category)
      : undefined;

  const title =
    mode === "create" || has("title")
      ? requiredText(input.title, "title", OBLIGATION_TITLE_MAX_LENGTH)
      : undefined;

  const description = has("description")
    ? optionalText(
        input.description,
        "description",
        OBLIGATION_DESCRIPTION_MAX_LENGTH,
      )
    : mode === "create"
      ? null
      : undefined;

  const dueDate = has("dueDate")
    ? validateOptionalObligationDate(input.dueDate, "dueDate")
    : mode === "create"
      ? null
      : undefined;

  const leadDaysRaw = has("leadDays")
    ? optionalInteger(input.leadDays, "leadDays", 0, MAX_LEAD_DAYS)
    : undefined;
  const leadDays =
    leadDaysRaw !== undefined && leadDaysRaw !== null
      ? leadDaysRaw
      : mode === "create"
        ? DEFAULT_LEAD_DAYS
        : undefined;

  const recurrenceKind = has("recurrenceKind")
    ? validateRecurrenceKind(input.recurrenceKind)
    : mode === "create"
      ? ("none" as ObligationRecurrenceKind)
      : undefined;

  const recurrenceIntervalRaw = has("recurrenceInterval")
    ? optionalInteger(
        input.recurrenceInterval,
        "recurrenceInterval",
        1,
        MAX_RECURRENCE_INTERVAL,
      )
    : undefined;

  const meterUnitProvided = has("meterUnit");
  const meterThresholdProvided = has("meterThreshold");
  let meterThreshold: number | null | undefined =
    mode === "create" ? null : undefined;
  let meterUnit: string | null | undefined =
    mode === "create" ? null : undefined;

  if (meterThresholdProvided || meterUnitProvided) {
    const rawThreshold = input.meterThreshold;
    const rawUnit = input.meterUnit;
    const clearingThreshold =
      rawThreshold === null ||
      (typeof rawThreshold === "string" && rawThreshold.trim() === "");
    const clearingUnit =
      rawUnit === null ||
      (typeof rawUnit === "string" && rawUnit.trim() === "");
    if (clearingThreshold && clearingUnit) {
      meterThreshold = null;
      meterUnit = null;
    } else if (clearingThreshold || clearingUnit) {
      throw new ObligationValidationError(
        clearingUnit ? "meterUnit" : "meterThreshold",
        "is required when setting a meter target",
      );
    } else {
      meterThreshold = validateObligationMeterValue(
        rawThreshold,
        "meterThreshold",
      );
      meterUnit = validateObligationMeterUnit(rawUnit, meterUnits);
    }
  }

  const meterInterval = has("meterInterval")
    ? optionalInteger(input.meterInterval, "meterInterval", 1, MAX_METER_VALUE)
    : mode === "create"
      ? null
      : undefined;

  /* -- Cross-field rules over the MERGED record ---------------------------- */

  const mergedDue =
    dueDate !== undefined ? dueDate : (existing?.dueDate ?? null);
  const mergedThreshold =
    meterThreshold !== undefined
      ? meterThreshold
      : (existing?.meterThreshold ?? null);
  const mergedUnit =
    meterUnit !== undefined ? meterUnit : (existing?.meterUnit ?? null);
  const mergedKind =
    recurrenceKind !== undefined
      ? recurrenceKind
      : (existing?.recurrenceKind ?? "none");
  const mergedMeterInterval =
    meterInterval !== undefined
      ? meterInterval
      : (existing?.meterInterval ?? null);

  if (mergedDue === null && mergedThreshold === null) {
    throw new ObligationValidationError(
      "dueDate",
      "is required unless a meter target is set",
    );
  }

  // A meter threshold needs a unit even when they arrived in separate patches.
  if ((mergedThreshold === null) !== (mergedUnit === null)) {
    throw new ObligationValidationError(
      mergedUnit === null ? "meterUnit" : "meterThreshold",
      "is required when setting a meter target",
    );
  }

  let recurrenceInterval: number | null | undefined = recurrenceIntervalRaw;
  if (mergedKind === "none" || mergedKind === "meter") {
    // A date interval is meaningless for these kinds: clear it rather than
    // storing a value the schema forbids.
    if (recurrenceKind !== undefined || recurrenceIntervalRaw !== undefined) {
      recurrenceInterval = null;
    }
    if (mergedKind === "meter") {
      if (mergedThreshold === null || mergedUnit === null) {
        throw new ObligationValidationError(
          "meterThreshold",
          "is required for a meter-based repeat",
        );
      }
      if (mergedMeterInterval === null) {
        throw new ObligationValidationError(
          "meterInterval",
          "is required for a meter-based repeat",
        );
      }
    }
  } else {
    if (recurrenceInterval === undefined || recurrenceInterval === null) {
      // Default a repeating rule to "every 1", which is what the words say.
      recurrenceInterval = 1;
    }
    if (mergedDue === null) {
      throw new ObligationValidationError(
        "dueDate",
        "is required for a date-based repeat",
      );
    }
  }

  /* -- Money ---------------------------------------------------------------
   * An expected amount is not a payment and never becomes one here (ADR-118
   * decision 2). One currency covers both amounts; a caller supplying an amount
   * without a currency is refused rather than defaulted, because guessing a
   * currency is guessing a figure.
   */
  const currencyProvided = has("currencyCode");
  const amountProvided = has("expectedAmount");
  let currencyCode: string | null | undefined = currencyProvided
    ? optionalCurrency(input.currencyCode)
    : mode === "create"
      ? null
      : undefined;
  let expectedAmountMinor: number | null | undefined =
    mode === "create" ? null : undefined;

  /*
   * A CURRENCY IS A LABEL ON A NUMBER, and this product never converts
   * (ADR-049). So a currency change on an obligation that already holds an
   * amount is refused rather than applied: relabelling 1000 minor units from
   * AUD to USD leaves the figure wrong rather than missing, which is worse, and
   * it does it silently. Clearing the currency out from under a stored amount
   * is the same refusal from the other side — it reaches the database CHECK
   * otherwise, and surfaces as a storage error rather than as the field it is
   * about.
   *
   * `validateObligationCompletion` already refuses the same thing in the same
   * words. This is the update path catching up with it.
   */
  if (mode === "update" && currencyProvided) {
    const storedAmount =
      existing?.expectedAmountMinor ?? existing?.completedAmountMinor ?? null;
    const restated =
      amountProvided &&
      !(
        input.expectedAmount === null ||
        (typeof input.expectedAmount === "string" &&
          input.expectedAmount.trim() === "")
      );
    const clearingAmount = amountProvided && !restated;
    const changing =
      (currencyCode ?? null) !== (existing?.currencyCode ?? null);
    if (
      storedAmount !== null &&
      changing &&
      !restated &&
      !(clearingAmount && existing?.completedAmountMinor == null)
    ) {
      throw new ObligationValidationError(
        "currencyCode",
        existing?.currencyCode
          ? `is already ${existing.currencyCode} on this obligation, and amounts are never converted`
          : "cannot be changed while an amount is recorded",
      );
    }
  }

  if (amountProvided) {
    const raw = input.expectedAmount;
    const clearing =
      raw === null || (typeof raw === "string" && raw.trim() === "");
    if (clearing) {
      expectedAmountMinor = null;
    } else {
      const effective = currencyCode ?? existing?.currencyCode ?? null;
      if (effective === null) {
        throw new ObligationValidationError(
          "currencyCode",
          "is needed before an amount can be recorded",
        );
      }
      expectedAmountMinor = optionalMoney(raw, "expectedAmount", effective);
      currencyCode = effective;
    }
  }

  return {
    category,
    title,
    description,
    dueDate,
    leadDays,
    recurrenceKind,
    recurrenceInterval,
    meterThreshold,
    meterInterval,
    meterUnit,
    expectedAmountMinor,
    currencyCode,
  };
}

/* -------------------------------------------------------------------------- */
/* Completion                                                                 */
/* -------------------------------------------------------------------------- */

/** A validated completion request, in the terms every subject shares. */
export type ValidatedObligationCompletion = {
  /** The owner-calendar day the work was done, or null for "today". */
  readonly completedOn: string | null;
  readonly title: string | null;
  readonly description: string | null;
  /** What it ACTUALLY cost. Optional even for a money-bearing obligation. */
  readonly completedAmountMinor: number | null;
  readonly currencyCode: string | null;
  readonly nextDueDate: string | null;
  readonly createSuccessor: boolean;
  /**
   * V2.12 FIN-04 — the transaction that PAID it, when the owner named one. The
   * repository resolves it through `ObligationSettlementGateway` and takes the
   * actual amount and day from it.
   */
  readonly settledByTransactionId: string | null;
};

/**
 * Validate a completion request.
 *
 * `existingCurrency` is the obligation's own currency. A completion in a
 * DIFFERENT currency is refused rather than converted: the product does not
 * convert (ADR-049), and storing the new figure under the old code would make
 * the stored amount wrong rather than missing, which is worse.
 */
export function validateObligationCompletion(
  input: CompleteObligationInput,
  existingCurrency: string | null = null,
): ValidatedObligationCompletion {
  const completedOn =
    input.completedOn === undefined
      ? null
      : validateObligationDate(input.completedOn, "completedOn");

  const explicitCurrency = optionalCurrency(input.currencyCode);
  if (
    explicitCurrency !== null &&
    existingCurrency !== null &&
    explicitCurrency !== existingCurrency
  ) {
    throw new ObligationValidationError(
      "currencyCode",
      `is already ${existingCurrency} on this obligation, and amounts are never converted`,
    );
  }

  const settledByTransactionId = validateOptionalObligationId(
    input.settledByTransactionId,
    "settledByTransactionId",
  );

  const effectiveCurrency = explicitCurrency ?? existingCurrency;
  const rawAmount = input.completedAmount;
  const hasAmount =
    rawAmount !== undefined &&
    rawAmount !== null &&
    String(rawAmount).trim() !== "";

  /*
   * V2.12 FIN-04 — when a transaction settles the obligation, the bank is the
   * authority for what was actually paid and when. Accepting a typed amount
   * beside it would give the completion two sources for one figure and no rule
   * for which wins, so the second is refused rather than silently ignored.
   */
  if (settledByTransactionId !== null && hasAmount) {
    throw new ObligationValidationError(
      "completedAmount",
      "comes from the transaction that settled this, so it cannot also be typed in",
    );
  }
  if (settledByTransactionId !== null && completedOn !== null) {
    throw new ObligationValidationError(
      "completedOn",
      "comes from the transaction that settled this, so it cannot also be chosen",
    );
  }
  if (hasAmount && effectiveCurrency === null) {
    throw new ObligationValidationError(
      "currencyCode",
      "is needed before an amount can be recorded",
    );
  }
  const completedAmountMinor = hasAmount
    ? optionalMoney(rawAmount, "completedAmount", effectiveCurrency as string)
    : null;

  return {
    completedOn,
    title: optionalText(input.title, "title", OBLIGATION_TITLE_MAX_LENGTH),
    description: optionalText(
      input.description,
      "description",
      OBLIGATION_DESCRIPTION_MAX_LENGTH,
    ),
    completedAmountMinor,
    currencyCode:
      completedAmountMinor === null ? explicitCurrency : effectiveCurrency,
    nextDueDate: validateOptionalObligationDate(
      input.nextDueDate,
      "nextDueDate",
    ),
    createSuccessor: input.createSuccessor !== false,
    settledByTransactionId,
  };
}

/* -------------------------------------------------------------------------- */
/* Read inputs                                                                */
/* -------------------------------------------------------------------------- */

function clampLimit(value: unknown, fallback: number, max: number): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ObligationValidationError("limit", "must be a whole number");
  }
  if (value < 1) {
    throw new ObligationValidationError("limit", "must be at least 1");
  }
  return Math.min(value, max);
}

/** Clamp an obligation page size into `[1, MAX_OBLIGATIONS_PAGE_SIZE]`. */
export function validateObligationsLimit(value: unknown): number {
  return clampLimit(
    value,
    DEFAULT_OBLIGATIONS_PAGE_SIZE,
    MAX_OBLIGATIONS_PAGE_SIZE,
  );
}

/** Validate the obligation filters, refusing an unknown value rather than
 * silently matching everything. */
export function validateObligationFilters(
  value: ObligationFilters | undefined,
): {
  readonly categories: readonly ObligationCategory[];
  readonly statuses: readonly ObligationStatus[];
} {
  if (!value) return { categories: [], statuses: [] };
  const categories = (value.categories ?? []).map(validateObligationCategory);
  const statuses = (value.statuses ?? []).map(validateObligationStatus);
  return { categories, statuses };
}
