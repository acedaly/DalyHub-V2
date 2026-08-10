/**
 * UIX-05 — the PERSON row.
 *
 * The fourth member of the record-surface family, beside `.dh-pcard` (a Project),
 * `.dh-gcard` (a Goal) and `.dh-erow` (an Area). It exists for the same reason
 * those do: People had been rendering through the generic `Card`, so the surface
 * whose subject is a relationship answered the question a Project card asks.
 *
 * A Person is not a body of work. There is nothing to complete, no proportion to
 * draw and no deadline — what a Person HAS is a face, a place in the owner's
 * life, a way to reach them and a rhythm that is either being kept or is not. So
 * the row is composed as those four things, in that order, across the width:
 *
 *     ┌──────────────────────────────────────────────────────────────────────┐
 *     │ (SJ)  Sarah Johnson         sarah@…      ● Due for a catch-up     ⋯  │
 *     │       Family · Acme         0412 345…      Last spoke 6 weeks ago    │
 *     └──────────────────────────────────────────────────────────────────────┘
 *        ^identity              ^reach          ^rhythm
 *
 * Four rules make it a Person row rather than a row with Person data in it:
 *
 * 1. **The face leads.** A photo or generated initials, at the row's full height
 *    and fully round — the one circular mark in a product whose every other
 *    identity mark is a rounded square, because a person is the one record type
 *    that is not a container. It is what the eye finds a name by.
 * 2. **Reach is a real link, not a fact.** The preferred contact is a `mailto:`
 *    or `tel:`, so the most common thing an owner does from a People list — write
 *    to someone — is one click from the list rather than a record visit away. It
 *    sits above the row's own whole-row link, like every other real control in
 *    the family.
 * 3. **The rhythm is the trailing column.** DalyHub's People module derives a
 *    stay-in-touch state (PEOPLE-03) and, before this pass, spent it as one item
 *    in a run of six metadata facts at equal weight. It is the single most
 *    decision-relevant thing on the row — "who have I not spoken to?" is the
 *    question a People list is opened with — so it gets the position the eye
 *    lands on last and stays.
 * 4. **An absence is an absence.** No contact recorded draws nothing, not a dash.
 *    No relationship recorded says nothing, not "Other". No shared history says
 *    "Nothing recorded yet", which is an invitation rather than a deficiency.
 *
 * Presentation only. It resolves no relationships, no circles and no colours —
 * a caller hands it a rendered avatar and already-derived display data, which is
 * what lets the People collection and (later) a Meeting's attendee list render
 * the same row without either module reaching into the other.
 */

import type { ReactNode } from "react";
import { Children } from "react";
import { Link } from "react-router";

/** The tone vocabulary the rhythm dot understands. Meaning is in the words. */
export type PersonRowTone = "neutral" | "success" | "info" | "warning";

/** One reachable contact — already resolved to a real `href` by the caller. */
export type PersonRowReach = {
  /** What it is, for the accessible name — "Email", "Mobile". */
  readonly kind: string;
  /** What is shown — the address or number itself, never a re-labelled "Email". */
  readonly value: string;
  /** `mailto:` or `tel:`. The caller builds it; this component never guesses. */
  readonly href: string;
};

export type PersonRowProps = {
  /** The rendered avatar — a photo or generated initials. Decorative. */
  readonly avatar: ReactNode;
  readonly title: string;
  readonly headingLevel?: 2 | 3 | 4;
  /**
   * The one identity line under the name — "Family · Acme", "Colleague". Never
   * a run of every fact the record holds; the record is where those live.
   */
  readonly context?: string | null;
  /** The preferred way to reach this person, or nothing at all. */
  readonly reach?: PersonRowReach | null;
  /** A second reachable contact, shown only where the row has the width. */
  readonly secondaryReach?: PersonRowReach | null;
  /**
   * The derived stay-in-touch state. `text` is the state, `detail` is the last
   * shared moment, and both are always words — the dot only agrees with them.
   */
  readonly rhythm?: {
    readonly text: string;
    readonly tone: PersonRowTone;
    readonly detail?: string | null;
  };
  readonly overflow?: ReactNode;
  readonly href: string;
  readonly openAriaLabel?: string;
  /** Archived treatment — quieter, and always stated in words by the caller. */
  readonly muted?: boolean;
  readonly "data-testid"?: string;
};

