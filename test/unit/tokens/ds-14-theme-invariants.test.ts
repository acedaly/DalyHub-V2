/**
 * DS-14 §6 — the theme invariant specification, enforced by a test and by nothing
 * else.
 *
 * Not a review checklist, not an acceptance-matrix row, not a designer's eye. The
 * reason is on the record in this repository: THEME-02's selected-navigation
 * indicator bar was reviewed, shipped, and measured 2.96:1 in Daly Dark and
 * 2.73:1 in Modern Dark — under the 3:1 a non-text cue carrying state owes —
 * because it was painted with a token whose contrast is guaranteed against a
 * different surface. Review did not catch it; measurement did (ADR-068 decision
 * 6).
 *
 * DS-14 multiplies exactly that class of pairing: six Area accents, a neutral
 * absence pill, every role pill, a progress fill on a track on a card, a focus
 * ring on two different canvases — across seven themes. That is eight assertion
 * families times seven themes, and it is not a thing human attention should be
 * spent on.
 *
 * THE REGISTRY IS ENUMERATED, NEVER LISTED. `THEME_IDS` comes from the kernel's
 * theme registry, so an eighth theme is covered the moment it is registered and
 * cannot be registered while failing. A hand-written list here would be a list
 * that a future theme is quietly missing from.
 *
 * Two corrections to §6's wording, so the test is written from a specification
 * that matches the registry (ADR-068 decision 6):
 *
 *   - the text ramp is `text` / `text-secondary` / `text-muted`. There is no
 *     `text-primary`, and `raised` is `surface-raised`.
 *   - "in both light and dark resolution" does not apply per theme. Every curated
 *     theme is a single self-contained palette — choosing Modern Dark keeps it
 *     Modern Dark under a light OS (ADR-061) — so each of the seven runs once,
 *     and `system`'s two resolutions are `daly-light` and `daly-dark`, which are
 *     already in the enumeration. Asserting a "dark resolution" of Eucalypt would
 *     be asserting something that cannot be reached.
 *
 * Values come from the TS colour maps, which `tokens.test.ts` proves identical to
 * the authoritative CSS, so this cannot pass against data the stylesheet does not
 * actually carry.
 */

import { describe, expect, it } from "vitest";

import { THEME_IDS } from "~/kernel/preferences/theme-preference";
import {
  THEME_COLOR_MAPS,
  type ColorMap,
  type ColorTokenName,
} from "~/shared/tokens";

/* -------------------------------------------------------------------------- */
/* Colour science                                                              */
/* -------------------------------------------------------------------------- */

