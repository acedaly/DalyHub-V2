#!/usr/bin/env node
/**
 * BRAND-01 — regenerate every DalyHub icon asset from the canonical geometry.
 *
 *   pnpm run icons:generate          write the assets
 *   pnpm run icons:check             fail if the committed assets are stale
 *
 * The generated files ARE committed (a deployed Worker serves them as static
 * assets, and CI must not have to rasterise before it can build), so the `--check`
 * mode exists to keep "committed" and "generated from the geometry" the same
 * thing. It regenerates in memory and compares bytes; a mismatch fails with the
 * exact file, so nobody can hand-edit a PNG and have it silently survive.
 *
 * `--check` also fails on an UNDECLARED file in `public/icons`. That is what
 * stops a superseded generation of the mark being quietly redeployed alongside the
 * current one: when `ICON_VERSION` is bumped, the old files have to actually go.
 *
 * Everything it writes is derived from `scripts/icons/geometry.mjs`. There is no
 * hand-exported artwork anywhere in the repository.
 */

import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BRAND_MARK_MODULE,
  FAVICON_ICO_SIZES,
  FAVICON_PATH,
  ICON_DIRECTORY,
  PNG_ASSETS,
  SVG_ASSET,
} from "./icons/assets.mjs";
import {
  OPAQUE_BACKDROP_COLOUR,
  TILE_GRADIENT,
  arcPathData,
  iconShapes,
  iconSvg,
  markShapes,
} from "./icons/geometry.mjs";
import { encodeIco, encodePng } from "./icons/png.mjs";
import { flattenOnto, rasterise } from "./icons/raster.mjs";

/**
 * The repository root. Resolved lazily and ONLY by the filesystem modes: the
 * pure `buildIconAssets()` below must stay importable from a test runner whose
 * module environment does not give this file a `file:` URL.
 */
function repositoryRoot() {
  return fileURLToPath(new URL("..", import.meta.url));
}

/**
 * Render one declared PNG asset to bytes. Pure: the same entry always wins.
 * @param {{ size: number, tile: "rounded" | "square", markScale: number, opaque: boolean }} asset
 * @returns {Buffer}
 */
function renderPng(asset) {
  const shapes = iconShapes({
    tile: asset.tile,
    markScale: asset.markScale,
  });
  const raster = rasterise(shapes, asset.size);
  return encodePng(
    asset.opaque ? flattenOnto(raster, OPAQUE_BACKDROP_COLOUR) : raster,
  );
}

/**
 * Round to 3 decimals so the emitted module text is stable across platforms.
 * @param {number} value
 * @returns {number}
 */
function round(value) {
  return Number.parseFloat(value.toFixed(3));
}

/**
 * Emit the in-application `BrandMark` geometry as a TypeScript module.
 *
 * Everything the mark is made of reduces to two renderable primitives: a filled
 * circle, and a round-capped stroked path. That keeps the consuming component
 * (`app/shared/icons/icons.tsx`) to a dozen lines and keeps this emitter honest —
 * there is no third representation of the mark to get out of step.
 *
 * The file is listed in `.prettierignore` because it is generated: formatting it
 * by hand, or letting a formatter rewrite it, would make `icons:check` fail for a
 * reason that has nothing to do with the artwork.
 *
 * @returns {string}
 */
function renderBrandMarkModule() {
  const entries = markShapes().map((shape) => {
    switch (shape.kind) {
      case "circle":
        return `  { kind: "disc", cx: ${round(shape.cx)}, cy: ${round(shape.cy)}, r: ${round(shape.r)} },`;
      case "capsule":
        return `  { kind: "stroke", d: "M ${round(shape.x1)} ${round(shape.y1)} L ${round(shape.x2)} ${round(shape.y2)}", width: ${round(shape.width)} },`;
      case "arc":
        return `  { kind: "stroke", d: "${arcPathData(shape)}", width: ${round(shape.width)} },`;
      default:
        throw new Error(`The in-app mark cannot render a ${shape.kind}.`);
    }
  });
  return `// GENERATED FILE — do not edit.
//
// Written by \`pnpm run icons:generate\` from \`scripts/icons/geometry.mjs\`, the
// canonical DalyHub mark geometry. \`pnpm run icons:check\` fails if this file and
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
  x1: ${round(TILE_GRADIENT.x1)},
  y1: ${round(TILE_GRADIENT.y1)},
  x2: ${round(TILE_GRADIENT.x2)},
  y2: ${round(TILE_GRADIENT.y2)},
  stops: [
${TILE_GRADIENT.stops
  .map(
    (stop) =>
      `    { offset: ${round(stop.offset)}, colour: "${stop.colour}" },`,
  )
  .join("\n")}
  ],
} as const;

/** The mark, in painter's order. */
export const BRAND_MARK_SHAPES: readonly BrandMarkShape[] = [
${entries.join("\n")}
];
`;
}

