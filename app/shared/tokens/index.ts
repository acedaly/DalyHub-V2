/**
 * The public entry for the design token registry.
 *
 * Import token names, the breakpoint scale, the generated colour scheme and the
 * `cssVar`/`colorVar` helpers from here. The authoritative token VALUES live in
 * `app/styles/tokens.css`; this package is the typed, greppable surface over
 * them, and `scripts/generate-m3-scheme.mjs` writes both halves so they cannot
 * disagree.
 *
 * DS-01 added the DALYHUB layer (`--dh-*`) on top: the product-owned semantic
 * vocabulary a component is meant to reach for, and the density model. The M3
 * and structural registries below it are implementation, and stay exported
 * because the migration is deliberately gradual — see `./dalyhub`.
 */

export {
  BREAKPOINTS,
  REQUIRED_TOKEN_NAMES,
  SCHEME_ROLE_NAMES,
  STRUCTURAL_TOKEN_NAMES,
  TYPESCALE_FACETS,
  TYPESCALE_STYLES,
  colorVar,
  cssVar,
  type BreakpointName,
  type SchemeRole,
  type TypescaleStyle,
} from "./tokens";

export {
  DALYHUB_COLOR_TOKEN_NAMES,
  DALYHUB_DENSITIES,
  DALYHUB_DENSITY_TOKEN_NAMES,
  DALYHUB_MOTION_TOKEN_NAMES,
  DALYHUB_RADIUS_TOKEN_NAMES,
  DALYHUB_SAFE_AREA_TOKEN_NAMES,
  DALYHUB_SHELL_TOKEN_NAMES,
  DALYHUB_SPACE_TOKEN_NAMES,
  DALYHUB_SURFACE_TOKEN_NAMES,
  DALYHUB_TEXT_FACETS,
  DALYHUB_TEXT_ROLES,
  DALYHUB_TOKEN_NAMES,
  DALYHUB_TYPOGRAPHY_TOKEN_NAMES,
  DEFAULT_DENSITY,
  dhVar,
  type DalyhubDensity,
  type DalyhubTextRole,
} from "./dalyhub";

export {
  COLOR_SCHEME_PALETTES,
  COLOR_SCHEME_SEEDS,
  COLOR_SCHEME_TINT_STRENGTHS,
  DARK_SCHEME,
  GENERATED_COLOR_SCHEMES,
  LIGHT_SCHEME,
  SCHEME,
  SOURCE_COLOR,
  type GeneratedColorScheme,
  type SchemeColorMap,
  type SchemeColorPair,
} from "./scheme";
