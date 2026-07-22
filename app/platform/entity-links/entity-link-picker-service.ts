/**
 * DS-06 — the entity-link picker server service.
 *
 * The entity-agnostic SERVER glue between the DS-06 entity-link picker UI and the
 * FND-04 EntityLink kernel. It receives kernel repositories by injection (the
 * storage-independent `EntityRepository` and `EntityLinkRepository` contracts) and
 * translates the picker's operations — search targets, list active links, create a
 * link, remove a link — into repository calls. It imports NO D1, no Worker
 * bindings and no adapter: a loader/action constructs the workspace-scoped
 * repositories (via `resolveWorkspaceScope`) and passes them here, so workspace
 * scope and Activity actor stay trusted and server-side.
 *
 * It creates and removes links through the EXISTING FND-04 repository contract
 * only — no second relationship table, no alternative link model. Direction is
 * honoured exactly: an `outgoing` link stores the anchor as the source, an
 * `incoming` link stores it as the target; the kernel never reorders endpoints.
 * Only accessible entities in the bound workspace are ever returned, so an
 * inaccessible entity's title cannot leak.
 */

import type { EntityRecord, EntityRepository } from "~/kernel/entities";
import {
  EntityLinkEndpointArchivedError,
  EntityLinkEndpointNotFoundError,
  EntityLinkError,
  EntityLinkNotFoundError,
  EntityLinkReservedTypeError,
  EntityLinkValidationError,
  isEntityLinkType,
  type CreateEntityLinkOutcome,
  type EntityLinkLifecycleOutcome,
  type EntityLinkRecord,
  type EntityLinkRepository,
} from "~/kernel/entity-links";
import type {
  EntityLinkPickerDirection,
  EntityLinkSelection,
  EntityLinkTargetOption,
} from "~/shared/forms/model";

/** The narrow repository dependencies the service needs (injected). */
export interface EntityLinkPickerDeps {
  readonly entities: Pick<EntityRepository, "list" | "getById">;
  readonly entityLinks: Pick<
    EntityLinkRepository,
    "create" | "getById" | "listForEntity" | "unlink"
  >;
}

/** Default and hard ceilings on how many search targets are returned. */
export const DEFAULT_TARGET_LIMIT = 25;
export const MAX_TARGET_LIMIT = 50;
/** How many candidate entities to scan per search before filtering by query. */
const SCAN_PAGE_SIZE = 100;

/** Map a kernel entity to the picker's opaque target option. */
export function entityToTargetOption(
  entity: EntityRecord,
): EntityLinkTargetOption {
  return { id: entity.id, type: entity.type, title: entity.title };
}

export interface SearchLinkTargetsParams {
  /** The anchor entity id, excluded from its own results. */
  readonly anchorId: string;
  /** Free-text query (matched case-insensitively against the title). */
  readonly query: string;
  /** Restrict to these entity type slugs (empty/undefined = any type). */
  readonly targetTypes?: readonly string[];
  /** Max results to return (clamped to `MAX_TARGET_LIMIT`). */
  readonly limit?: number;
}

/**
 * Search active entities in the bound workspace for link targets. Filters by an
 * optional type set and a case-insensitive title query, excludes the anchor, and
 * bounds the result. Returns only entities the workspace-scoped repository yields
 * (active, in-scope), so inaccessible titles never leak. This is the target-loader
 * contract DS-08 can later satisfy with real search without changing the picker.
 */
export async function searchLinkTargets(
  deps: EntityLinkPickerDeps,
  params: SearchLinkTargetsParams,
): Promise<readonly EntityLinkTargetOption[]> {
  const limit = Math.min(
    Math.max(1, params.limit ?? DEFAULT_TARGET_LIMIT),
    MAX_TARGET_LIMIT,
  );
  const needle = params.query.trim().toLocaleLowerCase();
  const allowTypes =
    params.targetTypes && params.targetTypes.length > 0
      ? new Set(params.targetTypes)
      : null;

  const results: EntityLinkTargetOption[] = [];
  let cursor: string | undefined;

  // Scan bounded pages until we have enough matches (no unbounded work).
  // Without kernel full-text search (DS-08), matching is a title substring over
  // a bounded scan; the picker's contract lets DS-08 replace this later.
  for (let page = 0; page < 5 && results.length < limit; page += 1) {
    const listed = await deps.entities.list({ limit: SCAN_PAGE_SIZE, cursor });
    for (const entity of listed.items) {
      if (entity.id === params.anchorId) continue;
      if (allowTypes && !allowTypes.has(entity.type)) continue;
      if (
        needle.length > 0 &&
        !entity.title.toLocaleLowerCase().includes(needle)
      ) {
        continue;
      }
      results.push(entityToTargetOption(entity));
      if (results.length >= limit) break;
    }
    if (!listed.nextCursor) break;
    cursor = listed.nextCursor;
  }

  return results;
}

