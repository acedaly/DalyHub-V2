/**
 * The Universal Relationship System — the entity-agnostic server helper.
 *
 * DalyHub already ships the FND-04 EntityLink kernel, its D1 adapter and the
 * DS-06 policy-enforcing picker service (`entity-link-picker-service.ts`). What
 * was missing was ONE reusable way for EVERY record — Area, Goal, Project, Task,
 * Note, Diary entry, Meeting, Person — to relate to any other record from a
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
 *   - {@link loadLinkedItems} — a record's full linked-items view (every active
 *     link, both directions, EXCLUDING the reserved structural spine links the
 *     hierarchy already shows), each flagged `removable` iff it is a generic
 *     `link.related` link the user may unlink here;
 *   - {@link loadLinkSummary} — a bounded, safe summary of a linked record for
 *     the shared hover card.
 *
 * It reuses the accepted primitives only: no second relationship model, no new
 * table, no bespoke per-module link route. Direction is honoured exactly by the
 * kernel; workspace scope and the Activity actor stay server-side (the caller
 * injects a workspace-scoped {@link EntityLinkPickerDeps}).
 */

import { isReservedSpineLinkType } from "~/kernel/spine";
import type {
  LinkedItem,
  LinkSummary,
} from "~/shared/linked-items/linked-items-model";

import type {
  EntityLinkPickerDeps,
  EntityLinkPickerPolicy,
} from "./entity-link-picker-service";

export type { LinkedItem, LinkSummary };

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
  "project",
  "task",
  "note",
  "diary",
  "meeting",
  "person",
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

/**
 * Load a record's Linked Items: every active link at either end, EXCLUDING the
 * reserved structural spine links (the Area→Goal→Project→Task hierarchy already
 * renders those in its own relationships view), each mapped to a {@link LinkedItem}
 * with `removable` set for generic `link.related` links only. The counterpart's
 * title/type come from the kernel's joined view (no N+1) and are always an
 * accessible, active, in-workspace record.
 */
export async function loadLinkedItems(
  deps: EntityLinkPickerDeps,
  anchorId: string,
  options: { readonly limit?: number } = {},
): Promise<readonly LinkedItem[]> {
  const page = await deps.entityLinks.listForEntity(anchorId, {
    direction: "both",
    limit: options.limit,
  });
  const items: LinkedItem[] = [];
  for (const view of page.items) {
    // The structural hierarchy is shown by each record's own relationships view;
    // do not duplicate it in the generic Linked Items section.
    if (isReservedSpineLinkType(view.link.type)) continue;
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
  return items;
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
