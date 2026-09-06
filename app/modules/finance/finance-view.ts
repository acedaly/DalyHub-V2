/**
 * V2.12 — the Finance surfaces' client-safe shapes.
 *
 * A `.server` module may not be imported by a component — React Router refuses
 * the build, and rightly: it would drag the composition boundary, D1 and the
 * Workers runtime into the client bundle. So the loaders' RESULT types live
 * here, separate from the loaders themselves.
 */

import type { SerializedAttachment } from "~/kernel/attachments";
import type {
  SerializedCategoryMonthLine,
  SerializedCommitment,
  SerializedCurrencyTotal,
  SerializedFinanceAccount,
  SerializedFinanceCategory,
  SerializedFinanceImport,
  SerializedFinanceTransaction,
  SerializedMonthBudget,
} from "~/shared/finance";

/** The month vocabulary every Finance surface shares. */
export interface FinanceMonthContext {
  readonly month: string;
  readonly monthLabel: string;
  readonly previousMonth: string;
  readonly nextMonth: string;
}

/** Net worth, per currency, with what it excluded. */
export interface SerializedNetWorth {
  readonly total: readonly SerializedCurrencyTotal[];
  readonly accountsTotal: readonly SerializedCurrencyTotal[];
  readonly assetsTotal: readonly SerializedCurrencyTotal[];
  readonly assetsWithoutValue: number;
}

/** This month's known commitments, from money-bearing Obligations. */
export interface SerializedCommitments {
  readonly items: readonly SerializedCommitment[];
  readonly expected: readonly SerializedCurrencyTotal[];
  readonly withoutAmount: number;
}

export interface FinanceHomeData extends FinanceMonthContext {
  readonly todayIso: string;
  readonly accounts: readonly SerializedFinanceAccount[];
  readonly lines: readonly SerializedCategoryMonthLine[];
  readonly moneyOut: readonly SerializedCurrencyTotal[];
  readonly moneyIn: readonly SerializedCurrencyTotal[];
  readonly uncategorisedOut: readonly SerializedCurrencyTotal[];
  readonly uncategorisedIn: readonly SerializedCurrencyTotal[];
  readonly uncategorisedCount: number;
  readonly transferCount: number;
  readonly netWorth: SerializedNetWorth;
  readonly commitments: SerializedCommitments;
  readonly imports: readonly SerializedFinanceImport[];
  readonly failed: boolean;
}

export interface FinanceTransactionsData extends FinanceMonthContext {
  readonly todayIso: string;
  /** True when this is the QUEUE — every uncategorised row, in any month. */
  readonly uncategorised: boolean;
  readonly accountId: string | null;
  readonly categoryId: string | null;
  readonly query: string;
  /** A transaction to open in the drawer on arrival, from a Search result. */
  readonly openTransactionId: string | null;
  readonly accounts: readonly SerializedFinanceAccount[];
  readonly categories: readonly SerializedFinanceCategory[];
  readonly transactions: readonly SerializedFinanceTransaction[];
  /**
   * The receipts on this page's transactions, keyed by transaction id.
   *
   * Read in bulk with the page rather than per drawer-open, so evidence is
   * present the moment a drawer opens and survives a reload — an uploaded
   * receipt that appears only in local state reads as lost.
   */
  readonly attachments: Readonly<
    Record<string, readonly SerializedAttachment[]>
  >;
  readonly nextCursor: string | null;
  readonly total: number;
  readonly failed: boolean;
}

export interface FinanceBudgetsData extends FinanceMonthContext {
  readonly todayIso: string;
  /** Only money-OUT categories: a budget on income is a Goal, not a budget. */
  readonly categories: readonly SerializedFinanceCategory[];
  readonly lines: readonly SerializedCategoryMonthLine[];
  /**
   * The saved budgets for the month, independent of spend.
   *
   * A budget on a category with no transactions yet produces no `lines` entry,
   * so the screen must read its amount from here or it will draw an empty field
   * over a real budget — and saving that apparent value would clear it.
   */
  readonly budgets: readonly SerializedMonthBudget[];
  readonly defaultCurrency: string;
  readonly failed: boolean;
}

export interface FinanceCategoriesData {
  readonly categories: readonly SerializedFinanceCategory[];
  readonly failed: boolean;
}

export interface FinanceImportData {
  readonly accounts: readonly SerializedFinanceAccount[];
  readonly selectedAccountId: string | null;
  readonly savedMappingJson: string | null;
  readonly imports: readonly SerializedFinanceImport[];
  readonly failed: boolean;
}

export interface FinanceAccountRecordData {
  readonly account: SerializedFinanceAccount;
  readonly transactions: readonly SerializedFinanceTransaction[];
  readonly nextCursor: string | null;
  readonly transactionTotal: number;
  readonly imports: readonly SerializedFinanceImport[];
  readonly categories: readonly SerializedFinanceCategory[];
  readonly attachments: readonly SerializedAttachment[];
  readonly failed: boolean;
}
