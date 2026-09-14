/**
 * UNTITLED-16 — MONEY FLOW: what came in and what went out, month by month.
 *
 * The third domain chart on the Untitled foundation, and the first one Finance
 * has ever had. It answers the one question the Finance home could not: *am I
 * living within what I earn, and is that getting better or worse?* A month band
 * answers it for September; twelve bars answer it for the year, and the two
 * cannot disagree because they are computed from the same aggregation
 * (`readMonthlyFlow`, which is `summariseRange` — the read `monthSummary` is
 * itself defined in terms of).
 *
 * ── Why grouped bars, and not a line or an area ─────────────────────────────
 *
 * The question is a COMPARISON between two quantities within each period, over a
 * small number of discrete periods. That is what a grouped bar chart is for. A
 * line implies a continuous quantity sampled at points, which a month's total is
 * not; an area implies composition, and money in is not part of money out. A net
 * line — one signed series — would answer a different, weaker question and hide
 * the case that matters most: a month where both figures grew.
 *
 * ── Direction is never a colour ─────────────────────────────────────────────
 *
 * Money in and money out are told apart three ways, none of which is hue: their
 * POSITION in each group is fixed (in leads, out follows), each bar carries its
 * series name into the tooltip, and the accessible summary states both figures
 * in words for every month. The fills are the product's subject/context pair
 * rather than green and red — a month where spending exceeded income is a fact
 * to read, not an alarm to raise (§46), and DalyHub does not paint Finance green
 * for doing what it was asked (§42).
 *
 * ── One currency, decided upstream ──────────────────────────────────────────
 *
 * Nothing here converts or combines currencies; `readMonthlyFlow` picks the lead
 * and names the rest, and the host prints the exclusion. This component is
 * handed one currency and plots it.
 *
 * ── Untitled source ─────────────────────────────────────────────────────────
 *
 * `application/charts-base`'s `ChartTooltipContent`, its bar geometry (rounded
 * caps, `barCategoryGap`), its horizontal-only hairline grid and its axis
 * treatment through `chart-theme.ts`; Recharts is the runtime, exactly as
 * `charts-base` declares. `ChartFrame` supplies the required text form, the
 * client-only mount and the reduced-motion pass-through.
 */

import { useMemo, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartTooltipContent } from "~/shared/ui/untitled/application/charts/charts-base";

import { ChartFrame, ChartKeyItem } from "./ChartFrame";
import {
  CHART_CONTEXT_SERIES_COLOR,
  CHART_GRID_COLOR,
  CHART_HEIGHT,
  CHART_MARGIN,
  CHART_SERIES_COLOR,
  CHART_TICK,
} from "./chart-theme";

export interface MoneyFlowPoint {
  /** Stable key — the period's identifier (`2026-09`). */
  readonly key: string;
  /** The axis label ("Sep"). Short: twelve of them share one axis. */
  readonly label: string;
  /** The full period name, for the tooltip ("September 2026"). */
  readonly fullLabel: string;
  /** Money in, as a POSITIVE magnitude in minor units. */
  readonly inMinor: number;
  /** Money out, as a POSITIVE magnitude in minor units. */
  readonly outMinor: number;
}

export interface MoneyFlowProps {
  /** Oldest first. Fewer than two points draws nothing. */
  readonly points: readonly MoneyFlowPoint[];
  /** The series in words, and the plot's accessible name. Required. */
  readonly summary: string;
  /** The short visible caption, when the summary enumerates every month. */
  readonly caption?: ReactNode;
  /**
   * Format a minor-unit magnitude for a human — the host's own currency
   * formatter, so the chart never decides how money is spelled.
   */
  readonly format: (minorUnits: number) => string;
  /**
   * Format an AXIS tick. Separate from `format` because a value axis has room
   * for "$4k" and not for "$4,120.00", and rounding a tick label is honest
   * where rounding a tooltip figure is not.
   */
  readonly formatTick?: (minorUnits: number) => string;
  readonly height?: number;
  readonly "data-testid"?: string;
}

interface FlowRow {
  readonly key: string;
  readonly label: string;
  readonly fullLabel: string;
  readonly inMinor: number;
  readonly outMinor: number;
}

/** The steps money is actually counted in, within one power of ten. */
const STEP_FAMILY = [1, 2, 2.5, 5] as const;

/** At most this many intervals, so a stacked axis stays readable at 320px. */
const MAX_INTERVALS = 5;

/** The least width one period needs: two bars, their gap, and the group's gap. */
const PERIOD_MIN_WIDTH = 44;

/** What the value axis and its labels take before the plot area starts. */
const AXIS_GUTTER = 64;

/**
 * A value axis that ends on a round figure and offers at most five intervals.
 *
 * Exported for test for the same reason `niceDomain` is: the correctness of a
 * chart's scale is decidable from the numbers, and asserting it against a
 * rendered Recharts SVG would test the DOM implementation's layout engine
 * instead.
 *
 * ## Why the SMALLEST qualifying step rather than a rounded one
 *
 * The step is the smallest member of the 1 / 2 / 2.5 / 5 family that gets the
 * peak inside five intervals. That matters more than it sounds: rounding
 * `peak / 4` to the nearest nice number sends a peak of $4,120 to a $2,000 step
 * — an axis of 0 · $2,000 · $4,000 · $6,000, whose top is 46% above the tallest
 * bar, so every bar is drawn at two thirds of the height it has earned. Taking
 * the smallest qualifying step gives $1,000, a top of $5,000 and a plot that
 * uses its own height.
 *
 * Always from zero: a bar's baseline on this chart means "no money moved", and
 * an axis that starts anywhere else would make a quiet month look like a busy
 * one.
 */
