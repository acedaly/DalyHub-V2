/**
 * DS-06 Shared Forms — the boolean control.
 *
 * A single on/off value, rendered with the correct NATIVE semantics: a real
 * `<input type="checkbox">`, optionally presented as a switch (`role="switch"`).
 * The label sits beside the control and is clickable (a real `<label for>`),
 * touch targets meet 44px, and the value is NEVER communicated by colour alone —
 * the checkbox tick / switch thumb position and the `aria-checked` state carry it.
 *
 * A boolean is never "empty", so `required` (presence) is not offered here; a
 * genuine "must be ticked" rule (e.g. accept terms) is a consumer validator on
 * the value.
 */

import { composeDescribedBy, deriveFieldIds } from "./field-ids";
import type { BaseControlProps } from "./control-props";

export interface BooleanFieldProps extends Omit<
  BaseControlProps<boolean>,
  "showOptionalCue"
> {
  /** Presentation: a checkbox (default) or a switch. */
  readonly variant?: "checkbox" | "switch";
}

export function BooleanField({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  help,
  disabled,
  readOnly,
  controlRef,
  className,
  variant = "checkbox",
}: BooleanFieldProps) {
  const baseId = id ?? `dh-bool-${label.replace(/\s+/g, "-").toLowerCase()}`;
  const { helpId, errorId } = deriveFieldIds(baseId);
  const invalid = Boolean(error);
  const describedBy = composeDescribedBy({
    helpId: help ? helpId : null,
    errorId: invalid ? errorId : null,
  });

  const rootClassName = [
    "dh-field",
    "dh-field--boolean",
    `dh-field--boolean-${variant}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={rootClassName}
      data-invalid={invalid || undefined}
      data-disabled={disabled || undefined}
      data-readonly={readOnly || undefined}
    >
      <div className="dh-boolean">
        <input
          id={baseId}
          className="dh-boolean__input"
          type="checkbox"
          role={variant === "switch" ? "switch" : undefined}
          checked={value}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-errormessage={invalid ? errorId : undefined}
          aria-describedby={describedBy}
          ref={(node) => controlRef?.(node)}
          onChange={(event) => {
            // Read-only has no native checkbox equivalent; guard the change.
            if (readOnly) {
              event.preventDefault();
              return;
            }
            onChange(event.target.checked);
          }}
          onBlur={() => onBlur?.()}
        />
        <label className="dh-boolean__label" htmlFor={baseId}>
          <span className="dh-boolean__control" aria-hidden="true" />
          <span className="dh-boolean__text">{label}</span>
        </label>
      </div>

      <div className="dh-field__messages">
        {help ? (
          <p id={helpId} className="dh-field__help">
            {help}
          </p>
        ) : null}
        <div className="dh-field__error-slot" aria-live="polite">
          {invalid ? (
            <p id={errorId} className="dh-field__error">
              <span className="dh-field__error-icon" aria-hidden="true">
                !
              </span>
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
