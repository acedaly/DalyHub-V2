/**
 * DS-01 / THEME-01 — token system structural guarantees.
 *
 * These tests treat `app/styles/tokens.css` as the authoritative source and enforce
 * the acceptance criteria for the theme system: every required semantic token
 * exists, EVERY curated theme defines EVERY colour token, the two dark blocks stay
 * in parity, the themes are genuinely different from one another, the TS colour data
 * mirrors the CSS, no application code references an undefined token, and the theme
 * mechanism (five themes + `system` + prefers-color-scheme + reduced motion) is
 * preserved.
 *
 * The theme list is never hard-coded here: it comes from the registry, so adding a
 * theme to the registry without adding its CSS block (or its TS map) fails.
 */

import { readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { THEME_IDS, type ThemeId } from "~/kernel/preferences/theme-preference";
import {
  BREAKPOINTS,
  COLOR_TOKEN_NAMES,
  ENTITY_ACCENT_NAMES,
  REQUIRED_TOKEN_NAMES,
  THEME_COLOR_MAPS,
  THEME_ENTITY_ACCENTS,
} from "~/shared/tokens";

import {
  allDefinedTokenNames,
  darkSystemTokens,
  effectiveThemeTokens,
  readAppFile,
  rootTokens,
  themeTokens,
  tokensCss,
} from "./token-css";

describe("DS-01 required tokens", () => {
  const root = rootTokens();

  it("defines every required semantic token in the base (:root) map", () => {
    for (const name of REQUIRED_TOKEN_NAMES) {
      expect(root.has(name), `missing token --${name}`).toBe(true);
    }
  });

  it("defines a value for every colour token", () => {
    for (const name of COLOR_TOKEN_NAMES) {
      const value = root.get(`dh-color-${name}`);
      expect(value, `--dh-color-${name} must have a value`).toBeTruthy();
    }
  });

  it("keeps breakpoint tokens in sync with the TS scale", () => {
    // The CSS mirrors rem breakpoints; the TS scale is px. 1rem = 16px.
    const remToPx = (rem: string) => Math.round(parseFloat(rem) * 16);
    expect(remToPx(root.get("dh-breakpoint-sm")!)).toBe(BREAKPOINTS.sm);
    expect(remToPx(root.get("dh-breakpoint-md")!)).toBe(BREAKPOINTS.md);
    expect(remToPx(root.get("dh-breakpoint-lg")!)).toBe(BREAKPOINTS.lg);
    expect(remToPx(root.get("dh-breakpoint-xl")!)).toBe(BREAKPOINTS.xl);
    expect(remToPx(root.get("dh-breakpoint-2xl")!)).toBe(BREAKPOINTS["2xl"]);
  });
});

describe("THEME-01 five curated themes", () => {
  it("ships at least five curated themes", () => {
    // The milestone's hard floor. A future release may add more; it may not drop
    // below five without changing this deliberately.
    expect(THEME_IDS.length).toBeGreaterThanOrEqual(5);
  });

  it("declares a stylesheet block for every registered theme", () => {
    for (const themeId of THEME_IDS) {
      expect(
        tokensCss.includes(`:root[data-theme="${themeId}"]`),
        `tokens.css has no block for theme "${themeId}"`,
      ).toBe(true);
    }
  });

  it("resolves every colour token in every theme", () => {
    for (const themeId of THEME_IDS) {
      const effective = effectiveThemeTokens(themeId);
      for (const name of COLOR_TOKEN_NAMES) {
        expect(
          effective.get(`dh-color-${name}`),
          `theme "${themeId}" does not resolve --dh-color-${name}`,
        ).toBeTruthy();
      }
    }
  });

  it("resolves every entity identity accent in every theme", () => {
    for (const themeId of THEME_IDS) {
      const effective = effectiveThemeTokens(themeId);
      for (const entity of ENTITY_ACCENT_NAMES) {
        expect(
          effective.get(`dh-entity-${entity}-accent`),
          `theme "${themeId}" does not resolve --dh-entity-${entity}-accent`,
        ).toBeTruthy();
      }
    }
  });

  it("declares a colour-scheme for every theme, so native controls follow it", () => {
    for (const themeId of THEME_IDS) {
      const block = themeTokens(themeId);
      const body = tokensCss.slice(
        tokensCss.indexOf(`:root[data-theme="${themeId}"]`),
      );
      // `themeTokens` only parses custom properties, so read `color-scheme`
      // from the raw block text.
      expect(
        /color-scheme:\s*(light|dark);/.test(body.slice(0, 400)),
        `theme "${themeId}" declares no color-scheme`,
      ).toBe(true);
      expect(block).toBeDefined();
    }
  });

  it("makes each theme genuinely distinct, not an accent recolour", () => {
    // Five themes that differ only in button colour would satisfy a naive
    // "five themes" count. These are the dimensions the milestone requires to
    // differ: the page background, the navigation surface, the card surface and
    // the accent.
    const dimensions = [
      "dh-color-bg",
      "dh-color-surface-nav",
      "dh-color-surface-card",
      "dh-color-accent",
      "dh-color-progress-fill",
    ] as const;

    const maps = THEME_IDS.map((id) => [id, effectiveThemeTokens(id)] as const);
    for (let i = 0; i < maps.length; i += 1) {
      for (let j = i + 1; j < maps.length; j += 1) {
        const [aId, a] = maps[i];
        const [bId, b] = maps[j];
        const differing = dimensions.filter(
          (token) => a.get(token) !== b.get(token),
        );
        expect(
          differing.length,
          `themes "${aId}" and "${bId}" differ in only ${differing.length} of the ${dimensions.length} required dimensions`,
        ).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it("gives every theme a distinct page background", () => {
    const backgrounds = THEME_IDS.map((id) =>
      effectiveThemeTokens(id).get("dh-color-bg"),
    );
    expect(new Set(backgrounds).size).toBe(THEME_IDS.length);
  });

  it("ships at least one fully supported dark theme", () => {
    const darkThemes = THEME_IDS.filter((id) => {
      const start = tokensCss.indexOf(`:root[data-theme="${id}"]`);
      return /color-scheme:\s*dark;/.test(tokensCss.slice(start, start + 400));
    });
    expect(darkThemes.length).toBeGreaterThanOrEqual(1);
    // …and it must be a real remap, not the base map with a dark colour-scheme.
    for (const id of darkThemes) {
      expect(themeTokens(id).size).toBeGreaterThan(COLOR_TOKEN_NAMES.length);
    }
  });
});

describe("THEME-01 dark block parity", () => {
  it("keeps the explicit and prefers-color-scheme dark blocks identical", () => {
    expect(Object.fromEntries(darkSystemTokens())).toEqual(
      Object.fromEntries(themeTokens("daly-dark")),
    );
  });

  it("actually changes colour values between light and dark", () => {
    const light = effectiveThemeTokens("daly-light");
    const dark = effectiveThemeTokens("daly-dark");
    expect(dark.get("dh-color-bg")).not.toBe(light.get("dh-color-bg"));
    expect(dark.get("dh-color-text")).not.toBe(light.get("dh-color-text"));
  });
});

describe("THEME-01 TS colour data mirrors the CSS", () => {
  it("has a TS colour map for every registered theme", () => {
    for (const themeId of THEME_IDS) {
      expect(
        THEME_COLOR_MAPS[themeId],
        `no TS colour map for theme "${themeId}"`,
      ).toBeDefined();
    }
    expect(Object.keys(THEME_COLOR_MAPS).sort()).toEqual([...THEME_IDS].sort());
  });

  it("matches every colour value in every theme", () => {
    for (const themeId of THEME_IDS) {
      const effective = effectiveThemeTokens(themeId);
      for (const name of COLOR_TOKEN_NAMES) {
        expect(
          effective.get(`dh-color-${name}`),
          `theme "${themeId}" token --dh-color-${name}`,
        ).toBe(THEME_COLOR_MAPS[themeId][name]);
      }
    }
  });

  it("matches every entity accent in every theme", () => {
    for (const themeId of THEME_IDS) {
      const effective = effectiveThemeTokens(themeId);
      for (const entity of ENTITY_ACCENT_NAMES) {
        expect(
          effective.get(`dh-entity-${entity}-accent`),
          `theme "${themeId}" accent --dh-entity-${entity}-accent`,
        ).toBe(THEME_ENTITY_ACCENTS[themeId][entity]);
      }
    }
  });
});

describe("DS-01 no consumer references an undefined token", () => {
  const defined = allDefinedTokenNames();

  const appDir = path.join(process.cwd(), "app");

  /** Recursively collect app source files that can reference tokens. */
  function collectSourceFiles(): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
        } else if (
          /\.(css|tsx?|ts)$/.test(entry) &&
          // The token registry itself CONSTRUCTS `var(--dh-color-<name>)`
          // dynamically; scanning it would flag the template prefix, not a real
          // undefined reference. It is the source of truth, not a consumer.
          !full.includes(`${path.sep}shared${path.sep}tokens${path.sep}`)
        ) {
          out.push(full);
        }
      }
    };
    walk(appDir);
    return out;
  }

  it("every var(--dh-*) used in app/ is defined in tokens.css", () => {
    const referenced = new Map<string, string>(); // token -> first file
    const re = /var\(\s*--(dh-[\w-]+)/g;
    for (const file of collectSourceFiles()) {
      const text = readAppFile(path.relative(appDir, file));
      let match: RegExpExecArray | null;
      while ((match = re.exec(text)) !== null) {
        if (!referenced.has(match[1])) {
          referenced.set(match[1], path.relative(process.cwd(), file));
        }
      }
    }

    // There must be real consumption, and none of it may be undefined.
    expect(referenced.size).toBeGreaterThan(0);
    for (const [token, file] of referenced) {
      // THEME-01: the theme PREVIEW is the one documented place that sets its own
      // custom properties inline (it must paint a theme it is not in), so
      // `--dh-preview-*` is defined by `ThemePreview`, not by tokens.css.
      if (token.startsWith("dh-preview-")) {
        continue;
      }
      expect(
        defined.has(token),
        `undefined token --${token} used in ${file}`,
      ).toBe(true);
    }
  });

  it("keeps the preview custom properties confined to the theme picker", () => {
    const offenders: string[] = [];
    for (const file of collectSourceFiles()) {
      const relative = path.relative(appDir, file);
      if (
        relative === path.join("shared", "shell", "ThemePreview.tsx") ||
        relative === path.join("styles", "theme-picker.css")
      ) {
        continue;
      }
      if (readAppFile(relative).includes("--dh-preview-")) {
        offenders.push(relative);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("THEME-01 no component branches on the theme", () => {
  /**
   * Components consume semantic tokens; they must never render differently per
   * theme. This scans application TSX for comparisons against a theme id, which is
   * the shape such a branch would take.
   */
  it("never compares a value against a theme id in application components", () => {
    const appDir = path.join(process.cwd(), "app");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.endsWith(".tsx")) continue;
        const relative = path.relative(appDir, full);
        // The picker legitimately names every theme: it renders the registry.
        if (
          relative === path.join("shared", "shell", "ThemePicker.tsx") ||
          relative === path.join("shared", "shell", "ThemePreview.tsx")
        ) {
          continue;
        }
        const text = readAppFile(relative);
        for (const themeId of THEME_IDS as readonly ThemeId[]) {
          if (
            text.includes(`=== "${themeId}"`) ||
            text.includes(`!== "${themeId}"`)
          ) {
            offenders.push(`${relative} branches on "${themeId}"`);
          }
        }
      }
    };
    walk(appDir);
    expect(offenders).toEqual([]);
  });
});

describe("THEME-01 theme mechanism preserved", () => {
  it("keeps a selector for every theme plus the system appearance mode", () => {
    for (const themeId of THEME_IDS) {
      expect(tokensCss).toContain(`:root[data-theme="${themeId}"]`);
    }
    expect(tokensCss).toContain(':root[data-theme="system"]');
    expect(tokensCss).toContain("@media (prefers-color-scheme: dark)");
    // `system` opts into both schemes so native controls follow the OS.
    expect(tokensCss).toMatch(
      /:root\[data-theme="system"\]\s*\{\s*color-scheme:\s*light dark;/,
    );
  });

  it("honours prefers-reduced-motion in the base styles", () => {
    const baseCss = readAppFile("styles/base.css");
    expect(baseCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(baseCss).toMatch(
      /transition-duration:\s*var\(--dh-duration-instant\)/,
    );
  });
});
