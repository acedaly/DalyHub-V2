/**
 * ASSET-01 — money kernel unit tests. Proves integer-safe minor-unit conversion
 * (no floating-point precision loss), currency validation and round-tripping.
 */

import { describe, expect, it } from "vitest";

import {
  formatMinorUnits,
  minorUnitsToDecimalString,
  MoneyValidationError,
  parseMoneyToMinorUnits,
  validateCurrencyCode,
  validateMinorUnits,
} from "~/kernel/money";

describe("parseMoneyToMinorUnits", () => {
  it("parses decimals to exact minor units without floats", () => {
    expect(parseMoneyToMinorUnits("1234.56", "AUD")).toBe(123456);
    expect(parseMoneyToMinorUnits("0.10", "AUD")).toBe(10);
    // The classic float trap: 0.1 + 0.2 stays exact through string arithmetic.
    expect(parseMoneyToMinorUnits("0.30", "AUD")).toBe(30);
    expect(parseMoneyToMinorUnits("1,000", "AUD")).toBe(100000);
    expect(parseMoneyToMinorUnits("$99", "AUD")).toBe(9900);
    expect(parseMoneyToMinorUnits("2000", "AUD")).toBe(200000);
  });

  it("returns null for blank input", () => {
    expect(parseMoneyToMinorUnits("", "AUD")).toBeNull();
    expect(parseMoneyToMinorUnits("   ", "AUD")).toBeNull();
  });

  it("rejects too many decimal places for the currency", () => {
    expect(() => parseMoneyToMinorUnits("12.999", "AUD")).toThrow(
      MoneyValidationError,
    );
  });

  it("honours a zero-decimal currency (JPY)", () => {
    expect(parseMoneyToMinorUnits("1500", "JPY")).toBe(1500);
    expect(() => parseMoneyToMinorUnits("15.5", "JPY")).toThrow(
      MoneyValidationError,
    );
  });

  it("rejects non-numeric junk", () => {
    expect(() => parseMoneyToMinorUnits("abc", "AUD")).toThrow(
      MoneyValidationError,
    );
  });
});

describe("round-trip", () => {
  it("formats minor units back to a decimal string exactly", () => {
    expect(minorUnitsToDecimalString(123456, "AUD")).toBe("1234.56");
    expect(minorUnitsToDecimalString(5, "AUD")).toBe("0.05");
    expect(minorUnitsToDecimalString(1500, "JPY")).toBe("1500");
  });

  it("formats a localised currency string for display", () => {
    const formatted = formatMinorUnits(123456, "AUD");
    expect(formatted).toContain("1,234.56");
  });
});

describe("validateCurrencyCode / validateMinorUnits", () => {
  it("normalises a valid ISO-4217 code", () => {
    expect(validateCurrencyCode("aud")).toBe("AUD");
  });
  it("rejects a malformed code", () => {
    expect(() => validateCurrencyCode("AUDD")).toThrow(MoneyValidationError);
    expect(() => validateCurrencyCode("12")).toThrow(MoneyValidationError);
  });
  it("rejects a non-integer minor amount", () => {
    expect(() => validateMinorUnits(1.5)).toThrow(MoneyValidationError);
    expect(validateMinorUnits(0)).toBe(0);
  });
});
