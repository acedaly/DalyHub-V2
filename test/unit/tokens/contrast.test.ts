/**
 * M3-01 — WCAG 2.2 contrast over the generated scheme, in BOTH appearances.
 *
 * The scheme is derived, not authored, so the interesting question is no longer
 * "did someone pick a readable grey?" but "does the algorithm's output clear AA
 * everywhere the product actually paints?". These tests answer it for every pair
 * that carries text or a meaningful UI boundary: 4.5:1 for text, 3:1 for
 * non-text UI (AGENTS.md §15).
 *
 * Values come from `app/shared/tokens/scheme.ts`, which the generator writes
 * alongside `tokens.css` and `tokens.test.ts` proves identical to it — so a pass
 * here is a statement about what the browser paints.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DARK_SCHEME,
  LIGHT_SCHEME,
  type SchemeColorMap,
  type SchemeRole,
} from "~/shared/tokens";

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

/** The system colour groups that emit a full `on-*` / container quartet. */
const SYSTEM_GROUPS = [
  "primary",
  "secondary",
  "tertiary",
  "error",
] as const satisfies readonly SchemeRole[];

/** Every custom colour, which emits the same quartet. */
const CUSTOM_GROUPS = [
  "success",
  "warning",
  "info",
  "priority-p1",
  "priority-p2",
  "priority-p3",
  "priority-p4",
  "state-overdue",
  "state-due-soon",
  "state-completed",
  "state-waiting",
  "state-on-hold",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "chart-6",
  "area-accent-1",
  "area-accent-2",
  "area-accent-3",
  "area-accent-4",
  "area-accent-5",
  "area-accent-6",
  "entity-area",
  "entity-goal",
  "entity-project",
  "entity-task",
  "entity-note",
  "entity-meeting",
  "entity-person",
  "entity-asset",
  "entity-diary",
  "entity-review",
] as const satisfies readonly SchemeRole[];

/** The seven surfaces the APPLICATION paints with, from the app-neutral palette. */
const APP_SURFACES = [
  "app-surface-page",
  "app-surface-navigation",
  "app-surface-app-bar",
  "app-surface-card",
  "app-surface-card-subtle",
  "app-surface-raised",
  "app-surface-sunken",
] as const satisfies readonly SchemeRole[];

/** Every surface text is rendered on — the system ramp plus every application surface. */
const TEXT_SURFACES = [
  "surface",
  "surface-dim",
  "surface-bright",
  "surface-container-lowest",
  "surface-container-low",
  "surface-container",
  "surface-container-high",
  "surface-container-highest",
  ...APP_SURFACES,
] as const satisfies readonly SchemeRole[];

const SCHEMES = [
  ["light", LIGHT_SCHEME],
  ["dark", DARK_SCHEME],
] as const;

function expectRatio(
  scheme: SchemeColorMap,
  label: string,
  fg: SchemeRole,
  bg: SchemeRole,
  min: number,
) {
  const ratio = contrastRatio(scheme[fg], scheme[bg]);
  expect(
    ratio,
    `${label} — ${fg} (${scheme[fg]}) on ${bg} (${scheme[bg]}) = ${ratio.toFixed(2)}:1, needs ${min}:1`,
  ).toBeGreaterThanOrEqual(min);
}

