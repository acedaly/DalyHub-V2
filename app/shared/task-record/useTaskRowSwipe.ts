/**
 * MOBILE-02 §4 — the Task row's swipe gesture (client behaviour only).
 *
 * Wires pointer input to the pure row-swipe model in `~/shared/card/swipe-model`:
 * decides horizontal vs vertical intent, draws the row following the finger,
 * arms at the commit threshold and fires the edge's action on release. Every
 * DECISION is in the model; this hook owns only the DOM plumbing.
 *
 * ── Why this is not `useCardSwipe` ──────────────────────────────────────────
 * `useCardSwipe` is proven and stays exactly as it is; it is the wrong shape for
 * this row for two structural reasons the audit's own note anticipated:
 *
 *  1. **A tray cannot live in this grid.** A Card's tray is a sibling of the
 *     card surface inside a positioned wrapper. A `TaskRow` is an `<li>` that IS
 *     the column grid, and its tracks are declared once on `.dh-tasklist` and
 *     inherited — that inheritance is the entire mechanism keeping the header
 *     cells and every row's cells on the same vertical lines (DS-04). Adding a
 *     wrapper or a sibling inside the row puts a new box in those tracks.
 *  2. **A row commits; a card opens.** See the model's own note. Fifty rows with
 *     one open tray between them is a mode; a commit is an act.
 *
 * So the row keeps its grid untouched and the gesture moves the CELLS by
 * transform. A transform does not participate in layout, so the columns are
 * geometrically identical during a swipe, after a swipe and on a desktop that
 * never swipes at all — which is the constraint the brief sets on this work.
 *
 * ── Why the transform is applied only while swiping ─────────────────────────
 * `transform` — even `translateX(0)` — makes an element a containing block for
 * fixed-position descendants. The row's inline editors open anchored popovers,
 * so a permanent identity transform on every cell would quietly change where
 * those land. The stylesheet therefore selects on `[data-swipe-edge]`, which
 * only ever exists mid-gesture on a touch device.
 *
 * ── What it never does ──────────────────────────────────────────────────────
 * It is inert unless the device is genuinely touch-first (`(hover: none) and
 * (pointer: coarse)`), so a mouse and a keyboard are untouched. It never claims
 * a vertical drag, and the row sets `touch-action: pan-y`, so page scrolling is
 * preserved. It never fires from a control that owns its own gesture. And every
 * action it can fire is also an ordinary, keyboard-reachable control ON the row:
 * the gesture is an accelerator, never the only way through.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, MouseEvent } from "react";

import {
  DEFAULT_ROW_SWIPE_THRESHOLDS,
  resolveSwipeIntent,
  rowSwipeArmed,
  rowSwipeCommit,
  rowSwipeOffset,
  type RowSwipeEdge,
  type RowSwipeThresholds,
} from "~/shared/card/swipe-model";

/** The touch-first media query the whole swipe layer honours. */
const TOUCH_FIRST_QUERY = "(hover: none) and (pointer: coarse)";

/** Controls that own their own press/drag and must never be hijacked. */
const NON_SWIPE_SELECTOR =
  "input, textarea, select, [data-no-swipe], [data-no-swipe] *";

export interface UseTaskRowSwipeOptions {
  /** Fired on release past the commit point towards the inline-end. */
  readonly onStartEdge?: () => void;
  /** Fired on release past the commit point towards the inline-start. */
  readonly onEndEdge?: () => void;
  readonly thresholds?: RowSwipeThresholds;
}

export interface UseTaskRowSwipeResult {
  /** Whether the gesture is live (client, touch-first device). */
  readonly enabled: boolean;
  /** The edge currently being revealed, or null when the row is at rest. */
  readonly edge: RowSwipeEdge | null;
  /** Whether releasing now would fire the edge's action. */
  readonly armed: boolean;
  /** True while a horizontal drag is in progress — suppresses the snap. */
  readonly dragging: boolean;
  /** The signed offset the row is drawn at, in CSS px. */
  readonly offset: number;
  readonly onPointerDown: (event: ReactPointerEvent) => void;
  readonly onPointerMove: (event: ReactPointerEvent) => void;
  readonly onPointerUp: (event: ReactPointerEvent) => void;
  readonly onPointerCancel: (event: ReactPointerEvent) => void;
  /** Capture-phase guard that swallows the click a real swipe would emit. */
  readonly onClickCapture: (event: MouseEvent) => void;
}

