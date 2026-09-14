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
 * UNTITLED-18 — the rest of the "card FAMILY" is GONE, and it had been unused
 * for a while.
 *
 * Eight exports left here together: `DashboardCard`, `MetricTile`, `MetricRow`,
 * `StatCard`, `ExpressiveSummary`, `SupportingSurface`, `CardMetaFact` and this
 * directory's own `Timeline`/`TimelineItem`. Not one had a consumer in
 * `app/modules` or `app/routes` outside the design gallery that existed to draw
 * them, and four had no consumer at all — `ExpressiveSummary` and
 * `SupportingSurface` referenced only each other.
 *
 * They were the generic-UI library DalyHub built before it had one. Untitled is
 * that library now: a titled panel with a header action is a `TableCard` or a
 * section, a row of figures is a section with a heading, and a bounded surface
 * is `~/shared/ui`'s `Card`. Keeping a second, unused set of answers to those
 * questions is how a future agent finds the wrong one first.
 *
 * `Timeline` is the ACTIVITY FEED's (`~/shared/activity-feed`), which is the one
 * forty files import; this directory had a second component of the same name
 * that only the gallery drew.
 *
 * What is exported below is what the PRODUCT draws.
 */
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
/*
 * UNTITLED-05 — `EntityRow`/`EntityRowList` were removed with the Area row list
 * they existed for. Areas was their only consumer, and its dense reading is now
 * the genuine Untitled `application/table` composition (`AreasTable`) while its
 * gallery is `AreaCard` below. Nothing the row guaranteed was dropped — an Area
 * still draws no progress bar, still leads with its identity mark, and still
 * states its relationships as counts of living things.
 */
/**
 * UNTITLED-05 — the AREA card: a standing domain of responsibility.
 *
 * The third member of the gallery family, and the reason there is one: an Area
 * never completes, so the card a Project gets — bottom-heavy around a measure
 * running to 100% — answers a question an Area does not have. `AreaCard` puts
 * permanence where the Project's measure sits and states what is LIVING in the
 * Area as a fact strip. It lives here rather than in the Areas module because
 * the card family is shared, for the same reason `ProjectCard` is.
 */
export {
  AreaCard,
  AreaCardGrid,
  type AreaCardFact,
  type AreaCardProps,
} from "./AreaCard";
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
