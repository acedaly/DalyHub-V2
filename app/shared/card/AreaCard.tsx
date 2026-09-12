/**
 * The AREA card — a standing domain of responsibility.
 *
 * ── Why an Area needs its own card ──────────────────────────────────────────
 *
 * Until this pass an Area was drawn by the generic `EntityCard` (gallery) or
 * the generic `EntityRow` (list), while a Project had `ProjectCard`. UIX-02's
 * own note says why that mattered: with the labels hidden, nothing told the two
 * most DIFFERENT records in the spine apart. UIX-02 answered it by giving the
 * Project a card and leaving the Area on the generic one — so the distinction
 * was "Projects have a card of their own", not "an Area looks like an Area".
 *
 * A Project card is bottom-heavy around a measure that runs to 100%. An Area
 * has no measure and never will (AGENTS.md §4), so its card is built around the
 * only two things an Area genuinely is:
 *
 *     ┌──────────────────────────────────────────┐
 *     │ [mark]                                ⋯  │
 *     │ Health & Fitness                         │
 *     │ Ongoing since Mar 2024                   │  ← PERMANENCE, not progress
 *     ├──────────────────────────────────────────┤
 *     │  2         1          7                  │  ← what is LIVING here
 *     │  Projects  Goal       open tasks         │
 *     └──────────────────────────────────────────┘
 *
 * 1. **Permanence leads where a Project's measure would.** "Ongoing since Mar
 *    2024" is the one fact a Project card can never carry, and the one an Area
 *    always can: a Project card says how far through it is, an Area card says
 *    how long it has been tended. It is `created_at` and nothing derived.
 * 2. **The foot is a fact STRIP, not a meta sentence.** Three figures with
 *    their nouns beneath them, on a shared baseline in a bordered band, so a
 *    gallery is scannable DOWN each column. That is the "compact group of facts
 *    (glyph, number, noun)" DS-16 asked for and the run-on
 *    "Goals: 2 · Projects: 4 · Tasks: 11" label ladder AREA-01 removed.
 * 3. **No bar, no percentage, no invented health.** Unchanged from every
 *    previous Area presentation, and the reason the foot is a strip rather than
 *    a meter: an Area never completes, so a proportion here would be fabricated.
 *    The ONE state the card draws is the genuine absence — see `quiet` below.
 *
 * ── Untitled provenance ─────────────────────────────────────────────────────
 * The surface is Untitled's bounded card boundary — the same
 * `rounded-xl bg-primary shadow-xs ring-1 ring-secondary` that
 * `application/table`'s `TableCard.Root` declares and that every Untitled
 * Application UI panel uses — with its `border-t border-secondary` divided
 * footer band. The state chip is the genuine `base/badges` source through the
 * shared `UntitledStatusBadge`. Nothing here is a second card system.
 *
 * Presentation only. It resolves no icons, no colours and no counts; the caller
 * hands it a rendered mark and already-derived display strings, which is what
 * lets the Areas gallery and any future surface draw the SAME card without
 * either reaching into the other (AGENTS.md §9).
 */

import type { ReactNode } from "react";
import { Children } from "react";
import { Link } from "react-router";

import {
  identityAttribute,
  resolveIdentity,
} from "~/shared/entity/identity-resolution";
import { UntitledStatusBadge } from "~/shared/pill";

/** One figure in the card's foot — a number and the noun it counts. */
export type AreaCardFact = {
  readonly id: string;
  /** The figure, as text. A string so a caller with a bound can say "50+". */
  readonly value: string;
  /** What the figure counts, already pluralised by the caller. */
  readonly label: string;
};

