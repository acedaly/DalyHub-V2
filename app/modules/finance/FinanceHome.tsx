/**
 * V2.12 FIN-02 / UNTITLED-16 — the Finance home. One question: where is my money
 * going?
 *
 * ## What is here, in order, and why it is in that order
 *
 *   1. **The month** — money in, money out, the uncategorised count with its
 *      magnitudes, and the TWELVE-MONTH history of exactly those two figures.
 *      The period is in the URL and moves one month at a time.
 *   2. **Spending by category**, largest first, with the budget beside it in
 *      words where one is set.
 *   3. **Accounts** — net worth as the section's headline, the balances that
 *      produce it as the evidence beneath.
 *   4. **Due this month** — money-bearing Obligations, summed per currency.
 *   5. **Recent imports.**
 *
 * Largest-first in (2) is the whole reading order of the page: a month should
 * answer the question in its first line rather than in alphabetical order.
 *
 * ## UNTITLED-16 reconsidered the order and kept it
 *
 * The sequence above is FIN-02's, unchanged, because it is right: position, then
 * explanation, then the accounts behind it, then what is still coming. What was
 * wrong was never the order — it was that every part of it was drawn at the same
 * weight, as four hand-written `<ul>`s of `dh-finance-*` rows with no numeric
 * alignment, and that net worth (the page's single largest fact) sat in a
 * generic `Card` below an unordered list. Two changes follow from that:
 *
 *   - **Net worth is the Accounts section's HEADLINE**, with the balances as its
 *     evidence, rather than a box under them. It is their sum; it reads as their
 *     sum now.
 *   - **Money in and money out gained their history.** The month band answered
 *     "what happened in September" and could not answer "is that normal?" — the
 *     question an owner actually has when they look at a figure. `MoneyFlow`
 *     answers it from the SAME aggregation the band is computed from
 *     (`readMonthlyFlow` → `summariseRange`, which `monthSummary` is itself
 *     defined in terms of), so the September bar and the September figure cannot
 *     disagree.
 *
 * ## What is deliberately NOT here
 *
 * No row of decorative cards across the top, and no second chart. No percentage,
 * no score, no grade and no financial-health figure — V2.13 owns Reports and
 * V2.12 owns none of that language. No net-worth SERIES, which is a Report over
 * the same derivation. No budget BAR: a budget still says "$75 over" in words,
 * because a bar that turns red is a judgement and a sentence is a fact. And
 * nothing that conveys meaning by colour alone: money out is a figure and the
 * word "out", a balance is "owing" rather than a minus sign, and the flow
 * chart's two series are told apart by position and by their names as well as by
 * their fills.
 *
 * ## The empty state renders LESS, not zeros
 *
 * A workspace with no accounts gets one sentence and one action. There is no
 * dashboard of `$0.00` cards and no "0% of budget used", because absence should
 * look like absence rather than like a product that is not working. The chart
 * obeys the same rule twice over: `readMonthlyFlow` returns no points before
 * there are two months to compare, and `MoneyFlow` refuses to draw from one.
 *
 * ## Untitled source
 *
 * The tables are the genuine `application/table` (`TableCard.Root`, `Table`,
 * `Table.Body`, `Table.Row`, `Table.Cell`) with the accessible-name-carrying
 * `LabelledTableHead` override, in the card-bounded arrangement Untitled's Pro
 * finance dashboards (`dashboards-01/12`, `-01/14`) draw a data table in. The
 * section headings are `application/section-headers` through the shared
 * `SectionHeading`. The chart is `application/charts-base` over Recharts through
 * the shared `ChartFrame`. Everything between the sections is a hairline rule on
 * the page's own ground rather than a card — Untitled's own dashboards separate
 * sections that way, and a card per section is the card soup the migration guide
 * names.
 */

import { Link, useRevalidator } from "react-router";

import { MoneyFlow } from "~/shared/charts";
import { EmptyState } from "~/shared/empty-state";
import {
  balanceLabel,
  exclusionNote,
  money,
  moneyTick,
  type SerializedCurrencyTotal,
  type SerializedMonthlyFlow,
} from "~/shared/finance";
import { ButtonLink } from "~/shared/ui";
import { Table, TableCard } from "~/shared/ui/untitled/application/table/table";
import { SectionHeading } from "~/shared/ui/untitled/overrides/section-heading";
import { LabelledTableHead } from "~/shared/ui/untitled/overrides/table-head";

