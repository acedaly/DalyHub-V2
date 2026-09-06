/**
 * V2.12 — entering a transaction by hand.
 *
 * Cash, a correction, a small account, something the bank's CSV never carried.
 * It uses the SAME transaction model as an import: there is no "cash expense"
 * subsystem, no second table and no second row shape.
 *
 * ## The DIRECTION is a control, not a minus sign
 *
 * The one sign convention is positive-in / negative-out, and this form applies
 * it — the owner chooses "Money out" or "Money in" and types a magnitude. Asking
 * them to type `-12.50` would make a forgotten minus a silent $25 error in the
 * month's total, and there is no reason to ask a person to encode a convention
 * the product already knows.
 *
 * ## A manual row's identity is content-independent
 *
 * Its fingerprint is `man:<id>`, so correcting the amount or the date later does
 * not move it, and an import can never dedup against it. A row you typed and a
 * row the bank sent are different facts with different provenance — and where
 * they meet, the import's suspected-duplicate signal is what shows it.
 */

import { useId, useState } from "react";

import type {
  SerializedFinanceAccount,
  SerializedFinanceCategory,
} from "~/shared/finance";
import { Button, Input, Select } from "~/shared/ui";

import { CategoryPicker } from "~/shared/finance";
import type { NewTransactionInput } from "./use-finance-actions";

export interface NewTransactionFormProps {
  readonly accounts: readonly SerializedFinanceAccount[];
  readonly categories: readonly SerializedFinanceCategory[];
  readonly todayIso: string;
  readonly busy?: boolean;
  readonly onSubmit: (input: NewTransactionInput) => void | Promise<void>;
}

export function NewTransactionForm({
  accounts,
  categories,
  todayIso,
  busy = false,
  onSubmit,
}: NewTransactionFormProps) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [occurredOn, setOccurredOn] = useState(todayIso);
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"in" | "out">("out");
  const [payeeDisplay, setPayeeDisplay] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const accountFieldId = useId();
  const dateFieldId = useId();
  const amountFieldId = useId();
  const payeeFieldId = useId();

  const account = accounts.find((entry) => entry.id === accountId) ?? null;
  const ready =
    accountId !== "" &&
    occurredOn !== "" &&
    amount.trim() !== "" &&
    payeeDisplay.trim() !== "";

  return (
    <form
      className="dh-finance-form"
      data-testid="new-transaction-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready || busy) return;
        void onSubmit({
          accountId,
          occurredOn,
          amount: amount.trim(),
          direction,
          payeeDisplay: payeeDisplay.trim(),
          categoryId,
        });
      }}
    >
      <div className="dh-finance-form__field">
        <label htmlFor={accountFieldId}>Account</label>
        <Select
          id={accountFieldId}
          value={accountId}
          disabled={busy}
          onChange={(event) => setAccountId(event.target.value)}
          data-testid="new-transaction-account"
        >
          {accounts.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.title}
            </option>
          ))}
        </Select>
      </div>

      <div className="dh-finance-form__field">
        <label htmlFor={dateFieldId}>Date</label>
        <Input
          id={dateFieldId}
          type="date"
          value={occurredOn}
          disabled={busy}
          onChange={(event) => setOccurredOn(event.target.value)}
          data-testid="new-transaction-date"
        />
      </div>

      <fieldset className="dh-finance-form__field">
        {/*
         * The sign, as a choice with words. A minus sign the owner has to
         * remember to type is a silent error waiting to happen in a month total.
         */}
        <legend>Direction</legend>
        <Button
          type="button"
          variant={direction === "out" ? "primary" : "secondary"}
          size="sm"
          aria-pressed={direction === "out"}
          disabled={busy}
          onClick={() => setDirection("out")}
          data-testid="new-transaction-out"
        >
          Money out
        </Button>
        <Button
          type="button"
          variant={direction === "in" ? "primary" : "secondary"}
          size="sm"
          aria-pressed={direction === "in"}
          disabled={busy}
          onClick={() => setDirection("in")}
          data-testid="new-transaction-in"
        >
          Money in
        </Button>
      </fieldset>

      <div className="dh-finance-form__field">
        <label htmlFor={amountFieldId}>
          Amount{account === null ? "" : ` (${account.currencyCode})`}
        </label>
        <Input
          id={amountFieldId}
          inputMode="decimal"
          value={amount}
          disabled={busy}
          placeholder="0.00"
          onChange={(event) => setAmount(event.target.value)}
          data-testid="new-transaction-amount"
        />
      </div>

      <div className="dh-finance-form__field">
        <label htmlFor={payeeFieldId}>Who it was with</label>
        <Input
          id={payeeFieldId}
          value={payeeDisplay}
          maxLength={200}
          disabled={busy}
          onChange={(event) => setPayeeDisplay(event.target.value)}
          data-testid="new-transaction-payee"
        />
      </div>

      <div className="dh-finance-form__field">
        <span className="dh-finance-form__label">Category</span>
        <CategoryPicker
          categories={categories}
          selectedId={categoryId}
          busy={busy}
          onChoose={setCategoryId}
        />
      </div>

      <Button
        type="submit"
        variant="primary"
        disabled={!ready || busy}
        data-testid="new-transaction-submit"
      >
        Add transaction
      </Button>
    </form>
  );
}
