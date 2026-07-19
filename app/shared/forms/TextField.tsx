/**
 * DS-06 Shared Forms — the text control.
 *
 * One control for both single-line and multiline text. It NEVER trims or mutates
 * the user's input on the way through (the value is passed verbatim); any
 * normalisation is the consumer's choice via the field contract. It supports an
 * optional character-length readout, a real `maxLength` bound, and correct
 * browser `autocomplete`. It renders through the shared `Field`, so its label,
 * help, error and ARIA wiring match every other control.
 */

import type { BaseControlProps } from "./control-props";
import { Field } from "./Field";

export interface TextFieldProps extends BaseControlProps<string> {
  /** Render a multiline `<textarea>` instead of a single-line `<input>`. */
  readonly multiline?: boolean;
  /** Rows for the multiline variant. */
  readonly rows?: number;
  /** Hard maximum length (also enforced natively). */
  readonly maxLength?: number;
  /** Show a live "used / max" (or plain count) length readout. */
  readonly showLength?: boolean;
  readonly placeholder?: string;
  /** Browser autocomplete token (e.g. "name", "email", "off"). */
  readonly autoComplete?: string;
  /** Input mode hint for on-screen keyboards (single-line only). */
  readonly inputMode?: "text" | "email" | "url" | "tel" | "numeric" | "search";
  /** Input type for single-line variants (defaults to "text"). */
  readonly type?: "text" | "email" | "url" | "tel" | "search";
}

export function TextField({
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
  multiline = false,
  rows = 4,
  maxLength,
  showLength = false,
  placeholder,
  autoComplete,
  inputMode,
  type = "text",
}: TextFieldProps) {
  const lengthReadout =
    showLength && !readOnly
      ? maxLength
        ? `${value.length} / ${maxLength}`
        : `${value.length}`
      : null;

  return (
    <Field
      id={id}
      label={label}
      required={required}
      help={help}
      error={error}
      disabled={disabled}
      readOnly={readOnly}
      showOptionalCue={showOptionalCue}
      className={className}
    >
      {(control) => (
        <>
          {multiline ? (
            <textarea
              id={control.id}
              className="dh-input dh-input--multiline"
              value={value}
              rows={rows}
              maxLength={maxLength}
              placeholder={placeholder}
              autoComplete={autoComplete}
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
          ) : (
            <input
              id={control.id}
              className="dh-input"
              type={type}
              value={value}
              maxLength={maxLength}
              placeholder={placeholder}
              autoComplete={autoComplete}
              inputMode={inputMode}
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
          )}
          {lengthReadout ? (
            <p className="dh-field__length" aria-hidden="true">
              {lengthReadout}
            </p>
          ) : null}
        </>
      )}
    </Field>
  );
}