export type AreaCardProps = {
  /** The record's identity mark — a rendered node. Decorative. */
  readonly icon?: ReactNode;
  readonly title: string;
  readonly headingLevel?: 2 | 3 | 4;
  /**
   * The permanence line — "Ongoing since Mar 2024".
   *
   * Deliberately not a description: an Area has no description field, and
   * inventing placeholder prose is the thing the Project card's own notes warn
   * about. `null` renders nothing rather than an empty line.
   */
  readonly since?: string | null;
  /**
   * The genuine absence, when the Area has nothing running in it.
   *
   * The ONE state an Areas COLLECTION can honestly draw. The Area record's
   * momentum (`evaluateAreaMomentum`) needs per-Project health facts for every
   * Project in the Area, which a bounded collection page does not read and must
   * not start reading per row — so the card states what it knows instead of
   * inventing an Area score. The absence is the exception, because it is
   * derived from exactly the counts the card already has and it agrees with the
   * record's `empty` momentum in every case.
   *
   * The wording is the RECORD's own ("No active work"), so the two surfaces
   * speak one vocabulary rather than two.
   */
  readonly quiet?: { readonly label: string; readonly hint?: string } | null;
  /** The foot's figures. Two or three; a fourth is a dashboard. */
  readonly facts?: readonly AreaCardFact[];
  /** The record's stable identity rank, for the mark's accent rail. */
  readonly accent?: number | null;
  /** IDENTITY-01 — the record's OWN chosen colour slot, when it has one. */
  readonly colourSlot?: string | null;
  /** The overflow menu. Stays above the whole-card link. */
  readonly overflow?: ReactNode;
  readonly href: string;
  readonly openAriaLabel?: string;
  /** Archived treatment — quieter, and always stated in words by the caller. */
  readonly muted?: boolean;
  readonly className?: string;
  readonly "data-testid"?: string;
};

