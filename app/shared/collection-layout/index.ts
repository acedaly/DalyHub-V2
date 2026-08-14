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
 * UIX-06 — the ONE collection count line, so every collection's subtitle answers
 * "how many, and is this all of them?" in the same words.
 */
export { collectionCountLabel, type CountLabelOptions } from "./count-label";

/**
 * DS-08 — the ONE create-action label, so every collection's primary action is
 * the same control: a leading plus, and the words in sentence case.
 */
export {
  CreateActionLabel,
  type CreateActionLabelProps,
} from "./CreateActionLabel";

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
  activeControls,
  activeFilterCount,
  activeSummary,
  applyDraft,
  currentValue,
  draftFromParams,
  draftIsDirty,
  emptyDraft,
  withDraftValue,
  withoutControl,
  withoutControls,
  type ActiveCollectionControl,
  type CollectionControlGroup,
  type CollectionControlKind,
  type CollectionControlOption,
  type CollectionControlsDraft,
} from "./collection-controls-model";

/**
 * TASKS-03 — the shared removable active-filter chips + Reset, driven by the SAME
 * control groups as the phone sheet. Use it in a collection's `filterBar` slot so
 * a filtered list always explains itself without reopening a control surface.
 */
export {
  CollectionFilterChips,
  type CollectionFilterChipsProps,
} from "./CollectionFilterChips";
