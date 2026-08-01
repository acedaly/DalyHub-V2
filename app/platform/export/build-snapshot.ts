/**
 * X-04 — build ONE canonical `DalyHubWorkspaceSnapshotV1` from the workspace.
 *
 * This is the single seam between the database and every export format. The
 * structured archive and the Obsidian vault are both PURE functions of the value
 * this module returns, which is what makes "two exports that cannot drift" a
 * structural property rather than a promise.
 *
 * What it does, and deliberately does not do:
 *
 *   - it **pages** each collection through the bounded repository until the
 *     source is exhausted or the collection ceiling is reached — never a single
 *     unbounded read;
 *   - it **records** every ceiling it hits, and every Activity payload that
 *     would not parse, as a named `SnapshotLimitation`, so an incomplete export
 *     says so in its own manifest instead of looking complete;
 *   - it **validates** the finished snapshot before returning it, so a caller
 *     cannot serialise a malformed one;
 *   - it **writes nothing**. There is no mutating repository in scope.
 */

import {
  SNAPSHOT_COLLECTION_MAX_ROWS,
  SNAPSHOT_COLLECTION_ORDER,
  SNAPSHOT_CONSISTENCY,
  SNAPSHOT_PAGE_SIZE,
  SNAPSHOT_SCHEMA_NAME,
  SNAPSHOT_SCHEMA_VERSION,
  assertValidWorkspaceSnapshot,
  type SnapshotApplication,
  type SnapshotCollection,
  type SnapshotCollectionRowMap,
  type SnapshotLimitation,
  type SnapshotPage,
  type SnapshotRecords,
  type WorkspaceSnapshotRepository,
  type WorkspaceSnapshotV1,
} from "~/kernel/export";

/** Thrown when the workspace itself cannot be resolved. Fails the export closed. */
export class WorkspaceSnapshotUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceSnapshotUnavailableError";
  }
}

export interface BuildSnapshotOptions {
  /** The authenticated owner, used ONLY as a query predicate. Never exported. */
  readonly ownerId: string;
  /** The instant the export started. Injected so builds are deterministic in tests. */
  readonly exportedAt: Date;
  /** The safe build facts from the ONE version authority (`~/lib/version`). */
  readonly application: SnapshotApplication;
  /** Test seam: override the per-page read size. Clamped by the repository. */
  readonly pageSize?: number;
}

/** Page one collection to exhaustion (or its ceiling), preserving order. */
async function collect<K extends SnapshotCollection>(
  repository: WorkspaceSnapshotRepository,
  collection: K,
  pageSize: number,
  limitations: SnapshotLimitation[],
): Promise<readonly SnapshotCollectionRowMap[K][]> {
  const rows: SnapshotCollectionRowMap[K][] = [];
  let cursor: string | null = null;
  for (;;) {
    const page: SnapshotPage<SnapshotCollectionRowMap[K]> =
      await repository.listPage(collection, cursor, pageSize);
    rows.push(...page.rows);
    if (rows.length >= SNAPSHOT_COLLECTION_MAX_ROWS) {
      if (rows.length > SNAPSHOT_COLLECTION_MAX_ROWS) {
        rows.length = SNAPSHOT_COLLECTION_MAX_ROWS;
      }
      if (page.nextCursor !== null) {
        limitations.push({
          code: "collection_truncated",
          subject: collection,
          detail:
            `This export carries the first ${SNAPSHOT_COLLECTION_MAX_ROWS} ` +
            `${collection} records in id order. The workspace holds more, and ` +
            `the remainder is NOT in this file.`,
        });
      }
      return rows;
    }
    if (page.nextCursor === null) return rows;
    cursor = page.nextCursor;
  }
}

/**
 * Build and validate the canonical snapshot.
 *
 * Collections are read SEQUENTIALLY, in `SNAPSHOT_COLLECTION_ORDER`. That is a
 * deliberate trade: reading them concurrently would finish sooner but would
 * widen the window in which a concurrent write can land between two
 * collections, making the referential-integrity check below more likely to fail
 * for a reason the owner cannot act on. An export is a rare, deliberate action;
 * a coherent file is worth more than a faster one.
 */
export async function buildWorkspaceSnapshot(
  repository: WorkspaceSnapshotRepository,
  options: BuildSnapshotOptions,
): Promise<WorkspaceSnapshotV1> {
  const limitations: SnapshotLimitation[] = [];
  const pageSize = options.pageSize ?? SNAPSHOT_PAGE_SIZE;

  const workspace = await repository.readWorkspace();
  if (workspace === null) {
    throw new WorkspaceSnapshotUnavailableError(
      "The authenticated workspace could not be resolved.",
    );
  }

  const preferences = await repository.readOwnerPreferences(options.ownerId);
  const taskSavedViews = await repository.readTaskSavedViews(options.ownerId);

  const collected: Partial<Record<SnapshotCollection, readonly unknown[]>> = {};
  for (const collection of SNAPSHOT_COLLECTION_ORDER) {
    collected[collection] = await collect(
      repository,
      collection,
      pageSize,
      limitations,
    );
  }
  const records = collected as unknown as SnapshotRecords;

  // An Activity payload that would not parse is a real, if rare, loss of
  // fidelity. Naming it is the difference between an honest export and one that
  // quietly drops history.
  const unparseablePayloads = records.activities.filter(
    (activity) => activity.payload === null,
  ).length;
  if (unparseablePayloads > 0) {
    limitations.push({
      code: "activity_payload_unparseable",
      subject: "activities",
      detail:
        `${unparseablePayloads} Activity event(s) stored a payload that is not ` +
        "valid JSON; their payload reads null in this export. The event, its " +
        "type, its timestamp and its subjects are intact.",
    });
  }

  if (preferences.navigationConfig === null) {
    limitations.push({
      code: "preference_value_unparseable",
      subject: "owner.preferences.navigationConfig",
      detail:
        "The stored navigation preference is not valid JSON; it reads null " +
        "here. Every other preference is intact.",
    });
  }

  const snapshot: WorkspaceSnapshotV1 = {
    meta: {
      schema: SNAPSHOT_SCHEMA_NAME,
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      application: options.application,
      exportedAt: options.exportedAt.toISOString(),
      consistency: SNAPSHOT_CONSISTENCY,
    },
    workspace,
    owner: { preferences, taskSavedViews },
    records,
    limitations,
  };

  // The gate. A malformed or internally inconsistent snapshot throws here, so
  // no caller can turn one into a download that looks valid and is not.
  assertValidWorkspaceSnapshot(snapshot);
  return snapshot;
}
