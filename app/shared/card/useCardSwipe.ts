/**
 * DS-04 (TODAY-06) — the Card swipe hook (client behaviour only).
 *
 * Wires pointer input to the pure {@link swipe-model}: it decides horizontal vs
 * vertical intent, translates the surface to follow the finger, snaps the action
 * tray open/closed on release, and enforces the single-open-tray invariant through
 * the shared registry. The DECISION logic is all in the model; this hook only owns
 * the DOM plumbing (measurement, the CSS reveal variable, pointer capture, the
 * outside-interaction close, and suppressing the tap-to-open that a touch swipe
 * would otherwise fire).
 *
 * It is inert unless the device is genuinely touch-first — gated on
 * `(hover: none) and (pointer: coarse)` so a desktop mouse/keyboard is never
 * altered (the repo's `@media (hover: none)` convention). Structure does not depend
 * on this gate (the Card always renders the same DOM when `swipeActions` is given),
 * so enabling/disabling only toggles behaviour and never causes a hydration
 * mismatch. Vertical drags are never claimed and the surface sets `touch-action:
 * pan-y`, so natural page scrolling is preserved.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, MouseEvent } from "react";

import {
  DEFAULT_SWIPE_THRESHOLDS,
  FALLBACK_TRAY_WIDTH,
  projectOffset,
  resolveRelease,
  resolveSwipeIntent,
  sharedSwipeRegistry,
  type SwipeThresholds,
} from "./swipe-model";

/** A mutable tray handle whose `close` always dispatches to the latest closer. */
interface MutableTrayHandle {
  close: () => void;
}

/** The touch-first media query the swipe layer honours. */
const TOUCH_FIRST_QUERY = "(hover: none) and (pointer: coarse)";

/** Controls the Card must never hijack a press/drag from (they own their gesture). */
const NON_SWIPE_SELECTOR =
  "input, textarea, select, [data-no-swipe], [data-no-swipe] *";

export interface UseCardSwipeResult {
  /** Whether pointer swipe is active (client, touch-first device). */
  readonly enabled: boolean;
  /** Whether the action tray is currently revealed. */
  readonly isOpen: boolean;
  /** Whether a horizontal drag is in progress (disables the snap transition). */
  readonly dragging: boolean;
  /** The clip/position wrapper element ref (bounds the outside-interaction check). */
  readonly rootRef: React.RefObject<HTMLDivElement | null>;
  /** The translated surface (the Card article) — carries the CSS reveal variable. */
  readonly surfaceRef: React.RefObject<HTMLElement | null>;
  /** The tray element ref, measured for its revealed width. */
  readonly trayRef: React.RefObject<HTMLDivElement | null>;
  readonly onPointerDown: (event: ReactPointerEvent) => void;
  readonly onPointerMove: (event: ReactPointerEvent) => void;
  readonly onPointerUp: (event: ReactPointerEvent) => void;
  readonly onPointerCancel: (event: ReactPointerEvent) => void;
  /** Capture-phase click guard that swallows the tap-open after a real swipe. */
  readonly onClickCapture: (event: MouseEvent) => void;
  /** Imperatively close the tray (e.g. after a tray action fires). */
  readonly close: () => void;
}

