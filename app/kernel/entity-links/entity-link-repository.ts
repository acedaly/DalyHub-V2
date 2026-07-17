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
