/**
 * DHDS-09 — the ONE menu.
 *
 * **A menu chooses a COMMAND.** That is the whole of its product role: More /
 * overflow actions, row commands, duplicate, move, archive, delete, secondary
 * operations, and the closed vocabularies that behave like commands (a status,
 * a priority, a sort key). It is not a mini settings panel, it is not where a
 * short contextual VALUE is chosen from a searchable set (that is `Picker`), and
 * it is not a container for a form (that is `Popover`).
 *
 * ── What this replaces ──────────────────────────────────────────────────────
 * DHDS-09 found the same WAI-ARIA menu-button implementation written three
 * times — `OverflowMenu`, `InlineSelectField` and `CollectionControlsPopover` —
 * each with its own roving-focus loop, its own Escape/Tab handling, its own
 * phone-sheet swap and, in two of the three, its own typeahead. They had already
 * drifted: one searched typeahead from the top of the list on every keystroke,
 * one skipped disabled items and one did not, and only one of them placed the
 * panel with the shared solver. Three copies of a keyboard contract is three
 * chances to get a keyboard contract wrong.
 *
 * ── The contract ────────────────────────────────────────────────────────────
 * A `role="menu"` panel of `role="menuitem"` children — or `menuitemradio` when
 * the caller passes a `value`, because a menu that chooses among mutually
 * exclusive values must announce which one is current.
 *
 *   - roving focus: exactly one tab stop, and DOM focus really moves, so the
 *     browser's own focus ring is the cursor;
 *   - Arrow Up/Down wrap, Home/End jump;
 *   - printable characters search (`menu-typeahead.ts`);
 *   - Escape closes and restores focus to the trigger, and stops there — it
 *     never reaches an enclosing Drawer while the menu owns focus;
 *   - Tab leaves the menu and lets focus continue naturally;
 *   - an outside pointer press dismisses, with the TRIGGER counted as inside
 *     (`AnchoredSurface` owns that);
 *   - choosing a command closes FIRST and runs the handler second, so a handler
 *     that opens a dialog sees a live `document.activeElement` to return focus
 *     to.
 *
 * It is deliberately NON-MODAL: nothing behind it becomes inert and there is no
 * second focus trap in the product.
 *
 * ── Desktop → phone ─────────────────────────────────────────────────────────
 * Below `md` the SAME items — same order, same ids, same roles, same keyboard
 * behaviour — are rendered inside the shared bottom {@link Sheet}. A 34px item
 * anchored to a 28px trigger is a desktop idea, and a phone has no hover to
 * reveal it with. Only the container changes; the domain action underneath is
 * the same one.
 *
 * ── Controlled, and why ─────────────────────────────────────────────────────
 * This is the PANEL, not the trigger. Triggers in DalyHub are wildly different
 * objects — an icon-only `…`, a task row's priority flag, a collection header
 * button, a value that looks like plain metadata until you point at it — and a
 * component that owned the trigger too would have to grow a prop for each of
 * them. The host renders its own trigger, holds `open`, and hands over a ref.
 */

import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { KeyboardEvent, ReactNode, RefObject } from "react";

import { AnchoredSurface } from "~/shared/anchored";
import { Sheet } from "~/shared/sheet";
import { useCompactViewport } from "~/shared/viewport";

import { OptionContent } from "./OptionContent";
import {
  TYPEAHEAD_RESET_MS,
  isTypeaheadKey,
  matchTypeahead,
} from "./menu-typeahead";
import type {
  FloatingAlign,
  FloatingMenuOption,
  FloatingPresentation,
} from "./types";

export interface MenuProps {
  /**
   * The control the menu belongs to. Everything is measured from it, a pointer
   * press on it counts as inside, and focus returns to it on dismissal.
   */
  readonly anchorRef: RefObject<HTMLElement | null>;
  /** The menu's accessible name, and the phone sheet's heading. */
  readonly label: string;
  readonly items: readonly FloatingMenuOption[];
  /**
   * Close the menu. `restoreFocus` is false when the user is already on their
   * way somewhere else (an outside press, Tab, a link) and true when they are
   * not (Escape, a command that ran).
   */
  readonly onClose: (restoreFocus: boolean) => void;
  /**
   * The currently chosen option's id, for a menu that picks among mutually
   * exclusive VALUES. Its presence is what makes the items `menuitemradio` and
   * gives them a check column; a menu of commands passes nothing.
   */
  readonly value?: string | null;
  /** Which item receives focus when the menu opens. Defaults to the first. */
  readonly initialIndex?: number;
  readonly align?: FloatingAlign;
  /** Grow the panel to at least the trigger's width — right for a field. */
  readonly matchAnchorWidth?: boolean;
  readonly presentation?: FloatingPresentation;
  /** The panel's element id, for the trigger's `aria-controls`. */
  readonly id?: string;
  /**
   * Replace an option's rendered body — a priority flag with its label, an
   * entity's accent tile with its name. The DOM contract, the roles and the
   * keyboard behaviour are unaffected; this is the row's inside only.
   */
  readonly renderOption?: (item: FloatingMenuOption) => ReactNode;
  readonly className?: string;
  readonly "data-testid"?: string;
}

