/**
 * V2.12 — the ONE place a Finance surface's facts are read and serialised.
 *
 * Every Finance route reads through here rather than calling the repository and
 * shaping rows itself, for the reason the Obligations module's own facts module
 * gives: two surfaces that serialise the same record twice are two surfaces that
 * come to disagree about it.
 *
 * ## The statement budget lives here, and is asserted
 *
 * Each function below states how many bounded statements it costs, and
 * `test/kernel/finance-statement-budget.test.ts` pins the numbers against real
 * D1 at both a small and a large fixture. A read whose count grows with the row
 * count is a failure, not a note.
 *
 * ## Nothing here logs a payee or an amount
 *
 * A Finance route logs counts and durations. `financePageError` is the one
 * failure path, and it carries a boolean.
 */

import {
  addMoneyTotals,
  budgetSentence,
  budgetState,
  computeNetWorth,
  monthDirectionTotals,
  monthEnd,
  monthStart,
  readStoredCsvMapping,
  totalMoney,
  type BudgetVariance,
  type FinanceMonth,
  type FinanceRepository,
  type MoneyTotal,
} from "~/kernel/finance";
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

/** Flatten a currency-grouped total into the shape a surface renders. */
export function serialiseTotal(
  total: MoneyTotal,
): readonly SerializedCurrencyTotal[] {
  return total.totals.map((entry) => ({
    currencyCode: entry.currencyCode,
    minorUnits: entry.minorUnits,
    count: entry.count,
  }));
}

/** ONE statement. */
export async function readAccounts(
  finance: FinanceRepository,
  options: { readonly includeClosed?: boolean } = {},
): Promise<readonly SerializedFinanceAccount[]> {
  const rows = await finance.listAccountsWithBalances({
    includeClosed: options.includeClosed ?? true,
  });
  return rows.map((entry) => ({
    id: entry.account.id,
    title: entry.account.title,
    accountType: entry.account.accountType,
    currencyCode: entry.account.currencyCode,
    openingBalanceMinor: entry.account.openingBalanceMinor,
    openingDate: entry.account.openingDate,
    institution: entry.account.institution,
    status: entry.account.status,
    balanceMinor: entry.balanceMinor,
    transactionCount: entry.transactionCount,
    // Whether a mapping is SAVED, never the mapping itself: a screen only needs
    // to know whether to pre-fill.
    hasSavedMapping:
      readStoredCsvMapping(entry.account.importMappingJson) !== null,
  }));
}

/**
 * TWO statements: the vocabulary, and ONE grouped count for every category at
 * once. Flat at 12 categories and at 200 — never one count per category.
 *
 * `withCounts` is off by default because a PICKER does not need them and would
 * otherwise pay for a read it never renders.
 */
export async function readCategories(
  finance: FinanceRepository,
  options: {
    readonly includeArchived?: boolean;
    readonly withCounts?: boolean;
  } = {},
): Promise<readonly SerializedFinanceCategory[]> {
  const categories = await finance.listCategories({
    includeArchived: options.includeArchived ?? true,
  });
  const counts = options.withCounts
    ? await finance.countTransactionsByCategory()
    : new Map<string, number>();
  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    kind: category.kind,
    isBuiltin: category.isBuiltin,
    archived: category.archivedAt !== null,
    transactionCount: counts.get(category.id) ?? 0,
  }));
}