export interface ListActiveLinksParams {
  readonly anchorId: string;
  /** Filter by direction from the anchor. Defaults to `both`. */
  readonly direction?: "outgoing" | "incoming" | "both";
  /** Restrict to these link-type slugs (empty/undefined = any type). */
  readonly linkTypes?: readonly string[];
  /** Max links to return. */
  readonly limit?: number;
}

/**
 * List the anchor's active links as picker selections, mapping each FND-04
 * `EntityLinkView` to `{ linkId, target, linkType, direction }`. The counterpart
 * entity (title/type) comes from the joined view — no N+1 — and is always an
 * accessible, active entity.
 */
export async function listActiveLinks(
  deps: EntityLinkPickerDeps,
  params: ListActiveLinksParams,
): Promise<readonly EntityLinkSelection[]> {
  const allowTypes =
    params.linkTypes && params.linkTypes.length > 0
      ? new Set(params.linkTypes)
      : null;
  const page = await deps.entityLinks.listForEntity(params.anchorId, {
    direction: params.direction ?? "both",
    limit: params.limit,
  });
  const selections: EntityLinkSelection[] = [];
  for (const view of page.items) {
    if (allowTypes && !allowTypes.has(view.link.type)) continue;
    selections.push({
      linkId: view.link.id,
      target: entityToTargetOption(view.counterpart),
      linkType: view.link.type,
      direction: view.direction,
    });
  }
  return selections;
}

/** One permitted link type and the entity types it may point at. */
export interface EntityLinkTypePolicy {
  /** The validated, dotted kernel link-type slug. */
  readonly type: string;
  /**
   * The entity type slugs a target may have for this link type. Omit or leave
   * empty to allow any type.
   */
  readonly allowedTargetTypes?: readonly string[];
}

/**
 * The AUTHORITATIVE, server-supplied policy for an entity-link picker. The
 * picker's client configuration (allowed types, direction, single/multiple) is
 * PRESENTATION ONLY; a loader/action must construct this policy from trusted
 * server context and pass it to {@link createLinkWithPolicy}, which enforces it.
 * The client's submitted `linkType`/`direction`/`targetId` are never trusted.
 */
export interface EntityLinkPickerPolicy {
  /** The anchor entity id (trusted, from the server request context). */
  readonly anchorId: string;
  /** Which directions the picker is allowed to create. */
  readonly allowedDirections: readonly EntityLinkPickerDirection[];
  /** The permitted link types and their allowed target entity types. */
  readonly linkTypes: readonly EntityLinkTypePolicy[];
  /** Whether more than one active link is allowed for this picker. */
  readonly multiple: boolean;
}

/** An UNTRUSTED create request as submitted by the client. */
export interface CreateLinkRequest {
  readonly targetId: string;
  readonly linkType: string;
  readonly direction: string;
}

/** Why a create request was refused (all safe to translate into UI messages). */
export type CreateLinkRejectionReason =
  | "invalid_request"
  | "direction_not_allowed"
  | "link_type_not_allowed"
  | "target_type_not_allowed"
  | "self_link"
  | "single_link_limit"
  | "anchor_unavailable"
  | "target_unavailable"
  | "reserved_type"
  | "endpoint_archived"
  | "storage";

/** The typed, safe outcome of a policy-enforced create. Never throws raw errors. */
export type CreateLinkResult =
  | {
      readonly ok: true;
      readonly created: boolean;
      readonly outcome: CreateEntityLinkOutcome;
      readonly link: EntityLinkRecord;
    }
  | {
      readonly ok: false;
      readonly reason: CreateLinkRejectionReason;
      readonly message: string;
    };

