/**
 * PWA-08 — the offline database schema and its migration ladder.
 *
 * IndexedDB structures cannot be changed in place: object stores and indexes only
 * exist inside a `versionchange` transaction, and a store created by one release
 * is exactly what the next release inherits. So the schema is declared here as an
 * explicit, ordered ladder of upgrade steps, and the browser adapter walks it —
 * rather than the usual `if (oldVersion < 2) { … }` accumulation that nobody can
 * later reason about.
 *
 * ── The rules this ladder enforces ───────────────────────────────────────────
 *   - **Every version has exactly one step**, and a step is applied only when the
 *     database is below it. Upgrading 1 → 3 runs steps 2 then 3, in order.
 *   - **A step is structural only.** Creating stores and indexes is safe inside a
 *     `versionchange` transaction; long-running data rewrites are not, because a
 *     tab closing mid-upgrade leaves a half-migrated database with the NEW version
 *     number and no way to tell. Where data must change shape, the step DROPS the
 *     affected store and lets the snapshot be rebuilt from the server — which is
 *     always safe, because the snapshot is a cache of server data, never the
 *     original.
 *   - **The QUEUES are never dropped by a migration.** The capture queue and (from
 *     PWA-12) the mutation queue are the two stores holding data that exists ONLY
 *     on the device. A step that cannot preserve them must fail rather than
 *     discard the owner's un-synced work.
 *   - **A newer database is never opened by an older release.** IndexedDB refuses
 *     this itself (it throws `VersionError`), and the adapter reports it as a
 *     recoverable "this browser holds newer DalyHub data" state rather than
 *     deleting anything.
 *
 * ── Recovery ─────────────────────────────────────────────────────────────────
 * If a migration cannot complete, the adapter's recovery path deletes ONLY the
 * DalyHub offline database and rebuilds it. Nothing server-side is touched: D1 is
 * never involved in a local migration, and there is no code path from here to a
 * server mutation.
 */

/** The IndexedDB database name. Versioned data lives inside, not in the name. */
export const OFFLINE_DATABASE_NAME = "dalyhub-offline";

/** Object store names. */
export const OFFLINE_STORES = {
  /** Per-namespace metadata: last sync, window, labels, snapshot summary. */
  meta: "meta",
  /** The seven-day snapshot records, one row per record. */
  records: "records",
  /** The append-only capture queue. NEVER dropped by a migration. */
  queue: "queue",
  /** PWA-12 — the Task mutation queue. NEVER dropped by a migration. */
  mutations: "mutations",
} as const;

/** Index names, kept here so the adapter and the tests name them identically. */
export const OFFLINE_INDEXES = {
  /** `records` by namespace, for scoped reads and namespace-wide deletes. */
  recordsByNamespace: "by_namespace",
  /** `records` by namespace + kind, for "all tasks in this namespace". */
  recordsByNamespaceKind: "by_namespace_kind",
  /** `queue` by namespace, for scoped reads. */
  queueByNamespace: "by_namespace",
  /** `queue` by status, for "what is still pending". */
  queueByNamespaceStatus: "by_namespace_status",
  /** `mutations` by namespace, for scoped reads. */
  mutationsByNamespace: "by_namespace",
  /** `mutations` by namespace + entity, for "what is queued for this Task". */
  mutationsByNamespaceEntity: "by_namespace_entity",
} as const;

/** One rung of the ladder. `apply` runs inside the `versionchange` transaction. */
export interface OfflineSchemaStep {
  readonly version: number;
  readonly description: string;
  readonly apply: (database: IDBDatabase, transaction: IDBTransaction) => void;
}

/**
 * The ladder. Append a step to change the schema; never edit a shipped one — a
 * device that already ran it will not run it again.
 */
