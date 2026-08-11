/**
 * PWA-04 / PWA-05 — the offline store: the domain API over IndexedDB.
 *
 * Everything above this file works in DalyHub terms — "save this snapshot",
 * "queue this capture", "clear this device" — and never sees a transaction. Two
 * invariants are enforced HERE, once, rather than at every call site:
 *
 *   1. **Every read and write is namespaced.** No method reads a record without a
 *      namespace, and no write stores one without it. Data from one identity or
 *      workspace therefore cannot appear under another, even if a caller forgets:
 *      there is no "read everything" method to forget with.
 *   2. **Retention is applied on write.** `saveSnapshot` replaces the namespace's
 *      records wholesale and prunes anything outside the window in the same
 *      transaction, so the device cannot accumulate records the policy says it
 *      must drop. Storage growth is bounded by the window, not by uptime.
 *
 * The capture queue is deliberately exempt from retention: it holds work that
 * exists ONLY on this device, and no automatic policy may discard it.
 */

import {
  OFFLINE_INDEXES,
  OFFLINE_STORES,
  orderMutations,
  recordKey,
  summariseQueue,
  type OfflineDiaryEntry,
  type OfflineMutationRecord,
  type OfflineMeeting,
  type OfflineNote,
  type OfflineQueueRecord,
  type OfflineQueueSummary,
  type OfflineReference,
  type OfflineSnapshot,
  type OfflineTask,
  type OfflineTodaySummary,
  type OfflineWindow,
} from "~/kernel/offline";
import { ownerCalendarDateResolver } from "~/shared/datetime";

import {
  OFFLINE_DATABASE_TIMEOUT_MS,
  openOfflineDatabase,
  requestToPromise,
  storageTimeoutFailure,
  transactionToPromise,
  withDeadline,
  type OfflineDatabaseFailure,
} from "./offline-database";

/** The metadata row stored per namespace. */
export interface OfflineMetaRecord {
  readonly namespace: string;
  readonly identityLabel: string;
  readonly workspaceLabel: string;
  readonly snapshotVersion: number;
  readonly lastSyncedAt: string;
  readonly window: OfflineWindow;
  readonly today: OfflineTodaySummary;
  readonly bounded: boolean;
  readonly counts: Readonly<Record<string, number>>;
}

/** One stored snapshot row. `kind` and `key` are storage concerns only. */
interface StoredRecord {
  readonly key: string;
  readonly namespace: string;
  readonly kind: string;
  readonly id: string;
  /** The calendar date used for retention pruning, or null when not date-bound. */
  readonly retentionIso: string | null;
  readonly value: unknown;
}

/** The complete offline dataset for one namespace, as the views consume it. */
export interface OfflineDataset {
  readonly meta: OfflineMetaRecord | null;
  readonly tasks: readonly OfflineTask[];
  readonly notes: readonly OfflineNote[];
  readonly diary: readonly OfflineDiaryEntry[];
  readonly meetings: readonly OfflineMeeting[];
  readonly references: readonly OfflineReference[];
}

/** An empty dataset — the honest shape when nothing is stored. */
export const EMPTY_OFFLINE_DATASET: OfflineDataset = {
  meta: null,
  tasks: [],
  notes: [],
  diary: [],
  meetings: [],
  references: [],
};

/**
 * PWA-11 — is this stored row still the shape the views were written against?
 *
 * Stored data is not trusted input. A device that ran out of quota mid-write, a
 * schema that changed under a rolled-back release, or a browser that truncated
 * its database leaves rows that are `null`, or missing the fields every card
 * reads. The old code walked them straight into `.toLowerCase()` and threw
 * inside a render — which on the offline page means a blank screen with no way
 * back, on the one surface whose whole job is to work when nothing else does.
 *
 * Dropping an unreadable row is the right trade: one record the owner cannot see
 * is a smaller loss than a page they cannot open.
 */
function isRenderableRecord(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const row = value as { id?: unknown; title?: unknown };
  return typeof row.id === "string" && typeof row.title === "string";
}

/** As above, for references — which carry a label rather than a title. */
function isRenderableReference(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  return typeof (value as { id?: unknown }).id === "string";
}

/**
 * Return a dataset containing only rows a view can safely render.
 *
 * Applied on the way OUT of storage AND again in the view, deliberately: the
 * view also renders datasets it was handed rather than read, and this is the one
 * invariant whose failure takes the offline page down entirely.
 */
