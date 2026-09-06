/**
 * V2.12 FIN-02 — the Finance home. One question: where is my money going?
 *
 * ## What is here, in order, and why it is in that order
 *
 *   1. **The month** — money in, money out, and the uncategorised count with
 *      its magnitudes. The period is in the URL and moves one month at a time.
 *   2. **Spending by category**, largest first, with the budget beside it in
 *      words where one is set.
 *   3. **Accounts**, each with its derived balance, and net worth beneath.
 *   4. **Due this month** — money-bearing Obligations, summed per currency.
 *   5. **Recent imports.**
 *
 * Largest-first in (2) is the whole reading order of the page: a month should
 * answer the question in its first line rather than in alphabetical order.
 *
 * ## What is deliberately NOT here
 *
 * No row of decorative cards across the top. No chart, no sparkline, no
 * percentage, no score, no grade and no financial-health figure — V2.13 owns
 * Reports and V2.12 owns none of that language. No net-worth SERIES, which is a
 * Report over the same derivation. And nothing that conveys meaning by colour
 * alone: money out is a figure and the word "out", a budget says "$75 over".
 *
 * ## The empty state renders LESS, not zeros
 *
 * A workspace with no accounts gets one sentence and one action. There is no
 * dashboard of `$0.00` cards and no "0% of budget used", because absence should
 * look like absence rather than like a product that is not working.
 */

import { Link, useRevalidator } from "react-router";

import { EmptyState } from "~/shared/empty-state";
import {
  balanceLabel,
  exclusionNote,
  money,
  type SerializedCurrencyTotal,
} from "~/shared/finance";
import { ButtonLink, Card } from "~/shared/ui";

import type { FinanceHomeData } from "./finance-view";
import { MonthNav } from "./MonthNav";
import { SettleCommitment } from "./SettleCommitment";

/** A total, printed per currency, because unlike money is never summed. */
function Totals({
  label,
  totals,
  testId,
}: {
  readonly label: string;
  readonly totals: readonly SerializedCurrencyTotal[];
  readonly testId: string;
}) {
  return (
    <div className="dh-finance-total" data-testid={testId}>
      <p className="dh-finance-total__label">{label}</p>
      {totals.length === 0 ? (
        <p className="dh-finance-total__figure">Nothing yet</p>
      ) : (
        totals.map((total) => (
          <p key={total.currencyCode} className="dh-finance-total__figure">
            {money(total.minorUnits, total.currencyCode)}
          </p>
        ))
      )}
    </div>
  );
}

