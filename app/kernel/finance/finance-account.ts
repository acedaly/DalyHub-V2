/**
 * V2.12 FIN-00 — the Finance account, and the ONE rule about its balance.
 *
 * An account is an ENTITY: it has identity, a record page, evidence (a statement
 * PDF belongs to the account), a place in Search, and it must survive export and
 * restore. The entity pattern supplies every one of those.
 *
 * ## A balance is DERIVED and cannot be stored
 *
 * There is no `balance` column in `finance_account_details` and there never will
 * be (ADR-120 decision 5). A balance is:
 *
 *     opening_balance_minor + Σ amount_minor over the account's live transactions
 *
 * Order-independent, exactly reconstructible, and unable to drift from
 * transaction truth because there is nothing to drift from. A cached balance is
 * a second authority, and the first bug in it is silent and about money.
 *
 * ## Liabilities need no rule
 *
 * The sign convention is one sentence — POSITIVE IS IN, NEGATIVE IS OUT — and it
 * holds for every account type. A credit card the owner owes $1,240 on has a
 * balance of `-124000`; a loan has a large negative balance. Net worth adds
 * balances, so liabilities subtract BECAUSE THEIR BALANCES ARE NEGATIVE, not
 * because a rule flips them. There is no per-type sign rule to forget, which is
 * what makes the credit-card double-count structurally impossible rather than
 * merely tested for.
 *
 * What a TYPE changes is words, not arithmetic: a liability's balance is spoken
 * as "$1,240.00 owing" so nothing is conveyed by a minus sign or a colour alone.
 *
 * Pure: no storage, no clock, no JSX.
 */

/**
 * The account types V2.12 can meaningfully support.
 *
 * `investment` is deliberately absent: holdings and prices are a different model
 * with a market-data dependency. An owner who wants one balance tracked uses
 * `other`; an owner who wants the THING valued already has Assets. `offset`,
 * `term_deposit` and `mortgage` are absent for the same reason in reverse — each
 * would be a word with no behaviour.
 */
export const FINANCE_ACCOUNT_TYPES = [
  "transaction",
  "savings",
  "credit_card",
  "cash",
  "loan",
  "other",
] as const;

export type FinanceAccountType = (typeof FINANCE_ACCOUNT_TYPES)[number];

/** Narrow an untrusted value (a form field, a stored row) to an account type. */
export function isFinanceAccountType(
  value: unknown,
): value is FinanceAccountType {
  return (
    typeof value === "string" &&
    (FINANCE_ACCOUNT_TYPES as readonly string[]).includes(value)
  );
}

/** The owner-facing name of each type. The product's noun, not a bank's. */
export const FINANCE_ACCOUNT_TYPE_LABELS: Readonly<
  Record<FinanceAccountType, string>
> = {
  transaction: "Everyday account",
  savings: "Savings",
  credit_card: "Credit card",
  cash: "Cash",
  loan: "Loan",
  other: "Other",
};

/** One line of help per type, for the create form. */
export const FINANCE_ACCOUNT_TYPE_HINTS: Readonly<
  Record<FinanceAccountType, string>
> = {
  transaction: "The account your pay lands in and your bills come out of.",
  savings: "Money set aside. Same arithmetic, different intent.",
  credit_card: "What you owe shows as a negative balance.",
  cash: "Notes and coins. You enter these by hand.",
  loan: "A mortgage, a car loan, a personal loan. A negative balance.",
  other: "An offset, a term deposit, a balance you just want to see.",
};

/**
 * The types whose balance is normally something the owner OWES.
 *
 * This changes WORDS ONLY. No arithmetic anywhere reads it — the sign already
 * carries the meaning, and a second source for "is this a debt?" is how the two
 * come to disagree.
 */
const LIABILITY_TYPES: ReadonlySet<FinanceAccountType> = new Set([
  "credit_card",
  "loan",
]);

/** True when this type's balance is normally a debt. Presentation only. */
export function isLiabilityAccountType(type: FinanceAccountType): boolean {
  return LIABILITY_TYPES.has(type);
}

/** An account's lifecycle, as the owner controls it. */
export type FinanceAccountStatus = "open" | "closed";

/** One Finance account. */
export interface FinanceAccount {
  readonly id: string;
  readonly workspaceId: string;
  readonly title: string;
  readonly accountType: FinanceAccountType;
  readonly currencyCode: string;
  /** SIGNED. Negative for a card the owner already owes on. */
  readonly openingBalanceMinor: number;
  /** The day the opening balance was true as at. */
  readonly openingDate: string;
  readonly institution: string | null;
  readonly status: FinanceAccountStatus;
  /** The last CSV mapping used for this account, as stored JSON, or null. */
  readonly importMappingJson: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly archivedAt: Date | null;
  readonly deletedAt: Date | null;
}

/**
 * An account with its derived balance, as every surface that shows one reads it.
 *
 * The balance is computed by the repository in ONE grouped statement for every
 * account in the workspace — never one read per account, and never stored.
 */
export interface FinanceAccountWithBalance {
  readonly account: FinanceAccount;
  /**
   * `openingBalanceMinor` plus the sum of the account's live transactions, in
   * the account's own currency. There is no cross-currency arithmetic here: an
   * account is denominated in exactly one currency and its transactions are
   * refused in any other.
   */
  readonly balanceMinor: number;
  /** How many live transactions produced it. Never a list, never an amount. */
  readonly transactionCount: number;
}

/**
 * The derivation, as a function, so the same rule is used by the adapter's SQL,
 * by the restore rehearsal's re-computation and by every test that asserts
 * parity. One rule, three callers, no chance of two answers.
 */
export function deriveBalanceMinor(
  openingBalanceMinor: number,
  transactionSumMinor: number,
): number {
  return openingBalanceMinor + transactionSumMinor;
}

/** The editable account fields. `undefined` leaves unchanged; `null` clears. */
export interface FinanceAccountInput {
  readonly title?: string;
  readonly accountType?: string;
  readonly currencyCode?: string;
  readonly openingBalance?: string | number | null;
  readonly openingDate?: string;
  readonly institution?: string | null;
  readonly status?: string;
}

/** Input to create an account. Type, currency and opening date are required. */
export type CreateFinanceAccountInput = FinanceAccountInput & {
  readonly title: string;
  readonly accountType: string;
  readonly currencyCode: string;
  readonly openingDate: string;
};

/**
 * Input to edit an account.
 *
 * The CURRENCY is absent on purpose. Changing it would silently reinterpret
 * every transaction the account already holds — the amounts would not move, but
 * what they mean would — and there is no honest way to do that in place. An
 * owner who opened an account in the wrong currency creates the right one; if
 * the account has no transactions, deleting the wrong one is allowed.
 */
export type UpdateFinanceAccountInput = Omit<
  FinanceAccountInput,
  "currencyCode"
>;
