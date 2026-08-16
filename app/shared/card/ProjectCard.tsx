/**
 * UIX-02 / REDESIGN-04 — the PROJECT gallery card.
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
 *     │ [mark]                            ⋯  │
 *     │ Title                                │
 *     │ Area · Goal                          │
 *     │                                      │
 *     │ ████████████░░░░░░░░░░░░░░░░░   63%  │   ← the measure, and its figure
 *     │ 14 tasks · 4 due this week           │   ← the meta line
 *     └──────────────────────────────────────┘
 *
 * ── REDESIGN-04: the anatomy is the mockup's ────────────────────────────────
 * `mockup3.png` settles three things UIX-02 had drawn differently, and §5.6
 * decides the collision between them:
 *
 *   - **The mark leads its own row.** In the reference the tinted tile sits
 *     alone at the top-left with the overflow opposite it, and the title starts
 *     the row beneath. That gives the title the card's FULL width instead of
 *     the width left over beside a 40px tile, which is what was clamping
 *     realistic Project names.
 *   - **The bar comes before the meta line, and the percentage rides at the
 *     bar's right end.** One statement about proportion, then one about volume.
 *   - **The attention SENTENCE is gone; attention survives as SIGNAL.** The
 *     reference's card carries a description and a `tasks · due` meta line, not
 *     a health sentence. So `projectAttention` is not deleted — it is
 *     re-expressed: the state dot joins the meta line, and a Project with
 *     overdue work tints the DUE fragment. Small, tokenised, colour PLUS text,
 *     never colour alone, and the evaluator's full sentence still rides along
 *     for assistive tech.
 *
 * The reference also draws a two-line DESCRIPTION between the title and the
 * bar. DalyHub Projects have no description field — the spine stores identity
 * and lifecycle, and `project_details` stores status, archival and an icon key
 * — so `description` is rendered only where a caller genuinely has one, and the
 * Projects gallery passes nothing rather than inventing placeholder prose. See
 * `REDESIGN_04_SPINE_WORKSPACES_2026_08.md` §5 and `PRODUCT_DEBT.md`.
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
  /**
   * REDESIGN-04 — the record's own description, clamped to two lines.
   *
   * Absent for a Project that has none: an empty region, never placeholder
   * prose. DalyHub's data model carries no Project description today (see the
   * note above), so the Projects gallery passes nothing; the prop exists
   * because the mockup's anatomy has the slot and a caller that acquires real
   * descriptive text should have somewhere honest to put it.
   */
  readonly description?: string | null;
  /**
   * The attention SIGNAL — a state dot and its accessible sentence, shown at
   * the head of the meta line rather than as a sentence of its own (§5.6).
   */
  readonly attention?: {
    readonly text: string;
    readonly tone: ProjectCardTone;
    readonly detail: string;
  };
  /**
   * The meta line's facts, in the reference's order — "14 tasks", "4 due this
   * week". Each carries its own words; a fragment with nothing true to say is
   * simply absent. `tone` tints a fragment (an overdue Project's due count),
   * and is decorative: the words are the fact.
   */
  readonly meta?: readonly {
    readonly key: string;
    readonly text: string;
    readonly tone?: ProjectCardTone;
  }[];
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
  description,
  attention,
  meta,
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
       * The reference's two-line description. Rendered only where the caller
       * genuinely has one — a Project without descriptive text shows nothing,
       * not a placeholder, and the pinned foot keeps the row's baselines
       * regardless.
       */}
      {description ? (
        <p className="dh-pcard__description">{description}</p>
      ) : null}

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
      {/*
       * REDESIGN-04 — the foot is the MEASURE, then the META LINE.
       *
       * The reference's order, and the honest one: the bar answers "how far
       * along", the line beneath answers "how much, and how urgent". The foot
       * is still pinned to the bottom of the card (rule 1 above), so a row of
       * cards puts every bar on the same baseline whatever the title did.
       */}
      <div className="dh-pcard__foot">
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

        {attention || (meta && meta.length > 0) || fact ? (
          <p
            className="dh-pcard__meta"
            data-tone={attention?.tone ?? "neutral"}
            // Named so a test can aim at the REGION — the one place a raised,
            // non-interactive element could swallow a click on the card's
            // stretched link — without reaching for a styling class.
            data-testid="project-card-attention"
          >
            {attention ? (
              <>
                {/*
                 * §5.6 — attention survives as SIGNAL rather than as a
                 * sentence. The dot is decorative; the evaluator's own full
                 * wording rides along for assistive tech, so nothing on this
                 * card is carried by colour alone.
                 */}
                <span className="dh-pcard__dot" aria-hidden="true" />
                <span className="dh-visually-hidden">{attention.detail}. </span>
              </>
            ) : null}
            {(meta ?? []).map((item, index) => (
              <span
                key={item.key}
                className="dh-pcard__meta-fact"
                data-tone={item.tone ?? undefined}
              >
                {index > 0 ? (
                  <span className="dh-pcard__meta-sep" aria-hidden="true">
                    ·
                  </span>
                ) : null}
                {item.text}
              </span>
            ))}
            {fact ? <span className="dh-pcard__fact">{fact}</span> : null}
          </p>
        ) : null}
      </div>
    </article>
  );
}
