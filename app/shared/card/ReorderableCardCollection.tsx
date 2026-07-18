/**
 * DS-04 — a generic, accessible, entity-agnostic reorderable collection.
 *
 * DESIGN_SYSTEM.md requires Cards to support drag with a keyboard equivalent. This
 * collection provides BOTH over the browser platform (Pointer Events + keyboard) —
 * no drag-and-drop dependency:
 *   - pointer users grab the handle and drag to a new position;
 *   - keyboard users focus the handle, press Enter/Space to pick up, Arrow
 *     Up/Down to move, Enter/Space to drop, Escape to cancel (restoring order);
 *   - every move is announced through a live region;
 *   - reordering emits INTENT (`onReorder(nextIds, detail)`) — it never mutates
 *     business data and never touches a database;
 *   - non-reorderable cards cannot be moved and stay pinned at their index;
 *   - the order is always a permutation, so a card can never disappear or
 *     duplicate; a card removed mid-drag cancels cleanly; focus stays on the handle.
 *
 * It is entity-agnostic: the consumer supplies items, an id/label accessor and a
 * `renderItem` that places the provided handle on a `<Card>`.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

import { CardReorderHandle } from "./CardReorderHandle";
import type { CardReorderHandleProps } from "./CardReorderHandle";
import {
  moveByStep,
  moveToReorderablePosition,
  ordersDiffer,
  reorderablePositionForPointer,
} from "./reorder";
import type { CardDensity } from "./types";

export interface ReorderDetail {
  readonly id: string;
  readonly fromIndex: number;
  readonly toIndex: number;
}

export interface ReorderItemApi {
  /** Spread onto `<CardReorderHandle {...handleProps} />`. */
  readonly handleProps: CardReorderHandleProps & {
    ref: (element: HTMLButtonElement | null) => void;
    [dataAttribute: `data-${string}`]: string | undefined;
  };
  readonly isGrabbed: boolean;
  /** 1-based absolute position in the collection. */
  readonly position: number;
  readonly size: number;
}

export interface ReorderableCardCollectionProps<T> {
  readonly items: readonly T[];
  readonly getItemId: (item: T) => string;
  /** Accessible label used to name the handle and announcements. */
  readonly getItemLabel: (item: T) => string;
  readonly isReorderable?: (item: T) => boolean;
  readonly onReorder: (nextIds: string[], detail: ReorderDetail) => void;
  readonly renderItem: (item: T, api: ReorderItemApi) => ReactNode;
  readonly ariaLabel: string;
  readonly presentation?: "list" | "grid";
  readonly density?: CardDensity;
  readonly className?: string;
}

interface DragState {
  readonly id: string;
  readonly mode: "keyboard" | "pointer";
}