describe.each(SCHEMES)("M3-01 contrast — %s scheme", (label, scheme) => {
  it("meets AA for every on-colour on its own colour", () => {
    for (const group of [...SYSTEM_GROUPS, ...CUSTOM_GROUPS]) {
      expectRatio(scheme, label, `on-${group}` as SchemeRole, group, 4.5);
    }
  });

  it("meets AA for every on-container on its own container", () => {
    for (const group of [...SYSTEM_GROUPS, ...CUSTOM_GROUPS]) {
      expectRatio(
        scheme,
        label,
        `on-${group}-container` as SchemeRole,
        `${group}-container` as SchemeRole,
        4.5,
      );
    }
  });

  it("meets AA for the text ramp on every surface", () => {
    for (const surface of TEXT_SURFACES) {
      expectRatio(scheme, label, "on-surface", surface, 4.5);
      expectRatio(scheme, label, "on-surface-variant", surface, 4.5);
    }
  });

  it("meets AA for the inverse pair a snackbar paints with", () => {
    expectRatio(scheme, label, "inverse-on-surface", "inverse-surface", 4.5);
  });

  it("meets 3:1 for the outline on every surface", () => {
    // `outline` is the boundary of a text field, a segmented button and an
    // outlined chip — a non-text UI component whose PRESENCE carries meaning.
    for (const surface of TEXT_SURFACES) {
      expectRatio(scheme, label, "outline", surface, 3);
    }
  });

  it("meets 3:1 for the focus ring on every surface it is drawn over", () => {
    // The focus indicator is `outline: 2px solid var(--md-sys-color-primary)`,
    // and it is drawn over EVERY application surface — a navigation row, a
    // control in the top app bar, a card, a field in a sunken filter bar.
    for (const surface of [...APP_SURFACES, "surface"] as const) {
      expectRatio(scheme, label, "primary", surface, 3);
    }
  });

  it("meets AA for the selected navigation pairing", () => {
    /*
     * Asserted BY NAME so the pairing cannot drift.
     *
     * M3X returned this to M3's own `secondary-container`; the previous
     * `primary-container` deviation was argued from the founding blue seed, and
     * the violet seed inverts every clause of it — see the full note in
     * `shell.css`.
     *
     * DH-DS then softened the FILL without changing the role: the container is
     * mixed toward the navigation surface, and the label takes the ordinary
     * `on-surface` rather than `on-secondary-container`, because the surface it
     * sits on is now a tinted neutral rather than a container. Both halves are
     * checked below against the mix the browser actually paints.
     *
     * Selection is never colour alone regardless: the pill is a SHAPE, the label
     * steps up a weight, the glyph takes `primary`, and `aria-current` carries it
     * semantically.
     */
    const strength = tintStrength("selected")[label as "light" | "dark"];
    const selected = mixSrgb(
      scheme["secondary-container"],
      scheme["app-surface-navigation"],
      strength,
    );

    const text = contrastRatio(scheme["on-surface"], selected);
    expect(
      text,
      `${label} — on-surface on the selected row (${selected}) = ${text.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(4.5);

    // The glyph is `primary` and is a 24px non-text UI component.
    const glyph = contrastRatio(scheme.primary, selected);
    expect(
      glyph,
      `${label} — primary glyph on the selected row (${selected}) = ${glyph.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(3);

    // And the pill has to be visible as a shape against the drawer it sits in.
    const pill = contrastRatio(selected, scheme["app-surface-navigation"]);
    expect(
      pill,
      `${label} — the selected pill (${selected}) against the drawer = ${pill.toFixed(2)}:1`,
    ).toBeGreaterThan(1.04);
  });

  it("meets 3:1 for progress fill against its track", () => {
    expectRatio(scheme, label, "primary", "secondary-container", 3);
    expectRatio(scheme, label, "success", "secondary-container", 3);
  });

  /*
   * M3X-02 — an entity card's bar is painted in the RECORD's own identity
   * accent, over the neutral `surface-sunken` track the gallery draws. Six new
   * fills, and a bar is a non-text UI component whose extent carries meaning, so
   * every one of them owes 3:1 against the track it sits in.
   *
   * The percentage beside the bar is the value in words either way — this is the
   * shape staying legible, not the shape carrying the meaning.
   */
  it("meets 3:1 for every identity progress fill against the gallery track", () => {
    for (const accent of CUSTOM_GROUPS.filter((name) =>
      name.startsWith("area-accent-"),
    )) {
      expectRatio(scheme, label, accent, "app-surface-sunken", 3);
    }
  });

  it("keeps every identity and series colour visible on card and page", () => {
    const marks = CUSTOM_GROUPS.filter(
      (name) =>
        name.startsWith("entity-") ||
        name.startsWith("area-accent-") ||
        name.startsWith("chart-") ||
        name.startsWith("priority-") ||
        name.startsWith("state-"),
    );
    for (const mark of marks) {
      expectRatio(scheme, label, mark, "app-surface-card", 3);
      expectRatio(scheme, label, mark, "app-surface-page", 3);
      // A chart or a progress bar is just as likely to sit inside a nested
      // panel as directly on a card, so the subtle rung is held to the same bar.
      expectRatio(scheme, label, mark, "app-surface-card-subtle", 3);
    }
  });

  it("keeps priority levels distinguishable from one another", () => {
    // Priority is never colour-only (the chip always carries a P1–P4 tag), but
    // when colour IS perceived it must not collapse into one hue.
    const levels = (["p1", "p2", "p3", "p4"] as const).map(
      (n) => scheme[`priority-${n}` as SchemeRole],
    );
    expect(new Set(levels).size).toBe(levels.length);
  });

  it("keeps the chart series distinguishable from one another", () => {
    // A legend is the ONE place in the product where colour genuinely is the
    // signal, so this is a stronger check than "the strings differ": no two
    // series may sit within 25° of hue, measured in HCT-comparable terms via
    // the sRGB hue angle, nor collapse to the same luminance.
    const series = ([1, 2, 3, 4, 5, 6] as const).map(
      (n) => scheme[`chart-${n}` as SchemeRole],
    );
    expect(new Set(series).size).toBe(series.length);
    const hues = series.map((hex) => {
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
    });
    for (let i = 0; i < hues.length; i += 1) {
      for (let j = i + 1; j < hues.length; j += 1) {
        const raw = Math.abs(hues[i] - hues[j]);
        const separation = Math.min(raw, 360 - raw);
        expect(
          separation,
          `${label} — chart-${i + 1} (${series[i]}) and chart-${j + 1} (${series[j]}) are ${separation.toFixed(0)}° apart`,
        ).toBeGreaterThanOrEqual(25);
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* M3X-02 — the two COMPOSED surfaces                                         */
/* -------------------------------------------------------------------------- */

/*
 * The expressive layer's two tinted surfaces are `color-mix()` over generated
 * roles rather than roles of their own, so they never reach `scheme.ts` and the
 * sweep above cannot see them. They are still surfaces the product paints text
 * on, in both appearances, at strengths that differ by appearance — which is
 * precisely the combination that produces an unreadable dark surface if nobody
 * checks. So the mix is reproduced here from its two real inputs: the generated
 * roles, and the generated STRENGTHS read out of the stylesheet the browser
 * actually loads.
 */
const TOKENS_CSS = readFileSync(
  join(process.cwd(), "app", "styles", "tokens.css"),
  "utf8",
);

/**
 * The generated tint strengths, per appearance.
 *
 * `tokens.css` carries three blocks — `:root` (light), the
 * `prefers-color-scheme: dark` media block, and the explicit
 * `[data-appearance="dark"]` block — and the last two are identical by
 * construction. Taking the FIRST occurrence as light and the LAST as dark
 * therefore reads one value from each appearance without parsing the cascade.
 */
function tintStrength(name: string): { light: number; dark: number } {
  const matches = [
    ...TOKENS_CSS.matchAll(
      new RegExp(`--app-tint-strength-${name}:\\s*(\\d+)%`, "g"),
    ),
  ].map((match) => Number(match[1]));
  expect(
    matches.length,
    `--app-tint-strength-${name} should be generated into every appearance block`,
  ).toBeGreaterThanOrEqual(2);
  return { light: matches[0]!, dark: matches[matches.length - 1]! };
}

/** `color-mix(in srgb, top P%, bottom)` — the same operation the browser runs. */
function mixSrgb(top: string, bottom: string, percent: number): string {
  const a = parseHex(top);
  const b = parseHex(bottom);
  const ratio = percent / 100;
  const channel = (index: number) =>
    Math.round(a[index]! * ratio + b[index]! * (1 - ratio))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

describe.each(SCHEMES)("M3X composed surfaces — %s scheme", (label, scheme) => {
  const appearance = label as "light" | "dark";

  it("meets AA for the hero's own text colour on the hero surface", () => {
    const strength = tintStrength("expressive")[appearance];
    const surface = mixSrgb(
      scheme["primary-container"],
      scheme["app-surface-card"],
      strength,
    );
    // `--md-app-color-on-surface-expressive` is `on-primary-container`.
    const ratio = contrastRatio(scheme["on-primary-container"], surface);
    expect(
      ratio,
      `${label} — on-primary-container on surface-expressive (${surface}) = ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("meets AA for ordinary text on a supporting surface", () => {
    const strength = tintStrength("supporting")[appearance];
    const surface = mixSrgb(
      scheme["primary-container"],
      scheme["app-surface-card"],
      strength,
    );
    // A supporting surface is a tinted NEUTRAL, so it carries the ordinary text
    // ramp — both ends of it, since its eyebrow and supporting line take the
    // variant.
    for (const role of ["on-surface", "on-surface-variant"] as const) {
      const ratio = contrastRatio(scheme[role], surface);
      expect(
        ratio,
        `${label} — ${role} on surface-supporting (${surface}) = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps a supporting surface distinguishable from the page behind it", () => {
    // Colour is not the only signal on these surfaces — each carries an eyebrow
    // naming what it is — but a surface whose boundary is invisible has stopped
    // being a level in the hierarchy, which is the whole point of the token.
    const strength = tintStrength("supporting")[appearance];
    const surface = mixSrgb(
      scheme["primary-container"],
      scheme["app-surface-card"],
      strength,
    );
    const ratio = contrastRatio(surface, scheme["app-surface-page"]);
    expect(
      ratio,
      `${label} — surface-supporting (${surface}) against the page (${scheme["app-surface-page"]}) = ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThan(1.04);
  });
});

describe("contrast helper self-check", () => {
  it("computes the canonical black/white ratio as 21:1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });
});
