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

import {
  identityAttribute,
  resolveIdentity,
} from "~/shared/entity/identity-resolution";

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
  /**
   * IDENTITY-01 — the record's OWN chosen colour slot, when it has one.
   *
   * A chosen slot beats the derived rank, and the two are folded together by the
   * one resolver rather than by this component. Passing neither is the NEUTRAL
   * identity, which is a designed outcome for a record that genuinely has none.
   */
  readonly colourSlot?: string | null;
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
  colourSlot = null,
  overflow,
  href,
  openAriaLabel,
  muted = false,
  "data-testid": testId,
}: EntityRowProps) {
  const Heading = `h${headingLevel}` as const;

  // The ONE resolver. This component never maps a rank to a colour itself — a
  // card and the tile inside it agreeing depends on there being one mapping.
  const identity = resolveIdentity({ colourSlot, colourRank: accent ?? null });

  return (
    <article
      /*
       * UNTITLED-04 — the row is drawn with Untitled tokens and utilities; the
       * list around it supplies the bounded surface and the hairlines. A phone
       * gets the same row with the trailing figure under the facts rather than
       * competing with the name for the width (`grid-areas` below, in the DOM
       * order, so the reading order is the visual one).
       */
      className={[
        "dh-erow relative grid min-w-0 items-center gap-x-3 px-5 py-3",
        "[grid-template-areas:'mark_body_figure_overflow'] grid-cols-[auto_minmax(0,1fr)_auto_auto]",
        "max-md:px-4 max-md:[grid-template-areas:'mark_body_overflow'_'mark_figure_overflow'] max-md:grid-cols-[auto_minmax(0,1fr)_auto]",
        muted ? "dh-erow--muted opacity-70" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={title}
      {...identityAttribute(identity.slot)}
      /*
       * DHDS-13 — the row takes the shared reveal contract (`motion.css`).
       *
       * `TaskRow`, `RecordRow` and the Projects table all hold their trailing
       * `⋯` back until the row is pointed at or focused within; the Areas list
       * — this component's only consumer — drew one on every row at rest, which
       * is the "permanent action buttons" the direction lists among the things
       * to avoid and a visible inconsistency between two lists in the same
       * product. Only declared when there IS an overflow, so a row without one
       * does not advertise a context it has nothing to reveal in.
       */
      data-dh-action-context={overflow ? "true" : undefined}
      data-testid={testId}
    >
      {icon ? (
        <span
          className="dh-erow__mark shrink-0 [grid-area:mark]"
          aria-hidden="true"
        >
          {icon}
        </span>
      ) : null}

      <div className="dh-erow__body flex min-w-0 flex-col gap-0.5 [grid-area:body]">
        <Heading className="dh-erow__title text-sm font-semibold text-primary">
          <Link
            className="dh-erow__open truncate rounded-sm text-primary outline-focus-ring after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2"
            to={href}
            aria-label={openAriaLabel ?? title}
          >
            {title}
          </Link>
        </Heading>
        {facts ? (
          <p className="dh-erow__facts m-0 truncate text-sm text-tertiary">
            {facts}
          </p>
        ) : null}
      </div>

      {figure ? (
        <p className="dh-erow__figure m-0 shrink-0 text-sm whitespace-nowrap text-tertiary tabular-nums [grid-area:figure] max-md:text-xs">
          {figure}
        </p>
      ) : null}

      {overflow ? (
        <div className="dh-erow__overflow dh-action-reveal relative z-10 shrink-0 [grid-area:overflow]">
          {overflow}
        </div>
      ) : null}
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
      /*
       * UNTITLED-04 — the list is the bounded surface, in the same Untitled card
       * grammar the collection tables use, and it draws the hairlines so no row
       * has to know where it sits.
       */
      className={[
        "dh-erow-list m-0 list-none overflow-hidden rounded-xl bg-primary p-0 shadow-xs ring-1 ring-secondary",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={label}
      data-testid={testId}
    >
      {Children.map(children, (child) =>
        child === null || child === undefined || child === false ? null : (
          <li className="dh-erow-list__item border-b border-secondary last:border-b-0 hover:bg-secondary">
            {child}
          </li>
        ),
      )}
    </ul>
  );
}
