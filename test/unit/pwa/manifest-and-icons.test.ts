/**
 * PWA-01 — the manifest, the document metadata and the icon assets.
 *
 * These read the REAL committed files rather than a fixture, because the failure
 * they exist to catch is "the manifest points at an icon nobody generated" —
 * which a fixture would never notice, and which makes DalyHub silently
 * uninstallable in production.
 *
 * The icon test regenerates every asset from the canonical geometry in memory and
 * compares bytes. That is what keeps "committed" and "generated" the same thing,
 * and it is why a hand-edited PNG cannot survive review.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildIconAssets } from "../../../scripts/generate-icons.mjs";
import {
  FAVICON_ICO_SIZES,
  ICON_DIRECTORY,
  PNG_ASSETS,
  SVG_ASSET,
} from "../../../scripts/icons/assets.mjs";

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

describe("the web app manifest", () => {
  it("names DalyHub and describes it", () => {
    expect(manifest.name).toBe("DalyHub");
    expect(manifest.short_name).toBe("DalyHub");
    expect(manifest.description.length).toBeGreaterThan(20);
  });

  it("declares a stable application identifier", () => {
    // `id` is what keeps an installed app the SAME app across a `start_url`
    // change; without it the browser treats a changed start URL as a new app.
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
      .map(
        (asset: { file: string }) =>
          `/${ICON_DIRECTORY.replace("public/", "")}/${asset.file}`,
      );
    for (const src of shouldBeDeclared) {
      expect(declared.has(src)).toBe(true);
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
    expect(rootTsx).toMatch(/rel="icon" href="\/favicon\.ico"/);
    expect(rootTsx).toMatch(/rel="apple-touch-icon"/);
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

  it("declares a theme colour, deferring to the OS ONLY for `system`", () => {
    // `system` is the one preference that genuinely defers the choice, so it is
    // the one that emits a media pair. Every other theme is resolved server-side
    // and gets a single value, because a media query there would let the OS
    // contradict the owner's explicit choice — and would reintroduce the
    // `prefers-color-scheme` that THEME-01's first-paint test forbids.
    expect(rootTsx).toMatch(/name="theme-color"/);
    expect(rootTsx).toMatch(/media="\(prefers-color-scheme: light\)"/);
    expect(rootTsx).toMatch(/media="\(prefers-color-scheme: dark\)"/);
    expect(rootTsx).toMatch(/theme === "system"/);
  });

  it("keeps every theme's chrome colour equal to that theme's background", () => {
    // `theme-color` is read before any stylesheet is parsed, so it cannot
    // reference a custom property and the value has to be duplicated in
    // `root.tsx`. This is the guard that stops the duplicate drifting from
    // `tokens.css`, which is the source of truth.
    const tokens = read("app/styles/tokens.css").toString("utf8");
    const rootBackground = /^:root \{(?:[\s\S]*?)\n\}/m
      .exec(tokens)?.[0]
      .match(/--dh-color-surface-page:\s*([^;]+);/)?.[1]
      .trim();
    expect(rootBackground).toBeTruthy();

    for (const theme of [
      "daly-dark",
      "modern-light",
      "modern-dark",
      "eucalypt",
      "coastal",
      "ember",
    ]) {
      const block = new RegExp(
        `:root\\[data-theme="${theme}"\\]\\s*\\{([\\s\\S]*?)\\n\\}`,
      ).exec(tokens)?.[1];
      expect(block, `${theme} must exist in tokens.css`).toBeTruthy();
      const background = block
        ?.match(/--dh-color-surface-page:\s*([^;]+);/)?.[1]
        ?.trim();
      // A theme with no background of its own inherits `:root`'s.
      const expected = background ?? rootBackground;
      expect(
        rootTsx,
        `root.tsx must carry ${theme}'s chrome colour ${expected}`,
      ).toContain(expected as string);
    }
  });

  it("keeps `viewport-fit=cover`, so safe-area insets resolve in standalone mode", () => {
    expect(rootTsx).toMatch(/viewport-fit=cover/);
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
    expect(svg).toMatch(/viewBox="0 0 512 512"/);
    expect(svg).toMatch(/<title>DalyHub<\/title>/);
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

  it("keeps the Apple touch icon opaque", () => {
    // iOS composites a transparent icon onto black, which would put a dark ring
    // around the tile. The generator flattens it; this proves it stayed flat.
    const apple = PNG_ASSETS.find(
      (asset: { file: string }) => asset.file === "apple-touch-icon.png",
    ) as { opaque: boolean; tile: string; size: number };
    expect(apple.opaque).toBe(true);
    expect(apple.tile).toBe("square");
    expect(apple.size).toBe(180);
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
      // Scaled INTO the safe zone: at scale 1 the mark reaches 198/512 ≈ 38.7%
      // of the width, and the target is 36%.
      expect(asset.markScale).toBeLessThan(1);
    }
  });
});