/** Serialise a page of transactions, with the page's suggestions resolved. */
export async function readTransactionPage(
  finance: FinanceRepository,
  input: {
    readonly accountId?: string;
    readonly categoryId?: string | null;
    readonly month?: FinanceMonth;
    readonly query?: string;
    readonly cursor?: string;
    readonly limit?: number;
  },
): Promise<{
  readonly items: readonly SerializedFinanceTransaction[];
  readonly nextCursor: string | null;
  readonly total: number;
}> {
  const page = await finance.listTransactions({
    filters: {
      accountId: input.accountId,
      categoryId: input.categoryId,
      fromDate: input.month === undefined ? undefined : monthStart(input.month),
      toDate: input.month === undefined ? undefined : monthEnd(input.month),
      query: input.query,
    },
    cursor: input.cursor,
    limit: input.limit,
  });

  /*
   * ONE grouped statement for the WHOLE page, never one read per row. That is
   * the difference between a fifty-row queue costing two statements and costing
   * fifty-one, and it is why the suggestion takes a set of keys rather than a
   * transaction.
   */
  const uncategorised = page.items.filter(
    (view) => view.transaction.categoryId === null,
  );
  const suggestions =
    uncategorised.length === 0
      ? []
      : await finance.suggestCategories(
          uncategorised.map((view) => view.transaction.payeeKey),
        );
  const byKey = new Map(
    suggestions.map((suggestion) => [suggestion.payeeKey, suggestion]),
  );

  return {
    items: page.items.map((view) => {
      const suggestion =
        view.transaction.categoryId === null
          ? (byKey.get(view.transaction.payeeKey) ?? null)
          : null;
      return {
        id: view.transaction.id,
        accountId: view.transaction.accountId,
        accountTitle: view.accountTitle,
        occurredOn: view.transaction.occurredOn,
        amountMinor: view.transaction.amountMinor,
        currencyCode: view.transaction.currencyCode,
        payeeDisplay: view.transaction.payeeDisplay,
        sourceDescription: view.transaction.sourceDescription,
        payeeKey: view.transaction.payeeKey,
        memo: view.transaction.memo,
        categoryId: view.transaction.categoryId,
        categoryName: view.categoryName,
        categoryKind: view.categoryKind as "spending" | "income" | null,
        categoryArchived: view.categoryArchived,
        imported: view.transaction.importId !== null,
        transferPartnerId: view.transferPartnerId,
        transferPartnerAccountTitle: view.transferPartnerAccountTitle,
        settlesObligationId: view.settlesObligationId,
        settlesObligationTitle: view.settlesObligationTitle,
        suggestedCategoryId: suggestion?.categoryId ?? null,
        suggestedCategoryName: suggestion?.categoryName ?? null,
      };
    }),
    nextCursor: page.nextCursor,
    total: page.total,
  };
}

/** A month's category lines, with each budget's variance in words beside it. */
export async function readMonthLines(
  finance: FinanceRepository,
  month: FinanceMonth,
): Promise<{
  readonly lines: readonly SerializedCategoryMonthLine[];
  readonly moneyOut: readonly SerializedCurrencyTotal[];
  readonly moneyIn: readonly SerializedCurrencyTotal[];
  readonly uncategorisedOut: readonly SerializedCurrencyTotal[];
  readonly uncategorisedIn: readonly SerializedCurrencyTotal[];
  readonly uncategorisedCount: number;
  readonly transferCount: number;
  readonly budgets: readonly SerializedMonthBudget[];
}> {
  const [summary, budgets] = await Promise.all([
    finance.monthSummary(month),
    finance.listBudgets(month),
  ]);
  const budgetByCategory = new Map(
    budgets.map((budget) => [budget.categoryId, budget]),
  );
  const totals = monthDirectionTotals(summary);

  const lines = summary.categories
    .map<SerializedCategoryMonthLine>((entry) => {
      // The MAGNITUDE, with the direction carried by `kind`. A spending
      // category's net is negative, and a refund makes it less negative — which
      // is the whole refund model, and it lands here as a smaller magnitude.
      const magnitudeMinor =
        entry.categoryKind === "spending" ? -entry.netMinor : entry.netMinor;
      const budget =
        entry.categoryId === null
          ? undefined
          : budgetByCategory.get(entry.categoryId);
      // A budget is compared ONLY to spend in its own currency. Spend in another
      // currency in the same category is reported by the exclusion line rather
      // than folded in or dropped.
      const comparable =
        budget !== undefined &&
        budget.currencyCode === entry.currencyCode &&
        entry.categoryKind === "spending";
      const variance: BudgetVariance | null = comparable
        ? {
            categoryId: entry.categoryId!,
            categoryName: entry.categoryName ?? "",
            currencyCode: budget!.currencyCode,
            budgetedMinor: budget!.amountMinor,
            spentMinor: Math.max(0, magnitudeMinor),
            remainingMinor: budget!.amountMinor - Math.max(0, magnitudeMinor),
            state: budgetState(
              budget!.amountMinor,
              Math.max(0, magnitudeMinor),
            ),
            excluded: [],
          }
        : null;
      return {
        categoryId: entry.categoryId,
        categoryName: entry.categoryName,
        kind: entry.categoryKind,
        currencyCode: entry.currencyCode,
        magnitudeMinor,
        transactionCount: entry.transactionCount,
        budgetedMinor: comparable ? budget!.amountMinor : null,
        budgetState: variance === null ? null : variance.state,
        budgetSentence: variance === null ? null : budgetSentence(variance),
      };
    })
    // Largest first, so a month answers "where is my money going?" in its first
    // line rather than in alphabetical order.
    .sort((a, b) => b.magnitudeMinor - a.magnitudeMinor);

  return {
    lines,
    moneyOut: totals.out,
    moneyIn: totals.in,
    uncategorisedOut: totals.uncategorisedOut,
    uncategorisedIn: totals.uncategorisedIn,
    uncategorisedCount: summary.uncategorisedCount,
    transferCount: summary.transferCount,
    /*
     * The budgets THEMSELVES, not only the ones a spend line happened to carry.
     *
     * `lines` comes from `summary.categories`, which holds only categories with
     * transactions in the month — so a budget on a category the owner has not
     * spent against yet produced no line at all. The budgets screen read its
     * amount from the line, found none, drew an empty field, and SAVING THAT
     * APPARENT VALUE CLEARED THE REAL BUDGET. A budget exists whether or not
     * anything has been spent against it, and that is what this list says.
     */
    budgets: budgets.map((budget) => ({
      categoryId: budget.categoryId,
      amountMinor: budget.amountMinor,
      currencyCode: budget.currencyCode,
    })),
  };
}

