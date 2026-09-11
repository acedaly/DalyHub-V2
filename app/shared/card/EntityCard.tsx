/**
 * The entity CARD — a record with an identity, in a grid.
 *
 * Projects, Areas, Goals and Assets are things you recognise before you read:
 * they have an icon, a name, a state and a sense of how far along they are. The
 * audit found all four rendering as identical full-width rows with a 16px
 * monochrome glyph and a run-on metadata line — "the same generic card list",
 * with an Area's whole identity carried by an 8px coloured dot.
 *
 * This card gives identity a place to live:
 *
 *     ┌─────────────────────────────────────────┐
 *     │ ⬤icon   Title                  [status] │
 *     │         Subtitle                        │
 *     │                                         │
 *     │ 12                          metric      │
 *     │ ▓▓▓▓▓▓▓▓░░░░░░░░  72%       progress     │
 *     │ meta · meta                             │
 *     ├─────────────────────────────────────────┤
 *     │ footer                        [ ⋯ ]     │
 *     └─────────────────────────────────────────┘
 *
 * The ICON CONTAINER is the point. It is a 40px rounded square painted with the
 * entity's (or the Area's) container colour, holding an on-container glyph — the
 * treatment the reference uses, and the one that makes a grid of these scannable
 * without reading a word. The card does not resolve icons or colours: the caller
 * passes a rendered node, because the card must not learn what an Area is.
 *
 * Whole-card destination: `href` covers the card with the title link's ::after,
 * so a click anywhere opens the record while the overflow menu and footer
 * controls stay above it and stay clickable. This is the same technique
 * `RecordRow` uses, for the same reason.
 *
 * The destination is a router `Link`, not a bare anchor: a real anchor would
 * make every card a full document load, throwing away the scroll position,
 * the accumulated "Load more" pages and the navigation budget. It is still one
 * ordinary link — right-click, middle-click, ⌘-click and "copy link address"
 * all behave, because the href is genuinely there.
 */

import { Children, type ReactNode } from "react";
import { Link } from "react-router";

import {
  identityAttribute,
  resolveIdentity,
} from "~/shared/entity/identity-resolution";

import type { MeterStatus } from "~/shared/progress";
import { LabelledProgressBar } from "~/shared/ui/untitled/overrides/labelled-progress-bar";

import { normaliseProgress, type CardProgress } from "./types";

export type EntityCardProps = {
  /** The identity mark — a rendered icon in its container. Decorative. */
  readonly icon?: ReactNode;
  readonly title: string;
  /** Heading level, so a grid of cards nests correctly. Defaults to 3. */
  readonly headingLevel?: 2 | 3 | 4;
  /** The parent context — an Area for a Project, a Goal for a Project. */
  readonly subtitle?: ReactNode;
  /** A status chip. Always carries its own text. */
  readonly status?: ReactNode;
  /** The one figure that matters most for this entity type. */
  readonly metric?: { readonly value: string; readonly label: string };
  /** Bounded progress, rendered as a 4px bar with its percentage beside it. */
  readonly progress?: CardProgress;
  /**
   * M3X-02 — the record's stable identity RANK, so its progress bar is painted
   * in its own accent rather than in the application's action colour.
   *
   * A gallery of twelve identical violet bars is a gallery the eye cannot track
   * down; a gallery of bars in each record's own colour is scannable by the same
   * signal the identity mark already teaches, one line below the mark that
   * taught it. It is the SAME rank the caller passes to `AccentIcon` — never a
   * second colour decision, and never a colour chosen per render.
   *
   * `undefined` keeps the primary fill, which is what a record with no identity
   * colour (a Goal, whose list projection carries no rank) should have.
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
  /** Supporting facts, laid out as one wrapping row rather than a run-on line. */
  readonly meta?: ReactNode;
  /** A footer action or note, separated from the body. */
  readonly footer?: ReactNode;
  /** The overflow menu. Stays above the whole-card link. */
  readonly overflow?: ReactNode;
  /** Whole-card destination. */
  readonly href?: string;
  readonly openAriaLabel?: string;
  /** Archived/inactive treatment — quieter, and stated in text by the caller. */
  readonly muted?: boolean;
  readonly selected?: boolean;
  readonly className?: string;
  readonly "data-testid"?: string;
};