export function ReorderableCardCollection<T>({
  items,
  getItemId,
  getItemLabel,
  isReorderable,
  onReorder,
  renderItem,
  ariaLabel,
  presentation = "list",
  density = "comfortable",
  className,
}: ReorderableCardCollectionProps<T>) {
  const instructionsId = useId();
  const committedOrder = useMemo(
    () => items.map(getItemId),
    [items, getItemId],
  );
  const itemsById = useMemo(() => {
    const map = new Map<string, T>();
    for (const item of items) {
      map.set(getItemId(item), item);
    }
    return map;
  }, [items, getItemId]);
  const pinned = useMemo(() => {
    const set = new Set<string>();
    if (isReorderable) {
      for (const item of items) {
        if (!isReorderable(item)) {
          set.add(getItemId(item));
        }
      }
    }
    return set;
  }, [items, getItemId, isReorderable]);

  const [workingOrder, setWorkingOrder] = useState<string[] | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const originalOrderRef = useRef<string[]>([]);
  const handleEls = useRef(new Map<string, HTMLButtonElement | null>());
  const itemEls = useRef(new Map<string, HTMLLIElement | null>());

  const renderOrder = workingOrder ?? committedOrder;

  const labelFor = useCallback(
    (id: string) => {
      const item = itemsById.get(id);
      return item ? getItemLabel(item) : id;
    },
    [itemsById, getItemLabel],
  );

  const positionText = useCallback(
    (order: readonly string[], id: string) =>
      `position ${order.indexOf(id) + 1} of ${order.length}`,
    [],
  );

  const endDrag = useCallback(() => {
    setDrag(null);
    setWorkingOrder(null);
  }, []);

  const commit = useCallback(
    (order: string[], id: string) => {
      if (ordersDiffer(order, committedOrder)) {
        onReorder(order, {
          id,
          fromIndex: committedOrder.indexOf(id),
          toIndex: order.indexOf(id),
        });
      }
    },
    [committedOrder, onReorder],
  );

  // If the grabbed card is removed (or its collection changes) mid-drag, cancel
  // cleanly rather than leaving a dangling grab.
  useEffect(() => {
    if (drag && !committedOrder.includes(drag.id)) {
      endDrag();
      setAnnouncement("");
    }
  }, [drag, committedOrder, endDrag]);

  const pickUp = useCallback(
    (id: string, mode: DragState["mode"]) => {
      if (pinned.has(id)) {
        return;
      }
      originalOrderRef.current = [...committedOrder];
      setWorkingOrder([...committedOrder]);
      setDrag({ id, mode });
      setAnnouncement(
        `Picked up ${labelFor(id)}. ${positionText(committedOrder, id)}. Use the arrow keys to move, Enter to drop, Escape to cancel.`,
      );
    },
    [committedOrder, labelFor, pinned, positionText],
  );

  const drop = useCallback(
    (id: string) => {
      const order = workingOrder ?? committedOrder;
      commit(order, id);
      setAnnouncement(`Dropped ${labelFor(id)}. ${positionText(order, id)}.`);
      endDrag();
    },
    [workingOrder, committedOrder, commit, labelFor, positionText, endDrag],
  );

  const cancel = useCallback(
    (id: string) => {
      const restored = originalOrderRef.current;
      setAnnouncement(
        `Reorder cancelled. ${labelFor(id)} returned to ${positionText(restored, id)}.`,
      );
      endDrag();
    },
    [labelFor, positionText, endDrag],
  );

  const handleKeyDown = useCallback(
    (id: string) => (event: React.KeyboardEvent<HTMLButtonElement>) => {
      const grabbed = drag?.id === id;
      if (!grabbed) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          pickUp(id, "keyboard");
        }
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        drop(id);
      } else if (event.key === "Escape") {
        event.preventDefault();
        cancel(id);
      } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        const base = workingOrder ?? committedOrder;
        const next = moveByStep(
          base,
          pinned,
          id,
          event.key === "ArrowUp" ? -1 : 1,
        );
        if (ordersDiffer(next, base)) {
          setWorkingOrder(next);
          setAnnouncement(
            `${labelFor(id)} moved to ${positionText(next, id)}.`,
          );
        }
      }
    },
    [
      drag,
      workingOrder,
      committedOrder,
      pinned,
      pickUp,
      drop,
      cancel,
      labelFor,
      positionText,
    ],
  );

  // Pointer drag: track the pointer against item midpoints and reorder live.
  useEffect(() => {
    if (!drag || drag.mode !== "pointer") {
      return;
    }
    const id = drag.id;
    const onMove = (event: PointerEvent) => {
      const midpoints = new Map<string, number>();
      for (const [itemId, element] of itemEls.current) {
        if (element) {
          const rect = element.getBoundingClientRect();
          midpoints.set(itemId, rect.top + rect.height / 2);
        }
      }
      const base = workingOrder ?? committedOrder;
      const targetPos = reorderablePositionForPointer(
        base,
        pinned,
        midpoints,
        event.clientY,
      );
      const next = moveToReorderablePosition(base, pinned, id, targetPos);
      if (ordersDiffer(next, base)) {
        setWorkingOrder(next);
        setAnnouncement(`${labelFor(id)} moved to ${positionText(next, id)}.`);
      }
    };
    const onUp = () => drop(id);
    // Named handler so cleanup removes it too — an anonymous `pointercancel`
    // listener would survive a normal pointer-up (it never fires to trigger its
    // `once`), and this effect re-runs on every move, so stale cancel callbacks
    // would accumulate and a later cancel could end the wrong (current) drag.
    const onCancel = () => cancel(id);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [
    drag,
    workingOrder,
    committedOrder,
    pinned,
    labelFor,
    positionText,
    drop,
    cancel,
  ]);

  const listClasses = [
    "dh-card-collection",
    "dh-card-collection--reorderable",
    `dh-card-collection--${presentation}`,
    `dh-card-collection--${density}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <p id={instructionsId} className="dh-visually-hidden">
        Press Enter or Space on a reorder handle to pick up the card, the arrow
        keys to move it, Enter to drop, and Escape to cancel.
      </p>
      <ul className={listClasses} aria-label={ariaLabel}>
        {renderOrder.map((id) => {
          const item = itemsById.get(id);
          if (item === undefined) {
            return null;
          }
          const grabbed = drag?.id === id;
          const reorderable = !pinned.has(id);
          const handleProps: ReorderItemApi["handleProps"] = {
            ref: (element) => {
              handleEls.current.set(id, element);
            },
            disabled: !reorderable,
            "aria-label": `Reorder ${getItemLabel(item)}`,
            "aria-describedby": instructionsId,
            "aria-pressed": grabbed,
            "data-grabbed": grabbed ? "true" : undefined,
            onKeyDown: handleKeyDown(id),
            onPointerDown: reorderable
              ? (event) => {
                  if (event.button !== 0) {
                    return;
                  }
                  event.preventDefault();
                  pickUp(id, "pointer");
                }
              : undefined,
          };
          return (
            <li
              key={id}
              className="dh-card-collection__item"
              data-grabbed={grabbed ? "true" : undefined}
              ref={(element) => {
                itemEls.current.set(id, element);
              }}
            >
              {renderItem(item, {
                handleProps,
                isGrabbed: grabbed,
                position: renderOrder.indexOf(id) + 1,
                size: renderOrder.length,
              })}
            </li>
          );
        })}
      </ul>
      <div
        className="dh-visually-hidden"
        role="status"
        aria-live="assertive"
        aria-atomic="true"
      >
        {announcement}
      </div>
    </>
  );
}

export { CardReorderHandle };
