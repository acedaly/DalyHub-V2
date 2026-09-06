/**
 * V2.12 — the Finance loaders.
 *
 * One function per surface, each reading through
 * `~/platform/finance/finance-facts.server` so no screen serialises a row
 * itself. A scope or read failure degrades to a calm error state so the shell
 * stays usable — never a 500, exactly as every other collection route behaves.
 *
 * ## The URL carries ids and periods, and nothing else
 *
 * `?month=2026-09`, `?account=<id>`, `?category=<id>`, `?uncategorised=1`. No
 * payee text, no amount, no description. A URL is shoulder-surfable, shareable
 * and logged, and a Finance URL that carried "WOOLWORTHS DUBBO" would put the
 * owner's week in a browser history.
 */

import { attachmentViews } from "~/kernel/attachments";
import type { AuthenticatedSession } from "~/kernel/auth";
import {
  addMonths,
  monthLabel,
  resolveMonth,
  type FinanceMonth,
} from "~/kernel/finance";
import { DEFAULT_OWNER_TIME_ZONE } from "~/kernel/preferences";
import {
  readAccounts,
  readCategories,
  readCommitments,
  readImports,
  readMonthLines,
  readNetWorth,
  readTransactionPage,
} from "~/platform/finance/finance-facts.server";
import {
  resolveAuthenticatedWorkspaceScope,
  type WorkspaceScopeEnv,
} from "~/platform/workspaces";
import { ownerCalendarIso } from "~/shared/datetime";

import type {
  FinanceAccountRecordData,
  FinanceBudgetsData,
  FinanceCategoriesData,
  FinanceHomeData,
  FinanceImportData,
  FinanceTransactionsData,
} from "./finance-view";

interface LoaderInput {
  readonly env: WorkspaceScopeEnv;
  readonly session: AuthenticatedSession;
  readonly request: Request;
}

/** The month vocabulary every Finance surface shares. */
function monthContext(month: FinanceMonth) {
  return {
    month,
    monthLabel: monthLabel(month),
    previousMonth: addMonths(month, -1),
    nextMonth: addMonths(month, 1),
  };
}

/** A calm fallback day, so a preferences failure still renders a usable page. */
function fallbackToday(): string {
  return ownerCalendarIso(new Date(), DEFAULT_OWNER_TIME_ZONE);
}

/**
 * The Finance home.
 *
 * Six bounded statements: the owner's calendar day, the accounts (with every
 * balance derived in one grouped read), the month's category totals, the
 * month's budgets, the latest Asset valuations, the month's commitments and the
 * recent imports. Flat at ten transactions and at ten thousand.
 */
export async function loadFinanceHome(
  input: LoaderInput,
): Promise<FinanceHomeData> {
  const url = new URL(input.request.url);
  let todayIso = fallbackToday();
  let month = resolveMonth(url.searchParams.get("month"), todayIso);

  const empty: FinanceHomeData = {
    ...monthContext(month),
    todayIso,
    accounts: [],
    lines: [],
    moneyOut: [],
    moneyIn: [],
    uncategorisedOut: [],
    uncategorisedIn: [],
    uncategorisedCount: 0,
    transferCount: 0,
    netWorth: {
      total: [],
      accountsTotal: [],
      assetsTotal: [],
      assetsWithoutValue: 0,
    },
    commitments: { items: [], expected: [], withoutAmount: 0 },
    imports: [],
    failed: true,
  };

  try {
    const scope = await resolveAuthenticatedWorkspaceScope(
      input.env,
      input.session,
    );
    todayIso = await scope.ownerTodayIso();
    month = resolveMonth(url.searchParams.get("month"), todayIso);

    const accounts = await readAccounts(scope.finance);
    const [monthLines, netWorth, commitments, imports] = await Promise.all([
      readMonthLines(scope.finance, month),
      readNetWorth(scope.finance, accounts),
      readCommitments(scope.finance, month),
      readImports(scope.finance, accounts, { limit: 4 }),
    ]);

    return {
      ...monthContext(month),
      todayIso,
      accounts,
      ...monthLines,
      netWorth,
      commitments,
      imports,
      failed: false,
    };
  } catch {
    return { ...empty, ...monthContext(month), todayIso };
  }
}

