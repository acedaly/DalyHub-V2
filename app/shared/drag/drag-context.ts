/**
 * DHDS-11 — the drag session contract.
 *
 * Separated from the provider so a consumer imports the TYPES without importing
 * the machinery, and so the context object has exactly one identity in the
 * bundle (the same split `feedback-context.ts` makes, for the same reason).
 */

import { createContext, useContext, type ReactNode } from "react";

import type { DragPayload } from "./drag-model";

/** A viewport point. */
export interface DragPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * How the drag is being driven.
 *
 * It is a real distinction rather than bookkeeping: a pointer drag resolves its
 * destination by HIT-TESTING and can leave one target for another; a keyboard
 * drag stays inside the collection it was picked up in and moves by index. The
 * two paths must never be able to reach each other's rules.
 */
export type DragMode = "pointer" | "keyboard";

/** The floating preview's geometry, measured from the source at pick-up. */
export interface DragPreviewGeometry {
  readonly width: number;
  readonly height: number;
  /** Where inside the source the pointer grabbed it. Keeps the object under the thumb. */
  readonly offsetX: number;
  readonly offsetY: number;
}

/** Everything true about the one drag currently in progress. */
export interface DragSession {
  readonly payload: DragPayload;
  readonly mode: DragMode;
  /** The destination currently resolved, or null when over nothing that accepts it. */
  readonly targetId: string | null;
  /** The insertion index, for a target that orders its children. Else null. */
  readonly index: number | null;
  /**
   * Where the pointer was when the object was lifted. Null for a keyboard drag,
   * which has no pointer.
   *
   * The pick-up point ONLY. The live position is deliberately absent from this
   * record: carrying it here would make every pointer frame a React state change
   * and re-render the whole shell sixty times a second. `DragPreviewLayer`
   * tracks the pointer itself and writes a transform through a ref, so the
   * session changes only when the DESTINATION changes — which is the only thing
   * the interface actually has to redraw for.
   */
  readonly origin: DragPoint | null;
  readonly preview: DragPreviewGeometry | null;
  /** The preview's contents — the OBJECT, drawn by the surface that owns it. */
  readonly renderPreview: () => ReactNode;
}

/** How a target orders the things dropped into it, when it does. */
export interface DropTargetOrdering {
  /** How many slots the target currently has. Read at nudge time, never cached. */
  readonly size: () => number;
  /** The index a pointer at this point is asking for. */
  readonly resolveIndex: (point: DragPoint) => number;
}

/** A registered destination. Registration is a ref-map entry, never React state. */
export interface DropTargetRegistration {
  readonly id: string;
  /**
   * Whether this destination would accept THIS object — including whether the
   * drop would change anything. A Project a Task already belongs to answers
   * false, so it stays quiet rather than lighting up and doing nothing.
   */
  readonly accepts: (payload: DragPayload) => boolean;
  /** The element hit-testing measures. Null while unmounted. */
  readonly element: () => HTMLElement | null;
  /** The destination's own name, spoken and drawn verbatim ("Personal", "Today"). */
  readonly label: string;
  readonly ordering?: DropTargetOrdering;
  readonly onDrop: (
    payload: DragPayload,
    detail: { readonly index: number | null },
  ) => void;
}

export interface StartDragOptions {
  /** The element that IS the object — measured for the preview's geometry. */
  readonly sourceElement: HTMLElement | null;
  readonly renderPreview: () => ReactNode;
  /** Pointer mode: where the grab happened. */
  readonly point?: DragPoint;
  /** Keyboard mode: the collection the object was picked up in. */
  readonly homeTargetId?: string;
  /** Keyboard mode: the index it was picked up from. */
  readonly homeIndex?: number;
}

export interface DragApi {
  readonly session: DragSession | null;
  /** Register a destination for the life of a component. Returns the unregister. */
  readonly registerTarget: (registration: DropTargetRegistration) => () => void;
  readonly startPointerDrag: (
    payload: DragPayload,
    options: StartDragOptions,
  ) => void;
  readonly startKeyboardDrag: (
    payload: DragPayload,
    options: StartDragOptions,
  ) => void;
  /** Keyboard only: move the held object `delta` slots inside its collection. */
  readonly nudge: (delta: number) => void;
  /** Commit the drag at the current destination. */
  readonly drop: () => void;
  /** Abandon it. The object stays exactly where it was. */
  readonly cancel: (reason?: string) => void;
}

const NO_DRAG: DragApi = {
  session: null,
  registerTarget: () => () => {},
  startPointerDrag: () => {},
  startKeyboardDrag: () => {},
  nudge: () => {},
  drop: () => {},
  cancel: () => {},
};

export const DragContext = createContext<DragApi>(NO_DRAG);

/**
 * The drag session, from anywhere inside the shell.
 *
 * Outside a `DragProvider` it returns an INERT api rather than throwing: a
 * surface rendered in isolation (a unit test, a design route) draws its rows and
 * its handles do nothing, which is the correct degradation for an accelerator.
 * Nothing in DalyHub may be reachable ONLY by drag, so nothing is lost.
 */
export function useDrag(): DragApi {
  return useContext(DragContext);
}
