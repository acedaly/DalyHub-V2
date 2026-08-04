/**
 * BRAND-01 — the CANONICAL DalyHub app-mark geometry.
 *
 * This module is the vector source of the DalyHub icon system. It is not a
 * renamed favicon and it is not unreviewed raster artwork: every shape below is a
 * reviewable number, and BOTH the distributed `.svg` and every generated `.png`
 * are derived from these same values by `scripts/generate-icons.mjs`. The two
 * therefore cannot drift, and regenerating is deterministic — the `--check` mode
 * proves the committed bytes are exactly what this geometry produces.
 *
 * ── The mark ─────────────────────────────────────────────────────────────────
 * The approved DalyHub identity is a rounded-square blue-to-teal/green gradient
 * tile carrying a white "D" built from a heavy open arc, with a small connected
 * three-node network breaking out of the D's lower-left. The wordmark is
 * "DalyHub" and the tagline "Your life. Connected."; both are rendered as LIVE
 * TEXT by the application (`app/shared/brand`), never baked into artwork here.
 *
 * The supplied branding pack is a VISUAL REFERENCE, not a production source. No
 * pixel of it is traced, embedded or shipped. What is reproduced is the design
 * decision — tile, gradient, D, network — rebuilt from first-party numbers so it
 * can be reviewed, diffed and regenerated.
 *
 * ── Deviations from the reference raster, and why ────────────────────────────
 * Everything here is weighted from the small end upward rather than from what
 * looks pleasing at 512. After the fit below, at 16 × 16 the mark measures:
 *
 *   - the D's stroke      2.49 device px
 *   - a network node      2.35 px across
 *   - the junction disc   1.66 px across
 *   - a connecting spoke  0.97 px
 *
 * All of those are heavier than the reference raster, whose network strokes sit
 * around 0.055 of the tile width — 0.9 px at 16 × 16, where they vanish. The
 * reference's fine inner step on the D's top-left corner is dropped for the same
 * reason: below 32 px it is indistinguishable from an encoding artefact.
 *
 * WHAT THAT DOES AND DOES NOT BUY, stated plainly. At 32 × 32 and above — which
 * is what a 2× display actually renders a "16px" favicon at, and every other
 * surface the mark appears on — the D, its counter and three distinct nodes all
 * resolve. At a true 16 × 16 the D's silhouette and the gradient tile are what
 * identify the application; the network reads as one cluster rather than three
 * nodes joined by spokes, because a sub-pixel spoke cannot do otherwise. Making
 * it do otherwise would mean a second, simplified drawing for one size, and a
 * second drawing is a second thing to keep in step — which is the failure this
 * whole module exists to prevent.
 *
 * ── Composition ──────────────────────────────────────────────────────────────
 * The mark is defined in a design frame, then CENTRED and FITTED to the canvas by
 * code (see `MARK_TRANSFORM`). That means a designer can move one number without
 * having to re-balance every other one by hand, and the mark's true painted reach
 * — which is what the maskable safe zone is derived from — is measured rather
 * than asserted.
 *
 * ── Colour and contrast ──────────────────────────────────────────────────────
 * One linear gradient, corner to corner, blue → teal-green. Both ends are chosen
 * so the white mark clears the WCAG 3:1 minimum for a graphical object against
 * EVERY point of the gradient; the worst point is the green end, at 3.94:1.
 * There is exactly one tile; there is no light variant and no dark variant to
 * keep in step, because the gradient reads deliberately against both a white and
 * a near-black browser chrome.
 *
 * ── Provenance ───────────────────────────────────────────────────────────────
 * First-party. No third-party or copyrighted brand asset is used, referenced or
 * traced, and no generated raster artwork is committed without the geometry that
 * produced it.
 */

/** The design canvas every shape below is expressed in. */
export const CANVAS = 512;

/** The canvas centre — every transform below is about this point. */
const CENTRE = CANVAS / 2;

/**
 * The tile gradient's ends.
 *
 * Measured against `#ffffff` (the mark): the blue end is 5.74:1 and the green
 * end 3.94:1, so the white D and network clear the WCAG 2.2 non-text contrast
 * minimum of 3:1 everywhere on the tile, not merely on average.
 * `test/unit/pwa/manifest-and-icons.test.ts` measures this rather than trusting
 * the comment.
 */
export const GRADIENT_START_COLOUR = "#1c5ce0";
export const GRADIENT_END_COLOUR = "#0e9268";

