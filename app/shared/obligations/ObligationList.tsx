/**
 * V2.10 LIFE-02 / UNTITLED-16 — the Obligation list, and the bands it prints.
 *
 * Two components, because the two things a surface needs are different:
 *
 *   `ObligationList`   one `<ul>` with an accessible name. Every surface that
 *                      draws obligations uses it, so the row has exactly one
 *                      parent.
 *   `ObligationBands`  the banded collection — Overdue, This week, This month,
 *                      Later, Done — each in its own bounded card with its own
 *                      heading and the count of the WHOLE band behind it, not of
 *                      the loaded page (D10).
 *
 * A band with nothing in it is not drawn. An empty "Overdue (0)" heading is a
 * fact nobody asked for, and five of them is a page that looks full of nothing.
 *
 * ── UNTITLED-16: the band is Untitled's card, the list is its divided body ──
 *
 * A band was an `h3` in a bespoke uppercase letter-spaced rule with the count
 * welded inside its own text — so its accessible name was "Overdue (24)", a
 * parenthesised digit read as part of a heading — above a bare `<ul>` of
 * free-floating bordered rows. It is now `TableCard.Root` / `TableCard.Header`
 * from the vendored `application/table`, which is the SAME anatomy the Meetings
 * collection uses for a day, for the same reason: a band and a day are both "a
 * bounded set of rows under a name". The count is the header's own badge, so it
 * says what it counts ("24 overdue") instead of being a bare number inside a
 * heading, and the rows are a divided body rather than twenty separate boxes.
 */

import type { ReactNode } from "react";

import { TableCard } from "~/shared/ui/untitled/application/table/table";

import type { ObligationBandGroup } from "./obligation-view";

export interface ObligationListProps {
  /** The accessible name ("Obligations", "Overdue obligations"). */
  readonly ariaLabel: string;
  /**
   * Draw the list's own bounded surface.
   *
   * Off inside `ObligationBands`, where the band's card already supplies one —
   * a ring inside a ring is the card-inside-a-card the migration guide names. On
   * for a list that stands alone, such as the Asset record's "completed and set
   * aside" disclosure, whose rows would otherwise be padded against nothing.
   */
  readonly bounded?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
  readonly "data-testid"?: string;
}

export function ObligationList({
  ariaLabel,
  bounded = false,
  className,
  children,
  "data-testid": testId,
}: ObligationListProps) {
  return (
    <ul
      className={[
        "dh-obligation-list m-0 flex list-none flex-col divide-y divide-secondary p-0",
        bounded
          ? "overflow-hidden rounded-lg bg-primary shadow-xs ring-1 ring-secondary"
          : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={ariaLabel}
      data-testid={testId}
    >
      {children}
    </ul>
  );
}

export interface ObligationBandsProps {
  readonly groups: readonly ObligationBandGroup[];
  /** Renders one row. The band supplies the obligation; the surface the actions. */
  readonly renderRow: (
    obligation: ObligationBandGroup["items"][number],
  ) => ReactNode;
  /*
   * UNTITLED-16 — there is no `headingLevel` any more.
   *
   * Untitled's `TableCard.Header` renders an `h2`, and `h2` is the right rank on
   * both surfaces that draw bands: a collection's own title is the `h1`, and a
   * record tab introduces no heading of its own, so a section inside one is also
   * an `h2`. A prop offering a rank the component cannot honour would be a
   * promise the markup breaks.
   */
}

export function ObligationBands({ groups, renderRow }: ObligationBandsProps) {
  return (
    <div className="flex flex-col gap-5">
      {groups
        .filter((group) => group.items.length > 0)
        .map((group) => (
          <TableCard.Root
            key={group.band}
            size="sm"
            className="dh-obligation-band"
            data-untitled-source="application/table:table-card"
          >
            {/*
             * The count is the header's BADGE, naming what it counts.
             *
             * It is of the whole band across the collection, which on any page
             * but the last is larger than the rows below it. That is the honest
             * number: "24 overdue" under six visible rows tells the owner there
             * is more, where "6" would tell them there is not. Outside the
             * heading rather than inside it, because a heading whose accessible
             * name ends in a parenthesised digit is a heading a screen-reader
             * user has to decode — the same defect the Meetings day card fixed.
             */}
            <TableCard.Header
              title={group.label}
              badge={`${group.total} ${group.total === 1 ? "obligation" : "obligations"}`}
            />
            <ObligationList ariaLabel={`${group.label} obligations`}>
              {group.items.map(renderRow)}
            </ObligationList>
          </TableCard.Root>
        ))}
    </div>
  );
}
