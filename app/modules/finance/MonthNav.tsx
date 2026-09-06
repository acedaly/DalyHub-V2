/**
 * V2.12 FIN-02 — the ONE month control.
 *
 * Previous, this month, next, with the period in the URL. Every Finance surface
 * that has a period uses this one, so the Finance home, the transactions list
 * and the budget screen cannot end up moving through time in three different
 * ways.
 *
 * The period is a `?month=YYYY-MM` query parameter, which is an id-shaped value:
 * shareable, bookmarkable and safe in a browser history. No Finance URL ever
 * carries a payee, a description or an amount.
 *
 * They are LINKS, not buttons, because they navigate — so a middle-click opens
 * September in a new tab, and the back button means what it says.
 */

import { Link } from "react-router";

import type { FinanceMonthContext } from "./finance-view";

export interface MonthNavProps extends FinanceMonthContext {
  /** The route the links point at, without a query string. */
  readonly basePath: string;
  /** Extra query parameters to carry across a month change. */
  readonly extraParams?: Readonly<Record<string, string>>;
}

export function MonthNav({
  month,
  monthLabel,
  previousMonth,
  nextMonth,
  basePath,
  extraParams = {},
}: MonthNavProps) {
  const href = (target: string) => {
    const params = new URLSearchParams({ ...extraParams, month: target });
    return `${basePath}?${params.toString()}`;
  };

  return (
    <nav className="dh-finance-month-nav" aria-label="Choose a month">
      <Link to={href(previousMonth)} rel="prev" data-testid="month-previous">
        {/* The month is NAMED, so "previous" is never the only thing a screen
            reader can say about where the link goes. */}
        <span aria-hidden="true">&larr;</span>
        <span className="dh-visually-hidden">Previous month</span>
      </Link>
      <p className="dh-finance-month-nav__label" data-testid="month-label">
        {monthLabel}
      </p>
      <Link to={href(nextMonth)} rel="next" data-testid="month-next">
        <span aria-hidden="true">&rarr;</span>
        <span className="dh-visually-hidden">Next month</span>
      </Link>
      <span className="dh-visually-hidden" data-testid="month-value">
        {month}
      </span>
    </nav>
  );
}