export function EntityCard({
  icon,
  title,
  headingLevel = 3,
  subtitle,
  status,
  metric,
  progress,
  accent,
  colourSlot = null,
  meta,
  footer,
  overflow,
  href,
  openAriaLabel,
  muted = false,
  selected = false,
  className,
  "data-testid": testId,
}: EntityCardProps) {
  const Heading = `h${headingLevel}` as const;
  const resolved = progress ? normaliseProgress(progress) : null;
  /*
   * UNTITLED-04 — the surface is Untitled's card grammar.
   *
   * `rounded-xl bg-primary shadow-xs ring-1 ring-secondary` is the boundary
   * `application/table`'s `TableCard.Root` declares and that Untitled's
   * Application UI uses for every bounded panel, so an entity card, a record
   * panel and a collection table are visibly one object family. The `dh-ecard*`
   * class names survive as HOOKS; their presentation rules are deleted.
   */
  const classes = [
    "dh-ecard",
    "relative flex h-full min-w-0 flex-col gap-3 rounded-xl bg-primary p-5 shadow-xs ring-1 ring-secondary",
    /*
     * The PHONE composition: a compact ROW, from the same DOM. The header
     * dissolves into the card's own grid (`contents`), so the mark takes a
     * column and everything else indents against it — which is what makes a
     * list of these scannable by mark and by title rather than by counting
     * boxes. Nothing is hidden and nothing is reordered.
     */
    "max-md:grid max-md:h-auto max-md:grid-cols-[auto_minmax(0,1fr)_auto] max-md:content-start max-md:gap-x-3 max-md:gap-y-2 max-md:p-4",
    href
      ? "dh-ecard--interactive transition duration-100 ease-linear hover:shadow-md hover:ring-primary"
      : null,
    muted ? "dh-ecard--muted opacity-70" : null,
    selected ? "dh-ecard--selected ring-2 ring-brand" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  // The ONE resolver. This component never maps a rank to a colour itself — a
  // card and the tile inside it agreeing depends on there being one mapping.
  const identity = resolveIdentity({ colourSlot, colourRank: accent ?? null });

  return (
    // Named by the record's title. An `article` with no accessible name is a
    // region a screen-reader user can land in without being told which record
    // they landed in — in a grid of twelve cards that is the difference between
    // navigable and unusable.
    //
    // `aria-label` rather than `aria-labelledby` pointing at the heading: the
    // heading's only child is the whole-card link, whose own accessible name is
    // "Open <title>", so referencing it would name the card "Open Website
    // relaunch" instead of "Website relaunch".
    <article
      className={classes}
      aria-label={title}
      // Decorative: the accent repeats the identity mark's colour, and every
      // fact it decorates is stated in words beside it.
      {...identityAttribute(identity.slot)}
      data-testid={testId}
    >
      <div className="dh-ecard__header flex min-w-0 items-start gap-3 max-md:contents">
        {icon ? (
          <span
            /*
             * On a phone the mark spans the title and its subtitle, and steps
             * down to the compact rung by re-pointing the identity-icon size
             * tokens the shared `AccentIcon` reads.
             */
            className="dh-ecard__icon shrink-0 max-md:col-start-1 max-md:row-span-2 max-md:self-start max-md:[--app-entity-icon-container-size-lg:var(--app-entity-icon-container-size-sm)] max-md:[--app-entity-icon-size-lg:var(--app-entity-icon-size-sm)]"
            aria-hidden="true"
          >
            {icon}
          </span>
        ) : null}
        <div className="dh-ecard__titles flex min-w-0 flex-1 flex-col gap-0.5 max-md:col-start-2 max-md:row-start-1">
          <Heading className="dh-ecard__title text-md font-semibold text-primary">
            {href ? (
              <Link
                className="dh-ecard__open line-clamp-2 rounded-sm text-primary outline-focus-ring after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2"
                to={href}
                aria-label={openAriaLabel ?? title}
              >
                {title}
              </Link>
            ) : (
              title
            )}
          </Heading>
          {subtitle ? (
            <p className="dh-ecard__subtitle truncate text-sm text-tertiary">
              {subtitle}
            </p>
          ) : null}
        </div>
        {/* `data-testid` so a test can aim at the status REGION — the one
         * place a raised, non-interactive chip previously swallowed clicks —
         * without reaching for a styling class. */}
        {status ? (
          <div
            className="dh-ecard__status relative z-10 shrink-0 max-md:col-start-3 max-md:row-start-1"
            data-testid="entity-card-status"
          >
            {status}
          </div>
        ) : null}
        {/*
         * DS-16 — an overflow with no footer beside it sits in the HEADER, not
         * in a footer band of its own. A bordered band holding one 44px button
         * added ~56px of empty height to every card in the gallery, which is the
         * "cards should not become unnecessarily tall" defect in its purest
         * form. With a footer present the menu stays down there, next to the
         * content it belongs with.
         */}
        {overflow && !footer ? (
          <div className="dh-ecard__overflow dh-ecard__overflow--header relative z-10 -mt-1 -mr-1 shrink-0 max-md:col-start-3 max-md:row-start-1 max-md:m-0">
            {overflow}
          </div>
        ) : null}
      </div>

      {metric || resolved || meta ? (
        <div className="dh-ecard__body mt-auto flex min-w-0 flex-col gap-2 max-md:col-start-2 max-md:mt-0">
          {metric ? (
            <p className="dh-ecard__metric m-0 flex items-baseline gap-1.5">
              <span className="dh-ecard__metric-value text-display-xs font-semibold text-primary tabular-nums">
                {metric.value}
              </span>
              <span className="dh-ecard__metric-label text-sm text-tertiary">
                {metric.label}
              </span>
            </p>
          ) : null}

          {resolved ? (
            /*
             * M3X-02 — the VALUE leads and the bar follows it.
             *
             * The bar is decorative; the percentage is the value, so progress is
             * never carried by a shape alone. Putting the value first is both
             * the reading order that follows from that and the approved
             * direction's own composition: on a gallery card the figure sits
             * above a bar running the card's full width, which is what makes a
             * grid of records comparable at a glance.
             */
            <div className="dh-ecard__progress flex min-w-0 flex-col gap-1.5">
              <span className="dh-ecard__progress-text text-sm font-medium text-secondary">
                {resolved.text}
              </span>
              <LabelledProgressBar
                label={`${title} progress`}
                value={resolved.percent}
                valueText={resolved.valueText.replace(/^\d+% — /, "")}
                tone={METER_TONE[resolved.status ?? "neutral"]}
              />
            </div>
          ) : null}

          {meta ? (
            <div
              className="dh-ecard__meta min-w-0 text-sm text-tertiary"
              data-testid="entity-card-meta"
            >
              {meta}
            </div>
          ) : null}
        </div>
      ) : null}

      {footer ? (
        <div className="dh-ecard__footer mt-auto flex items-center justify-between gap-3 border-t border-secondary pt-3 max-md:col-span-full max-md:mt-0">
          <div className="dh-ecard__footer-content min-w-0">{footer}</div>
          {overflow ? (
            <div className="dh-ecard__overflow relative z-10 shrink-0">
              {overflow}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

/**
 * The responsive grid entity cards sit in.
 *
 * `auto-fit` with a sensible minimum, so the column count is a consequence of the
 * available width rather than a breakpoint table: roughly three across a wide
 * desktop, two on a tablet, one on a phone, with no width at which a card is
 * absurdly wide or unreadably narrow.
 *
 * A labelled `<ul>`/`<li>`, exactly like `CardCollection` — so a screen reader
 * announces "Projects, list, 12 items" and the owner knows how much is there
 * before reading any of it. `aria-label` on a bare `<div>`, which is what this
 * had, names nothing at all: a generic element has no role for a name to
 * attach to, so the label was silently discarded.
 */
export function EntityCardGrid({
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
        "dh-ecard-grid m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(18rem,1fr))] gap-4 p-0 max-md:grid-cols-1 max-md:gap-3",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={label}
      data-testid={testId}
    >
      {Children.map(children, (child) =>
        child === null || child === undefined || child === false ? null : (
          // Every card family the grid carries fills its track: without a flex
          // factor a card is sized to its own content inside the flex item, so a
          // row comes out with three different widths and a ragged right edge.
          <li className="dh-ecard-grid__item flex min-w-0 [&>*]:min-w-0 [&>*]:flex-1">
            {child}
          </li>
        ),
      )}
    </ul>
  );
}

/** A meter's status, in the shared Untitled bar's tone vocabulary. */
const METER_TONE: Record<
  MeterStatus,
  "neutral" | "positive" | "caution" | "critical"
> = {
  neutral: "neutral",
  info: "neutral",
  success: "positive",
  warning: "caution",
  danger: "critical",
};