/**
 * Build every asset in memory: `{ repositoryRelativePath -> Buffer }`. Shared by
 * both write and check modes so they can never diverge.
 *
 * @returns {Map<string, Buffer>}
 */
export function buildIconAssets() {
  /** @type {Map<string, Buffer>} */
  const assets = new Map();

  for (const asset of PNG_ASSETS) {
    assets.set(join(ICON_DIRECTORY, asset.file), renderPng(asset));
  }

  // The favicon packs the small sizes the browser actually picks between.
  assets.set(
    FAVICON_PATH,
    encodeIco(
      FAVICON_ICO_SIZES.map((size) => {
        const declared = PNG_ASSETS.find(
          (asset) => asset.size === size && asset.tile === "rounded",
        );
        if (!declared) {
          throw new Error(
            `favicon.ico needs a ${size}px rounded PNG, but none is declared in assets.mjs`,
          );
        }
        return { size, png: renderPng(declared) };
      }),
    ),
  );

  assets.set(
    join(ICON_DIRECTORY, SVG_ASSET.file),
    Buffer.from(iconSvg({ title: "DalyHub" }), "utf8"),
  );

  assets.set(
    BRAND_MARK_MODULE.file,
    Buffer.from(renderBrandMarkModule(), "utf8"),
  );

  return assets;
}

/**
 * Files sitting in `public/icons` that nothing declares. A superseded generation
 * of the mark shows up here, and `--check` treats it as a failure: a stale icon
 * that is still deployed is still reachable, and an installed PWA that already
 * cached its URL will keep showing it.
 *
 * @param {Map<string, Buffer>} assets
 * @returns {string[]}
 */
function undeclaredIconFiles(assets) {
  const directory = join(repositoryRoot(), ICON_DIRECTORY);
  let present;
  try {
    present = readdirSync(directory);
  } catch {
    return [];
  }
  return present
    .map((file) => join(ICON_DIRECTORY, file))
    .filter((relativePath) => !assets.has(relativePath));
}

/** @param {Map<string, Buffer>} assets */
function write(assets) {
  for (const [relativePath, bytes] of assets) {
    const absolute = join(repositoryRoot(), relativePath);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, bytes);
    process.stdout.write(`wrote ${relativePath} (${bytes.length} bytes)\n`);
  }
  for (const relativePath of undeclaredIconFiles(assets)) {
    rmSync(join(repositoryRoot(), relativePath), { force: true });
    process.stdout.write(`removed ${relativePath} (no longer declared)\n`);
  }
}

/** @param {Map<string, Buffer>} assets */
function check(assets) {
  const stale = [];
  for (const [relativePath, bytes] of assets) {
    let committed;
    try {
      committed = readFileSync(join(repositoryRoot(), relativePath));
    } catch {
      stale.push(`${relativePath} (missing)`);
      continue;
    }
    if (!committed.equals(bytes)) {
      stale.push(
        `${relativePath} (committed ${committed.length} bytes, generated ${bytes.length})`,
      );
    }
  }
  for (const relativePath of undeclaredIconFiles(assets)) {
    stale.push(
      `${relativePath} (undeclared — a superseded asset still shipping)`,
    );
  }
  if (stale.length > 0) {
    process.stderr.write(
      "Committed icon assets are stale. Run `pnpm run icons:generate` and commit the result.\n" +
        stale.map((entry) => `  - ${entry}`).join("\n") +
        "\n",
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `${assets.size} icon assets match the canonical geometry.\n`,
  );
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const assets = buildIconAssets();
  if (process.argv.includes("--check")) {
    check(assets);
  } else {
    write(assets);
  }
}
