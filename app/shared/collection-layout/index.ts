/**
 * PX-02 — public entry for the Shared Collection Layout.
 *
 * The named scaffold for the product's commonest screen (a filtered collection of
 * Cards). Compose it with the DS-04 Card, DS-07 Filters, the shared EmptyState and
 * the Skeleton system (DESIGN_SYSTEM.md → Shared Collection Layout).
 */

export {
  CollectionLayout,
  type CollectionLayoutProps,
} from "./CollectionLayout";

export { useCollectionLoading } from "./use-collection-loading";

/**
 * MOBILE-01 — the ONE shared phone filter/sort/view sheet, and its pure model.
 * Pass a `<CollectionControls>` as the layout's `mobileControls`; never build a
 * module-specific mobile filter surface.
 */
export {
  CollectionControls,
  type CollectionControlsProps,
} from "./CollectionControls";
export {
  activeFilterCount,
  activeSummary,
  applyDraft,
  currentValue,
  draftFromParams,
  draftIsDirty,
  emptyDraft,
  withDraftValue,
  type CollectionControlGroup,
  type CollectionControlKind,
  type CollectionControlOption,
  type CollectionControlsDraft,
} from "./collection-controls-model";
