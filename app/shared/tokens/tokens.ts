/**
 * DS-01 — the typed token registry for components and tests.
 *
 * `app/styles/tokens.css` holds the authoritative VALUES; this module names the
 * tokens so TypeScript can reference them safely. Components style themselves in
 * CSS (classes that consume `var(--dh-*)`); when a component genuinely needs an
 * inline token reference, it uses `cssVar(...)` here so the name is checked and
 * greppable rather than a stringly-typed literal.
 *
 * The exported name lists double as the contract the DS-01 tests enforce: every
 * required semantic token must exist in the stylesheet, and no consumed
 * `var(--dh-*)` may reference a token the stylesheet never defines.
 */

import { COLOR_TOKEN_NAMES, type ColorTokenName } from "./theme-colors";

export type { ColorTokenName } from "./theme-colors";
export { COLOR_TOKEN_NAMES } from "./theme-colors";

/** Breakpoint values in pixels. Mirrors the `--dh-breakpoint-*` tokens in CSS
 * (media queries cannot read custom properties); a test keeps them in sync. */
export const BREAKPOINTS = {
  sm: 480,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
} as const;

/** A breakpoint name. */
export type BreakpointName = keyof typeof BREAKPOINTS;

/** Non-colour token groups whose names DS-01 requires to exist in the stylesheet.
 * Each entry is the token name without the leading `--`. */
export const STRUCTURAL_TOKEN_NAMES = {
  typography: [
    "dh-font-sans",
    "dh-font-mono",
    "dh-font-size-2xs",
    "dh-font-size-xs",
    "dh-font-size-sm",
    "dh-font-size-base",
    "dh-font-size-md",
    "dh-font-size-lg",
    "dh-font-size-xl",
    "dh-font-size-2xl",
    "dh-font-size-3xl",
    "dh-line-height-tight",
    "dh-line-height-snug",
    "dh-line-height-normal",
    "dh-line-height-relaxed",
    "dh-font-weight-regular",
    "dh-font-weight-medium",
    "dh-font-weight-semibold",
    "dh-font-weight-bold",
    "dh-letter-spacing-tight",
    "dh-letter-spacing-normal",
    "dh-letter-spacing-wide",
    "dh-letter-spacing-wider",
  ],
  spacing: [
    "dh-space-0",
    "dh-space-px",
    "dh-space-1",
    "dh-space-2",
    "dh-space-3",
    "dh-space-4",
    "dh-space-5",
    "dh-space-6",
    "dh-space-8",
    "dh-space-10",
    "dh-space-12",
    "dh-space-16",
  ],
  sizing: [
    "dh-control-height-sm",
    "dh-control-height-md",
    "dh-control-height-lg",
    "dh-touch-target-min",
    "dh-width-prose",
    "dh-width-narrow",
    "dh-width-content",
    "dh-width-wide",
    "dh-shell-header-height",
    "dh-shell-nav-width",
    "dh-gutter",
  ],
  shape: [
    "dh-border-width-thin",
    "dh-border-width-thick",
    "dh-radius-xs",
    "dh-radius-sm",
    "dh-radius-md",
    "dh-radius-lg",
    "dh-radius-xl",
    "dh-radius-full",
  ],
  elevation: [
    "dh-shadow-sm",
    "dh-shadow-md",
    "dh-shadow-lg",
    "dh-shadow-focus",
  ],
  motion: [
    "dh-duration-instant",
    "dh-duration-fast",
    "dh-duration-base",
    "dh-duration-slow",
    "dh-ease-standard",
    "dh-ease-emphasized",
    "dh-ease-exit",
  ],
  layout: [
    "dh-breakpoint-sm",
    "dh-breakpoint-md",
    "dh-breakpoint-lg",
    "dh-breakpoint-xl",
    "dh-breakpoint-2xl",
    "dh-z-base",
    "dh-z-raised",
    "dh-z-sticky",
    "dh-z-dropdown",
    "dh-z-overlay",
    "dh-z-drawer",
    "dh-z-modal",
    "dh-z-toast",
    "dh-z-tooltip",
  ],
} as const satisfies Record<string, readonly string[]>;

/** Every required token custom-property name (colour + structural), without the
 * leading `--`. This is the full set DS-01 guarantees the stylesheet defines. */
export const REQUIRED_TOKEN_NAMES: readonly string[] = [
  ...COLOR_TOKEN_NAMES.map((name) => `dh-color-${name}`),
  ...Object.values(STRUCTURAL_TOKEN_NAMES).flat(),
];

/** Build a `var(--dh-color-<name>)` reference for a semantic colour token. */
export function colorVar(name: ColorTokenName): string {
  return `var(--dh-color-${name})`;
}

/** Build a `var(--<name>)` reference for any token custom property (the name is
 * given without the leading `--`, e.g. `cssVar("dh-space-4")`). */
export function cssVar(name: string): string {
  return `var(--${name})`;
}
