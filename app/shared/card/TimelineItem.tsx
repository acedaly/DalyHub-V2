/**
 * The timeline ITEM — something that happened, or is about to, at a time.
 *
 * Today's upcoming agenda, Meetings, Diary and the activity feed are all the same
 * shape: a time on the left, a connected spine, and what happened on the right.
 * The audit found Meetings and Diary rendering as undifferentiated generic cards
 * with no time column at all, which is what makes an agenda unreadable — you
 * cannot scan a day if the times are buried inside the rows.
 *
 * Anatomy:
 *
 *     10:00 am  ●  Team catch-up
 *     11:00 am  │  60 min · Microsoft Teams
 *               │
 *      1:00 pm  ●  Project update
 *
 * The time column is a fixed measure so every marker lines up vertically — a
 * spine that wanders because one row says "10:00 am" and the next says "9:00 am"
 * is worse than no spine. `time` and `endTime` are separate because the reference
 * shows both, and because a duration you have to compute is a duration you
 * misread.
 *
 * The connector is drawn by CSS on the item, not by a wrapper element, and it is
 * `aria-hidden`: it is a visual grouping cue, and the list semantics already say
 * these belong together.
 */

import type { ReactNode } from "react";

/** The marker's tone. Never the only signal — the row always says it in text. */
export type TimelineTone =
  "neutral" | "accent" | "success" | "warning" | "danger" | "muted";

export type TimelineItemProps = {
  /** The primary time or date, e.g. "10:00 am" or "Tue 12". */
  readonly time: string;
  /** The end time, shown quieter beneath. */
  readonly endTime?: string;
  /** A glyph inside the marker, for a kind of event. Decorative. */
  readonly icon?: ReactNode;
  readonly tone?: TimelineTone;
  readonly title: ReactNode;
  /** Duration, method, location, participants — one wrapping line. */
  readonly meta?: ReactNode;
  /** A status chip. Carries its own text. */
  readonly status?: ReactNode;
  /** Makes the whole item a link. */
  readonly href?: string;
  readonly openAriaLabel?: string;
  /** Past or cancelled — quieter, and stated in text by the caller too. */
  readonly muted?: boolean;
  readonly className?: string;
  readonly "data-testid"?: string;
};

export function TimelineItem({
  time,
  endTime,
  icon,
  tone = "neutral",
  title,
  meta,
  status,
  href,
  openAriaLabel,
  muted = false,
  className,
  "data-testid": testId,
}: TimelineItemProps) {
  const classes = [
    "dh-timeline__item",
    `dh-timeline__item--${tone}`,
    muted ? "dh-timeline__item--muted" : null,
    href ? "dh-timeline__item--interactive md-state-layer" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li className={classes} data-testid={testId}>
      <div className="dh-timeline__time">
        <span className="dh-timeline__time-start">{time}</span>
        {endTime ? (
          <span className="dh-timeline__time-end">{endTime}</span>
        ) : null}
      </div>

      {/* The marker and the line beneath it are one decorative column. */}
      <div className="dh-timeline__spine" aria-hidden="true">
        <span className="dh-timeline__marker">{icon}</span>
      </div>

      <div className="dh-timeline__body">
        <span className="dh-timeline__title">
          {href ? (
            <a
              className="dh-timeline__open"
              href={href}
              aria-label={
                openAriaLabel ?? (typeof title === "string" ? title : undefined)
              }
            >
              {title}
            </a>
          ) : (
            title
          )}
        </span>
        {meta ? <span className="dh-timeline__meta">{meta}</span> : null}
      </div>

      {status ? <div className="dh-timeline__status">{status}</div> : null}
    </li>
  );
}

/** The list timeline items live in; it owns nothing but the semantics and rhythm. */
export function Timeline({
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
      className={["dh-timeline", className].filter(Boolean).join(" ")}
      aria-label={label}
      data-testid={testId}
    >
      {children}
    </ul>
  );
}
