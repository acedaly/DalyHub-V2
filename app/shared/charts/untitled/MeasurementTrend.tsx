/**
 * UNTITLED-08 — the MEASUREMENT TREND, rebuilt on Untitled UI's chart source.
 *
 * A dated series of readings against the two references that make a measured
 * Goal's history mean something: what is being aimed AT, and — when all three of
 * its facts genuinely exist — the path still REQUIRED to get there.
 *
 * ── Why this replaced DalyHub's own SVG ─────────────────────────────────────
 *
 * The chart this supersedes (`~/shared/charts/TrendLine`) was a hand-written
 * 100×100 SVG stretched with `preserveAspectRatio="none"`, with its axis printed
 * as loose text beneath the plot and its target named by an HTML tag positioned
 * at a percentage. It was honest, and it looked homemade beside every other
 * surface in the product: no value axis, an invisible grid, a target label
 * hanging off the right edge of the panel, and a large empty band between the
 * line and the reference it was being compared with.
 *
 * Phase 7 rejected Untitled's `application/charts-base` on the grounds that
 * Recharts was not a dependency and the bespoke chart already carried
 * accessibility Untitled's had no equivalent for. The product owner has reversed
 * that trade: a modest dependency is acceptable for a materially more
 * professional chart. The accessibility did not have to be traded at all — see
 * below — and Recharts turned out to supply, natively, the one keyboard
 * behaviour the bespoke chart was built to provide.
 *
 * ── The Untitled source this is composed from ───────────────────────────────
 *
 * | Piece | Untitled source |
 * | --- | --- |
 * | Tooltip | `application/charts-base`'s `ChartTooltipContent`, verbatim |
 * | The point under the cursor | `application/charts-base`'s `ChartActiveDot`, verbatim |
 * | Axis tick selection | `application/charts-base`'s `selectEvenlySpacedItems` |
 * | Grid, axes, area gradient, stroke weights | Untitled's chart geometry via `chart-theme.ts` |
 * | Runtime | Recharts 3, which is what `charts-base` declares |
 *
 * ── What is DalyHub's, and why ──────────────────────────────────────────────
 *
 *   - **The legend is a DASH key, not Untitled's dot key.** Two of this chart's
 *     three marks are the SAME hue and are told apart by dash pattern, because
 *     direction and meaning must never be carried by colour alone (AGENTS.md
 *     §15). Untitled's `ChartLegendContent` draws a filled dot per series, which
 *     would make the measured line and the required path identical in the key.
 *   - **The series takes the RECORD's identity colour.** `--dh-identity` with the
 *     Untitled brand role as the fallback, so a Health & Fitness Goal's chart is
 *     the same hue as its mark everywhere else. One identity system, not a chart
 *     palette.
 *   - **The required path is never a forecast.** It is the straight line from the
 *     last reading to the target value on the target date — the same fact the
 *     pace band prints as "required pace", drawn instead of printed. It is
 *     omitted entirely unless a target value, a target date, and a target date
 *     still ahead of the last reading all exist. Extrapolating recent pace would
 *     put a confident line through a future the product cannot know.
 *   - **The target participates in the vertical scale.** A Goal a third of the
 *     way there draws its readings across the top of the plot with the distance
 *     still to cover as real empty space. That is not a flaw in the chart, it is
 *     the news — and it is why the earlier chart's reading-only domain was wrong.
 *
 * ── Accessibility, which improved rather than survived ──────────────────────
 *
 *   - `ChartFrame` states the whole series in words as the plot's accessible
 *     name and as a visible caption.
 *   - Recharts' `accessibilityLayer` gives the plot ONE tab stop with arrow-key
 *     stepping — exactly the behaviour the bespoke chart hand-rolled — and the
 *     stepped-to reading is announced through the frame's `role="status"`
 *     readout. `role` is overridden to `img`, because Recharts' default
 *     `application` hands every keystroke to the widget and hides the label.
 *   - The value axis is now REAL text with real ticks, so the scale can be read
 *     rather than inferred, and it scales with the owner's font size.
 *   - Motion is off under `prefers-reduced-motion`; Recharts animates in JS,
 *     where a stylesheet cannot reach it.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  useActiveTooltipDataPoints,
} from "recharts";

import {
  ChartActiveDot,
  ChartTooltipContent,
  selectEvenlySpacedItems,
} from "~/shared/ui/untitled/application/charts/charts-base";

import { ChartFrame, ChartKeyItem } from "./ChartFrame";
import {
  CHART_AXIS_COLOR,
  CHART_DASH,
  CHART_WARNING_COLOR,
  CHART_GRID_COLOR,
  CHART_HEIGHT,
  CHART_MARGIN,
  CHART_PROJECTION_COLOR,
  CHART_REFERENCE_COLOR,
  CHART_SERIES_COLOR,
  CHART_STROKE_WIDTH,
  CHART_TICK,
} from "./chart-theme";

const MS_PER_DAY = 86_400_000;

/** `YYYY-MM-DD` to a whole day number, so time is a real numeric axis. */
function dayNumber(iso: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return 0;
  return Math.round(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) /
      MS_PER_DAY,
  );
}

