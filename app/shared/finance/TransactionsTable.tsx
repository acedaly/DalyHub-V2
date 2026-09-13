/**
 * V2.12 FIN-03 / UNTITLED-16 — the ONE transaction table.
 *
 * Drawn identically by the month list, the uncategorised queue and the account
 * record's transactions tab, because they are the same records seen from three
 * places. Two copies of one row is how two surfaces come to disagree about what
 * a transaction is (ADR-115, and the precedent the Task, Habit and Obligation
 * rows already set).
 *
 * ## What this replaces, and why a table rather than a list
 *
 * It was an `<li class="dh-transaction-row">` with a three-part flex body, and
 * the fact that betrayed it was the AMOUNT: a column of money whose digits did
 * not line up, in a product whose whole claim for this screen is that a month
 * can be read at a glance. Five hand-painted rules in `finance.css` decided the
 * row's height, its hover, its columns and its phone arrangement, none of which
 * a list can express and all of which a table gets for nothing.
 *
 * The genuine Untitled `application/table` also brings what the hand-written
 * markup never had: React Aria's column and row semantics, so a screen reader
 * reading "−$120.50 out" is told which column it is in, and a real keyboard
 * model over the grid. Untitled's own Pro finance dashboards (`dashboards-01/12`)
 * draw a transaction history in exactly this anatomy — date, payee, category as
 * a badge-weight control, account, amount — which is where the column order came
 * from.
 *
 * ## The phone is still the design target, and categorising is still the job
 *
 * The daily-driver Finance action is clearing `Uncategorised` from a phone, so
 * the table RECOMPOSES below `md` rather than scrolling sideways: the payee and
 * the amount share the first line, the date and the account become one quiet
 * line beneath, and the category control takes a full-width line of its own — a
 * real button at the touch floor, not a 24px chip wedged into a column. Nothing
 * is hidden; the columns that disappear reappear as text.
 *
 * ## No gesture without a keyboard equivalent
 *
 * There is no swipe, and that is deliberate rather than unfinished: the category
 * control is a button that opens the picker, which works by thumb, by keyboard
 * and by screen reader with one implementation. DHDS-11's six questions are the
 * test a gesture has to pass, and "swipe to categorise" fails the first one —
 * there is no destination and no stored order, only a value to choose from a
 * list.
 *
 * ## What a row deliberately does NOT show
 *
 *   - the bank's raw `sourceDescription`, which is terminal noise the owner
 *     never chose; the DRAWER shows it, where the owner went to look;
 *   - whether the transaction has a receipt, which would cost a read per row;
 *   - a colour that means anything on its own. Money out is a minus sign AND
 *     the word "out"; a transfer says "Transfer". The amount column is not
 *     tinted green or red, because a purchase is not a failure (§46).
 */

import { Button } from "~/shared/ui";
import { Table, TableCard } from "~/shared/ui/untitled/application/table/table";
import { LabelledTableHead } from "~/shared/ui/untitled/overrides/table-head";

import {
  financeAmountLabel,
  financeDate,
  type SerializedFinanceTransaction,
} from "./finance-view";

export interface TransactionsTableProps {
  readonly transactions: readonly SerializedFinanceTransaction[];
  /** Show which account each row is in. Off inside that account's own tab. */
  readonly showAccount?: boolean;
  /** Open the drawer. Omit to render the table read-only. */
  readonly onOpen?: (transaction: SerializedFinanceTransaction) => void;
  /** Open the category picker for a row. */
  readonly onCategorise?: (transaction: SerializedFinanceTransaction) => void;
  /**
   * Accept the deterministic suggestion in one tap. Only offered when there IS
   * one, and it never applies itself — the owner's tap is what makes it a
   * confirmed category, which is the only thing the suggestion learns from.
   */
  readonly onAcceptSuggestion?: (
    transaction: SerializedFinanceTransaction,
  ) => void;
  /** The id of the transaction whose mutation is in flight, if any. */
  readonly pendingId?: string | null;
  /** The table's accessible name. Say what this set of rows IS. */
  readonly label: string;
  readonly "data-testid"?: string;
}

