/**
 * GOAL-02 — the shared TWO-SERIES COMPARISON primitive.
 *
 * A handful of periods with two figures each, drawn as paired bars. It exists
 * for exactly one question Today needs to answer — *is my workload growing or
 * shrinking?* — which is a comparison, not a total: "5 completed" means nothing
 * without "3 created" beside it.
 *
 * ── Why paired bars rather than two lines ───────────────────────────────────
 * At 320px a seven-point two-line chart is two overlapping scribbles with no
 * room for markers. Paired bars keep the two series physically separate, stay
 * readable when both values are small integers, and degrade gracefully to a
 * single visible sliver for a zero — which is the honest drawing of "nothing
 * that day", not a gap that reads as missing data.
 *
 * ── Accessibility ──────────────────────────────────────────────────────────
 * `summary` is required and states every period in words; the SVG is
 * `role="img"` labelled by it. Unlike `TrendLine`, it is NOT also rendered as a
 * visible caption, because this chart already prints every value it holds: each
 * period's two numbers sit under its bars as ordinary text. A caption repeating
 * them would be the same data three times on one card. The two series are
 * distinguished by a named legend and by their POSITION in each pair, never by
 * colour alone.
 *
 * Deliberately not interactive, for the same reason as every other DalyHub
 * chart: every value is already on the page.
 */

/** One period, with a figure for each series. */
export interface ComparisonBarsPoint {
  readonly key: string;
  /** The period the owner recognises, kept short ("Mon"). */
  readonly label: string;
  readonly primary: number;
  readonly secondary: number;
}

export interface ComparisonBarsProps {
  /** Oldest first. Two or more periods. */
  readonly points: readonly ComparisonBarsPoint[];
  /** What the first bar of each pair counts ("Completed"). */
  readonly primaryLabel: string;
  /** What the second bar counts ("Created"). */
  readonly secondaryLabel: string;
  /** The sentence that states every value. Required — the chart's text form. */
  readonly summary: string;
  readonly height?: number;
  readonly "data-testid"?: string;
}

const VIEW = 100;
/** The share of a period's slot left empty between pairs, so the eye groups the
 * two bars of one day rather than the two nearest bars. */
const GROUP_GAP_RATIO = 0.34;
/** A zero still draws a visible sliver, so an empty day reads as "nothing here"
 * rather than as a rendering failure. */
const MIN_BAR_FRACTION = 0.03;

export function ComparisonBars({
  points,
  primaryLabel,
  secondaryLabel,
  summary,
  height = 96,
  "data-testid": testId,
}: ComparisonBarsProps) {
  if (points.length < 2) return null;

  // ONE shared vertical scale across both series — two scales would make a bar
  // twice as tall as another while representing a smaller number.
  const max = points.reduce(
    (peak, point) => Math.max(peak, point.primary, point.secondary),
    0,
  );
  const slot = VIEW / points.length;
  const pairWidth = slot * (1 - GROUP_GAP_RATIO);
  const barWidth = pairWidth / 2;

  const barHeight = (value: number): number =>
    max <= 0
      ? MIN_BAR_FRACTION * VIEW
      : Math.max(MIN_BAR_FRACTION, value / max) * VIEW;

  return (
    <figure className="dh-cbars" data-testid={testId}>
      <p className="dh-cbars__legend" aria-hidden="true">
        <span className="dh-cbars__key dh-cbars__key--primary">
          {primaryLabel}
        </span>
        <span className="dh-cbars__key dh-cbars__key--secondary">
          {secondaryLabel}
        </span>
      </p>
      <svg
        className="dh-cbars__plot"
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={summary}
        style={{ height: `${height}px` }}
      >
        {points.map((point, index) => {
          const left = index * slot + (slot - pairWidth) / 2;
          const primaryHeight = barHeight(point.primary);
          const secondaryHeight = barHeight(point.secondary);
          return (
            <g key={point.key}>
              <rect
                className="dh-cbars__bar dh-cbars__bar--primary"
                x={left}
                y={VIEW - primaryHeight}
                width={barWidth}
                height={primaryHeight}
              />
              <rect
                className="dh-cbars__bar dh-cbars__bar--secondary"
                x={left + barWidth}
                y={VIEW - secondaryHeight}
                width={barWidth}
                height={secondaryHeight}
              />
            </g>
          );
        })}
      </svg>
      <ol className="dh-cbars__axis" aria-hidden="true">
        {points.map((point) => (
          <li key={point.key}>
            <span className="dh-cbars__values">
              <span className="dh-cbars__value dh-cbars__value--primary">
                {point.primary}
              </span>
              <span className="dh-cbars__value dh-cbars__value--secondary">
                {point.secondary}
              </span>
            </span>
            <span className="dh-cbars__label">{point.label}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}
