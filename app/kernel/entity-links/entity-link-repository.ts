/**
 * FND-04 EntityLinks kernel — the link repository contract.
 *
 * The storage-independent interface modules depend on. It speaks only in domain
 * terms (camelCase records, domain errors) and never exposes D1, SQL, or
 * Cloudflare types. Adapters — currently only the D1 adapter — implement it.
 * Depending on this interface rather than the adapter keeps the kernel portable
 * (ADR-011, implementing ADR-002).
 *
 * The repository is WORKSPACE-BOUND (ADR-010/ADR-011): it is constructed with a
 * single `WorkspaceContext` and every method operates only within that
 * workspace. No module-facing method accepts a `workspaceId` — module code
 * cannot pass, select or override the scope, and both endpoints of every link
 * are constrained to the bound workspace in SQL, with values always bound and
 * never interpolated.
 */

import type {
  CreateEntityLinkInput,
  CreateEntityLinkResult,
  EntityLinkLifecycleResult,
  EntityLinkPage,
  EntityLinkRecord,
  GetEntityLinkOptions,
  ListEntityLinksInput,
  ListEntityLinksForEntitiesInput,
  EntityLinkView,
} from "./entity-link";

// The clock and id-generator seams are shared with the entity kernel so tests
// control time and ids the same way across the whole kernel.
export type { Clock, IdGenerator } from "~/kernel/entities";
export { systemClock, secureIdGenerator } from "~/kernel/entities";

/**
 * The kernel's EntityLink storage contract.
 *
 * Error semantics (thrown as the typed errors in `entity-link-errors.ts`):
 *   - invalid input          → `EntityLinkValidationError` (no data is written)
 *   - endpoint unavailable    → `EntityLinkEndpointNotFoundError` (missing,
 *                               soft-deleted, or in another workspace — all
 *                               indistinguishable)
 *   - unknown link id         → `EntityLinkNotFoundError`
 *   - bad/mismatched cursor   → `InvalidEntityLinkCursorError`
 *   - unreconcilable conflict → `EntityLinkConflictError`
 *   - storage failure         → `EntityLinkStorageError`
 */
export interface EntityLinkRepository {
  /**
   * Create a directed relationship in the bound workspace. Both endpoints must
   * exist, be active, and belong to this workspace (a cross-workspace or
   * nonexistent endpoint fails identically as `EntityLinkEndpointNotFoundError`,
   * disclosing nothing). Self-links are rejected. The repository supplies the
   * workspace, the id and the lifecycle timestamps; callers pass only endpoints
   * and type.
   *
   * Idempotent by relationship identity `(workspace, source, target, type)`:
   *   - no existing row          → inserts it (`outcome: "created"`)
   *   - existing active row      → returns it unchanged (`"already_exists"`)
   *   - existing unlinked row    → restores it IN PLACE (`"restored"`)
   * Restoring never mints a new id — the relationship keeps one stable identity.
   * Concurrent duplicate attempts are made safe by the database uniqueness
   * constraint as the final backstop.
   */
  create(input: CreateEntityLinkInput): Promise<CreateEntityLinkResult>;

  /**
   * Read one link by id within the bound workspace. Returns null when there is
   * no matching link in this workspace — including when it exists in another
   * workspace, which is indistinguishable from "does not exist". Unlinked
   * (soft-deleted) links are excluded unless `options.includeUnlinked` is true
   * (an explicit internal seam for lifecycle behaviour).
   */
  getById(
    id: string,
    options?: GetEntityLinkOptions,
  ): Promise<EntityLinkRecord | null>;

  /**
   * List the links of one entity in the bound workspace, using bounded cursor
   * pagination. The anchor entity must exist and be active in this workspace
   * (otherwise `EntityLinkEndpointNotFoundError`). Finds links where the anchor
   * is the source or the target, returns each with its `direction` from the
   * anchor and the ACTIVE counterpart entity, and:
   *   - excludes explicitly unlinked links by default;
   *   - excludes links whose counterpart entity is soft-deleted;
   *   - optionally filters by link `type` and/or `direction`;
   *   - orders deterministically by `(createdAt, id)`;
   *   - returns at most a safe maximum page size with a `nextCursor`.
   * The counterpart is fetched via a joined query — never an N+1 lookup. A
   * cursor is bound to the workspace, anchor, direction and type filter that
   * produced it and is rejected (`InvalidEntityLinkCursorError`) otherwise.
   */
  listForEntity(
    entityId: string,
    input?: ListEntityLinksInput,
  ): Promise<EntityLinkPage>;

  /**
   * DEBT-124 — the links of MANY entities, for a collection page.
   *
   * `listForEntity` is the only relationship read the kernel published, so every
   * consumer that needed relationships for a PAGE of records had three choices:
   * one query per row, a per-module projection that answers a kernel-shaped
   * question (which is what Notes did for its `linkCount`), or do without
   * (which is what the Meetings collection did — it could not show attendees).
   * The cheap wrong one was the easiest to write.
   *
   * This is the batched counterpart, and it is deliberately NOT a paginated
   * list: a collection row wants a bounded handful of counterparts to draw, not
   * a cursor. So it takes a per-entity limit and returns a map, in a number of
   * statements that is a function of the CHUNK size rather than of the page.
   *
   * Semantics are `listForEntity`'s, minus pagination:
   *   - links where the entity is the source or the target, each carrying its
   *     `direction` from that entity and the ACTIVE counterpart;
   *   - unlinked links and soft-deleted counterparts excluded;
   *   - optionally filtered by `type` and/or `direction`;
   *   - ordered deterministically by `(createdAt, id)` WITHIN each entity, and
   *     truncated per entity rather than across the page — so one heavily-linked
   *     record cannot starve the rest.
   *
   * One deliberate difference: an anchor that does not exist, is soft-deleted,
   * or belongs to another workspace is simply ABSENT from the map rather than
   * raising. `listForEntity` refuses because it is being asked about one record
   * the caller named; this is being handed a page, and one row that has since
   * been deleted must not fail the other twenty-nine — nor cost N existence
   * checks to find out, which is the N+1 this exists to remove.
   */
  listForEntities(
    entityIds: readonly string[],
    input?: ListEntityLinksForEntitiesInput,
  ): Promise<ReadonlyMap<string, readonly EntityLinkView[]>>;

  /**
   * Unlink (reversibly soft-delete) a link in the bound workspace: set
   * `deletedAt` and advance `updatedAt`, preserving the link id. Idempotent —
   * unlinking an already-unlinked link is a no-op reported via the result's
   * `outcome` (`already_unlinked`, `changed: false`). Does NOT modify either
   * endpoint entity. Throws `EntityLinkNotFoundError` if the id is unknown in
   * this workspace (a link in another workspace is indistinguishable).
   */
  unlink(id: string): Promise<EntityLinkLifecycleResult>;

  /**
   * Restore a previously unlinked link in the bound workspace: clear `deletedAt`
   * and advance `updatedAt`. Both endpoint entities must currently exist and be
   * active in this workspace, otherwise restoration fails safely
   * (`EntityLinkEndpointNotFoundError`). Idempotent — restoring an already-active
   * link is a no-op reported via the result's `outcome` (`already_active`,
   * `changed: false`). Throws `EntityLinkNotFoundError` if the id is unknown in
   * this workspace.
   */
  restore(id: string): Promise<EntityLinkLifecycleResult>;
}
