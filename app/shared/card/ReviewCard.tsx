/**
 * UIX-05 — the REVIEW gallery card.
 *
 * The sixth record surface, and the one whose identity is not a name.
 *
 * Every other record in DalyHub is recognised by what it is CALLED — a Project,
 * a Goal, an Area, a Person, an Asset. A Review is recognised by WHEN it is:
 * "27 July – 2 August" is the thing an owner scans a Reviews list for, and the
 * title ("Weekly review") is derived from that period in most workspaces, so
 * leading with it printed the same three words down the whole gallery. Until
 * this pass the card did exactly that: an entity glyph, the title, the period as
 * a grey subtitle, a filled status pill, and three metadata facts — updated,
 * completed and "3 of 6 sections authored" — at one weight.
 *
 *     ┌────────────────────────────────────────┐
 *     │ WEEKLY                             ⋯   │  ← the cadence, as an eyebrow
 *     │ 27 Jul – 2 Aug 2026                    │  ← the IDENTITY
 *     │ Weekly review                          │  ← the name, demoted
 *     │                                        │
 *     │ ████████████░░░░░░░░  4 of 6 written   │  ← the measure: reflection
 *     │ In progress · updated 2 August         │  ← state, and when it moved
 *     └────────────────────────────────────────┘
 *
 * Three rules make it a Review card rather than a card with Review data in it:
 *
 * 1. **The period is the title.** It takes the card's largest type and its
 *    tabular figures, so a column of Reviews reads down as a calendar. The
 *    record's own title stays on the card — a Review the owner renamed
 *    ("Post-Ekka reset") must still be findable by that name — one rung quieter,
 *    and it is omitted entirely when it says nothing the period does not.
 * 2. **The measure is the REFLECTION, not the period.** A Review's progress is
 *    how much of it has been written, which the kernel already counts exactly
 *    (`authoredSections` of `totalSections`). It is drawn as the shared 8px
 *    entity bar — the same object a Project card uses, because it is the same
 *    kind of fact: a bounded proportion of work done. What it is NOT is a
 *    percentage: "4 of 6 written" is checkable and "67%" is not, on a scale with
 *    six points.
 * 3. **A completed Review draws no bar.** Once a Review is closed the question
 *    "how much is written?" has stopped being interesting, and a full bar on
 *    every past Review turns the gallery into a wall of identical green. It
 *    states when it was completed instead, which is the fact that matters
 *    afterwards. This is the same rule as "an absence is not a zero", pointed
 *    the other way: a settled fact is not a live measure.
 *
 * Presentation only — no dates are formatted here, no status derived and no
 * proportion computed. The caller hands it display data.
 */

import type { ReactNode } from "react";
import { Link } from "react-router";

/** The tone vocabulary the state line understands. Meaning is in the words. */
export type ReviewCardTone = "neutral" | "info" | "success" | "warning";

export type ReviewCardProps = {
  /** The cadence — "Weekly", "Quarterly". Rendered as the card's eyebrow. */
  readonly cadence: string;
  /** The period, already formatted — "27 Jul – 2 Aug 2026", "Q3 2026". */
  readonly period: string;
  readonly headingLevel?: 2 | 3 | 4;
  /**
   * The record's own title, or `null` when it says nothing the period does not.
   * The caller decides; this component never compares strings.
   */
  readonly title?: string | null;
  /**
   * The reflection measure. Omitted for a completed Review — see rule 3.
   * `valueText` is the whole sentence for assistive tech.
   */
  readonly reflection?: {
    readonly authored: number;
    readonly total: number;
    readonly valueText: string;
  };
  /** The state line — "In progress · updated 2 August". Always words. */
  readonly state: {
    readonly text: string;
    readonly tone: ReviewCardTone;
  };
  /**
   * The one action a Review card offers, where there is one: continuing an
   * unfinished reflection. Rendered as a real control above the card's own link.
   */
  readonly action?: ReactNode;
  readonly overflow?: ReactNode;
  readonly href: string;
  /**
   * The accessible name of the whole-card link. Required in practice: the
   * visible heading is a date range, and "Open 27 Jul – 2 Aug 2026" alone does
   * not say what kind of thing opens.
   */
  readonly openAriaLabel: string;
  readonly muted?: boolean;
  readonly "data-testid"?: string;
};

export function ReviewCard({
  cadence,
  period,
  headingLevel = 3,
  title,
  reflection,
  state,
  action,
  overflow,
  href,
  openAriaLabel,
  muted = false,
  "data-testid": testId,
}: ReviewCardProps) {
  const Heading = `h${headingLevel}` as const;
  const percent =
    reflection && reflection.total > 0
      ? Math.round((reflection.authored / reflection.total) * 100)
      : 0;

  return (
    // Named by the period, not by the link inside it — see `ProjectCard`.
    <article
      className={["dh-rcard", muted ? "dh-rcard--muted" : null]
        .filter(Boolean)
        .join(" ")}
      aria-label={`${cadence} — ${period}`}
      data-testid={testId}
    >
      <div className="dh-rcard__head">
        <p className="dh-rcard__cadence">{cadence}</p>
        <Heading className="dh-rcard__period">
          <Link className="dh-rcard__open" to={href} aria-label={openAriaLabel}>
            {period}
          </Link>
        </Heading>
        {title ? <p className="dh-rcard__title">{title}</p> : null}
      </div>

      {/* A corner affordance, not a column. */}
      {overflow ? <div className="dh-rcard__overflow">{overflow}</div> : null}

      <div className="dh-rcard__foot">
        {reflection ? (
          <div className="dh-rcard__reflection">
            <span
              className="dh-rcard__track"
              role="progressbar"
              aria-valuenow={reflection.authored}
              aria-valuemin={0}
              aria-valuemax={reflection.total}
              aria-valuetext={reflection.valueText}
              aria-label={`${period} reflection`}
            >
              <span
                className="dh-rcard__fill"
                style={{ inlineSize: `${percent}%` }}
              />
            </span>
            <p className="dh-rcard__figures" data-testid="review-card-figures">
              {reflection.authored} of {reflection.total} written
            </p>
          </div>
        ) : null}

        <p className="dh-rcard__state" data-tone={state.tone}>
          <span className="dh-rcard__dot" aria-hidden="true" />
          {state.text}
        </p>

        {action ? <div className="dh-rcard__action">{action}</div> : null}
      </div>
    </article>
  );
}
