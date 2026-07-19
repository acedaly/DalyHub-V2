/**
 * DS-05 — a day-group heading. Rendered as a real, sticky `h2`/`h3`/`h4` that stays
 * in the accessibility tree (a correct document outline and a labelled day group),
 * carrying the full readable date. The heading is the single naming source — there
 * is no `aria-hidden` heading and no separately-labelled separator, so the date is
 * announced once, not duplicated.
 */

import type { ReactNode } from "react";

export interface ActivityDayHeadingProps {
  readonly label: string;
  /** Heading level for a correct document outline (default 3). */
  readonly level?: 2 | 3 | 4;
  readonly id?: string;
}

export function ActivityDayHeading({
  label,
  level = 3,
  id,
}: ActivityDayHeadingProps): ReactNode {
  const Heading = `h${level}` as const;
  return (
    <div className="dh-activity-day">
      <Heading id={id} className="dh-activity-day__label">
        {label}
      </Heading>
    </div>
  );
}
