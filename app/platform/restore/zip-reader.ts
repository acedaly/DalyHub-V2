/**
 * SET-02 — a bounded, dependency-free ZIP READER for untrusted archives.
 *
 * The counterpart to `~/platform/export/zip.ts`, written to the same published
 * PKWARE format (APPNOTE.TXT §4.3.6, §4.3.12, §4.3.16) and under the same
 * AGENTS.md §10–11 reasoning: a flat set of small text entries, no encryption, no
 * ZIP64, no multi-disk, using only `Uint8Array`, `DataView`, `TextDecoder` and
 * the platform's `DecompressionStream`.
 *
 * ## The important difference from the writer
 *
 * The writer's input is DalyHub's own generated data. **This module's input is a
 * file a person uploaded**, so every field in it is hostile until proven
 * otherwise. Every limit below exists because a ZIP is a format with a long
 * history of parser abuse:
 *
 *   - **Size.** The archive is bounded before parsing ({@link RESTORE_MAX_ARCHIVE_BYTES})
 *     and the sum of every entry's decompressed size is bounded during it
 *     ({@link RESTORE_MAX_CONTENT_BYTES}), so a small file cannot expand into an
 *     isolate-killing one.
 *   - **Ratio.** An entry whose declared expansion exceeds
 *     {@link MAX_COMPRESSION_RATIO} is refused outright — the classic
 *     decompression bomb, caught by its shape rather than by running it.
 *   - **Declared vs actual.** Both the declared size and the declared CRC-32 are
 *     verified against what actually came out. A truncated or tampered archive
 *     fails here, not later as puzzling data.
 *   - **Paths.** Every entry path goes through the SAME `assertSafeZipPath` the
 *     writer uses, so absolute paths, drive letters, backslashes, control
 *     characters and `..` segments are rejected by one rule rather than two that
 *     can drift.
 *   - **Count.** {@link MAX_ENTRIES} bounds the central directory, so a directory
 *     claiming millions of entries costs one comparison.
 *
 * Nothing here executes, renders or interprets an entry's bytes. It returns
 * `Uint8Array`s; deciding what they mean is the archive reader's job.
 */

import { MAX_ATTACHMENTS_PER_ARCHIVE } from "~/kernel/attachments";
import {
  assertSafeZipPath,
  crc32,
  ZIP_MAX_ARCHIVE_BYTES,
} from "~/platform/export/zip";

/* -------------------------------------------------------------------------- */
/* Bounds                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The largest uploaded archive the restore path will read (32 MiB).
 *
 * Comfortably above a realistic personal workspace's export — the structured
 * archive is compressed JSON, and a workspace at X-04's own 50,000-rows-per-
 * collection ceiling is far smaller than this — and low enough that reading it
 * into a Worker isolate is safe. Exceeding it is an explicit, honest refusal;
 * it is never a silent truncation.
 *
 * **V2.12 FIN-00 / DEBT-247 — DERIVED, not restated.** The writer now refuses at
 * this same limit (`ZIP_MAX_ARCHIVE_BYTES`), so DalyHub can no longer produce an
 * archive it will refuse to read. The value is imported rather than repeated
 * because the defect was two constants that were allowed to disagree, and the
 * fix is not a matching pair of numbers — it is ONE number with two consumers.
 * The reader's memory budget is unchanged: this is the same 32 MiB it has always
 * been.
 */
export const RESTORE_MAX_ARCHIVE_BYTES = ZIP_MAX_ARCHIVE_BYTES;

/**
 * The largest total decompressed content the reader will produce (64 MiB).
 *
 * Deliberately equal to the writer's `ZIP_MAX_TOTAL_BYTES`, so the two ends of
 * the contract agree: any archive DalyHub was able to WRITE is admissible to
 * read. An archive above the writer's own ceiling never existed.
 */
export const RESTORE_MAX_CONTENT_BYTES = 64 * 1024 * 1024;

/**
 * The most entries a DalyHub backup archive can legitimately contain.
 *
 * Five documents (`manifest.json`, `dalyhub-snapshot.json`, `CHECKSUMS.txt`,
 * `README.md`, `SCHEMA.md`) plus one entry per attachment, bounded by the
 * export's own {@link MAX_ATTACHMENTS_PER_ARCHIVE}. V2.11 raised this from 32,
 * which was "the file set a text-only backup contains" and is no longer what a
 * backup contains.
 *
 * It is still a HARD bound applied to the DECLARED entry count before any work
 * happens, so a directory claiming millions of entries still costs one
 * comparison. What changed is the number, not the defence — and the number is
 * derived from the writer's own ceiling rather than chosen, so the two ends of
 * the contract cannot drift: any archive DalyHub was able to WRITE is
 * admissible to read.
 */
