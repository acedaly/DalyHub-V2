/**
 * DS-04 (TASKS-08) — the Card LONG-PRESS hook (client behaviour only).
 *
 * The phone-native way into multi-select: hold a row for a moment and the collection
 * enters selection mode. It exists because tapping a row must keep meaning "open this
 * record" — that is what a tap means everywhere else in DalyHub — so the gesture that
 * starts a selection has to be a different one.
 *
 * Three rules keep it honest:
 *
 *   - **it is an ACCELERATOR, never the only way in.** Every consumer that wires
 *     `onLongPress` must also expose an ordinary, labelled selection control (the
 *     Card's own checkbox, plus a "Select tasks" toggle on the collection). A gesture
 *     with no keyboard or assistive equivalent would be an accessibility failure, not
 *     a feature (AGENTS.md §15);
 *   - **it never fights the existing gestures.** It is gated on the same touch-first
 *     media query the swipe layer uses, it is armed only by a primary-button pointer
 *     on the card surface itself (never on a nested control, a `[data-no-swipe]`
 *     region or an input), and any movement beyond a small slop cancels it — so a
 *     horizontal swipe still opens the action tray and a vertical drag still scrolls;
 *   - **it fires ONCE, on the hold, and suppresses the click that follows.** Without
 *     the capture-phase guard the same press would both enter selection mode and open
 *     the record, which is the exact bug that makes long-press feel broken.
 *
 * The DOM plumbing lives here; the collection owns what selection MEANS.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent, PointerEvent as ReactPointerEvent } from "react";

/** The touch-first media query, matching the swipe layer's gate. */
const TOUCH_FIRST_QUERY = "(hover: none) and (pointer: coarse)";

/** Controls that own their own gesture and must never arm a long press. */
const NON_PRESS_SELECTOR =
  "input, textarea, select, button, a, [data-no-swipe], [data-no-swipe] *";

/** How long the finger must rest before selection mode begins. */
export const LONG_PRESS_DELAY_MS = 500;

/**
 * How far the finger may drift and still count as a hold. Small enough that a real
 * swipe or scroll cancels, generous enough that a steady thumb does not.
 */
export const LONG_PRESS_SLOP_PX = 8;

export interface UseCardLongPressResult {
  /** Whether long press is active (client, touch-first device, handler supplied). */
  readonly enabled: boolean;
  readonly onPointerDown: (event: ReactPointerEvent) => void;
  readonly onPointerMove: (event: ReactPointerEvent) => void;
  readonly onPointerUp: (event: ReactPointerEvent) => void;
  readonly onPointerCancel: (event: ReactPointerEvent) => void;
  /** Capture-phase guard that swallows the click a completed hold would produce. */
  readonly onClickCapture: (event: MouseEvent) => void;
}

export function useCardLongPress(options: {
  readonly onLongPress?: () => void;
  readonly delayMs?: number;
}): UseCardLongPressResult {
  const delay = options.delayMs ?? LONG_PRESS_DELAY_MS;
  const handler = options.onLongPress;
  const [touchFirst, setTouchFirst] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia(TOUCH_FIRST_QUERY);
    setTouchFirst(query.matches);
    const onChange = (event: MediaQueryListEvent) =>
      setTouchFirst(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const cancelTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    cancelTimer();
    pointerIdRef.current = null;
    startRef.current = null;
  }, [cancelTimer]);

  useEffect(() => cancelTimer, [cancelTimer]);

  const enabled = touchFirst && handler !== undefined;

  const onPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      // A fresh sequence clears any armed click suppression, so the next genuine tap
      // is never swallowed even if the browser emitted no compatibility click.
      firedRef.current = false;
      if (!enabled || !event.isPrimary || event.button !== 0) return;
      const target = event.target as Element | null;
      if (target?.closest?.(NON_PRESS_SELECTOR)) return;
      pointerIdRef.current = event.pointerId;
      startRef.current = { x: event.clientX, y: event.clientY };
      cancelTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        firedRef.current = true;
        handlerRef.current?.();
      }, delay);
    },
    [cancelTimer, delay, enabled],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent) => {
      if (pointerIdRef.current !== event.pointerId) return;
      const start = startRef.current;
      if (start === null) return;
      const drifted =
        Math.abs(event.clientX - start.x) > LONG_PRESS_SLOP_PX ||
        Math.abs(event.clientY - start.y) > LONG_PRESS_SLOP_PX;
      if (drifted) reset();
    },
    [reset],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent) => {
      if (pointerIdRef.current !== event.pointerId) return;
      reset();
    },
    [reset],
  );

  const onPointerCancel = onPointerUp;

  const onClickCapture = useCallback((event: MouseEvent) => {
    if (!firedRef.current) return;
    firedRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  return {
    enabled,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onClickCapture,
  };
}
