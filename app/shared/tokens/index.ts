/**
 * DS-01 — public entry for the design token registry.
 *
 * Import token names, the breakpoint scale and the `cssVar`/`colorVar` helpers
 * from here. The authoritative token VALUES live in `app/styles/tokens.css`; this
 * package is the typed, greppable surface over them.
 */

export {
  BREAKPOINTS,
  COLOR_TOKEN_NAMES,
  REQUIRED_TOKEN_NAMES,
  STRUCTURAL_TOKEN_NAMES,
  colorVar,
  cssVar,
  type BreakpointName,
  type ColorTokenName,
} from "./tokens";

export {
  THEME_COLOR_MAPS,
  darkTheme,
  lightTheme,
  type ColorMap,
} from "./theme-colors";