export const MAX_ENTRIES = MAX_ATTACHMENTS_PER_ARCHIVE + 5;

/**
 * The largest declared expansion factor an entry may claim.
 *
 * This is belt-and-braces, and it is worth being clear about which strap does
 * the work: the REAL defence against a decompression bomb is the absolute
 * {@link RESTORE_MAX_CONTENT_BYTES} ceiling, which no declared ratio can get
 * past. This check exists to reject the absurd shapes early and cheaply.
 *
 * It is set high on purpose. A DalyHub snapshot is pretty-printed JSON of highly
 * repetitive records, and deflate is extremely good at that — a few hundred to
 * one is an ordinary result for a real archive, so a tight ratio would reject
 * the owner's actual backup. 1000:1 is above anything the writer produces and
 * far below what a bomb needs to be interesting.
 */
export const MAX_COMPRESSION_RATIO = 1000;

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Thrown when an archive cannot be read.
 *
 * The message names the STRUCTURAL reason only — never an entry's contents —
 * because it is logged server-side and summarised to the owner.
 */
export class ZipReadError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`The backup archive could not be read: ${reason}.`);
    this.name = "ZipReadError";
    this.reason = reason;
  }
}

/* -------------------------------------------------------------------------- */
/* Format constants                                                           */
/* -------------------------------------------------------------------------- */

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;
const EOCD_MIN_SIZE = 22;
/** The maximum ZIP comment length, so the EOCD scan window is bounded. */
const MAX_COMMENT = 0xffff;
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

/** One file read out of an archive. */
export interface ReadZipEntry {
  readonly path: string;
  readonly data: Uint8Array;
}

/* -------------------------------------------------------------------------- */
/* Inflate                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Decompress raw DEFLATE through the platform's `DecompressionStream`.
 *
 * Feature-detected rather than assumed. A runtime without it can still read a
 * STORED archive, and gets an honest refusal for a compressed one instead of an
 * exception nobody can act on.
 */
async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const Decompression = (
    globalThis as {
      DecompressionStream?: new (
        format: string,
      ) => TransformStream<Uint8Array, Uint8Array>;
    }
  ).DecompressionStream;
  if (typeof Decompression !== "function") {
    throw new ZipReadError(
      "this runtime cannot decompress archive entries (no DecompressionStream)",
    );
  }
  let stream: TransformStream<Uint8Array, Uint8Array>;
  try {
    stream = new Decompression("deflate-raw");
  } catch {
    throw new ZipReadError("this runtime cannot decompress archive entries");
  }
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
  try {
    const buffer = await new Response(source.pipeThrough(stream)).arrayBuffer();
    return new Uint8Array(buffer);
  } catch {
    throw new ZipReadError("an entry's compressed data is not valid DEFLATE");
  }
}

/* -------------------------------------------------------------------------- */
/* Reader                                                                     */
/* -------------------------------------------------------------------------- */

/** Locate the End Of Central Directory record, scanning backwards. */
function findEndOfCentralDirectory(view: DataView, length: number): number {
  const earliest = Math.max(0, length - EOCD_MIN_SIZE - MAX_COMMENT);
  for (let offset = length - EOCD_MIN_SIZE; offset >= earliest; offset -= 1) {
    if (view.getUint32(offset, true) !== SIG_EOCD) continue;
    const commentLength = view.getUint16(offset + 20, true);
    // The comment must run exactly to the end of the file. Without this a byte
    // pattern inside compressed data can masquerade as the EOCD.
    if (offset + EOCD_MIN_SIZE + commentLength === length) return offset;
  }
  throw new ZipReadError("it is not a ZIP archive (no end-of-archive record)");
}

const decoder = new TextDecoder("utf-8", { fatal: true });

function decodePath(bytes: Uint8Array): string {
  try {
    return decoder.decode(bytes);
  } catch {
    throw new ZipReadError("an entry name is not valid UTF-8");
  }
}

/**
 * Read every entry of an untrusted ZIP archive.
 *
 * Directory entries (paths ending in `/`, which DalyHub never writes) are
 * skipped rather than rejected: they are legitimate ZIP structure and carry no
 * data. Everything else is verified.
 */
