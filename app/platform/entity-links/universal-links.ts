/**
 * The Universal Relationship System — the entity-agnostic server helper.
 *
 * DalyHub already ships the FND-04 EntityLink kernel, its D1 adapter and the
 * DS-06 policy-enforcing picker service (`entity-link-picker-service.ts`). What
 * was missing was ONE reusable way for EVERY record — Area, Goal, Project, Task,
 * Note, Diary entry, Meeting, Person, Asset, Review — to relate to any other record from a
 * shared "Linked Items" section, instead of each module hand-rolling its own
 * "Linked" tab (People/Meetings rendered a read-only list; Projects/Tasks each
 * wired their own picker + routes).
 *
 * This module supplies the shared vocabulary and read/authorise helpers the one
 * shared `/links` resource route ({@link file://app/routes/links.ts}) composes:
 *
 *   - the single, module-agnostic **`link.related`** relationship type used for
 *     ad-hoc "this relates to that" links a user creates from any record;
 *   - {@link buildUniversalLinkPolicy} — the trusted server policy the route
 *     enforces on every untrusted link/unlink request;
 *   - {@link loadLinkedItems} — one bounded, cursor-paginated page of a record's
 *     linked-items view (active links, both directions, EXCLUDING the reserved
 *     structural spine links the hierarchy already shows), each flagged
 *     `removable` iff it is a generic `link.related` link the user may unlink here;
 *   - {@link loadLinkSummary} — a bounded, safe summary of a linked record for
 *     the shared hover card.
 *
 * It reuses the accepted primitives only: no second relationship model, no new
 * table, no bespoke per-module link route. Direction is honoured exactly by the
 * kernel; workspace scope and the Activity actor stay server-side (the caller
 * injects a workspace-scoped {@link EntityLinkPickerDeps}).
 */

import { HABIT_LINK_TYPES } from "~/kernel/habits";
import { isReservedSpineLinkType } from "~/kernel/spine";
import type {
  LinkedItem,
  LinkedItemsPage,
  LinkSummary,
} from "~/shared/linked-items/linked-items-model";

import type {
  EntityLinkPickerDeps,
  EntityLinkPickerPolicy,
} from "./entity-link-picker-service";

export type { LinkedItem, LinkedItemsPage, LinkSummary };

/**
 * The single, module-agnostic relationship type for a user-created "related to"
 * link between any two records. A validated FND-04 dotted slug; it is not a
 * reserved spine structural type, so the generic repository persists it. Links
 * created by specific modules (e.g. `meeting.attendee`) still appear in a
 * record's Linked Items view — they are simply shown read-only there.
 */
export const UNIVERSAL_RELATED_LINK = "link.related";

/** The user-language descriptor for the universal relationship type. */
export const UNIVERSAL_RELATED_DESCRIPTOR = {
  type: UNIVERSAL_RELATED_LINK,
  label: "Related",
} as const;

/**
 * The entity types the Universal Relationship System supports as link endpoints,
 * in a stable display order. Every one has a canonical record surface, so a
 * linked item of these types can be navigated to. The list is presentation
 * metadata only — the kernel never enforces an endpoint type, so a link to any
 * other active entity still round-trips.
 */
export const SUPPORTED_LINK_ENTITY_TYPES = [
  "area",
  "goal",
  // HABITS-01 — a Habit has a canonical record, so it can be a linked item like
  // any other. Its STRUCTURAL links (to a Goal and an Area) stay module-owned
  // and are filtered out of this picker, exactly as a Goal's Area parentage is.
  "habit",
  "project",
  "task",
  "note",
  "diary",
  "meeting",
  "person",
  "asset",
  "review",
] as const;

/**
 * The trusted server policy for a record's universal Linked Items picker: the
 * anchor may create and remove `link.related` links to/from any record, in
 * either direction, and may hold many. The route enforces this on every
 * untrusted request; a crafted link id for a reserved structural type or a
 * module-owned type is refused because that type is not in the policy.
 */
export function buildUniversalLinkPolicy(
  anchorId: string,
): EntityLinkPickerPolicy {
  return {
    anchorId,
    allowedDirections: ["outgoing", "incoming"],
    linkTypes: [{ type: UNIVERSAL_RELATED_LINK }],
    multiple: true,
  };
}

