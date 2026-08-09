/**
 * GOAL-02 — the shared MEASUREMENT TREND primitive.
 *
 * A series of dated readings drawn as one line, with an optional reference line
 * for the target. It exists because a Goal's history is the only thing in
 * DalyHub where the SHAPE of the data is the information: "79.0, 79.3, 80.1" is
 * three numbers, and the same three numbers as a line are a direction.
 *
 * ── Why it is hand-rolled SVG ────────────────────────────────────────────────
 * The same reason `ProgressRing` and `TrendBars` are: a line chart is a `map`
 * over points and a `polyline`. A charting library would ship a runtime
 * dependency, a second colour system and a second set of accessibility
 * behaviours to keep correct, in exchange for code we would still have to
 * configure. Painting with the generated design tokens means the chart is right
 * in both appearances by construction.
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
 * axis ends and the value range are real text, so they wrap, scale with the
 * owner's font size and are selectable. Direction is never carried by colour
 * alone — the summary says which way the numbers moved.
 *
 * ── Deliberately not interactive ────────────────────────────────────────────
 * No tooltips, no hover readouts, no focus targets. Every reading is already
 * listed beneath the chart in the measurement history, so an interaction would
 * add a tab stop and reveal a second copy of what is on the page.
 */

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
  /** The target, drawn as a subtle dashed reference line when it is in range. */
  readonly target?: { readonly value: number; readonly label: string } | null;
  /** The axis ends, as the owner reads them ("5 Jul", "9 Aug"). */
  readonly startLabel: string;
  readonly endLabel: string;
  /** The value range, as the owner reads it ("79.0 kg", "85.0 kg"). */
  readonly lowLabel: string;
  readonly highLabel: string;
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
  target = null,
  startLabel,
  endLabel,
  lowLabel,
  highLabel,
  height = 132,
  "data-testid": testId,
}: TrendLineProps) {
  // Two readings are the minimum a line can honestly be drawn from. The caller
  // renders the "more measurements needed" state instead; this component does
  // not invent a flat line from one point.
  if (points.length < 2) return null;

  const days = points.map((point) => dayNumber(point.date));
  const firstDay = days[0]!;
  const lastDay = days[days.length - 1]!;
  const daySpan = lastDay - firstDay;

  const values = points.map((point) => point.value);
  // The target only participates in the vertical scale when there IS one, so a
  // far-away target cannot flatten the readings into a straight line at the top
  // of the box. It is clamped into view instead (see `targetY`).
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
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

  const path = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${x(index).toFixed(2)} ${y(point.value).toFixed(2)}`,
    )
    .join(" ");

  const targetInRange =
    target !== null && target.value >= low && target.value <= high;
  const targetY = targetInRange ? y(target.value) : null;

  return (
    <figure className="dh-linechart" data-testid={testId}>
      <svg
        className="dh-linechart__plot"
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={summary}
        style={{ height: `${height}px` }}
      >
        {/* The target reference, only when it falls inside the plotted range.
            Drawn dashed and quiet: it is a line to aim at, not a second series,
            and it is always named in text beside the chart. */}
        {targetY !== null ? (
          <line
            className="dh-linechart__target"
            x1={0}
            x2={VIEW}
            y1={targetY}
            y2={targetY}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        <path
          className="dh-linechart__line"
          d={path}
          fill="none"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((point, index) => (
          // A zero-length round-capped segment: a true circle on screen even
          // though the coordinate space is stretched. See the module comment.
          <path
            key={point.key}
            className="dh-linechart__point"
            data-latest={index === points.length - 1 ? "true" : undefined}
            d={`M${x(index).toFixed(2)} ${y(point.value).toFixed(2)} L${x(index).toFixed(2)} ${y(point.value).toFixed(2)}`}
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
          />
        ))}
      </svg>
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
      <figcaption className="dh-linechart__summary">
        {summary}
        {target !== null ? (
          <span className="dh-linechart__target-note"> {target.label}</span>
        ) : null}
      </figcaption>
    </figure>
  );
}
