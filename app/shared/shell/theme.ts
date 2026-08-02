/**
 * THEME-01 — the DalyHub theme registry (owner-facing presentation).
 *
 * The persisted CONTRACT — which theme ids are legal, how a stored or cookie value
 * is parsed, and how the first-paint cookie is serialised — lives in the kernel
 * (`app/kernel/preferences/theme-preference.ts`), because the theme is a real owner
 * preference. This module adds the part that is a design-system concern: what each
 * theme is CALLED, how it is described, and whether it presents as light or dark.
 *
 * Everything from the kernel contract is re-exported here, so the shell, the
 * Settings UI and the tests have one import site and there is still exactly one
 * theme list in the codebase.
 *
 * ── The seven curated themes ──────────────────────────────────────────────────
 *   daly-light    light   the calm warm-neutral default
 *   daly-dark     dark    a designed dark theme, not an inversion
 *   modern-light  light   THEME-02: warm off-white page, white cards, teal accent
 *   modern-dark   dark    THEME-02: layered charcoal, controlled indigo accent
 *   eucalypt      light   warm stone surfaces, muted sage accent
 *   coastal       light   cool neutrals, sea-glass blue accent
 *   ember         light   warm neutrals, terracotta accent
 *
 * plus the `system` APPEARANCE MODE, which pairs Daly Light with Daly Dark.
 *
 * Modern Light and Modern Dark are the one PAIR in the registry: they are designed
 * as two treatments of a single visual system, so an owner can move between them
 * for time of day without the application changing shape. Every other theme is a
 * standalone palette.
 *
 * Components never branch on the theme. A theme is a complete map over the same
 * semantic tokens (`app/styles/tokens.css`), so a component styled once is correct
 * in all of them.
 */

import {
  SYSTEM_THEME,
  type ThemeAppearance,
  type ThemeId,
} from "~/kernel/preferences/theme-preference";

export {
  DEFAULT_DARK_THEME,
  DEFAULT_LIGHT_THEME,
  DEFAULT_THEME,
  SYSTEM_THEME,
  THEME_COOKIE_MAX_AGE,
  THEME_COOKIE_NAME,
  THEME_IDS,
  THEME_PREFERENCES,
  isThemeId,
  isThemePreference,
  parseThemePreference,
  readThemePreference,
  resolveThemeId,
  serializeThemeCookie,
  type ThemeAppearance,
  type ThemeId,
  type ThemePreference,
} from "~/kernel/preferences/theme-preference";

/** A theme's owner-facing presentation in Settings. */
export interface ThemeDescriptor {
  /** The stable id written to `<html data-theme>` and stored in preferences. */
  readonly id: ThemeId;
  /** The friendly display name. The owner never sees the raw id. */
  readonly name: string;
  /** One short sentence describing the feel, in plain Australian English. */
  readonly description: string;
  /** Whether this theme is light or dark, so Settings can group and label it. */
  readonly appearance: ThemeAppearance;
}

/**
 * The curated themes, in the order Settings presents them: the default first, its
 * dark counterpart second, the Modern pair next, then the three character themes.
 *
 * Each theme is SELF-CONTAINED — one complete palette. Even the Modern pair, which
 * is designed as a light/dark set, is two separately choosable themes: a theme
 * never changes when the operating-system appearance changes, because only the
 * `system` appearance mode does that.
 */
export const THEMES: readonly ThemeDescriptor[] = [
  {
    id: "daly-light",
    name: "Daly Light",
    description:
      "Warm off-white surfaces with a restrained blue-green accent. The calm default.",
    appearance: "light",
  },
  {
    id: "daly-dark",
    name: "Daly Dark",
    description:
      "Layered charcoal surfaces and softened text, built for dark rooms and long evenings.",
    appearance: "dark",
  },
  {
    id: "modern-light",
    name: "Modern Light",
    description:
      "A soft off-white page with clean white cards and a teal accent. Bright, calm and personal.",
    appearance: "light",
  },
  {
    id: "modern-dark",
    name: "Modern Dark",
    description:
      "Layered charcoal surfaces with a controlled indigo accent. The same layout, dimmed for the evening.",
    appearance: "dark",
  },
  {
    id: "eucalypt",
    name: "Eucalypt",
    description:
      "Warm stone surfaces with a muted sage green. Grounded and quiet.",
    appearance: "light",
  },
  {
    id: "coastal",
    name: "Coastal",
    description:
      "Cool neutral surfaces with a sea-glass blue. Fresh without being cold.",
    appearance: "light",
  },
  {
    id: "ember",
    name: "Ember",
    description:
      "Warm neutral surfaces with a terracotta accent, for anyone tired of blue.",
    appearance: "light",
  },
];

/**
 * The `system` appearance mode, presented alongside the themes in Settings so the
 * owner sees one list of choices rather than a mode control plus a theme control.
 */
export const SYSTEM_THEME_OPTION = {
  id: SYSTEM_THEME,
  name: "Match system",
  description:
    "Follows your device: Daly Light normally, Daly Dark when your system switches to dark.",
} as const;

const THEMES_BY_ID: ReadonlyMap<ThemeId, ThemeDescriptor> = new Map(
  THEMES.map((theme) => [theme.id, theme]),
);

/** The descriptor for a curated theme id. */
export function themeById(id: ThemeId): ThemeDescriptor {
  const descriptor = THEMES_BY_ID.get(id);
  if (descriptor === undefined) {
    // Unreachable for a typed id; keeps the accessor total for runtime callers.
    throw new Error(`unknown theme id: ${id}`);
  }
  return descriptor;
}

/**
 * The display name for any preference, including `system`. Used wherever the
 * current choice is announced (Settings status text, the About screen).
 */
export function themePreferenceName(preference: string): string {
  if (preference === SYSTEM_THEME) {
    return SYSTEM_THEME_OPTION.name;
  }
  const descriptor = THEMES_BY_ID.get(preference as ThemeId);
  return descriptor?.name ?? SYSTEM_THEME_OPTION.name;
}
