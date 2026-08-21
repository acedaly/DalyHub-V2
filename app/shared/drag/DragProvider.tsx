/**
 * DHDS-11 — the one drag session in DalyHub.
 *
 * Mounted once, by the AppShell, above both the navigation rail and the page, so
 * an object lifted out of a list can be dropped on a destination in the frame.
 * There is exactly one session at a time and exactly one implementation of it: a
 * surface that wants spatial manipulation registers a SOURCE and a DESTINATION
 * here; it does not grow its own pointer handling, its own preview or its own
 * announcements.
 *
 * ── Why there is no drag-and-drop dependency ────────────────────────────────
 * Recorded in full in `DHDS_11_DRAG_REORDER_AND_OBJECT_CONTINUITY_2026_08.md`.
 * The short form: Pointer Events give ONE code path for mouse, pen and touch,
 * and the part that is genuinely hard — a keyboard grammar and live-region
 * announcements in the product's own words — is a property of DalyHub's
 * vocabulary rather than of a library. DS-04 had already written that once, in
 * `ReorderableCardCollection`; this generalises it rather than importing a
 * second answer beside it. HTML5 `dragstart`/`dataTransfer` is deliberately not
 * used: it cannot be driven from a keyboard, it is unusable on touch, and its
 * drag image is a browser-drawn bitmap rather than a DalyHub object.
 *
 * ── What it does NOT do ─────────────────────────────────────────────────────
 * No mutation, ever. `onDrop` hands the payload back to the surface that
 * registered the destination, and that surface posts the SAME canonical intent
 * its DHDS-10 picker posts. There is no drag mutation path, no drag cache and no
 * drag history: Undo is the product's one Undo (DS-10), reached through the
 * ordinary notification. And nothing here fires on HOVER — a request happens on
 * a committed drop and at no other moment.
 *
 * ── The pointer loop, and why it is cheap ───────────────────────────────────
 * `pointermove` writes the latest point into a ref and schedules one animation
 * frame. Everything that measures the DOM — hit-testing the destinations,
 * resolving an insertion index, autoscroll — happens inside that frame, once.
 * React state changes only when the DESTINATION or the INDEX changes, which is
 * the only thing the interface redraws for; the preview's own position is a
 * transform written through a ref by `DragPreviewLayer`, so following the
 * pointer costs no re-render at all.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  DragContext,
  type DragApi,
  type DragPoint,
  type DragSession,
  type DropTargetRegistration,
  type StartDragOptions,
} from "./drag-context";
import { DragPreviewLayer } from "./DragPreviewLayer";
import {
  dragCancelledMessage,
  dragDroppedMessage,
  dragMovedToMessage,
  dragOverMessage,
  dragPickUpMessage,
  dragPositionMessage,
  type DragPayload,
} from "./drag-model";

/**
 * How close to a scroll container's edge the pointer has to be before the
 * container follows it, and how far it then moves per frame.
 *
 * Both are deliberately restrained. A wide activation band turns an ordinary
 * drag down a list into an unrequested scroll, and a fast one overshoots the
 * destination the owner was aiming at — the runaway scrolling the brief rules
 * out. 48px is roughly one row; 12px a frame is about 700px a second, which
 * crosses a long list and can still stop on a row.
 */
const AUTOSCROLL_EDGE_PX = 48;
const AUTOSCROLL_STEP_PX = 12;

/**
 * How long the click a pointer release synthesises may be swallowed for.
 *
 * Long enough to cover it under any realistic scheduling; short enough that a
 * drag which ended WITHOUT one — a `pointercancel`, or an Escape while the
 * pointer is still down — cannot leave the flag standing into the owner's next
 * interaction.
 */
const CLICK_SUPPRESSION_MS = 400;

export interface DragProviderProps {
  readonly children: ReactNode;
}

