/**
 * DS-01 — the DalyHub semantic token layer and the density model.
 *
 * The layer's whole value is that it is the ONE vocabulary a component reaches
 * for, so the guarantees worth testing are about the vocabulary rather than
 * about any particular value:
 *
 *   - every published name exists, and every defined name is published, so the
 *     layer cannot grow a private half;
 *   - nothing in it is authored — every value resolves, through however many
 *     hops, onto an existing token, so the generator stays the single source of
 *     truth for colour;
 *   - nothing in it is named after another design language;
 *   - it is defined in `tokens.css` and nowhere else;
 *   - the three densities define exactly the same set, no more and no fewer;
 *   - the `default` density resolves to the value the application already
 *     painted before DS-01, which is what makes adopting a token a no-op;
 *   - a compact region can never cost a touch target on a touch pointer.
 */

import { describe, expect, it } from "vitest";

import {
  DALYHUB_DENSITIES,
  DALYHUB_DENSITY_TOKEN_NAMES,
  DALYHUB_TEXT_FACETS,
  DALYHUB_TEXT_ROLES,
  DALYHUB_TOKEN_NAMES,
} from "~/shared/tokens";

import {
  allDefinedTokenNames,
  allTokens,
  appRelative,
  appSourceFiles,
  blockBody,
  parseDeclarations,
  readAppFile,
  repoRelative,
  resolveTokenChain,
  tokensCss,
} from "./token-css";

/** The section of `tokens.css` that DS-01 owns, from its banner to the file's
 * end. Everything above it is machinery; everything in it is the product's own
 * vocabulary, and several assertions below are statements about this text. */
function dalyhubSection(): string {
  const marker = "/* DS-01 — THE DALYHUB SEMANTIC LAYER";
  const begin = tokensCss.indexOf(marker);
  if (begin === -1) {
    throw new Error("tokens.css is missing the DalyHub layer banner");
  }
  return tokensCss.slice(begin);
}

/** The declarations of one density preset. */
function densityBlock(density: string): Map<string, string> {
  return parseDeclarations(
    blockBody(
      dalyhubSection(),
      new RegExp(`\\[data-dh-density="${density}"\\]\\s*\\{`),
    ),
  );
}

