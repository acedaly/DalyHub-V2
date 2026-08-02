/**
 * PWA-08 — the IndexedDB adapter: opening, migrating and recovering.
 *
 * The only module in DalyHub that talks to IndexedDB directly. Everything above
 * it (`offline-store.ts`, the sync engine, the React provider) works in domain
 * terms and never sees a request, a transaction or an event handler — the same
 * separation the D1 adapter has from the kernel repositories.
 *
 * ── Why this is more than `openDB()` ─────────────────────────────────────────
 * IndexedDB fails in ways a naive wrapper turns into a blank screen:
 *
 *   - **A newer database.** If the owner has used a NEWER DalyHub release in this
 *     browser and then loads an older one (a rollback, a stale cached bundle),
 *     `open` rejects with `VersionError`. Deleting the database "to fix it" would
 *     destroy the newer release's un-synced captures. This adapter reports it as a
 *     distinct, recoverable state and touches nothing.
 *   - **A blocked upgrade.** Another tab holding an open connection blocks the
 *     `versionchange` transaction indefinitely. The adapter listens for `blocked`
 *     and reports it rather than hanging forever behind an unresolved promise.
 *   - **An interrupted upgrade.** A tab closed mid-upgrade can leave a database
 *     whose version advanced but whose stores did not. Every open therefore
 *     VERIFIES the expected stores exist and, if they do not, takes the recovery
 *     path instead of failing on first use.
 *   - **Storage simply unavailable.** Private browsing, disabled storage, an
 *     embedded webview. Offline support degrades to "not available on this
 *     device"; it never throws into a render.
 *
 * ── The recovery rule ────────────────────────────────────────────────────────
 * Recovery deletes ONLY the DalyHub offline database, and only when the schema is
 * unusable. It never touches server data: there is no code path from this file to
 * a mutation, and the snapshot it discards is a cache of D1 that the next sync
 * rebuilds. Un-synced captures are the one thing that cannot be rebuilt, so
 * recovery reports what it discarded rather than doing it silently.
 */

import {
  OFFLINE_DATABASE_NAME,
  OFFLINE_DATABASE_VERSION,
  OFFLINE_STORES,
  stepsFor,
} from "~/kernel/offline";

/** Why the offline database could not be opened. */
export type OfflineDatabaseFailure =
  /** No IndexedDB on this platform, or storage is blocked. */
  | { readonly kind: "unavailable"; readonly message: string }
  /** The stored database was written by a NEWER DalyHub. Nothing was changed. */
  | { readonly kind: "newerSchema"; readonly message: string }
  /** Another tab is holding the database open and blocking the upgrade. */
  | { readonly kind: "blocked"; readonly message: string }
  /** The upgrade could not complete. Recovery is available. */
  | { readonly kind: "migrationFailed"; readonly message: string }
  /** The request was made and NO event ever arrived. See `withDeadline`. */
  | { readonly kind: "timedOut"; readonly message: string };

/**
 * PWA-11 — how long any one IndexedDB operation may take before it is treated as
 * a failure.
 *
 * IndexedDB's contract is "an event will arrive", and on iOS that contract is not
 * always kept: an `open` issued moments after an installed PWA cold-launches can
 * fire neither `success`, nor `error`, nor `blocked`, and the promise wrapping it
 * simply never settles. Every "Checking what this device has stored…" that never
 * resolved was a promise waiting on an event that was never going to come.
 *
 * Six seconds is far longer than a healthy open takes (single-digit
 * milliseconds), so this never fires for a working device; when it does fire, it
 * turns an indefinite wait into a stated outcome.
 */
export const OFFLINE_DATABASE_TIMEOUT_MS = 6_000;

/**
 * Resolve to `onTimeout` if `work` has not settled within `timeoutMs`.
 *
 * A REJECTION passes straight through: "it failed" and "it never answered" are
 * different facts and the callers here report them differently. The abandoned
 * promise is not cancelled — IndexedDB has no cancellation — it is simply no
 * longer waited on, which is the correct trade: a stale answer to a question the
 * page has already answered is worse than no answer.
 */
export function withDeadline<T>(
  work: Promise<T>,
  timeoutMs: number,
  onTimeout: () => T,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(onTimeout());
    }, timeoutMs);
    work.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (cause: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(cause instanceof Error ? cause : new Error(String(cause)));
      },
    );
  });
}

/** The failure a timed-out storage operation reports. */
export function storageTimeoutFailure(): OfflineDatabaseFailure {
  return {
    kind: "timedOut",
    message:
      "This device's offline storage did not respond. Nothing has been lost — reopen DalyHub to try again.",
  };
}

export type OfflineDatabaseResult =
  | { readonly ok: true; readonly database: IDBDatabase }
  | { readonly ok: false; readonly failure: OfflineDatabaseFailure };

/** True when this environment can store offline data at all. */
export function isOfflineStorageAvailable(): boolean {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    // Some browsers throw on merely touching `indexedDB` in a blocked context.
    return false;
  }
}

/** Promisify an IDBRequest. */
export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

/** Promisify a transaction's completion. */
export function transactionToPromise(
  transaction: IDBTransaction,
): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
  });
}

/** Every store the running release requires to be present. */
const REQUIRED_STORES = Object.values(OFFLINE_STORES);

/** True when the opened database actually has the stores this release needs. */
function hasRequiredStores(database: IDBDatabase): boolean {
  return REQUIRED_STORES.every((store) =>
    database.objectStoreNames.contains(store),
  );
}

