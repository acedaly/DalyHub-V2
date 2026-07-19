/**
 * DS-06 Shared Forms — the date control.
 *
 * Two unambiguous modes over the native date pickers:
 *   - `date` (default) — a calendar date with no time or zone. The value IS the
 *     ISO `YYYY-MM-DD` string the native `<input type="date">` produces; it is
 *     never routed through a `Date`, so it can never shift by a timezone.
 *   - `datetime` — an absolute instant, stored as an ISO-8601 UTC string. The
 *     native `<input type="datetime-local">` edits the UTC wall-clock directly
 *     (we interpret the entered time as UTC — the one documented rule), so
 *     serialisation is deterministic with no silent local/UTC shift.
 *
 * The value in/out is always the deterministic serialised form; validation
 * messages come from the host (see the date model's `validateDateOnly` /
 * `validateDateTimeLocal`).
 */

import { dateTimeLocalToUtcIso, utcIsoToDateTimeLocal } from "./dates";
import type { BaseControlProps } from "./control-props";
import { Field } from "./Field";
import type { DateFieldKind } from "./types";

export interface DateFieldProps extends BaseControlProps<string> {
  /** Date-only (default) or a UTC instant. */
  readonly kind?: DateFieldKind;
  /** Inclusive minimum (date-only `YYYY-MM-DD` for `kind="date"`). */
  readonly min?: string;
  /** Inclusive maximum (date-only `YYYY-MM-DD` for `kind="date"`). */
  readonly max?: string;
}

export function DateField({
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
  kind = "date",
  min,
  max,
}: DateFieldProps) {
  const isDateTime = kind === "datetime";

  // For datetime, the stored value is a UTC ISO instant; the native control
  // edits the UTC wall-clock, so convert in/out. For date-only the value maps
  // 1:1 to the control.
  const controlValue = isDateTime
    ? value
      ? (utcIsoToDateTimeLocal(value) ?? "")
      : ""
    : value;

  const handleChange = (raw: string) => {
    if (!isDateTime) {
      onChange(raw);
      return;
    }
    if (raw === "") {
      onChange("");
      return;
    }
    const iso = dateTimeLocalToUtcIso(raw);
    // A native datetime-local only yields parseable values; fall back safely.
    onChange(iso ?? "");
  };

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
          <input
            id={control.id}
            className="dh-input dh-input--date"
            type={isDateTime ? "datetime-local" : "date"}
            value={controlValue}
            min={isDateTime ? undefined : min}
            max={isDateTime ? undefined : max}
            disabled={control.disabled}
            readOnly={control.readOnly}
            required={control.required}
            aria-invalid={control.invalid || undefined}
            aria-errormessage={control.errorId ?? undefined}
            aria-describedby={control.describedBy}
            ref={(node) => controlRef?.(node)}
            onChange={(event) => handleChange(event.target.value)}
            onBlur={() => onBlur?.()}
          />
          {isDateTime ? (
            <p className="dh-field__hint">Entered and shown in UTC.</p>
          ) : null}
        </>
      )}
    </Field>
  );
}
