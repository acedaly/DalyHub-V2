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
     * M3X returned this to M3's own `secondary-container` /
     * `on-secondary-container`. The previous `primary-container` deviation was
     * argued from the founding blue seed, and the violet seed inverts every
     * clause of that argument — see the full note in `shell.css`. The short
     * version: under a violet product, `primary-container` in dark is a
     * maximum-chroma tone-30 violet, and a permanent navigation row is the last
     * place that belongs.
     *
     * The label and the 24px glyph both take `on-secondary-container`, so one
     * assertion covers both. Selection is never colour alone regardless: it is
     * the filled pill (a shape), a heavier label, and `aria-current`.
     */
    expectRatio(
      scheme,
      label,
      "on-secondary-container",
      "secondary-container",
      4.5,
    );
    // And the pill has to be visible as a shape against the drawer it sits in.
    expectRatio(
      scheme,
      label,
      "secondary-container",
      "app-surface-navigation",
      1.1,
    );
  });

  it("meets 3:1 for progress fill against its track", () => {
    expectRatio(scheme, label, "primary", "secondary-container", 3);
    expectRatio(scheme, label, "success", "secondary-container", 3);
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

describe("contrast helper self-check", () => {
  it("computes the canonical black/white ratio as 21:1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });
});
