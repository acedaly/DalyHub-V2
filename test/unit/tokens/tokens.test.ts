/**
 * DS-01 — token system structural guarantees.
 *
 * These tests treat `app/styles/tokens.css` as the authoritative source and
 * enforce the DS-01 acceptance criteria: every required semantic token exists,
 * the light and dark maps are complete and in parity, the TS colour data mirrors
 * the CSS, no application code references an undefined token, and the theme
 * mechanism (system/light/dark + prefers-color-scheme + reduced-motion) is
 * preserved.
 */

import { readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  BREAKPOINTS,
  COLOR_TOKEN_NAMES,
  REQUIRED_TOKEN_NAMES,
} from "~/shared/tokens";
import { darkTheme, lightTheme } from "~/shared/tokens/theme-colors";

import {
  allDefinedTokenNames,
  darkExplicitTokens,
  darkSystemTokens,
  lightTokens,
  readAppFile,
  tokensCss,
} from "./token-css";

describe("DS-01 required tokens", () => {
  const light = lightTokens();

  it("defines every required semantic token in the light (:root) map", () => {
    for (const name of REQUIRED_TOKEN_NAMES) {
      expect(light.has(name), `missing token --${name}`).toBe(true);
    }
  });

  it("defines a value for every colour token", () => {
    for (const name of COLOR_TOKEN_NAMES) {
      const value = light.get(`dh-color-${name}`);
      expect(value, `--dh-color-${name} must have a value`).toBeTruthy();
    }
  });

  it("keeps breakpoint tokens in sync with the TS scale", () => {
    // The CSS mirrors rem breakpoints; the TS scale is px. 1rem = 16px.
    const remToPx = (rem: string) => Math.round(parseFloat(rem) * 16);
    expect(remToPx(light.get("dh-breakpoint-sm")!)).toBe(BREAKPOINTS.sm);
    expect(remToPx(light.get("dh-breakpoint-md")!)).toBe(BREAKPOINTS.md);
    expect(remToPx(light.get("dh-breakpoint-lg")!)).toBe(BREAKPOINTS.lg);
    expect(remToPx(light.get("dh-breakpoint-xl")!)).toBe(BREAKPOINTS.xl);
    expect(remToPx(light.get("dh-breakpoint-2xl")!)).toBe(BREAKPOINTS["2xl"]);
  });
});

describe("DS-01 light & dark theme maps", () => {
  const light = lightTokens();
  const darkExplicit = darkExplicitTokens();
  const darkSystem = darkSystemTokens();

  it("remaps every colour token in both dark blocks", () => {
    for (const name of COLOR_TOKEN_NAMES) {
      const token = `dh-color-${name}`;
      expect(
        darkExplicit.has(token),
        `dark[data-theme] missing --${token}`,
      ).toBe(true);
      expect(darkSystem.has(token), `dark(system) missing --${token}`).toBe(
        true,
      );
    }
  });

  it("keeps the two dark blocks byte-identical (parity)", () => {
    expect(Object.fromEntries(darkSystem)).toEqual(
      Object.fromEntries(darkExplicit),
    );
  });

  it("actually changes colour values between light and dark", () => {
    // Sanity: a theme map that equals the light map would be a mistake.
    expect(darkExplicit.get("dh-color-bg")).not.toBe(light.get("dh-color-bg"));
    expect(darkExplicit.get("dh-color-text")).not.toBe(
      light.get("dh-color-text"),
    );
  });
});

describe("DS-01 TS colour data mirrors the CSS", () => {
  const light = lightTokens();
  const darkExplicit = darkExplicitTokens();

  it("light theme-colors match the :root map exactly", () => {
    for (const name of COLOR_TOKEN_NAMES) {
      expect(light.get(`dh-color-${name}`)).toBe(lightTheme[name]);
    }
  });

  it("dark theme-colors match the dark map exactly", () => {
    for (const name of COLOR_TOKEN_NAMES) {
      expect(darkExplicit.get(`dh-color-${name}`)).toBe(darkTheme[name]);
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
      expect(
        defined.has(token),
        `undefined token --${token} used in ${file}`,
      ).toBe(true);
    }
  });
});

describe("DS-01 theme mechanism preserved", () => {
  it("keeps the system/light/dark selectors and prefers-color-scheme", () => {
    expect(tokensCss).toContain(':root[data-theme="dark"]');
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