/** The mark colour. Pure white: maximum contrast, no second brand value. */
export const MARK_COLOUR = "#ffffff";

/**
 * The gradient every tile is filled with, corner to corner in canvas units.
 *
 * `id` is the SVG `<linearGradient>` identifier; the rasteriser ignores it and
 * evaluates the gradient analytically, so the PNG and the SVG agree by
 * construction (both interpolate in sRGB, which is the SVG default).
 */
export const TILE_GRADIENT = {
  kind: /** @type {const} */ ("linear"),
  id: "dh-tile-gradient",
  x1: 0,
  y1: 0,
  x2: CANVAS,
  y2: CANVAS,
  stops: [
    { offset: 0, colour: GRADIENT_START_COLOUR },
    { offset: 1, colour: GRADIENT_END_COLOUR },
  ],
};

/**
 * The colour an opaque surface flattens onto.
 *
 * Only a defensive backstop: every opaque asset uses the full-bleed `square`
 * tile, which covers all four corners exactly, so no sample is ever uncovered.
 * The test that asserts the Apple touch icon carries no transparency is what
 * proves that, rather than this constant.
 */
export const OPAQUE_BACKDROP_COLOUR = GRADIENT_START_COLOUR;

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
 * How much of the tile the mark fills on a normal (non-maskable) surface,
 * expressed as the half-extent of its bounding box over the canvas width. 0.36
 * means the mark spans 72% of the tile — the same visual weight as the approved
 * reference, with a margin that survives the 22% rounded corners.
 */
export const MARK_EXTENT_RATIO = 0.36;

/**
 * The mark in DESIGN units. These are the numbers a change starts from; the code
 * below re-centres and re-fits whatever they describe, so none of them has to be
 * balanced against the canvas by hand.
 *
 * `bowl` is the D's arc: a heavy open stroke running clockwise from 12 o'clock
 * (the top bar's right end) round to 168°, which stops short of the bottom-left
 * so the network has that corner to itself. `topBar` closes the D's flat top.
 *
 * `network` is the connected three-node hub: one junction disc, three nodes on
 * irregular bearings — measured clockwise from 12 o'clock — and a spoke to each.
 * The bearings and distances are deliberately NOT symmetric; a perfect Y reads as
 * a radiation trefoil, and the approved mark's network does not.
 */