/** The inverse of {@link dayNumber}, so a computed axis tick has a real date. */
function isoFromDayNumber(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * A value domain whose ticks land on round numbers.
 *
 * Exported for test. This is where the chart's SCALE correctness lives — that a
 * target far below every reading still frames, that a count axis offers no
 * halves, that a measure with a natural floor of zero is not given a negative
 * tick — and all three are decidable from the numbers alone. Asserting them
 * against a rendered Recharts SVG would test jsdom's layout engine instead.
 *
 * Padding the raw extremes by a fixed fraction gives a correct scale and an
 * unreadable axis — "93.4 kg, 88.6 kg, 82.6 kg, 76.6 kg" is four arbitrary
 * numbers, and an axis a reader has to decode is an axis they will not use. This
 * is the standard 1/2/5 × 10ⁿ step selection: pick the step that produces about
 * `steps` intervals across the padded range, then snap the ends outward onto it.
 * The domain can only ever GROW, so nothing is ever cropped out of the plot.
 */
export function niceDomain(
  min: number,
  max: number,
  steps: number,
  /**
   * UNTITLED-12 — snap the step to a WHOLE number.
   *
   * A count series has no fractional value: "2.5 Tasks completed" and "7.5
   * overdue" do not exist, and an axis offering them is an axis that is wrong
   * rather than merely ugly. This is the same rule ADR-104 states for Habits'
   * adherence chart, which is why `PeriodicAdherence` already had it; a line of
   * counts needs it for exactly the same reason a bar of counts does.
   */
  wholeNumbers = false,
): { domain: [number, number]; ticks: number[] } {
  const span = max - min;
  // A tenth of the range above and below, so a flat-ish series does not sit on
  // the floor of the box and read as if it hit a limit.
  const pad = span === 0 ? Math.max(1, Math.abs(max) * 0.1) : span * 0.1;
  /*
   * A series that never goes below zero gets an axis that never goes below
   * zero. A "run 100 km" Goal drew a −50 km tick, which is not a distance —
   * the padding had pushed the floor under a bound the MEASURE itself has.
   * Caught by looking at the chart, not by a test.
   */
  const floorAtZero = min >= 0;
  const lowRaw = floorAtZero ? Math.max(0, min - pad) : min - pad;
  const highRaw = max + pad;

  /*
   * The step comes from the DATA's span rather than the padded one: padding is
   * head-room, and letting it choose the step rounded a 0–100 axis up to a
   * 50-unit tick (0, 50, 100, 150) where 25 reads far better.
   */
  const rough = (span || Math.abs(max) || 1) / Math.max(1, steps);
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough || 1)));
  const normalised = rough / magnitude;
  // 2.5 is on the ladder because quarters of a round number read as naturally
  // as halves do, and without it a 0–100 range has no better option than 50.
  const rawStep =
    (normalised <= 1
      ? 1
      : normalised <= 2
        ? 2
        : normalised <= 2.5
          ? 2.5
          : normalised <= 5
            ? 5
            : 10) * magnitude;
  // Rounding UP rather than to nearest: a step rounded down can be 0 on a
  // series whose whole range is under one, and a zero step is a loop that
  // never terminates.
  const step = wholeNumbers ? Math.max(1, Math.ceil(rawStep)) : rawStep;

  const low = floorAtZero
    ? Math.max(0, Math.floor(lowRaw / step) * step)
    : Math.floor(lowRaw / step) * step;
  const high = Math.ceil(highRaw / step) * step;

  const ticks: number[] = [];
  // Guard the loop as well as trusting the arithmetic: a pathological step
  // would otherwise spin rather than draw a wrong axis.
  for (
    let value = low;
    value <= high + step / 2 && ticks.length < 12;
    value += step
  ) {
    // Re-round each tick: repeated addition of 0.1 arrives at 0.30000000000000004.
    ticks.push(Number(value.toFixed(10)));
  }

  return { domain: [low, high], ticks };
}

