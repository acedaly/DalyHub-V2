/**
 * V2.12 FIN-03 — the transactions surface, and the phone's daily-driver job.
 *
 * ONE screen serves two questions, because they are one list under two filters:
 *
 *   - `/finance/transactions?month=2026-09` — the month, newest first;
 *   - `/finance/transactions?uncategorised=1` — the QUEUE, every uncategorised
 *     row in any month, which is what an owner opens on a phone.
 *
 * A second screen would be a second row, a second set of actions and a second
 * place for the two to disagree about what a transaction is.
 *
 * ## The queue has no month, and that is the decision
 *
 * An owner clearing uncategorised transactions wants every one of them, not
 * September's. Filtering the queue by month would leave rows the owner cannot
 * see and cannot clear, and the count on the Finance home would stop matching
 * the list it links to.
 *
 * ## Categorising is one tap, and it never happens by itself
 *
 * A row with a deterministic suggestion offers it as a button beside
 * "Categorise". Accepting it is what makes the category CONFIRMED, which is the
 * only thing the suggestion rule learns from — so it can never learn from its
 * own guesses. Nothing auto-applies, and there is no AI anywhere near it.
 *
 * ## No gesture without a keyboard path
 *
 * There is no swipe. The category control is a button that opens the picker,
 * which works by thumb, by keyboard and by screen reader with one
 * implementation — see `TransactionRow`'s own header for why a swipe fails
 * DHDS-11's first question.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useRevalidator, useSearchParams } from "react-router";

import { EmptyState } from "~/shared/empty-state";
import {
  CategoryPicker,
  TransactionDrawer,
  TransactionRow,
  type SerializedFinanceTransaction,
} from "~/shared/finance";
import { Button, ButtonLink, Sheet } from "~/shared/ui";

import type { FinanceTransactionsData } from "./finance-view";
import { MonthNav } from "./MonthNav";
import { NewTransactionForm } from "./NewTransactionForm";
import { useFinanceActions } from "./use-finance-actions";

export function FinanceTransactions(props: FinanceTransactionsData) {
  const { accounts, categories, transactions, uncategorised, total, failed } =
    props;
  const [searchParams, setSearchParams] = useSearchParams();
  const revalidator = useRevalidator();
  const actions = useFinanceActions(() => revalidator.revalidate());

  const [picking, setPicking] = useState<SerializedFinanceTransaction | null>(
    null,
  );
  const [opened, setOpened] = useState<string | null>(props.openTransactionId);
  const [adding, setAdding] = useState(false);

  const openedTransaction = useMemo(
    () => transactions.find((entry) => entry.id === opened) ?? null,
    [opened, transactions],
  );

  /*
   * The transfer candidates are read when the drawer OPENS, not with the page.
   * They are a per-transaction question ("what in another account is exactly the
   * opposite of this?"), and asking it for every row of a fifty-row list would
   * be fifty statements to answer a question about one.
   */
  const { loadTransferCandidates } = actions;
  useEffect(() => {
    if (opened === null) return;
    void loadTransferCandidates(opened);
  }, [opened, loadTransferCandidates]);

  const setLens = useCallback(
    (queue: boolean) => {
      setSearchParams((previous) => {
        const next = new URLSearchParams(previous);
        next.delete("cursor");
        if (queue) {
          next.set("uncategorised", "1");
          next.delete("month");
        } else {
          next.delete("uncategorised");
        }
        return next;
      });
    },
    [setSearchParams],
  );

  if (failed) {
    return (
      <div className="dh-finance-transactions">
        <h1>Transactions</h1>
        <p role="status">
          Your transactions could not be read just now. Nothing has been
          changed.
        </p>
      </div>
    );
  }

  return (
    <div className="dh-finance-transactions" data-testid="finance-transactions">
      <header className="dh-finance-transactions__header">
        <h1>{uncategorised ? "Uncategorised" : "Transactions"}</h1>
        {uncategorised ? null : (
          <MonthNav {...props} basePath="/finance/transactions" />
        )}
        <p
          className="dh-finance-transactions__count"
          data-testid="transaction-count"
        >
          {/*
           * The TOTAL over the whole filtered set, counted in its own statement
           * rather than derived from the loaded page — the defect DEBT-232
           * records, where a bounded page was counted and printed as the total.
           */}
          {total} {total === 1 ? "transaction" : "transactions"}
        </p>
      </header>

      <div
        className="dh-finance-transactions__lens"
        role="group"
        aria-label="Which transactions"
      >
        <Button
          variant={uncategorised ? "primary" : "subtle"}
          size="sm"
          aria-pressed={uncategorised}
          onClick={() => setLens(true)}
          data-testid="lens-uncategorised"
        >
          Uncategorised
        </Button>
        <Button
          variant={uncategorised ? "subtle" : "primary"}
          size="sm"
          aria-pressed={!uncategorised}
          onClick={() => setLens(false)}
          data-testid="lens-month"
        >
          By month
        </Button>
        <Button
          variant="subtle"
          size="sm"
          onClick={() => setAdding(true)}
          disabled={accounts.length === 0}
          data-testid="add-transaction"
        >
          Add a transaction
        </Button>
      </div>

      {actions.error === null ? null : (
        <p role="alert" className="dh-finance-transactions__error">
          {actions.error}
        </p>
      )}

      {transactions.length === 0 ? (
        uncategorised ? (
          <EmptyState
            title="Nothing left to categorise"
            description="Every transaction has a category. When you import a statement, the new ones land here."
            primaryAction={
              <ButtonLink href="/finance" variant="secondary">
                Back to Finance
              </ButtonLink>
            }
          />
        ) : accounts.length === 0 ? (
          <EmptyState
            title="Add your first account"
            description="Transactions belong to an account, so that is the first thing to make."
            primaryAction={
              <ButtonLink href="/finance/accounts/new" variant="primary">
                Add an account
              </ButtonLink>
            }
          />
        ) : (
          <EmptyState
            title={`Nothing in ${props.monthLabel}`}
            description="Import a statement, or add a transaction by hand."
            primaryAction={
              <ButtonLink href="/finance/import" variant="secondary">
                Import a statement
              </ButtonLink>
            }
          />
        )
      ) : (
        <ul className="dh-transaction-list" data-testid="transaction-list">
          {transactions.map((transaction) => (
            <TransactionRow
              key={transaction.id}
              transaction={transaction}
              busy={actions.pendingId === transaction.id}
              onOpen={(entry) => setOpened(entry.id)}
              onCategorise={(entry) => setPicking(entry)}
              onAcceptSuggestion={(entry) =>
                actions.setCategory(entry.id, entry.suggestedCategoryId!)
              }
            />
          ))}
        </ul>
      )}

      {props.nextCursor === null ? null : (
        <Link
          className="dh-finance-transactions__more"
          to={(() => {
            const next = new URLSearchParams(searchParams);
            next.set("cursor", props.nextCursor);
            return `/finance/transactions?${next.toString()}`;
          })()}
          data-testid="transactions-load-more"
        >
          Show more
        </Link>
      )}

      {/*
       * The picker is a SHEET on a phone and an overlay above `md` — the shared
       * adaptive surface, not a Finance overlay of its own.
       */}
      {picking === null ? null : (
        <Sheet
          opener={null}
          onClose={() => setPicking(null)}
          title={`Category for ${picking.payeeDisplay}`}
        >
          <CategoryPicker
            categories={categories}
            selectedId={picking.categoryId}
            suggestion={
              picking.suggestedCategoryId !== null &&
              picking.suggestedCategoryName !== null
                ? {
                    categoryId: picking.suggestedCategoryId,
                    categoryName: picking.suggestedCategoryName,
                    payeeDisplay: picking.payeeDisplay,
                  }
                : null
            }
            busy={actions.pendingId === picking.id}
            onChoose={(categoryId) => {
              void actions.setCategory(picking.id, categoryId);
              setPicking(null);
            }}
          />
        </Sheet>
      )}

      {openedTransaction === null ? null : (
        <Sheet
          opener={null}
          onClose={() => setOpened(null)}
          title={openedTransaction.payeeDisplay}
        >
          <TransactionDrawer
            transaction={openedTransaction}
            categories={categories}
            attachments={[]}
            transferCandidates={actions.transferCandidates}
            busy={actions.pendingId === openedTransaction.id}
            onSetCategory={(categoryId) =>
              void actions.setCategory(openedTransaction.id, categoryId)
            }
            onSaveDetails={(input) =>
              void actions.saveDetails(openedTransaction.id, input)
            }
            onLinkTransfer={(partnerId) =>
              void actions.linkTransfer(openedTransaction.id, partnerId)
            }
            onUnlinkTransfer={() =>
              void actions.unlinkTransfer(openedTransaction.id)
            }
            onDelete={() => {
              void actions.remove(openedTransaction.id);
              setOpened(null);
            }}
          />
        </Sheet>
      )}

      {adding ? (
        <Sheet
          opener={null}
          onClose={() => setAdding(false)}
          title="Add a transaction"
        >
          <NewTransactionForm
            accounts={accounts}
            categories={categories}
            todayIso={props.todayIso}
            busy={actions.pendingId === "new"}
            onSubmit={async (input) => {
              await actions.create(input);
              setAdding(false);
            }}
          />
        </Sheet>
      ) : null}
    </div>
  );
}
