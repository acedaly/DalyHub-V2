/**
 * The Goal's stat TRIO: Current / Target / Target date.
 *
 * Three equal figures under quiet labels. The change it makes is one of RANK,
 * not of content: the lead value came down from Material's 36px `display-small`
 * to a 24px metric role so that "83 kg" stopped being a banner with captions
 * beneath it, and this finishes that job — three figures at one size, none of
 * them the headline, because the question a measurable Goal answers is a
 * comparison and a comparison needs its terms drawn the same.
 *
 * ── What happened to "Start" and "Remaining" ────────────────────────────────
 * Nothing was deleted. The quartet was Start / Now / Target / Remaining:
 *
 *   - **Start** is on the chart, as the baseline reference rule, labelled where
 *     it is drawn. It is context for the line rather than a figure to compare
 *     against, which is exactly what a reference line is for.
 *   - **Remaining** is arithmetic over two figures that are both still on
 *     screen, and it stays in words on the status line beneath ("1.9 km to
 *     go"), where it reads as progress rather than as a fourth measurement.
 *
 * ── Absence is never zero ───────────────────────────────────────────────────
 * A Goal with no target date shows the label and an em dash with a real word
 * behind it for assistive tech — not "0", and not a missing column that would
 * silently re-rank the two figures beside it. A Goal with no reading yet shows
 * the same for Current. The surface above states WHY once; the trio never
 * fabricates a figure to keep its shape.
 *
 * ── UNTITLED-07 — the metric BAND, and where its grammar comes from ─────────
 *
 * The figures used to be three bare `<div>`s painted from `goals.css` and
 * floating on the record with nothing around them, which is why the Goal record
 * read as a data dump rather than as an outcome workspace: the page's most
 * important comparison had less visual structure than the list of readings
 * below it.
 *
 * The figures are now a DIVIDED BAND in Untitled's grammar — equal columns
 * separated by `divide-x divide-secondary`, the same rule `application/table`
 * draws between its cells. That composition is Untitled's own metric row:
 * Application UI `dashboards-02/02` draws three figures in a divided band above
 * its table, and `dashboards-01/16` draws the same shape as the three "savings
 * goal" tiles this feature is closest to. What is DalyHub's is which three
 * figures, and the rule that an absent one is stated rather than dropped.
 *
 * The BOUNDARY is the caller's, not this component's: the Goal record draws the
 * whole measurement workspace as one Untitled card and this is its first band,
 * while the `/goals` pane is already inside a card and a second ring around the
 * figures would be a frame inside a frame.
 *
 * The columns stack on a phone and the dividers become horizontal, so a 320px
 * screen reads three labelled figures down instead of three crushed columns
 * across. A definition list is still the honest structure for label/figure
 * pairs, and the `<dt>` still leads in the DOM so the reading order stays
 * "Current, 83 kg" while the visual order puts the figure first.
 */

import type { ReactNode } from "react";

export type GoalStat = {
  readonly key: string;
  readonly label: string;
  /** The figure, already formatted by the caller's own evaluator output. */
  readonly value: string | null;
  /** What an absent figure means, for assistive tech — "No target date set". */
  readonly absentLabel?: string;
  /** An optional quiet line beneath the figure — "2 months away". */
  readonly note?: ReactNode;
};

export function GoalStatTrio({
  stats,
  label,
  className,
  "data-testid": testId,
}: {
  readonly stats: readonly GoalStat[];
  /** The group's accessible name — "Reach 70 kg progress". */
  readonly label: string;
  readonly className?: string;
  readonly "data-testid"?: string;
}) {
  return (
    <dl
      className={[
        "dh-goal-trio",
        "grid min-w-0 grid-cols-1 divide-y divide-secondary",
        "sm:auto-cols-fr sm:grid-flow-col sm:grid-cols-none sm:divide-x sm:divide-y-0",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={label}
      data-testid={testId}
    >
      {stats.map((stat) => (
        <div
          className="dh-goal-trio__stat flex min-w-0 flex-col-reverse gap-1 px-4 py-3 md:px-5 md:py-4"
          key={stat.key}
        >
          {/*
           * The label leads in the DOM and follows visually. A definition list
           * is the honest structure for label/figure pairs, and putting the
           * `<dt>` first is what makes it one — `flex-col-reverse` is the visual
           * concern, and the reading order stays "Current, 83 kg".
           */}
          <dt className="dh-goal-trio__label text-sm text-tertiary">
            {stat.label}
          </dt>
          <dd className="dh-goal-trio__value m-0 flex min-w-0 flex-col gap-0.5 text-display-xs font-semibold text-primary tabular-nums">
            {stat.value ?? (
              <>
                <span aria-hidden="true">—</span>
                <span className="dh-visually-hidden">
                  {stat.absentLabel ?? "Not recorded"}
                </span>
              </>
            )}
            {stat.note ? (
              <span className="dh-goal-trio__note text-sm font-normal text-tertiary">
                {stat.note}
              </span>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
