/**
 * The ONE place DalyHub says what an Untitled chart is painted with.
 *
 * Every value below is an Untitled semantic theme role read through a CSS custom
 * property, not a colour. Recharts takes its strokes and fills as strings and
 * puts them straight onto SVG attributes, where `var(--color-…)` resolves
 * exactly as it does in a stylesheet — so a chart follows the appearance switch
 * and the generated Branded Plum ramp for free, and there is no second palette
 * to keep in step (`UNTITLED_UI_IMPLEMENTATION.md` → Theme and tokens).
 *
 * The numbers are Untitled's own chart geometry, read off `charts-base` and the
 * Pro dashboard compositions it is written for: a horizontal-only hairline grid,
 * axes drawn by their labels rather than by a rule, 12px tick type on the
 * tertiary text role, and a 2px series stroke over a fading gradient.
 *
 * Nothing here knows what is being plotted. Domain meaning — which series is the
 * measured one, what the reference means, whether a projection may be drawn at
 * all — belongs to the chart above this file.
 */

/**
 * The series colour: the record's own identity, falling back to brand.
 *
 * `--dh-chart-series` rather than `--dh-identity` directly, and the difference
 * matters: `tokens.css` defines `--dh-identity` on bare `:root` as the neutral
 * container, so it is ALWAYS set and a `var()` fallback beside it never fires.
 * `charts.css` declares the brand default on `.dh-chart` and lets a real
 * `[data-identity]` ancestor override it, which is what that attribute means
 * everywhere else in the product.
 */
export const CHART_SERIES_COLOR =
  "var(--dh-chart-series, var(--color-utility-brand-600))";

/** The quieter partner of the series, for a required or projected path. */
export const CHART_PROJECTION_COLOR = CHART_SERIES_COLOR;

/**
 * A reference rule — a target, a threshold, a budget. Never the series' hue,
 * because a reference is a fact about the scale rather than a second series.
 *
 * `fg-quaternary` rather than `border-primary`: a border role is tuned to sit
 * against a surface, and at that weight a dashed rule crossing a plot — and the
 * 20px swatch standing for it in the key — is close to invisible.
 */
export const CHART_REFERENCE_COLOR = "var(--color-fg-quaternary)";

/** The horizontal hairlines a value is judged against. */
export const CHART_GRID_COLOR = "var(--color-border-secondary)";

/** Axis tick labels, and the hover cursor rule. */
export const CHART_AXIS_COLOR = "var(--color-text-tertiary)";

/**
 * The dash patterns, so two lines on one plot are told apart WITHOUT hue
 * (AGENTS.md §15 — never colour alone). Measured is solid because it is what
 * happened; everything else is dashed or dotted because it is not.
 */
export const CHART_DASH = {
  /** The required/projected path: long dashes, clearly a route rather than a record. */
  projection: "5 4",
  /** A target or reference rule: short dashes, quieter than the projection. */
  reference: "4 4",
  /** The hover/keyboard cursor. */
  cursor: "3 3",
} as const;

/** Untitled's tick typography, as Recharts `tick` props. */
export const CHART_TICK = {
  fill: CHART_AXIS_COLOR,
  fontSize: 12,
  fontWeight: 500,
} as const;

/** The series stroke width Untitled's line and area charts use. */
export const CHART_STROKE_WIDTH = 2;

/**
 * The plot's default block size.
 *
 * Untitled's dashboard charts sit in a 240–320px band; 220 is the bottom of that
 * range, chosen because DalyHub's chart hosts are record panels and rails rather
 * than a full-page analytics grid, and a taller plot pushes the reading history
 * under it off the first screen.
 */
export const CHART_HEIGHT = 220;

/** The compact rung, for a chart inside a rail or a drawer. */
export const CHART_HEIGHT_COMPACT = 160;

/**
 * The margin around the plot area.
 *
 * Untitled's charts run the plot to the edges and let the axis labels overhang;
 * the small top and right insets stop the last point's active dot and the
 * highest tick label being clipped by the SVG's own bounds.
 */
export const CHART_MARGIN = { top: 8, right: 8, bottom: 0, left: 0 } as const;
