/**
 * V2.12 — the account record.
 *
 * An account is an ENTITY, so it gets the record layout every other record has:
 * a header, a summary, tabs. What it deliberately does NOT get is a mini
 * dashboard — no chart of this account's spending, no trend, no per-account
 * budget, no second month control. Those questions belong on the Finance home,
 * which asks them once for every account rather than once per account.
 *
 * ## The balance is stated with its INPUTS
 *
 * `$1,240.18 = $1,000.00 opening + 42 transactions`. A derived figure that shows
 * its derivation is a figure the owner can check, and it is the plainest
 * possible statement of ADR-120 decision 5: there is nothing stored here, so
 * there is nothing to disagree with.
 *
 * ## Evidence is V2.11's tab, unchanged
 *
 * A statement PDF belongs to the account. `attachmentsTab` is one line, which
 * is what ADR-119 said adding a consumer should cost.
 */

import { useState } from "react";
import { Link, useRevalidator } from "react-router";

import { FINANCE_ACCOUNT_TYPE_LABELS } from "~/kernel/finance";
import { attachmentsTab } from "~/shared/attachments";
import {
  TransactionRow,
  balanceLabel,
  financeDate,
  money,
} from "~/shared/finance";
import { RecordLayout } from "~/shared/record-layout";
import { EntityIcon } from "~/shared/entity";
import { Button, ButtonLink } from "~/shared/ui";

import type { FinanceAccountRecordData } from "./finance-view";

export function FinanceAccountRecord(props: FinanceAccountRecordData) {
  const { account, transactions, imports, attachments, transactionTotal } =
    props;
  const revalidator = useRevalidator();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("transactions");

  const balance = balanceLabel(
    account.balanceMinor,
    account.currencyCode,
    account.accountType,
  );

  async function mutate(body: Record<string, unknown>) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        `/finance/accounts/${encodeURIComponent(account.id)}/mutate`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const result = (await response.json()) as {
        ok: boolean;
        message?: string;
      };
      if (!result.ok) {
        setError(result.message ?? "That could not be saved.");
        return;
      }
      revalidator.revalidate();
    } catch {
      setError("That could not be saved. Nothing has been changed.");
    } finally {
      setPending(false);
    }
  }

  const tabs = [
    {
      id: "transactions",
      label: "Transactions",
      badge: transactionTotal > 0 ? String(transactionTotal) : undefined,
      content:
        transactions.length === 0 ? (
          <p>
            Nothing in this account yet.{" "}
            <Link
              to={`/finance/import?account=${encodeURIComponent(account.id)}`}
            >
              Import a statement
            </Link>
            .
          </p>
        ) : (
          <>
            <ul className="dh-transaction-list">
              {transactions.map((transaction) => (
                <TransactionRow
                  key={transaction.id}
                  transaction={transaction}
                  showAccount={false}
                />
              ))}
            </ul>
            <Link
              to={`/finance/transactions?account=${encodeURIComponent(account.id)}`}
            >
              All transactions in this account
            </Link>
          </>
        ),
    },
    {
      id: "imports",
      label: "Imports",
      badge: imports.length > 0 ? String(imports.length) : undefined,
      content:
        imports.length === 0 ? (
          <p>No statements have been imported into this account.</p>
        ) : (
          <ul className="dh-finance-import-list">
            {imports.map((entry) => (
              <li key={entry.id}>
                <span>{entry.fileName}</span>
                <span>
                  {" · "}
                  {financeDate(entry.importedAt.slice(0, 10))}
                  {" · "}
                  {entry.addedCount} added, {entry.skippedExistingCount} already
                  there, {entry.invalidCount} unreadable
                </span>
              </li>
            ))}
          </ul>
        ),
    },
    attachmentsTab({
      ownerEntityId: account.id,
      attachments,
      description:
        "A statement, a letter from the bank, anything that belongs to this account.",
      onChanged: () => revalidator.revalidate(),
    }),
  ];

  return (
    <RecordLayout
      title={account.title}
      typeLabel={FINANCE_ACCOUNT_TYPE_LABELS[account.accountType]}
      icon={<EntityIcon type="finance_account" />}
      breadcrumb={[
        { id: "finance", label: "Finance", href: "/finance" },
        { id: "account", label: account.title },
      ]}
      metadata={[
        {
          id: "kind",
          label: "Kind",
          value: FINANCE_ACCOUNT_TYPE_LABELS[account.accountType],
        },
        { id: "currency", label: "Currency", value: account.currencyCode },
        {
          id: "opened",
          label: "Opened",
          value: financeDate(account.openingDate),
        },
        ...(account.institution === null
          ? []
          : [
              {
                id: "institution",
                label: "Institution",
                value: account.institution,
              },
            ]),
        ...(account.status === "closed"
          ? [{ id: "status", label: "Status", value: "Closed" }]
          : []),
      ]}
      summaryBar={{
        /*
         * The balance as a SIGNAL, and its DERIVATION beside it in the note. A
         * derived figure that shows its inputs is a figure the owner can check
         * rather than trust — and there is no stored balance anywhere to compare
         * it against, which is the whole of ADR-120 decision 5.
         *
         * The qualifier is a WORD ("owing", "in credit", "overdrawn"), so a
         * liability's negative balance is never conveyed by a minus sign or a
         * colour on its own.
         */
        signals: [
          {
            id: "balance",
            text: `Balance ${balance.figure}${balance.qualifier === null ? "" : ` ${balance.qualifier}`}`,
          },
        ],
        note: `${money(account.openingBalanceMinor, account.currencyCode)} on ${financeDate(account.openingDate)}, plus ${account.transactionCount} ${account.transactionCount === 1 ? "transaction" : "transactions"}.`,
      }}
      tabs={tabs}
      activeTabId={tab}
      onTabChange={setTab}
    >
      {error === null ? null : (
        <p role="alert" className="dh-finance-account__error">
          {error}
        </p>
      )}

      <div className="dh-finance-account__actions">
        <ButtonLink
          href={`/finance/import?account=${encodeURIComponent(account.id)}`}
          variant="secondary"
          size="sm"
        >
          Import a statement
        </ButtonLink>
        <Button
          variant="subtle"
          size="sm"
          disabled={pending}
          onClick={() =>
            void mutate({
              intent: "set-status",
              status: account.status === "open" ? "closed" : "open",
            })
          }
          data-testid="account-toggle-status"
        >
          {account.status === "open" ? "Close this account" : "Reopen"}
        </Button>
        {/*
         * Delete is offered ONLY for an account with no history, because the
         * repository refuses the other case by name and an action that is
         * always refused is not an action.
         */}
        {account.transactionCount === 0 ? (
          <Button
            variant="subtle"
            size="sm"
            disabled={pending}
            onClick={() => void mutate({ intent: "delete" })}
            data-testid="account-delete"
          >
            Delete
          </Button>
        ) : null}
      </div>

      {account.status === "closed" ? (
        <p className="dh-finance-account__closed-note">
          Closed accounts still count towards net worth. Closing changes what
          DalyHub offers, never what the arithmetic says.
        </p>
      ) : null}
    </RecordLayout>
  );
}
