/**
 * DHDS-11 — a manually ordered collection, made movable.
 *
 * The ONE reorder surface in DalyHub. A collection qualifies for it only when
 * its order is the OWNER'S, stored, and read back in that order — a checklist's
 * steps, a Goal's milestones. A list whose order is derived from data (a due
 * date, a priority, the smart order) must not use this: the drop would appear to
 * work and the next read would undo it, which is the "fake persistence" the
 * phase brief forbids.
 *
 * ── What it draws ───────────────────────────────────────────────────────────
 * A LIVE reorder rather than an insertion line. The item under the pointer moves
 * out of the way as the pointer crosses its centre, so the gap the object will
 * land in is always visible and is always exactly one slot. That is the
 * placeholder: the source position never collapses, the list never jumps, and
 * the object's own row is drawn quiet (`data-dh-drag-source`) while the floating
 * preview carries it. There is no dashed rectangle anywhere.
 *
 * ── What it emits ───────────────────────────────────────────────────────────
 * INTENT — `onReorder(nextIds, detail)` — and never a mutation. The surface that
 * owns the collection posts its own canonical intent, so the drag and the item
 * menu's "Move up" write through exactly the same route.
 *
 * ── The staleness rule ──────────────────────────────────────────────────────
 * An order is only meaningful over the list it was computed against. If the
 * collection changes while an object is held — another device added a step, a
 * sibling was deleted — the drag is cancelled and said so, and no order is
 * emitted. The canonical repositories refuse a non-matching order as well; this
 * is the courtesy, never the protection.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

import { DragHandle } from "./DragHandle";
import { useDrag } from "./drag-context";
import {
  insertionIndexForPointer,
  isPermutationOf,
  moveWithin,
  ordersDiffer,
} from "./drag-model";
import { useDragHandle, type DragHandleBindings } from "./use-drag-handle";
import { useDropTarget } from "./use-drop-target";

export interface SortableReorderDetail {
  readonly id: string;
  readonly fromIndex: number;
  readonly toIndex: number;
}

export interface SortableItemApi {
  /** Spread onto `<SortableList.Handle {...handleProps} />`, or any button. */
  readonly handleProps: DragHandleBindings;
  /** True while this item is the one being moved. */
  readonly isGrabbed: boolean;
  /** 1-based position in the collection as currently drawn. */
  readonly position: number;
  readonly size: number;
}

export interface SortableListProps<T> {
  /**
   * Stable across renders and unique on the page — a Task's checklist uses
   * `checklist:<taskId>`. It is the drop target's identity, so a value derived
   * from an array index would make the destination change when the page did.
   */
  readonly id: string;
  readonly ariaLabel: string;
  /** The drag payload's `kind`; what a destination matches on. */
  readonly kind: string;
  readonly items: readonly T[];
  readonly getItemId: (item: T) => string;
  /** The item's own name — the whole of what a screen reader hears moving. */
  readonly getItemLabel: (item: T) => string;
  readonly onReorder: (
    nextIds: readonly string[],
    detail: SortableReorderDetail,
  ) => void;
  readonly renderItem: (item: T, api: SortableItemApi) => ReactNode;
  /** The floating object. Defaults to the item as the list draws it. */
  readonly renderPreview?: (item: T) => ReactNode;
  /** A read-only surface renders its rows and offers no handle. */
  readonly disabled?: boolean;
  readonly className?: string;
}