const REJECTION_MESSAGES: Record<CreateLinkRejectionReason, string> = {
  invalid_request: "That link couldn't be created — the request was invalid.",
  direction_not_allowed: "That link direction isn't allowed here.",
  link_type_not_allowed: "That link type isn't allowed here.",
  target_type_not_allowed: "That kind of item can't be linked here.",
  self_link: "An item can't be linked to itself.",
  single_link_limit:
    "Only one link is allowed here. Remove the current one first.",
  anchor_unavailable: "This record is no longer available.",
  target_unavailable: "That item is no longer available.",
  reserved_type:
    "That relationship is managed elsewhere and can't be set here.",
  endpoint_archived:
    "This task's project is archived and read-only — restore it to make changes.",
  storage: "That link couldn't be saved. Please try again.",
};

function reject(reason: CreateLinkRejectionReason): CreateLinkResult {
  return { ok: false, reason, message: REJECTION_MESSAGES[reason] };
}

function asPickerDirection(value: string): EntityLinkPickerDirection | null {
  return value === "outgoing" || value === "incoming" ? value : null;
}

/**
 * Create a link, enforcing the server policy on every attribute of the untrusted
 * request. Validates, in order: the direction is well-formed and allowed; the
 * link type is allowed (and a valid kernel slug); the target is not the anchor;
 * the anchor and target both exist and are accessible in the bound workspace; the
 * target's entity type is allowed for the link type; the single-selection limit;
 * and finally delegates to the FND-04 repository, whose own guarantees (workspace
 * scope, endpoint existence, self-link rejection, reserved-type refusal, idempotent
 * create/restore, duplicate uniqueness) are the last word. Returns a typed, safe
 * outcome — a raw repository/SQL error never escapes.
 */
