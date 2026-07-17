/**
 * FND-04 EntityLinks kernel — the link contract and its identifier types.
 *
 * An EntityLink is a KERNEL RELATIONSHIP RECORD, not an ordinary row in
 * `entities`. It connects any active entity to any other active entity in the
 * same workspace while staying typed, workspace-isolated and queryable from
 * either endpoint. A link has no title, no entity type, no search entry, no
 * Record Header, no module and no user-facing page — it is a directed
 * relationship, stored ONCE (see ADR-011, implementing ADR-002).
 *
 * This module is storage-independent — nothing here imports D1 or Cloudflare
 * types. The D1 adapter (`app/platform/storage/d1`) implements the repository
 * contract and is the only place snake_case rows and SQLite specifics exist.
 *
 * Direction is meaningful. A relationship is stored as a single row carrying
 * `sourceEntityId`, `targetEntityId` and `type`; the same row is an OUTGOING
 * link when queried from the source and an INCOMING link when queried from the
 * target. Endpoint ids are never reordered — `meeting --produced_task--> task`
 * and its reverse are different relationships and must not be conflated.
 */

import type { EntityRecord } from "~/kernel/entities";
import type { WorkspaceId } from "~/kernel/workspaces";

/**
 * A link type: a STABLE MACHINE IDENTIFIER, not free-form display text.
 *
 * Link types use the same documented structural format as other DalyHub
 * identifiers — lowercase dotted segments such as `meeting.produced_task`,
 * `project.supporting_note` or `person.attended_meeting`. The brand means a
 * plain `string` cannot be used where an `EntityLinkType` is required: a value
 * only becomes an `EntityLinkType` by passing `parseEntityLinkType`
 * (`entity-link-validation.ts`), so unvalidated labels cannot drift through the
 * kernel. Types are an OPEN, REUSABLE contract — a validated string, never a
 * database enum or a hard-coded list — so future modules (FND-06 Module
 * Registry) can register link types without a schema migration.
 */
declare const entityLinkTypeBrand: unique symbol;
export type EntityLinkType = string & { readonly [entityLinkTypeBrand]: true };

/**
 * A stored EntityLink: one directed relationship, stored once.
 *
 * Field notes:
 *   - `id` is application-generated, globally unique, stable and never reused.
 *     It is preserved across unlink/restore so a relationship keeps one identity.
 *   - `workspaceId` is the single workspace both endpoints belong to; a link can
 *     never cross workspace boundaries.
 *   - `sourceEntityId` / `targetEntityId` preserve the relationship's direction
 *     verbatim; they are never silently reordered.
 *   - `type` is the validated, branded link type, stored verbatim.
 *   - Timestamps are UTC. `createdAt` is immutable; `updatedAt` advances on every
 *     successful unlink and restore. `deletedAt` is null for active (linked)
 *     relationships and set to the unlink time for soft-deleted (unlinked) ones.
 *
 * Identity/lifecycle fields are `readonly`: a stored record is an immutable
 * snapshot. Mutations go through the repository and return a fresh record.
 */
export type EntityLinkRecord<TType extends EntityLinkType = EntityLinkType> = {
  readonly id: string;
  readonly workspaceId: WorkspaceId;
  readonly sourceEntityId: string;
  readonly targetEntityId: string;
  readonly type: TType;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
};

/**
 * Which end of a stored link a query is looking from. The SAME row is
 * `outgoing` when found via its source and `incoming` when found via its target.
 */
export type EntityLinkDirection = "outgoing" | "incoming";

/**
 * The direction filter a listing may apply. `both` (the default) returns
 * outgoing and incoming links together; `outgoing`/`incoming` restrict to links
 * where the anchor entity is respectively the source or the target.
 */
export type EntityLinkDirectionFilter = "outgoing" | "incoming" | "both";

