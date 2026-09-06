/**
 * V2.10 LIFE-02 — the Obligation list, and the bands it prints.
 *
 * Two components, because the two things a surface needs are different:
 *
 *   `ObligationList`   one `<ul>` with an accessible name. Every surface that
 *                      draws obligations uses it, so the row's CSS has exactly
 *                      one parent to match against.
 *   `ObligationBands`  the banded collection — Overdue, This week, This month,
 *                      Later, Done — each with its own heading and the count of
 *                      the WHOLE band behind it, not of the loaded page (D10).
 *
 * A band with nothing in it is not drawn. An empty "Overdue (0)" heading is a
 * fact nobody asked for, and five of them is a page that looks full of nothing.
 */

import type { ReactNode } from "react";

import type { ObligationBandGroup } from "./obligation-view";

export interface ObligationListProps {
  /** The accessible name ("Obligations", "Overdue obligations"). */
  readonly ariaLabel: string;
  readonly className?: string;
  readonly children: ReactNode;
  readonly "data-testid"?: string;
}

export function ObligationList({
  ariaLabel,
  className,
  children,
  "data-testid": testId,
}: ObligationListProps) {
  return (
    <ul
      className={["dh-obligation-list", className].filter(Boolean).join(" ")}
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
  readonly headingLevel?: 2 | 3;
}

export function ObligationBands({
  groups,
  renderRow,
  headingLevel = 3,
}: ObligationBandsProps) {
  const Heading = `h${headingLevel}` as "h2" | "h3";
  return (
    <>
      {groups
        .filter((group) => group.items.length > 0)
        .map((group) => (
          <section key={group.band} className="dh-obligation-band">
            <Heading className="dh-obligation-band__heading">
              {group.label}{" "}
              {/*
               * The count is of the whole band across the collection, which on
               * any page but the last is larger than the rows below it. That is
               * the honest number: "Overdue 24" under six visible rows tells the
               * owner there is more, where "Overdue 6" would tell them there is
               * not.
               */}
              <span className="dh-obligation-band__count">({group.total})</span>
            </Heading>
            <ObligationList ariaLabel={`${group.label} obligations`}>
              {group.items.map(renderRow)}
            </ObligationList>
          </section>
        ))}
    </>
  );
}
