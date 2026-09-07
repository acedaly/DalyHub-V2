/**
 * V2.13 RPT-04 — the shared CATEGORY BARS primitive: a share across named
 * categories.
 *
 * ── Why horizontal, and why not a donut or a column chart ───────────────────
 * The design system's agreed chart language for a proportion across named
 * categories is horizontal bars, and `AnalyticsScreen`'s "Where the work
 * landed" already says why in the negative: a ring makes two similar slices
 * impossible to rank without reading the numbers off the legend anyway. The
 * positive reason is the phone. A vertical column chart of eight categories has
 * nowhere to put "Groceries and household" at 320px; a horizontal one gives
 * every label a full line and never scrolls sideways.
 *
 * ── Why it is here and not in the Reports module ────────────────────────────
 * A share across named categories is a GENERIC shape. Reports is the first
 * surface that needs one as a component rather than as a hand-rolled panel, and
 * a primitive built privately inside the first module that wanted it is exactly
 * the debt AGENTS.md §9.8 describes. Analytics' own split panel is not migrated
 * here in this release — that is a change to a shipped surface for no
 * behavioural gain — and this component is written so it could be.
 *
 * ── Why it is hand-rolled ──────────────────────────────────────────────────
 * The same reason `TrendBars` and `ComparisonBars` are: a bar chart of a dozen
 * rows is a `map` over rectangles. A charting library would ship a runtime
 * dependency, a second colour system and a second accessibility contract to
 * keep correct, in exchange for code we would still have to configure.
 *
 * ── The chart is never the only way to read it ──────────────────────────────
 * Every row prints its own label and its own formatted value as ORDINARY TEXT,
 * beside a bar that is `aria-hidden`. Nothing is encoded by colour, nothing is
 * behind a hover, and the whole thing is readable with the SVG removed. That is
 * why the list is a `<ul>` rather than one `role="img"` figure: the numbers are
 * the content, and the bars are the illustration.
 *
 * Deliberately not interactive: every value is already on the page, so a
 * tooltip would add a tab stop for a second copy of what is written.
 */

import type { CSSProperties } from "react";

/** One named category. */
export interface CategoryBarsRow {
  readonly key: string;
  /** The owner's words. Wraps rather than truncating — a name is the subject. */
  readonly label: string;
  /**
   * The magnitude the bar draws. `null` is NO READING and draws no bar at all,
   * which is different from a zero.
   */
  readonly value: number | null;
  /** The value as the owner reads it — "$1,204.50", "12 Tasks". */
  readonly formatted: string;
  /** A subordinate fact, printed after the value ("42 transactions"). */
  readonly detail?: string;
  /** Where this row's records live, so a doubted figure can be checked. */
  readonly href?: string;
  /**
   * True for a REMAINDER row. It is drawn without a bar and in the quieter
   * tone, because "18 other categories" is a fact about the bound rather than a
   * category the owner can open.
   */
  readonly remainder?: boolean;
}

export interface CategoryBarsProps {
  readonly rows: readonly CategoryBarsRow[];
  /** Names what the bars measure, for assistive technology. */
  readonly label: string;
  readonly "data-testid"?: string;
}

/** A zero still draws a visible sliver, so it reads as "nothing here". */
const MIN_FRACTION = 0.015;

export function CategoryBars({
  rows,
  label,
  "data-testid": testId,
}: CategoryBarsProps) {
  if (rows.length === 0) return null;

  /*
   * One shared scale across every row, taken from the largest MAGNITUDE. A
   * negative value (a category whose refunds exceeded its spending) is drawn at
   * its magnitude and printed with its sign, so the bar length and the number
   * never disagree about which is bigger.
   */
  const peak = rows.reduce(
    (largest, row) => Math.max(largest, Math.abs(row.value ?? 0)),
    0,
  );

  return (
    <ul className="dh-catbars" aria-label={label} data-testid={testId}>
      {rows.map((row) => {
        const fraction =
          row.value === null || peak <= 0
            ? 0
            : Math.max(MIN_FRACTION, Math.abs(row.value) / peak);
        return (
          <li
            key={row.key}
            className="dh-catbars__row"
            data-remainder={row.remainder ? "true" : undefined}
          >
            <span className="dh-catbars__name">
              {row.href ? (
                <a className="dh-catbars__link" href={row.href}>
                  {row.label}
                </a>
              ) : (
                row.label
              )}
            </span>
            {/* The bar illustrates the number beside it and carries no
             * information of its own, so it is hidden from assistive
             * technology rather than given a duplicate label to read out. */}
            <span
              className="dh-catbars__track"
              aria-hidden="true"
              data-negative={
                row.value !== null && row.value < 0 ? "true" : undefined
              }
            >
              <span
                className="dh-catbars__fill"
                style={
                  {
                    ["--app-catbars-fill" as string]: `${fraction * 100}%`,
                  } as CSSProperties
                }
              />
            </span>
            <span className="dh-catbars__figure">
              <span className="dh-catbars__value">{row.formatted}</span>
              {row.detail ? (
                <span className="dh-catbars__detail">{row.detail}</span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