export function DragProvider({ children }: DragProviderProps) {
  const [session, setSession] = useState<DragSession | null>(null);
  const [announcement, setAnnouncement] = useState("");

  /*
   * The registry is a ref, not state.
   *
   * Registration happens in an effect on every destination on screen; making it
   * state would re-render the whole shell each time a list mounted a row. What
   * the interface actually redraws for is the ACTIVE destination changing, and
   * that is `session.targetId`, which is state.
   */
  const targets = useRef(new Map<string, DropTargetRegistration>());
  const sessionRef = useRef<DragSession | null>(null);
  sessionRef.current = session;

  const pointRef = useRef<DragPoint | null>(null);
  const frameRef = useRef<number | null>(null);
  /** The last sentence spoken, so an unchanged destination stays silent. */
  const spokenRef = useRef("");
  /**
   * Set at a pointer pick-up, so the click the browser synthesises at the end of
   * a drag cannot also open the record the owner was moving.
   *
   * It is BOUNDED as well as cleared by that click, because the click is not
   * guaranteed to arrive: a `pointercancel` (a touch the browser took over for a
   * scroll) ends the drag with no click at all, and a flag left standing would
   * then eat the owner's next, entirely unrelated one. The window is generous
   * enough to cover the synthesised click and short enough that a stranded flag
   * cannot survive into the next interaction.
   */
  const suppressClickRef = useRef(false);
  const suppressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useCallback(() => {
    suppressClickRef.current = true;
    if (suppressTimer.current !== null) clearTimeout(suppressTimer.current);
    suppressTimer.current = setTimeout(() => {
      suppressTimer.current = null;
      suppressClickRef.current = false;
    }, CLICK_SUPPRESSION_MS);
  }, []);

  const registerTarget = useCallback((registration: DropTargetRegistration) => {
    targets.current.set(registration.id, registration);
    return () => {
      // Only remove OUR entry: a list that remounts under the same id has
      // already written its replacement by the time this cleanup runs.
      if (targets.current.get(registration.id) === registration) {
        targets.current.delete(registration.id);
      }
    };
  }, []);

  const announce = useCallback((message: string) => {
    if (message === spokenRef.current) return;
    spokenRef.current = message;
    setAnnouncement(message);
  }, []);

  const endSession = useCallback(() => {
    pointRef.current = null;
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    setSession(null);
  }, []);

  const cancel = useCallback(
    (reason?: string) => {
      const current = sessionRef.current;
      if (current === null) return;
      announce(dragCancelledMessage(current.payload.label, reason));
      endSession();
    },
    [announce, endSession],
  );

  const drop = useCallback(() => {
    const current = sessionRef.current;
    if (current === null) return;
    const target =
      current.targetId === null
        ? undefined
        : targets.current.get(current.targetId);
    if (target === undefined || !target.accepts(current.payload)) {
      /*
       * A release over nothing is not an error — it is the owner changing their
       * mind, which is the most ordinary thing a drag does. No toast and no
       * alert: the object returns and the live region says so once.
       */
      cancel();
      return;
    }
    const index = target.ordering ? current.index : null;
    announce(
      index === null
        ? dragMovedToMessage(current.payload.label, target.label)
        : dragDroppedMessage(
            current.payload.label,
            index,
            target.ordering?.size() ?? index + 1,
          ),
    );
    endSession();
    target.onDrop(current.payload, { index });
  }, [announce, cancel, endSession]);

  /* ---------------------------------------------------------------------- */
  /* Starting                                                                */
  /* ---------------------------------------------------------------------- */

  const startPointerDrag = useCallback(
    (payload: DragPayload, options: StartDragOptions) => {
      if (sessionRef.current !== null) return;
      const point = options.point ?? null;
      suppressClick();
      pointRef.current = point;
      spokenRef.current = "";
      setSession({
        payload,
        mode: "pointer",
        targetId: options.homeTargetId ?? null,
        index: options.homeIndex ?? null,
        origin: point,
        preview: previewGeometry(options.sourceElement, options.point),
        renderPreview: options.renderPreview,
      });
    },
    [suppressClick],
  );

  const startKeyboardDrag = useCallback(
    (payload: DragPayload, options: StartDragOptions) => {
      if (sessionRef.current !== null) return;
      const homeId = options.homeTargetId ?? null;
      const home = homeId === null ? undefined : targets.current.get(homeId);
      const index = options.homeIndex ?? null;
      pointRef.current = null;
      spokenRef.current = "";
      setSession({
        payload,
        mode: "keyboard",
        targetId: homeId,
        index,
        origin: null,
        preview: null,
        renderPreview: options.renderPreview,
      });
      if (index !== null && home?.ordering !== undefined) {
        announce(dragPickUpMessage(payload.label, index, home.ordering.size()));
      }
    },
    [announce],
  );

  const nudge = useCallback(
    (delta: number) => {
      const current = sessionRef.current;
      if (current === null || current.index === null) return;
      const ordering =
        current.targetId === null
          ? undefined
          : targets.current.get(current.targetId)?.ordering;
      if (ordering === undefined) return;
      const size = ordering.size();
      const next = Math.min(Math.max(current.index + delta, 0), size - 1);
      if (next === current.index) return;
      setSession({ ...current, index: next });
      announce(dragPositionMessage(current.payload.label, next, size));
    },
    [announce],
  );

  /* ---------------------------------------------------------------------- */
  /* The pointer loop                                                        */
  /* ---------------------------------------------------------------------- */

  const resolve = useCallback(() => {
    frameRef.current = null;
    const current = sessionRef.current;
    const point = pointRef.current;
    if (current === null || current.mode !== "pointer" || point === null) {
      return;
    }

    /*
     * The SMALLEST accepting rectangle under the pointer wins.
     *
     * Destinations nest — a sortable list of steps sits inside a record that is
     * not itself a destination, and a Project bucket sits inside a page.
     * Choosing by area rather than by registration order means the answer does
     * not depend on which component happened to mount first.
     */
    let bestId: string | null = null;
    let bestArea = Number.POSITIVE_INFINITY;
    let bestIndex: number | null = null;
    for (const target of targets.current.values()) {
      if (!target.accepts(current.payload)) continue;
      const element = target.element();
      if (element === null) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (
        point.x < rect.left ||
        point.x > rect.right ||
        point.y < rect.top ||
        point.y > rect.bottom
      ) {
        continue;
      }
      const area = rect.width * rect.height;
      if (area >= bestArea) continue;
      bestArea = area;
      bestId = target.id;
      bestIndex = target.ordering ? target.ordering.resolveIndex(point) : null;
    }

    autoScroll(point);

    if (bestId === current.targetId && bestIndex === current.index) return;

    setSession({ ...current, targetId: bestId, index: bestIndex });
    const target = bestId === null ? undefined : targets.current.get(bestId);
    if (target === undefined) {
      // Over nothing that accepts it: say nothing, and let the next real
      // destination speak. Silence is the honest report of an invalid space.
      spokenRef.current = "";
    } else if (bestIndex !== null && target.ordering) {
      announce(
        dragPositionMessage(
          current.payload.label,
          bestIndex,
          target.ordering.size(),
        ),
      );
    } else {
      announce(dragOverMessage(current.payload.label, target.label));
    }
  }, [announce]);

  useEffect(() => {
    if (session === null || session.mode !== "pointer") return;

    const schedule = () => {
      if (frameRef.current !== null) return;
      frameRef.current = requestAnimationFrame(resolve);
    };
    const onMove = (event: PointerEvent) => {
      pointRef.current = { x: event.clientX, y: event.clientY };
      schedule();
    };
    const onUp = () => drop();
    const onPointerCancel = () => cancel();
    /*
     * A drag holds the pointer, so the document must not also select text under
     * it or open a context menu at the end of a touch hold.
     */
    const swallow = (event: Event) => event.preventDefault();

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("selectstart", swallow);
    window.addEventListener("contextmenu", swallow);
    document.body.setAttribute("data-dh-dragging", "true");
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("selectstart", swallow);
      window.removeEventListener("contextmenu", swallow);
      document.body.removeAttribute("data-dh-dragging");
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [session, resolve, drop, cancel]);

  /* Escape abandons any drag, from either input path. */
  useEffect(() => {
    if (session === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      cancel();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [session, cancel]);

  /*
   * The click a pointer release synthesises belongs to the drag, not to the row
   * underneath it. One capture-phase listener for the life of the provider eats
   * exactly one click, and only after a pointer drag has actually happened.
   */
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!suppressClickRef.current) return;
      suppressClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("click", onClick, true);
      if (suppressTimer.current !== null) clearTimeout(suppressTimer.current);
    };
  }, []);

  const api = useMemo<DragApi>(
    () => ({
      session,
      registerTarget,
      startPointerDrag,
      startKeyboardDrag,
      nudge,
      drop,
      cancel,
    }),
    [
      session,
      registerTarget,
      startPointerDrag,
      startKeyboardDrag,
      nudge,
      drop,
      cancel,
    ],
  );

  return (
    <DragContext.Provider value={api}>
      {children}
      <DragPreviewLayer session={session} />
      {/*
       * ONE live region for every spatial operation in the product. It is
       * `polite`: a drag is driven by the owner and its running commentary must
       * not interrupt what they are already being told. Refusals still arrive
       * assertively — through the notification system, which is unchanged.
       */}
      <div
        className="dh-visually-hidden"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </div>
    </DragContext.Provider>
  );
}

