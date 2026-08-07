/**
 * M3-TIP — the ONE tooltip primitive.
 *
 * The August 2026 M3 interaction audit (finding 2) found 91 controls whose only
 * explanation was the browser's `title` attribute. `title` is not a tooltip: it
 * never appears on keyboard focus, it is unreliable on touch, and its delay,
 * position and styling belong to the browser. For an icon-only control the
 * tooltip is where the SHORTCUT lives — "Bold ⌘B" — so the keyboard user, the
 * exact person who wants the shortcut, was the one who could not see it.
 *
 * This is Material Design 3's *plain* tooltip: one short line of supporting text
 * (plus the shortcut, when the control has one), shown on pointer hover AND on
 * `:focus-visible`, dismissed on Escape, associated with its trigger through
 * `aria-describedby`.
 *
 * ── What it deliberately is not ──────────────────────────────────────────────
 * It is not a naming mechanism. Every adopter already carries its own accessible
 * NAME (`aria-label` or visually-hidden text) and keeps it: a tooltip that is
 * also the name disappears for anyone whose assistive technology does not
 * announce descriptions. It is not the `HoverCard` (`~/shared/linked-items`)
 * either — that is a rich, asynchronously loaded SUMMARY of a linked record.
 * This one is text the product already knows, shown instantly.
 *
 * ── How it attaches ──────────────────────────────────────────────────────────
 * Through a render prop rather than by wrapping the trigger in an element:
 *
 *     <Tooltip label="Bold" shortcut="Mod-b">
 *       {(tip) => <button ref={tip.ref} aria-describedby={tip.describedBy} … />}
 *     </Tooltip>
 *
 * There is no wrapper node, so adopting the tooltip changes no layout anywhere —
 * a flex toolbar keeps its own children, and a `position: fixed` trigger (the
 * capture FAB) is still measured where it actually renders. Listeners are
 * attached to the trigger natively, so they can never clobber the click,
 * keyboard or focus handlers the trigger already has. Use {@link composeRefs}
 * when the trigger already needs a ref of its own.
 *
 * ── Behaviour contract ───────────────────────────────────────────────────────
 *   - `role="tooltip"`, referenced by `aria-describedby` only while shown;
 *   - opens on pointer hover (mouse/pen — never a touch tap, which has no hover
 *     state and would fight the tap) and on `:focus-visible`;
 *   - closes on pointer leave, blur, pointer press and Escape;
 *   - never focusable: no `tabindex`, so it adds no Tab stop and cannot trap
 *     focus. It is `pointer-events: none`, so it can never intercept a click
 *     meant for the control underneath it;
 *   - rendered in a portal on `<body>`, positioned `fixed` from the trigger's
 *     measured rect and CLAMPED to the viewport, so a control at the edge of the
 *     window (or inside the horizontally scrolling editor toolbar) still gets a
 *     readable tooltip and the document never scrolls sideways because of one;
 *   - Escape stops propagating only when the trigger itself holds focus, so a
 *     stale hover tooltip can never swallow the Escape that closes a Drawer
 *     (the same "top layer only" rule `OverflowMenu` follows).
 *
 * A DISABLED trigger still gets its tooltip wherever the browser dispatches
 * hover to it, and that is deliberate: "what is this greyed-out button?" is one
 * of the questions a tooltip exists to answer, and it is what `title` did on the
 * same controls. Nothing here reads or changes the disabled state — a disabled
 * control stays disabled, unfocusable and outside the toolbar's roving stop.
 *
 * Appearance is `inverse-surface`/`inverse-on-surface` (M3's own plain-tooltip
 * pair, correct in both appearances), motion honours `prefers-reduced-motion`,
 * and forced-colours mode gets a real border rather than relying on the fill —
 * all in `styles/tooltip.css`.
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { ReactNode, Ref } from "react";

import { detectShortcutPlatform } from "~/shared/commands/platform";
import { formatShortcut } from "~/shared/commands/shortcut";

import { parseModShortcut } from "./shortcut-notation";

/** How long the pointer must rest on a control before its tooltip appears. */
const POINTER_DELAY_MS = 200;
/** Space between the trigger and the tooltip. */
const OFFSET_PX = 8;
/** Minimum distance the tooltip keeps from the viewport edge. */
const VIEWPORT_MARGIN_PX = 8;

/** What the render prop hands the trigger. */
export interface TooltipTriggerProps {
  /** Attach to the trigger element — the tooltip measures and listens on it. */
  readonly ref: (node: HTMLElement | null) => void;
  /** Spread as `aria-describedby`; present only while the tooltip is shown. */
  readonly describedBy: string | undefined;
}

