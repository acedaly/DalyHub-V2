/**
 * X-04 — the dependency-free ZIP writer.
 *
 * A ZIP that a real tool cannot open is worse than no download, so these tests
 * check the bytes against the published format rather than only round-tripping
 * through our own reader: signatures, offsets, the central directory, the CRC
 * and the UTF-8 flag are all asserted directly.
 */

import { describe, expect, it } from "vitest";

import {
  ZipPathError,
  ZipTooLargeError,
  assertSafeZipPath,
  crc32,
  createZipArchive,
  textEntry,
} from "~/platform/export";

const MODIFIED = new Date("2026-08-01T09:30:00.000Z");

function u32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset).getUint32(offset, true);
}
function u16(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset).getUint16(offset, true);
}

describe("crc32", () => {
  it("matches the standard CRC-32 test vectors", () => {
    const encoder = new TextEncoder();
    expect(crc32(encoder.encode(""))).toBe(0x00000000);
    expect(crc32(encoder.encode("a"))).toBe(0xe8b7be43);
    expect(crc32(encoder.encode("123456789"))).toBe(0xcbf43926);
    expect(
      crc32(encoder.encode("The quick brown fox jumps over the lazy dog")),
    ).toBe(0x414fa339);
  });
});

describe("assertSafeZipPath", () => {
  it("accepts an ordinary nested path", () => {
    expect(() =>
      assertSafeZipPath("DalyHub Export/Notes/A note.md"),
    ).not.toThrow();
  });

  it("rejects every traversal and absolute form", () => {
    for (const path of [
      "",
      "/etc/passwd",
      "C:/Windows/system32",
      "..",
      "../secret.md",
      "Notes/../../secret.md",
      "Notes/./A.md",
      "Notes\\A.md",
      "Notes//A.md",
      "a\u0000b.md",
    ]) {
      expect(() => assertSafeZipPath(path), path).toThrow(ZipPathError);
    }
  });
});

describe("createZipArchive", () => {
  it("writes a readable archive with the expected structure", async () => {
    const entries = [
      textEntry("README.md", "# Hello\n"),
      textEntry("Notes/A note.md", "Body\n"),
    ];
    const archive = await createZipArchive(entries, MODIFIED);

    // Local file header signature at offset 0.
    expect(u32(archive, 0)).toBe(0x04034b50);

    // End-of-central-directory record at the tail.
    const eocdOffset = archive.length - 22;
    expect(u32(archive, eocdOffset)).toBe(0x06054b50);
    expect(u16(archive, eocdOffset + 8)).toBe(2); // entries on this disk
    expect(u16(archive, eocdOffset + 10)).toBe(2); // entries total

    const centralSize = u32(archive, eocdOffset + 12);
    const centralOffset = u32(archive, eocdOffset + 16);
    expect(centralOffset + centralSize).toBe(eocdOffset);
    expect(u32(archive, centralOffset)).toBe(0x02014b50);
  });

  it("flags filenames as UTF-8 and records the uncompressed size and CRC", async () => {
    const contents = "Café — 日本語 🌱\n";
    const entry = textEntry("Notes/Café.md", contents);
    const archive = await createZipArchive([entry], MODIFIED);

    const flags = u16(archive, 6);
    expect(flags & 0x0800).toBe(0x0800);
    expect(u32(archive, 14)).toBe(crc32(entry.data));
    // Uncompressed size is the UTF-8 byte length, not the code-unit length.
    expect(u32(archive, 22)).toBe(entry.data.length);
    expect(u16(archive, 26)).toBe(new TextEncoder().encode(entry.path).length);
  });

  it("stores a tiny entry rather than expanding it", async () => {
    const entry = textEntry("a.md", "x");
    const archive = await createZipArchive([entry], MODIFIED);
    const method = u16(archive, 8);
    const compressedSize = u32(archive, 18);
    expect(method).toBe(0);
    expect(compressedSize).toBe(1);
  });

  it("compresses a large, repetitive entry when the runtime can", async () => {
    const entry = textEntry(
      "big.md",
      "the same line over and over\n".repeat(500),
    );
    const archive = await createZipArchive([entry], MODIFIED);
    const method = u16(archive, 8);
    const compressedSize = u32(archive, 18);
    const uncompressedSize = u32(archive, 22);
    expect(uncompressedSize).toBe(entry.data.length);
    if (method === 8) {
      expect(compressedSize).toBeLessThan(uncompressedSize);
    } else {
      // A runtime with no `deflate-raw` must still produce a valid STORED entry.
      expect(method).toBe(0);
      expect(compressedSize).toBe(uncompressedSize);
    }
  });

  it("is deterministic for the same entries and timestamp", async () => {
    const entries = [textEntry("a.md", "one"), textEntry("b.md", "two")];
    const first = await createZipArchive(entries, MODIFIED);
    const second = await createZipArchive(entries, MODIFIED);
    expect([...first]).toEqual([...second]);
  });

  it("refuses an unsafe entry path", async () => {
    await expect(
      createZipArchive([textEntry("../escape.md", "x")], MODIFIED),
    ).rejects.toThrow(ZipPathError);
  });

  it("refuses two entries that collide case-insensitively", async () => {
    await expect(
      createZipArchive(
        [textEntry("Notes/A.md", "one"), textEntry("Notes/a.md", "two")],
        MODIFIED,
      ),
    ).rejects.toThrow(ZipPathError);
  });

  it("refuses an archive that would exceed the assembly ceiling", async () => {
    const huge = {
      path: "huge.bin",
      data: new Uint8Array(64 * 1024 * 1024 + 1),
    };
    await expect(createZipArchive([huge], MODIFIED)).rejects.toThrow(
      ZipTooLargeError,
    );
  });

  it("writes an empty archive when there is nothing to write", async () => {
    const archive = await createZipArchive([], MODIFIED);
    expect(archive.length).toBe(22);
    expect(u32(archive, 0)).toBe(0x06054b50);
  });
});
