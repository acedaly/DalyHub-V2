/**
 * V2.12 FIN-02 / UNTITLED-16 — the ONE month control.
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
 *
 * ## UNTITLED-16 — the steps were 20 × 20
 *
 * They were bare `<a>` elements holding an arrow character, and `finance.css`
 * gave the nav a flex row and gave them nothing: their box was the glyph. That
 * is the third instance of the same defect this migration has measured (the
 * Diary week strip's steps, the collection search reveal), and the fix is the
 * same — the shared `iconButtonClassName`, which carries Untitled's utility
 * button geometry and DalyHub's 44px coarse-pointer floor. The arrows are real
 * `@untitledui/icons` chevrons rather than `←`/`→` characters, so they take the
 * icon size and stroke every other control in the product uses.
 */

import { ChevronLeft, ChevronRight } from "@untitledui/icons";
import { Link } from "react-router";

import { iconButtonClassName } from "~/shared/ui";

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
    <nav
      className="dh-finance-month-nav flex items-center gap-1"
      aria-label="Choose a month"
    >
      <Link
        to={href(previousMonth)}
        rel="prev"
        className={iconButtonClassName({ variant: "subtle" })}
        data-testid="month-previous"
      >
        {/* The month is NAMED, so "previous" is never the only thing a screen
            reader can say about where the link goes. */}
        <ChevronLeft className="size-5" aria-hidden="true" />
        <span className="sr-only">Previous month</span>
      </Link>
      <p
        className="min-w-32 text-center text-sm font-medium whitespace-nowrap text-secondary tabular-nums"
        data-testid="month-label"
      >
        {monthLabel}
      </p>
      <Link
        to={href(nextMonth)}
        rel="next"
        className={iconButtonClassName({ variant: "subtle" })}
        data-testid="month-next"
      >
        <ChevronRight className="size-5" aria-hidden="true" />
        <span className="sr-only">Next month</span>
      </Link>
      <span className="sr-only" data-testid="month-value">
        {month}
      </span>
    </nav>
  );
}
