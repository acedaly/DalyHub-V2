/**
 * M3X — the EXPRESSIVE SUMMARY: a page's one dominant surface.
 *
 * The Material 3 Expressive pass has exactly one structural addition to the card
 * family, and this is it. The audit found DalyHub's most-visited screens opening
 * with a greeting and a column of identical boxes: nothing on the page was
 * bigger, tonally different or shaped differently from anything else, so a
 * glance had nowhere to land and the question the page exists to answer — *how
 * is today going?*, *how is this goal going?* — was answered in 12px grey text or
 * not at all (`docs/design/M3_EXPRESSIVE_AUDIT_2026_08.md` §2).
 *
 * Anatomy:
 *
 *     ┌────────────────────────────────────────────────────────────┐
 *     │  ╭───╮   Eyebrow                Stat      Stat             │
 *     │  │72%│   Headline               value     value            │
 *     │  ╰───╯   supporting             label     label            │
 *     │                                                            │
 *     │  [ action ]                        note / momentum         │
 *     └────────────────────────────────────────────────────────────┘
 *
 * ── The rules, all load-bearing ──────────────────────────────────────────────
 *
 *   - **One per page.** A page with two tinted, ringed, elevated heroes has
 *     emphasised nothing. This is the whole reason the tint is a token used in
 *     one place rather than a variant every card can opt into.
 *
 *     M3X-02 did NOT relax this. What it added is hierarchy Level 2
 *     (`SupportingSurface`) beneath it — a smaller, quieter, less shaped surface
 *     with no ring and no stat row — so a page can have a second and a third
 *     level without having a second hero. See DESIGN_SYSTEM.md → the hierarchy
 *     model.
 *   - **It states facts, it does not decorate them.** Every figure passed in is
 *     a real number the page already had. The component invents nothing, and it
 *     renders no stat whose value is absent — a hero of dashes is worse than a
 *     shorter hero (the same "zeros never paint" rule Today already holds).
 *   - **The ring is optional and never a guilt meter.** A caller passes `ring`
 *     only when a proportion genuinely exists; DalyHub's Today deliberately
 *     omits it until something is done.
 *   - **Colour is never the only signal.** The ring carries an accessible label,
 *     each stat states its own words, and the surface's meaning survives being
 *     read aloud in DOM order.
 *   - **It is a `section` with a real heading**, so the page outline is intact
 *     and the surface is reachable by landmark and by heading.
 *
 * It does not choose its own width, its own place in a grid, or what it means.
 */

import type { ReactNode } from "react";

import { ProgressRing } from "~/shared/charts";

/** One figure on the hero. Rendered only when `value` is present. */
export interface SummaryStat {
  readonly id: string;
  /** The figure itself — already formatted, already the owner's units. */
  readonly value: ReactNode;
  /** What the figure counts. Always words, never an icon alone. */
  readonly label: ReactNode;
  /**
   * `attention` paints the figure in the state-overdue role, which is the ONE
   * place the hero spends colour on a number. Everything else is `default`.
   */
  readonly tone?: "default" | "attention";
  /** Turns the whole stat into a link to the view that holds it. */
  readonly href?: string;
}

/** The optional progress ring at the leading edge. */
export interface SummaryRing {
  /** 0–1. Clamped by `ProgressRing`. */
  readonly value: number;
  /** The accessible sentence. Required — the ring is information, not decor. */
  readonly label: string;
  /** The short string drawn inside the ring. Decorative; repeats `label`. */
  readonly centre: ReactNode;
}

export type ExpressiveSummaryProps = {
  /** A quiet label above the headline — a date, a period, a scope. */
  readonly eyebrow?: ReactNode;
  /** The headline, and the surface's accessible name. */
  readonly headline: string;
  /** Heading level, so the page outline stays valid. Defaults to 2. */
  readonly headingLevel?: 1 | 2 | 3;
  /** One supporting line under the headline. */
  readonly supporting?: ReactNode;
  readonly ring?: SummaryRing;
  /** Up to three figures. More than three is a dashboard, not a summary. */
  readonly stats?: readonly SummaryStat[];
  /** The surface's one primary action. */
  readonly action?: ReactNode;
  /** A closing remark — momentum, a next step, a state of play. */
  readonly note?: ReactNode;
  readonly className?: string;
  readonly "data-testid"?: string;
};

/** How many figures the surface will draw. Beyond this it is a dashboard. */
export const MAX_SUMMARY_STATS = 3;

export function ExpressiveSummary({
  eyebrow,
  headline,
  headingLevel = 2,
  supporting,
  ring,
  stats = [],
  action,
  note,
  className,
  "data-testid": testId,
}: ExpressiveSummaryProps) {
  const Heading = `h${headingLevel}` as const;
  const shown = stats
    .filter((stat) => stat.value !== null && stat.value !== undefined)
    .slice(0, MAX_SUMMARY_STATS);

  const classes = ["dh-dcard", "dh-dcard--expressive", "dh-summary", className]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={classes} data-testid={testId}>
      <div className="dh-summary__lead">
        {ring ? (
          <div className="dh-summary__ring">
            <ProgressRing
              value={ring.value}
              label={ring.label}
              size={88}
              thickness={8}
              color="var(--md-sys-color-primary)"
            >
              <span className="dh-summary__ring-value">{ring.centre}</span>
            </ProgressRing>
          </div>
        ) : null}

        <div className="dh-summary__identity">
          {eyebrow ? <p className="dh-summary__eyebrow">{eyebrow}</p> : null}
          <Heading className="dh-summary__headline">{headline}</Heading>
          {supporting ? (
            <p className="dh-summary__supporting">{supporting}</p>
          ) : null}
        </div>

        {shown.length > 0 ? (
          <ul className="dh-summary__stats">
            {shown.map((stat) => {
              const body = (
                <>
                  <span
                    className="dh-summary__stat-value"
                    data-tone={stat.tone ?? "default"}
                  >
                    {stat.value}
                  </span>
                  <span className="dh-summary__stat-label">{stat.label}</span>
                </>
              );
              return (
                <li className="dh-summary__stat" key={stat.id}>
                  {stat.href ? (
                    // An ordinary anchor: the hero's figures are navigations to
                    // the canonical view that holds them, so they are
                    // right-clickable and keyboard-operable like any link.
                    <a className="dh-summary__stat-link" href={stat.href}>
                      {body}
                    </a>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      {action || note ? (
        <div className="dh-summary__foot">
          {action ? <div className="dh-summary__action">{action}</div> : null}
          {note ? <p className="dh-summary__note">{note}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
