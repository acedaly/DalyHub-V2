/**
 * DS-04 — public entry for the Shared Card.
 *
 * ONE configurable, entity-agnostic Card (DESIGN_SYSTEM.md → Cards) plus the
 * collection containers that lay it out in lists, boards and grids. No
 * TaskCard/ProjectCard/… — every entity type is this one Card configured with
 * data.
 *
 * DHDS-11 removed `ReorderableCardCollection`, `CardReorderHandle` and
 * `reorder.ts` from here. They were DS-04's own pointer + keyboard reorder
 * collection, and they were the product's SECOND drag implementation the moment
 * `~/shared/drag` existed — with a second grip, a second announcement
 * vocabulary and a second order model. `SortableList` is the one that shipped
 * into the product; the card's `reorderHandle` slot now takes its
 * `SortableHandle`. See
 * `docs/design/DHDS_11_DRAG_REORDER_AND_OBJECT_CONTINUITY_2026_08.md`.
 */

export { Card } from "./Card";
export { CardCollection } from "./CardCollection";
export type { CardCollectionProps } from "./CardCollection";
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
/*
 * REDESIGN-04 — `GoalCard` was removed with the Goals gallery it existed for.
 * `mockup3.png` replaced that gallery with a master–detail, whose row is the
 * shared `ProgressRow` below and whose pane is the Goal's own Overview. Nothing
 * the card guaranteed was dropped — see the note in `GoalsCollection.tsx`.
 */
export { EntityRow, EntityRowList, type EntityRowProps } from "./EntityRowList";
/**
 * REDESIGN-04 — the MEASURED row (`mockup3.png`): tile · name · context · a
 * thin bar · the record's own honest value at the line's end. Shared by the
 * Goals workspace list and the compact Goals section on the Projects page.
 */
export {
  ProgressRow,
  ProgressRowList,
  type ProgressRowProps,
} from "./ProgressRow";
/*
 * UIX-05 — the fourth family. A Person has no completion, no proportion and no
 * deadline; what they have is a face, a place in a life, a way to be reached and
 * a rhythm being kept or missed. It lives here rather than in the People module
 * because a Meeting's attendees and a Project's stakeholders are the same row.
 */
export {
  PersonRow,
  PersonRowList,
  type PersonRowProps,
  type PersonRowReach,
  type PersonRowTone,
} from "./PersonRow";
/*
 * UIX-05 — the fifth family. An Asset's measure is TIME: what does this thing
 * need, and when? That is neither a proportion nor a reading, so it is neither
 * `.dh-pcard` nor `.dh-mrow`. Shared because an Area's Assets tab and the
 * Assets gallery must draw the same object.
 */
export {
  AssetCard,
  type AssetCardProps,
  type AssetCardTone,
} from "./AssetCard";
/*
 * UIX-05 — the sixth family, and the only record whose identity is a PERIOD
 * rather than a name. Shared because a Goal's or a Project's record may later
 * show the Reviews that covered it, and there must be one Review card.
 */
export {
  ReviewCard,
  type ReviewCardProps,
  type ReviewCardTone,
} from "./ReviewCard";
export { CardMetaFact, type CardMetaFactProps } from "./CardMetaFact";
export {
  Timeline,
  TimelineItem,
  type TimelineItemProps,
  type TimelineTone,
} from "./TimelineItem";
