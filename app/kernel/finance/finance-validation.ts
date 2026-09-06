/**
 * V2.12 FIN-00 — the Finance boundary validators.
 *
 * Everything an untrusted caller can hand the repository passes through here
 * first: a form field, a query parameter, a stored row being re-read. The rules
 * are the schema's rules, expressed once so the owner gets a readable sentence
 * rather than a constraint violation — and the schema keeps them anyway, so a
 * validator that is wrong fails a write rather than corrupting one.
 *
 * Money goes through `~/kernel/money` and nothing else (ADR-049). There is no
 * float arithmetic anywhere in this file.
 *
 * Pure: no storage, no clock, no JSX.
 */

import {
  MAX_MONEY_MINOR_UNITS,
  MoneyValidationError,
  parseMoneyToMinorUnits,
  validateCurrencyCode,
} from "~/kernel/money";

import {
  isFinanceAccountType,
  type FinanceAccountStatus,
  type FinanceAccountType,
} from "./finance-account";
import {
  isFinanceCategoryKind,
  financeCategoryKey,
  type FinanceCategoryKind,
} from "./finance-category";
import { FinanceValidationError } from "./finance-errors";
import { isFinanceMonth, type FinanceMonth } from "./finance-month";
import {
  DEFAULT_TRANSACTIONS_PAGE_SIZE,
  MAX_TRANSACTIONS_PAGE_SIZE,
} from "./finance-transaction";

/** The longest identifier the Finance store accepts, matching the schema. */
export const FINANCE_ID_MAX_LENGTH = 64;

/** An owner-calendar ISO date, `YYYY-MM-DD`, and a real one. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Validate a required Finance identifier. */
export function validateFinanceId(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new FinanceValidationError(field, "must be an identifier");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new FinanceValidationError(field, "is required");
  }
  if (trimmed.length > FINANCE_ID_MAX_LENGTH) {
    throw new FinanceValidationError(field, "is not a valid identifier");
  }
  return trimmed;
}

/** Validate an optional identifier. `null`, `undefined` and `""` clear it. */
export function validateOptionalFinanceId(
  value: unknown,
  field: string,
): string | null {
  if (value === null || value === undefined || value === "") return null;
  return validateFinanceId(value, field);
}

/** Validate a required owner-calendar date. */
export function validateIsoDate(value: unknown, field: string): string {
  if (!isIsoDate(value)) {
    throw new FinanceValidationError(field, "must be a date");
  }
  return value;
}

/** Validate a `YYYY-MM` period. */
export function validateFinanceMonth(
  value: unknown,
  field = "month",
): FinanceMonth {
  if (!isFinanceMonth(value)) {
    throw new FinanceValidationError(field, "must be a month, like 2026-09");
  }
  return value;
}

/** Validate an account type against the closed set. */
export function validateAccountType(value: unknown): FinanceAccountType {
  if (!isFinanceAccountType(value)) {
    throw new FinanceValidationError(
      "accountType",
      "must be one of the account kinds DalyHub supports",
    );
  }
  return value;
}

/** Validate an account status. */
export function validateAccountStatus(value: unknown): FinanceAccountStatus {
  if (value === "open" || value === "closed") return value;
  throw new FinanceValidationError("status", "must be open or closed");
}

/** Validate a category kind. */
export function validateCategoryKind(value: unknown): FinanceCategoryKind {
  if (!isFinanceCategoryKind(value)) {
    throw new FinanceValidationError(
      "kind",
      "must say whether this is money out or money in",
    );
  }
  return value;
}

/** Validate a currency code, translating the money kernel's error. */
export function validateFinanceCurrency(
  value: unknown,
  field = "currencyCode",
): string {
  try {
    return validateCurrencyCode(value, field);
  } catch (cause) {
    throw new FinanceValidationError(
      field,
      cause instanceof MoneyValidationError
        ? cause.message.replace(`${field} `, "")
        : "must be a three-letter currency code",
    );
  }
}

/**
 * Parse a SIGNED amount the owner typed, in a currency.
 *
 * Signed, because the one convention is positive-in / negative-out and a
 * transaction may legitimately be either. A blank value is refused rather than
 * treated as zero: a transaction with no amount is not a transaction, and
 * quietly storing zero would put a row in the ledger that says nothing.
 */
export function validateSignedAmount(
  value: string | number | null | undefined,
  currencyCode: string,
  field = "amount",
): number {
  const raw = typeof value === "number" ? String(value) : (value?.trim() ?? "");
  if (raw === "") {
    throw new FinanceValidationError(field, "is required");
  }
  let minor: number | null;
  try {
    minor = parseMoneyToMinorUnits(raw, currencyCode, field);
  } catch (cause) {
    throw new FinanceValidationError(
      field,
      cause instanceof MoneyValidationError
        ? cause.message.replace(`${field} `, "")
        : "must be an amount of money",
    );
  }
  if (minor === null) {
    throw new FinanceValidationError(field, "is required");
  }
  if (Math.abs(minor) > MAX_MONEY_MINOR_UNITS) {
    throw new FinanceValidationError(field, "is larger than we can store");
  }
  return minor;
}

/**
 * Parse an amount that may be blank, and that may not be negative — an opening
 * balance may be either, but a BUDGET may not: a negative limit is not a thing.
 */
export function validateNonNegativeAmount(
  value: string | number | null | undefined,
  currencyCode: string,
  field: string,
): number {
  const minor = validateSignedAmount(value, currencyCode, field);
  if (minor < 0) {
    throw new FinanceValidationError(field, "cannot be negative");
  }
  return minor;
}

/**
 * Parse an opening balance, which MAY be negative (a card already owed on) and
 * which defaults to zero when blank — because "I am starting from nothing" is
 * the ordinary case and forcing the owner to type `0` is friction with no value.
 */
export function validateOpeningBalance(
  value: string | number | null | undefined,
  currencyCode: string,
): number {
  const raw = typeof value === "number" ? String(value) : (value?.trim() ?? "");
  if (raw === "") return 0;
  return validateSignedAmount(raw, currencyCode, "openingBalance");
}

/** Validate a bounded, required piece of owner text. */
export function validateText(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  if (typeof value !== "string") {
    throw new FinanceValidationError(field, "is required");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new FinanceValidationError(field, "is required");
  }
  if ([...trimmed].length > maxLength) {
    throw new FinanceValidationError(
      field,
      `must be ${maxLength} characters or fewer`,
    );
  }
  return trimmed;
}

/** Validate bounded optional owner text. `null`, `undefined` and `""` clear it. */
export function validateOptionalText(
  value: unknown,
  field: string,
  maxLength: number,
): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new FinanceValidationError(field, "must be text");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if ([...trimmed].length > maxLength) {
    throw new FinanceValidationError(
      field,
      `must be ${maxLength} characters or fewer`,
    );
  }
  return trimmed;
}

/** Validate a category name, returning the owner's spelling and its key. */
export function validateCategoryName(value: unknown): {
  readonly name: string;
  readonly nameKey: string;
} {
  const name = validateText(value, "name", 60);
  return { name, nameKey: financeCategoryKey(name) };
}

/** Clamp a page size to the contract's bounds. */
export function validateTransactionsLimit(value: unknown): number {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_TRANSACTIONS_PAGE_SIZE;
  }
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new FinanceValidationError(
      "limit",
      "must be a positive whole number",
    );
  }
  return Math.min(parsed, MAX_TRANSACTIONS_PAGE_SIZE);
}
