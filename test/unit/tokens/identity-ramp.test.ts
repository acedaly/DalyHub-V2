/**
 * IDENTITY-01 — the sixteen-slot ramp, asserted in both appearances.
 *
 * The ramp is where the pass's whole promise lives: one saturated hue per
 * record, on a whisper-tint tile with a fine tinted edge, matching its progress
 * bar and its chart line, vivid in light and calm-but-vivid in dark. Every one
 * of those clauses is checkable, and the ones that carry an accessibility
 * obligation are checked hardest.
 *
 * `pnpm run scheme:check` already proves `scheme.ts` and `tokens.css` are the
 * same bytes, so a threshold that passes here is a statement about what the
 * browser actually paints — not about a mirror that drifted.
 */

import { describe, expect, it } from "vitest";

import { IDENTITY_COLOUR_SLOTS } from "~/kernel/entities/identity-colour-slots";
import {
  COLOR_SCHEME_PALETTES,
  GENERATED_COLOR_SCHEMES,
  IDENTITY_RAMP,
  IDENTITY_SLOT_NAMES,
  type IdentitySlot,
} from "~/shared/tokens";
import {
  allTokens,
  generatedSection,
  readAppFile,
  tokensCss,
} from "./token-css";

/** Parse a `#rrggbb` hex string to [r, g, b] in 0–255. */
function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