/**
 * A date tick that keeps itself inside the plot.
 *
 * Recharts centres every tick on its value, so the first and last ones — which
 * sit ON the plot's edges — hang half their width outside it and are clipped by
 * the chart's margin. At 320 that lost most of the last date. Anchoring the end
 * ticks to the inside is the fix; a wider margin would only move the problem to
 * the next-longest label.
 */
function DateTick(props: {
  readonly x?: number;
  readonly y?: number;
  readonly index?: number;
  readonly visibleTicksCount?: number;
  readonly payload?: { readonly value: number };
  readonly tickFormatter?: (value: number) => string;
}) {
  const { x = 0, y = 0, index = 0, visibleTicksCount = 0, payload } = props;
  if (!payload) return null;
  const anchor =
    index === 0 ? "start" : index === visibleTicksCount - 1 ? "end" : "middle";
  return (
    <text
      x={x}
      y={y}
      dy={12}
      textAnchor={anchor}
      fill={CHART_TICK.fill}
      fontSize={CHART_TICK.fontSize}
      fontWeight={CHART_TICK.fontWeight}
    >
      {props.tickFormatter ? props.tickFormatter(payload.value) : payload.value}
    </text>
  );
}

export interface MeasurementTrendPoint {
  readonly key: string;
  /** The owner-calendar date, `YYYY-MM-DD`. */
  readonly date: string;
  readonly value: number;
}

export interface MeasurementTrendReference {
  readonly value: number;
  /** The short form drawn on the rule itself ("Target 78 kg"). */
  readonly tag: string;
}

export interface MeasurementTrendProjection {
  /** The target's owner-calendar date, `YYYY-MM-DD`. Extends the time axis. */
  readonly date: string;
  readonly value: number;
  /** The sentence for the key ("Required to reach 78 kg by 10 Jan 2027"). */
  readonly label: string;
}

export interface MeasurementTrendProps {
  /** Oldest first. Two or more; fewer is a value, not a trend. */
  readonly points: readonly MeasurementTrendPoint[];
  /** The series in words. The plot's accessible name — see `ChartFrame`. */
  readonly summary: string;
  /** The short visible caption, when the summary enumerates every reading. */
  readonly caption?: ReactNode;
  /** The target, drawn as a dashed rule and included in the vertical scale. */
  readonly target?: MeasurementTrendReference | null;
  /** Where the owner started, drawn as a quieter dotted rule. */
  readonly baseline?: MeasurementTrendReference | null;
  /** The required path to the target. Omit unless all three facts exist. */
  readonly projection?: MeasurementTrendProjection | null;
  /** Formats one value for an axis tick, a tooltip and the readout. */
  readonly formatValue: (value: number) => string;
  /** Formats one date for an axis tick, a tooltip and the readout. */
  readonly formatDate: (iso: string) => string;
  /**
   * What the measured series is called, in the key. Plural, because it names
   * the whole series rather than one point.
   */
  readonly seriesLabel?: string;
  /**
   * UNTITLED-12 — the series' semantic role.
   *
   * `series` (the default) is the record's own identity colour, falling back to
   * brand: the right answer for a measurement, whose direction is good or bad
   * depending on the Goal. `warning` is for a series that is a BACKLOG — a level
   * whose existence is the attention, whichever way it is moving — and is the
   * one Analytics' overdue trend carries today.
   *
   * It is a reinforcement, never the meaning: the caption states the latest
   * reading in words and the summary enumerates every one of them, so nothing
   * here is carried by hue alone (AGENTS.md §15).
   */
  readonly tone?: "series" | "warning";
  /**
   * The series is COUNTS, so the value axis snaps to whole numbers. See
   * {@link niceDomain}.
   */
  readonly wholeNumbers?: boolean;
  readonly height?: number;
  readonly "data-testid"?: string;
}

