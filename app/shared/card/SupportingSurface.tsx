/**
 * M3X-02 — the SUPPORTING EXPRESSIVE SURFACE: hierarchy Level 2.
 *
 * PR #144 gave a page one dominant surface (`ExpressiveSummary`) and made
 * everything else identical. That was the right first move and the wrong
 * finishing position: below the hero, a Project's identity, the day's current
 * focus and the next thing due all rendered as the same untinted panel as the
 * page's least important list, so a page had exactly two levels — *the hero*,
 * and *everything else*.
 *
 * DalyHub's hierarchy is three levels (DESIGN_SYSTEM.md → the hierarchy model):
 *
 *   Level 1  one dominant expressive surface   `ExpressiveSummary`
 *   Level 2  a few supporting expressive ones  **this**
 *   Level 3  the quiet working interface       panels, rows, forms, filters
 *
 * A Level 2 surface is *visibly* warmer or more shaped than a panel and
 * *visibly* subordinate to the hero: it takes card padding rather than hero
 * padding, `--app-shape-card` rather than `--app-shape-hero`, and a tint at half
 * the hero's strength (or none at all, for the `quiet` tone). It never carries a
 * progress ring, never carries a stat row, and never grows past a short block —
 * the moment it needs those it is competing with the hero, and one of the two is
 * wrong.
 *
 * Anatomy:
 *
 *     ┌─────────────────────────────────┐
 *     │ EYEBROW                         │
 *     │ ⬤  Title                 metric │
 *     │    supporting                   │
 *     │ ▓▓▓▓▓▓▓░░░░░░  60%              │
 *     │ meta · meta                     │
 *     │ [ action ]                      │
 *     └─────────────────────────────────┘
 *
 * ── The rules ────────────────────────────────────────────────────────────────
 *
 *   - **It states facts it was given.** Like the hero, it derives nothing and
 *     invents nothing; a caller passes only figures the page already had.
 *   - **A page has a FEW of these, not a gallery of them.** Two or three is a
 *     hierarchy; eight is a rainbow dashboard.
 *   - **Colour is never the only signal.** The tone changes the surface, never
 *     the meaning: the eyebrow, the title and the supporting line say it.
 *   - **It is a `section` with a real heading**, so the page outline survives.
 *   - **The whole surface is the destination** when `href` is given — one link,
 *     covering the surface with the title link's `::after`, exactly as
 *     `EntityCard` and `RecordRow` do it, so nothing here is a `div onClick`.
 */

import type { ReactNode } from "react";
import { Link } from "react-router";

import { normaliseProgress, type CardProgress } from "./types";

/** How warm the surface is. `quiet` is Level 2 by SHAPE and scale alone. */
export type SupportingSurfaceTone = "expressive" | "identity" | "quiet";

export type SupportingSurfaceProps = {
  /** A short label above the title — what KIND of thing this is. */
  readonly eyebrow?: ReactNode;
  /** The title, and the surface's accessible name. */
  readonly title: string;
  /** Heading level, so the page outline stays valid. Defaults to 3. */
  readonly headingLevel?: 2 | 3 | 4;
  /** One supporting line under the title. */
  readonly supporting?: ReactNode;
  /** The identity mark — a rendered icon in its container. Decorative. */
  readonly icon?: ReactNode;
  /** The one figure this surface is really about. */
  readonly metric?: { readonly value: string; readonly label?: string };
  /** Bounded progress. Rendered with its percentage beside it, never alone. */
  readonly progress?: CardProgress;
  /** Supporting facts, as one wrapping run. */
  readonly meta?: ReactNode;
  /** One action. A second action means this is a panel, not a supporting surface. */
  readonly action?: ReactNode;
  /** Whole-surface destination. */
  readonly href?: string;
  readonly openAriaLabel?: string;
  readonly tone?: SupportingSurfaceTone;
  readonly className?: string;
  readonly "data-testid"?: string;
};

export function SupportingSurface({
  eyebrow,
  title,
  headingLevel = 3,
  supporting,
  icon,
  metric,
  progress,
  meta,
  action,
  href,
  openAriaLabel,
  tone = "expressive",
  className,
  "data-testid": testId,
}: SupportingSurfaceProps) {
  const Heading = `h${headingLevel}` as const;
  const resolved = progress ? normaliseProgress(progress) : null;
  const classes = [
    "dh-scard",
    `dh-scard--${tone}`,
    href ? "dh-scard--interactive" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={classes} aria-label={title} data-testid={testId}>
      <div className="dh-scard__head">
        {icon ? (
          <span className="dh-scard__icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <div className="dh-scard__identity">
          {eyebrow ? <p className="dh-scard__eyebrow">{eyebrow}</p> : null}
          <Heading className="dh-scard__title">
            {href ? (
              <Link
                className="dh-scard__open"
                to={href}
                aria-label={openAriaLabel ?? title}
              >
                {title}
              </Link>
            ) : (
              title
            )}
          </Heading>
          {supporting ? (
            <p className="dh-scard__supporting">{supporting}</p>
          ) : null}
        </div>
        {metric ? (
          <p className="dh-scard__metric">
            <span className="dh-scard__metric-value">{metric.value}</span>
            {metric.label ? (
              <span className="dh-scard__metric-label">{metric.label}</span>
            ) : null}
          </p>
        ) : null}
      </div>

      {resolved ? (
        <div className="dh-scard__progress">
          {/* The bar is decorative; the percentage beside it is the value, so
           * progress is never carried by a shape alone. */}
          <span
            className="dh-scard__progress-track"
            role="progressbar"
            aria-valuenow={resolved.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={resolved.valueText}
            aria-label={`${title} progress`}
          >
            <span
              className="dh-scard__progress-fill"
              style={{ inlineSize: `${resolved.percent}%` }}
            />
          </span>
          <span className="dh-scard__progress-text">{resolved.text}</span>
        </div>
      ) : null}

      {meta ? <div className="dh-scard__meta">{meta}</div> : null}
      {/* Above the whole-surface link, so a button inside a linked surface is
       * still pressable — the same layering `EntityCard`'s footer uses. */}
      {action ? <div className="dh-scard__action">{action}</div> : null}
    </section>
  );
}
