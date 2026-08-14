/**
 * DS-04 — the Task LIST and the Task GROUP.
 *
 * Two very small components that exist for one reason each:
 *
 *   - **`TaskList`** owns the column grid. The template is declared ONCE, on the
 *     list, and inherited by the header cells and by every row, so a date column
 *     is a column rather than four elements that happen to be near each other.
 *     It also carries the list semantics — a real `<ul>` with an accessible name
 *     — which is what a screen reader needs to say "list, 24 items" instead of
 *     reading a wall of divs.
 *   - **`TaskGroup`** draws a server-authoritative bucket. The heading is a
 *     word, a hairline and a count, and NOT a card: wrapping each group in a
 *     bounded surface is most of what made the old screen read as a stack of
 *     panels rather than as one list (DS-04 §24).
 *
 * The column HEADER is deliberately decorative. Every cell inside a row already
 * carries its own accessible name — "Due date: 12 Aug", "Project or Area:
 * Kitchen fit-out" — so a screen reader that also announced a header row would
 * hear each field named twice. It is `aria-hidden`, and it is the sighted
 * reader's key to what the columns mean.
 */

import type { ReactNode } from "react";

export interface TaskListProps {
  /** The accessible name of the list ("Tasks", "Overdue tasks"). */
  readonly ariaLabel: string;
  /** Draw the column header. Off inside a group, where the list above has it. */
  readonly columnHeader?: boolean;
  readonly children: ReactNode;
  readonly className?: string;
}

/** The column header's labels, in the order the grid lays them out. */
/*
 * "Date" rather than "Due", because the column carries the due date OR, for a
 * task that has none, the planned one — see `TaskRow`. A header that said "Due"
 * over a planned date would be the one place in the product that blurs the
 * distinction ADR-043 exists to keep.
 */
const COLUMNS = ["Task", "Project", "Date", "Priority", "Status"] as const;

/**
 * The column header, on its own.
 *
 * A GROUPED view needs it once, above the first bucket, rather than once per
 * bucket — five copies of `Task · Project · Due · Priority · Status` down a page
 * turns one list into five tables. It carries the same `data-dh-density` and the
 * same grid template as the lists beneath it, which is what keeps its labels on
 * their columns.
 */
export function TaskListColumns() {
  return (
    <div className="dh-tasklist" data-dh-density="compact">
      <div className="dh-tasklist__columns" aria-hidden="true">
        {COLUMNS.map((column) => (
          <span
            key={column}
            className={`dh-tasklist__column dh-tasklist__column--${column.toLowerCase()}`}
          >
            {column}
          </span>
        ))}
      </div>
    </div>
  );
}

export function TaskList({
  ariaLabel,
  columnHeader = false,
  children,
  className,
}: TaskListProps) {
  return (
    <div
      className={["dh-tasklist", className].filter(Boolean).join(" ")}
      /*
       * DS-01's `compact` preset is DEFINED by this case — "a desktop
       * productivity surface: a dense task list … the density the reference
       * designs are drawn at". Declaring it on the region rather than on the
       * document is the whole point of doing density with custom properties: a
       * dense list does not make the Settings screen dense. The coarse-pointer
       * floor in `tokens.css` hands every touch target back on a phone,
       * unconditionally, so this costs nothing on a finger.
       */
      data-dh-density="compact"
    >
      {columnHeader ? (
        <div className="dh-tasklist__columns" aria-hidden="true">
          {COLUMNS.map((column) => (
            <span
              key={column}
              className={`dh-tasklist__column dh-tasklist__column--${column.toLowerCase()}`}
            >
              {column}
            </span>
          ))}
        </div>
      ) : null}
      <ul className="dh-tasklist__rows" aria-label={ariaLabel}>
        {children}
      </ul>
    </div>
  );
}

export interface TaskGroupProps {
  /** The bucket's word — "Overdue", "Today", "No date". */
  readonly title: string;
  /** The SERVER's count for the whole bucket, not the slice that loaded. */
  readonly count: number;
  /** The document outline level for the heading. */
  readonly headingLevel?: 2 | 3;
  /** "View all N", when the bucket holds more than the slice. */
  readonly moreHref?: string | null;
  readonly children: ReactNode;
}

export function TaskGroup({
  title,
  count,
  headingLevel = 2,
  moreHref = null,
  children,
}: TaskGroupProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    /*
     * A NAMED region, so the bucket is a navigable landmark.
     *
     * Named by the bucket alone: the heading inside already carries the
     * authoritative count, and repeating it in the landmark name would make a
     * screen reader announce the number twice.
     */
    <section
      className="dh-taskgroup"
      aria-label={title}
      data-testid="task-group"
    >
      <div className="dh-taskgroup__header">
        {/*
         * The count is INSIDE the heading, and it is a FIGURE rather than a
         * badge: "OVERDUE 15", not "Overdue (15)". Brackets around a number
         * read as a debugger printing a length, and a coloured pill here was
         * one of the loudest objects on the pre-DS-04 screen — on a page whose
         * job is to be calm.
         *
         * Inside, because a heading a screen reader announces as "Overdue"
         * while the eye reads "Overdue 15" is two different headings. The
         * explicit space matters for the same reason: the gap to the figure is
         * CSS margin, and a screen reader cannot see margin, so without it the
         * accessible name is "Overdue15".
         */}
        <Heading className="dh-taskgroup__title">
          {title} <span className="dh-taskgroup__count">{count}</span>
        </Heading>
        {moreHref !== null ? (
          <a className="dh-taskgroup__more" href={moreHref}>
            View all {count}
          </a>
        ) : null}
      </div>
      {children}
    </section>
  );
}