describe("DS-01 the DalyHub layer is complete and closed", () => {
  const defined = allDefinedTokenNames();

  it("defines every published token", () => {
    for (const name of DALYHUB_TOKEN_NAMES) {
      expect(defined.has(name), `missing token --${name}`).toBe(true);
    }
  });

  it("publishes every defined token", () => {
    // The direction that matters. A `--dh-` name in the stylesheet that nobody
    // agreed to is how the previous token system reached 219 of them.
    const published = new Set<string>(DALYHUB_TOKEN_NAMES);
    const unpublished = [...defined].filter(
      (name) => name.startsWith("dh-") && !published.has(name),
    );
    expect(
      unpublished,
      `these --dh- tokens are defined but not published in app/shared/tokens/dalyhub.ts: ${unpublished.join(", ")}`,
    ).toEqual([]);
  });

  it("defines a type role completely, or not at all", () => {
    for (const role of DALYHUB_TEXT_ROLES) {
      for (const facet of DALYHUB_TEXT_FACETS) {
        expect(
          defined.has(`dh-text-${role}-${facet}`),
          `type role "${role}" is missing its ${facet}`,
        ).toBe(true);
      }
    }
  });

  it("is defined in tokens.css and nowhere else", () => {
    // A `--dh-` token defined in a module stylesheet is a second design system
    // with one file's worth of members. CONSUMING one anywhere is the point;
    // DEFINING one outside the token layer is not.
    const offenders: string[] = [];
    for (const file of appSourceFiles()) {
      const relative = appRelative(file);
      if (relative === "styles/tokens.css") continue;
      const text = readAppFile(relative);
      // A definition is `--dh-…:`; a reference is `var(--dh-…)`. Only the
      // first is being ruled out here.
      if (/(^|[^(\w-])--dh-[\w-]+\s*:/m.test(text)) {
        offenders.push(repoRelative(file));
      }
    }
    expect(
      offenders,
      `--dh- tokens must be defined only in app/styles/tokens.css: ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});

describe("DS-01 the layer is semantic, not authored", () => {
  const tokens = allTokens();

  it("authors no colour of its own", () => {
    // Colour is generated from a seed and byte-checked (ADR-074 Decision 2). A
    // hex here would be a second source of truth the generator cannot see, and
    // one that no contrast test covers.
    const section = dalyhubSection();
    const hexes = section.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(
      hexes,
      `the DalyHub layer must alias generated colour, never author it: ${hexes.join(", ")}`,
    ).toEqual([]);
    for (const fn of ["rgb(", "rgba(", "hsl(", "oklch("]) {
      expect(section.includes(fn), `authored colour function ${fn}`).toBe(
        false,
      );
    }
  });

  it("resolves every token onto tokens that exist", () => {
    // `resolveTokenChain` throws on an undefined reference and on a cycle,
    // which are the two ways an alias layer fails silently in a browser: the
    // property resolves to nothing and the whole declaration is dropped.
    for (const name of DALYHUB_TOKEN_NAMES) {
      expect(() => resolveTokenChain(name, tokens), `--${name}`).not.toThrow();
    }
  });

  it("names nothing after another design language", () => {
    // The layer exists so DalyHub stops describing itself in someone else's
    // vocabulary. A `--dh-md-…` or `--dh-…-material` would defeat the whole
    // exercise while looking like compliance.
    const forbidden = [
      "material",
      "-md-",
      "m3",
      "fluent",
      "shadcn",
      "tailwind",
      "cupertino",
    ];
    for (const name of DALYHUB_TOKEN_NAMES) {
      for (const word of forbidden) {
        expect(name.includes(word), `--${name} names "${word}"`).toBe(false);
      }
    }
  });
});

describe("DS-01 the density model", () => {
  it("defines exactly the density token set in every preset", () => {
    const expected = [...DALYHUB_DENSITY_TOKEN_NAMES].sort();
    for (const density of DALYHUB_DENSITIES) {
      const block = densityBlock(density);
      expect(
        [...block.keys()].sort(),
        `the "${density}" preset must define exactly the density tokens`,
      ).toEqual(expected);
    }
  });

  it("holds nothing but density tokens — no colour, type, radius or motion", () => {
    // The rule that keeps a density a density. A preset that repainted a
    // surface or changed a radius would be a second theme wearing the word.
    const densityTokens = new Set<string>(DALYHUB_DENSITY_TOKEN_NAMES);
    for (const density of DALYHUB_DENSITIES) {
      for (const name of densityBlock(density).keys()) {
        expect(
          densityTokens.has(name),
          `the "${density}" preset sets --${name}, which is not a density token`,
        ).toBe(true);
      }
    }
  });

  it("gives the DEFAULT preset the values the base :root already carries", () => {
    // DS-01 establishes the system; it does not re-measure the product. A
    // document that declares `data-density="default"` must be pixel-identical
    // to one that declares nothing, or the model has silently redesigned the
    // application on its way in.
    const base = parseDeclarations(blockBody(dalyhubSection(), /:root\s*\{/));
    const preset = densityBlock("default");
    for (const name of DALYHUB_DENSITY_TOKEN_NAMES) {
      expect(base.get(name), `base :root is missing --${name}`).toBeDefined();
      expect(preset.get(name), `default preset --${name}`).toBe(base.get(name));
    }
  });

  it("keeps the default density at the values the product painted before DS-01", () => {
    // The structural tokens each default resolves to, spelled out so a change
    // to one of them is a deliberate act rather than a side effect. These are
    // the UIX-06 / M3X values the application ships.
    const expected: Record<string, string> = {
      "dh-control-height": "app-control-height-lg",
      "dh-menu-item-height": "app-control-height-lg",
      "dh-row-height": "app-list-row-height-one-line",
      "dh-inset-inline": "app-space-4",
      "dh-inset-block": "app-space-3",
      "dh-surface-padding": "app-card-padding",
      "dh-control-gap": "app-space-2",
      "dh-icon-size": "app-entity-icon-size",
    };
    const preset = densityBlock("default");
    for (const [token, target] of Object.entries(expected)) {
      expect(preset.get(token), `--${token}`).toBe(`var(--${target})`);
    }
  });

  it("makes compact tighter than default, and touch looser", () => {
    // Stated as an ordering rather than as three value lists, so the assertion
    // survives a future re-measurement of any rung.
    const rem = (name: string, block: Map<string, string>): number => {
      const chain = resolveTokenChain(
        /^var\(--([\w-]+)\)$/.exec(block.get(name)!)![1],
        allTokens(),
      );
      const value = allTokens().get(chain[chain.length - 1])!;
      const px = /(\d+(?:\.\d+)?)px/.exec(value);
      if (px) return parseFloat(px[1]) / 16;
      return parseFloat(value);
    };
    const compact = densityBlock("compact");
    const standard = densityBlock("default");
    const touch = densityBlock("touch");
    for (const name of ["dh-inset-inline", "dh-control-gap"] as const) {
      expect(rem(name, compact), `${name}: compact < default`).toBeLessThan(
        rem(name, standard),
      );
      expect(
        rem(name, touch),
        `${name}: touch >= default`,
      ).toBeGreaterThanOrEqual(rem(name, standard));
    }
    expect(rem("dh-row-height", compact)).toBeLessThan(
      rem("dh-row-height", standard),
    );
    expect(rem("dh-row-height", touch)).toBeGreaterThan(
      rem("dh-row-height", standard),
    );
  });

  it("floors every compact target back to the touch minimum on a coarse pointer", () => {
    // The accessibility clause, and the reason `compact` is safe to ship at
    // all. Density may take padding, type and glyph size; it may never take
    // hit area from a finger (AGENTS.md §15, WCAG 2.2 target size).
    const coarse = blockBody(
      dalyhubSection(),
      /@media\s*\(pointer:\s*coarse\)\s*\{/,
    );
    const compactUnderCoarse = parseDeclarations(
      blockBody(coarse, /\[data-dh-density="compact"\]\s*\{/),
    );
    for (const name of [
      "dh-control-height",
      "dh-menu-item-height",
      "dh-row-height",
    ]) {
      expect(
        compactUnderCoarse.get(name),
        `--${name} under a coarse pointer`,
      ).toBe("var(--app-touch-target-min)");
    }
  });

  it("lets an explicit density beat the responsive default", () => {
    // The responsive rule is a default for a document that has not chosen, not
    // an override of one that has — which is what makes a future Settings
    // control possible without it having to fight a media query.
    expect(dalyhubSection()).toContain(":root:not([data-dh-density])");
  });

  it("selects on the NAMESPACED attribute, because `data-density` is taken", () => {
    // `LiveMarkdownEditor` writes `data-density="comfortable" | "compact"` for
    // editor chrome, and `RecordSummary`/`RecordSummaryBar` write
    // `data-density="full" | "sparse"` for whether a description exists. A bare
    // `[data-density="compact"]` in the token layer would apply the whole
    // product density preset to every embedded Markdown editor — silently, and
    // visible only in the controls inside one. This is that collision, guarded,
    // so a later "simplification" of the attribute name fails here first.
    const section = dalyhubSection();
    expect(section).toContain('[data-dh-density="compact"]');
    // Comments stripped: the block above deliberately QUOTES the colliding
    // selector while explaining it, and that prose must not fail this.
    const rules = section.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(
      /\[data-density[=\]]/.test(rules),
      "the DalyHub density layer must not select on the unnamespaced `data-density`",
    ).toBe(false);

    // And the namespaced attribute must remain DalyHub's alone.
    const offenders: string[] = [];
    for (const file of appSourceFiles()) {
      const relative = appRelative(file);
      if (relative === "styles/tokens.css") continue;
      const text = readAppFile(relative);
      const usesDhDensity = text.includes("data-dh-density");
      const usesLegacy = /data-density=["{]/.test(text);
      if (usesDhDensity && usesLegacy) offenders.push(repoRelative(file));
    }
    expect(
      offenders,
      `these files write both density attributes, which is the collision this rename avoids: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("selects density by attribute rather than by viewport width", () => {
    // A 27" monitor driven by a trackpad is not compact, and a large tablet is
    // not default. Tying density to width would decide both wrongly.
    const section = dalyhubSection();
    const widthQueries = section.match(
      /@media[^{]*\((?:min|max)-width[^)]*\)[^{]*\{[^}]*--dh-/g,
    );
    expect(
      widthQueries,
      "density must not be selected by a width media query",
    ).toBeNull();
  });
});
