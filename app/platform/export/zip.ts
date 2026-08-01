/**
 * X-04 — a minimal, dependency-free ZIP writer for the Cloudflare Workers
 * runtime.
 *
 * ## Why no dependency
 *
 * [AGENTS.md §10–11](../../../AGENTS.md#10-open-source-reuse-policy) says prefer
 * reuse — and then names the bar a new dependency has to clear. A ZIP writer did
 * not clear it:
 *
 *   - **The codebase can reasonably provide it.** The archive DalyHub needs is a
 *     flat set of UTF-8 text entries with no encryption, no ZIP64, no
 *     multi-disk, no comments and no attributes. That is the ~180 lines below,
 *     written against the PKWARE APPNOTE format that has been stable since 1993.
 *   - **Workers compatibility.** Most popular archivers assume Node `zlib`,
 *     `Buffer` or a filesystem. This uses only `Uint8Array`, `DataView`,
 *     `TextEncoder` and the platform's own `CompressionStream` — all present in
 *     workerd, none polyfilled.
 *   - **Bundle impact.** Zero added bytes beyond this file (~3 KB minified),
 *     against roughly 30–100 KB for a general-purpose archiver whose ZIP64,
 *     encryption and filesystem paths DalyHub would never execute.
 *   - **Provenance and telemetry.** Nothing to vet, nothing to pin, nothing that
 *     phones home.
 *
 * No third-party code is copied or adapted here; the format constants come from
 * the published specification (PKWARE APPNOTE.TXT, §4.3.7, §4.3.12, §4.3.16),
 * which is a file format, not a licensable work.
 *
 * ## Compression
 *
 * Entries are DEFLATE-compressed through the platform's `CompressionStream`
 * ("deflate-raw") when the runtime provides it, and STORED otherwise. Both are
 * universally readable; the fallback is a larger file, never an unreadable one.
 * A text-heavy export compresses to roughly a fifth of its stored size, which is
 * the difference between a comfortable download and an awkward one.
 *
 * ## Bounded assembly
 *
 * The archive is assembled in memory. That is the right shape here — the
 * snapshot it is built from is already in memory, and a streamed archive would
 * still need every entry's CRC and size before the central directory could be
 * written. The total is bounded by {@link ZIP_MAX_TOTAL_BYTES}; exceeding it
 * throws {@link ZipTooLargeError} rather than exhausting the isolate, so the
 * owner gets an honest error instead of a truncated file or a 500.
 */

/** One file to place in the archive. */
export interface ZipEntry {
  /** A POSIX-style path inside the archive. Must not escape the archive root. */
  readonly path: string;
  /** The file's bytes. Text entries are UTF-8 encoded by the caller. */
  readonly data: Uint8Array;
}

/**
 * The largest archive this writer will assemble (64 MiB uncompressed input).
 *
 * Sized well above a realistic personal workspace's export and well below a
 * Worker's memory ceiling, so the failure is a clear message rather than an
 * isolate the runtime kills.
 */
export const ZIP_MAX_TOTAL_BYTES = 64 * 1024 * 1024;

/** Thrown when the archive would exceed {@link ZIP_MAX_TOTAL_BYTES}. */
export class ZipTooLargeError extends Error {
  constructor(bytes: number) {
    super(
      `The export is too large to assemble in one archive ` +
        `(${bytes} bytes of content, limit ${ZIP_MAX_TOTAL_BYTES}).`,
    );
    this.name = "ZipTooLargeError";
  }
}

/** Thrown when an entry path is unsafe or malformed. */
export class ZipPathError extends Error {
  constructor(path: string, reason: string) {
    // The path is the caller's own generated value, never user content, so it is
    // safe to name in the message.
    super(`Unsafe archive path ${JSON.stringify(path)}: ${reason}`);
    this.name = "ZipPathError";
  }
}

const encoder = new TextEncoder();

/* -------------------------------------------------------------------------- */
/* Path safety                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Reject anything that could write outside the archive root when extracted.
 *
 * This is the archive-level half of the path-traversal defence; the vault
 * filename generator is the other half. Both exist because they fail
 * independently: a bug in filename generation is caught here, and a caller that
 * bypasses the generator is caught here too.
 */
export function assertSafeZipPath(path: string): void {
  if (path.length === 0) throw new ZipPathError(path, "is empty");
  if (path.length > 512) throw new ZipPathError(path, "is too long");
  if (path.startsWith("/")) throw new ZipPathError(path, "is absolute");
  if (/^[A-Za-z]:/.test(path)) {
    throw new ZipPathError(path, "carries a drive letter");
  }
  if (path.includes("\\")) {
    throw new ZipPathError(path, "contains a backslash");
  }
  // eslint-disable-next-line no-control-regex -- rejecting controls is the point.
  if (/[\u0000-\u001f\u007f]/.test(path)) {
    throw new ZipPathError(path, "contains a control character");
  }
  const segments = path.split("/");
  for (const segment of segments) {
    if (segment === "") throw new ZipPathError(path, "has an empty segment");
    if (segment === "." || segment === "..") {
      throw new ZipPathError(path, "contains a relative segment");
    }
  }
}

/* -------------------------------------------------------------------------- */
/* CRC-32                                                                     */
/* -------------------------------------------------------------------------- */

/** The standard CRC-32 (IEEE 802.3) table, built once per isolate. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 of a byte sequence, as an unsigned 32-bit value. */
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/* -------------------------------------------------------------------------- */
/* DEFLATE                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Compress with raw DEFLATE, or return `null` when the runtime cannot.
 *
 * Feature-detected rather than assumed: `deflate-raw` is present in current
 * workerd and browsers, but an environment without it must produce a valid
 * STORED archive rather than an exception the owner cannot act on.
 */
