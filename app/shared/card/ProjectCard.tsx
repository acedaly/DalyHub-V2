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
 * 3. **Identity is never status.** The MARK takes the record's own stable
 *    accent (ADR-068 §5); the attention line and the BAR take the health tone.
 *    A Project with a violet identity that is running late keeps its violet
 *    mark and draws a coral bar over "3 overdue" — the two never repaint each
 *    other, and the bar agrees with the sentence beside it by construction
 *    because it is derived from the same tone (POLISH-01). Until POLISH-01 the
 *    bar was on the identity side of that sentence, which is how a completed
 *    Project drew an orange meter.
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

import {
  identityAttribute,
  resolveIdentity,
} from "~/shared/entity/identity-resolution";
import { meterStatusFromTone, type MeterStatus } from "~/shared/progress";
import { LabelledProgressBar } from "~/shared/ui/untitled/overrides/labelled-progress-bar";

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
    /**
     * True when the line is a HEALTH signal rather than a lifecycle state.
     *
     * CONVERGE-01 §C — only a health signal is DRAWN. "Completed" and
     * "Archived" are already the card's pill and its percentage; "6 overdue" is
     * the thing the card knows and nothing else on it says.
     */
    readonly fromHealth?: boolean;
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
    /**
     * POLISH-01 — what the bar SAYS, when it is not simply the attention tone.
     *
     * Defaults to the tone of the attention line, so a card cannot draw a green
     * bar over the words "3 overdue". Pass it explicitly only where the two
     * genuinely differ.
     */
    readonly status?: MeterStatus;
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
  colourSlot = null,
  overflow,
  href,
  openAriaLabel,
  muted = false,
  className,
  "data-testid": testId,
}: ProjectCardProps) {
  const Heading = `h${headingLevel}` as const;

  // The ONE resolver. This component never maps a rank to a colour itself — a
  // card and the tile inside it agreeing depends on there being one mapping.
  const identity = resolveIdentity({ colourSlot, colourRank: accent ?? null });

  return (
    /*
     * UNTITLED-04 — the surface is Untitled's card grammar.
     *
     * `rounded-xl bg-primary shadow-xs ring-1 ring-secondary` is the exact
     * bounded surface `application/table`'s `TableCard.Root` declares and that
     * Untitled's Application UI uses for every bounded panel, so a Project card
     * and the Projects table are visibly the same object family rather than two
     * card languages sitting on one page. The anatomy inside it — mark alone on
     * its own row, title with the card's full width, the measure pinned to the
     * foot so a row of cards shares one baseline — is unchanged from UIX-02 /
     * REDESIGN-04, because that anatomy is a product decision about what a
     * Project card answers.
     *
     * The `dh-pcard*` class names survive as HOOKS only. Their presentation
     * rules were deleted from `card-family.css` with this pass; product tests
     * and end-to-end journeys address them as the stable way to ask "which part
     * of the card is this?", and renaming them would be churn with no gain.
     */
    // Named by the record, not by the link inside it: the heading's only child
    // is the whole-card link, whose accessible name is "Open <title>", so
    // labelling by it would announce the card as "Open Kitchen Renovation".
    <article
      className={[
        "dh-pcard",
        "group relative flex h-full flex-col gap-3 rounded-xl bg-primary p-5 shadow-xs ring-1 ring-secondary transition duration-100 ease-linear hover:shadow-md hover:ring-primary",
        /*
         * The PHONE composition: a compact row, not the desktop card at full
         * size. The mark takes a column and everything else indents against it,
         * so a list is scanned by mark and by title rather than by counting
         * boxes, and a 844px viewport shows six Projects instead of three.
         *
         * Same DOM, same reading order, same accessible names — `contents`
         * dissolves the head into the card's own grid, and nothing is moved by
         * `order`. The card also stops stretching to its row's tallest sibling:
         * at row scale a uniform height is what a list gives, and equal-height
         * columns are a two-column idea.
         */
        "max-md:grid max-md:h-auto max-md:grid-cols-[auto_minmax(0,1fr)] max-md:content-start max-md:gap-x-3 max-md:gap-y-1 max-md:p-4",
        muted ? "dh-pcard--muted opacity-70" : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={title}
      {...identityAttribute(identity.slot)}
      data-testid={testId}
    >
      <div className="dh-pcard__head flex flex-col gap-3 max-md:contents">
        {icon ? (
          <span
            /*
             * On a phone the mark spans the title and its context — that is what
             * puts the tile beside the record rather than above it — and steps
             * down to the compact rung by re-pointing the identity-icon size
             * tokens the shared `AccentIcon` reads. A 48px square on a 358px
             * content width is a seventh of the row spent on a glyph.
             */
            className="dh-pcard__mark flex w-fit items-center max-md:col-start-1 max-md:row-span-2 max-md:self-start max-md:[--app-entity-icon-container-size-lg:var(--app-entity-icon-container-size-sm)] max-md:[--app-entity-icon-size-lg:var(--app-entity-icon-size-sm)]"
            aria-hidden="true"
          >
            {icon}
          </span>
        ) : null}
        <div className="dh-pcard__titles flex min-w-0 flex-col gap-0.5 max-md:col-start-2">
          <Heading className="dh-pcard__title text-md font-semibold text-primary">
            {/*
             * A real router `Link`, covering the card through its ::after. A
             * bare anchor would make every card a full document load, throwing
             * away the scroll position and the accumulated "Load more" pages;
             * the href is genuinely present, so ⌘-click and "copy link
             * address" still behave.
             */}
            <Link
              /*
               * Two lines then an ellipsis on a gallery card, ONE line in a
               * phone row: three Projects whose names run to two lines would
               * give a list three different row heights.
               */
              className="dh-pcard__open line-clamp-2 rounded-sm text-primary outline-focus-ring after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 max-md:truncate max-md:whitespace-nowrap"
              to={href}
              aria-label={openAriaLabel ?? title}
            >
              {title}
            </Link>
          </Heading>
          {context ? (
            <p className="dh-pcard__context truncate text-sm text-tertiary">
              {context}
            </p>
          ) : null}
        </div>
      </div>

      {/*
       * The overflow is positioned rather than laid out in the head row, and it
       * sits ABOVE the stretched link so it stays clickable.
       */}
      {overflow ? (
        <div className="dh-pcard__overflow absolute top-3 right-3 z-10">
          {overflow}
        </div>
      ) : null}

      {description ? (
        // Prose rather than a fact, and absent on most Projects already: the
        // phone row drops it and the record it belongs to is one tap away.
        <p className="dh-pcard__description line-clamp-2 text-sm text-tertiary max-md:hidden">
          {description}
        </p>
      ) : null}

      {/*
       * The foot is the MEASURE, then the META LINE — the bar answers "how far
       * along", the line beneath answers "how much, and how urgent". `mt-auto`
       * pins it, so a row of cards puts every bar on the same baseline whatever
       * the title did.
       */}
      {/*
       * The foot indents under the title on a phone rather than starting at the
       * card's edge, so the row has one text column and the eye runs down it.
       */}
      <div className="dh-pcard__foot mt-auto flex flex-col gap-2 pt-1 max-md:col-start-2 max-md:gap-1 max-md:pt-0">
        {progress ? (
          <div
            /*
             * `pointer-events-none`, because the meter must not SWALLOW a click
             * meant for the card.
             *
             * The card's whole face is its title link, stretched with an
             * `::after` overlay. An ordinary static child paints beneath a
             * positioned pseudo-element, but the Untitled meter fills itself
             * with a `transform` — which makes it a stacking context, which puts
             * it on top. The figure is a reading, never a control, so it gives
             * the pointer back; assistive technology still reads its role, name
             * and value.
             */
            className="dh-pcard__progress pointer-events-none"
            data-testid="project-card-figures"
          >
            <LabelledProgressBar
              label={`${title} progress`}
              value={progress.percent}
              valueText={progress.valueText.replace(/^\d+% — /, "")}
              tone={progressTone(progress.status ?? toneOf(attention?.tone))}
              showValue
            />
          </div>
        ) : null}

        {attention || (meta && meta.length > 0) || fact ? (
          <p
            className="dh-pcard__meta flex flex-wrap items-center gap-x-1.5 text-sm text-tertiary"
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
                 * sentence. The dot is decorative and the evaluator's own full
                 * wording rides along for assistive tech, so nothing on this
                 * card is carried by colour alone. Only a HEALTH signal is
                 * drawn: a lifecycle attention line says "Completed" or
                 * "Archived", which the card's percentage already states.
                 */}
                <span
                  className={`dh-pcard__dot size-2 shrink-0 rounded-full ${DOT_TONE[attention.tone]}`}
                  aria-hidden="true"
                />
                <span className="sr-only">{attention.detail}. </span>
                {attention.fromHealth ? (
                  <span
                    className={`dh-pcard__meta-fact dh-pcard__meta-fact--attention font-medium ${TEXT_TONE[attention.tone]}`}
                    aria-hidden="true"
                  >
                    {attention.text}
                  </span>
                ) : null}
              </>
            ) : null}
            {(meta ?? []).map((item, index) => (
              <span
                key={item.key}
                className={`dh-pcard__meta-fact ${item.tone ? TEXT_TONE[item.tone] : ""}`}
                data-tone={item.tone ?? undefined}
              >
                {/* A separator before every fact except the line's first. The
                    attention diagnostic above is a fact too when it is drawn,
                    so it moves what "first" means. */}
                {index > 0 || (attention?.fromHealth ?? false) ? (
                  <span
                    className="dh-pcard__meta-sep pr-1.5 text-quaternary"
                    aria-hidden="true"
                  >
                    ·
                  </span>
                ) : null}
                {item.text}
              </span>
            ))}
            {fact ? (
              <span className="dh-pcard__fact ml-auto pl-3 text-tertiary">
                {fact}
              </span>
            ) : null}
          </p>
        ) : null}
      </div>
    </article>
  );
}

/** The state dot's paint, per tone. Decorative — the words carry the meaning. */
const DOT_TONE: Record<ProjectCardTone, string> = {
  neutral: "bg-fg-quaternary",
  success: "bg-fg-success-secondary",
  info: "bg-fg-brand-secondary",
  warning: "bg-fg-warning-secondary",
  danger: "bg-fg-error-secondary",
};

/** A tinted meta fragment. Reinforcement only; the fragment states its own fact. */
const TEXT_TONE: Record<ProjectCardTone, string> = {
  neutral: "text-tertiary",
  success: "text-success-primary",
  info: "text-brand-secondary",
  warning: "text-warning-primary",
  danger: "text-error-primary",
};

/** A `MeterStatus` or a card tone, as the shared bar's tone vocabulary. */
function toneOf(tone: ProjectCardTone | undefined): MeterStatus | undefined {
  return meterStatusFromTone(tone);
}

function progressTone(
  status: MeterStatus | undefined,
): "neutral" | "positive" | "caution" | "critical" {
  switch (status) {
    case "success":
      return "positive";
    case "warning":
      return "caution";
    case "danger":
      return "critical";
    default:
      return "neutral";
  }
}