export function useTaskRowSwipe(
  options: UseTaskRowSwipeOptions,
): UseTaskRowSwipeResult {
  const thresholds = options.thresholds ?? DEFAULT_ROW_SWIPE_THRESHOLDS;
  const { onStartEdge, onEndEdge } = options;
  const hasActions = Boolean(onStartEdge) || Boolean(onEndEdge);

  const [enabled, setEnabled] = useState(false);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  // Gesture scratch in refs, so the handlers never go stale and a drag never
  // re-renders more than the offset it is drawing.
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const intentRef = useRef<"pending" | "horizontal" | "vertical">("pending");
  const pointerIdRef = useRef<number | null>(null);
  const swipedRef = useRef(false);
  /** True only while an edge action is dispatching a click of our own. */
  const selfDispatchRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(TOUCH_FIRST_QUERY);
    const update = () => setEnabled(mql.matches && hasActions);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [hasActions]);

  const reset = useCallback(() => {
    startRef.current = null;
    intentRef.current = "pending";
    pointerIdRef.current = null;
    setDragging(false);
    setOffset(0);
  }, []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      if (!enabled) return;
      // A mouse on a hybrid device is still a mouse.
      if (event.pointerType === "mouse") return;
      const target = event.target as Element | null;
      if (target?.closest(NON_SWIPE_SELECTOR)) return;
      startRef.current = { x: event.clientX, y: event.clientY };
      intentRef.current = "pending";
      pointerIdRef.current = event.pointerId;
      swipedRef.current = false;
    },
    [enabled],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent) => {
      const start = startRef.current;
      if (!enabled || start === null) return;
      if (pointerIdRef.current !== event.pointerId) return;

      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;

      if (intentRef.current === "pending") {
        intentRef.current = resolveSwipeIntent(dx, dy, thresholds.intent);
        if (intentRef.current === "vertical") {
          // The page is scrolling. Let go completely — never fight it.
          reset();
          return;
        }
        if (intentRef.current === "pending") return;
        // The gesture is ours from here. Capture so it survives the finger
        // leaving the row's own box.
        (event.currentTarget as HTMLElement).setPointerCapture?.(
          event.pointerId,
        );
        setDragging(true);
      }
      if (intentRef.current !== "horizontal") return;

      // An edge with no action does not move: pulling a completed row towards
      // an action it does not offer should feel like a wall, not like a
      // gesture that silently does nothing on release.
      if ((dx > 0 && !onStartEdge) || (dx < 0 && !onEndEdge)) {
        setOffset(0);
        return;
      }
      swipedRef.current = true;
      setOffset(rowSwipeOffset(dx, thresholds));
    },
    [enabled, onEndEdge, onStartEdge, reset, thresholds],
  );

  /*
   * An edge action runs with the click guard SUSPENDED.
   *
   * An action is allowed to activate one of the row's own controls — that is the
   * point of the design, so the gesture drives the same path the control does —
   * and `.click()` on a real button dispatches a real click, which bubbles
   * straight into the capture-phase guard below and gets swallowed. Measured:
   * the schedule swipe fired, the date trigger was clicked, and the guard ate
   * the click before the popover could open.
   *
   * The suspension is synchronous and `finally`-scoped, so it covers exactly the
   * callback and nothing after it. The browser's own compatibility click, which
   * arrives later, still meets an armed guard and is still swallowed — which is
   * the thing the guard exists for.
   */
  const runEdge = useCallback((action: (() => void) | undefined) => {
    if (action === undefined) return;
    selfDispatchRef.current = true;
    try {
      action();
    } finally {
      selfDispatchRef.current = false;
    }
  }, []);

  const onPointerUp = useCallback(
    (event: ReactPointerEvent) => {
      if (!enabled || startRef.current === null) return;
      if (pointerIdRef.current !== event.pointerId) return;
      const committed = rowSwipeCommit(offset, thresholds);
      reset();
      if (committed === "start") runEdge(onStartEdge);
      else if (committed === "end") runEdge(onEndEdge);
    },
    [enabled, offset, onEndEdge, onStartEdge, reset, runEdge, thresholds],
  );

  const onPointerCancel = useCallback(
    (event: ReactPointerEvent) => {
      if (pointerIdRef.current !== event.pointerId) return;
      reset();
    },
    [reset],
  );

  /*
   * The click a real swipe leaves behind.
   *
   * A touch that moved horizontally across the title still emits a
   * compatibility click on release, which would open the task's record on top
   * of whatever the swipe just did. Swallowed in the capture phase, exactly as
   * `useCardSwipe` and `useCardLongPress` swallow theirs.
   */
  const onClickCapture = useCallback((event: MouseEvent) => {
    if (selfDispatchRef.current) return;
    if (!swipedRef.current) return;
    swipedRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  return {
    enabled,
    edge: offset === 0 ? null : offset > 0 ? "start" : "end",
    armed: rowSwipeArmed(offset, thresholds),
    dragging,
    offset,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onClickCapture,
  };
}
