/**
 * V2.11 FILE-00 — the object-store PORT.
 *
 * Four operations, no vendor. Nothing in this file imports R2, Cloudflare or any
 * runtime type, so the domain can be reasoned about, faked and tested without a
 * bucket — and the Cloudflare adapter (`app/platform/attachments/r2-object-store.ts`)
 * is the only place `R2Bucket` exists.
 *
 * ## The seam is narrow on purpose
 *
 * It is deliberately NOT "an R2 interface". There is no conditional put, no
 * multipart, no listing options beyond a prefix and a bound, no storage class and
 * no metadata beyond what {@link PutObjectOptions} names. Every one of those is a
 * feature DalyHub does not use, and a port that offered them would be a port that
 * a future change could quietly start depending on — at which point the fake and
 * the real bucket stop being interchangeable and the unit tests stop meaning
 * anything.
 *
 * ## What the fake is for, and what it is NOT for
 *
 * `createInMemoryObjectStore` exists so pure logic — validation, compensation
 * ordering, the archive builder — can be driven deterministically. It is not a
 * substitute for the real thing: the attachment integration suite runs against a
 * REAL local R2 binding in the Workers pool, for the reason
 * `vitest.workers.config.ts` already gives about the backup bucket — a stub
 * "would happily agree with whatever the code did", and this contract's whole
 * point is that R2 verifies a digest and returns bytes in order.
 *
 * `objectStoreContract` is run against BOTH, so they cannot drift.
 */

import { AttachmentStorageError } from "./attachment-errors";

/** What is known about a stored object without reading its bytes. */
export interface StoredObjectInfo {
  readonly key: string;
  readonly size: number;
  /** Lowercase hex SHA-256, when the store recorded one. */
  readonly checksumSha256: string | null;
}

/** An object's bytes, plus what is known about them. */
export interface StoredObject extends StoredObjectInfo {
  readonly bytes: Uint8Array;
}

/** Everything a write may declare. */
export interface PutObjectOptions {
  /**
   * The SHA-256 the caller computed, as lowercase hex.
   *
   * The store is expected to VERIFY it and fail the write when the bytes do not
   * match — R2 does — so a transport corruption is caught by the store rather
   * than discovered by a restore months later.
   */
  readonly checksumSha256: string;
  /** The media type to record with the object. Never used to decide anything. */
  readonly mediaType: string;
}

/**
 * The workspace-agnostic object store.
 *
 * Keys are FULL keys, built by `attachmentStorageKey`. The port does no scoping
 * of its own: scoping is a property of the key and of the repository that
 * produced it, and a port that also tried to scope would be a second authority
 * for the same rule.
 */
export interface AttachmentObjectStore {
  /**
   * Write bytes under `key`, replacing anything already there.
   *
   * Throws {@link AttachmentStorageError} with `put_failed` when the store
   * refuses — including when it rejects the declared digest.
   */
  put(
    key: string,
    bytes: Uint8Array,
    options: PutObjectOptions,
  ): Promise<StoredObjectInfo>;

  /** Read an object's bytes. `null` when there is no object under `key`. */
  get(key: string): Promise<StoredObject | null>;

  /**
   * Delete an object. Deleting a key that is not there SUCCEEDS.
   *
   * That is not laziness: the delete path runs after the metadata is already
   * gone, and a retry of a delete that partly succeeded must be able to finish.
   * An idempotent delete is what makes the purge sweep safe to run twice.
   */
  delete(key: string): Promise<void>;

  /** Every key under `prefix`, bounded. Used by the workspace audit and purge. */
  list(
    prefix: string,
    options?: { readonly limit?: number },
  ): Promise<readonly StoredObjectInfo[]>;
}

/**
 * A deterministic in-memory store for unit tests.
 *
 * It verifies the declared digest exactly as R2 does, because a fake that
 * accepted any digest would make every test that relies on verification a test
 * of nothing.
 */
export function createInMemoryObjectStore(options?: {
  /** Force the next N writes to fail, for compensation tests. */
  readonly failPut?: (key: string) => boolean;
  /** Force deletes of matching keys to fail, for ledger tests. */
  readonly failDelete?: (key: string) => boolean;
}): AttachmentObjectStore & {
  readonly keys: () => readonly string[];
  readonly size: () => number;
} {
  const objects = new Map<string, StoredObject>();

  return {
    async put(key, bytes, put) {
      if (options?.failPut?.(key)) {
        throw new AttachmentStorageError("put_failed", key);
      }
      const actual = await hexDigest(bytes);
      if (actual !== put.checksumSha256) {
        // Exactly what R2 does with a mismatched `sha256` option.
        throw new AttachmentStorageError("put_failed", key);
      }
      const stored: StoredObject = {
        key,
        size: bytes.length,
        checksumSha256: actual,
        bytes: bytes.slice(),
      };
      objects.set(key, stored);
      return { key, size: stored.size, checksumSha256: stored.checksumSha256 };
    },
    async get(key) {
      const stored = objects.get(key);
      if (!stored) return null;
      return { ...stored, bytes: stored.bytes.slice() };
    },
    async delete(key) {
      if (options?.failDelete?.(key)) {
        throw new AttachmentStorageError("delete_failed", key);
      }
      objects.delete(key);
    },
    async list(prefix, list) {
      const limit = list?.limit ?? 1000;
      return [...objects.values()]
        .filter((object) => object.key.startsWith(prefix))
        .sort((a, b) => (a.key < b.key ? -1 : 1))
        .slice(0, limit)
        .map(({ key, size, checksumSha256 }) => ({
          key,
          size,
          checksumSha256,
        }));
    },
    keys: () => [...objects.keys()].sort((a, b) => (a < b ? -1 : 1)),
    size: () => objects.size,
  };
}

/** Lowercase hex SHA-256, via the platform WebCrypto. */
export async function hexDigest(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes as unknown as ArrayBuffer,
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
