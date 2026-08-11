/**
 * BRAND-01 — the manifest, the document metadata and the icon assets.
 *
 * These read the REAL committed files rather than a fixture, because the failure
 * they exist to catch is "the manifest points at an icon nobody generated" —
 * which a fixture would never notice, and which makes DalyHub silently
 * uninstallable in production.
 *
 * The icon test regenerates every asset from the canonical geometry in memory and
 * compares bytes. That is what keeps "committed" and "generated" the same thing,
 * and it is why a hand-edited PNG cannot survive review.
 *
 * BRAND-01 added the checks that the icon system's GENERATION is applied
 * consistently: every declared name carries `ICON_VERSION`, every surface that
 * names an icon names one the generator produces, and nothing from a superseded
 * generation is still in `public/icons` to be served.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { buildIconAssets } from "../../../scripts/generate-icons.mjs";
import {
  BRAND_MARK_MODULE,
  FAVICON_ICO_SIZES,
  ICON_DIRECTORY,
  ICON_VERSION,
  PNG_ASSETS,
  SVG_ASSET,
  iconUrl,
} from "../../../scripts/icons/assets.mjs";
import {
  CANVAS,
  GRADIENT_END_COLOUR,
  GRADIENT_START_COLOUR,
  MARK_COLOUR,
  MASKABLE_SAFE_RADIUS_RATIO,
  markReach,
  maskableMarkScale,
} from "../../../scripts/icons/geometry.mjs";
import {
  COLOR_SCHEME_PALETTES,
  DARK_SCHEME,
  GENERATED_COLOR_SCHEMES,
  LIGHT_SCHEME,
} from "~/shared/tokens";

const ROOT = join(import.meta.dirname, "..", "..", "..");

function read(relativePath: string): Buffer {
  return readFileSync(join(ROOT, relativePath));
}

const manifest = JSON.parse(
  read("public/manifest.webmanifest").toString("utf8"),
) as {
  id: string;
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: string;
  display_override: string[];
  orientation: string;
  theme_color: string;
  background_color: string;
  icons: { src: string; sizes: string; type: string; purpose: string }[];
};

const rootTsx = read("app/root.tsx").toString("utf8");
const serviceWorkerPlugin = read("vite-plugins/service-worker.ts").toString(
  "utf8",
);
const serviceWorkerTemplate = read("vite-plugins/sw-template.js").toString(
  "utf8",
);

describe("the web app manifest", () => {
  it("names DalyHub and describes it", () => {
    expect(manifest.name).toBe("DalyHub");
    expect(manifest.short_name).toBe("DalyHub");
    expect(manifest.description.length).toBeGreaterThan(20);
  });

  it("declares a stable application identifier", () => {
    // `id` is what keeps an installed app the SAME app across a `start_url`
    // change; without it the browser treats a changed start URL as a new app.
    // It is deliberately NOT versioned with the icons: a new icon generation
    // must not turn the installed DalyHub into a different application.
    expect(manifest.id).toBe("/");
  });

  it("scopes the app to the whole origin and starts at the root", () => {
    expect(manifest.scope).toBe("/");
    expect(manifest.start_url).toBe("/");
  });

  it("launches standalone, with a graceful fallback", () => {
    expect(manifest.display).toBe("standalone");
    expect(manifest.display_override).toContain("standalone");
    expect(manifest.display_override).toContain("minimal-ui");
  });

  it("does not lock the orientation, so it suits phone and desktop alike", () => {
    expect(manifest.orientation).toBe("any");
  });

  it("declares theme and background colours", () => {
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("declares the required installable icon sizes", () => {
    const anySizes = manifest.icons
      .filter((icon) => icon.purpose === "any" && icon.type === "image/png")
      .map((icon) => icon.sizes);
    expect(anySizes).toContain("192x192");
    expect(anySizes).toContain("512x512");
  });

  it("declares maskable icons at both adaptive sizes", () => {
    const maskable = manifest.icons.filter(
      (icon) => icon.purpose === "maskable",
    );
    expect(maskable.map((icon) => icon.sizes).sort()).toEqual([
      "192x192",
      "512x512",
    ]);
  });

  it("points at icons that actually exist on disk", () => {
    for (const icon of manifest.icons) {
      expect(icon.src.startsWith("/")).toBe(true);
      expect(() => read(join("public", icon.src))).not.toThrow();
    }
  });

  it("declares every generated PWA icon, so nothing is generated and forgotten", () => {
    const declared = new Set(manifest.icons.map((icon) => icon.src));
    const shouldBeDeclared = PNG_ASSETS.filter(
      (asset: { purpose: string }) =>
        asset.purpose === "any" || asset.purpose === "maskable",
    )
      // The favicon sizes are declared via <link>, not the manifest.
      .filter((asset: { size: number }) => asset.size >= 192)
      .map((asset: { file: string }) => iconUrl(asset.file));
    for (const src of shouldBeDeclared) {
      expect(declared.has(src)).toBe(true);
    }
  });

  it("names the CURRENT icon generation everywhere", () => {
    // A partial rename is the realistic failure: half the surfaces move to the
    // new mark and half keep serving the old one from a URL something already
    // cached. Every manifest icon must carry the generation.
    for (const icon of manifest.icons) {
      expect(icon.src, `${icon.src} must carry ${ICON_VERSION}`).toContain(
        `-${ICON_VERSION}.`,
      );
    }
  });
});

describe("the document metadata", () => {
  it("links the manifest WITH credentials", () => {
    // Load-bearing: DalyHub sits behind Cloudflare Access, and a manifest fetched
    // without credentials is redirected to the Access login, so the browser
    // concludes there is no manifest and offers no install.
    expect(rootTsx).toMatch(/rel="manifest"/);
    expect(rootTsx).toMatch(/crossOrigin="use-credentials"/);
  });

  it("links a favicon and an Apple touch icon", () => {
    expect(rootTsx).toMatch(/rel="icon" href="\/favicon\.ico\?v=\d+"/);
    expect(rootTsx).toMatch(/rel="apple-touch-icon"/);
  });

  it("references only icon files the generator actually produces", () => {
    // The real guard on a rename: pull every `/icons/...` reference out of the
    // root document and require each to be a generated asset. A stale href
    // fails here instead of 404ing on a device.
    const generated = new Set(
      [
        SVG_ASSET.file,
        ...PNG_ASSETS.map((asset: { file: string }) => asset.file),
      ].map((file: string) => iconUrl(file)),
    );
    const referenced = [...rootTsx.matchAll(/"(\/icons\/[^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(referenced.length).toBeGreaterThan(0);
    for (const href of referenced) {
      expect(generated.has(href), `${href} is not a generated asset`).toBe(
        true,
      );
    }
  });

  it("carries the icon generation on every icon URL, including the favicon", () => {
    // `favicon.ico` cannot be renamed — user agents fetch it from the origin
    // root unprompted — so it carries the generation as a query instead.
    expect(rootTsx).toContain(`/icons/dalyhub-mark-${ICON_VERSION}.svg`);
    expect(rootTsx).toContain(`/icons/apple-touch-icon-${ICON_VERSION}.png`);
    expect(rootTsx).toMatch(/href="\/favicon\.ico\?v=2"/);
  });

  it("declares standalone capability under both the standard and Apple names", () => {
    expect(rootTsx).toMatch(/name="mobile-web-app-capable"/);
    expect(rootTsx).toMatch(/name="apple-mobile-web-app-capable"/);
  });

  it("sets the Apple status-bar style, app title and application name", () => {
    expect(rootTsx).toMatch(/name="apple-mobile-web-app-status-bar-style"/);
    expect(rootTsx).toMatch(/name="apple-mobile-web-app-title"/);
    expect(rootTsx).toMatch(/name="application-name"/);
  });

  it("declares a theme colour for each scheme, and defers the choice to the OS", () => {
    // M3-01: there is one generated light/dark pair and no stored preference, so
    // the document always emits BOTH halves with a media attribute and lets the
    // OS pick. Nothing here is resolved server-side any more (ADR-074).
    expect(rootTsx).toMatch(/name="theme-color"/);
    expect(rootTsx).toMatch(/media="\(prefers-color-scheme: light\)"/);
    expect(rootTsx).toMatch(/media="\(prefers-color-scheme: dark\)"/);
  });

  it("takes each scheme's chrome colour from the generated scheme data", () => {
    // `theme-color` is read before any stylesheet is parsed, so it cannot
    // reference a custom property. Rather than duplicating a hex in `root.tsx`
    // and guarding the copy, the document imports the SAME generated module the
    // stylesheet is written alongside — so there is nothing left to drift.
    //
    // THEME-01 made that import the whole PALETTE TABLE rather than the default
    // scheme's two maps: the installed window's chrome has to continue the page
    // the owner actually chose, so it is looked up by the resolved scheme.
    expect(rootTsx).toContain('from "./shared/tokens"');
    expect(rootTsx).toContain("COLOR_SCHEME_PALETTES[colorScheme]");
    expect(rootTsx).toContain('palette.light["app-surface-page"]');
    expect(rootTsx).toContain('palette.dark["app-surface-page"]');
    for (const scheme of GENERATED_COLOR_SCHEMES) {
      expect(
        COLOR_SCHEME_PALETTES[scheme].light["app-surface-page"],
        `${scheme}: the two appearances must not share a page colour`,
      ).not.toBe(COLOR_SCHEME_PALETTES[scheme].dark["app-surface-page"]);
    }
    expect(LIGHT_SCHEME["app-surface-page"]).not.toBe(
      DARK_SCHEME["app-surface-page"],
    );
  });

  it("keeps `viewport-fit=cover`, so safe-area insets resolve in standalone mode", () => {
    expect(rootTsx).toMatch(/viewport-fit=cover/);
  });
});

describe("the service worker's icon precache", () => {
  it("names only icon files the generator produces", () => {
    // Both halves of the worker: the plugin's precache list, and the template's
    // own synthesised documents. The template names no icon today — its two
    // documents are deliberately subresource-free, which is what makes safe
    // mode survivable — so this is a standing guard rather than a live check: a
    // stale name added there would 404 on exactly the surface with no
    // connection to retry.
    const generated = new Set(
      [
        SVG_ASSET.file,
        ...PNG_ASSETS.map((asset: { file: string }) => asset.file),
      ].map((file: string) => iconUrl(file)),
    );
    const referenced = [
      ...serviceWorkerPlugin.matchAll(/"(\/icons\/[^"]+)"/g),
      ...serviceWorkerTemplate.matchAll(/"(\/icons\/[^"]+)"/g),
    ].map((match) => match[1]);
    expect(referenced.length).toBeGreaterThan(0);
    for (const url of referenced) {
      expect(generated.has(url), `${url} is not a generated asset`).toBe(true);
    }
  });

  it("precaches the icons an offline launch and an install actually need", () => {
    // The SVG (the browser icon), the 192 `any` (the install prompt) and the
    // Apple touch icon (the home-screen launch). Everything else is fetched on
    // demand by the platform, not by the page.
    expect(serviceWorkerPlugin).toContain(
      iconUrl(`dalyhub-mark-${ICON_VERSION}.svg`),
    );
    expect(serviceWorkerPlugin).toContain(
      iconUrl(`icon-192-${ICON_VERSION}.png`),
    );
    expect(serviceWorkerPlugin).toContain(
      iconUrl(`apple-touch-icon-${ICON_VERSION}.png`),
    );
    expect(serviceWorkerPlugin).toContain('"/favicon.ico"');
  });
});

/** Read a PNG's IHDR width/height. Cheap, and enough to prove the size. */
function pngDimensions(bytes: Buffer): { width: number; height: number } {
  expect(bytes.subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  expect(bytes.subarray(12, 16).toString("ascii")).toBe("IHDR");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/**
 * Decode one of OUR PNGs back to RGBA.
 *
 * Deliberately narrow: it understands exactly what `scripts/icons/png.mjs`
 * writes — colour type 6, bit depth 8, filter type 0 on every scanline, one
 * IDAT. That is enough to inspect real pixels (which is how the opacity and
 * transparency claims below are proved rather than asserted) without a decoder
 * dependency, and it fails loudly if the encoder ever starts writing something
 * else.
 */
function decodePng(bytes: Buffer): {
  width: number;
  height: number;
  pixels: Buffer;
} {
  const { width, height } = pngDimensions(bytes);
  expect(bytes.readUInt8(24)).toBe(8); // bit depth
  expect(bytes.readUInt8(25)).toBe(6); // colour type: truecolour + alpha
  const chunks: Buffer[] = [];
  let at = 8;
  while (at < bytes.length) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.subarray(at + 4, at + 8).toString("ascii");
    if (type === "IDAT") chunks.push(bytes.subarray(at + 8, at + 8 + length));
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    expect(raw.readUInt8(y * (stride + 1))).toBe(0); // filter: None
    raw.copy(pixels, y * stride, y * (stride + 1) + 1, (y + 1) * (stride + 1));
  }
  return { width, height, pixels };
}

/** WCAG 2.2 relative luminance of an `#rrggbb` colour. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((at) => {
    const value = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
    return value <= 0.03928
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** WCAG 2.2 contrast ratio between two `#rrggbb` colours. */
function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

/**
 * The tile gradient sampled at 1% steps, in sRGB — the same component-wise
 * interpolation the rasteriser and an SVG renderer both perform, so these are
 * the colours that actually get painted.
 */
function gradientRamp(): string[] {
  const parse = (hex: string) =>
    [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
  const from = parse(GRADIENT_START_COLOUR);
  const to = parse(GRADIENT_END_COLOUR);
  return Array.from({ length: 101 }, (_, step) => {
    const t = step / 100;
    return `#${from
      .map((channel, index) =>
        Math.round(channel + (to[index] - channel) * t)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")}`;
  });
}

describe("the icon assets", () => {
  it("exist at the declared size and are real PNGs", () => {
    for (const asset of PNG_ASSETS as readonly {
      file: string;
      size: number;
    }[]) {
      const bytes = read(join(ICON_DIRECTORY, asset.file));
      expect(pngDimensions(bytes)).toEqual({
        width: asset.size,
        height: asset.size,
      });
    }
  });

  it("include a favicon.ico packing the small sizes", () => {
    const ico = read("public/favicon.ico");
    expect(ico.readUInt16LE(0)).toBe(0); // reserved
    expect(ico.readUInt16LE(2)).toBe(1); // type: icon
    expect(ico.readUInt16LE(4)).toBe(FAVICON_ICO_SIZES.length);
    const declaredSizes = FAVICON_ICO_SIZES.map((_: number, index: number) =>
      ico.readUInt8(6 + index * 16),
    );
    expect(declaredSizes).toEqual([...FAVICON_ICO_SIZES]);
  });

  it("include a vector source that is committed and parseable", () => {
    const svg = read(join(ICON_DIRECTORY, SVG_ASSET.file)).toString("utf8");
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg).toMatch(new RegExp(`viewBox="0 0 ${CANVAS} ${CANVAS}"`));
    expect(svg).toMatch(/<title>DalyHub<\/title>/);
    // The approved identity, in the vector source: a gradient tile, a stroked
    // "D" arc, and the network's four discs.
    expect(svg).toContain("<linearGradient");
    expect(svg).toContain(GRADIENT_START_COLOUR);
    expect(svg).toContain(GRADIENT_END_COLOUR);
    expect(svg).toMatch(/<path d="M [\d.]+ [\d.]+ A /);
    expect(svg.match(/<circle /g) ?? []).toHaveLength(4);
  });

  // Rasterising every size at 16 samples per pixel is genuinely CPU-bound
  // (~10s), so this one test gets a real timeout rather than being weakened.
  it(
    "are EXACTLY what the canonical geometry generates",
    { timeout: 60_000 },
    () => {
      // The determinism guarantee. If this fails, either the geometry changed
      // without regenerating (`pnpm run icons:generate`) or an asset was edited by
      // hand — both of which would silently decouple the source from what ships.
      const generated = buildIconAssets() as Map<string, Buffer>;
      expect(generated.size).toBeGreaterThan(0);
      for (const [relativePath, bytes] of generated) {
        expect(
          read(relativePath).equals(bytes),
          `${relativePath} differs from the geometry's output`,
        ).toBe(true);
      }
    },
  );

  it("distribute NOTHING but the current generation", () => {
    // The superseded PWA-01 hub-and-spokes mark shipped as `icon-192.png`,
    // `dalyhub-mark.svg` and friends. A deployed Worker serves whatever is in
    // `public/`, so leaving those behind would keep the old icon reachable —
    // and an installed PWA that cached those URLs would keep showing it.
    const present = readdirSync(join(ROOT, ICON_DIRECTORY)).sort();
    const declared = [
      SVG_ASSET.file,
      ...PNG_ASSETS.map((asset: { file: string }) => asset.file),
    ].sort();
    expect(present).toEqual(declared);
    for (const file of present) {
      expect(file, `${file} must carry ${ICON_VERSION}`).toContain(
        `-${ICON_VERSION}.`,
      );
    }
  });

  it("keeps the Apple touch icon opaque", () => {
    // iOS composites a transparent icon onto black, which would put a dark ring
    // around the tile. The generator flattens it; this proves it stayed flat in
    // the DECLARATION and, below, in the actual bytes.
    const apple = PNG_ASSETS.find((asset: { file: string }) =>
      asset.file.startsWith("apple-touch-icon"),
    ) as { opaque: boolean; tile: string; size: number };
    expect(apple.opaque).toBe(true);
    expect(apple.tile).toBe("square");
    expect(apple.size).toBe(180);

    // The bytes, not the declaration: every pixel fully opaque, and the corners
    // painted (full-bleed) rather than cut away.
    const { width, height, pixels } = decodePng(
      read(join(ICON_DIRECTORY, `apple-touch-icon-${ICON_VERSION}.png`)),
    );
    expect({ width, height }).toEqual({ width: 180, height: 180 });
    let opaque = true;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] !== 255) {
        opaque = false;
        break;
      }
    }
    expect(opaque, "every Apple touch icon pixel must be fully opaque").toBe(
      true,
    );
  });

  it("keeps the maskable icons full-bleed to the corner pixel", () => {
    // A maskable icon is cropped by the platform, so a transparent or
    // differently-coloured corner shows up as a notch under a circle mask.
    for (const size of [192, 512]) {
      const { width, pixels } = decodePng(
        read(join(ICON_DIRECTORY, `icon-maskable-${size}-${ICON_VERSION}.png`)),
      );
      for (const corner of [
        0,
        (width - 1) * 4,
        width * (width - 1) * 4,
        (width * width - 1) * 4,
      ]) {
        expect(pixels[corner + 3], `${size}px corner must be opaque`).toBe(255);
      }
    }
  });

  it("keeps the rounded `any` tiles genuinely rounded", () => {
    // The counterpart claim: the `purpose: any` icons draw DalyHub's own 22%
    // rounded square, so their corner pixels must be transparent. If they were
    // not, a browser that composites the icon onto its own chrome would show a
    // square card behind the tile.
    const { pixels } = decodePng(
      read(join(ICON_DIRECTORY, `icon-512-${ICON_VERSION}.png`)),
    );
    expect(pixels[3]).toBe(0);
  });

  it("keeps the maskable icons full-bleed and inside the safe zone", () => {
    const maskable = (
      PNG_ASSETS as readonly {
        purpose: string;
        tile: string;
        opaque: boolean;
        markScale: number;
      }[]
    ).filter((asset) => asset.purpose === "maskable");
    expect(maskable).toHaveLength(2);
    for (const asset of maskable) {
      expect(asset.tile).toBe("square");
      expect(asset.opaque).toBe(true);
      expect(asset.markScale).toBe(maskableMarkScale());
    }
    // The safe-zone guarantee, measured rather than asserted: the furthest
    // painted pixel of the scaled mark from the centre, over the icon width,
    // must sit inside the W3C's guaranteed 40% radius. No circle, squircle or
    // rounded-square mask can clip what is inside it.
    const reachRatio = markReach(maskableMarkScale()) / CANVAS;
    expect(reachRatio).toBeLessThan(MASKABLE_SAFE_RADIUS_RATIO);
    expect(reachRatio).toBeCloseTo(0.36, 5);
    // ...and the unscaled mark genuinely needed shrinking, so this is a real
    // constraint rather than one that happens to hold.
    expect(markReach() / CANVAS).toBeGreaterThan(MASKABLE_SAFE_RADIUS_RATIO);
  });

  it("keeps the white mark legible against every point of the tile gradient", () => {
    // WCAG 2.2 §1.4.11 wants 3:1 for a graphical object. Sampled across the
    // whole ramp rather than at the two stops: "the extremes bound every point"
    // is TRUE for this gradient, but it is an argument, and an argument is what
    // a test is meant to replace.
    for (const colour of gradientRamp()) {
      expect(
        contrast(MARK_COLOUR, colour),
        `white on ${colour} must clear 3:1`,
      ).toBeGreaterThan(3);
    }
  });

  it("keeps the gradient mark legible on both the lightest and darkest chrome", () => {
    // The in-app mark is drawn straight onto the page canvas with no tile, so
    // the gradient itself has to hold against the palettes DalyHub ships. These
    // two are the extremes of `--md-app-color-surface-page` across both schemes.
    for (const canvas of ["#ecebe8", "#101215"]) {
      for (const colour of gradientRamp()) {
        expect(
          contrast(colour, canvas),
          `${colour} on ${canvas} must clear 3:1`,
        ).toBeGreaterThan(3);
      }
    }
  });
});

describe("the generated in-application mark", () => {
  const generated = read(BRAND_MARK_MODULE.file).toString("utf8");

  it("is committed, and is the SAME drawing as the icon files", () => {
    // Both come from `markShapes()`. If someone hand-edits one, `icons:check`
    // and the byte-equality test above fail together — which is the point.
    expect(generated).toContain("GENERATED FILE");
    expect(generated).toContain(
      `BRAND_MARK_VIEWBOX = "0 0 ${CANVAS} ${CANVAS}"`,
    );
    expect(generated).toContain(GRADIENT_START_COLOUR);
    expect(generated).toContain(GRADIENT_END_COLOUR);
  });

  it("carries the D's arc and the network's four discs, and no tile", () => {
    // Count inside the shape LIST; the type declaration above it also names
    // both kinds.
    const shapes = generated.slice(generated.indexOf("BRAND_MARK_SHAPES"));
    expect(shapes.match(/kind: "disc"/g) ?? []).toHaveLength(4);
    expect(generated).toMatch(/kind: "stroke", d: "M [\d.]+ [\d.]+ A /);
    // No rounded square: the in-app form is the bare glyph.
    expect(generated).not.toContain("roundedRect");
  });
});
