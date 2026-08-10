/**
 * EDIT-03 — the ONE anchored overlay surface.
 *
 * ── The defect this exists to remove ─────────────────────────────────────────
 * Every floating surface DalyHub had written before this one was `position:
 * absolute` inside the element that opened it. That is fine on a record page and
 * catastrophic in a list, because an absolutely positioned box is still clipped
 * by any ancestor with `overflow: hidden` and is still sized against its
 * containing block. On the redesigned Tasks row all three inline editors hit
 * both at once:
 *
 *   - `.dh-card-swipe` clips its 45px row (it has to: the swipe tray slides
 *     underneath it), so a 305px priority menu was painted as a 45px sliver;
 *   - the Project column is a 12rem track with `overflow: hidden`, so the menu
 *     was cut to the column as well;
 *   - shrink-to-fit sized the menu against the narrow priority cell, so what
 *     little was visible wrapped one word per line — "P2 · Hi / gh".
 *
 * The result was an editor that showed the value you already had and none of the
 * ones you were trying to choose between. No amount of `overflow: visible` on
 * the row fixes that honestly: those clips are load-bearing for the row's own
 * layout, and re-opening them re-opens the horizontal-overflow defects they were
 * added for. A surface that must escape its parents belongs in the OVERLAY
 * LAYER, not in the row.
 *
 * ── What this component is ───────────────────────────────────────────────────
 * A portal onto `<body>` holding one `position: fixed` box, placed from the
 * trigger's measured rect by the pure {@link placeAnchoredSurface}: it prefers
 * the space below the trigger, flips above when that side cannot hold it,
 * clamps its height (and scrolls internally) when neither side can, and slides
 * along the inline axis to stay inside the viewport margins. It re-measures on
 * scroll and resize, exactly as the shared Tooltip does, because the page behind
 * a non-modal surface keeps moving.
 *
 * It is deliberately UNOPINIONATED about content and semantics. It carries no
 * role, no ARIA and no keyboard handling of its own: a menu, a listbox and a
 * dialog all need different ones, and the host that knows which it is passes
 * them through. What it does own is the one behaviour every anchored surface
 * shares and every implementation re-derives — dismissal on an outside pointer
 * press, where "inside" correctly includes the trigger even though the trigger
 * is in a different part of the DOM.
 *
 * ── Why not the native Popover API ───────────────────────────────────────────
 * `popover=""` would give the top layer for free, and it is tempting. It also
 * brings light-dismiss semantics that fight a menu's own Escape/Tab contract,
 * and its anchor positioning (`anchor-name`/`position-area`) is not yet
 * available across the browsers DalyHub supports. The measured-and-portalled
 * approach is what the Tooltip already ships, so this is one more adopter of a
 * proven pattern rather than a second overlay system.
 */

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { KeyboardEvent, ReactNode, RefObject } from "react";

import {
  placeAnchoredSurface,
  type AnchoredAlign,
  type AnchoredDirection,
  type AnchoredSurfacePlacement,
} from "./anchored-placement";

/**
 * The gap between the trigger and the surface. Matches the `--app-space-1`
 * offset the surfaces used while they were CSS-anchored, so nothing moved by a
 * pixel when they were promoted to the overlay layer.
 */
const ANCHOR_OFFSET_PX = 4;

// `useLayoutEffect` warns during SSR; fall back to `useEffect` on the server,
// where there is no layout to measure anyway (the same guard the Drawer's
// scroll lock and the shared Tooltip already use).
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export interface AnchoredSurfaceProps {
  /**
   * The control the surface belongs to. Everything is measured from it, and a
   * pointer press on it counts as INSIDE — without that, pressing an open
   * trigger would dismiss and immediately reopen.
   *
   * A REF rather than the node, because the node is what every host already
   * holds (`useInlineEdit` hands out a `triggerRef` so it can restore focus),
   * and because reading it inside the effects means a host never has to mirror
   * its trigger into state to make this component re-place itself.
   */
  readonly anchorRef: RefObject<HTMLElement | null>;
  /** Which of the anchor's inline edges the surface lines up with. */
  readonly align?: AnchoredAlign;
  /**
   * An outside pointer press happened. The host decides what that means —
   * a menu cancels, a half-written editor may not — and owns focus, because
   * a user pressing elsewhere is already on their way somewhere else.
   */
  readonly onDismiss?: () => void;
  /**
   * Grow the surface to at least the trigger's width. Right for a field editor
   * (a 12rem Project column should not open a 6rem menu); wrong for an
   * icon-sized trigger, which is why it is opt-in.
   */
  readonly matchAnchorWidth?: boolean;
  readonly className?: string;
  readonly children: ReactNode;

  // Semantics belong to the host; these are passed straight through.
  readonly id?: string;
  readonly role?: string;
  readonly "aria-label"?: string;
  readonly "aria-labelledby"?: string;
  readonly tabIndex?: number;
  readonly onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  readonly "data-testid"?: string;
}

