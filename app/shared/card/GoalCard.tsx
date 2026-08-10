/**
 * UIX-03 — the GOAL gallery card.
 *
 * A Project is work being moved forward; a Goal is an OUTCOME being moved
 * toward. UIX-02 gave Projects a card of their own for exactly that reason and
 * left Goals on the generic `EntityCard`, so the Goals gallery went on
 * answering "how much work is finished?" — a percentage, a bar, a chip — when
 * the question it exists to answer is "where am I, and how far is left?".
 *
 * So a Goal has a card of its own, and it is built around the READING:
 *
 *     ┌────────────────────────────────────────┐
 *     │ [mark]  Reach 70 kg                 ⋯  │
 *     │         Health & Fitness               │
 *     │                                        │
 *     │ 79.3 kg                    ╲╱╲___      │  ← the outcome, and its shape
 *     │ from 85 kg  →  70 kg                   │  ← the whole journey, in words
 *     │                                        │
 *     │ ███████░░░░░░░░░░░░░░░░  38%           │
 *     │ On track · 9.3 kg to go · 10 Dec 2026  │  ← state, distance, deadline
 *     └────────────────────────────────────────┘
 *
 * Four rules make it a Goal card rather than a Project card with a weight in it:
 *
 * 1. **The reading leads, not the percentage.** "79.3 kg" is the thing the owner
 *    set out to change; "38%" is a derivation of it. The Project card is the
 *    other way round because a Project's own unit — a task — is not what its
 *    owner cares about the count of.
 * 2. **The journey is stated, not implied.** `from 85 kg → 70 kg` is the one
 *    line that makes the percentage checkable by eye, and it is the fact the
 *    old card had nowhere to put. Progress toward a target is meaningless
 *    without the start, which is why the brief's own worked example leads with
 *    it.
 * 3. **One visual, chosen by the data.** A Goal with a history gets a sparkline;
 *    a Goal with one reading gets the bar alone. There is never a flat line
 *    asserting a direction two points cannot support, and never two competing
 *    drawings of the same number.
 * 4. **An absence is drawn as an absence.** A Goal with no measurement gets a
 *    `note` where the reading would be, and NO bar — not a 0% track for a
 *    denominator it has not got. That Goal is not going badly; it is one DalyHub
 *    has not been told how to measure, and the card says so in words.
 *
 * Presentation only. It derives no progress, resolves no colours and formats no
 * numbers: callers hand it rendered nodes and finished strings, which is what
 * lets the Goals gallery, an Area's Goals tab and Today draw the SAME card
 * without any of them reaching into another module (AGENTS.md §9).
 */

import type { ReactNode } from "react";
import { Link } from "react-router";

import { areaAccentForRank, type PillTone } from "~/shared/pill";

/**
 * The tone vocabulary the state line understands. Meaning is in the words.
 *
 * It is the shared `PillTone` set, so a caller can hand the state tone straight
 * from `goalProgressStatusTone` without a translation table that would have to
 * be kept in step with it.
 */
export type GoalCardTone = PillTone;

export type GoalCardProps = {
  /** The record's identity mark — a rendered node. Decorative. */
  readonly icon?: ReactNode;
  readonly title: string;
  /** Heading level, so a grid nests correctly under the collection's heading. */
  readonly headingLevel?: 2 | 3 | 4;
  /** The parent context — the Area this Goal serves. */
  readonly context?: string | null;
  /**
   * The current reading, large. Omitted for a Goal with no measurement or no
   * recorded value, which renders `note` in its place.
   */
  readonly metric?: {
    /** The reading as the owner reads it — "79.3 kg", "2 of 5". */
    readonly value: string;
    /** The journey beneath it — "from 85 kg → 70 kg". */
    readonly caption?: string | null;
  };
  /**
   * The honest sentence shown INSTEAD of a reading: "Not measured", "No
   * measurement recorded yet". Never rendered beside a metric — a card states
   * one thing in that slot.
   */
  readonly note?: string | null;
  /**
   * What this Goal means, for a Goal with no number to show.
   *
   * A qualitative Goal is not an empty Goal, and a card carrying only the words
   * "Not measured" makes it look like one. Its definition of done IS its
   * content, so it takes the space the reading would have had. Ignored whenever
   * there is a `metric`: a measured Goal's card is about the measurement.
   */
  readonly noteDetail?: string | null;
  /** The card's one visualisation — a sparkline, when history supports one. */
  readonly visual?: ReactNode;
  /** Bounded progress. Omitted whenever a percentage would be invented. */
  readonly progress?: {
    readonly percent: number;
    /** The complete sentence for assistive tech — "38% — 79.3 kg, 9.3 kg remaining". */
    readonly valueText: string;
    /**
     * The figure printed beside the bar. Defaults to `"<percent>%"`; pass `null`
     * when the reading ABOVE the bar is already that percentage — a manual Goal
     * whose whole measurement is "35%" would otherwise print it twice on one
     * card, once at display size and once beside the track.
     */
    readonly label?: string | null;
  };
  /** The state word and its tone — "On track", "Needs attention". */
  readonly state?: { readonly label: string; readonly tone: GoalCardTone };
  /** Short trailing facts on the state line — "9.3 kg to go", "10 Dec 2026". */
  readonly facts?: readonly string[];
  /**
   * The Area's stable identity rank. Paints the mark's container and the bar in
   * ONE colour, so a gallery of Goals groups by the part of life each serves.
   */
  readonly accent?: number | null;
  readonly overflow?: ReactNode;
  readonly href: string;
  readonly openAriaLabel?: string;
  /** Quieter treatment — always stated in words by the caller as well. */
  readonly muted?: boolean;
  readonly className?: string;
  readonly "data-testid"?: string;
};

