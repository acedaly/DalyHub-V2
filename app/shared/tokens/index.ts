/**
 * M3-01 — public entry for the design token registry.
 *
 * Import token names, the breakpoint scale, the generated colour scheme and the
 * `cssVar`/`colorVar` helpers from here. The authoritative token VALUES live in
 * `app/styles/tokens.css`; this package is the typed, greppable surface over
 * them, and `scripts/generate-m3-scheme.mjs` writes both halves so they cannot
 * disagree.
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
  DARK_SCHEME,
  LIGHT_SCHEME,
  SCHEME,
  SOURCE_COLOR,
  type SchemeColorMap,
} from "./scheme";
