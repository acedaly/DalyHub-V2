/**
 * DHDS-11 — registering a destination.
 *
 * A destination is a REGION plus the question "would dropping this here change
 * anything?". Both halves matter: §"Invalid drop" of the phase brief forbids a
 * surface that lights up and then refuses, so `accepts` is asked about the
 * actual payload — a Project a Task already belongs to answers false and stays
 * quiet, exactly like a Project of a different workspace would.
 *
 * The hook returns the three facts a destination draws itself from:
 *
 *   - `ref`      the element to measure and to paint;
 *   - `isCandidate`  a drag this destination COULD take is in progress;
 *   - `isActive`     the pointer (or the keyboard's held object) is on it now.
 *
 * Progressive disclosure is the difference between those two: a candidate earns
 * a minimal affordance, the active one earns the clear treatment, and everything
 * else on the page stays exactly as it was. A screen full of glowing targets is
 * what this split exists to prevent.
 */

import { useEffect, useRef } from "react";

import { useDrag } from "./drag-context";
import type { DropTargetOrdering } from "./drag-context";
import type { DragPayload } from "./drag-model";

export interface UseDropTargetOptions {
  /** Stable within the page. A Project bucket uses its record id, not its index. */
  readonly id: string;
  /** The destination's own name, spoken and drawn verbatim. */
  readonly label: string;
  readonly accepts: (payload: DragPayload) => boolean;
  readonly onDrop: (
    payload: DragPayload,
    detail: { readonly index: number | null },
  ) => void;
  /** Present only when this destination ORDERS what it holds. */
  readonly ordering?: DropTargetOrdering;
  /** A read-only or archived surface registers nothing at all. */
  readonly disabled?: boolean;
}

export interface DropTargetState {
  readonly ref: (element: HTMLElement | null) => void;
  readonly isCandidate: boolean;
  readonly isActive: boolean;
}

export function useDropTarget({
  id,
  label,
  accepts,
  onDrop,
  ordering,
  disabled = false,
}: UseDropTargetOptions): DropTargetState {
  const { session, registerTarget } = useDrag();
  const element = useRef<HTMLElement | null>(null);

  /*
   * The registration is stable for the life of the component and reads its
   * behaviour through refs.
   *
   * Re-registering whenever a caller's inline arrow function changed identity
   * would churn the registry on every parent render — and, worse, would
   * momentarily remove a destination the pointer is currently over.
   */
  const latest = useRef({ label, accepts, onDrop, ordering });
  latest.current = { label, accepts, onDrop, ordering };

  useEffect(() => {
    if (disabled) return;
    return registerTarget({
      id,
      element: () => element.current,
      get label() {
        return latest.current.label;
      },
      accepts: (payload) => latest.current.accepts(payload),
      onDrop: (payload, detail) => latest.current.onDrop(payload, detail),
      get ordering() {
        return latest.current.ordering;
      },
    });
  }, [id, disabled, registerTarget]);

  const isCandidate = !disabled && session !== null && accepts(session.payload);

  return {
    ref: (node) => {
      element.current = node;
    },
    isCandidate,
    isActive: isCandidate && session?.targetId === id,
  };
}
