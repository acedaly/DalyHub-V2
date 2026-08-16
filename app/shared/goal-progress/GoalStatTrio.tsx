/**
 * REDESIGN-04 — the Goal's stat TRIO: Current / Target / Target date.
 *
 * `mockup3.png` replaces the record's four-figure metric row with three equal
 * figures under quiet labels. The change it makes is one of RANK, not of
 * content: REDESIGN-03 had already brought the lead value down from Material's
 * 36px `display-small` to the 24px `--dh-text-metric` role so that "83 kg"
 * stopped being a banner with captions beneath it. The reference finishes that
 * job — three figures at one size, none of them the headline, because the
 * question a measurable Goal answers is a comparison and a comparison needs its
 * terms drawn the same.
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
  "data-testid": testId,
}: {
  readonly stats: readonly GoalStat[];
  /** The group's accessible name — "Reach 70 kg progress". */
  readonly label: string;
  readonly "data-testid"?: string;
}) {
  return (
    <dl className="dh-goal-trio" aria-label={label} data-testid={testId}>
      {stats.map((stat) => (
        <div className="dh-goal-trio__stat" key={stat.key}>
          {/*
           * The label leads in the DOM and follows visually. A definition list
           * is the honest structure for label/figure pairs, and putting the
           * `<dt>` first is what makes it one — the visual order is a CSS
           * concern, and the reading order stays "Current, 60.0 kg".
           */}
          <dt className="dh-goal-trio__label">{stat.label}</dt>
          <dd className="dh-goal-trio__value">
            {stat.value ?? (
              <>
                <span aria-hidden="true">—</span>
                <span className="dh-visually-hidden">
                  {stat.absentLabel ?? "Not recorded"}
                </span>
              </>
            )}
            {stat.note ? (
              <span className="dh-goal-trio__note">{stat.note}</span>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
