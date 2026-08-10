/**
 * UIX-02 — the spacious identity ROW, and the single surface it sits in.
 *
 * This is what an Area is drawn as, and the reason it is a row rather than a
 * card is the reference design, which puts Projects in a gallery and Areas in
 * one bordered list — and, independently, the data. An Area has no description
 * field, no completion, no due date and no progress; what it HAS is a name, a
 * mark and a handful of relationships. Four facts in a 260px card leaves most of
 * the card empty, and nine of those is a page of whitespace with words in the
 * corners. The design system's own rule for this is explicit: use a gallery only
 * where each record has enough to fill one.
 *
 *     ┌────────────────────────────────────────────────────────────┐
 *     │ [mark]  Health & Fitness                                   │
 *     │         1 Project · 1 Goal                    3 open tasks │
 *     ├────────────────────────────────────────────────────────────┤
 *     │ [mark]  Learning & Development                             │
 *     │         2 Projects                            4 open tasks │
 *     └────────────────────────────────────────────────────────────┘
 *
 * The row is deliberately CALMER than a Project card, and the difference is
 * structural rather than chromatic — which is what §41's "distinguishable with
 * the labels hidden" actually requires:
 *
 *   - no progress bar and no percentage anywhere, because an Area never
 *     completes (AGENTS.md §4) and a proportion would be a fabricated one;
 *   - the relationships lead, and they are counts of living things rather than
 *     a measure of how far through something is;
 *   - one row per Area, at a fixed height, in one surface with hairlines
 *     between — so the eye reads a stable column of marks down the left edge.
 *
 * Presentation only. It resolves no icons, no colours and no counts; a caller
 * hands it a rendered mark and derived facts.
 */

import type { ReactNode } from "react";
import { Children } from "react";
import { Link } from "react-router";

import { areaAccentForRank } from "~/shared/pill";

export type EntityRowProps = {
  /** The record's identity mark — a rendered node. Decorative. */
  readonly icon?: ReactNode;
  readonly title: string;
  readonly headingLevel?: 2 | 3 | 4;
  /**
   * The relationship facts, already worded — "2 Projects · 3 Goals". One line;
   * it ellipsises rather than wrapping, so every row keeps the same height.
   */
  readonly facts?: string | null;
  /**
   * The one trailing figure — "12 open tasks". Never a proportion.
   *
   * There is deliberately no STATE column beside it. The reference draws one
   * ("On track ●"), and DalyHub does have an authoritative Area evaluator
   * (`evaluateAreaMomentum`) — but it needs per-Project health facts for every
   * Project in the Area, which is a read this bounded list does not do and
   * should not start doing per row. The alternative was a status vocabulary
   * invented for the picture, and an Area health score is the one thing the
   * brief is most explicit about not fabricating. The Area record shows its
   * real momentum; the list shows what is in it.
   */
  readonly figure?: string | null;
  /** The record's stable identity rank, for the mark's own accent rail. */
  readonly accent?: number | null;
  readonly overflow?: ReactNode;
  readonly href: string;
  readonly openAriaLabel?: string;
  readonly muted?: boolean;
  readonly "data-testid"?: string;
};

export function EntityRow({
  icon,
  title,
  headingLevel = 3,
  facts,
  figure,
  accent,
  overflow,
  href,
  openAriaLabel,
  muted = false,
  "data-testid": testId,
}: EntityRowProps) {
  const Heading = `h${headingLevel}` as const;

  return (
    <article
      className={["dh-erow", muted ? "dh-erow--muted" : null]
        .filter(Boolean)
        .join(" ")}
      aria-label={title}
      data-accent={
        accent === undefined || accent === null
          ? undefined
          : String(areaAccentForRank(accent))
      }
      data-testid={testId}
    >
      {icon ? (
        <span className="dh-erow__mark" aria-hidden="true">
          {icon}
        </span>
      ) : null}

      <div className="dh-erow__body">
        <Heading className="dh-erow__title">
          <Link
            className="dh-erow__open"
            to={href}
            aria-label={openAriaLabel ?? title}
          >
            {title}
          </Link>
        </Heading>
        {facts ? <p className="dh-erow__facts">{facts}</p> : null}
      </div>

      {figure ? <p className="dh-erow__figure">{figure}</p> : null}

      {overflow ? <div className="dh-erow__overflow">{overflow}</div> : null}
    </article>
  );
}

/**
 * The single surface the rows sit in.
 *
 * A labelled `<ul>`/`<li>`, so a screen reader announces "Areas, list, 6 items"
 * before any of them is read — the same contract `EntityCardGrid` has. The
 * hairlines are drawn by the list rather than by each row, so the first and last
 * edges are the surface's own and no row has to know where it sits.
 */
export function EntityRowList({
  children,
  label,
  className,
  "data-testid": testId,
}: {
  readonly children: ReactNode;
  readonly label?: string;
  readonly className?: string;
  readonly "data-testid"?: string;
}) {
  return (
    <ul
      className={["dh-erow-list", className].filter(Boolean).join(" ")}
      aria-label={label}
      data-testid={testId}
    >
      {Children.map(children, (child) =>
        child === null || child === undefined || child === false ? null : (
          <li className="dh-erow-list__item">{child}</li>
        ),
      )}
    </ul>
  );
}
