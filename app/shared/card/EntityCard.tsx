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
 */

import type { ReactNode } from "react";

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

  return (
    <article className={classes} data-testid={testId}>
      <div className="dh-ecard__header">
        {icon ? (
          <span className="dh-ecard__icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <div className="dh-ecard__titles">
          <Heading className="dh-ecard__title">
            {href ? (
              <a
                className="dh-ecard__open"
                href={href}
                aria-label={openAriaLabel ?? title}
              >
                {title}
              </a>
            ) : (
              title
            )}
          </Heading>
          {subtitle ? <p className="dh-ecard__subtitle">{subtitle}</p> : null}
        </div>
        {status ? <div className="dh-ecard__status">{status}</div> : null}
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
            <div className="dh-ecard__progress">
              {/* The bar is decorative; the percentage beside it is the value,
               * so progress is never carried by a shape alone. */}
              <span
                className="dh-ecard__progress-track"
                role="progressbar"
                aria-valuenow={resolved.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuetext={resolved.text}
                aria-label={`${title} progress`}
              >
                <span
                  className="dh-ecard__progress-fill"
                  style={{ inlineSize: `${resolved.percent}%` }}
                />
              </span>
              <span className="dh-ecard__progress-text">{resolved.text}</span>
            </div>
          ) : null}

          {meta ? <div className="dh-ecard__meta">{meta}</div> : null}
        </div>
      ) : null}

      {footer || overflow ? (
        <div className="dh-ecard__footer">
          {footer ? (
            <div className="dh-ecard__footer-content">{footer}</div>
          ) : null}
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
    <div
      className={["dh-ecard-grid", className].filter(Boolean).join(" ")}
      aria-label={label}
      data-testid={testId}
    >
      {children}
    </div>
  );
}
