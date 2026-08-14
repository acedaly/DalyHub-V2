/**
 * DS-01 — the DalyHub semantic token registry.
 *
 * `app/styles/tokens.css` holds the authoritative VALUES; this module publishes
 * the NAMES, so TypeScript can reference them and so the test suite has a list
 * to check the stylesheet against in both directions.
 *
 * Both directions matter, and the second one is the point. Checking that every
 * published name is defined catches a typo. Checking that every `--dh-` name
 * defined in the stylesheet is PUBLISHED is what stops the layer growing an
 * unpublished vocabulary — which is precisely how the token system this
 * replaces (ADR-074 Decision 8) turned into 219 names nobody had agreed to.
 *
 * The layering, from the bottom up:
 *
 *   --md-sys-*   Material's machinery: generated colour, typescale, shape,
 *   --md-app-*   elevation, state, motion, and the application surface ramp.
 *   --app-*      Structural values M3 does not own: spacing, sizing, z-index,
 *                breakpoints, shell measurements.
 *   --dh-*       THE DALYHUB DESIGN SYSTEM. What a component reaches for.
 *
 * A component written from DS-02 onward consumes the top layer. The layers
 * below it are implementation, and DS-08 is the stage that decides how much of
 * them is left.
 */

/** The colour vocabulary — surfaces, text, borders, accent, status. */
export const DALYHUB_COLOR_TOKEN_NAMES = [
  "dh-color-bg",
  "dh-color-bg-sunken",
  "dh-color-surface",
  "dh-color-surface-subtle",
  "dh-color-surface-raised",
  "dh-color-surface-quiet",
  "dh-color-surface-nav",
  "dh-color-surface-bar",
  "dh-color-surface-selected",
  /*
   * DS-03 — the rail's own six. The rail is dark in BOTH appearances, so it is
   * the one region whose foreground cannot be borrowed from the appearance
   * around it: `dh-color-text` is near-black in light, which is correct
   * everywhere else and invisible here.
   */
  "dh-color-rail",
  "dh-color-rail-text",
  "dh-color-rail-text-muted",
  "dh-color-rail-border",
  "dh-color-rail-selected",
  "dh-color-rail-focus",
  "dh-color-text",
  "dh-color-text-muted",
  "dh-color-text-on-accent",
  "dh-color-text-on-accent-subtle",
  "dh-color-text-on-danger",
  "dh-color-border",
  "dh-color-border-strong",
  "dh-color-accent",
  "dh-color-accent-subtle",
  "dh-color-danger",
  "dh-color-success",
  "dh-color-warning",
  "dh-color-overdue",
  "dh-color-focus",
  "dh-color-scrim",
] as const;

/** The 4px spacing scale, under DalyHub's own name. */
export const DALYHUB_SPACE_TOKEN_NAMES = [
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
] as const;

/** Corner radii, ordered by how much a surface is allowed to say. */
export const DALYHUB_RADIUS_TOKEN_NAMES = [
  "dh-radius-sm",
  "dh-radius-control",
  "dh-radius-md",
  "dh-radius-lg",
  "dh-radius-xl",
  "dh-radius-pill",
] as const;

/** Borders, depth and the focus indicator. */
export const DALYHUB_SURFACE_TOKEN_NAMES = [
  "dh-border-width",
  "dh-border-width-strong",
  "dh-elevation-flat",
  "dh-elevation-raised",
  "dh-elevation-overlay",
  "dh-elevation-modal",
  "dh-focus-width",
  "dh-focus-offset",
  "dh-focus-color",
] as const;

/** The seven type ROLES, each a size / line-height / weight triple. */
export const DALYHUB_TEXT_ROLES = [
  "page-title",
  "record-title",
  "section-title",
  "body",
  "row",
  "meta",
  "label",
] as const;

/** A DalyHub type role. */
export type DalyhubTextRole = (typeof DALYHUB_TEXT_ROLES)[number];

/** The three facets every type role defines. */
export const DALYHUB_TEXT_FACETS = ["size", "line-height", "weight"] as const;

/** Typography: the two families, the seven roles, and the numeric request. */
export const DALYHUB_TYPOGRAPHY_TOKEN_NAMES = [
  "dh-font-family",
  "dh-font-family-mono",
  "dh-font-numeric",
  ...DALYHUB_TEXT_ROLES.flatMap((role) =>
    DALYHUB_TEXT_FACETS.map((facet) => `dh-text-${role}-${facet}`),
  ),
] as const;

