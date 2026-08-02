/**
 * DS-01 / THEME-01 — WCAG 2.2 contrast for every curated theme.
 *
 * Computes the WCAG relative-luminance contrast ratio for the token pairs that
 * carry text or a meaningful UI boundary, in EVERY curated theme, and asserts they meet
 * AA (4.5:1 normal text, 3:1 large text / non-text UI). The palette is checked, not
 * assumed (AGENTS.md §15), and a new theme cannot be added without passing.
 *
 * Values come from the TS colour maps, which `tokens.test.ts` proves identical to
 * the authoritative CSS.
 */

import { describe, expect, it } from "vitest";

import { THEME_IDS } from "~/kernel/preferences/theme-preference";
import {
  ENTITY_ACCENT_NAMES,
  THEME_COLOR_MAPS,
  THEME_ENTITY_ACCENTS,
  type ColorMap,
  type ColorTokenName,
} from "~/shared/tokens";

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
  readonly note: string;
}

/** The surfaces text is actually rendered on. */
const TEXT_SURFACES = [
  "bg",
  "surface",
  "surface-raised",
  "surface-card",
  "surface-nav",
  "surface-header",
] as const satisfies readonly ColorTokenName[];

/** The text ramp, which must clear 4.5:1 on every surface above. */
const TEXT_FOREGROUNDS = [
  "text",
  "text-secondary",
  "text-muted",
] as const satisfies readonly ColorTokenName[];

function textRampPairs(): Pair[] {
  const pairs: Pair[] = [];
  for (const fg of TEXT_FOREGROUNDS) {
    for (const bg of TEXT_SURFACES) {
      pairs.push({ fg, bg, note: `${fg} on ${bg}` });
    }
  }
  return pairs;
}

/** Tinted surfaces, each with the text token that sits on it. */
const TINTED_PAIRS: readonly Pair[] = [
  { fg: "success-text", bg: "success-surface", note: "success" },
  { fg: "warning-text", bg: "warning-surface", note: "warning" },
  { fg: "danger-text", bg: "danger-surface", note: "danger" },
  { fg: "info-text", bg: "info-surface", note: "info" },
  { fg: "accent-text", bg: "accent-surface", note: "accent tint" },
  { fg: "priority-p1-text", bg: "priority-p1-surface", note: "P1 chip" },
  { fg: "priority-p2-text", bg: "priority-p2-surface", note: "P2 chip" },
  { fg: "priority-p3-text", bg: "priority-p3-surface", note: "P3 chip" },
  { fg: "priority-p4-text", bg: "priority-p4-surface", note: "P4 chip" },
  { fg: "state-overdue-text", bg: "state-overdue-surface", note: "overdue" },
  { fg: "state-due-soon-text", bg: "state-due-soon-surface", note: "due soon" },
  {
    fg: "state-completed-text",
    bg: "state-completed-surface",
    note: "completed",
  },
  { fg: "state-waiting-text", bg: "state-waiting-surface", note: "waiting" },
  { fg: "state-on-hold-text", bg: "state-on-hold-surface", note: "on hold" },
  { fg: "selection-text", bg: "selection-bg", note: "text selection" },
  // THEME-02 — the selected navigation row. Its label sits on its own tint, so it
  // is checked like every other tinted surface rather than assumed readable
  // because the tint is "subtle".
  {
    fg: "nav-selected-text",
    bg: "nav-selected-surface",
    note: "selected navigation row",
  },
];

/** Foregrounds that must also be readable directly on the page background. */
const ON_BACKGROUND_PAIRS: readonly Pair[] = [
  { fg: "accent-text", bg: "bg", note: "accent link on background" },
  { fg: "accent-text", bg: "surface", note: "accent link on surface" },
  { fg: "link", bg: "bg", note: "link on background" },
  { fg: "link", bg: "surface-card", note: "link on a card" },
  { fg: "link-hover", bg: "bg", note: "hovered link on background" },
  { fg: "success-text", bg: "bg", note: "success text on background" },
  { fg: "warning-text", bg: "bg", note: "warning text on background" },
  { fg: "danger-text", bg: "bg", note: "danger text on background" },
  { fg: "info-text", bg: "bg", note: "info text on background" },
  { fg: "state-waiting-text", bg: "surface", note: "waiting text on surface" },
  { fg: "state-on-hold-text", bg: "surface", note: "on-hold text on surface" },
  // The selected row is painted on the navigation surface, so its label has to
  // clear AA there too: a theme could otherwise pick a tint that is invisible
  // against its own rail and only the tint pairing above would notice.
  {
    fg: "nav-selected-text",
    bg: "surface-nav",
    note: "selected navigation label on the rail",
  },
];

/** Text on a filled control, in every interactive state. */
const ON_ACCENT_PAIRS: readonly Pair[] = [
  { fg: "on-accent", bg: "accent", note: "label on the accent fill" },
  { fg: "on-accent", bg: "accent-hover", note: "label on a hovered fill" },
  { fg: "on-accent", bg: "accent-active", note: "label on a pressed fill" },
];

/**
 * Non-text UI pairs (3:1) — anything whose SHAPE or PRESENCE carries meaning: the
 * focus ring, a filled control, a form-control boundary, a progress bar, a priority
 * dot, a status dot and every chart series.
 */
