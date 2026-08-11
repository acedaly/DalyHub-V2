/**
 * APPEARANCE-01 / THEME-01 — the cascade that turns two root attributes into
 * colour.
 *
 * There is no JavaScript in this path at all: the server writes two attributes
 * and the stylesheet decides everything else. That makes the CASCADE the feature,
 * and these assertions are what stop a future regeneration from quietly breaking
 * a combination nobody looks at — an explicit Light on a dark device, an explicit
 * Dark that only half-applies, or a scheme whose dark block loses to the default
 * scheme's.
 *
 * The appearance states, and what must paint:
 *
 *   data-appearance   device      paints
 *   ───────────────   ─────────   ──────
 *   system            light       light   (the scheme's light block)
 *   system            dark        dark    (the media query)
 *   light             dark        LIGHT   (the media query must not match)
 *   dark              light       DARK    (the explicit block)
 *
 * And the scheme states: five schemes × those four, plus the two that only a
 * cascade can get wrong — a document with NO `data-color-scheme`, and a document
 * carrying one nobody recognises.
 */

import { readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  GENERATED_SCHEME_KEYS,
  DEFAULT_SCHEME_KEY,
  darkSchemeTokens,
  explicitDarkSchemeTokens,
  explicitLightBlock,
  generatedSection,
  lightSchemeTokens,
  parseDeclarations,
  readAppFile,
  schemeDarkTokens,
  schemeExplicitDarkTokens,
  schemeLightTokens,
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
    // The `:not()` is the whole mechanism: a bare `:root` rule would let a dark
    // device override an owner who explicitly asked for Light. Asserted for every
    // scheme, because each has its own rule inside the media query.
    const section = generatedSection();
    const media = section.slice(
      section.indexOf("@media (prefers-color-scheme: dark)"),
    );
    for (const scheme of GENERATED_SCHEME_KEYS) {
      expect(media).toContain(
        `:root[data-color-scheme="${scheme}"]:not([data-appearance="light"])`,
      );
    }
    // …and nothing inside the media query matches on appearance alone.
    expect(media).not.toMatch(
      /@media \(prefers-color-scheme: dark\) \{\s*:root \{/,
    );
    expect(media).not.toContain(':root:not([data-appearance="light"]) {');
  });

  it("gives an explicit Dark exactly the same declarations as the device dark", () => {
    // Two blocks carrying the same values is the price of plain CSS having no way
    // to share a declaration list between a media query and a selector. What must
    // never happen is the two DRIFTING, which would make an explicit Dark a
    // different, half-painted appearance — in any scheme.
    for (const scheme of GENERATED_SCHEME_KEYS) {
      const fromDevice = schemeDarkTokens(scheme);
      const explicit = schemeExplicitDarkTokens(scheme);
      expect(explicit.size, `${scheme}: block sizes differ`).toBe(
        fromDevice.size,
      );
      for (const [name, value] of fromDevice) {
        expect(explicit.get(name), `${scheme}: --${name}`).toBe(value);
      }
    }
    // The default scheme's accessors are the no-argument ones the older tests use.
    expect(explicitDarkSchemeTokens().size).toBe(darkSchemeTokens().size);
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

    for (const scheme of GENERATED_SCHEME_KEYS) {
      const start = section.indexOf(
        `:root[data-color-scheme="${scheme}"][data-appearance="dark"]`,
      );
      expect(start, `${scheme}: no explicit dark block`).toBeGreaterThan(-1);
      expect(section.slice(start, start + 4000)).toContain(
        "color-scheme: dark;",
      );
    }
  });

  it("orders the explicit blocks AFTER the media query, so they win", () => {
    // Each explicit-dark selector and its media-query twin are both (0,3,0).
    // Equal specificity means SOURCE ORDER decides, so an explicit Dark on a dark
    // device must come last or it would be a no-op that happens to look right.
    const section = generatedSection();
    const media = section.indexOf("@media (prefers-color-scheme: dark)");
    expect(section.indexOf('[data-appearance="dark"]')).toBeGreaterThan(media);
    expect(section.indexOf('[data-appearance="light"]')).toBeGreaterThan(media);
  });

  it("adds no appearance RULE outside the generated markers", () => {
    // The appearance blocks are GENERATED. A hand-written override for one
    // appearance is exactly the drift `pnpm run scheme:check` exists to catch.
    // Comments are stripped first: the prose in this file discusses the
    // attribute, and prose is not a rule.
    const outside = withoutComments(tokensCss.replace(generatedSection(), ""));
    expect(outside).not.toContain("data-appearance");
  });

  it("selects on the appearance and scheme attributes, never on a theme attribute", () => {
    // ADR-074's token architecture stands, and THEME-01 extended it rather than
    // reinstating the retired `data-theme` palette mechanism: the schemes are
    // GENERATED over the same roles, and no module rule branches on one.
    expect(withoutComments(tokensCss)).not.toContain("data-theme");
    expect(withoutComments(tokensCss)).toContain("data-appearance");
    expect(withoutComments(tokensCss)).toContain("data-color-scheme");
  });
});

