/**
 * PWA-01 — the CANONICAL DalyHub app-mark geometry.
 *
 * This module is the vector source of the DalyHub icon system. It is not a
 * renamed favicon and it is not unreviewed raster artwork: every shape below is a
 * reviewable number, and BOTH the distributed `.svg` and every generated `.png`
 * are derived from these same values by `scripts/generate-icons.mjs`. The two
 * therefore cannot drift, and regenerating is deterministic — the `--check` mode
 * proves the committed bytes are exactly what this geometry produces.
 *
 * ── The mark ─────────────────────────────────────────────────────────────────
 * DalyHub already has a mark: the `BrandMark` in `app/shared/icons/icons.tsx` — a
 * hub, drawn as a centre node with six satellites and thin connecting spokes. That
 * is the established visual direction, so the app mark is the SAME idea rather
 * than a rebrand (the milestone brief explicitly forbids a broad rebrand).
 *
 * It is not, however, the same drawing. The sidebar mark is a 24px line icon with
 * 1.5px strokes and seven nodes; at 16 × 16 those strokes fall below one device
 * pixel and the whole thing collapses into grey mush. The app mark keeps the hub
 * CONCEPT and rebuilds it for device surfaces:
 *
 *   - four satellites instead of six, on the diagonals, so the silhouette is
 *     symmetric under 90° rotation and survives circle, rounded-square and
 *     squircle masks identically;
 *   - solid filled discs and thick spokes instead of hairline strokes, so nothing
 *     is thinner than roughly 1.25 device pixels at 16 × 16;
 *   - no text, no gradient, no shadow, no fine detail.
 *
 * Colour is one flat deep teal drawn from the DalyHub accent family
 * (`--dh-color-accent: #176b78`), darkened so white marks clear WCAG AA contrast
 * on it, and so the tile reads as a deliberate shape against BOTH a white and a
 * near-black browser chrome. There is exactly one mark; there is no light variant
 * and no dark variant to keep in step.
 *
 * ── Provenance ───────────────────────────────────────────────────────────────
 * First-party. No third-party or copyrighted brand asset is used, referenced or
 * traced, and no generated raster artwork is committed without the geometry that
 * produced it.
 */

/** The design canvas every shape below is expressed in. */
export const CANVAS = 512;

/**
 * The flat tile colour. A darkened sibling of the product accent (`#176b78`),
 * chosen so `#ffffff` on it measures ≈7.4:1 — comfortably past WCAG AA for the
 * large shapes the mark is made of, and dark enough to hold an edge against a
 * white home screen without needing a border.
 */
export const TILE_COLOUR = "#0f5560";

/** The mark colour. Pure white: maximum contrast, no second brand value. */
export const MARK_COLOUR = "#ffffff";

/**
 * The tile's corner radius as a fraction of its width, for the surfaces that draw
 * their OWN rounded square (the `.svg`, the favicons and the `purpose: any` PWA
 * icons). 22% is the ratio Apple's own icon grid uses, so the mark sits happily
 * beside platform icons rather than looking like an outlier.
 *
 * Two surfaces deliberately do NOT use it:
 *   - the Apple touch icon, which is full-bleed and opaque because iOS applies its
 *     own mask — baking a second rounded square in produces the double-rounded
 *     "sticker" edge;
 *   - the maskable icon, which is full-bleed for the same reason (the platform
 *     mask is the shape).
 */
export const CORNER_RADIUS_RATIO = 0.22;

/**
 * The maskable safe-zone radius as a fraction of the icon's width (the W3C
 * minimum guaranteed visible area is a circle of 40% radius, centred). The mark is
 * sized to sit INSIDE this, so no platform mask can clip it.
 */
export const MASKABLE_SAFE_RADIUS_RATIO = 0.4;

/**
 * The radius the maskable mark is actually sized to. Deliberately INSIDE the
 * guaranteed 40%: sitting exactly on the safe-zone boundary is legal but leaves
 * the mark touching the edge of an aggressive squircle, which reads as a cropping
 * accident. 36% keeps a visible margin on every mask shape at no cost to
 * legibility — the maskable icon is never rendered below 48px.
 */
export const MASKABLE_MARK_RADIUS_RATIO = 0.36;

/**
 * The hub, in canvas units. `markScale` is applied about the centre when a surface
 * needs the mark smaller (the maskable icon shrinks it into the safe zone).
 *
 * The numbers are chosen from the 16 × 16 floor upward, not from what looks
 * pleasing at 512: at 16px, `centreRadius` renders ≈2.2px, `satelliteRadius`
 * ≈1.44px and `spokeWidth` ≈1.25px. Nothing in the mark is thinner than that.
 */
export const HUB = {
  centre: CANVAS / 2,
  centreRadius: 70,
  satelliteRadius: 46,
  satelliteDistance: 152,
  spokeWidth: 40,
  /** Satellite bearings in degrees, measured clockwise from 12 o'clock. */
  satelliteAngles: [45, 135, 225, 315],
};

/**
 * Round to 3 decimal places so generated text is stable across platforms.
 * @param {number} value
 * @returns {number}
 */
function round(value) {
  return Number.parseFloat(value.toFixed(3));
}