async function deflateRaw(data: Uint8Array): Promise<Uint8Array | null> {
  const Compression = (
    globalThis as {
      CompressionStream?: new (
        format: string,
      ) => TransformStream<Uint8Array, Uint8Array>;
    }
  ).CompressionStream;
  if (typeof Compression !== "function") return null;
  let stream: TransformStream<Uint8Array, Uint8Array>;
  try {
    stream = new Compression("deflate-raw");
  } catch {
    return null;
  }
  try {
    // A one-chunk source stream rather than a Blob: `ReadableStream` is the
    // narrower platform surface and needs no `BlobPart` cast.
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(data);
        controller.close();
      },
    });
    const buffer = await new Response(source.pipeThrough(stream)).arrayBuffer();
    return new Uint8Array(buffer);
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Byte assembly                                                              */
/* -------------------------------------------------------------------------- */

class ByteWriter {
  #chunks: Uint8Array[] = [];
  #length = 0;

  get length(): number {
    return this.#length;
  }

  push(bytes: Uint8Array): void {
    this.#chunks.push(bytes);
    this.#length += bytes.length;
  }

  toUint8Array(): Uint8Array {
    const out = new Uint8Array(this.#length);
    let offset = 0;
    for (const chunk of this.#chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }
}

function u16(value: number): Uint8Array {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function u32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
  return bytes;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  let length = 0;
  for (const part of parts) length += part.length;
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * MS-DOS date and time (APPNOTE §4.4.6). Seconds have 2-second resolution and
 * the epoch starts in 1980, which is why an export's entry timestamps are close
 * to — not identical to — its `exportedAt`.
 */
function dosDateTime(date: Date): {
  readonly date: number;
  readonly time: number;
} {
  const year = Math.max(1980, date.getUTCFullYear());
  return {
    date:
      ((year - 1980) << 9) |
      ((date.getUTCMonth() + 1) << 5) |
      date.getUTCDate(),
    time:
      (date.getUTCHours() << 11) |
      (date.getUTCMinutes() << 5) |
      Math.floor(date.getUTCSeconds() / 2),
  };
}

/* -------------------------------------------------------------------------- */
/* The writer                                                                 */
/* -------------------------------------------------------------------------- */

/** General-purpose bit 11: the filename and comment are UTF-8. */
const FLAG_UTF8 = 0x0800;
const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;

/**
 * Build a ZIP archive from a list of entries.
 *
 * Deterministic given the same entries and `modifiedAt`: entries are written in
 * the order supplied, no extra fields are emitted, and no random or
 * wall-clock value is read.
 */
export async function createZipArchive(
  entries: readonly ZipEntry[],
  modifiedAt: Date,
): Promise<Uint8Array> {
  let total = 0;
  const seen = new Set<string>();
  for (const entry of entries) {
    assertSafeZipPath(entry.path);
    // A case-insensitive duplicate would silently overwrite on macOS and
    // Windows, which is exactly the collision class the vault generator exists
    // to prevent — so it is a hard error here, not a warning.
    const key = entry.path.toLowerCase();
    if (seen.has(key)) {
      throw new ZipPathError(entry.path, "collides with another entry");
    }
    seen.add(key);
    total += entry.data.length;
  }
  if (total > ZIP_MAX_TOTAL_BYTES) throw new ZipTooLargeError(total);

  const { date, time } = dosDateTime(modifiedAt);
  const body = new ByteWriter();
  const central = new ByteWriter();
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.path);
    const crc = crc32(entry.data);
    const compressed = await deflateRaw(entry.data);
    // Only take the compressed form when it is actually smaller: DEFLATE can
    // expand already-incompressible or very short input.
    const useDeflate =
      compressed !== null && compressed.length < entry.data.length;
    const payload = useDeflate ? compressed : entry.data;
    const method = useDeflate ? METHOD_DEFLATE : METHOD_STORE;

    const localHeader = concat([
      u32(0x04034b50), // local file header signature
      u16(20), // version needed to extract (2.0 — DEFLATE)
      u16(FLAG_UTF8),
      u16(method),
      u16(time),
      u16(date),
      u32(crc),
      u32(payload.length),
      u32(entry.data.length),
      u16(nameBytes.length),
      u16(0), // extra field length
      nameBytes,
    ]);
    body.push(localHeader);
    body.push(payload);

    central.push(
      concat([
        u32(0x02014b50), // central directory header signature
        u16(20), // version made by
        u16(20), // version needed to extract
        u16(FLAG_UTF8),
        u16(method),
        u16(time),
        u16(date),
        u32(crc),
        u32(payload.length),
        u32(entry.data.length),
        u16(nameBytes.length),
        u16(0), // extra field length
        u16(0), // file comment length
        u16(0), // disk number start
        u16(0), // internal file attributes
        u32(0), // external file attributes
        u32(offset), // relative offset of local header
        nameBytes,
      ]),
    );

    offset += localHeader.length + payload.length;
  }

  const centralBytes = central.toUint8Array();
  const end = concat([
    u32(0x06054b50), // end of central directory signature
    u16(0), // number of this disk
    u16(0), // disk with the central directory
    u16(entries.length),
    u16(entries.length),
    u32(centralBytes.length),
    u32(offset),
    u16(0), // .ZIP file comment length
  ]);

  const archive = new ByteWriter();
  archive.push(body.toUint8Array());
  archive.push(centralBytes);
  archive.push(end);
  return archive.toUint8Array();
}

/** Encode a text file entry as UTF-8 bytes. */
export function textEntry(path: string, contents: string): ZipEntry {
  return { path, data: encoder.encode(contents) };
}