export function SortableList<T>({
  id,
  ariaLabel,
  kind,
  items,
  getItemId,
  getItemLabel,
  onReorder,
  renderItem,
  renderPreview,
  disabled = false,
  className,
}: SortableListProps<T>) {
  const instructionsId = useId();
  const { session, cancel } = useDrag();

  const committed = useMemo(() => items.map(getItemId), [items, getItemId]);
  const itemsById = useMemo(() => {
    const map = new Map<string, T>();
    for (const item of items) map.set(getItemId(item), item);
    return map;
  }, [items, getItemId]);

  /** The rendered `<li>` per id, for measuring the live insertion index. */
  const slots = useRef(new Map<string, HTMLLIElement | null>());
  /**
   * The order the drag started against. An order is only emittable over the list
   * it was computed for; if `committed` stops being a permutation of this, the
   * drag is stale.
   */
  const baseline = useRef<readonly string[] | null>(null);

  const heldId =
    session !== null && session.targetId === id ? session.payload.id : null;
  const held = heldId !== null && itemsById.has(heldId) ? heldId : null;

  /*
   * The order as DRAWN: the committed order with the held object moved to the
   * index the session currently resolves to. Deriving it rather than storing it
   * is what makes the list impossible to desynchronise from the drag.
   */
  const order = useMemo(() => {
    if (
      held === null ||
      session?.index === null ||
      session?.index === undefined
    ) {
      return committed;
    }
    return moveWithin(committed, held, session.index);
  }, [committed, held, session?.index]);

  const resolveIndex = useCallback(
    (point: { x: number; y: number }) => {
      const centres: number[] = [];
      for (const itemId of order) {
        const element = slots.current.get(itemId);
        if (!element) {
          centres.push(Number.NaN);
          continue;
        }
        const rect = element.getBoundingClientRect();
        centres.push(rect.top + rect.height / 2);
      }
      return insertionIndexForPointer(centres, point.y);
    },
    [order],
  );

  const commit = useCallback(
    (itemId: string, toIndex: number | null) => {
      const base = baseline.current;
      baseline.current = null;
      if (toIndex === null) return;
      /*
       * Refuse rather than guess. A list that changed under the drag would be
       * reordered against a shape it no longer has, so nothing is emitted and
       * the surface keeps the truth it was last given.
       */
      if (base !== null && !isPermutationOf(base, committed)) return;
      const next = moveWithin(committed, itemId, toIndex);
      if (!ordersDiffer(next, committed)) return;
      onReorder(next, {
        id: itemId,
        fromIndex: committed.indexOf(itemId),
        toIndex: next.indexOf(itemId),
      });
    },
    [committed, onReorder],
  );

  /*
   * A drag over a list that has since changed is not recoverable, so it ends
   * where it stands and says why. This is the courtesy; the repository's own
   * membership check inside the write is the protection.
   */
  useEffect(() => {
    if (held === null) return;
    const base = baseline.current;
    if (base === null || isPermutationOf(base, committed)) return;
    baseline.current = null;
    cancel("this list changed somewhere else.");
  }, [held, committed, cancel]);

  const target = useDropTarget({
    id,
    label: ariaLabel,
    disabled,
    accepts: (payload) => payload.kind === kind && itemsById.has(payload.id),
    ordering: {
      size: () => committed.length,
      resolveIndex,
    },
    onDrop: (payload, detail) => commit(payload.id, detail.index),
  });

  return (
    <>
      <p id={instructionsId} className="dh-visually-hidden">
        Press Enter or Space to pick this item up, the up and down arrow keys to
        move it, Enter to drop it, and Escape to cancel.
      </p>
      <ul
        ref={target.ref}
        className={["dh-sortable", className].filter(Boolean).join(" ")}
        aria-label={ariaLabel}
        data-dh-sorting={held !== null ? "true" : undefined}
      >
        {order.map((itemId, index) => {
          const item = itemsById.get(itemId);
          if (item === undefined) return null;
          return (
            <SortableRow
              key={itemId}
              id={itemId}
              index={index}
              size={order.length}
              targetId={id}
              kind={kind}
              label={getItemLabel(item)}
              disabled={disabled}
              describedBy={instructionsId}
              onLift={() => {
                baseline.current = committed;
              }}
              renderPreview={() =>
                renderPreview
                  ? renderPreview(item)
                  : renderItem(item, {
                      handleProps: INERT_HANDLE,
                      isGrabbed: false,
                      position: index + 1,
                      size: order.length,
                    })
              }
              slotRef={(element) => {
                if (element === null) slots.current.delete(itemId);
                else slots.current.set(itemId, element);
              }}
              render={renderItem}
              item={item}
            />
          );
        })}
      </ul>
    </>
  );
}

export { DragHandle as SortableHandle };

/**
 * The preview renders the item through the SAME `renderItem` the list uses, so
 * the floating object is the object. Its handle is inert: a preview is a picture
 * of the thing being moved, not a second control for moving it.
 */
const INERT_HANDLE: DragHandleBindings = {
  type: "button",
  disabled: true,
  "aria-label": "",
  "aria-describedby": undefined,
  "aria-pressed": false,
  "data-grabbed": undefined,
  onPointerDown: () => {},
  onKeyDown: () => {},
};

function SortableRow<T>({
  id,
  item,
  index,
  size,
  targetId,
  kind,
  label,
  disabled,
  describedBy,
  onLift,
  renderPreview,
  slotRef,
  render,
}: {
  readonly id: string;
  readonly item: T;
  readonly index: number;
  readonly size: number;
  readonly targetId: string;
  readonly kind: string;
  readonly label: string;
  readonly disabled: boolean;
  readonly describedBy: string;
  readonly onLift: () => void;
  readonly renderPreview: () => ReactNode;
  readonly slotRef: (element: HTMLLIElement | null) => void;
  readonly render: (item: T, api: SortableItemApi) => ReactNode;
}) {
  const { handleProps, isGrabbed } = useDragHandle({
    payload: { kind, id, label },
    renderPreview,
    home: { targetId, index },
    label: `Reorder ${label}`,
    describedBy,
    disabled,
  });

  return (
    <li
      ref={slotRef}
      className="dh-sortable__item"
      data-dh-drag-item="true"
      data-dh-drag-source={isGrabbed ? "true" : undefined}
    >
      {render(item, {
        handleProps: {
          ...handleProps,
          onPointerDown: (event) => {
            onLift();
            handleProps.onPointerDown(event);
          },
          onKeyDown: (event) => {
            if (event.key === "Enter" || event.key === " ") onLift();
            handleProps.onKeyDown(event);
          },
        },
        isGrabbed,
        position: index + 1,
        size,
      })}
    </li>
  );
}