export function TransactionsTable({
  transactions,
  showAccount = true,
  onOpen,
  onCategorise,
  onAcceptSuggestion,
  pendingId = null,
  label,
  "data-testid": testId = "transaction-list",
}: TransactionsTableProps) {
  return (
    // Adapted from the Untitled UI React `application/table` source, in the
    // card-bounded arrangement Untitled's Pro finance dashboards use for a
    // transaction history. Changes: DalyHub columns, the phone recomposition,
    // and the contextual category control.
    <TableCard.Root
      size="sm"
      className="rounded-lg bg-primary shadow-xs ring-1 ring-secondary"
      data-untitled-source="application/table:table-card"
    >
      <Table
        aria-label={label}
        size="sm"
        /*
         * `table-fixed` is what makes the truncation real: in an auto layout a
         * long payee simply widens its column and pushes the amount out of the
         * card. Fixed layout hands every named column the width declared on its
         * head, so the table fits its container at every width and a
         * forty-character merchant string ellipsises instead of the row
         * scrolling sideways.
         */
        className="table-fixed bg-primary max-md:block"
        data-testid={testId}
      >
        <Table.Header className="bg-secondary [&_th]:px-5 max-sm:[&_th]:px-3 max-md:hidden">
          <LabelledTableHead
            id="date"
            label="Date"
            className="w-[13%] whitespace-nowrap"
          />
          <LabelledTableHead
            id="payee"
            label="Payee"
            isRowHeader
            className={showAccount ? "w-[30%]" : "w-[44%]"}
          />
          <LabelledTableHead
            id="category"
            label="Category"
            className="w-[24%]"
          />
          {showAccount ? (
            <LabelledTableHead
              id="account"
              label="Account"
              className="w-[16%]"
            />
          ) : null}
          {/*
           * Right-aligned, which is what makes a column of money comparable at
           * a glance: the digits line up under each other and the eye reads
           * magnitude from length. The heading takes the cells' alignment.
           */}
          <LabelledTableHead
            id="amount"
            label="Amount"
            className="w-[17%] text-right [&>span]:justify-end"
          />
        </Table.Header>
        <Table.Body>
          {transactions.map((transaction) => (
            <TransactionTableRow
              key={transaction.id}
              transaction={transaction}
              showAccount={showAccount}
              busy={pendingId === transaction.id}
              {...(onOpen ? { onOpen } : {})}
              {...(onCategorise ? { onCategorise } : {})}
              {...(onAcceptSuggestion ? { onAcceptSuggestion } : {})}
            />
          ))}
        </Table.Body>
      </Table>
    </TableCard.Root>
  );
}

