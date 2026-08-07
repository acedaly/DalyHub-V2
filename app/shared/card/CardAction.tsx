/**
 * DS-04 — a single quick/overflow action button or link.
 *
 * Buttons when `onSelect`, links when `href`. Every action has an accessible name
 * (its `label`, or an explicit `ariaLabel` for icon-only actions); meaning is
 * never carried by icon or colour alone. Disabled and pending actions cannot fire.
 * Activation is stopped from bubbling so a quick action never opens the card.
 *
 * M3-TIP — an ICON-ONLY action composes the shared tooltip, so the word behind
 * the glyph (and the action's shortcut, where it declares one) reaches a
 * keyboard user and not only a mouse. An action that shows its label as text
 * keeps the plain `title` for its longer `description`: it is already named on
 * screen, and the audit's rule is one tooltip system for controls that genuinely
 * need explanatory text — not a tooltip on every control in the product.
 */

import type { KeyboardEvent, MouseEvent } from "react";

import { Tooltip } from "~/shared/tooltip";

import type { CardAction } from "./types";

interface CardActionButtonProps {
  readonly action: CardAction;
  /** Extra class (e.g. to mark the overflow trigger). */
  readonly className?: string;
  /**
   * Roving `tabIndex` when the card belongs to a keyboard-navigable composite
   * (DS-09); undefined leaves the control at its natural tab position.
   */
  readonly tabIndex?: number;
}

export function CardActionButton({
  action,
  className,
  tabIndex,
}: CardActionButtonProps) {
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

  /**
   * The control itself, given the tooltip wiring when there is a tooltip. An
   * icon-only action gets one; a labelled action keeps `title` for its longer
   * description, which is supplementary detail rather than the missing word.
   */
  const control = (tip?: {
    readonly ref: (node: HTMLElement | null) => void;
    readonly describedBy: string | undefined;
  }) => {
    if (action.href !== undefined && !inactive) {
      return (
        <a
          ref={tip?.ref}
          href={action.href}
          className={classes}
          aria-label={action.ariaLabel}
          aria-describedby={tip?.describedBy}
          title={tip ? undefined : action.description}
          aria-keyshortcuts={action.shortcut}
          tabIndex={tabIndex}
          // An external destination opens in a new tab, so activating it never
          // discards the user's place in DalyHub.
          target={action.external ? "_blank" : undefined}
          rel={action.external ? "noreferrer" : undefined}
          onClick={stop}
        >
          {label}
        </a>
      );
    }

    return (
      <button
        ref={tip?.ref}
        type="button"
        className={classes}
        aria-label={action.ariaLabel}
        aria-describedby={tip?.describedBy}
        title={tip ? undefined : action.description}
        aria-keyshortcuts={action.shortcut}
        aria-busy={action.pending ? "true" : undefined}
        tabIndex={tabIndex}
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
  };

  if (!action.iconOnly) {
    return control();
  }

  return (
    <Tooltip label={action.description ?? iconOnlyName} placement="top">
      {(tip) => control(tip)}
    </Tooltip>
  );
}
