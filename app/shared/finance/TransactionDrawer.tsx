/**
 * V2.12 FIN-03 — the transaction drawer.
 *
 * A transaction is a LIGHT entity (ADR-120 decision 2), so this is its whole
 * surface: there is no `/finance/transactions/:id` record page, no Activity tab,
 * no Linked-items tab and no summary band. What is here is what an owner opens a
 * transaction to do — read what the bank actually said, correct the payee or the
 * memo, set the category, pair a transfer, see the obligation it settled, and
 * attach the receipt.
 *
 * ## The Evidence section is V2.11's, unchanged
 *
 * `AttachmentsSection` is imported and rendered. There is no Finance receipt
 * component, no Finance file table and no Finance bucket — a transaction becomes
 * attachment-capable by being an `entities` row, which is exactly what ADR-119
 * decision 1 predicted it would cost, and
 * `test/unit/architecture/one-attachment-surface.test.ts` holds it there.
 *
 * ## What the drawer says that a row does not
 *
 * The bank's VERBATIM description. It is terminal noise the owner never chose,
 * so it has no place in a list — but it is also the only record of what the bank
 * actually sent, it is never overwritten by a rename, and this is where an owner
 * comes to check what a mystery payee really was.
 */

import { useId, useState } from "react";

import type { SerializedAttachment } from "~/kernel/attachments";
import { AttachmentsSection } from "~/shared/attachments";
import { Button, Input, Textarea } from "~/shared/ui";

import { CategoryPicker } from "./CategoryPicker";
import {
  financeAmountLabel,
  financeDate,
  type SerializedFinanceCategory,
  type SerializedFinanceTransaction,
} from "./finance-view";

/** A candidate other leg for a transfer, as the deterministic read offers it. */
export interface TransferCandidateOption {
  readonly transactionId: string;
  readonly accountTitle: string;
  readonly occurredOn: string;
  readonly amountMinor: number;
  readonly currencyCode: string;
  readonly payeeDisplay: string;
}

export interface TransactionDrawerProps {
  readonly transaction: SerializedFinanceTransaction;
  readonly categories: readonly SerializedFinanceCategory[];
  readonly attachments: readonly SerializedAttachment[];
  readonly transferCandidates: readonly TransferCandidateOption[];
  readonly busy?: boolean;
  readonly onSetCategory: (categoryId: string | null) => void;
  readonly onSaveDetails: (input: {
    readonly payeeDisplay: string;
    readonly memo: string;
  }) => void;
  readonly onLinkTransfer: (partnerId: string) => void;
  readonly onUnlinkTransfer: () => void;
  readonly onDelete: () => void;
  readonly onAttachmentsChanged?: () => void;
}