export function PersonRow({
  avatar,
  title,
  headingLevel = 3,
  context,
  reach,
  secondaryReach,
  rhythm,
  overflow,
  href,
  openAriaLabel,
  muted = false,
  "data-testid": testId,
}: PersonRowProps) {
  const Heading = `h${headingLevel}` as const;

  return (
    // Named by the record rather than by the link inside it: the heading's only
    // child is the whole-row link, whose accessible name is "Open Sarah
    // Johnson", so labelling by it would announce the row as "Open Sarah
    // Johnson, Sarah Johnson".
    <article
      className={["dh-prow", muted ? "dh-prow--muted" : null]
        .filter(Boolean)
        .join(" ")}
      aria-label={title}
      data-testid={testId}
    >
      <span className="dh-prow__face" aria-hidden="true">
        {avatar}
      </span>

      <div className="dh-prow__identity">
        <Heading className="dh-prow__name">
          {/*
           * A real router `Link` covering the row through its ::after. A bare
           * anchor would make every row a full document load, throwing away the
           * scroll position and the accumulated "Load more" pages; the href is
           * genuinely present, so ⌘-click and "copy link address" behave.
           */}
          <Link
            className="dh-prow__open"
            to={href}
            aria-label={openAriaLabel ?? title}
          >
            {title}
          </Link>
        </Heading>
        {context ? <p className="dh-prow__context">{context}</p> : null}
      </div>

      {reach || secondaryReach ? (
        <div className="dh-prow__reach">
          {reach ? <ReachLink reach={reach} name={title} /> : null}
          {secondaryReach ? (
            <ReachLink reach={secondaryReach} name={title} secondary />
          ) : null}
        </div>
      ) : null}

      {rhythm ? (
        <p
          className="dh-prow__rhythm"
          data-tone={rhythm.tone}
          // Named so a test can aim at the REGION without reaching for a
          // styling class.
          data-testid="person-row-rhythm"
        >
          {/* Decorative — the state is the text beside it. */}
          <span className="dh-prow__dot" aria-hidden="true" />
          <span className="dh-prow__rhythm-state">{rhythm.text}</span>
          {rhythm.detail ? (
            <span className="dh-prow__rhythm-detail">{rhythm.detail}</span>
          ) : null}
        </p>
      ) : null}

      {overflow ? <div className="dh-prow__overflow">{overflow}</div> : null}
    </article>
  );
}

/**
 * One reachable contact.
 *
 * The accessible name carries WHO and HOW ("Email Sarah Johnson"), because
 * "sarah@example.com" read out of context in a list of twenty rows says nothing
 * about which row it belongs to. The visible text stays the address itself,
 * which is what an owner scans for.
 */
function ReachLink({
  reach,
  name,
  secondary = false,
}: {
  readonly reach: PersonRowReach;
  readonly name: string;
  readonly secondary?: boolean;
}) {
  return (
    <a
      className={[
        "dh-prow__reach-link",
        secondary ? "dh-prow__reach-link--secondary" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      href={reach.href}
      aria-label={`${reach.kind} ${name} — ${reach.value}`}
    >
      {reach.value}
    </a>
  );
}

/**
 * The single surface the rows sit in.
 *
 * A labelled `<ul>`/`<li>`, so a screen reader announces "People, list, 24
 * items" before any of them is read — the same contract `EntityRowList` and
 * `EntityCardGrid` have. The hairlines are drawn by the LIST rather than by each
 * row, so the first and last edges are the surface's own and no row has to know
 * where it sits.
 */
export function PersonRowList({
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
      className={["dh-prow-list", className].filter(Boolean).join(" ")}
      aria-label={label}
      data-testid={testId}
    >
      {Children.map(children, (child) =>
        child === null || child === undefined || child === false ? null : (
          <li className="dh-prow-list__item">{child}</li>
        ),
      )}
    </ul>
  );
}
