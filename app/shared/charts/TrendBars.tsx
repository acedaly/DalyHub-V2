/**
 * REVIEW-03 — the shared BOUNDED TREND primitive.
 *
 * A handful of periods, one value each, drawn as a row of bars. It exists
 * because a Review's honest trend is five or six numbers, and five or six
 * numbers deserve a shape rather than a paragraph.
 *
 * ── Why it is hand-rolled SVG ────────────────────────────────────────────────
 * The same reason `ProgressRing` is: a bar chart of six points is a `map` over
 * rectangles. Adding a charting library for it would ship a runtime dependency,
 * a second colour system and a second set of accessibility behaviours to keep
 * correct, in exchange for code we would still have to configure. Painting with
 * the generated design tokens instead means the chart is right in both
 * appearances by construction — there is no palette here to keep in sync.
 *
 * ── The chart is never the only way to read it ──────────────────────────────
 * `summary` is required and states every point in words. The SVG is
 * `role="img"` and labelled by it, and the same sentence is rendered visibly
 * beneath the bars — so someone using a screen reader, someone with the chart
 * clipped on a narrow phone, and someone printing the page all get the numbers.
 * Each bar additionally carries its period label and value as text beneath it
 * whenever there is room, and the value is never encoded by colour alone.
 *
 * ── Deliberately not interactive ────────────────────────────────────────────
 * No tooltips, no hover readouts, no focus targets. Every value is already
 * printed, so there would be nothing behind an interaction except a second copy
 * of what is on the page — and a keyboard user would gain a tab stop for it.
 */

import type { CSSProperties } from "react";

/** One period on the trend. */
export interface TrendBarPoint {
  readonly key: string;
  /** The period the owner recognises — kept short; the summary carries the full one. */
  readonly label: string;
  readonly value: number;
  /** True for the period being reviewed, which is drawn in the stronger tone. */
  readonly current?: boolean;
}

export interface TrendBarsProps {
  /** Oldest first. Two or more points; fewer is a number, not a trend. */
  readonly points: readonly TrendBarPoint[];
  /** The sentence that states every value. Required — it IS the chart's text form. */
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

  /** Height of the plotted area in pixels. The width is always fluid. */
  readonly height?: number;
}

/** The plotted area's coordinate space. The SVG scales to its container's
 * width, so these are ratios, not pixels the owner ever sees. */
const VIEW_WIDTH = 100;
const BAR_GAP_RATIO = 0.28;
/**
 * How wide one period is allowed to be. A trend of two periods must not become
 * two enormous slabs across a 1440px page: the chart is evidence beside a
 * sentence, not the point of the section. The plot therefore grows with the
 * NUMBER of periods and stops, and it still shrinks to fit a phone.
 */
const COLUMN_MAX_WIDTH_REM = 4.5;
/** A zero still draws a visible sliver, so an empty period reads as "nothing
 * here" rather than as a rendering failure. */
const MIN_BAR_FRACTION = 0.02;

export function TrendBars({
  points,
  summary,
  caption,
  height = 64,
}: TrendBarsProps) {
  if (points.length < 2) return null;

  const max = points.reduce((peak, point) => Math.max(peak, point.value), 0);
  const slot = VIEW_WIDTH / points.length;
  const barWidth = slot * (1 - BAR_GAP_RATIO);
  const viewHeight = 100;

  return (
    <div
      className="dh-trend"
      style={
        {
          ["--app-trend-width" as string]: `${
            points.length * COLUMN_MAX_WIDTH_REM
          }rem`,
        } as CSSProperties
      }
    >
      <svg
        className="dh-trend__plot"
        viewBox={`0 0 ${VIEW_WIDTH} ${viewHeight}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={summary}
        style={{ height: `${height}px` }}
      >
        {points.map((point, index) => {
          const fraction =
            max <= 0
              ? MIN_BAR_FRACTION
              : Math.max(MIN_BAR_FRACTION, point.value / max);
          const barHeight = fraction * viewHeight;
          return (
            <rect
              key={point.key}
              className="dh-trend__bar"
              data-current={point.current === true ? "true" : undefined}
              x={index * slot + (slot - barWidth) / 2}
              y={viewHeight - barHeight}
              width={barWidth}
              height={barHeight}
              rx={1}
            />
          );
        })}
      </svg>
      {/* The axis is real text, not SVG labels: it wraps, it scales with the
       * owner's font size, and it is selectable and searchable. */}
      <ol className="dh-trend__axis" aria-hidden="true">
        {points.map((point) => (
          <li
            key={point.key}
            data-current={point.current === true ? "true" : undefined}
          >
            <span className="dh-trend__value">{point.value}</span>
            <span className="dh-trend__label">{point.label}</span>
          </li>
        ))}
      </ol>
      <p className="dh-trend__summary">
        {caption ?? summary}
        {caption ? (
          <span className="dh-visually-hidden"> {summary}</span>
        ) : null}
      </p>
    </div>
  );
}
