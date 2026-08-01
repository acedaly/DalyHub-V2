/**
 * X-04 — a minimal ZIP reader for the export end-to-end tests.
 *
 * The suite must inspect what the owner actually downloads, which means reading
 * the archive the Worker produced rather than trusting the code that wrote it.
 * This reader is deliberately INDEPENDENT of `app/platform/export/zip.ts`: it
 * walks the central directory per the published format and inflates with Node's
 * own `zlib`, so a bug in our writer cannot hide behind a matching bug in our
 * reader.
 *
 * Test-only. It runs in Playwright's Node context, never in the Worker.
 */

import { inflateRawSync } from "node:zlib";

export interface ZipFile {
  readonly path: string;
  readonly bytes: Buffer;
  readonly text: string;
}

/** Read every entry of a ZIP archive, keyed by its path. */
export function readZip(archive: Buffer): Map<string, ZipFile> {
  // Locate the end-of-central-directory record (no archive comment is written,
  // so it is the final 22 bytes; scan back anyway for robustness).
  let eocd = -1;
  for (let offset = archive.length - 22; offset >= 0; offset -= 1) {
    if (archive.readUInt32LE(offset) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd === -1)
    throw new Error("Not a ZIP archive: no end-of-central-directory");

  const count = archive.readUInt16LE(eocd + 10);
  let cursor = archive.readUInt32LE(eocd + 16);
  const files = new Map<string, ZipFile>();

  for (let index = 0; index < count; index += 1) {
    if (archive.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error(`Corrupt central directory at entry ${index}`);
    }
    const method = archive.readUInt16LE(cursor + 10);
    const compressedSize = archive.readUInt32LE(cursor + 20);
    const uncompressedSize = archive.readUInt32LE(cursor + 24);
    const nameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const commentLength = archive.readUInt16LE(cursor + 32);
    const localOffset = archive.readUInt32LE(cursor + 42);
    const path = archive
      .subarray(cursor + 46, cursor + 46 + nameLength)
      .toString("utf8");

    // Re-read the local header to find where the payload actually starts.
    if (archive.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error(`Corrupt local header for ${path}`);
    }
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const payload = archive.subarray(dataStart, dataStart + compressedSize);

    const bytes =
      method === 0
        ? Buffer.from(payload)
        : method === 8
          ? inflateRawSync(payload)
          : (() => {
              throw new Error(`Unsupported compression method ${method}`);
            })();

    if (bytes.length !== uncompressedSize) {
      throw new Error(
        `Size mismatch for ${path}: ${bytes.length} != ${uncompressedSize}`,
      );
    }
    files.set(path, { path, bytes, text: bytes.toString("utf8") });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

/** Read a file from the archive, failing loudly with the real file list. */
export function requireZipFile(
  files: Map<string, ZipFile>,
  path: string,
): ZipFile {
  const file = files.get(path);
  if (!file) {
    throw new Error(
      `No archive entry ${path}. Archive holds:\n  ${[...files.keys()].join("\n  ")}`,
    );
  }
  return file;
}

/** Every archive entry whose path starts with a prefix. */
export function zipFilesUnder(
  files: Map<string, ZipFile>,
  prefix: string,
): ZipFile[] {
  return [...files.values()].filter((file) => file.path.startsWith(prefix));
}
