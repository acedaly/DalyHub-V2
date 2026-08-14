/**
 * DS-02 — the DalyHub Button.
 *
 * DS-01 finding 4: `.dh-btn` was a class string applied as a literal at 76+ call
 * sites, and `base.css` named it in five repeated state-layer selector lists.
 * That is the clearest possible statement that the control wants to be a
 * component, and this is it.
 *
 * ── The four families, and why there are four ────────────────────────────────
 *
 *   primary     The one action a surface exists for. At most one per surface.
 *   secondary   A real action that is not THE action — a bordered, neutral
 *               control, not a tonal slab. This is the button the product has
 *               most of.
 *   subtle      The lowest-emphasis action: no container until it is hovered.
 *               Inside cards, rows and toolbars.
 *   danger      Destructive. Always carries the word as well as the colour
 *               (AGENTS.md §15).
 *
 * A fifth would be a taste decision rather than a hierarchy one, which is how
 * `.dh-btn` ended up with five modifiers where the product had four jobs. The
 * legacy `--outlined` modifier is `secondary` — after DS-02 they paint the same
 * thing, because DS-02's secondary IS the outlined one.
 *
 * ── What it does NOT expose ──────────────────────────────────────────────────
 *
 * No `shape`, no `elevation`, no `radius`, no colour. A caller chooses the JOB;
 * the design system chooses the paint. That is the rule that stops the next
 * hundred call sites re-deciding what a secondary action looks like.
 *
 * ── Size and density ─────────────────────────────────────────────────────────
 *
 * `size` is NOT a height. Height comes from `--dh-control-height`, which the
 * DS-01 density model owns — so a button in a `data-dh-density="compact"` region
 * is 36px, the same button in a touch context is 45px, and neither is written
 * here. What `size` changes is the button's own inline padding and type rung,
 * which is a proportion decision rather than a target one. That is also why
 * `sm` is safe: on a coarse pointer the density floor gives every target its
 * 45px back, unconditionally (tokens.css), so a small button is never an
 * unreachable one.
 */

import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";

/** The four button families. See the file header for when each is correct. */
export type ButtonVariant = "primary" | "secondary" | "subtle" | "danger";

/** Inline proportion and type rung. Height belongs to density, not to this. */
export type ButtonSize = "sm" | "md";

interface ButtonOwnProps {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  /**
   * Fill the inline axis. For a form's commitment row on a phone, and for a
   * menu-like stack — never as a way to make one action look important.
   */
  readonly block?: boolean;
  /** A leading glyph. Decorative: the label is what is read. */
  readonly icon?: ReactNode;
  /** A trailing glyph — a disclosure chevron, a split-button caret. */
  readonly trailingIcon?: ReactNode;
  /**
   * In flight. Renders a spinner in place of the leading glyph and marks the
   * control busy; it does NOT disable it, so the accessible name survives and
   * focus is not thrown. Callers that must block a second submit pass
   * `disabled` as well.
   */
  readonly loading?: boolean;
  readonly children?: ReactNode;
}

export interface ButtonProps
  extends
    ButtonOwnProps,
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  readonly ref?: Ref<HTMLButtonElement>;
}

/**
 * Build the class list. Exported because `ButtonLink` and the small number of
 * call sites that must render something else (a `<label>` acting as a file
 * picker, a router `<Link>`) need the SAME paint without a second stylesheet.
 * A raw string of `dh-button dh-button--primary` at a call site is the thing
 * DS-02 exists to remove; this function is the supported way to reach it.
 */
export function buttonClassName(options: {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly block?: boolean;
  readonly className?: string;
}): string {
  const { variant = "secondary", size = "md", block, className } = options;
  return [
    "dh-button",
    `dh-button--${variant}`,
    size === "sm" ? "dh-button--sm" : null,
    block ? "dh-button--block" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

/** The leading slot: a spinner while loading, the caller's glyph otherwise. */
function LeadingSlot({
  loading,
  icon,
}: {
  readonly loading?: boolean;
  readonly icon?: ReactNode;
}) {
  if (loading) {
    return <span className="dh-button__spinner" aria-hidden="true" />;
  }
  if (!icon) return null;
  return (
    <span className="dh-button__icon" aria-hidden="true">
      {icon}
    </span>
  );
}

/** The DalyHub button. */
export function Button({
  variant = "secondary",
  size = "md",
  block,
  icon,
  trailingIcon,
  loading,
  children,
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      // An explicit default: a `<button>` inside a form is a SUBMIT button
      // unless it says otherwise, and the overwhelming majority of these are
      // not. A caller that means to submit passes `type="submit"`.
      type={type}
      className={buttonClassName({ variant, size, block, className })}
      aria-busy={loading || undefined}
      {...rest}
    >
      <LeadingSlot loading={loading} icon={icon} />
      {children !== undefined ? (
        <span className="dh-button__label">{children}</span>
      ) : null}
      {trailingIcon ? (
        <span className="dh-button__icon" aria-hidden="true">
          {trailingIcon}
        </span>
      ) : null}
    </button>
  );
}

export interface ButtonLinkProps
  extends
    ButtonOwnProps,
    Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "children"> {
  readonly href: string;
  readonly ref?: Ref<HTMLAnchorElement>;
}

/**
 * A navigation that is drawn as a button.
 *
 * A real `<a href>`, so middle-click, "open in new tab" and the status bar all
 * work — the mistake this prevents is a `<button onClick={navigate}>`, which
 * looks identical and is none of those things. It carries no `loading`, because
 * a link does not have an in-flight state of its own.
 */
export function ButtonLink({
  variant = "secondary",
  size = "md",
  block,
  icon,
  trailingIcon,
  children,
  className,
  ...rest
}: ButtonLinkProps) {
  return (
    <a
      className={buttonClassName({ variant, size, block, className })}
      {...rest}
    >
      <LeadingSlot icon={icon} />
      {children !== undefined ? (
        <span className="dh-button__label">{children}</span>
      ) : null}
      {trailingIcon ? (
        <span className="dh-button__icon" aria-hidden="true">
          {trailingIcon}
        </span>
      ) : null}
    </a>
  );
}
