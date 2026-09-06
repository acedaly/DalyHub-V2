/**
 * V2.12 FIN-03 — the ONE transaction row.
 *
 * Drawn identically by the month list, the uncategorised queue and the account
 * record's transactions tab, because they are the same record seen from three
 * places. Two copies of one row is how two surfaces come to disagree about what
 * a transaction is (ADR-115, and the precedent the Task, Habit and Obligation
 * rows already set).
 *
 * ## The phone is the design target, and categorising is the job
 *
 * The daily-driver Finance action is clearing `Uncategorised` from a phone, so
 * the row is built for a thumb first: two lines at 393 px, an amount that stays
 * scannable without dominating, a category control that is a real button at the
 * touch floor, and a long payee that WRAPS rather than pushing the amount off
 * the row.
 *
 * ## No gesture without a keyboard equivalent
 *
 * There is no swipe here, and that is deliberate rather than unfinished: the
 * category control is a button that opens the picker, which works by thumb, by
 * keyboard and by screen reader with one implementation. DHDS-11's six questions
 * are the test a gesture has to pass, and "swipe to categorise" fails the first
 * one — there is no destination and no stored order, only a value to choose from
 * a list.
 *
 * ## What a row deliberately does NOT show
 *
 *   - the bank's raw `sourceDescription`, which is terminal noise the owner
 *     never chose; the DRAWER shows it, where the owner went to look;
 *   - whether the transaction has a receipt, which would cost a read per row;
 *   - a colour that means anything on its own. Money out is a minus sign AND
 *     the word "out"; a transfer says "Transfer".
 */

import { Button } from "~/shared/ui";

import {
  financeAmountLabel,
  financeDate,
  type SerializedFinanceTransaction,
} from "./finance-view";

export interface TransactionRowProps {
  readonly transaction: SerializedFinanceTransaction;
  /** Show which account it is in. Off inside that account's own tab. */
  readonly showAccount?: boolean;
  /** Open the drawer. Omit to render the row read-only. */
  readonly onOpen?: (transaction: SerializedFinanceTransaction) => void;
  /** Open the category picker for this row. */
  readonly onCategorise?: (transaction: SerializedFinanceTransaction) => void;
  /**
   * Accept the deterministic suggestion in one tap. Only offered when there IS
   * one, and it never applies itself — the owner's tap is what makes it a
   * confirmed category, which is the only thing the suggestion learns from.
   */
  readonly onAcceptSuggestion?: (
    transaction: SerializedFinanceTransaction,
  ) => void;
  /** True while a mutation for THIS transaction is in flight. */
  readonly busy?: boolean;
  readonly "data-testid"?: string;
}

export function TransactionRow({
  transaction,
  showAccount = true,
  onOpen,
  onCategorise,
  onAcceptSuggestion,
  busy = false,
  "data-testid": testId = "transaction-row",
}: TransactionRowProps) {
  const amount = financeAmountLabel(
    transaction.amountMinor,
    transaction.currencyCode,
  );
  const transfer = transaction.transferPartnerId !== null;

  const meta: string[] = [financeDate(transaction.occurredOn)];
  if (showAccount) meta.push(transaction.accountTitle);
  if (transfer) {
    meta.push(
      transaction.transferPartnerAccountTitle === null
        ? "Transfer"
        : `Transfer · ${transaction.transferPartnerAccountTitle}`,
    );
  }
  if (transaction.settlesObligationTitle !== null) {
    meta.push(`Paid ${transaction.settlesObligationTitle}`);
  }

  return (
    <li
      className="dh-transaction-row"
      data-testid={testId}
      data-transaction-id={transaction.id}
      data-direction={
        transaction.amountMinor > 0
          ? "in"
          : transaction.amountMinor < 0
            ? "out"
            : "zero"
      }
      data-transfer={transfer ? "true" : undefined}
    >
      <div className="dh-transaction-row__main">
        <p className="dh-transaction-row__payee">
          {onOpen === undefined ? (
            <span className="dh-transaction-row__name">
              {transaction.payeeDisplay}
            </span>
          ) : (
            <button
              type="button"
              className="dh-transaction-row__name dh-transaction-row__open"
              onClick={() => onOpen(transaction)}
              data-testid="transaction-row-open"
            >
              {transaction.payeeDisplay}
              <span className="dh-visually-hidden">
                {" "}
                — open transaction details
              </span>
            </button>
          )}
        </p>
        <p className="dh-transaction-row__meta">
          {meta.map((part, index) => (
            <span key={`${part}-${index}`}>
              {index > 0 ? <span aria-hidden="true"> · </span> : null}
              <span>{part}</span>
            </span>
          ))}
        </p>
      </div>

      <p className="dh-transaction-row__amount">
        <span className="dh-transaction-row__figure">{amount.figure}</span>
        {/*
         * The direction in WORDS, beside the sign. A screen reader says it, and
         * a person reading a dense list at 393 px does not have to notice a
         * one-pixel minus. Nothing here conveys direction by colour alone.
         */}
        {amount.direction === "" ? null : (
          <span className="dh-transaction-row__direction">
            {" "}
            {amount.direction}
          </span>
        )}
      </p>

      <div className="dh-transaction-row__category">
        {transfer ? (
          /*
           * A transfer leg has no category and cannot have one: it is excluded
           * from spend and income by construction, and offering a picker would
           * suggest that categorising it would change a total. It would not.
           */
          <span className="dh-transaction-row__transfer">Transfer</span>
        ) : transaction.categoryName !== null ? (
          <Button
            variant="subtle"
            size="sm"
            disabled={busy || onCategorise === undefined}
            onClick={() => onCategorise?.(transaction)}
            data-testid="transaction-row-category"
          >
            {transaction.categoryName}
            {transaction.categoryArchived ? " (archived)" : ""}
            <span className="dh-visually-hidden">
              {" "}
              — change the category for {transaction.payeeDisplay}
            </span>
          </Button>
        ) : (
          <span className="dh-transaction-row__uncategorised">
            {transaction.suggestedCategoryName !== null &&
            onAcceptSuggestion !== undefined ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => onAcceptSuggestion(transaction)}
                data-testid="transaction-row-suggestion"
              >
                {transaction.suggestedCategoryName}
                <span className="dh-visually-hidden">
                  {" "}
                  — last time you put {transaction.payeeDisplay} here. Use it
                  for this one too.
                </span>
              </Button>
            ) : null}
            <Button
              variant="subtle"
              size="sm"
              disabled={busy || onCategorise === undefined}
              onClick={() => onCategorise?.(transaction)}
              data-testid="transaction-row-categorise"
            >
              Categorise
              <span className="dh-visually-hidden">
                {" "}
                {transaction.payeeDisplay}
              </span>
            </Button>
          </span>
        )}
      </div>
    </li>
  );
}
