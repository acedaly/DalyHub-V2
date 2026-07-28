/**
 * DS-06 Shared Forms — composition primitives.
 *
 * Small, unopinionated building blocks that give every DalyHub form the same
 * shape: a `<form>` wrapper, grouped sections, an explicit actions row, a
 * form-level error summary and a save-status indicator. They own layout and
 * accessibility wiring only; the STATE comes from `useForm` (explicit) or
 * `useAutosaveField` (autosave). The public API is deliberately small — internal
 * state-machine, timing and focus machinery is not exported.
 */

import type { FormEvent, ReactNode } from "react";

export interface FormProps {
  /** Submit handler — pass `form.handleSubmit` from `useForm`. */
  readonly onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  /** Accessible name for the form (use when there is no visible heading). */
  readonly "aria-label"?: string;
  /** Id of a visible element naming the form. */
  readonly "aria-labelledby"?: string;
  /** Whether the form is mid-submission (sets `aria-busy`). */
  readonly busy?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}

/**
 * The form element. `noValidate` is set because DS-06 owns validation and
 * messaging (native bubbles would be inconsistent and less accessible). Native
 * submission (Enter in a text field, the submit button) flows through `onSubmit`.
 */
export function Form({
  onSubmit,
  busy = false,
  className,
  children,
  ...aria
}: FormProps) {
  const rootClassName = ["dh-form", className].filter(Boolean).join(" ");
  return (
    <form
      className={rootClassName}
      onSubmit={onSubmit}
      noValidate
      aria-busy={busy || undefined}
      aria-label={aria["aria-label"]}
      aria-labelledby={aria["aria-labelledby"]}
    >
      {children}
    </form>
  );
}

export interface FormSectionProps {
  /** The section heading. Rendered as a `<legend>` inside a `<fieldset>`. */
  readonly title?: string;
  /** Optional description shown under the heading. */
  readonly description?: string;
  readonly className?: string;
  readonly children: ReactNode;
}

/**
 * A grouped set of fields. Uses a `fieldset`/`legend` so assistive technology
 * announces the group name for each contained control — the correct native
 * grouping semantics.
 */
export function FormSection({
  title,
  description,
  className,
  children,
}: FormSectionProps) {
  const rootClassName = ["dh-form-section", className]
    .filter(Boolean)
    .join(" ");
  return (
    <fieldset className={rootClassName}>
      {title ? (
        <legend className="dh-form-section__title">{title}</legend>
      ) : null}
      {description ? (
        <p className="dh-form-section__description">{description}</p>
      ) : null}
      <div className="dh-form-section__fields">{children}</div>
    </fieldset>
  );
}

export interface FieldGroupProps {
  readonly className?: string;
  readonly children: ReactNode;
}

/** A lightweight horizontal/related grouping of fields (no legend semantics). */
export function FieldGroup({ className, children }: FieldGroupProps) {
  const rootClassName = ["dh-field-group", className].filter(Boolean).join(" ");
  return <div className={rootClassName}>{children}</div>;
}

export interface FormActionsProps {
  readonly children: ReactNode;
  readonly className?: string;
  /**
   * MOBILE-01 — pin the row to the bottom of its scroll container.
   *
   * Use it for forms a user genuinely scrolls on a phone (a record's Details tab,
   * a Meeting's follow-up), so the commitment is always in reach. The row is
   * keyboard-safe and bottom-navigation-safe by construction (forms.css), so a
   * consumer never measures anything.
   *
   * Do NOT set it on a short form: a sticky bar over three fields is chrome that
   * costs rows and earns nothing.
   */
  readonly sticky?: boolean;
}

/** The explicit actions row (Save / Cancel). Kept visually distinct and last. */
export function FormActions({
  children,
  className,
  sticky = false,
}: FormActionsProps) {
  const rootClassName = [
    "dh-form-actions",
    sticky ? "dh-form-actions--sticky" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return <div className={rootClassName}>{children}</div>;
}