const UI_PAIRS: readonly Pair[] = [
  { fg: "focus-ring", bg: "bg", note: "focus ring on background" },
  { fg: "focus-ring", bg: "surface", note: "focus ring on surface" },
  { fg: "focus-ring", bg: "surface-card", note: "focus ring on a card" },
  { fg: "focus-ring", bg: "surface-nav", note: "focus ring in navigation" },
  { fg: "accent", bg: "bg", note: "accent fill on background" },
  { fg: "accent", bg: "surface", note: "accent fill on surface" },
  { fg: "accent", bg: "surface-card", note: "accent fill on a card" },
  { fg: "control-border", bg: "bg", note: "control boundary on background" },
  { fg: "control-border", bg: "surface", note: "control boundary on surface" },
  {
    fg: "control-border",
    bg: "surface-raised",
    note: "control boundary on an elevated surface",
  },
  {
    fg: "control-border",
    bg: "surface-card",
    note: "control boundary on a card",
  },
  { fg: "progress-fill", bg: "progress-track", note: "progress against track" },
  {
    fg: "progress-complete",
    bg: "progress-track",
    note: "completed progress against track",
  },
  { fg: "priority-p1", bg: "bg", note: "P1 indicator" },
  { fg: "priority-p2", bg: "bg", note: "P2 indicator" },
  { fg: "priority-p3", bg: "bg", note: "P3 indicator" },
  { fg: "priority-p4", bg: "bg", note: "P4 indicator" },
  { fg: "state-overdue", bg: "bg", note: "overdue indicator" },
  { fg: "state-due-soon", bg: "bg", note: "due-soon indicator" },
  { fg: "state-completed", bg: "bg", note: "completed indicator" },
  { fg: "state-waiting", bg: "bg", note: "waiting indicator" },
  { fg: "state-on-hold", bg: "bg", note: "on-hold indicator" },
  { fg: "chart-1", bg: "surface-card", note: "chart series 1" },
  { fg: "chart-2", bg: "surface-card", note: "chart series 2" },
  { fg: "chart-3", bg: "surface-card", note: "chart series 3" },
  { fg: "chart-4", bg: "surface-card", note: "chart series 4" },
  { fg: "chart-5", bg: "surface-card", note: "chart series 5" },
  { fg: "chart-6", bg: "surface-card", note: "chart series 6" },
];

function runPairs(
  themeId: string,
  theme: ColorMap,
  pairs: readonly Pair[],
  min: number,
) {
  for (const pair of pairs) {
    const ratio = contrastRatio(theme[pair.fg], theme[pair.bg]);
    expect(
      ratio,
      `${themeId} — ${pair.note}: ${theme[pair.fg]} on ${theme[pair.bg]} = ${ratio.toFixed(2)}:1 (min ${min})`,
    ).toBeGreaterThanOrEqual(min);
  }
}

describe.each(THEME_IDS)("THEME-01 contrast — %s", (themeId) => {
  const theme = THEME_COLOR_MAPS[themeId];

  it("meets AA for the text ramp on every surface", () => {
    runPairs(themeId, theme, textRampPairs(), 4.5);
  });

  it("meets AA for text on every tinted surface", () => {
    runPairs(themeId, theme, TINTED_PAIRS, 4.5);
  });

  it("meets AA for status and link text on the page background", () => {
    runPairs(themeId, theme, ON_BACKGROUND_PAIRS, 4.5);
  });

  it("meets AA for a label on a filled control in every state", () => {
    runPairs(themeId, theme, ON_ACCENT_PAIRS, 4.5);
  });

  it("meets AA for non-text UI (focus, controls, progress, charts)", () => {
    runPairs(themeId, theme, UI_PAIRS, 3);
  });

  it("keeps every entity identity accent visible on the page background", () => {
    for (const entity of ENTITY_ACCENT_NAMES) {
      const accent = THEME_ENTITY_ACCENTS[themeId][entity];
      const ratio = contrastRatio(accent, theme.bg);
      expect(
        ratio,
        `${themeId} — ${entity} accent ${accent} on ${theme.bg} = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps priority levels distinguishable from one another", () => {
    // Priority is never colour-only (the chip always carries a P1–P4 tag), but
    // when colour IS perceived it must not collapse into one hue.
    const levels = [
      theme["priority-p1"],
      theme["priority-p2"],
      theme["priority-p3"],
      theme["priority-p4"],
    ];
    expect(new Set(levels).size).toBe(levels.length);
  });

  it("keeps the chart series distinguishable from one another", () => {
    const series = [
      theme["chart-1"],
      theme["chart-2"],
      theme["chart-3"],
      theme["chart-4"],
      theme["chart-5"],
      theme["chart-6"],
    ];
    expect(new Set(series).size).toBe(series.length);
  });
});

describe("THEME-01 Ember does not read as a warning", () => {
  it("keeps the accent clearly distinct from danger and warning", () => {
    // Ember's terracotta accent sits at the warm end of the palette. An ordinary
    // primary button must never look like a destructive one, so the accent and the
    // danger colour are held apart deliberately: danger is the redder, less orange
    // of the two.
    const ember = THEME_COLOR_MAPS.ember;
    expect(ember.accent).not.toBe(ember.danger);
    expect(ember.accent).not.toBe(ember.warning);
    const [accentRed, , accentBlue] = parseHex(ember.accent);
    const [dangerRed, , dangerBlue] = parseHex(ember.danger);
    expect(dangerRed - dangerBlue).toBeGreaterThan(accentRed - accentBlue);
  });
});

describe("contrast helper self-check", () => {
  it("computes the canonical black/white ratio as 21:1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });
});
