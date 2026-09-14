/**
 * UNTITLED-17 — a SHARE ACROSS NAMED CATEGORIES, as one labelled list.
 *
 * ── What this replaces, and why it is here rather than in `~/shared/charts` ──
 *
 * Two implementations of one shape existed, in two modules, drawn two different
 * ways. Reports drew `CategoryBars`: a hand-written `<svg>` rectangle per row,
 * painted from `charts.css`. Analytics drew `dh-analytics__split`: a `<span>`
 * track with an inline `inlineSize: N%`, painted from `analytics.css`. Same
 * question — "how did this total divide up?" — same anatomy, two bespoke
 * geometries, two radii, two track colours and two sets of accessibility
 * behaviour to keep correct.
 *
 * It is deliberately NOT in the chart directory, and the distinction is the one
 * `charts/index.ts` already draws. This has no axis, no plot area, no tooltip
 * and no legend; every row states its own figure and its own share in words
 * beside the bar, and the list is completely readable with every bar removed.
 * It is a run of PROGRESS INDICATORS with a shared denominator — which is
 * exactly what the migration brief says to do with a "chart" that turns out to
 * be one ("where they are really progress indicators, migrate them to Untitled
 * progress components instead"). So the bar is `ProgressTrack`, which is
 * Untitled's `ProgressBarBase` geometry through `LabelledProgressBar`, and this
 * file draws no track of its own at all.
 *
 * ── One fill, not an identity accent per row ────────────────────────────────
 *
 * Analytics' bars used to carry each Area's own identity accent. They no longer
 * do, and that is a deliberate convergence rather than an omission: a bar in a
 * proportion list encodes MAGNITUDE, and giving eight bars eight hues makes the
 * ranking harder to read while adding a second colour system beside the chart
 * foundation's (§43). The Area is still named, still linked, and still carries
 * its identity everywhere identity is the subject.
 *
 * ── A REMAINDER is not a category ───────────────────────────────────────────
 *
 * "37 others" states a BOUND on the list, not a share of it, so it is drawn
 * without a bar — there is nothing for the eye to compare it against, and a bar
 * for it would invite exactly that comparison.
 */

import { Link } from "react-router";

import { ProgressTrack } from "./ProgressTrack";

export interface CategorySplitRow {
  readonly key: string;
  /** The category's name, as the owner knows it. */
  readonly label: string;
  /**
   * The magnitude this row's bar draws, in the same unit as every other row.
   * `null` is a row with no reading — it keeps its place and draws no bar.
   */
  readonly value: number | null;
  /** The value in words, as the surface states it ("$1,240.00", "24"). */
  readonly formatted: string;
  /** A second quiet line under the figure ("12 transactions"). */
  readonly detail?: string;
  /** Where the category's own records live. Omitted, the name is plain text. */
  readonly href?: string;
  /**
   * A bound on the list rather than a member of it ("37 others"). Drawn with
   * its figure and no bar.
   */
  readonly remainder?: boolean;
}

export interface CategorySplitProps {
  readonly rows: readonly CategorySplitRow[];
  /** The list's accessible name — "Completed work by Area". Required. */
  readonly label: string;
  /**
   * The denominator every share is taken against. Omitted, it is the largest
   * row — which is the right default when the rows are a RANKING rather than a
   * division of a known total, because the longest bar should then be full.
   */
  readonly total?: number;
  /** Whether each row states its percentage beside its figure. */
  readonly showShare?: boolean;
  readonly className?: string;
  readonly "data-testid"?: string;
}

/** A share as a whole percent, never dividing by zero. */
function share(value: number, denominator: number): number {
  if (!Number.isFinite(denominator) || denominator <= 0) return 0;
  return Math.round((value / denominator) * 100);
}

export function CategorySplit({
  rows,
  label,
  total,
  showShare = false,
  className,
  "data-testid": testId,
}: CategorySplitProps) {
  const measured = rows.filter(
    (row) => row.remainder !== true && row.value !== null,
  );
  const denominator =
    total ??
    (measured.length > 0
      ? Math.max(...measured.map((row) => row.value ?? 0))
      : 0);

  return (
    <ul
      className={`flex min-w-0 list-none flex-col gap-3 p-0 ${className ?? ""}`}
      aria-label={label}
      data-testid={testId}
    >
      {rows.map((row) => {
        const percent =
          row.value === null ? null : share(row.value, denominator);
        return (
          <li
            key={row.key}
            className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1"
            data-remainder={row.remainder === true ? "true" : undefined}
          >
            <span className="min-w-0 truncate text-sm text-primary">
              {row.href ? (
                <Link
                  className="rounded-sm text-primary underline decoration-transparent underline-offset-2 outline-focus-ring transition duration-100 ease-linear hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2"
                  to={row.href}
                >
                  {row.label}
                </Link>
              ) : (
                row.label
              )}
            </span>
            <span className="flex items-baseline gap-2 text-sm tabular-nums text-primary">
              {row.formatted}
              {showShare && percent !== null && row.remainder !== true ? (
                <span className="text-xs text-tertiary">{percent}%</span>
              ) : null}
            </span>
            {row.remainder === true || percent === null ? null : (
              <span className="col-span-2 block">
                <ProgressTrack
                  label={row.label}
                  percent={percent}
                  /*
                   * The bar announces the FIGURE the row already prints. The
                   * share is added by `LabelledProgressBar` itself, which
                   * always says "NN% — …", so restating it here would announce
                   * the percentage twice.
                   */
                  valueText={row.formatted}
                  /* Never "complete": a share of a total is not an achievement. */
                  complete={false}
                />
              </span>
            )}
            {row.detail ? (
              <span className="col-span-2 text-xs text-tertiary">
                {row.detail}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