export async function readZipArchive(
  bytes: Uint8Array,
): Promise<readonly ReadZipEntry[]> {
  if (bytes.length === 0) throw new ZipReadError("the file is empty");
  if (bytes.length > RESTORE_MAX_ARCHIVE_BYTES) {
    throw new ZipReadError(
      `it is larger than the ${RESTORE_MAX_ARCHIVE_BYTES}-byte limit`,
    );
  }
  if (bytes.length < EOCD_MIN_SIZE) {
    throw new ZipReadError("it is too short to be a ZIP archive");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(view, bytes.length);
  const entryCount = view.getUint16(eocd + 10, true);
  const directorySize = view.getUint32(eocd + 12, true);
  const directoryOffset = view.getUint32(eocd + 16, true);

  if (entryCount > MAX_ENTRIES) {
    throw new ZipReadError(
      `it declares ${entryCount} entries, more than the ${MAX_ENTRIES} a DalyHub backup contains`,
    );
  }
  if (directoryOffset + directorySize > bytes.length) {
    throw new ZipReadError(
      "its central directory runs past the end of the file",
    );
  }

  const entries: ReadZipEntry[] = [];
  const seen = new Set<string>();
  let totalContent = 0;
  let cursor = directoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > bytes.length) {
      throw new ZipReadError("its central directory is truncated");
    }
    if (view.getUint32(cursor, true) !== SIG_CENTRAL) {
      throw new ZipReadError("its central directory is malformed");
    }
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const declaredCrc = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);

    // Bit 0 is "encrypted"; bit 3 is "sizes live in a trailing data descriptor".
    // DalyHub writes neither, and both would make the sizes above unverifiable.
    if ((flags & 0x0001) !== 0) {
      throw new ZipReadError("it contains an encrypted entry");
    }
    if ((flags & 0x0008) !== 0) {
      throw new ZipReadError(
        "an entry defers its size to a data descriptor, which is not supported",
      );
    }
    if (method !== METHOD_STORED && method !== METHOD_DEFLATE) {
      throw new ZipReadError(
        `an entry uses compression method ${method}, which is not supported`,
      );
    }

    const nameStart = cursor + 46;
    if (nameStart + nameLength > bytes.length) {
      throw new ZipReadError("its central directory is truncated");
    }
    const path = decodePath(bytes.subarray(nameStart, nameStart + nameLength));
    cursor = nameStart + nameLength + extraLength + commentLength;

    if (path.endsWith("/")) continue;

    // ONE path rule, shared with the writer. A traversal that got past the
    // writer's guard is caught here and vice versa.
    try {
      assertSafeZipPath(path);
    } catch {
      throw new ZipReadError("it contains an unsafe entry path");
    }
    if (seen.has(path)) {
      throw new ZipReadError("it contains the same entry path twice");
    }
    seen.add(path);

    /* Bomb defences, applied to the DECLARED sizes before any work happens. */
    if (uncompressedSize > RESTORE_MAX_CONTENT_BYTES) {
      throw new ZipReadError("an entry is larger than the restore size limit");
    }
    totalContent += uncompressedSize;
    if (totalContent > RESTORE_MAX_CONTENT_BYTES) {
      throw new ZipReadError(
        "its entries would expand beyond the restore size limit",
      );
    }
    if (
      compressedSize > 0 &&
      uncompressedSize / compressedSize > MAX_COMPRESSION_RATIO
    ) {
      throw new ZipReadError("an entry claims an implausible expansion ratio");
    }

    /* The local header carries the data offset. */
    if (localOffset + 30 > bytes.length) {
      throw new ZipReadError("an entry points past the end of the file");
    }
    if (view.getUint32(localOffset, true) !== SIG_LOCAL) {
      throw new ZipReadError("an entry has a malformed local header");
    }
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    if (dataStart + compressedSize > bytes.length) {
      throw new ZipReadError("an entry's data is truncated");
    }

    const raw = bytes.subarray(dataStart, dataStart + compressedSize);
    const data = method === METHOD_STORED ? raw.slice() : await inflateRaw(raw);

    if (data.length !== uncompressedSize) {
      throw new ZipReadError("an entry's size does not match its declaration");
    }
    if (crc32(data) !== declaredCrc) {
      throw new ZipReadError("an entry failed its checksum (it is corrupt)");
    }

    entries.push({ path, data });
  }

  if (entries.length === 0) {
    throw new ZipReadError("it contains no files");
  }
  return entries;
}
