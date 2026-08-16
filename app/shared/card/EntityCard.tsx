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
  const classes = [
    "dh-ecard",
    href ? "dh-ecard--interactive" : null,
    muted ? "dh-ecard--muted" : null,
    selected ? "dh-ecard--selected" : null,
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
      <div className="dh-ecard__header">
        {icon ? (
          <span className="dh-ecard__icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <div className="dh-ecard__titles">
          <Heading className="dh-ecard__title">
            {href ? (
              <Link
                className="dh-ecard__open"
                to={href}
                aria-label={openAriaLabel ?? title}
              >
                {title}
              </Link>
            ) : (
              title
            )}
          </Heading>
          {subtitle ? <p className="dh-ecard__subtitle">{subtitle}</p> : null}
        </div>
        {/* `data-testid` so a test can aim at the status REGION — the one
         * place a raised, non-interactive chip previously swallowed clicks —
         * without reaching for a styling class. */}
        {status ? (
          <div className="dh-ecard__status" data-testid="entity-card-status">
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
          <div className="dh-ecard__overflow dh-ecard__overflow--header">
            {overflow}
          </div>
        ) : null}
      </div>

      {metric || resolved || meta ? (
        <div className="dh-ecard__body">
          {metric ? (
            <p className="dh-ecard__metric">
              <span className="dh-ecard__metric-value">{metric.value}</span>
              <span className="dh-ecard__metric-label">{metric.label}</span>
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
            <div className="dh-ecard__progress">
              <span className="dh-ecard__progress-text">{resolved.text}</span>
              <span
                className="dh-ecard__progress-track"
                role="progressbar"
                aria-valuenow={resolved.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuetext={resolved.valueText}
                aria-label={`${title} progress`}
              >
                <span
                  className="dh-ecard__progress-fill"
                  style={{ inlineSize: `${resolved.percent}%` }}
                />
              </span>
            </div>
          ) : null}

          {meta ? (
            <div className="dh-ecard__meta" data-testid="entity-card-meta">
              {meta}
            </div>
          ) : null}
        </div>
      ) : null}

      {footer ? (
        <div className="dh-ecard__footer">
          <div className="dh-ecard__footer-content">{footer}</div>
          {overflow ? (
            <div className="dh-ecard__overflow">{overflow}</div>
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
      className={["dh-ecard-grid", className].filter(Boolean).join(" ")}
      aria-label={label}
      data-testid={testId}
    >
      {Children.map(children, (child) =>
        child === null || child === undefined || child === false ? null : (
          <li className="dh-ecard-grid__item">{child}</li>
        ),
      )}
    </ul>
  );
}