/** How many linked items make one display page (before Load more). */
export const DEFAULT_LINKED_ITEMS_LIMIT = 50;
/** Underlying EntityLink page size scanned per fetch (the kernel's max). */
const LINK_SCAN_PAGE_SIZE = 100;
/**
 * The most underlying pages a single `loadLinkedItems` call will scan. It bounds
 * per-request work when an anchor has a very large number of STRUCTURAL links
 * (which are filtered out); it is NOT a correctness cutoff — whenever underlying
 * pages remain, `nextCursor` is returned so the UI's "Load more" reaches every
 * later relationship. (Reviewer: never silently omit later links.)
 */
const MAX_SCAN_PAGES_PER_CALL = 20;

/**
 * The link types the Linked Items surface HIDES, because another part of the
 * record already draws them.
 *
 * The four spine links are hidden because the hierarchy renders them in its own
 * relationships view. HABITS-01 adds the two a Habit owns for the same reason
 * and no other: a Habit's Goal and Area are printed in its record header, and a
 * Goal's supporting Habits have their own section — so leaving them here would
 * be a second, non-removable copy of a relationship the reader can already see.
 * Neither is a rule about what may be LINKED; both are about what this one
 * surface would otherwise duplicate.
 */
function isStructuralLinkType(type: string): boolean {
  return (
    isReservedSpineLinkType(type) ||
    (HABIT_LINK_TYPES as readonly string[]).includes(type)
  );
}

/**
 * Load one bounded page of a record's Linked Items: active links at either end,
 * EXCLUDING the reserved structural spine links (the Area→Goal→Project→Task
 * hierarchy renders those in its own relationships view), each mapped to a
 * {@link LinkedItem} with `removable` set for generic `link.related` links only.
 *
 * Because structural links are filtered out of the underlying paged result, a
 * single underlying page can yield zero relationship items even when later pages
 * hold `link.related` links. This paginates THROUGH the underlying pages,
 * accumulating non-structural items until it has a display page's worth or the
 * underlying pages are exhausted (bounded per call by {@link MAX_SCAN_PAGES_PER_CALL}),
 * and returns a `nextCursor` whenever more underlying links remain — so an anchor
 * with many structural links never renders as having no Linked Items, and every
 * later relationship stays reachable via "Load more". The counterpart title/type
 * come from the kernel's joined view (no N+1) and are always accessible + active.
 */
export async function loadLinkedItems(
  deps: EntityLinkPickerDeps,
  anchorId: string,
  options: { readonly limit?: number; readonly cursor?: string } = {},
): Promise<LinkedItemsPage> {
  const targetLimit = Math.max(1, options.limit ?? DEFAULT_LINKED_ITEMS_LIMIT);
  const items: LinkedItem[] = [];
  let cursor: string | undefined = options.cursor;
  let scanned = 0;

  do {
    const page = await deps.entityLinks.listForEntity(anchorId, {
      direction: "both",
      limit: LINK_SCAN_PAGE_SIZE,
      ...(cursor ? { cursor } : {}),
    });
    scanned += 1;
    for (const view of page.items) {
      if (isStructuralLinkType(view.link.type)) continue;
      items.push({
        linkId: view.link.id,
        target: {
          id: view.counterpart.id,
          type: view.counterpart.type,
          title: view.counterpart.title,
        },
        linkType: view.link.type,
        direction: view.direction,
        removable: view.link.type === UNIVERSAL_RELATED_LINK,
      });
    }
    cursor = page.nextCursor ?? undefined;
  } while (
    cursor &&
    items.length < targetLimit &&
    scanned < MAX_SCAN_PAGES_PER_CALL
  );

  // `cursor` is non-null iff underlying pages remain — whether we stopped because
  // the display page filled or the per-call scan bound was hit. Either way the
  // caller can continue with "Load more"; nothing is silently omitted.
  return { items, nextCursor: cursor ?? null };
}

/**
 * Load a safe summary for one linked record (hover card). Returns `null` for a
 * missing, soft-deleted, or cross-workspace id — indistinguishably, disclosing
 * nothing. Only structural metadata crosses the boundary.
 */
export async function loadLinkSummary(
  deps: EntityLinkPickerDeps,
  id: string,
): Promise<LinkSummary | null> {
  if (!id) return null;
  const entity = await deps.entities.getById(id);
  if (!entity) return null;
  return {
    id: entity.id,
    type: entity.type,
    title: entity.title,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}
