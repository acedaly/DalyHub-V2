/**
 * V2.10 LIFE-01 Obligations kernel — the expected amount, and the actual one.
 *
 * Money is integer MINOR UNITS plus an ISO-4217 code, never a float and never
 * converted ([ADR-049] decision 2). This module validates the pair at the
 * obligation boundary and holds the one rule that makes two amounts safe:
 *
 *   EXPECTED is what it is expected to cost. It is never a claim that anything
 *   was paid, and V2.10 has no settlement — a transaction linked to an
 *   obligation is V2.12's, and until then an amount on an obligation means
 *   exactly "this is what I expect this to cost".
 *
 *   COMPLETED is what it actually cost, recorded at completion as proof. It
 *   cannot exist on an obligation that was never completed, and the database
 *   says so too.
 *
 * ONE CURRENCY covers both. An actual amount in a different currency is
 * REFUSED with a named error rather than converted: the product does not
 * convert, and silently storing two currencies under one code would be the
 * first place a total could be wrong. An obligation with no currency takes the
 * one from the first amount recorded.
 *
 * Amounts are SENSITIVE. Nothing here formats for display beyond the shared
 * money helper, and no caller may put an amount into a Search excerpt, an
 * Activity payload, a notification, the digest, Today, a log or telemetry.
 *
 * Pure: no storage, no clock, no JSX.
 */

import {
  MAX_MONEY_MINOR_UNITS,
  MoneyValidationError,
  parseMoneyToMinorUnits,
  validateCurrencyCode,
} from "~/kernel/money";

import { ObligationValidationError } from "./obligation-errors";

/** An amount and the currency it is in. Both, or neither. */
export type ObligationAmount = {
  readonly minorUnits: number;
  readonly currencyCode: string;
};

/**
 * Normalise an optional amount + currency pair.
 *
 *   - both absent  → null (an obligation need not cost anything)
 *   - amount alone → refused, naming the currency field: an amount with no
 *                    currency is a number, not money
 *   - currency alone → accepted as a currency with no amount yet, so an owner
 *                    can say "this will be in AUD" before knowing how much
 */
export function validateObligationAmount(
  amount: string | number | null | undefined,
  currencyCode: string | null | undefined,
  field: "expectedAmount" | "completedAmount",
): ObligationAmount | null {
  const rawAmount =
    typeof amount === "number" ? String(amount) : (amount?.trim() ?? "");
  if (rawAmount === "") return null;

  const code = currencyCode?.trim() ?? "";
  if (code === "") {
    throw new ObligationValidationError(
      "currencyCode",
      "is needed before an amount can be recorded",
    );
  }

  let normalisedCode: string;
  try {
    normalisedCode = validateCurrencyCode(code, "currencyCode");
  } catch (cause) {
    throw new ObligationValidationError(
      "currencyCode",
      cause instanceof MoneyValidationError
        ? cause.message
        : "must be a three-letter currency code",
    );
  }

  let minorUnits: number | null;
  try {
    minorUnits = parseMoneyToMinorUnits(rawAmount, normalisedCode, field);
  } catch (cause) {
    throw new ObligationValidationError(
      field,
      cause instanceof MoneyValidationError
        ? cause.message
        : "must be an amount of money",
    );
  }

  if (minorUnits === null) return null;
  if (minorUnits < 0) {
    throw new ObligationValidationError(field, "cannot be negative");
  }
  if (minorUnits > MAX_MONEY_MINOR_UNITS) {
    throw new ObligationValidationError(field, "is larger than we can store");
  }

  return { minorUnits, currencyCode: normalisedCode };
}

/**
 * The currency an obligation ends up with, given the one it already has and the
 * one an amount is being recorded in.
 *
 * A mismatch is REFUSED. The alternative — converting — is out of scope by
 * ADR-049; the other alternative — storing the new amount under the old code —
 * would make the stored figure wrong rather than missing, which is worse.
 */
export function reconcileObligationCurrency(
  existing: string | null,
  incoming: string | null,
): string | null {
  if (incoming === null) return existing;
  if (existing === null) return incoming;
  if (existing !== incoming) {
    throw new ObligationValidationError(
      "currencyCode",
      `is already ${existing} on this obligation, and amounts are never converted`,
    );
  }
  return existing;
}