describe("THEME-01 — the colour-scheme cascade in tokens.css", () => {
  it("gives every scheme a complete light block and two complete dark blocks", () => {
    // "Complete" is the point: a scheme that defined only the roles it wanted to
    // change would inherit the rest from whichever block happened to precede it,
    // which is the "Electric quietly has no primary-container" failure THEME-01
    // rules out.
    const reference = schemeLightTokens(DEFAULT_SCHEME_KEY);
    expect(reference.size).toBeGreaterThan(100);
    for (const scheme of GENERATED_SCHEME_KEYS) {
      for (const [label, block] of [
        ["light", schemeLightTokens(scheme)],
        ["device dark", schemeDarkTokens(scheme)],
        ["explicit dark", schemeExplicitDarkTokens(scheme)],
      ] as const) {
        expect(block.size, `${scheme} ${label}: token count`).toBe(
          reference.size,
        );
        for (const name of reference.keys()) {
          expect(block.get(name), `${scheme} ${label}: --${name}`).toBeTruthy();
        }
      }
    }
  });

  it("makes the DEFAULT scheme the bare :root, so an unknown value falls back to it", () => {
    // The safe fallback is a property of the cascade rather than a runtime check:
    // `data-color-scheme="chartreuse"` matches no scheme block, so the document is
    // painted by the base `:root` — which is Daly Violet, fully.
    const section = generatedSection();
    expect(section).not.toContain(
      `:root[data-color-scheme="${DEFAULT_SCHEME_KEY}"] {`,
    );
    const base = section.slice(section.indexOf(":root {"));
    expect(base).toContain("--md-sys-color-primary:");
  });

  it("paints a document with NO scheme attribute in the default scheme, in dark too", () => {
    // The light half is the bare `:root`. The dark half needs its own clause,
    // because `:root[data-color-scheme="violet"]` cannot match a document that
    // carries no attribute at all — `/offline` before the cookie is mirrored, a
    // root error boundary, a test harness rendering the stylesheet alone.
    const section = generatedSection();
    expect(section).toContain(
      ':root:not([data-color-scheme]):not([data-appearance="light"])',
    );
    expect(section).toContain(
      ':root:not([data-color-scheme])[data-appearance="dark"]',
    );
  });

  it("gives every scheme dark selector two attribute clauses, so it outranks the light blocks", () => {
    // A light block is (0,2,0) — `:root` plus one attribute. Every dark selector
    // carries a second clause, making it (0,3,0), so dark wins on SPECIFICITY
    // rather than on the order in which the schemes happen to be emitted. That is
    // what stops "Electric on a dark device" resolving to Electric light.
    const section = generatedSection();
    for (const match of section.matchAll(
      /:root(\[data-color-scheme="[a-z]+"\]|:not\(\[data-color-scheme\]\))([^{,\s]*)/g,
    )) {
      const [selector, , rest] = match;
      if (rest === "") continue; // a light block: one clause, by design
      expect(
        rest.startsWith(':not([data-appearance="light"])') ||
          rest.startsWith('[data-appearance="dark"]'),
        `unexpected scheme selector: ${selector}`,
      ).toBe(true);
    }
  });

  it("actually paints each scheme differently", () => {
    // Five schemes that resolved to the same primary would satisfy every
    // structural assertion above and be a single scheme wearing five names.
    for (const appearance of ["light", "dark"] as const) {
      const primaries = GENERATED_SCHEME_KEYS.map((scheme) =>
        (appearance === "light"
          ? schemeLightTokens(scheme)
          : schemeDarkTokens(scheme)
        ).get("md-sys-color-primary"),
      );
      expect(
        new Set(primaries).size,
        `${appearance}: ${primaries.join(" ")}`,
      ).toBe(GENERATED_SCHEME_KEYS.length);
    }
  });

  it("publishes every scheme's preview colours in every block", () => {
    // The Settings picker draws five swatch rows at once, four of which offer a
    // scheme that is NOT painting. No `var(--md-sys-color-primary)` can express
    // that, so the generator emits each scheme's three preview colours into every
    // block, in that block's appearance.
    for (const block of [
      schemeLightTokens("electric"),
      schemeDarkTokens("graphite"),
      schemeExplicitDarkTokens("pulse"),
      lightSchemeTokens(),
    ]) {
      for (const scheme of GENERATED_SCHEME_KEYS) {
        for (const slot of ["primary", "secondary", "tertiary"]) {
          expect(
            block.get(`md-app-color-preview-${scheme}-${slot}`),
            `--md-app-color-preview-${scheme}-${slot}`,
          ).toMatch(/^#[0-9a-f]{6}$/);
        }
      }
    }
  });

  it("shows each scheme its OWN colours in the preview tokens", () => {
    // The preview for scheme X must be X's primary, not the active scheme's — the
    // whole reason these tokens exist.
    for (const scheme of GENERATED_SCHEME_KEYS) {
      const own = schemeLightTokens(scheme);
      expect(own.get(`md-app-color-preview-${scheme}-primary`)).toBe(
        own.get("md-sys-color-primary"),
      );
      // …and read from a DIFFERENT scheme's block it is still X's primary.
      const elsewhere = schemeLightTokens("ocean");
      expect(elsewhere.get(`md-app-color-preview-${scheme}-primary`)).toBe(
        own.get("md-sys-color-primary"),
      );
    }
  });

  it("keeps the preview tokens in step with the appearance being painted", () => {
    // A light block carries the light previews and a dark block the dark ones, so
    // the picker is honest in both appearances without a media query of its own.
    const light = lightSchemeTokens();
    const dark = darkSchemeTokens();
    for (const scheme of GENERATED_SCHEME_KEYS) {
      expect(light.get(`md-app-color-preview-${scheme}-primary`)).not.toBe(
        dark.get(`md-app-color-preview-${scheme}-primary`),
      );
      expect(dark.get(`md-app-color-preview-${scheme}-primary`)).toBe(
        schemeDarkTokens(scheme).get("md-sys-color-primary"),
      );
    }
  });

  it("lets NO module stylesheet branch on the active colour scheme", () => {
    /*
     * The load-bearing architectural rule (THEME-01 §28, DESIGN_SYSTEM.md).
     *
     * A scheme is token substitution, full stop. The moment a module says
     * `[data-color-scheme="electric"] .projects-card { … }`, five schemes stop
     * being five palettes and start being five stylesheets — which is the thing
     * ADR-074 retired and this work deliberately did not reinstate.
     *
     * The ONE exception is the scheme PICKER, which must draw four schemes that
     * are not active and therefore cannot use a semantic token. It selects on
     * `[data-scheme]` (the row's offer), never on `[data-color-scheme]` (the
     * document's state), so the two are distinguishable by grep as well as by
     * argument.
     */
    const offenders: string[] = [];
    const styles = readStyleFiles();
    for (const [file, text] of styles) {
      if (file === "styles/tokens.css") continue;
      if (withoutComments(text).includes("data-color-scheme")) {
        offenders.push(file);
      }
    }
    expect(
      offenders,
      `these stylesheets branch on the active colour scheme: ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});

/** Every stylesheet under `app/styles`, as `[appRelativePath, text]`. */
function readStyleFiles(): readonly (readonly [string, string])[] {
  return readdirSync(path.join(process.cwd(), "app", "styles"))
    .filter((name) => name.endsWith(".css"))
    .map((name) => [`styles/${name}`, readAppFile(`styles/${name}`)] as const);
}