export function FinanceHome(props: FinanceHomeData) {
  const revalidator = useRevalidator();
  const {
    accounts,
    lines,
    moneyIn,
    moneyOut,
    uncategorisedCount,
    uncategorisedIn,
    uncategorisedOut,
    transferCount,
    netWorth,
    commitments,
    imports,
    failed,
  } = props;

  if (failed) {
    return (
      <div className="dh-finance-home">
        <h1>Finance</h1>
        <p role="status">
          Finance could not be read just now. Nothing has been changed — try
          again in a moment.
        </p>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="dh-finance-home" data-testid="finance-empty">
        <h1>Finance</h1>
        <EmptyState
          title="Add your first account"
          description="An account is where your money sits: an everyday account, a savings account, a credit card, cash. Once you have one, you can import a statement or add a transaction by hand."
          primaryAction={
            <ButtonLink href="/finance/accounts/new" variant="primary">
              Add an account
            </ButtonLink>
          }
        />
      </div>
    );
  }

  const spending = lines.filter((line) => line.kind === "spending");
  const openAccounts = accounts.filter((account) => account.status === "open");
  const closedAccounts = accounts.filter(
    (account) => account.status === "closed",
  );
  const leadCurrency = netWorth.total[0]?.currencyCode ?? null;
  const netWorthExcluded =
    leadCurrency === null
      ? []
      : netWorth.total.filter((entry) => entry.currencyCode !== leadCurrency);

  return (
    <div className="dh-finance-home" data-testid="finance-home">
      <header className="dh-finance-home__header">
        <h1>Finance</h1>
        <MonthNav {...props} basePath="/finance" />
      </header>

      <section
        className="dh-finance-home__month"
        aria-labelledby="finance-month-heading"
      >
        <h2 id="finance-month-heading">{props.monthLabel}</h2>
        <div className="dh-finance-home__totals">
          <Totals label="Money in" totals={moneyIn} testId="money-in" />
          <Totals label="Money out" totals={moneyOut} testId="money-out" />
        </div>

        {/*
         * Uncategorised is reported SEPARATELY and folded into neither total. A
         * month with forty uncategorised transactions must say so rather than
         * quietly understate spend — and saying so is also what makes the phone
         * queue the obvious next action, without a badge or a nag.
         */}
        {uncategorisedCount > 0 ? (
          <p
            className="dh-finance-home__uncategorised"
            data-testid="uncategorised-note"
          >
            <Link to="/finance/transactions?uncategorised=1">
              {uncategorisedCount}{" "}
              {uncategorisedCount === 1
                ? "transaction has"
                : "transactions have"}{" "}
              no category yet
            </Link>
            {/*
             * OUT and IN, named, never one netted figure. Four uncategorised
             * rows made of a $3,200.00 salary and $279.10 of purchases summed
             * to "$2,920.90 with no category", which reads as unexplained
             * SPENDING of $2,920.90. The two directions have nothing in common
             * but the absence of a category, so they are not added together.
             */}
            {uncategorisedOut.length > 0 || uncategorisedIn.length > 0 ? (
              <span>
                {" — "}
                {[
                  uncategorisedOut.length === 0
                    ? null
                    : `${uncategorisedOut
                        .map((total) =>
                          money(total.minorUnits, total.currencyCode),
                        )
                        .join(", ")} out`,
                  uncategorisedIn.length === 0
                    ? null
                    : `${uncategorisedIn
                        .map((total) =>
                          money(total.minorUnits, total.currencyCode),
                        )
                        .join(", ")} in`,
                ]
                  .filter((part) => part !== null)
                  .join(" and ")}
                . Not counted above.
              </span>
            ) : null}
          </p>
        ) : null}

        {transferCount > 0 ? (
          <p className="dh-finance-home__transfers">
            {transferCount} transfer{transferCount === 1 ? "" : "s"} left out —
            moving your own money between your own accounts is not spending.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="finance-spending-heading">
        <h2 id="finance-spending-heading">Spending by category</h2>
        {spending.length === 0 ? (
          <p>Nothing categorised as money out this month.</p>
        ) : (
          <ul
            className="dh-finance-category-list"
            data-testid="spending-by-category"
          >
            {spending.map((line) => (
              <li
                key={`${line.categoryId ?? "none"}-${line.currencyCode}`}
                className="dh-finance-category-line"
              >
                <Link
                  to={`/finance/transactions?month=${props.month}&category=${encodeURIComponent(line.categoryId ?? "")}`}
                  className="dh-finance-category-line__name"
                >
                  {line.categoryName ?? "Uncategorised"}
                </Link>
                <span className="dh-finance-category-line__figure">
                  {money(line.magnitudeMinor, line.currencyCode)}
                </span>
                {/*
                 * The budget in WORDS, with the figures that produced it. Never
                 * a bar that turns red, never a percentage, never a score.
                 */}
                {line.budgetSentence === null ? null : (
                  <span
                    className="dh-finance-category-line__budget"
                    data-budget-state={line.budgetState ?? undefined}
                  >
                    {line.budgetSentence}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        <ButtonLink
          href={`/finance/budgets?month=${props.month}`}
          variant="subtle"
          size="sm"
        >
          Budgets
        </ButtonLink>
      </section>

      <section aria-labelledby="finance-accounts-heading">
        <h2 id="finance-accounts-heading">Accounts</h2>
        <ul className="dh-finance-account-list" data-testid="account-list">
          {openAccounts.map((account) => {
            const balance = balanceLabel(
              account.balanceMinor,
              account.currencyCode,
              account.accountType,
            );
            return (
              <li key={account.id} className="dh-finance-account-row">
                <Link
                  to={`/finance/accounts/${encodeURIComponent(account.id)}`}
                >
                  {account.title}
                </Link>
                <span className="dh-finance-account-row__balance">
                  {balance.figure}
                  {/* The qualifier is a WORD, so nothing is said by a sign alone. */}
                  {balance.qualifier === null ? null : (
                    <span className="dh-finance-account-row__qualifier">
                      {" "}
                      {balance.qualifier}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>

        {closedAccounts.length > 0 ? (
          <details className="dh-finance-home__closed">
            <summary>Closed accounts ({closedAccounts.length})</summary>
            <ul className="dh-finance-account-list">
              {closedAccounts.map((account) => {
                const balance = balanceLabel(
                  account.balanceMinor,
                  account.currencyCode,
                  account.accountType,
                );
                return (
                  <li key={account.id} className="dh-finance-account-row">
                    <Link
                      to={`/finance/accounts/${encodeURIComponent(account.id)}`}
                    >
                      {account.title}
                    </Link>
                    <span className="dh-finance-account-row__balance">
                      {balance.figure}
                      {balance.qualifier === null ? null : (
                        <span> {balance.qualifier}</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p>
              A closed account still counts towards net worth. Closing changes
              what DalyHub offers, never what the arithmetic says.
            </p>
          </details>
        ) : null}

        <Card padding="compact" data-testid="net-worth">
          <h3>Net worth</h3>
          {netWorth.total.length === 0 ? (
            <p>Nothing to add up yet.</p>
          ) : (
            netWorth.total.map((total) => (
              <p
                key={total.currencyCode}
                className="dh-finance-networth__figure"
              >
                {money(total.minorUnits, total.currencyCode)}
              </p>
            ))
          )}
          {netWorthExcluded.length > 0 ? (
            <p className="dh-finance-networth__note">
              {exclusionNote(netWorthExcluded)}
            </p>
          ) : null}
          {netWorth.assetsWithoutValue > 0 ? (
            <p
              className="dh-finance-networth__note"
              data-testid="assets-without-value"
            >
              {netWorth.assetsWithoutValue}{" "}
              {netWorth.assetsWithoutValue === 1 ? "asset has" : "assets have"}{" "}
              no recorded value, so{" "}
              {netWorth.assetsWithoutValue === 1 ? "it is" : "they are"} left
              out rather than counted as nothing.
            </p>
          ) : null}
          <p className="dh-finance-networth__note">
            Your account balances plus your assets&rsquo; latest recorded
            values. A loan is the debt and the thing it bought is an Asset —
            both belong.
          </p>
        </Card>
      </section>

      <section aria-labelledby="finance-commitments-heading">
        <h2 id="finance-commitments-heading">Due this month</h2>
        {commitments.items.length === 0 ? (
          <p>Nothing with a date and an amount falls due this month.</p>
        ) : (
          <>
            {commitments.expected.map((total) => (
              <p key={total.currencyCode} data-testid="expected-total">
                {money(total.minorUnits, total.currencyCode)} expected
              </p>
            ))}
            {commitments.withoutAmount > 0 ? (
              <p data-testid="commitments-without-amount">
                {commitments.withoutAmount} with no amount recorded — not
                estimated.
              </p>
            ) : null}
            <ul className="dh-finance-commitment-list">
              {commitments.items.map((item) => (
                <li key={item.obligationId}>
                  <Link
                    to={`/obligations/${encodeURIComponent(item.obligationId)}`}
                  >
                    {item.title}
                  </Link>
                  {item.expectedAmountMinor !== null &&
                  item.currencyCode !== null ? (
                    <span>
                      {" · "}
                      {money(item.expectedAmountMinor, item.currencyCode)}
                    </span>
                  ) : (
                    <span> · amount not recorded</span>
                  )}
                  {item.settled ? (
                    <span>
                      {item.settledByTransaction
                        ? " · paid, matched to a transaction"
                        : " · paid"}
                    </span>
                  ) : null}
                  {/*
                   * V2.12 FIN-04 — settling lives HERE rather than on the
                   * Obligation record, because the dependency runs one way:
                   * Finance knows about obligations and Life Admin knows
                   * nothing about a transaction. The WRITE is still the
                   * obligation's own endpoint.
                   */}
                  <SettleCommitment
                    commitment={item}
                    onSettled={() => revalidator.revalidate()}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section aria-labelledby="finance-imports-heading">
        <h2 id="finance-imports-heading">Recent imports</h2>
        {imports.length === 0 ? (
          <p>
            No statements imported yet.{" "}
            <Link to="/finance/import">Import one</Link>, or{" "}
            <Link to="/finance/transactions">add a transaction by hand</Link>.
          </p>
        ) : (
          <ul className="dh-finance-import-list" data-testid="recent-imports">
            {imports.map((entry) => (
              <li key={entry.id}>
                <span>{entry.fileName}</span>
                <span>
                  {" · "}
                  {entry.accountTitle}
                  {" · "}
                  {entry.addedCount} added
                  {entry.skippedExistingCount > 0
                    ? `, ${entry.skippedExistingCount} already there`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="dh-finance-home__actions">
          <ButtonLink href="/finance/import" variant="secondary" size="sm">
            Import a statement
          </ButtonLink>
          <ButtonLink href="/finance/accounts/new" variant="subtle" size="sm">
            Add an account
          </ButtonLink>
          <ButtonLink href="/finance/categories" variant="subtle" size="sm">
            Categories
          </ButtonLink>
        </div>
      </section>
    </div>
  );
}
