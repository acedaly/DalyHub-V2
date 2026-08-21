/**
 * DHDS-11 — the public entry for spatial manipulation.
 *
 * Everything a surface needs to make an object movable, and nothing that would
 * let it invent a second way to do it. Before importing any of this, the answer
 * to all six questions in
 * `docs/design/DHDS_11_DRAG_REORDER_AND_OBJECT_CONTINUITY_2026_08.md` §"Can I
 * make this draggable?" must be yes. If it is not, the object is not draggable,
 * and the DHDS-10 control beside it is the whole answer.
 */

export { DragProvider } from "./DragProvider";
export { DragHandle, type DragHandleProps } from "./DragHandle";
export {
  SortableList,
  SortableHandle,
  type SortableItemApi,
  type SortableListProps,
  type SortableReorderDetail,
} from "./SortableList";
export { useDrag, type DragApi, type DragSession } from "./drag-context";
export {
  useDragHandle,
  type DragHandleBindings,
  type UseDragHandleOptions,
} from "./use-drag-handle";
export { useDropTarget, type UseDropTargetOptions } from "./use-drop-target";
export {
  dragCancelledMessage,
  dragDroppedMessage,
  dragMovedToMessage,
  dragOverMessage,
  dragPickUpMessage,
  dragPositionMessage,
  insertionIndexForPointer,
  isPermutationOf,
  moveByStep,
  moveWithin,
  ordersDiffer,
  type DragPayload,
} from "./drag-model";