import type { FinanceHomeData } from "./finance-view";
import { MonthNav } from "./MonthNav";
import { SettleCommitment } from "./SettleCommitment";

/**
 * The page's own gutter and rhythm.
 *
 * UNTITLED-16 — Finance is a DOCUMENT-shaped page: it renders no
 * `CollectionLayout` and no `RecordLayout`, so nothing above it supplies the
 * shell's side padding, and every heading and figure on it sat hard against the
 * navigation rail. Measured at 390px: a zero-pixel left gutter, against §55's
 * floor of 16. `.dh-pane-body` is the class that exists for this, and it is
 * deliberately NOT used — `base.css` hangs four unlayered PROSE rules off it
 * (`h2`, `ul`, `li`, `a`) that would repaint the Untitled tables and divided
 * lists this page is now made of. The measurement is the same; the prose is not
 * borrowed.
 */
const PAGE =
  "flex min-w-0 flex-col gap-8 px-[var(--dh-shell-gutter)] py-[var(--dh-space-6)]";

/** Every section on this page is a band on the page's ground, not a card. */
const SECTION = "flex min-w-0 flex-col gap-4";

/** A figure a reader compares against the one above it. */
const FIGURE = "text-display-xs font-semibold text-primary tabular-nums";

/**
 * A total, printed per currency, because unlike money is never summed.
 *
 * The label is the quiet part and the figure is the loud one — the inversion of
 * the old `dh-finance-total`, where both were the same size and the page had no
 * first line.
 */
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
    <div className="flex min-w-0 flex-col gap-1" data-testid={testId}>
      <p className="text-sm font-medium text-tertiary">{label}</p>
      {totals.length === 0 ? (
        <p className={FIGURE}>Nothing yet</p>
      ) : (
        totals.map((total) => (
          <p key={total.currencyCode} className={FIGURE}>
            {money(total.minorUnits, total.currencyCode)}
          </p>
        ))
      )}
    </div>
  );
}

/**
 * The month series in WORDS — the chart's accessible name, and what a reader who
 * does not read charts gets instead.
 *
 * It enumerates every month, because a summary that says "twelve months of
 * income and spending" describes the picture rather than replacing it. The
 * visible caption beneath the plot is the short form.
 */
function flowSummary(flow: SerializedMonthlyFlow): string {
  const currency = flow.currencyCode!;
  const months = flow.points
    .map(
      (point) =>
        `${point.fullLabel}: ${money(point.inMinor, currency)} in, ` +
        `${money(point.outMinor, currency)} out`,
    )
    .join("; ");
  return `Money in and money out for ${flow.points.length} months, in ${currency}. ${months}.`;
}

/** The short visible line under the plot: the span, and where it ends up. */
function flowCaption(flow: SerializedMonthlyFlow): string {
  const currency = flow.currencyCode!;
  const first = flow.points[0]!;
  const last = flow.points[flow.points.length - 1]!;
  const net = last.inMinor - last.outMinor;
  /*
   * The latest month's shortfall or surplus, in WORDS. Never a percentage and
   * never a verdict: "spent $310.00 more than came in" is a fact about
   * September, and "overspent" would be a judgement about the owner.
   */
  const closing =
    net === 0
      ? `In ${last.fullLabel} money in and money out were equal.`
      : net > 0
        ? `In ${last.fullLabel}, ${money(net, currency)} more came in than went out.`
        : `In ${last.fullLabel}, ${money(-net, currency)} more went out than came in.`;
  return `${first.fullLabel} to ${last.fullLabel}, in ${currency}. ${closing}`;
}

