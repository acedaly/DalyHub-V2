/**
 * V2.11 FILE-00 — the Cloudflare R2 adapter for the attachment object store.
 *
 * The ONLY place `R2Bucket` exists in the application. Everything above it — the
 * validator, the upload orchestration, the export builder, the restore — speaks
 * `AttachmentObjectStore` and could be driven against a bucket, a fake or a
 * future provider without noticing.
 *
 * ## Three guarantees this adapter buys from R2, and all three are used
 *
 * 1. **R2 verifies the digest.** `put(key, bytes, { sha256 })` fails the write if
 *    the bytes do not hash to the value given. DalyHub computes that digest from
 *    the same buffer it stores, so a corruption between the isolate and the
 *    bucket is caught by the bucket rather than discovered by a restore months
 *    later. It is not merely metadata: it is a write-time check.
 * 2. **R2 gives the digest back, and the body as a stream.** `checksums.sha256`
 *    on a read is the value from that write, and `body` is a `ReadableStream`.
 *    So the download path verifies in **O(1)** against the D1 row and never
 *    holds the file: the comparison is 64 characters, and the bytes go bucket →
 *    socket. Both are runtime facts checked against the pinned types
 *    (`worker-configuration.d.ts`, workerd@1.20260714.1), not assumptions.
 * 3. **`delete` is idempotent.** Deleting a key that is not there succeeds, which
 *    is what makes the purge sweep safe to run twice and safe to interrupt.
 *
 * ## What is deliberately NOT here
 *
 * No multipart upload, no conditional write, no storage class, no lifecycle. The
 * per-file bound is 10 MiB — far below the ~100 MiB at which multipart starts to
 * matter — so a single `put` is the whole write path, and a code path nothing
 * exercises is a code path nothing tests.
 *
 * ## Errors say the shape, never the provider's words
 *
 * Every failure becomes an `AttachmentStorageError` with a closed-vocabulary
 * reason. R2's own message is discarded at this boundary, deliberately: it is
 * logged and summarised, and a provider string in an owner-facing sentence is
 * exactly the leak `ZipReadError` already refuses for archives.
 */

import {
  AttachmentStorageError,
  type AttachmentObjectStore,
  type PutObjectOptions,
  type StoredObject,
  type StoredObjectInfo,
  type StoredObjectStream,
} from "~/kernel/attachments";

/** Lowercase hex from an `ArrayBuffer` of digest bytes. */
function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Bytes for the `sha256` put option, from lowercase hex. */
function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function describe(object: {
  key: string;
  size: number;
  checksums: { sha256?: ArrayBuffer };
}): StoredObjectInfo {
  return {
    key: object.key,
    size: object.size,
    checksumSha256: object.checksums.sha256
      ? toHex(object.checksums.sha256)
      : null,
  };
}

/**
 * Wrap an R2 bucket as the attachment object store.
 *
 * The bucket is passed in rather than read from `env` here, so the composition
 * boundary stays the one place a binding is resolved (ADR-010) and a test can
 * hand this the Workers pool's own local bucket.
 */
export function createR2ObjectStore(bucket: R2Bucket): AttachmentObjectStore {
  return {
    async put(
      key: string,
      bytes: Uint8Array,
      options: PutObjectOptions,
    ): Promise<StoredObjectInfo> {
      try {
        const written = await bucket.put(key, bytes as unknown as ArrayBuffer, {
          // R2 verifies this and refuses the write on a mismatch.
          sha256: fromHex(options.checksumSha256) as unknown as ArrayBuffer,
          httpMetadata: {
            /*
             * Recorded so an object inspected outside DalyHub is legible. It is
             * NEVER read back to decide how to serve a byte: the download route
             * takes the media type from the D1 row, which is the value that went
             * through the allow-list. Two sources for one decision is how a
             * bucket edit becomes a content-type confusion bug.
             */
            contentType: options.mediaType,
          },
        });
        return describe(written);
      } catch {
        throw new AttachmentStorageError("put_failed", key);
      }
    },

    async get(key: string): Promise<StoredObject | null> {
      let object: R2ObjectBody | null;
      try {
        object = await bucket.get(key);
      } catch {
        throw new AttachmentStorageError("put_failed", key);
      }
      if (object === null) return null;
      try {
        const buffer = await object.arrayBuffer();
        return {
          ...describe(object),
          bytes: new Uint8Array(buffer),
        };
      } catch {
        throw new AttachmentStorageError("object_missing", key);
      }
    },

    async open(key: string): Promise<StoredObjectStream | null> {
      /*
       * The download path, and the reason it is not `get`.
       *
       * `R2ObjectBody.body` is a `ReadableStream` in the pinned runtime
       * (`worker-configuration.d.ts`, generated from workerd@1.20260714.1), and
       * `R2Object.checksums.sha256` carries back the digest DalyHub supplied on
       * the write. Together they mean a download never has to hold the file:
       * the integrity comparison is a 64-character string against the D1 row,
       * and the bytes go from the bucket to the socket without the isolate
       * touching them. `get` would allocate the whole object only to hand it to
       * a `Response` that copies it out again.
       */
      let object: R2ObjectBody | null;
      try {
        object = await bucket.get(key);
      } catch {
        throw new AttachmentStorageError("object_missing", key);
      }
      if (object === null) return null;
      return { ...describe(object), body: object.body };
    },

    async delete(key: string): Promise<void> {
      try {
        await bucket.delete(key);
      } catch {
        throw new AttachmentStorageError("delete_failed", key);
      }
    },

    async list(
      prefix: string,
      options: { readonly limit?: number } = {},
    ): Promise<readonly StoredObjectInfo[]> {
      try {
        const listed = await bucket.list({
          prefix,
          limit: Math.min(Math.max(1, options.limit ?? 1000), 1000),
        });
        return listed.objects.map(describe);
      } catch {
        throw new AttachmentStorageError("object_missing", null);
      }
    },
  };
}

/**
 * Resolve the object store for an environment, or `null` when none is bound.
 *
 * `null` is a first-class answer rather than a throw, for one measured reason:
 * the binding is declared in the top-level (local) wrangler config AND in the
 * named production environment, but a Worker built from an older config, a test
 * harness that has not declared it, or a preview deployment may legitimately not
 * have it. Every attachment route then answers "file storage isn't configured
 * for this deployment" — an honest 503 — rather than a stack trace, and every
 * NON-attachment route is entirely unaffected. That is the same shape the
 * optional `BACKUP_SERVICE` binding already uses.
 */
export function resolveAttachmentObjectStore(env: {
  readonly ATTACHMENTS?: R2Bucket;
}): AttachmentObjectStore | null {
  const bucket = env.ATTACHMENTS;
  if (!bucket || typeof bucket.put !== "function") return null;
  return createR2ObjectStore(bucket);
}
