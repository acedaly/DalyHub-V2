/**
 * DS-04 (TODAY-06) — the swipe action tray.
 *
 * The row of large, thumb-reachable action buttons revealed behind a Card when it
 * is swiped on a touch-first device. Each button drives the SAME `CardAction`
 * (`onSelect`/`href`) the visible quick actions use — one identity, one execution
 * path (ADR-024 §24.14). The tray is a visual ACCELERATOR: it is `aria-hidden` and
 * its buttons are out of the tab order, because every action it shows is also
 * present as an ordinary, keyboard-accessible control on the card. Meaning is
 * carried by icon + label (never colour alone); disabled/pending actions cannot
 * fire. After an action runs, the tray closes.
 */

import type { MouseEvent } from "react";

import type { CardAction } from "./types";

export function CardSwipeTray({
  actions,
  onActionFired,
  trayRef,
}: {
  readonly actions: readonly CardAction[];
  /** Close the tray once an action has been activated. */
  readonly onActionFired: () => void;
  readonly trayRef: React.RefObject<HTMLDivElement | null>;
}) {
  const stop = (event: MouseEvent) => event.stopPropagation();

  return (
    // Purely visual duplicate of the accessible quick actions → hidden from AT.
    <div className="dh-card__swipe-tray" ref={trayRef} aria-hidden="true">
      {actions.map((action) => {
        const inactive = Boolean(action.disabled) || Boolean(action.pending);
        const content = (
          <>
            {action.icon ? (
              <span className="dh-card__swipe-action-icon">{action.icon}</span>
            ) : null}
            <span className="dh-card__swipe-action-label">{action.label}</span>
          </>
        );
        if (action.href !== undefined && !inactive) {
          return (
            <a
              key={action.id}
              className="dh-card__swipe-action"
              href={action.href}
              tabIndex={-1}
              onClick={(event) => {
                stop(event);
                onActionFired();
              }}
            >
              {content}
            </a>
          );
        }
        return (
          <button
            key={action.id}
            type="button"
            className="dh-card__swipe-action"
            tabIndex={-1}
            disabled={inactive}
            onClick={(event) => {
              stop(event);
              if (inactive) {
                return;
              }
              action.onSelect?.();
              onActionFired();
            }}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
