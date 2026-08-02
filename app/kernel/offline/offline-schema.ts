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
 *   - **The capture queue is never dropped by a migration.** It is the one store
 *     holding data that exists ONLY on the device. A step that cannot preserve it
 *     must fail rather than discard the owner's un-synced work.
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

import { OFFLINE_SCHEMA_VERSION } from "./offline-identity";

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
];

/** The version the running release expects. Must match the last ladder step. */
export const OFFLINE_DATABASE_VERSION = OFFLINE_SCHEMA_VERSION;

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