export interface TooltipProps {
  /**
   * The tooltip's text. Supporting text, NOT the control's name — the trigger
   * keeps its own accessible name.
   */
  readonly label: ReactNode;
  /**
   * An optional keyboard shortcut in the `Mod-Shift-x` convention shared by the
   * editor keymap and the command model (`Mod` is ⌘ on Apple platforms and Ctrl
   * everywhere else). Rendered as a `<kbd>` beside the text and formatted by the
   * ONE shared formatter, so a shortcut reads the same here, in the Command
   * Palette and in the keyboard reference.
   */
  readonly shortcut?: string;
  /** Preferred side. The tooltip flips when that side has no room. */
  readonly placement?: "top" | "bottom";
  /** Skip the tooltip entirely (still renders `children`). */
  readonly disabled?: boolean;
  /** The trigger, given the ref + description wiring it must spread. */
  readonly children: (trigger: TooltipTriggerProps) => ReactNode;
}

type Position = {
  readonly top: number;
  readonly left: number;
  readonly placement: "top" | "bottom";
};

/** Merge several refs onto one element, for a trigger that already has one. */
export function composeRefs<T>(
  ...refs: readonly (Ref<T> | undefined)[]
): (node: T | null) => void {
  return (node: T | null) => {
    for (const ref of refs) {
      if (typeof ref === "function") {
        ref(node);
      } else if (ref && typeof ref === "object") {
        (ref as { current: T | null }).current = node;
      }
    }
  };
}

