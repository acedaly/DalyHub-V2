/**
 * DS-05 — a day-group heading. Rendered as a real, sticky heading that also acts
 * as an accessible separator between day groups, carrying the full readable date.
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
    <div className="dh-activity-day" role="separator" aria-label={label}>
      <Heading id={id} className="dh-activity-day__label" aria-hidden="true">
        {label}
      </Heading>
    </div>
  );
}