interface TrendRow {
  readonly t: number;
  readonly iso: string;
  readonly measured: number | null;
  readonly required: number | null;
}

/**
 * How many date ticks the axis OFFERS.
 *
 * Untitled's charts label the time axis sparsely and let the tooltip carry
 * precision; a dense numeric axis is the first thing to become unreadable at
 * 320px. `selectEvenlySpacedItems` — `charts-base`'s own helper, written for
 * exactly this — picks the candidates, and Recharts' `minTickGap` drops the ones
 * that would collide, so the same axis thins itself on a phone.
 */
const X_TICKS = 4;

/**
 * Roughly how many value ticks the axis aims for. "Roughly", because the step is
 * snapped to a round number and the count follows from it — which is the whole
 * point of {@link niceDomain}.
 */
const Y_TICKS = 4;

export function MeasurementTrend({
  points,
  summary,
  caption,
  target = null,
  baseline = null,
  projection = null,
  formatValue,
  formatDate,
  seriesLabel = "Recorded readings",
  tone = "series",
  wholeNumbers = false,
  height = CHART_HEIGHT,
  "data-testid": testId,
}: MeasurementTrendProps) {
  // The series' own colour, and the gradient beneath it. Both come from the one
  // theme file; nothing here names a hue.
  const seriesColor =
    tone === "warning" ? CHART_WARNING_COLOR : CHART_SERIES_COLOR;
  /*
   * The stepped-to reading, lifted out of Recharts' own store by the probe
   * below so it can be announced in a live region OUTSIDE the SVG.
   */
  const [reading, setReading] = useState("");
  const onReadingChange = useCallback((value: string) => setReading(value), []);

  /*
   * An SVG `<defs>` id is DOCUMENT-scoped, so a second chart on the same page
   * would silently paint through the first one's gradient. `useId` is the only
   * id here that has to be unique, and React makes it stable across hydration.
   */
  const gradientId = `dh-trend-fill-${useId()}`;

  const model = useMemo(() => {
    if (points.length < 2) return null;

    const last = points[points.length - 1]!;
    const lastDay = dayNumber(last.date);

    /*
     * A target date on or before the last reading draws no path. A deadline
     * already passed is a fact the status line states in words; a line drawn
     * backwards through the plot is not a way of saying it.
     */
    const projectionDay = projection ? dayNumber(projection.date) : null;
    const usable =
      projection !== null && projectionDay !== null && projectionDay > lastDay
        ? { ...projection, day: projectionDay }
        : null;

    const rows: TrendRow[] = points.map((point, index) => ({
      t: dayNumber(point.date),
      iso: point.date,
      measured: point.value,
      // The required path starts AT the last reading, so the two lines meet
      // rather than leaving a gap the eye reads as missing data.
      required:
        usable !== null && index === points.length - 1 ? point.value : null,
    }));
    if (usable !== null) {
      rows.push({
        t: usable.day,
        iso: usable.date,
        measured: null,
        required: usable.value,
      });
    }

    /*
     * The vertical domain. Readings always; the target and the baseline too
     * whenever they exist, so the plot frames the WHOLE journey rather than only
     * the part already travelled. Ten percent of head-room, so a flat-ish series
     * does not sit on the floor of the box and read as if it hit a limit.
     */
    const domain = points.map((point) => point.value);
    if (target !== null) domain.push(target.value);
    if (baseline !== null) domain.push(baseline.value);
    if (usable !== null) domain.push(usable.value);
    const { domain: yDomain, ticks: yTicks } = niceDomain(
      Math.min(...domain),
      Math.max(...domain),
      Y_TICKS,
      wholeNumbers,
    );

    /*
     * The date ticks are spaced across TIME, not across the row index.
     *
     * The axis is numeric — readings a month apart are a month apart on the page
     * — so picking every nth reading produces ticks at uneven pixel intervals,
     * which reads as a broken axis. `selectEvenlySpacedItems` (`charts-base`'s
     * own helper) is used on a synthetic even series across the domain instead,
     * so the labels are evenly spaced and each one names a real day.
     */
    const firstDay = rows[0]!.t;
    const axisEndDay = rows[rows.length - 1]!.t;
    const spanDays = Math.max(1, axisEndDay - firstDay);
    const candidates = Array.from(
      { length: X_TICKS },
      (_, index) => firstDay + Math.round((index * spanDays) / (X_TICKS - 1)),
    );
    const xTicks = [...new Set(selectEvenlySpacedItems(candidates, X_TICKS))];

    return {
      rows,
      projection: usable,
      yDomain,
      yTicks,
      xTicks,
      xDomain: [firstDay, axisEndDay] as [number, number],
      byDay: new Map(rows.map((row) => [row.t, row])),
    };
  }, [points, target, baseline, projection, wholeNumbers]);

  // Two readings are the minimum a line can honestly be drawn from. The caller
  // renders the "more measurements needed" state; this component never invents
  // a flat line from one point.
  if (model === null) return null;

  return (
    <ChartFrame
      summary={summary}
      caption={caption}
      height={height}
      data-testid={testId}
      readout={reading}
      legend={
        <>
          <ChartKeyItem color={seriesColor}>{seriesLabel}</ChartKeyItem>
          {model.projection === null ? null : (
            <ChartKeyItem
              color={CHART_PROJECTION_COLOR}
              dash={CHART_DASH.projection}
            >
              {model.projection.label}
            </ChartKeyItem>
          )}
          {target === null ? null : (
            <ChartKeyItem
              color={CHART_REFERENCE_COLOR}
              dash={CHART_DASH.reference}
            >
              {target.tag}
            </ChartKeyItem>
          )}
          {baseline === null ? null : (
            <ChartKeyItem color={CHART_REFERENCE_COLOR} dash="2 3">
              {baseline.tag}
            </ChartKeyItem>
          )}
        </>
      }
    >
      {({ reducedMotion }) => (
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={model.rows}
            margin={CHART_MARGIN}
            /*
             * One tab stop with arrow-key stepping, natively. `role` is set
             * explicitly because Recharts otherwise uses `application`, which
             * tells a screen reader to forward every key to the widget and
             * suppresses the label — the opposite of what a chart wants.
             */
            accessibilityLayer
            role="img"
            aria-label={summary}
            tabIndex={0}
          >
            <defs>
              {/*
               * Untitled's area treatment: the series colour fading to nothing.
               * The fill is what stops a single thin line reading as a diagram;
               * it carries no information the stroke does not, which is why it
               * fades out rather than filling a solid block.
               */}
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={seriesColor} stopOpacity={0.18} />
                <stop offset="100%" stopColor={seriesColor} stopOpacity={0} />
              </linearGradient>
            </defs>

            {/* Horizontal only. Vertical rules would fight the date ticks and
                add nothing: a value is judged against the scale, not the date. */}
            <CartesianGrid
              vertical={false}
              stroke={CHART_GRID_COLOR}
              strokeDasharray="0"
            />

            {/*
             * One numeric TIME axis, so readings a month apart are a month
             * apart on the page and the target date genuinely extends it.
             * `selectEvenlySpacedItems` — `charts-base`'s own helper — picks the
             * candidate dates, and `minTickGap` drops the ones that would
             * collide, which is what keeps 320px readable without a second axis.
             */}
            <XAxis
              dataKey="t"
              type="number"
              scale="linear"
              domain={model.xDomain}
              ticks={model.xTicks}
              interval="preserveStartEnd"
              minTickGap={28}
              tickFormatter={(value: number) =>
                formatDate(
                  model.byDay.get(value)?.iso ?? isoFromDayNumber(value),
                )
              }
              axisLine={false}
              tickLine={false}
              tick={<DateTick />}
              tickMargin={8}
            />

            <YAxis
              domain={model.yDomain}
              ticks={model.yTicks}
              tickFormatter={formatValue}
              axisLine={false}
              tickLine={false}
              tick={CHART_TICK}
              /* Sized to the widest formatted value, so "$40,000" is not clipped
                 and "7 h" does not leave a gutter. */
              width="auto"
            />

            {baseline === null ? null : (
              <ReferenceLine
                y={baseline.value}
                stroke={CHART_REFERENCE_COLOR}
                strokeDasharray="2 3"
                ifOverflow="extendDomain"
              />
            )}

            {target === null ? null : (
              <ReferenceLine
                y={target.value}
                stroke={CHART_REFERENCE_COLOR}
                strokeDasharray={CHART_DASH.reference}
                ifOverflow="extendDomain"
                /*
                 * NOT named on the rule. It was — `insideTopLeft`, to keep it
                 * off the plot's right edge where it used to collide with the
                 * panel boundary — and inside the plot it collided with the
                 * SERIES instead: on a Goal whose readings sit near its target
                 * the words ran straight through the line and its points.
                 *
                 * There is nowhere inside a plot that is reliably empty. The
                 * legend below already names this rule and shows its dash
                 * pattern, which is the same fact in a place that cannot be
                 * drawn over, so the label on the rule was redundant as well as
                 * in the way.
                 */
              />
            )}

            {/*
             * The required path, UNDER the measured line: what happened is the
             * subject, what is required is the context.
             */}
            {model.projection === null ? null : (
              <Line
                dataKey="required"
                type="linear"
                stroke={CHART_PROJECTION_COLOR}
                strokeWidth={CHART_STROKE_WIDTH}
                strokeDasharray={CHART_DASH.projection}
                strokeLinecap="round"
                dot={false}
                activeDot={false}
                connectNulls
                isAnimationActive={!reducedMotion}
                name={model.projection.label}
              />
            )}

            <Area
              dataKey="measured"
              type="linear"
              stroke={seriesColor}
              strokeWidth={CHART_STROKE_WIDTH}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill={`url(#${gradientId})`}
              dot={{
                r: 3,
                fill: "var(--color-bg-primary)",
                stroke: seriesColor,
                strokeWidth: 2,
              }}
              activeDot={<ChartActiveDot />}
              connectNulls={false}
              isAnimationActive={!reducedMotion}
              name={seriesLabel}
            />

            <Tooltip
              cursor={{
                stroke: CHART_AXIS_COLOR,
                strokeDasharray: CHART_DASH.cursor,
              }}
              isAnimationActive={!reducedMotion}
              content={
                <ChartTooltipContent
                  formatter={(value) =>
                    typeof value === "number"
                      ? formatValue(value)
                      : String(value)
                  }
                  labelFormatter={(label) =>
                    formatDate(model.byDay.get(Number(label))?.iso ?? "")
                  }
                />
              }
            />

            {/* Publishes the stepped-to reading into the frame's live region. */}
            <TrendReadoutProbe
              formatValue={formatValue}
              formatDate={formatDate}
              onChange={onReadingChange}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </ChartFrame>
  );
}

/* -------------------------------------------------------------------------- */
/* The readout                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Publishes the stepped-to reading out of Recharts' store and into the frame's
 * live region.
 *
 * It has to be a CHILD of the chart — `useActiveTooltipDataPoints` reads the
 * chart's own context — and it renders nothing, which Recharts 3 allows for any
 * element ("all charts are able to render arbitrary elements anywhere"). The
 * live region itself must be outside the `<svg>`, because `role="status"` on an
 * SVG element is not reliably announced, so the value is lifted by callback
 * rather than rendered in place.
 */
function TrendReadoutProbe({
  formatValue,
  formatDate,
  onChange,
}: {
  readonly formatValue: (value: number) => string;
  readonly formatDate: (iso: string) => string;
  readonly onChange: (reading: string) => void;
}) {
  const active = useActiveTooltipDataPoints<TrendRow>();
  const row = active?.[0];
  const text =
    row === undefined || row.measured === null || row.measured === undefined
      ? ""
      : `${formatValue(row.measured)} on ${formatDate(row.iso)}`;

  useEffect(() => {
    onChange(text);
  }, [text, onChange]);

  return null;
}