export function Tooltip({
  label,
  shortcut,
  placement = "top",
  disabled = false,
  children,
}: TooltipProps) {
  const id = useId();
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);
  const [tip, setTip] = useState<HTMLDivElement | null>(null);
  /** Which input opened the tooltip — `null` while it is closed. */
  const [source, setSource] = useState<"pointer" | "focus" | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const open = source !== null;

  /** True from the moment the pointer arrives until it is seen elsewhere. */
  const [hovering, setHovering] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /*
   * Set while the pointer is pressed on the trigger and has not yet moved away:
   * clicking an overflow trigger must not leave its tooltip hanging over the
   * menu the click just opened.
   */
  const suppressedRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const close = useCallback(() => {
    clearTimer();
    setSource(null);
    setPosition(null);
  }, [clearTimer]);

  /** The pointer has demonstrably gone somewhere else. */
  const leave = useCallback(() => {
    suppressedRef.current = false;
    clearTimer();
    setHovering(false);
    // A tooltip the KEYBOARD opened stays: where the pointer wanders while a
    // control is focused says nothing about whether the description is wanted.
    setSource((current) => (current === "pointer" ? null : current));
  }, [clearTimer]);

  // Pointer + focus wiring, attached NATIVELY to the trigger so it composes with
  // whatever handlers the trigger already declares in JSX.
  useEffect(() => {
    if (!trigger || disabled) {
      return;
    }
    const onPointerEnter = (event: PointerEvent) => {
      // A touch tap has no hover state to speak of, and opening on it would put
      // a tooltip over the surface the tap just opened.
      if (event.pointerType === "touch" || suppressedRef.current) {
        return;
      }
      setHovering(true);
      clearTimer();
      timerRef.current = setTimeout(
        () => setSource("pointer"),
        POINTER_DELAY_MS,
      );
    };
    const onPointerLeave = () => leave();
    const onPointerDown = () => {
      suppressedRef.current = true;
      close();
    };
    const onFocus = () => {
      // Only a FOCUS-VISIBLE trigger earns a tooltip: a pointer click also
      // focuses, and a tooltip that answers a click is noise.
      if (trigger.matches(":focus-visible")) {
        clearTimer();
        setSource("focus");
      }
    };
    const onBlur = () => close();

    trigger.addEventListener("pointerenter", onPointerEnter);
    trigger.addEventListener("pointerleave", onPointerLeave);
    trigger.addEventListener("pointerdown", onPointerDown);
    trigger.addEventListener("focus", onFocus);
    trigger.addEventListener("blur", onBlur);
    return () => {
      clearTimer();
      trigger.removeEventListener("pointerenter", onPointerEnter);
      trigger.removeEventListener("pointerleave", onPointerLeave);
      trigger.removeEventListener("pointerdown", onPointerDown);
      trigger.removeEventListener("focus", onFocus);
      trigger.removeEventListener("blur", onBlur);
    };
  }, [trigger, disabled, clearTimer, close, leave]);

  /*
   * The belt to `pointerleave`'s braces, active only while the pointer is
   * believed to be on this trigger.
   *
   * A DISABLED button is the case that needs it. Chrome dispatches
   * `pointerenter` to one but not the matching `pointerleave`, so the pending
   * open TIMER was never cancelled: the pointer moved on to the next control and
   * the greyed-out button it had left behind then opened its own tooltip 200ms
   * later — two tooltips, one of them stranded. `pointerover` bubbles from
   * whatever the pointer is genuinely over, so it answers the question
   * `pointerleave` refused to.
   */
  useEffect(() => {
    if (!hovering || !trigger || typeof document === "undefined") {
      return;
    }
    const onPointerOver = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || !trigger.contains(target)) {
        leave();
      }
    };
    document.addEventListener("pointerover", onPointerOver, true);
    return () =>
      document.removeEventListener("pointerover", onPointerOver, true);
  }, [hovering, trigger, leave]);

  // Escape dismisses, wherever focus currently is (a hover-opened tooltip is not
  // focused). Propagation is stopped ONLY when the trigger holds focus, so this
  // can never swallow the Escape an enclosing Drawer or menu is waiting for.
  useEffect(() => {
    if (!open || typeof document === "undefined") {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      if (trigger && document.activeElement === trigger) {
        event.stopPropagation();
      }
      close();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, trigger, close]);

  // Position from the trigger's measured rect, then clamp into the viewport.
  // Runs before paint, so the tooltip never appears at the wrong place first.
  useLayoutEffect(() => {
    if (!open || !trigger || !tip) {
      return;
    }
    const place = () => {
      const anchor = trigger.getBoundingClientRect();
      const box = tip.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;

      const above = anchor.top - box.height - OFFSET_PX;
      const below = anchor.bottom + OFFSET_PX;
      let side: "top" | "bottom" = placement;
      if (side === "top" && above < VIEWPORT_MARGIN_PX) {
        side = "bottom";
      }
      if (
        side === "bottom" &&
        below + box.height > viewportHeight - VIEWPORT_MARGIN_PX &&
        above >= VIEWPORT_MARGIN_PX
      ) {
        side = "top";
      }

      // Clamped against the DOCUMENT's client width, not `window.innerWidth`:
      // the latter includes a classic scrollbar, and a tooltip placed under it
      // would widen the document and scroll the page sideways.
      const maxLeft = viewportWidth - box.width - VIEWPORT_MARGIN_PX;
      const left = Math.min(
        Math.max(
          VIEWPORT_MARGIN_PX,
          anchor.left + anchor.width / 2 - box.width / 2,
        ),
        Math.max(VIEWPORT_MARGIN_PX, maxLeft),
      );
      const top = Math.max(VIEWPORT_MARGIN_PX, side === "top" ? above : below);
      setPosition({ top, left, placement: side });
    };

    place();
    // Anything that moves the trigger (a scroll, a resize) invalidates the
    // measurement; recompute rather than leave a tooltip stranded.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, trigger, tip, placement, label, shortcut]);

  const shown = open && !disabled;
  const triggerProps: TooltipTriggerProps = {
    ref: setTrigger,
    describedBy: shown ? id : undefined,
  };

  return (
    <>
      {children(triggerProps)}
      {shown && typeof document !== "undefined"
        ? createPortal(
            <div
              id={id}
              role="tooltip"
              ref={setTip}
              className="dh-tooltip"
              data-placement={position?.placement ?? placement}
              // Hidden until measured, so it is never painted at 0,0 first.
              data-positioned={position ? "true" : "false"}
              style={
                position
                  ? { top: `${position.top}px`, left: `${position.left}px` }
                  : undefined
              }
            >
              <span className="dh-tooltip__label">{label}</span>
              <TooltipShortcut shortcut={shortcut} />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/**
 * The shortcut chip. Rendered from the ONE shared formatter, so `Mod-b` reads as
 * `⌘B` on an Apple platform and `Ctrl+B` everywhere else — the same string the
 * Command Palette and the keyboard reference show.
 */
function TooltipShortcut({ shortcut }: { readonly shortcut?: string }) {
  const parsed = shortcut ? parseModShortcut(shortcut) : null;
  if (!parsed) {
    return null;
  }
  return (
    <kbd className="dh-tooltip__shortcut">
      {formatShortcut(parsed, detectShortcutPlatform())}
    </kbd>
  );
}
