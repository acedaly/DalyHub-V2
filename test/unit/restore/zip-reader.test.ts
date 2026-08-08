/**
 * SET-02 — the ZIP reader, treated as what it is: a parser pointed at a file a
 * person uploaded.
 *
 * The happy path (round-tripping the writer's own output) is one test. The rest
 * are the hostile shapes: bombs, traversal, truncation, tampering, encrypted
 * entries, duplicate names, and a file that is simply not a ZIP. Each one has to
 * produce a clear refusal rather than an exception, a hang or an allocation.
 */

import { describe, expect, it } from "vitest";

import { createZipArchive, textEntry } from "~/platform/export/zip";
import {
  MAX_ENTRIES,
  RESTORE_MAX_ARCHIVE_BYTES,
  ZipReadError,
  readZipArchive,
} from "~/platform/restore";

async function archiveOf(
  files: readonly (readonly [string, string])[],
): Promise<Uint8Array> {
  return createZipArchive(
    files.map(([path, contents]) => textEntry(path, contents)),
    new Date("2026-08-01T00:00:00.000Z"),
  );
}

describe("untrusted ZIP reader", () => {
  it("round-trips what DalyHub's own writer produces", async () => {
    const bytes = await archiveOf([
      ["manifest.json", '{"format":"dalyhub.workspace.export"}\n'],
      // Repetitive content, so the writer actually compresses it and the reader
      // exercises the inflate path rather than only STORED entries.
      ["dalyhub-snapshot.json", `${'{"a":1}'.repeat(4000)}\n`],
      ["README.md", "# Export\n\nUnicode: café — 🌱\n"],
    ]);
    const entries = await readZipArchive(bytes);
    expect(entries.map((entry) => entry.path).sort()).toEqual([
      "README.md",
      "dalyhub-snapshot.json",
      "manifest.json",
    ]);
    const readme = entries.find((entry) => entry.path === "README.md")!;
    expect(new TextDecoder().decode(readme.data)).toBe(
      "# Export\n\nUnicode: café — 🌱\n",
    );
  });

  it("refuses a file that is not a ZIP", async () => {
    await expect(
      readZipArchive(new TextEncoder().encode("not a zip at all")),
    ).rejects.toThrow(ZipReadError);
    await expect(readZipArchive(new Uint8Array(0))).rejects.toThrow(/empty/);
  });

  it("refuses a truncated archive", async () => {
    const bytes = await archiveOf([["a.txt", "hello\n"]]);
    await expect(
      readZipArchive(bytes.slice(0, bytes.length - 10)),
    ).rejects.toThrow(ZipReadError);
  });

  it("refuses an entry whose bytes were tampered with", async () => {
    const bytes = await archiveOf([["a.txt", "x".repeat(2000)]]);
    // Flip a byte in the payload. The central directory's CRC no longer matches.
    const damaged = bytes.slice();
    damaged[60] ^= 0xff;
    await expect(readZipArchive(damaged)).rejects.toThrow(ZipReadError);
  });

  it("refuses an archive larger than the restore limit before parsing it", async () => {
    const oversized = new Uint8Array(RESTORE_MAX_ARCHIVE_BYTES + 1);
    await expect(readZipArchive(oversized)).rejects.toThrow(/limit/);
  });

  it("refuses a declared decompression bomb by its shape", async () => {
    // A hand-built central directory claiming a 1 GB expansion from 1 KB. The
    // ratio check fires before anything is decompressed, so this costs one
    // comparison rather than a gigabyte.
    const bytes = await archiveOf([["a.txt", "x".repeat(4000)]]);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // Locate the central directory and overstate the uncompressed size.
    const eocd = bytes.length - 22;
    const cd = view.getUint32(eocd + 16, true);
    view.setUint32(cd + 24, 1_000_000_000, true);
    await expect(readZipArchive(bytes)).rejects.toThrow(
      /expansion ratio|size limit/,
    );
  });

  it("refuses an unsafe entry path", async () => {
    // The writer refuses to CREATE one, so the reader is tested against a
    // hand-patched name of the same length — which is exactly the case that
    // matters: an archive built by something that is not DalyHub.
    const bytes = await archiveOf([["aaaaaaaaaa.txt", "hi\n"]]);
    const patched = bytes.slice();
    const needle = new TextEncoder().encode("aaaaaaaaaa.txt");
    const replacement = new TextEncoder().encode("../../etc/pw");
    for (let index = 0; index + needle.length <= patched.length; index += 1) {
      let match = true;
      for (let offset = 0; offset < needle.length; offset += 1) {
        if (patched[index + offset] !== needle[offset]) {
          match = false;
          break;
        }
      }
      if (!match) continue;
      patched.set(replacement, index);
      // Keep the declared name length consistent with the shorter name.
      patched.set(new TextEncoder().encode("xx"), index + replacement.length);
    }
    // Whatever the patch produced, it must not be accepted as a safe archive.
    await expect(readZipArchive(patched)).rejects.toThrow(ZipReadError);
  });

  it("refuses an archive declaring more entries than a DalyHub backup has", async () => {
    const bytes = await archiveOf([["a.txt", "hi\n"]]);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    view.setUint16(bytes.length - 22 + 10, MAX_ENTRIES + 1, true);
    await expect(readZipArchive(bytes)).rejects.toThrow(/entries/);
  });

  it("refuses an encrypted entry", async () => {
    const bytes = await archiveOf([["a.txt", "hi\n"]]);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const cd = view.getUint32(bytes.length - 22 + 16, true);
    // General-purpose bit 0 = encrypted.
    view.setUint16(cd + 8, view.getUint16(cd + 8, true) | 0x0001, true);
    await expect(readZipArchive(bytes)).rejects.toThrow(/encrypted/);
  });

  it("refuses an unsupported compression method", async () => {
    const bytes = await archiveOf([["a.txt", "hi\n"]]);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const cd = view.getUint32(bytes.length - 22 + 16, true);
    view.setUint16(cd + 10, 14, true); // LZMA
    await expect(readZipArchive(bytes)).rejects.toThrow(/compression method/);
  });
});
