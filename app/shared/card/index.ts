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
  CardSelectionModifiers,
  CardStatus,
  CardTone,
  NormalisedProgress,
} from "./types";

/**
 * The rest of the card FAMILY (see `app/styles/card-family.css`). `Card` above is
 * the record card; these are the four presentations it cannot be, and they exist
 * so a module never forks one again.
 */
export { DashboardCard, type DashboardCardProps } from "./DashboardCard";
/** M3X — hierarchy Level 1: the one DOMINANT expressive surface on a page. */
export {
  ExpressiveSummary,
  MAX_SUMMARY_STATS,
  type ExpressiveSummaryProps,
  type SummaryRing,
  type SummaryStat,
} from "./ExpressiveSummary";
/**
 * The STAT CARD row — a page's figures, on the canvas, as quiet cards. The
 * restrained alternative to a tinted hero (DALYHUB_DESIGN_SYSTEM.md).
 */
export {
  StatCard,
  StatCardItem,
  StatCardRow,
  type StatCardProps,
  type StatCardTone,
} from "./StatCard";
/** M3X-02 — hierarchy Level 2: the supporting expressive surfaces beneath it. */
export {
  SupportingSurface,
  type SupportingSurfaceProps,
  type SupportingSurfaceTone,
} from "./SupportingSurface";
export {
  MetricTile,
  MetricRow,
  MetricRowItem,
  type MetricTileProps,
  type MetricTileTone,
} from "./MetricTile";
export { RecordRow, RecordRowList, type RecordRowProps } from "./RecordRow";
export { EntityCard, EntityCardGrid, type EntityCardProps } from "./EntityCard";
/**
 * UIX-02 — the two surfaces the spine's two most different records are drawn
 * as. A Project is a body of work being moved forward (a gallery card with a
 * measure); an Area is a permanent domain of life (a calm row with its
 * relationships). Both live here rather than in a module because an Area's
 * record renders Project cards and a Project's renders its Area, and a module
 * must not reach into another's internals (AGENTS.md §9).
 */
export {
  ProjectCard,
  type ProjectCardProps,
  type ProjectCardTone,
} from "./ProjectCard";
/*
 * UIX-03 — the third family, for the same reason there is a second: a Goal is
 * an OUTCOME being moved toward, which is a different question from a
 * Project's "how is this work going?". It lives here rather than in the Goals
 * module because Today and an Area's Goals tab render it too.
 */
export { GoalCard, type GoalCardProps, type GoalCardTone } from "./GoalCard";
export { EntityRow, EntityRowList, type EntityRowProps } from "./EntityRowList";
export { CardMetaFact, type CardMetaFactProps } from "./CardMetaFact";
export {
  Timeline,
  TimelineItem,
  type TimelineItemProps,
  type TimelineTone,
} from "./TimelineItem";
