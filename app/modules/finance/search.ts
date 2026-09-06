/**
 * V2.12 — the ONE Finance search provider, and the privacy boundary it holds.
 *
 * One bounded, workspace-scoped read through the authoritative repository —
 * never a second search implementation and never an unbounded scan.
 *
 * ## What it matches, and what it will NEVER match
 *
 * ACCOUNTS by name, with the account kind and the institution in the subtitle.
 * TRANSACTIONS by the DISPLAY payee only, with the account and the date in the
 * subtitle. That is the whole list, and every omission is deliberate:
 *
 *   - **No amount. Anywhere.** Not in a title, not in a subtitle, not in an
 *     excerpt, not as a match. A result list is the surface most likely to be
 *     read over someone's shoulder, and an amount is the most private fact a
 *     transaction carries. The Assets provider has held this line since ASSET-03
 *     and the Obligations provider since V2.10; this is the third.
 *   - **No BALANCE on an account.** Same reason, and worse: a balance is the
 *     whole of an account.
 *   - **No `source_description`.** It is raw bank text the owner never chose —
 *     terminal ids, card fragments, suburb codes — and matching it would put
 *     `EFTPOS 4821` in front of a query for `4821`.
 *   - **No memo.** It is body content, and reaching body content is governed by
 *     the explicit-query boundary (ADR-114 decision 2).
 *   - **Nothing at all for an empty query**, and `finance_transaction` is in
 *     `RECENCY_EXCLUDED_TYPES` besides, so a transaction is never volunteered
 *     before the owner has typed something. An ACCOUNT is listable there, for
 *     the same reason a Person is: a name is not a confession.
 *
 * `test/unit/finance/search-privacy.test.ts` asserts all of it structurally,
 * against this file's source with comments stripped.
 */

import {
  FINANCE_ACCOUNT_ENTITY_TYPE,
  FINANCE_ACCOUNT_TYPE_LABELS,
  FINANCE_TRANSACTION_ENTITY_TYPE,
} from "~/kernel/finance";
import type {
  SearchExecutor,
  SearchProviderContribution,
  SearchResultItem,
} from "~/kernel/modules";

const searchFinance: SearchExecutor = async (query, context) => {
  const text = query.text.trim();
  // The explicit-query boundary, at its narrowest: no text, no results.
  if (text.length === 0 || query.limit <= 0) return [];

  const spec = "cloudflare:workers";
  const [{ env }, { bindWorkspaceRepositories }, { createSystemActorContext }] =
    await Promise.all([
      import(/* @vite-ignore */ spec) as Promise<{
        env: import("~/platform/workspaces").WorkspaceScopeEnv;
      }>,
      import("~/platform/workspaces"),
      import("~/kernel/activity"),
    ]);
  const scope = bindWorkspaceRepositories(
    env,
    context.workspace,
    createSystemActorContext(),
  );

  const lowered = text.toLocaleLowerCase("en");
  const accounts = await scope.finance.listAccountsWithBalances({
    includeClosed: true,
  });
  const accountResults = accounts
    .filter((entry) =>
      entry.account.title.toLocaleLowerCase("en").includes(lowered),
    )
    .slice(0, query.limit)
    .map<SearchResultItem>((entry) => ({
      id: `finance-account:${entry.account.id}`,
      entityId: entry.account.id,
      title: entry.account.title,
      // The KIND and the institution. Never the balance, and never a count of
      // transactions, which is a proxy for how much the owner spends.
      subtitle: [
        FINANCE_ACCOUNT_TYPE_LABELS[entry.account.accountType],
        entry.account.institution,
        entry.account.status === "closed" ? "Closed" : null,
      ]
        .filter(Boolean)
        .join(" · "),
      entityType: FINANCE_ACCOUNT_ENTITY_TYPE,
      target: {
        kind: "route",
        to: `/finance/accounts/${encodeURIComponent(entry.account.id)}`,
      },
    }));

  const remaining = query.limit - accountResults.length;
  if (remaining <= 0) return accountResults;

  const page = await scope.finance.listTransactions({
    filters: { query: text },
    limit: remaining,
  });
  const transactionResults = page.items.map<SearchResultItem>((view) => ({
    id: `finance-transaction:${view.transaction.id}`,
    entityId: view.transaction.id,
    // The DISPLAY payee — what the owner named it, or what the import proposed.
    title: view.transaction.payeeDisplay,
    // The account and the date. No amount, no source description, no memo.
    subtitle: [view.accountTitle, view.transaction.occurredOn]
      .filter(Boolean)
      .join(" · "),
    entityType: FINANCE_TRANSACTION_ENTITY_TYPE,
    // A transaction has no record page: it opens in the shared Drawer, over the
    // transactions surface, which is the one place it can be acted on.
    target: {
      kind: "route",
      to: `/finance/transactions?open=${encodeURIComponent(view.transaction.id)}`,
    },
  }));

  return [...accountResults, ...transactionResults];
};

export const financeSearchProvider: SearchProviderContribution = {
  id: "finance.search",
  label: "Finance",
  entityTypes: [FINANCE_ACCOUNT_ENTITY_TYPE, FINANCE_TRANSACTION_ENTITY_TYPE],
  search: searchFinance,
};
