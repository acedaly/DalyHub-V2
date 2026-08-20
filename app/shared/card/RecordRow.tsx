/**
 * The record ROW — a dense, scannable line, not a floating card.
 *
 * Tasks, Meetings, People and the compact halves of Today all need the same
 * thing: many records read quickly down a single column. The shared `Card` is the
 * wrong shape for that job — it is a bordered, elevated object with its own
 * padding, and fifty of them stacked is fifty boxes rather than a list. The audit
 * measured the consequence: a one-line task occupying a 77px row, fifty rows
 * running the full 1,400px content width, with the title at one end and a chip at
 * the other and nothing between them.
 *
 * A row is 56px for one line and 64px for two — a floor, not a fix, so a row
 * whose title wraps grows rather than clipping. It sits inside a `RecordRowList`,
 * which owns the surface and the hairlines between siblings; the row itself
 * paints nothing at rest and grows the shared state layer on hover.
 *
 * Anatomy:
 *
 *     [lead]  Title                          [meta]  [status]  [actions]
 *             Supporting line
 *
 * `lead` is a slot rather than a checkbox prop because what leads a row differs
 * by module — a task leads with a checkbox, a meeting with a time, a person with
 * their initials — and the row should not learn about any of them.
 *
 * The whole row is the destination: `href` wraps the title in a link whose
 * ::after covers the row, so a click anywhere that is not another control opens
 * the record. Interactive children stay above it, which is what keeps the
 * checkbox and the overflow menu clickable inside a fully-linked row.
 */

import type { ReactNode } from "react";

export type RecordRowProps = {
  /** Leading control or marker — a checkbox, a time, an avatar, an icon. */
  readonly lead?: ReactNode;
  /** The row's primary text. */
  readonly title: ReactNode;
  /** Heading level when the row's title is a heading; omit for a plain row. */
  readonly headingLevel?: 2 | 3 | 4;
  /** A second line: the owning Project, an organisation, a location. */
  readonly supporting?: ReactNode;
  /** Trailing metadata — a due time, a duration, a count. */
  readonly meta?: ReactNode;
  /** A status or priority chip. Always carries its own text. */
  readonly status?: ReactNode;
  /** Trailing controls. Kept above the row link so they stay clickable. */
  readonly actions?: ReactNode;
  /** Makes the whole row a link to this destination. */
  readonly href?: string;
  /** Accessible name for the row link; defaults to the title when it is a string. */
  readonly openAriaLabel?: string;
  /**
   * The record is done. Renders the completed treatment — which is a text
   * decoration and a quieter colour TOGETHER, never colour alone.
   */
  readonly completed?: boolean;
  /** Selected within a multi-select collection. */
  readonly selected?: boolean;
  readonly className?: string;
  readonly "data-testid"?: string;
};

export function RecordRow({
  lead,
  title,
  headingLevel,
  supporting,
  meta,
  status,
  actions,
  href,
  openAriaLabel,
  completed = false,
  selected = false,
  className,
  "data-testid": testId,
}: RecordRowProps) {
  const Title = headingLevel ? (`h${headingLevel}` as const) : "span";
  const classes = [
    "dh-row",
    completed ? "dh-row--completed" : null,
    supporting ? "dh-row--two-line" : "dh-row--one-line",
    selected ? "dh-row--selected" : null,
    href ? "dh-row--interactive md-state-layer" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li
      className={classes}
      data-dh-action-context={actions ? "true" : undefined}
      data-testid={testId}
      aria-current={undefined}
    >
      {lead ? <div className="dh-row__lead">{lead}</div> : null}

      <div className="dh-row__body">
        <Title className="dh-row__title">
          {href ? (
            <a
              className="dh-row__open"
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
        </Title>
        {supporting ? (
          <span className="dh-row__supporting">{supporting}</span>
        ) : null}
      </div>

      {meta ? <div className="dh-row__meta">{meta}</div> : null}
      {status ? <div className="dh-row__status">{status}</div> : null}
      {actions ? (
        <div className="dh-row__actions dh-action-reveal">{actions}</div>
      ) : null}
    </li>
  );
}

/**
 * The list a set of rows lives in.
 *
 * It owns the surface and the hairlines, so a row never draws its own border and
 * two adjacent rows can never disagree about the line between them. `inset`
 * drops the surface for a list already inside a card.
 */
export function RecordRowList({
  children,
  inset = false,
  label,
  className,
  "data-testid": testId,
}: {
  readonly children: ReactNode;
  /** No surface of its own — for a list nested inside a DashboardCard. */
  readonly inset?: boolean;
  /** Accessible name for the list. */
  readonly label?: string;
  readonly className?: string;
  readonly "data-testid"?: string;
}) {
  const classes = [
    "dh-row-list",
    inset ? "dh-row-list--inset" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <ul className={classes} aria-label={label} data-testid={testId}>
      {children}
    </ul>
  );
}
