/**
 * X-04 — the storage-independent READ contract a workspace snapshot is built
 * from.
 *
 * It follows the same shape as the other read-only projections in the kernel
 * (PROJ-02 project health, PEOPLE-03 relationships, AREA-03 alignment):
 *
 *   - **workspace-bound at construction.** No method accepts a `workspaceId`,
 *     so a caller cannot reach another workspace's rows (ADR-010).
 *   - **read-only.** There is no mutating method, so an export structurally
 *     cannot write data or append Activity.
 *   - **bounded and deterministic.** Every collection is read through
 *     {@link WorkspaceSnapshotRepository.listPage} with an explicit limit and an
 *     opaque keyset cursor over a documented total ordering. There is no
 *     "read everything" method to fall into, and no `SELECT *` without a bound.
 *
 * The repository returns SNAPSHOT ROW SHAPES, not view models: the whole point
 * of X-04 is that the export serialises canonical records.
 */

import type {
  SnapshotCollection,
  SnapshotCollectionRowMap,
  SnapshotOwnerPreferences,
  SnapshotTaskSavedView,
  SnapshotWorkspace,
} from "./workspace-snapshot";

/**
 * The number of rows read per statement.
 *
 * Sized so a page is a single cheap indexed read and the assembled JSON stays
 * well inside a Worker's memory budget, while keeping the statement count for a
 * realistic personal workspace small. It is a hard ceiling, not a suggestion:
 * {@link WorkspaceSnapshotRepository.listPage} clamps to it.
 */
export const SNAPSHOT_PAGE_SIZE = 500;

/**
 * The absolute ceiling on rows the builder will accumulate for ONE collection.
 *
 * A snapshot has to fit in a Worker's memory and in a single response, so an
 * unbounded accumulation is not an option. Reaching this ceiling is a real
 * limitation of the export, and the builder records it in the snapshot's
 * `limitations` and in the manifest rather than producing a download that looks
 * complete and is not.
 */
export const SNAPSHOT_COLLECTION_MAX_ROWS = 50_000;

/** One bounded page of a collection, with the cursor for the next page. */
export interface SnapshotPage<T> {
  readonly rows: readonly T[];
  /** `null` when this was the last page. Opaque — never parsed by the caller. */
  readonly nextCursor: string | null;
}

/**
 * The workspace-bound, read-only snapshot source.
 *
 * `readOwnerPreferences` and `readTaskSavedViews` take the authenticated owner's
 * identifier because those rows are owner-scoped as well as workspace-scoped.
 * The identifier is used only as a query predicate; it is never written into the
 * snapshot (see `SnapshotOwnerPreferences`).
 */
export interface WorkspaceSnapshotRepository {
  /** The workspace's own identity row, or `null` when it does not exist. */
  readWorkspace(): Promise<SnapshotWorkspace | null>;

  /**
   * The owner's preferences. Returns the DEFAULTS with `version: 0` when the
   * owner has never saved a preference, exactly as the SET-01 contract does, so
   * an export never claims a stored value that does not exist.
   */
  readOwnerPreferences(ownerId: string): Promise<SnapshotOwnerPreferences>;

  /** The owner's saved Tasks views, in deterministic id order. Bounded. */
  readTaskSavedViews(
    ownerId: string,
  ): Promise<readonly SnapshotTaskSavedView[]>;

  /**
   * One bounded page of a collection, in that collection's documented total
   * ordering. `cursor` is `null` for the first page and otherwise the previous
   * page's `nextCursor`.
   */
  listPage<K extends SnapshotCollection>(
    collection: K,
    cursor: string | null,
    limit: number,
  ): Promise<SnapshotPage<SnapshotCollectionRowMap[K]>>;
}