/** Durations and easings, named for what they are for. */
export const DALYHUB_MOTION_TOKEN_NAMES = [
  "dh-motion-none",
  "dh-motion-instant",
  "dh-motion-fast",
  "dh-motion-base",
  "dh-motion-slow",
  "dh-ease-standard",
  "dh-ease-enter",
  "dh-ease-exit",
  "dh-ease-emphasized",
] as const;

/**
 * The density-dependent tokens — and the WHOLE of them.
 *
 * Every preset defines exactly this set: no more (a token only some presets
 * define is a token only some components can rely on) and no fewer (a preset
 * that omits one inherits the previous rung's value, which is a preset that
 * silently is not one). Both halves are asserted.
 */
export const DALYHUB_DENSITY_TOKEN_NAMES = [
  "dh-control-height",
  "dh-menu-item-height",
  "dh-row-height",
  "dh-inset-inline",
  "dh-inset-block",
  "dh-surface-padding",
  "dh-control-gap",
  "dh-icon-size",
] as const;

/**
 * The three densities, in order from tightest to loosest.
 *
 * `default` is what a document gets with no `data-dh-density` attribute at all,
 * it is both a named preset and the base. `compact` is desktop-only in effect:
 * on a coarse pointer its hit areas are floored back to the touch minimum by
 * `tokens.css`, unconditionally.
 */
export const DALYHUB_DENSITIES = ["compact", "default", "touch"] as const;

/**
 * DS-03 — the SHELL's own measurements.
 *
 * Deliberately a separate list from the density tokens above, and the separation
 * is the contract rather than filing. A density token is a preference: three
 * presets define all eight of them and a region may declare its own. A shell
 * measurement is a product decision about the one frame the application has, so
 * it belongs to nobody's preset — asserted by `dalyhub-tokens.test.ts`, which
 * requires each density block to define exactly the eight names above.
 */
export const DALYHUB_SHELL_TOKEN_NAMES = [
  "dh-shell-rail-width",
  "dh-shell-rail-width-collapsed",
  "dh-shell-bar-height",
  "dh-shell-mobile-bar-height",
  "dh-shell-nav-row-height",
  "dh-shell-gutter",
  "dh-shell-content-max-width",
] as const;

/**
 * DS-03 — the display cutout insets.
 *
 * The one definition MOBILE-01 consolidated 53 scattered `env()` calls into,
 * published in the vocabulary a component reaches for. Each is always a length
 * (the `0px` fallback is inherited from `--app-safe-area-*`), so they compose
 * inside `calc()` and `max()` on every browser — including the desktop ones
 * where the environment variable does not exist at all.
 */
export const DALYHUB_SAFE_AREA_TOKEN_NAMES = [
  "dh-safe-top",
  "dh-safe-right",
  "dh-safe-bottom",
  "dh-safe-left",
] as const;

/** A DalyHub density name. */
export type DalyhubDensity = (typeof DALYHUB_DENSITIES)[number];

/** The density a document has when it declares none. */
export const DEFAULT_DENSITY: DalyhubDensity = "default";

/** Every published `--dh-*` token name, without the leading `--`. */
export const DALYHUB_TOKEN_NAMES: readonly string[] = [
  ...DALYHUB_COLOR_TOKEN_NAMES,
  ...DALYHUB_SPACE_TOKEN_NAMES,
  ...DALYHUB_RADIUS_TOKEN_NAMES,
  ...DALYHUB_SURFACE_TOKEN_NAMES,
  ...DALYHUB_TYPOGRAPHY_TOKEN_NAMES,
  ...DALYHUB_MOTION_TOKEN_NAMES,
  ...DALYHUB_DENSITY_TOKEN_NAMES,
  ...DALYHUB_SHELL_TOKEN_NAMES,
  ...DALYHUB_SAFE_AREA_TOKEN_NAMES,
];

/**
 * Build a `var(--dh-…)` reference for a DalyHub token.
 *
 * The name is given without the leading `--`, e.g. `dhVar("dh-space-4")`. Use
 * this rather than a string literal wherever a component genuinely needs an
 * inline token reference, so the name is greppable and checked.
 */
export function dhVar(name: (typeof DALYHUB_TOKEN_NAMES)[number]): string {
  return `var(--${name})`;
}
