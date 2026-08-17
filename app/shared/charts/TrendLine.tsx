/**
 * GOAL-02 / UIX-03 — the shared MEASUREMENT TREND primitive.
 *
 * A series of dated readings drawn as one line, against the two references that
 * make a Goal's history mean something: where the owner STARTED and what they
 * are aiming AT. It exists because a Goal's history is the only thing in DalyHub
 * where the SHAPE of the data is the information: "79.0, 79.3, 80.1" is three
 * numbers, and the same three numbers as a line are a direction.
 *
 * ── UIX-03: the target belongs on the scale ─────────────────────────────────
 * This chart used to scale to the READINGS alone and draw the target only when
 * it happened to fall inside that range. For the product's own acceptance Goal
 * — 85 kg down to 79.3 kg, target 70 kg — that meant the target was never
 * visible at all: the chart showed a line drifting down through a five-kilogram
 * window with no indication that nine kilograms remained. It answered "have I
 * moved?" and silently refused "am I getting there?", which is the question the
 * Goal exists to ask.
 *
 * So the target is now part of the vertical domain. The consequence is
 * deliberate and is the honest one: a Goal a third of the way there draws its
 * readings across the top third of the plot, and the distance still to cover is
 * the empty space between the line and the dashed target. A Goal that has barely
 * moved draws a nearly flat line a long way from its target — which is not a
 * flaw in the chart, it is the news. `scaleToTarget={false}` restores the old
 * reading-only domain for a caller whose target is not a value on this axis.
 *
 * `baseline` is drawn as a second, quieter reference so "start → now → target"
 * is one picture rather than three numbers printed above one.
 *
 * ── REDESIGN-04: the dotted path to the target ──────────────────────────────
 * `mockup3.png` continues the solid line of recorded readings with a DOTTED
 * segment running to a marked point at the target date. `projection` draws it,
 * and what it draws is deliberately not a forecast:
 *
 *   - the solid line is what HAPPENED — the recorded readings, unchanged;
 *   - the dotted line is what is REQUIRED — the straight path from the last
 *     reading to the target value on the target date, which is the same fact
 *     the evaluator already publishes as `requiredChangePerWeek`, drawn instead
 *     of printed.
 *
 * It is never an extrapolation of recent pace. Extrapolating would put a
 * confident line through a future the product cannot know, and §6.2 is explicit
 * that "if recent pace is undefined, the projection is absent, not invented" —
 * so a caller supplies `projection` only when a target value AND a target date
 * both exist and the date is still ahead of the last reading. Everything else
 * draws no dotted line at all.
 *
 * The dotted path also EXTENDS the time axis: without that the target point
 * would have no x position, and squeezing it onto the last reading's date would
 * assert that the deadline is today. The axis's end label becomes the target
 * date, so what the chart's width now means is stated in words.
 *
 * ── How it stays crisp at every width ───────────────────────────────────────
 * The plot is a 100x100 coordinate space stretched to the container
 * (`preserveAspectRatio="none"`), which is what lets the chart fill a 1200px
 * panel and a 320px phone with the same markup. Stretching would normally
 * distort the stroke and turn every dot into an ellipse, so every stroked
 * element carries `vector-effect="non-scaling-stroke"` — the line keeps its
 * exact pixel width, and each reading is drawn as a ZERO-LENGTH round-capped
 * segment, which renders as a true circle in screen space no matter how the box
 * is squashed.
 *
 * ── The chart is never the only way to read it ──────────────────────────────
 * `summary` is required and states the series in words; the SVG is `role="img"`
 * labelled by it and the same sentence is rendered visibly beneath the plot. The
 * axis ends, the value range and both references are real text, so they wrap,
 * scale with the owner's font size and are selectable. Direction is never
 * carried by colour alone — the summary says which way the numbers moved, and
 * the two reference lines are distinguished by dash pattern and by a text label,
 * not by hue.
 *
 * ── Interaction: one tab stop, not one per reading ──────────────────────────
 * Pointing at (or tapping) the plot names the nearest reading beneath it, and
 * the arrow keys walk the series. It is ONE focusable element rather than a
 * focus target per point: a year of weigh-ins would otherwise put fifty tab
 * stops between the chart and the next control. Nothing is hidden behind the
 * interaction — every reading is also listed in the history below — so a
 * keyboard user who skips past the chart loses nothing.
 */

