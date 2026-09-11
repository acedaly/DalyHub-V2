/**
 * DS-02 — a single record action, rendered as a link or a button.
 *
 * Shared by the header (primary/secondary actions) so every action has a
 * consistent accessible name (the visible label, or `ariaLabel` when the label
 * is terse), a consistent appearance, and a proper disabled state. A link with
 * `href` renders as an anchor; otherwise a `<button>`.
 *
 * ── UNTITLED-04 ─────────────────────────────────────────────────────────────
 * It now renders through the shared Untitled-backed `Button` / `ButtonLink`
 * rather than through a bespoke `.record-action` class pair. The record header
 * is the one place in the product where a button sat beside the record's own
 * name and was drawn by a different system from every other button on the page;
 * that is exactly the drift a shared scaffold exists to prevent.
 *
 * `data-action-id` survives — it is the stable hook journeys address — and the
 * `.record-action` class does not, because `record-layout.css` is unlayered and
 * would have painted the legacy control straight over the Untitled one.
 */

import { Button, ButtonLink } from "~/shared/ui";

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
  const accessibleName = action.ariaLabel ?? action.label;

  if (action.href !== undefined && !action.disabled) {
    return (
      <ButtonLink
        variant={variant}
        href={action.href}
        aria-label={action.ariaLabel}
        data-action-id={action.id}
      >
        {action.label}
      </ButtonLink>
    );
  }

  return (
    <Button
      variant={variant}
      onClick={action.onSelect}
      disabled={action.disabled}
      aria-label={action.ariaLabel}
      data-action-id={action.id}
      title={accessibleName}
    >
      {action.label}
    </Button>
  );
}
