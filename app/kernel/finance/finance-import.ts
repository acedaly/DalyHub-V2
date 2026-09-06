/**
 * V2.12 FIN-01 — the import: the ledger, the preview, and the pure pass that
 * turns a mapped file into candidate rows.
 *
 * ## The import is the audited unit
 *
 * One `finance_imports` row records what happened; ONE Activity event records
 * that it happened. There is no Activity event per transaction — an event per
 * row would double an import's write volume and fill the feed with a fact
 * nobody reads.
 *
 * **The raw CSV is not retained.** Its SHA-256 is. An owner who wants the
 * statement kept attaches it to the account through V2.11 — a decision, not a
 * default.
 *
 * ## The preview exists so nothing is a surprise
 *
 * The owner sees, before anything is written: the parsed rows with their dates
 * in words and their signed amounts; money in and money out; four counts; every
 * invalid row with its reason and its source line; and the balance check where
 * the mapping named a balance column.
 *
 * ## The four outcomes, and why "suspected" is not one of them
 *
 * A row is `new`, `existing` or `invalid`. **Suspicion is a flag on a `new`
 * row, not a fourth outcome**, because a suspected row IS new — it is a row this
 * account does not hold — and treating it as its own outcome would lose that.
 * Suspected rows are shown, excluded from the apply BY DEFAULT, and includable
 * with one control. Nothing is silently merged and nothing is silently dropped.
 *
 * Pure: no storage, no clock, no JSX.
 */

import { calendarDaysBetween } from "~/kernel/datetime";

import type { CsvMapping } from "./finance-csv-mapping";

/** One import, as the ledger records it. */
export interface FinanceImport {
  readonly id: string;
  readonly workspaceId: string;
  readonly accountId: string;
  readonly fileName: string;
  readonly fileSha256: string;
  readonly fileBytes: number;
  readonly rowCount: number;
  readonly addedCount: number;
  readonly skippedExistingCount: number;
  readonly suspectedCount: number;
  readonly invalidCount: number;
  readonly mappingJson: string;
  readonly importedAt: Date;
  readonly createdAt: Date;
}

/** What will happen to one row when the import is applied. */
export type ImportRowOutcome = "new" | "existing" | "invalid";

/** Why a row is invalid. A closed vocabulary, so the message is a lookup. */
export type ImportRowProblem =
  | "no_date"
  | "bad_date"
  | "no_amount"
  | "bad_amount"
  | "amount_too_large"
  | "both_debit_and_credit"
  | "no_description"
  | "short_row";

export const IMPORT_ROW_PROBLEM_MESSAGES: Readonly<
  Record<ImportRowProblem, string>
> = {
  no_date: "no date in the date column",
  bad_date: "the date does not match the format you chose",
  no_amount: "no amount in either amount column",
  bad_amount: "the amount is not a number",
  amount_too_large: "the amount is larger than DalyHub can store",
  both_debit_and_credit: "both the debit and the credit column have a value",
  no_description: "no description",
  short_row: "the row has fewer columns than the mapping needs",
};

/** One row of a previewed import, as the owner sees it. */
export interface ImportPreviewRow {
  /** The row's index among the file's DATA rows, 0-based. Stable across
   * preview and apply, which is what lets the apply name rows to include. */
  readonly index: number;
  /** The 1-based source line, so an invalid row can be found in the file. */
  readonly line: number;
  readonly outcome: ImportRowOutcome;
  /**
   * True when this row is new but the account already holds a transaction with
   * the same amount and payee within three days, and the file gave no bank id.
   * Shown, excluded by default, includable with one control.
   */
  readonly suspected: boolean;
  readonly problem: ImportRowProblem | null;
  /** Present for a row that parsed, absent for an invalid one. */
  readonly occurredOn: string | null;
  readonly amountMinor: number | null;
  readonly payeeDisplay: string | null;
  readonly sourceDescription: string;
  readonly fingerprint: string | null;
}

/** The balance check, when the mapping named a balance column. */
export interface ImportBalanceCheck {
  /** What the file's last balance cell said, in minor units. */
  readonly statedMinor: number;
  /** What the account's balance would be after this import. */
  readonly derivedMinor: number;
  /** `stated − derived`. Zero when they agree. */
  readonly differenceMinor: number;
  readonly currencyCode: string;
}

