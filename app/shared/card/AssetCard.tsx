/**
 * UIX-05 — the ASSET gallery card.
 *
 * The fifth record surface, beside `.dh-pcard` (a Project), `.dh-mrow` (a Goal),
 * `.dh-erow` (an Area) and `.dh-prow` (a Person). It exists because an Asset asks
 * a question none of those ask:
 *
 *     A Project asks   "how is this going?"        → a proportion
 *     A Goal asks      "am I getting there?"       → a reading and its shape
 *     An Area asks     "what is happening here?"   → its relationships
 *     A Person asks    "when did we last speak?"   → a rhythm
 *     An Asset asks    "what does this need, and WHEN?"
 *
 * So an Asset card's measure is TIME, and its composition says so before a word
 * is read: the thing at the top, and the next commitment pinned to the floor.
 *
 *     ┌────────────────────────────────────────┐
 *     │ [🚗]  Hilux                        ⋯   │
 *     │       Vehicle · Toyota HiLux SR5       │
 *     │                                        │
 *     │ ● Service overdue                      │  ← ONE commitment, named
 *     │   Due 3 August 2026                    │  ← when, absolutely
 *     │ ──────────────────────────────────────  │
 *     │ Active · Garage                        │  ← state and place, quiet
 *     └────────────────────────────────────────┘
 *
 * Four rules make it an Asset card rather than a card with Asset data in it:
 *
 * 1. **The commitment is the measure, and there is exactly one.** An Asset can
 *    carry a warranty, a renewal, a service date and a list of obligations; the
 *    card shows the most urgent of them and nothing else. A maintenance history
 *    belongs on the record (§12), and a card with four dates on it has none.
 * 2. **Colour is spent on STATE, not identity.** Every other record family in
 *    the product paints its identity mark with the owner's own classification —
 *    a Project's Area, a Person's circle. An Asset's identity is its TYPE, and
 *    thirteen types over a six-colour ramp is a collision two times in three,
 *    which is a colour that means nothing. The type glyph is a far stronger
 *    signal than a tint (a car and a shield are told apart instantly), so the
 *    mark stays neutral and the card's colour budget goes to the one thing this
 *    screen exists to answer: what is overdue. This does not breach D21 — the
 *    identity mark is still never repainted by state; the two are separate
 *    objects on the card, and the state always carries its own words.
 * 3. **The foot is pinned.** Identity at the top, commitment at the bottom, and
 *    the space between absorbs a wrapped context line — so every card in a
 *    gallery row lands its due line on the same baseline, which is what makes a
 *    grid of dates comparable at a glance. Same rule as `.dh-pcard`.
 * 4. **An absence is drawn as an absence.** An Asset with nothing scheduled says
 *    "Nothing scheduled" once, in the space the date would have taken. It is not
 *    a warning, not a gap, and not an empty date field.
 *
 * Presentation only. It resolves no dates, no statuses and no obligations — the
 * caller hands it a rendered glyph and already-derived display data, which is
 * what lets the Assets gallery and an Area's Assets tab render the same card
 * without either module reaching into the other (AGENTS.md §9).
 */

import type { ReactNode } from "react";
import { Link } from "react-router";

/** The tone vocabulary the commitment dot understands. Meaning is in the words. */
export type AssetCardTone = "neutral" | "info" | "warning" | "danger";

export type AssetCardProps = {
  /** The Asset's type glyph — a rendered node. Decorative and neutral (rule 2). */
  readonly icon?: ReactNode;
  readonly title: string;
  readonly headingLevel?: 2 | 3 | 4;
  /** "Vehicle · Toyota HiLux SR5" — the type, then what it actually is. */
  readonly context?: string | null;
  /**
   * The ONE thing this Asset needs next. `text` is the commitment in the
   * evaluator's own words ("Service overdue"), `when` is the date in full, and
   * the tone only agrees with them.
   */
  readonly commitment?: {
    readonly text: string;
    readonly tone: AssetCardTone;
    readonly when?: string | null;
  };
  /**
   * What the card says when there is no commitment at all. Rendered in the same
   * place, at the quiet weight — an absence stated once rather than a blank.
   */
  readonly noCommitmentLabel?: string;
  /** The lifecycle state, always as a word — "Active", "Loaned", "Retired". */
  readonly status?: string | null;
  /** Where it is, when the owner recorded it. */
  readonly place?: string | null;
  readonly overflow?: ReactNode;
  readonly href: string;
  readonly openAriaLabel?: string;
  /** Archived treatment — quieter, and always stated in words by the caller. */
  readonly muted?: boolean;
  readonly "data-testid"?: string;
};

export function AssetCard({
  icon,
  title,
  headingLevel = 3,
  context,
  commitment,
  noCommitmentLabel = "Nothing scheduled",
  status,
  place,
  overflow,
  href,
  openAriaLabel,
  muted = false,
  "data-testid": testId,
}: AssetCardProps) {
  const Heading = `h${headingLevel}` as const;
  const foot = [status, place].filter(Boolean).join(" · ");

  return (
    // Named by the record, not by the link inside it — see `ProjectCard` for why.
    <article
      className={["dh-acard", muted ? "dh-acard--muted" : null]
        .filter(Boolean)
        .join(" ")}
      aria-label={title}
      data-testid={testId}
    >
      <div className="dh-acard__head">
        {icon ? (
          <span className="dh-acard__mark" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <div className="dh-acard__titles">
          <Heading className="dh-acard__title">
            <Link
              className="dh-acard__open"
              to={href}
              aria-label={openAriaLabel ?? title}
            >
              {title}
            </Link>
          </Heading>
          {context ? <p className="dh-acard__context">{context}</p> : null}
        </div>
      </div>

      {/* A corner affordance, not a column — taking it out of flow gives the
       * title the width it needs and moves nothing else. */}
      {overflow ? <div className="dh-acard__overflow">{overflow}</div> : null}

      <div className="dh-acard__foot">
        {commitment ? (
          <div
            className="dh-acard__due"
            data-tone={commitment.tone}
            data-testid="asset-card-due"
          >
            <p className="dh-acard__due-text">
              {/* Decorative — the commitment is the words beside it. */}
              <span className="dh-acard__dot" aria-hidden="true" />
              {commitment.text}
            </p>
            {commitment.when ? (
              <p className="dh-acard__due-when">{commitment.when}</p>
            ) : null}
          </div>
        ) : (
          <p className="dh-acard__due dh-acard__due--none" data-tone="neutral">
            {noCommitmentLabel}
          </p>
        )}

        {foot ? <p className="dh-acard__state">{foot}</p> : null}
      </div>
    </article>
  );
}