/**
 * Measure the source so the preview is the same object — CAPPED.
 *
 * A Task row is the full width of the collection, and a preview at that width
 * is a 976px banner following the pointer: the "giant screenshot clone" §7 of
 * the brief rules out, and it runs off the edge of the viewport the moment the
 * owner drags right. The cap makes the preview a recognisable object rather
 * than a copy of the page, and it is applied here rather than in CSS so the
 * GRAB OFFSET can be capped with it — otherwise the pointer ends up beside the
 * preview instead of holding it.
 *
 * A preview narrower than the cap keeps its own width: a checklist step is
 * already the size of an object.
 */
const MAX_PREVIEW_WIDTH_PX = 360;
/** Keep the pointer inside the preview rather than off its trailing edge. */
const PREVIEW_GRAB_INSET_PX = 24;

function previewGeometry(
  element: HTMLElement | null,
  point: DragPoint | undefined,
) {
  if (element === null) return null;
  const rect = element.getBoundingClientRect();
  const width = Math.min(rect.width, MAX_PREVIEW_WIDTH_PX);
  const grabbedAt = point ? point.x - rect.left : rect.width / 2;
  return {
    width,
    height: rect.height,
    offsetX: Math.min(grabbedAt, Math.max(width - PREVIEW_GRAB_INSET_PX, 0)),
    offsetY: point ? point.y - rect.top : rect.height / 2,
  };
}