export function AreaCard({
  icon,
  title,
  headingLevel = 3,
  since,
  quiet = null,
  facts = [],
  accent,
  colourSlot = null,
  overflow,
  href,
  openAriaLabel,
  muted = false,
  className,
  "data-testid": testId,
}: AreaCardProps) {
  const Heading = `h${headingLevel}` as const;
  // The ONE resolver. A card and the mark inside it agreeing depends on there
  // being one mapping from identity to colour.
  const identity = resolveIdentity({ colourSlot, colourRank: accent ?? null });

  return (
    // Named by the record's title: an `article` with no accessible name is a
    // region a screen-reader user can land in without being told which record
    // they landed in.
    //
    // `aria-label` rather than `aria-labelledby` pointing at the heading — the
    // heading's only child is the whole-card link, whose own name is
    // "Open <title>", so referencing it would name the card "Open Health".
    <article
      className={[
        "dh-areacard",
        // Untitled's bounded card boundary (`application/table` → `TableCard.Root`).
        "relative flex h-full min-w-0 flex-col overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary",
        "transition duration-100 ease-linear hover:shadow-md hover:ring-primary",
        muted ? "dh-areacard--muted opacity-70" : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={title}
      // Decorative: the accent repeats the identity mark's colour, and every
      // fact it decorates is stated in words beside it.
      {...identityAttribute(identity.slot)}
      data-testid={testId}
    >
      <div className="flex min-w-0 flex-col gap-3 p-5 max-md:p-4">
        <div className="flex min-w-0 items-start justify-between gap-3">
          {icon ? (
            /*
             * The mark LEADS its own row, with the overflow opposite — the same
             * anatomy `ProjectCard` takes, so the two gallery objects share a
             * skeleton and differ where their DATA differs. It also gives the
             * title the card's full width instead of the width left beside a
             * 56px tile.
             */
            <span className="dh-areacard__icon shrink-0" aria-hidden="true">
              {icon}
            </span>
          ) : (
            <span />
          )}
          {overflow ? (
            <span className="dh-areacard__overflow relative z-10 -mt-1 -mr-1 shrink-0">
              {overflow}
            </span>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <Heading className="dh-areacard__title text-md font-semibold text-primary">
            {/*
             * The whole-card destination: the title link's `::after` covers the
             * card, so a click anywhere opens the record while the overflow
             * stays above it and stays clickable. A router `Link`, so the page
             * keeps its scroll position and accumulated pages — and still a
             * real href, so middle-click and "copy link address" behave.
             */}
            <Link
              className="dh-areacard__open line-clamp-2 rounded-sm text-primary outline-focus-ring after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2"
              to={href}
              aria-label={openAriaLabel ?? title}
            >
              {title}
            </Link>
          </Heading>
          {since ? (
            <p className="dh-areacard__since truncate text-sm text-tertiary">
              {since}
            </p>
          ) : null}
        </div>
      </div>

      {/*
       * The foot. `mt-auto` pins it, so every card in a gallery row ends its
       * facts on the same baseline whether or not its title wrapped to two
       * lines — the property that makes a row of them comparable at a glance,
       * and the same rule `ProjectCard` applies to its measure.
       */}
      {quiet ? (
        <div className="dh-areacard__foot mt-auto flex min-w-0 flex-col items-start gap-1.5 border-t border-secondary bg-secondary_subtle px-5 py-3 max-md:px-4">
          {/*
           * `pointer-events-none` beside the lift: a state is a reading, never
           * a control, and the card's contract is that every static part of its
           * face opens the record. Lifting the badge above the stretched link
           * without giving the pointer back makes it a dead patch.
           */}
          <span className="pointer-events-none relative z-10">
            <UntitledStatusBadge tone="neutral" dot size="sm">
              {quiet.label}
            </UntitledStatusBadge>
          </span>
          {quiet.hint ? (
            <span className="dh-areacard__quiet-hint min-w-0 truncate text-sm text-tertiary">
              {quiet.hint}
            </span>
          ) : null}
        </div>
      ) : facts.length > 0 ? (
        /*
         * `auto-fit` rather than a fixed column count, so a sparse Area's two
         * facts fill the width and a busy one's four wrap to two rows instead
         * of crushing to 60px each. The minimum is the width of "open tasks",
         * which is the longest noun any of them carries.
         */
        <dl className="dh-areacard__foot m-0 mt-auto grid min-w-0 grid-cols-[repeat(auto-fit,minmax(4.25rem,1fr))] gap-x-3 gap-y-2.5 border-t border-secondary bg-secondary_subtle px-5 py-3 max-md:px-4">
          {facts.map((fact) => (
            <div key={fact.id} className="flex min-w-0 flex-col">
              {/*
               * The VALUE before its noun in the DOM, which is the reading
               * order a figure wants — and a `<dl>` permits `dd` before `dt`
               * only inside a wrapping `div`, which is what this is.
               */}
              <dd className="dh-areacard__fact-value order-1 m-0 text-lg leading-tight font-semibold text-primary tabular-nums">
                {fact.value}
              </dd>
              <dt className="dh-areacard__fact-label order-2 truncate text-xs text-tertiary">
                {fact.label}
              </dt>
            </div>
          ))}
        </dl>
      ) : null}
    </article>
  );
}

/**
 * The responsive gallery Area cards sit in.
 *
 * `auto-fit` with a sensible minimum, so the column count follows the available
 * width rather than a breakpoint table. A labelled `ul`/`li`, so a screen reader
 * announces "Areas, list, 11 items" and the owner knows how much is there before
 * reading any of it — `aria-label` on a bare `div` names nothing at all, because
 * a generic element has no role for a name to attach to.
 */
export function AreaCardGrid({
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
      className={[
        "dh-areacard-grid m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(17rem,1fr))] gap-4 p-0 max-md:grid-cols-1 max-md:gap-3",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={label}
      data-testid={testId}
    >
      {Children.map(children, (child) =>
        child === null || child === undefined || child === false ? null : (
          // Without a flex factor a card is sized to its own content inside the
          // grid item, so a row comes out with three widths and a ragged edge.
          <li className="dh-areacard-grid__item flex min-w-0 [&>*]:min-w-0 [&>*]:flex-1">
            {child}
          </li>
        ),
      )}
    </ul>
  );
}
