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
 * ── What remains hand-rolled, and why that is not chart debt ────────────
 *
 * The TWO primitives below are NOT charts in the sense above. Each is a small
 * indicator drawn as SVG because a charting runtime would be heavier than the
 * mark it draws and would add nothing: a ring is a percentage, a sparkline is a
 * shape inside a table cell. Neither has an axis, a tooltip, a legend or a plot
 * area, and both are readable with the SVG removed. Migrating them would be
 * re-implementing progress bars in Recharts.
 *
 * ── UNTITLED-17 — the last hand-written PLOTS are gone ─────────────────
 *
 * Three exports left this file, and each for its own reason:
 *
 *   - `TrendBars` WAS a chart — a value per labelled period, an axis of them, a
 *     magnitude the reader compares — drawn as a stretched 100×100 SVG with no
 *     value axis at all. Its two consumers (Reports’ period results, the Review
 *     insight trends) now draw {@link PeriodTotals}, which is
 *     `application/charts-base` over Recharts.
 *   - `CategoryBars` was NOT a chart: a labelled list with a bar per row, which
 *     is a run of progress indicators with a shared denominator. It is now
 *     `CategorySplit` in `~/shared/progress`, over Untitled’s own
 *     `ProgressBarBase` — the same bar the rest of the product draws — and it
 *     absorbed Analytics’ second, differently-painted copy of the same shape.
 *   - `ComparisonBars` had no consumer in `app/` at all and was deleted.
 *
 * Every dated series, every period comparison and every categorical share in
 * DalyHub now comes from one of three places: an Untitled-backed plot here,
 * `CategorySplit`, or a figure stated in words. There is no second chart
 * runtime, no module-local chart colour and no hand-written plot left.
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
  CHART_CONTEXT_SERIES_COLOR,
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
  MoneyFlow,
  /**
   * The value-axis rule, exported for test — the same reason `niceDomain` is.
   * A money axis that ends on a round figure is decidable from the numbers, and
   * asserting it against a rendered Recharts SVG would test jsdom's layout
   * engine instead of the arithmetic.
   */
  moneyAxis,
  type MoneyFlowPoint,
  type MoneyFlowProps,
} from "./untitled/MoneyFlow";
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
export {
  PeriodTotals,
  type PeriodTotalsPoint,
  type PeriodTotalsProps,
} from "./untitled/PeriodTotals";

/* ── The hand-drawn indicators are NOT here, and that is now structural ────
 *
 * `ProgressRing` was deleted: it had no consumer in the product at all.
 *
 * `Sparkline` moved to `~/shared/progress`, for the reason the header above
 * already gives — it has no axis, no tooltip, no legend and no plot area, so it
 * is an indicator rather than a chart — and for a MEASURED one. Everything this
 * barrel exports stands on Recharts, which is 394.9 KB raw / 111.6 KB gzip in
 * one chunk. `/today` imported `Sparkline` from here to draw a 2.3 KB inline
 * SVG and paid the whole charting runtime for it, on the product's default
 * landing route.
 *
 * The rule that follows: this barrel is the RECHARTS layer. Anything that does
 * not need Recharts does not belong in it, because importing one name from here
 * loads all of it. `scripts/route-budget.mjs` fails the build if a daily-driver
 * route statically reaches this chunk again.
 */
