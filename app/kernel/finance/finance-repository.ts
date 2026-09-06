/**
 * V2.12 FIN-00 — the authoritative Finance repository contract.
 *
 * The storage-independent interface that owns accounts, transactions,
 * categories, budgets and imports. It speaks only domain terms and never exposes
 * D1, SQL or Cloudflare types; the D1 adapter implements it.
 *
 * WORKSPACE-BOUND (ADR-010): constructed with a single `WorkspaceContext`, every
 * method operates only within that workspace, **no method accepts a
 * `workspaceId`**, and the trusted Activity actor is bound at construction — so
 * module code cannot pass, select or spoof scope or actor.
 *
 * ## Three properties this contract exists to guarantee
 *
 * 1. **No balance is stored.** There is no `setBalance`, no `recalculate` and no
 *    balance parameter anywhere below. `listAccountsWithBalances` derives every
 *    balance in ONE grouped statement.
 * 2. **Every read is bounded and grouped.** No method returns "all
 *    transactions". Nothing here is called once per row: the category, the
 *    account and the transfer partner arrive with a page through joins, and the
 *    category suggestion is one grouped statement for a whole page.
 * 3. **An applied import is ONE batch.** `applyImport` is atomic, and its
 *    statement count does not grow with the row count — the rows travel as one
 *    bound JSON parameter, the technique `history-window-read.ts` uses because
 *    D1 refuses a statement with more than 100 bound variables.
 */

import type { ObligationSettlementGateway } from "~/kernel/obligations";
import type { WorkspaceContext } from "~/kernel/workspaces";

import type {
  CreateFinanceAccountInput,
  FinanceAccount,
  FinanceAccountWithBalance,
  UpdateFinanceAccountInput,
} from "./finance-account";
import type { FinanceBudget, SetFinanceBudgetInput } from "./finance-budget";
import type {
  CreateFinanceCategoryInput,
  FinanceCategory,
  UpdateFinanceCategoryInput,
} from "./finance-category";
import type { CsvMapping } from "./finance-csv-mapping";
import type {
  FinanceImport,
  ImportPreview,
  ImportResult,
} from "./finance-import";
import type { FinanceMonth, FinanceMonthSummary } from "./finance-month";
import type { NetWorthAsset } from "./finance-networth";
import type {
  CreateFinanceTransactionInput,
  FinanceTransaction,
  FinanceTransactionFilters,
  FinanceTransactionPage,
  FinanceTransactionView,
  UpdateFinanceTransactionInput,
} from "./finance-transaction";

/** A bounded transactions read. */
export interface ListTransactionsInput {
  readonly filters?: FinanceTransactionFilters;
  readonly limit?: number;
  readonly cursor?: string;
}

/** One deterministic category suggestion for a payee. */
export interface CategorySuggestion {
  readonly payeeKey: string;
  readonly categoryId: string;
  readonly categoryName: string;
  /** The day the owner last confirmed it, so the surface can say "last time". */
  readonly confirmedOn: string;
}

/** A candidate other leg for a transfer, as the deterministic read returns it. */
export interface TransferCandidate {
  readonly transactionId: string;
  readonly accountId: string;
  readonly accountTitle: string;
  readonly occurredOn: string;
  readonly amountMinor: number;
  readonly currencyCode: string;
  readonly payeeDisplay: string;
}

/** A money-bearing obligation due in a month, as the Finance home lists it. */
export interface ExpectedCommitment {
  readonly obligationId: string;
  readonly title: string;
  readonly dueDate: string;
  /** `null` when no amount has been recorded. NEVER inferred and never zero. */
  readonly expectedAmountMinor: number | null;
  readonly currencyCode: string | null;
  readonly settledByTransactionId: string | null;
}

/** What an import apply was asked to do. */
export interface ApplyImportInput {
  readonly accountId: string;
  readonly fileName: string;
  readonly bytes: Uint8Array;
  readonly mapping: CsvMapping;
  /**
   * The SHA-256 the preview reported. The apply is refused when the bytes it
   * receives hash differently, so an owner cannot preview one file and apply
   * another.
   */
  readonly expectedSha256: string;
  /**
   * Row indexes (as the preview numbered them) whose SUSPECTED-duplicate flag
   * the owner has overridden. Empty by default: nothing suspected is imported
   * unless it is asked for by name.
   */
  readonly includeSuspected?: readonly number[];
  /** Save this mapping on the account for next time. */
  readonly saveMapping?: boolean;
}