/**
 * A link as seen while querying a specific entity: the stored relationship, the
 * direction it presents from the anchor, and the ACTIVE counterpart entity on
 * the other end. The counterpart is included so callers can render/navigate the
 * relationship without a second, unscoped lookup (no N+1).
 */
export type EntityLinkView = {
  readonly link: EntityLinkRecord;
  readonly direction: EntityLinkDirection;
  readonly counterpart: EntityRecord;
};

/**
 * Input to create a link through a workspace-scoped repository. It carries ONLY
 * the relationship's meaning: its endpoints and its type. There is deliberately
 * no `workspaceId` field (the repository supplies the bound workspace), no `id`
 * and no timestamps (the repository generates them). A stray `workspaceId`
 * property is therefore a type error, not a silently-honoured override.
 */
export type CreateEntityLinkInput = {
  readonly sourceEntityId: string;
  readonly targetEntityId: string;
  readonly type: string;
};

/** What a `create` call actually did for the requested relationship. */
export type CreateEntityLinkOutcome =
  /** A new relationship row was inserted. */
  | "created"
  /** The exact relationship already existed and was active — idempotent no-op. */
  | "already_exists"
  /** The exact relationship existed but was unlinked; it was restored in place. */
  | "restored";

/**
 * Result of `create`. `outcome` names exactly which case occurred and
 * `created` is true only when a brand-new row was inserted (false for the
 * idempotent `already_exists` and the in-place `restored` cases). The returned
 * `link` always has the STABLE id for the relationship — restoring never mints
 * a new id.
 */
export type CreateEntityLinkResult<
  TType extends EntityLinkType = EntityLinkType,
> = {
  readonly link: EntityLinkRecord<TType>;
  readonly outcome: CreateEntityLinkOutcome;
  readonly created: boolean;
};

/** Options for reading a single link by id. */
export type GetEntityLinkOptions = {
  /**
   * When true, an unlinked (soft-deleted) relationship is returned too. Defaults
   * to false: normal reads exclude unlinked relationships. This is an explicit
   * internal seam for lifecycle behaviour, not an ordinary read path.
   */
  readonly includeUnlinked?: boolean;
};

/**
 * Input to list the links of one entity, using bounded cursor pagination. There
 * is no `workspaceId` field — scope comes from the repository's
 * `WorkspaceContext`.
 */
export type ListEntityLinksInput = {
  /**
   * Restrict to links where the anchor is the source (`outgoing`) or the target
   * (`incoming`). Defaults to `both`.
   */
  readonly direction?: EntityLinkDirectionFilter;
  /** Optional filter to a single link type. */
  readonly type?: string;
  /**
   * Maximum number of records to return. Clamped to `[1, MAX_LINK_PAGE_SIZE]`;
   * defaults to `DEFAULT_LINK_PAGE_SIZE` when omitted. Never an unbounded array.
   */
  readonly limit?: number;
  /**
   * Opaque cursor from a previous page's `nextCursor`. Must be a cursor this
   * kernel issued for the SAME anchor, direction filter and type filter;
   * anything else is rejected as an invalid cursor.
   */
  readonly cursor?: string;
};

/**
 * A bounded page of link views plus the information needed to request the next
 * page. `nextCursor` is null when there are no further records.
 */
export type EntityLinkPage = {
  readonly items: ReadonlyArray<EntityLinkView>;
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
};

/** The lifecycle transition an unlink / restore call actually performed. */
export type EntityLinkLifecycleOutcome =
  "unlinked" | "already_unlinked" | "restored" | "already_active";

/**
 * Result of an unlink or restore. `changed` distinguishes a real transition from
 * an idempotent no-op, and `outcome` names exactly which case occurred.
 */
export type EntityLinkLifecycleResult<
  TType extends EntityLinkType = EntityLinkType,
> = {
  readonly link: EntityLinkRecord<TType>;
  readonly outcome: EntityLinkLifecycleOutcome;
  readonly changed: boolean;
};
