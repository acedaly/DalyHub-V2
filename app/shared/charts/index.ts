/**
 * The shared chart layer.
 *
 * ── UNTITLED-08 — the architecture, and which half of it you want ───────────
 *
 * DalyHub's genuine CHARTING is now Untitled UI's, over Recharts:
 *
 *     recharts
 *       ↓
 *     ~/shared/ui/untitled/application/charts/charts-base   (vendored Untitled)
 *       ↓
 *     ~/shared/charts/untitled/                             (the DalyHub adapter)
 *       ↓
 *     domain charts — MeasurementTrend, and the ones that follow it
 *
 * The adapter owns what Untitled does not supply and a personal operating system
 * cannot do without: a required text form of every series, a plot that never
 * renders on a Worker, a live readout for keyboard stepping, and one file naming
 * the theme roles every plot is painted with. Reach for `ChartFrame` when adding
 * a new chart; do not compose Recharts directly in a module.
 *
 * ── What remains hand-rolled, and why that is not chart debt ────────────────
 *
 * The five primitives below are NOT charts in the sense above. Each is a small
 * indicator drawn as SVG because a charting runtime would be heavier than the
 * mark it draws and would add nothing: a ring is a percentage, a sparkline is a
 * shape inside a table cell, `CategoryBars` is a labelled list with a bar per
 * row. None has an axis, a tooltip, a legend or a plot area, and every one of
 * them is readable with the SVG removed. Migrating them would be
 * re-implementing progress bars in Recharts.
 *
 * `TrendLine` was the exception and the debt: it IS a chart — axis, references,
 * a projection, an interactive readout. UNTITLED-12 moved its last consumers
 * (Analytics' completion and overdue trends) onto `MeasurementTrend` and deleted
 * it, so every chart in this directory is now either an Untitled-backed plot or
 * an indicator that has no business being one.
 *
 * Every primitive here carries `role="img"` and a generated text summary,
 * because a chart conveys information rather than decorating a number stated
 * beside it (AGENTS.md §15).
 */

/* ── The Untitled-backed chart layer ──────────────────────────────────────── */

export {
  ChartFrame,
  ChartKeyItem,
  type ChartFrameProps,
  type ChartRenderContext,
} from "./untitled/ChartFrame";
export {
  CHART_AXIS_COLOR,
  CHART_DASH,
  CHART_GRID_COLOR,
  CHART_HEIGHT,
  CHART_HEIGHT_COMPACT,
  CHART_MARGIN,
  CHART_PROJECTION_COLOR,
  CHART_REFERENCE_COLOR,
  CHART_SERIES_COLOR,
  CHART_STROKE_WIDTH,
  CHART_TICK,
} from "./untitled/chart-theme";
export {
  PeriodicAdherence,
  type PeriodicAdherencePoint,
  type PeriodicAdherenceProps,
} from "./untitled/PeriodicAdherence";
export {
  MeasurementTrend,
  /**
   * The value-domain rule, exported for test. See its own header: the chart's
   * scale correctness is decidable from the numbers, and asserting it against a
   * rendered Recharts SVG would test jsdom's layout engine instead.
   */
  niceDomain,
  type MeasurementTrendPoint,
  type MeasurementTrendProjection,
  type MeasurementTrendProps,
  type MeasurementTrendReference,
} from "./untitled/MeasurementTrend";

/* ── The hand-drawn indicators ────────────────────────────────────────────── */

export { ProgressRing, type ProgressRingProps } from "./ProgressRing";
export {
  TrendBars,
  type TrendBarsProps,
  type TrendBarPoint,
} from "./TrendBars";
/*
 * UNTITLED-12 — `TrendLine` is DELETED.
 *
 * It was a hand-written 100×100 SVG with no value axis, whose scale was
 * communicated by four label strings the caller computed and passed in. ADR-126
 * replaced it for Goals and Habits; its last two consumers (Analytics'
 * completion and overdue trends) moved to `MeasurementTrend` in UNTITLED-12, and
 * the removal criterion `UNTITLED_UI_MIGRATION.md` states — "when the last
 * caller moves, the file and the component go together" — is met.
 *
 * Every dated series in the product is now one chart on one foundation.
 */
export {
  ComparisonBars,
  type ComparisonBarsProps,
  type ComparisonBarsPoint,
} from "./ComparisonBars";
/* UIX-03 — the card-sized trend, for surfaces a full chart cannot reach. */
export {
  Sparkline,
  type SparklineProps,
  type SparklinePoint,
} from "./Sparkline";
/* V2.13 — a share across NAMED CATEGORIES, the one shape the four above could
 * not draw. Horizontal, label-first, and readable with the SVG removed. */
export {
  CategoryBars,
  type CategoryBarsProps,
  type CategoryBarsRow,
} from "./CategoryBars";
