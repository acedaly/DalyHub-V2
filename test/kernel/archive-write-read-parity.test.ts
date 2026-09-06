/**
 * V2.12 FIN-00 — DEBT-247's closing condition, as a test.
 *
 * The entry's own words:
 *
 * > A kernel test builds an archive above `RESTORE_MAX_ARCHIVE_BYTES` through
 * > the real export path and asserts it is either refused at WRITE time with an
 * > actionable sentence, or read back successfully — failing today, where it is
 * > written and then refused at read time.
 *
 * This is that test. It uses the REAL `createZipArchive` and the REAL
 * `readZipArchive`, and it exercises the case the entry measured: entries of
 * INCOMPRESSIBLE bytes, which is what an attached PDF or photograph is, and
 * which is why the writer's uncompressed-content ceiling never caught this.
 *
 * ## Why the falsification matters more than the assertion
 *
 * The bug was two constants that were allowed to disagree, so the fix is not a
 * matching pair — it is ONE constant with two consumers, and the last case here
 * asserts exactly that identity. A future change that reintroduces a second
 * number fails this file rather than the owner's recovery.
 */

import { describe, expect, it } from "vitest";

import {
  createZipArchive,
  ZIP_MAX_ARCHIVE_BYTES,
  ZipTooLargeError,
  type ZipEntry,
} from "~/platform/export/zip";
import {
  RESTORE_MAX_ARCHIVE_BYTES,
  readZipArchive,
} from "~/platform/restore/zip-reader";

const MODIFIED = new Date("2026-09-06T00:00:00.000Z");

/**
 * Bytes that DEFLATE cannot shrink, which is the whole point: a PDF, a JPEG and
 * a photograph all behave like this, and compressible JSON never reaches the
 * ceiling. Deterministic, so the test is not at the mercy of a random draw.
 */
function incompressible(bytes: number, seed: number): Uint8Array {
  const out = new Uint8Array(bytes);
  // A xorshift PRNG: deterministic, uniformly distributed, and with none of the
  // repetition deflate feeds on.
  let state = seed | 1;
  for (let index = 0; index < bytes; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    out[index] = state & 0xff;
  }
  return out;
}

describe("DalyHub cannot write an archive it will refuse to read (DEBT-247)", () => {
  it("refuses at WRITE time, with a reason an owner can act on", async () => {
    /*
     * Four 9 MiB files — the exact measurement in DEBT-247's own body, and an
     * unremarkable amount of paperwork. The uncompressed content is 36 MiB,
     * comfortably inside the writer's 64 MiB content ceiling, so this is not
     * caught by the bound that already existed.
     */
    const entries: ZipEntry[] = [0, 1, 2, 3].map((index) => ({
      path: `attachments/file-${index}.bin`,
      data: incompressible(9 * 1024 * 1024, 0x9e3779b9 + index),
    }));

    /*
     * ONE call, and the error is inspected rather than re-thrown. Assembling
     * 36 MiB twice in one isolate is enough allocation to matter, which the
     * falsification of this test found the hard way — a second build exhausted
     * the heap before the assertion could speak.
     */
    const outcome = await createZipArchive(entries, MODIFIED).then(
      (bytes) => ({ ok: true as const, bytes }),
      (cause: unknown) => ({ ok: false as const, cause }),
    );
    expect(outcome.ok).toBe(false);
    const error = (outcome as { cause: unknown }).cause;
    expect(error).toBeInstanceOf(ZipTooLargeError);
    expect((error as ZipTooLargeError).reason).toBe("archive");
    // Actionable: it says what was produced and what the limit is, and the
    // caller turns that into the sentence naming the files.
    expect((error as ZipTooLargeError).message).toMatch(
      /larger than DalyHub can read back/,
    );
    expect((error as ZipTooLargeError).message).toContain(
      String(ZIP_MAX_ARCHIVE_BYTES),
    );
  });

  it("writes and reads back an archive just UNDER the shared limit", async () => {
    // The other half of the closing condition: the bound refuses what it must
    // and passes what it must, so the fix is not "refuse everything".
    const entries: ZipEntry[] = [
      {
        path: "dalyhub-snapshot.json",
        data: incompressible(20 * 1024 * 1024, 0x1234567),
      },
    ];
    const archive = await createZipArchive(entries, MODIFIED);
    expect(archive.length).toBeLessThanOrEqual(ZIP_MAX_ARCHIVE_BYTES);

    const read = await readZipArchive(archive);
    expect(read.map((entry) => entry.path)).toEqual(["dalyhub-snapshot.json"]);
    expect(read[0]!.data.length).toBe(20 * 1024 * 1024);
  });

  it("has ONE constant, not two that can drift", () => {
    /*
     * The defect was never a wrong number. It was two numbers that were allowed
     * to disagree, and this is the assertion that keeps them from being two
     * again — `RESTORE_MAX_ARCHIVE_BYTES` is DERIVED from the writer's constant
     * rather than restated beside it.
     */
    expect(RESTORE_MAX_ARCHIVE_BYTES).toBe(ZIP_MAX_ARCHIVE_BYTES);
  });
});