/** The document's writing direction, which decides what `start` means. */
function documentDirection(): AnchoredDirection {
  if (typeof document === "undefined") return "ltr";
  const declared = document.documentElement.getAttribute("dir");
  if (declared === "rtl" || declared === "ltr") return declared;
  return getComputedStyle(document.documentElement).direction === "rtl"
    ? "rtl"
    : "ltr";
}

export function AnchoredSurface({
  anchorRef,
  align = "start",
  onDismiss,
  matchAnchorWidth = false,
  className,
  children,
  id,
  role,
  tabIndex,
  onKeyDown,
  ...rest
}: AnchoredSurfaceProps) {
  const [surface, setSurface] = useState<HTMLDivElement | null>(null);
  /** `null` until measured — the surface stays hidden rather than flash at 0,0. */
  const [placement, setPlacement] = useState<AnchoredSurfacePlacement | null>(
    null,
  );
  const [minWidth, setMinWidth] = useState(0);

  /*
   * A STABLE ref callback. An inline arrow changes identity on every render, so
   * React detaches and re-attaches it — which here means `setSurface(null)`
   * followed by `setSurface(node)` on every single render, and a measurement
   * effect that tears down and re-runs with it.
   */
  const attachSurface = useCallback((node: HTMLDivElement | null) => {
    setSurface(node);
  }, []);

  /*
   * Measure, place, and keep placing.
   *
   * `scrollHeight` is the surface's NATURAL height — unaffected by a clamp a
   * previous pass applied — so re-measuring on every scroll event can never
   * ratchet the surface smaller. The width is read from the box because the
   * stylesheet's `max-inline-size` has already had its say by then.
   *
   * A layout effect, not an effect: the surface must never be seen at the wrong
   * place first.
   */
  useIsomorphicLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor || !surface) return;
    // Read once per open, not once per scroll event: the document's writing
    // direction does not change while a menu is on screen.
    const direction = documentDirection();
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const next = placeAnchoredSurface({
        anchor: {
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
        },
        surface: {
          width: surface.offsetWidth,
          height: surface.scrollHeight,
        },
        viewport: {
          width: document.documentElement.clientWidth,
          height: document.documentElement.clientHeight,
        },
        offset: ANCHOR_OFFSET_PX,
        align,
        direction,
      });
      setPlacement((current) =>
        current &&
        current.top === next.top &&
        current.left === next.left &&
        current.side === next.side &&
        current.maxHeight === next.maxHeight
          ? current
          : next,
      );
      setMinWidth((current) => {
        const wanted = matchAnchorWidth ? rect.width : 0;
        return Math.abs(wanted - current) < 0.5 ? current : wanted;
      });
    };

    place();
    // Anything that moves the trigger invalidates the measurement. The surface
    // is deliberately non-modal, so the page behind it still scrolls.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchorRef, surface, align, matchAnchorWidth, children]);

  /*
   * Outside-press dismissal, with the TRIGGER counted as inside.
   *
   * This is the behaviour a portalled surface most easily gets wrong: hosts
   * habitually test `container.contains(target)`, and once the surface is in
   * the overlay layer it is no longer in that container — so the first click on
   * an option dismissed the surface before the option's own `click` could fire,
   * and choosing anything became impossible. Owning it here means no host can
   * reintroduce that.
   */
  useEffect(() => {
    if (!onDismiss || typeof document === "undefined") return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (surface?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onDismiss();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, true);
  }, [anchorRef, surface, onDismiss]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      {...rest}
      id={id}
      role={role}
      tabIndex={tabIndex}
      onKeyDown={onKeyDown}
      ref={attachSurface}
      className={["dh-anchored", className].filter(Boolean).join(" ")}
      data-side={placement?.side ?? "below"}
      // Measured but not yet placed. Hidden rather than moved off-screen, so it
      // can still be measured at its natural size.
      data-positioned={placement ? "true" : "false"}
      style={{
        top: `${placement?.top ?? 0}px`,
        left: `${placement?.left ?? 0}px`,
        ...(placement?.maxHeight != null
          ? { maxHeight: `${placement.maxHeight}px` }
          : {}),
        ...(minWidth > 0 ? { minInlineSize: `${minWidth}px` } : {}),
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