function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** The sRGB transfer function, inverted. */
function linearise(channel: number): number {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance. */
function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map(linearise);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio (1–21). */
function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * CIELAB L\* (D65). Perceptual lightness, which is what the elevation contract is
 * stated in — a WCAG luminance ratio answers "can this be read", not "does this
 * read as a step up", and the contract is about the second.
 */
function lightness(hex: string): number {
  const [r, g, b] = parseHex(hex).map(linearise);
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const f = y > 216 / 24389 ? Math.cbrt(y) : (841 / 108) * y + 4 / 29;
  return 116 * f - 16;
}

/* -------------------------------------------------------------------------- */
/* §2 — the token contract                                                     */
/* -------------------------------------------------------------------------- */

/** The six Area identity accents, as the ramp indices. */
const AREA_ACCENTS = [1, 2, 3, 4, 5, 6] as const;

/**
 * Every token brief §2 introduces or names, as it exists in the registry.
 *
 * A theme that omits one must fail the build rather than fall back silently, and
 * a token only one theme defines must not exist at all — both of which this list
 * plus the per-theme completeness check below enforce.
 */
const DS_14_TOKENS: readonly ColorTokenName[] = [
  "surface-page",
  "pill-neutral-surface",
  "pill-neutral-text",
  "progress-track",
  "progress-fill",
  "divider-subtle",
  ...AREA_ACCENTS.flatMap(
    (n) =>
      [
        `area-accent-${n}`,
        `area-accent-${n}-surface`,
        `area-accent-${n}-text`,
      ] as ColorTokenName[],
  ),
  // Reused unchanged, and named here so a theme cannot drop them either.
  "nav-selected-surface",
  "nav-selected-text",
  "surface-sunken",
  "surface-card",
  "surface-raised",
];

/** The text ramp §6.3 holds on a card. */
const TEXT_RAMP = ["text", "text-secondary", "text-muted"] as const;

/** Every pill surface/text pairing §6.4 holds — role, absence and Area alike. */
const PILL_PAIRS: readonly (readonly [ColorTokenName, ColorTokenName])[] = [
  ["pill-neutral-text", "pill-neutral-surface"],
  ["danger-text", "danger-surface"],
  ["success-text", "success-surface"],
  ["warning-text", "warning-surface"],
  ["info-text", "info-surface"],
  ["accent-text", "accent-surface"],
  ...AREA_ACCENTS.map(
    (n) =>
      [
        `area-accent-${n}-text`,
        `area-accent-${n}-surface`,
      ] as unknown as readonly [ColorTokenName, ColorTokenName],
  ),
];

/** The minimum perceptible step between two stacked surfaces, in CIELAB L\*. */
const MIN_ELEVATION_STEP = 3;

/**
 * Fail with the theme id, the token pair AND the measured value — never a bare
 * boolean. A failure that does not say what it measured sends the next person
 * back to the spreadsheet this test exists to replace.
 */
function expectContrast(
  themeId: string,
  theme: ColorMap,
  foreground: ColorTokenName,
  background: ColorTokenName,
  minimum: number,
): void {
  const fg = theme[foreground];
  const bg = theme[background];
  const ratio = contrastRatio(fg, bg);
  expect(
    ratio,
    `${themeId}: --dh-color-${foreground} (${fg}) on --dh-color-${background} (${bg}) = ${ratio.toFixed(2)}:1, minimum ${minimum}:1`,
  ).toBeGreaterThanOrEqual(minimum);
}

function expectStep(
  themeId: string,
  theme: ColorMap,
  lower: ColorTokenName,
  upper: ColorTokenName,
): void {
  const from = theme[lower];
  const to = theme[upper];
  const delta = lightness(to) - lightness(from);
  expect(
    delta,
    `${themeId}: --dh-color-${lower} (${from}, L* ${lightness(from).toFixed(2)}) → --dh-color-${upper} (${to}, L* ${lightness(to).toFixed(2)}) = ΔL* ${delta.toFixed(2)}, minimum ${MIN_ELEVATION_STEP}`,
  ).toBeGreaterThanOrEqual(MIN_ELEVATION_STEP);
}

/* -------------------------------------------------------------------------- */
/* The invariants, per registered theme                                        */
/* -------------------------------------------------------------------------- */

describe("DS-14 §6 theme invariants", () => {
  it("enumerates the registry rather than a hand-written list", () => {
    // The guard on the guard: if this ever stops reading the registry, a future
    // theme is silently uncovered and every assertion below becomes decorative.
    expect(THEME_IDS.length).toBeGreaterThanOrEqual(7);
    for (const themeId of THEME_IDS) {
      expect(
        THEME_COLOR_MAPS[themeId],
        `theme "${themeId}" is registered but has no colour map — it cannot be registered while failing`,
      ).toBeDefined();
    }
  });

  describe.each(THEME_IDS)("%s", (themeId) => {
    const theme = THEME_COLOR_MAPS[themeId];

    /* §6.1 */
    it("resolves every DS-14 token to a non-empty value", () => {
      for (const token of DS_14_TOKENS) {
        const value = theme[token];
        expect(
          value,
          `${themeId}: --dh-color-${token} is missing — a theme that omits a token must fail the build, not fall back silently`,
        ).toBeTruthy();
        expect(
          value,
          `${themeId}: --dh-color-${token} = "${value}" is not a colour`,
        ).toMatch(/^#[0-9a-f]{3,8}$|^rgba?\(/i);
      }
    });

    /* §6.2 — the elevation contract. */
    it("keeps a perceptible step from page to card to raised", () => {
      expectStep(themeId, theme, "surface-page", "surface-card");
      expectStep(themeId, theme, "surface-card", "surface-raised");
    });

    /* §6.3 */
    it("keeps the whole text ramp readable on a card", () => {
      for (const foreground of TEXT_RAMP) {
        expectContrast(themeId, theme, foreground, "surface-card", 4.5);
      }
    });

    /* §6.4 */
    it("keeps every pill's own label readable on its own tint", () => {
      for (const [foreground, background] of PILL_PAIRS) {
        expectContrast(themeId, theme, foreground, background, 4.5);
      }
    });

    /* §6.5 — one progress component, legible in both directions. */
    it("keeps the progress fill visible on its track, and the track on a card", () => {
      expectContrast(themeId, theme, "progress-fill", "progress-track", 3);
      expectContrast(themeId, theme, "progress-track", "surface-card", 3);
    });

    /* §6.6 */
    it("keeps every Area dot visible on a card", () => {
      for (const n of AREA_ACCENTS) {
        expectContrast(
          themeId,
          theme,
          `area-accent-${n}` as ColorTokenName,
          "surface-card",
          3,
        );
      }
    });

    /* §6.7 — the ring has to work on both canvases, not just the one it was
     * eyeballed against. */
    it("keeps the focus ring visible on both a card and the page", () => {
      expectContrast(themeId, theme, "focus-ring", "surface-card", 3);
      expectContrast(themeId, theme, "focus-ring", "surface-page", 3);
    });

    /* §6.8 */
    it("keeps the selected navigation label readable on its own tint", () => {
      expectContrast(
        themeId,
        theme,
        "nav-selected-text",
        "nav-selected-surface",
        4.5,
      );
    });
  });
});

describe("DS-14 §2 no token exists for only one theme", () => {
  it("defines every DS-14 token in every registered theme", () => {
    // The other half of "do not add a token only one theme defines": the
    // per-theme check above proves each theme HAS them; this proves none of them
    // is a token some other theme carries and the rest do not.
    const missing: string[] = [];
    for (const token of DS_14_TOKENS) {
      for (const themeId of THEME_IDS) {
        if (!THEME_COLOR_MAPS[themeId][token]) {
          missing.push(`${themeId}: --dh-color-${token}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

describe("DS-14 §2 role colours are never an Area accent", () => {
  it.each(THEME_IDS)("%s", (themeId) => {
    const theme = THEME_COLOR_MAPS[themeId];
    const roleColours = new Set([
      theme.danger,
      theme.success,
      theme.warning,
      theme["danger-surface"],
      theme["success-surface"],
      theme["warning-surface"],
    ]);
    for (const n of AREA_ACCENTS) {
      const accent = theme[`area-accent-${n}` as ColorTokenName];
      const tint = theme[`area-accent-${n}-surface` as ColorTokenName];
      expect(
        roleColours.has(accent),
        `${themeId}: Area accent ${n} (${accent}) reuses a role colour — danger, success and warning are reserved for state`,
      ).toBe(false);
      expect(
        roleColours.has(tint),
        `${themeId}: Area accent ${n}'s tint (${tint}) reuses a role surface`,
      ).toBe(false);
    }
  });

  it.each(THEME_IDS)("%s keeps the six accents distinct", (themeId) => {
    const theme = THEME_COLOR_MAPS[themeId];
    const accents = AREA_ACCENTS.map(
      (n) => theme[`area-accent-${n}` as ColorTokenName],
    );
    expect(
      new Set(accents).size,
      `${themeId}: the Area ramp has ${new Set(accents).size} distinct colours, not ${AREA_ACCENTS.length}`,
    ).toBe(AREA_ACCENTS.length);
  });
});

describe("DS-14 measured elevation, reported", () => {
  it("prints ΔL* between page and card for every theme", () => {
    const rows = THEME_IDS.map((themeId) => {
      const theme = THEME_COLOR_MAPS[themeId];
      const pageToCard =
        lightness(theme["surface-card"]) - lightness(theme["surface-page"]);
      const cardToRaised =
        lightness(theme["surface-raised"]) - lightness(theme["surface-card"]);
      return `${themeId}: page ${theme["surface-page"]} (L* ${lightness(theme["surface-page"]).toFixed(2)}) → card ${theme["surface-card"]} (L* ${lightness(theme["surface-card"]).toFixed(2)}) ΔL* ${pageToCard.toFixed(2)}; card → raised ΔL* ${cardToRaised.toFixed(2)}`;
    });
    // Printed on every run, so the numbers in the PR and in the acceptance
    // matrix are read off a measurement rather than transcribed from a
    // spreadsheet.
    console.log(`[ds-14 elevation]\n  ${rows.join("\n  ")}`);
    expect(rows).toHaveLength(THEME_IDS.length);
  });
});
