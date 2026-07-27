/**
 * The Universal Relationship System — the pure, React-free Linked Items model.
 *
 * Holds the wire shapes shared between the `/links` server route
 * ({@link file://app/platform/entity-links/universal-links.ts}) and the shared
 * Linked Items UI, plus the framework-free grouping/ordering the section renders
 * with. It imports only the DS-06 picker model types (also React-free), so both
 * the platform layer and non-UI code (tests, the server helper) can import it.
 *
 * There is no second relationship model here: a {@link LinkedItem} is a thin,
 * display-ready projection of an FND-04 `EntityLinkView` the server already
 * resolved (counterpart identity + title + the link's type/direction/id).
 */

import type {
  EntityLinkPickerDirection,
  EntityLinkTargetOption,
} from "~/shared/forms/model";

/** One record linked to an anchor, as the Linked Items section renders it. */
export interface LinkedItem {
  /** The FND-04 EntityLink id (used to unlink). */
  readonly linkId: string;
  /** The linked (counterpart) record's kernel identity + title. */
  readonly target: EntityLinkTargetOption;
  /** The link's kernel type slug (e.g. `link.related`, `meeting.attendee`). */
  readonly linkType: string;
  /** The anchor's end of the link. */
  readonly direction: EntityLinkPickerDirection;
  /** Whether this link may be removed from the shared Linked Items UI. */
  readonly removable: boolean;
}

/**
 * A bounded, safe summary of a linked record for the hover card. Carries only
 * non-sensitive structural metadata — never a body or any private field.
 */
export interface LinkSummary {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  /** ISO-8601 UTC instant. */
  readonly createdAt: string;
  /** ISO-8601 UTC instant. */
  readonly updatedAt: string;
}

/** A group of linked items that share a counterpart entity type. */
export interface LinkedItemGroup {
  readonly type: string;
  readonly items: readonly LinkedItem[];
}

/**
 * One bounded page of a record's Linked Items. `nextCursor` is an opaque,
 * scope-bound continuation token (from the underlying EntityLink pagination); it
 * is non-null whenever more relationships remain beyond this page — so a record
 * with many structural links never silently hides its later `link.related` links.
 */
export interface LinkedItemsPage {
  readonly items: readonly LinkedItem[];
  readonly nextCursor: string | null;
}

/**
 * The stable display order for grouped Linked Items — the supported entity types
 * first (matching the picker's target order), then any other type alphabetically.
 * Duplicated from the platform list deliberately: this module must not import the
 * platform layer, and the ordering is a presentation concern.
 */
export const LINKED_ITEM_TYPE_ORDER: readonly string[] = [
  "area",
  "goal",
  "project",
  "task",
  "note",
  "diary",
  "meeting",
  "person",
  "asset",
  "review",
];

/**
 * Group linked items by their counterpart entity type, in a deterministic order
 * ({@link LINKED_ITEM_TYPE_ORDER}, then unknown types alphabetically). Within a
 * group the caller's order is preserved. Empty groups are omitted.
 */
export function groupLinkedItems(
  items: readonly LinkedItem[],
): readonly LinkedItemGroup[] {
  const byType = new Map<string, LinkedItem[]>();
  for (const item of items) {
    const bucket = byType.get(item.target.type) ?? [];
    bucket.push(item);
    byType.set(item.target.type, bucket);
  }
  const known = LINKED_ITEM_TYPE_ORDER.filter((type) => byType.has(type));
  const unknown = [...byType.keys()]
    .filter((type) => !LINKED_ITEM_TYPE_ORDER.includes(type))
    .sort();
  return [...known, ...unknown].map((type) => ({
    type,
    items: byType.get(type) ?? [],
  }));
}

/** The set of counterpart ids already linked (any type/direction). */
export function linkedTargetIds(
  items: readonly LinkedItem[],
): ReadonlySet<string> {
  return new Set(items.map((item) => item.target.id));
}