export function moneyAxis(peakMinor: number): {
  readonly top: number;
  readonly ticks: readonly number[];
} {
  // A window in which every month was zero is a real answer, and the chart is
  // still drawn — so the axis has to be drawable rather than throwing.
  if (!Number.isFinite(peakMinor) || peakMinor <= 0) {
    return { top: 1, ticks: [0, 1] };
  }

  let step = 0;
  // Start an order of magnitude below the smallest step that could possibly
  // work, and walk up; the loop is bounded by the exponent, never by the data.
  for (
    let magnitude = 10 ** Math.floor(Math.log10(peakMinor / MAX_INTERVALS) - 1);
    step === 0 && magnitude <= peakMinor * 10;
    magnitude *= 10
  ) {
    for (const factor of STEP_FAMILY) {
      const candidate = factor * magnitude;
      if (candidate > 0 && Math.ceil(peakMinor / candidate) <= MAX_INTERVALS) {
        step = candidate;
        break;
      }
    }
  }
  if (step === 0) step = peakMinor;

  const intervals = Math.max(1, Math.ceil(peakMinor / step));
  const ticks: number[] = [];
  for (let index = 0; index <= intervals; index += 1) {
    ticks.push(Math.round(index * step));
  }
  return { top: ticks[ticks.length - 1]!, ticks };
}

export function MoneyFlow({
  points,
  summary,
  caption,
  format,
  formatTick,
  height = CHART_HEIGHT,
  "data-testid": testId,
}: MoneyFlowProps) {
  const rows = useMemo<FlowRow[]>(
    () =>
      points.map((point) => ({
        key: point.key,
        label: point.label,
        fullLabel: point.fullLabel,
        /*
         * Clamped at zero. A magnitude is what this chart plots, and a negative
         * one would draw a bar below the baseline in a plot whose baseline means
         * "no money moved" — which is a different chart. The caller's own
         * derivation already produces magnitudes; this is the guard, not the
         * rule.
         */
        inMinor: Math.max(0, point.inMinor),
        outMinor: Math.max(0, point.outMinor),
      })),
    [points],
  );

  // Two periods is the least a comparison can be made from; one is a figure.
  if (rows.length < 2) return null;

  const peak = Math.max(
    0,
    ...rows.map((row) => Math.max(row.inMinor, row.outMinor)),
  );
  const { top, ticks } = moneyAxis(peak);
  const tick = formatTick ?? format;

  return (
    <ChartFrame
      summary={summary}
      caption={caption}
      height={height}
      /*
       * Enough room for two readable bars and their gap per period, plus the
       * value axis's own gutter. Below it the frame gives the plot its own
       * bounded scroller rather than drawing sub-pixel bars — see the prop's
       * note for the measurement that produced the number.
       */
      minPlotWidth={rows.length * PERIOD_MIN_WIDTH + AXIS_GUTTER}
      data-testid={testId}
      legend={
        <>
          {/*
           * IN leads the key because it leads each group on the plot. A key
           * whose order differs from the marks' is a key a reader has to
           * translate.
           */}
          <ChartKeyItem color={CHART_CONTEXT_SERIES_COLOR} shape="bar">
            Money in
          </ChartKeyItem>
          <ChartKeyItem color={CHART_SERIES_COLOR} shape="bar">
            Money out
          </ChartKeyItem>
        </>
      }
    >
      {({ reducedMotion }) => (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            margin={CHART_MARGIN}
            barCategoryGap="24%"
            barGap={2}
            maxBarSize={22}
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
              domain={[0, top]}
              axisLine={false}
              tickLine={false}
              tick={CHART_TICK}
              ticks={[...ticks]}
              tickFormatter={(value: number) => tick(value)}
              width="auto"
            />
            <Bar
              dataKey="inMinor"
              fill={CHART_CONTEXT_SERIES_COLOR}
              name="Money in"
              radius={[4, 4, 0, 0]}
              isAnimationActive={!reducedMotion}
            />
            <Bar
              dataKey="outMinor"
              fill={CHART_SERIES_COLOR}
              name="Money out"
              radius={[4, 4, 0, 0]}
              isAnimationActive={!reducedMotion}
            />
            <Tooltip
              cursor={{ fill: "var(--color-bg-secondary)" }}
              isAnimationActive={!reducedMotion}
              content={
                <ChartTooltipContent
                  /*
                   * The FULL month name, not the axis label. "Sep" is the right
                   * label on an axis holding twelve of them and the wrong one in
                   * a tooltip about exactly one — and two Septembers on a
                   * twenty-four-month window would be indistinguishable.
                   */
                  labelFormatter={(label, payload) =>
                    (payload?.[0]?.payload as FlowRow | undefined)?.fullLabel ??
                    String(label)
                  }
                  formatter={(value) =>
                    typeof value === "number" ? format(value) : String(value)
                  }
                />
              }
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartFrame>
  );
}
