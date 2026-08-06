/**
 * M3-01 — the typed token registry for components and tests.
 *
 * `app/styles/tokens.css` holds the authoritative VALUES; this module names the
 * tokens so TypeScript can reference them safely. Components style themselves in
 * CSS (classes that consume `var(--md-sys-*)`); when a component genuinely needs
 * an inline token reference, it uses `cssVar(...)` here so the name is checked
 * and greppable rather than a stringly-typed literal.
 *
 * The exported name lists double as the contract the token tests enforce: every
 * required token must exist in the stylesheet, and no consumed `var(--md-*)` may
 * reference a token the stylesheet never defines. The COLOUR names are not
 * listed here — they are generated, and `scheme.ts` is their registry.
 */

import { SCHEME_ROLE_NAMES, type SchemeRole } from "./scheme";

export type { SchemeRole } from "./scheme";
export { SCHEME_ROLE_NAMES } from "./scheme";

/** Breakpoint values in pixels. Mirrors the `--app-breakpoint-*` tokens in CSS
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

/** The fifteen M3 type styles. */
export const TYPESCALE_STYLES = [
  "display-large",
  "display-medium",
  "display-small",
  "headline-large",
  "headline-medium",
  "headline-small",
  "title-large",
  "title-medium",
  "title-small",
  "body-large",
  "body-medium",
  "body-small",
  "label-large",
  "label-medium",
  "label-small",
] as const;

/** An M3 type style name. */
export type TypescaleStyle = (typeof TYPESCALE_STYLES)[number];

/** The four facets every type style defines. */
export const TYPESCALE_FACETS = [
  "size",
  "line-height",
  "weight",
  "tracking",
] as const;

/** Non-colour token groups whose names the token tests require to exist in the
 * stylesheet. Each entry is the token name without the leading `--`. */
export const STRUCTURAL_TOKEN_NAMES = {
  typeface: ["md-ref-typeface-plain", "md-ref-typeface-mono"],
  typescale: TYPESCALE_STYLES.flatMap((style) =>
    TYPESCALE_FACETS.map((facet) => `md-sys-typescale-${style}-${facet}`),
  ),
  shape: [
    "md-sys-shape-corner-none",
    "md-sys-shape-corner-extra-small",
    "md-sys-shape-corner-small",
    "md-sys-shape-corner-medium",
    "md-sys-shape-corner-large",
    "md-sys-shape-corner-extra-large",
    "md-sys-shape-corner-full",
  ],
  elevation: [
    "md-sys-elevation-1",
    "md-sys-elevation-2",
    "md-sys-elevation-3",
    "md-sys-elevation-4",
    "md-sys-elevation-5",
  ],
  state: [
    "md-sys-state-hover-state-layer-opacity",
    "md-sys-state-focus-state-layer-opacity",
    "md-sys-state-pressed-state-layer-opacity",
    "md-sys-state-dragged-state-layer-opacity",
    "md-sys-state-disabled-container-opacity",
    "md-sys-state-disabled-content-opacity",
  ],
  motion: [
    "md-sys-motion-duration-none",
    "md-sys-motion-duration-short1",
    "md-sys-motion-duration-short2",
    "md-sys-motion-duration-short3",
    "md-sys-motion-duration-short4",
    "md-sys-motion-duration-medium1",
    "md-sys-motion-duration-medium2",
    "md-sys-motion-duration-medium3",
    "md-sys-motion-duration-medium4",
    "md-sys-motion-duration-long1",
    "md-sys-motion-duration-long2",
    "md-sys-motion-duration-long3",
    "md-sys-motion-duration-long4",
    "md-sys-motion-easing-standard",
    "md-sys-motion-easing-standard-decelerate",
    "md-sys-motion-easing-standard-accelerate",
    "md-sys-motion-easing-emphasized",
    "md-sys-motion-easing-emphasized-decelerate",
    "md-sys-motion-easing-emphasized-accelerate",
  ],
  spacing: [
    "app-space-0",
    "app-space-px",
    "app-space-1",
    "app-space-2",
    "app-space-3",
    "app-space-4",
    "app-space-5",
    "app-space-6",
    "app-space-8",
    "app-space-10",
    "app-space-12",
    "app-space-16",
  ],
  sizing: [
    "app-control-height-sm",
    "app-control-height-md",
    "app-control-height-lg",
    "app-touch-target-min",
    "app-width-prose",
    "app-width-narrow",
    "app-width-content",
    "app-width-wide",
    "app-width-dashboard",
    "app-shell-header-height",
    "app-shell-nav-width",
    "app-inspector-width",
    "app-gutter",
    "app-border-width-thin",
    "app-border-width-thick",
  ],
  layout: [
    "app-breakpoint-sm",
    "app-breakpoint-md",
    "app-breakpoint-lg",
    "app-breakpoint-xl",
    "app-breakpoint-2xl",
    "app-z-base",
    "app-z-raised",
    "app-z-sticky",
    "app-z-dropdown",
    "app-z-overlay",
    "app-z-drawer",
    "app-z-modal",
    "app-z-toast",
    "app-z-tooltip",
  ],
} as const satisfies Record<string, readonly string[]>;

/** Every required token custom-property name (colour + structural), without the
 * leading `--`. This is the full set the token tests guarantee the stylesheet
 * defines. */
export const REQUIRED_TOKEN_NAMES: readonly string[] = [
  ...SCHEME_ROLE_NAMES.map((role) =>
    role.startsWith("app-")
      ? `md-app-color-${role.slice("app-".length)}`
      : `md-sys-color-${role}`,
  ),
  ...Object.values(STRUCTURAL_TOKEN_NAMES).flat(),
];

/** Build a `var(--md-sys-color-<role>)` reference for a semantic colour role.
 * The four application surfaces live under `--md-app-color-*` instead. */
export function colorVar(role: SchemeRole): string {
  return role.startsWith("app-")
    ? `var(--md-app-color-${role.slice("app-".length)})`
    : `var(--md-sys-color-${role})`;
}

/** Build a `var(--<name>)` reference for any token custom property (the name is
 * given without the leading `--`, e.g. `cssVar("app-space-4")`). */
export function cssVar(name: string): string {
  return `var(--${name})`;
}
