/**
 * UIX-03 — the shared SPARKLINE primitive.
 *
 * The smallest honest drawing of a series: one line, no axes, no labels, no
 * grid, optionally a dot on the latest reading. It exists for the one place a
 * full chart cannot go — a gallery card and a Today row — where the question is
 * not "what were the numbers?" but "which way is this moving?".
 *
 * ── What it refuses to draw ─────────────────────────────────────────────────
 * A single point. One reading has no direction, and a horizontal line through
 * it would assert one; the component returns `null` and the card renders the
 * current-against-target comparison instead. That is the same rule `TrendLine`
 * applies at the larger size, and it is why no surface has to guess whether it
 * has enough data — it asks for a sparkline and gets one only when there is a
 * trend to show.
 *
 * ── Accessibility ───────────────────────────────────────────────────────────
 * `aria-hidden`, deliberately, and this is the one chart in DalyHub that is.
 * Every sparkline sits beside the same card's current value, target and
 * percentage as ordinary text, and its own `summary` would be a fourth reading
 * of facts already announced — so it is marked decorative and the card's text
 * carries the meaning. A chart that is the ONLY statement of its data is
 * `TrendLine`, and that one is `role="img"` with a required summary.
 *
 * ── How it stays crisp ──────────────────────────────────────────────────────
 * Like every DalyHub chart: a 100×100 space stretched to the container, with
 * `vector-effect="non-scaling-stroke"` on every stroke so the squash never
 * reaches the line weight or turns the end dot into an ellipse.
 */

/** One reading. Positioned by TIME, so a gap in logging shows as a gap. */
export interface SparklinePoint {
  readonly key: string;
  /** The owner-calendar date, `YYYY-MM-DD`. */
  readonly date: string;
  readonly value: number;
}

export interface SparklineProps {
  /** Oldest first. Fewer than two renders nothing — see the module comment. */
  readonly points: readonly SparklinePoint[];
  /**
   * Which way "better" points, so the line can be toned by whether the series
   * is moving TOWARDS the target rather than by the sign of its gradient. A
   * weight coming down and savings going up are both "improving", and a chart
   * that coloured them by direction alone would say the opposite of one of them.
   *
   * Tone is never the only signal: the card states the status in words.
   */
  readonly direction?: "increase" | "decrease" | null;
  /** Draw a dot on the most recent reading. */
  readonly endMarker?: boolean;
  readonly height?: number;
  readonly className?: string;
}

const VIEW = 100;
/** Head-room so a flat-ish series is not clipped by its own frame. */
const PADDING_FRACTION = 0.12;
const MS_PER_DAY = 86_400_000;

function dayNumber(iso: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return 0;
  return Math.round(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) /
      MS_PER_DAY,
  );
}

export function Sparkline({
  points,
  direction = null,
  endMarker = true,
  height = 32,
  className,
}: SparklineProps) {
  if (points.length < 2) return null;

  const days = points.map((point) => dayNumber(point.date));
  const firstDay = days[0]!;
  const daySpan = days[days.length - 1]! - firstDay;

  const values = points.map((point) => point.value);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const rawSpan = dataMax - dataMin;
  const pad =
    rawSpan === 0
      ? Math.max(1, Math.abs(dataMax) * 0.05)
      : rawSpan * PADDING_FRACTION;
  const low = dataMin - pad;
  const span = dataMax + pad - low || 1;

  const x = (index: number): number =>
    daySpan <= 0
      ? (index / (points.length - 1)) * VIEW
      : ((days[index]! - firstDay) / daySpan) * VIEW;
  const y = (value: number): number => VIEW - ((value - low) / span) * VIEW;

  const path = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${x(index).toFixed(2)} ${y(point.value).toFixed(2)}`,
    )
    .join(" ");

  // Towards the target, not merely upwards. `null` when the caller has no
  // direction to give, which renders the neutral tone rather than a guess.
  const first = values[0]!;
  const last = values[values.length - 1]!;
  const movement = last - first;
  const towards =
    direction === null ? 0 : direction === "decrease" ? -movement : movement;
  const tone = towards > 0 ? "improving" : towards < 0 ? "regressing" : "level";

  return (
    <svg
      className={["dh-spark", className].filter(Boolean).join(" ")}
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      preserveAspectRatio="none"
      data-tone={tone}
      style={{ height: `${height}px` }}
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="dh-spark__line"
        d={path}
        fill="none"
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {endMarker ? (
        // A zero-length round-capped segment renders as a true circle even
        // though the coordinate space is stretched.
        <path
          className="dh-spark__end"
          d={`M${x(points.length - 1).toFixed(2)} ${y(last).toFixed(2)} L${x(
            points.length - 1,
          ).toFixed(2)} ${y(last).toFixed(2)}`}
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
        />
      ) : null}
    </svg>
  );
}
