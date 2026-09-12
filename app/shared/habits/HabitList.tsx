/**
 * The Habit LIST — a flat, hairline-separated band of {@link HabitRow}s.
 *
 * Today's routine section, a Goal's supporting section and an Area's draw this.
 *
 * ── UNTITLED-09 removed the `columns` presentation ──────────────────────────
 *
 * It used to carry a second mode that declared a seven-track CSS grid on this
 * element, inherited by a decorative header row and by every `HabitRow
 * layout="columns"` beneath it — DS-04's device, applied to the `/habits`
 * collection. The collection is now a real `<table>` in Untitled's
 * `application/table` grammar, so the nouns are `<th scope="col">` stated once
 * and the alignment is the table's rather than a template two files apart.
 *
 * What remains is this: a list, of rows, with an accessible name. It is the
 * right object for the surfaces that still use it, none of which has room for
 * six columns — a rail at 21rem would draw six truncations.
 */

import type { ReactNode } from "react";

export interface HabitListProps {
  /** The accessible name of the list ("Habits due today"). */
  readonly ariaLabel: string;
  readonly className?: string;
  readonly children: ReactNode;
  readonly "data-testid"?: string;
}

export function HabitList({
  ariaLabel,
  className,
  children,
  "data-testid": testId,
}: HabitListProps) {
  return (
    <ul
      className={["dh-habit-list", className].filter(Boolean).join(" ")}
      aria-label={ariaLabel}
      data-testid={testId}
    >
      {children}
    </ul>
  );
}