import { useCallback, useId, useMemo, useState } from "react";

import {
  meterStatusAttribute,
  type MeterStatus,
} from "~/shared/progress/meter-status";

/** One reading on the line. */
export interface TrendLinePoint {
  readonly key: string;
  /** The owner-calendar date, `YYYY-MM-DD`. Positions the point in TIME, so
   * readings a month apart are a month apart on the axis. */
  readonly date: string;
  readonly value: number;
}

export interface TrendLineProps {
  /** Oldest first. Two or more readings; fewer is a number, not a trend. */
  readonly points: readonly TrendLinePoint[];
  /** The sentence that states the series. Required — it IS the chart's text form. */
  readonly summary: string;
  /**
   * CONVERGE-01 §I — the VISIBLE caption, when it differs from the accessible
   * description.
   *
   * `summary` is the chart's text form and its accessible name, so it spells
   * every reading out: "Tasks completed across 12 periods, 84 in total. Week of
   * 1 Jun: 12; Week of 8 Jun: 9; …". That is exactly right for a screen reader
   * and exactly wrong printed under the plot, where it is a paragraph of
   * accessibility prose sitting where a caption belongs — the August 2026 audit
   * names it as the clearest case of Analytics communicating its own
   * accessibility rather than its data.
   *
   * So a caller may hand a SHORT visible caption and keep the full enumeration
   * as the accessible one. The long form is still in the document, visually
   * hidden, so nothing is taken from anyone. Absent, the summary is drawn as
   * before, which is right for a chart whose sentence is already one line.
   */
  readonly caption?: string;

  /**
   * The target, drawn as a dashed reference and included in the vertical scale.
   *
   * `label` is the sentence for the caption ("Target 70 kg."); `tag` is the
   * short form pinned to the line itself ("70 kg"). Without the tag a reader has
   * to match a dashed rule to a sentence three lines below it, which is exactly
   * the legend-hunting a two-reference chart should not require.
   */
  readonly target?: {
    readonly value: number;
    readonly label: string;
    readonly tag?: string;
  } | null;
  /** Where the owner started, drawn as a quieter dotted reference. */
  /**
   * REDESIGN-04 — the dotted path from the last reading to the target point.
   *
   * Supply it ONLY when a target value and a target date both genuinely exist
   * and the date is after the last reading; see the note above for why this is
   * a required path and never a forecast.
   */
  readonly projection?: {
    /** The target's owner-calendar date, `YYYY-MM-DD`. Extends the time axis. */
    readonly date: string;
    readonly value: number;
    /** Stated in words beneath the plot — "Target 70 kg by 31 Dec 2025". */
    readonly label: string;
  } | null;
  readonly baseline?: {
    readonly value: number;
    readonly label: string;
    readonly tag?: string;
  } | null;
  /**
   * Whether the target participates in the vertical scale. Defaults to `true` —
   * see the module comment. `false` scales to the readings alone, for a caller
   * whose "target" is not a value on this axis.
   */
  readonly scaleToTarget?: boolean;
  /** The axis ends, as the owner reads them ("5 Jul", "9 Aug"). */
  readonly startLabel: string;
  readonly endLabel: string;
  /** The value range, as the owner reads it ("79.0 kg", "85.0 kg"). */
  readonly lowLabel: string;
  readonly highLabel: string;
  /**
   * Names one reading for the interactive readout, e.g.
   * `(point) => "79.3 kg on 8 Aug 2026"`. Without it the plot is not
   * interactive, because there would be nothing to say about a selected point.
   */
  readonly describePoint?: (point: TrendLinePoint) => string;
  /**
   * CONVERGE-01 §8 — the series' STATUS, for a line whose subject is one.
   *
   * A completion trend has no status: more is not "good" and fewer is not "bad",
   * which is why the default line is `primary` and why nothing about it
   * editorialises. A BACKLOG does — "how much is past its date" is a status
   * statement, in the same vocabulary a meter makes one in.
   *
   * So this is the meter ramp's own attribute (`~/shared/progress/meter-status`)
   * rather than a colour or a second vocabulary: there is ONE mapping from
   * status to paint in DalyHub and this reuses it. It is presentation only — the
   * caption, the readout and the axis state every number in words, so the tone
   * adds emphasis and never carries meaning of its own (AGENTS.md §15).
   */
  readonly status?: MeterStatus;
  /** Height of the plotted area in pixels. The width is always fluid. */
  readonly height?: number;
  readonly "data-testid"?: string;
}