/** An absent value: a dash for the eye, a word for assistive tech. */
function Absent({ label = "Not recorded" }: { readonly label?: string }) {
  return (
    <span className="text-tertiary">
      <span aria-hidden="true">—</span>
      <span className="sr-only">{label}</span>
    </span>
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
    flow,
    failed,
  } = props;

  if (failed) {
    return (
      <div className={PAGE}>
        <h1 className="text-display-xs font-semibold text-primary">Finance</h1>
        <p role="status" className="text-sm text-tertiary">
          Finance could not be read just now. Nothing has been changed — try
          again in a moment.
        </p>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="flex flex-col gap-4" data-testid="finance-empty">
        <h1 className="text-display-xs font-semibold text-primary">Finance</h1>
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
  const hasFlow = flow.points.length >= 2 && flow.currencyCode !== null;

  return (
    <div className={PAGE} data-testid="finance-home">
      <header className="flex flex-col gap-3 border-b border-secondary pb-5 md:flex-row md:items-end md:justify-between md:gap-4">
        <h1 className="text-display-xs font-semibold text-primary">Finance</h1>
        <MonthNav {...props} basePath="/finance" />
      </header>

      <section className={SECTION} aria-labelledby="finance-month-heading">
        <SectionHeading
          id="finance-month-heading"
          level={2}
          size="md"
          title={props.monthLabel}
        />

        {/*
         * The two figures, side by side at every width above a phone. They are
         * the page's first line and the only place two numbers are drawn at
         * display size — everything below them is a table or a sentence.
         */}
        <div className="flex flex-wrap gap-x-12 gap-y-4">
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
          <p className="text-sm text-tertiary" data-testid="uncategorised-note">
            <Link
              to="/finance/transactions?uncategorised=1"
              className="font-medium text-brand-secondary underline-offset-2 hover:underline"
            >
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
          <p className="text-sm text-tertiary">
            {transferCount} transfer{transferCount === 1 ? "" : "s"} left out —
            moving your own money between your own accounts is not spending.
          </p>
        ) : null}

        {/*
         * The history of the two figures above, and nothing else.
         *
         * It is inside the month section rather than in one of its own because
         * it is not a second subject: it is the context those two numbers are
         * read in. Absent entirely where there is nothing to compare — one month
         * of data draws no chart, and an empty plot frame would be a worse
         * answer than no plot at all.
         */}
        {hasFlow ? (
          <div className="mt-2 flex flex-col gap-2">
            <MoneyFlow
              points={flow.points.map((point) => ({
                key: point.month,
                label: point.label,
                fullLabel: point.fullLabel,
                inMinor: point.inMinor,
                outMinor: point.outMinor,
              }))}
              summary={flowSummary(flow)}
              caption={flowCaption(flow)}
              format={(minorUnits) => money(minorUnits, flow.currencyCode!)}
              /*
               * The axis drops the cents and goes compact once the figures are
               * long; the tooltip and the summary do neither. Rounding a tick
               * label is a scale decision, and rounding a stated figure is a
               * lie.
               */
              formatTick={(minorUnits) =>
                moneyTick(minorUnits, flow.currencyCode!)
              }
              data-testid="finance-flow"
            />
            {flow.uncategorisedCount > 0 ? (
              <p
                className="text-sm text-tertiary"
                data-testid="flow-uncategorised"
              >
                {/*
                 * The SAME exclusion the month band states, stated again for the
                 * window the plot covers. Both leave unattributed money out, so
                 * a bar and the figure above it agree; saying so is what stops
                 * the agreement looking like an understatement.
                 */}
                {flow.uncategorisedCount}{" "}
                {flow.uncategorisedCount === 1
                  ? "transaction in this period has"
                  : "transactions in this period have"}{" "}
                no category, so{" "}
                {flow.uncategorisedCount === 1 ? "it is" : "they are"} not in
                the chart.
              </p>
            ) : null}
            {flow.excluded.length > 0 ? (
              <p className="text-sm text-tertiary">
                {exclusionNote(flow.excluded)}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className={SECTION} aria-labelledby="finance-spending-heading">
        <SectionHeading
          id="finance-spending-heading"
          level={2}
          size="md"
          title="Spending by category"
          description="Largest first. A budget is stated in words, never as a bar."
        />
        {spending.length === 0 ? (
          <p className="text-sm text-tertiary">
            Nothing categorised as money out this month.
          </p>
        ) : (
          // Adapted from the Untitled UI React `application/table` source, in
          // the card-bounded arrangement Untitled's Pro finance dashboards use
          // for a breakdown table. Changes: DalyHub category columns.
          <TableCard.Root
            size="sm"
            className="rounded-lg bg-primary shadow-xs ring-1 ring-secondary"
            data-untitled-source="application/table:table-card"
          >
            <Table
              aria-label="Spending this month by category, with the budget where one is set."
              size="sm"
              className="table-fixed bg-primary"
              data-testid="spending-by-category"
            >
              <Table.Header className="bg-secondary [&_th]:px-5 max-sm:[&_th]:px-3">
                <LabelledTableHead
                  id="category"
                  label="Category"
                  isRowHeader
                  className="w-[40%]"
                />
                {/*
                 * The figure column is right-aligned, which is what makes a
                 * column of money comparable at a glance — the digits line up
                 * under each other and the eye reads magnitude from length. The
                 * heading takes the same alignment as the cells beneath it.
                 */}
                <LabelledTableHead
                  id="spent"
                  label="Spent"
                  className="w-[26%] text-right [&>span]:justify-end"
                />
                <LabelledTableHead
                  id="budget"
                  label="Budget"
                  className="w-[34%]"
                />
              </Table.Header>
              <Table.Body>
                {spending.map((line) => (
                  <Table.Row
                    key={`${line.categoryId ?? "none"}-${line.currencyCode}`}
                    id={`${line.categoryId ?? "none"}-${line.currencyCode}`}
                    size="sm"
                    className="h-auto min-h-12 bg-primary hover:bg-secondary"
                  >
                    <Table.Cell className="px-5 py-3 max-sm:px-3">
                      <Link
                        to={`/finance/transactions?month=${props.month}&category=${encodeURIComponent(line.categoryId ?? "")}`}
                        /*
                         * `break-words`, not `truncate`. A `truncate` on an
                         * INLINE element does not clip at all — measured at
                         * 320px, "Rent or mortgage" ran straight over the
                         * $2,464.00 beside it — and the fix a table wants here
                         * is a wrap rather than an ellipsis: a category name is
                         * short, meaningful and worth reading in full.
                         */
                        className="block break-words text-sm font-medium text-primary outline-focus-ring hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                      >
                        {line.categoryName ?? "Uncategorised"}
                      </Link>
                    </Table.Cell>
                    <Table.Cell className="px-5 py-3 max-sm:px-3 text-right text-sm font-medium whitespace-nowrap text-primary tabular-nums">
                      {money(line.magnitudeMinor, line.currencyCode)}
                    </Table.Cell>
                    {/*
                     * The budget in WORDS, with the figures that produced it.
                     * Never a bar that turns red, never a percentage, never a
                     * score. `data-budget-state` is the hook the state's tone is
                     * read from; the SENTENCE is what carries the meaning.
                     */}
                    <Table.Cell
                      className="px-5 py-3 max-sm:px-3 text-sm text-tertiary"
                      data-budget-state={line.budgetState ?? undefined}
                    >
                      {line.budgetSentence ?? <Absent label="No budget set" />}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </TableCard.Root>
        )}
        <div>
          <ButtonLink
            href={`/finance/budgets?month=${props.month}`}
            variant="subtle"
            size="sm"
          >
            Budgets
          </ButtonLink>
        </div>
      </section>

      <section className={SECTION} aria-labelledby="finance-accounts-heading">
        <SectionHeading
          id="finance-accounts-heading"
          level={2}
          size="md"
          title="Accounts"
        />

        {/*
         * Net worth is the section's HEADLINE, not a box beneath the list.
         *
         * It is the sum of the balances below it plus the Assets' latest
         * recorded values, so it belongs where a total belongs: above its
         * evidence, at the weight of a total. It was previously a generic `Card`
         * under an unordered list, which read as a fifth unrelated fact.
         */}
        <div className="flex flex-col gap-1" data-testid="net-worth">
          <p className="text-sm font-medium text-tertiary">Net worth</p>
          {netWorth.total.length === 0 ? (
            <p className={FIGURE}>Nothing to add up yet.</p>
          ) : (
            netWorth.total.map((total) => (
              <p key={total.currencyCode} className={FIGURE}>
                {money(total.minorUnits, total.currencyCode)}
              </p>
            ))
          )}
          {netWorthExcluded.length > 0 ? (
            <p className="text-sm text-tertiary">
              {exclusionNote(netWorthExcluded)}
            </p>
          ) : null}
          {netWorth.assetsWithoutValue > 0 ? (
            <p
              className="text-sm text-tertiary"
              data-testid="assets-without-value"
            >
              {netWorth.assetsWithoutValue}{" "}
              {netWorth.assetsWithoutValue === 1 ? "asset has" : "assets have"}{" "}
              no recorded value, so{" "}
              {netWorth.assetsWithoutValue === 1 ? "it is" : "they are"} left
              out rather than counted as nothing.
            </p>
          ) : null}
          <p className="text-sm text-tertiary">
            Your account balances plus your assets&rsquo; latest recorded
            values. A loan is the debt and the thing it bought is an Asset —
            both belong.
          </p>
        </div>

        <AccountTable
          accounts={openAccounts}
          label="Your open accounts, with each derived balance."
          testId="account-list"
        />

        {closedAccounts.length > 0 ? (
          <details className="flex flex-col gap-3">
            <summary className="cursor-pointer text-sm font-medium text-secondary">
              Closed accounts ({closedAccounts.length})
            </summary>
            <div className="mt-3 flex flex-col gap-2">
              <AccountTable
                accounts={closedAccounts}
                label="Your closed accounts, with each derived balance."
              />
              <p className="text-sm text-tertiary">
                A closed account still counts towards net worth. Closing changes
                what DalyHub offers, never what the arithmetic says.
              </p>
            </div>
          </details>
        ) : null}
      </section>

      <section
        className={SECTION}
        aria-labelledby="finance-commitments-heading"
      >
        <SectionHeading
          id="finance-commitments-heading"
          level={2}
          size="md"
          title="Due this month"
        />
        {commitments.items.length === 0 ? (
          <p className="text-sm text-tertiary">
            Nothing with a date and an amount falls due this month.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              {commitments.expected.map((total) => (
                <p
                  key={total.currencyCode}
                  className="text-lg font-semibold text-primary tabular-nums"
                  data-testid="expected-total"
                >
                  {money(total.minorUnits, total.currencyCode)}{" "}
                  <span className="text-sm font-normal text-tertiary">
                    expected
                  </span>
                </p>
              ))}
              {commitments.withoutAmount > 0 ? (
                <p
                  className="text-sm text-tertiary"
                  data-testid="commitments-without-amount"
                >
                  {commitments.withoutAmount} with no amount recorded — not
                  estimated.
                </p>
              ) : null}
            </div>
            {/*
             * A DIVIDED LIST, in Untitled's card anatomy: one bounded surface of
             * hairline rows rather than a card per obligation. Each row is a
             * commitment, its amount and one contextual action — not a record,
             * which is what the Obligation's own page is for.
             */}
            <ul
              className="flex flex-col divide-y divide-secondary overflow-hidden rounded-lg bg-primary shadow-xs ring-1 ring-secondary"
              aria-label="Money-bearing obligations due this month"
            >
              {commitments.items.map((item) => (
                <li
                  key={item.obligationId}
                  className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:gap-4 md:px-5"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <Link
                      to={`/obligations/${encodeURIComponent(item.obligationId)}`}
                      className="block truncate text-sm font-medium text-primary outline-focus-ring hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                      aria-label={`Open ${item.title}`}
                    >
                      {item.title}
                    </Link>
                    {item.settled ? (
                      <span className="text-xs text-tertiary">
                        {item.settledByTransaction
                          ? "Paid, matched to a transaction"
                          : "Paid"}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-sm whitespace-nowrap text-secondary tabular-nums">
                    {item.expectedAmountMinor !== null &&
                    item.currencyCode !== null ? (
                      money(item.expectedAmountMinor, item.currencyCode)
                    ) : (
                      <span className="text-tertiary">amount not recorded</span>
                    )}
                  </span>
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

      <section className={SECTION} aria-labelledby="finance-imports-heading">
        <SectionHeading
          id="finance-imports-heading"
          level={2}
          size="md"
          title="Recent imports"
        />
        {imports.length === 0 ? (
          <p className="text-sm text-tertiary">
            No statements imported yet.{" "}
            <Link
              to="/finance/import"
              className="font-medium text-brand-secondary underline-offset-2 hover:underline"
            >
              Import one
            </Link>
            , or{" "}
            <Link
              to="/finance/transactions"
              className="font-medium text-brand-secondary underline-offset-2 hover:underline"
            >
              add a transaction by hand
            </Link>
            .
          </p>
        ) : (
          <ul
            className="flex flex-col divide-y divide-secondary overflow-hidden rounded-lg bg-primary shadow-xs ring-1 ring-secondary"
            aria-label="Recently imported statements"
            data-testid="recent-imports"
          >
            {imports.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-col gap-0.5 px-4 py-3 md:px-5"
              >
                <span className="block truncate text-sm font-medium text-primary">
                  {entry.fileName}
                </span>
                <span className="text-xs text-tertiary">
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
        <div className="flex flex-wrap gap-2">
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

/**
 * The accounts table — the genuine Untitled table, drawn identically for open
 * and closed accounts.
 *
 * One component rather than two loops, because the closed list is the same table
 * under a different heading: two copies is how the two would come to print the
 * balance differently, which is exactly what the old markup did (the closed list
 * dropped the qualifier's own element and kept only its text).
 */
function AccountTable({
  accounts,
  label,
  testId,
}: {
  readonly accounts: readonly FinanceHomeData["accounts"][number][];
  readonly label: string;
  readonly testId?: string;
}) {
  if (accounts.length === 0) return null;
  return (
    <TableCard.Root
      size="sm"
      className="rounded-lg bg-primary shadow-xs ring-1 ring-secondary"
      data-untitled-source="application/table:table-card"
    >
      <Table
        aria-label={label}
        size="sm"
        className="table-fixed bg-primary"
        {...(testId === undefined ? {} : { "data-testid": testId })}
      >
        <Table.Header className="bg-secondary [&_th]:px-5 max-sm:[&_th]:px-3">
          <LabelledTableHead
            id="account"
            label="Account"
            isRowHeader
            className="w-[46%]"
          />
          <LabelledTableHead
            id="institution"
            label="Where"
            className="w-[26%] max-md:hidden"
          />
          <LabelledTableHead
            id="balance"
            label="Balance"
            className="w-[28%] text-right [&>span]:justify-end"
          />
        </Table.Header>
        <Table.Body>
          {accounts.map((account) => {
            const balance = balanceLabel(
              account.balanceMinor,
              account.currencyCode,
              account.accountType,
            );
            return (
              <Table.Row
                key={account.id}
                id={account.id}
                size="sm"
                className="h-auto min-h-12 bg-primary hover:bg-secondary"
              >
                <Table.Cell className="px-5 py-3 max-sm:px-3">
                  <Link
                    to={`/finance/accounts/${encodeURIComponent(account.id)}`}
                    className="block break-words text-sm font-medium text-primary outline-focus-ring hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                    aria-label={`Open ${account.title}`}
                  >
                    {account.title}
                  </Link>
                </Table.Cell>
                <Table.Cell className="px-5 py-3 max-sm:px-3 text-sm break-words text-tertiary max-md:hidden">
                  {account.institution ?? <Absent label="No institution" />}
                </Table.Cell>
                <Table.Cell className="px-5 py-3 max-sm:px-3 text-right text-sm whitespace-nowrap text-primary tabular-nums">
                  <span className="font-medium">{balance.figure}</span>
                  {/* The qualifier is a WORD, so nothing is said by a sign alone. */}
                  {balance.qualifier === null ? null : (
                    <span className="font-normal text-tertiary">
                      {" "}
                      {balance.qualifier}
                    </span>
                  )}
                </Table.Cell>
              </Table.Row>
            );
          })}
        </Table.Body>
      </Table>
    </TableCard.Root>
  );
}
