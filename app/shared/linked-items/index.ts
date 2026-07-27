/**
 * The Universal Relationship System — public entry for the shared Linked Items UI.
 *
 * Records mount {@link LinkedItemsTab} (which also registers the ⌘K link command)
 * or {@link LinkedItemsSection} directly. The pure model and client transport are
 * exported for tests and non-UI code. See `docs/development/RELATIONSHIPS.md`.
 */

export {
  LinkedItemsSection,
  type LinkedItemsSectionProps,
} from "./LinkedItemsSection";
export { LinkedItemsTab, type LinkedItemsTabProps } from "./LinkedItemsTab";
export { HoverCard, type HoverCardProps } from "./HoverCard";
export {
  useLinkedItems,
  type LinkedItemsTransport,
  type UseLinkedItemsResult,
  type LinkedItemsStatus,
} from "./use-linked-items";
export { useOnlineStatus } from "./use-online-status";
export {
  groupLinkedItems,
  linkedTargetIds,
  LINKED_ITEM_TYPE_ORDER,
  type LinkedItem,
  type LinkSummary,
  type LinkedItemGroup,
  type LinkedItemsPage,
} from "./linked-items-model";
export {
  UNIVERSAL_RELATED_LINK,
  UNIVERSAL_RELATED_DESCRIPTOR,
} from "./constants";
export {
  fetchLinkedItems,
  searchLinkTargets,
  fetchLinkSummary,
  createLink,
  removeLink,
  LINKS_ENDPOINT,
  type LinkMutationOutcome,
} from "./linked-items-client";