export function sanitiseOfflineDataset(
  dataset: OfflineDataset,
): OfflineDataset {
  const keep = <T>(
    rows: readonly T[] | undefined,
    renderable: (row: unknown) => boolean,
  ) => (Array.isArray(rows) ? (rows.filter(renderable) as T[]) : []);
  return {
    meta: dataset.meta ?? null,
    tasks: keep(dataset.tasks, isRenderableRecord),
    notes: keep(dataset.notes, isRenderableRecord),
    diary: keep(dataset.diary, isRenderableRecord),
    meetings: keep(dataset.meetings, isRenderableRecord),
    references: keep(dataset.references, isRenderableReference),
  };
}

/** Every store operation resolves to this, so a caller never has to try/catch. */
export type OfflineStoreResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: OfflineDatabaseFailure };

/**
 * Run one unit of storage work, and ALWAYS answer.
 *
 * PWA-11 — the deadline is the reason no offline surface can be left "checking".
 * An IndexedDB transaction is supposed to fire `complete`, `abort` or `error`;
 * on iOS a transaction opened moments after an installed PWA cold-launches can
 * fire none of them, and the promise wrapping it never settles. Every caller
 * here already handles a failure result, so a deadline converts a hang into a
 * state the interface can render instead of a state it waits on.
 */
async function withDatabase<T>(
  run: (database: IDBDatabase) => Promise<T>,
): Promise<OfflineStoreResult<T>> {
  const opened = await openOfflineDatabase();
  if (!opened.ok) return { ok: false, failure: opened.failure };
  try {
    return await withDeadline<OfflineStoreResult<T>>(
      run(opened.database).then((value) => ({ ok: true, value }) as const),
      OFFLINE_DATABASE_TIMEOUT_MS,
      () => ({ ok: false, failure: storageTimeoutFailure() }) as const,
    );
  } catch (cause) {
    return {
      ok: false,
      failure: {
        kind: "migrationFailed",
        message:
          cause instanceof Error
            ? cause.message
            : "The offline database could not be read.",
      },
    };
  } finally {
    // Safe even for the timed-out case: `close()` sets a pending flag and the
    // connection is released once any outstanding transaction settles. It never
    // aborts a write, so a unit of work that answered late still commits.
    opened.database.close();
  }
}

/**
 * Read every row of a store for one namespace, via the namespace index.
 *
 * Reads and writes are deliberately kept in SEPARATE transactions throughout
 * this file. An IndexedDB transaction auto-commits as soon as its microtask
 * checkpoint drains with no pending request, so `await`-ing a read and then
 * issuing writes on the SAME transaction is the classic way to get an
 * intermittent `TransactionInactiveError` that appears only under load or in one
 * engine. Every write transaction below therefore receives the keys it needs up
 * front and contains nothing but synchronous `put`/`delete` calls.
 */
async function readNamespace(
  database: IDBDatabase,
  storeName: string,
  indexName: string,
  namespace: string,
): Promise<unknown[]> {
  const transaction = database.transaction(storeName, "readonly");
  const index = transaction.objectStore(storeName).index(indexName);
  const rows = await requestToPromise(
    index.getAll(IDBKeyRange.only(namespace)),
  );
  await transactionToPromise(transaction);
  return rows as unknown[];
}

/** Read the KEYS of every row of a store for one namespace. Its own transaction. */
async function readNamespaceKeys(
  database: IDBDatabase,
  storeName: string,
  indexName: string,
  namespace: string,
): Promise<IDBValidKey[]> {
  const transaction = database.transaction(storeName, "readonly");
  const index = transaction.objectStore(storeName).index(indexName);
  const keys = await requestToPromise(
    index.getAllKeys(IDBKeyRange.only(namespace)),
  );
  await transactionToPromise(transaction);
  return keys;
}

