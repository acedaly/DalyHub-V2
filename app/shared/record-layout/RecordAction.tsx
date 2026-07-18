/**
 * DS-02 — a single record action, rendered as a link or a button.
 *
 * Shared by the header (primary/secondary actions) so every action has a
 * consistent accessible name (the visible label, or `ariaLabel` when the label
 * is terse), a consistent token-driven appearance, and a proper disabled state.
 * A link with `href` renders as an anchor; otherwise a `<button>`.
 */

import type { RecordAction } from "./types";

export interface RecordActionButtonProps {
  readonly action: RecordAction;
  /** Fallback variant when the action does not specify one. */
  readonly defaultVariant?: "primary" | "secondary";
}

export function RecordActionButton({
  action,
  defaultVariant = "secondary",
}: RecordActionButtonProps) {
  const variant = action.variant ?? defaultVariant;
  const className = `record-action record-action--${variant}`;
  const accessibleName = action.ariaLabel ?? action.label;

  if (action.href !== undefined && !action.disabled) {
    return (
      <a
        className={className}
        href={action.href}
        aria-label={action.ariaLabel}
        data-action-id={action.id}
      >
        {action.label}
      </a>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={action.onSelect}
      disabled={action.disabled}
      aria-label={action.ariaLabel}
      aria-disabled={action.disabled ? true : undefined}
      data-action-id={action.id}
      title={accessibleName}
    >
      {action.label}
    </button>
  );
}
