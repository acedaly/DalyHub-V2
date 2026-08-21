/**
 * DHDS-11 — the grip, and the keyboard grammar behind it.
 *
 * Dragging in DalyHub is DELIBERATE. Rows are not draggable from every pixel:
 * a Task row is also a link, a checkbox, four editable values and a swipe
 * surface, and making its whole area a drag source would break scrolling on
 * touch and selection on a desktop. Every drag therefore starts from an explicit
 * handle — a real `<button>`, with an accessible name, that reveals with the
 * DHDS-08 row affordances on a fine pointer and is simply present on a coarse
 * one.
 *
 * ── The keyboard path is not a fallback ─────────────────────────────────────
 * The same button IS the keyboard control:
 *
 *   Enter / Space   pick up (and, while held, drop)
 *   ↑ / ↓           move one place, announced
 *   Escape          cancel; the object returns to where it was
 *
 * Arrow keys are captured ONLY while this handle is holding an object, so
 * nothing that arrows already do elsewhere on the row is taken away.
 *
 * A handle with no `home` — a Task row, which has no manual order to move
 * within — offers pointer dragging only, and its keyboard equivalent is the
 * DHDS-10 control beside it that changes the same field by choosing. That is
 * the rule the whole phase rests on: drag is an accelerator, never the only
 * path.
 */

import {
  useCallback,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import { useDrag } from "./drag-context";
import type { DragPayload } from "./drag-model";

export interface DragHandleHome {
  /** The sortable collection this object currently lives in. */
  readonly targetId: string;
  /** Its index there, so a keyboard pick-up starts from the truth. */
  readonly index: number;
}

export interface UseDragHandleOptions {
  readonly payload: DragPayload;
  /** The object, drawn by the surface that owns it. Never a generic card. */
  readonly renderPreview: () => ReactNode;
  /** Present when this object sits in a manually ordered collection. */
  readonly home?: DragHandleHome;
  /** The handle's accessible name — "Reorder <title>" / "Move <title>". */
  readonly label: string;
  /** The id of the once-rendered instructions paragraph, for `aria-describedby`. */
  readonly describedBy?: string;
  readonly disabled?: boolean;
}

export interface DragHandleBindings {
  readonly type: "button";
  readonly disabled: boolean;
  readonly "aria-label": string;
  readonly "aria-describedby": string | undefined;
  readonly "aria-pressed": boolean;
  readonly "data-grabbed": "true" | undefined;
  readonly onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

export interface DragHandleState {
  readonly handleProps: DragHandleBindings;
  /** True while THIS object is the one being dragged. */
  readonly isGrabbed: boolean;
}

export function useDragHandle({
  payload,
  renderPreview,
  home,
  label,
  describedBy,
  disabled = false,
}: UseDragHandleOptions): DragHandleState {
  const { session, startPointerDrag, startKeyboardDrag, nudge, drop } =
    useDrag();
  const isGrabbed = session?.payload.id === payload.id;

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      if (disabled || event.button !== 0) return;
      /*
       * `preventDefault` stops the browser starting a text selection or a
       * native image drag from the press. It does not stop the button's own
       * click, which the provider swallows once, after the release.
       */
      event.preventDefault();
      const source = event.currentTarget.closest<HTMLElement>(
        "[data-dh-drag-item]",
      );
      startPointerDrag(payload, {
        sourceElement: source,
        renderPreview,
        point: { x: event.clientX, y: event.clientY },
        ...(home ? { homeTargetId: home.targetId, homeIndex: home.index } : {}),
      });
    },
    [disabled, payload, renderPreview, home, startPointerDrag],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (disabled) return;
      const holding = isGrabbed && session?.mode === "keyboard";
      if (!holding) {
        // Only a collection with an order can be entered from the keyboard.
        // Without one there is nowhere to move TO, and the equivalent path is
        // the contextual control beside this handle.
        if (home === undefined) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          startKeyboardDrag(payload, {
            sourceElement: null,
            renderPreview,
            homeTargetId: home.targetId,
            homeIndex: home.index,
          });
        }
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        drop();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        nudge(-1);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        nudge(1);
      }
      // Escape is the provider's, so one key ends a drag from anywhere.
    },
    [
      disabled,
      isGrabbed,
      session,
      home,
      payload,
      renderPreview,
      startKeyboardDrag,
      nudge,
      drop,
    ],
  );

  return {
    isGrabbed,
    handleProps: {
      type: "button",
      disabled,
      "aria-label": label,
      "aria-describedby": describedBy,
      "aria-pressed": isGrabbed,
      "data-grabbed": isGrabbed ? "true" : undefined,
      onPointerDown,
      onKeyDown,
    },
  };
}
