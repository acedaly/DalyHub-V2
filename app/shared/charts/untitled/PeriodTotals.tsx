/**
 * UNTITLED-17 — ONE VALUE PER NAMED PERIOD, drawn as bars.
 *
 * The third domain chart on the Untitled foundation, and the one that retires
 * the last hand-written plot in the product. `TrendBars` drew this shape as a
 * 100×100 SVG stretched with `preserveAspectRatio="none"`: no value axis at all,
 * no grid, no tooltip, a scale communicated only by the figures printed under
 * each bar, and a geometry that could not be compared between two charts on the
 * same page because each normalised to its own peak with no numbers on the side.
 * It is a chart by every test `charts/index.ts` sets out — axis, plot area, a
 * magnitude the reader is asked to compare — so it belongs here.
 *
 * ── Bars, not a line, and why that is the right mark ────────────────────────
 *
 * `MeasurementTrend` plots a real numeric DAY axis: it is for readings taken at
 * dates, where the gap between two points means something. This plots labelled
 * DISCRETE periods — "Week of 3 Aug", "Aug 2026", the six Reviews before this
 * one — where the categories are equally spaced by construction and the
 * question is "how did these compare?" rather than "which way is this heading?".
 * That is the bar's question (§12), and a line drawn between category centres
 * would assert a continuity the buckets do not have.
 *
 * ── The period under review is a SHAPE, not only a tone ─────────────────────
 *
 * `current` marks the period the surrounding surface is about — this Review's
 * own week, among the six before it. It takes the series colour at full
 * strength while its neighbours take the quieter context role, and it is also
 * NAMED in the summary, so the distinction never rests on hue alone (§15).
 *
 * ── Untitled source ─────────────────────────────────────────────────────────
 *
 * `application/charts-base`'s `ChartTooltipContent`, Untitled's bar geometry
 * (rounded caps, `barCategoryGap`, `maxBarSize`), its horizontal-only hairline
 * grid and its axis treatment through `chart-theme.ts`; Recharts is the runtime
 * `charts-base` declares. `ChartFrame` supplies the required text form, the
 * client-only mount and the reduced-motion pass-through.
 */

import { useMemo, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartTooltipContent } from "~/shared/ui/untitled/application/charts/charts-base";

import { ChartFrame } from "./ChartFrame";
import { niceDomain } from "./MeasurementTrend";
import {
  CHART_CONTEXT_SERIES_COLOR,
  CHART_GRID_COLOR,
  CHART_HEIGHT_COMPACT,
  CHART_MARGIN,
  CHART_SERIES_COLOR,
  CHART_TICK,
} from "./chart-theme";

/** One period on the plot. */
export interface PeriodTotalsPoint {
  /** Stable key, and the x-axis category. */
  readonly key: string;
  /** The axis label — kept short; the summary carries the full period. */
  readonly label: string;
  readonly value: number;
  /** True for the period the surrounding surface is about. */
  readonly current?: boolean;
}

export interface PeriodTotalsProps {
  /** Oldest first. Two or more; one period is a figure, not a comparison. */
  readonly points: readonly PeriodTotalsPoint[];
  /** The series in words, and the plot's accessible name. Required. */
  readonly summary: string;
  /** The short visible caption, when the summary enumerates every period. */
  readonly caption?: ReactNode;
  /** What is being counted — the tooltip's series name ("Tasks completed"). */
  readonly seriesLabel: string;
  /**
   * Snap the value axis to whole numbers. True for counts, where "2.5 Tasks"
   * does not exist; false for a measure that genuinely has fractions.
   */
  readonly wholeNumbers?: boolean;
  /** Renders one value for the axis and the tooltip — a currency, a count. */
  readonly formatValue?: (value: number) => string;
  readonly height?: number;
  readonly className?: string;
  readonly "data-testid"?: string;
}

/**
 * The least inline size one period may be drawn at, in pixels.
 *
 * `ChartFrame`'s `minPlotWidth` note is the reasoning: a plot made of MARKS has
 * a minimum width, and twelve months squeezed into a 342px phone box gave each
 * bar under two pixels. Below this the plot keeps its width inside its own
 * bounded scroller and the document never scrolls (§59).
 */
const MIN_WIDTH_PER_PERIOD = 40;
/** Never demand a scroller for a handful of periods on a phone. */
const MIN_PLOT_WIDTH_FLOOR = 260;

export function PeriodTotals({
  points,
  summary,
  caption,
  seriesLabel,
  wholeNumbers = false,
  formatValue,
  height = CHART_HEIGHT_COMPACT,
  className,
  "data-testid": testId,
}: PeriodTotalsProps) {
  const rows = useMemo(
    () =>
      points.map((point) => ({
        key: point.key,
        label: point.label,
        value: point.value,
        current: point.current === true,
      })),
    [points],
  );

  const scale = useMemo(() => {
    const values = rows.map((row) => row.value);
    const max = values.length > 0 ? Math.max(...values) : 0;
    const min = values.length > 0 ? Math.min(...values) : 0;
    /*
     * A bar is read from the BASELINE, so the axis starts at zero whenever the
     * series does not go below it. `niceDomain` pads a line so a flat series is
     * not pressed against the floor; a bar chart floated off zero exaggerates
     * every difference between its bars, which is the classic misleading
     * chart. So the floor is pinned and only the top is chosen nicely.
     */
    const { domain, ticks } = niceDomain(
      Math.min(0, min),
      max,
      4,
      wholeNumbers,
    );
    return { domain, ticks };
  }, [rows, wholeNumbers]);

  // Two periods is the least a comparison can be made from; one is a figure.
  if (rows.length < 2) return null;

  const render = formatValue ?? ((value: number) => String(value));

  return (
    <ChartFrame
      summary={summary}
      caption={caption}
      height={height}
      className={className}
      minPlotWidth={Math.max(
        MIN_PLOT_WIDTH_FLOOR,
        rows.length * MIN_WIDTH_PER_PERIOD,
      )}
      data-testid={testId}
    >
      {({ reducedMotion }) => (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            margin={CHART_MARGIN}
            barCategoryGap="28%"
            maxBarSize={48}
            accessibilityLayer
            role="img"
            aria-label={summary}
            tabIndex={0}
          >
            <CartesianGrid
              vertical={false}
              stroke={CHART_GRID_COLOR}
              strokeDasharray="0"
            />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={CHART_TICK}
              tickMargin={8}
              minTickGap={4}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={scale.domain}
              ticks={scale.ticks}
              axisLine={false}
              tickLine={false}
              tick={CHART_TICK}
              tickFormatter={render}
              allowDecimals={!wholeNumbers}
              width="auto"
            />
            <Bar
              dataKey="value"
              name={seriesLabel}
              radius={[4, 4, 0, 0]}
              isAnimationActive={!reducedMotion}
            >
              {rows.map((row) => (
                <Cell
                  key={row.key}
                  fill={
                    /*
                     * With no period marked, every bar is the subject and takes
                     * the series colour — the quiet role would make the whole
                     * plot read as context for something that is not there.
                     */
                    !rows.some((other) => other.current) || row.current
                      ? CHART_SERIES_COLOR
                      : CHART_CONTEXT_SERIES_COLOR
                  }
                />
              ))}
            </Bar>
            <Tooltip
              cursor={{ fill: "var(--color-bg-secondary)" }}
              isAnimationActive={!reducedMotion}
              content={
                <ChartTooltipContent
                  formatter={(value) => render(Number(value))}
                />
              }
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartFrame>
  );
}