/**
 * The Finance store.
 *
 * Every method is workspace-bound. Every failure is a named domain error —
 * `FinanceNotFoundError` for a record that is not in this workspace (never
 * "forbidden", so existence does not leak), `FinanceRefusedError` for a product
 * rule, `FinanceValidationError` for a malformed value.
 */
export interface FinanceRepository extends ObligationSettlementGateway {
  readonly context: WorkspaceContext;

  /* ---------------------------------------------------------------- accounts */

  /**
   * Create an account.
   *
   * When this is the workspace's FIRST account, the twelve starter categories
   * are seeded in the SAME batch — once, and never again. A test asserts the
   * second account seeds nothing.
   */
  createAccount(input: CreateFinanceAccountInput): Promise<FinanceAccount>;

  getAccount(accountId: string): Promise<FinanceAccount | null>;

  updateAccount(
    accountId: string,
    input: UpdateFinanceAccountInput,
  ): Promise<FinanceAccount>;

  /**
   * Every live account with its DERIVED balance, in ONE grouped statement.
   *
   * Not one read per account, and not a stored figure. `includeClosed` decides
   * what the list shows; it does not decide what net worth counts, because
   * closing an account changes what the UI offers and never what the arithmetic
   * says.
   */
  listAccountsWithBalances(options?: {
    readonly includeClosed?: boolean;
  }): Promise<readonly FinanceAccountWithBalance[]>;

  /**
   * Soft-delete an account.
   *
   * REFUSED with `account_in_use` while the account holds any transaction,
   * deleted ones included: a transaction whose account has gone is a row nothing
   * can explain. Closing is the answer for an account with history.
   */
  deleteAccount(accountId: string): Promise<void>;

  /** Save the CSV mapping an import used, for next time. */
  saveAccountMapping(accountId: string, mapping: CsvMapping): Promise<void>;

  /* -------------------------------------------------------------- categories */

  listCategories(options?: {
    readonly includeArchived?: boolean;
  }): Promise<readonly FinanceCategory[]>;

  createCategory(input: CreateFinanceCategoryInput): Promise<FinanceCategory>;

  updateCategory(
    categoryId: string,
    input: UpdateFinanceCategoryInput,
  ): Promise<FinanceCategory>;

  /** Archive or restore. Always allowed, and never touches a transaction. */
  setCategoryArchived(
    categoryId: string,
    archived: boolean,
  ): Promise<FinanceCategory>;

  /**
   * Delete a category.
   *
   * REFUSED with `category_in_use` when any transaction carries it, and the
   * refusal names the count so the owner can act. An unused category deletes.
   * No transaction is ever orphaned, in either branch.
   */
  deleteCategory(categoryId: string): Promise<void>;

  /* ------------------------------------------------------------ transactions */

  /** A bounded page, with the account, category and transfer partner joined. */
  listTransactions(
    input?: ListTransactionsInput,
  ): Promise<FinanceTransactionPage>;

  getTransaction(transactionId: string): Promise<FinanceTransactionView | null>;

  /** Enter a transaction by hand. Its fingerprint is `man:<id>`. */
  createTransaction(
    input: CreateFinanceTransactionInput,
  ): Promise<FinanceTransaction>;

  /**
   * Correct a transaction.
   *
   * On an IMPORTED row, only the display payee, the memo and the category may
   * move: the date, the amount, the account, the source description, the bank's
   * id and the fingerprint ARE the import's identity, and the repository refuses
   * the edit with `import_provenance` rather than accepting it and hoping.
   *
   * Setting a category through this method stamps `categoryConfirmedAt`, which
   * is what the suggestion engine learns from — so it learns only from decisions
   * the owner actually made.
   */
  updateTransaction(
    transactionId: string,
    input: UpdateFinanceTransactionInput,
  ): Promise<FinanceTransaction>;

  /** Soft-delete. Provenance and fingerprint are retained on the deleted row. */
  deleteTransaction(transactionId: string): Promise<void>;

  /** Restore a soft-deleted transaction. */
  restoreTransaction(transactionId: string): Promise<FinanceTransaction>;

  /**
   * The deterministic suggestion for a set of payee keys, in ONE grouped
   * statement for a whole page — never one read per row.
   *
   * The rule is the most recent MANUALLY CONFIRMED category for the same payee
   * key. It suggests; nothing applies it. No AI, no rules engine, no score.
   */
  suggestCategories(
    payeeKeys: readonly string[],
  ): Promise<readonly CategorySuggestion[]>;