/** Whether an item can be activated (a disabled or in-flight one cannot). */
function isActionable(item: FloatingMenuOption): boolean {
  return item.disabled !== true && item.pending !== true;
}

export function Menu({
  anchorRef,
  label,
  items,
  onClose,
  value,
  initialIndex = 0,
  align = "start",
  matchAnchorWidth = false,
  presentation = "auto",
  id,
  renderOption,
  className,
  ...rest
}: MenuProps) {
  const compact = useCompactViewport() && presentation === "auto";
  const generatedId = useId();
  const menuId = id ?? `${generatedId}-menu`;
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const typeahead = useRef({ buffer: "", at: 0 });
  const isRadio = value !== undefined;

  /*
   * Where focus sits. `-1` means "the menu has just opened and has not placed
   * focus yet"; the effect below resolves it to the first ACTIONABLE item near
   * the requested index, so a menu whose first command is disabled does not
   * open onto a dead row.
   */
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    if (activeIndex >= 0) return;
    const preferred =
      // A radio menu opens on the CURRENT value when it has one: that is where
      // the reader's attention already is, and Arrow from there means "the one
      // next to what I have" rather than "the one next to the top of the list".
      isRadio && value !== null
        ? items.findIndex((item) => item.id === value)
        : -1;
    const from = preferred >= 0 ? preferred : initialIndex;
    const start = from === -1 ? items.length - 1 : from;
    for (let step = 0; step < items.length; step += 1) {
      const index = (start + step + items.length) % items.length;
      if (isActionable(items[index]!)) {
        setActiveIndex(index);
        return;
      }
    }
  }, [activeIndex, initialIndex, isRadio, items, value]);

  // Move DOM focus to follow `activeIndex` — roving focus, so the open menu
  // holds exactly one tab stop and a screen reader announces the focused item.
  useEffect(() => {
    if (activeIndex < 0) return;
    itemRefs.current[activeIndex]?.focus();
  }, [activeIndex]);

  const step = useCallback(
    (delta: number) => {
      setActiveIndex((current) => {
        // Walk over disabled rows rather than landing on them: an item that
        // cannot be chosen is not a destination.
        for (let hop = 1; hop <= items.length; hop += 1) {
          const next =
            (current + delta * hop + items.length * hop) % items.length;
          if (isActionable(items[next]!)) return next;
        }
        return current;
      });
    },
    [items],
  );

  const jump = useCallback(
    (from: number, direction: 1 | -1) => {
      for (let step_ = 0; step_ < items.length; step_ += 1) {
        const index = from + direction * step_;
        if (index < 0 || index >= items.length) break;
        if (isActionable(items[index]!)) {
          setActiveIndex(index);
          return;
        }
      }
    },
    [items],
  );

  const activate = useCallback(
    (item: FloatingMenuOption, isLink: boolean) => {
      if (!isActionable(item)) return;
      /*
       * Close FIRST, then run the handler. The order is load-bearing: closing
       * focuses the persistent trigger, so a handler that opens a dialog (every
       * lifecycle action does) sees a LIVE `document.activeElement` to return
       * focus to. Running the handler first would hand the dialog the menu item
       * that is about to unmount, and closing that dialog would drop the
       * keyboard user at the top of the page.
       *
       * A link is exempt: it is about to navigate, so pulling focus back would
       * fight the navigation.
       */
      if (item.keepOpen !== true) onClose(!isLink);
      item.onSelect?.();
    },
    [onClose],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        step(1);
        return;
      case "ArrowUp":
        event.preventDefault();
        step(-1);
        return;
      case "Home":
        event.preventDefault();
        jump(0, 1);
        return;
      case "End":
        event.preventDefault();
        jump(items.length - 1, -1);
        return;
      case "Escape":
        event.preventDefault();
        // Only this menu closes — Escape never reaches an enclosing Drawer or
        // Sheet while the menu owns focus (DHDS-09 §34: the topmost meaningful
        // layer first).
        event.stopPropagation();
        onClose(true);
        return;
      case "Tab":
        // Tab leaves the menu entirely; the browser moves focus naturally.
        onClose(false);
        return;
      default:
        break;
    }

    if (!isTypeaheadKey(event)) return;
    const now = Date.now();
    const buffer =
      now - typeahead.current.at > TYPEAHEAD_RESET_MS
        ? event.key.toLocaleLowerCase()
        : typeahead.current.buffer + event.key.toLocaleLowerCase();
    typeahead.current = { buffer, at: now };
    const match = matchTypeahead(
      items.map((item) => ({
        label: item.label,
        disabled: !isActionable(item),
      })),
      buffer,
      activeIndex,
    );
    if (match >= 0) {
      event.preventDefault();
      setActiveIndex(match);
    }
  };

  /*
   * The panel's own attributes, applied to whichever element IS the panel.
   *
   * In the anchored presentation that element is the `AnchoredSurface` itself
   * rather than a child of it, and the difference is a real defect rather than a
   * preference: `.dh-anchored` clamps and scrolls (`overflow-y: auto`, which
   * computes `overflow-x` to `auto` alongside it), so a bordered, shadowed box
   * INSIDE it would have its shadow clipped by its own wrapper and its bottom
   * border scrolled away with the last item. The surface and the box that
   * scrolls have to be the same box.
   *
   * The ROWS are built once either way, because two lists would be two lists to
   * keep in step — and the roving tabindex, every `data-option-id` a test
   * depends on, and the keyboard contract all live in them.
   */
  const panelProps = {
    className: ["dh-floating", "dh-menu", className].filter(Boolean).join(" "),
    id: menuId,
    role: "menu" as const,
    "aria-label": label,
    "data-presentation": compact ? ("sheet" as const) : ("anchored" as const),
    // The WAI-ARIA menu-button pattern keeps focus on the item children (roving
    // tabindex) and delegates their key events up here. `-1` makes the container
    // programmatically focusable without adding a tab stop.
    tabIndex: -1,
    onKeyDown,
    "data-testid": rest["data-testid"],
  };

  const rows = (
    <>
      {items.map((item, index) => {
        const inactive = !isActionable(item);
        // A command inside a radio menu keeps `menuitem`; see `isCommand`.
        const radio = isRadio && item.isCommand !== true;
        const selected = radio && item.id === value;
        const supportId = item.support
          ? `${generatedId}-support-${item.id}`
          : undefined;
        const body = renderOption ? (
          renderOption(item)
        ) : (
          <OptionContent
            mark={item.mark}
            label={item.label}
            support={item.support}
            supportId={supportId}
            shortcut={item.shortcut}
            selected={selected}
            showCheck={isRadio}
          />
        );
        const shared = {
          className: "dh-option",
          role: (radio ? "menuitemradio" : "menuitem") as
            "menuitemradio" | "menuitem",
          "data-tone": item.tone ?? "default",
          "data-option-id": item.id,
          tabIndex: activeIndex === index ? 0 : -1,
          // A supporting line lives INSIDE the row (so it is visible and read in
          // context) but must not become part of the accessible NAME — the label
          // alone names the choice.
          "aria-label":
            item.ariaLabel ??
            (item.support !== undefined ? item.label : undefined),
          "aria-describedby": supportId,
          ref: (node: HTMLElement | null) => {
            itemRefs.current[index] = node;
          },
          // Pointing at a row makes it the active one, so the keyboard cursor
          // and the pointer never disagree about where "next" starts from.
          onMouseEnter: () => {
            if (!inactive) setActiveIndex(index);
          },
        };

        const separator = item.separatorBefore ? (
          <div
            key={`${item.id}-separator`}
            className="dh-floating__separator"
            role="separator"
          />
        ) : null;

        /*
         * A Fragment, not a wrapper element. `role="menu"` requires its
         * children to be menu items, groups or separators — a `div` between
         * them is an `aria-required-children` violation, and the separator is
         * therefore rendered as a real sibling `role="separator"` rather than
         * as a border on a wrapper nobody can name.
         */
        if (item.href !== undefined && !inactive) {
          return (
            <Fragment key={item.id}>
              {separator}
              <a
                {...shared}
                href={item.href}
                onClick={(event) => {
                  event.stopPropagation();
                  activate(item, true);
                }}
              >
                {body}
              </a>
            </Fragment>
          );
        }

        return (
          <Fragment key={item.id}>
            {separator}
            {/*
              `aria-checked` on a `menuitemradio` is the WAI-ARIA menu pattern,
              and it is exactly how the current value is announced. The rule
              cannot see that: the role is COMPUTED (a command inside a radio
              menu stays a plain `menuitem`) and arrives through the shared prop
              object, so the linter only sees a bare `<button>`.
            */}
            {/* eslint-disable-next-line jsx-a11y/role-supports-aria-props */}
            <button
              {...shared}
              type="button"
              aria-checked={radio ? selected : undefined}
              aria-disabled={inactive ? true : undefined}
              aria-busy={item.pending ? true : undefined}
              onClick={(event) => {
                event.stopPropagation();
                activate(item, false);
              }}
            >
              {body}
            </button>
          </Fragment>
        );
      })}
    </>
  );

  if (items.length === 0) return null;

  if (compact) {
    return (
      <Sheet
        title={label}
        opener={anchorRef.current}
        onClose={() => onClose(true)}
        className="dh-menu-sheet"
        data-testid={
          rest["data-testid"] ? `${rest["data-testid"]}-sheet` : undefined
        }
      >
        <div {...panelProps}>{rows}</div>
      </Sheet>
    );
  }

  return (
    <AnchoredSurface
      {...panelProps}
      anchorRef={anchorRef}
      align={align}
      matchAnchorWidth={matchAnchorWidth}
      // An outside press means the user is already on their way elsewhere, so
      // focus is NOT pulled back to the trigger.
      onDismiss={() => onClose(false)}
    >
      {rows}
    </AnchoredSurface>
  );
}
