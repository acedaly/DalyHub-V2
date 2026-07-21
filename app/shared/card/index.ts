/**
 * DS-04 — public entry for the Shared Card.
 *
 * ONE configurable, entity-agnostic Card (DESIGN_SYSTEM.md → Cards) plus the
 * collection containers that lay it out in lists, boards and grids, including an
 * accessible pointer + keyboard reorder collection. No TaskCard/ProjectCard/… —
 * every entity type is this one Card configured with data.
 */

export { Card } from "./Card";
export { CardCollection } from "./CardCollection";
export type { CardCollectionProps } from "./CardCollection";
export { ReorderableCardCollection } from "./ReorderableCardCollection";
export type {
  ReorderableCardCollectionProps,
  ReorderDetail,
  ReorderItemApi,
} from "./ReorderableCardCollection";
export { CardReorderHandle } from "./CardReorderHandle";
export type { CardReorderHandleProps } from "./CardReorderHandle";

export {
  moveByStep,
  moveToReorderablePosition,
  ordersDiffer,
  reorderablePositionForPointer,
  reorderablePositionOf,
} from "./reorder";

// TODAY-06 — touch swipe quick actions (pure model + the shared single-open close).
export {
  clampOffset,
  closeActiveSwipeTray,
  createSwipeRegistry,
  DEFAULT_SWIPE_THRESHOLDS,
  FALLBACK_TRAY_WIDTH,
  projectOffset,
  resolveRelease,
  resolveSwipeIntent,
} from "./swipe-model";
export type {
  SwipeIntent,
  SwipeRegistry,
  SwipeRest,
  SwipeThresholds,
  SwipeTrayHandle,
} from "./swipe-model";

export { normaliseProgress } from "./types";
export type {
  CardAction,
  CardContext,
  CardDateLabel,
  CardDensity,
  CardMetaItem,
  CardPresentation,
  CardProgress,
  CardProps,
  CardSelection,
  CardStatus,
  CardTone,
  NormalisedProgress,
} from "./types";
