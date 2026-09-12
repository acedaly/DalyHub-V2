/**
 * UNTITLED-09 — ADHERENCE over a run of periods: what each one asked for, and
 * what happened.
 *
 * The second domain chart on the Untitled foundation, and the shape DalyHub had
 * no way to draw at all. A Habit record could show four weeks as a grid of
 * squares — which answers "which days am I missing?" — and could not answer the
 * question a person actually asks about a behaviour they are trying to keep:
 * *is this getting better or worse?*
 *
 * ── It is made of COUNTS, never of a ratio ──────────────────────────────────
 *
 * Each bar's full height is what the period EXPECTED; the solid part is what was
 * DONE and the faint part is the rest of the expectation. So the bar's height is
 * an integer the surface also states in words, and the picture cannot say
 * anything the numbers do not.
 *
 * That is ADR-104's rule applied to a chart. A bar whose height is a percentage
 * has no denominator on the page: three of three and thirty of thirty draw the
 * identical full bar, and a week that expected one thing and got it would tower
 * over a week that expected seven and got six. Stacking the counts keeps the
 * comparison honest — a light week is a short bar, and a week that has not
 * finished is short because it is not finished.
 *
 * ── Nothing here manufactures urgency ───────────────────────────────────────
 *
 * The shortfall is the NEUTRAL role, not a warning one. There is no red, no
 * target line to fall below, no streak and no running total. A period that asked
 * for nothing is not passed in at all, because something that was not asked for
 * cannot have been missed — and a period still in progress is short because it
 * is not finished, which is what a picture of counts says and a picture of
 * percentages cannot.
 *
 * ── Untitled source ─────────────────────────────────────────────────────────
 *
 * `application/charts-base`'s `ChartTooltipContent`, Untitled's bar geometry
 * (rounded caps, `barCategoryGap`), its horizontal-only hairline grid and its
 * axis treatment through `chart-theme.ts`; Recharts is the runtime, as
 * `charts-base` declares. `ChartFrame` supplies the required text form, the
 * client-only mount and the reduced-motion pass-through.
 */

import { useMemo, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { ResponsiveContainer } from "recharts";

import { ChartTooltipContent } from "~/shared/ui/untitled/application/charts/charts-base";

import { ChartFrame, ChartKeyItem } from "./ChartFrame";
import {
  CHART_GRID_COLOR,
  CHART_HEIGHT_COMPACT,
  CHART_MARGIN,
  CHART_SERIES_COLOR,
  CHART_TICK,
} from "./chart-theme";

/** The faint remainder of an expectation. A neutral role — never a warning. */
const SHORTFALL_COLOR = "var(--color-bg-quaternary)";

export interface PeriodicAdherencePoint {
  /** Stable key and x-axis category — the period's first day, `YYYY-MM-DD`. */
  readonly key: string;
  /** The axis label for this period ("18 Aug"). */
  readonly label: string;
  readonly expected: number;
  readonly completed: number;
}

export interface PeriodicAdherenceProps {
  /** Oldest first. */
  readonly periods: readonly PeriodicAdherencePoint[];
  /** The series in words, and the plot's accessible name. */
  readonly summary: string;
  /** The short visible caption, when the summary enumerates every period. */
  readonly caption?: ReactNode;
  /** What one unit is called ("check-in"), for the tooltip and the key. */
  readonly unitLabel?: string;
  /** What one period is called ("week"), for the tooltip's label. */
  readonly periodLabel?: string;
  readonly height?: number;
  readonly "data-testid"?: string;
}

interface AdherenceRow {
  readonly key: string;
  readonly label: string;
  readonly expected: number;
  readonly completed: number;
  readonly shortfall: number;
}

export function PeriodicAdherence({
  periods,
  summary,
  caption,
  unitLabel = "check-in",
  periodLabel = "Week of",
  height = CHART_HEIGHT_COMPACT,
  "data-testid": testId,
}: PeriodicAdherenceProps) {
  const rows = useMemo<AdherenceRow[]>(
    () =>
      periods.map((period) => ({
        key: period.key,
        label: period.label,
        expected: period.expected,
        completed: period.completed,
        /*
         * What the period asked for and did not get. Never negative: a period
         * completed BEYOND its expectation draws a taller bar than its
         * neighbours, which is the honest picture of doing more than was asked.
         */
        shortfall: Math.max(0, period.expected - period.completed),
      })),
    [periods],
  );

  // Two periods is the least a comparison can be made from; one is a figure.
  if (rows.length < 2) return null;

  /*
   * Whole units on the axis, on a round step: half a check-in does not exist,
   * and "1, 4, 7" — which is what evenly dividing the peak produces — is an axis
   * a reader has to decode. The step is the smallest whole number that keeps the
   * axis to about four intervals, so a peak of 7 reads 0 · 2 · 4 · 6 · 8 and a
   * peak of 3 reads 0 · 1 · 2 · 3.
   */
  const peak = Math.max(
    1,
    ...rows.map((row) => Math.max(row.expected, row.completed)),
  );
  const step = Math.max(1, Math.ceil(peak / 4));
  const top = Math.ceil(peak / step) * step;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);

  return (
    <ChartFrame
      summary={summary}
      caption={caption}
      height={height}
      data-testid={testId}
      legend={
        <>
          <ChartKeyItem color={CHART_SERIES_COLOR} shape="bar">
            Completed {unitLabel}s
          </ChartKeyItem>
          <ChartKeyItem color={SHORTFALL_COLOR} shape="bar">
            Expected and not recorded
          </ChartKeyItem>
        </>
      }
    >
      {({ reducedMotion }) => (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            margin={CHART_MARGIN}
            barCategoryGap="32%"
            maxBarSize={36}
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
              minTickGap={16}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[0, top]}
              axisLine={false}
              tickLine={false}
              tick={CHART_TICK}
              ticks={ticks}
              allowDecimals={false}
              width="auto"
            />
            {/*
             * Stacked, done first, so the solid part grows from the baseline and
             * the remainder sits on top of it. A bar's total height is the
             * period's expectation.
             */}
            <Bar
              dataKey="completed"
              stackId="adherence"
              fill={CHART_SERIES_COLOR}
              name={`Completed ${unitLabel}s`}
              isAnimationActive={!reducedMotion}
            />
            <Bar
              dataKey="shortfall"
              stackId="adherence"
              fill={SHORTFALL_COLOR}
              name="Expected and not recorded"
              // Untitled's bar cap: rounded at the top of the stack only.
              radius={[4, 4, 0, 0]}
              isAnimationActive={!reducedMotion}
            />
            <Tooltip
              cursor={{ fill: "var(--color-bg-secondary)" }}
              isAnimationActive={!reducedMotion}
              content={
                <ChartTooltipContent
                  labelFormatter={(label) => `${periodLabel} ${label}`}
                />
              }
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartFrame>
  );
}
