/**
 * V2.9 INS-01 — the SERIES: points, the buckets they were counted over, and
 * whatever bound applied.
 *
 * ── Why a series carries its bound ──────────────────────────────────────────
 * ADR-079 decision 11: a surface must never present a capped population as a
 * complete one. The failure this prevents is specific and has happened before
 * in this product (DEBT-232): a bounded page is read, its rows are counted, and
 * the count is printed as though it were the total. A `Series` makes that
 * mistake require ignoring a field rather than merely forgetting a rule — the
 * bound, the value that bound it and the reason travel WITH the points, all the
 * way to the words the surface prints.
 *
 * ── What a series is not ────────────────────────────────────────────────────
 * It carries no score, no grade, no percentage and no verdict (ADR-079 d6,
 * ADR-110 d4, ADR-111 d7); it is not stored, cached or pre-aggregated (ADR-110
 * d3/d7); and it does not know how to draw itself. It is the shape a
 * deterministic read comes back in.
 */

import type { ActivityWindow } from "~/kernel/activity-window";

import type {
  Grain,
  HistoryBoundReason,
  HistoryBucket,
  HistoryBuckets,
} from "./history-grain";

/**
 * A point and the bucket it was counted over.
 *
 * The bucket travels with the point so that a surface can say "in the week to
 * 30 August" without holding the bucket list alongside and trusting the two to
 * stay in step.
 */
export interface SeriesPoint<Value> {
  readonly key: string;
  readonly bucket: HistoryBucket;
  readonly value: Value;
}

/**
 * One deterministic reading of the owner's history, oldest point first.
 *
 * `points` has exactly one entry per bucket — a bucket in which nothing
 * happened is a point whose value is empty or zero, never an absent one, since
 * an absent bucket is indistinguishable from a quiet one.
 */
export interface Series<Value> {
  readonly grain: Grain;
  /** The window the points actually cover. */
  readonly window: ActivityWindow;
  readonly points: readonly SeriesPoint<Value>[];
  readonly bounded: boolean;
  readonly bound: number | null;
  readonly boundReason: HistoryBoundReason | null;
}

/**
 * Build a series by asking `valueOf` for each bucket's value.
 *
 * The one construction path, so a series cannot be assembled with points and
 * buckets that disagree, or with a bound the buckets do not carry.
 */
export function buildSeries<Value>(
  buckets: HistoryBuckets,
  valueOf: (bucket: HistoryBucket) => Value,
): Series<Value> {
  return {
    grain: buckets.grain,
    window: buckets.window,
    points: buckets.buckets.map((bucket) => ({
      key: bucket.key,
      bucket,
      value: valueOf(bucket),
    })),
    bounded: buckets.bounded,
    bound: buckets.bound,
    boundReason: buckets.boundReason,
  };
}

/**
 * The same series with each value mapped — the bound and the buckets carried
 * through unchanged, which is the point: a derived series cannot lose the
 * boundedness of the one it came from.
 */
export function mapSeries<From, To>(
  series: Series<From>,
  transform: (value: From, point: SeriesPoint<From>) => To,
): Series<To> {
  return {
    ...series,
    points: series.points.map((point) => ({
      key: point.key,
      bucket: point.bucket,
      value: transform(point.value, point),
    })),
  };
}

/**
 * A series that could not be read, carrying its grain and window so the surface
 * still says WHICH period it cannot describe.
 *
 * "Not available" with a named window is honest; an empty chart is not, because
 * an empty chart reads as "nothing happened".
 */
export function unavailableSeries<Value>(
  grain: Grain,
  window: ActivityWindow,
): Series<Value> {
  return {
    grain,
    window,
    points: [],
    bounded: false,
    bound: null,
    boundReason: null,
  };
}

/**
 * The total across a numeric series' buckets.
 *
 * **Not the same figure as a range total, and never a substitute for one.** A
 * Task completed, reopened and completed again in two different buckets is
 * counted in each, so summing buckets over-counts against the single-window
 * total the range card states — which is exactly why Analytics reads its total
 * as its own window (`analytics-context.ts`) and why this helper is named for
 * what it does rather than for what a caller might wish it were.
 */
export function sumSeries(series: Series<number>): number {
  return series.points.reduce((total, point) => total + point.value, 0);
}
