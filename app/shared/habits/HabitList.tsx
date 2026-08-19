/**
 * UX-02 — the Habit LIST, and the columns it owns.
 *
 * The same device DS-04 built for Tasks, for the same reason: the grid template
 * is declared ONCE, on the list, and inherited by the header cells and by every
 * row — so "SCHEDULE & CONTEXT" is a column rather than four elements that
 * happen to be near each other. A row cannot line up with its neighbours if each
 * row decides its own tracks.
 *
 * Two presentations, one component:
 *
 *   - `columns` (the `/habits` collection, Mockup 8): the four-column table —
 *     habit · schedule & context · progress · this week — with a small-caps
 *     header above it.
 *   - the default: the flat hairline-separated list Today's routine band and a
 *     Goal's supporting section draw, unchanged from HABITS-01.
 *
 * The header row is `aria-hidden`. Every cell inside a row already carries its
 * own accessible name ("3× weekly", "1 of 3 this week", "Wednesday 2026-08-19:
 * done"), so a screen reader never needed the header and reading it would
 * announce each fact's category twice — the rule FINAL-UI applied to the Tasks
 * list, applied here for the same reason. It is drawn because the eye does need
 * it: a small-caps header is what makes a dense list read as a table rather than
 * as a wall.
 */

import type { ReactNode } from "react";

export interface HabitListProps {
  /** The accessible name of the list ("Habits", "Archived habits"). */
  readonly ariaLabel: string;
  /**
   * Draw the four-column table presentation and its header.
   *
   * A collection asks for it; Today's compact band and a Goal's supporting
   * section do not, because at a rail's width a four-column grid is four
   * truncations.
   */
  readonly columns?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
  readonly "data-testid"?: string;
}

/** The columns, in the order Mockup 8 draws them. Decoration; see the header note. */
const COLUMNS: readonly string[] = [
  "Habit",
  "Schedule & context",
  "Progress",
  "This week",
];

export function HabitList({
  ariaLabel,
  columns = false,
  className,
  children,
  "data-testid": testId,
}: HabitListProps) {
  return (
    <div
      className={[
        "dh-habits-list",
        columns ? "dh-habits-list--columns" : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/*
       * The stylesheet makes this element a CONTAINER, so the row's breakpoints
       * are the LIST's width rather than the window's — the correctness
       * requirement DS-04's task list documents. This component is drawn both
       * full-width and inside a 21rem rail, and a window-width media query would
       * happily give the rail the seven-column desktop grid.
       */}
      {columns ? (
        <div className="dh-habits-list__head" aria-hidden="true">
          {COLUMNS.map((column) => (
            <span className="dh-habits-list__column" key={column}>
              {column}
            </span>
          ))}
        </div>
      ) : null}
      <ul className="dh-habit-list" aria-label={ariaLabel} data-testid={testId}>
        {children}
      </ul>
    </div>
  );
}
