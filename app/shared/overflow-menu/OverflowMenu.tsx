/**
 * DS-12 — the ONE shared overflow (⋯) menu.
 *
 * The conventional home for a record's secondary and destructive actions. Both the
 * DS-02 Record Header and the DS-04 Card render this component, so "Archive",
 * "Restore" and "Delete" sit in the same place, in the same order, with the same
 * wording, on every entity in the product (DESIGN_SYSTEM.md → Overflow menu,
 * ADR-053).
 *
 * It is a WAI-ARIA **menu button**, not a modal: a `button` with
 * `aria-haspopup="menu"` + `aria-expanded` controlling a `role="menu"` panel of
 * `role="menuitem"` children, with roving focus (exactly one tab stop), Arrow /
 * Home / End navigation, Escape-to-close with focus restored to the trigger, Tab
 * and outside-pointer dismissal. Because it is non-modal it deliberately does NOT
 * reuse the DS-03 focus-trap/inert/scroll-lock machinery — there is no second
 * focus trap and nothing behind it becomes inert (DESIGN_SYSTEM.md → Accessibility).
 *
 * It owns no product rule: it renders the plain {@link OverflowMenuItem} list it is
 * given and calls back. Confirmation, undo and persistence belong to the consumer
 * (the DS-10 Feedback platform and DS-10b `ConfirmationDialog`).
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { MoreIcon } from "~/shared/icons";

import type { OverflowMenuItem, OverflowMenuProps } from "./types";

/** Whether an item can be activated (a disabled or in-flight item cannot). */
function isActionable(item: OverflowMenuItem): boolean {
  return item.disabled !== true && item.pending !== true;
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
  // The focused item index while the menu is open. `-1` means "not yet placed".
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const generatedId = useId();
  const triggerId = `${generatedId}-trigger`;
  const menuId = `${generatedId}-menu`;

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    setActiveIndex(-1);
    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  }, []);

  const openAt = useCallback(
    (index: number) => {
      if (items.length === 0) {
        return;
      }
      setOpen(true);
      setActiveIndex(index === -1 ? items.length - 1 : index);
    },
    [items.length],
  );

  // Move DOM focus to follow `activeIndex` — roving focus, so the open menu holds
  // exactly one tab stop and a screen reader announces the focused item.
  useEffect(() => {
    if (!open || activeIndex < 0) {
      return;
    }
    itemRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  // Dismiss on an outside pointer press. Escape and Tab are handled on the panel
  // itself (focus is inside it whenever the menu is open).
  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        close(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open, close]);

  if (items.length === 0) {
    return null;
  }

  const step = (delta: number) => {
    setActiveIndex((current) => {
      const next = current + delta;
      if (next < 0) {
        return items.length - 1;
      }
      if (next >= items.length) {
        return 0;
      }
      return next;
    });
  };

  const onTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (
      event.key === "ArrowDown" ||
      event.key === "Enter" ||
      event.key === " "
    ) {
      event.preventDefault();
      openAt(0);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      openAt(-1);
    }
  };

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        step(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        step(-1);
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(items.length - 1);
        break;
      case "Escape":
        event.preventDefault();
        // Only this menu closes — Escape never reaches an enclosing Drawer while
        // the menu owns focus (DS-11 keyboard conventions: top layer only).
        event.stopPropagation();
        close(true);
        break;
      case "Tab":
        // Tab leaves the menu entirely; the browser moves focus naturally.
        close(false);
        break;
      default:
        break;
    }
  };

  const activate = (item: OverflowMenuItem, isLink: boolean) => {
    if (!isActionable(item)) {
      return;
    }
    // A link navigates on its own; a button runs its handler. Either way the menu
    // closes — but focus is only pulled back to the trigger for a button, since a
    // link is about to move the user somewhere else.
    item.onSelect?.();
    close(!isLink);
  };

  return (
    <div
      className="dh-overflow-menu"
      ref={containerRef}
      data-open={open ? "true" : "false"}
      data-testid={rest["data-testid"]}
    >
      <button
        type="button"
        id={triggerId}
        ref={triggerRef}
        className={["dh-overflow-menu__trigger", triggerClassName]
          .filter(Boolean)
          .join(" ")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        title={label}
        tabIndex={tabIndex}
        onKeyDown={onTriggerKeyDown}
        onClick={(event) => {
          event.stopPropagation();
          if (open) {
            close(false);
          } else {
            openAt(0);
          }
        }}
      >
        <span className="dh-overflow-menu__glyph" aria-hidden="true">
          <MoreIcon />
        </span>
      </button>

      {open ? (
        <div
          className="dh-overflow-menu__panel"
          id={menuId}
          role="menu"
          aria-labelledby={triggerId}
          data-align={align}
          // The WAI-ARIA menu-button pattern keeps focus on the `menuitem`
          // children (roving tabindex) and delegates their key events up here.
          // `-1` makes the container programmatically focusable without adding a
          // tab stop, which is both correct for the pattern and what
          // `jsx-a11y/interactive-supports-focus` asks of a `menu` role.
          tabIndex={-1}
          onKeyDown={onMenuKeyDown}
        >
          {items.map((item, index) => {
            const accessibleName = item.ariaLabel ?? item.label;
            const tone = item.tone ?? "default";
            const inactive = !isActionable(item);
            const descriptionId = item.description
              ? `${generatedId}-desc-${item.id}`
              : undefined;
            const content = (
              <>
                {item.icon ? (
                  <span className="dh-overflow-menu__icon" aria-hidden="true">
                    {item.icon}
                  </span>
                ) : null}
                <span className="dh-overflow-menu__labels">
                  <span className="dh-overflow-menu__label">{item.label}</span>
                  {item.description ? (
                    <span
                      className="dh-overflow-menu__description"
                      id={descriptionId}
                    >
                      {item.description}
                    </span>
                  ) : null}
                </span>
              </>
            );
            const shared = {
              role: "menuitem" as const,
              className: "dh-overflow-menu__item",
              "data-tone": tone,
              "data-separator": item.separatorBefore ? "true" : undefined,
              "data-action-id": item.id,
              tabIndex: activeIndex === index ? 0 : -1,
              // A supporting description lives INSIDE the item (so it is visible
              // and read in context) but must not become part of the accessible
              // NAME — the label alone names the action, and the description is
              // referenced separately.
              "aria-label":
                item.ariaLabel ??
                (item.description !== undefined ? item.label : undefined),
              "aria-describedby": descriptionId,
              ref: (node: HTMLElement | null) => {
                itemRefs.current[index] = node;
              },
              onMouseEnter: () => setActiveIndex(index),
            };

            if (item.href !== undefined && isActionable(item)) {
              return (
                <a
                  {...shared}
                  key={item.id}
                  href={item.href}
                  onClick={(event) => {
                    event.stopPropagation();
                    activate(item, true);
                  }}
                >
                  {content}
                </a>
              );
            }

            return (
              <button
                {...shared}
                key={item.id}
                type="button"
                aria-disabled={inactive ? true : undefined}
                aria-busy={item.pending ? true : undefined}
                title={accessibleName}
                onClick={(event) => {
                  event.stopPropagation();
                  activate(item, false);
                }}
              >
                {content}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
