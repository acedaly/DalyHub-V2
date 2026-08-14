/**
 * UIX-02 — the PROJECT gallery card.
 *
 * A Project is a finite body of work being actively moved forward, and the
 * question its card exists to answer is "how is this going, and does it need
 * me?". Until UIX-02 both Projects and Areas rendered through the one generic
 * `EntityCard`, which meant the gallery answered that question in the same shape
 * it used to answer "what part of my life is this?" — the two most different
 * records in the spine drawn as the same object with different words in it.
 *
 * So a Project has a card of its own, composed bottom-heavy:
 *
 *     ┌──────────────────────────────────────┐
 *     │ [mark]  Title                     ⋯  │
 *     │         Area · Goal                  │
 *     │                                      │
 *     │ ● 3 overdue                          │   ← ONE attention line
 *     │ 63%                          3 open  │   ← the figure, and one fact
 *     │ ████████████░░░░░░░░░░░░░░░░░░░░░░   │   ← 8px, the record's accent
 *     └──────────────────────────────────────┘
 *
 * Three rules make it a Project card rather than a card with Project data in it:
 *
 * 1. **The foot is pinned.** Identity is at the top, the measure is at the
 *    bottom, and the space between them absorbs a wrapped context line. Every
 *    card in a row therefore puts its bar on the same baseline, which is what
 *    makes a grid comparable at a glance — the previous card let the bar float
 *    wherever the content above it ended.
 * 2. **The title is bounded at two lines.** One line is what a ROW wants; at
 *    four columns on a 1440 the card is ~285px and the title's track is that
 *    minus the mark, which clamped "Records Migration" to "Records…". Two lines
 *    fit every realistic Project name at every column count the grid produces,
 *    and rule 1 means a card whose title takes two of them still lands its bar
 *    on the row's baseline. Past that it ellipsises, and the full text is on the
 *    link's accessible name and on the record it opens.
 * 3. **Identity is never status.** The mark and the bar take the record's own
 *    stable accent (ADR-068 §5); the attention line takes the health tone. A
 *    Project with a violet identity that is running late stays violet and says
 *    "3 overdue" in coral beside it — the two never repaint each other.
 *
 * A Project with NO tasks draws no bar and no percentage: an empty track at 0%
 * says "nothing done", and the truth is "nothing planned". The foot still holds
 * its place so the row keeps its baseline.
 *
 * Presentation only — it resolves no icons, no colours and no health. Callers
 * hand it a rendered mark and already-derived display data, which is what lets
 * the Projects gallery and an Area's Projects tab render the SAME card without
 * either module reaching into the other (AGENTS.md §9).
 */

import type { ReactNode } from "react";
import { Link } from "react-router";

import { areaAccentForRank } from "~/shared/pill";

/** The tone vocabulary the attention dot understands. Meaning is in the words. */
export type ProjectCardTone =
  "neutral" | "success" | "info" | "warning" | "danger";

export type ProjectCardProps = {
  /** The record's identity mark — a rendered node. Decorative. */
  readonly icon?: ReactNode;
  readonly title: string;
  /** Heading level, so a grid nests correctly under the collection's heading. */
  readonly headingLevel?: 2 | 3 | 4;
  /** The parent context — "Work & Career · Ship DalyHub V2". */
  readonly context?: string | null;
  /** The ONE attention line: compact text, a decorative tone, a full sentence. */
  readonly attention?: {
    readonly text: string;
    readonly tone: ProjectCardTone;
    readonly detail: string;
  };
  /**
   * Bounded progress. Omitted for a Project with no tasks — see the note above
   * about why an absence is not zero.
   */
  readonly progress?: {
    readonly percent: number;
    /** The complete sentence for assistive tech — "63% — 5 of 8 tasks complete". */
    readonly valueText: string;
  };
  /** The one trailing fact beside the percentage — "3 open". */
  readonly fact?: string | null;
  /**
   * The record's stable identity rank. Paints the bar in the SAME colour the
   * caller painted the mark with — never a second colour decision.
   */
  readonly accent?: number | null;
  readonly overflow?: ReactNode;
  readonly href: string;
  readonly openAriaLabel?: string;
  /** Archived treatment — quieter, and always stated in words by the caller. */
  readonly muted?: boolean;
  readonly className?: string;
  readonly "data-testid"?: string;
};

