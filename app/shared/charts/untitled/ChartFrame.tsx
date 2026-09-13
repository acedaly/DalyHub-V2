/**
 * UNTITLED-08 — the frame every Untitled-backed chart in DalyHub sits in.
 *
 * DalyHub's charts are now Untitled's (`application/charts-base` over Recharts).
 * What Untitled does not supply — and what a personal operating system cannot do
 * without — is the CONTRACT around the plot:
 *
 *   1. **The chart is never the only way to read it.** A required `summary`
 *      states the series in words. It is the plot's accessible name, and either
 *      it or a shorter `caption` is drawn where a caption belongs, so a screen
 *      reader, a printout, a forced-colours rendering and a reader who simply
 *      does not read graphs all get the same facts (AGENTS.md §15).
 *   2. **The plot never renders on the server.** Recharts measures its container
 *      to lay out; on a Cloudflare Worker there is nothing to measure, so an SSR
 *      pass would emit an empty box and then throw it away at hydration. The
 *      frame reserves the plot's exact height, renders the words, and mounts the
 *      chart after hydration — so the page does not shift and the Worker never
 *      evaluates a charting library it cannot use.
 *   3. **The reading is announced.** `readout` is a polite live region under the
 *      plot. Recharts' `accessibilityLayer` gives the plot one tab stop and
 *      arrow-key stepping; this is where the stepped-to reading is SAID.
 *   4. **Motion is the owner's choice.** `useReducedMotion` is passed down to
 *      the chart rather than fought in CSS, because Recharts animates in JS and
 *      a stylesheet cannot reach it.
 *
 * It renders no boundary of its own. A chart in DalyHub lives inside a panel
 * that already has one — a record band, a `TableCard.Root`, a rail card — and a
 * second ring around the plot is the card-inside-a-card the migration guide
 * names. Padding and heading are the host's.
 */

import { useEffect, useId, useState, type ReactNode } from "react";

import { useReducedMotion } from "~/shared/motion";

import { CHART_HEIGHT } from "./chart-theme";

export interface ChartFrameProps {
  /**
   * The series in words, and the chart's accessible name. Required — this is
   * the chart's text form, not a description of it.
   *
   * "7 measurements from 92 kg on 20 Jun 2026 to 83 kg on 9 Sep 2026 — down
   * 9 kg. Target 78 kg by 10 Jan 2027."
   */
  readonly summary: string;
  /**
   * The VISIBLE caption, when the summary is too long to print.
   *
   * A summary that enumerates every reading is right for a screen reader and
   * wrong under a plot. Supply a short caption and the full summary stays in the
   * document, visually hidden, so nothing is taken from anyone.
   */
  readonly caption?: ReactNode;
  /**
   * The plot. A function rather than an element, so the module is not imported —
   * and therefore not evaluated — until the frame has mounted in a browser.
   */
  readonly children: (context: ChartRenderContext) => ReactNode;
  /** The reserved block size of the plot area, in pixels. */
  readonly height?: number;
  /**
   * The live readout beneath the plot, for a chart whose points can be stepped
   * through. Keeps its line when nothing is selected, so pointing at the chart
   * does not shift the page under the cursor.
   */
  readonly readout?: ReactNode;
  /** Legend, key or reference notes, drawn between the plot and the caption. */
  readonly legend?: ReactNode;
  readonly className?: string;
  /**
   * The chart's semantic status, in the product's ONE meter vocabulary — the
   * same `data-meter-status` every progress bar and meter carries. Stated on
   * the frame so "what does this chart say about the thing it plots?" has one
   * answer that is readable without seeing the plot's colour, which is what
   * makes the tone a reinforcement rather than the meaning.
   */
  readonly status?: "success" | "info" | "warning" | "danger";
  readonly "data-testid"?: string;
}

export interface ChartRenderContext {
  /**
   * Whether the owner asked for less motion. Pass it to every Recharts
   * `isAnimationActive`; the library animates in JS, where CSS cannot reach it.
   */
  readonly reducedMotion: boolean;
  /** The id of the element holding the accessible summary. */
  readonly summaryId: string;
}

export function ChartFrame({
  summary,
  caption,
  children,
  height = CHART_HEIGHT,
  readout,
  legend,
  className,
  status,
  "data-testid": testId,
}: ChartFrameProps) {
  const reducedMotion = useReducedMotion();
  const summaryId = useId();

  /*
   * Mounted, not "is this a browser". The first client render must match the
   * server's or React discards the tree, so the plot is introduced by an effect
   * — the same rule `useCompactViewport` and `useReducedMotion` already follow.
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <figure
      className={`dh-chart m-0 flex min-w-0 flex-col gap-3 ${className ?? ""}`}
      data-meter-status={status}
      data-testid={testId}
    >
      {/*
       * The plot's reserved box. Its height is fixed before the chart exists, so
       * the words below it do not jump when Recharts arrives — and `min-w-0`
       * with `w-full` is what lets Recharts' responsive container shrink inside
       * a flex or grid parent instead of pinning the page open at its widest
       * measured width.
       */}
      <div
        className="dh-chart__plot w-full min-w-0"
        style={{ blockSize: `${height}px` }}
      >
        {mounted ? children({ reducedMotion, summaryId }) : null}
      </div>

      {legend === undefined ? null : (
        <div className="dh-chart__key flex flex-wrap items-center gap-x-4 gap-y-1">
          {legend}
        </div>
      )}

      {readout === undefined ? null : (
        <p
          className="dh-chart__readout m-0 min-h-5 text-sm text-secondary tabular-nums"
          role="status"
        >
          {readout}
        </p>
      )}

      <figcaption
        className="dh-chart__caption m-0 text-sm text-tertiary"
        id={summaryId}
      >
        {caption ?? summary}
        {caption === undefined ? null : (
          <span className="sr-only"> {summary}</span>
        )}
      </figcaption>
    </figure>
  );
}

/**
 * One entry in a chart's key — a swatch drawn with the series' own dash pattern,
 * beside the words for it.
 *
 * Untitled's `ChartLegendContent` draws a filled dot per series, which is the
 * right legend for four brand-coloured series on a dashboard and the wrong one
 * for DalyHub: our second and third lines are told apart by DASH rather than by
 * hue, so a round dot would make two visibly different lines look identical in
 * the key. The swatch is a line segment carrying the same stroke and the same
 * dash the plot uses.
 */
export function ChartKeyItem({
  color,
  dash,
  shape = "line",
  children,
}: {
  readonly color: string;
  readonly dash?: string;
  /**
   * What the plot actually draws. A key is only useful if its swatch is the
   * same mark as the thing it names — a line swatch beside a bar chart is a
   * legend for a chart that is not on the page.
   */
  readonly shape?: "line" | "bar";
  readonly children: ReactNode;
}) {
  return (
    <span className="flex items-center gap-2 text-xs text-tertiary">
      <svg
        className="shrink-0"
        width="20"
        height="10"
        viewBox="0 0 20 10"
        aria-hidden="true"
        focusable="false"
      >
        {shape === "bar" ? (
          <rect x="3" y="0" width="14" height="10" rx="2" fill={color} />
        ) : (
          <line
            x1="0"
            y1="5"
            x2="20"
            y2="5"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={dash}
          />
        )}
      </svg>
      {children}
    </span>
  );
}
