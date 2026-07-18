/**
 * FND-05 Activity kernel — the module-facing Activity READ contract.
 *
 * This is the storage-independent interface modules depend on to read history. It
 * speaks only in domain terms (camelCase `ActivityRecord`s, domain errors) and
 * never exposes D1, SQL, JSON text or Cloudflare types. It is READ-ONLY by
 * design: Activity is append-only through application contracts (ADR-005/ADR-012),
 * so there is deliberately NO create, update, delete, soft-delete or restore
 * method here. Events are appended only as the atomic side effect of a meaningful
 * domain mutation, through the internal recording seam used by the D1 repositories
 * — never through this module-facing surface.
 *
 * The repository is WORKSPACE-BOUND: it is constructed with a single
 * `WorkspaceContext` and every method operates only within that workspace. No
 * method accepts a `workspaceId` — module code cannot pass, select or override the
 * scope per operation (ADR-010).
 */

import type {
  ActivityPage,
  ActivityRecord,
  ListEntityActivityInput,
  ListWorkspaceActivityInput,
} from "./activity";

/** Injectable clock, so tests control time instead of sleeping. */
export type Clock = () => Date;

/** Injectable id generator, so tests get deterministic ids. */
export type IdGenerator = () => string;

/** The default clock: the current wall-clock time. */
export const systemClock: Clock = () => new Date();

/**
 * The default id generator: a Workers-native secure UUID. `crypto.randomUUID()`
 * is globally unique and unguessable; ids are never reused.
 */
export const secureIdGenerator: IdGenerator = () => crypto.randomUUID();

/**
 * The kernel's Activity read contract.
 *
 * Error semantics (thrown as the typed errors in `activity-errors.ts`):
 *   - invalid input        → `ActivityValidationError` (no storage touched)
 *   - unknown anchor entity → `ActivitySubjectUnavailableError`
 *   - bad cursor           → `InvalidActivityCursorError`
 *   - corrupt stored JSON  → `ActivityPayloadError`
 *   - storage failure      → `ActivityStorageError`
 */
export interface ActivityRepository {
  /**
   * Read one Activity event by id within the bound workspace, with ALL of its
   * subjects. Returns null when there is no such event in this workspace —
   * including when it exists in another workspace, which is indistinguishable
   * from "does not exist" and never discloses cross-workspace existence.
   */
  getById(id: string): Promise<ActivityRecord | null>;

  /**
   * List the whole workspace Activity Feed using bounded cursor pagination.
   * Orders events newest-first by `(occurredAt, id)`, optionally filters by a
   * single event type, returns each event with all of its subjects (no N+1),
   * and applies a safe default and maximum page size. A cursor is bound to the
   * workspace + type filter that produced it and is rejected if replayed under a
   * different scope.
   */
  listForWorkspace(input?: ListWorkspaceActivityInput): Promise<ActivityPage>;

  /**
   * List one entity's Timeline — the events it is a subject of — using bounded
   * cursor pagination. The anchor entity must exist in the bound workspace, but
   * may be active OR soft-deleted: a deleted entity's Timeline remains
   * queryable. Returns the SAME `ActivityRecord`s the workspace feed returns,
   * each with ALL of its subjects (not only the anchor), newest-first, optionally
   * filtered by type, with no N+1 lookups. A cross-workspace or nonexistent
   * anchor surfaces as `ActivitySubjectUnavailableError`, disclosing nothing.
   */
  listForEntity(
    entityId: string,
    input?: ListEntityActivityInput,
  ): Promise<ActivityPage>;
}
