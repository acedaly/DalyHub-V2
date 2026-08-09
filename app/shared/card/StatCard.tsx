/**
 * The STAT CARD — one figure, on the page canvas, in a row of its peers.
 *
 * DalyHub's answer to "how is today going?" used to be a single tinted hero
 * stating three counts. This is the other answer, and the one the approved
 * direction asks for: a short row of quiet cards, each holding exactly one
 * figure, sitting directly on the canvas above the working surface.
 *
 * Anatomy:
 *
 *     ┌─────────────────────────┐
 *     │ Tasks due today      ◯  │  label first, then the figure
 *     │ 6                    68%│  an optional ring at the trailing edge
 *     │ 2 overdue               │  ONE supporting line
 *     └─────────────────────────┘
 *
 * ── Why this is not `MetricTile` ─────────────────────────────────────────────
 *
 * `MetricTile` is deliberately NOT a card: it has no surface, no border and no
 * shadow, because it exists to sit *inside* one, separated from its neighbours
 * by a hairline the row draws. Putting outlined boxes inside an outlined card is
 * the failure it was written to prevent, and that rule is unchanged.
 *
 * A stat card is the opposite arrangement — a card on the CANVAS, with nothing
 * around it. The page is the container. It also reads label-first, because a row
 * of four is scanned by *what each one counts* before any of the numbers matter,
 * and it can carry a ring, which a tile never could.
 *
 * ── The rules ────────────────────────────────────────────────────────────────
 *
 *   - **It states, it does not compute.** `value` is a string; a caller with a
 *     lower bound says `"50+"`, and a caller with nothing renders no card at all.
 *   - **A zero does not paint.** That decision belongs to the caller, which is
 *     the only thing that knows whether zero is news.
 *   - **Three or four per row.** Five figures is a dashboard, and a dashboard is
 *     what this replaced.
 *   - **Tone is never the only signal.** `attention` colours the figure; the
 *     label and the supporting line say it in words regardless.
 *   - **The whole card is the destination** when `href` is given — one ordinary
 *     link, so it is right-clickable and keyboard-operable like any other.
 */

import type { ReactNode } from "react";
import { Link } from "react-router";

/** How loud the figure is. `attention` is spent on slipped work alone. */
export type StatCardTone = "default" | "attention";

export type StatCardProps = {
  /** What the figure counts. Read before the number, so it comes first. */
  readonly label: string;
  /** The figure, as text — the component renders exactly what it is handed. */
  readonly value: string;
  /** One supporting line. A second one makes this a card in the other sense. */
  readonly supporting?: ReactNode;
  readonly tone?: StatCardTone;
  /** A small proportion ring at the trailing edge. Information, not decoration. */
  readonly ring?: ReactNode;
  /** Whole-card destination — the canonical view this figure lives in. */
  readonly href?: string;
  readonly className?: string;
  readonly "data-testid"?: string;
};

export function StatCard({
  label,
  value,
  supporting,
  tone = "default",
  ring,
  href,
  className,
  "data-testid": testId,
}: StatCardProps) {
  const body = (
    <>
      <span className="dh-stat__label">{label}</span>
      <span className="dh-stat__figure">
        <span className="dh-stat__value" data-tone={tone}>
          {value}
        </span>
        {ring ? <span className="dh-stat__ring">{ring}</span> : null}
      </span>
      {supporting ? (
        <span className="dh-stat__supporting" data-tone={tone}>
          {supporting}
        </span>
      ) : null}
    </>
  );

  const classes = ["dh-stat", href ? "dh-stat--interactive" : null, className]
    .filter(Boolean)
    .join(" ");

  // A link when there is somewhere to go, and a plain region when there is not
  // — never a `div` with a click handler.
  return href ? (
    <Link className={classes} to={href} data-testid={testId}>
      {body}
    </Link>
  ) : (
    <div className={classes} data-testid={testId}>
      {body}
    </div>
  );
}

/**
 * The row a set of stat cards sits in.
 *
 * `auto-fit` rather than a fixed four columns: three figures should fill the
 * width and four should not be forced onto a phone. A labelled list, so a screen
 * reader announces how many figures there are before reading any of them.
 */
export function StatCardRow({
  children,
  label,
  className,
  "data-testid": testId,
}: {
  readonly children: ReactNode;
  readonly label: string;
  readonly className?: string;
  readonly "data-testid"?: string;
}) {
  return (
    <ul
      className={["dh-stat-row", className].filter(Boolean).join(" ")}
      aria-label={label}
      data-testid={testId}
    >
      {children}
    </ul>
  );
}

/** One cell of the row. Kept explicit so a caller can render nothing at all. */
export function StatCardItem({ children }: { readonly children: ReactNode }) {
  return <li className="dh-stat-row__item">{children}</li>;
}
