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
 *
 * M3-TIP — the ⋯ trigger is icon-only, and it is the same control on an
 * EntityCard, a record header and a task row, so it is one of the highest-value
 * adopters of the shared tooltip. It carried `title={label}` before, which meant
 * the trigger explained itself to a mouse and to nothing else; the shared
 * tooltip shows the same words on `:focus-visible` too. The trigger keeps its
 * own `aria-label`, so the tooltip supplements the name rather than being it.
 *
 * ── MOBILE-01 (iPhone daily driver) — the phone presentation is a SHEET ──────
 * The anchored panel is the right object on a pointer device and the wrong one
 * on a phone. Measured on this pass at 390px, on the surface that opens it most
 * (a Tasks row): a 208px-wide box floating in the middle of the list, holding
 * six actions of which three wrapped onto two and three lines each — "Move to
 * Project or Area… / Search the whole workspace." rendered 75px tall — with the
 * page still scrolling behind it and each item's tappable width barely half the
 * screen. That is precisely the "tiny popover floating inside a 320–430px
 * layout" the design system rules out, and DalyHub already owns the answer: the
 * shared {@link Sheet}.
 *
 * Below `md` the SAME items, in the same order, with the same ids, roles and
 * keyboard behaviour, are rendered inside that sheet instead. Deliberately the
 * same DOM contract, not a second one:
 *
 *   - the panel keeps `role="menu"` and its children keep `role="menuitem"`, so
 *     the WAI-ARIA menu-button pattern, the roving tabindex and every consumer's
 *     accessible name are unchanged — a menu inside a dialog is valid, and it is
 *     what lets one implementation serve both presentations;
 *   - the sheet contributes what a phone overlay needs and a non-modal popover
 *     cannot have: a scrim, a body that scrolls independently, an obvious
 *     44px Close, safe-area and keyboard insets, and focus restored to the ⋯
 *     trigger on dismissal — all from the DS-03 hooks the sheet already uses, so
 *     there is still exactly one focus trap in DalyHub.
 *
 * The two behaviours that belong to the ANCHORED presentation — the measured
 * flip/clamp placement and outside-pointer dismissal — are switched off in sheet
 * mode. Leaving the second one on would have been a real defect rather than dead
 * code: the sheet is portalled to `<body>`, so every tap inside it registers as
 * "outside the trigger's container" and would close the sheet before the item
 * could run.
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { MoreIcon } from "~/shared/icons";
import { Sheet } from "~/shared/sheet";
import { Tooltip, composeRefs } from "~/shared/tooltip";
import { useCompactViewport } from "~/shared/viewport";

import {
  clampMenuInline,
  placeMenu,
  type MenuPlacement,
} from "./menu-placement";
import type { OverflowMenuItem, OverflowMenuProps } from "./types";

/**
 * The gap between the trigger and the panel. Mirrors the `--app-space-1`
 * offset the panel's CSS anchoring uses, so the measurement and the paint
 * agree about where the panel starts.
 */