/** Narrow an unknown stored field to something a date resolver can read. */
function asInstant(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * The calendar date a record is retained by, in the OWNER's timezone.
 *
 * The timezone matters here, and getting it wrong deletes the owner's data.
 * Retention compares this date against a window whose bounds are the owner's
 * calendar dates (`offline-window.ts`), so the record's date has to be the
 * owner's too. Slicing the first ten characters off an ISO instant answers a
 * different question — the date in UTC — and the two disagree for part of every
 * day: in Australia/Sydney a diary entry written at 09:00 on the window's FIRST
 * day is `T23:00Z` on the day before it, so a UTC slice puts it outside the
 * window and the next prune deletes it the moment it arrives.
 *
 * Returning `null` means "retained for as long as its namespace's snapshot is",
 * which applies to references — they exist only to label other records and are
 * replaced wholesale on every sync.
 */
function retentionIsoFor(
  kind: string,
  value: unknown,
  ownerDate: (value: Date | string | null | undefined) => string | null,
): string | null {
  const record = value as Record<string, unknown>;
  switch (kind) {
    case "task": {
      // An OPEN overdue task is retained however old its date is: it is still
      // owed, and dropping it would hide exactly the work the owner most needs.
      if (record.status !== "completed") return null;
      return ownerDate(asInstant(record.completedAt));
    }
    case "note":
      return ownerDate(asInstant(record.updatedAt));
    case "diary":
      return ownerDate(asInstant(record.occurredAt));
    case "meeting":
      return ownerDate(asInstant(record.startsAt));
    default:
      return null;
  }
}

/**
 * Store a snapshot for its namespace, replacing that namespace's records.
 *
 * Replacement rather than merge is deliberate: the server's snapshot IS the
 * seven-day truth, and merging would let a record the server has dropped from the
 * window survive indefinitely on the device — exactly the unbounded growth this
 * policy exists to prevent. Records of OTHER namespaces are untouched.
 */
export async function saveSnapshot(
  snapshot: OfflineSnapshot,
): Promise<OfflineStoreResult<OfflineMetaRecord>> {
  return withDatabase(async (database) => {
    // READ first, in its own transaction. Clearing this namespace ONLY — never
    // `records.clear()`, which would delete another identity's or workspace's
    // data on a shared browser profile.
    const existingKeys = await readNamespaceKeys(
      database,
      OFFLINE_STORES.records,
      OFFLINE_INDEXES.recordsByNamespace,
      snapshot.namespace,
    );

    const transaction = database.transaction(
      [OFFLINE_STORES.records, OFFLINE_STORES.meta],
      "readwrite",
    );
    const records = transaction.objectStore(OFFLINE_STORES.records);
    const meta = transaction.objectStore(OFFLINE_STORES.meta);
    for (const key of existingKeys) {
      records.delete(key);
    }

    const sections: readonly (readonly [string, readonly { id: string }[]])[] =
      [
        ["task", snapshot.tasks],
        ["note", snapshot.notes],
        ["diary", snapshot.diary],
        ["meeting", snapshot.meetings],
        ["reference", snapshot.references],
      ];
    const counts: Record<string, number> = {};
    const ownerDate = ownerCalendarDateResolver(snapshot.window.timezone);
    for (const [kind, values] of sections) {
      counts[kind] = values.length;
      for (const value of values) {
        const stored: StoredRecord = {
          key: recordKey(snapshot.namespace, kind, value.id),
          namespace: snapshot.namespace,
          kind,
          id: value.id,
          retentionIso: retentionIsoFor(kind, value, ownerDate),
          value,
        };
        records.put(stored);
      }
    }

    const metaRecord: OfflineMetaRecord = {
      namespace: snapshot.namespace,
      identityLabel: snapshot.identityLabel,
      workspaceLabel: snapshot.workspaceLabel,
      snapshotVersion: snapshot.snapshotVersion,
      lastSyncedAt: snapshot.generatedAt,
      window: snapshot.window,
      today: snapshot.today,
      bounded: snapshot.bounded,
      counts,
    };
    meta.put(metaRecord);

    await transactionToPromise(transaction);
    return metaRecord;
  });
}

/** Read the whole dataset for one namespace. */
export async function readDataset(
  namespace: string,
): Promise<OfflineStoreResult<OfflineDataset>> {
  return withDatabase(async (database) => {
    const metaTransaction = database.transaction(
      OFFLINE_STORES.meta,
      "readonly",
    );
    const meta = (await requestToPromise(
      metaTransaction.objectStore(OFFLINE_STORES.meta).get(namespace),
    )) as OfflineMetaRecord | undefined;
    await transactionToPromise(metaTransaction);

    const rows = (await readNamespace(
      database,
      OFFLINE_STORES.records,
      OFFLINE_INDEXES.recordsByNamespace,
      namespace,
    )) as StoredRecord[];

    const bucket = <T>(kind: string): T[] =>
      rows.filter((row) => row.kind === kind).map((row) => row.value as T);

    return sanitiseOfflineDataset({
      meta: meta ?? null,
      tasks: bucket<OfflineTask>("task"),
      notes: bucket<OfflineNote>("note"),
      diary: bucket<OfflineDiaryEntry>("diary"),
      meetings: bucket<OfflineMeeting>("meeting"),
      references: bucket<OfflineReference>("reference"),
    });
  });
}

/**
 * The most recently synced namespace stored on this device, if any.
 *
 * Used for ONE thing: an offline cold launch, where there is no network to ask
 * the server which identity is signed in. The offline surfaces that read it
 * always display the identity the data belongs to, and the next successful sync
 * replaces it with the server-derived namespace — so a stale device never
 * silently presents one identity's data as another's.
 */
export async function readLatestMeta(): Promise<
  OfflineStoreResult<OfflineMetaRecord | null>
> {
  return withDatabase(async (database) => {
    const transaction = database.transaction(OFFLINE_STORES.meta, "readonly");
    const rows = (await requestToPromise(
      transaction.objectStore(OFFLINE_STORES.meta).getAll(),
    )) as OfflineMetaRecord[];
    await transactionToPromise(transaction);
    if (rows.length === 0) return null;
    return [...rows].sort((a, b) =>
      b.lastSyncedAt.localeCompare(a.lastSyncedAt),
    )[0];
  });
}

/**
 * Drop records that have fallen outside the retention window.
 *
 * Runs after a successful sync, after a schema migration and when DalyHub opens,
 * so a device left unopened for a month does not keep a month-old snapshot.
 * Records with no retention date (open tasks, references) are kept: they are
 * replaced wholesale by the next snapshot rather than aged out.
 */
export async function pruneRetention(
  namespace: string,
  window: OfflineWindow,
): Promise<OfflineStoreResult<number>> {
  return withDatabase(async (database) => {
    const rows = (await readNamespace(
      database,
      OFFLINE_STORES.records,
      OFFLINE_INDEXES.recordsByNamespace,
      namespace,
    )) as StoredRecord[];

    const expired = rows.filter(
      (row) =>
        row.retentionIso !== null &&
        (row.retentionIso < window.startIso ||
          row.retentionIso > window.endIso),
    );
    if (expired.length === 0) return 0;

    const transaction = database.transaction(
      OFFLINE_STORES.records,
      "readwrite",
    );
    const store = transaction.objectStore(OFFLINE_STORES.records);
    for (const row of expired) store.delete(row.key);
    await transactionToPromise(transaction);
    return expired.length;
  });
}

/** Delete every stored record and metadata row for OTHER namespaces. */
export async function clearOtherNamespaces(
  keepNamespace: string,
): Promise<OfflineStoreResult<number>> {
  return withDatabase(async (database) => {
    const readTransaction = database.transaction(
      [OFFLINE_STORES.records, OFFLINE_STORES.meta],
      "readonly",
    );
    const rows = (await requestToPromise(
      readTransaction.objectStore(OFFLINE_STORES.records).getAll(),
    )) as StoredRecord[];
    const metas = (await requestToPromise(
      readTransaction.objectStore(OFFLINE_STORES.meta).getAll(),
    )) as OfflineMetaRecord[];
    await transactionToPromise(readTransaction);

    const staleRecords = rows.filter((row) => row.namespace !== keepNamespace);
    const staleMetas = metas.filter((row) => row.namespace !== keepNamespace);
    if (staleRecords.length === 0 && staleMetas.length === 0) return 0;

    const transaction = database.transaction(
      [OFFLINE_STORES.records, OFFLINE_STORES.meta],
      "readwrite",
    );
    const records = transaction.objectStore(OFFLINE_STORES.records);
    const meta = transaction.objectStore(OFFLINE_STORES.meta);
    for (const row of staleRecords) records.delete(row.key);
    for (const row of staleMetas) meta.delete(row.namespace);
    await transactionToPromise(transaction);
    return staleRecords.length;
  });
}

/** Delete the cached READ-ONLY snapshot for a namespace. Keeps the queue. */
export async function clearSnapshot(
  namespace: string,
): Promise<OfflineStoreResult<void>> {
  return withDatabase(async (database) => {
    const keys = await readNamespaceKeys(
      database,
      OFFLINE_STORES.records,
      OFFLINE_INDEXES.recordsByNamespace,
      namespace,
    );
    const transaction = database.transaction(
      [OFFLINE_STORES.records, OFFLINE_STORES.meta],
      "readwrite",
    );
    const records = transaction.objectStore(OFFLINE_STORES.records);
    for (const key of keys) records.delete(key);
    transaction.objectStore(OFFLINE_STORES.meta).delete(namespace);
    await transactionToPromise(transaction);
  });
}

/* -------------------------------------------------------------------------- */
/* The capture queue                                                          */
/* -------------------------------------------------------------------------- */

/** Append a capture to the queue. */
export async function putQueueRecord(
  record: OfflineQueueRecord,
): Promise<OfflineStoreResult<OfflineQueueRecord>> {
  return withDatabase(async (database) => {
    const transaction = database.transaction(OFFLINE_STORES.queue, "readwrite");
    transaction.objectStore(OFFLINE_STORES.queue).put(record);
    await transactionToPromise(transaction);
    return record;
  });
}

/** Read every queued capture for a namespace, oldest first. */
export async function readQueue(
  namespace: string,
): Promise<OfflineStoreResult<readonly OfflineQueueRecord[]>> {
  return withDatabase(async (database) => {
    const rows = (await readNamespace(
      database,
      OFFLINE_STORES.queue,
      OFFLINE_INDEXES.queueByNamespace,
      namespace,
    )) as OfflineQueueRecord[];
    return [...rows].sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  });
}

/** Read the queue across every namespace — used only by the Settings totals. */
export async function readAllQueued(): Promise<
  OfflineStoreResult<readonly OfflineQueueRecord[]>
> {
  return withDatabase(async (database) => {
    const transaction = database.transaction(OFFLINE_STORES.queue, "readonly");
    const rows = (await requestToPromise(
      transaction.objectStore(OFFLINE_STORES.queue).getAll(),
    )) as OfflineQueueRecord[];
    await transactionToPromise(transaction);
    return rows;
  });
}

/** Remove one queued capture. Only ever called after explicit confirmation. */
export async function deleteQueueRecord(
  id: string,
): Promise<OfflineStoreResult<void>> {
  return withDatabase(async (database) => {
    const transaction = database.transaction(OFFLINE_STORES.queue, "readwrite");
    transaction.objectStore(OFFLINE_STORES.queue).delete(id);
    await transactionToPromise(transaction);
  });
}

/** Remove the captures that have already synced, keeping everything else. */
export async function pruneSyncedQueue(
  namespace: string,
): Promise<OfflineStoreResult<number>> {
  return withDatabase(async (database) => {
    const rows = (await readNamespace(
      database,
      OFFLINE_STORES.queue,
      OFFLINE_INDEXES.queueByNamespace,
      namespace,
    )) as OfflineQueueRecord[];
    const synced = rows.filter((row) => row.status === "synced");
    if (synced.length === 0) return 0;

    const transaction = database.transaction(OFFLINE_STORES.queue, "readwrite");
    const store = transaction.objectStore(OFFLINE_STORES.queue);
    for (const row of synced) store.delete(row.id);
    await transactionToPromise(transaction);
    return synced.length;
  });
}

/** Summarise a namespace's queue. */
export async function summariseNamespaceQueue(
  namespace: string,
): Promise<OfflineStoreResult<OfflineQueueSummary>> {
  const queue = await readQueue(namespace);
  if (!queue.ok) return queue;
  return { ok: true, value: summariseQueue(queue.value) };
}

/* -------------------------------------------------------------------------- */
/* PWA-12 — the Task mutation queue                                           */
/* -------------------------------------------------------------------------- */

/** Write one queued mutation. Keyed by `id`, so a re-write replaces in place. */
export async function putMutationRecord(
  record: OfflineMutationRecord,
): Promise<OfflineStoreResult<OfflineMutationRecord>> {
  return withDatabase(async (database) => {
    const transaction = database.transaction(
      OFFLINE_STORES.mutations,
      "readwrite",
    );
    transaction.objectStore(OFFLINE_STORES.mutations).put(record);
    await transactionToPromise(transaction);
    return record;
  });
}

/**
 * Read every queued mutation for a namespace, in CAUSAL order.
 *
 * Ordering is by `sequence`, never by timestamp: see `offline-mutation.ts` for
 * why a device clock cannot be trusted to order the owner's intent.
 */
export async function readMutations(
  namespace: string,
): Promise<OfflineStoreResult<readonly OfflineMutationRecord[]>> {
  return withDatabase(async (database) => {
    const rows = (await readNamespace(
      database,
      OFFLINE_STORES.mutations,
      OFFLINE_INDEXES.mutationsByNamespace,
      namespace,
    )) as OfflineMutationRecord[];
    return orderMutations(rows);
  });
}

/** Read the mutation queue across every namespace — Settings totals only. */
export async function readAllMutations(): Promise<
  OfflineStoreResult<readonly OfflineMutationRecord[]>
> {
  return withDatabase(async (database) => {
    const transaction = database.transaction(
      OFFLINE_STORES.mutations,
      "readonly",
    );
    const rows = (await requestToPromise(
      transaction.objectStore(OFFLINE_STORES.mutations).getAll(),
    )) as OfflineMutationRecord[];
    await transactionToPromise(transaction);
    return rows;
  });
}

/** Remove one queued mutation. Only ever called after explicit confirmation. */
export async function deleteMutationRecord(
  id: string,
): Promise<OfflineStoreResult<void>> {
  return withDatabase(async (database) => {
    const transaction = database.transaction(
      OFFLINE_STORES.mutations,
      "readwrite",
    );
    transaction.objectStore(OFFLINE_STORES.mutations).delete(id);
    await transactionToPromise(transaction);
  });
}

/**
 * Drop the mutations the server has confirmed.
 *
 * PWA-12 retention (§42): a synced mutation has served its whole purpose the
 * moment the server confirms it, and the Activity stream — not this queue — is
 * DalyHub's audit authority. Keeping settled intents here would turn a transport
 * buffer into a second, permanent, unaudited history of the owner's edits. The
 * queue therefore holds only work that is still owed or still owned by the owner.
 */
export async function pruneSyncedMutations(
  namespace: string,
): Promise<OfflineStoreResult<number>> {
  return withDatabase(async (database) => {
    const rows = (await readNamespace(
      database,
      OFFLINE_STORES.mutations,
      OFFLINE_INDEXES.mutationsByNamespace,
      namespace,
    )) as OfflineMutationRecord[];
    const synced = rows.filter((row) => row.status === "synced");
    if (synced.length === 0) return 0;

    const transaction = database.transaction(
      OFFLINE_STORES.mutations,
      "readwrite",
    );
    const store = transaction.objectStore(OFFLINE_STORES.mutations);
    for (const row of synced) store.delete(row.id);
    await transactionToPromise(transaction);
    return synced.length;
  });
}

/* -------------------------------------------------------------------------- */
/* Device-level controls                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Delete EVERYTHING DalyHub stores on this device: the snapshot, the metadata,
 * the capture queue and the mutation queue, for every namespace. Server records
 * are not touched — this file has no path to a server mutation.
 */
export async function clearAllOfflineData(): Promise<OfflineStoreResult<void>> {
  return withDatabase(async (database) => {
    const transaction = database.transaction(
      [
        OFFLINE_STORES.records,
        OFFLINE_STORES.meta,
        OFFLINE_STORES.queue,
        OFFLINE_STORES.mutations,
      ],
      "readwrite",
    );
    transaction.objectStore(OFFLINE_STORES.records).clear();
    transaction.objectStore(OFFLINE_STORES.meta).clear();
    transaction.objectStore(OFFLINE_STORES.queue).clear();
    transaction.objectStore(OFFLINE_STORES.mutations).clear();
    await transactionToPromise(transaction);
  });
}

/** The browser's estimate of how much storage this origin is using. */
export async function estimateOfflineStorage(): Promise<{
  readonly usageBytes: number | null;
  readonly quotaBytes: number | null;
}> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
      // Degrade gracefully: Safari on iOS has historically not implemented this,
      // and Settings says "not reported by this browser" rather than guessing.
      return { usageBytes: null, quotaBytes: null };
    }
    const estimate = await navigator.storage.estimate();
    return {
      usageBytes: estimate.usage ?? null,
      quotaBytes: estimate.quota ?? null,
    };
  } catch {
    return { usageBytes: null, quotaBytes: null };
  }
}
