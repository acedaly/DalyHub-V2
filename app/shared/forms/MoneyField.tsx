/**
 * DS-06 Shared Forms — the money control.
 *
 * ONE field for an amount and the currency it is in, because those two facts are
 * one fact. ADR-049 stores money as integer minor units beside an explicit
 * currency code and converts nothing, ever — so an amount without its code is
 * not a smaller piece of information, it is a WRONG one, and a form that lets
 * the two be filled in separately, in different sections, is a form that invites
 * exactly that.
 *
 * ── What was there before ───────────────────────────────────────────────────
 * Four hand-rolled amount fields across three Asset forms, each pairing a
 * `TextField` with a separate three-character `TextField` for the code — twice
 * with the code behind a "More details" disclosure, two sections away from the
 * amount it labels, and once with the amount rendered in two different places
 * depending on the preset. One used `inputMode="text"`, giving a phone the
 * wrong keypad. V2.10 was about to add a fifth (LIFE-02).
 *
 * ── The anatomy, and why the label points at the AMOUNT ─────────────────────
 * The outer `<label>` names the amount input, not the group. A composite field
 * with `association="group"` would have been the tidier ARIA, and it would have
 * renamed every existing control: an amount input whose accessible name was
 * "Purchase price" would become an unnamed input inside a group called
 * "Purchase price". The name a person hears when they land on the box they type
 * a number into is the one that matters, so it is kept, and the currency input
 * beside it carries its own.
 *
 * The currency is a three-letter code, not a picker. There is no list of
 * currencies in this product and inventing one here would be a new vocabulary
 * with no owner; `validateCurrencyCode` accepts any ISO-4217 shape, and the
 * server is the boundary that decides.
 */

import { deriveFieldIds } from "./field-ids";
import type { BaseControlProps } from "./control-props";
import { Field } from "./Field";

export interface MoneyFieldProps extends BaseControlProps<string> {
  /** The ISO-4217 code the amount is in. Always present, never inferred. */
  readonly currencyCode: string;
  readonly onCurrencyChange: (value: string) => void;
  /** A server-side error against the CURRENCY, shown under the same field. */
  readonly currencyError?: string | null;
  /** The currency input's own accessible name. */
  readonly currencyLabel?: string;
  readonly placeholder?: string;
}

export function MoneyField({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  help,
  required,
  disabled,
  readOnly,
  showOptionalCue,
  controlRef,
  className,
  currencyCode,
  onCurrencyChange,
  currencyError,
  currencyLabel = "Currency",
  placeholder,
}: MoneyFieldProps) {
  /*
   * Two form values, ONE error slot. A currency error is an error about this
   * field — the amount cannot be stored without a code — so it is shown here
   * rather than under a second field the owner would have to go looking for.
   * The amount's own error wins when both are present, because it is the one
   * the owner was typing in.
   */
  const combinedError = error ?? currencyError ?? null;

  return (
    <Field
      id={id}
      label={label}
      required={required}
      help={help}
      error={combinedError}
      disabled={disabled}
      readOnly={readOnly}
      showOptionalCue={showOptionalCue}
      className={["dh-money-field", className].filter(Boolean).join(" ")}
    >
      {(control) => {
        const currencyId = `${control.id}-currency`;
        const { errorId } = deriveFieldIds(control.id);
        return (
          <div className="dh-money-field__controls">
            <input
              id={control.id}
              className="dh-input dh-money-field__amount"
              type="text"
              /* The decimal keypad, on every one of these, at last. */
              inputMode="decimal"
              value={value}
              maxLength={24}
              placeholder={placeholder}
              autoComplete="off"
              disabled={control.disabled}
              readOnly={control.readOnly}
              required={control.required}
              aria-invalid={control.invalid || undefined}
              aria-errormessage={control.errorId ?? undefined}
              aria-describedby={control.describedBy}
              ref={(node) => controlRef?.(node)}
              onChange={(event) => onChange(event.target.value)}
              onBlur={() => onBlur?.()}
            />
            <input
              id={currencyId}
              className="dh-input dh-money-field__currency"
              type="text"
              value={currencyCode}
              maxLength={3}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              disabled={control.disabled}
              readOnly={control.readOnly}
              aria-label={currencyLabel}
              aria-invalid={(currencyError ? true : undefined) || undefined}
              aria-errormessage={
                currencyError ? (errorId ?? undefined) : undefined
              }
              aria-describedby={control.describedBy}
              onChange={(event) => onCurrencyChange(event.target.value)}
            />
          </div>
        );
      }}
    </Field>
  );
}