/**
 * The satellite centres, in canvas units, for a given mark scale. Pure and
 * deterministic — the SVG writer and the rasteriser consume the same list.
 *
 * @param {number} [markScale]
 * @returns {{ x: number, y: number }[]}
 */
export function satellitePositions(markScale = 1) {
  const { centre, satelliteDistance, satelliteAngles } = HUB;
  return satelliteAngles.map((degrees) => {
    const radians = ((degrees - 90) * Math.PI) / 180;
    return {
      x: centre + Math.cos(radians) * satelliteDistance * markScale,
      y: centre + Math.sin(radians) * satelliteDistance * markScale,
    };
  });
}

/**
 * The complete shape list for one icon surface, in painter's order. Every consumer
 * (SVG writer, rasteriser, the review page) renders THIS list, so a change to the
 * geometry reaches every output at once.
 *
 * @param {object} [options]
 * @param {"rounded" | "square"} [options.tile] tile shape; `square` is full-bleed.
 * @param {number} [options.markScale] uniform scale of the hub about the centre.
 * @param {boolean} [options.transparentTile] omit the tile entirely.
 * @returns {import("./raster.mjs").IconShape[]}
 */
export function iconShapes({
  tile = "rounded",
  markScale = 1,
  transparentTile = false,
} = {}) {
  /** @type {import("./raster.mjs").IconShape[]} */
  const shapes = [];
  if (!transparentTile) {
    shapes.push({
      kind: "roundedRect",
      x: 0,
      y: 0,
      width: CANVAS,
      height: CANVAS,
      radius: tile === "rounded" ? CANVAS * CORNER_RADIUS_RATIO : 0,
      colour: TILE_COLOUR,
    });
  }
  const { centre, centreRadius, satelliteRadius, spokeWidth } = HUB;
  // Spokes first so the discs sit on top and the joins stay clean.
  for (const position of satellitePositions(markScale)) {
    shapes.push({
      kind: "capsule",
      x1: centre,
      y1: centre,
      x2: position.x,
      y2: position.y,
      width: spokeWidth * markScale,
      colour: MARK_COLOUR,
    });
  }
  shapes.push({
    kind: "circle",
    cx: centre,
    cy: centre,
    r: centreRadius * markScale,
    colour: MARK_COLOUR,
  });
  for (const position of satellitePositions(markScale)) {
    shapes.push({
      kind: "circle",
      cx: position.x,
      cy: position.y,
      r: satelliteRadius * markScale,
      colour: MARK_COLOUR,
    });
  }
  return shapes;
}

/**
 * The mark scale that keeps the whole hub inside the maskable safe zone. Derived,
 * not guessed: the furthest painted pixel from the centre is a satellite's centre
 * plus its radius, so the scale is the target radius divided by that reach.
 */
export function maskableMarkScale() {
  const reach = HUB.satelliteDistance + HUB.satelliteRadius;
  return (CANVAS * MASKABLE_MARK_RADIUS_RATIO) / reach;
}

/** The furthest a painted pixel sits from the centre, in canvas units. */
/**
 * @param {number} [markScale]
 * @returns {number}
 */
export function markReach(markScale = 1) {
  return (HUB.satelliteDistance + HUB.satelliteRadius) * markScale;
}

/**
 * Serialise one shape as an SVG element.
 * @param {import("./raster.mjs").IconShape} shape
 * @returns {string}
 */
function shapeToSvg(shape) {
  switch (shape.kind) {
    case "roundedRect":
      return (
        `<rect x="${round(shape.x)}" y="${round(shape.y)}" ` +
        `width="${round(shape.width)}" height="${round(shape.height)}"` +
        (shape.radius > 0
          ? ` rx="${round(shape.radius)}" ry="${round(shape.radius)}"`
          : "") +
        ` fill="${shape.colour}"/>`
      );
    case "circle":
      return (
        `<circle cx="${round(shape.cx)}" cy="${round(shape.cy)}" ` +
        `r="${round(shape.r)}" fill="${shape.colour}"/>`
      );
    case "capsule":
      return (
        `<line x1="${round(shape.x1)}" y1="${round(shape.y1)}" ` +
        `x2="${round(shape.x2)}" y2="${round(shape.y2)}" ` +
        `stroke="${shape.colour}" stroke-width="${round(shape.width)}" ` +
        `stroke-linecap="round"/>`
      );
    default:
      throw new Error(
        `Unknown shape kind: ${/** @type {{ kind: string }} */ (shape).kind}`,
      );
  }
}

/**
 * The distributed vector artwork for one surface. `title` becomes the accessible
 * name; pass `null` for a purely decorative surface.
 */
/**
 * @param {{ title?: string | null, tile?: "rounded" | "square", markScale?: number, transparentTile?: boolean }} [options]
 * @returns {string}
 */
export function iconSvg(options = {}) {
  const { title = "DalyHub", ...shapeOptions } = options;
  const shapes = iconShapes(shapeOptions).map(shapeToSvg).join("\n  ");
  const titled = title
    ? `\n  <title>${title}</title>`
    : `\n  <!-- decorative -->`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}" role="img" aria-label="${title ?? "DalyHub"}">${titled}
  ${shapes}
</svg>
`;
}
