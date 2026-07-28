/**
 * DS-06 Shared Forms — the form-level error summary.
 *
 * After a failed explicit submit, users need one place that names what went wrong
 * and takes them to each problem. This summary is an assertive live region (so it
 * is announced), lists every field error as a button that focuses the offending
 * field, and shows any form-level (whole-operation) error. It never shows a raw
 * exception — only the specific, recovery-oriented messages the form produced.
 *
 * It renders nothing when there are no errors, so it is safe to always mount.
 */

import { firstInvalidField } from "./save-state";

export interface FormErrorSummaryProps {
  /** A form-level (whole-operation) error message, or null. */
  readonly formError?: string | null;
  /** Field-level errors keyed by field name. */
  readonly fieldErrors: Readonly<Record<string, string>>;
  /** The field order, so the list matches the visual order. */
  readonly order: readonly string[];
  /** Human labels for field names (defaults to the name). */
  readonly labels?: Readonly<Record<string, string>>;
  /** Focus the named field when its summary entry is activated. */
  readonly onFocusField: (name: string) => void;
  readonly className?: string;
}

export function FormErrorSummary({
  formError,
  fieldErrors,
  order,
  labels,
  onFocusField,
  className,
}: FormErrorSummaryProps) {
  const erroredNames = order.filter((name) => fieldErrors[name]);
  // Include any errored field not in the declared order (defensive).
  for (const name of Object.keys(fieldErrors)) {
    if (!erroredNames.includes(name)) erroredNames.push(name);
  }

  const hasFieldErrors = erroredNames.length > 0;
  if (!formError && !hasFieldErrors) return null;

  const rootClassName = ["dh-form-error-summary", className]
    .filter(Boolean)
    .join(" ");

  const focusFirst = () => {
    const first = firstInvalidField(order, fieldErrors);
    if (first) onFocusField(first);
  };

  return (
    <div className={rootClassName} role="alert" aria-live="assertive">
      <p className="dh-form-error-summary__heading">
        <span className="dh-form-error-summary__icon" aria-hidden="true">
          !
        </span>
        {hasFieldErrors
          ? `There ${erroredNames.length === 1 ? "is" : "are"} ${erroredNames.length} ${
              erroredNames.length === 1 ? "problem" : "problems"
            } to fix.`
          : "Your changes couldn’t be saved."}
      </p>

      {formError ? (
        <p className="dh-form-error-summary__form-error">{formError}</p>
      ) : null}

      {hasFieldErrors ? (
        <ul className="dh-form-error-summary__list">
          {erroredNames.map((name) => (
            <li key={name}>
              <button
                type="button"
                className="dh-form-error-summary__link"
                onClick={() => onFocusField(name)}
              >
                <span className="dh-form-error-summary__field">
                  {labels?.[name] ?? name}:
                </span>{" "}
                {fieldErrors[name]}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Hidden helper so keyboard users can jump straight to the first problem
          if they activate the summary region container itself. */}
      <button type="button" className="dh-visually-hidden" onClick={focusFirst}>
        Go to the first problem
      </button>
    </div>
  );
}