  /* --------------------------------------------------------------- transfers */

  /**
   * Pair two transactions as the two legs of one transfer.
   *
   * REFUSED with `transfer_invalid` when: the two are the same transaction; they
   * are in the same account; they have the same sign; either is already paired;
   * or either is deleted. Both legs are written in ONE statement, so a transfer
   * can never be half-applied.
   */
  linkTransfer(outflowId: string, inflowId: string): Promise<void>;

  /** Clear both legs of a transfer in one write. */
  unlinkTransfer(transactionId: string): Promise<void>;

  /**
   * Deterministic candidates for the other leg: unpaired, in a different
   * account, the exactly opposite amount, the same currency, within three days.
   * Ordered by date proximity. Nothing auto-pairs.
   */
  suggestTransferPartners(
    transactionId: string,
  ): Promise<readonly TransferCandidate[]>;

  /* ----------------------------------------------------------------- imports */

  /**
   * Read a file under a mapping and report exactly what applying it would do.
   * Writes nothing.
   */
  previewImport(input: {
    readonly accountId: string;
    readonly fileName: string;
    readonly bytes: Uint8Array;
    readonly mapping: CsvMapping;
  }): Promise<ImportPreview>;

  /**
   * Apply an import as ONE atomic batch.
   *
   * A file already applied to this account is refused by the ledger's unique
   * index BEFORE any row is considered, and reported as `alreadyApplied` with
   * zero added — which is the product's headline promise, enforced by the
   * database rather than by a check-then-insert.
   */
  applyImport(input: ApplyImportInput): Promise<ImportResult>;

  /** An account's imports, or the workspace's, newest first and bounded. */
  listImports(options?: {
    readonly accountId?: string;
    readonly limit?: number;
  }): Promise<readonly FinanceImport[]>;

  /* ----------------------------------------------------------------- budgets */

  listBudgets(month: FinanceMonth): Promise<readonly FinanceBudget[]>;

  /** Create or replace one budget. A second set is an edit, not a second row. */
  setBudget(input: SetFinanceBudgetInput): Promise<FinanceBudget>;

  deleteBudget(budgetId: string): Promise<void>;

  /**
   * Copy every budget from one month into another, skipping categories the
   * target month already has. One explicit action, one batch, no repetition
   * engine.
   */
  copyBudgets(from: FinanceMonth, to: FinanceMonth): Promise<number>;

  /* ------------------------------------------------------------- the month */

  /**
   * A month's category totals, in ONE grouped statement.
   *
   * The Finance home and the budget screen BOTH call this, which is what makes
   * "they agree" a property of the code rather than a rule two screens have to
   * remember. Transfer legs are excluded by the query.
   */
  monthSummary(month: FinanceMonth): Promise<FinanceMonthSummary>;

  /** How many live transactions in the workspace carry no category. */
  countUncategorised(): Promise<number>;

  /* --------------------------------------------------- net worth commitments */

  /**
   * Every live Asset's LATEST recorded valuation, in ONE statement.
   *
   * Finance never authors Asset SQL: this delegates to the repository that owns
   * the data, and an Asset with no valuation comes back with `valueMinor: null`
   * rather than zero.
   */
  listLatestAssetValuations(): Promise<readonly NetWorthAsset[]>;

  /**
   * V2.12 FIN-04 — the READ side of the obligation settlement seam
   * (`ObligationSettlementGateway`, which this interface extends).
   *
   * The obligation repository calls it to learn what a transaction says; the
   * settlement column and its EntityLink projection are written by the
   * obligation's own batch, because they are the obligation's facts. Finance
   * never writes to `obligation_details`, and Life Admin never joins a Finance
   * table — the dependency runs one way, through this method.
   */
  resolveSettlement(transactionId: string): Promise<{
    readonly amountMinor: number;
    readonly currencyCode: string;
    readonly occurredOn: string;
    readonly inflow: boolean;
    readonly settlesObligationId: string | null;
  } | null>;

  /**
   * Money-bearing obligations due in a month. A deterministic list of recorded
   * amounts, not a forecast: an obligation with no amount is listed with
   * `expectedAmountMinor: null` and never estimated.
   */
  listExpectedCommitments(
    month: FinanceMonth,
  ): Promise<readonly ExpectedCommitment[]>;
}