export const MARK = {
  /** Stroke weight shared by the bowl, the top bar and the stem. */
  stroke: 72,
  /** The D's bowl: a heavy arc, open at the lower left. */
  bowl: { cx: 236, cy: 256, radius: 116, from: 0, to: 168 },
  /** The D's flat top, from the stem to the bowl's start. */
  topBar: { x1: 152, x2: 236, y: 140 },
  /** The D's short stem. It stops well above the network, not at the baseline. */
  stem: { x: 152, y1: 140, y2: 200 },
  network: {
    junction: { x: 194, y: 330, radius: 24 },
    nodeRadius: 34,
    spokeWidth: 28,
    /** `bearing` is degrees clockwise from 12 o'clock; `distance` in design units. */
    nodes: [
      { bearing: 300, distance: 86 },
      { bearing: 40, distance: 76 },
      { bearing: 200, distance: 78 },
    ],
  },
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
 * A point on a circle, from a bearing measured clockwise from 12 o'clock.
 * @param {number} cx @param {number} cy @param {number} radius @param {number} bearing
 * @returns {{ x: number, y: number }}
 */
function pointAt(cx, cy, radius, bearing) {
  const radians = ((bearing - 90) * Math.PI) / 180;
  return {
    x: cx + Math.cos(radians) * radius,
    y: cy + Math.sin(radians) * radius,
  };
}

/**
 * The network's node centres in design units. Pure: the SVG writer, the
 * rasteriser and the in-app glyph all consume the same list.
 *
 * @returns {{ x: number, y: number }[]}
 */
export function networkNodes() {
  const { junction, nodes } = MARK.network;
  return nodes.map((node) =>
    pointAt(junction.x, junction.y, node.distance, node.bearing),
  );
}

/**
 * The mark's shapes in DESIGN units, in painter's order (strokes first so the
 * discs sit on top and every join stays clean).
 *
 * @returns {import("./raster.mjs").IconShape[]}
 */
function designMarkShapes() {
  const { stroke, bowl, topBar, stem, network } = MARK;
  /** @type {import("./raster.mjs").IconShape[]} */
  const shapes = [
    {
      kind: "arc",
      cx: bowl.cx,
      cy: bowl.cy,
      radius: bowl.radius,
      width: stroke,
      from: bowl.from,
      to: bowl.to,
      fill: MARK_COLOUR,
    },
    {
      kind: "capsule",
      x1: topBar.x1,
      y1: topBar.y,
      x2: topBar.x2,
      y2: topBar.y,
      width: stroke,
      fill: MARK_COLOUR,
    },
    {
      kind: "capsule",
      x1: stem.x,
      y1: stem.y1,
      x2: stem.x,
      y2: stem.y2,
      width: stroke,
      fill: MARK_COLOUR,
    },
  ];
  const nodes = networkNodes();
  for (const node of nodes) {
    shapes.push({
      kind: "capsule",
      x1: network.junction.x,
      y1: network.junction.y,
      x2: node.x,
      y2: node.y,
      width: network.spokeWidth,
      fill: MARK_COLOUR,
    });
  }
  shapes.push({
    kind: "circle",
    cx: network.junction.x,
    cy: network.junction.y,
    r: network.junction.radius,
    fill: MARK_COLOUR,
  });
  for (const node of nodes) {
    shapes.push({
      kind: "circle",
      cx: node.x,
      cy: node.y,
      r: network.nodeRadius,
      fill: MARK_COLOUR,
    });
  }
  return shapes;
}

/**
 * Is `bearing` inside the arc's sweep? Sweeps are written `from` → `to`
 * clockwise, and never exceed 360°.
 *
 * @param {{ from: number, to: number }} arc @param {number} bearing
 * @returns {boolean}
 */
function withinSweep(arc, bearing) {
  const offset = (((bearing - arc.from) % 360) + 360) % 360;
  return offset <= arc.to - arc.from;
}

/**
 * The axis-aligned bounding box of a shape list, in the same units.
 *
 * Exact rather than sampled: an arc's extremes are its two round-capped ends plus
 * whichever of the four cardinal bearings its sweep actually contains.
 *
 * @param {ReadonlyArray<import("./raster.mjs").IconShape>} shapes
 * @returns {{ minX: number, minY: number, maxX: number, maxY: number }}
 */
function boundingBox(shapes) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  /** @param {number} x @param {number} y @param {number} pad */
  const include = (x, y, pad) => {
    minX = Math.min(minX, x - pad);
    minY = Math.min(minY, y - pad);
    maxX = Math.max(maxX, x + pad);
    maxY = Math.max(maxY, y + pad);
  };
  for (const shape of shapes) {
    switch (shape.kind) {
      case "roundedRect":
        include(shape.x, shape.y, 0);
        include(shape.x + shape.width, shape.y + shape.height, 0);
        break;
      case "circle":
        include(shape.cx, shape.cy, shape.r);
        break;
      case "capsule":
        include(shape.x1, shape.y1, shape.width / 2);
        include(shape.x2, shape.y2, shape.width / 2);
        break;
      case "arc": {
        const half = shape.width / 2;
        for (const bearing of [shape.from, shape.to]) {
          const point = pointAt(shape.cx, shape.cy, shape.radius, bearing);
          include(point.x, point.y, half);
        }
        for (const bearing of [0, 90, 180, 270]) {
          if (!withinSweep(shape, bearing)) continue;
          const point = pointAt(shape.cx, shape.cy, shape.radius, bearing);
          include(point.x, point.y, half);
        }
        break;
      }
      default:
        throw new Error(
          `Unknown shape kind: ${/** @type {{ kind: string }} */ (shape).kind}`,
        );
    }
  }
  return { minX, minY, maxX, maxY };
}

/**
 * The translation and scale that take the design frame to the canvas: centre the
 * mark's bounding box, then scale it so its larger half-extent is
 * `MARK_EXTENT_RATIO` of the canvas.
 *
 * Computed once, from the shapes themselves. Change a number in `MARK` and this
 * follows.
 */
export const MARK_TRANSFORM = (() => {
  const box = boundingBox(designMarkShapes());
  const width = box.maxX - box.minX;
  const height = box.maxY - box.minY;
  return {
    offsetX: CENTRE - (box.minX + width / 2),
    offsetY: CENTRE - (box.minY + height / 2),
    scale: (CANVAS * MARK_EXTENT_RATIO) / (Math.max(width, height) / 2),
  };
})();

