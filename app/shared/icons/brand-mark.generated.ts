// GENERATED FILE — do not edit.
//
// Written by `pnpm run icons:generate` from `scripts/icons/geometry.mjs`, the
// canonical DalyHub mark geometry. `pnpm run icons:check` fails if this file and
// the generated icon assets were not produced by the same geometry, which is what
// makes the sidebar glyph and the home-screen icon the same drawing.
//
// Mark only: no tile. The rounded-square tile is for device surfaces; at sidebar
// size it reads as a smudge, so the in-app form is the bare D and network.

/** One renderable primitive of the DalyHub mark, in a 0 0 512 512 viewBox. */
export type BrandMarkShape =
  | { readonly kind: "disc"; readonly cx: number; readonly cy: number; readonly r: number }
  | { readonly kind: "stroke"; readonly d: string; readonly width: number };

/** The mark's viewBox — the canonical geometry's design canvas. */
export const BRAND_MARK_VIEWBOX = "0 0 512 512";

/**
 * The brand gradient, in the same user space as the viewBox, so an in-app mark
 * carries the same blue-to-teal ramp as the tile it was cut from.
 */
export const BRAND_GRADIENT = {
  x1: 0,
  y1: 0,
  x2: 512,
  y2: 512,
  stops: [
    { offset: 0, colour: "#1c5ce0" },
    { offset: 1, colour: "#0e9268" },
  ],
} as const;

/** The mark, in painter's order. */
export const BRAND_MARK_SHAPES: readonly BrandMarkShape[] = [
  { kind: "stroke", d: "M 255.158 111.498 A 128.301 128.301 0 0 1 281.834 365.296", width: 79.635 },
  { kind: "stroke", d: "M 162.251 111.498 L 255.158 111.498", width: 79.635 },
  { kind: "stroke", d: "M 162.251 111.498 L 162.251 177.86", width: 79.635 },
  { kind: "stroke", d: "M 208.705 321.646 L 126.328 274.086", width: 30.969 },
  { kind: "stroke", d: "M 208.705 321.646 L 262.737 257.253", width: 30.969 },
  { kind: "stroke", d: "M 208.705 321.646 L 179.198 402.715", width: 30.969 },
  { kind: "disc", cx: 208.705, cy: 321.646, r: 26.545 },
  { kind: "disc", cx: 126.328, cy: 274.086, r: 37.605 },
  { kind: "disc", cx: 262.737, cy: 257.253, r: 37.605 },
  { kind: "disc", cx: 179.198, cy: 402.715, r: 37.605 },
];
