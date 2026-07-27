/**
 * ASSET-01 Money kernel — the storage-independent minor-units money helper.
 *
 * DalyHub had no monetary representation before Assets. Money is stored as an
 * INTEGER count of an ISO-4217 currency's MINOR UNITS (cents), never a float
 * (ADR-049): a floating-point amount silently loses precision (`0.1 + 0.2`), so
 * every amount that crosses this boundary is parsed into, compared as and
 * formatted from integer minor units. The paired currency code is a validated
 * three-letter ISO-4217 string. This module NEVER converts between currencies
 * (out of scope for ASSET-01) — it only stores and formats one amount in one
 * currency.
 *
 * It is intentionally dependency-light: pure functions, no D1, React, SQL or
 * storage types, so both the kernel validators and the client view-models import
 * it. Parsing is integer-safe (string arithmetic on the decimal parts), so a
 * user's "1,234.56" becomes exactly `123456` with no float multiplication.
 */

/** Thrown when a monetary value crossing the boundary is malformed. */
export class MoneyValidationError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = "MoneyValidationError";
  }
}

/** The default minor-unit exponent (cents) when a currency's is unknown. */
const DEFAULT_MINOR_DIGITS = 2;

/** Largest amount we accept, in minor units — a guard against absurd input
 * (≈ 9.0e13 minor units, i.e. 900 billion major units). Keeps the value well
 * within a safe integer and a D1 INTEGER column. */
export const MAX_MONEY_MINOR_UNITS = 90_000_000_000_000;

/**
 * The number of minor-unit digits an ISO-4217 currency uses (2 for most, 0 for
 * JPY, 3 for BHD). Resolved via `Intl.NumberFormat`, which ships the CLDR
 * currency data in the Workers runtime; falls back to 2 for an unknown code.
 */
export function currencyMinorDigits(currencyCode: string): number {
  try {
    const options = new Intl.NumberFormat("en", {
      style: "currency",
      currency: currencyCode,
    }).resolvedOptions();
    return options.maximumFractionDigits ?? DEFAULT_MINOR_DIGITS;
  } catch {
    return DEFAULT_MINOR_DIGITS;
  }
}

/**
 * Validate an ISO-4217 currency code: exactly three ASCII letters, upper-cased.
 * Returns the normalised code. A blank value is a caller error here (the caller
 * decides whether a currency is required); use it only once a code is present.
 */
export function validateCurrencyCode(
  value: unknown,
  field = "currencyCode",
): string {
  if (typeof value !== "string") {
    throw new MoneyValidationError(field, "must be a currency code");
  }
  const trimmed = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(trimmed)) {
    throw new MoneyValidationError(
      field,
      "must be a 3-letter ISO-4217 currency code",
    );
  }
  return trimmed;
}

/**
 * Parse a human money string ("1,234.56", "$1234", "1234.5") into integer minor
 * units for `currencyCode`, WITHOUT floating-point arithmetic (the decimal parts
 * are combined as integer strings). Returns `null` for a blank input. Throws
 * `MoneyValidationError` for a malformed value or one with more fractional digits
 * than the currency allows.
 */
export function parseMoneyToMinorUnits(
  value: string,
  currencyCode: string,
  field = "amount",
): number | null {
  const cleaned = value.trim().replace(/[\s,]/g, "");
  if (cleaned.length === 0) {
    return null;
  }
  // Optional leading currency symbol/sign, digits, optional single decimal part.
  const match = /^(-?)(?:\p{Sc})?(-?)(\d+)(?:\.(\d+))?$/u.exec(cleaned);
  if (!match) {
    throw new MoneyValidationError(field, "must be a valid amount");
  }
  const negative = match[1] === "-" || match[2] === "-";
  const whole = match[3];
  const fraction = match[4] ?? "";
  const digits = currencyMinorDigits(currencyCode);
  if (fraction.length > digits) {
    throw new MoneyValidationError(
      field,
      `must have at most ${digits} decimal place${digits === 1 ? "" : "s"}`,
    );
  }
  const paddedFraction = fraction.padEnd(digits, "0");
  // Integer-safe: concatenate the whole and (padded) fractional digit strings.
  const combined = `${whole}${paddedFraction}`.replace(/^0+(?=\d)/, "");
  const minor = Number.parseInt(combined, 10);
  if (!Number.isSafeInteger(minor) || minor > MAX_MONEY_MINOR_UNITS) {
    throw new MoneyValidationError(field, "is too large");
  }
  if (minor === 0) {
    return 0;
  }
  return negative ? -minor : minor;
}

/**
 * Render integer minor units back to a plain decimal string ("123.45") for
 * editing a form field — no currency symbol, no grouping, exact.
 */
export function minorUnitsToDecimalString(
  minor: number,
  currencyCode: string,
): string {
  const digits = currencyMinorDigits(currencyCode);
  if (digits === 0) {
    return String(minor);
  }
  const negative = minor < 0;
  const abs = Math.abs(minor)
    .toString()
    .padStart(digits + 1, "0");
  const whole = abs.slice(0, abs.length - digits);
  const fraction = abs.slice(abs.length - digits);
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/**
 * Format integer minor units as a localised currency string ("$1,234.56") for
 * display. Never used in collection cards by default (price is private, §17); the
 * record's Acquisition group opts into it explicitly.
 */
export function formatMinorUnits(
  minor: number,
  currencyCode: string,
  locale = "en-AU",
): string {
  const digits = currencyMinorDigits(currencyCode);
  const major = minor / 10 ** digits;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode,
    }).format(major);
  } catch {
    // Unknown currency: fall back to the exact decimal + code, still no float
    // rounding beyond the display divide.
    return `${minorUnitsToDecimalString(minor, currencyCode)} ${currencyCode}`;
  }
}

/**
 * Validate an already-stored/entered integer minor-unit amount (not a decimal
 * string). Returns the integer, or throws. Used by the repository boundary when a
 * caller supplies minor units directly.
 */
export function validateMinorUnits(value: unknown, field = "amount"): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new MoneyValidationError(
      field,
      "must be an integer minor-unit amount",
    );
  }
  if (Math.abs(value) > MAX_MONEY_MINOR_UNITS) {
    throw new MoneyValidationError(field, "is too large");
  }
  return value;
}