export function TransactionDrawer({
  transaction,
  categories,
  attachments,
  transferCandidates,
  busy = false,
  onSetCategory,
  onSaveDetails,
  onLinkTransfer,
  onUnlinkTransfer,
  onDelete,
  onAttachmentsChanged,
}: TransactionDrawerProps) {
  const [payee, setPayee] = useState(transaction.payeeDisplay);
  const [memo, setMemo] = useState(transaction.memo ?? "");
  const payeeId = useId();
  const memoId = useId();

  const amount = financeAmountLabel(
    transaction.amountMinor,
    transaction.currencyCode,
  );
  const transfer = transaction.transferPartnerId !== null;
  const dirty =
    payee.trim() !== transaction.payeeDisplay ||
    memo.trim() !== (transaction.memo ?? "");

  return (
    <div className="dh-transaction-drawer" data-testid="transaction-drawer">
      <section className="dh-transaction-drawer__figure">
        <p className="dh-transaction-drawer__amount">
          <span>{amount.figure}</span>
          {amount.direction === "" ? null : (
            <span className="dh-transaction-drawer__direction">
              {" "}
              {amount.direction}
            </span>
          )}
        </p>
        <p className="dh-transaction-drawer__where">
          {financeDate(transaction.occurredOn)} · {transaction.accountTitle}
        </p>
        {/*
         * What the BANK said, verbatim, never overwritten by a rename. A row
         * would be unreadable with it; this is where an owner comes to find out
         * what a mystery payee actually was.
         */}
        <p className="dh-transaction-drawer__source">
          <span className="dh-transaction-drawer__source-label">
            From your statement:{" "}
          </span>
          <span data-testid="transaction-source-description">
            {transaction.sourceDescription}
          </span>
        </p>
      </section>

      <section className="dh-transaction-drawer__section">
        <h3 className="dh-transaction-drawer__heading">Category</h3>
        {transfer ? (
          <p className="dh-transaction-drawer__note">
            This is one side of a transfer, so it has no category. Transfers are
            left out of money in and money out — moving your own money between
            your own accounts is not spending.
          </p>
        ) : (
          <CategoryPicker
            categories={categories}
            selectedId={transaction.categoryId}
            suggestion={
              transaction.suggestedCategoryId !== null &&
              transaction.suggestedCategoryName !== null
                ? {
                    categoryId: transaction.suggestedCategoryId,
                    categoryName: transaction.suggestedCategoryName,
                    payeeDisplay: transaction.payeeDisplay,
                  }
                : null
            }
            onChoose={onSetCategory}
            busy={busy}
          />
        )}
      </section>

      <section className="dh-transaction-drawer__section">
        <h3 className="dh-transaction-drawer__heading">Details</h3>
        <div className="dh-transaction-drawer__field">
          <label htmlFor={payeeId}>Payee</label>
          <Input
            id={payeeId}
            value={payee}
            maxLength={200}
            disabled={busy}
            onChange={(event) => setPayee(event.target.value)}
            data-testid="transaction-payee-input"
          />
        </div>
        <div className="dh-transaction-drawer__field">
          <label htmlFor={memoId}>Note</label>
          <Textarea
            id={memoId}
            value={memo}
            rows={2}
            maxLength={500}
            disabled={busy}
            onChange={(event) => setMemo(event.target.value)}
            data-testid="transaction-memo-input"
          />
        </div>
        <Button
          variant="primary"
          size="sm"
          disabled={busy || !dirty}
          onClick={() =>
            onSaveDetails({ payeeDisplay: payee.trim(), memo: memo.trim() })
          }
          data-testid="transaction-save-details"
        >
          Save
        </Button>
        {transaction.imported ? (
          <p className="dh-transaction-drawer__note">
            The date and amount came from your bank and cannot be edited. If
            they are wrong, delete this and add a correction by hand.
          </p>
        ) : null}
      </section>

      <section className="dh-transaction-drawer__section">
        <h3 className="dh-transaction-drawer__heading">Transfer</h3>
        {transfer ? (
          <>
            <p className="dh-transaction-drawer__note">
              Paired with {transaction.transferPartnerAccountTitle}.
            </p>
            <Button
              variant="subtle"
              size="sm"
              disabled={busy}
              onClick={onUnlinkTransfer}
              data-testid="transaction-unlink-transfer"
            >
              Not a transfer
            </Button>
          </>
        ) : transferCandidates.length === 0 ? (
          <p className="dh-transaction-drawer__note">
            Nothing in another account matches this exactly. Money moved between
            your own accounts should be paired so it is not counted as spending.
          </p>
        ) : (
          <ul className="dh-transaction-drawer__candidates">
            {transferCandidates.map((candidate) => (
              <li key={candidate.transactionId}>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => onLinkTransfer(candidate.transactionId)}
                  data-testid={`transfer-candidate-${candidate.transactionId}`}
                >
                  {candidate.payeeDisplay} · {candidate.accountTitle} ·{" "}
                  {financeDate(candidate.occurredOn)}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {transaction.settlesObligationTitle !== null ? (
        <section className="dh-transaction-drawer__section">
          <h3 className="dh-transaction-drawer__heading">Paid</h3>
          <p className="dh-transaction-drawer__note">
            This transaction completed{" "}
            <a
              href={`/obligations/${encodeURIComponent(transaction.settlesObligationId!)}`}
            >
              {transaction.settlesObligationTitle}
            </a>
            .
          </p>
        </section>
      ) : null}

      <section className="dh-transaction-drawer__section">
        {/*
         * V2.11's surface, imported and rendered. There is no Finance receipt
         * component anywhere in this release, and the architecture test that
         * names the evidence-carrying modules is where that is held.
         */}
        <AttachmentsSection
          ownerEntityId={transaction.id}
          attachments={attachments}
          heading="Receipt"
          description="The receipt, the invoice or the docket for this transaction."
          onChanged={onAttachmentsChanged}
        />
      </section>

      <section className="dh-transaction-drawer__section">
        <Button
          variant="subtle"
          size="sm"
          disabled={busy}
          onClick={onDelete}
          data-testid="transaction-delete"
        >
          Delete this transaction
        </Button>
      </section>
    </div>
  );
}
