/**
 * DHDS-11 — the floating object.
 *
 * While something is being dragged there is exactly one of these on screen: the
 * OBJECT itself, at the size it was lifted at, under the pointer, drawn by the
 * surface that owns it. Not a generic card, not a screenshot clone, and not a
 * new visual language — a Task drag preview is a Task row with the facts that
 * identify it, which is what makes the operation read as moving that actual
 * thing.
 *
 * ── Why it follows the pointer through a ref ────────────────────────────────
 * A `transform` written straight onto the element, inside one animation frame,
 * costs no React render and no layout. Routing the pointer position through
 * state would re-render the whole shell on every frame of every drag, which is
 * the difference between "immediate" and "nearly smooth" on a long list.
 *
 * ── Motion ──────────────────────────────────────────────────────────────────
 * DHDS-08's, unchanged and unextended. The preview has NO transition while it is
 * tracking (a transition on a followed pointer is lag, by construction); the
 * settle back into the list is `--dh-motion-base` on `--dh-ease-emphasized`,
 * which is the grammar DHDS-08 recorded for this exact case. There is no
 * rotation, no tilt, no spring and no scale.
 *
 * A KEYBOARD drag renders no preview at all. Nothing is following anything —
 * the object moves through the collection itself and the live region says where
 * it now is, which is the whole of the feedback a keyboard user can act on.
 */

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import type { DragSession } from "./drag-context";

export interface DragPreviewLayerProps {
  readonly session: DragSession | null;
}

export function DragPreviewLayer({ session }: DragPreviewLayerProps) {
  const element = useRef<HTMLDivElement | null>(null);
  const frame = useRef<number | null>(null);
  const point = useRef(session?.origin ?? null);

  const preview = session?.preview ?? null;
  const active =
    session !== null && session.mode === "pointer" && preview !== null;

  useEffect(() => {
    if (!active) return;
    const place = () => {
      frame.current = null;
      const node = element.current;
      const current = point.current;
      if (node === null || current === null || preview === null) return;
      node.style.transform = `translate3d(${current.x - preview.offsetX}px, ${
        current.y - preview.offsetY
      }px, 0)`;
    };
    const onMove = (event: PointerEvent) => {
      point.current = { x: event.clientX, y: event.clientY };
      if (frame.current === null) {
        frame.current = requestAnimationFrame(place);
      }
    };
    place();
    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
        frame.current = null;
      }
    };
  }, [active, preview]);

  // Keep the pick-up point current for the next drag's first frame.
  useEffect(() => {
    point.current = session?.origin ?? null;
  }, [session]);

  if (!active || session === null || preview === null) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="dh-drag-layer" aria-hidden="true">
      <div
        ref={element}
        className="dh-drag-preview"
        style={{ width: `${preview.width}px` }}
      >
        {session.renderPreview()}
      </div>
    </div>,
    document.body,
  );
}
