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
  /**
   * The form element's id.
   *
   * Needed when the submit button cannot be a DESCENDANT of the form — the
   * MOBILE-01 `Sheet`'s sticky footer is outside the scrolling body, which is
   * exactly where a phone's primary action has to live so the keyboard cannot
   * push it off-screen. The button carries `form="<id>"` and native submission
   * still flows through `onSubmit`; nothing about validation or focus changes.
   */
  readonly id?: string;
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
  id,
  onSubmit,
  busy = false,
  className,
  children,
  ...aria
}: FormProps) {
  const rootClassName = ["dh-form", className].filter(Boolean).join(" ");
  return (
    <form
      id={id}
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
   * Whether the commitment row pins to the bottom of its scroll container.
   *
   *   `"phone"` (the DEFAULT) — sticky below `md`, static above it.
   *   `true`                  — sticky at every width.
   *   `false`                 — never sticky. For a row that is already inside
   *                             something bottom-anchored (a `Sheet` footer), or
   *                             one that is not a commitment at all.
   *
   * ── Why the default changed (MOBILE-01, iPhone daily driver) ───────────────
   * The first MOBILE-01 pass made this an opt-in and warned against setting it
   * on a short form. Measured on this pass: three of the twenty-nine
   * `FormActions` in the product had opted in. The other twenty-six put Save at
   * the END of a scrolling column on a phone — so committing a new Person, a
   * new Project, a Note's tags, an Asset's obligation or a Diary entry meant
   * dismissing the keyboard, scrolling to the bottom, and only then reaching the
   * button. "Save/Done must remain reachable" is not a property a form opts
   * into; it is the baseline, and an opt-in that twenty-six consumers did not
   * take is a default in the wrong place.
   *
   * The original warning was still right about ONE thing — a sticky bar over
   * three fields is chrome — and it stays answered, by the phone-only scope and
   * by the CSS: on a form shorter than its container the row never actually
   * sticks, and the treatment it adds is the hairline and the safe-area padding
   * a phone commitment row should carry anyway.
   */
  readonly sticky?: boolean | "phone";
}

/** The explicit actions row (Save / Cancel). Kept visually distinct and last. */
export function FormActions({
  children,
  className,
  sticky = "phone",
}: FormActionsProps) {
  const rootClassName = [
    "dh-form-actions",
    sticky === true ? "dh-form-actions--sticky" : null,
    sticky === "phone" ? "dh-form-actions--sticky-phone" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return <div className={rootClassName}>{children}</div>;
}
