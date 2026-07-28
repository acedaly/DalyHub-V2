import type { BaseControlProps } from "./control-props";
import { Field } from "./Field";

export interface LocalDateTimeFieldProps extends BaseControlProps<string> {
  readonly maxLength?: number;
}

export function LocalDateTimeField({
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
}: LocalDateTimeFieldProps) {
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
        <input
          id={control.id}
          className="dh-input"
          type="datetime-local"
          value={value}
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
    </Field>
  );
}
