/**
 * PWA-01 — a tiny, first-party rasteriser for the DalyHub app mark.
 *
 * DalyHub has no image-processing dependency and this milestone is not a good
 * reason to add one (`AGENTS.md §10`, and the brief's "avoid introducing a large
 * dependency"): the mark is deliberately three primitive shapes, every one of
 * which has a closed-form signed distance function, so rasterising it exactly is
 * about eighty lines of arithmetic rather than a native binary.
 *
 * The approach is analytic coverage by supersampling: each output pixel is
 * sampled `SAMPLES × SAMPLES` times, each sample is tested against each shape's
 * signed distance function in painter's order, and the resulting sub-pixel colours
 * are averaged. That gives clean anti-aliased edges at 16 × 16 (where it matters
 * most) with no filtering artefacts, and — because it is pure integer-indexed
 * floating-point arithmetic with no randomness and no platform library — it is
 * bit-for-bit reproducible on any machine running the same Node version.
 *
 * Provenance: first-party. No third-party code.
 */

import { CANVAS } from "./geometry.mjs";

/**
 * @typedef {{ kind: "roundedRect", x: number, y: number, width: number, height: number, radius: number, colour: string }} RoundedRectShape
 * @typedef {{ kind: "circle", cx: number, cy: number, r: number, colour: string }} CircleShape
 * @typedef {{ kind: "capsule", x1: number, y1: number, x2: number, y2: number, width: number, colour: string }} CapsuleShape
 * @typedef {RoundedRectShape | CircleShape | CapsuleShape} IconShape
 * @typedef {{ width: number, height: number, data: Uint8Array }} Raster
 */

/** Samples per axis, per pixel. 4 × 4 = 16 samples is ample for flat shapes. */
const SAMPLES = 4;

/**
 * Parse `#rrggbb` into a linear-free 0-255 RGB triple.
 * @param {string} hex
 * @returns {[number, number, number]}
 */
function parseColour(hex) {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

/**
 * Signed distance from a point to a rounded rectangle (negative = inside).
 * @param {number} px @param {number} py @param {RoundedRectShape} shape
 * @returns {number}
 */
function roundedRectDistance(px, py, shape) {
  const halfWidth = shape.width / 2;
  const halfHeight = shape.height / 2;
  const centreX = shape.x + halfWidth;
  const centreY = shape.y + halfHeight;
  const radius = Math.min(shape.radius, halfWidth, halfHeight);
  const dx = Math.abs(px - centreX) - (halfWidth - radius);
  const dy = Math.abs(py - centreY) - (halfHeight - radius);
  const outsideX = Math.max(dx, 0);
  const outsideY = Math.max(dy, 0);
  const outside = Math.hypot(outsideX, outsideY);
  const inside = Math.min(Math.max(dx, dy), 0);
  return outside + inside - radius;
}

/**
 * Signed distance from a point to a circle.
 * @param {number} px @param {number} py @param {CircleShape} shape
 * @returns {number}
 */
function circleDistance(px, py, shape) {
  return Math.hypot(px - shape.cx, py - shape.cy) - shape.r;
}

/**
 * Signed distance from a point to a capsule (a round-capped thick segment).
 * @param {number} px @param {number} py @param {CapsuleShape} shape
 * @returns {number}
 */
function capsuleDistance(px, py, shape) {
  const ax = shape.x1;
  const ay = shape.y1;
  const bx = shape.x2 - ax;
  const by = shape.y2 - ay;
  const lengthSquared = bx * bx + by * by;
  const t =
    lengthSquared === 0
      ? 0
      : Math.min(
          1,
          Math.max(0, ((px - ax) * bx + (py - ay) * by) / lengthSquared),
        );
  return Math.hypot(px - (ax + bx * t), py - (ay + by * t)) - shape.width / 2;
}

/**
 * Dispatch to the right signed distance function.
 * @param {number} px @param {number} py @param {IconShape} shape
 * @returns {number}
 */
function distanceTo(px, py, shape) {
  switch (shape.kind) {
    case "roundedRect":
      return roundedRectDistance(px, py, shape);
    case "circle":
      return circleDistance(px, py, shape);
    case "capsule":
      return capsuleDistance(px, py, shape);
    default:
      throw new Error(
        `Unknown shape kind: ${/** @type {{ kind: string }} */ (shape).kind}`,
      );
  }
}

/**
 * Rasterise a shape list to straight (non-premultiplied) RGBA bytes.
 *
 * @param {ReadonlyArray<IconShape>} shapes painter-order shapes in CANVAS units.
 * @param {number} size output width and height in pixels.
 * @returns {Raster}
 */
export function rasterise(shapes, size) {
  const prepared = shapes.map((shape) => ({
    shape,
    rgb: parseColour(shape.colour),
  }));
  const data = new Uint8Array(size * size * 4);
  const scale = CANVAS / size;
  const step = 1 / SAMPLES;
  const sampleCount = SAMPLES * SAMPLES;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const px = (x + (sx + 0.5) * step) * scale;
          const py = (y + (sy + 0.5) * step) * scale;
          // Painter's order: the LAST shape covering this sample wins. Shapes are
          // flat and opaque, so there is no partial blending to accumulate — only
          // the sub-pixel average below, which is what produces the anti-aliasing.
          let hitR = 0;
          let hitG = 0;
          let hitB = 0;
          let hit = 0;
          for (const { shape, rgb } of prepared) {
            if (distanceTo(px, py, shape) <= 0) {
              [hitR, hitG, hitB] = rgb;
              hit = 1;
            }
          }
          r += hitR * hit;
          g += hitG * hit;
          b += hitB * hit;
          a += hit;
        }
      }
      const index = (y * size + x) * 4;
      if (a === 0) {
        // Fully transparent: keep the colour channels at zero so the encoded
        // bytes are stable rather than carrying meaningless colour.
        data[index] = 0;
        data[index + 1] = 0;
        data[index + 2] = 0;
        data[index + 3] = 0;
        continue;
      }
      // Straight alpha: average the colour over the COVERED samples only, so a
      // partially covered edge pixel keeps full-strength colour with reduced
      // alpha rather than darkening towards black.
      data[index] = Math.round(r / a);
      data[index + 1] = Math.round(g / a);
      data[index + 2] = Math.round(b / a);
      data[index + 3] = Math.round((a / sampleCount) * 255);
    }
  }
  return { width: size, height: size, data };
}

/**
 * Composite a straight-alpha RGBA raster onto an opaque background colour. Used
 * for the Apple touch icon, which must not be transparent: iOS composites a
 * transparent icon onto black, which would put a black ring around the tile.
 *
 * @param {Raster} raster
 * @param {string} backgroundHex
 * @returns {Raster}
 */
export function flattenOnto(raster, backgroundHex) {
  const [br, bg, bb] = parseColour(backgroundHex);
  const data = new Uint8Array(raster.data.length);
  for (let i = 0; i < raster.data.length; i += 4) {
    const alpha = raster.data[i + 3] / 255;
    data[i] = Math.round(raster.data[i] * alpha + br * (1 - alpha));
    data[i + 1] = Math.round(raster.data[i + 1] * alpha + bg * (1 - alpha));
    data[i + 2] = Math.round(raster.data[i + 2] * alpha + bb * (1 - alpha));
    data[i + 3] = 255;
  }
  return { width: raster.width, height: raster.height, data };
}