export function useCardSwipe(options: {
  /** Whether this card offers any swipe actions (structural — SSR-safe). */
  readonly hasActions: boolean;
  readonly thresholds?: SwipeThresholds;
}): UseCardSwipeResult {
  const thresholds = options.thresholds ?? DEFAULT_SWIPE_THRESHOLDS;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLElement | null>(null);
  const trayRef = useRef<HTMLDivElement | null>(null);

  const [enabled, setEnabled] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  // Gesture scratch state kept in refs so pointer handlers never go stale and never
  // re-render the card mid-drag.
  const isOpenRef = useRef(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const committedRef = useRef(0);
  const intentRef = useRef<"pending" | "horizontal" | "vertical">("pending");
  const pointerIdRef = useRef<number | null>(null);
  const lastOffsetRef = useRef(0);
  const suppressClickRef = useRef(false);

  const measureTrayWidth = useCallback(() => {
    const width = trayRef.current?.getBoundingClientRect().width ?? 0;
    return width > 0 ? width : FALLBACK_TRAY_WIDTH;
  }, []);

  const setReveal = useCallback((px: number) => {
    // A runtime state variable (not a DS-01 token) the surface transform reads.
    surfaceRef.current?.style.setProperty("--swipe-reveal", `${px}px`);
  }, []);

  // A stable handle the registry stores; its `close` always points at the latest
  // closer, so the single-open invariant works across re-renders.
  const handleRef = useRef<MutableTrayHandle>({ close: () => {} });

  const doClose = useCallback(() => {
    isOpenRef.current = false;
    setIsOpen(false);
    setReveal(0);
    sharedSwipeRegistry.release(handleRef.current);
  }, [setReveal]);

  const doOpen = useCallback(() => {
    isOpenRef.current = true;
    setIsOpen(true);
    setReveal(measureTrayWidth());
    sharedSwipeRegistry.open(handleRef.current);
  }, [measureTrayWidth, setReveal]);

  handleRef.current.close = doClose;

  // Touch-first gate. Inert on the server and the first client render (so hydration
  // matches), then reflects the real device and follows changes.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }
    const mq = window.matchMedia(TOUCH_FIRST_QUERY);
    const update = () => setEnabled(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // If the device stops being touch-first while a tray is open, close it.
  useEffect(() => {
    if (!enabled && isOpenRef.current) {
      doClose();
    }
  }, [enabled, doClose]);

  // Close on any interaction outside this card while the tray is open (a tap on the
  // page, another card, or the shell) — one of the "close when appropriate" rules.
  useEffect(() => {
    if (!isOpen || typeof document === "undefined") {
      return;
    }
    const onDocPointerDown = (event: globalThis.PointerEvent) => {
      const root = rootRef.current;
      if (
        root &&
        event.target instanceof Node &&
        !root.contains(event.target)
      ) {
        doClose();
      }
    };
    document.addEventListener("pointerdown", onDocPointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", onDocPointerDown, true);
  }, [isOpen, doClose]);

  // Release this card's registry slot on unmount so a stale handle never lingers.
  useEffect(() => {
    const handle = handleRef.current;
    return () => sharedSwipeRegistry.release(handle);
  }, []);

  const resetGesture = useCallback(() => {
    startRef.current = null;
    intentRef.current = "pending";
    pointerIdRef.current = null;
  }, []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      // A NEW pointer sequence begins. If a suppression from a previous swipe is
      // still armed, its compatibility click never arrived (not every browser emits
      // one) — clear it now so this fresh gesture's genuine tap/click (or a nested
      // control's) is NEVER swallowed. Suppression is thus scoped to the immediate
      // post-swipe click and can never remain armed across gestures (no timeout).
      // Cleared before every early return so a tap that starts on a nested control
      // after a swipe still works.
      suppressClickRef.current = false;
      if (!enabled || !options.hasActions) {
        return;
      }
      // Only the primary button/contact; ignore right/middle press.
      if (
        event.button !== 0 &&
        event.button !== -1 &&
        event.button !== undefined
      ) {
        return;
      }
      // Never hijack a press that begins on a nested control (checkbox, action
      // button, date field, link marked no-swipe). They own their own gesture.
      if (
        event.target instanceof Element &&
        event.target.closest(NON_SWIPE_SELECTOR)
      ) {
        return;
      }
      startRef.current = { x: event.clientX, y: event.clientY };
      committedRef.current = isOpenRef.current ? measureTrayWidth() : 0;
      lastOffsetRef.current = committedRef.current;
      intentRef.current = "pending";
      pointerIdRef.current = event.pointerId;
    },
    [enabled, options.hasActions, measureTrayWidth],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent) => {
      if (!enabled || pointerIdRef.current !== event.pointerId) {
        return;
      }
      const start = startRef.current;
      if (start === null) {
        return;
      }
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;

      if (intentRef.current === "pending") {
        const intent = resolveSwipeIntent(dx, dy, thresholds.intent);
        if (intent === "vertical") {
          // Yield to the page scroll: abandon the gesture, leave the tray as-is.
          resetGesture();
          return;
        }
        if (intent === "horizontal") {
          intentRef.current = "horizontal";
          setDragging(true);
          try {
            surfaceRef.current?.setPointerCapture(event.pointerId);
          } catch {
            /* capture unsupported (e.g. test env) — the gesture still works */
          }
        }
      }

      if (intentRef.current === "horizontal") {
        const trayWidth = measureTrayWidth();
        const offset = projectOffset(committedRef.current, dx, trayWidth);
        lastOffsetRef.current = offset;
        setReveal(offset);
      }
    },
    [enabled, thresholds.intent, measureTrayWidth, setReveal, resetGesture],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent) => {
      if (pointerIdRef.current !== event.pointerId) {
        return;
      }
      const wasHorizontal = intentRef.current === "horizontal";
      setDragging(false);
      if (wasHorizontal) {
        const trayWidth = measureTrayWidth();
        const rest = resolveRelease(
          lastOffsetRef.current,
          trayWidth,
          thresholds.openRatio,
        );
        if (rest === "open") {
          doOpen();
        } else {
          doClose();
        }
        // A touch pointer-up is followed by a synthetic click; swallow it so a
        // handled swipe never also opens the card.
        suppressClickRef.current = true;
      }
      resetGesture();
    },
    [measureTrayWidth, thresholds.openRatio, doOpen, doClose, resetGesture],
  );

  const onPointerCancel = useCallback(
    (event: ReactPointerEvent) => {
      if (pointerIdRef.current !== event.pointerId) {
        return;
      }
      // Restore the committed resting position; a cancel never toggles the tray.
      setDragging(false);
      setReveal(isOpenRef.current ? measureTrayWidth() : 0);
      resetGesture();
    },
    [measureTrayWidth, setReveal, resetGesture],
  );

  const onClickCapture = useCallback((event: MouseEvent) => {
    if (suppressClickRef.current) {
      event.preventDefault();
      event.stopPropagation();
      suppressClickRef.current = false;
    }
  }, []);

  return {
    enabled,
    isOpen,
    dragging,
    rootRef,
    surfaceRef,
    trayRef,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onClickCapture,
    close: doClose,
  };
}
