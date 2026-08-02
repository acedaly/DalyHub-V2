#!/usr/bin/env node
/**
 * PWA-01 — regenerate every DalyHub icon asset from the canonical geometry.
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
 * Everything it writes is derived from `scripts/icons/geometry.mjs`. There is no
 * hand-exported artwork anywhere in the repository.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  FAVICON_ICO_SIZES,
  FAVICON_PATH,
  ICON_DIRECTORY,
  PNG_ASSETS,
  SVG_ASSET,
} from "./icons/assets.mjs";
import { TILE_COLOUR, iconShapes, iconSvg } from "./icons/geometry.mjs";
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
  return encodePng(asset.opaque ? flattenOnto(raster, TILE_COLOUR) : raster);
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

  return assets;
}

/** @param {Map<string, Buffer>} assets */
function write(assets) {
  for (const [relativePath, bytes] of assets) {
    const absolute = join(repositoryRoot(), relativePath);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, bytes);
    process.stdout.write(`wrote ${relativePath} (${bytes.length} bytes)\n`);
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