/**
 * Scroll the container under the pointer when the pointer is near its edge.
 *
 * The nearest genuinely scrollable ancestor wins and the viewport is the
 * fallback — so dragging to the bottom of a Drawer scrolls the Drawer, and
 * dragging to the bottom of the window scrolls the page. It moves only while the
 * pointer is inside the activation band, so leaving the band stops it on the
 * same frame.
 */
function autoScroll(point: DragPoint): void {
  const container = scrollableUnder(point);
  if (container === null) {
    if (point.y < AUTOSCROLL_EDGE_PX) {
      window.scrollBy(0, -AUTOSCROLL_STEP_PX);
    } else if (point.y > window.innerHeight - AUTOSCROLL_EDGE_PX) {
      window.scrollBy(0, AUTOSCROLL_STEP_PX);
    }
    return;
  }
  const rect = container.getBoundingClientRect();
  if (point.y - rect.top < AUTOSCROLL_EDGE_PX) {
    container.scrollTop -= AUTOSCROLL_STEP_PX;
  } else if (rect.bottom - point.y < AUTOSCROLL_EDGE_PX) {
    container.scrollTop += AUTOSCROLL_STEP_PX;
  }
}

/** The nearest scrollable ancestor of the element under `point`, or null. */
function scrollableUnder(point: DragPoint): HTMLElement | null {
  // The preview layer is `pointer-events: none`, so this never returns it.
  let node: Element | null = document.elementFromPoint(point.x, point.y);
  while (node instanceof HTMLElement) {
    if (node.scrollHeight > node.clientHeight + 1) {
      const overflow = getComputedStyle(node).overflowY;
      if (overflow === "auto" || overflow === "scroll") return node;
    }
    node = node.parentElement;
  }
  return null;
}
