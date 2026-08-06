/**
 * APPEARANCE-01 — the cascade that turns `<html data-appearance>` into colour.
 *
 * There is no JavaScript in this path at all: the server writes one attribute and
 * the stylesheet decides everything else. That makes the CASCADE the feature, and
 * these assertions are what stop a future regeneration from quietly breaking a
 * combination nobody looks at — an explicit Light on a dark device, or an
 * explicit Dark that only half-applies.
 *
 * The four states, and what must paint:
 *
 *   data-appearance   device      paints
 *   ───────────────   ─────────   ──────
 *   system            light       light   (the base :root)
 *   system            dark        dark    (the media query)
 *   light             dark        LIGHT   (the media query must not match)
 *   dark              light       DARK    (the explicit block)
 */

import { describe, expect, it } from "vitest";

import {
  darkSchemeTokens,
  explicitDarkSchemeTokens,
  explicitLightBlock,
  generatedSection,
  lightSchemeTokens,
  parseDeclarations,
  tokensCss,
} from "./token-css";

/** CSS with every block comment removed, so prose is not read as a rule. */
function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("APPEARANCE-01 — the appearance cascade in tokens.css", () => {
  it("keeps light as the base scheme on a bare :root", () => {
    // No attribute, no media query: a document that has never chosen anything
    // (and a document rendered before the shell loader resolves) is still fully
    // painted.
    const light = lightSchemeTokens();
    expect(light.size).toBeGreaterThan(0);
    expect(light.get("md-sys-color-surface")).toBeTruthy();
  });

  it("applies dark from the device ONLY when Light was not chosen explicitly", () => {
    // The selector is the whole mechanism: `:root` would let a dark device
    // override an owner who explicitly asked for Light.
    const section = generatedSection();
    expect(section).toContain(':root:not([data-appearance="light"])');
    const media = section.slice(
      section.indexOf("@media (prefers-color-scheme: dark)"),
    );
    expect(media).not.toMatch(
      /@media \(prefers-color-scheme: dark\) \{\s*:root \{/,
    );
  });

  it("gives an explicit Dark exactly the same declarations as the device dark", () => {
    // Two blocks carrying the same values is the price of plain CSS having no way
    // to share a declaration list between a media query and a selector. What must
    // never happen is the two DRIFTING, which would make an explicit Dark a
    // different, half-painted appearance.
    const fromDevice = darkSchemeTokens();
    const explicit = explicitDarkSchemeTokens();
    expect(explicit.size).toBe(fromDevice.size);
    for (const [name, value] of fromDevice) {
      expect(explicit.get(name)).toBe(value);
    }
  });

  it("pins color-scheme to each effective appearance, for native controls", () => {
    // Scrollbars, form controls and the default canvas are painted by the
    // browser, not by our tokens. `color-scheme` is the only thing that tells it
    // which way to go, so an explicit choice has to pin it — otherwise a Light
    // page on a dark device gets dark scrollbars and dark native selects.
    const section = generatedSection();
    const base = parseDeclarations(
      section.slice(section.indexOf(":root {"), section.indexOf("@media")),
    );
    expect(tokensCss).toContain("color-scheme: light dark;");
    expect(base.size).toBeGreaterThan(0);

    expect(explicitLightBlock()).toContain("color-scheme: light;");

    const explicitDarkStart = section.indexOf(':root[data-appearance="dark"]');
    expect(explicitDarkStart).toBeGreaterThan(-1);
    expect(section.slice(explicitDarkStart)).toContain("color-scheme: dark;");
  });

  it("orders the explicit blocks AFTER the media query, so they win", () => {
    // `:root:not([data-appearance="light"])` and `:root[data-appearance="dark"]`
    // are both (0,2,0). Equal specificity means SOURCE ORDER decides, so an
    // explicit Dark on a dark device must come last or it would be a no-op that
    // happens to look right.
    const section = generatedSection();
    expect(section.indexOf('[data-appearance="dark"]')).toBeGreaterThan(
      section.indexOf("@media (prefers-color-scheme: dark)"),
    );
    expect(section.indexOf('[data-appearance="light"]')).toBeGreaterThan(
      section.indexOf("@media (prefers-color-scheme: dark)"),
    );
  });

  it("adds no appearance RULE outside the generated markers", () => {
    // The appearance blocks are GENERATED. A hand-written override for one
    // appearance is exactly the drift `pnpm run scheme:check` exists to catch.
    // Comments are stripped first: the prose in this file discusses the
    // attribute, and prose is not a rule.
    const outside = withoutComments(tokensCss.replace(generatedSection(), ""));
    expect(outside).not.toContain("data-appearance");
  });

  it("selects on the appearance attribute and never on a theme attribute", () => {
    // ADR-074 stands: one generated light/dark pair, no palettes, no `data-theme`.
    expect(withoutComments(tokensCss)).not.toContain("data-theme");
    expect(withoutComments(tokensCss)).toContain("data-appearance");
  });
});