function TransactionTableRow({
  transaction,
  showAccount,
  busy,
  onOpen,
  onCategorise,
  onAcceptSuggestion,
}: {
  readonly transaction: SerializedFinanceTransaction;
  readonly showAccount: boolean;
  readonly busy: boolean;
  readonly onOpen?: (transaction: SerializedFinanceTransaction) => void;
  readonly onCategorise?: (transaction: SerializedFinanceTransaction) => void;
  readonly onAcceptSuggestion?: (
    transaction: SerializedFinanceTransaction,
  ) => void;
}) {
  const amount = financeAmountLabel(
    transaction.amountMinor,
    transaction.currencyCode,
  );
  const transfer = transaction.transferPartnerId !== null;
  const date = financeDate(transaction.occurredOn);

  /*
   * The facts the hidden columns carry, for the phone line beneath the payee.
   * The transfer partner and a settled obligation are here rather than in a
   * column of their own because they are true of a minority of rows, and a
   * column that is empty on forty rows out of forty-two is a column that costs
   * every row its width.
   */
  const phoneMeta: string[] = [date];
  if (showAccount) phoneMeta.push(transaction.accountTitle);
  const desktopMeta: string[] = [];
  if (transfer) {
    desktopMeta.push(
      transaction.transferPartnerAccountTitle === null
        ? "Transfer"
        : `Transfer · ${transaction.transferPartnerAccountTitle}`,
    );
  }
  if (transaction.settlesObligationTitle !== null) {
    desktopMeta.push(`Paid ${transaction.settlesObligationTitle}`);
  }

  return (
    <Table.Row
      id={transaction.id}
      size="sm"
      /*
       * `h-auto` first: the Untitled row declares a fixed height, which is right
       * for a desktop table and wrong for the phone row, where the payee is
       * followed by the facts the hidden columns would have carried and then by
       * the category control. Without it the extra lines render outside the
       * row's box and are painted over by the next one.
       *
       * The SEPARATOR moves to the ROW on a phone. Untitled draws it as an
       * `::after` on every cell, which is exactly right for a table and wrong
       * for this grid: the date and account cells are hidden below `md`, so
       * their rules draw nothing and the ones that remain drew a hairline that
       * stopped halfway across — a line INSIDE each row rather than between two.
       * Measured at 390px before it was fixed.
       */
      className="h-auto min-h-14 bg-primary hover:bg-secondary max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:items-start max-md:gap-x-3 max-md:border-b max-md:border-secondary max-md:py-2 max-md:last:border-b-0 max-md:[&>td]:after:hidden"
      data-testid="transaction-row"
      data-transaction-id={transaction.id}
      data-direction={
        transaction.amountMinor > 0
          ? "in"
          : transaction.amountMinor < 0
            ? "out"
            : "zero"
      }
      {...(transfer ? { "data-transfer": "true" } : {})}
    >
      <Table.Cell className="px-5 py-3 max-sm:px-3 text-sm whitespace-nowrap text-tertiary max-md:hidden">
        {date}
      </Table.Cell>

      <Table.Cell className="px-5 py-3 max-sm:px-3 max-md:col-start-1 max-md:row-start-1 max-md:px-4">
        {onOpen === undefined ? (
          <span className="block truncate text-sm font-medium text-primary">
            {transaction.payeeDisplay}
          </span>
        ) : (
          <button
            type="button"
            className="block max-w-full truncate text-left text-sm font-medium text-primary outline-focus-ring hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
            onClick={() => onOpen(transaction)}
            data-testid="transaction-row-open"
          >
            {transaction.payeeDisplay}
            <span className="sr-only"> — open transaction details</span>
          </button>
        )}
        {/*
         * The phone line: the date and the account, which are columns above
         * `md`. Hidden from assistive tech there, because on a desktop the same
         * facts are already announced as their own cells and a screen reader
         * would hear each one twice.
         */}
        <span className="mt-1 block truncate text-xs text-tertiary md:hidden">
          {phoneMeta.join(" · ")}
        </span>
        {desktopMeta.length > 0 ? (
          <span className="mt-1 block truncate text-xs text-tertiary">
            {desktopMeta.join(" · ")}
          </span>
        ) : null}
      </Table.Cell>

      <Table.Cell className="px-5 py-3 max-sm:px-3 max-md:col-span-2 max-md:row-start-2 max-md:px-4 max-md:pt-0 max-md:pb-1">
        {transfer ? (
          /*
           * A transfer leg has no category and cannot have one: it is excluded
           * from spend and income by construction, and offering a picker would
           * suggest that categorising it would change a total. It would not.
           */
          <span className="text-sm text-tertiary">Transfer</span>
        ) : transaction.categoryName !== null ? (
          <Button
            variant="subtle"
            size="sm"
            /*
             * The coarse-pointer floor, where the row recomposes for a phone.
             * `sm` is 32px, which is right on a laptop and eleven pixels short
             * on the one screen where clearing the queue is the daily job. The
             * floor is raised HERE rather than on the shared button, because
             * `sm` is correct at the widths it was chosen for; what is narrow is
             * this viewport, not that control.
             */
            className="max-md:min-h-[var(--app-touch-target-min)]"
            disabled={busy || onCategorise === undefined}
            onClick={() => onCategorise?.(transaction)}
            data-testid="transaction-row-category"
          >
            {transaction.categoryName}
            {transaction.categoryArchived ? " (archived)" : ""}
            <span className="sr-only">
              {" "}
              — change the category for {transaction.payeeDisplay}
            </span>
          </Button>
        ) : (
          <span className="flex flex-wrap items-center gap-2">
            {transaction.suggestedCategoryName !== null &&
            onAcceptSuggestion !== undefined ? (
              <Button
                variant="secondary"
                size="sm"
                className="max-md:min-h-[var(--app-touch-target-min)]"
                disabled={busy}
                onClick={() => onAcceptSuggestion(transaction)}
                data-testid="transaction-row-suggestion"
              >
                {transaction.suggestedCategoryName}
                <span className="sr-only">
                  {" "}
                  — last time you put {transaction.payeeDisplay} here. Use it
                  for this one too.
                </span>
              </Button>
            ) : null}
            <Button
              variant="subtle"
              size="sm"
              className="max-md:min-h-[var(--app-touch-target-min)]"
              disabled={busy || onCategorise === undefined}
              onClick={() => onCategorise?.(transaction)}
              data-testid="transaction-row-categorise"
            >
              Categorise
              <span className="sr-only"> {transaction.payeeDisplay}</span>
            </Button>
          </span>
        )}
      </Table.Cell>

      {showAccount ? (
        <Table.Cell className="px-5 py-3 max-sm:px-3 text-sm break-words text-tertiary max-md:hidden">
          {transaction.accountTitle}
        </Table.Cell>
      ) : null}

      <Table.Cell className="px-5 py-3 max-sm:px-3 text-right text-sm whitespace-nowrap text-primary tabular-nums max-md:col-start-2 max-md:row-start-1 max-md:px-4">
        <span className="font-medium">{amount.figure}</span>
        {/*
         * The direction in WORDS, beside the sign. A screen reader says it, and
         * a person reading a dense list at 393 px does not have to notice a
         * one-pixel minus. Nothing here conveys direction by colour alone.
         */}
        {amount.direction === "" ? null : (
          <span className="font-normal text-tertiary"> {amount.direction}</span>
        )}
      </Table.Cell>
    </Table.Row>
  );
}