/** A previewed import: every row, the counts, and the checks. */
export interface ImportPreview {
  readonly accountId: string;
  readonly fileName: string;
  readonly fileSha256: string;
  readonly fileBytes: number;
  readonly mapping: CsvMapping;
  readonly rows: readonly ImportPreviewRow[];
  readonly newCount: number;
  readonly existingCount: number;
  readonly suspectedCount: number;
  readonly invalidCount: number;
  /** Money in and money out across the rows that WILL be applied by default. */
  readonly inMinor: number;
  readonly outMinor: number;
  readonly currencyCode: string;
  readonly balanceCheck: ImportBalanceCheck | null;
  /**
   * True when this exact file has already been applied to this account, in
   * which case nothing will be written and the answer is "0 new".
   */
  readonly alreadyApplied: boolean;
  readonly alreadyAppliedAt: Date | null;
}

/** The result of applying an import. */
export interface ImportResult {
  readonly import: FinanceImport;
  readonly addedCount: number;
  readonly skippedExistingCount: number;
  readonly suspectedCount: number;
  readonly invalidCount: number;
  /** True when the file had already been applied and nothing was written. */
  readonly alreadyApplied: boolean;
}

/** How far apart two transactions may be and still look like one duplicate. */
export const SUSPECTED_DUPLICATE_WINDOW_DAYS = 3;

/**
 * Whether a candidate row LOOKS like a transaction the account already holds.
 *
 * ## The rule, and the two shapes it has to tell apart
 *
 * Suspicion exists for the case where ONE real transaction arrives twice by
 * different routes — the owner typed the cash withdrawal on Thursday and the
 * bank exported it on Saturday, or the bank changed a merchant's description
 * text between two exports so the fingerprint no longer matches. It does NOT
 * exist to catch a genuinely repeated purchase, which the occurrence index
 * already resolves exactly.
 *
 * So the rule is: the same amount, within the window, EXCEPT the one shape the
 * occurrence index owns — the same day AND the same payee.
 *
 *   - manual 3 Sep $40 CASH vs imported 5 Sep $40 CASH → suspected. One
 *     withdrawal, two routes.
 *   - a THIRD $12.50 coffee on the same day at the same café → not suspected.
 *     The occurrence index gave it `n = 2`, which is correct and certain.
 *   - the same day, the same amount, a DIFFERENT payee string → suspected.
 *     This is the "the bank changed the description" case, and it is the one
 *     the fingerprint cannot see.
 *
 * **It errs toward SHOWING.** Two genuinely different $12.50 purchases on one
 * day are flagged, and the owner unticks nothing because a suspected row is
 * skipped by default and includable with one control — while the alternative,
 * a silent duplicate of a real transaction, is money that was never spent
 * appearing in a ledger. The preview shows the payee beside each, so the two
 * are distinguishable at a glance.
 *
 * A bank-supplied transaction id makes identity CERTAIN, so the caller
 * suppresses suspicion entirely for a row that has one.
 */
export function looksLikeDuplicate(
  candidate: {
    readonly occurredOn: string;
    readonly amountMinor: number;
    readonly payeeKey: string;
  },
  existing: {
    readonly occurredOn: string;
    readonly amountMinor: number;
    readonly payeeKey: string;
  },
): boolean {
  if (candidate.amountMinor !== existing.amountMinor) return false;
  /*
   * The kernel's day arithmetic, not a second copy of it (DEBT-52). Dividing a
   * millisecond difference by 86_400_000 is the eighth version of a calculation
   * this repository already has exactly one home for, and it is the version
   * that quietly returns a fraction when either date is malformed.
   */
  let days: number;
  try {
    days = Math.abs(
      calendarDaysBetween(candidate.occurredOn, existing.occurredOn),
    );
  } catch {
    // A date this function cannot read is not evidence of a duplicate. Fail
    // toward importing the row, which the owner can delete, rather than toward
    // silently withholding it.
    return false;
  }
  if (days > SUSPECTED_DUPLICATE_WINDOW_DAYS) return false;
  // The shape the occurrence index already resolves exactly.
  const sameDayAndPayee =
    candidate.occurredOn === existing.occurredOn &&
    candidate.payeeKey === existing.payeeKey;
  return !sameDayAndPayee;
}