/** Delete the DalyHub offline database. Never touches anything else. */
export function deleteOfflineDatabase(
  timeoutMs = OFFLINE_DATABASE_TIMEOUT_MS,
): Promise<void> {
  if (!isOfflineStorageAvailable()) return Promise.resolve();
  const deletion = new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(OFFLINE_DATABASE_NAME);
    // Resolve on every terminal outcome: a failed delete must not wedge the app,
    // and the caller re-checks by attempting to open.
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
  // A delete blocked by a connection this page cannot see fires NO event at all
  // in some engines. The caller re-checks by opening, so giving up is safe and
  // waiting forever is not.
  return withDeadline(deletion, timeoutMs, () => undefined);
}

/**
 * Open the offline database, running any pending migration steps.
 *
 * `attemptRecovery` is applied once: if the schema is broken (an interrupted
 * upgrade), the database is deleted and re-created from scratch. It is NOT
 * applied to `newerSchema`, which must never destroy a newer release's data.
 */
export async function openOfflineDatabase(options?: {
  readonly attemptRecovery?: boolean;
  /** Overridable so a test can assert the deadline without waiting for it. */
  readonly timeoutMs?: number;
}): Promise<OfflineDatabaseResult> {
  if (!isOfflineStorageAvailable()) {
    return {
      ok: false,
      failure: {
        kind: "unavailable",
        message:
          "This browser is not storing offline data (private mode or storage disabled).",
      },
    };
  }

  const attemptRecovery = options?.attemptRecovery ?? true;
  const timeoutMs = options?.timeoutMs ?? OFFLINE_DATABASE_TIMEOUT_MS;
  let opened: OfflineDatabaseResult;
  let abandoned = false;
  try {
    // The deadline is what stops an `open` that never fires an event from
    // leaving the offline surface saying "checking…" forever.
    opened = await withDeadline(
      openOnce().then((result) => {
        // A connection that arrives AFTER the deadline is closed on the spot:
        // an abandoned open connection blocks the next version upgrade forever.
        if (abandoned && result.ok) result.database.close();
        return result;
      }),
      timeoutMs,
      () => {
        abandoned = true;
        return { ok: false, failure: storageTimeoutFailure() };
      },
    );
  } catch (cause) {
    opened = {
      ok: false,
      failure: {
        kind: "migrationFailed",
        message: cause instanceof Error ? cause.message : "Unknown failure.",
      },
    };
  }

  if (opened.ok && !hasRequiredStores(opened.database)) {
    // An interrupted upgrade: the version advanced but the stores did not.
    opened.database.close();
    if (!attemptRecovery) {
      return {
        ok: false,
        failure: {
          kind: "migrationFailed",
          message: "The offline database is incomplete.",
        },
      };
    }
    await deleteOfflineDatabase();
    return openOfflineDatabase({ attemptRecovery: false, timeoutMs });
  }

  if (
    !opened.ok &&
    opened.failure.kind === "migrationFailed" &&
    attemptRecovery
  ) {
    await deleteOfflineDatabase();
    return openOfflineDatabase({ attemptRecovery: false, timeoutMs });
  }
  // A TIMEOUT is deliberately not recovered from. Recovery deletes the database,
  // and "it did not answer in time" is not evidence that it is broken — deleting
  // an owner's un-synced captures on that evidence would be indefensible.

  return opened;
}

/** One open attempt, with the migration ladder applied in `onupgradeneeded`. */
function openOnce(): Promise<OfflineDatabaseResult> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(OFFLINE_DATABASE_NAME, OFFLINE_DATABASE_VERSION);
    } catch (cause) {
      reject(cause);
      return;
    }

    request.onupgradeneeded = (event) => {
      const database = request.result;
      const transaction = request.transaction;
      if (!transaction) {
        reject(new Error("No upgrade transaction was provided."));
        return;
      }
      try {
        // The ladder, in order. `event.oldVersion` is 0 for a first install, so
        // a fresh device runs every step exactly as an upgrading one does —
        // there is no separate "create" path that could drift from the steps.
        for (const step of stepsFor(
          event.oldVersion,
          OFFLINE_DATABASE_VERSION,
        )) {
          step.apply(database, transaction);
        }
      } catch (cause) {
        // Abort so the version does NOT advance past a failed step: a half-
        // migrated database with the new version number is unrecoverable
        // without deleting it.
        transaction.abort();
        reject(cause);
      }
    };

    request.onblocked = () => {
      resolve({
        ok: false,
        failure: {
          kind: "blocked",
          message:
            "Another DalyHub tab is open. Close it and reload to finish updating offline storage.",
        },
      });
    };

    request.onsuccess = () => {
      const database = request.result;
      // If a NEWER release later opens the database, it will need this one to
      // let go; otherwise that upgrade blocks forever behind this connection.
      database.onversionchange = () => database.close();
      resolve({ ok: true, database });
    };

    request.onerror = () => {
      const error = request.error;
      if (error?.name === "VersionError") {
        resolve({
          ok: false,
          failure: {
            kind: "newerSchema",
            message:
              "This browser holds DalyHub offline data from a newer version. Nothing was changed. Reload to get the current version of DalyHub.",
          },
        });
        return;
      }
      reject(error ?? new Error("The offline database could not be opened."));
    };
  });
}