export const OFFLINE_SCHEMA_STEPS: readonly OfflineSchemaStep[] = [
  {
    version: 1,
    description:
      "Initial schema: namespaced metadata, snapshot records and the capture queue.",
    apply(database) {
      if (!database.objectStoreNames.contains(OFFLINE_STORES.meta)) {
        // Keyed by namespace: one metadata row per identity + workspace.
        database.createObjectStore(OFFLINE_STORES.meta, {
          keyPath: "namespace",
        });
      }
      if (!database.objectStoreNames.contains(OFFLINE_STORES.records)) {
        // The key is `${namespace}|${kind}|${id}` so a record from one workspace
        // can never overwrite the same id in another.
        const records = database.createObjectStore(OFFLINE_STORES.records, {
          keyPath: "key",
        });
        records.createIndex(OFFLINE_INDEXES.recordsByNamespace, "namespace", {
          unique: false,
        });
        records.createIndex(
          OFFLINE_INDEXES.recordsByNamespaceKind,
          ["namespace", "kind"],
          { unique: false },
        );
      }
      if (!database.objectStoreNames.contains(OFFLINE_STORES.queue)) {
        const queue = database.createObjectStore(OFFLINE_STORES.queue, {
          keyPath: "id",
        });
        queue.createIndex(OFFLINE_INDEXES.queueByNamespace, "namespace", {
          unique: false,
        });
        queue.createIndex(
          OFFLINE_INDEXES.queueByNamespaceStatus,
          ["namespace", "status"],
          { unique: false },
        );
      }
    },
  },
  {
    version: 2,
    description: "PWA-12: the Task mutation queue.",
    apply(database) {
      if (!database.objectStoreNames.contains(OFFLINE_STORES.mutations)) {
        // Keyed by `id`, which is ALSO the server idempotency key. One row per
        // intent, so a replay can never find two rows claiming the same key.
        const mutations = database.createObjectStore(OFFLINE_STORES.mutations, {
          keyPath: "id",
        });
        mutations.createIndex(
          OFFLINE_INDEXES.mutationsByNamespace,
          "namespace",
          { unique: false },
        );
        mutations.createIndex(
          OFFLINE_INDEXES.mutationsByNamespaceEntity,
          ["namespace", "entityId"],
          { unique: false },
        );
      }
    },
  },
];

/**
 * The version the running release expects. Must match the last ladder step.
 *
 * PWA-12 — deliberately DERIVED from the ladder rather than aliased to
 * `OFFLINE_SCHEMA_VERSION`, which is what it was until this milestone. The two
 * answer different questions and this release is the first where they diverge:
 *
 *   - `OFFLINE_DATABASE_VERSION` is the IndexedDB structure. It advances whenever
 *     a store or index is added, which is a purely local, additive event.
 *   - `OFFLINE_SCHEMA_VERSION` is part of the NAMESPACE digest — the identity a
 *     device's data is filed under. Advancing it re-files everything: the next
 *     sync derives a different namespace, `clearOtherNamespaces` discards the old
 *     snapshot, and any capture queued under the old namespace can never be
 *     replayed, because replay refuses to send a record whose namespace does not
 *     match the signed-in session.
 *
 * Adding a store does not change what a namespace MEANS, so it must not strand
 * the owner's un-synced work. Keeping them separate is what makes this migration
 * additive in the way the ladder's own rules require.
 */
export const OFFLINE_DATABASE_VERSION =
  OFFLINE_SCHEMA_STEPS[OFFLINE_SCHEMA_STEPS.length - 1].version;

/**
 * The steps to run for an upgrade from `fromVersion` to `toVersion`. Pure, so the
 * ladder's ordering and gap-freeness are unit-testable without IndexedDB.
 */
export function stepsFor(
  fromVersion: number,
  toVersion: number = OFFLINE_DATABASE_VERSION,
): readonly OfflineSchemaStep[] {
  return OFFLINE_SCHEMA_STEPS.filter(
    (step) => step.version > fromVersion && step.version <= toVersion,
  );
}

/** Compose a namespaced record key. The one place the format is defined. */
export function recordKey(namespace: string, kind: string, id: string): string {
  return `${namespace}|${kind}|${id}`;
}