/**
 * Apply the design-to-canvas transform, plus an extra uniform `scale` about the
 * canvas centre (the maskable icon shrinks the mark into its safe zone).
 *
 * @param {import("./raster.mjs").IconShape} shape
 * @param {number} extraScale
 * @returns {import("./raster.mjs").IconShape}
 */
function toCanvas(shape, extraScale) {
  const { offsetX, offsetY } = MARK_TRANSFORM;
  const scale = MARK_TRANSFORM.scale * extraScale;
  /** @param {number} x @returns {number} */
  const mapX = (x) => CENTRE + (x + offsetX - CENTRE) * scale;
  /** @param {number} y @returns {number} */
  const mapY = (y) => CENTRE + (y + offsetY - CENTRE) * scale;
  switch (shape.kind) {
    case "circle":
      return {
        ...shape,
        cx: mapX(shape.cx),
        cy: mapY(shape.cy),
        r: shape.r * scale,
      };
    case "capsule":
      return {
        ...shape,
        x1: mapX(shape.x1),
        y1: mapY(shape.y1),
        x2: mapX(shape.x2),
        y2: mapY(shape.y2),
        width: shape.width * scale,
      };
    case "arc":
      return {
        ...shape,
        cx: mapX(shape.cx),
        cy: mapY(shape.cy),
        radius: shape.radius * scale,
        width: shape.width * scale,
      };
    default:
      return shape;
  }
}

/**
 * The mark's shapes in CANVAS units — the D and its network, no tile.
 *
 * This is what the app's in-application `BrandMark` renders too (via the
 * generated `app/shared/icons/brand-mark.generated.ts`), which is what makes the
 * sidebar glyph and the home-screen icon the same drawing rather than two
 * drawings that resemble each other.
 *
 * @param {number} [markScale]
 * @returns {import("./raster.mjs").IconShape[]}
 */
export function markShapes(markScale = 1) {
  return designMarkShapes().map((shape) => toCanvas(shape, markScale));
}

/**
 * The complete shape list for one icon surface, in painter's order. Every consumer
 * (SVG writer, rasteriser, the review page) renders THIS list, so a change to the
 * geometry reaches every output at once.
 *
 * @param {object} [options]
 * @param {"rounded" | "square"} [options.tile] tile shape; `square` is full-bleed.
 * @param {number} [options.markScale] uniform scale of the mark about the centre.
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
      fill: TILE_GRADIENT,
    });
  }
  shapes.push(...markShapes(markScale));
  return shapes;
}

/**
 * The furthest a painted mark pixel sits from the canvas centre, in canvas units.
 * MEASURED from the shapes, not asserted: this is what the maskable safe-zone
 * scale is derived from, so it must follow the geometry automatically.
 *
 * @param {number} [markScale]
 * @returns {number}
 */
export function markReach(markScale = 1) {
  let reach = 0;
  /** @param {number} value */
  const consider = (value) => {
    reach = Math.max(reach, value);
  };
  for (const shape of markShapes(markScale)) {
    switch (shape.kind) {
      case "circle":
        consider(Math.hypot(shape.cx - CENTRE, shape.cy - CENTRE) + shape.r);
        break;
      case "capsule":
        consider(
          Math.max(
            Math.hypot(shape.x1 - CENTRE, shape.y1 - CENTRE),
            Math.hypot(shape.x2 - CENTRE, shape.y2 - CENTRE),
          ) +
            shape.width / 2,
        );
        break;
      case "arc": {
        const half = shape.width / 2;
        for (const bearing of [shape.from, shape.to]) {
          const point = pointAt(shape.cx, shape.cy, shape.radius, bearing);
          consider(Math.hypot(point.x - CENTRE, point.y - CENTRE) + half);
        }
        // The furthest point of a full circle from an external point lies on the
        // ray from that point through the circle's centre. It only counts if the
        // sweep actually contains that bearing.
        const dx = shape.cx - CENTRE;
        const dy = shape.cy - CENTRE;
        const distance = Math.hypot(dx, dy);
        if (distance === 0) {
          consider(shape.radius + half);
          break;
        }
        const bearing =
          ((((Math.atan2(dx, -dy) * 180) / Math.PI) % 360) + 360) % 360;
        if (withinSweep(shape, bearing)) {
          consider(distance + shape.radius + half);
        }
        break;
      }
      default:
        break;
    }
  }
  return reach;
}