const MENU_OFFSET_PX = 4;

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
  /**
   * MOBILE-01 — which presentation this menu takes. `false` on the server and in
   * the first client frame, which costs nothing here: the panel exists only
   * after a user gesture, by which time the media query has resolved.
   */
  const compact = useCompactViewport();
  // The focused item index while the menu is open. `-1` means "not yet placed".
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  /**
   * UIQ-021 — where the panel actually fits. `null` until measured; the panel
   * paints below-and-unclamped in that first frame, which is what it always
   * did, and `useLayoutEffect` corrects it before the browser paints.
   */
  const [placement, setPlacement] = useState<MenuPlacement | null>(null);
  const [inlineShift, setInlineShift] = useState(0);
  const generatedId = useId();
  const triggerId = `${generatedId}-trigger`;
  const menuId = `${generatedId}-menu`;

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    setActiveIndex(-1);
    setPlacement(null);
    setInlineShift(0);
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

  /*
   * UIQ-021 — place the panel within the viewport.
   *
   * The same philosophy the shared Tooltip already uses, applied to a surface
   * that has real height: measure the trigger's viewport rect, prefer the
   * normal below placement, flip above when that fits better, and clamp the
   * height (leaving the panel to scroll internally) when neither side can hold
   * the whole menu. The DECISION is the pure `placeMenu`; this effect does the
   * measuring and nothing else.
   *
   * `useLayoutEffect` so the correction lands before paint — a menu must never
   * be seen jumping from the wrong side to the right one. Re-measured on scroll
   * and resize, exactly like the tooltip, because either can invalidate the
   * trigger's rect while the menu is open (the menu is deliberately non-modal,
   * so the page behind it still scrolls).
   */
  useLayoutEffect(() => {
    // In sheet mode the surface is full-width and bottom-anchored, so there is
    // nothing to place: it is not anchored to the trigger at all.
    if (!open || !panel || compact) {
      return;
    }
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }
    const place = () => {
      const anchor = trigger.getBoundingClientRect();
      const next = placeMenu({
        triggerTop: anchor.top,
        triggerBottom: anchor.bottom,
        // `scrollHeight` is the panel's NATURAL height — unaffected by a clamp
        // this effect applied on a previous pass, so re-measuring can never
        // ratchet the menu smaller on every scroll event.
        menuHeight: panel.scrollHeight,
        viewportHeight: document.documentElement.clientHeight,
        offset: MENU_OFFSET_PX,
      });
      setPlacement((current) =>
        current &&
        current.side === next.side &&
        current.maxHeight === next.maxHeight
          ? current
          : next,
      );

      // The inline clamp is measured with any previous shift removed, so the
      // correction is computed against the panel's natural position rather
      // than compounding with itself.
      const box = panel.getBoundingClientRect();
      setInlineShift((currentShift) => {
        const shift = clampMenuInline({
          panelLeft: box.left - currentShift,
          panelRight: box.right - currentShift,
          viewportWidth: document.documentElement.clientWidth,
        });
        return Math.abs(shift - currentShift) < 0.5 ? currentShift : shift;
      });
    };

    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, panel, items, compact]);

  // Dismiss on an outside pointer press. Escape and Tab are handled on the panel
  // itself (focus is inside it whenever the menu is open).
  //
  // NEVER in sheet mode: the sheet is portalled to `<body>`, so a tap on one of
  // its own items is "outside" this container and would dismiss the surface
  // before the action ran. The sheet brings its own scrim, Escape handler and
  // Close control, which is the whole dismissal contract a modal needs.
  useEffect(() => {
    if (!open || compact) {
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
  }, [open, close, compact]);

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
    // Close FIRST, then run the handler. The order is load-bearing: closing
    // focuses the persistent trigger, so a handler that opens a dialog (every
    // lifecycle action does) sees a LIVE `document.activeElement` to return focus
    // to. Running the handler first would hand the dialog the menu item that is
    // about to unmount, and closing it would drop the keyboard user at the top of
    // the page instead of back on the ⋯ button they started from (AGENTS.md §15 —
    // no lost focus).
    //
    // A link is exempt: it is about to navigate, so pulling focus back would
    // fight the navigation.
    close(!isLink);
    item.onSelect?.();
  };

  /*
   * The menu surface itself, built ONCE and then either anchored to the trigger
   * or placed inside the phone sheet. One definition, because two would be two
   * item lists to keep in step — and the keyboard contract, the roving tabindex
   * and every `data-action-id` a consumer or a test depends on live in it.
   *
   * `null` while closed rather than built-and-discarded: a Tasks list renders
   * eighty of these, and constructing eighty item trees on every list render to
   * throw them all away is exactly the kind of work the interaction budget is
   * spent on.
   */
  const menuPanel = !open ? null : (
    <div
      className="dh-overflow-menu__panel"
      data-presentation={compact ? "sheet" : "anchored"}
      id={menuId}
      ref={setPanel}
      role="menu"
      aria-labelledby={triggerId}
      data-align={align}
      // UIQ-021 — which side the panel took, and (when clamped) how tall it
      // may be. Both are presentation only: flipping or clamping changes no
      // keyboard semantics, no item order and no focus behaviour, so a menu
      // that opens upward is navigated exactly like one that opens down.
      data-side={compact ? "sheet" : (placement?.side ?? "below")}
      style={
        compact
          ? undefined
          : {
              ...(placement?.maxHeight !== null &&
              placement?.maxHeight !== undefined
                ? { maxHeight: `${placement.maxHeight}px` }
                : {}),
              ...(inlineShift !== 0 ? { translate: `${inlineShift}px` } : {}),
            }
      }
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
  );

  return (
    <div
      className="dh-overflow-menu"
      ref={containerRef}
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
             * MOBILE-01 — the popup TYPE follows the presentation.
             *
             * On a phone the surface really is a modal dialog, and a trigger
             * that promises a menu while opening a dialog is describing
             * something the user is not getting. The `role="menu"` inside it is
             * unchanged either way; only the outer promise moves.
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
                openAt(0);
              }
            }}
          >
            <span className="dh-overflow-menu__glyph" aria-hidden="true">
              <MoreIcon />
            </span>
          </button>
        )}
      </Tooltip>

      {open && compact ? (
        <Sheet
          title={label}
          opener={triggerRef.current}
          onClose={() => close(true)}
          className="dh-overflow-menu-sheet"
          data-testid={
            rest["data-testid"] ? `${rest["data-testid"]}-sheet` : undefined
          }
        >
          {menuPanel}
        </Sheet>
      ) : null}

      {open && !compact ? menuPanel : null}
    </div>
  );
}