export function ProjectCard({
  icon,
  title,
  headingLevel = 3,
  context,
  attention,
  progress,
  fact,
  accent,
  overflow,
  href,
  openAriaLabel,
  muted = false,
  className,
  "data-testid": testId,
}: ProjectCardProps) {
  const Heading = `h${headingLevel}` as const;
  const classes = ["dh-pcard", muted ? "dh-pcard--muted" : null, className]
    .filter(Boolean)
    .join(" ");

  return (
    // Named by the record, not by the link inside it: the heading's only child
    // is the whole-card link, whose accessible name is "Open <title>", so
    // labelling by it would announce the card as "Open Kitchen Renovation".
    <article
      className={classes}
      aria-label={title}
      data-accent={
        accent === undefined || accent === null
          ? undefined
          : String(areaAccentForRank(accent))
      }
      data-testid={testId}
    >
      <div className="dh-pcard__head">
        {icon ? (
          <span className="dh-pcard__mark" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <div className="dh-pcard__titles">
          <Heading className="dh-pcard__title">
            {/*
             * A real router `Link`, covering the card through its ::after. A
             * bare anchor would make every card a full document load, throwing
             * away the scroll position and the accumulated "Load more" pages;
             * the href is genuinely present, so ⌘-click and "copy link
             * address" still behave.
             */}
            <Link
              className="dh-pcard__open"
              to={href}
              aria-label={openAriaLabel ?? title}
            >
              {title}
            </Link>
          </Heading>
          {context ? <p className="dh-pcard__context">{context}</p> : null}
        </div>
      </div>

      {/*
       * The overflow is positioned rather than laid out in the head row.
       *
       * In the row it was a third flex child, so at a four-column 1440 the
       * title's track was the card minus the mark minus a 40px button — and
       * every title in the gallery came out as "DalyHub…", "Records…",
       * "Kitchen…". The menu is a corner affordance, not a column; taking it
       * out of flow gives the title the width it needs and moves nothing else.
       */}
      {overflow ? <div className="dh-pcard__overflow">{overflow}</div> : null}

      {/*
       * DS-05 — the foot is TWO lines, not three.
       *
       * The status line and the count are one statement about the work ("3
       * overdue … 3 open"), so they share a row with the count at the trailing
       * edge; the bar and its percentage are one statement about the proportion,
       * so they share the row below it. The baseline gave the percentage a line
       * of its own at 24px, which is what made the card 215px tall and put a
       * derived number above the record's own name in the visual hierarchy.
       */}
      <div className="dh-pcard__foot">
        {attention || fact ? (
          <p
            className="dh-pcard__attention"
            data-tone={attention?.tone ?? "neutral"}
            // Named so a test can aim at the REGION — the one place a raised,
            // non-interactive element could swallow a click on the card's
            // stretched link — without reaching for a styling class.
            data-testid="project-card-attention"
          >
            {attention ? (
              <>
                {/* Decorative — the text beside it is the fact, and the fuller
                 * sentence is available to assistive tech below. */}
                <span className="dh-pcard__dot" aria-hidden="true" />
                <span className="dh-pcard__attention-text">
                  {attention.text}
                </span>
                {attention.detail !== attention.text ? (
                  <span className="dh-visually-hidden">
                    {" "}
                    — {attention.detail}
                  </span>
                ) : null}
              </>
            ) : null}
            {fact ? <span className="dh-pcard__fact">{fact}</span> : null}
          </p>
        ) : null}

        {progress ? (
          <div
            className="dh-pcard__progress"
            data-testid="project-card-figures"
          >
            <span
              className="dh-pcard__track"
              role="progressbar"
              aria-valuenow={progress.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuetext={progress.valueText}
              aria-label={`${title} progress`}
            >
              <span
                className="dh-pcard__fill"
                style={{ inlineSize: `${progress.percent}%` }}
              />
            </span>
            <span className="dh-pcard__percent">{progress.percent}%</span>
          </div>
        ) : null}
      </div>
    </article>
  );
}