/** TWO statements: the account balances and the latest Asset valuations. */
export async function readNetWorth(
  finance: FinanceRepository,
  accounts: readonly SerializedFinanceAccount[],
): Promise<{
  readonly total: readonly SerializedCurrencyTotal[];
  readonly accountsTotal: readonly SerializedCurrencyTotal[];
  readonly assetsTotal: readonly SerializedCurrencyTotal[];
  readonly assetsWithoutValue: number;
}> {
  const assets = await finance.listLatestAssetValuations();
  const worth = computeNetWorth(
    accounts.map((account) => ({
      accountId: account.id,
      title: account.title,
      accountType: account.accountType,
      currencyCode: account.currencyCode,
      balanceMinor: account.balanceMinor,
      closed: account.status === "closed",
    })),
    assets,
  );
  return {
    total: serialiseTotal(worth.total),
    accountsTotal: serialiseTotal(worth.accountsTotal),
    assetsTotal: serialiseTotal(worth.assetsTotal),
    assetsWithoutValue: worth.assetsWithoutValue,
  };
}

/** ONE statement. Money-bearing obligations due in the month. */
export async function readCommitments(
  finance: FinanceRepository,
  month: FinanceMonth,
): Promise<{
  readonly items: readonly SerializedCommitment[];
  readonly expected: readonly SerializedCurrencyTotal[];
  readonly withoutAmount: number;
}> {
  const rows = await finance.listExpectedCommitments(month);
  /*
   * The TOTAL is what is still to pay, and the LIST is everything that fell
   * due. Those are two questions, and folding them into one number would make
   * "$420 expected" mean something different depending on how much of the month
   * had already been settled.
   */
  const outstanding = rows.filter((row) => !row.completed);
  const withAmount = outstanding.filter(
    (row) => row.expectedAmountMinor !== null && row.currencyCode !== null,
  );
  return {
    items: rows.map((row) => ({
      obligationId: row.obligationId,
      title: row.title,
      dueDate: row.dueDate,
      expectedAmountMinor: row.expectedAmountMinor,
      currencyCode: row.currencyCode,
      settled: row.completed,
      settledByTransaction: row.settledByTransactionId !== null,
    })),
    // A deterministic sum of RECORDED amounts. An obligation with no amount is
    // counted as such and never estimated.
    expected: serialiseTotal(
      totalMoney(
        withAmount.map((row) => ({
          minorUnits: row.expectedAmountMinor!,
          currencyCode: row.currencyCode!,
        })),
      ),
    ),
    withoutAmount: outstanding.length - withAmount.length,
  };
}

/** ONE statement. */
export async function readImports(
  finance: FinanceRepository,
  accounts: readonly SerializedFinanceAccount[],
  options: { readonly accountId?: string; readonly limit?: number } = {},
): Promise<readonly SerializedFinanceImport[]> {
  const titles = new Map(
    accounts.map((account) => [account.id, account.title]),
  );
  const rows = await finance.listImports(options);
  return rows.map((entry) => ({
    id: entry.id,
    accountId: entry.accountId,
    accountTitle: titles.get(entry.accountId) ?? "Account",
    fileName: entry.fileName,
    importedAt: entry.importedAt.toISOString(),
    rowCount: entry.rowCount,
    addedCount: entry.addedCount,
    skippedExistingCount: entry.skippedExistingCount,
    suspectedCount: entry.suspectedCount,
    invalidCount: entry.invalidCount,
  }));
}

/** Add two currency-grouped totals, for a surface that shows a combined figure. */
export function addTotals(
  a: readonly SerializedCurrencyTotal[],
  b: readonly SerializedCurrencyTotal[],
): readonly SerializedCurrencyTotal[] {
  return serialiseTotal(
    addMoneyTotals(
      { totals: a, mixed: a.length > 1 },
      { totals: b, mixed: b.length > 1 },
    ),
  );
}
