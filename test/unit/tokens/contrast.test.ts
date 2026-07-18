/**
 * DS-01 — WCAG 2.2 contrast for critical colour combinations.
 *
 * Computes the WCAG relative-luminance contrast ratio for the token pairs that
 * carry text or meaningful UI boundaries, in BOTH themes, and asserts they meet
 * AA (4.5:1 normal text, 3:1 large text / non-text UI). The palette is checked,
 * not assumed (AGENTS.md §15). Values come from the TS colour maps, which a
 * separate test proves identical to the authoritative CSS.
 */

import { describe, expect, it } from "vitest";

import {
  darkTheme,
  lightTheme,
  type ColorMap,
  type ColorTokenName,
} from "~/shared/tokens/theme-colors";

/** Parse a `#rgb`/`#rrggbb` hex string to [r, g, b] in 0–255. */
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
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

interface Pair {
  readonly fg: ColorTokenName;
  readonly bg: ColorTokenName;
  readonly min: number;
  readonly note: string;
}

/** Normal text needs 4.5:1; non-text UI (focus ring, control fills) needs 3:1. */
const TEXT_PAIRS: readonly Pair[] = [
  { fg: "text", bg: "bg", min: 4.5, note: "primary text on background" },
  { fg: "text", bg: "surface", min: 4.5, note: "primary text on surface" },
  {
    fg: "text",
    bg: "surface-raised",
    min: 4.5,
    note: "primary text on elevated surface",
  },
  {
    fg: "text-secondary",
    bg: "bg",
    min: 4.5,
    note: "secondary text on background",
  },
  {
    fg: "text-secondary",
    bg: "surface",
    min: 4.5,
    note: "secondary text on surface",
  },
  { fg: "text-muted", bg: "bg", min: 4.5, note: "muted text on background" },
  {
    fg: "text-muted",
    bg: "surface",
    min: 4.5,
    note: "muted text on surface",
  },
  { fg: "on-accent", bg: "accent", min: 4.5, note: "text on accent fill" },
  { fg: "accent-text", bg: "bg", min: 4.5, note: "accent link on background" },
  {
    fg: "accent-text",
    bg: "surface",
    min: 4.5,
    note: "accent link on surface",
  },
  {
    fg: "success-text",
    bg: "success-surface",
    min: 4.5,
    note: "success text on success surface",
  },
  {
    fg: "warning-text",
    bg: "warning-surface",
    min: 4.5,
    note: "warning text on warning surface",
  },
  {
    fg: "danger-text",
    bg: "danger-surface",
    min: 4.5,
    note: "danger text on danger surface",
  },
  {
    fg: "info-text",
    bg: "info-surface",
    min: 4.5,
    note: "info text on info surface",
  },
];

/** Non-text UI pairs (3:1). */
const UI_PAIRS: readonly Pair[] = [
  { fg: "focus-ring", bg: "bg", min: 3, note: "focus ring on background" },
  { fg: "focus-ring", bg: "surface", min: 3, note: "focus ring on surface" },
  { fg: "accent", bg: "bg", min: 3, note: "accent fill on background" },
  {
    fg: "selection-text",
    bg: "selection-bg",
    min: 4.5,
    note: "selected text on selection background",
  },
];

function runPairs(theme: ColorMap, pairs: readonly Pair[]) {
  for (const pair of pairs) {
    const ratio = contrastRatio(theme[pair.fg], theme[pair.bg]);
    expect(
      ratio,
      `${pair.note}: ${theme[pair.fg]} on ${theme[pair.bg]} = ${ratio.toFixed(2)}:1 (min ${pair.min})`,
    ).toBeGreaterThanOrEqual(pair.min);
  }
}

describe("DS-01 contrast — light theme", () => {
  it("meets AA for text pairs", () => runPairs(lightTheme, TEXT_PAIRS));
  it("meets AA for UI pairs", () => runPairs(lightTheme, UI_PAIRS));
});

describe("DS-01 contrast — dark theme", () => {
  it("meets AA for text pairs", () => runPairs(darkTheme, TEXT_PAIRS));
  it("meets AA for UI pairs", () => runPairs(darkTheme, UI_PAIRS));
});

describe("contrast helper self-check", () => {
  it("computes the canonical black/white ratio as 21:1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });
});