/**
 * The transactions surface — the month's list, and the uncategorised queue that
 * the SAME route serves with `?uncategorised=1`.
 *
 * They are one list under two filters. A second screen would be a second row, a
 * second set of actions and a second place for the two to disagree.
 */
export async function loadFinanceTransactions(
  input: LoaderInput,
): Promise<FinanceTransactionsData> {
  const url = new URL(input.request.url);
  const uncategorised = url.searchParams.get("uncategorised") === "1";
  const accountId = url.searchParams.get("account") ?? undefined;
  const categoryId = url.searchParams.get("category") ?? undefined;
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const query = (url.searchParams.get("q") ?? "").trim();
  const openId = url.searchParams.get("open");

  let todayIso = fallbackToday();
  let month = resolveMonth(url.searchParams.get("month"), todayIso);

  try {
    const scope = await resolveAuthenticatedWorkspaceScope(
      input.env,
      input.session,
    );
    todayIso = await scope.ownerTodayIso();
    month = resolveMonth(url.searchParams.get("month"), todayIso);

    const [accounts, categories] = await Promise.all([
      readAccounts(scope.finance),
      readCategories(scope.finance),
    ]);
    const page = await readTransactionPage(scope.finance, {
      accountId,
      // The queue is `category_id IS NULL`, which is what uncategorised IS —
      // there is no `uncategorised` category row to filter on.
      categoryId: uncategorised ? null : categoryId,
      /*
       * The QUEUE has no month, and that is the point: an owner clearing
       * uncategorised transactions wants every one of them, not September's.
       * The month list has one, because a month is what it is.
       */
      month: uncategorised ? undefined : month,
      query: query === "" ? undefined : query,
      cursor,
    });

    /*
     * The page's RECEIPTS, in one bulk read.
     *
     * The drawer used to be handed an empty list, so an uploaded receipt lived
     * only in the hook's local state: close the drawer or reload and the
     * evidence read as absent, with no way to open or remove it. `listForOwners`
     * is one statement for the whole page, so this costs a round trip rather
     * than one per row — and the drawer can be opened without a navigation.
     */
    const attachmentsByTransaction = await scope.attachments.listForOwners(
      page.items.map((item) => item.id),
    );

    return {
      ...monthContext(month),
      todayIso,
      uncategorised,
      accountId: accountId ?? null,
      categoryId: categoryId ?? null,
      query,
      openTransactionId: openId,
      accounts,
      categories,
      transactions: page.items,
      attachments: Object.fromEntries(
        [...attachmentsByTransaction].map(([id, records]) => [
          id,
          attachmentViews(records),
        ]),
      ),
      nextCursor: page.nextCursor,
      total: page.total,
      failed: false,
    };
  } catch {
    return {
      ...monthContext(month),
      todayIso,
      uncategorised,
      accountId: accountId ?? null,
      categoryId: categoryId ?? null,
      query,
      openTransactionId: openId,
      accounts: [],
      categories: [],
      transactions: [],
      attachments: {},
      nextCursor: null,
      total: 0,
      failed: true,
    };
  }
}

/** Budgets for a month, with what was actually spent beside each. */
export async function loadFinanceBudgets(
  input: LoaderInput,
): Promise<FinanceBudgetsData> {
  const url = new URL(input.request.url);
  let todayIso = fallbackToday();
  let month = resolveMonth(url.searchParams.get("month"), todayIso);

  try {
    const scope = await resolveAuthenticatedWorkspaceScope(
      input.env,
      input.session,
    );
    todayIso = await scope.ownerTodayIso();
    month = resolveMonth(url.searchParams.get("month"), todayIso);

    const [categories, monthLines, accounts] = await Promise.all([
      readCategories(scope.finance),
      /*
       * The SAME read the Finance home calls. That is what makes "the budget
       * screen and the home agree" a property of the code rather than a rule two
       * screens have to remember, and a kernel test asserts it on a fixture
       * built to expose a second implementation.
       */
      readMonthLines(scope.finance, month),
      readAccounts(scope.finance),
    ]);

    return {
      ...monthContext(month),
      todayIso,
      categories: categories.filter((category) => category.kind === "spending"),
      lines: monthLines.lines,
      budgets: monthLines.budgets,
      // The currency to offer first: the one most of the owner's accounts are
      // in. Deterministic, and never a guess about what they meant.
      defaultCurrency: accounts[0]?.currencyCode ?? "AUD",
      failed: false,
    };
  } catch {
    return {
      ...monthContext(month),
      todayIso,
      categories: [],
      lines: [],
      budgets: [],
      defaultCurrency: "AUD",
      failed: true,
    };
  }
}

