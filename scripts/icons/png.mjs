/**
 * PWA-01 — a minimal, deterministic PNG encoder and ICO container writer.
 *
 * Both formats are simple enough that a dependency would cost more than it saves:
 * a PNG is a signature plus three chunks, and an ICO is a directory of embedded
 * PNGs. `node:zlib` supplies the only non-trivial part (DEFLATE), and it is asked
 * for a fixed compression level so two runs on the same input produce IDENTICAL
 * bytes — which is what lets `generate-icons.mjs --check` assert in CI that the
 * committed assets really are what the geometry produces.
 *
 * Encoding choices, and why:
 *   - colour type 6 (truecolour + alpha), 8 bits per channel — the app mark needs
 *     alpha for the transparent corners of the rounded tile, and a palette would
 *     quantise the anti-aliased edges that make 16 × 16 legible;
 *   - filter type 0 (None) on every scanline — the images are tiny and mostly flat,
 *     so adaptive filtering saves a few hundred bytes in exchange for a much larger
 *     surface to get wrong;
 *   - no ancillary chunks (no gAMA, no pHYs, no tEXt, no timestamp) — nothing that
 *     varies between runs or machines, and nothing carrying metadata we did not
 *     deliberately choose to publish.
 *
 * Provenance: first-party, written against the PNG (ISO/IEC 15948) and ICO format
 * specifications. No third-party code.
 */

import { deflateSync, constants as zlibConstants } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** The standard CRC-32 table (IEEE 802.3 polynomial), built once. */
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

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** Build one PNG chunk: length, type, data, CRC over type+data. */
function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

/**
 * Encode a straight-alpha RGBA raster as a PNG.
 *
 * @param {{ width: number, height: number, data: Uint8Array }} raster
 * @returns {Buffer}
 */
export function encodePng({ width, height, data }) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(8, 8); // bit depth
  header.writeUInt8(6, 9); // colour type: truecolour with alpha
  header.writeUInt8(0, 10); // compression: DEFLATE
  header.writeUInt8(0, 11); // filter method: adaptive (per-scanline byte below)
  header.writeUInt8(0, 12); // interlace: none

  // One leading filter byte (0 = None) per scanline.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(data.buffer, data.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }

  const compressed = deflateSync(raw, {
    level: zlibConstants.Z_BEST_COMPRESSION,
  });

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Pack PNG images into a Windows ICO container.
 *
 * PNG-in-ICO is supported by every browser DalyHub targets (Windows Vista and
 * later, and every current browser reads it on any platform), and it keeps the
 * favicon a few hundred bytes rather than the several kilobytes an uncompressed
 * BMP directory would cost.
 *
 * @param {ReadonlyArray<{ size: number, png: Buffer }>} entries ascending by size.
 * @returns {Buffer}
 */
export function encodeIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: 1 = icon
  header.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(16 * entries.length);
  let offset = header.length + directory.length;
  entries.forEach((entry, index) => {
    const at = index * 16;
    // 256 is encoded as 0 in the ICO directory; DalyHub ships 16/32/48 only.
    directory.writeUInt8(entry.size >= 256 ? 0 : entry.size, at);
    directory.writeUInt8(entry.size >= 256 ? 0 : entry.size, at + 1);
    directory.writeUInt8(0, at + 2); // palette colours (0 = truecolour)
    directory.writeUInt8(0, at + 3); // reserved
    directory.writeUInt16LE(1, at + 4); // colour planes
    directory.writeUInt16LE(32, at + 6); // bits per pixel
    directory.writeUInt32LE(entry.png.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += entry.png.length;
  });

  return Buffer.concat([
    header,
    directory,
    ...entries.map((entry) => entry.png),
  ]);
}