/**
 * The mark scale that keeps the whole mark inside the maskable safe zone.
 * Derived, not guessed: the target radius divided by the mark's measured reach.
 */
export function maskableMarkScale() {
  return (CANVAS * MASKABLE_MARK_RADIUS_RATIO) / markReach();
}

/**
 * The SVG path data for an arc shape's centreline. Round caps and a stroke give
 * it its weight, exactly as the rasteriser's signed distance function does.
 *
 * @param {import("./raster.mjs").ArcShape} shape
 * @returns {string}
 */
export function arcPathData(shape) {
  const start = pointAt(shape.cx, shape.cy, shape.radius, shape.from);
  const end = pointAt(shape.cx, shape.cy, shape.radius, shape.to);
  const largeArc = shape.to - shape.from > 180 ? 1 : 0;
  return (
    `M ${round(start.x)} ${round(start.y)} ` +
    `A ${round(shape.radius)} ${round(shape.radius)} 0 ${largeArc} 1 ` +
    `${round(end.x)} ${round(end.y)}`
  );
}

/**
 * Serialise a fill as an SVG paint value.
 * @param {import("./raster.mjs").Fill} fill
 * @returns {string}
 */
function fillToSvg(fill) {
  return typeof fill === "string" ? fill : `url(#${fill.id})`;
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
        ` fill="${fillToSvg(shape.fill)}"/>`
      );
    case "circle":
      return (
        `<circle cx="${round(shape.cx)}" cy="${round(shape.cy)}" ` +
        `r="${round(shape.r)}" fill="${fillToSvg(shape.fill)}"/>`
      );
    case "capsule":
      return (
        `<line x1="${round(shape.x1)}" y1="${round(shape.y1)}" ` +
        `x2="${round(shape.x2)}" y2="${round(shape.y2)}" ` +
        `stroke="${fillToSvg(shape.fill)}" stroke-width="${round(shape.width)}" ` +
        `stroke-linecap="round"/>`
      );
    case "arc":
      return (
        `<path d="${arcPathData(shape)}" fill="none" ` +
        `stroke="${fillToSvg(shape.fill)}" stroke-width="${round(shape.width)}" ` +
        `stroke-linecap="round"/>`
      );
    default:
      throw new Error(
        `Unknown shape kind: ${/** @type {{ kind: string }} */ (shape).kind}`,
      );
  }
}

/**
 * The `<defs>` block for whichever gradients a shape list actually references.
 * Emitted only when one is used, so the mark-only SVG carries no dead markup.
 *
 * @param {ReadonlyArray<import("./raster.mjs").IconShape>} shapes
 * @returns {string}
 */
function defsToSvg(shapes) {
  /** @type {Map<string, import("./raster.mjs").LinearGradientFill>} */
  const gradients = new Map();
  for (const shape of shapes) {
    if (typeof shape.fill !== "string")
      gradients.set(shape.fill.id, shape.fill);
  }
  if (gradients.size === 0) return "";
  const definitions = [...gradients.values()]
    .map(
      (gradient) =>
        `    <linearGradient id="${gradient.id}" gradientUnits="userSpaceOnUse" ` +
        `x1="${round(gradient.x1)}" y1="${round(gradient.y1)}" ` +
        `x2="${round(gradient.x2)}" y2="${round(gradient.y2)}">\n` +
        gradient.stops
          .map(
            (stop) =>
              `      <stop offset="${round(stop.offset)}" stop-color="${stop.colour}"/>`,
          )
          .join("\n") +
        `\n    </linearGradient>`,
    )
    .join("\n");
  return `\n  <defs>\n${definitions}\n  </defs>`;
}

/**
 * The distributed vector artwork for one surface. `title` becomes the accessible
 * name; pass `null` for a purely decorative surface.
 *
 * @param {{ title?: string | null, tile?: "rounded" | "square", markScale?: number, transparentTile?: boolean }} [options]
 * @returns {string}
 */
export function iconSvg(options = {}) {
  const { title = "DalyHub", ...shapeOptions } = options;
  const shapes = iconShapes(shapeOptions);
  const body = shapes.map(shapeToSvg).join("\n  ");
  const titled = title
    ? `\n  <title>${title}</title>`
    : `\n  <!-- decorative -->`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}" role="img" aria-label="${title ?? "DalyHub"}">${titled}${defsToSvg(shapes)}
  ${body}
</svg>
`;
}
