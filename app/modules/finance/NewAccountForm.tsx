/**
 * V2.12 — creating an account.
 *
 * Six fields, and every one of them is used. There is no field for a bank
 * username, a password, a card number, an account number, a BSB or an internet
 * banking login — there are no bank feeds in V2.12 and there is nowhere in the
 * schema to put a credential if there were, which
 * `test/unit/architecture/finance-boundaries.test.ts` asserts rather than trusts.
 *
 * ## The opening balance is SIGNED, and the form says so in words
 *
 * A credit card you already owe $400 on opens at −$400, so the form asks for the
 * direction the same way the transaction form does: a control, not a minus sign.
 * The hint under it says what the figure means for the kind of account chosen,
 * because "opening balance" means something different on a card than on a
 * savings account and the product should say which.
 *
 * ## The currency cannot change later, and that is stated here
 *
 * Changing an account's currency would silently reinterpret every transaction it
 * already holds — the amounts would not move, but what they mean would — and
 * there is no honest way to do that in place.
 */

import { useId, useState } from "react";

import {
  FINANCE_ACCOUNT_TYPES,
  FINANCE_ACCOUNT_TYPE_HINTS,
  FINANCE_ACCOUNT_TYPE_LABELS,
  isLiabilityAccountType,
  type FinanceAccountType,
} from "~/kernel/finance";
import { Button, Input, Select } from "~/shared/ui";

export interface NewAccountFormProps {
  readonly todayIso: string;
  readonly busy?: boolean;
  readonly error?: string | null;
  readonly onSubmit: (input: {
    readonly title: string;
    readonly accountType: FinanceAccountType;
    readonly currencyCode: string;
    readonly openingBalance: string;
    readonly openingDirection: "positive" | "negative";
    readonly openingDate: string;
    readonly institution: string;
  }) => void | Promise<void>;
}

export function NewAccountForm({
  todayIso,
  busy = false,
  error = null,
  onSubmit,
}: NewAccountFormProps) {
  const [title, setTitle] = useState("");
  const [accountType, setAccountType] =
    useState<FinanceAccountType>("transaction");
  const [currencyCode, setCurrencyCode] = useState("AUD");
  const [openingBalance, setOpeningBalance] = useState("");
  const [openingDirection, setOpeningDirection] = useState<
    "positive" | "negative"
  >("positive");
  const [openingDate, setOpeningDate] = useState(todayIso);
  const [institution, setInstitution] = useState("");
  const ids = useId();

  const liability = isLiabilityAccountType(accountType);

  return (
    <form
      className="dh-finance-form"
      data-testid="new-account-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy || title.trim() === "") return;
        void onSubmit({
          title: title.trim(),
          accountType,
          currencyCode: currencyCode.trim().toUpperCase(),
          openingBalance: openingBalance.trim(),
          openingDirection,
          openingDate,
          institution: institution.trim(),
        });
      }}
    >
      {error === null ? null : (
        <p role="alert" data-testid="new-account-error">
          {error}
        </p>
      )}

      <div className="dh-finance-form__field">
        <label htmlFor={`${ids}-title`}>What you call it</label>
        <Input
          id={`${ids}-title`}
          value={title}
          maxLength={200}
          disabled={busy}
          placeholder="Everyday"
          onChange={(event) => setTitle(event.target.value)}
          data-testid="new-account-title"
        />
      </div>

      <div className="dh-finance-form__field">
        <label htmlFor={`${ids}-type`}>Kind of account</label>
        <Select
          id={`${ids}-type`}
          value={accountType}
          disabled={busy}
          onChange={(event) =>
            setAccountType(event.target.value as FinanceAccountType)
          }
          data-testid="new-account-type"
        >
          {FINANCE_ACCOUNT_TYPES.map((type) => (
            <option key={type} value={type}>
              {FINANCE_ACCOUNT_TYPE_LABELS[type]}
            </option>
          ))}
        </Select>
        <p className="dh-finance-form__hint">
          {FINANCE_ACCOUNT_TYPE_HINTS[accountType]}
        </p>
      </div>

      <div className="dh-finance-form__field">
        <label htmlFor={`${ids}-currency`}>Currency</label>
        <Input
          id={`${ids}-currency`}
          value={currencyCode}
          maxLength={3}
          disabled={busy}
          onChange={(event) => setCurrencyCode(event.target.value)}
          data-testid="new-account-currency"
        />
        <p className="dh-finance-form__hint">
          This cannot be changed later — every transaction in this account will
          be in it, and DalyHub never converts between currencies.
        </p>
      </div>

      <div className="dh-finance-form__field">
        <label htmlFor={`${ids}-opening`}>Balance when you start</label>
        <Input
          id={`${ids}-opening`}
          inputMode="decimal"
          value={openingBalance}
          disabled={busy}
          placeholder="0.00"
          onChange={(event) => setOpeningBalance(event.target.value)}
          data-testid="new-account-opening"
        />
        {liability ? (
          <fieldset>
            {/*
             * A card or a loan usually opens with money OWED, and asking the
             * owner to type a minus sign is asking them to encode a convention
             * the product already knows. A forgotten minus here would be wrong
             * by twice the figure in every net-worth reading afterwards.
             */}
            <legend className="dh-finance-form__label">Is that owing?</legend>
            <Button
              type="button"
              variant={
                openingDirection === "negative" ? "primary" : "secondary"
              }
              size="sm"
              aria-pressed={openingDirection === "negative"}
              disabled={busy}
              onClick={() => setOpeningDirection("negative")}
              data-testid="new-account-owing"
            >
              I owe this
            </Button>
            <Button
              type="button"
              variant={
                openingDirection === "positive" ? "primary" : "secondary"
              }
              size="sm"
              aria-pressed={openingDirection === "positive"}
              disabled={busy}
              onClick={() => setOpeningDirection("positive")}
              data-testid="new-account-in-credit"
            >
              I am in credit
            </Button>
          </fieldset>
        ) : null}
        <p className="dh-finance-form__hint">
          Leave it blank to start from nothing. Every balance DalyHub shows is
          this figure plus the transactions in the account — nothing else.
        </p>
      </div>

      <div className="dh-finance-form__field">
        <label htmlFor={`${ids}-date`}>As at</label>
        <Input
          id={`${ids}-date`}
          type="date"
          value={openingDate}
          disabled={busy}
          onChange={(event) => setOpeningDate(event.target.value)}
          data-testid="new-account-date"
        />
      </div>

      <div className="dh-finance-form__field">
        <label htmlFor={`${ids}-institution`}>Bank (optional)</label>
        <Input
          id={`${ids}-institution`}
          value={institution}
          maxLength={120}
          disabled={busy}
          onChange={(event) => setInstitution(event.target.value)}
          data-testid="new-account-institution"
        />
        <p className="dh-finance-form__hint">
          Just the name, so you can tell two accounts apart. DalyHub never asks
          for a login, an account number or a card number — there are no bank
          connections, and nowhere to keep one.
        </p>
      </div>

      <Button
        type="submit"
        variant="primary"
        disabled={busy || title.trim() === ""}
        data-testid="new-account-submit"
      >
        Add account
      </Button>
    </form>
  );
}
