/**
 * DS-04 — a single quick/overflow action button or link.
 *
 * Buttons when `onSelect`, links when `href`. Every action has an accessible name
 * (its `label`, or an explicit `ariaLabel` for icon-only actions); meaning is
 * never carried by icon or colour alone. Disabled and pending actions cannot fire.
 * Activation is stopped from bubbling so a quick action never opens the card.
 */

import type { KeyboardEvent, MouseEvent } from "react";

import type { CardAction } from "./types";

interface CardActionButtonProps {
  readonly action: CardAction;
  /** Extra class (e.g. to mark the overflow trigger). */
  readonly className?: string;
}

export function CardActionButton({ action, className }: CardActionButtonProps) {
  const inactive = Boolean(action.disabled) || Boolean(action.pending);
  const classes = ["dh-card__action", className].filter(Boolean).join(" ");
  // Icon-only actions must still name themselves; require an explicit ariaLabel
  // and fall back to the label so an icon action is never unnamed.
  const iconOnlyName = action.ariaLabel ?? action.label;

  const stop = (event: MouseEvent | KeyboardEvent) => {
    // Keep an action from bubbling to any card-level handler.
    event.stopPropagation();
  };

  const label = (
    <>
      {action.icon ? (
        <span className="dh-card__action-icon" aria-hidden="true">
          {action.icon}
        </span>
      ) : null}
      {action.iconOnly ? (
        <span className="dh-visually-hidden">{iconOnlyName}</span>
      ) : (
        <span className="dh-card__action-label">{action.label}</span>
      )}
      {action.shortcut ? (
        <kbd className="dh-card__action-shortcut" aria-hidden="true">
          {action.shortcut}
        </kbd>
      ) : null}
    </>
  );

  if (action.href !== undefined && !inactive) {
    return (
      <a
        href={action.href}
        className={classes}
        aria-label={action.ariaLabel}
        title={action.description}
        aria-keyshortcuts={action.shortcut}
        onClick={stop}
      >
        {label}
      </a>
    );
  }

  return (
    <button
      type="button"
      className={classes}
      aria-label={action.ariaLabel}
      title={action.description}
      aria-keyshortcuts={action.shortcut}
      aria-busy={action.pending ? "true" : undefined}
      disabled={inactive}
      onClick={(event) => {
        stop(event);
        if (inactive) {
          return;
        }
        action.onSelect?.();
      }}
    >
      {label}
    </button>
  );
}