const VIEW = 100;
/**
 * Head-room above and below the data, as a fraction of the plotted range.
 *
 * Without it a flat-ish series sits on the floor and ceiling of the box and
 * reads as if it hit a limit. Ten percent is enough to show the line is inside
 * the frame and small enough that the shape is not flattened.
 */
const PADDING_FRACTION = 0.1;

/** Quiet horizontal rules, so a value can be judged against the scale without
 * a numeric axis crowding a 320px phone. Three is enough to read a level by
 * and few enough to stay background. */
const GRID_LINES = [0.25, 0.5, 0.75] as const;

const MS_PER_DAY = 86_400_000;

function dayNumber(iso: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return 0;
  return Math.round(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) /
      MS_PER_DAY,
  );
}

export function TrendLine({
  points,
  summary,
  caption,
  target = null,
  baseline = null,
  projection = null,
  scaleToTarget = true,
  startLabel,
  endLabel,
  lowLabel,
  highLabel,
  describePoint,
  status,
  height = 168,
  "data-testid": testId,
}: TrendLineProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const readoutId = useId();

  const count = points.length;
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (count === 0) return;
      const step =
        event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (step === 0) {
        if (event.key === "Escape" && selected !== null) setSelected(null);
        return;
      }
      event.preventDefault();
      setSelected((current) => {
        // Arrowing in from nothing lands on the reading the page's headline
        // already states — the latest — rather than at an arbitrary end.
        if (current === null) return step > 0 ? 0 : count - 1;
        return Math.min(count - 1, Math.max(0, current + step));
      });
    },
    [count, selected],
  );

  const geometry = useMemo(() => {
    if (points.length < 2) return null;
    const days = points.map((point) => dayNumber(point.date));
    const firstDay = days[0]!;
    const lastDay = days[days.length - 1]!;
    /*
     * The projection's date joins the TIME axis, so the target point has a real
     * x position rather than being stacked on the last reading. A projection
     * dated on or before the last reading is ignored: a target date already
     * passed is a fact the status line states in words, not a line drawn
     * backwards.
     */
    const projectionDay =
      projection !== null ? dayNumber(projection.date) : null;
    const usableProjection =
      projectionDay !== null && projectionDay > lastDay ? projection : null;
    const axisEndDay =
      usableProjection !== null && projectionDay !== null
        ? projectionDay
        : lastDay;
    const daySpan = axisEndDay - firstDay;

    const values = points.map((point) => point.value);
    /*
     * The domain. The readings always participate; the target does too unless
     * the caller opted out, and the baseline does whenever it was given — so
     * the plot frames the WHOLE journey rather than only the part already
     * travelled.
     */
    const domain = [...values];
    if (scaleToTarget && target !== null) domain.push(target.value);
    if (baseline !== null) domain.push(baseline.value);
    // The projected point must be inside the plot, or the dotted line would run
    // off the top or bottom edge to a target the chart never shows.
    if (usableProjection !== null) domain.push(usableProjection.value);
    const dataMin = Math.min(...domain);
    const dataMax = Math.max(...domain);
    const rawSpan = dataMax - dataMin;
    const pad =
      rawSpan === 0
        ? Math.max(1, Math.abs(dataMax) * 0.05)
        : rawSpan * PADDING_FRACTION;
    const low = dataMin - pad;
    const high = dataMax + pad;
    const span = high - low || 1;

    const x = (index: number): number =>
      daySpan <= 0
        ? // Every reading on one day: spread evenly, because time cannot order
          // them and pretending otherwise would stack them on one pixel.
          points.length === 1
          ? VIEW / 2
          : (index / (points.length - 1)) * VIEW
        : ((days[index]! - firstDay) / daySpan) * VIEW;
    const y = (value: number): number => VIEW - ((value - low) / span) * VIEW;

    const inRange = (value: number) => value >= low && value <= high;

    const projectionPath =
      usableProjection !== null && projectionDay !== null
        ? `M${x(points.length - 1).toFixed(2)} ${y(points[points.length - 1]!.value).toFixed(2)} ` +
          `L${(((projectionDay - firstDay) / (daySpan || 1)) * VIEW).toFixed(2)} ${y(usableProjection.value).toFixed(2)}`
        : null;

    return {
      x,
      y,
      projection:
        usableProjection !== null && projectionDay !== null
          ? {
              path: projectionPath,
              x: ((projectionDay - firstDay) / (daySpan || 1)) * VIEW,
              y: y(usableProjection.value),
              label: usableProjection.label,
            }
          : null,
      path: points
        .map(
          (point, index) =>
            `${index === 0 ? "M" : "L"}${x(index).toFixed(2)} ${y(point.value).toFixed(2)}`,
        )
        .join(" "),
      targetY:
        target !== null && inRange(target.value) ? y(target.value) : null,
      baselineY:
        baseline !== null && inRange(baseline.value) ? y(baseline.value) : null,
    };
  }, [points, target, baseline, projection, scaleToTarget]);

  // Two readings are the minimum a line can honestly be drawn from. The caller
  // renders the "more measurements needed" state instead; this component does
  // not invent a flat line from one point.
  if (geometry === null) return null;

  const interactive = describePoint !== undefined;
  const selectedPoint = selected === null ? null : points[selected];

  return (
    <figure
      className="dh-linechart"
      data-testid={testId}
      {...meterStatusAttribute(status)}
    >
      {/* One tab stop for the whole series (see the module comment): the group
          is focusable, the arrow keys walk it, and every value it can reveal is
          also printed in the history list below. */}
      <div
        className="dh-linechart__frame"
        style={{ blockSize: `${height}px` }}
        tabIndex={interactive ? 0 : undefined}
        role={interactive ? "group" : undefined}
        aria-label={
          interactive
            ? `${summary} Use the arrow keys to step through each reading.`
            : undefined
        }
        aria-describedby={interactive ? readoutId : undefined}
        onKeyDown={interactive ? onKeyDown : undefined}
        onBlur={interactive ? () => setSelected(null) : undefined}
        onPointerLeave={interactive ? () => setSelected(null) : undefined}
      >
        <svg
          className="dh-linechart__plot"
          viewBox={`0 0 ${VIEW} ${VIEW}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={summary}
          style={{ height: `${height}px` }}
        >
          {GRID_LINES.map((fraction) => (
            <line
              key={fraction}
              className="dh-linechart__grid"
              x1={0}
              x2={VIEW}
              y1={fraction * VIEW}
              y2={fraction * VIEW}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {/* Where the owner started. Quieter than the target: it is context for
              the line, not the thing being aimed at. */}
          {geometry.baselineY !== null ? (
            <line
              className="dh-linechart__baseline"
              x1={0}
              x2={VIEW}
              y1={geometry.baselineY}
              y2={geometry.baselineY}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {/* The target. Dashed, distinct from the baseline's dotting, and
              always named in text beside the chart — never colour alone. */}
          {geometry.targetY !== null ? (
            <line
              className="dh-linechart__target"
              x1={0}
              x2={VIEW}
              y1={geometry.targetY}
              y2={geometry.targetY}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {/*
            REDESIGN-04 — the DOTTED path to the target point.
            Drawn beneath the solid line so the recorded history stays the
            dominant mark: what happened is the subject, what is required is
            the context.
          */}
          {geometry.projection?.path ? (
            <path
              className="dh-linechart__projection"
              d={geometry.projection.path}
              fill="none"
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
            />
          ) : null}
          <path
            className="dh-linechart__line"
            d={geometry.path}
            fill="none"
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* The target itself, as a marked point — a ring rather than a filled
              dot, so it reads as a destination rather than as a reading that
              has already been taken. */}
          {geometry.projection ? (
            <path
              className="dh-linechart__projection-point"
              d={`M${geometry.projection.x.toFixed(2)} ${geometry.projection.y.toFixed(2)} L${geometry.projection.x.toFixed(2)} ${geometry.projection.y.toFixed(2)}`}
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
            />
          ) : null}
          {points.map((point, index) => (
            // A zero-length round-capped segment: a true circle on screen even
            // though the coordinate space is stretched. See the module comment.
            <path
              key={point.key}
              className="dh-linechart__point"
              data-latest={index === points.length - 1 ? "true" : undefined}
              data-selected={index === selected ? "true" : undefined}
              d={`M${geometry.x(index).toFixed(2)} ${geometry.y(point.value).toFixed(2)} L${geometry.x(index).toFixed(2)} ${geometry.y(point.value).toFixed(2)}`}
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
            />
          ))}
          {/*
            The pointer targets. Invisible full-height bands, one per reading,
            so a reading is selected by being NEAR it horizontally rather than
            by hitting a 5px dot — the difference between a chart that responds
            to a fingertip and one that does not.
          */}
          {interactive
            ? points.map((point, index) => {
                const left =
                  index === 0
                    ? 0
                    : (geometry.x(index - 1) + geometry.x(index)) / 2;
                const right =
                  index === points.length - 1
                    ? VIEW
                    : (geometry.x(index) + geometry.x(index + 1)) / 2;
                return (
                  <rect
                    key={`hit-${point.key}`}
                    className="dh-linechart__hit"
                    x={left}
                    y={0}
                    width={Math.max(0.5, right - left)}
                    height={VIEW}
                    onPointerEnter={() => setSelected(index)}
                    onPointerDown={() => setSelected(index)}
                  />
                );
              })
            : null}
        </svg>
        {/*
          The reference TAGS, as HTML pinned to each line's height.

          Not SVG `<text>`: the plot is stretched with
          `preserveAspectRatio="none"`, which would squash a glyph horizontally
          by whatever factor the container happens to impose. HTML positioned at
          the same percentage sits exactly on the rule and keeps its typeface,
          its size and the owner's font scaling.

          `aria-hidden`, because both are already stated in the caption below —
          this is a convenience for the eye, not a second source of the fact.
        */}
        {geometry.targetY !== null && target?.tag ? (
          <span
            className="dh-linechart__tag dh-linechart__tag--target"
            style={{ insetBlockStart: `${geometry.targetY}%` }}
            aria-hidden="true"
          >
            {target.tag}
          </span>
        ) : null}
        {geometry.baselineY !== null && baseline?.tag ? (
          <span
            className="dh-linechart__tag dh-linechart__tag--baseline"
            style={{ insetBlockStart: `${geometry.baselineY}%` }}
            aria-hidden="true"
          >
            {baseline.tag}
          </span>
        ) : null}
      </div>
      {/* Real text, not SVG labels: it wraps, scales with the owner's font size,
          and stays legible at 320px where a dense numeric axis would not. */}
      <div className="dh-linechart__axis" aria-hidden="true">
        <span className="dh-linechart__axis-range">
          {lowLabel} – {highLabel}
        </span>
        <span className="dh-linechart__axis-dates">
          <span>{startLabel}</span>
          <span>{endLabel}</span>
        </span>
      </div>
      {interactive ? (
        /*
         * The readout. A live region, so arrowing through the series announces
         * each reading — and it keeps its height when nothing is selected, so
         * pointing at the chart does not shift the page beneath the cursor.
         */
        <p
          className="dh-linechart__readout"
          id={readoutId}
          role="status"
          data-empty={selectedPoint ? undefined : "true"}
        >
          {/*
            With nothing selected this states the LATEST reading rather than an
            instruction. It fills the reserved line with information instead of
            chrome, it is the reading the page's headline already leads with —
            so the two agree — and pointing at the chart simply moves it.
          */}
          {describePoint!(selectedPoint ?? points[points.length - 1]!)}
        </p>
      ) : null}
      {/*
        REDESIGN-04 — the projection, stated in words.
        The dotted line and its ring are a picture of this sentence; the
        sentence is what a screen reader, a printout and a forced-colors
        rendering all still get.
      */}
      {geometry.projection ? (
        <p className="dh-linechart__projection-note">
          <span className="dh-linechart__projection-key" aria-hidden="true" />
          {geometry.projection.label}
        </p>
      ) : null}
      <figcaption className="dh-linechart__summary">
        {caption ?? summary}
        {caption ? (
          <span className="dh-visually-hidden"> {summary}</span>
        ) : null}
        {baseline !== null ? (
          <span className="dh-linechart__ref-note"> {baseline.label}</span>
        ) : null}
        {target !== null ? (
          <span className="dh-linechart__ref-note"> {target.label}</span>
        ) : null}
      </figcaption>
    </figure>
  );
}