export async function createLinkWithPolicy(
  deps: EntityLinkPickerDeps,
  policy: EntityLinkPickerPolicy,
  request: CreateLinkRequest,
): Promise<CreateLinkResult> {
  // 1) Direction must be well-formed AND permitted by policy.
  const direction = asPickerDirection(request.direction);
  if (!direction) return reject("invalid_request");
  if (!policy.allowedDirections.includes(direction)) {
    return reject("direction_not_allowed");
  }

  // 2) Link type must be a permitted, valid kernel slug.
  if (!isEntityLinkType(request.linkType)) return reject("invalid_request");
  const typePolicy = policy.linkTypes.find((t) => t.type === request.linkType);
  if (!typePolicy) return reject("link_type_not_allowed");

  // 3) No self-links.
  if (!request.targetId) return reject("invalid_request");
  if (request.targetId === policy.anchorId) return reject("self_link");

  // 4) Anchor and target must exist and be accessible in this workspace.
  const anchor = await deps.entities.getById(policy.anchorId);
  if (!anchor) return reject("anchor_unavailable");
  const target = await deps.entities.getById(request.targetId);
  if (!target) return reject("target_unavailable");

  // 5) The target's entity type must be allowed for this link type.
  if (
    typePolicy.allowedTargetTypes &&
    typePolicy.allowedTargetTypes.length > 0 &&
    !typePolicy.allowedTargetTypes.includes(target.type)
  ) {
    return reject("target_type_not_allowed");
  }

  // The anchor's active links across the policy's link types and permitted
  // directions, ordered deterministically by (createdAt, id). Used for the fast
  // single-limit pre-check and the post-create concurrency reconciliation.
  const policyTypes = new Set(policy.linkTypes.map((t) => t.type));
  const activePolicyLinks = async (): Promise<
    ReadonlyArray<{ id: string; createdAt: Date }>
  > => {
    const page = await deps.entityLinks.listForEntity(policy.anchorId, {
      direction: "both",
      limit: 100,
    });
    return page.items
      .filter(
        (v) =>
          policyTypes.has(v.link.type) &&
          policy.allowedDirections.includes(v.direction),
      )
      .map((v) => ({ id: v.link.id, createdAt: v.link.createdAt }))
      .sort((a, b) => {
        const byTime = a.createdAt.getTime() - b.createdAt.getTime();
        return byTime !== 0 ? byTime : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
  };

  // 6) Single-selection limit — fast pre-check.
  if (!policy.multiple && (await activePolicyLinks()).length > 0) {
    return reject("single_link_limit");
  }

  // 7) Delegate to the FND-04 repository (the authoritative last word).
  const [sourceEntityId, targetEntityId] =
    direction === "outgoing"
      ? [policy.anchorId, request.targetId]
      : [request.targetId, policy.anchorId];
  let created;
  try {
    created = await deps.entityLinks.create({
      sourceEntityId,
      targetEntityId,
      type: request.linkType,
    });
  } catch (error) {
    if (error instanceof EntityLinkEndpointArchivedError) {
      return reject("endpoint_archived");
    }
    if (error instanceof EntityLinkEndpointNotFoundError) {
      return reject("target_unavailable");
    }
    if (error instanceof EntityLinkReservedTypeError) {
      return reject("reserved_type");
    }
    if (
      error instanceof EntityLinkValidationError &&
      error.field === "selfLink"
    ) {
      return reject("self_link");
    }
    if (error instanceof EntityLinkError) return reject("storage");
    throw error;
  }

  // 8) Concurrency-safe single limit. A pre-check + create is a TOCTOU race: two
  // concurrent creates of DIFFERENT targets both pass the pre-check, and the
  // kernel's uniqueness only prevents an identical duplicate — not "one link
  // total". So after creating, re-check; if more than one active policy link now
  // exists, keep the deterministically-earliest (by createdAt, then id) and
  // unlink OUR OWN link if it is not that winner. Each caller only ever unlinks
  // the link it just created, so concurrent creators converge on exactly one.
  if (!policy.multiple) {
    const active = await activePolicyLinks();
    if (active.length > 1 && active[0]!.id !== created.link.id) {
      await deps.entityLinks.unlink(created.link.id);
      return reject("single_link_limit");
    }
  }

  return {
    ok: true,
    created: created.created,
    outcome: created.outcome,
    link: created.link,
  };
}

/** Why a policy-authorised unlink was refused (all safe to show the user). */
export type UnlinkRejectionReason =
  "not_found" | "not_permitted" | "endpoint_archived" | "storage";

/** The typed, safe outcome of a policy-authorised unlink. */
export type UnlinkResult =
  | {
      readonly ok: true;
      readonly changed: boolean;
      readonly outcome: EntityLinkLifecycleOutcome;
    }
  | {
      readonly ok: false;
      readonly reason: UnlinkRejectionReason;
      readonly message: string;
    };

const UNLINK_MESSAGES: Record<UnlinkRejectionReason, string> = {
  not_found: "That link no longer exists.",
  not_permitted: "That link can't be removed here.",
  endpoint_archived:
    "This task's project is archived and read-only — restore it to make changes.",
  storage: "That link couldn't be removed. Please try again.",
};

function rejectUnlink(reason: UnlinkRejectionReason): UnlinkResult {
  return { ok: false, reason, message: UNLINK_MESSAGES[reason] };
}

/**
 * Remove (soft-delete) a link, AUTHORISED by the same server policy. The client
 * only ever hands back a link id, which is untrusted: this verifies the link
 * exists in the bound workspace, is actually anchored to `policy.anchorId`, and
 * its type + direction-from-the-anchor are permitted by the policy, before
 * delegating to the FND-04 repository. A crafted id — for another anchor, a link
 * type the picker never offered, or (indistinguishably) another workspace — is
 * refused with a typed, safe outcome; a raw repository error never escapes.
 */
export async function unlinkWithPolicy(
  deps: EntityLinkPickerDeps,
  policy: EntityLinkPickerPolicy,
  linkId: string,
): Promise<UnlinkResult> {
  if (!linkId) return rejectUnlink("not_found");
  const link = await deps.entityLinks.getById(linkId);
  if (!link) return rejectUnlink("not_found");

  const anchorIsSource = link.sourceEntityId === policy.anchorId;
  const anchorIsTarget = link.targetEntityId === policy.anchorId;
  if (!anchorIsSource && !anchorIsTarget) return rejectUnlink("not_permitted");
  const direction: EntityLinkPickerDirection = anchorIsSource
    ? "outgoing"
    : "incoming";
  if (!policy.allowedDirections.includes(direction)) {
    return rejectUnlink("not_permitted");
  }
  if (!policy.linkTypes.some((t) => t.type === link.type)) {
    return rejectUnlink("not_permitted");
  }

  try {
    const result = await deps.entityLinks.unlink(linkId);
    return { ok: true, changed: result.changed, outcome: result.outcome };
  } catch (error) {
    if (error instanceof EntityLinkEndpointArchivedError) {
      return rejectUnlink("endpoint_archived");
    }
    if (error instanceof EntityLinkNotFoundError) {
      return rejectUnlink("not_found");
    }
    if (error instanceof EntityLinkError) return rejectUnlink("storage");
    throw error;
  }
}
