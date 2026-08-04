/**
 * BRAND-01 — the declarative list of every DalyHub icon asset.
 *
 * ONE list, consumed by four things that must never disagree:
 *   - `scripts/generate-icons.mjs`, which produces the files;
 *   - `test/unit/pwa/manifest-and-icons.test.ts`, which asserts every declared
 *     file exists, is a real PNG/ICO of the declared size, and is byte-identical
 *     to a fresh regeneration — and that NOTHING ELSE is in the icon directory;
 *   - `public/manifest.webmanifest` and `app/root.tsx`, whose declarations the
 *     same test checks against this list;
 *   - `vite-plugins/service-worker.ts`, whose precache list must name real files.
 *
 * Adding a size means adding one entry here. Nothing reads a directory listing and
 * guesses.
 */

import { maskableMarkScale } from "./geometry.mjs";

/**
 * The icon system's generation, carried in every generated filename.
 *
 * WHY the version is in the NAME rather than a query string: a browser and an
 * installed PWA both key their icon caches by URL, and an installed app can hold
 * `/icons/icon-192.png` for a very long time after its bytes change. Renaming the
 * file makes the new mark a new resource, which is the only thing that reliably
 * defeats that cache. It also changes the service worker's precache list, so the
 * build id changes and the old assets are evicted with their cache rather than
 * lingering.
 *
 * Bump this when the MARK changes (not when a size is added). Everything —
 * manifest, `root.tsx`, the precache list, the docs — is checked against it by
 * `test/unit/pwa/manifest-and-icons.test.ts`, so a partial rename fails CI.
 *
 * v1 was the PWA-01 hub-and-spokes mark; v2 is the approved D + network identity.
 */
export const ICON_VERSION = "v2";

/** Where generated assets live, relative to the repository root. */
export const ICON_DIRECTORY = "public/icons";

/**
 * The favicon `.ico`. It cannot be versioned in its name: browsers, bookmark
 * managers and feed readers request `/favicon.ico` at the origin root whether or
 * not a document links to one. `app/root.tsx` therefore links it with a `?v=`
 * query, which is enough to refresh the tab icon of a returning visitor while the
 * unversioned path keeps working for everything that guesses it.
 */
export const FAVICON_PATH = "public/favicon.ico";

/** The sizes packed into `favicon.ico`. */
export const FAVICON_ICO_SIZES = [16, 32, 48];

/**
 * Build a versioned asset filename: `icon-192` → `icon-192-v2.png`.
 * @param {string} stem @param {string} extension
 * @returns {string}
 */
function versioned(stem, extension) {
  return `${stem}-${ICON_VERSION}.${extension}`;
}

/**
 * Every generated PNG.
 *
 * `tile`      — `rounded` draws DalyHub's own 22% rounded square with transparent
 *               corners; `square` is full-bleed and opaque.
 * `markScale` — the mark's scale about the centre (the maskable icon shrinks the
 *               mark into the W3C 40%-radius safe zone).
 * `opaque`    — flatten onto the backdrop so the PNG carries no alpha at all.
 *
 * @type {ReadonlyArray<{
 *   file: string,
 *   size: number,
 *   tile: "rounded" | "square",
 *   markScale: number,
 *   opaque: boolean,
 *   purpose: "any" | "maskable" | "apple-touch-icon",
 *   why: string,
 * }>}
 */
export const PNG_ASSETS = [
  {
    file: versioned("icon-16", "png"),
    size: 16,
    tile: "rounded",
    markScale: 1,
    opaque: false,
    purpose: "any",
    why: "Browser tab favicon at 1× — the size the mark's weights are designed from.",
  },
  {
    file: versioned("icon-32", "png"),
    size: 32,
    tile: "rounded",
    markScale: 1,
    opaque: false,
    purpose: "any",
    why: "Browser tab favicon at 2×, and the Windows taskbar/bookmark size.",
  },
  {
    file: versioned("icon-48", "png"),
    size: 48,
    tile: "rounded",
    markScale: 1,
    opaque: false,
    purpose: "any",
    why: "Packed into favicon.ico for Windows shortcut and legacy surfaces.",
  },
  {
    file: versioned("apple-touch-icon", "png"),
    size: 180,
    tile: "square",
    markScale: 1,
    opaque: true,
    purpose: "apple-touch-icon",
    why: "iOS/iPadOS home screen. Full-bleed and OPAQUE: iOS applies its own mask, so a second rounded square would double-round the corners, and a transparent icon would composite onto black.",
  },
  {
    file: versioned("icon-192", "png"),
    size: 192,
    tile: "rounded",
    markScale: 1,
    opaque: false,
    purpose: "any",
    why: "The manifest's minimum required `any` icon (Android launcher, install prompt).",
  },
  {
    file: versioned("icon-512", "png"),
    size: 512,
    tile: "rounded",
    markScale: 1,
    opaque: false,
    purpose: "any",
    why: "The manifest's large `any` icon (splash screens, install dialogs, store surfaces).",
  },
  {
    file: versioned("icon-maskable-192", "png"),
    size: 192,
    tile: "square",
    markScale: maskableMarkScale(),
    opaque: true,
    purpose: "maskable",
    why: "Adaptive-icon source at launcher size. Full-bleed opaque background; the mark is scaled into the 40%-radius safe zone so no circle/rounded-square/squircle mask can clip it.",
  },
  {
    file: versioned("icon-maskable-512", "png"),
    size: 512,
    tile: "square",
    markScale: maskableMarkScale(),
    opaque: true,
    purpose: "maskable",
    why: "Adaptive-icon source at full size, for platforms that rescale it themselves.",
  },
];

/** The distributed vector artwork (the canonical geometry's SVG rendering). */
export const SVG_ASSET = {
  file: versioned("dalyhub-mark", "svg"),
  why: "Scalable browser icon (`<link rel=icon type=image/svg+xml>`) and the human-readable rendering of the canonical geometry.",
};

/**
 * The generated TypeScript module the in-application `BrandMark` renders.
 *
 * Generated, not hand-copied, and that is the point: the sidebar glyph and the
 * home-screen tile are then literally the same drawing, and `icons:check` fails if
 * one is regenerated without the other. It carries the MARK ONLY — no tile —
 * because a 22%-rounded square at 22 px reads as a smudge, and the brief allows
 * the in-app form to drop the tile.
 */
export const BRAND_MARK_MODULE = {
  file: "app/shared/icons/brand-mark.generated.ts",
  why: "The in-application BrandMark's geometry, generated from the same canonical source as the icon files.",
};

/**
 * Every repository-relative path the icon system owns.
 * @returns {string[]}
 */
export function generatedIconPaths() {
  return [
    FAVICON_PATH,
    BRAND_MARK_MODULE.file,
    `${ICON_DIRECTORY}/${SVG_ASSET.file}`,
    ...PNG_ASSETS.map((asset) => `${ICON_DIRECTORY}/${asset.file}`),
  ];
}

/**
 * The public URL a generated icon file is served from.
 * @param {string} file
 * @returns {string}
 */
export function iconUrl(file) {
  return `/${ICON_DIRECTORY.replace(/^public\//, "")}/${file}`;
}
