/**
 * V2.11 FILE-00 — the object-store CONTRACT, run against both implementations.
 *
 * `attachment-object-store.ts` says the fake and the real bucket "cannot drift"
 * because this contract is run against both. That sentence was a promise with
 * nothing behind it until this file existed, which is precisely the failure mode
 * a fake has: it agrees with whatever the code does, and it goes on agreeing
 * after the real store has stopped.
 *
 * So the assertions here are the ones the application actually depends on, and
 * every one of them is a behaviour some caller would be broken by:
 *
 *   - a `put` with a WRONG digest is refused (the upload path relies on the
 *     store, not on DalyHub, being the last word on the bytes);
 *   - a `put` records the digest and gives it back on a read — which is what
 *     makes an O(1) download verification possible at all;
 *   - `get` returns the bytes exactly, byte for byte;
 *   - `open` returns a stream of the same bytes, plus the size and the digest,
 *     WITHOUT the caller having read anything;
 *   - a missing key is `null` from both readers rather than a throw;
 *   - `delete` is idempotent, twice over;
 *   - `list` is prefix-scoped, ordered by key and bounded.
 *
 * Exported as a function taking a factory rather than as a spec file, so the
 * unit suite can run it against `createInMemoryObjectStore` in happy-dom and the
 * kernel suite can run the SAME assertions against the pool's real local R2
 * bucket. A behaviour that appears in one and not the other is a drift this
 * catches on the run that introduces it.
 */

import { describe, expect, it } from "vitest";

import { hexDigest, type AttachmentObjectStore } from "~/kernel/attachments";

/** Read a stream to the end. The download path's `Response` does this for real. */
export async function collectStream(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

const BYTES = new Uint8Array([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf,
  0xd3, 0x0a,
]);

/**
 * Run the contract.
 *
 * `makeStore` must return a store whose keyspace is empty, or at least free of
 * the `prefix` this contract writes under — the real bucket is shared with the
 * suite around it, so every key is namespaced by the caller.
 */
export function objectStoreContract(
  label: string,
  makeStore: () => AttachmentObjectStore | Promise<AttachmentObjectStore>,
  prefix: string,
): void {
  describe(`object store contract: ${label}`, () => {
    const key = (name: string) => `${prefix}${name}`;

    it("refuses a put whose declared digest is wrong", async () => {
      const store = await makeStore();
      // A digest of the right SHAPE for different bytes — the mistake a real
      // corruption looks like, not a malformed string the parser would reject.
      const wrong = await hexDigest(new Uint8Array([...BYTES, 0x00]));
      await expect(
        store.put(key("refused"), BYTES, {
          checksumSha256: wrong,
          mediaType: "application/pdf",
        }),
      ).rejects.toThrow();
      // And nothing was written under that key.
      expect(await store.get(key("refused"))).toBeNull();
    });

    it("records the digest on write and gives it back on read", async () => {
      const store = await makeStore();
      const digest = await hexDigest(BYTES);
      const written = await store.put(key("digest"), BYTES, {
        checksumSha256: digest,
        mediaType: "application/pdf",
      });
      expect(written.checksumSha256).toBe(digest);
      expect(written.size).toBe(BYTES.length);

      /*
       * THE property the download path is built on: the store keeps the digest,
       * so verifying a download is a string comparison rather than a re-hash.
       * If a store ever stopped returning it, `openAttachmentStream` would
       * refuse every download — loudly, and here first.
       */
      const opened = await store.open(key("digest"));
      expect(opened?.checksumSha256).toBe(digest);
      expect(opened?.size).toBe(BYTES.length);
      // Drained rather than cancelled: cancelling a live R2 body is legitimate
      // (the mismatch path does it) but workerd logs the aborted pump, and a
      // contract test should not be the thing that puts noise in a green run.
      await collectStream(opened!.body);
    });

    it("returns the bytes exactly, from get and from open", async () => {
      const store = await makeStore();
      const digest = await hexDigest(BYTES);
      await store.put(key("bytes"), BYTES, {
        checksumSha256: digest,
        mediaType: "application/pdf",
      });

      const got = await store.get(key("bytes"));
      expect([...(got?.bytes ?? [])]).toEqual([...BYTES]);

      const opened = await store.open(key("bytes"));
      expect(opened).not.toBeNull();
      expect([...(await collectStream(opened!.body))]).toEqual([...BYTES]);
    });

    it("answers null for a key that is not there, from both readers", async () => {
      const store = await makeStore();
      expect(await store.get(key("absent"))).toBeNull();
      expect(await store.open(key("absent"))).toBeNull();
    });

    it("deletes idempotently", async () => {
      const store = await makeStore();
      await store.put(key("gone"), BYTES, {
        checksumSha256: await hexDigest(BYTES),
        mediaType: "application/pdf",
      });
      await store.delete(key("gone"));
      // Twice, and a delete of a key that never existed. Both must succeed:
      // the purge sweep retries, and a retry that threw would never clear.
      await store.delete(key("gone"));
      await store.delete(key("never-existed"));
      expect(await store.get(key("gone"))).toBeNull();
    });

    it("lists by prefix, in key order, bounded", async () => {
      const store = await makeStore();
      const digest = await hexDigest(BYTES);
      for (const name of ["list-c", "list-a", "list-b"]) {
        await store.put(key(name), BYTES, {
          checksumSha256: digest,
          mediaType: "application/pdf",
        });
      }
      await store.put(`${prefix}other/x`, BYTES, {
        checksumSha256: digest,
        mediaType: "application/pdf",
      });

      const listed = await store.list(key("list-"));
      expect(listed.map((entry) => entry.key)).toEqual([
        key("list-a"),
        key("list-b"),
        key("list-c"),
      ]);
      // The workspace purge and the orphan audit both depend on the bound.
      const bounded = await store.list(key("list-"), { limit: 2 });
      expect(bounded).toHaveLength(2);
      expect(bounded[0]!.key).toBe(key("list-a"));
    });
  });
}
