/**
 * DIARY-01 — the owner-local "when" control (shared by capture and editing).
 *
 * A Diary Entry's `occurredAt` is a UTC instant, but the owner thinks in their
 * LOCAL wall-clock ("when did this happen?"). The DS-06 `DateField` in
 * `datetime` mode edits a UTC wall-clock, which is the wrong mental model here —
 * a Sydney owner backdating "yesterday 3pm" means 3pm in THEIR zone, not UTC. So
 * this control composes the DS-06 `Field` anatomy (label, help, error, ids, ARIA)
 * around a native `datetime-local` input whose value is the owner-local
 * wall-clock; the route converts it to/from UTC with the display-zone-aware
 * helpers in `./occurred-time`. This is composition over the shared field
 * anatomy, not a second forms framework.
 */

import { Field, type FieldBinding } from "~/shared/forms";

export interface WhenFieldProps {
  readonly binding: FieldBinding<string>;
  readonly label: string;
  readonly help?: string;
  readonly required?: boolean;
  /** Shown when the field is optional (e.g. capture, where blank means "now"). */
  readonly showOptionalCue?: boolean;
}

export function WhenField({
  binding,
  label,
  help,
  required = false,
  showOptionalCue = false,
}: WhenFieldProps) {
  return (
    <Field
      id={binding.id}
      label={label}
      help={help}
      error={binding.error}
      required={required}
      showOptionalCue={showOptionalCue}
    >
      {(control) => (
        <input
          type="datetime-local"
          id={control.id}
          className="dh-diary-when__input"
          value={binding.value}
          required={control.required}
          aria-describedby={control.describedBy}
          aria-invalid={control.invalid || undefined}
          onChange={(event) => binding.onChange(event.target.value)}
          onBlur={() => binding.onBlur()}
          ref={(node) => binding.controlRef(node)}
        />
      )}
    </Field>
  );
}
