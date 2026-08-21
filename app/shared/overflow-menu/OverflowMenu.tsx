/**
 * DS-12 — the ONE shared overflow (⋯) menu.
 *
 * The conventional home for a record's secondary and destructive actions. The
 * DS-02 Record Header and the DS-04 Card both render this component, so
 * "Archive", "Restore" and "Delete" sit in the same place, in the same order,
 * with the same wording, on every entity in the product (DESIGN_SYSTEM.md →
 * Overflow menu, ADR-053).
 *
 * ── DHDS-09 — this is now a TRIGGER, and the panel is the shared Menu ───────
 * Everything below the trigger used to live here: a roving-focus loop, an
 * Escape/Tab contract, a private placement solver (`menu-placement.ts`), an
 * outside-press listener and a phone-sheet swap. `InlineSelectField` and
 * `CollectionControlsPopover` each had their own copy of the same four things,
 * and the copies had already drifted — only one of the three placed its panel
 * with the shared geometry, and the other two disagreed with each other about
 * typeahead.
 *
 * All of it now belongs to `~/shared/floating` → {@link Menu}: one WAI-ARIA
 * menu-button implementation, one placement solver (`~/shared/anchored`), one
 * dismissal contract and one desktop→phone transformation. What is left here is
 * the part that is genuinely this component's: the `…` button, its tooltip, its
 * accessible name, and the item model every consumer already passes.
 *
 * The behaviour is unchanged in every respect a consumer or a test can observe
 * — `aria-haspopup`, `aria-expanded`, `role="menu"`, `role="menuitem"`, roving
 * focus, Escape-with-focus-return, the close-before-handler ordering that keeps
 * a dialog's opener alive, and the phone sheet — with two deliberate
 * improvements that fall out of the shared layer: the panel is portalled into
 * the overlay layer, so a card or a row that clips its own overflow can no
 * longer clip the menu, and disabled items are skipped by the arrow keys
 * instead of being landed on.
 *
 * M3-TIP — the ⋯ trigger is icon-only and is the same control on an EntityCard,
 * a record header and a task row, so it is one of the highest-value adopters of
 * the shared tooltip. It keeps its own `aria-label`, so the tooltip supplements
 * the name rather than being it.
 *
 * ── MOBILE-01 — the phone presentation is a SHEET ──────────────────────────
 * Measured at 390px on a Tasks row, the anchored panel was a 208px box floating
 * in the middle of the list with three of its six actions wrapped onto two and
 * three lines each. `Menu` renders the same items in the shared bottom sheet
 * below `md`; only the outer promise moves, which is why `aria-haspopup`
 * follows the presentation — a trigger that promises a menu while opening a
 * dialog is describing something the user is not getting.
 */

import { useCallback, useId, useRef, useState } from "react";

import { Menu } from "~/shared/floating";
import type { FloatingMenuOption } from "~/shared/floating";
import { MoreIcon } from "~/shared/icons";
import { Tooltip, composeRefs } from "~/shared/tooltip";
import { useCompactViewport } from "~/shared/viewport";

import type { OverflowMenuItem, OverflowMenuProps } from "./types";

/**
 * The DS-12 item model, in the shared floating vocabulary.
 *
 * A translation rather than a rename: `icon` is the shared option's leading
 * MARK and `description` is its SUPPORT line, and both were already used that
 * way. Keeping the DS-12 names on the public contract means no consumer moves
 * for an internal convergence.
 */
function toOption(item: OverflowMenuItem): FloatingMenuOption {
  return {
    id: item.id,
    label: item.label,
    ...(item.ariaLabel === undefined ? {} : { ariaLabel: item.ariaLabel }),
    ...(item.icon === undefined ? {} : { mark: item.icon }),
    ...(item.description === undefined
      ? {}
      : { support: item.description as string }),
    ...(item.shortcut === undefined ? {} : { shortcut: item.shortcut }),
    ...(item.href === undefined ? {} : { href: item.href }),
    ...(item.onSelect === undefined ? {} : { onSelect: item.onSelect }),
    ...(item.disabled === undefined ? {} : { disabled: item.disabled }),
    ...(item.pending === undefined ? {} : { pending: item.pending }),
    ...(item.tone === undefined ? {} : { tone: item.tone }),
    ...(item.separatorBefore === undefined
      ? {}
      : { separatorBefore: item.separatorBefore }),
  };
}

export function OverflowMenu({
  items,
  label,
  align = "end",
  triggerClassName,
  tabIndex,
  ...rest
}: OverflowMenuProps) {
  const [open, setOpen] = useState(false);
  /**
   * Which INITIAL item the menu opens on. `0` for a click or ArrowDown, `-1`
   * for ArrowUp, which the shared menu reads as "the last one" — the WAI-ARIA
   * menu-button pattern's own opening moves.
   */
  const [openAt, setOpenAt] = useState(0);
  /**
   * MOBILE-01 — which presentation this menu takes. `false` on the server and
   * in the first client frame, which costs nothing here: the panel exists only
   * after a user gesture, by which time the media query has resolved.
   */
  const compact = useCompactViewport();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const generatedId = useId();
  const triggerId = `${generatedId}-trigger`;
  const menuId = `${generatedId}-menu`;

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  const onTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (items.length === 0) return;
    if (
      event.key === "ArrowDown" ||
      event.key === "Enter" ||
      event.key === " "
    ) {
      event.preventDefault();
      setOpenAt(0);
      setOpen(true);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpenAt(-1);
      setOpen(true);
    }
  };

  if (items.length === 0) {
    return null;
  }

  return (
    <div
      className="dh-overflow-menu"
      data-open={open ? "true" : "false"}
      data-testid={rest["data-testid"]}
    >
      {/* No tooltip while the menu is open: the panel it just opened says far
          more than the trigger's own label, and a tooltip floating over it is
          noise. */}
      <Tooltip label={label} placement="top" disabled={open}>
        {(tip) => (
          <button
            type="button"
            id={triggerId}
            ref={composeRefs(triggerRef, tip.ref)}
            className={["dh-overflow-menu__trigger", triggerClassName]
              .filter(Boolean)
              .join(" ")}
            /*
             * MOBILE-01 — the popup TYPE follows the presentation. The
             * `role="menu"` inside is unchanged either way; only the outer
             * promise moves.
             */
            aria-haspopup={compact ? "dialog" : "menu"}
            aria-expanded={open}
            aria-controls={open ? menuId : undefined}
            aria-label={label}
            aria-describedby={tip.describedBy}
            tabIndex={tabIndex}
            onKeyDown={onTriggerKeyDown}
            onClick={(event) => {
              event.stopPropagation();
              if (open) {
                close(false);
              } else {
                setOpenAt(0);
                setOpen(true);
              }
            }}
          >
            <span className="dh-overflow-menu__glyph" aria-hidden="true">
              <MoreIcon />
            </span>
          </button>
        )}
      </Tooltip>

      {open ? (
        <Menu
          anchorRef={triggerRef}
          label={label}
          items={items.map(toOption)}
          onClose={close}
          initialIndex={openAt}
          align={align}
          id={menuId}
          className="dh-overflow-menu__panel"
        />
      ) : null}
    </div>
  );
}