export function GoalCard({
  icon,
  title,
  headingLevel = 3,
  context,
  metric,
  note,
  noteDetail,
  visual,
  progress,
  state,
  facts = [],
  accent,
  overflow,
  href,
  openAriaLabel,
  muted = false,
  className,
  "data-testid": testId,
}: GoalCardProps) {
  const Heading = `h${headingLevel}` as const;
  const classes = ["dh-gcard", muted ? "dh-gcard--muted" : null, className]
    .filter(Boolean)
    .join(" ");

  return (
    // Named by the record, not by the link inside it: the heading's only child
    // is the whole-card link, whose accessible name is "Open <title>", so
    // labelling by it would announce the card as "Open Reach 70 kg".
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
      <div className="dh-gcard__head">
        {icon ? (
          <span className="dh-gcard__mark" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <div className="dh-gcard__titles">
          <Heading className="dh-gcard__title">
            {/* A real router `Link`, covering the card through its ::after, so
                a card click is a client navigation that keeps the accumulated
                "Load more" pages — while ⌘-click still opens a new tab. */}
            <Link
              className="dh-gcard__open"
              to={href}
              aria-label={openAriaLabel ?? title}
            >
              {title}
            </Link>
          </Heading>
          {context ? <p className="dh-gcard__context">{context}</p> : null}
        </div>
      </div>

      {/* Positioned rather than laid out in the head row: as a third flex child
          it took ~40px off every title's track and turned a four-column
          gallery into a column of ellipses. */}
      {overflow ? <div className="dh-gcard__overflow">{overflow}</div> : null}

      <div className="dh-gcard__body">
        {metric ? (
          <div className="dh-gcard__reading">
            <p className="dh-gcard__metric" data-testid="goal-card-metric">
              <span className="dh-gcard__value">{metric.value}</span>
              {metric.caption ? (
                <span className="dh-gcard__journey">{metric.caption}</span>
              ) : null}
            </p>
            {/* The visual sits BESIDE the reading rather than under it, so the
                card's tallest element is the number the owner came to read. */}
            {visual ? <div className="dh-gcard__visual">{visual}</div> : null}
          </div>
        ) : note ? (
          <div className="dh-gcard__note" data-testid="goal-card-note">
            <p className="dh-gcard__note-label">{note}</p>
            {noteDetail ? (
              <p className="dh-gcard__note-detail">{noteDetail}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="dh-gcard__foot">
        {progress ? (
          <div className="dh-gcard__progress">
            <span
              className="dh-gcard__track"
              role="progressbar"
              aria-valuenow={progress.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuetext={progress.valueText}
              aria-label={`${title} progress`}
            >
              <span
                className="dh-gcard__fill"
                style={{ inlineSize: `${progress.percent}%` }}
              />
            </span>
            {progress.label === null ? null : (
              <span className="dh-gcard__percent">
                {progress.label ?? `${progress.percent}%`}
              </span>
            )}
          </div>
        ) : null}
        {state || facts.length > 0 ? (
          <p className="dh-gcard__state-line" data-testid="goal-card-state">
            {state ? (
              <span className="dh-gcard__state" data-tone={state.tone}>
                {state.label}
              </span>
            ) : null}
            {facts.map((fact) => (
              <span key={fact} className="dh-gcard__fact">
                {fact}
              </span>
            ))}
          </p>
        ) : null}
      </div>
    </article>
  );
}