/** The category vocabulary, with the count a delete refusal would name. */
export async function loadFinanceCategories(
  input: LoaderInput,
): Promise<FinanceCategoriesData> {
  try {
    const scope = await resolveAuthenticatedWorkspaceScope(
      input.env,
      input.session,
    );
    return {
      categories: await readCategories(scope.finance, {
        includeArchived: true,
        withCounts: true,
      }),
      failed: false,
    };
  } catch {
    return { categories: [], failed: true };
  }
}

/** The import screen: the accounts to choose from, and the recent imports. */
export async function loadFinanceImport(
  input: LoaderInput,
): Promise<FinanceImportData> {
  const url = new URL(input.request.url);
  const accountId = url.searchParams.get("account");
  try {
    const scope = await resolveAuthenticatedWorkspaceScope(
      input.env,
      input.session,
    );
    const accounts = await readAccounts(scope.finance, {
      includeClosed: false,
    });
    const chosen =
      accounts.find((account) => account.id === accountId) ??
      accounts[0] ??
      null;
    const savedMapping =
      chosen === null
        ? null
        : ((await scope.finance.getAccount(chosen.id))?.importMappingJson ??
          null);
    return {
      accounts,
      // The account is ALWAYS chosen explicitly and is never inferred from a
      // filename; this is a pre-selection of the first one, which the owner
      // changes with a control that is right there.
      selectedAccountId: chosen?.id ?? null,
      savedMappingJson: savedMapping,
      imports: await readImports(scope.finance, accounts, { limit: 10 }),
      failed: false,
    };
  } catch {
    return {
      accounts: [],
      selectedAccountId: null,
      savedMappingJson: null,
      imports: [],
      failed: true,
    };
  }
}

/** One account's record: its identity, its balance, its transactions, its imports. */
export async function loadFinanceAccount(
  input: LoaderInput & { readonly accountId: string },
): Promise<FinanceAccountRecordData | null> {
  try {
    const scope = await resolveAuthenticatedWorkspaceScope(
      input.env,
      input.session,
    );
    const accounts = await readAccounts(scope.finance);
    const account = accounts.find((entry) => entry.id === input.accountId);
    // Not found, never forbidden: a workspace must not learn that an account
    // exists elsewhere from the shape of a refusal.
    if (account === undefined) return null;

    const [page, imports, categories, attachments] = await Promise.all([
      readTransactionPage(scope.finance, {
        accountId: account.id,
        limit: 25,
      }),
      readImports(scope.finance, accounts, {
        accountId: account.id,
        limit: 10,
      }),
      readCategories(scope.finance),
      scope.attachments.listForOwner(account.id),
    ]);

    return {
      account,
      transactions: page.items,
      nextCursor: page.nextCursor,
      transactionTotal: page.total,
      imports,
      categories,
      attachments: attachmentViews(attachments),
      failed: false,
    };
  } catch {
    return null;
  }
}

/**
 * The create-account page needs exactly one server fact: the owner's calendar
 * day, so "As at" defaults to today in the owner's zone rather than the
 * Worker's UTC — which in Australia is yesterday for most of the working day.
 */
export async function loadNewFinanceAccount(
  input: Omit<LoaderInput, "request">,
): Promise<{ readonly todayIso: string }> {
  try {
    const scope = await resolveAuthenticatedWorkspaceScope(
      input.env,
      input.session,
    );
    return { todayIso: await scope.ownerTodayIso() };
  } catch {
    return { todayIso: fallbackToday() };
  }
}
