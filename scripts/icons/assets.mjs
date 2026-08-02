/**
 * PWA-01 — the declarative list of every DalyHub icon asset.
 *
 * ONE list, consumed by three things that must never disagree:
 *   - `scripts/generate-icons.mjs`, which produces the files;
 *   - `test/unit/pwa/icon-assets.test.ts`, which asserts every declared file
 *     exists, is a real PNG/ICO of the declared size, and is byte-identical to a
 *     fresh regeneration;
 *   - `test/unit/pwa/manifest.test.ts`, which asserts the web app manifest
 *     declares exactly the icons that exist.
 *
 * Adding a size means adding one entry here. Nothing reads a directory listing and
 * guesses.
 */

import { maskableMarkScale } from "./geometry.mjs";

/** Where generated assets live, relative to the repository root. */
export const ICON_DIRECTORY = "public/icons";

/** The favicon `.ico`, which by convention sits at the client root. */
export const FAVICON_PATH = "public/favicon.ico";

/** The sizes packed into `favicon.ico`. */
export const FAVICON_ICO_SIZES = [16, 32, 48];

/**
 * Every generated PNG.
 *
 * `tile`      — `rounded` draws DalyHub's own 22% rounded square with transparent
 *               corners; `square` is full-bleed and opaque.
 * `markScale` — the hub's scale about the centre (the maskable icon shrinks the
 *               mark into the W3C 40%-radius safe zone).
 * `opaque`    — flatten onto the tile colour so the PNG carries no alpha at all.
 */
export const PNG_ASSETS = [
  {
    file: "icon-16.png",
    size: 16,
    tile: "rounded",
    markScale: 1,
    opaque: false,
    purpose: "any",
    why: "Browser tab favicon at 1× — the size the mark is designed from.",
  },
  {
    file: "icon-32.png",
    size: 32,
    tile: "rounded",
    markScale: 1,
    opaque: false,
    purpose: "any",
    why: "Browser tab favicon at 2×, and the Windows taskbar/bookmark size.",
  },
  {
    file: "icon-48.png",
    size: 48,
    tile: "rounded",
    markScale: 1,
    opaque: false,
    purpose: "any",
    why: "Packed into favicon.ico for Windows shortcut and legacy surfaces.",
  },
  {
    file: "apple-touch-icon.png",
    size: 180,
    tile: "square",
    markScale: 1,
    opaque: true,
    purpose: "apple-touch-icon",
    why: "iOS/iPadOS home screen. Full-bleed and OPAQUE: iOS applies its own mask, so a second rounded square would double-round the corners, and a transparent icon would composite onto black.",
  },
  {
    file: "icon-192.png",
    size: 192,
    tile: "rounded",
    markScale: 1,
    opaque: false,
    purpose: "any",
    why: "The manifest's minimum required `any` icon (Android launcher, install prompt).",
  },
  {
    file: "icon-512.png",
    size: 512,
    tile: "rounded",
    markScale: 1,
    opaque: false,
    purpose: "any",
    why: "The manifest's large `any` icon (splash screens, install dialogs, store surfaces).",
  },
  {
    file: "icon-maskable-192.png",
    size: 192,
    tile: "square",
    markScale: maskableMarkScale(),
    opaque: true,
    purpose: "maskable",
    why: "Adaptive-icon source at launcher size. Full-bleed opaque background; the mark is scaled into the 40%-radius safe zone so no circle/rounded-square/squircle mask can clip it.",
  },
  {
    file: "icon-maskable-512.png",
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
  file: "dalyhub-mark.svg",
  why: "Scalable browser icon (`<link rel=icon type=image/svg+xml>`) and the human-readable rendering of the canonical geometry.",
};
