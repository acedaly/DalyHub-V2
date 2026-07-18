/**
 * DS-01 — the colour token maps as data.
 *
 * `app/styles/tokens.css` is the authoritative SOURCE of every token value; this
 * module mirrors the two COLOUR maps (light + dark) as plain data so tests can
 * reason about them: completeness/parity against the CSS (both must define the
 * same names with the same values) and WCAG contrast of critical pairs. A sync
 * test (test/unit/tokens/tokens.test.ts) fails if this drifts from the CSS, so
 * the two never disagree.
 *
 * Keys are the semantic token names WITHOUT the `--dh-color-` prefix; values are
 * the literal colour strings used in each theme.
 */

/** The semantic colour token names (without the `--dh-color-` prefix). */
export const COLOR_TOKEN_NAMES = [
  "bg",
  "surface",
  "surface-raised",
  "surface-sunken",
  "text",
  "text-secondary",
  "text-muted",
  "on-accent",
  "border",
  "border-strong",
  "divider",
  "accent",
  "accent-hover",
  "accent-active",
  "accent-text",
  "accent-surface",
  "secondary",
  "secondary-hover",
  "success",
  "success-surface",
  "success-text",
  "warning",
  "warning-surface",
  "warning-text",
  "danger",
  "danger-surface",
  "danger-text",
  "info",
  "info-surface",
  "info-text",
  "hover-surface",
  "active-surface",
  "disabled-surface",
  "disabled-text",
  "disabled-border",
  "focus-ring",
  "selection-bg",
  "selection-text",
  "overlay",
] as const;

/** A semantic colour token name. */
export type ColorTokenName = (typeof COLOR_TOKEN_NAMES)[number];

/** A complete colour map: every semantic colour token to a concrete value. */
export type ColorMap = Readonly<Record<ColorTokenName, string>>;

/** The light theme colour map (default). Mirrors `:root` in tokens.css. */
export const lightTheme: ColorMap = {
  bg: "#ffffff",
  surface: "#f5f6f8",
  "surface-raised": "#ffffff",
  "surface-sunken": "#eceef2",
  text: "#1a1d23",
  "text-secondary": "#454b57",
  "text-muted": "#5b6270",
  "on-accent": "#ffffff",
  border: "#dfe2e8",
  "border-strong": "#c3c8d2",
  divider: "#e8eaef",
  accent: "#2952cc",
  "accent-hover": "#2247b0",
  "accent-active": "#1c3c96",
  "accent-text": "#2450c8",
  "accent-surface": "#eef3ff",
  secondary: "#eef0f4",
  "secondary-hover": "#e2e5eb",
  success: "#1f7a44",
  "success-surface": "#e6f4ec",
  "success-text": "#196236",
  warning: "#a76a00",
  "warning-surface": "#fbf0dc",
  "warning-text": "#855400",
  danger: "#c33025",
  "danger-surface": "#fbe9e7",
  "danger-text": "#a5271e",
  info: "#1f6fb2",
  "info-surface": "#e6f1fa",
  "info-text": "#185a91",
  "hover-surface": "#f0f1f4",
  "active-surface": "#e6e8ed",
  "disabled-surface": "#f0f1f4",
  "disabled-text": "#9aa0ac",
  "disabled-border": "#e0e2e8",
  "focus-ring": "#2952cc",
  "selection-bg": "#cddcff",
  "selection-text": "#10213f",
  overlay: "rgba(16, 18, 22, 0.5)",
};

/** The dark theme colour map. Mirrors both dark blocks in tokens.css. */
export const darkTheme: ColorMap = {
  bg: "#0f1115",
  surface: "#171a21",
  "surface-raised": "#1e222b",
  "surface-sunken": "#0b0d11",
  text: "#f2f3f5",
  "text-secondary": "#c4c9d2",
  "text-muted": "#9299a6",
  "on-accent": "#ffffff",
  border: "#2b2f39",
  "border-strong": "#3c414d",
  divider: "#23272f",
  accent: "#3b62d9",
  "accent-hover": "#4a70e6",
  "accent-active": "#5a7dee",
  "accent-text": "#8fa8ff",
  "accent-surface": "#1a2138",
  secondary: "#232833",
  "secondary-hover": "#2c313d",
  success: "#2f9c5c",
  "success-surface": "#10241a",
  "success-text": "#5cd18e",
  warning: "#cf9134",
  "warning-surface": "#241a0d",
  "warning-text": "#e6b35c",
  danger: "#e05548",
  "danger-surface": "#2a1210",
  "danger-text": "#f5988e",
  info: "#3a8fce",
  "info-surface": "#0e1e2b",
  "info-text": "#6fb8e6",
  "hover-surface": "#1d212a",
  "active-surface": "#252a34",
  "disabled-surface": "#191d25",
  "disabled-text": "#626875",
  "disabled-border": "#262b34",
  "focus-ring": "#8fa8ff",
  "selection-bg": "#2a3f6b",
  "selection-text": "#eaf0ff",
  overlay: "rgba(0, 0, 0, 0.6)",
};

/** The two named themes, keyed by their `data-theme` value. */
export const THEME_COLOR_MAPS = {
  light: lightTheme,
  dark: darkTheme,
} as const;
