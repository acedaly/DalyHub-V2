/**
 * DS-06 Shared Forms — the shared form button.
 *
 * One button for form actions (Save, Cancel, and the like), so pending and
 * disabled behaviour is consistent and duplicate submits are prevented
 * uniformly: a `pending` button is disabled and announces its busy state, and a
 * Save button bound to a submitting form cannot be double-fired.
 *
 * ── DS-02 — it is now a `Button` ─────────────────────────────────────────────
 *
 * It used to assemble `dh-btn dh-btn--{variant}` itself and render its own
 * spinner and label spans. It now composes `~/shared/ui`'s `Button`, so there
 * is exactly one place in the product that knows what a button looks like.
 *
 * What stays here is the only thing this component ever added over a button:
 * the PENDING contract — `pending` implies `disabled`, announces `aria-busy`,
 * and swaps in `pendingLabel`. That is a form-submission rule (it exists to stop
 * a double submit), so it belongs to the form layer rather than to the
 * primitive, and `Button` deliberately does not have it: `Button`'s `loading`
 * shows the spinner and leaves the control enabled, because a generic button in
 * flight is not always a form being submitted.
 *
 * The public API is unchanged, including the `ghost` variant name — 40-odd call
 * sites pass these strings and there is nothing to gain from renaming them in
 * the same change that reimplements the component. `ghost` maps to the
 * primitive's `subtle`.
 */

import type { ButtonHTMLAttributes, ReactNode } from "react";

import { Button, type ButtonVariant } from "~/shared/ui";

export type FormButtonVariant = "primary" | "secondary" | "danger" | "ghost";

/** The form vocabulary → the primitive's. Only `ghost` actually differs. */
const VARIANTS: Record<FormButtonVariant, ButtonVariant> = {
  primary: "primary",
  secondary: "secondary",
  danger: "danger",
  ghost: "subtle",
};

export interface FormButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "className"
> {
  readonly variant?: FormButtonVariant;
  /** When true, the button is disabled and shows a busy state. */
  readonly pending?: boolean;
  /** Text shown while pending (defaults to the children). */
  readonly pendingLabel?: string;
  readonly className?: string;
  readonly children: ReactNode;
}

export function FormButton({
  variant = "secondary",
  pending = false,
  pendingLabel,
  disabled,
  type = "button",
  className,
  children,
  ...rest
}: FormButtonProps) {
  return (
    <Button
      type={type}
      variant={VARIANTS[variant]}
      // `dh-btn--pending` is kept in the class list: it is a state hook several
      // module stylesheets and e2e locators match on, and it costs nothing.
      className={[pending ? "dh-btn--pending" : null, className]
        .filter(Boolean)
        .join(" ")}
      loading={pending}
      disabled={disabled || pending}
      {...rest}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