/** WCAG relative luminance of an sRGB colour. */
function relativeLuminance(hex: string): number {
  const channels = parseHex(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** WCAG contrast ratio between two colours (1–21). */
function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The sRGB hue angle, for the "are these two slots the same colour" check. */
function hueAngle(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h =
    max === r
      ? ((g - b) / d) % 6
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4;
  return (((h * 60) % 360) + 360) % 360;
}

const APPEARANCES = ["light", "dark"] as const;

/**
 * The surfaces the ramp is measured against, per appearance.
 *
 * These are the `DALYHUB_PRIMITIVES` values the generator composes the ramp over
 * and the ones the product actually paints: a card is `--surface`, and the
 * sunken TRACK a progress bar sits in is `--surface-sunken`. Read out of the
 * generated section rather than restated, so a repaint of the product's surfaces
 * cannot leave this suite measuring against a surface that no longer exists.
 */
function surfacesFor(appearance: "light" | "dark") {
  const section = generatedSection();
  // The light values are the bare `:root` block's; the dark ones are the first
  // dark block's. Both are emitted by the same generator in the same order.
  const blocks = section.split(/@media \(prefers-color-scheme: dark\)/);
  const source = appearance === "light" ? blocks[0] : blocks[1];
  const read = (name: string): string => {
    const match = new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`).exec(source);
    if (!match) throw new Error(`tokens.css has no ${appearance} --${name}`);
    return match[1];
  };
  return { card: read("surface"), track: read("surface-sunken") };
}

describe("the ramp is complete and matches the vocabulary", () => {
  it("publishes the same sixteen slots the kernel permits", () => {
    expect([...IDENTITY_SLOT_NAMES]).toEqual([...IDENTITY_COLOUR_SLOTS]);
  });

  it("defines all four roles for every slot in both appearances", () => {
    for (const appearance of APPEARANCES) {
      for (const slot of IDENTITY_SLOT_NAMES) {
        const roles = IDENTITY_RAMP[appearance][slot];
        expect(Object.keys(roles).sort()).toEqual([
          "edge",
          "hue",
          "soft",
          "tint",
        ]);
      }
    }
  });

  it("defines every role in tokens.css, in both appearances", () => {
    const tokens = allTokens();
    for (const slot of IDENTITY_SLOT_NAMES) {
      for (const suffix of ["", "-tint", "-edge", "-soft"]) {
        expect(
          tokens.has(`identity-${slot}${suffix}`),
          `--identity-${slot}${suffix}`,
        ).toBe(true);
      }
    }
  });

  /*
   * The four DalyHub roles a component actually consumes. They are defined once
   * on `:root` as the neutral container and remapped by `[data-identity="…"]`,
   * so a slot the mapping forgot would silently inherit whatever the last rule
   * left behind — the failure mode the mapping exists to prevent.
   */
  it("maps every slot onto the four DalyHub identity roles", () => {
    const css = allTokens();
    expect(css.has("dh-identity")).toBe(true);
    for (const slot of IDENTITY_SLOT_NAMES) {
      const block = new RegExp(
        `\\[data-identity="${slot}"\\][\\s\\S]*?--dh-identity-soft: var\\(--identity-${slot}-soft\\);`,
      );
      expect(block.test(mappingSection()), `[data-identity="${slot}"]`).toBe(
        true,
      );
    }
  });
});

/** The hand-written mapping block, which is deliberately OUTSIDE the generator. */
function mappingSection(): string {
  const begin = tokensCss.indexOf("/* IDENTITY-01 — THE DALYHUB IDENTITY RAMP");
  if (begin === -1) {
    throw new Error("tokens.css is missing the identity mapping block");
  }
  return tokensCss.slice(begin);
}

/** One of the product's stylesheets, as text. */
function readCss(file: string): string {
  return readAppFile(`styles/${file}`);
}

describe.each(APPEARANCES)("contrast in %s", (appearance) => {
  const { card, track } = surfacesFor(appearance);

  /*
   * The two promises §5 makes, over every slot in both appearances.
   *
   * A glyph and a progress fill are non-text UI components whose SHAPE carries
   * meaning, so WCAG 1.4.11's 3:1 is the floor rather than 4.5:1. Neither is ever
   * the only signal — the record's name is always text beside its tile, and the
   * percentage is always printed beside its bar — but a mark that cannot be seen
   * has stopped being a mark.
   */
  it("holds 3:1 for every glyph on its own tile", () => {
    for (const slot of IDENTITY_SLOT_NAMES) {
      const { hue, tint } = IDENTITY_RAMP[appearance][slot];
      const ratio = contrastRatio(hue, tint);
      expect(
        ratio,
        `${slot}: glyph ${hue} on tile ${tint} = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it("holds 3:1 for every progress fill on the sunken track", () => {
    for (const slot of IDENTITY_SLOT_NAMES) {
      const { hue } = IDENTITY_RAMP[appearance][slot];
      const ratio = contrastRatio(hue, track);
      expect(
        ratio,
        `${slot}: bar ${hue} on track ${track} = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  /*
   * The identity-scoped meter paints its TRACK in the slot's `soft` role and its
   * fill in the hue, so the two owe each other the same 3:1 — otherwise a bar in
   * its own colour would be less legible than the neutral one it replaced.
   */
  it("holds 3:1 for every fill against its own soft track", () => {
    for (const slot of IDENTITY_SLOT_NAMES) {
      const { hue, soft } = IDENTITY_RAMP[appearance][slot];
      const ratio = contrastRatio(hue, soft);
      expect(
        ratio,
        `${slot}: fill ${hue} on soft track ${soft} = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  /*
   * The tile is deliberately near-invisible as a FILL — that is the whole point
   * of the construction — which makes the EDGE load-bearing. A border that
   * cannot be distinguished from the card is a tile that has dissolved, so it
   * owes a real, if modest, separation.
   */
  it("keeps every tile's edge visible against the card", () => {
    for (const slot of IDENTITY_SLOT_NAMES) {
      const { edge } = IDENTITY_RAMP[appearance][slot];
      const ratio = contrastRatio(edge, card);
      expect(
        ratio,
        `${slot}: edge ${edge} on card ${card} = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThan(1.14);
    }
  });

  /*
   * The tile is a TINT, not a pastel. If the fill drifted far enough from the
   * card to be read as a coloured box, the construction would have slid back
   * toward the tonal container it replaced.
   */
  it("keeps every tile's fill a whisper rather than a pastel box", () => {
    for (const slot of IDENTITY_SLOT_NAMES) {
      const { tint, edge } = IDENTITY_RAMP[appearance][slot];
      const fill = contrastRatio(tint, card);
      expect(
        fill,
        `${slot}: tile fill ${tint} against the card is too strong`,
      ).toBeLessThan(1.2);
      // …and the edge must be the stronger of the two, because it is what
      // actually draws the tile.
      expect(
        contrastRatio(edge, card),
        `${slot}: the edge must out-draw the fill`,
      ).toBeGreaterThan(fill);
    }
  });
});

describe("the sixteen slots are sixteen identities", () => {
  it("gives no two slots the same hue in either appearance", () => {
    for (const appearance of APPEARANCES) {
      const hues = IDENTITY_SLOT_NAMES.map(
        (slot) => IDENTITY_RAMP[appearance][slot].hue,
      );
      expect(new Set(hues).size, appearance).toBe(hues.length);
    }
  });

  /*
   * The slot-16 check, kept as a rule rather than as a note.
   *
   * The pass opened with indigo in slot 16 and replaced it with brown: indigo
   * and slot 1's violet sit 1.6° apart in hue, and in DARK — where both are
   * lifted to the same tone — they resolved to the same colour. This is that
   * judgement, generalised: no two slots may be indistinguishable in hue AND
   * indistinguishable in lightness at the same time.
   *
   * Identity is never carried by colour alone (the record's name is always text
   * beside it), so the bar is "tell them apart", not "tell them apart blind".
   */
  it("keeps every pair of slots separable by hue or by lightness", () => {
    for (const appearance of APPEARANCES) {
      for (let i = 0; i < IDENTITY_SLOT_NAMES.length; i += 1) {
        for (let j = i + 1; j < IDENTITY_SLOT_NAMES.length; j += 1) {
          const a = IDENTITY_RAMP[appearance][IDENTITY_SLOT_NAMES[i]].hue;
          const b = IDENTITY_RAMP[appearance][IDENTITY_SLOT_NAMES[j]].hue;
          let dHue = Math.abs(hueAngle(a) - hueAngle(b));
          if (dHue > 180) dHue = 360 - dHue;
          const dLum = Math.abs(relativeLuminance(a) - relativeLuminance(b));
          expect(
            dHue >= 6 || dLum >= 0.06,
            `${appearance}: ${IDENTITY_SLOT_NAMES[i]} (${a}) and ${IDENTITY_SLOT_NAMES[j]} (${b}) are the same colour`,
          ).toBe(true);
        }
      }
    }
  });

  /*
   * ONE HUE PER RECORD, asserted as the thing it is: the tile's glyph, the
   * progress fill and the chart line all read `--dh-identity`, so for any slot
   * they are the same value by construction. This is the assertion that would
   * fail if a future change gave one of them its own mapping again.
   */
  it("paints a record's glyph, bar and chart line from ONE value", () => {
    for (const slot of IDENTITY_SLOT_NAMES) {
      const block = new RegExp(
        `\\[data-identity="${slot}"\\]\\s*\\{[^}]*--dh-identity:\\s*var\\(--identity-${slot}\\)`,
      );
      expect(block.test(tokensCss), `[data-identity="${slot}"]`).toBe(true);
    }
    // …and the three consumers read that one property rather than a slot list.
    const charts = readCss("charts.css");
    const progress = readCss("progress.css");
    const icons = readCss("icons.css");
    expect(icons).toContain("color: var(--dh-identity)");
    expect(progress).toContain("background: var(--dh-identity)");
    expect(charts).toContain("stroke: var(--dh-identity)");
    // Nothing on an identity surface may reach for the retired container pairs.
    for (const [name, text] of [
      ["icons.css", icons],
      ["progress.css", progress],
      ["charts.css", charts],
      ["pill.css", readCss("pill.css")],
    ] as const) {
      expect(
        text,
        `${name} still paints identity from a tonal container`,
      ).not.toMatch(/--md-sys-color-(on-)?area-accent-/);
    }
  });
});

describe("the ramp is one palette across every colour scheme", () => {
  /*
   * An identity that changed colour when the owner switched scheme would not be
   * an identity. The ramp is global by construction (the generator resolves it
   * once), and this is that construction held to.
   */
  it("emits the same identity values in every scheme's block", () => {
    const section = generatedSection();
    for (const slot of IDENTITY_SLOT_NAMES) {
      const values = [
        ...section.matchAll(
          new RegExp(`--identity-${slot}:\\s*(#[0-9a-f]{6})`, "g"),
        ),
      ].map((match) => match[1]);
      // One light value and one dark value, repeated across every scheme block.
      expect(new Set(values).size, `--identity-${slot}`).toBe(2);
      expect(values.length).toBeGreaterThanOrEqual(
        GENERATED_COLOR_SCHEMES.length,
      );
    }
  });

  it("leaves every scheme's own roles untouched", () => {
    // A sanity check that adding sixty-four tokens did not disturb the schemes:
    // each still has its own distinct primary.
    const primaries = GENERATED_COLOR_SCHEMES.map(
      (scheme) => COLOR_SCHEME_PALETTES[scheme].light.primary,
    );
    expect(new Set(primaries).size).toBe(GENERATED_COLOR_SCHEMES.length);
  });
});

describe("the neutral identity", () => {
  it("is a real, published fallback rather than a missing value", () => {
    // A record with no Area and no choice must get a neutral tile, not an
    // undefined custom property that drops the whole declaration.
    expect(tokensCss).toMatch(/--dh-identity:\s*var\(--dh-color-text-muted\)/);
    expect(tokensCss).toMatch(
      /--dh-identity-tint:\s*var\(--dh-color-surface-subtle\)/,
    );
    expect(tokensCss).toMatch(/--dh-identity-edge:\s*var\(--dh-color-border\)/);
  });

  it("names no slot, so nothing can accidentally match it", () => {
    const slots: readonly IdentitySlot[] = IDENTITY_SLOT_NAMES;
    expect(slots).not.toContain("neutral" as IdentitySlot);
  });
});
